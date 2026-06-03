// Tech Tree Overlay v2 — UI radiale à 3 axes (Science / Magie / Religion).
// SVG plein écran avec pan + zoom + clic pour débloquer un nœud.
// Touche T pour ouvrir / fermer.

const TechTreeOverlay = (() => {
  let isOpen = false;
  let root  = null;          // div overlay
  let svg   = null;          // <svg> Phaser-like
  let stage = null;          // <g> transformé (pan/zoom)
  let info  = null;          // div d'info / tooltip flottant

  // État pan/zoom
  let view = { x: 0, y: 0, scale: 1 };
  let drag = null;

  // Couleurs des axes
  const AXIS_COLORS = {
    science:  { stroke: '#3b82f6', glow: 'rgba(59,130,246,0.5)',  name: '🔬 Science'  },
    magic:    { stroke: '#a855f7', glow: 'rgba(168,85,247,0.5)',  name: '✨ Magie'    },
    religion: { stroke: '#f59e0b', glow: 'rgba(245,158,11,0.5)',  name: '⛪ Religion' },
  };

  function ensureDOM() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'tech-tree-overlay';
    root.style.cssText = `
      position: fixed; inset: 0; z-index: 1500;
      background: radial-gradient(circle at center, rgba(15,23,42,0.96) 0%, rgba(2,6,23,0.99) 100%);
      display: none; overflow: hidden;
      font-family: 'Quicksand', sans-serif; color: #f1f5f9;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      position: absolute; top: 0; left: 0; right: 0; padding: 14px 20px;
      display: flex; justify-content: space-between; align-items: center;
      pointer-events: none; z-index: 10;
    `;
    header.innerHTML = `
      <div style="display:flex; gap:18px; align-items:center; pointer-events:auto;">
        <h2 style="margin:0; font-size: 22px; font-weight: 700;">🌳 Arbre des Technologies</h2>
        <div style="font-size: 14px; color: #94a3b8;">Pan : drag &nbsp;·&nbsp; Zoom : molette &nbsp;·&nbsp; Échap : fermer</div>
      </div>
      <div id="tt-resources" style="display:flex; gap:14px; font-size: 15px; font-weight: 700; pointer-events:auto;">
        <span>🔬 <span id="tt-pr">0</span> PR</span>
        <span style="color:#a855f7;">🔮 <span id="tt-mana">0</span></span>
        <span style="color:#f59e0b;">🙏 <span id="tt-faith">0</span></span>
        <button id="tt-close" style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#fff; padding:6px 14px; border-radius:6px; cursor:pointer; font-family:inherit; font-weight:700;">✕</button>
      </div>
    `;
    root.appendChild(header);

    // SVG canvas
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.cssText = `position: absolute; inset: 0; cursor: grab; user-select: none;`;
    stage = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(stage);
    root.appendChild(svg);

    // Tooltip flottant
    info = document.createElement('div');
    info.id = 'tt-tooltip';
    info.style.cssText = `
      position: absolute; pointer-events: none; display: none;
      background: rgba(15,23,42,0.97); border: 1.5px solid rgba(255,255,255,0.2);
      padding: 12px 14px; border-radius: 10px; max-width: 280px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5); z-index: 20;
      font-size: 13px; line-height: 1.5;
    `;
    root.appendChild(info);

    document.body.appendChild(root);

    // Events
    root.querySelector('#tt-close').addEventListener('click', close);
    // Note : le listener T global est attaché au load via _bindGlobalKeys() ci-dessous,
    // pas ici (sinon T n'aurait jamais marché car ensureDOM() est appelé depuis open()
    // → on a besoin de T pour ouvrir → cycle vicieux)

    // Pan (avec coalesce via rAF pour rester fluide)
    let panRafPending = false;
    svg.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      drag = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, lastX: e.clientX, lastY: e.clientY };
      svg.style.cursor = 'grabbing';
      _hideTooltip();
    });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      drag.lastX = e.clientX; drag.lastY = e.clientY;
      if (panRafPending) return;
      panRafPending = true;
      requestAnimationFrame(() => {
        panRafPending = false;
        if (!drag) return;
        view.x = drag.vx + (drag.lastX - drag.sx);
        view.y = drag.vy + (drag.lastY - drag.sy);
        _applyTransform();
      });
    });
    window.addEventListener('mouseup', () => {
      if (drag) { drag = null; svg.style.cursor = 'grab'; }
    });

    // Zoom
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.25, Math.min(2.5, view.scale * factor));
      // Zoom centré sur la souris
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = (mx - view.x) / view.scale;
      const cy = (my - view.y) / view.scale;
      view.scale = newScale;
      view.x = mx - cx * view.scale;
      view.y = my - cy * view.scale;
      _applyTransform();
    }, { passive: false });
  }

  function _applyTransform() {
    if (!stage) return;
    stage.setAttribute('transform', `translate(${view.x}, ${view.y}) scale(${view.scale})`);
  }

  function open() {
    ensureDOM();
    isOpen = true;
    root.style.display = 'block';
    // Centre la vue ; tree va de y≈-1240 (haut Science) à y≈+1100 (bas axes M/R) → on remonte le centre
    const w = window.innerWidth, h = window.innerHeight;
    view = { x: w / 2, y: h / 2 + 220, scale: 0.45 };
    _applyTransform();
    // Pause la scène Phaser pour décharger le rendu de fond
    try {
      if (typeof game !== 'undefined' && game.scene && game.scene.isActive('MainScene')) {
        game.scene.pause('MainScene');
      }
    } catch (_) {}
    refresh();
  }

  function close() {
    if (!root) return;
    isOpen = false;
    root.style.display = 'none';
    info.style.display = 'none';
    try {
      if (typeof game !== 'undefined' && game.scene && game.scene.isPaused('MainScene')) {
        game.scene.resume('MainScene');
      }
    } catch (_) {}
  }

  function toggle() { isOpen ? close() : open(); }

  // Bindings clavier globaux attachés au load (pas dans ensureDOM, sinon T jamais utilisable)
  document.addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.key === 'Escape' && isOpen) { close(); return; }
    if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      toggle();
    }
  });

  function refresh() {
    if (!isOpen || !stage) return;
    const cfg = Network.getConfig();
    const tt  = cfg.techTree || {};
    const me  = (Network.getState().players || {})[Network.getMyId()];
    if (!me) return;

    // Update resources header
    document.getElementById('tt-pr').textContent    = Math.floor(me.researchPoints || 0);
    document.getElementById('tt-mana').textContent  = Math.floor(me.mana || 0);
    document.getElementById('tt-faith').textContent = Math.floor(me.faith || 0);

    // Vide le stage et redessine entièrement (au début c'est OK car ~50 nœuds)
    while (stage.firstChild) stage.removeChild(stage.firstChild);

    // 1. HDV central (noyau)
    const core = _circle(0, 0, 38, '#fbbf24', '#7c5e10', 3);
    stage.appendChild(core);
    const coreIcon = _text(0, 6, '🏛', 32);
    stage.appendChild(coreIcon);
    const coreLabel = _text(0, 60, 'HDV', 13, '#fbbf24');
    coreLabel.setAttribute('font-weight', '700');
    stage.appendChild(coreLabel);

    // 2. Lignes de connexion (prérequis → tech)
    const unlocked = me.unlockedTechs || [];
    for (const node of Object.values(tt)) {
      const reqs = node.requires || [];
      const from = reqs.length === 0 ? { x: 0, y: 0 } : null; // depuis le centre si pas de prereq
      if (from) {
        _drawLink(stage, from, node.pos, unlocked.includes(node.id), node.axis);
      } else {
        for (const reqId of reqs) {
          const reqNode = tt[reqId];
          if (!reqNode) continue;
          const linkActive = unlocked.includes(reqId);
          _drawLink(stage, reqNode.pos, node.pos, linkActive && unlocked.includes(node.id), node.axis, linkActive);
        }
      }
    }

    // 3. Nœuds tech
    for (const node of Object.values(tt)) {
      _drawNode(stage, node, me);
    }
  }

  function _drawLink(parent, from, to, fullActive, axis, prereqMet) {
    // Bézier doux entre 2 points
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    // Courbe légèrement bombée vers l'extérieur (perpendiculaire)
    const px = -dy / dist * Math.min(30, dist * 0.15);
    const py =  dx / dist * Math.min(30, dist * 0.15);
    path.setAttribute('d', `M${from.x},${from.y} Q${mx + px},${my + py} ${to.x},${to.y}`);
    path.setAttribute('fill', 'none');
    const color = AXIS_COLORS[axis] || AXIS_COLORS.science;
    if (fullActive) {
      path.setAttribute('stroke', color.stroke);
      path.setAttribute('stroke-width', '3');
      path.setAttribute('stroke-opacity', '0.9');
    } else if (prereqMet) {
      path.setAttribute('stroke', color.stroke);
      path.setAttribute('stroke-width', '2');
      path.setAttribute('stroke-opacity', '0.55');
      path.setAttribute('stroke-dasharray', '4,4');
    } else {
      path.setAttribute('stroke', '#475569');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('stroke-opacity', '0.35');
    }
    parent.appendChild(path);
  }

  function _drawNode(parent, node, me) {
    const tt = (Network.getConfig().techTree || {});
    const unlocked = me.unlockedTechs || [];
    const isUnlocked   = unlocked.includes(node.id);
    const prereqMet    = (node.requires || []).every(r => unlocked.includes(r));
    const canAfford    = (me.researchPoints || 0) >= node.cost;
    const isAvailable  = !isUnlocked && prereqMet;
    const axisCol      = AXIS_COLORS[node.axis] || AXIS_COLORS.science;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${node.pos.x}, ${node.pos.y})`);
    g.style.cursor = isAvailable && canAfford ? 'pointer' : (isUnlocked ? 'default' : 'not-allowed');

    // Bg circle
    const r = 30;
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bg.setAttribute('r', r);
    if (isUnlocked) {
      bg.setAttribute('fill', '#fbbf24'); // doré
      bg.setAttribute('stroke', '#fff8d6');
      bg.setAttribute('stroke-width', '3');
    } else if (isAvailable && canAfford) {
      bg.setAttribute('fill', axisCol.stroke);
      bg.setAttribute('stroke', '#fff');
      bg.setAttribute('stroke-width', '2.5');
    } else if (isAvailable) {
      // Prereq OK mais pas assez de PR
      bg.setAttribute('fill', axisCol.stroke);
      bg.setAttribute('fill-opacity', '0.5');
      bg.setAttribute('stroke', axisCol.stroke);
      bg.setAttribute('stroke-width', '2');
      bg.setAttribute('stroke-dasharray', '3,3');
    } else {
      bg.setAttribute('fill', '#1e293b');
      bg.setAttribute('stroke', '#475569');
      bg.setAttribute('stroke-width', '2');
    }
    g.appendChild(bg);

    // Halo (animation CSS via class) si débloqué
    if (isUnlocked) {
      const halo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      halo.setAttribute('r', r + 4);
      halo.setAttribute('fill', 'none');
      halo.setAttribute('stroke', '#fbbf24');
      halo.setAttribute('stroke-opacity', '0.45');
      halo.setAttribute('stroke-width', '2');
      g.insertBefore(halo, bg);
    }

    // Icône emoji centrée
    const ic = _text(0, 6, node.icon || '?', 22);
    g.appendChild(ic);

    // Label (nom)
    const lbl = _text(0, r + 14, node.name, 11, '#f1f5f9');
    lbl.setAttribute('font-weight', '700');
    lbl.setAttribute('paint-order', 'stroke');
    lbl.setAttribute('stroke', '#000');
    lbl.setAttribute('stroke-width', '2.5');
    g.appendChild(lbl);

    // Coût
    const costEl = _text(0, r + 27, isUnlocked ? '✓ Acquise' : `${node.cost} PR`, 10, isUnlocked ? '#86efac' : (canAfford ? '#fbbf24' : '#94a3b8'));
    costEl.setAttribute('font-weight', '600');
    g.appendChild(costEl);

    // Tooltip
    g.addEventListener('mouseenter', (e) => _showTooltip(e, node, me));
    g.addEventListener('mousemove',  (e) => _moveTooltip(e));
    g.addEventListener('mouseleave', () => _hideTooltip());

    // Click → unlock
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isAvailable || !canAfford) return;
      Network.unlockTech(node.id);
    });

    parent.appendChild(g);
  }

  function _showTooltip(e, node, me) {
    if (!info) return;
    const cfg = Network.getConfig();
    const tt  = cfg.techTree || {};
    const unlocked = me.unlockedTechs || [];
    const reqsHtml = (node.requires || []).map(r => {
      const reqNode = tt[r];
      if (!reqNode) return '';
      const ok = unlocked.includes(r);
      return `<span style="color:${ok ? '#86efac' : '#fca5a5'};">${ok ? '✓' : '✗'} ${reqNode.name}</span>`;
    }).join(', ') || '<em style="color:#94a3b8;">Aucun prérequis</em>';

    const unlocksHtml = [];
    const u = node.unlocks || {};
    if (u.units && u.units.length)         unlocksHtml.push(`<div>🪖 Unités : ${u.units.join(', ')}</div>`);
    if (u.buildings && u.buildings.length) unlocksHtml.push(`<div>🏗 Bâtiments : ${u.buildings.join(', ')}</div>`);
    if (u.spells && u.spells.length)       unlocksHtml.push(`<div>✨ Sorts : ${u.spells.join(', ')}</div>`);
    if (u.passives && u.passives.length)   unlocksHtml.push(`<div>⚡ Passifs : ${u.passives.join(', ')}</div>`);

    const axisCol = AXIS_COLORS[node.axis] || AXIS_COLORS.science;
    info.innerHTML = `
      <div style="font-size: 16px; font-weight: 700; color: ${axisCol.stroke}; margin-bottom: 4px;">${node.icon} ${node.name}</div>
      <div style="color: #cbd5e1; margin-bottom: 8px;">${node.desc}</div>
      <div style="font-size: 12px; color: #94a3b8;"><strong>Coût :</strong> ${node.cost} PR</div>
      <div style="font-size: 12px; color: #94a3b8;"><strong>Prérequis :</strong> ${reqsHtml}</div>
      ${unlocksHtml.length ? `<div style="margin-top:6px; font-size:12px; color:#cbd5e1;">${unlocksHtml.join('')}</div>` : ''}
    `;
    info.style.display = 'block';
    _moveTooltip(e);
  }

  function _moveTooltip(e) {
    if (!info || info.style.display === 'none') return;
    const offX = 16, offY = 16;
    const rect = info.getBoundingClientRect();
    let x = e.clientX + offX;
    let y = e.clientY + offY;
    if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - offX;
    if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - offY;
    info.style.left = x + 'px';
    info.style.top  = y + 'px';
  }

  function _hideTooltip() {
    if (info) info.style.display = 'none';
  }

  // Helpers SVG
  function _circle(cx, cy, r, fill, stroke, sw) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
    c.setAttribute('fill', fill);
    if (stroke) { c.setAttribute('stroke', stroke); c.setAttribute('stroke-width', sw || 2); }
    return c;
  }
  function _text(x, y, content, size, color) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', size || 14);
    if (color) t.setAttribute('fill', color);
    t.style.fontFamily = '"Quicksand", sans-serif';
    t.textContent = content;
    return t;
  }

  // Update léger des seuls compteurs du header (appelé par network.js sur chaque gameState)
  function updateResources(me) {
    if (!isOpen || !me) return;
    const pr   = document.getElementById('tt-pr');
    const mana = document.getElementById('tt-mana');
    const fa   = document.getElementById('tt-faith');
    if (pr)   pr.textContent   = Math.floor(me.researchPoints || 0);
    if (mana) mana.textContent = Math.floor(me.mana  || 0);
    if (fa)   fa.textContent   = Math.floor(me.faith || 0);
  }

  return { open, close, toggle, refresh, updateResources, isOpen: () => isOpen };
})();
