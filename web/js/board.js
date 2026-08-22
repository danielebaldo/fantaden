// Tabella giocatori: filtri, ordinamento, sparkline e azioni riga
// (wishlist / preso da me / preso da altri / reset). Nessuna logica di
// business qui: le mutazioni di stato passano sempre dai callback forniti
// da ui.js, board.js si limita a leggere `state` e disegnare.
import { getPlayerStatus, ALL_ROLES_TAB } from './state.js';
import { sparklineSVG } from './history.js';

const COLUMNS = [
  { key: 'sparkline', label: '' },
  { key: 'name', label: 'Nome', sortable: true },
  { key: 'position', label: 'Ruolo', sortable: true },
  { key: 'position_mantra', label: 'Ruolo M', sortable: true,
    title: 'Ruolo Mantra (dal dato Rm di fantacalcio.it).' },
  { key: 'team', label: 'Squadra', sortable: true },
  { key: 'qt_att', label: 'Qt.A', sortable: true },
  { key: 'fvm', label: 'FVM', sortable: true },
  { key: 'fvm_500', label: 'FVM 500cr', sortable: true },
  { key: 'fascia', label: 'Fascia', sortable: true },
  { key: 'score', label: 'Score', sortable: true,
    title: 'Percentile di rendimento nel ruolo (0-100), calcolato su fantamedia, presenze, gol, assist e bonus/malus della stagione precedente.' },
  { key: 'affare_label', label: 'Affare', sortable: true,
    title: 'Confronto tra rendimento (score) e prezzo (FVM) nel ruolo: Affare = rende più di quanto costa, Trappola = il contrario, Equo = in linea.' },
  { key: 'presenze', label: 'Pv', sortable: true },
  { key: 'fantamedia', label: 'Fm', sortable: true },
  { key: 'ammonizioni', label: 'Amm', sortable: true,
    title: 'Ammonizioni nella stagione precedente.' },
  { key: 'status', label: 'Stato / Azioni' },
];

const AFFARE_CLASS = { Affare: 'tag-affare', Trappola: 'tag-trappola', Equo: 'tag-equo' };
const FASCIA_CLASS = {
  Top: 'fascia-top', '1a Fascia': 'fascia-1', '2a Fascia': 'fascia-2',
  '3a Fascia': 'fascia-3', 'Low Cost': 'fascia-4', Scommessa: 'fascia-5',
};
export const FASCIA_ORDER = Object.keys(FASCIA_CLASS);

export function filterAndSortPlayers(board, state, role, history) {
  const q = state.ui.search.trim().toLowerCase();
  let rows = role === ALL_ROLES_TAB ? board.slice() : board.filter((p) => p.position === role);

  if (q) {
    rows = rows.filter((p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q));
  }
  if (state.ui.fasciaFilter !== 'all') {
    rows = rows.filter((p) => p.fascia === state.ui.fasciaFilter);
  }
  if (state.ui.onlyAvailable) {
    rows = rows.filter((p) => getPlayerStatus(state, p.id) === 'available');
  }
  if (state.ui.onlyWishlist) {
    rows = rows.filter((p) => getPlayerStatus(state, p.id) === 'wishlist');
  }
  if (state.ui.onlyRigoristi) {
    rows = rows.filter((p) => p.rigorista);
  }

  const { sortBy, sortDir } = state.ui;
  const dir = sortDir === 'asc' ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    const va = a[sortBy];
    const vb = b[sortBy];
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === 'string') return dir * va.localeCompare(vb);
    return dir * (va - vb);
  });
  return rows;
}

export function renderTableHead(theadRow, state, onSort) {
  theadRow.innerHTML = COLUMNS.map((col) => {
    const titleAttr = col.title ? ` title="${escapeHtml(col.title)}"` : '';
    if (!col.sortable) return `<th${titleAttr}>${col.label}</th>`;
    const active = state.ui.sortBy === col.key;
    const arrow = active ? (state.ui.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th class="sortable${active ? ' sorted' : ''}"${titleAttr} data-sort="${col.key}">${col.label}${arrow}</th>`;
  }).join('');
  theadRow.querySelectorAll('[data-sort]').forEach((th) => {
    th.addEventListener('click', () => onSort(th.dataset.sort));
  });
}

export function statusCell(player, state) {
  const status = getPlayerStatus(state, player.id);
  if (status === 'mine') {
    const entry = state.myTeam[String(player.id)];
    return `<div class="status-cell status-mine">
      <span>🛒 Mia: € ${entry.costo}</span>
      <button data-action="remove" data-id="${player.id}" class="icon-btn" title="Rimuovi dalla rosa">↩️</button>
    </div>`;
  }
  if (status === 'taken') {
    const entry = state.takenByOthers[String(player.id)];
    const rival = state.rivals.find((r) => r.id === entry.rivalId);
    return `<div class="status-cell status-taken">
      <span>🚫 ${rival ? escapeHtml(rival.name) : 'Altri'}: € ${entry.costo}</span>
      <button data-action="remove" data-id="${player.id}" class="icon-btn" title="Libera giocatore">↩️</button>
    </div>`;
  }
  if (status === 'wishlist') {
    const entry = state.wishlist[String(player.id)];
    const target = entry.target != null ? ` (target € ${entry.target})` : '';
    return `<div class="status-cell status-wishlist">
      <span>⭐ Obiettivo${target}</span>
      <button data-action="buy" data-id="${player.id}" class="icon-btn" title="Segna come comprato da me">🛒</button>
      <button data-action="taken" data-id="${player.id}" class="icon-btn" title="Segna preso da altri">🚫</button>
      <button data-action="remove" data-id="${player.id}" class="icon-btn" title="Rimuovi da wishlist">✕</button>
    </div>`;
  }
  return `<div class="status-cell status-available">
    <button data-action="wishlist" data-id="${player.id}" class="icon-btn" title="Aggiungi a wishlist">⭐</button>
    <button data-action="buy" data-id="${player.id}" class="icon-btn" title="Preso da me">🛒</button>
    <button data-action="taken" data-id="${player.id}" class="icon-btn" title="Preso da altri">🚫</button>
  </div>`;
}

export function renderTableBody(tbody, players, state, history, onAction, onRowClick) {
  if (players.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${COLUMNS.length}" class="empty-hint">Nessun giocatore corrisponde ai filtri.</td></tr>`;
    return;
  }

  tbody.innerHTML = players.map((p) => {
    const status = getPlayerStatus(state, p.id);
    const rowClasses = ['player-row', `status-${status}`];
    const fasciaClass = FASCIA_CLASS[p.fascia] || '';
    const affareClass = p.affare_label ? (AFFARE_CLASS[p.affare_label] || '') : '';
    return `<tr class="${rowClasses.join(' ')}" data-id="${p.id}">
      <td>${sparklineSVG(history, p.id)}</td>
      <td class="cell-name">${escapeHtml(p.name)}${p.no_stats_recent ? ' <span class="tag tag-nostats" title="Nessuna statistica nella stagione più recente">NEW</span>' : ''}${p.rigorista ? ` <span class="tag tag-rigorista" title="Rigorista: ${p.rigori_calciati ?? '?'} rigori calciati, ${p.rigori_segnati ?? '?'} segnati">🎯</span>` : ''}</td>
      <td>${escapeHtml(p.position)}</td>
      <td>${escapeHtml(p.position_mantra || '—')}</td>
      <td>${escapeHtml(p.team)}</td>
      <td>${p.qt_att}</td>
      <td>${p.fvm}</td>
      <td>${p.fvm_500 != null ? p.fvm_500 : '—'}</td>
      <td><span class="tag ${fasciaClass}">${p.fascia}</span></td>
      <td>${p.score != null ? p.score.toFixed(1) : '—'}${stagioniSup(p)}</td>
      <td>${p.affare_label ? `<span class="tag ${affareClass}">${p.affare_label}</span>` : '—'}</td>
      <td>${p.presenze != null ? p.presenze : '—'}</td>
      <td>${p.fantamedia != null ? p.fantamedia.toFixed(2) : '—'}${trendArrow(p)}</td>
      <td>${p.ammonizioni != null ? p.ammonizioni : '—'}</td>
      <td>${statusCell(p, state)}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onAction(btn.dataset.action, btn.dataset.id);
    });
  });

  if (onRowClick) {
    tbody.querySelectorAll('tr.player-row').forEach((tr) => {
      tr.addEventListener('click', () => onRowClick(tr.dataset.id));
    });
  }
}

// Apice accanto a Score con il numero di stagioni su cui è mediato (score
// multi-stagione, Fase 3): va sullo Score, non su Pv/Fm, perché solo lo
// score è davvero una media pesata multi-stagione — Pv e Fm mostrati in
// tabella restano il dato della singola stagione più recente disponibile
// (vedi display_stat in build_board.py). Assente se il campo non c'è
// (multi_season disabilitato in config/scoring.json) o se è una sola
// stagione (nessuna informazione aggiuntiva da mostrare).
function stagioniSup(p) {
  if (!p.stagioni_disponibili || p.stagioni_disponibili <= 1) return '';
  const seasons = p.stagioni_ids ? p.stagioni_ids.join(', ') : '';
  return ` <sup class="stagioni-sup" title="Score mediato su ${p.stagioni_disponibili} stagioni (${seasons}); Pv e Fm restano quelli dell'ultima stagione disponibile">×${p.stagioni_disponibili}</sup>`;
}

// Freccia di trend accanto a Fm: confronta la fantamedia più recente con la
// media pesata delle stagioni precedenti (null se ne è disponibile una sola,
// vedi trend_fantamedia in build_board.py). Tooltip col dettaglio per stagione.
function trendArrow(p) {
  if (p.trend_fantamedia == null) return '';
  const up = p.trend_fantamedia > 0;
  const flat = p.trend_fantamedia === 0;
  const arrow = flat ? '▬' : (up ? '▲' : '▼');
  const cls = flat ? 'trend-flat' : (up ? 'trend-up' : 'trend-down');
  const bySeasons = p.fantamedia_by_season
    ? Object.entries(p.fantamedia_by_season).map(([s, fm]) => `${s}: ${fm.toFixed(2)}`).join(' · ')
    : '';
  return ` <span class="trend-arrow ${cls}" title="Trend fantamedia: ${p.trend_fantamedia > 0 ? '+' : ''}${p.trend_fantamedia.toFixed(2)} rispetto alle stagioni precedenti (${bySeasons})">${arrow}</span>`;
}

export function populateFasciaFilter(select, fasciaLabels, current) {
  select.innerHTML = '<option value="all">Tutte le fasce</option>' +
    fasciaLabels.map((f) => `<option value="${f}"${f === current ? ' selected' : ''}>${f}</option>`).join('');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
