// Motore matematico del budget d'asta: allocazione dinamica per reparto,
// tesoretto bidirezionale (i reparti completati o sforati versano/assorbono
// risorse dai reparti ancora in corsa) e le due soglie di rischio
// "Max Strategica" e "Max ALL-IN".
//
// Reimplementazione, come funzione pura senza DOM, della logica di
// calcolaMatematica() in renzullicarmine-ai/FantAsta-Fantacalcio (index.html):
// stessa idea (budget %, tesoretto, fabbisogno minimo, max strategica/all-in),
// riscritta qui per essere testabile e per alimentare sia la dashboard sia,
// in futuro, eventuali altri renderer.
//
// Nessuna dipendenza esterna: importabile sia dal browser (<script type="module">)
// sia da Node (usato in tests/auction.test.mjs).

/**
 * @param {number} budgetTotale
 * @param {string[]} roles - es. ['P','D','C','A']
 * @param {Object<string,{max:number, perc:number}>} roleConfig
 * @param {Object<string,{speso:number, acquistati:number}>} squadStats - il MIO speso/acquistati per ruolo
 * @returns {{sumPerc:number, percOk:boolean, cassaGlobale:number, tesoretto:number, mancantiTotaliGlobali:number, perRole:Object}}
 */
export function computeAuctionState(budgetTotale, roles, roleConfig, squadStats) {
  const setup = {};
  let sumPerc = 0;
  let spesaTotaleGlobale = 0;
  let mancantiTotaliGlobali = 0;

  // FASE 1: lettura dati / setup base per reparto
  for (const r of roles) {
    const cfg = roleConfig[r] || { max: 0, perc: 0 };
    const stats = squadStats[r] || { speso: 0, acquistati: 0 };
    const max = cfg.max || 0;
    const perc = cfg.perc || 0;
    sumPerc += perc;

    const speso = stats.speso || 0;
    spesaTotaleGlobale += speso;
    const acquistati = stats.acquistati || 0;
    const mancanti = Math.max(0, max - acquistati);
    mancantiTotaliGlobali += mancanti;

    setup[r] = {
      max, perc, speso, acquistati, mancanti,
      completato: acquistati >= max,
      budgetBase: (budgetTotale * perc) / 100,
      inDeficit: false,
      fabbisognoMinimo: 0,
      budgetDinamico: 0,
    };
  }

  // FASE 2: tesoretto bidirezionale (surplus dai reparti completi, sforamenti dai reparti in deficit)
  let tesoretto = 0;
  let sommaPercRiceventi = 0;

  for (const r of roles) {
    const s = setup[r];
    s.fabbisognoMinimo = s.speso + s.mancanti; // già speso + 1 credito per ogni slot vuoto

    if (s.completato) {
      tesoretto += s.budgetBase - s.speso;
      s.budgetDinamico = s.speso;
    } else if (s.fabbisognoMinimo > s.budgetBase) {
      s.inDeficit = true;
      tesoretto += s.budgetBase - s.fabbisognoMinimo; // sottrae risorse al tesoretto globale
      s.budgetDinamico = s.fabbisognoMinimo;
    } else {
      sommaPercRiceventi += s.perc;
    }
  }

  // FASE 3: assegnazione del tesoretto (positivo o negativo) ai reparti ancora in corsa
  for (const r of roles) {
    const s = setup[r];
    if (!s.completato && !s.inDeficit) {
      const quota = sommaPercRiceventi > 0 ? s.perc / sommaPercRiceventi : 0;
      s.budgetDinamico = s.budgetBase + tesoretto * quota;
      if (s.budgetDinamico < s.fabbisognoMinimo) {
        s.budgetDinamico = s.fabbisognoMinimo; // salvavita: garantito il minimo vitale
      }
    }
  }

  const cassaGlobale = budgetTotale - spesaTotaleGlobale;

  // FASE 4: metriche derivate per reparto (media, Max Strategica, Max ALL-IN, spazio grafico)
  for (const r of roles) {
    const s = setup[r];
    s.spazioGrafico = Math.max(s.budgetDinamico, s.speso);
    const disponibile = s.budgetDinamico - s.speso;
    s.disponibile = disponibile;
    s.media = s.mancanti > 0 ? disponibile / s.mancanti : 0;
    s.maxStrategica = Math.max(0, s.mancanti > 0 ? disponibile - s.mancanti + 1 : 0);
    s.maxAllIn = Math.max(0, s.mancanti > 0 ? cassaGlobale - mancantiTotaliGlobali + 1 : 0);
  }

  return {
    sumPerc,
    percOk: sumPerc === 100,
    cassaGlobale,
    tesoretto,
    mancantiTotaliGlobali,
    perRole: setup,
  };
}

/**
 * Budget/slot residui e puntata massima teorica per un fantallenatore
 * rivale, assumendo lo stesso regolamento (stessi slot per ruolo) della
 * propria lega. Usa la stessa idea di "Max ALL-IN": budget residuo meno
 * 1 credito garantito per ogni slot ancora da coprire.
 *
 * @param {number} budgetTotale
 * @param {number} speso - somma dei costi già pagati dal rivale
 * @param {number} slotTotali - somma degli slot di rosa (tutti i ruoli)
 * @param {number} slotOccupati - quanti giocatori ha già preso il rivale
 */
export function computeRivalBudget(budgetTotale, speso, slotTotali, slotOccupati) {
  const residuo = budgetTotale - speso;
  const mancanti = Math.max(0, slotTotali - slotOccupati);
  const maxTeorica = mancanti > 0 ? Math.max(0, residuo - mancanti + 1) : residuo;
  return { residuo, mancanti, maxTeorica };
}
