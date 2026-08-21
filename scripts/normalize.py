"""Converte gli Excel grezzi di fantacalcio.it in JSON normalizzato.

Uso tipico (dopo fetch_fantacalcio.py):
    python3 scripts/normalize.py

Per lavorare sulle fixture di test:
    python3 scripts/normalize.py \
        --prices-file data/raw/quotazioni_fixture.xlsx \
        --stats-file data/raw/statistiche_fixture.xlsx
"""
import argparse
import json
import os

import pandas as pd

from lib.columns import PRICES_COLUMNS, STATS_COLUMNS
from lib.config import load_settings, repo_path


def _clean_id(raw_id) -> int | None:
    text = str(raw_id).strip()
    if text in ("0", "0.0", "nan", ""):
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def normalize_prices(path: str) -> list[dict]:
    df = pd.read_excel(path, skiprows=1)
    df = df.fillna(0)
    c = PRICES_COLUMNS

    players = []
    for _, row in df.iterrows():
        pid = _clean_id(row[c["id"]])
        if pid is None:
            continue
        players.append({
            "id": pid,
            "name": str(row[c["nome"]]).strip(),
            "position": str(row[c["ruolo"]]).strip(),
            "position_mantra": str(row.get(c["ruolo_mantra"], row[c["ruolo"]])).strip(),
            "team": str(row[c["squadra"]]).strip(),
            "qt_att": int(row[c["qt_att"]]),
            "qt_i": int(row[c["qt_i"]]),
            "diff": int(row[c["diff"]]),
            "qt_att_m": int(row[c["qt_att_m"]]),
            "qt_i_m": int(row[c["qt_i_m"]]),
            "diff_m": int(row[c["diff_m"]]),
            "fvm": int(row[c["fvm"]]),
            "fvm_m": int(row[c["fvm_m"]]),
        })
    return players


def normalize_stats(path: str) -> list[dict]:
    df = pd.read_excel(path, skiprows=1)
    df = df.fillna(0)
    c = STATS_COLUMNS

    players = []
    for _, row in df.iterrows():
        pid = _clean_id(row[c["id"]])
        if pid is None:
            continue
        players.append({
            "id": pid,
            "name": str(row[c["nome"]]).strip(),
            "position": str(row[c["ruolo"]]).strip(),
            "team": str(row[c["squadra"]]).strip(),
            "presenze": int(row[c["presenze"]]),
            "media_voto": float(row[c["media_voto"]]),
            "fantamedia": float(row[c["fantamedia"]]),
            "gol_fatti": int(row[c["gol_fatti"]]),
            "gol_subiti": int(row[c["gol_subiti"]]),
            "rigori_parati": int(row[c["rigori_parati"]]),
            "rigori_calciati": int(row[c["rigori_calciati"]]),
            "rigori_segnati": int(row[c["rigori_segnati"]]),
            "rigori_sbagliati": int(row[c["rigori_sbagliati"]]),
            "assist": int(row[c["assist"]]),
            "ammonizioni": int(row[c["ammonizioni"]]),
            "espulsioni": int(row[c["espulsioni"]]),
            "autogol": int(row[c["autogol"]]),
        })
    return players


def _write_json(data, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[normalize] scritti {len(data)} record in {path}")


def main():
    settings = load_settings()
    raw_dir = repo_path(settings["paths"]["raw_dir"])

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prices-file", default=os.path.join(raw_dir, "quotazioni.xlsx"))
    parser.add_argument("--stats-file", default=os.path.join(raw_dir, "statistiche.xlsx"))
    args = parser.parse_args()

    if not os.path.exists(args.prices_file):
        raise SystemExit(
            f"[normalize] File quotazioni non trovato: {args.prices_file}\n"
            f"Esegui prima scripts/fetch_fantacalcio.py oppure indica un file con --prices-file."
        )

    prices = normalize_prices(args.prices_file)
    _write_json(prices, repo_path(settings["paths"]["quotazioni_json"]))

    if os.path.exists(args.stats_file):
        stats = normalize_stats(args.stats_file)
        _write_json(stats, repo_path(settings["paths"]["statistiche_json"]))
    else:
        print(f"[normalize] File statistiche non trovato ({args.stats_file}): salto, "
              f"la board userà solo le quotazioni (tutti i giocatori 'no_stats').")

    # statistiche_{season_id}.xlsx per ogni stagione scaricata da fetch_fantacalcio.py
    # (score multi-stagione, config/scoring.json -> multi_season): oltre a
    # statistiche.json (comportamento esistente, invariato sopra), scrive un JSON
    # per ogni file trovato. Nessun errore se manca qualche stagione: build_board.py
    # userà solo quelle disponibili.
    template = settings["paths"].get("statistiche_season_json_template")
    if template:
        for stats_season in settings["season"].get("stats_season_ids", []):
            season_file = os.path.join(raw_dir, f"statistiche_{stats_season}.xlsx")
            if os.path.exists(season_file):
                season_stats = normalize_stats(season_file)
                _write_json(season_stats, repo_path(template.format(season_id=stats_season)))


if __name__ == "__main__":
    main()
