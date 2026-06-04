// Panneau d'un village possédé : production d'unités + upgrade Lv1 → Lv2.
// Les cartes sont construites une seule fois à l'ouverture pour fiabilité des clics.

const VillagePanel = (() => {
  let isOpen = false;
  let currentVillageId = null;
  let panelEl, prodEl, upgradeBtn, titleEl, levelEl, hpEl, ratesEl;
  let cardsBuilt = false;

  // Filtre tech (même logique que HdvPanel) : cache les unités dont la tech
  // n'est pas débloquée + les invocations pures (skeleton, skeleton_knight).
  const SUMMONED_ONLY = new Set(['skeleton', 'skeleton_knight']);
  let _unitTechMap = null;
  function _buildUnitTechMap(cfg) {
    if (_unitTechMap) return _unitTechMap;
    _unitTechMap = {};
    const tt = cfg.techTree || {};
    for (const tid of Object.keys(tt)) {
      const units = tt[tid].unlocks && tt[tid].unlocks.units;
      if (Array.isArray(units)) units.forEach(uid => { _unitTechMap[uid] = tid; });
    }
    return _unitTechMap;
  }
  function _effectiveRequiredTech(u, cfg) {
    if (SUMMONED_ONLY.has(u.id)) return '__SUMMONED_ONLY__';
    if (u.requiresTech) return u.requiresTech;
    return _buildUnitTechMap(cfg)[u.id] || null;
  }

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
        <div class="unit-card-stats">❤ ${u.hp} &nbsp; ▶ ${u.damage} &nbsp; ◎ ${u.range}</div>
        <div class="unit-card-cost">${u.cost} ◈</div>
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
          <div class="unit-card-cost">${b.cost} ◈</div>
          <div class="locked-note" data-role="lock"></div>
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

    // Empire mini-stats — utilise villageLevels (5 niveaux : Hameau → Métropole)
    const villageLevels = cfg.villageLevels || [];
    const curLvl  = villageLevels[(v.level || 1) - 1] || { name: 'Hameau', goldPerSec: 0.5, allowedUnits: ['soldier'] };
    const nextLvl = villageLevels[(v.level || 1)] || null;
    levelEl.textContent = `${v.level || 1} (${curLvl.name})`;
    hpEl.textContent    = `${v.hp}/${v.maxHp || cfg.villageMaxHp}`;
    ratesEl.textContent = `+${curLvl.goldPerSec || 0.5}`;
    // Garnison : unités à moins de 200px du village
    const garrisonEl = document.getElementById('village-garrison');
    if (garrisonEl) {
      const nearby = Object.values(state.units || {}).filter(u =>
        u.ownerId === myId && Math.hypot(u.x - v.x, u.y - v.y) < 200
      ).length;
      garrisonEl.textContent = nearby;
    }

    // Upgrade button — coût du niveau courant (croît à chaque palier)
    if (!nextLvl || curLvl.upgradeCost == null) {
      upgradeBtn.textContent = `✨ Niveau max (${curLvl.name})`;
      upgradeBtn.disabled = true;
      upgradeBtn.classList.add('disabled');
    } else {
      const cost = curLvl.upgradeCost;
      upgradeBtn.textContent = `▲ ${nextLvl.name} — ${cost} ◈`;
      upgradeBtn.disabled = me.gold < cost;
      upgradeBtn.classList.toggle('disabled', me.gold < cost);
    }

    // Production cards :
    //   - CACHE les unités dont la tech requise n'est pas débloquée
    //   - GARDE en grisé celles bloquées par le niveau du village (Lv2 requis)
    const allowedAll = curLvl.allowedUnits === 'all';
    const allowedList = Array.isArray(curLvl.allowedUnits) ? curLvl.allowedUnits : null;
    for (const card of prodEl.querySelectorAll('.unit-card')) {
      const u = cfg.unitTypes[card.dataset.unitId];
      if (!u) continue;
      // Tech débloquée ? (gère summoned-only + unlocks.units indirects)
      const req = _effectiveRequiredTech(u, cfg);
      const techOk = (req === null) || (req !== '__SUMMONED_ONLY__'
        && (me.unlockedTechs || []).includes(req));
      // Cache si la tech n'est pas débloquée
      card.style.display = techOk ? '' : 'none';
      if (!techOk) continue;
      // Niveau du village permet cette unité ?
      const lvlAllowsType = allowedAll ? true : (allowedList && allowedList.includes(u.id));
      const popCost = u.populationCost || 1;
      const popOk = (me.populationUsed || 0) + popCost <= (me.populationMax || 8);
      const manaOk  = !u.manaCost  || (me.mana  || 0) >= u.manaCost;
      const faithOk = !u.faithCost || (me.faith || 0) >= u.faithCost;
      const affordable = me.gold >= u.cost && manaOk && faithOk && popOk;
      card.classList.toggle('locked', !lvlAllowsType);
      card.classList.toggle('poor', lvlAllowsType && !affordable);
      const lockNote = card.querySelector('[data-role="lock"]');
      if (lockNote) {
        if (!lvlAllowsType) {
          lockNote.textContent = `🔒 Village Lv 2+ requis`;
          lockNote.style.display = '';
        } else {
          lockNote.style.display = 'none';
        }
      }
    }

    // Building cards : lock + affordability
    const buildEl = document.getElementById('village-panel-buildings');
    if (buildEl && cfg.buildingTypes) {
      for (const card of buildEl.querySelectorAll('.unit-card')) {
        const b = cfg.buildingTypes[card.dataset.buildingType];
        if (!b) continue;
        const unlocked   = !b.requiresTech || (me.unlockedTechs || []).includes(b.requiresTech);
        // Cache complètement les bâtiments tech-locked
        card.style.display = unlocked ? '' : 'none';
        if (!unlocked) continue;
        const affordable = me.gold >= b.cost;
        card.classList.remove('locked');
        card.classList.toggle('poor', !affordable);
        const lockNote = card.querySelector('[data-role="lock"]');
        if (lockNote) lockNote.style.display = 'none';
      }
    }
  }

  return { open, close, refresh, isVisible };
})();
