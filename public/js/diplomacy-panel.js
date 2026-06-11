// ════════════════════════════════════════════════════════════════════
// DiplomacyPanel — pactes de non-agression entre joueurs.
// Le serveur gère proposeTreaty/breakTreaty + events treatySigned/treatyBroken.
// Ici : un panneau listant les autres joueurs vivants, leur statut (allié /
// neutre / demande envoyée) et le bouton d'action contextuel.
//
// Gating : proposer un pacte exige la tech 'diplomacy'. Sans elle, le panneau
// s'ouvre quand même mais affiche un bandeau "recherche requise".
// Ouverture : bouton HUD ou touche P.
// ════════════════════════════════════════════════════════════════════

const DiplomacyPanel = (() => {
  let panel = null;
  let isOpen = false;
  // Propositions envoyées localement (le serveur ne renvoie pas proposalsOut) :
  // on garde une trace optimiste pour afficher "Demande envoyée".
  const sentProposals = new Set();

  function _ensureDOM() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'diplomacy-panel';
    panel.style.display = 'none';
    document.body.appendChild(panel);
    document.addEventListener('keydown', (e) => {
      if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'Escape' && isOpen) close();
    });
  }

  function open()  { _ensureDOM(); isOpen = true;  panel.style.display = 'block'; refresh(); }
  function close() { if (panel) panel.style.display = 'none'; isOpen = false; }
  function toggle(){ isOpen ? close() : open(); }
  function isVisible() { return isOpen; }

  function refresh() {
    if (!isOpen || !panel) return;
    const myId  = Network.getMyId();
    if (!myId) return;
    const state = Network.getState();
    const me    = state.players[myId];
    const summary = state.playerSummary || [];
    const hasDiplo = me && Array.isArray(me.unlockedTechs) && me.unlockedTechs.includes('diplomacy');
    const myAllies = (me && Array.isArray(me.allies)) ? me.allies : [];

    const others = summary.filter(p => p.id !== myId && !p.eliminated);

    let rows;
    if (others.length === 0) {
      rows = `<div class="diplo-empty">Aucun autre joueur en vie.</div>`;
    } else {
      rows = others.map(p => {
        const color   = (typeof Theme !== 'undefined') ? Theme.factionColorStr(p.id) : (p.color || '#fff');
        const allied  = myAllies.includes(p.id);
        const pending = sentProposals.has(p.id) && !allied;
        // Le partenaire a-t-il aussi la diplo ? (un pacte exige les 2 côtés)
        const theirDiplo = Array.isArray(p.unlockedTechs) && p.unlockedTechs.includes('diplomacy');

        let statusHtml, btnHtml;
        if (allied) {
          statusHtml = `<span class="diplo-status allied">✓ Pacte actif</span>`;
          btnHtml = `<button class="diplo-btn break" data-break="${p.id}">Rompre</button>`;
        } else if (pending) {
          statusHtml = `<span class="diplo-status pending">⏳ Demande envoyée</span>`;
          btnHtml = `<button class="diplo-btn" disabled>En attente…</button>`;
        } else {
          statusHtml = `<span class="diplo-status neutral">⚔ Neutre</span>`;
          if (!hasDiplo) {
            btnHtml = `<button class="diplo-btn" disabled title="Recherche Diplomatie requise">🔒</button>`;
          } else if (!theirDiplo) {
            btnHtml = `<button class="diplo-btn" disabled title="L'adversaire n'a pas la Diplomatie">🔒 adverse</button>`;
          } else {
            btnHtml = `<button class="diplo-btn propose" data-propose="${p.id}">Proposer un pacte</button>`;
          }
        }
        return `
          <div class="diplo-row">
            <span class="diplo-swatch" style="background:${color}"></span>
            <span class="diplo-name" style="color:${color}">${p.name}</span>
            ${statusHtml}
            ${btnHtml}
          </div>`;
      }).join('');
    }

    const banner = hasDiplo
      ? `<div class="diplo-hint">Un pacte de non-agression empêche tes unités et les siennes de s'attaquer (et inversement). Les deux camps doivent posséder la Diplomatie.</div>`
      : `<div class="diplo-locked">🔒 Recherche <b>Diplomatie</b> requise pour proposer des pactes.</div>`;

    panel.innerHTML = `
      <div class="diplo-header">
        <span class="diplo-title">⊕ Diplomatie</span>
        <button class="diplo-close" title="Fermer">×</button>
      </div>
      ${banner}
      <div class="diplo-list">${rows}</div>
    `;

    panel.querySelector('.diplo-close').addEventListener('click', close);
    panel.querySelectorAll('[data-propose]').forEach(b => b.addEventListener('click', () => {
      const id = b.getAttribute('data-propose');
      Network.proposeTreaty(id);
      sentProposals.add(id);
      refresh();
    }));
    panel.querySelectorAll('[data-break]').forEach(b => b.addEventListener('click', () => {
      Network.breakTreaty(b.getAttribute('data-break'));
    }));
  }

  // Appelé par MainScene quand un pacte est conclu/rompu (les callbacks réseau
  // sont à slot unique → MainScene les détient pour le kill feed et nous relaie ici).
  function notifyResolved(a, b) {
    const myId = Network.getMyId();
    [a, b].forEach(id => { if (id !== myId) sentProposals.delete(id); });
    if (isOpen) refresh();
  }

  // Raccourci global P (attaché au load, comme T pour l'arbre tech)
  document.addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'p' || e.key === 'P') { e.preventDefault(); toggle(); }
  });

  return { open, close, toggle, refresh, isVisible, notifyResolved };
})();

if (typeof window !== 'undefined') window.DiplomacyPanel = DiplomacyPanel;
