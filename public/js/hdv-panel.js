// Panneau HDV — production d'unités, upgrade niveau, recherche tech.
// IMPORTANT : les cartes sont construites UNE SEULE FOIS (à l'ouverture / config init)
// puis seulement mises à jour (classes / textes / statuts) à chaque gameState.
// Sinon innerHTML détruirait les cartes en plein mousedown→mouseup et les clics seraient perdus.

const HdvPanel = (() => {
  let isOpen      = false;
  let panelEl     = null;
  let prodEl      = null;
  let techEl      = null;
  let upgradeBtn  = null;
  let cardsBuilt  = false;

  function _initListenersOnce() {
    if (panelEl) return;
    panelEl    = document.getElementById('hdv-panel');
    prodEl     = document.getElementById('hdv-panel-production');
    techEl     = document.getElementById('hdv-panel-tech');
    upgradeBtn = document.getElementById('upgrade-btn');

    // Délégation : un seul listener sur chaque grille (les cartes peuvent être
    // recréées si la config change, le listener parent reste valide)
    prodEl.addEventListener('click', (e) => {
      const card = e.target.closest('.unit-card');
      if (!card || card.classList.contains('locked')) return;
      const unitId = card.dataset.unitId;
      if (!unitId) return;
      _animateClick(card);
      Network.spawnUnit(unitId);
    });

    // Cartes construction
    const buildEl = document.getElementById('hdv-panel-buildings');
    if (buildEl) {
      buildEl.addEventListener('click', (e) => {
        const card = e.target.closest('.unit-card');
        if (!card || card.classList.contains('locked')) return;
        const buildingType = card.dataset.buildingType;
        if (!buildingType) return;
        _animateClick(card);
        // Active le mode build (le panel se ferme dans BuildMode.activate)
        if (typeof BuildMode !== 'undefined') {
          BuildMode.activate(buildingType, { baseType: 'hdv', baseId: Network.getMyId() });
        }
      });
    }

    techEl.addEventListener('click', (e) => {
      const card = e.target.closest('.tech-card');
      if (!card) return;
      const techId = card.dataset.techId;
      if (!techId) return;
      if (!card.classList.contains('available')) return;
      _animateClick(card);
      Network.researchTech(techId);
    });

    upgradeBtn.addEventListener('click', upgrade);

    const closeBtn = panelEl.querySelector('.hdv-panel-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) close();
    });
  }

  function _animateClick(el) {
    el.classList.remove('click-flash');
    void el.offsetWidth;
    el.classList.add('click-flash');
  }

  function _flashError(el) {
    if (!el) return;
    el.classList.remove('error-flash');
    void el.offsetWidth;
    el.classList.add('error-flash');
  }

  function open() {
    _initListenersOnce();
    // Ferme le panel village s'il est ouvert (un seul panel ouvert à la fois)
    if (typeof VillagePanel !== 'undefined' && VillagePanel.isVisible && VillagePanel.isVisible()) VillagePanel.close();
    panelEl.style.display = 'block';
    isOpen = true;
    refresh();
  }
  function close()     { if (panelEl) panelEl.style.display = 'none';  isOpen = false; }
  function toggle()    { isOpen ? close() : open(); }
  function isVisible() { return isOpen; }
  function spawn(t)    { Network.spawnUnit(t); }
  function upgrade()   { Network.upgradeHdv(); }
  function research(t) { Network.researchTech(t); }

  function onSpawnFailed(reason, lastUnitType) {
    if (!isOpen || !prodEl) return;
    if (reason === 'not_enough_gold' && lastUnitType) {
      _flashError(prodEl.querySelector(`.unit-card[data-unit-id="${lastUnitType}"]`));
    }
  }

  // Construit la structure des cartes (une fois)
  function _buildCards() {
    const cfg = Network.getConfig();
    if (!cfg.unitTypes || !cfg.techTree) return false;

    prodEl.innerHTML = Object.values(cfg.unitTypes).map(u => `
      <div class="unit-card" data-unit-id="${u.id}">
        <div class="unit-card-icon">${u.icon}</div>
        <div class="unit-card-name">${u.name}</div>
        <div class="unit-card-stats">❤️ ${u.hp} &nbsp; 🗡 ${u.damage} &nbsp; 🎯 ${u.range}</div>
        <div class="unit-card-cost">${u.cost} 💰</div>
        <div class="locked-note" data-role="lock"></div>
      </div>
    `).join('');

    const techList = Object.values(cfg.techTree).sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
    techEl.innerHTML = techList.map(t => `
      <div class="tech-card" data-tech-id="${t.id}">
        <div class="tech-card-icon">${t.icon}</div>
        <div class="tech-card-name">${t.name}</div>
        <div class="tech-card-desc">${t.desc}</div>
        <div class="tech-card-status" data-role="status"></div>
      </div>
    `).join('');

    // Cartes construction
    const buildEl = document.getElementById('hdv-panel-buildings');
    if (buildEl && cfg.buildingTypes) {
      buildEl.innerHTML = Object.values(cfg.buildingTypes).map(b => `
        <div class="unit-card" data-building-type="${b.id}">
          <div class="unit-card-icon">${b.icon}</div>
          <div class="unit-card-name">${b.name}</div>
          <div class="unit-card-stats">${b.desc || ''}</div>
          <div class="unit-card-cost">${b.cost} 💰</div>
        </div>
      `).join('');
    }

    cardsBuilt = true;
    return true;
  }

  function refresh() {
    if (!isOpen) return;
    _initListenersOnce();
    const myId = Network.getMyId();
    if (!myId) return;
    const me  = Network.getState().players && Network.getState().players[myId];
    if (!me) return;
    const cfg = Network.getConfig();

    // Build cards on first refresh (when config is available)
    if (!cardsBuilt) {
      if (!_buildCards()) return;
    }

    // ── Empire (texte seulement, pas de remplacement DOM) ──────────────
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

    // ── Upgrade button ────────────────────────────────────────────────
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

    // ── Unit cards : on update juste les classes et le label de lock ───
    for (const card of prodEl.querySelectorAll('.unit-card')) {
      const u = cfg.unitTypes[card.dataset.unitId];
      if (!u) continue;
      const unlocked   = !u.requiresTech || (me.researchedTechs || []).includes(u.requiresTech);
      const affordable = me.gold >= u.cost;
      card.classList.toggle('locked', !unlocked);
      card.classList.toggle('poor', unlocked && !affordable);
      const lockNote = card.querySelector('[data-role="lock"]');
      if (lockNote) {
        if (!unlocked) {
          lockNote.textContent = `🔒 ${techNameOf(u.requiresTech)}`;
          lockNote.style.display = '';
        } else {
          lockNote.style.display = 'none';
        }
      }
    }

    // ── Tech cards : update classes + status text ─────────────────────
    for (const card of techEl.querySelectorAll('.tech-card')) {
      const t = cfg.techTree[card.dataset.techId];
      if (!t) continue;
      const researched  = (me.researchedTechs || []).includes(t.id);
      const prereqsOk   = t.requires.every(r => (me.researchedTechs || []).includes(r));
      const canResearch = !researched && prereqsOk && (me.techPoints || 0) >= t.cost;
      card.classList.toggle('researched', researched);
      card.classList.toggle('locked',     !researched && !prereqsOk);
      card.classList.toggle('available',  canResearch);
      card.classList.toggle('poor',       !researched && prereqsOk && !canResearch);
      const statusEl = card.querySelector('[data-role="status"]');
      if (statusEl) {
        statusEl.textContent = researched ? '✓ Recherchée'
          : !prereqsOk ? `🔒 ${t.requires.map(r => techNameOf(r)).join(', ')}`
          : `🔬 ${t.cost} pt`;
      }
    }

    // ── Building cards : update affordability ─────────────────────────
    const buildEl = document.getElementById('hdv-panel-buildings');
    if (buildEl && cfg.buildingTypes) {
      for (const card of buildEl.querySelectorAll('.unit-card')) {
        const b = cfg.buildingTypes[card.dataset.buildingType];
        if (!b) continue;
        const affordable = me.gold >= b.cost;
        card.classList.toggle('poor', !affordable);
      }
    }
  }

  function techNameOf(id) {
    const cfg = Network.getConfig();
    const t = cfg.techTree && cfg.techTree[id];
    return t ? t.name : id;
  }

  return { open, close, toggle, refresh, isVisible, spawn, upgrade, research, onSpawnFailed };
})();
