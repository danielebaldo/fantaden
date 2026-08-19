// Test del motore budget d'asta (web/js/auction.js).
// Esegui con: node --test tests/auction.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeAuctionState, computeRivalBudget } from '../web/js/auction.js';

const ROLES = ['P', 'D', 'C', 'A'];
const ROLE_CONFIG = {
  P: { max: 3, perc: 8 },
  D: { max: 8, perc: 16 },
  C: { max: 8, perc: 26 },
  A: { max: 6, perc: 50 },
};
const EMPTY_SQUAD = { P: { speso: 0, acquistati: 0 }, D: { speso: 0, acquistati: 0 }, C: { speso: 0, acquistati: 0 }, A: { speso: 0, acquistati: 0 } };

test('rosa vuota: budgetDinamico coincide con budgetBase e percOk è true', () => {
  const result = computeAuctionState(500, ROLES, ROLE_CONFIG, EMPTY_SQUAD);
  assert.equal(result.percOk, true);
  assert.equal(result.cassaGlobale, 500);
  assert.equal(result.tesoretto, 0);
  assert.equal(result.perRole.A.budgetDinamico, 250); // 500 * 50%
  assert.equal(result.perRole.P.budgetDinamico, 40);  // 500 * 8%
});

test('percOk è false se le percentuali non sommano a 100', () => {
  const cfg = { ...ROLE_CONFIG, A: { max: 6, perc: 40 } }; // 8+16+26+40 = 90
  const result = computeAuctionState(500, ROLES, cfg, EMPTY_SQUAD);
  assert.equal(result.sumPerc, 90);
  assert.equal(result.percOk, false);
});

test('reparto completato sotto budget versa il surplus nel tesoretto', () => {
  // Portieri: budget base 40, ne compro 3 (max) a 10 totali -> surplus 30 va agli altri reparti
  const squad = {
    ...EMPTY_SQUAD,
    P: { speso: 10, acquistati: 3 },
  };
  const result = computeAuctionState(500, ROLES, ROLE_CONFIG, squad);
  assert.equal(result.perRole.P.completato, true);
  assert.equal(result.perRole.P.budgetDinamico, 10); // congelato allo speso
  assert.equal(result.tesoretto, 30);
  // il tesoretto (30) va redistribuito pro-quota su D+C+A (percentuali 16+26+50=92)
  const atteso_D = 80 + 30 * (16 / 92); // budgetBase D = 500*16% = 80
  assert.ok(Math.abs(result.perRole.D.budgetDinamico - atteso_D) < 1e-9);
});

test('reparto sforato (fabbisogno minimo > budget base) sottrae risorse al tesoretto', () => {
  // Portieri: budget base 40, ne ho preso 1 a 45 crediti, mancano 2 -> fabbisogno minimo 47 > 40
  const squad = {
    ...EMPTY_SQUAD,
    P: { speso: 45, acquistati: 1 },
  };
  const result = computeAuctionState(500, ROLES, ROLE_CONFIG, squad);
  assert.equal(result.perRole.P.inDeficit, true);
  assert.equal(result.perRole.P.fabbisognoMinimo, 47); // 45 + 2 mancanti
  assert.equal(result.perRole.P.budgetDinamico, 47);
  assert.equal(result.tesoretto, 40 - 47); // -7, sottratto agli altri reparti
});

test('Max Strategica e Max ALL-IN su rosa parzialmente completata', () => {
  // Attaccanti: budgetBase 250, comprato 1 a 100, mancano 5
  const squad = { ...EMPTY_SQUAD, A: { speso: 100, acquistati: 1 } };
  const result = computeAuctionState(500, ROLES, ROLE_CONFIG, squad);
  const a = result.perRole.A;
  const disponibile = a.budgetDinamico - a.speso;
  assert.equal(a.mancanti, 5);
  assert.ok(Math.abs(a.maxStrategica - (disponibile - 5 + 1)) < 1e-9);
  // Max ALL-IN globale: cassaGlobale - mancantiTotaliGlobali + 1
  const attesoAllIn = Math.max(0, result.cassaGlobale - result.mancantiTotaliGlobali + 1);
  assert.ok(Math.abs(a.maxAllIn - attesoAllIn) < 1e-9);
});

test('reparto completo (mancanti=0) ha Max Strategica e Max ALL-IN a zero', () => {
  const squad = { ...EMPTY_SQUAD, P: { speso: 40, acquistati: 3 } };
  const result = computeAuctionState(500, ROLES, ROLE_CONFIG, squad);
  assert.equal(result.perRole.P.maxStrategica, 0);
  assert.equal(result.perRole.P.maxAllIn, 0);
});

test('salvavita: il budget dinamico non scende mai sotto il fabbisogno minimo', () => {
  // Uno sforamento enorme in un reparto piccolo che erode tutto il tesoretto
  // non deve mai far scendere gli altri reparti sotto il loro fabbisogno minimo.
  const squad = {
    P: { speso: 200, acquistati: 1 }, // sforamento gigante: fabbisogno 202 vs budgetBase 40
    D: { speso: 0, acquistati: 0 },
    C: { speso: 0, acquistati: 0 },
    A: { speso: 0, acquistati: 0 },
  };
  const result = computeAuctionState(500, ROLES, ROLE_CONFIG, squad);
  for (const r of ['D', 'C', 'A']) {
    const s = result.perRole[r];
    assert.ok(s.budgetDinamico >= s.fabbisognoMinimo - 1e-9,
      `${r}: budgetDinamico ${s.budgetDinamico} < fabbisognoMinimo ${s.fabbisognoMinimo}`);
  }
});

test('cassaGlobale scala con la spesa totale su tutti i reparti', () => {
  const squad = {
    P: { speso: 10, acquistati: 1 },
    D: { speso: 20, acquistati: 1 },
    C: { speso: 30, acquistati: 1 },
    A: { speso: 40, acquistati: 1 },
  };
  const result = computeAuctionState(500, ROLES, ROLE_CONFIG, squad);
  assert.equal(result.cassaGlobale, 500 - 100);
});

// --- computeRivalBudget ---

test('computeRivalBudget: rosa vuota, teorica = residuo - mancanti + 1', () => {
  const { residuo, mancanti, maxTeorica } = computeRivalBudget(500, 0, 25, 0);
  assert.equal(residuo, 500);
  assert.equal(mancanti, 25);
  assert.equal(maxTeorica, 500 - 25 + 1);
});

test('computeRivalBudget: rosa completa, teorica = residuo intero', () => {
  const { mancanti, maxTeorica } = computeRivalBudget(500, 480, 25, 25);
  assert.equal(mancanti, 0);
  assert.equal(maxTeorica, 20);
});

test('computeRivalBudget: non scende mai sotto zero', () => {
  const { maxTeorica } = computeRivalBudget(100, 95, 25, 0);
  assert.equal(maxTeorica, 0);
});
