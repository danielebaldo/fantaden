"""Costruisce la board (lista giocatori con fasce e punteggi) a partire da
data/quotazioni.json e data/statistiche.json.

È il cuore della "lista Excel di scelte e fasce": incrocia il prezzo di
mercato (FVM, quotazione) con le statistiche della stagione precedente e
produce, per ogni giocatore:

- uno **score** percentile (0-100) dentro il proprio ruolo, calcolato sui
  pesi di config/scoring.json;
- una **fascia** di prezzo (Top / 1a Fascia / ... / Scommessa), calcolata
  sui percentili di FVM dentro il ruolo;
- un **indice_affare** (score_pct - prezzo_pct): positivo e alto vuol dire
  che il giocatore rende più di quanto costi (affare), negativo vuol dire
  il contrario (trappola).

I giocatori senza statistiche stagione precedente (neopromossi, nuovi
arrivi) restano in board con `no_stats=true`, score/indice_affare nulli, e
sono esclusi dal calcolo dei percentili per non sporcare il ranking degli
altri.

Uso:
    python3 scripts/build_board.py
    python3 scripts/build_board.py --offline   # non tocca data/raw, usa solo i JSON già normalizzati
"""
import argparse
import json
import os
from datetime import datetime, timezone

from lib.config import load_settings, load_scoring, load_overrides, repo_path

FASCIA_LABELS_DEFAULT = ["Top", "1a Fascia", "2a Fascia", "3a Fascia", "Low Cost", "Scommessa"]


def _percentile_rank(values: dict) -> dict:
    """Percentile (0..1] di ogni valore in `values` (id -> numero), dove 1.0
    è il valore più alto. Pareggi ricevono lo stesso percentile (media dei
    ranghi), come pandas .rank(pct=True)."""
    if not values:
        return {}
    items = sorted(values.items(), key=lambda kv: kv[1])
    n = len(items)
    ranks = {}
    i = 0
    while i < n:
        j = i
        while j + 1 < n and items[j + 1][1] == items[i][1]:
            j += 1
        avg_rank = (i + j) / 2 + 1  # rank medio 1-based per il gruppo di pari valore
        pct = avg_rank / n
        for k in range(i, j + 1):
            ranks[items[k][0]] = pct
        i = j + 1
    return ranks


def compute_raw_indices(role: str, stat: dict) -> dict:
    """Indici grezzi (prima della percentilizzazione) per un giocatore con
    statistiche disponibili. `stat` è il record normalizzato da statistiche.json."""
    presenze = stat["presenze"]
    idx = {
        "presenze_pct": presenze / 38.0,
        "fantamedia": stat["fantamedia"],
        "bonus_rate": stat["fantamedia"] - stat["media_voto"],
        "gol_fatti": float(stat["gol_fatti"]),
        "assist": float(stat["assist"]),
    }
    if role == "P":
        idx["gs_per_partita_inv"] = -(stat["gol_subiti"] / max(presenze, 1))
        idx["rigori_parati"] = float(stat["rigori_parati"])
    return idx


def compute_scores(players: list, weights_by_role: dict) -> None:
    """Aggiunge in-place `score` (0-100) e `_score_pct` (0-1) ai giocatori
    con statistiche. I giocatori no_stats restano a score=None."""
    by_role = {}
    for p in players:
        by_role.setdefault(p["position"], []).append(p)

    for role, roster in by_role.items():
        weights = weights_by_role.get(role, {})
        with_stats = [p for p in roster if not p["no_stats"]]

        # percentile per ogni indice, calcolato solo tra chi ha statistiche
        percentiles_by_index = {}
        for index_name in weights:
            values = {p["id"]: p["_raw_indices"][index_name] for p in with_stats}
            percentiles_by_index[index_name] = _percentile_rank(values)

        for p in with_stats:
            score_pct = 0.0
            for index_name, weight in weights.items():
                score_pct += weight * percentiles_by_index[index_name].get(p["id"], 0.0)
            p["_score_pct"] = score_pct
            p["score"] = round(score_pct * 100, 1)


def assign_fasce(players: list, fasce_cfg: dict) -> None:
    """Assegna la fascia di prezzo in-place, in base al percentile di FVM
    dentro il ruolo (FVM più alto = percentile cumulativo più basso = fascia
    migliore)."""
    labels = fasce_cfg.get("labels", FASCIA_LABELS_DEFAULT)
    default_thresholds = fasce_cfg["default_thresholds"]
    per_role = fasce_cfg.get("per_role_thresholds", {})

    by_role = {}
    for p in players:
        by_role.setdefault(p["position"], []).append(p)

    for role, roster in by_role.items():
        thresholds = per_role.get(role, default_thresholds)
        ranked = sorted(roster, key=lambda p: p["fvm"], reverse=True)
        n = len(ranked)
        for rank, p in enumerate(ranked, start=1):
            cum_pct = rank / n
            fascia = labels[-1]
            for label in labels:
                if cum_pct <= thresholds.get(label, 1.01):
                    fascia = label
                    break
            p["fascia"] = fascia


def assign_affare_index(players: list, affare_cfg: dict) -> None:
    """Calcola indice_affare = percentile(score) - percentile(fvm) dentro il
    ruolo, solo per chi ha statistiche."""
    affare_threshold = affare_cfg.get("affare_threshold", 0.15)
    trappola_threshold = affare_cfg.get("trappola_threshold", -0.15)

    by_role = {}
    for p in players:
        by_role.setdefault(p["position"], []).append(p)

    for role, roster in by_role.items():
        with_stats = [p for p in roster if not p["no_stats"]]
        fvm_values = {p["id"]: p["fvm"] for p in with_stats}
        fvm_pct = _percentile_rank(fvm_values)

        for p in with_stats:
            price_pct = fvm_pct.get(p["id"], 0.0)
            idx = p["_score_pct"] - price_pct
            p["indice_affare"] = round(idx, 3)
            if idx >= affare_threshold:
                p["affare_label"] = "Affare"
            elif idx <= trappola_threshold:
                p["affare_label"] = "Trappola"
            else:
                p["affare_label"] = "Equo"


def build_players(quotazioni: list, statistiche: list, scoring: dict, overrides: dict,
                   image_template: str | None = None, season_id: int | None = None,
                   budget_totale: int | None = None, fvm_reference_budget: int | None = None) -> list:
    stats_by_id = {s["id"]: s for s in statistiche}
    weights_by_role = scoring["weights"]
    override_players = overrides.get("players", {})

    # FVM di fantacalcio.it è calibrato su fvm_reference_budget (di norma una
    # lega da 1000 crediti): fvm_500 lo riscala sul budget reale della lega
    # (auction_defaults.budget_totale, di norma 500). È una trasformazione
    # lineare uniforme su tutti i giocatori: non altera percentili, fasce,
    # score o indice affare/trappola, che restano calcolati su `fvm`.
    fvm_scale = (
        budget_totale / fvm_reference_budget
        if budget_totale and fvm_reference_budget else None
    )

    players = []
    for q in quotazioni:
        stat = stats_by_id.get(q["id"])
        no_stats = stat is None

        p = dict(q)
        p["no_stats"] = no_stats
        p["score"] = None
        p["indice_affare"] = None
        p["affare_label"] = None
        p["stelle"] = None
        p["note"] = ""
        p["fvm_500"] = round(q["fvm"] * fvm_scale) if fvm_scale is not None else None
        p["fvm_m_500"] = round(q["fvm_m"] * fvm_scale) if fvm_scale is not None else None
        p["playerImage"] = (
            image_template.format(season_id=season_id, player_id=q["id"])
            if image_template and season_id else None
        )

        if not no_stats:
            p["presenze"] = stat["presenze"]
            p["media_voto"] = stat["media_voto"]
            p["fantamedia"] = stat["fantamedia"]
            p["gol_fatti"] = stat["gol_fatti"]
            p["gol_subiti"] = stat["gol_subiti"]
            p["assist"] = stat["assist"]
            p["rigori_parati"] = stat["rigori_parati"]
            p["rigorista"] = stat["rigori_calciati"] > 0
            p["_raw_indices"] = compute_raw_indices(q["position"], stat)
        else:
            for key in ("presenze", "media_voto", "fantamedia", "gol_fatti",
                        "gol_subiti", "assist", "rigori_parati"):
                p[key] = None
            p["rigorista"] = False
            p["_raw_indices"] = {}

        players.append(p)

    compute_scores(players, weights_by_role)
    assign_fasce(players, scoring["fasce"])
    assign_affare_index(players, scoring["affare_index"])

    # overrides manuali, poi rimozione dei giocatori esclusi
    result = []
    for p in players:
        ov = override_players.get(str(p["id"]))
        if ov:
            if ov.get("escluso"):
                continue
            if "fascia" in ov:
                p["fascia"] = ov["fascia"]
            if "stelle" in ov:
                p["stelle"] = ov["stelle"]
            if "note" in ov:
                p["note"] = ov["note"]
        p.pop("_raw_indices", None)
        p.pop("_score_pct", None)
        result.append(p)

    fascia_order = {label: i for i, label in enumerate(scoring["fasce"].get("labels", FASCIA_LABELS_DEFAULT))}
    result.sort(key=lambda p: (
        p["position"],
        fascia_order.get(p["fascia"], 99),
        -(p["score"] if p["score"] is not None else -1),
    ))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true",
                         help="non usato per la logica (i dati vengono sempre letti da data/*.json), "
                              "presente per chiarezza negli script di CI/test")
    args = parser.parse_args()
    del args  # nessun ramo diverso al momento, il flag è documentale

    settings = load_settings()
    scoring = load_scoring()
    overrides = load_overrides()

    quotazioni_path = repo_path(settings["paths"]["quotazioni_json"])
    statistiche_path = repo_path(settings["paths"]["statistiche_json"])

    if not os.path.exists(quotazioni_path):
        raise SystemExit(f"[build_board] Manca {quotazioni_path}: esegui prima scripts/normalize.py")

    with open(quotazioni_path, "r", encoding="utf-8") as f:
        quotazioni = json.load(f)

    statistiche = []
    if os.path.exists(statistiche_path):
        with open(statistiche_path, "r", encoding="utf-8") as f:
            statistiche = json.load(f)

    board = build_players(
        quotazioni, statistiche, scoring, overrides,
        image_template=settings["endpoints"]["image_template"],
        season_id=settings["season"]["current_season_id"],
        budget_totale=settings["auction_defaults"]["budget_totale"],
        fvm_reference_budget=settings.get("fvm_reference_budget"),
    )

    board_path = repo_path(settings["paths"]["board_json"])
    os.makedirs(os.path.dirname(board_path), exist_ok=True)
    with open(board_path, "w", encoding="utf-8") as f:
        json.dump(board, f, ensure_ascii=False, indent=2)
    print(f"[build_board] scritti {len(board)} giocatori in {board_path}")

    counts_by_role = {}
    no_stats_count = 0
    for p in board:
        counts_by_role[p["position"]] = counts_by_role.get(p["position"], 0) + 1
        if p["no_stats"]:
            no_stats_count += 1

    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "season": settings["season"],
        "roles": settings["roles"],
        "role_names": settings["role_names"],
        "auction_defaults": settings["auction_defaults"],
        "image_template": settings["endpoints"]["image_template"],
        "total_players": len(board),
        "counts_by_role": counts_by_role,
        "no_stats_count": no_stats_count,
        "quotazioni_source_count": len(quotazioni),
        "statistiche_source_count": len(statistiche),
    }
    meta_path = repo_path(settings["paths"]["meta_json"])
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"[build_board] scritto meta in {meta_path}")


if __name__ == "__main__":
    main()
