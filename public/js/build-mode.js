// BuildMode : mode placement de bâtiment.
// Activé depuis le panel HDV/village → un sprite fantôme suit la souris.
// Clic dans la zone valide = construit ; clic droit / Échap = annule.

const BuildMode = (() => {
  let scene = null;
  let active = false;
  let buildingType = null;
  let baseType = null;   // 'hdv' | 'village'
  let baseId   = null;   // socket.id (hdv) ou village.id
  let ghost = null;      // sprite fantôme
  let zoneCircle = null; // cercle de zone constructible
  let validMark = null;  // cercle vert/rouge sous le fantôme

  function init(phaserScene) {
    scene = phaserScene;
  }

  function activate(type, base) {
    if (!scene) return;
    cancel(); // cleanup précédent

    const cfg = Network.getConfig();
    const def = cfg.buildingTypes && cfg.buildingTypes[type];
    if (!def) return;

    active = true;
    buildingType = type;
    baseType = base.baseType;
    baseId   = base.baseId;

    // Ferme les panels pendant le placement pour ne pas gêner
    if (typeof HdvPanel !== 'undefined' && HdvPanel.isVisible && HdvPanel.isVisible()) HdvPanel.close();
    if (typeof VillagePanel !== 'undefined' && VillagePanel.isVisible && VillagePanel.isVisible()) VillagePanel.close();

    // Zone constructible (cercle jaune transparent)
    const r = _baseRadius();
    const baseObj = _baseObj();
    if (!baseObj) { cancel(); return; }
    zoneCircle = scene.add.graphics().setDepth(45);
    zoneCircle.lineStyle(3, 0xfbbf24, 0.7);
    zoneCircle.strokeCircle(baseObj.x, baseObj.y, r);
    zoneCircle.fillStyle(0xfbbf24, 0.08);
    zoneCircle.fillCircle(baseObj.x, baseObj.y, r);

    // Sprite fantôme : icône emoji + cercle de couleur
    const initialX = scene.input.activePointer.worldX;
    const initialY = scene.input.activePointer.worldY;
    ghost = scene.add.text(initialX, initialY, def.icon, {
      fontSize: '32px', fontFamily: '"Quicksand", sans-serif',
    }).setOrigin(0.5, 0.5).setDepth(110).setAlpha(0.85);

    validMark = scene.add.circle(initialX, initialY, 28, 0x22c55e, 0.25)
      .setStrokeStyle(2, 0x22c55e, 0.9)
      .setDepth(108);

    // Hint
    _toast(`Place ton ${def.name} (clic = construire, clic droit / Échap = annuler) — ${def.cost} 💰`, def.icon);
  }

  function update(worldX, worldY) {
    if (!active || !ghost) return;
    ghost.setPosition(worldX, worldY);
    if (validMark) validMark.setPosition(worldX, worldY);
    // Valide si dans le rayon
    const valid = _isPlacementValid(worldX, worldY);
    if (validMark) {
      validMark.setFillStyle(valid ? 0x22c55e : 0xef4444, 0.25);
      validMark.setStrokeStyle(2, valid ? 0x22c55e : 0xef4444, 0.9);
    }
    if (ghost) ghost.setAlpha(valid ? 0.85 : 0.5);
  }

  function tryPlace(worldX, worldY) {
    if (!active) return false;
    if (!_isPlacementValid(worldX, worldY)) return false;
    Network.buildBuilding(buildingType, Math.round(worldX), Math.round(worldY), baseType, baseId);
    cancel();
    return true;
  }

  function cancel() {
    active = false;
    buildingType = null;
    if (ghost)      { ghost.destroy(); ghost = null; }
    if (zoneCircle) { zoneCircle.destroy(); zoneCircle = null; }
    if (validMark)  { validMark.destroy(); validMark = null; }
  }

  function isActive() { return active; }

  function _baseRadius() {
    const cfg = Network.getConfig();
    const baseObj = _baseObj();
    if (!baseObj) return 200;
    if (baseType === 'hdv') {
      const lvl = (cfg.hdvLevels || [])[(baseObj.hdvLevel || 1) - 1] || (cfg.hdvLevels || [])[0];
      return (lvl && lvl.buildRadius) || 240;
    } else {
      const lvl = (cfg.villageLevels || [])[(baseObj.level || 1) - 1] || (cfg.villageLevels || [])[0];
      return (lvl && lvl.buildRadius) || 160;
    }
  }

  function _baseObj() {
    const state = Network.getState();
    if (baseType === 'hdv') return state.players && state.players[baseId];
    if (baseType === 'village') return (state.villages || []).find(v => v.id === baseId);
    return null;
  }

  function _isPlacementValid(wx, wy) {
    const baseObj = _baseObj();
    if (!baseObj) return false;
    return Math.hypot(wx - baseObj.x, wy - baseObj.y) <= _baseRadius();
  }

  function _toast(msg, icon) {
    let el = document.getElementById('build-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'build-toast';
      el.style.cssText = `
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: rgba(15,23,42,0.95); color: #fff;
        font-family: 'Quicksand', sans-serif; font-weight: 600; font-size: 14px;
        padding: 10px 18px; border-radius: 10px;
        border: 1.5px solid rgba(251,191,36,0.6);
        z-index: 950; pointer-events: none;
        box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      `;
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    if (BuildMode._toastTimer) clearTimeout(BuildMode._toastTimer);
    BuildMode._toastTimer = setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  // Échap → cancel
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && active) cancel();
  });

  return { init, activate, update, tryPlace, cancel, isActive };
})();
