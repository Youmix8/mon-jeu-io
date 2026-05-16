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

    // Villages (visibles dans state.villages)
    for (const v of (state.villages || [])) {
      const px = v.x * sx, py = v.y * sy;
      const owner = v.ownerId && state.players[v.ownerId];
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = owner ? owner.color : '#cccccc';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // HDV — gros carré coloré, le mien avec contour blanc
    for (const p of Object.values(state.players || {})) {
      const px = p.x * sx, py = p.y * sy;
      ctx.fillStyle = p.color;
      ctx.fillRect(px - 4, py - 4, 8, 8);
      if (p.id === myId) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px - 4, py - 4, 8, 8);
      }
    }

    // Unités (filtered → uniquement les miennes + ennemis visibles)
    for (const u of Object.values(state.units || {})) {
      const owner = state.players[u.ownerId];
      if (!owner) continue;
      ctx.fillStyle = owner.color;
      ctx.beginPath();
      ctx.arc(u.x * sx, u.y * sy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Viewport caméra (rectangle blanc)
    if (phaserCamera) {
      const cam = phaserCamera;
      const vx = cam.worldView.x * sx;
      const vy = cam.worldView.y * sy;
      const vw = cam.worldView.width  * sx;
      const vh = cam.worldView.height * sy;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vx, vy, vw, vh);
    }
  }

  return { init, render };
})();
