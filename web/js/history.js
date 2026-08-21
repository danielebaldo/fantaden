// Storico quotazioni: sparkline per riga e pannello "movimenti recenti"
// (top rialzi/ribassi di quotazione), calcolati dagli snapshot giornalieri
// in web/data/history.json (scritti da scripts/snapshot_history.py).

// Finestra di confronto per i movimenti: 3 giorni invece dei 7 classici,
// per uno sguardo più reattivo durante l'avvio di campionato (partite
// ravvicinate, quotazioni che si muovono più spesso).
export const MOVEMENT_WINDOW_DAYS = 3;
const MOVEMENT_WINDOW_MS = MOVEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Serie [ [date, qt_att, fvm], ... ] per un giocatore, o []. */
export function seriesFor(history, playerId) {
  return history[String(playerId)] || [];
}

/**
 * Variazione di quotazione (qt_att) nella finestra recente (MOVEMENT_WINDOW_DAYS)
 * per un giocatore: confronta l'ultimo punto con il punto più recente che sia
 * comunque vecchio almeno MOVEMENT_WINDOW_DAYS. Se lo storico disponibile
 * copre meno della finestra non c'è un punto simile: torna null invece di
 * confrontare date più vicine spacciandole per una variazione della finestra.
 */
export function deltaRecent(history, playerId) {
  const series = seriesFor(history, playerId);
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const lastDate = new Date(last[0] + 'T00:00:00Z').getTime();
  let refPoint = null;
  for (const point of series) {
    const t = new Date(point[0] + 'T00:00:00Z').getTime();
    if (lastDate - t >= MOVEMENT_WINDOW_MS) {
      refPoint = point; // tiene il punto valido più recente (il più vicino all'inizio della finestra)
    }
  }
  if (!refPoint) return null; // meno della finestra di storico disponibile
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
 * per spiegare in UI perché il pannello movimenti (che richiede
 * ≥MOVEMENT_WINDOW_DAYS giorni) è ancora vuoto a inizio pipeline.
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
 * Top N rialzi e top N ribassi di quotazione nella finestra recente tra i
 * giocatori ancora disponibili (board già filtrata da chi chiama, se serve).
 */
export function topMovements(history, players, n = 8) {
  const rows = [];
  for (const p of players) {
    const d = deltaRecent(history, p.id);
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
