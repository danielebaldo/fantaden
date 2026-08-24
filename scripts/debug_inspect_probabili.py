"""Script diagnostico TEMPORANEO (Addendum 14, Fase A) — non fa parte
della pipeline dati vera. Va rimosso (insieme allo step che lo richiama in
.github/workflows/update-data.yml) una volta conclusa l'indagine.

Obiettivo: capire se fantacalcio.it espone i dati delle probabili
formazioni in modo leggibile da una richiesta HTTP diretta (come fa per
gli Excel di quotazioni/statistiche), o se sono caricati lato client via
JavaScript dopo il caricamento della pagina (nel qual caso una GET
semplice non li vede, e serve individuare l'endpoint reale dal tab
Network degli strumenti sviluppatore del browser).

Scarica la pagina pubblica delle probabili formazioni con lo stesso
pattern di header di fetch_fantacalcio.py (serve FANTACALCIO_COOKIE
nell'ambiente, come per gli altri fetch) e stampa nei log:
- status HTTP, content-type, lunghezza della risposta;
- eventuali blocchi <script> con dati strutturati incorporati (JSON-LD,
  __NEXT_DATA__, __NUXT__, o qualunque script che contenga "probabil" o
  un nome di squadra note);
- se non trova nulla di strutturato, i primi ~2000 caratteri dell'HTML
  grezzo (nessun dato sensibile: il cookie non viene mai stampato) per
  ispezione visiva.

Uso:
    export FANTACALCIO_COOKIE="..."
    python3 scripts/debug_inspect_probabili.py
"""
import json
import os
import re
import sys

import requests

from lib.config import load_settings

PROBABILI_URL = "https://www.fantacalcio.it/probabili-formazioni-serie-a"

# Ancore euristiche per trovare un blob JSON incorporato nell'HTML: id di
# script tipici dei framework SPA più diffusi, o parole chiave di dominio.
SCRIPT_ID_PATTERNS = [
    r'<script[^>]*id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>',
    r'<script[^>]*id=["\']__NUXT_DATA__["\'][^>]*>(.*?)</script>',
    r'<script[^>]*type=["\']application/json["\'][^>]*>(.*?)</script>',
]
KEYWORD_PATTERN = re.compile(r'<script[^>]*>((?:(?!</script>).)*?(?:probabil|ballottaggio)(?:(?!</script>).)*?)</script>', re.IGNORECASE | re.DOTALL)


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
    found_any = False

    for pattern in SCRIPT_ID_PATTERNS:
        m = re.search(pattern, html, re.DOTALL)
        if m:
            found_any = True
            blob = m.group(1).strip()
            print(f"\n[debug_inspect_probabili] Trovato script via pattern: {pattern[:50]}...")
            print(f"[debug_inspect_probabili] lunghezza blob: {len(blob)} caratteri")
            try:
                parsed = json.loads(blob)
                keys = list(parsed.keys()) if isinstance(parsed, dict) else f"(non un dict, tipo {type(parsed)})"
                print(f"[debug_inspect_probabili] chiavi di primo livello: {keys}")
            except json.JSONDecodeError as exc:
                print(f"[debug_inspect_probabili] non è JSON valido ({exc}), preview:")
            print(blob[:3000])

    for m in KEYWORD_PATTERN.finditer(html):
        found_any = True
        blob = m.group(1).strip()
        print(f"\n[debug_inspect_probabili] Trovato script con keyword 'probabil'/'ballottaggio', "
              f"lunghezza {len(blob)} caratteri, preview:")
        print(blob[:3000])

    if not found_any:
        print("\n[debug_inspect_probabili] Nessun blocco JSON strutturato trovato con le euristiche "
              "sopra. Probabile caricamento lato client via JavaScript (XHR) dopo il rendering "
              "iniziale: una GET diretta non lo vede. Primi 2000 caratteri dell'HTML grezzo per "
              "ispezione visiva:\n")
        print(html[:2000])
        print("\n[debug_inspect_probabili] Prossimo passo se questo è il caso: individuare "
              "l'endpoint reale dal tab Network degli strumenti sviluppatore del browser mentre "
              "si naviga la pagina delle probabili formazioni da loggati.")


if __name__ == "__main__":
    main()
