// Test dello storico quotazioni (web/js/history.js): delta nella finestra
// recente (3 giorni) e classifica dei movimenti.
// Esegui con: node --test tests/history.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deltaRecent, topMovements, MOVEMENT_WINDOW_DAYS } from '../web/js/history.js';

function series(pairs) {
  // pairs: [[date, qt_att, fvm], ...]
  return pairs;
}

test('MOVEMENT_WINDOW_DAYS: finestra impostata a 3 giorni', () => {
  assert.equal(MOVEMENT_WINDOW_DAYS, 3);
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
      ['2026-08-12', 11, 102],  // esattamente 3 giorni prima dell'ultimo punto
      ['2026-08-14', 14, 110],  // 1 giorno prima, troppo recente per essere il riferimento
      ['2026-08-15', 16, 120],  // ultimo punto
    ]),
  };
  const d = deltaRecent(history, '1');
  assert.ok(d);
  assert.equal(d.from, '2026-08-12');
  assert.equal(d.to, '2026-08-15');
  assert.equal(d.deltaQt, 16 - 11);
  assert.equal(d.deltaFvm, 120 - 102);
});

test('deltaRecent: con storico lungo prende il punto valido più recente (non il più vecchio in assoluto)', () => {
  const history = {
    '1': series([
      ['2026-07-01', 5, 50],   // molto vecchio: non deve essere scelto come riferimento
      ['2026-08-10', 9, 90],   // 5 giorni prima dell'ultimo: valido (>=3gg) e più recente del precedente
      ['2026-08-15', 16, 120], // ultimo punto
    ]),
  };
  const d = deltaRecent(history, '1');
  assert.equal(d.from, '2026-08-10');
  assert.equal(d.deltaQt, 16 - 9);
});

test('topMovements: ordina rialzi e ribassi ed esclude i delta zero', () => {
  const history = {
    '1': series([['2026-08-12', 10, 100], ['2026-08-15', 15, 100]]), // +5
    '2': series([['2026-08-12', 20, 100], ['2026-08-15', 12, 100]]), // -8
    '3': series([['2026-08-12', 30, 100], ['2026-08-15', 30, 100]]), // 0, escluso
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
