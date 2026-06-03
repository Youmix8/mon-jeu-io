// Roue d'action : appui long sur clic droit → menu radial avec 3 options
// (Attaquer / Déplacer / Défendre). Glisse pour choisir, relâche pour valider.

const RadialMenu = (() => {
  let isOpen = false;
  let pressTimer = null;
  let pressX = 0, pressY = 0;
  let worldX = 0, worldY = 0;
  let scene = null;
  let elements = null; // { bg, segments[], icons[], labels[], divider }
  let highlighted = -1;

  const LONG_PRESS_MS = 220;
  const RADIUS_OUTER = 100;
  const RADIUS_INNER = 32;

  // 3 segments : Attaquer (haut), Déplacer (bas-gauche), Défendre (bas-droite)
  // Angles : haut = -π/2, bas-gauche = π/2 + π/3, bas-droite = π/2 - π/3
  const OPTIONS = [
    { id: 'attack', label: 'Attaquer', icon: '⚔', color: 0xfb7185, angle: -Math.PI / 2 },                            // rose-rouge néon
    { id: 'move',   label: 'Déplacer', icon: '🚶', color: 0x22d3ee, angle:  Math.PI / 2 + Math.PI * 2 / 3 },          // cyan
    { id: 'defend', label: 'Défendre', icon: '🛡', color: 0xfbbf24, angle:  Math.PI / 2 - Math.PI * 2 / 3 },          // or
  ];

  function init(phaserScene) {
    scene = phaserScene;
  }

  // Appelé sur right-mousedown
  function startPress(screenX, screenY, _worldX, _worldY) {
    pressX = screenX; pressY = screenY;
    worldX = _worldX; worldY = _worldY;
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      pressTimer = null;
      _show(screenX, screenY);
    }, LONG_PRESS_MS);
  }

  // Appelé sur right-mousemove pendant l'appui
  function updateMove(screenX, screenY) {
    if (!isOpen) return;
    // Détermine quel segment est survolé selon l'angle vers (pressX, pressY)
    const dx = screenX - pressX;
    const dy = screenY - pressY;
    const dist = Math.hypot(dx, dy);
    if (dist < RADIUS_INNER) {
      _highlight(-1);
      return;
    }
    let ang = Math.atan2(dy, dx);
    let bestIdx = -1, bestDiff = Infinity;
    OPTIONS.forEach((opt, i) => {
      let diff = Math.abs(ang - opt.angle);
      // wrap-around
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    });
    // 60° de tolérance par segment (PI/3 ≈ 60°)
    _highlight(bestDiff < Math.PI / 2.5 ? bestIdx : -1);
  }

  // Appelé sur right-mouseup
  // Retourne : 'attack' | 'move' | 'defend' | null (annulé ou trop court)
  function endPress() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    if (!isOpen) return null;
    const picked = highlighted;
    _hide();
    return picked >= 0 ? OPTIONS[picked].id : null;
  }

  function getWorldPos() { return { x: worldX, y: worldY }; }
  function isActive() { return isOpen; }

  function _show(screenX, screenY) {
    if (!scene) return;
    isOpen = true;
    highlighted = -1;

    // Convertir screen → world (pour positionner dans la scène)
    const cam = scene.cameras.main;
    const wx = cam.scrollX + screenX / cam.zoom;
    const wy = cam.scrollY + screenY / cam.zoom;

    elements = { segments: [], icons: [], labels: [] };

    // Fond circulaire — palette obsidienne néon (cyan border)
    elements.bg = scene.add.circle(wx, wy, RADIUS_OUTER, 0x0a121a, 0.88)
      .setStrokeStyle(2, 0x22d3ee, 0.85)
      .setDepth(900);
    elements.center = scene.add.circle(wx, wy, RADIUS_INNER, 0x070d11, 0.95)
      .setStrokeStyle(1.5, 0x1e3a45, 0.9)
      .setDepth(901);

    // Pour chaque option, dessine un segment (graphics) + icône + label
    OPTIONS.forEach((opt, i) => {
      // Arc de cercle ; segment de 120° centré sur opt.angle
      const g = scene.add.graphics().setDepth(900);
      const halfArc = Math.PI / 3 - 0.08; // un peu de gap entre segments
      g.fillStyle(opt.color, 0.25);
      g.beginPath();
      g.moveTo(wx, wy);
      g.arc(wx, wy, RADIUS_OUTER, opt.angle - halfArc, opt.angle + halfArc, false);
      g.closePath();
      g.fillPath();
      g.lineStyle(2, opt.color, 0.8);
      g.beginPath();
      g.arc(wx, wy, RADIUS_OUTER, opt.angle - halfArc, opt.angle + halfArc, false);
      g.strokePath();
      elements.segments.push(g);

      // Icône + label au centre du segment (à mi-chemin entre inner et outer)
      const iconR = (RADIUS_INNER + RADIUS_OUTER) / 2;
      const ix = wx + Math.cos(opt.angle) * iconR;
      const iy = wy + Math.sin(opt.angle) * iconR;
      const iconText = scene.add.text(ix, iy - 8, opt.icon, {
        fontSize: '28px', fontFamily: '"Inter", system-ui, sans-serif',
      }).setOrigin(0.5, 0.5).setDepth(902);
      const labelText = scene.add.text(ix, iy + 16, opt.label, {
        fontSize: '11px', fontFamily: '"Inter", system-ui, sans-serif', fontStyle: 'bold',
        color: '#fff', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5, 0.5).setDepth(902);
      elements.icons.push(iconText);
      elements.labels.push(labelText);
    });
  }

  function _highlight(idx) {
    if (!elements || highlighted === idx) return;
    highlighted = idx;
    elements.segments.forEach((g, i) => {
      g.setAlpha(i === idx ? 1.0 : 0.7);
    });
    elements.icons.forEach((t, i) => {
      t.setScale(i === idx ? 1.2 : 1.0);
    });
  }

  function _hide() {
    if (!elements) { isOpen = false; return; }
    if (elements.bg) elements.bg.destroy();
    if (elements.center) elements.center.destroy();
    elements.segments.forEach(g => g.destroy());
    elements.icons.forEach(t => t.destroy());
    elements.labels.forEach(t => t.destroy());
    elements = null;
    isOpen = false;
    highlighted = -1;
  }

  return { init, startPress, updateMove, endPress, isActive, getWorldPos };
})();
