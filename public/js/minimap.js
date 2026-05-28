// Mini-carte : canvas 200×200 en bas à gauche.
// Rendu : fog (exploré/visible), HDV, unités, villages, viewport caméra.
// Clic = téléporte la caméra vers cette position.

const Minimap = (() => {
  let canvas, ctx;
  let phaserCamera = null;
  const SIZE = 200;

  function init(camera) {
    canvas = document.getElementById('minimap');
    if (!canvas) return;
    ctx    = canvas.getContext('2d');
    phaserCamera = camera;

    canvas.addEventListener('click', (e) => {
      if (!phaserCamera) return;
      const info = Network.getMapInfo();
      const rect = canvas.getBoundingClientRect();
      const wx = ((e.clientX - rect.left) / rect.width)  * info.mapWidth;
      const wy = ((e.clientY - rect.top)  / rect.height) * info.mapHeight;
      phaserCamera.centerOn(wx, wy);
    });
  }

  function render() {
    if (!ctx) return;
    const info  = Network.getMapInfo();
    const state = Network.getState();
    const myId  = Network.getMyId();
    if (!myId) return;
    const me = state.players[myId];

    const W = info.mapWidth, H = info.mapHeight;
    const sx = SIZE / W, sy = SIZE / H;

    // Background — pelouse
    ctx.fillStyle = '#6f9a64';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Fog : explored = gris foncé, unexplored = noir, visible = transparent
    if (state.fog && state.fog.visible && state.fog.explored) {
      const gw = state.fog.gridW || info.gridW;
      const gh = state.fog.gridH || info.gridH;
      const ts = (state.fog.tileSize || info.tileSize) * sx;
      const vis = state.fog.visible, exp = state.fog.explored;
      for (let ty = 0; ty < gh; ty++) {
        for (let tx = 0; tx < gw; tx++) {
          const i = ty * gw + tx;
          if (vis[i]) continue; // visible : laisse passer le fond
          ctx.fillStyle = exp[i] ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.95)';
          ctx.fillRect(tx * (info.tileSize * sx), ty * (info.tileSize * sy), ts + 0.5, ts + 0.5);
        }
      }
    }

    // ── Sources de données ──
    // Si le passif d'omniscience minimap est actif (tech 'renaissance'),
    // le serveur envoie des positions BRUTES non filtrées par fog → on
    // les utilise pour tout afficher en permanence sur la minimap.
    const omni = state.omniscient;
    const villages    = omni ? omni.villages : (state.villages || []);
    const playersList = omni ? omni.players  : Object.values(state.players || {});
    const unitsList   = omni ? omni.units    : Object.values(state.units   || {});
    // Index couleur par ownerId (omniscient.players contient color)
    const colorByPid = {};
    if (omni) {
      for (const p of omni.players) colorByPid[p.id] = p.color;
    } else {
      for (const p of playersList) colorByPid[p.id] = p.color;
    }

    // Villages
    for (const v of villages) {
      const px = v.x * sx, py = v.y * sy;
      const ownerColor = v.ownerId ? colorByPid[v.ownerId] : null;
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = ownerColor || '#cccccc';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // HDV — gros carré coloré, le mien avec contour blanc
    for (const p of playersList) {
      const px = p.x * sx, py = p.y * sy;
      ctx.fillStyle = p.color || '#888';
      ctx.fillRect(px - 4, py - 4, 8, 8);
      if (p.id === myId) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px - 4, py - 4, 8, 8);
      }
    }

    // Unités
    for (const u of unitsList) {
      const ownerColor = colorByPid[u.ownerId];
      if (!ownerColor) continue;
      ctx.fillStyle = ownerColor;
      ctx.beginPath();
      ctx.arc(u.x * sx, u.y * sy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Indicateur "Omniscience active" : œil doré clignotant en haut-gauche
    if (omni) {
      const blink = 0.7 + 0.3 * Math.sin(Date.now() / 350);
      ctx.fillStyle = `rgba(251, 191, 36, ${blink.toFixed(2)})`;
      ctx.font = '700 12px Quicksand, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText('👁', 4, 4);
    }

    // Viewport caméra (rectangle blanc) — clampé aux bornes de la mini-carte
    if (phaserCamera) {
      const cam = phaserCamera;
      const x1 = Math.max(0,    cam.worldView.x * sx);
      const y1 = Math.max(0,    cam.worldView.y * sy);
      const x2 = Math.min(SIZE, (cam.worldView.x + cam.worldView.width)  * sx);
      const y2 = Math.min(SIZE, (cam.worldView.y + cam.worldView.height) * sy);
      if (x2 > x1 && y2 > y1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      }
    }
  }

  return { init, render };
})();
