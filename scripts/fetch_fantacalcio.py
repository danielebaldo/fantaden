"""Scarica gli Excel di quotazioni e statistiche da fantacalcio.it.

Richiede un cookie di sessione valido (utente loggato su fantacalcio.it)
nella variabile d'ambiente FANTACALCIO_COOKIE. In GitHub Actions questo
arriva da un secret; in locale puoi esportarlo a mano:

    export FANTACALCIO_COOKIE="..."
    python3 scripts/fetch_fantacalcio.py

Se il download fallisce (cookie scaduto, endpoint cambiato, rete non
raggiungibile) lo script si ferma con un errore esplicito: non scrive mai
file parziali o non validi in data/raw/. In quel caso l'alternativa è
scaricare a mano i due file da fantacalcio.it (Quotazioni -> Esporta Excel,
Statistiche -> Esporta Excel) e salvarli come:

    data/raw/quotazioni.xlsx
    data/raw/statistiche.xlsx
"""
import argparse
import os
import sys

import requests

from lib.config import load_settings, repo_path

# Le prime due byte di un vero .xlsx (zip) sono sempre "PK".
XLSX_MAGIC = b"PK"


def _headers(settings, cookie):
    return {
        "User-Agent": settings["endpoints"]["user_agent"],
        "Referer": settings["endpoints"]["referer"],
        "Cookie": cookie,
    }


def _download(url, headers, dest_path, label, fatal=True):
    """Scarica un Excel. Se fatal=True un errore interrompe tutto lo script
    (usato per le quotazioni, senza le quali la pipeline non ha senso). Se
    fatal=False stampa un avviso e ritorna False, lasciando proseguire il
    resto della pipeline con i dati disponibili (usato per le statistiche:
    utili ma non indispensabili — meglio una board senza storico che
    nessuna board)."""

    def fail(message):
        if fatal:
            raise SystemExit(message)
        print(message, file=sys.stderr)
        return False

    try:
        response = requests.get(url, headers=headers, timeout=60)
    except requests.RequestException as exc:
        return fail(
            f"[fetch_fantacalcio] Errore di rete scaricando {label} da {url}: {exc}\n"
            f"Se sei in un ambiente con rete limitata, scarica il file a mano da "
            f"fantacalcio.it e salvalo in {dest_path}."
        )

    if response.status_code != 200:
        return fail(
            f"[fetch_fantacalcio] {label}: HTTP {response.status_code} da {url}.\n"
            f"Cause probabili: cookie scaduto (rifai il login su fantacalcio.it e "
            f"aggiorna il secret FANTACALCIO_COOKIE) oppure endpoint cambiato/id stagione errato."
        )

    content = response.content
    if content[:2] != XLSX_MAGIC:
        snippet = content[:200].decode("utf-8", errors="replace")
        return fail(
            f"[fetch_fantacalcio] {label}: la risposta non è un file .xlsx valido "
            f"(probabile pagina di login scaduta). Inizio risposta:\n{snippet}"
        )

    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    with open(dest_path, "wb") as f:
        f.write(content)
    print(f"[fetch_fantacalcio] {label} salvato in {dest_path} ({len(content)} byte)")
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skip-statistics",
        action="store_true",
        help="scarica solo le quotazioni (utile a stagione in corso, quando le statistiche non servono aggiornarle spesso)",
    )
    args = parser.parse_args()

    settings = load_settings()
    cookie = os.getenv("FANTACALCIO_COOKIE")
    if not cookie:
        raise SystemExit(
            "[fetch_fantacalcio] Variabile d'ambiente FANTACALCIO_COOKIE mancante.\n"
            "Copia il cookie di sessione da un browser loggato su fantacalcio.it "
            "(vedi README.md) e impostala come secret GitHub o env var locale."
        )

    season = settings["season"]["current_season_id"]
    stats_season_ids = settings["season"].get("stats_season_ids") or [settings["season"]["previous_season_id"]]
    headers = _headers(settings, cookie)
    raw_dir = repo_path(settings["paths"]["raw_dir"])

    prices_url = settings["endpoints"]["prices_url_template"].format(season_id=season)
    _download(prices_url, headers, os.path.join(raw_dir, "quotazioni.xlsx"), "Quotazioni", fatal=True)

    if not args.skip_statistics:
        # scarica ogni stagione configurata per lo score multi-stagione
        # (config/settings.json -> season.stats_season_ids), ciascuna fatal=False:
        # una stagione vecchia irraggiungibile non deve fermare le altre. La più
        # recente viene salvata anche come statistiche.xlsx per compatibilità con
        # normalize.py/build_board.py quando multi_season è disabilitato.
        any_ok = False
        for i, stats_season in enumerate(stats_season_ids):
            stats_url = settings["endpoints"]["statistics_url_template"].format(season_id=stats_season)
            label = f"Statistiche stagione {stats_season}"
            dest = os.path.join(raw_dir, f"statistiche_{stats_season}.xlsx")
            ok = _download(stats_url, headers, dest, label, fatal=False)
            if ok:
                any_ok = True
                if i == 0:
                    # copia byte-per-byte, non un secondo download: stesso contenuto,
                    # nessuna richiesta HTTP aggiuntiva verso fantacalcio.it
                    with open(dest, "rb") as src, open(os.path.join(raw_dir, "statistiche.xlsx"), "wb") as dst:
                        dst.write(src.read())
        if not any_ok:
            print(
                "[fetch_fantacalcio] Proseguo senza statistiche: la board avrà tutti i "
                "giocatori in modalità 'no_stats' finché l'endpoint statistiche non viene "
                "corretto in config/settings.json (vedi README, sezione Limiti noti)."
            )


if __name__ == "__main__":
    main()
