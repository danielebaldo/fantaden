"""Test dei campi "stagione corrente" (fantamedia_corrente, gol_fatti_corrente,
assist_corrente, presenze_corrente) in scripts/build_board.py -> build_players
(current_stats=...), usati solo dal popup giocatore in dashboard.

Contratto di non-regressione: current_stats è un parametro opzionale separato
da statistiche/seasons_stats e non deve mai toccare score/fascia/indice_affare
né fantamedia_by_season — i 42+ test esistenti (test_scoring.py,
test_multi_season.py) restano il gate, invariati.
"""
import os

import pytest

from build_board import build_players
from lib.config import load_scoring, repo_path
from normalize import normalize_prices, normalize_stats

FIXTURES_DIR = repo_path("data", "raw")
PRICES_FIXTURE = os.path.join(FIXTURES_DIR, "quotazioni_fixture.xlsx")
STATS_FIXTURE = os.path.join(FIXTURES_DIR, "statistiche_fixture.xlsx")
STATS_CURRENT_FIXTURE = os.path.join(FIXTURES_DIR, "statistiche_fixture_current.xlsx")


@pytest.fixture(scope="module")
def quotazioni():
    assert os.path.exists(PRICES_FIXTURE), "manca la fixture, esegui scripts/make_fixtures.py"
    return normalize_prices(PRICES_FIXTURE)


@pytest.fixture(scope="module")
def statistiche():
    assert os.path.exists(STATS_FIXTURE), "manca la fixture, esegui scripts/make_fixtures.py"
    return normalize_stats(STATS_FIXTURE)


@pytest.fixture(scope="module")
def statistiche_current():
    assert os.path.exists(STATS_CURRENT_FIXTURE), "manca la fixture, esegui scripts/make_fixtures.py"
    return normalize_stats(STATS_CURRENT_FIXTURE)


@pytest.fixture
def scoring():
    return load_scoring()


def by_name(board, name):
    return next(p for p in board if p["name"] == name)


def by_id(stats_list, player_id):
    return next(s for s in stats_list if s["id"] == player_id)


def test_current_season_fields_populated_from_fixture(quotazioni, statistiche, statistiche_current, scoring):
    board = build_players(
        quotazioni, statistiche, scoring, overrides={"players": {}},
        current_stats=statistiche_current,
    )
    stat = by_id(statistiche_current, 2100)  # Lautaro Martinez, presente nella fixture corrente
    p = by_name(board, "Lautaro Martinez")
    assert p["fantamedia_corrente"] == stat["fantamedia"]
    assert p["gol_fatti_corrente"] == stat["gol_fatti"]
    assert p["assist_corrente"] == stat["assist"]
    assert p["presenze_corrente"] == stat["presenze"]


def test_current_season_fields_none_for_player_not_yet_played(quotazioni, statistiche, statistiche_current, scoring):
    # Osimhen (2200) non è nella fixture "corrente" (STATS_CURRENT ha solo
    # Lautaro e Calhanoglu): tutti e 4 i campi devono restare None, non 0
    # né sollevare un'eccezione.
    assert not any(s["id"] == 2200 for s in statistiche_current)
    board = build_players(
        quotazioni, statistiche, scoring, overrides={"players": {}},
        current_stats=statistiche_current,
    )
    p = by_name(board, "Osimhen")
    assert p["fantamedia_corrente"] is None
    assert p["gol_fatti_corrente"] is None
    assert p["assist_corrente"] is None
    assert p["presenze_corrente"] is None


def test_current_season_none_when_file_missing(quotazioni, statistiche, scoring):
    # Comportamento di oggi (nessun current_stats passato, come qualunque
    # chiamata esistente a build_players): tutti i campi corrente None,
    # nessuna eccezione.
    board = build_players(quotazioni, statistiche, scoring, overrides={"players": {}})
    for p in board:
        assert p["fantamedia_corrente"] is None
        assert p["gol_fatti_corrente"] is None
        assert p["assist_corrente"] is None
        assert p["presenze_corrente"] is None


def test_current_season_does_not_affect_scoring(quotazioni, statistiche, statistiche_current, scoring):
    # Gate di non-regressione: score/fascia/indice_affare/affare_label restano
    # identici con o senza current_stats. I dati "in corso" alimentano solo i
    # 4 campi *_corrente, mai il ranking.
    baseline = build_players(quotazioni, statistiche, scoring, overrides={"players": {}})
    with_current = build_players(
        quotazioni, statistiche, scoring, overrides={"players": {}},
        current_stats=statistiche_current,
    )
    baseline_by_id = {p["id"]: p for p in baseline}
    for p in with_current:
        b = baseline_by_id[p["id"]]
        assert p["score"] == b["score"], p["name"]
        assert p["fascia"] == b["fascia"], p["name"]
        assert p["indice_affare"] == b["indice_affare"], p["name"]
        assert p["affare_label"] == b["affare_label"], p["name"]
        assert p["fantamedia"] == b["fantamedia"], p["name"]
