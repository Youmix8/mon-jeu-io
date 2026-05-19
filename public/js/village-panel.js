// Panneau d'un village possédé : production d'unités + upgrade Lv1 → Lv2.
// Les cartes sont construites une seule fois à l'ouverture pour fiabilité des clics.

const VillagePanel = (() => {
  let isOpen = false;
  let currentVillageId = null;
  let panelEl, prodEl, upgradeBtn, titleEl, levelEl, hpEl, ratesEl;
  let cardsBuilt = false;

  function _initOnce() {
    if (panelEl) return;
    panelEl    = document.getElementById('village-panel');
    if (!panelEl) return;
    prodEl     = document.getElementById('village-panel-production');
    upgradeBtn = document.getElementById('village-upgrade-btn');
    titleEl    = document.getElementById('village-panel-title');
    levelEl    = document.getElementById('village-level');
    hpEl       = document.getElementById('village-hp');
    ratesEl    = document.getElementById('village-rate');

    prodEl.addEventListener('click', (e) => {
      const card = e.target.closest('.unit-card');
      if (!card || card.classList.contains('locked') || card.classList.contains('poor')) return;
      const unitId = card.dataset.unitId;
      if (!unitId || !currentVillageId) return;
      _animateClick(card);
      Network.villageSpawnUnit(currentVillageId, unitId);
    });

    // Cartes construction
    const buildEl = document.getElementById('village-panel-buildings');
    if (buildEl) {
      buildEl.addEventListener('click', (e) => {
        const card = e.target.closest('.unit-card');
        if (!card || card.classList.contains('locked')) return;
        const buildingType = card.dataset.buildingType;
        if (!buildingType || !currentVillageId) return;
        _animateClick(card);
        if (typeof BuildMode !== 'undefined') {
          BuildMode.activate(buildingType, { baseType: 'village', baseId: currentVillageId });
        }
      });
    }

    upgradeBtn.addEventListener('click', () => {
      if (!currentVillageId) return;
      Network.upgradeVillage(currentVillageId);
    });

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

  function open(villageId) {
    _initOnce();
    if (!panelEl) return;
    // Ferme le panel HDV s'il est ouvert
    if (typeof HdvPanel !== 'undefined' && HdvPanel.isVisible && HdvPanel.isVisible()) HdvPanel.close();
    currentVillageId = villageId;
    cardsBuilt = false;
    panelEl.style.display = 'block';
    isOpen = true;
    refresh();
  }

  function close() {
    if (panelEl) panelEl.style.display = 'none';
    isOpen = false;
    currentVillageId = null;
  }

  function isVisible() { return isOpen; }

  function _buildCards() {
    const cfg = Network.getConfig();
    if (!cfg.unitTypes) return false;
    prodEl.innerHTML = Object.values(cfg.unitTypes).map(u => `
      <div class="unit-card" data-unit-id="${u.id}">
        <div class="unit-card-icon">${u.icon}</div>
        <div class="unit-card-name">${u.name}</div>
        <div class="unit-card-stats">❤️ ${u.hp} &nbsp; 🗡 ${u.damage} &nbsp; 🎯 ${u.range}</div>
        <div class="unit-card-cost">${u.cost} 💰</div>
        <div class="locked-note" data-role="lock"></div>
      </div>
    `).join('');

    // Construction cards
    const buildEl = document.getElementById('village-panel-buildings');
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
    if (!isOpen || !currentVillageId) return;
    _initOnce();
    const myId = Network.getMyId();
    if (!myId) return;
    const state = Network.getState();
    const me = state.players[myId];
    const v = (state.villages || []).find(vv => vv.id === currentVillageId);
    if (!v || v.ownerId !== myId) { close(); return; }
    const cfg = Network.getConfig();

    if (!cardsBuilt && !_buildCards()) return;

    // Empire mini-stats
    levelEl.textContent = v.level || 1;
    hpEl.textContent    = `${v.hp}/${v.maxHp || cfg.villageMaxHp}`;
    ratesEl.textContent = `+${cfg.villageGoldPerSec || 0.5}`;
    // Garnison : unités à moins de 200px du village
    const garrisonEl = document.getElementById('village-garrison');
    if (garrisonEl) {
      const nearby = Object.values(state.units || {}).filter(u =>
        u.ownerId === myId && Math.hypot(u.x - v.x, u.y - v.y) < 200
      ).length;
      garrisonEl.textContent = nearby;
    }

    // Upgrade button
    const cost = cfg.villageUpgradeCost || 150;
    if (v.level >= 2) {
      upgradeBtn.textContent = '✨ Niveau max (Lv 2)';
      upgradeBtn.disabled = true;
      upgradeBtn.classList.add('disabled');
    } else {
      upgradeBtn.textContent = `⬆ Améliorer Lv 2 (${cost} 💰)`;
      upgradeBtn.disabled = me.gold < cost;
      upgradeBtn.classList.toggle('disabled', me.gold < cost);
    }

    // Production cards : selon le niveau du village + tech du joueur
    for (const card of prodEl.querySelectorAll('.unit-card')) {
      const u = cfg.unitTypes[card.dataset.unitId];
      if (!u) continue;
      const lvlAllowsType = (v.level >= 2)
        ? (!u.requiresTech || (me.researchedTechs || []).includes(u.requiresTech))
        : (u.id === 'soldier');
      const affordable = me.gold >= u.cost;
      card.classList.toggle('locked', !lvlAllowsType);
      card.classList.toggle('poor', lvlAllowsType && !affordable);
      const lockNote = card.querySelector('[data-role="lock"]');
      if (lockNote) {
        if (!lvlAllowsType) {
          lockNote.textContent = (v.level < 2) ? '🔒 Village Lv 2 requis' : `🔒 ${u.requiresTech ? 'Tech ' + u.requiresTech : 'verrouillé'}`;
          lockNote.style.display = '';
        } else {
          lockNote.style.display = 'none';
        }
      }
    }

    // Building cards : affordability
    const buildEl = document.getElementById('village-panel-buildings');
    if (buildEl && cfg.buildingTypes) {
      for (const card of buildEl.querySelectorAll('.unit-card')) {
        const b = cfg.buildingTypes[card.dataset.buildingType];
        if (!b) continue;
        card.classList.toggle('poor', me.gold < b.cost);
      }
    }
  }

  return { open, close, refresh, isVisible };
})();
