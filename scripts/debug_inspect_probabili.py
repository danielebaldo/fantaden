"""Script diagnostico TEMPORANEO (Addendum 14, Fase A) — non fa parte
della pipeline dati vera. Va rimosso (insieme allo step che lo richiama in
.github/workflows/update-data.yml) una volta conclusa l'indagine.

v2: la v1 cercava solo dentro blocchi <script> (JSON incorporato stile
SPA) e ha trovato solo un falso positivo (uno script pubblicitario
Google che nomina lo slot ADV "Fantacalcio_Probabili_Formazioni", non
dati reali). La risposta però pesa 636KB — troppo per essere un guscio
SPA vuoto — quindi qui si cerca direttamente nel corpo HTML (fuori dagli
script): nomi squadra, parole chiave di dominio, classi CSS plausibili,
per capire se il contenuto è già renderizzato server-side in markup
normale (tabelle/div) invece che in un blob JSON.

Uso:
    export FANTACALCIO_COOKIE="..."
    python3 scripts/debug_inspect_probabili.py
"""
import os
import re

import requests

from lib.config import load_settings

PROBABILI_URL = "https://www.fantacalcio.it/probabili-formazioni-serie-a"

SERIE_A_TEAMS = [
    "Atalanta", "Bologna", "Cagliari", "Como", "Cremonese", "Fiorentina",
    "Genoa", "Inter", "Juventus", "Lazio", "Lecce", "Milan", "Napoli",
    "Parma", "Pisa", "Roma", "Sassuolo", "Torino", "Udinese", "Verona",
]

# Parole chiave di dominio da cercare nel testo visibile (non solo negli
# <script>), con un po' di contesto intorno a ciascun match.
BODY_KEYWORDS = ["ballottaggio", "modulo", "probabile formazione", "titolare", "in dubbio"]


def strip_scripts_and_styles(html: str) -> str:
    """Rimuove i blocchi <script>/<style> per isolare il markup/testo
    visibile: se i nomi squadra/parole chiave compaiono comunque, il
    contenuto è nel body HTML, non in un blob JS."""
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
    return html


def main():
    settings = load_settings()
    cookie = os.getenv("FANTACALCIO_COOKIE")
    if not cookie:
        raise SystemExit(
            "[debug_inspect_probabili] Variabile FANTACALCIO_COOKIE mancante: "
            "stesso requisito di fetch_fantacalcio.py."
        )

    headers = {
        "User-Agent": settings["endpoints"]["user_agent"],
        "Referer": settings["endpoints"]["referer"],
        "Cookie": cookie,
    }

    print(f"[debug_inspect_probabili] GET {PROBABILI_URL}")
    try:
        response = requests.get(PROBABILI_URL, headers=headers, timeout=60)
    except requests.RequestException as exc:
        raise SystemExit(f"[debug_inspect_probabili] Errore di rete: {exc}")

    print(f"[debug_inspect_probabili] status={response.status_code} "
          f"content-type={response.headers.get('Content-Type')} "
          f"length={len(response.content)} byte")

    if response.status_code != 200:
        print(f"[debug_inspect_probabili] Risposta non 200, primi 1000 caratteri:\n"
              f"{response.text[:1000]}")
        return

    html = response.text
    body_only = strip_scripts_and_styles(html)

    print(f"\n[debug_inspect_probabili] lunghezza HTML totale: {len(html)} caratteri, "
          f"fuori da <script>/<style>: {len(body_only)} caratteri")

    print("\n[debug_inspect_probabili] conteggio nomi squadra nel body (fuori dagli script):")
    any_team = False
    for team in SERIE_A_TEAMS:
        count = len(re.findall(re.escape(team), body_only, re.IGNORECASE))
        if count > 0:
            any_team = True
            print(f"  {team}: {count}")

    print("\n[debug_inspect_probabili] conteggio parole chiave di dominio nel body:")
    any_keyword = False
    for kw in BODY_KEYWORDS:
        matches = list(re.finditer(re.escape(kw), body_only, re.IGNORECASE))
        if matches:
            any_keyword = True
            print(f"  '{kw}': {len(matches)} occorrenze")
            m = matches[0]
            start = max(0, m.start() - 200)
            end = min(len(body_only), m.end() + 200)
            print(f"    contesto prima occorrenza:\n    ...{body_only[start:end]}...")

    if any_team or any_keyword:
        print("\n[debug_inspect_probabili] Contenuto trovato nel markup HTML server-renderizzato "
              "(non serve un endpoint JSON separato: si può fare parsing diretto dell'HTML, es. "
              "con BeautifulSoup, individuando le classi CSS intorno ai match sopra).")
        # stampa una fetta più ampia intorno alla prima squadra trovata, per
        # vedere la struttura reale del markup (classi, tag) da usare per il parsing
        first_team_match = None
        for team in SERIE_A_TEAMS:
            m = re.search(re.escape(team), body_only, re.IGNORECASE)
            if m:
                first_team_match = m
                break
        if first_team_match:
            start = max(0, first_team_match.start() - 500)
            end = min(len(body_only), first_team_match.end() + 1500)
            print("\n[debug_inspect_probabili] markup intorno alla prima occorrenza di una squadra:")
            print(body_only[start:end])
    else:
        print("\n[debug_inspect_probabili] Nessun nome squadra né parola chiave trovati nel body "
              "HTML (fuori dagli script). Probabile caricamento lato client via JavaScript (XHR) "
              "dopo il rendering iniziale, oppure la pagina richiede uno stato di login diverso da "
              "quello del cookie usato per gli Excel. Primi 2000 caratteri del body per ispezione:\n")
        print(body_only[:2000])
        print("\n[debug_inspect_probabili] Prossimo passo se questo è il caso: individuare "
              "l'endpoint reale dal tab Network degli strumenti sviluppatore del browser mentre "
              "si naviga la pagina delle probabili formazioni da loggati.")


if __name__ == "__main__":
    main()
