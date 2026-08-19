// Pannello rivali: budget/slot residui e puntata massima teorica di ogni
// fantallenatore avversario, ricavati dai giocatori marcati "preso da
// altri" (state.takenByOthers). Si assume che tutti i rivali seguano lo
// stesso regolamento di slot della propria lega (state.auction.slot):
// è la semplificazione ragionevole per un tool personale — se una lega
// avesse slot diversi per manager andrebbe reso configurabile per rivale.
import { computeRivalBudget } from './auction.js';

function slotTotali(slotConfig) {
  return Object.values(slotConfig).reduce((a, b) => a + b, 0);
}

export function computeRivalsView(state, boardById) {
  const total = slotTotali(state.auction.slot);
  const purchasesByRival = {};
  for (const [pid, entry] of Object.entries(state.takenByOthers)) {
    (purchasesByRival[entry.rivalId] ||= []).push({ playerId: pid, ...entry });
  }

  return state.rivals.map((rival) => {
    const purchases = purchasesByRival[rival.id] || [];
    const speso = purchases.reduce((sum, p) => sum + (p.costo || 0), 0);
    const { residuo, mancanti, maxTeorica } = computeRivalBudget(
      rival.budgetTotale, speso, total, purchases.length
    );
    const roster = purchases.map((p) => {
      const player = boardById[p.playerId];
      return {
        ...p,
        name: player ? player.name : `#${p.playerId}`,
        position: player ? player.position : p.ruolo,
      };
    });
    return { ...rival, speso, residuo, mancanti, maxTeorica, slotTotali: total, roster };
  });
}

export function renderRivals(container, state, boardById, callbacks) {
  const views = computeRivalsView(state, boardById);
  if (views.length === 0) {
    container.innerHTML = '<p class="empty-hint">Nessun rivale ancora aggiunto: usa il form qui sopra per tracciare budget e rose degli altri fantallenatori.</p>';
    return;
  }

  container.innerHTML = views.map((r) => `
    <div class="rival-card" data-rival-id="${r.id}">
      <div class="rival-header">
        <strong>${escapeHtml(r.name)}</strong>
        <button class="icon-btn danger" data-action="remove-rival" data-rival-id="${r.id}" title="Rimuovi rivale">✕</button>
      </div>
      <div class="rival-metrics">
        <span>Budget: € ${r.budgetTotale}</span>
        <span>Speso: € ${r.speso}</span>
        <span>Residuo: € ${r.residuo}</span>
        <span>Slot: ${r.roster.length}/${r.slotTotali}</span>
        <span class="highlight">Punta max teorica: € ${Math.round(r.maxTeorica)}</span>
      </div>
      ${r.roster.length ? `<ul class="rival-roster">${r.roster.map((p) =>
        `<li>${escapeHtml(p.name)} <span class="tag">${p.position}</span> — € ${p.costo}</li>`
      ).join('')}</ul>` : ''}
    </div>
  `).join('');

  container.querySelectorAll('[data-action="remove-rival"]').forEach((btn) => {
    btn.addEventListener('click', () => callbacks.onRemoveRival(btn.dataset.rivalId));
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
