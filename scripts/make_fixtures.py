"""Genera fixture Excel sintetiche identiche nel formato ai file scaricati da
fantacalcio.it, da usare per sviluppo e test offline (la rete verso
fantacalcio.it non è raggiungibile da ogni ambiente).

Uso:
    python3 scripts/make_fixtures.py

Crea:
    data/raw/quotazioni_fixture.xlsx   (formato "Excel/prices")
    data/raw/statistiche_fixture.xlsx  (formato "Excel/statistics")

Il formato reale ha una riga 0 di titolo/vuota e la riga 1 con gli header
delle colonne (per questo gli script di produzione usano skiprows=1).
"""
import os

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "..", "data", "raw")

# 20 giocatori "campione", pensati per coprire i casi limite:
# - un portiere e un attaccante rigoristi
# - un giocatore con pochissime presenze (infortunato)
# - due giocatori senza statistiche stagione scorsa (neopromossi / nuovi arrivi)
# - id coerenti tra i due file, tranne per i due "no_stats"
PLAYERS = [
    # id,   nome,              ruolo, squadra,   qt_att, qt_i, fvm
    (5841, "Svilar",           "P", "Roma",      18, 18, 65),
    (5116, "Martinez Jo.",     "P", "Inter",     17, 17, 63),
    (2932, "Meret",            "P", "Napoli",    12, 12, 45),
    (9001, "Rossi Portiere",   "P", "Como",       1,  1, 10),  # neopromosso, no stats
    (4210, "Bastoni",          "D", "Inter",     14, 14, 55),
    (3312, "Di Lorenzo",       "D", "Napoli",    12, 12, 48),
    (5522, "Kalulu",           "D", "Milan",      9,  9, 32),
    (6011, "Terracciano",      "D", "Fiorentina", 3,  3, 12),  # pochissime presenze
    (1200, "Calhanoglu",       "C", "Inter",     22, 22, 88),
    (1300, "Koopmeiners",      "C", "Juventus",  18, 18, 70),
    (1400, "Fabbian",          "C", "Bologna",   10, 10, 34),
    (1500, "Nuovo Acquisto",   "C", "Lecce",      8,  8, 25),  # no stats (nuovo)
    (2100, "Lautaro Martinez", "A", "Inter",     34, 34, 340),
    (2200, "Osimhen",          "A", "Napoli",    32, 32, 300),
    (2300, "Vlahovic",         "A", "Juventus",  22, 22, 140),
    (2400, "Zaccagni",         "A", "Lazio",     16, 16, 60),
    (2500, "Orsolini",         "A", "Bologna",   14, 14, 45),
    (2600, "Simeone",          "A", "Napoli",    10, 10, 22),
    (2700, "Pinamonti",        "A", "Genoa",      8,  8, 15),
    (9002, "Rossi Attaccante", "A", "Como",       1,  1,  8),  # neopromosso, no stats
]

STATS = {
    # id: pv, mv, fm, gf, gs, rp, rc, ass, amm, esp, au
    5841: dict(pv=36, mv=6.10, fm=6.20, gf=0, gs=34, rp=2, rc=0, ass=0, amm=1, esp=0, au=0),
    5116: dict(pv=34, mv=6.20, fm=6.35, gf=0, gs=30, rp=3, rc=0, ass=0, amm=0, esp=0, au=0),
    2932: dict(pv=28, mv=6.00, fm=6.05, gf=0, gs=32, rp=1, rc=0, ass=0, amm=1, esp=0, au=1),
    4210: dict(pv=30, mv=6.20, fm=6.55, gf=2, gs=0, rp=0, rc=0, ass=3, amm=5, esp=0, au=0),
    3312: dict(pv=32, mv=6.10, fm=6.30, gf=1, gs=0, rp=0, rc=0, ass=2, amm=6, esp=0, au=0),
    5522: dict(pv=24, mv=5.95, fm=6.05, gf=0, gs=0, rp=0, rc=0, ass=1, amm=4, esp=1, au=0),
    6011: dict(pv=6,  mv=5.90, fm=5.95, gf=0, gs=0, rp=0, rc=0, ass=0, amm=1, esp=0, au=0),
    1200: dict(pv=33, mv=6.30, fm=7.40, gf=8, gs=0, rp=0, rc=6, ass=7, amm=3, esp=0, au=0),
    1300: dict(pv=30, mv=6.20, fm=6.95, gf=6, gs=0, rp=0, rc=0, ass=5, amm=4, esp=0, au=0),
    1400: dict(pv=22, mv=6.00, fm=6.20, gf=2, gs=0, rp=0, rc=0, ass=2, amm=3, esp=0, au=0),
    2100: dict(pv=34, mv=6.60, fm=7.90, gf=24, gs=0, rp=0, rc=3, ass=6, amm=2, esp=0, au=0),
    2200: dict(pv=30, mv=6.55, fm=7.60, gf=22, gs=0, rp=0, rc=0, ass=4, amm=1, esp=0, au=0),
    2300: dict(pv=28, mv=6.20, fm=6.90, gf=14, gs=0, rp=0, rc=2, ass=3, amm=5, esp=1, au=0),
    2400: dict(pv=29, mv=6.10, fm=6.60, gf=8, gs=0, rp=0, rc=0, ass=6, amm=3, esp=0, au=0),
    2500: dict(pv=31, mv=6.05, fm=6.45, gf=7, gs=0, rp=0, rc=0, ass=5, amm=2, esp=0, au=0),
    2600: dict(pv=20, mv=5.95, fm=6.15, gf=4, gs=0, rp=0, rc=0, ass=1, amm=3, esp=0, au=0),
    2700: dict(pv=18, mv=5.90, fm=6.00, gf=3, gs=0, rp=0, rc=0, ass=0, amm=1, esp=0, au=0),
    # 9001, 1500, 9002: nessuna riga statistiche -> giocatori "no_stats"
}

# Seconda fixture statistiche, per una stagione più vecchia (N-2): usata dai
# test del multi-stagione (tests/test_multi_season.py). Deliberatamente
# diversa da STATS per verificare la combinazione pesata e i campi derivati:
# - id sovrapposti con STATS per testare media pesata/rinormalizzazione/trend
# - 9001 ("Rossi Portiere") ha statistiche SOLO qui: è no_stats nella
#   stagione più recente ma non complessivamente, con multi-stagione attivo
#   (caso "rientro da prestito estero", copre no_stats_recent=True)
# - 5522 (Kalulu) ha 3 presenze, sotto min_presenze_per_season (5): deve
#   restare escluso dalla combinazione anche qui, non solo nella stagione
#   più recente (dove ha comunque presenze sufficienti)
STATS_PREV = {
    5841: dict(pv=30, mv=6.00, fm=6.05, gf=0, gs=38, rp=1, rc=0, ass=0, amm=2, esp=0, au=0),
    4210: dict(pv=28, mv=6.00, fm=6.20, gf=1, gs=0, rp=0, rc=0, ass=2, amm=6, esp=0, au=0),
    1200: dict(pv=30, mv=6.10, fm=7.00, gf=5, gs=0, rp=0, rc=4, ass=5, amm=4, esp=0, au=0),
    2100: dict(pv=32, mv=6.40, fm=7.30, gf=18, gs=0, rp=0, rc=2, ass=4, amm=3, esp=0, au=0),
    9001: dict(pv=20, mv=5.95, fm=6.05, gf=0, gs=22, rp=1, rc=0, ass=0, amm=2, esp=0, au=0),
    6011: dict(pv=18, mv=5.90, fm=6.00, gf=0, gs=0, rp=0, rc=0, ass=1, amm=3, esp=0, au=0),
    5522: dict(pv=3, mv=5.80, fm=5.85, gf=0, gs=0, rp=0, rc=0, ass=0, amm=1, esp=0, au=0),
}

# Terza fixture statistiche, per la stagione CORRENTE (in corso, poche
# partite giocate): usata da tests/test_current_season.py per verificare i
# campi *_corrente in build_board.py, mai mescolati con lo scoring. Solo 2
# giocatori con presenze basse (2-3), gli altri 18 restano "senza dati
# stagione corrente" (caso più realistico a inizio campionato).
STATS_CURRENT = {
    2100: dict(pv=2, mv=6.50, fm=7.20, gf=2, gs=0, rp=0, rc=1, ass=0, amm=0, esp=0, au=0),
    1200: dict(pv=3, mv=6.10, fm=6.40, gf=1, gs=0, rp=0, rc=0, ass=1, amm=1, esp=0, au=0),
}


def build_prices_df():
    rows = []
    for pid, name, role, team, qt_att, qt_i, fvm in PLAYERS:
        diff = qt_att - qt_i
        rows.append({
            "Id": pid,
            "R": role,
            "RM": role,
            "Nome": name,
            "Squadra": team,
            "Qt.A": qt_att,
            "Qt.I": qt_i,
            "Diff.": diff,
            "Qt.A M": qt_att,
            "Qt.I M": qt_i,
            "Diff.M": diff,
            "FVM": fvm,
            "FVM M": fvm,
        })
    return pd.DataFrame(rows)


def build_stats_df(stats=STATS):
    rows = []
    for pid, name, role, team, *_ in PLAYERS:
        if pid not in stats:
            continue
        s = stats[pid]
        rows.append({
            "Id": pid,
            "R": role,
            "RM": role,
            "Nome": name,
            "Squadra": team,
            "Pv": s["pv"],
            "Mv": s["mv"],
            "Fm": s["fm"],
            "Gf": s["gf"],
            "Gs": s["gs"],
            "Rp": s["rp"],
            "Rc": s["rc"],
            "R+": s["rc"],
            "R-": 0,
            "Ass": s["ass"],
            "Amm": s["amm"],
            "Esp": s["esp"],
            "Au": s["au"],
        })
    return pd.DataFrame(rows)


def write_with_banner_row(df: pd.DataFrame, path: str, title: str):
    """Replica il formato reale: riga 0 = titolo libero, riga 1 = header colonne."""
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, header=True, startrow=1, sheet_name="Sheet1")
        ws = writer.sheets["Sheet1"]
        ws.cell(row=1, column=1, value=title)


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    prices_path = os.path.join(RAW_DIR, "quotazioni_fixture.xlsx")
    stats_path = os.path.join(RAW_DIR, "statistiche_fixture.xlsx")
    stats_prev_path = os.path.join(RAW_DIR, "statistiche_fixture_prev.xlsx")
    stats_current_path = os.path.join(RAW_DIR, "statistiche_fixture_current.xlsx")

    write_with_banner_row(build_prices_df(), prices_path, "Quotazioni Fantacalcio - FIXTURE DI TEST")
    write_with_banner_row(build_stats_df(), stats_path, "Statistiche Fantacalcio - FIXTURE DI TEST")
    write_with_banner_row(build_stats_df(STATS_PREV), stats_prev_path,
                           "Statistiche Fantacalcio (stagione precedente) - FIXTURE DI TEST")
    write_with_banner_row(build_stats_df(STATS_CURRENT), stats_current_path,
                           "Statistiche Fantacalcio (stagione corrente) - FIXTURE DI TEST")

    print(f"Scritto {prices_path}")
    print(f"Scritto {stats_path}")
    print(f"Scritto {stats_prev_path}")
    print(f"Scritto {stats_current_path}")


if __name__ == "__main__":
    main()
