"""Test della pipeline di scoring/fasce (scripts/build_board.py) e della
normalizzazione (scripts/normalize.py), eseguiti sulle fixture Excel in
data/raw/*_fixture.xlsx (generate da scripts/make_fixtures.py).
"""
import os

import pytest

from build_board import (
    _percentile_rank,
    assign_affare_index,
    assign_fasce,
    build_players,
    compute_raw_indices,
    compute_scores,
)
from lib.config import load_scoring, repo_path
from normalize import normalize_prices, normalize_stats

FIXTURES_DIR = repo_path("data", "raw")
PRICES_FIXTURE = os.path.join(FIXTURES_DIR, "quotazioni_fixture.xlsx")
STATS_FIXTURE = os.path.join(FIXTURES_DIR, "statistiche_fixture.xlsx")


@pytest.fixture(scope="module")
def fixture_data():
    assert os.path.exists(PRICES_FIXTURE), "manca la fixture, esegui scripts/make_fixtures.py"
    assert os.path.exists(STATS_FIXTURE), "manca la fixture, esegui scripts/make_fixtures.py"
    quotazioni = normalize_prices(PRICES_FIXTURE)
    statistiche = normalize_stats(STATS_FIXTURE)
    return quotazioni, statistiche


@pytest.fixture(scope="module")
def scoring():
    return load_scoring()


@pytest.fixture(scope="module")
def board(fixture_data, scoring):
    quotazioni, statistiche = fixture_data
    return build_players(quotazioni, statistiche, scoring, overrides={"players": {}})


def by_name(board, name):
    return next(p for p in board if p["name"] == name)


# ---------------------------------------------------------------------------
# _percentile_rank
# ---------------------------------------------------------------------------

def test_percentile_rank_basic():
    pct = _percentile_rank({"a": 1, "b": 2, "c": 3})
    assert pct["c"] == 1.0
    assert pct["a"] == pytest.approx(1 / 3)
    assert pct["b"] == pytest.approx(2 / 3)


def test_percentile_rank_ties_get_same_value():
    pct = _percentile_rank({"a": 1, "b": 1, "c": 2})
    assert pct["a"] == pct["b"]
    assert pct["c"] == 1.0


def test_percentile_rank_empty():
    assert _percentile_rank({}) == {}


# ---------------------------------------------------------------------------
# normalize.py sulle fixture
# ---------------------------------------------------------------------------

def test_normalize_prices_reads_20_players(fixture_data):
    quotazioni, _ = fixture_data
    assert len(quotazioni) == 20
    ids = {p["id"] for p in quotazioni}
    assert 2100 in ids  # Lautaro Martinez


def test_normalize_stats_skips_players_without_row(fixture_data):
    _, statistiche = fixture_data
    assert len(statistiche) == 17  # 3 giocatori (9001, 1500, 9002) non hanno statistiche
    ids = {s["id"] for s in statistiche}
    assert 9001 not in ids
    assert 1500 not in ids
    assert 9002 not in ids


# ---------------------------------------------------------------------------
# build_players: score, fasce, no_stats, indice affare/trappola
# ---------------------------------------------------------------------------

def test_no_stats_players_have_null_score_and_are_flagged(board):
    p = by_name(board, "Rossi Attaccante")
    assert p["no_stats"] is True
    assert p["score"] is None
    assert p["indice_affare"] is None
    assert p["affare_label"] is None


def test_no_stats_players_dont_affect_others_percentiles(board):
    # Lautaro ha lo score più alto tra gli attaccanti CON statistiche: il
    # neopromosso senza statistiche non deve intaccare il ranking.
    attackers_with_stats = [p for p in board if p["position"] == "A" and not p["no_stats"]]
    best = max(attackers_with_stats, key=lambda p: p["score"])
    assert best["name"] == "Lautaro Martinez"


def test_score_is_percentile_based_0_100(board):
    for p in board:
        if p["no_stats"]:
            continue
        assert p["score"] is not None
        assert 0.0 <= p["score"] <= 100.0


def test_fascia_assigned_to_every_player(board):
    for p in board:
        assert p["fascia"] is not None


def test_low_fvm_no_stats_player_lands_in_worst_fascia(board):
    # I neopromossi hanno il FVM più basso del proprio ruolo: devono finire
    # nell'ultima fascia (Scommessa), indipendentemente dalle statistiche.
    p = by_name(board, "Rossi Attaccante")
    assert p["fascia"] == "Scommessa"
    p2 = by_name(board, "Nuovo Acquisto")
    assert p2["fascia"] == "Scommessa"


def test_higher_fvm_within_role_gets_better_or_equal_fascia(board):
    fascia_rank = {label: i for i, label in enumerate(
        ["Top", "1a Fascia", "2a Fascia", "3a Fascia", "Low Cost", "Scommessa"]
    )}
    attackers = sorted([p for p in board if p["position"] == "A"], key=lambda p: -p["fvm"])
    ranks = [fascia_rank[p["fascia"]] for p in attackers]
    assert ranks == sorted(ranks), "l'ordine di fascia deve essere monotono col FVM decrescente"


def test_affare_and_trappola_labels_are_consistent(board):
    # Martinez Jo. (Inter) ha un FVM più basso di Svilar ma statistiche
    # migliori (più presenze, meno gol subiti a partita, più rigori
    # parati): deve risultare un affare, Svilar una trappola relativa.
    martinez = by_name(board, "Martinez Jo.")
    svilar = by_name(board, "Svilar")
    assert martinez["indice_affare"] > svilar["indice_affare"]
    assert martinez["affare_label"] == "Affare"
    assert svilar["affare_label"] == "Trappola"


def test_affare_index_within_expected_range(board):
    for p in board:
        if p["indice_affare"] is None:
            continue
        assert -1.0 <= p["indice_affare"] <= 1.0


# ---------------------------------------------------------------------------
# overrides
# ---------------------------------------------------------------------------

def test_override_escluso_removes_player(fixture_data, scoring):
    quotazioni, statistiche = fixture_data
    overrides = {"players": {"2932": {"escluso": True}}}  # Meret
    result = build_players(quotazioni, statistiche, scoring, overrides)
    assert all(p["id"] != 2932 for p in result)
    assert len(result) == len(quotazioni) - 1


def test_override_fascia_stelle_note(fixture_data, scoring):
    quotazioni, statistiche = fixture_data
    overrides = {"players": {"5841": {"fascia": "Top", "stelle": 5, "note": "titolare inamovibile"}}}
    result = build_players(quotazioni, statistiche, scoring, overrides)
    svilar = by_name(result, "Svilar")
    assert svilar["fascia"] == "Top"
    assert svilar["stelle"] == 5
    assert svilar["note"] == "titolare inamovibile"


# ---------------------------------------------------------------------------
# indici grezzi (compute_raw_indices) e compute_scores
# ---------------------------------------------------------------------------

def test_compute_raw_indices_goalkeeper_has_gk_only_fields():
    stat = {"presenze": 30, "media_voto": 6.0, "fantamedia": 6.2,
             "gol_fatti": 0, "gol_subiti": 20, "rigori_parati": 3, "assist": 0}
    idx = compute_raw_indices("P", stat)
    assert "gs_per_partita_inv" in idx
    assert idx["gs_per_partita_inv"] == pytest.approx(-20 / 30)
    assert idx["rigori_parati"] == 3.0


def test_compute_raw_indices_outfield_has_no_gk_fields():
    stat = {"presenze": 30, "media_voto": 6.0, "fantamedia": 6.5,
             "gol_fatti": 5, "gol_subiti": 0, "rigori_parati": 0, "assist": 2}
    idx = compute_raw_indices("A", stat)
    assert "gs_per_partita_inv" not in idx
    assert "rigori_parati" not in idx
    assert idx["bonus_rate"] == pytest.approx(0.5)


def test_compute_scores_best_performer_gets_100():
    players = [
        {"id": 1, "position": "A", "no_stats": False,
         "_raw_indices": {"fantamedia": 8.0, "presenze_pct": 1.0, "gol_fatti": 20.0, "assist": 10.0, "bonus_rate": 1.5}},
        {"id": 2, "position": "A", "no_stats": False,
         "_raw_indices": {"fantamedia": 6.0, "presenze_pct": 0.5, "gol_fatti": 2.0, "assist": 1.0, "bonus_rate": 0.1}},
    ]
    weights = {"A": {"fantamedia": 0.35, "presenze_pct": 0.15, "gol_fatti": 0.30, "assist": 0.15, "bonus_rate": 0.05}}
    compute_scores(players, weights)
    assert players[0]["score"] == 100.0
    assert players[1]["score"] < players[0]["score"]


# ---------------------------------------------------------------------------
# assign_fasce in isolamento (senza passare per build_players)
# ---------------------------------------------------------------------------

def test_assign_fasce_splits_role_by_fvm_percentile():
    players = [
        {"id": 1, "position": "A", "fvm": 100},  # rank 1/2 -> cum_pct 0.5
        {"id": 2, "position": "A", "fvm": 50},   # rank 2/2 -> cum_pct 1.0
    ]
    fasce_cfg = {
        "labels": ["Top", "Scommessa"],
        "default_thresholds": {"Top": 0.5, "Scommessa": 1.01},
    }
    assign_fasce(players, fasce_cfg)
    assert players[0]["fascia"] == "Top"
    assert players[1]["fascia"] == "Scommessa"


def test_assign_affare_index_all_no_stats_is_noop():
    players = [{"id": 1, "position": "A", "fvm": 100, "no_stats": True}]
    assign_affare_index(players, {"affare_threshold": 0.15, "trappola_threshold": -0.15})
    assert "indice_affare" not in players[0]
