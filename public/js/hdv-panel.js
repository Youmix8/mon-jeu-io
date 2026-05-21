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
    if (techEl) techEl.innerHTML = techList.map(t => `
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
          <div class="locked-note" data-role="lock"></div>
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
    document.getElementById('hdv-gold').textContent    = Math.floor(me.gold);
    const techpts = document.getElementById('hdv-techpts');
    if (techpts) techpts.textContent = Math.floor(me.researchPoints || 0);

    // Taux gold = baseline HDV + agriculture (+1) puis × empire (×1.5) — mirror du calc serveur
    const unlocked = me.unlockedTechs || [];
    const hdvLvl   = (cfg.hdvLevels || [])[(me.hdvLevel || 1) - 1] || { goldPerSec: 1 };
    let rate = hdvLvl.goldPerSec || 1;
    if (unlocked.includes('agriculture')) rate += 1;
    if (unlocked.includes('empire'))      rate *= 1.5;
    document.getElementById('hdv-rate').textContent = `+${(Math.round(rate * 10) / 10)}`;

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
      const unlocked   = !u.requiresTech || (me.unlockedTechs || []).includes(u.requiresTech);
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

    // ── Building cards : update lock + affordability ──────────────────
    const buildEl = document.getElementById('hdv-panel-buildings');
    if (buildEl && cfg.buildingTypes) {
      for (const card of buildEl.querySelectorAll('.unit-card')) {
        const b = cfg.buildingTypes[card.dataset.buildingType];
        if (!b) continue;
        const unlocked   = !b.requiresTech || (me.unlockedTechs || []).includes(b.requiresTech);
        const affordable = me.gold >= b.cost;
        card.classList.toggle('locked', !unlocked);
        card.classList.toggle('poor', unlocked && !affordable);
        const lockNote = card.querySelector('[data-role="lock"]');
        if (lockNote) {
          if (!unlocked) {
            const t = cfg.techTree && cfg.techTree[b.requiresTech];
            lockNote.textContent = `🔒 ${t ? t.name : b.requiresTech}`;
            lockNote.style.display = '';
          } else {
            lockNote.style.display = 'none';
          }
        }
      }
    }
  }

  function techNameOf(id) {
    const cfg = Network.getConfig();
    const t = cfg.techTree && cfg.techTree[id];
    return t ? t.name : id;
  }

  return { open, close, toggle, refresh, isVisible, spawn, upgrade, onSpawnFailed };
})();
