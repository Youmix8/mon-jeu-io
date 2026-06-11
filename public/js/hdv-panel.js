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

  // Unités INVOQUÉES UNIQUEMENT (jamais en production HDV/village) — cachées
  // par défaut. Ces unités apparaissent via le passif d'une autre unité
  // (necromancer→skeleton, lich→skeleton_knight). Elles n'ont pas
  // requiresTech ni d'entrée dans unlocks.units du techTree.
  const SUMMONED_ONLY = new Set(['skeleton', 'skeleton_knight']);

  // Map { unitId → techId requise } construite à partir des unlocks.units du
  // techTree. Permet de cacher les unités dont la tech n'est pas débloquée
  // même quand u.requiresTech est null côté serveur (ex: fire_elemental,
  // arcane_dragon, angel, god_avatar — débloqués via unlocks.units).
  let _unitTechMap = null;
  function _buildUnitTechMap(cfg) {
    if (_unitTechMap) return _unitTechMap;
    _unitTechMap = {};
    const tt = cfg.techTree || {};
    for (const tid of Object.keys(tt)) {
      const t = tt[tid];
      const units = t.unlocks && t.unlocks.units;
      if (Array.isArray(units)) units.forEach(uid => { _unitTechMap[uid] = tid; });
    }
    return _unitTechMap;
  }
  // Renvoie la tech requise pour qu'une unité apparaisse en production,
  // ou null si l'unité est de base (soldat), ou SUMMONED_ONLY = caché.
  function _effectiveRequiredTech(u, cfg) {
    if (SUMMONED_ONLY.has(u.id)) return '__SUMMONED_ONLY__';
    if (u.requiresTech) return u.requiresTech;
    const map = _buildUnitTechMap(cfg);
    return map[u.id] || null;
  }

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

    const uGlyph = (u) => (typeof NeonGlyphs !== 'undefined') ? NeonGlyphs.unit(u.id, u.icon) : u.icon;
    const bGlyph = (b) => (typeof NeonGlyphs !== 'undefined') ? NeonGlyphs.building(b.id, b.icon) : b.icon;
    prodEl.innerHTML = Object.values(cfg.unitTypes).map(u => {
      const extraCost = u.manaCost ? ` + ${u.manaCost} ✦`
                      : u.faithCost ? ` + ${u.faithCost} ✚`
                      : '';
      const popCost = u.populationCost || 1;
      return `
      <div class="unit-card" data-unit-id="${u.id}">
        <div class="unit-card-icon">${uGlyph(u)}</div>
        <div class="unit-card-name">${u.name}</div>
        <div class="unit-card-stats">❤ ${u.hp} &nbsp; ▶ ${u.damage} &nbsp; ◎ ${u.range} &nbsp; ⌬ ${popCost}</div>
        <div class="unit-card-cost">${u.cost} ◈${extraCost}</div>
        <div class="locked-note" data-role="lock"></div>
      </div>`;
    }).join('');

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
          <div class="unit-card-icon">${bGlyph(b)}</div>
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
      upgradeBtn.textContent = `▲ Améliorer Lv ${me.hdvLevel + 1} (${cost} ◈)`;
      upgradeBtn.disabled = me.gold < cost;
      upgradeBtn.classList.toggle('disabled', me.gold < cost);
    }

    // ── Unit cards : CACHE complètement les unités dont la tech requise
    //    n'est pas débloquée + les invocations pures (skeleton…). Les
    //    autres conservent leur état locked/poor selon les ressources/pop.
    for (const card of prodEl.querySelectorAll('.unit-card')) {
      const u = cfg.unitTypes[card.dataset.unitId];
      if (!u) continue;
      const req = _effectiveRequiredTech(u, cfg);
      const unlocked = (req === null) || (req !== '__SUMMONED_ONLY__'
        && (me.unlockedTechs || []).includes(req));
      // Hide / show selon le statut tech
      card.style.display = unlocked ? '' : 'none';
      if (!unlocked) continue;
      const popCost = u.populationCost || 1;
      const popOk = (me.populationUsed || 0) + popCost <= (me.populationMax || 8);
      const manaOk  = !u.manaCost  || (me.mana  || 0) >= u.manaCost;
      const faithOk = !u.faithCost || (me.faith || 0) >= u.faithCost;
      const affordable = me.gold >= u.cost && manaOk && faithOk && popOk;
      card.classList.remove('locked');
      card.classList.toggle('poor', !affordable);
      const lockNote = card.querySelector('[data-role="lock"]');
      if (lockNote) lockNote.style.display = 'none';
    }

    // ── Building cards : update lock + affordability ──────────────────
    const buildEl = document.getElementById('hdv-panel-buildings');
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

  function techNameOf(id) {
    const cfg = Network.getConfig();
    const t = cfg.techTree && cfg.techTree[id];
    return t ? t.name : id;
  }

  return { open, close, toggle, refresh, isVisible, spawn, upgrade, onSpawnFailed };
})();
