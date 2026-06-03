// BuildMode v2 : placement Clash-of-Clans style.
// - Snap au centre de la case de la grille (50px)
// - Zone constructible CARRÉE (norme L∞) bordée de la couleur d'équipe
// - Mode classique pour Tour : 1 clic = pose
// - Mode "line" pour Rempart : 1er clic = ancre, 2e clic = pose la ligne H/V

const BuildMode = (() => {
  let scene = null;
  let active = false;
  let buildingType = null;
  let baseType = null;
  let baseId   = null;

  // Visuels
  let zoneRect = null;     // contour rectangulaire de la zone constructible
  let gridOverlay = null;  // quadrillage léger
  let ghosts = [];         // sprites fantômes (1 pour tour, N pour rempart en ligne)
  let validMarks = [];     // cercles vert/rouge sous chaque fantôme

  // Sous-mode "line" pour le rempart
  let lineMode = false;        // true si le bâtiment est de type 'wall'
  let lineDrawing = false;     // true après le 1er clic, en attente du 2e
  let lineStart = null;        // { x, y } position grid du 1er clic

  function init(phaserScene) { scene = phaserScene; }

  function _grid() { return (Network.getConfig().buildGrid || 50); }

  function snapToGrid(x, y) {
    const g = _grid();
    return { x: Math.floor(x / g) * g + g / 2, y: Math.floor(y / g) * g + g / 2 };
  }

  function activate(type, base) {
    if (!scene) return;
    cancel();

    const cfg = Network.getConfig();
    const def = cfg.buildingTypes && cfg.buildingTypes[type];
    if (!def) return;

    active = true;
    buildingType = type;
    baseType = base.baseType;
    baseId   = base.baseId;
    lineMode = (type === 'wall');
    lineDrawing = false;
    lineStart = null;

    if (typeof HdvPanel !== 'undefined' && HdvPanel.isVisible && HdvPanel.isVisible()) HdvPanel.close();
    if (typeof VillagePanel !== 'undefined' && VillagePanel.isVisible && VillagePanel.isVisible()) VillagePanel.close();

    const r = _baseRadius();
    const baseObj = _baseObj();
    if (!baseObj) { cancel(); return; }

    // Zone carrée — bordure cyan néon (palette spec)
    zoneRect = scene.add.graphics().setDepth(45);
    zoneRect.lineStyle(2, 0x22d3ee, 0.65);
    zoneRect.strokeRect(baseObj.x - r, baseObj.y - r, r * 2, r * 2);
    zoneRect.fillStyle(0x22d3ee, 0.05);
    zoneRect.fillRect(baseObj.x - r, baseObj.y - r, r * 2, r * 2);

    // Quadrillage léger à l'intérieur
    gridOverlay = scene.add.graphics().setDepth(46);
    gridOverlay.lineStyle(1, 0x22d3ee, 0.18);
    const g = _grid();
    const startX = baseObj.x - r, endX = baseObj.x + r;
    const startY = baseObj.y - r, endY = baseObj.y + r;
    // Aligne le premier trait sur la grille
    const firstX = Math.ceil(startX / g) * g;
    const firstY = Math.ceil(startY / g) * g;
    for (let xx = firstX; xx <= endX; xx += g) gridOverlay.lineBetween(xx, startY, xx, endY);
    for (let yy = firstY; yy <= endY; yy += g) gridOverlay.lineBetween(startX, yy, endX, yy);

    // 1er sprite fantôme à la position souris
    _spawnGhost(scene.input.activePointer.worldX, scene.input.activePointer.worldY);

    if (lineMode) {
      _toast(`🧱 Rempart : clique pour le 1er point, puis bouge pour tracer la ligne — ${def.cost} 💰 / case`);
    } else {
      _toast(`Place ton ${def.name} (clic = construire, clic droit / Échap = annuler) — ${def.cost} 💰`);
    }
  }

  function _spawnGhost(wx, wy) {
    const cfg = Network.getConfig();
    const def = cfg.buildingTypes[buildingType];
    const snap = snapToGrid(wx, wy);
    const ghost = scene.add.text(snap.x, snap.y, def.icon, {
      fontSize: '32px', fontFamily: '"Inter", system-ui, sans-serif',
    }).setOrigin(0.5, 0.5).setDepth(110).setAlpha(0.85);
    const mark = scene.add.circle(snap.x, snap.y, 22, 0x22c55e, 0.25)
      .setStrokeStyle(2, 0x22c55e, 0.9).setDepth(108);
    ghosts.push(ghost);
    validMarks.push(mark);
  }

  function _clearGhosts() {
    ghosts.forEach(g => g.destroy());
    validMarks.forEach(m => m.destroy());
    ghosts = [];
    validMarks = [];
  }

  // Génère la liste des cellules entre 2 points snap, en ligne droite H ou V (dominante)
  function _lineCells(startSnap, endSnap) {
    const g = _grid();
    const dx = endSnap.x - startSnap.x;
    const dy = endSnap.y - startSnap.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      // Horizontal
      const sign = dx >= 0 ? 1 : -1;
      const n = Math.abs(dx / g) + 1;
      const cells = [];
      for (let i = 0; i < n; i++) cells.push({ x: startSnap.x + sign * i * g, y: startSnap.y });
      return cells;
    } else {
      const sign = dy >= 0 ? 1 : -1;
      const n = Math.abs(dy / g) + 1;
      const cells = [];
      for (let i = 0; i < n; i++) cells.push({ x: startSnap.x, y: startSnap.y + sign * i * g });
      return cells;
    }
  }

  function update(worldX, worldY) {
    if (!active) return;

    const snap = snapToGrid(worldX, worldY);

    // Mode ligne (rempart) + 1er clic déjà fait : tracer la ligne
    if (lineMode && lineDrawing && lineStart) {
      const cells = _lineCells(lineStart, snap);
      // Resize sprites pour matcher le nombre de cellules
      while (ghosts.length < cells.length) _spawnGhost(0, 0);
      while (ghosts.length > cells.length) {
        ghosts.pop().destroy();
        validMarks.pop().destroy();
      }
      let allValid = true;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        ghosts[i].setPosition(c.x, c.y);
        validMarks[i].setPosition(c.x, c.y);
        const ok = _isPlacementValid(c.x, c.y);
        if (!ok) allValid = false;
        validMarks[i].setFillStyle(ok ? 0x22c55e : 0xfb7185, 0.25);
        validMarks[i].setStrokeStyle(2, ok ? 0x22c55e : 0xfb7185, 0.9);
        ghosts[i].setAlpha(ok ? 0.85 : 0.4);
      }
      // Toast compteur de coût
      const cfg = Network.getConfig();
      const wallCost = cfg.buildingTypes.wall.cost;
      const N = cells.length;
      const totalCost = N * wallCost;
      const myGold = (Network.getState().players[Network.getMyId()] || {}).gold || 0;
      const affordable = myGold >= totalCost;
      _toast(`🧱 ${N} rempart${N > 1 ? 's' : ''} × ${wallCost} = ${totalCost} 💰 ${affordable ? '' : '⛔ (gold insuffisant)'} — clic = poser, Échap = annuler`);
      return;
    }

    // Mode classique : 1 ghost qui suit
    if (ghosts.length === 0) _spawnGhost(worldX, worldY);
    const ghost = ghosts[0];
    const mark = validMarks[0];
    ghost.setPosition(snap.x, snap.y);
    mark.setPosition(snap.x, snap.y);
    const ok = _isPlacementValid(snap.x, snap.y);
    mark.setFillStyle(ok ? 0x22c55e : 0xfb7185, 0.25);
    mark.setStrokeStyle(2, ok ? 0x22c55e : 0xfb7185, 0.9);
    ghost.setAlpha(ok ? 0.85 : 0.4);
  }

  // Appelé par MainScene au clic gauche
  function tryPlace(worldX, worldY) {
    if (!active) return false;
    const snap = snapToGrid(worldX, worldY);

    if (lineMode) {
      // 1er clic : enregistre le point de départ et passe en mode dessin
      if (!lineDrawing) {
        if (!_isPlacementValid(snap.x, snap.y)) return false;
        lineStart = snap;
        lineDrawing = true;
        return true;
      }
      // 2e clic : valide la ligne complète
      const cells = _lineCells(lineStart, snap);
      const cfg = Network.getConfig();
      const wallCost = cfg.buildingTypes.wall.cost;
      const myGold = (Network.getState().players[Network.getMyId()] || {}).gold || 0;
      // Vérif globale : toutes les cases valides + assez de gold
      for (const c of cells) {
        if (!_isPlacementValid(c.x, c.y)) return false;
      }
      if (myGold < cells.length * wallCost) return false;
      // Envoi serveur (un buildBuilding par case)
      for (const c of cells) {
        Network.buildBuilding('wall', c.x, c.y, baseType, baseId);
      }
      cancel();
      return true;
    }

    // Mode classique : 1 clic = pose
    if (!_isPlacementValid(snap.x, snap.y)) return false;
    Network.buildBuilding(buildingType, snap.x, snap.y, baseType, baseId);
    cancel();
    return true;
  }

  function cancel() {
    active = false;
    buildingType = null;
    lineMode = false;
    lineDrawing = false;
    lineStart = null;
    _clearGhosts();
    if (zoneRect)    { zoneRect.destroy(); zoneRect = null; }
    if (gridOverlay) { gridOverlay.destroy(); gridOverlay = null; }
    _hideToast();
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

  function _isPlacementValid(snapX, snapY) {
    const baseObj = _baseObj();
    if (!baseObj) return false;
    const r = _baseRadius();
    // Doit être dans le carré (L∞)
    if (Math.max(Math.abs(snapX - baseObj.x), Math.abs(snapY - baseObj.y)) > r) return false;
    // Pas trop près d'un HDV / village existant
    const cfg = Network.getConfig();
    const minDistBase = cfg.buildingMinDistHdv || 70;
    const state = Network.getState();
    for (const p of Object.values(state.players || {})) {
      if (Math.hypot(snapX - p.x, snapY - p.y) < minDistBase) return false;
    }
    for (const v of (state.villages || [])) {
      if (Math.hypot(snapX - v.x, snapY - v.y) < minDistBase) return false;
    }
    // Case déjà occupée par un bâtiment
    for (const b of (state.buildings || [])) {
      if (b.x === snapX && b.y === snapY) return false;
    }
    return true;
  }

  function _toast(msg) {
    let el = document.getElementById('build-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'build-toast';
      el.style.cssText = `
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: rgba(15,23,42,0.95); color: #fff;
        font-family: 'Inter', sans-serif; font-weight: 600; font-size: 14px;
        padding: 10px 18px; border-radius: 10px;
        border: 1.5px solid rgba(251,191,36,0.6);
        z-index: 950; pointer-events: none;
        box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      `;
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
  }

  function _hideToast() {
    const el = document.getElementById('build-toast');
    if (el) el.style.display = 'none';
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && active) cancel();
  });

  return { init, activate, update, tryPlace, cancel, isActive };
})();
