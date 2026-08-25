// Logica Mantra: ruoli granulari, tabella dei moduli, eleggibilità di un
// giocatore su uno slot e matching rosa→modulo. Funzioni pure, nessun DOM
// e nessuna dipendenza da state.js: come auction.js/plan.js, così i test
// node possono passare oggetti finti.
//
// Ispirato (idee, non codice) da supermik1988/fantacalcio-mantra: quel
// repo è pubblico ma senza licenza, quindi il codice non è riusabile. La
// tabella moduli→ruoli qui sotto è invece il regolamento Mantra di
// fantacalcio.it (un fatto, non espressione creativa) e il matching
// bipartito massimo è un algoritmo classico da manuale: entrambi
// reimplementati da zero.

// I 12 ruoli Mantra. `reparto` mappa sui 4 ruoli classici P/D/C/A, così i
// colori del campo riusano le variabili --role-P/D/C/A già in app.css
// invece di introdurre una seconda palette.
export const MANTRA_ROLES = {
  Por: { label: 'Portiere', reparto: 'P' },
  Dd: { label: 'Difensore destro', reparto: 'D' },
  Dc: { label: 'Difensore centrale', reparto: 'D' },
  Ds: { label: 'Difensore sinistro', reparto: 'D' },
  B: { label: 'Braccetto', reparto: 'D' },
  E: { label: 'Esterno', reparto: 'C' },
  M: { label: 'Mediano', reparto: 'C' },
  C: { label: 'Centrocampista', reparto: 'C' },
  W: { label: 'Ala', reparto: 'A' },
  T: { label: 'Trequartista', reparto: 'A' },
  A: { label: 'Attaccante', reparto: 'A' },
  Pc: { label: 'Punta centrale', reparto: 'A' },
};

const VALID_ROLES = new Set(Object.keys(MANTRA_ROLES));

// "W;A" -> ['W','A']. Nei nostri dati (build_board.py -> position_mantra,
// dal campo Rm dell'Excel quotazioni) il separatore è sempre ';', ma si
// accettano anche ',' e '/' per robustezza su dati importati a mano.
// Valori non riconosciuti vengono scartati: un giocatore senza ruoli
// validi semplicemente non è eleggibile da nessuna parte, senza eccezioni.
export function parseRoles(positionMantra) {
  if (!positionMantra) return [];
  const seen = new Set();
  return String(positionMantra)
    .split(/[;,/|]/)
    .map((r) => r.trim())
    .filter((r) => {
      if (!VALID_ROLES.has(r) || seen.has(r)) return false;
      seen.add(r);
      return true;
    });
}

// Coordinate degli slot: `x` da sinistra a destra, `y` **dal basso**
// (0 = nostra porta, 100 = porta avversaria) così la tabella si legge in
// ordine naturale portiere→attacco. La conversione in `top` avviene una
// volta sola nel renderer (campo.js), non qui.
//
// Gli id hanno un prefisso di linea (p/d/m/t/a) usato da reposition() per
// tenere in campo più giocatori possibile quando si cambia modulo.
//
// Gli slot di ogni linea sono elencati da sinistra a destra (Ds a
// sinistra, Dd a destra: si guarda il campo con la propria squadra che
// attacca verso l'alto).
function slot(id, roles, x, y) {
  return { id, roles, x, y, label: roles.join('/') };
}

const POR = slot('p1', ['Por'], 50, 6);

// difesa a 3: due centrali più un braccetto; difesa a 4: terzini larghi
const DIFESA_3 = [
  slot('d1', ['Dc'], 28, 24),
  slot('d2', ['Dc'], 50, 24),
  slot('d3', ['Dc', 'B'], 72, 24),
];
const DIFESA_4 = [
  slot('d1', ['Ds'], 14, 24),
  slot('d2', ['Dc'], 38, 24),
  slot('d3', ['Dc'], 62, 24),
  slot('d4', ['Dd'], 86, 24),
];

export const MODULES = [
  {
    id: '3-4-3',
    slots: [
      POR, ...DIFESA_3,
      slot('m1', ['E'], 14, 46), slot('m2', ['M', 'C'], 38, 46),
      slot('m3', ['C'], 62, 46), slot('m4', ['E'], 86, 46),
      slot('a1', ['W', 'A'], 22, 80), slot('a2', ['A', 'Pc'], 50, 80),
      slot('a3', ['W', 'A'], 78, 80),
    ],
  },
  {
    id: '3-4-1-2',
    slots: [
      POR, ...DIFESA_3,
      slot('m1', ['E'], 14, 44), slot('m2', ['M', 'C'], 38, 44),
      slot('m3', ['C'], 62, 44), slot('m4', ['E'], 86, 44),
      slot('t1', ['T'], 50, 63),
      slot('a1', ['A', 'Pc'], 36, 82), slot('a2', ['A', 'Pc'], 64, 82),
    ],
  },
  {
    id: '3-4-2-1',
    slots: [
      POR, ...DIFESA_3,
      slot('m1', ['E'], 14, 44), slot('m2', ['M'], 38, 44),
      slot('m3', ['M', 'C'], 62, 44), slot('m4', ['E', 'W'], 86, 44),
      slot('t1', ['T'], 34, 64), slot('t2', ['T', 'A'], 66, 64),
      slot('a1', ['A', 'Pc'], 50, 84),
    ],
  },
  {
    id: '3-5-2',
    slots: [
      POR, ...DIFESA_3,
      slot('m1', ['E', 'W'], 12, 46), slot('m2', ['M', 'C'], 31, 46),
      slot('m3', ['M'], 50, 46), slot('m4', ['C'], 69, 46),
      slot('m5', ['E'], 88, 46),
      slot('a1', ['A', 'Pc'], 36, 82), slot('a2', ['A', 'Pc'], 64, 82),
    ],
  },
  {
    id: '3-5-1-1',
    slots: [
      POR, ...DIFESA_3,
      slot('m1', ['E', 'W'], 12, 44), slot('m2', ['M'], 31, 44),
      slot('m3', ['M'], 50, 44), slot('m4', ['C'], 69, 44),
      slot('m5', ['E', 'W'], 88, 44),
      slot('t1', ['T', 'A'], 50, 66),
      slot('a1', ['A', 'Pc'], 50, 86),
    ],
  },
  {
    id: '4-3-3',
    slots: [
      POR, ...DIFESA_4,
      slot('m1', ['M', 'C'], 25, 46), slot('m2', ['M'], 50, 46),
      slot('m3', ['C'], 75, 46),
      slot('a1', ['W', 'A'], 22, 80), slot('a2', ['A', 'Pc'], 50, 80),
      slot('a3', ['W', 'A'], 78, 80),
    ],
  },
  {
    id: '4-3-1-2',
    slots: [
      POR, ...DIFESA_4,
      slot('m1', ['M', 'C'], 25, 44), slot('m2', ['M'], 50, 44),
      slot('m3', ['C'], 75, 44),
      slot('t1', ['T'], 50, 63),
      slot('a1', ['T', 'A', 'Pc'], 36, 82), slot('a2', ['A', 'Pc'], 64, 82),
    ],
  },
  {
    id: '4-4-2',
    slots: [
      POR, ...DIFESA_4,
      slot('m1', ['E'], 14, 46), slot('m2', ['M', 'C'], 38, 46),
      slot('m3', ['C'], 62, 46), slot('m4', ['E', 'W'], 86, 46),
      slot('a1', ['A', 'Pc'], 36, 82), slot('a2', ['A', 'Pc'], 64, 82),
    ],
  },
  {
    id: '4-1-4-1',
    slots: [
      POR, ...DIFESA_4,
      slot('m1', ['M'], 50, 40),
      slot('t1', ['E', 'W'], 14, 60), slot('t2', ['C', 'T'], 38, 60),
      slot('t3', ['T'], 62, 60), slot('t4', ['W'], 86, 60),
      slot('a1', ['A', 'Pc'], 50, 84),
    ],
  },
  {
    id: '4-4-1-1',
    slots: [
      POR, ...DIFESA_4,
      slot('m1', ['E', 'W'], 14, 44), slot('m2', ['M'], 38, 44),
      slot('m3', ['C'], 62, 44), slot('m4', ['E', 'W'], 86, 44),
      slot('t1', ['T', 'A'], 50, 64),
      slot('a1', ['A', 'Pc'], 50, 85),
    ],
  },
  {
    id: '4-2-3-1',
    slots: [
      POR, ...DIFESA_4,
      slot('m1', ['M'], 35, 42), slot('m2', ['M', 'C'], 65, 42),
      slot('t1', ['W', 'T'], 20, 64), slot('t2', ['T'], 50, 64),
      slot('t3', ['W', 'A'], 80, 64),
      slot('a1', ['A', 'Pc'], 50, 85),
    ],
  },
];

export const DEFAULT_MODULE = '3-5-2';

export function getModule(moduloId) {
  return MODULES.find((m) => m.id === moduloId) || MODULES.find((m) => m.id === DEFAULT_MODULE);
}

// Eleggibilità a RUOLO NATIVO: intersezione secca fra i ruoli del giocatore
// e quelli ammessi dallo slot, senza malus.
//
// Gli adattamenti esistono (vedi ADAPT_BY_SLOT più sotto: un difensore può
// fare il centrocampista con -1), ma restano fuori da qui di proposito: il
// Campo li segnala senza permettere di schierarli, così lo schieramento
// costruito è sempre quello a punteggio pieno.
export function isEligible(player, slot) {
  if (!player || !Array.isArray(player.roles)) return false;
  return player.roles.some((r) => slot.roles.includes(r));
}

// Ruolo con cui il giocatore occupa lo slot (il primo compatibile): serve
// solo a etichettare il dischetto sul campo.
export function occupiedRole(player, slot) {
  if (!player || !Array.isArray(player.roles)) return null;
  return player.roles.find((r) => slot.roles.includes(r)) || null;
}

// Uno slot è "copribile" se ESISTE almeno un giocatore che potrebbe
// giocarci, indipendentemente da chi è schierato ora: è l'informazione
// d'asta più utile (nessuno in rosa può fare quel ruolo → va comprato).
export function isSlotCoverable(slot, players) {
  return players.some((p) => isEligible(p, slot));
}

// --- adattamenti (malus -1) ---------------------------------------------
//
// Dalla "Tabella sostituzioni per schema" ufficiale di fantacalcio.it.
// Chiave: etichetta dello slot. Valore: ruoli che NON sono nativi per quello
// slot ma possono comunque occuparlo pagando un malus di 1 punto.
//
// Sono esclusi di proposito i "-1*" (celle gialle nella tabella): il
// regolamento li vieta in fase di inserimento formazione e li ammette solo
// nel calcolo finale, dopo sostituzioni obbligate non ottimali. Il Campo
// simula proprio l'inserimento formazione, quindi per noi valgono come "no".
//
// La regolarità di fondo è "si adatta in avanti": un difensore può fare il
// centrocampista con -1, il contrario è vietato o solo post-sostituzione.
const ADAPT_BY_SLOT = {
  Por: [],
  Dc: [],
  'Dc/B': [],
  Ds: ['Dc'],
  Dd: ['Dc'],
  E: ['Dd', 'Ds', 'Dc', 'B'],
  M: ['Dd', 'Ds', 'Dc', 'B'],
  'M/C': ['Dd', 'Ds', 'Dc', 'B', 'E'],
  C: ['Dd', 'Ds', 'Dc', 'B', 'E', 'M'],
  'E/W': ['Dd', 'Ds', 'Dc', 'B', 'M', 'C', 'T'],
  T: ['Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C'],
  'T/A': ['Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C', 'W'],
  'W/A': ['Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C', 'T'],
  'A/Pc': ['Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C', 'T', 'W'],
  'T/A/Pc': ['Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C', 'W'],
  'C/T': ['Dd', 'Ds', 'Dc', 'B', 'E', 'M'],
  W: ['Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C'],
  'W/T': ['Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C'],
};

// Eccezioni per modulo (celle "no" in rosso nella tabella). Nel 4-1-4-1 gli
// slot avanzati T e W si rifiutano a vicenda; l'unica differenza pratica
// rispetto alla tabella base è che lì E/W non accetta un T.
const ADAPT_OVERRIDES = {
  '4-1-4-1': { 'E/W': ['Dd', 'Ds', 'Dc', 'B', 'M', 'C'] },
};

// Ruoli che possono occupare lo slot con malus (esclusi quelli nativi).
export function adaptableRoles(moduloId, slot) {
  const override = ADAPT_OVERRIDES[moduloId]?.[slot.label];
  return override || ADAPT_BY_SLOT[slot.label] || [];
}

// Giocatori in rosa che potrebbero coprire lo slot adattandosi (-1).
// Usato per SEGNALARE l'opzione: lo schieramento vero resta a ruolo nativo.
export function adaptCandidates(moduloId, slot, players) {
  const ammessi = adaptableRoles(moduloId, slot);
  if (ammessi.length === 0) return [];
  return players.filter((p) =>
    !isEligible(p, slot) && p.roles.some((r) => ammessi.includes(r)));
}

// Ordine di preferenza deterministico per il matching:
// 1. prima i giocatori già acquistati (un obiettivo wishlist non è ancora tuo)
// 2. poi i più costosi (di norma i titolari veri)
// 3. poi i MENO polivalenti: i jolly restano liberi per gli slot difficili
// 4. infine per id, così il risultato è stabile fra un render e l'altro
function byPreference(a, b) {
  if (!!b.owned !== !!a.owned) return b.owned ? 1 : -1;
  const priceDiff = (b.price || 0) - (a.price || 0);
  if (priceDiff !== 0) return priceDiff;
  const rolesDiff = a.roles.length - b.roles.length;
  if (rolesDiff !== 0) return rolesDiff;
  return String(a.id).localeCompare(String(b.id));
}

// Matching bipartito massimo (algoritmo di Kuhn a cammini aumentanti).
//
// Perché non basta un'assegnazione avida: con ruoli multipli (257
// giocatori su 515 nei nostri dati) l'avidità SOTTOSTIMA la copertura —
// piazza un jolly sul primo slot che capita e lascia scoperto uno slot che
// solo lui poteva coprire. Il cammino aumentante rimedia spostando le
// assegnazioni già fatte quando serve.
//
// `seed` (slotId -> playerId) è un insieme di scelte manuali da rispettare:
// chi è nel seed resta sempre in campo, ma può essere spostato di slot se
// questo permette di coprirne di più.
export function maxMatching(players, modulo, { seed = {} } = {}) {
  const slots = modulo.slots;
  const byId = new Map(players.map((p) => [String(p.id), p]));
  const assignment = {}; // slotId -> playerId

  // il seed entra come matching di partenza, scartando le voci non più valide
  const seeded = new Set();
  for (const s of slots) {
    const pid = seed[s.id] != null ? String(seed[s.id]) : null;
    const player = pid ? byId.get(pid) : null;
    if (player && isEligible(player, s) && !seeded.has(pid)) {
      assignment[s.id] = pid;
      seeded.add(pid);
    }
  }

  const tryAssign = (player, visited) => {
    for (const s of slots) {
      if (visited.has(s.id) || !isEligible(player, s)) continue;
      visited.add(s.id);
      const occupantId = assignment[s.id];
      if (occupantId == null || tryAssign(byId.get(occupantId), visited)) {
        assignment[s.id] = String(player.id);
        return true;
      }
    }
    return false;
  };

  for (const player of [...players].sort(byPreference)) {
    if (seeded.has(String(player.id))) continue;
    tryAssign(player, new Set());
  }
  return assignment;
}

export function countFilled(assignment) {
  return Object.values(assignment).filter((v) => v != null).length;
}

// Classifica dei moduli per copertura: quanti degli 11 slot la rosa
// riesce a riempire. Ordinata dal più coperto, tie-break sull'ordine
// canonico di MODULES per stabilità.
export function rankModules(players) {
  return MODULES.map((modulo, index) => ({
    id: modulo.id,
    coperti: countFilled(maxMatching(players, modulo)),
    totale: modulo.slots.length,
    index,
  })).sort((a, b) => (b.coperti - a.coperti) || (a.index - b.index));
}

// "1 Ds, 1 W/A": riepilogo aggregato degli slot rimasti vuoti.
export function uncoveredSummary(modulo, assignment) {
  const counts = new Map();
  for (const s of modulo.slots) {
    if (assignment[s.id] != null) continue;
    counts.set(s.label, (counts.get(s.label) || 0) + 1);
  }
  return [...counts.entries()].map(([label, n]) => `${n} ${label}`).join(', ');
}

const lineOf = (slotId) => String(slotId).charAt(0);

// Cambio modulo: tiene in campo più giocatori possibile invece di
// svuotare tutto. Tre passate, dalla più conservativa alla più libera:
// stesso id di slot, poi stessa linea di gioco, poi matching massimo fra
// i soli già schierati. Ritorna anche chi non ha trovato posto, per
// poterlo dire all'utente.
export function reposition(fromAssignment, toModulo, players) {
  const byId = new Map(players.map((p) => [String(p.id), p]));
  const deployed = Object.values(fromAssignment)
    .filter((pid) => pid != null && byId.has(String(pid)))
    .map((pid) => String(pid));

  const next = {};
  const placed = new Set();

  // 1. stesso id di slot (es. d2 -> d2)
  for (const s of toModulo.slots) {
    const pid = fromAssignment[s.id] != null ? String(fromAssignment[s.id]) : null;
    const player = pid ? byId.get(pid) : null;
    if (player && isEligible(player, s) && !placed.has(pid)) {
      next[s.id] = pid;
      placed.add(pid);
    }
  }

  // 2. stessa linea di gioco (un difensore resta in difesa)
  for (const s of toModulo.slots) {
    if (next[s.id] != null) continue;
    const candidate = deployed.find((pid) => {
      if (placed.has(pid)) return false;
      const fromSlotId = Object.keys(fromAssignment).find((k) => String(fromAssignment[k]) === pid);
      return fromSlotId && lineOf(fromSlotId) === lineOf(s.id) && isEligible(byId.get(pid), s);
    });
    if (candidate) {
      next[s.id] = candidate;
      placed.add(candidate);
    }
  }

  // 3. matching massimo sui soli già schierati, col risultato sopra come seme
  const stillDeployed = deployed.map((pid) => byId.get(pid));
  const finalAssignment = maxMatching(stillDeployed, toModulo, { seed: next });

  const kept = new Set(Object.values(finalAssignment).map((v) => String(v)));
  const inPanchina = deployed.filter((pid) => !kept.has(pid));
  return { schieramento: finalAssignment, inPanchina };
}
