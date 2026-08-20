"""Mappatura delle colonne degli Excel di fantacalcio.it.

Tenere questo file come unico punto da aggiornare se fantacalcio.it
rinomina/aggiunge colonne: normalize.py e build_board.py leggono le
colonne solo attraverso le costanti qui sotto, non con stringhe sparse
nel codice.
"""

# Colonne del file "Excel/prices/{season}/1" (quotazioni), dopo skiprows=1.
PRICES_COLUMNS = {
    "id": "Id",
    "ruolo": "R",
    "ruolo_mantra": "RM",
    "nome": "Nome",
    "squadra": "Squadra",
    "qt_att": "Qt.A",
    "qt_i": "Qt.I",
    "diff": "Diff.",
    "qt_att_m": "Qt.A M",
    "qt_i_m": "Qt.I M",
    "diff_m": "Diff.M",
    "fvm": "FVM",
    "fvm_m": "FVM M",
}

# Colonne del file "Excel/statistics/{season}/1" (statistiche stagione), dopo skiprows=1.
STATS_COLUMNS = {
    "id": "Id",
    "ruolo": "R",
    "ruolo_mantra": "RM",
    "nome": "Nome",
    "squadra": "Squadra",
    "presenze": "Pv",
    "media_voto": "Mv",
    "fantamedia": "Fm",
    "gol_fatti": "Gf",
    "gol_subiti": "Gs",
    "rigori_parati": "Rp",
    "rigori_calciati": "Rc",
    "rigori_segnati": "R+",
    "rigori_sbagliati": "R-",
    "assist": "Ass",
    "ammonizioni": "Amm",
    "espulsioni": "Esp",
    "autogol": "Au",
}

ROLES = ["P", "D", "C", "A"]
