// Punto di ingresso della dashboard: carica i dati (board/meta/history),
// inizializza lo stato persistito e collega DOM, filtri, modale e i moduli
// auction/board/rivals/history. Nessun framework: DOM API dirette.
import { computeAuctionState } from './auction.js';
import * as boardMod from './board.js';
import * as historyMod from './history.js';
import * as rivalsMod from './rivals.js';
import * as stateMod from './state.js';
import * as planMod from './plan.js';

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
  planCard: document.getElementById('planCard'),
  planContent: document.getElementById('planContent'),
  planToggle: document.getElementById('planToggle'),
  modalOverlay: document.getElementById('modalOverlay'),
  modalTitle: document.getElementById('modalTitle'),
  modalBody: document.getElementById('modalBody'),
  modalCancel: document.getElementById('modalCancel'),
  modalConfirm: document.getElementById('modalConfirm'),
  exportStateBtn: document.getElementById('exportStateBtn'),
  importStateInput: document.getElementById('importStateInput'),
  resetStateBtn: document.getElementById('resetStateBtn'),
  themeToggle: document.getElementById('themeToggle'),
  logoImage: document.getElementById('logoImage'),
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
  renderPlan(result);
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
  const daysAvailable = historyMod.daysOfHistoryAvailable(history);
  const windowDays = historyMod.MOVEMENT_WINDOW_DAYS;
  const emptyHint = daysAvailable < windowDays
    ? `<p class="empty-hint">Storico disponibile: ${daysAvailable} ${daysAvailable === 1 ? 'giorno' : 'giorni'}. `
      + `Servono almeno ${windowDays} giorni di snapshot per calcolare i movimenti.</p>`
    : `<p class="empty-hint">Nessun movimento significativo negli ultimi ${windowDays} giorni.</p>`;
  const renderList = (rows, cls) => rows.length
    ? `<ul class="list">${rows.map((r) => `
        <li>
          <span>${escapeHtml(r.player.name)} <span class="tag">${r.player.position}</span></span>
          <span class="${cls}">${r.deltaQt > 0 ? '+' : ''}${r.deltaQt}</span>
        </li>`).join('')}</ul>`
    : emptyHint;

  els.movementsPanel.innerHTML = `
    <div><h3>📈 Rialzi</h3>${renderList(rialzi, 'positive')}</div>
    <div><h3>📉 Ribassi</h3>${renderList(ribassi, 'negative')}</div>
  `;
}

function renderPlan(auctionState) {
  // prepara wishlist attiva + lostTargets per computeWishlistCoverage
  const wishlistEntries = Object.entries(state.wishlist)
    .map(([id, w]) => {
      const player = boardById[id];
      if (!player) return null;
      return {
        id: String(id),
        position: player.position,
        team: player.team,
        target: w.target || player.fvm_500 || player.qt_att,
        priority: w.priority,
        nota: w.nota,
        fascia: player.fascia,
        status: 'available',
      };
    })
    .filter((e) => e);

  // aggiungi lostTargets con status 'lost'
  const lostEntries = Object.entries(state.lostTargets)
    .map(([id, l]) => {
      const player = boardById[id];
      if (!player) return null;
      return {
        id: String(id),
        position: player.position,
        team: player.team,
        target: l.target || player.fvm_500 || player.qt_att,
        priority: l.priority,
        nota: l.nota,
        fascia: player.fascia,
        status: 'lost',
      };
    })
    .filter((e) => e);

  const allEntries = [...wishlistEntries, ...lostEntries];

  // calcola la copertura
  const coverage = planMod.computeWishlistCoverage(
    meta.roles,
    auctionState.perRole,
    allEntries,
    { cassaGlobale: auctionState.cassaGlobale, history }
  );

  // banner obiettivi persi
  const lostBanner = lostEntries.length > 0 ? `
    <div class="lost-banner">
      <strong>⚠️ ${lostEntries.length} obiettivo${lostEntries.length > 1 ? 'i' : ''} perso${lostEntries.length > 1 ? 'i' : ''}</strong>
      <ul class="lost-list">
        ${lostEntries.map((l) => `
          <li>
            <span>${escapeHtml(boardById[l.id].name)}</span>
            <button type="button" class="lost-dismiss" data-lost-id="${l.id}" title="Rimuovi">✕</button>
          </li>
        `).join('')}
      </ul>
    </div>
  ` : '';

  // riga di sintesi globale
  const globalLine = `
    <div class="plan-global">
      <span>Spesa target totale: <strong class="${coverage.globale.deltaGlobale >= 0 ? 'positive' : 'negative'}">€ ${coverage.globale.costoTargetPianoTotale}</strong></span>
      <span>Cassa disponibile: <strong>€ ${Math.round(coverage.globale.cassaGlobale)}</strong></span>
      <span class="${coverage.globale.deltaGlobale >= 0 ? 'positive' : 'negative'}">
        Delta: ${coverage.globale.deltaGlobale >= 0 ? '+' : ''}€ ${Math.round(coverage.globale.deltaGlobale)}
      </span>
      ${coverage.globale.concentrazioneSquadre ? `<span class="warn">⚠️ Concentrazione squadre (${coverage.globale.concentrazioneSquadre.maxCount} giocatori)</span>` : ''}
    </div>
  `;

  // strip di copertura del ruolo attivo
  const activeRole = state.ui.activeTab;
  const activeRoleCov = coverage.perRole[activeRole];
  const coverageClass = `cov-${activeRoleCov.copertura}`;
  const coverageLabel = {
    vuoto: '🔴 Nessun obiettivo',
    scoperto: '🟠 Slot scoperti',
    sfondamento: '⛔ Sfondamento budget',
    stretto: '🟡 Margin stretto',
    ok: '✅ Coperto',
  }[activeRoleCov.copertura] || '—';

  const roleStrip = `
    <div class="plan-role-strip ${coverageClass}">
      <strong>${meta.role_names[activeRole]}</strong>
      <span>Obiettivi: ${activeRoleCov.obiettiviDisponibili}/${activeRoleCov.mancanti}</span>
      <span>Costo: €${activeRoleCov.costoTargetPiano} / €${activeRoleCov.disponibile}</span>
      <span>Media: €${activeRoleCov.mediaTargetPiano}</span>
      <span class="${coverageClass}">${coverageLabel}</span>
      ${activeRoleCov.slotScoperti > 0 ? `<span class="warn">⚠️ ${activeRoleCov.slotScoperti} slot scoperti</span>` : ''}
      ${activeRoleCov.concentrazioneFascia ? `<span class="warn">⚠️ ${activeRoleCov.concentrazioneFascia.quota}% in ${activeRoleCov.concentrazioneFascia.label}</span>` : ''}
      ${activeRoleCov.pressioneDetectato ? `<span class="warn">📈 Quotazioni in salita tra gli obiettivi</span>` : ''}
    </div>
  `;

  // lista obiettivi del ruolo attivo
  const roleWishlist = wishlistEntries.filter((w) => w.position === activeRole);
  roleWishlist.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (b.target || 0) - (a.target || 0);
  });

  const wishlistList = roleWishlist.length > 0
    ? `<ul class="plan-wishlist">
        ${roleWishlist.map((w) => {
          const alt = planMod.findAlternatives(
            boardById[w.id],
            board,
            (id) => stateMod.getPlayerStatus(state, id),
            { limit: 1 }
          );
          return `
            <li class="plan-item prio-${w.priority}">
              <div class="plan-item-header">
                <span>${escapeHtml(boardById[w.id].name)}</span>
                <span class="tag">${boardById[w.id].fascia}</span>
                <span class="prio-badge">P${w.priority}</span>
                <span class="target-price">€${w.target}</span>
              </div>
              <div class="plan-item-actions">
                <button type="button" class="plan-buy" data-id="${w.id}" title="Segna comprato">🛒</button>
                <button type="button" class="plan-edit" data-id="${w.id}" title="Modifica">✏️</button>
                <button type="button" class="plan-alt" data-id="${w.id}" title="Alternative">${alt.length > 0 ? '🔁' : '❌'}</button>
                <button type="button" class="plan-remove" data-id="${w.id}" title="Rimuovi">✕</button>
              </div>
            </li>
          `;
        }).join('')}
      </ul>`
    : '<p class="empty-hint">Nessun obiettivo per questo ruolo</p>';

  els.planContent.innerHTML = `
    ${lostBanner}
    ${globalLine}
    ${roleStrip}
    <h3>Obiettivi per ${meta.role_names[activeRole]}</h3>
    ${wishlistList}
  `;

  // stato collassato: classe sul card + freccia/tooltip sul button statico
  els.planCard.classList.toggle('plan-collapsed', state.ui.planCollapsed);
  if (els.planToggle) {
    els.planToggle.textContent = state.ui.planCollapsed ? '▶' : '▼';
    els.planToggle.title = state.ui.planCollapsed ? 'Espandi' : 'Collassa';
  }

  // collega event listener
  els.planContent.querySelectorAll('.lost-dismiss').forEach((btn) => {
    btn.addEventListener('click', () => {
      stateMod.dismissLostTarget(state, btn.dataset.lostId);
      rerenderAll();
    });
  });

  els.planContent.querySelectorAll('.plan-buy').forEach((btn) => {
    btn.addEventListener('click', () => handleRowAction('buy', btn.dataset.id));
  });

  els.planContent.querySelectorAll('.plan-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const player = boardById[btn.dataset.id];
      if (player) openWishlistModal(player);
    });
  });

  els.planContent.querySelectorAll('.plan-alt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const player = boardById[btn.dataset.id];
      if (player) {
        const alternatives = planMod.findAlternatives(
          player,
          board,
          (id) => stateMod.getPlayerStatus(state, id),
          { limit: 3 }
        );
        if (alternatives.length === 0) {
          alert(`Nessuna alternativa disponibile per ${player.name}.`);
          return;
        }
        // visualizza le alternative (stesso codice di openAlternativesModal)
        const altHtml = alternatives.map((alt) => `
          <div class="alt-card">
            <div class="alt-header">
              <strong>${escapeHtml(alt.player.name)}</strong>
              <span class="tag">${alt.player.position}</span>
              <span class="tag">${alt.player.fascia}</span>
            </div>
            <div class="alt-stats">
              <span>Score: ${alt.player.score != null ? alt.player.score.toFixed(1) : '—'}</span>
              <span>FVM 500cr: €${alt.player.fvm_500 || '—'}</span>
            </div>
            <button type="button" class="alt-btn" data-alt-id="${alt.player.id}">⭐ Sostituisci</button>
          </div>
        `).join('');
        openModal(`🔁 Alternative per ${player.name}`, altHtml, () => null);
        els.modalBody.querySelectorAll('.alt-btn').forEach((altBtn) => {
          altBtn.addEventListener('click', () => {
            const altId = altBtn.dataset.altId;
            const altPlayer = boardById[altId];
            if (altPlayer) {
              const wish = state.wishlist[String(player.id)];
              stateMod.removeFromWishlist(state, player.id);
              stateMod.setWishlist(state, altPlayer.id, {
                base: wish?.base || null,
                target: wish?.target || null,
                priority: wish?.priority || 2,
                nota: wish?.nota || '',
              });
              closeModal();
              rerenderAll();
            }
          });
        });
      }
    });
  });

  els.planContent.querySelectorAll('.plan-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      stateMod.removeFromWishlist(state, btn.dataset.id);
      rerenderAll();
    });
  });
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
  const existing = state.wishlist[String(player.id)] || { priority: 2, nota: '' };
  openModal(`⭐ Wishlist: ${player.name}`, `
    <label>Prezzo base (opzionale)<input type="number" id="modalBase" value="${existing.base ?? ''}"></label>
    <label>Prezzo target (opzionale)<input type="number" id="modalTarget" value="${existing.target ?? (player.fvm_500 || player.qt_att)}"></label>
    <label>Priorità
      <select id="modalPriority">
        <option value="1"${existing.priority === 1 ? ' selected' : ''}>1 — Must-have</option>
        <option value="2"${existing.priority === 2 ? ' selected' : ''}>2 — Piace</option>
        <option value="3"${existing.priority === 3 ? ' selected' : ''}>3 — Ripiego</option>
      </select>
    </label>
    <label>Note<input type="text" id="modalNota" value="${escapeHtml(existing.nota || '')}"></label>
  `, () => {
    const base = document.getElementById('modalBase').value;
    const target = document.getElementById('modalTarget').value;
    const priority = Number(document.getElementById('modalPriority').value);
    const nota = document.getElementById('modalNota').value;
    stateMod.setWishlist(state, player.id, {
      base: base === '' ? null : Number(base),
      target: target === '' ? null : Number(target),
      priority,
      nota,
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

    // segna come preso da altri (sposta in lostTargets se era in wishlist)
    const wasInWishlist = !!state.wishlist[String(player.id)];
    stateMod.markTakenByOther(state, player.id, rivalId, price, player.position);

    // se era in wishlist, mostra alternative
    if (wasInWishlist) {
      rerenderAll();
      openAlternativesModal(player);
      return;
    }

    rerenderAll();
  });
}

function openAlternativesModal(player) {
  const alternatives = planMod.findAlternatives(
    player,
    board,
    (id) => stateMod.getPlayerStatus(state, id),
    { limit: 3 }
  );

  if (alternatives.length === 0) {
    alert(`Nessuna alternativa disponibile per ${player.name}.`);
    return;
  }

  const altHtml = alternatives.map((alt) => `
    <div class="alt-card">
      <div class="alt-header">
        <strong>${escapeHtml(alt.player.name)}</strong>
        <span class="tag">${alt.player.position}</span>
        <span class="tag">${alt.player.fascia}</span>
      </div>
      <div class="alt-stats">
        <span>Score: ${alt.player.score != null ? alt.player.score.toFixed(1) : '—'}</span>
        <span>FVM 500cr: €${alt.player.fvm_500 || '—'}</span>
      </div>
      <button type="button" class="alt-btn" data-alt-id="${alt.player.id}">⭐ Aggiungi a wishlist</button>
    </div>
  `).join('');

  openModal(`🔁 Alternative per ${player.name}`, altHtml, () => {
    const pressed = document.querySelector('.alt-btn:focus')?.closest('.alt-card');
    if (!pressed) return;
  });

  // aggiungi listener ai bottoni delle alternative
  els.modalBody.querySelectorAll('.alt-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const altId = btn.dataset.altId;
      const altPlayer = boardById[altId];
      if (altPlayer) {
        const lostEntry = state.lostTargets[String(player.id)];
        stateMod.setWishlist(state, altPlayer.id, {
          base: lostEntry?.base || null,
          target: lostEntry?.target || null,
          priority: lostEntry?.priority || 2,
          nota: lostEntry?.nota || '',
        });
        closeModal();
        rerenderAll();
      }
    });
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

  if (els.planToggle) {
    els.planToggle.addEventListener('click', () => {
      state.ui.planCollapsed = !state.ui.planCollapsed;
      rerenderAll();
    });
  }

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

  els.themeToggle.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('fantaden_theme', next);
    } catch (err) {
      console.warn('[ui] impossibile salvare il tema:', err);
    }
    syncTheme();
  });
  // il logo torna al chiaro se logo-dark.png manca ancora (404): non deve
  // restare rotto in attesa che venga caricato su GitHub
  els.logoImage.addEventListener('error', () => {
    if (els.logoImage.src.endsWith('logo-dark.png')) els.logoImage.src = 'logo.png';
  });
  // se non c'è una scelta esplicita salvata, il logo/etichetta seguono anche
  // un cambio del tema di sistema fatto a pagina già aperta
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!localStorage.getItem('fantaden_theme')) syncTheme();
  });
  syncTheme();
}

// tema attivo: scelta esplicita salvata, altrimenti quello di sistema
// (stessa logica del piccolo script anti-flash in index.html <head>)
function currentTheme() {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function syncTheme() {
  const isDark = currentTheme() === 'dark';
  els.themeToggle.textContent = isDark ? '☀️ Tema chiaro' : '🌙 Tema scuro';
  els.themeToggle.title = isDark ? 'Passa al tema chiaro' : 'Passa al tema scuro';
  els.logoImage.src = isDark ? 'logo-dark.png' : 'logo.png';
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

init();
