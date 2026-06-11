// ════════════════════════════════════════════════════════════════════
// BuildingInfoPanel — panel flottant qui s'ouvre au clic d'un bâtiment.
// Affiche : icône, nom, HP, portée d'attaque (avec cercle visuel),
// effets passifs (gold/mana/foi gen, dmg auto, etc.) et bouton "Vendre"
// (rembourse 50% du coût initial).
// ════════════════════════════════════════════════════════════════════

const BuildingInfoPanel = (() => {
  let panel = null;
  let rangeCircle = null; // graphics tracé sur la map (depth 90)
  let currentBuildingId = null;
  let listenersBound = false;

  function _ensureDOM() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'building-info-panel';
    panel.style.display = 'none';
    document.body.appendChild(panel);
  }

  // Ouvert sur clic d'un bâtiment.
  // buildingObj = { id, type, x, y, hp, maxHp, ownerId, ... }
  function open(buildingObj) {
    _ensureDOM();
    currentBuildingId = buildingObj.id;
    refresh();
    panel.style.display = 'block';
    _drawRangeCircle(buildingObj);
  }

  function close() {
    if (panel) panel.style.display = 'none';
    currentBuildingId = null;
    _clearRangeCircle();
  }

  function isVisible() { return panel && panel.style.display !== 'none'; }

  function _drawRangeCircle(b) {
    _clearRangeCircle();
    const cfg = Network.getConfig();
    const def = (cfg.buildingTypes || {})[b.type] || {};
    if (!def.range || def.range <= 0) return;
    const main = _getMainScene();
    if (!main) return;
    rangeCircle = main.add.graphics().setDepth(90);
    rangeCircle.lineStyle(2.5, 0xfbbf24, 0.85);
    rangeCircle.strokeCircle(b.x, b.y, def.range);
    rangeCircle.fillStyle(0xfbbf24, 0.08);
    rangeCircle.fillCircle(b.x, b.y, def.range);
  }

  function _clearRangeCircle() {
    if (rangeCircle) { rangeCircle.destroy(); rangeCircle = null; }
  }

  function _getMainScene() {
    if (!window.game || !window.game.scene) return null;
    return window.game.scene.scenes.find(s => s.scene && s.scene.key === 'MainScene');
  }

  // Décris les effets d'un bâtiment en français selon ses propriétés
  function _describeEffects(def, type) {
    const lines = [];
    if (def.range && def.damage) {
      lines.push(`⚔️ Tire : <b>${def.damage} dmg</b> à portée <b>${def.range}</b>`);
      lines.push(`⏱ Cadence : ${(1000 / (def.cooldownMs || 1000)).toFixed(2)} tirs/s`);
    }
    // Production passive (depuis entitiesConfig)
    const eCfg = (typeof ENTITIES_CONFIG !== 'undefined') ? ENTITIES_CONFIG[type] : null;
    if (eCfg) {
      if (eCfg.manaGen)  lines.push(`✦ Génère <b>+${eCfg.manaGen} mana/sec</b>`);
      if (eCfg.faithGen) lines.push(`✚ Génère <b>+${eCfg.faithGen} foi/sec</b>`);
      if (eCfg.produces) lines.push(`🏭 Permet de produire : <b>${eCfg.produces}</b>`);
    }
    if (type === 'wall') lines.push(`🧱 Bloque le passage des unités (HP élevé)`);
    if (type === 'altar')     lines.push(`🕯 Petit générateur de foi (axe Religion)`);
    if (type === 'temple')    lines.push(`⛩ Générateur intermédiaire de foi`);
    if (type === 'cathedral') lines.push(`⛪ Générateur majeur de foi`);
    if (type === 'sanctum')   lines.push(`✦ Petit générateur de mana (axe Magie)`);
    if (type === 'mage_tower')lines.push(`✦ Générateur majeur de mana (+1/s)`);
    return lines.length ? lines.join('<br/>') : '<i>Bâtiment passif</i>';
  }

  function refresh() {
    if (!currentBuildingId || !panel) return;
    const state = Network.getState();
    const b = (state.buildings || []).find(bb => bb.id === currentBuildingId);
    if (!b) { close(); return; }
    const cfg = Network.getConfig();
    const def = (cfg.buildingTypes || {})[b.type] || {};
    const myId = Network.getMyId();
    const isMine = b.ownerId === myId;
    const refund = Math.floor((def.cost || 0) * 0.5);
    const hpPct = Math.max(0, Math.min(100, Math.round((b.hp / b.maxHp) * 100)));
    const hpColor = hpPct > 60 ? '#22c55e' : hpPct > 30 ? '#f59e0b' : '#ef4444';

    const headerGlyph = (typeof NeonGlyphs !== 'undefined')
      ? NeonGlyphs.building(b.type, def.icon || '◈') : (def.icon || '◈');
    panel.innerHTML = `
      <div class="bip-header">
        <span class="bip-icon">${headerGlyph}</span>
        <span class="bip-name">${def.name || b.type}</span>
        <button class="bip-close" title="Fermer">×</button>
      </div>
      <div class="bip-hp-row">
        <span class="bip-label">❤ HP :</span>
        <div class="bip-hp-bar"><div class="bip-hp-fill" style="width:${hpPct}%; background:${hpColor}"></div></div>
        <span class="bip-hp-text">${b.hp} / ${b.maxHp}</span>
      </div>
      <div class="bip-effects">${_describeEffects(def, b.type)}</div>
      <div class="bip-footer">
        ${isMine
          ? `<button class="bip-sell">◈ Vendre <b>+${refund}</b> gold</button>`
          : `<div class="bip-foreign">🚫 Bâtiment adverse</div>`
        }
      </div>
    `;

    panel.querySelector('.bip-close').addEventListener('click', close);
    const sellBtn = panel.querySelector('.bip-sell');
    if (sellBtn) {
      sellBtn.addEventListener('click', () => {
        Network.sellBuilding(currentBuildingId);
        // Le panel se fermera quand le bâtiment disparaîtra du state (cf refresh sur tick)
      });
    }
  }

  // Bind global : Escape ferme le panel
  function _bindGlobalKeys() {
    if (listenersBound) return;
    listenersBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isVisible()) close();
    });
  }
  _bindGlobalKeys();

  return { open, close, refresh, isVisible };
})();
