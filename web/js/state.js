// Stato dell'asta live: rosa propria, wishlist, giocatori presi dagli
// altri, elenco rivali e impostazioni budget/slot/percentuali. Persistito
// in localStorage (nessun backend: il tool è pensato per un uso personale,
// da browser, sia in locale sia da GitHub Pages).

const STORAGE_KEY = 'fantaden_state_v1';

export function createDefaultState(auctionDefaults) {
  return {
    version: 1,
    auction: {
      budgetTotale: auctionDefaults.budget_totale,
      slot: { ...auctionDefaults.slot },
      perc: { ...auctionDefaults.percentuali },
    },
    rivals: [],
    myTeam: {},        // playerId -> { costo, ruolo }
    wishlist: {},       // playerId -> { base, target, priority, nota }
    lostTargets: {},    // playerId -> { base, target, priority, nota, rivalId, costo, at }
    takenByOthers: {},  // playerId -> { rivalId, costo, ruolo }
    ui: {
      activeTab: 'P',
      rosterTab: 'mia', // 'mia' | 'rivali'
      search: '',
      fasciaFilter: 'all',
      onlyAvailable: false,
      onlyWishlist: false,
      onlyRigoristi: false,
      sortBy: 'fvm',
      sortDir: 'desc',
    },
  };
}

// Normalizzazione idempotente di una entry wishlist: aggiunge campi mancanti
// e coerce tipi (priority deve essere 1-3, nota deve essere string)
const WISHLIST_DEFAULTS = { base: null, target: null, priority: 2, nota: '' };
function hydrateWishlistEntry(entry) {
  if (!entry || typeof entry !== 'object') return { ...WISHLIST_DEFAULTS };
  const priority = Math.max(1, Math.min(3, Math.floor(Number(entry.priority) || 2)));
  return {
    base: entry.base != null ? Number(entry.base) : null,
    target: entry.target != null ? Number(entry.target) : null,
    priority,
    nota: String(entry.nota || ''),
  };
}

// Normalizzazione idempotente di una entry lostTargets (include i campi di lost + wishlist)
function hydrateLostTargetEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const wish = hydrateWishlistEntry(entry);
  return {
    ...wish,
    rivalId: entry.rivalId || null,
    costo: entry.costo != null ? Number(entry.costo) : null,
    at: entry.at || null,
  };
}

// Idratazione completa dello stato: passa per hydrate* per tollerare formati vecchi
function hydrateState(state, fallback) {
  if (!state || typeof state !== 'object') return fallback;

  const hydrated = { ...fallback, ...state };
  // merge dei rami nidificati
  hydrated.auction = { ...fallback.auction, ...(state.auction || {}) };
  hydrated.ui = { ...fallback.ui, ...(state.ui || {}) };

  // idratazione wishlist
  const rawWishlist = state.wishlist || {};
  hydrated.wishlist = {};
  for (const [id, entry] of Object.entries(rawWishlist)) {
    const hydrated_entry = hydrateWishlistEntry(entry);
    if (hydrated_entry.base != null || hydrated_entry.target != null) {
      hydrated.wishlist[id] = hydrated_entry;
    }
  }

  // idratazione lostTargets
  const rawLost = state.lostTargets || {};
  hydrated.lostTargets = {};
  for (const [id, entry] of Object.entries(rawLost)) {
    const hydrated_entry = hydrateLostTargetEntry(entry);
    if (hydrated_entry) hydrated.lostTargets[id] = hydrated_entry;
  }

  return hydrated;
}

export function loadState(auctionDefaults) {
  const fallback = createDefaultState(auctionDefaults);
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[state] localStorage non disponibile:', err);
    return fallback;
  }
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return hydrateState(parsed, fallback);
  } catch (err) {
    console.warn('[state] stato salvato non leggibile, riparto dai default:', err);
    return fallback;
  }
}

let saveTimer = null;
export function saveState(state) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('[state] salvataggio fallito:', err);
    }
  }, 150);
}

export function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[state] impossibile pulire localStorage:', err);
  }
}

export function exportStateJSON(state) {
  return JSON.stringify(state, null, 2);
}

export function importStateJSON(text, auctionDefaults) {
  const parsed = JSON.parse(text);
  const fallback = createDefaultState(auctionDefaults);
  return hydrateState(parsed, fallback);
}

// --- stato del giocatore rispetto all'asta -------------------------------

export function getPlayerStatus(state, playerId) {
  const id = String(playerId);
  if (state.myTeam[id]) return 'mine';
  if (state.takenByOthers[id]) return 'taken';
  if (state.wishlist[id]) return 'wishlist';
  return 'available';
}

// --- mutazioni -------------------------------------------------------------
// Tutte le funzioni sotto mutano `state` in place e si occupano di tenere
// coerenti le tre liste (un giocatore può stare in una sola categoria alla
// volta: mio, preso da altri, o wishlist).

export function setWishlist(state, playerId, { base = null, target = null, priority = 2, nota = '' } = {}) {
  const id = String(playerId);
  const clampedPriority = Math.max(1, Math.min(3, Math.floor(priority)));
  state.wishlist[id] = {
    base: base != null ? Number(base) : null,
    target: target != null ? Number(target) : null,
    priority: clampedPriority,
    nota: String(nota || ''),
  };
}

export function removeFromWishlist(state, playerId) {
  delete state.wishlist[String(playerId)];
}

export function buyForMe(state, playerId, ruolo, costo) {
  const id = String(playerId);
  delete state.wishlist[id];
  delete state.takenByOthers[id];
  state.myTeam[id] = { costo: Number(costo) || 0, ruolo };
}

export function removeFromMyTeam(state, playerId) {
  delete state.myTeam[String(playerId)];
}

export function markTakenByOther(state, playerId, rivalId, costo, ruolo) {
  const id = String(playerId);
  // se il giocatore era in wishlist, lo sposta in lostTargets anziché cancellarlo
  const wishEntry = state.wishlist[id];
  if (wishEntry) {
    state.lostTargets[id] = {
      ...wishEntry,
      rivalId,
      costo: Number(costo) || 0,
      at: new Date().toISOString(),
    };
  }
  delete state.wishlist[id];
  delete state.myTeam[id];
  state.takenByOthers[id] = { rivalId, costo: Number(costo) || 0, ruolo };
}

export function unmarkTakenByOther(state, playerId) {
  delete state.takenByOthers[String(playerId)];
}

export function dismissLostTarget(state, playerId) {
  delete state.lostTargets[String(playerId)];
}

export function clearLostTargets(state) {
  state.lostTargets = {};
}

export function resetPlayer(state, playerId) {
  const id = String(playerId);
  delete state.wishlist[id];
  delete state.myTeam[id];
  delete state.takenByOthers[id];
  delete state.lostTargets[id];
}

export function addRival(state, name, budgetTotale) {
  const id = 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  state.rivals.push({ id, name, budgetTotale: Number(budgetTotale) || 0 });
  return id;
}

export function removeRival(state, rivalId) {
  state.rivals = state.rivals.filter((r) => r.id !== rivalId);
  for (const [pid, entry] of Object.entries(state.takenByOthers)) {
    if (entry.rivalId === rivalId) delete state.takenByOthers[pid];
  }
}

// --- aggregati per il motore d'asta (web/js/auction.js) --------------------

export function squadStatsByRole(state, roles, boardById) {
  const stats = {};
  for (const r of roles) stats[r] = { speso: 0, acquistati: 0 };
  for (const [id, entry] of Object.entries(state.myTeam)) {
    const ruolo = entry.ruolo || (boardById[id] && boardById[id].position);
    if (!ruolo || !stats[ruolo]) continue;
    stats[ruolo].speso += entry.costo;
    stats[ruolo].acquistati += 1;
  }
  return stats;
}
