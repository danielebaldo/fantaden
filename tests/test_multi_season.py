"""Test dello score multi-stagione (Fase 3, scripts/build_board.py ->
_combine_multi_season / build_players(seasons_stats=...)), eseguiti sulle
fixture Excel in data/raw/*_fixture*.xlsx (generate da scripts/make_fixtures.py).

I 24+ test in test_scoring.py restano il gate di non-regressione: chiamano
build_players senza seasons_stats (o con multi_season.enabled=False) e non
devono cambiare comportamento di una virgola. Qui si testa solo il nuovo
ramo, esplicitamente attivato.
"""
import copy
import os

import pytest

from build_board import _combine_multi_season, build_players, compute_raw_indices
from lib.config import load_scoring, repo_path
from normalize import normalize_prices, normalize_stats

FIXTURES_DIR = repo_path("data", "raw")
PRICES_FIXTURE = os.path.join(FIXTURES_DIR, "quotazioni_fixture.xlsx")
STATS_FIXTURE = os.path.join(FIXTURES_DIR, "statistiche_fixture.xlsx")
STATS_PREV_FIXTURE = os.path.join(FIXTURES_DIR, "statistiche_fixture_prev.xlsx")


@pytest.fixture(scope="module")
def quotazioni():
    assert os.path.exists(PRICES_FIXTURE), "manca la fixture, esegui scripts/make_fixtures.py"
    return normalize_prices(PRICES_FIXTURE)


@pytest.fixture(scope="module")
def statistiche():
    assert os.path.exists(STATS_FIXTURE), "manca la fixture, esegui scripts/make_fixtures.py"
    return normalize_stats(STATS_FIXTURE)


@pytest.fixture(scope="module")
def statistiche_prev():
    assert os.path.exists(STATS_PREV_FIXTURE), "manca la fixture, esegui scripts/make_fixtures.py"
    return normalize_stats(STATS_PREV_FIXTURE)


@pytest.fixture
def scoring_multi():
    """Copia di config/scoring.json con multi_season abilitato, isolata dal
    file reale: ogni test può modificarne pesi/soglie senza toccare gli
    altri test né config/scoring.json su disco."""
    scoring = copy.deepcopy(load_scoring())
    scoring["multi_season"]["enabled"] = True
    return scoring


@pytest.fixture
def scoring_disabled():
    """Copia di config/scoring.json con multi_season esplicitamente
    disabilitato: non fa affidamento sul default del file su disco (che in
    produzione è ormai enabled=true), altrimenti questo fixture smette di
    rappresentare "disabilitato" al primo cambio di quel default."""
    scoring = copy.deepcopy(load_scoring())
    scoring["multi_season"]["enabled"] = False
    return scoring


def by_id(stats_list, player_id):
    return next(s for s in stats_list if s["id"] == player_id)


def by_name(board, name):
    return next(p for p in board if p["name"] == name)


# ---------------------------------------------------------------------------
# gate di non-regressione: seasons_stats=None o multi_season.enabled=False
# devono dare esattamente lo stesso risultato del ramo a singola stagione
# ---------------------------------------------------------------------------

def test_multi_season_off_equals_current(quotazioni, statistiche, statistiche_prev, scoring_disabled):
    baseline = build_players(quotazioni, statistiche, scoring_disabled, overrides={"players": {}})
    # passo seasons_stats ma con multi_season.enabled=False: deve essere ignorato
    with_unused_seasons = build_players(
        quotazioni, statistiche, scoring_disabled, overrides={"players": {}},
        seasons_stats=[(20, statistiche), (19, statistiche_prev)],
    )
    assert baseline == with_unused_seasons


def test_single_season_with_multi_enabled_equals_baseline(quotazioni, statistiche, scoring_multi, scoring_disabled):
    """Garanzia di degradazione: con una sola stagione disponibile e peso
    1.0, il ramo multi-stagione deve produrre lo stesso score/fascia/affare
    del ramo classico (stessi indici grezzi, nessuna media da fare)."""
    scoring_multi["multi_season"]["weights"] = [1.0]
    baseline = build_players(quotazioni, statistiche, scoring_disabled, overrides={"players": {}})
    multi = build_players(
        quotazioni, statistiche, scoring_multi, overrides={"players": {}},
        seasons_stats=[(20, statistiche)],
    )
    baseline_by_id = {p["id"]: p for p in baseline}
    for p in multi:
        b = baseline_by_id[p["id"]]
        assert p["score"] == b["score"], p["name"]
        assert p["fascia"] == b["fascia"], p["name"]
        assert p["indice_affare"] == b["indice_affare"], p["name"]
        assert p["affare_label"] == b["affare_label"], p["name"]
        assert p["no_stats"] == b["no_stats"], p["name"]
        assert p["fantamedia"] == b["fantamedia"], p["name"]
        assert p["presenze"] == b["presenze"], p["name"]


# ---------------------------------------------------------------------------
# _combine_multi_season (unit)
# ---------------------------------------------------------------------------

def test_weights_renormalized_when_a_season_is_missing(statistiche, statistiche_prev):
    # Calhanoglu (1200) presente in entrambe le stagioni
    stat_recent = by_id(statistiche, 1200)
    stat_prev = by_id(statistiche_prev, 1200)
    seasons_by_id = [(20, {1200: stat_recent}), (19, {1200: stat_prev})]
    weights = [0.60, 0.25]  # come in config, ma senza la terza stagione

    combo = _combine_multi_season("C", 1200, seasons_by_id, weights, min_presenze=5)
    assert combo is not None
    assert combo["stagioni_disponibili"] == 2

    total = 0.60 + 0.25
    expected_fantamedia = (0.60 * stat_recent["fantamedia"] + 0.25 * stat_prev["fantamedia"]) / total
    assert combo["raw_indices"]["fantamedia"] == pytest.approx(expected_fantamedia)


def test_player_only_in_older_season_gets_score(statistiche, statistiche_prev):
    # Rossi Portiere (9001): assente dalla stagione più recente (STATS),
    # presente solo in quella precedente (STATS_PREV) -> "rientro" recuperato
    # dal multi-stagione: no_stats complessivo False, ma no_stats_recent True.
    assert not any(s["id"] == 9001 for s in statistiche)
    stat_prev = by_id(statistiche_prev, 9001)
    seasons_by_id = [(20, {}), (19, {9001: stat_prev})]
    weights = [0.60, 0.25, 0.15]

    combo = _combine_multi_season("P", 9001, seasons_by_id, weights, min_presenze=5)
    assert combo is not None
    assert combo["stagioni_disponibili"] == 1
    assert combo["stagioni_ids"] == [19]
    assert combo["no_stats_recent"] is True
    assert combo["display_stat"] == stat_prev


def test_player_only_in_older_season_end_to_end(quotazioni, statistiche, statistiche_prev, scoring_multi):
    board = build_players(
        quotazioni, statistiche, scoring_multi, overrides={"players": {}},
        seasons_stats=[(20, statistiche), (19, statistiche_prev)],
    )
    p = by_name(board, "Rossi Portiere")
    assert p["no_stats"] is False
    assert p["no_stats_recent"] is True
    assert p["stagioni_disponibili"] == 1
    assert p["score"] is not None


def test_min_presenze_excludes_cameo_season(statistiche, statistiche_prev):
    # Kalulu (5522): 24 presenze nella stagione recente (sopra soglia), solo
    # 3 in quella precedente (sotto min_presenze_per_season=5) -> la stagione
    # precedente conta comunque in stagioni_disponibili (ha un record reale)
    # ma è esclusa dalla MEDIA pesata degli indici, che riflette quindi solo
    # la stagione recente.
    stat_recent = by_id(statistiche, 5522)
    stat_prev = by_id(statistiche_prev, 5522)
    assert stat_prev["presenze"] == 3
    seasons_by_id = [(20, {5522: stat_recent}), (19, {5522: stat_prev})]

    combo = _combine_multi_season("D", 5522, seasons_by_id, [0.60, 0.25], min_presenze=5)
    assert combo is not None
    assert combo["stagioni_disponibili"] == 2  # entrambe le stagioni hanno un record
    assert combo["stagioni_ids"] == [20, 19]
    # ma la media degli indici usa solo la stagione recente (sopra soglia)
    raw = compute_raw_indices("D", stat_recent)
    assert combo["raw_indices"]["fantamedia"] == pytest.approx(raw["fantamedia"])


def test_min_presenze_falls_back_to_all_seasons_if_none_qualify():
    # Se NESSUNA stagione supera min_presenze, meglio usarle tutte che
    # dichiarare il giocatore no_stats (mai una regressione rispetto al
    # ramo a singola stagione, che non applica alcun filtro presenze).
    stat_a = {"id": 1, "presenze": 2, "media_voto": 6.0, "fantamedia": 6.1,
              "gol_fatti": 0, "gol_subiti": 0, "rigori_parati": 0, "assist": 0}
    stat_b = {"id": 1, "presenze": 3, "media_voto": 6.0, "fantamedia": 6.3,
              "gol_fatti": 0, "gol_subiti": 0, "rigori_parati": 0, "assist": 0}
    seasons_by_id = [(20, {1: stat_a}), (19, {1: stat_b})]

    combo = _combine_multi_season("C", 1, seasons_by_id, [0.60, 0.25], min_presenze=5)
    assert combo is not None
    assert combo["stagioni_disponibili"] == 2
    # entrambe sotto soglia -> fallback: la media usa comunque entrambe
    expected = (0.60 * 6.1 + 0.25 * 6.3) / (0.60 + 0.25)
    assert combo["raw_indices"]["fantamedia"] == pytest.approx(expected)


def test_trend_fantamedia_sign_and_null_with_one_season(statistiche, statistiche_prev):
    # Lautaro (2100): fantamedia più alta nella stagione recente che in
    # quella precedente -> trend positivo (in crescita)
    stat_recent = by_id(statistiche, 2100)
    stat_prev = by_id(statistiche_prev, 2100)
    seasons_by_id = [(20, {2100: stat_recent}), (19, {2100: stat_prev})]

    combo = _combine_multi_season("A", 2100, seasons_by_id, [0.60, 0.25], min_presenze=5)
    assert combo["trend_fantamedia"] == pytest.approx(
        round(stat_recent["fantamedia"] - stat_prev["fantamedia"], 2)
    )
    assert combo["trend_fantamedia"] > 0

    # con una sola stagione disponibile il trend non è calcolabile
    combo_one_season = _combine_multi_season("A", 2100, [(20, {2100: stat_recent})], [1.0], min_presenze=5)
    assert combo_one_season["trend_fantamedia"] is None


def test_stagioni_disponibili_counts(statistiche, statistiche_prev):
    stat_recent = by_id(statistiche, 4210)
    stat_prev = by_id(statistiche_prev, 4210)
    seasons_by_id = [(20, {4210: stat_recent}), (19, {4210: stat_prev}), (18, {})]

    combo = _combine_multi_season("D", 4210, seasons_by_id, [0.60, 0.25, 0.15], min_presenze=5)
    assert combo["stagioni_disponibili"] == 2
    assert combo["stagioni_ids"] == [20, 19]
    assert combo["fantamedia_by_season"] == {
        "20": stat_recent["fantamedia"],
        "19": stat_prev["fantamedia"],
    }
    assert combo["presenze_medie"] == pytest.approx((stat_recent["presenze"] + stat_prev["presenze"]) / 2, abs=0.05)
    assert combo["continuita"] == pytest.approx(
        (stat_recent["presenze"] / 38.0 + stat_prev["presenze"] / 38.0) / 2, abs=0.001
    )


def test_combine_multi_season_no_stats_anywhere_returns_none():
    seasons_by_id = [(20, {}), (19, {}), (18, {})]
    combo = _combine_multi_season("A", 99999, seasons_by_id, [0.60, 0.25, 0.15], min_presenze=5)
    assert combo is None
