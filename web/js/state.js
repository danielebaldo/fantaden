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
    wishlist: {},       // playerId -> { base, target }
    takenByOthers: {},  // playerId -> { rivalId, costo, ruolo }
    ui: {
      activeTab: 'P',
      rosterTab: 'mia', // 'mia' | 'rivali'
      search: '',
      fasciaFilter: 'all',
      onlyAvailable: false,
      onlyWishlist: false,
      sortBy: 'fvm',
      sortDir: 'desc',
    },
  };
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
    // merge superficiale per tollerare campi nuovi aggiunti in versioni successive
    return {
      ...fallback,
      ...parsed,
      auction: { ...fallback.auction, ...(parsed.auction || {}) },
      ui: { ...fallback.ui, ...(parsed.ui || {}) },
    };
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
  return {
    ...fallback,
    ...parsed,
    auction: { ...fallback.auction, ...(parsed.auction || {}) },
    ui: { ...fallback.ui, ...(parsed.ui || {}) },
  };
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

export function setWishlist(state, playerId, { base = null, target = null } = {}) {
  const id = String(playerId);
  state.wishlist[id] = { base, target };
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
  delete state.wishlist[id];
  delete state.myTeam[id];
  state.takenByOthers[id] = { rivalId, costo: Number(costo) || 0, ruolo };
}

export function unmarkTakenByOther(state, playerId) {
  delete state.takenByOthers[String(playerId)];
}

export function resetPlayer(state, playerId) {
  const id = String(playerId);
  delete state.wishlist[id];
  delete state.myTeam[id];
  delete state.takenByOthers[id];
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
