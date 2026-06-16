// Mini-carte : canvas 200×200 en bas à gauche.
// Rendu : fog (exploré/visible), HDV, unités, villages, viewport caméra.
// Clic = téléporte la caméra ; maintien = drag continu (la caméra suit la souris).

const Minimap = (() => {
  let canvas, ctx;
  let phaserCamera = null;
  const SIZE = 200;

  function init(camera) {
    canvas = document.getElementById('minimap');
    if (!canvas) return;
    ctx    = canvas.getContext('2d');
    phaserCamera = camera;

    // Conversion écran → monde (clampée à la map) + recentrage caméra
    const centerFromEvent = (e) => {
      if (!phaserCamera) return;
      const info = Network.getMapInfo();
      const rect = canvas.getBoundingClientRect();
      const wx = Math.max(0, Math.min(info.mapWidth,  ((e.clientX - rect.left) / rect.width)  * info.mapWidth));
      const wy = Math.max(0, Math.min(info.mapHeight, ((e.clientY - rect.top)  / rect.height) * info.mapHeight));
      phaserCamera.centerOn(wx, wy);
    };

    // Drag continu : mousedown recentre immédiatement, puis la caméra suit la
    // souris tant que le bouton est enfoncé — même si elle sort de la mini-carte
    // (listeners move/up sur window, pas sur le canvas).
    let dragging = false;
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      centerFromEvent(e);
    });
    window.addEventListener('mousemove', (e) => {
      if (dragging) centerFromEvent(e);
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  }

  function render() {
    if (!ctx) return;
    const info  = Network.getMapInfo();
    const state = Network.getState();
    const myId  = Network.getMyId();
    if (!myId) return;

    const W = info.mapWidth, H = info.mapHeight;
    const sx = SIZE / W, sy = SIZE / H;

    // Background — bleu-nuit profond (cohérent avec le nouveau fond du jeu,
    // un cran plus bleu que l'ancien #06101a quasi-noir).
    ctx.fillStyle = '#0a1622';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Fog : exploré = alpha 0.55, jamais vu = alpha 0.96, visible = transparent.
    if (state.fog && state.fog.visible && state.fog.explored) {
      const gw = state.fog.gridW || info.gridW;
      const gh = state.fog.gridH || info.gridH;
      const ts = (state.fog.tileSize || info.tileSize) * sx;
      const vis = state.fog.visible, exp = state.fog.explored;
      for (let ty = 0; ty < gh; ty++) {
        for (let tx = 0; tx < gw; tx++) {
          const i = ty * gw + tx;
          if (vis[i]) continue;
          ctx.fillStyle = exp[i] ? 'rgba(4,8,12,0.55)' : 'rgba(2,5,8,0.96)';
          ctx.fillRect(tx * (info.tileSize * sx), ty * (info.tileSize * sy), ts + 0.5, ts + 0.5);
        }
      }
    }

    const fcol = (pid, type) => {
      if (typeof Theme === 'undefined') return '#94a3b8';
      return pid ? Theme.factionColorStr(pid, type) : Theme.NEUTRAL_STR;
    };

    // Mur du monde : fin liseré cyan au bord (rappel du « mur » diep.io en jeu).
    // Le liseré doré d'omniscience (plus bas) le remplace quand actif.
    if (!state.omniscient) {
      ctx.strokeStyle = 'rgba(34,211,238,0.30)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);
    }

    // Passif Renaissance (minimap_omniscience) : le serveur envoie `omniscient`
    // = positions BRUTES de TOUT (hors fog). On l'utilise comme source quand il
    // est présent → la mini-carte révèle tous les mouvements ennemis.
    const omni     = state.omniscient || null;
    const villages = omni ? omni.villages : (state.villages || []);
    const players  = omni ? omni.players  : Object.values(state.players || {});
    const units    = omni ? omni.units    : Object.values(state.units || {});
    if (omni) {
      // Liseré doré discret = omniscience active
      ctx.strokeStyle = 'rgba(251,191,36,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);
    }

    // Villages (carré 4×4)
    for (const v of villages) {
      const px = v.x * sx, py = v.y * sy;
      ctx.fillStyle = v.ownerId ? fcol(v.ownerId) : '#64748b';
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }

    // HDV (carré 6×6 couleur équipe)
    for (const p of players) {
      if (p.eliminated) continue;
      const px = p.x * sx, py = p.y * sy;
      ctx.fillStyle = fcol(p.id);
      ctx.fillRect(px - 3, py - 3, 6, 6);
    }

    // Unités (carré 2×2) — y compris les neutres visibles (barbares rouges, faune)
    // dont le "propriétaire" n'est pas dans state.players. Theme résout leur couleur.
    for (const u of units) {
      ctx.fillStyle = fcol(u.ownerId, u.type);
      ctx.fillRect(u.x * sx - 1, u.y * sy - 1, 2, 2);
    }

    // Camps PvE — losange rouge clignotant si pas nettoyé
    const camps = state.camps || [];
    if (camps.length) {
      const pulse = (Math.sin(Date.now() / 350) + 1) / 2; // 0..1
      ctx.save();
      for (const c of camps) {
        const px = c.x * sx, py = c.y * sy;
        if (c.cleared) {
          // Camp nettoyé : losange gris discret
          ctx.fillStyle = 'rgba(100,116,139,0.55)';
        } else {
          ctx.fillStyle = `rgba(239,68,68,${0.55 + pulse * 0.4})`;
        }
        ctx.beginPath();
        ctx.moveTo(px, py - 3);
        ctx.lineTo(px + 3, py);
        ctx.lineTo(px, py + 3);
        ctx.lineTo(px - 3, py);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // Viewport caméra (cyan)
    if (phaserCamera) {
      const cam = phaserCamera;
      const x1 = Math.max(0,    cam.worldView.x * sx);
      const y1 = Math.max(0,    cam.worldView.y * sy);
      const x2 = Math.min(SIZE, (cam.worldView.x + cam.worldView.width)  * sx);
      const y2 = Math.min(SIZE, (cam.worldView.y + cam.worldView.height) * sy);
      if (x2 > x1 && y2 > y1) {
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      }
    }
  }

  return { init, render };
})();
