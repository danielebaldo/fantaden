// Test della logica Mantra (web/js/mantra.js): parsing ruoli, eleggibilità,
// matching bipartito massimo, classifica moduli, riposizionamento.
// Esegui con: node --test tests/mantra.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MANTRA_ROLES, MODULES, DEFAULT_MODULE, getModule,
  parseRoles, isEligible, occupiedRole, isSlotCoverable,
  maxMatching, countFilled, rankModules, uncoveredSummary, reposition,
  adaptableRoles, adaptCandidates,
} from '../web/js/mantra.js';

// helper: costruisce un giocatore normalizzato come fa ui.js
function p(id, roles, { price = 10, owned = true, name = `G${id}` } = {}) {
  return { id, name, roles: parseRoles(roles), price, owned };
}

// ---------------------------------------------------------------------------
// parseRoles
// ---------------------------------------------------------------------------

test('parseRoles legge il formato reale dei nostri dati (separatore ;)', () => {
  assert.deepEqual(parseRoles('W;A'), ['W', 'A']);
  assert.deepEqual(parseRoles('Por'), ['Por']);
  assert.deepEqual(parseRoles('B;Ds;E'), ['B', 'Ds', 'E']);
  assert.deepEqual(parseRoles('Dd;Ds;Dc'), ['Dd', 'Ds', 'Dc']);
});

test('parseRoles degrada senza eccezioni su input vuoto o ignoto', () => {
  assert.deepEqual(parseRoles(null), []);
  assert.deepEqual(parseRoles(''), []);
  assert.deepEqual(parseRoles(undefined), []);
  // "Att" non è un ruolo Mantra: scartato, il resto sopravvive
  assert.deepEqual(parseRoles('Att;W'), ['W']);
  assert.deepEqual(parseRoles('Att'), []);
});

test('parseRoles normalizza spazi e duplicati', () => {
  assert.deepEqual(parseRoles(' W ; A '), ['W', 'A']);
  assert.deepEqual(parseRoles('W;W;A'), ['W', 'A']);
});

// ---------------------------------------------------------------------------
// struttura della tabella moduli (regolarità di dominio)
// ---------------------------------------------------------------------------

test('ogni modulo ha esattamente 11 slot con id univoci', () => {
  assert.equal(MODULES.length, 11);
  for (const m of MODULES) {
    assert.equal(m.slots.length, 11, `${m.id} deve avere 11 slot`);
    const ids = m.slots.map((s) => s.id);
    assert.equal(new Set(ids).size, 11, `${m.id} ha id slot duplicati`);
  }
});

test('ogni modulo ha un solo portiere e una punta A/Pc', () => {
  for (const m of MODULES) {
    const portieri = m.slots.filter((s) => s.roles.includes('Por'));
    assert.equal(portieri.length, 1, `${m.id}: esattamente un portiere`);
    assert.deepEqual(portieri[0].roles, ['Por'], `${m.id}: lo slot portiere accetta solo Por`);
    const punte = m.slots.filter((s) => s.roles.includes('Pc'));
    assert.ok(punte.length >= 1, `${m.id}: almeno uno slot da punta centrale`);
  }
});

test('la difesa segue la forma canonica: a 3 con braccetto, a 4 con i terzini', () => {
  for (const m of MODULES) {
    const difensori = m.slots.filter((s) => s.id.startsWith('d'));
    const n = Number(m.id.split('-')[0]);
    assert.equal(difensori.length, n, `${m.id}: la difesa deve avere ${n} slot`);
    if (n === 3) {
      // due centrali puri + un braccetto/centrale
      assert.equal(difensori.filter((s) => s.roles.includes('B')).length, 1, `${m.id}: un solo braccetto`);
      assert.ok(difensori.every((s) => s.roles.includes('Dc')), `${m.id}: difesa a 3 tutta di centrali`);
    } else {
      assert.equal(difensori.filter((s) => s.roles.includes('Ds')).length, 1, `${m.id}: un terzino sinistro`);
      assert.equal(difensori.filter((s) => s.roles.includes('Dd')).length, 1, `${m.id}: un terzino destro`);
      assert.equal(difensori.filter((s) => s.roles.includes('B')).length, 0, `${m.id}: niente braccetto con difesa a 4`);
    }
  }
});

test('tutti i ruoli citati negli slot sono ruoli Mantra validi', () => {
  for (const m of MODULES) {
    for (const s of m.slots) {
      assert.ok(s.roles.length > 0, `${m.id}/${s.id}: nessun ruolo ammesso`);
      for (const r of s.roles) {
        assert.ok(MANTRA_ROLES[r], `${m.id}/${s.id}: ruolo sconosciuto ${r}`);
      }
    }
  }
});

test('getModule ritorna il default per un id sconosciuto', () => {
  assert.equal(getModule('4-4-2').id, '4-4-2');
  assert.equal(getModule('9-9-9').id, DEFAULT_MODULE);
  assert.equal(getModule(null).id, DEFAULT_MODULE);
});

// ---------------------------------------------------------------------------
// eleggibilità
// ---------------------------------------------------------------------------

test('isEligible è una intersezione secca, senza adattamenti', () => {
  const modulo = getModule('4-3-3');
  const slotDs = modulo.slots.find((s) => s.id === 'd1'); // ['Ds']
  assert.equal(isEligible(p(1, 'Ds'), slotDs), true);
  assert.equal(isEligible(p(2, 'Ds;E'), slotDs), true);   // polivalente
  assert.equal(isEligible(p(3, 'Dc'), slotDs), false);    // centrale non fa il terzino
  assert.equal(isEligible(p(4, ''), slotDs), false);      // senza ruoli
});

test('occupiedRole restituisce il primo ruolo compatibile', () => {
  const slotWA = getModule('4-3-3').slots.find((s) => s.id === 'a1'); // ['W','A']
  assert.equal(occupiedRole(p(1, 'W;A'), slotWA), 'W');
  assert.equal(occupiedRole(p(2, 'A'), slotWA), 'A');
  assert.equal(occupiedRole(p(3, 'Dc'), slotWA), null);
});

test('isSlotCoverable guarda la rosa intera, non lo schieramento', () => {
  const slotDs = getModule('4-3-3').slots.find((s) => s.id === 'd1');
  assert.equal(isSlotCoverable(slotDs, [p(1, 'Dc'), p(2, 'W;A')]), false);
  assert.equal(isSlotCoverable(slotDs, [p(1, 'Dc'), p(2, 'Ds;E')]), true);
});

// ---------------------------------------------------------------------------
// matching massimo — il cuore della feature
// ---------------------------------------------------------------------------

test('maxMatching non assegna mai lo stesso giocatore a due slot', () => {
  const modulo = getModule('3-5-2');
  const jolly = p(1, 'Dc;M;C;A');
  const assignment = maxMatching([jolly], modulo);
  assert.equal(countFilled(assignment), 1);
});

test('maxMatching riempie tutti gli 11 slot con una rosa completa e coerente', () => {
  const modulo = getModule('4-4-2');
  const rosa = [
    p(1, 'Por'), p(2, 'Ds'), p(3, 'Dc'), p(4, 'Dc'), p(5, 'Dd'),
    p(6, 'E'), p(7, 'M'), p(8, 'C'), p(9, 'W'),
    p(10, 'A'), p(11, 'Pc'),
  ];
  const assignment = maxMatching(rosa, modulo);
  assert.equal(countFilled(assignment), 11);
  assert.equal(uncoveredSummary(modulo, assignment), '');
});

// Questo è il test che giustifica l'algoritmo: un'assegnazione avida
// piazzerebbe il jolly sul primo slot utile e lascerebbe scoperto lo slot
// che solo lui poteva coprire. Il matching massimo copre entrambi.
test('maxMatching batte l\'assegnazione avida quando c\'è un jolly conteso', () => {
  const modulo = getModule('4-3-3');
  // d1 = Ds, d2/d3 = Dc. Il jolly è l'unico che può fare Ds; l'altro è
  // un centrale puro. Un avido che incontra prima il jolly e lo mette su
  // un Dc lascerebbe Ds scoperto.
  const rosa = [p(1, 'Ds;Dc', { price: 50 }), p(2, 'Dc', { price: 40 })];
  const assignment = maxMatching(rosa, modulo);
  assert.equal(countFilled(assignment), 2);
  assert.equal(String(assignment.d1), '1', 'il jolly deve finire sullo slot Ds');
  const centrali = [assignment.d2, assignment.d3].filter((v) => v != null);
  assert.equal(centrali.length, 1);
  assert.equal(String(centrali[0]), '2');
});

test('maxMatching rispetta il seme: chi è già schierato resta in campo', () => {
  const modulo = getModule('4-3-3');
  const rosa = [p(1, 'Ds;Dc'), p(2, 'Dc'), p(3, 'Dc')];
  const assignment = maxMatching(rosa, modulo, { seed: { d2: 1 } });
  // il giocatore 1 resta schierato (magari spostato), nessuno sparisce
  const schierati = new Set(Object.values(assignment).map(String));
  assert.ok(schierati.has('1'));
  assert.equal(countFilled(assignment), 3);
});

test('maxMatching ignora le voci del seme non più valide', () => {
  const modulo = getModule('4-3-3');
  const rosa = [p(1, 'Dc')];
  // il seme punta a un giocatore che non è in rosa, e a uno slot che il
  // giocatore 1 non può occupare
  const assignment = maxMatching(rosa, modulo, { seed: { d1: 999, a1: 1 } });
  assert.equal(assignment.a1, undefined);
  assert.equal(countFilled(assignment), 1);
});

test('maxMatching preferisce gli acquistati agli obiettivi wishlist', () => {
  const modulo = getModule('4-3-3'); // ha esattamente 2 slot Dc (d2, d3)
  // tre candidati per due posti: chi resta fuori deve essere l'obiettivo
  // non ancora acquistato, anche se "costa" di più
  const rosa = [
    p(1, 'Dc', { owned: false, price: 90 }),
    p(2, 'Dc', { owned: true, price: 10 }),
    p(3, 'Dc', { owned: true, price: 5 }),
  ];
  const assignment = maxMatching(rosa, modulo);
  const schierati = new Set(Object.values(assignment).map(String));
  assert.equal(countFilled(assignment), 2);
  assert.ok(schierati.has('2'), 'l\'acquistato più costoso deve giocare');
  assert.ok(schierati.has('3'), 'anche il secondo acquistato deve giocare');
  assert.ok(!schierati.has('1'), 'l\'obiettivo wishlist resta fuori');
});

test('a parità di possesso e prezzo, il jolly resta libero per gli slot difficili', () => {
  const modulo = getModule('4-3-3');
  // due candidati per lo slot Ds: uno è un jolly che serve altrove.
  // La preferenza "meno polivalenti prima" fa entrare il puro sul Ds,
  // lasciando il jolly per il centro.
  const rosa = [
    p(1, 'Ds;M;C', { price: 20 }),
    p(2, 'Ds', { price: 20 }),
    p(3, 'Dc', { price: 20 }), p(4, 'Dc', { price: 20 }),
  ];
  const assignment = maxMatching(rosa, modulo);
  assert.equal(String(assignment.d1), '2', 'sul Ds va il difensore puro');
  const schierati = new Set(Object.values(assignment).map(String));
  assert.ok(schierati.has('1'), 'il jolly trova comunque posto a centrocampo');
  assert.equal(countFilled(assignment), 4);
});

// ---------------------------------------------------------------------------
// classifica moduli e riepilogo
// ---------------------------------------------------------------------------

test('rankModules ordina per slot coperti decrescenti e copre tutti i moduli', () => {
  const rosa = [
    p(1, 'Por'), p(2, 'Dc'), p(3, 'Dc'), p(4, 'B'),
    p(5, 'E'), p(6, 'M'), p(7, 'C'), p(8, 'E'),
    p(9, 'A'), p(10, 'Pc'),
  ];
  const rank = rankModules(rosa);
  assert.equal(rank.length, MODULES.length);
  for (let i = 1; i < rank.length; i++) {
    assert.ok(rank[i - 1].coperti >= rank[i].coperti, 'ordinamento decrescente');
  }
  // questa rosa è disegnata per il 3-5-2 / 3-4-1-2 (difesa a 3, due punte)
  assert.equal(rank[0].totale, 11);
  assert.ok(rank[0].coperti >= 9, `atteso >= 9 slot coperti, trovati ${rank[0].coperti}`);
  // con difesa a 3 pura, i moduli a 4 dietro coprono meno
  const treDietro = rank.find((r) => r.id === '3-5-2');
  const quattroDietro = rank.find((r) => r.id === '4-3-3');
  assert.ok(treDietro.coperti > quattroDietro.coperti);
});

test('rankModules su rosa vuota: tutti i moduli a zero, nessuna eccezione', () => {
  const rank = rankModules([]);
  assert.equal(rank.length, MODULES.length);
  assert.ok(rank.every((r) => r.coperti === 0));
});

test('uncoveredSummary aggrega gli slot vuoti per etichetta', () => {
  const modulo = getModule('4-3-3');
  const rosa = [p(1, 'Por')];
  const summary = uncoveredSummary(modulo, maxMatching(rosa, modulo));
  assert.ok(summary.includes('2 Dc'), `atteso "2 Dc" in "${summary}"`);
  assert.ok(summary.includes('1 Ds'), `atteso "1 Ds" in "${summary}"`);
  assert.ok(summary.includes('2 W/A'), `atteso "2 W/A" in "${summary}"`);
});

// ---------------------------------------------------------------------------
// cambio modulo
// ---------------------------------------------------------------------------

test('reposition tiene lo stesso slot quando il ruolo resta compatibile', () => {
  const rosa = [p(1, 'Por'), p(2, 'Dc'), p(3, 'Dc')];
  const from = { p1: 1, d2: 2, d3: 3 }; // schierati nel 4-3-3
  const { schieramento, inPanchina } = reposition(from, getModule('4-4-2'), rosa);
  assert.equal(String(schieramento.p1), '1');
  assert.equal(String(schieramento.d2), '2');
  assert.equal(String(schieramento.d3), '3');
  assert.deepEqual(inPanchina, []);
});

test('reposition segnala chi finisce in panchina quando il modulo non lo prevede', () => {
  const rosa = [p(1, 'Ds'), p(2, 'Dd')];
  const from = { d1: 1, d4: 2 }; // terzini schierati in una difesa a 4
  // il 3-5-2 ha una difesa a 3 di soli centrali/braccetto: nessuno dei due entra
  const { schieramento, inPanchina } = reposition(from, getModule('3-5-2'), rosa);
  assert.equal(countFilled(schieramento), 0);
  assert.equal(inPanchina.length, 2);
});

test('reposition non duplica un giocatore fra due slot', () => {
  const rosa = [p(1, 'Dc;M;C')];
  const from = { d2: 1 };
  const { schieramento } = reposition(from, getModule('3-5-2'), rosa);
  const schierati = Object.values(schieramento).map(String);
  assert.equal(schierati.length, new Set(schierati).size);
  assert.equal(schierati.length, 1);
});

// ---------------------------------------------------------------------------
// aderenza al grafico ufficiale
// ---------------------------------------------------------------------------

// Tabella trascritta dal grafico ufficiale "MANTRA EXPERIENCE — Edizione
// 2026/2027" di fantacalcio.it. È l'unica parte di mantra.js che non si può
// dedurre né testare per proprietà: sono dati di regolamento. Pinnarla qui
// significa che qualunque modifica futura alla tabella deve essere una
// scelta consapevole, non una svista.
//
// Notazione del grafico (P, DC, DD, DS, PC maiuscoli) tradotta nei codici
// usati dai dati di fantacalcio.it (Por, Dc, Dd, Ds, Pc).
const GRAFICO_UFFICIALE = {
  '3-4-3':   ['P','DC','DC','DC/B','E','M/C','C','E','W/A','W/A','A/PC'],
  '3-4-1-2': ['P','DC','DC','DC/B','E','M/C','C','E','T','A/PC','A/PC'],
  '3-4-2-1': ['P','DC','DC','DC/B','M','E','M/C','E/W','T','T/A','A/PC'],
  '3-5-2':   ['P','DC','DC','DC/B','M','E','M/C','C','E/W','A/PC','A/PC'],
  '3-5-1-1': ['P','DC','DC','DC/B','M','M','C','E/W','E/W','T/A','A/PC'],
  '4-3-3':   ['P','DD','DC','DC','DS','M/C','M','C','W/A','W/A','A/PC'],
  '4-3-1-2': ['P','DD','DC','DC','DS','M/C','M','C','T','T/A/PC','A/PC'],
  '4-4-2':   ['P','DD','DC','DC','DS','M/C','E','C','E/W','A/PC','A/PC'],
  '4-1-4-1': ['P','DD','DC','DC','DS','M','C/T','T','E/W','W','A/PC'],
  '4-4-1-1': ['P','DD','DC','DC','DS','M','C','E/W','E/W','T/A','A/PC'],
  '4-2-3-1': ['P','DD','DC','DC','DS','M','M/C','W/T','T','W/A','A/PC'],
};
const CODICE_GRAFICO = { P: 'Por', DC: 'Dc', DD: 'Dd', DS: 'Ds', PC: 'Pc' };
const traduciEtichetta = (e) =>
  e.split('/').map((r) => CODICE_GRAFICO[r] || r).join('/');

test('i moduli sono esattamente quelli del grafico ufficiale', () => {
  assert.deepEqual(
    MODULES.map((m) => m.id).sort(),
    Object.keys(GRAFICO_UFFICIALE).sort(),
  );
});

test('ogni modulo ha gli stessi slot del grafico ufficiale', () => {
  // confronto come multiset: la posizione sul campo (x/y) è una scelta di
  // resa nostra, ciò che deve combaciare sono i ruoli ammessi per slot
  for (const [id, slotsUfficiali] of Object.entries(GRAFICO_UFFICIALE)) {
    const modulo = getModule(id);
    const attesi = slotsUfficiali.map(traduciEtichetta).sort();
    const nostri = modulo.slots.map((s) => s.roles.join('/')).sort();
    assert.deepEqual(nostri, attesi, `modulo ${id}`);
  }
});

// ---------------------------------------------------------------------------
// adattamenti (tabella sostituzioni ufficiale)
// ---------------------------------------------------------------------------

// Valori trascritti dalla "Tabella sostituzioni per schema" di
// fantacalcio.it. Solo le celle "-1" semplici: le "-1*" (gialle) sono
// escluse perché il regolamento le vieta in fase di inserimento formazione.
test('adaptableRoles rispetta la tabella sostituzioni ufficiale', () => {
  const casi = [
    // [modulo, etichetta slot, ruoli adattabili attesi]
    ['4-3-3', 'Ds', ['Dc']],                 // un centrale fa il terzino con -1
    ['4-3-3', 'Dd', ['Dc']],
    ['3-4-3', 'Dc', []],                     // in difesa a 3 nessun adattamento
    ['3-4-3', 'Dc/B', []],
    ['3-5-2', 'Por', []],                    // il portiere non si adatta mai
    ['3-4-3', 'E', ['Dd', 'Ds', 'Dc', 'B']],
    ['3-5-2', 'M', ['Dd', 'Ds', 'Dc', 'B']], // E->M è -1*, quindi escluso
    ['3-4-3', 'M/C', ['Dd', 'Ds', 'Dc', 'B', 'E']],
    ['3-4-3', 'C', ['Dd', 'Ds', 'Dc', 'B', 'E', 'M']],
    ['3-4-3', 'A/Pc', ['Dd', 'Ds', 'Dc', 'B', 'E', 'M', 'C', 'T', 'W']],
  ];
  for (const [moduloId, label, attesi] of casi) {
    const slot = getModule(moduloId).slots.find((s) => s.label === label);
    assert.ok(slot, `${moduloId}: manca lo slot ${label}`);
    assert.deepEqual(adaptableRoles(moduloId, slot), attesi, `${moduloId} / ${label}`);
  }
});

test('il 4-1-4-1 ha le sue eccezioni: T e W non si adattano a vicenda', () => {
  // nella tabella sono le celle "no" in rosso, non dei -1*
  const ew414 = getModule('4-1-4-1').slots.find((s) => s.label === 'E/W');
  assert.ok(!adaptableRoles('4-1-4-1', ew414).includes('T'),
    'nel 4-1-4-1 un T non può adattarsi su E/W');
  // negli altri moduli lo stesso slot accetta il T con malus
  const ew442 = getModule('4-4-2').slots.find((s) => s.label === 'E/W');
  assert.ok(adaptableRoles('4-4-2', ew442).includes('T'),
    'nel 4-4-2 un T si adatta su E/W');
});

test('adaptCandidates esclude chi è già eleggibile a ruolo nativo', () => {
  const slotDs = getModule('4-3-3').slots.find((s) => s.id === 'd1'); // ['Ds']
  const terzino = p(1, 'Ds');   // nativo: non è un adattamento
  const centrale = p(2, 'Dc');  // adattabile con -1
  const ala = p(3, 'W');        // non può proprio
  const cand = adaptCandidates('4-3-3', slotDs, [terzino, centrale, ala]);
  assert.deepEqual(cand.map((c) => c.id), [2]);
});

test('adaptCandidates è vuoto dove il regolamento non ammette adattamenti', () => {
  const slotDc = getModule('3-4-3').slots.find((s) => s.id === 'd1'); // ['Dc']
  const cand = adaptCandidates('3-4-3', slotDc, [p(1, 'Ds'), p(2, 'Dd'), p(3, 'B')]);
  assert.deepEqual(cand, [], 'in difesa a 3 gli scambi fra difensori sono -1*, non -1');
});
