// Test dello storico quotazioni (web/js/history.js): delta a 7 giorni e
// classifica dei movimenti.
// Esegui con: node --test tests/history.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { delta7d, topMovements } from '../web/js/history.js';

function series(pairs) {
  // pairs: [[date, qt_att, fvm], ...]
  return pairs;
}

test('delta7d: null se la serie ha meno di 2 punti', () => {
  const history = { '1': series([['2026-08-18', 10, 100]]) };
  assert.equal(delta7d(history, '1'), null);
});

test('delta7d: null se lo storico copre meno di 7 giorni (niente confronti fuorvianti)', () => {
  const history = { '1': series([['2026-08-17', 10, 100], ['2026-08-18', 12, 105]]) };
  assert.equal(delta7d(history, '1'), null);
});

test('delta7d: calcola la variazione usando il punto più vicino a 7 giorni fa', () => {
  const history = {
    '1': series([
      ['2026-08-01', 10, 100],
      ['2026-08-08', 11, 102],  // esattamente 7 giorni prima dell'ultimo punto
      ['2026-08-10', 14, 110],  // 2 giorni prima, troppo recente per essere il riferimento
      ['2026-08-15', 16, 120],  // ultimo punto
    ]),
  };
  const d = delta7d(history, '1');
  assert.ok(d);
  assert.equal(d.from, '2026-08-08');
  assert.equal(d.to, '2026-08-15');
  assert.equal(d.deltaQt, 16 - 11);
  assert.equal(d.deltaFvm, 120 - 102);
});

test('delta7d: con storico lungo prende il punto valido più recente (non il più vecchio in assoluto)', () => {
  const history = {
    '1': series([
      ['2026-07-01', 5, 50],   // molto vecchio: non deve essere scelto come riferimento
      ['2026-08-05', 9, 90],   // 10 giorni prima dell'ultimo: valido (>=7gg) e più recente del precedente
      ['2026-08-15', 16, 120], // ultimo punto
    ]),
  };
  const d = delta7d(history, '1');
  assert.equal(d.from, '2026-08-05');
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
