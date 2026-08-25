// Rendering del Campo Mantra: campo in SVG, slot posizionati in
// percentuale, selettore modulo e riepilogo copertura. Nessuna logica di
// dominio qui (sta in mantra.js) e nessuna mutazione di stato: le azioni
// passano dai callback forniti da ui.js, come già fa board.js.
import { MANTRA_ROLES, getModule, isEligible, isSlotCoverable, occupiedRole, adaptCandidates } from './mantra.js';

// Campo disegnato in SVG invece che con un'immagine: scala senza sfocare,
// pesa nulla e prende i colori dal tema via `currentColor` (stesso
// approccio delle sparkline in history.js).
const PITCH_SVG = `
  <svg class="campo-pitch" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">
    <rect x="2" y="2" width="96" height="146" rx="1" fill="none" stroke="currentColor" stroke-width="0.6"/>
    <line x1="2" y1="75" x2="98" y2="75" stroke="currentColor" stroke-width="0.6"/>
    <circle cx="50" cy="75" r="12" fill="none" stroke="currentColor" stroke-width="0.6"/>
    <circle cx="50" cy="75" r="0.9" fill="currentColor"/>
    <rect x="26" y="2" width="48" height="20" fill="none" stroke="currentColor" stroke-width="0.6"/>
    <rect x="38" y="2" width="24" height="8" fill="none" stroke="currentColor" stroke-width="0.6"/>
    <rect x="26" y="128" width="48" height="20" fill="none" stroke="currentColor" stroke-width="0.6"/>
    <rect x="38" y="140" width="24" height="8" fill="none" stroke="currentColor" stroke-width="0.6"/>
  </svg>
`;

// I nomi della board sono già compatti ("Martinez L.", "Svilar"), ma su
// mobile il dischetto è piccolo: si tronca comunque.
function shortName(name, max = 12) {
  const clean = String(name || '').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function renderCampo(container, { moduloId, schieramento, players, ranking, notice }, handlers = {}) {
  const modulo = getModule(moduloId);
  const byId = new Map(players.map((p) => [String(p.id), p]));
  const coperti = modulo.slots.filter((s) => schieramento[s.id] != null).length;

  const coverageClass = coperti === modulo.slots.length
    ? 'cov-ok'
    : (coperti >= 8 ? 'cov-stretto' : 'cov-scoperto');

  // il selettore elenca i moduli ordinati per copertura: la prima voce è
  // sempre il modulo che la rosa copre meglio (la "classifica moduli")
  const options = ranking.map((r) => `
    <option value="${r.id}"${r.id === modulo.id ? ' selected' : ''}>
      ${r.id} — ${r.coperti}/${r.totale} slot
    </option>
  `).join('');

  const mancanti = modulo.slots
    .filter((s) => schieramento[s.id] == null)
    .reduce((acc, s) => acc.set(s.label, (acc.get(s.label) || 0) + 1), new Map());
  const mancantiText = [...mancanti.entries()].map(([label, n]) => `${n} ${label}`).join(', ');

  const slotsHtml = modulo.slots.map((s) => {
    const pid = schieramento[s.id] != null ? String(schieramento[s.id]) : null;
    const player = pid ? byId.get(pid) : null;
    const classes = ['campo-slot'];
    let inner;

    if (player) {
      const ruolo = occupiedRole(player, s) || s.roles[0];
      classes.push(`role-${MANTRA_ROLES[ruolo]?.reparto || 'P'}`);
      if (!player.owned) classes.push('campo-slot-wishlist');
      inner = `
        <span class="campo-slot-role">${escapeHtml(ruolo)}</span>
        <span class="campo-slot-name">${escapeHtml(shortName(player.name))}</span>
      `;
    } else {
      classes.push('campo-slot-empty');
      // Tre stati per uno slot vuoto, dal migliore al peggiore:
      // 1. qualcuno in rosa ci gioca a ruolo -> vuoto e basta
      // 2. nessuno a ruolo, ma qualcuno si adatterebbe con -1 (tabella
      //    sostituzioni ufficiale) -> lo si segnala, senza permetterlo:
      //    schierarlo davvero resta fuori dal Campo
      // 3. nessuno in nessun modo -> è il buco da colmare in asta
      if (!isSlotCoverable(s, players)) {
        const adattabili = adaptCandidates(modulo.id, s, players);
        classes.push(adattabili.length > 0 ? 'campo-slot-adattabile' : 'campo-slot-uncoverable');
      }
      inner = `
        <span class="campo-slot-role">${escapeHtml(s.label)}</span>
        <span class="campo-slot-name">—</span>
      `;
    }

    const eleggibili = players.filter((p) => isEligible(p, s)).length;
    let title;
    if (player) {
      title = `${player.name} — ${s.label}${player.owned ? '' : ' (obiettivo wishlist)'}`;
    } else if (eleggibili > 0) {
      title = `${s.label}: ${eleggibili} giocatori disponibili a ruolo`;
    } else {
      const adattabili = adaptCandidates(modulo.id, s, players);
      title = adattabili.length > 0
        ? `${s.label}: nessuno a ruolo. Con adattamento (−1): `
          + adattabili.slice(0, 4).map((a) => `${a.name} (${a.roles.join('/')})`).join(', ')
          + (adattabili.length > 4 ? ` e altri ${adattabili.length - 4}` : '')
        : `${s.label}: nessuno in rosa può coprirlo, nemmeno adattandosi`;
    }

    return `
      <button type="button" class="${classes.join(' ')}" data-slot-id="${s.id}"
              style="left:${s.x}%; top:${100 - s.y}%" title="${escapeHtml(title)}">
        ${inner}
      </button>
    `;
  }).join('');

  container.innerHTML = `
    <div class="campo-controls">
      <label class="campo-modulo">Modulo
        <select id="campoModuloSelect">${options}</select>
      </label>
      <button type="button" class="link-btn" data-campo-action="auto">⚡ Schiera al meglio</button>
      <button type="button" class="link-btn" data-campo-action="clear">🧹 Svuota</button>
    </div>
    <p class="campo-coverage ${coverageClass}">
      <strong>${coperti}/${modulo.slots.length}</strong> slot coperti${mancantiText ? ` · manca: ${escapeHtml(mancantiText)}` : ' · formazione completa'}
    </p>
    ${notice ? `<p class="campo-notice">↩️ ${escapeHtml(notice)}</p>` : ''}
    <div class="campo-wrap">
      ${PITCH_SVG}
      ${slotsHtml}
    </div>
    <p class="campo-legend">
      Clicca uno slot per schierare un giocatore.
      <span class="campo-legend-item"><span class="campo-legend-box campo-slot-wishlist"></span> obiettivo wishlist (non ancora tuo)</span>
      <span class="campo-legend-item"><span class="campo-legend-box campo-slot-adattabile"></span> copribile solo con adattamento (−1)</span>
      <span class="campo-legend-item"><span class="campo-legend-box campo-slot-uncoverable"></span> nessuno in rosa può coprirlo</span>
    </p>
  `;

  container.querySelectorAll('[data-slot-id]').forEach((btn) => {
    btn.addEventListener('click', () => handlers.onSlotClick?.(btn.dataset.slotId));
  });
  container.querySelector('#campoModuloSelect')?.addEventListener('change', (e) => {
    handlers.onModuloChange?.(e.target.value);
  });
  container.querySelectorAll('[data-campo-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.campoAction === 'auto') handlers.onAutoFill?.();
      else handlers.onClear?.();
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
