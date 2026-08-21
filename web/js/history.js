// Storico quotazioni: sparkline per riga e pannello "movimenti ultimi 7
// giorni" (top rialzi/ribassi di quotazione), calcolati dagli snapshot
// giornalieri in web/data/history.json (scritti da scripts/snapshot_history.py).

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Serie [ [date, qt_att, fvm], ... ] per un giocatore, o []. */
export function seriesFor(history, playerId) {
  return history[String(playerId)] || [];
}

/**
 * Variazione di quotazione (qt_att) negli ultimi 7 giorni per un
 * giocatore: confronta l'ultimo punto con il punto più recente che sia
 * comunque vecchio almeno 7 giorni. Se lo storico disponibile copre meno
 * di 7 giorni non c'è un punto simile: torna null invece di confrontare
 * date più vicine spacciandole per "variazione a 7 giorni".
 */
export function delta7d(history, playerId) {
  const series = seriesFor(history, playerId);
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const lastDate = new Date(last[0] + 'T00:00:00Z').getTime();
  let refPoint = null;
  for (const point of series) {
    const t = new Date(point[0] + 'T00:00:00Z').getTime();
    if (lastDate - t >= SEVEN_DAYS_MS) {
      refPoint = point; // tiene il punto valido più recente (il più vicino a 7gg fa)
    }
  }
  if (!refPoint) return null; // meno di 7 giorni di storico disponibile
  return {
    from: refPoint[0],
    to: last[0],
    deltaQt: last[1] - refPoint[1],
    deltaFvm: last[2] - refPoint[2],
  };
}

/**
 * Numero di giorni di storico effettivamente disponibili (differenza tra
 * la data più vecchia e quella più recente su tutti i giocatori), utile
 * per spiegare in UI perché il pannello movimenti (che richiede ≥7 giorni)
 * è ancora vuoto a inizio pipeline.
 */
export function daysOfHistoryAvailable(history) {
  let minDate = null;
  let maxDate = null;
  for (const series of Object.values(history)) {
    for (const point of series) {
      const t = new Date(point[0] + 'T00:00:00Z').getTime();
      if (minDate === null || t < minDate) minDate = t;
      if (maxDate === null || t > maxDate) maxDate = t;
    }
  }
  if (minDate === null) return 0;
  return Math.round((maxDate - minDate) / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * Top N rialzi e top N ribassi di quotazione a 7 giorni tra i giocatori
 * ancora disponibili (board già filtrata da chi chiama, se serve).
 */
export function topMovements(history, players, n = 8) {
  const rows = [];
  for (const p of players) {
    const d = delta7d(history, p.id);
    if (d && d.deltaQt !== 0) rows.push({ player: p, ...d });
  }
  rows.sort((a, b) => b.deltaQt - a.deltaQt);
  const rialzi = rows.slice(0, n).filter((r) => r.deltaQt > 0);
  const ribassi = rows.slice(-n).reverse().filter((r) => r.deltaQt < 0);
  return { rialzi, ribassi };
}

/** Piccola sparkline SVG inline (nessuna dipendenza) per la colonna quotazione. */
export function sparklineSVG(history, playerId, { width = 64, height = 20 } = {}) {
  const series = seriesFor(history, playerId).slice(-14);
  if (series.length < 2) return '';
  const values = series.map((p) => p[1]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const trendUp = values[values.length - 1] >= values[0];
  const stroke = trendUp ? 'var(--up)' : 'var(--down)';
  return `<svg class="sparkline" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
    <polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
  </svg>`;
}
