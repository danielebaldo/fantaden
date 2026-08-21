import os
import sys

SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "scripts")
sys.path.insert(0, os.path.abspath(SCRIPTS_DIR))

# Le fixture Excel (data/raw/*_fixture.xlsx) non sono versionate nel repo:
# sono binarie e completamente derivabili da make_fixtures.py, quindi la
# rigeneriamo qui se manca, così `pytest` funziona su un checkout pulito
# senza passaggi manuali.
import make_fixtures  # noqa: E402

FIXTURES = [
    os.path.join(SCRIPTS_DIR, "..", "data", "raw", "quotazioni_fixture.xlsx"),
    os.path.join(SCRIPTS_DIR, "..", "data", "raw", "statistiche_fixture.xlsx"),
    os.path.join(SCRIPTS_DIR, "..", "data", "raw", "statistiche_fixture_prev.xlsx"),
]
if not all(os.path.exists(p) for p in FIXTURES):
    make_fixtures.main()
