// Test dei filtri del listone (web/js/board.js). Nato con il filtro per
// ruolo Mantra, copre anche i filtri preesistenti che finora non avevano
// test pur essendo il cuore della tabella.
// Esegui con: node --test tests/board.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterAndSortPlayers, mantraRoleOptions } from '../web/js/board.js';
import { ALL_ROLES_TAB } from '../web/js/state.js';

// board minima ma realistica: include i polivalenti che sconfinano fra
// reparti classici (un difensore che sa fare E, un centrocampista che sa
// fare A), il caso vero dei nostri dati
const BOARD = [
  { id: 1, name: 'Butez', team: 'Como', position: 'P', position_mantra: 'Por', fascia: 'Top', fvm: 56, rigorista: false },
  { id: 2, name: 'Mancini', team: 'Roma', position: 'D', position_mantra: 'Dc', fascia: 'Top', fvm: 40, rigorista: false },
  { id: 3, name: 'Spinazzola', team: 'Napoli', position: 'D', position_mantra: 'Ds;E', fascia: '1a Fascia', fvm: 30, rigorista: false },
  { id: 4, name: 'Di Lorenzo', team: 'Napoli', position: 'D', position_mantra: 'Dd;E', fascia: '1a Fascia', fvm: 28, rigorista: false },
  { id: 5, name: 'Calhanoglu', team: 'Inter', position: 'C', position_mantra: 'M;C', fascia: 'Top', fvm: 60, rigorista: true },
  { id: 6, name: 'Orsolini', team: 'Bologna', position: 'C', position_mantra: 'W;A', fascia: 'Top', fvm: 50, rigorista: false },
  { id: 7, name: 'Martinez L.', team: 'Inter', position: 'A', position_mantra: 'Pc', fascia: 'Top', fvm: 90, rigorista: false },
];

function makeState(ui = {}) {
  return {
    myTeam: {}, wishlist: {}, takenByOthers: {},
    ui: {
      search: '', fasciaFilter: 'all', mantraFilter: 'all',
      onlyAvailable: false, onlyWishlist: false, onlyRigoristi: false,
      sortBy: 'fvm', sortDir: 'desc',
      ...ui,
    },
  };
}
const names = (rows) => rows.map((p) => p.name).sort();

// ---------------------------------------------------------------------------
// filtro per ruolo Mantra
// ---------------------------------------------------------------------------

test("'all' non filtra nulla: restano tutti i giocatori del macro ruolo", () => {
  const rows = filterAndSortPlayers(BOARD, makeState(), 'D', {});
  assert.deepEqual(names(rows), ['Di Lorenzo', 'Mancini', 'Spinazzola']);
});

test('un polivalente esce per OGNI suo ruolo, non solo per il primo', () => {
  // Spinazzola è "Ds;E": deve comparire sia filtrando Ds sia filtrando E
  const perDs = filterAndSortPlayers(BOARD, makeState({ mantraFilter: 'Ds' }), 'D', {});
  assert.deepEqual(names(perDs), ['Spinazzola']);
  const perE = filterAndSortPlayers(BOARD, makeState({ mantraFilter: 'E' }), 'D', {});
  assert.deepEqual(names(perE), ['Di Lorenzo', 'Spinazzola']);
});

test('il filtro Mantra non scavalca il macro ruolo attivo', () => {
  // Orsolini è "W;A" ma è un centrocampista: sul tab Attaccanti non deve uscire
  const suA = filterAndSortPlayers(BOARD, makeState({ mantraFilter: 'A' }), 'A', {});
  assert.deepEqual(names(suA), []);
  const suC = filterAndSortPlayers(BOARD, makeState({ mantraFilter: 'A' }), 'C', {});
  assert.deepEqual(names(suC), ['Orsolini']);
});

test('sul tab "tutti i ruoli" il filtro Mantra pesca in tutta la board', () => {
  const rows = filterAndSortPlayers(BOARD, makeState({ mantraFilter: 'E' }), ALL_ROLES_TAB, {});
  assert.deepEqual(names(rows), ['Di Lorenzo', 'Spinazzola']);
});

test('un ruolo Mantra senza giocatori dà zero righe, senza eccezioni', () => {
  const rows = filterAndSortPlayers(BOARD, makeState({ mantraFilter: 'B' }), 'D', {});
  assert.deepEqual(rows, []);
});

test('il filtro Mantra si combina con ricerca, fascia e solo-rigoristi', () => {
  const conRicerca = filterAndSortPlayers(
    BOARD, makeState({ mantraFilter: 'E', search: 'spina' }), 'D', {});
  assert.deepEqual(names(conRicerca), ['Spinazzola']);

  const conFascia = filterAndSortPlayers(
    BOARD, makeState({ mantraFilter: 'E', fasciaFilter: '1a Fascia' }), 'D', {});
  assert.deepEqual(names(conFascia), ['Di Lorenzo', 'Spinazzola']);

  const conRigoristi = filterAndSortPlayers(
    BOARD, makeState({ mantraFilter: 'M', onlyRigoristi: true }), 'C', {});
  assert.deepEqual(names(conRigoristi), ['Calhanoglu']);
});

// ---------------------------------------------------------------------------
// opzioni contestuali del filtro
// ---------------------------------------------------------------------------

test('mantraRoleOptions propone solo i ruoli presenti in quel macro ruolo', () => {
  const perD = mantraRoleOptions(BOARD, 'D').map((o) => o.value);
  assert.deepEqual(perD, ['Dd', 'Dc', 'Ds', 'E']); // ordine canonico, non alfabetico
  const perP = mantraRoleOptions(BOARD, 'P').map((o) => o.value);
  assert.deepEqual(perP, ['Por']); // niente voci morte sul tab Portieri
});

test('mantraRoleOptions conta i giocatori, contando i polivalenti in ogni ruolo', () => {
  const perD = mantraRoleOptions(BOARD, 'D');
  const byValue = Object.fromEntries(perD.map((o) => [o.value, o.count]));
  assert.equal(byValue.Dc, 1);
  assert.equal(byValue.E, 2); // Spinazzola + Di Lorenzo
  assert.equal(byValue.Ds, 1);
});

test('mantraRoleOptions include il reparto, per raggruppare le opzioni', () => {
  const perD = mantraRoleOptions(BOARD, 'D');
  const e = perD.find((o) => o.value === 'E');
  assert.equal(e.reparto, 'C'); // E è un ruolo di centrocampo, pur essendo di difensori
  assert.equal(perD.find((o) => o.value === 'Dc').reparto, 'D');
});

test('mantraRoleOptions sul sentinel copre tutta la board', () => {
  const tutti = mantraRoleOptions(BOARD, ALL_ROLES_TAB).map((o) => o.value);
  assert.deepEqual(tutti, ['Por', 'Dd', 'Dc', 'Ds', 'E', 'M', 'C', 'W', 'A', 'Pc']);
});

test('mantraRoleOptions su board vuota non esplode', () => {
  assert.deepEqual(mantraRoleOptions([], 'D'), []);
});
