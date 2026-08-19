// Tabella giocatori: filtri, ordinamento, sparkline e azioni riga
// (wishlist / preso da me / preso da altri / reset). Nessuna logica di
// business qui: le mutazioni di stato passano sempre dai callback forniti
// da ui.js, board.js si limita a leggere `state` e disegnare.
import { getPlayerStatus } from './state.js';
import { sparklineSVG } from './history.js';

const COLUMNS = [
  { key: 'sparkline', label: '' },
  { key: 'name', label: 'Nome', sortable: true },
  { key: 'team', label: 'Squadra', sortable: true },
  { key: 'qt_att', label: 'Qt.A', sortable: true },
  { key: 'fvm', label: 'FVM', sortable: true },
  { key: 'fascia', label: 'Fascia', sortable: true },
  { key: 'score', label: 'Score', sortable: true },
  { key: 'affare_label', label: 'Affare', sortable: true },
  { key: 'presenze', label: 'Pv', sortable: true },
  { key: 'fantamedia', label: 'Fm', sortable: true },
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
  let rows = board.filter((p) => p.position === role);

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
    if (!col.sortable) return `<th>${col.label}</th>`;
    const active = state.ui.sortBy === col.key;
    const arrow = active ? (state.ui.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th class="sortable${active ? ' sorted' : ''}" data-sort="${col.key}">${col.label}${arrow}</th>`;
  }).join('');
  theadRow.querySelectorAll('[data-sort]').forEach((th) => {
    th.addEventListener('click', () => onSort(th.dataset.sort));
  });
}

function statusCell(player, state) {
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

export function renderTableBody(tbody, players, state, history, onAction) {
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
      <td class="cell-name">${escapeHtml(p.name)}${p.no_stats ? ' <span class="tag tag-nostats" title="Nessuna statistica stagione precedente">NEW</span>' : ''}</td>
      <td>${escapeHtml(p.team)}</td>
      <td>${p.qt_att}</td>
      <td>${p.fvm}</td>
      <td><span class="tag ${fasciaClass}">${p.fascia}</span></td>
      <td>${p.score != null ? p.score.toFixed(1) : '—'}</td>
      <td>${p.affare_label ? `<span class="tag ${affareClass}">${p.affare_label}</span>` : '—'}</td>
      <td>${p.presenze != null ? p.presenze : '—'}</td>
      <td>${p.fantamedia != null ? p.fantamedia.toFixed(2) : '—'}</td>
      <td>${statusCell(p, state)}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => onAction(btn.dataset.action, btn.dataset.id));
  });
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
