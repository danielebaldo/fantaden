// Piano d'asta strutturato: alternative automatiche, copertura per reparto,
// avvisi di rischio (fascia concentrata, squadra concentrata, pressione mercato).
// Funzioni pure, nessuna dipendenza su state.js: statusOf è iniettato da ui.js.

import { FASCIA_ORDER } from './board.js';
import { deltaRecent } from './history.js';

/**
 * Alternative automatiche per un giocatore: stessi ruolo/reparto, status
 * disponibile, ordinati per prossimità di score e fvm.
 *
 * @param {Object} player - il giocatore target
 * @param {Array} board - lista completa dei giocatori
 * @param {Function} statusOf - callback (playerId) => 'available'|'mine'|'taken'|'wishlist'
 * @param {Object} opts - { limit, maxFasciaDistance, fasciaOrder }
 * @returns {Array} [{player, deltaScore, deltaFvm, sameFascia}, ...]
 */
export function findAlternatives(player, board, statusOf, opts = {}) {
  const {
    limit = 3,
    maxFasciaDistance = 1,
    fasciaOrder = FASCIA_ORDER,
  } = opts;

  const targetFasciaIdx = fasciaOrder.indexOf(player.fascia);
  const candidates = board.filter((alt) => {
    // stesso ruolo, diverso id, disponibile
    if (alt.position !== player.position || alt.id === player.id) return false;
    if (statusOf(alt.id) !== 'available') return false;

    // entro la distanza di fascia (o target stesso è no_stats)
    const altFasciaIdx = fasciaOrder.indexOf(alt.fascia);
    if (!player.no_stats && Math.abs(altFasciaIdx - targetFasciaIdx) > maxFasciaDistance) {
      return false;
    }

    return true;
  });

  // ordinamento
  const scored = candidates.map((alt) => {
    const deltaScore = player.score != null && alt.score != null
      ? Math.abs(alt.score - player.score)
      : Infinity; // no_stats in coda
    const deltaFvm = Math.abs(alt.fvm - player.fvm);
    const sameFascia = alt.fascia === player.fascia;

    return {
      player: alt,
      deltaScore,
      deltaFvm,
      sameFascia,
    };
  });

  scored.sort((a, b) => {
    // score come criterio principale, fvm come tie-break
    if (a.deltaScore !== b.deltaScore) {
      return a.deltaScore - b.deltaScore;
    }
    return a.deltaFvm - b.deltaFvm;
  });

  return scored.slice(0, limit);
}

/**
 * Verifica di copertura del piano d'asta per un singolo reparto.
 *
 * @param {string} role - es. 'P', 'D', 'C', 'A'
 * @param {Object} roleInfo - { max, speso, acquistati, disponibile, budgetDinamico, ... }
 * @param {Array} wishlistForRole - [{id, position, team, target, priority, fascia, status}, ...]
 * @param {Object} history - storico quotazioni
 * @returns {Object} {obiettivi, obiettiviDisponibili, costo*, media*, delta, copertura, ...}
 */
export function computeWishlistCoveragePerRole(
  role,
  roleInfo,
  wishlistForRole,
  history = {}
) {
  const mancanti = roleInfo.mancanti || 0;
  const disponibile = roleInfo.disponibile || 0;
  const budgetDinamico = roleInfo.budgetDinamico || 0;

  // separa disponibili e persi
  const obiettiviDisponibili = wishlistForRole.filter((w) => w.status === 'available');
  const obiettiviPersi = wishlistForRole.filter((w) => w.status !== 'available');

  // ordina i disponibili per priorità (asc: 1, 2, 3) e poi per target (desc)
  obiettiviDisponibili.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (b.target || 0) - (a.target || 0);
  });

  // costoTargetPiano = somma dei primi `mancanti` disponibili
  let costoTargetPiano = 0;
  for (let i = 0; i < Math.min(mancanti, obiettiviDisponibili.length); i++) {
    costoTargetPiano += obiettiviDisponibili[i].target || 0;
  }

  // costoTargetTutti = somma di tutti i disponibili
  const costoTargetTutti = obiettiviDisponibili.reduce((sum, w) => sum + (w.target || 0), 0);

  const mediaTargetPiano = mancanti > 0
    ? (costoTargetPiano / mancanti).toFixed(1)
    : '—';

  const delta = disponibile - costoTargetPiano;
  const sfondamento = delta < 0;
  const slotScoperti = Math.max(0, mancanti - obiettiviDisponibili.length);

  // concentrazione di fascia: se ≥70% degli obiettivi sono nella stessa fascia
  const fasciaCount = {};
  for (const w of obiettiviDisponibili) {
    fasciaCount[w.fascia] = (fasciaCount[w.fascia] || 0) + 1;
  }
  const maxFasciaCount = Math.max(...Object.values(fasciaCount), 0);
  const maxFasciaLabel = Object.entries(fasciaCount)
    .find(([_, count]) => count === maxFasciaCount)?.[0] || null;
  const concentrazioneFascia = obiettiviDisponibili.length >= 3
    && maxFasciaCount / obiettiviDisponibili.length >= 0.7
    ? { label: maxFasciaLabel, quota: (maxFasciaCount / obiettiviDisponibili.length * 100).toFixed(0) }
    : null;

  // pressione mercato: obiettivi la cui quotazione è in salita nella finestra recente
  const pressione = [];
  for (const w of obiettiviDisponibili) {
    const d = deltaRecent(history, w.id);
    if (d && d.deltaQt > 0) {
      pressione.push({ id: w.id, deltaQt: d.deltaQt });
    }
  }
  const pressioneDetectato = pressione.length > 0;

  // determinazione della copertura
  let copertura = 'ok';
  if (slotScoperti > 0) copertura = 'scoperto';
  if (sfondamento) copertura = 'sfondamento';
  if (obiettiviDisponibili.length === 0) copertura = 'vuoto';
  if (slotScoperti === 0 && !sfondamento && obiettiviDisponibili.length > 0) {
    // se coperto esattamente ma troppo stretto (margin < mancanti crediti)
    if (0 <= delta && delta < mancanti) copertura = 'stretto';
  }

  return {
    role,
    obiettivi: wishlistForRole.length,
    obiettiviDisponibili: obiettiviDisponibili.length,
    obiettiviPersi: obiettiviPersi.length,
    costoTargetTutti,
    costoTargetPiano,
    mediaTargetPiano,
    disponibile,
    budgetDinamico,
    mancanti,
    delta,
    sfondamento,
    slotScoperti,
    concentrazioneFascia,
    pressioneDetectato,
    copertura,
  };
}

/**
 * Verifica di copertura globale del piano d'asta.
 * Ritorna un blocco per ruolo + un blocco globale.
 *
 * @param {Array} roles - es. ['P','D','C','A']
 * @param {Object} perRole - dal risultato di computeAuctionState, { [role]: {max, speso, ...} }
 * @param {Array} entries - wishlist + lostTargets combinate, [{id, position, target, priority, ...}, ...]
 * @param {Object} opts - { cassaGlobale, history }
 * @returns {Object} {perRole: {...}, globale: {...}}
 */
export function computeWishlistCoverage(roles, perRole, entries, opts = {}) {
  const { cassaGlobale = 0, history = {} } = opts;

  const coveragePerRole = {};
  let costoTargetGlobale = 0;

  for (const role of roles) {
    const roleInfo = perRole[role] || {};
    const wishlistForRole = entries.filter((e) => e.position === role);

    const coverage = computeWishlistCoveragePerRole(
      role,
      roleInfo,
      wishlistForRole,
      history
    );
    coveragePerRole[role] = coverage;
    costoTargetGlobale += coverage.costoTargetPiano;
  }

  // concentrazione per squadra: raggruppa myTeam + wishlist attiva
  // (nota: entries non include lostTargets per il calcolo della concentrazione)
  const squadraCount = {};
  for (const e of entries) {
    if (e.team) {
      squadraCount[e.team] = (squadraCount[e.team] || 0) + 1;
    }
  }
  const maxSquadraCount = Math.max(...Object.values(squadraCount), 0);
  const concentrazioneSquadre = maxSquadraCount >= 4
    ? { maxCount: maxSquadraCount }
    : null;

  const deltaGlobale = cassaGlobale - costoTargetGlobale;
  const ok = !Object.values(coveragePerRole).some((c) =>
    c.copertura === 'sfondamento' || c.copertura === 'scoperto'
  );

  return {
    perRole: coveragePerRole,
    globale: {
      costoTargetPianoTotale: costoTargetGlobale,
      cassaGlobale,
      deltaGlobale,
      concentrazioneSquadre,
      ok,
    },
  };
}
