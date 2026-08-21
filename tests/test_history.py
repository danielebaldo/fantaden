"""Test di scripts/snapshot_history.py: dedup per data, cap sul numero di
punti per giocatore, e pruning degli id non più presenti in board (con
guardia sulle board troppo piccole/parziali)."""
from snapshot_history import MAX_POINTS_PER_PLAYER, MIN_BOARD_FOR_PRUNE, update_history


def _board(*ids):
    # board fittizia con abbastanza giocatori per superare MIN_BOARD_FOR_PRUNE
    # quando serve testare il pruning; ogni id extra è un riempitivo innocuo.
    return [{"id": i, "qt_att": 10, "fvm": 100} for i in ids]


def test_appends_new_point():
    history = {}
    board = _board(1, 2)
    update_history(history, board, "2026-08-19")
    assert history["1"] == [["2026-08-19", 10, 100]]
    assert history["2"] == [["2026-08-19", 10, 100]]


def test_dedup_same_date_overwrites_not_duplicates():
    history = {"1": [["2026-08-19", 5, 50]]}
    board = [{"id": 1, "qt_att": 12, "fvm": 120}]
    update_history(history, board, "2026-08-19")
    assert history["1"] == [["2026-08-19", 12, 120]]


def test_series_sorted_by_date_even_if_run_out_of_order():
    history = {"1": [["2026-08-20", 8, 80]]}
    board = [{"id": 1, "qt_att": 10, "fvm": 100}]
    update_history(history, board, "2026-08-19")
    assert [pt[0] for pt in history["1"]] == ["2026-08-19", "2026-08-20"]


def test_caps_points_per_player():
    # serie già al cap, con date tutte distinte: un nuovo punto deve far
    # cadere il più vecchio, non sforare il limite.
    existing = [[f"2020-{(i // 28) + 1:02d}-{(i % 28) + 1:02d}", 10, 100]
                for i in range(MAX_POINTS_PER_PLAYER)]
    history = {"1": existing}
    board = [{"id": 1, "qt_att": 10, "fvm": 100}]
    update_history(history, board, "2099-01-01")
    assert len(history["1"]) == MAX_POINTS_PER_PLAYER
    assert history["1"][-1][0] == "2099-01-01"
    assert history["1"][0][0] != "2020-01-01"


def test_pruning_removes_orphan_ids_when_board_is_large_enough():
    ids = list(range(1, MIN_BOARD_FOR_PRUNE + 1))
    history = {str(i): [["2026-08-19", 10, 100]] for i in ids}
    history["9999"] = [["2026-08-01", 5, 50]]  # giocatore uscito dal listone
    board = _board(*ids)
    result = update_history(history, board, "2026-08-20")
    assert "9999" not in result
    assert all(str(i) in result for i in ids)


def test_pruning_skipped_when_board_too_small():
    # board anomala/parziale (sotto la soglia): il pruning va saltato per non
    # cancellare storico buono per un guasto temporaneo della pipeline.
    history = {"1": [["2026-08-19", 10, 100]], "9999": [["2026-08-01", 5, 50]]}
    board = _board(1)  # 1 solo giocatore, ben sotto MIN_BOARD_FOR_PRUNE
    result = update_history(history, board, "2026-08-20")
    assert "9999" in result
