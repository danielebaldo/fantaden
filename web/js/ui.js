// Punto di ingresso della dashboard: carica i dati (board/meta/history),
// inizializza lo stato persistito e collega DOM, filtri, modale e i moduli
// auction/board/rivals/history. Nessun framework: DOM API dirette.
import { computeAuctionState } from './auction.js';
import * as boardMod from './board.js';
import * as historyMod from './history.js';
import * as rivalsMod from './rivals.js';
import * as stateMod from './state.js';

const els = {
  loadError: document.getElementById('loadError'),
  metaInfo: document.getElementById('metaInfo'),
  budgetTotale: document.getElementById('budgetTotale'),
  cassaGlobale: document.getElementById('cassaGlobale'),
  tesorettoGlobale: document.getElementById('tesorettoGlobale'),
  percWarning: document.getElementById('percWarning'),
  roleSetupGrid: document.getElementById('roleSetupGrid'),
  waffleBar: document.getElementById('waffleBar'),
  monitorGrid: document.getElementById('monitorGrid'),
  roleTabs: document.getElementById('roleTabs'),
  rosterTabs: document.getElementById('rosterTabs'),
  rosterPanelMia: document.querySelector('[data-roster-panel="mia"]'),
  rosterPanelRivali: document.querySelector('[data-roster-panel="rivali"]'),
  searchInput: document.getElementById('searchInput'),
  fasciaFilter: document.getElementById('fasciaFilter'),
  onlyAvailable: document.getElementById('onlyAvailable'),
  onlyWishlist: document.getElementById('onlyWishlist'),
  onlyRigoristi: document.getElementById('onlyRigoristi'),
  playersTableHead: document.getElementById('playersTableHead'),
  playersTableBody: document.getElementById('playersTableBody'),
  myRosterList: document.getElementById('myRosterList'),
  rivalName: document.getElementById('rivalName'),
  rivalBudget: document.getElementById('rivalBudget'),
  addRivalBtn: document.getElementById('addRivalBtn'),
  rivalsList: document.getElementById('rivalsList'),
  movementsPanel: document.getElementById('movementsPanel'),
  modalOverlay: document.getElementById('modalOverlay'),
  modalTitle: document.getElementById('modalTitle'),
  modalBody: document.getElementById('modalBody'),
  modalCancel: document.getElementById('modalCancel'),
  modalConfirm: document.getElementById('modalConfirm'),
  exportStateBtn: document.getElementById('exportStateBtn'),
  importStateInput: document.getElementById('importStateInput'),
  resetStateBtn: document.getElementById('resetStateBtn'),
};

let board = [];
let boardById = {};
let history = {};
let meta = null;
let state = null;
let pendingConfirm = null;

async function fetchJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function init() {
  try {
    [board, meta, history] = await Promise.all([
      fetchJSON('./data/board.json'),
      fetchJSON('./data/meta.json'),
      fetchJSON('./data/history.json').catch(() => ({})), // opzionale al primo avvio
    ]);
  } catch (err) {
    els.loadError.hidden = false;
    els.loadError.textContent = `Impossibile caricare i dati (${err.message}). Esegui la pipeline `
      + `(scripts/fetch_fantacalcio.py → normalize.py → build_board.py) e ricarica la pagina.`;
    return;
  }

  boardById = Object.fromEntries(board.map((p) => [String(p.id), p]));
  state = stateMod.loadState(meta.auction_defaults);
  if (!meta.roles.includes(state.ui.activeTab)) state.ui.activeTab = meta.roles[0];

  wireStaticListeners();
  rerenderAll();
}

function roleConfigFromState() {
  const cfg = {};
  for (const r of meta.roles) {
    cfg[r] = { max: state.auction.slot[r] || 0, perc: state.auction.perc[r] || 0 };
  }
  return cfg;
}

function rerenderAll() {
  const squadStats = stateMod.squadStatsByRole(state, meta.roles, boardById);
  const result = computeAuctionState(state.auction.budgetTotale, meta.roles, roleConfigFromState(), squadStats);

  renderMetaInfo();
  renderSetupPanel(result);
  renderMonitorGrid(result);
  renderWaffle(result);
  renderTabs();
  renderTable();
  renderRosterTabs();
  renderRoster();
  rivalsMod.renderRivals(els.rivalsList, state, boardById, { onRemoveRival: handleRemoveRival });
  renderMovements();

  stateMod.saveState(state);
}

// --- rendering blocks --------------------------------------------------

function renderMetaInfo() {
  const date = meta.generated_at ? new Date(meta.generated_at).toLocaleString('it-IT') : '—';
  els.metaInfo.textContent =
    `Stagione ${meta.season.label} · Dati aggiornati: ${date} · ${meta.total_players} giocatori `
    + `(${meta.no_stats_count} senza statistiche stagione precedente)`;
}

function renderSetupPanel(result) {
  if (document.activeElement !== els.budgetTotale) {
    els.budgetTotale.value = state.auction.budgetTotale;
  }
  els.cassaGlobale.textContent = `€ ${Math.round(result.cassaGlobale)}`;
  els.tesorettoGlobale.textContent = `${result.tesoretto >= 0 ? '+' : ''}${Math.round(result.tesoretto)}`;
  els.tesorettoGlobale.className = result.tesoretto >= 0 ? 'positive' : 'negative';
  els.percWarning.textContent = result.percOk ? '✅ Allocazione 100%' : `⚠️ Somma percentuali = ${result.sumPerc}%`;
  els.percWarning.className = result.percOk ? 'ok' : 'warn';

  els.roleSetupGrid.innerHTML = meta.roles.map((r) => `
    <div class="role-setup-card role-${r}">
      <h4>${meta.role_names[r]}</h4>
      <label>Slot <input type="number" min="0" data-role="${r}" data-field="slot" value="${state.auction.slot[r]}"></label>
      <label>% <input type="number" min="0" max="100" data-role="${r}" data-field="perc" value="${state.auction.perc[r]}"></label>
    </div>
  `).join('');

  els.roleSetupGrid.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('change', () => {
      const { role, field } = inp.dataset;
      state.auction[field][role] = Number(inp.value) || 0;
      rerenderAll();
    });
  });
}

function renderMonitorGrid(result) {
  els.monitorGrid.innerHTML = meta.roles.map((r) => {
    const s = result.perRole[r];
    return `<div class="monitor-card role-${r}${s.inDeficit ? ' in-deficit' : ''}">
      <h3>${meta.role_names[r]} ${s.completato ? '✅' : ''} ${s.inDeficit ? '<span class="badge-deficit">⚠️ Sforamento</span>' : ''}</h3>
      <div class="monitor-row"><span>Budget Dinamico</span><strong>€ ${Math.round(s.budgetDinamico)}</strong></div>
      <div class="monitor-row"><span>Speso</span><strong>€ ${s.speso}</strong></div>
      <div class="monitor-row"><span>Mancanti</span><strong>${s.mancanti}</strong></div>
      <div class="monitor-row"><span>Media</span><strong>€ ${s.media.toFixed(1)}</strong></div>
      <div class="monitor-row highlight"><span>Max Strategica</span><strong>€ ${Math.round(s.maxStrategica)}</strong></div>
      <div class="monitor-row all-in"><span>Max ALL-IN</span><strong>€ ${Math.round(s.maxAllIn)}</strong></div>
    </div>`;
  }).join('');
}

function renderWaffle(result) {
  const totalSpace = meta.roles.reduce((sum, r) => sum + result.perRole[r].spazioGrafico, 0) || 1;
  els.waffleBar.innerHTML = meta.roles.map((r) => {
    const s = result.perRole[r];
    const segWidth = (s.spazioGrafico / totalSpace) * 100;
    if (segWidth <= 0) return '';
    const myPlayers = Object.entries(state.myTeam).filter(
      ([id, e]) => (e.ruolo || (boardById[id] && boardById[id].position)) === r
    );
    const blocksFilled = myPlayers.map(([, e]) => {
      const w = (e.costo / s.spazioGrafico) * 100;
      return `<div class="block-filled role-${r}" style="width:${w}%">${e.costo}</div>`;
    }).join('');
    let blocksEmpty = '';
    if (s.mancanti > 0 && s.spazioGrafico - s.speso > 0) {
      const emptyWidth = (((s.spazioGrafico - s.speso) / s.mancanti) / s.spazioGrafico) * 100;
      blocksEmpty = Array.from({ length: s.mancanti })
        .map(() => `<div class="block-empty" style="width:${emptyWidth}%">?</div>`).join('');
    }
    return `<div class="bar-segment" style="width:${segWidth}%">${blocksFilled}${blocksEmpty}</div>`;
  }).join('');
}

function renderTabs() {
  els.roleTabs.innerHTML = meta.roles.map((r) => `
    <button type="button" class="tab-btn role-${r}${state.ui.activeTab === r ? ' active' : ''}" data-role="${r}">
      ${meta.role_names[r]}
    </button>
  `).join('');
  els.roleTabs.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.ui.activeTab = btn.dataset.role;
      rerenderAll();
    });
  });
}

const ROSTER_TABS = [
  { key: 'mia', label: 'La mia Rosa' },
  { key: 'rivali', label: 'Rivali' },
];

function renderRosterTabs() {
  els.rosterTabs.innerHTML = ROSTER_TABS.map(({ key, label }) => `
    <button type="button" class="tab-btn${state.ui.rosterTab === key ? ' active' : ''}" data-roster-tab="${key}">
      ${label}
    </button>
  `).join('');
  els.rosterTabs.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.ui.rosterTab = btn.dataset.rosterTab;
      rerenderAll();
    });
  });
  els.rosterPanelMia.classList.toggle('hidden', state.ui.rosterTab !== 'mia');
  els.rosterPanelRivali.classList.toggle('hidden', state.ui.rosterTab !== 'rivali');
}

function renderTable() {
  boardMod.populateFasciaFilter(els.fasciaFilter, boardMod.FASCIA_ORDER, state.ui.fasciaFilter);
  boardMod.renderTableHead(els.playersTableHead, state, (col) => {
    if (state.ui.sortBy === col) {
      state.ui.sortDir = state.ui.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.ui.sortBy = col;
      state.ui.sortDir = 'desc';
    }
    rerenderAll();
  });
  const rows = boardMod.filterAndSortPlayers(board, state, state.ui.activeTab, history);
  boardMod.renderTableBody(els.playersTableBody, rows, state, history, handleRowAction);
}

function renderRoster() {
  const wishlistEntries = Object.entries(state.wishlist)
    .map(([id, w]) => ({ id, ...w, player: boardById[id] }))
    .filter((e) => e.player);
  const myTeamEntries = Object.entries(state.myTeam)
    .map(([id, m]) => ({ id, ...m, player: boardById[id] }))
    .filter((e) => e.player);
  const totalSpeso = myTeamEntries.reduce((sum, e) => sum + e.costo, 0);

  els.myRosterList.innerHTML = `
    <div class="roster-cols">
      <div>
        <h3>⭐ Obiettivi (${wishlistEntries.length})</h3>
        <ul class="list">
          ${wishlistEntries.length ? wishlistEntries.map((e) => `
            <li>
              <span>${escapeHtml(e.player.name)} <span class="tag">${e.player.position}</span></span>
              <span>${e.target != null ? '€ ' + e.target : ''}</span>
              <button data-action="buy" data-id="${e.id}" class="icon-btn" title="Segna come comprato">🛒</button>
              <button data-action="remove" data-id="${e.id}" class="icon-btn" title="Rimuovi">✕</button>
            </li>`).join('') : '<li class="empty-hint">Nessun obiettivo</li>'}
        </ul>
      </div>
      <div>
        <h3>🛒 Acquistati (${myTeamEntries.length}) — Speso: € ${totalSpeso}</h3>
        <ul class="list">
          ${myTeamEntries.length ? myTeamEntries.map((e) => `
            <li>
              <span>${escapeHtml(e.player.name)} <span class="tag">${e.player.position}</span></span>
              <span>€ ${e.costo}</span>
              <button data-action="remove" data-id="${e.id}" class="icon-btn" title="Rimuovi dalla rosa">✕</button>
            </li>`).join('') : '<li class="empty-hint">Nessun acquisto</li>'}
        </ul>
      </div>
    </div>
  `;
  els.myRosterList.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleRowAction(btn.dataset.action, btn.dataset.id));
  });
}

function renderMovements() {
  const { rialzi, ribassi } = historyMod.topMovements(history, board, 6);
  const renderList = (rows, cls) => rows.length
    ? `<ul class="list">${rows.map((r) => `
        <li>
          <span>${escapeHtml(r.player.name)} <span class="tag">${r.player.position}</span></span>
          <span class="${cls}">${r.deltaQt > 0 ? '+' : ''}${r.deltaQt}</span>
        </li>`).join('')}</ul>`
    : '<p class="empty-hint">Serve più di uno snapshot giornaliero per calcolare i movimenti.</p>';

  els.movementsPanel.innerHTML = `
    <div><h3>📈 Rialzi</h3>${renderList(rialzi, 'positive')}</div>
    <div><h3>📉 Ribassi</h3>${renderList(ribassi, 'negative')}</div>
  `;
}

// --- azioni riga / modale ------------------------------------------------

function handleRowAction(action, id) {
  const player = boardById[id];
  if (!player) return;
  if (action === 'wishlist') openWishlistModal(player);
  else if (action === 'buy') openBuyModal(player);
  else if (action === 'taken') openTakenModal(player);
  else if (action === 'remove') { stateMod.resetPlayer(state, id); rerenderAll(); }
}

function handleRemoveRival(rivalId) {
  if (!confirm('Rimuovere questo rivale? I giocatori segnati come presi da lui torneranno disponibili.')) return;
  stateMod.removeRival(state, rivalId);
  rerenderAll();
}

function openModal(title, bodyHtml, onConfirm) {
  els.modalTitle.textContent = title;
  els.modalBody.innerHTML = bodyHtml;
  els.modalOverlay.classList.remove('hidden');
  pendingConfirm = onConfirm;
  const firstInput = els.modalBody.querySelector('input, select');
  if (firstInput) firstInput.focus();
}

function closeModal() {
  els.modalOverlay.classList.add('hidden');
  pendingConfirm = null;
}

function openWishlistModal(player) {
  const existing = state.wishlist[String(player.id)] || {};
  openModal(`⭐ Wishlist: ${player.name}`, `
    <label>Prezzo base (opzionale)<input type="number" id="modalBase" value="${existing.base ?? ''}"></label>
    <label>Prezzo target (opzionale)<input type="number" id="modalTarget" value="${existing.target ?? (player.fvm_500 || player.qt_att)}"></label>
  `, () => {
    const base = document.getElementById('modalBase').value;
    const target = document.getElementById('modalTarget').value;
    stateMod.setWishlist(state, player.id, {
      base: base === '' ? null : Number(base),
      target: target === '' ? null : Number(target),
    });
    rerenderAll();
  });
}

function openBuyModal(player) {
  openModal(`🛒 Acquistato: ${player.name}`, `
    <label>Prezzo pagato<input type="number" id="modalPrice" min="1" value="${player.qt_att}"></label>
  `, () => {
    const price = Number(document.getElementById('modalPrice').value);
    if (!price || price < 1) { alert('Inserisci un prezzo valido.'); return false; }
    stateMod.buyForMe(state, player.id, player.position, price);
    rerenderAll();
  });
}

function openTakenModal(player) {
  const hasRivals = state.rivals.length > 0;
  const rivalField = hasRivals
    ? `<label>Rivale<select id="modalRivalSelect">${state.rivals.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('')}</select></label>`
    : `<p class="hint">Nessun rivale configurato: aggiungine uno al volo.</p>
       <label>Nome rivale<input type="text" id="modalNewRivalName" placeholder="es. Marco"></label>
       <label>Budget rivale<input type="number" id="modalNewRivalBudget" value="${state.auction.budgetTotale}"></label>`;
  openModal(`🚫 Preso da altri: ${player.name}`, `
    ${rivalField}
    <label>Prezzo pagato<input type="number" id="modalPrice" min="1" value="${player.qt_att}"></label>
  `, () => {
    let rivalId;
    if (hasRivals) {
      rivalId = document.getElementById('modalRivalSelect').value;
    } else {
      const name = document.getElementById('modalNewRivalName').value.trim();
      if (!name) { alert('Inserisci il nome del rivale.'); return false; }
      const budget = document.getElementById('modalNewRivalBudget').value;
      rivalId = stateMod.addRival(state, name, budget);
    }
    const price = Number(document.getElementById('modalPrice').value);
    if (!price || price < 1) { alert('Inserisci un prezzo valido.'); return false; }
    stateMod.markTakenByOther(state, player.id, rivalId, price, player.position);
    rerenderAll();
  });
}

// --- listener statici (collegati una sola volta) --------------------------

function wireStaticListeners() {
  els.budgetTotale.addEventListener('change', () => {
    state.auction.budgetTotale = Number(els.budgetTotale.value) || 0;
    rerenderAll();
  });

  els.searchInput.addEventListener('input', () => {
    state.ui.search = els.searchInput.value;
    renderTable();
    stateMod.saveState(state);
  });
  els.fasciaFilter.addEventListener('change', () => {
    state.ui.fasciaFilter = els.fasciaFilter.value;
    renderTable();
    stateMod.saveState(state);
  });
  els.onlyAvailable.addEventListener('change', () => {
    state.ui.onlyAvailable = els.onlyAvailable.checked;
    renderTable();
    stateMod.saveState(state);
  });
  els.onlyWishlist.addEventListener('change', () => {
    state.ui.onlyWishlist = els.onlyWishlist.checked;
    renderTable();
    stateMod.saveState(state);
  });
  els.onlyRigoristi.addEventListener('change', () => {
    state.ui.onlyRigoristi = els.onlyRigoristi.checked;
    renderTable();
    stateMod.saveState(state);
  });

  els.addRivalBtn.addEventListener('click', () => {
    const name = els.rivalName.value.trim();
    if (!name) return;
    stateMod.addRival(state, name, Number(els.rivalBudget.value) || state.auction.budgetTotale);
    els.rivalName.value = '';
    els.rivalBudget.value = '';
    rerenderAll();
  });

  els.modalConfirm.addEventListener('click', () => {
    if (pendingConfirm && pendingConfirm() === false) return;
    closeModal();
  });
  els.modalCancel.addEventListener('click', closeModal);
  els.modalOverlay.addEventListener('click', (e) => { if (e.target === els.modalOverlay) closeModal(); });

  els.exportStateBtn.addEventListener('click', () => {
    const blob = new Blob([stateMod.exportStateJSON(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fantaden_asta_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  els.importStateInput.addEventListener('change', async () => {
    const file = els.importStateInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      state = stateMod.importStateJSON(text, meta.auction_defaults);
      rerenderAll();
    } catch (err) {
      alert(`File non valido: ${err.message}`);
    } finally {
      els.importStateInput.value = '';
    }
  });

  els.resetStateBtn.addEventListener('click', () => {
    if (!confirm('Azzerare rosa, wishlist, rivali e impostazioni asta? Non è reversibile.')) return;
    stateMod.clearState();
    state = stateMod.createDefaultState(meta.auction_defaults);
    rerenderAll();
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

init();
