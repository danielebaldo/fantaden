import { test, beforeEach } from 'node:test';
import { deepEqual, equal } from 'node:assert';
import {
  findAlternatives,
  computeWishlistCoveragePerRole,
  computeWishlistCoverage,
} from '../web/js/plan.js';

const BOARD = [
  { id: 1, position: 'D', fascia: 'Top', score: 85, fvm: 50, no_stats: false },
  { id: 2, position: 'D', fascia: '1a Fascia', score: 72, fvm: 35, no_stats: false },
  { id: 3, position: 'D', fascia: '1a Fascia', score: 68, fvm: 32, no_stats: false },
  { id: 4, position: 'D', fascia: '2a Fascia', score: 60, fvm: 25, no_stats: false },
  { id: 5, position: 'D', fascia: 'Low Cost', score: 45, fvm: 12, no_stats: false },
  { id: 6, position: 'C', fascia: 'Top', score: 82, fvm: 48, no_stats: false },
  { id: 7, position: 'A', fascia: '1a Fascia', score: 75, fvm: 38, no_stats: false },
];

const FASCIA_ORDER = ['Top', '1a Fascia', '2a Fascia', '3a Fascia', 'Low Cost', 'Scommessa'];

test('findAlternatives: stessi ruolo, status disponibile', () => {
  const player = BOARD[0]; // id 1, D, Top
  const statusOf = (id) => (id === 1 ? 'available' : 'available');

  const alternatives = findAlternatives(player, BOARD, statusOf, { fasciaOrder: FASCIA_ORDER });

  equal(alternatives.length > 0, true, 'deve trovare almeno una alternativa');
  equal(alternatives[0].player.position, 'D', 'stesso ruolo');
  equal(alternatives.every((a) => a.player.id !== player.id), true, 'non include sé stesso');
});

test('findAlternatives: esclude preso da me e preso da altri', () => {
  const player = BOARD[0];
  const statusOf = (id) => {
    if (id === 2) return 'mine';
    if (id === 3) return 'taken';
    return 'available';
  };

  const alternatives = findAlternatives(player, BOARD, statusOf, { limit: 5, fasciaOrder: FASCIA_ORDER });

  equal(alternatives.every((a) => a.player.id !== 2 && a.player.id !== 3), true, 'esclude mine e taken');
});

test('findAlternatives: distanza di fascia', () => {
  const player = BOARD[0]; // Top
  const statusOf = () => 'available';

  const alternatives = findAlternatives(player, BOARD, statusOf, {
    maxFasciaDistance: 1,
    fasciaOrder: FASCIA_ORDER,
  });

  equal(alternatives.every((a) => {
    const idx = FASCIA_ORDER.indexOf(a.player.fascia);
    const playerIdx = FASCIA_ORDER.indexOf(player.fascia);
    return Math.abs(idx - playerIdx) <= 1;
  }), true, 'rispetta maxFasciaDistance');
});

test('findAlternatives: ordinamento per score', () => {
  const player = BOARD[0]; // score 85
  const statusOf = () => 'available';

  const alternatives = findAlternatives(player, BOARD, statusOf, {
    limit: 10,
    fasciaOrder: FASCIA_ORDER,
  });

  // scorDeltaScore deve essere crescente
  for (let i = 1; i < alternatives.length; i++) {
    equal(
      alternatives[i].deltaScore >= alternatives[i - 1].deltaScore,
      true,
      `score distanza crescente: ${alternatives[i - 1].deltaScore} <= ${alternatives[i].deltaScore}`
    );
  }
});

test('computeWishlistCoveragePerRole: reparto vuoto', () => {
  const roleInfo = { mancanti: 3, disponibile: 75, budgetDinamico: 75 };
  const wishlist = [];

  const coverage = computeWishlistCoveragePerRole('D', roleInfo, wishlist);

  equal(coverage.copertura, 'vuoto', 'no objectives = empty');
  equal(coverage.obiettiviDisponibili, 0);
});

test('computeWishlistCoveragePerRole: copertura esatta', () => {
  const roleInfo = { mancanti: 3, disponibile: 75, budgetDinamico: 75 };
  const wishlist = [
    { id: '1', position: 'D', target: 25, priority: 1, fascia: 'Top', status: 'available' },
    { id: '2', position: 'D', target: 25, priority: 2, fascia: '1a Fascia', status: 'available' },
    { id: '3', position: 'D', target: 25, priority: 3, fascia: '2a Fascia', status: 'available' },
  ];

  const coverage = computeWishlistCoveragePerRole('D', roleInfo, wishlist);

  equal(coverage.copertura, 'stretto', 'esattamente coperto');
  equal(coverage.delta, 0);
  equal(coverage.costoTargetPiano, 75);
});

test('computeWishlistCoveragePerRole: sfondamento', () => {
  const roleInfo = { mancanti: 3, disponibile: 50, budgetDinamico: 50 };
  const wishlist = [
    { id: '1', position: 'D', target: 30, priority: 1, fascia: 'Top', status: 'available' },
    { id: '2', position: 'D', target: 30, priority: 2, fascia: '1a Fascia', status: 'available' },
    { id: '3', position: 'D', target: 30, priority: 3, fascia: '2a Fascia', status: 'available' },
  ];

  const coverage = computeWishlistCoveragePerRole('D', roleInfo, wishlist);

  equal(coverage.copertura, 'sfondamento');
  equal(coverage.sfondamento, true);
  equal(coverage.delta < 0, true);
});

test('computeWishlistCoveragePerRole: slot scoperti', () => {
  const roleInfo = { mancanti: 5, disponibile: 100, budgetDinamico: 100 };
  const wishlist = [
    { id: '1', position: 'D', target: 30, priority: 1, fascia: 'Top', status: 'available' },
    { id: '2', position: 'D', target: 30, priority: 2, fascia: '1a Fascia', status: 'available' },
  ];

  const coverage = computeWishlistCoveragePerRole('D', roleInfo, wishlist);

  equal(coverage.copertura, 'scoperto');
  equal(coverage.slotScoperti, 3);
});

test('computeWishlistCoveragePerRole: concentrazione di fascia', () => {
  const roleInfo = { mancanti: 3, disponibile: 100, budgetDinamico: 100 };
  const wishlist = [
    { id: '1', position: 'D', target: 25, priority: 1, fascia: 'Top', status: 'available' },
    { id: '2', position: 'D', target: 25, priority: 2, fascia: 'Top', status: 'available' },
    { id: '3', position: 'D', target: 25, priority: 3, fascia: 'Top', status: 'available' },
  ];

  const coverage = computeWishlistCoveragePerRole('D', roleInfo, wishlist);

  equal(coverage.concentrazioneFascia !== null, true, 'rileva concentrazione');
  equal(coverage.concentrazioneFascia.label, 'Top');
  equal(coverage.concentrazioneFascia.quota, '100'); // 3/3 = 100%
});

test('computeWishlistCoveragePerRole: ordinamento per priorità', () => {
  const roleInfo = { mancanti: 3, disponibile: 100, budgetDinamico: 100 };
  const wishlist = [
    { id: '1', position: 'D', target: 10, priority: 3, fascia: 'Top', status: 'available' },
    { id: '2', position: 'D', target: 50, priority: 2, fascia: 'Top', status: 'available' },
    { id: '3', position: 'D', target: 60, priority: 1, fascia: 'Top', status: 'available' },
  ];

  const coverage = computeWishlistCoveragePerRole('D', roleInfo, wishlist);

  // costoTargetPiano deve usare i primi 3 ordinati: 1(60) + 2(50) + 3(10)
  equal(coverage.costoTargetPiano, 120);
});

test('computeWishlistCoverage: globale', () => {
  const roles = ['D', 'C', 'A'];
  const perRole = {
    D: { mancanti: 3, disponibile: 75, budgetDinamico: 75 },
    C: { mancanti: 2, disponibile: 60, budgetDinamico: 60 },
    A: { mancanti: 2, disponibile: 65, budgetDinamico: 65 },
  };
  const entries = [
    { position: 'D', target: 25, priority: 1 },
    { position: 'D', target: 25, priority: 2 },
    { position: 'D', target: 25, priority: 3 },
    { position: 'C', target: 30, priority: 1 },
    { position: 'C', target: 30, priority: 2 },
    { position: 'A', target: 35, priority: 1 },
    { position: 'A', target: 35, priority: 2 },
  ];

  const coverage = computeWishlistCoverage(roles, perRole, entries, { cassaGlobale: 300 });

  equal(coverage.globale.costoTargetPianoTotale, 75 + 60 + 70);
  equal(coverage.globale.ok, true, 'piano coerente');
});
