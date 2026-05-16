// Panneau HDV — production d'unités, upgrade niveau, recherche tech.
// Ouverture : clic gauche sur ton HDV (déclenché par MainScene).
// Auto-refresh à chaque gameState pour gold/HP/techs en temps réel.
// Délégation d'événements (pas d'inline onclick) pour fiabilité maximale.

const HdvPanel = (() => {
  let isOpen   = false;
  let panelEl  = null;
  let prodEl   = null;
  let techEl   = null;
  let upgradeBtn = null;

  function ensureEls() {
    if (panelEl) return;
    panelEl    = document.getElementById('hdv-panel');
    prodEl     = document.getElementById('hdv-panel-production');
    techEl     = document.getElementById('hdv-panel-tech');
    upgradeBtn = document.getElementById('upgrade-btn');

    // Délégation : un seul listener sur chaque grille
    prodEl.addEventListener('click', (e) => {
      const card = e.target.closest('.unit-card');
      if (!card || !panelEl.contains(card)) return;
      const unitId = card.dataset.unitId;
      if (!unitId) return;
      if (card.classList.contains('locked')) return;
      _animateClick(card);
      spawn(unitId);
    });

    techEl.addEventListener('click', (e) => {
      const card = e.target.closest('.tech-card');
      if (!card) return;
      const techId = card.dataset.techId;
      if (!techId) return;
      if (!card.classList.contains('available')) return;
      _animateClick(card);
      research(techId);
    });

    upgradeBtn.addEventListener('click', upgrade);

    // Listener fermeture (bouton ✕)
    const closeBtn = panelEl.querySelector('.hdv-panel-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) close();
    });
  }

  function _animateClick(el) {
    el.classList.remove('click-flash');
    void el.offsetWidth; // reflow
    el.classList.add('click-flash');
  }

  function _flashError(el) {
    if (!el) return;
    el.classList.remove('error-flash');
    void el.offsetWidth;
    el.classList.add('error-flash');
  }

  function open()  { ensureEls(); panelEl.style.display = 'block'; isOpen = true; refresh(); }
  function close() { if (panelEl) panelEl.style.display = 'none';  isOpen = false; }
  function toggle()   { isOpen ? close() : open(); }
  function isVisible(){ return isOpen; }

  function spawn(unitType) { Network.spawnUnit(unitType); }
  function upgrade()        { Network.upgradeHdv(); }
  function research(techId) { Network.researchTech(techId); }

  // Flash rouge sur la carte concernée si spawn échoue (gold insuffisant)
  function onSpawnFailed(reason, lastUnitType) {
    if (!isOpen || !prodEl) return;
    if (reason === 'not_enough_gold' && lastUnitType) {
      const card = prodEl.querySelector(`.unit-card[data-unit-id="${lastUnitType}"]`);
      _flashError(card);
    }
  }

  function refresh() {
    if (!isOpen) return;
    ensureEls();
    const myId = Network.getMyId();
    if (!myId) return;
    const me = Network.getState().players && Network.getState().players[myId];
    if (!me) return;
    const cfg = Network.getConfig();

    // Empire
    document.getElementById('hdv-level').textContent   = me.hdvLevel || 1;
    document.getElementById('hdv-hp').textContent      = `${me.hp}/${me.maxHp}`;
    document.getElementById('hdv-gold').textContent    = me.gold;
    document.getElementById('hdv-techpts').textContent = me.techPoints || 0;

    let rate = 1;
    for (const tid of (me.researchedTechs || [])) {
      const t = cfg.techTree && cfg.techTree[tid];
      if (t && t.effect && t.effect.goldBonus) rate += t.effect.goldBonus;
    }
    document.getElementById('hdv-rate').textContent = `+${rate}`;

    // Upgrade button
    const lvlIdx = (me.hdvLevel || 1) - 1;
    const levels = cfg.hdvLevels || [];
    if (!levels.length || lvlIdx >= levels.length - 1) {
      upgradeBtn.textContent = '✨ Niveau max';
      upgradeBtn.disabled = true;
      upgradeBtn.classList.add('disabled');
    } else {
      const cost = levels[lvlIdx].upgradeCost;
      upgradeBtn.textContent = `⬆ Améliorer Lv ${me.hdvLevel + 1} (${cost} 💰)`;
      upgradeBtn.disabled = me.gold < cost;
      upgradeBtn.classList.toggle('disabled', me.gold < cost);
    }

    // Production grid — data-attributes + classes (pas d'inline onclick)
    if (cfg.unitTypes && prodEl) {
      prodEl.innerHTML = Object.values(cfg.unitTypes).map(u => {
        const unlocked   = !u.requiresTech || (me.researchedTechs || []).includes(u.requiresTech);
        const affordable = me.gold >= u.cost;
        let cls = 'unit-card';
        if (!unlocked) cls += ' locked';
        else if (!affordable) cls += ' poor';
        const lockNote = !unlocked ? `<div class="locked-note">🔒 ${techNameOf(u.requiresTech)}</div>` : '';
        return `<div class="${cls}" data-unit-id="${u.id}">
          <div class="unit-card-icon">${u.icon}</div>
          <div class="unit-card-name">${u.name}</div>
          <div class="unit-card-stats">❤️ ${u.hp} &nbsp; 🗡 ${u.damage} &nbsp; 🎯 ${u.range}</div>
          <div class="unit-card-cost">${u.cost} 💰</div>
          ${lockNote}
        </div>`;
      }).join('');
    }

    // Tech tree grid
    if (cfg.techTree && techEl) {
      const techList = Object.values(cfg.techTree).sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
      techEl.innerHTML = techList.map(t => {
        const researched = (me.researchedTechs || []).includes(t.id);
        const prereqsOk  = t.requires.every(r => (me.researchedTechs || []).includes(r));
        const canResearch = !researched && prereqsOk && (me.techPoints || 0) >= t.cost;
        let cls = 'tech-card';
        if (researched) cls += ' researched';
        else if (!prereqsOk) cls += ' locked';
        else if (canResearch) cls += ' available';
        else cls += ' poor';
        const status = researched ? '✓ Recherchée'
                     : !prereqsOk ? `🔒 ${t.requires.map(r => techNameOf(r)).join(', ')}`
                     : `🔬 ${t.cost} pt`;
        return `<div class="${cls}" data-tech-id="${t.id}">
          <div class="tech-card-icon">${t.icon}</div>
          <div class="tech-card-name">${t.name}</div>
          <div class="tech-card-desc">${t.desc}</div>
          <div class="tech-card-status">${status}</div>
        </div>`;
      }).join('');
    }
  }

  function techNameOf(id) {
    const cfg = Network.getConfig();
    const t = cfg.techTree && cfg.techTree[id];
    return t ? t.name : id;
  }

  return { open, close, toggle, refresh, isVisible, spawn, upgrade, research, onSpawnFailed };
})();
