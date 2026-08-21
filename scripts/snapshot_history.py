"""Aggiunge uno snapshot giornaliero di quotazione/FVM allo storico.

Va eseguito DOPO build_board.py, perché legge web/data/board.json. Ogni
esecuzione aggiunge (o sovrascrive, se già presente per la stessa data) un
punto per ogni giocatore in web/data/history.json:

    { "<id>": [["2026-08-19", qt_att, fvm], ...], ... }

La dashboard usa questa serie per le sparkline e per il pannello "movimenti
ultimi 7 giorni".

Uso:
    python3 scripts/snapshot_history.py
    python3 scripts/snapshot_history.py --date 2026-08-19   # per test/backfill
"""
import argparse
import json
import os
from datetime import datetime, timezone

from lib.config import load_settings, repo_path

MAX_POINTS_PER_PLAYER = 400  # ~ più di una stagione di snapshot giornalieri

# Sotto questa soglia di giocatori in board, il pruning viene saltato: una
# board anomala/parziale (es. endpoint quotazioni mezzo rotto) non deve
# poter cancellare mesi di storico irrecuperabile per un guasto temporaneo.
MIN_BOARD_FOR_PRUNE = 50


def update_history(history: dict, board: list, date_str: str) -> dict:
    for p in board:
        pid = str(p["id"])
        series = history.setdefault(pid, [])
        # rimuove un eventuale punto già presente per la stessa data (evita duplicati
        # se lo script gira più volte nello stesso giorno) poi aggiunge quello nuovo
        series[:] = [pt for pt in series if pt[0] != date_str]
        series.append([date_str, p["qt_att"], p["fvm"]])
        series.sort(key=lambda pt: pt[0])
        if len(series) > MAX_POINTS_PER_PLAYER:
            del series[: len(series) - MAX_POINTS_PER_PLAYER]

    if len(board) >= MIN_BOARD_FOR_PRUNE:
        current_ids = {str(p["id"]) for p in board}
        orphans = [pid for pid in history if pid not in current_ids]
        for pid in orphans:
            del history[pid]
        if orphans:
            print(f"[snapshot_history] rimossi {len(orphans)} id non più in board")

    return history


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", default=None,
                         help="data dello snapshot in formato YYYY-MM-DD (default: oggi UTC)")
    args = parser.parse_args()

    settings = load_settings()
    board_path = repo_path(settings["paths"]["board_json"])
    history_path = repo_path(settings["paths"]["history_json"])

    if not os.path.exists(board_path):
        raise SystemExit(f"[snapshot_history] Manca {board_path}: esegui prima scripts/build_board.py")

    with open(board_path, "r", encoding="utf-8") as f:
        board = json.load(f)

    history = {}
    if os.path.exists(history_path):
        with open(history_path, "r", encoding="utf-8") as f:
            history = json.load(f)

    date_str = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    history = update_history(history, board, date_str)

    os.makedirs(os.path.dirname(history_path), exist_ok=True)
    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)
    print(f"[snapshot_history] snapshot {date_str} per {len(board)} giocatori scritto in {history_path}")


if __name__ == "__main__":
    main()
