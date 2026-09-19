// Test dello storico quotazioni (web/js/history.js): delta nella finestra
// recente (7 giorni) e classifica dei movimenti.
// Esegui con: node --test tests/history.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deltaRecent, topMovements, deltaSeason, topMovementsSeason, sparklineSVG, MOVEMENT_WINDOW_DAYS } from '../web/js/history.js';

function series(pairs) {
  // pairs: [[date, qt_att, fvm], ...]
  return pairs;
}

test('MOVEMENT_WINDOW_DAYS: finestra impostata a 7 giorni', () => {
  assert.equal(MOVEMENT_WINDOW_DAYS, 7);
});

test('deltaRecent: null se la serie ha meno di 2 punti', () => {
  const history = { '1': series([['2026-08-18', 10, 100]]) };
  assert.equal(deltaRecent(history, '1'), null);
});

test('deltaRecent: null se lo storico copre meno della finestra (niente confronti fuorvianti)', () => {
  const history = { '1': series([['2026-08-17', 10, 100], ['2026-08-18', 12, 105]]) };
  assert.equal(deltaRecent(history, '1'), null);
});

test('deltaRecent: calcola la variazione usando il punto più vicino all\'inizio della finestra', () => {
  const history = {
    '1': series([
      ['2026-08-01', 10, 100],
      ['2026-08-08', 11, 102],  // esattamente 7 giorni prima dell'ultimo punto
      ['2026-08-12', 14, 110],  // 3 giorni prima, troppo recente per essere il riferimento
      ['2026-08-15', 16, 120],  // ultimo punto
    ]),
  };
  const d = deltaRecent(history, '1');
  assert.ok(d);
  assert.equal(d.from, '2026-08-08');
  assert.equal(d.to, '2026-08-15');
  assert.equal(d.deltaQt, 16 - 11);
  assert.equal(d.deltaFvm, 120 - 102);
});

test('deltaRecent: con storico lungo prende il punto valido più recente (non il più vecchio in assoluto)', () => {
  const history = {
    '1': series([
      ['2026-07-01', 5, 50],   // molto vecchio: non deve essere scelto come riferimento
      ['2026-08-07', 9, 90],   // 8 giorni prima dell'ultimo: valido (>=7gg) e più recente del precedente
      ['2026-08-15', 16, 120], // ultimo punto
    ]),
  };
  const d = deltaRecent(history, '1');
  assert.equal(d.from, '2026-08-07');
  assert.equal(d.deltaQt, 16 - 9);
});

test('topMovements: ordina rialzi e ribassi ed esclude i delta zero', () => {
  const history = {
    '1': series([['2026-08-08', 10, 100], ['2026-08-15', 15, 100]]), // +5
    '2': series([['2026-08-08', 20, 100], ['2026-08-15', 12, 100]]), // -8
    '3': series([['2026-08-08', 30, 100], ['2026-08-15', 30, 100]]), // 0, escluso
  };
  const players = [
    { id: '1', name: 'A' },
    { id: '2', name: 'B' },
    { id: '3', name: 'C' },
  ];
  const { rialzi, ribassi } = topMovements(history, players, 5);
  assert.equal(rialzi.length, 1);
  assert.equal(rialzi[0].player.name, 'A');
  assert.equal(ribassi.length, 1);
  assert.equal(ribassi[0].player.name, 'B');
});

test('deltaSeason: null se la serie ha meno di 2 punti', () => {
  const history = { '1': series([['2026-08-18', 10, 100]]) };
  assert.equal(deltaSeason(history, '1'), null);
});

test('deltaSeason: confronta il primo e l\'ultimo punto della serie, non una finestra fissa', () => {
  const history = {
    '1': series([
      ['2026-08-19', 30, 300], // primo giorno tracciato
      ['2026-08-25', 32, 310],
      ['2026-09-18', 25, 260], // ultimo giorno disponibile
    ]),
  };
  const d = deltaSeason(history, '1');
  assert.equal(d.from, '2026-08-19');
  assert.equal(d.to, '2026-09-18');
  assert.equal(d.deltaQt, 25 - 30);
  assert.equal(d.deltaFvm, 260 - 300);
});

test('deltaSeason: un nuovo tesserato con storico corto usa comunque il suo primo punto', () => {
  // arrivato a stagione iniziata: la serie parte tardi, non deve tornare null
  // solo perché è più corta di quella degli altri giocatori
  const history = { '1': series([['2026-09-10', 8, 80], ['2026-09-18', 10, 95]]) };
  const d = deltaSeason(history, '1');
  assert.equal(d.from, '2026-09-10');
  assert.equal(d.deltaQt, 2);
});

test('topMovementsSeason: usa l\'intero storico invece della finestra recente', () => {
  const history = {
    // grande salita in stagione ma stabile nella finestra recente (7gg): solo
    // topMovementsSeason deve vederla, topMovements no
    '1': series([['2026-08-19', 10, 100], ['2026-09-08', 20, 200], ['2026-09-16', 20, 200], ['2026-09-18', 20, 200]]),
  };
  const players = [{ id: '1', name: 'A' }];
  assert.equal(topMovements(history, players, 5).rialzi.length, 0);
  const { rialzi } = topMovementsSeason(history, players, 5);
  assert.equal(rialzi.length, 1);
  assert.equal(rialzi[0].deltaQt, 10);
});

test('sparklineSVG: usa l\'intera serie disponibile, non solo gli ultimi 14 punti', () => {
  const long = Array.from({ length: 20 }, (_, i) => [`2026-01-${String(1 + i).padStart(2, '0')}`, 10 + i, 100]);
  const history = { '1': long };
  const svg = sparklineSVG(history, '1');
  const match = svg.match(/points="([^"]+)"/);
  assert.ok(match);
  assert.equal(match[1].trim().split(' ').length, 20);
});
