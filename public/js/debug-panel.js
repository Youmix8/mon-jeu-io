// ════════════════════════════════════════════════════════════════════
// DebugPanel — panneau debug bottom-right pour spawn + tuning tailles.
//
// DEBUG — à retirer après branchement arbre tech.
//
// Modes :
//   SPAWN : boutons par catégorie qui spawnent gratuitement au curseur.
//   TUNING : clic sur un sprite en jeu → popup slider scale 0.3-3.0
//           Le scale s'applique IMMÉDIATEMENT sur toutes les instances du type.
//           Bouton EXPORTER CONFIG → console.log d'un bloc prêt à coller.
//
// Touche H : toggle visibilité du panneau.
// ════════════════════════════════════════════════════════════════════

const DebugPanel = (() => {
  let panel = null, popup = null;
  let mode  = 'spawn';      // 'spawn' | 'tuning'
  let visible = true;
  let pendingSpawn = null;  // { entityType } — clic sur la map = spawn
  let currentTunedType = null;
  // Overrides scale appliqués via tuning (entityType → scale)
  const scaleOverrides = {};

  function init() {
    panel = document.createElement('div');
    panel.id = 'debug-panel';
    document.body.appendChild(panel);

    popup = document.createElement('div');
    popup.id = 'debug-tuning-popup';
    document.body.appendChild(popup);

    _render();
    _bindKeys();
  }

  function _bindKeys() {
    window.addEventListener('keydown', (e) => {
      // Ignore si tape dans un input
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === 'h' || e.key === 'H') {
        // Évite collision avec le sort Bénédiction (3) qui utilise aussi H via Phaser
        // → on autorise H ssi pas d'unités sélectionnées
        visible = !visible;
        panel.classList.toggle('hidden', !visible);
      }
    });
  }

  function _categoriesOfEntities() {
    if (typeof ENTITIES_CONFIG === 'undefined') return {};
    const out = { science: [], magic: [], religion: [], spells: [] };
    for (const [key, cfg] of Object.entries(ENTITIES_CONFIG)) {
      if (cfg.category && out[cfg.category]) out[cfg.category].push({ key, cfg });
    }
    // Sorts (en dur, mappés aux events serveur)
    out.spells = [
      { key: 'fireball', label: '🔥 Boule de feu' },
      { key: 'freeze',   label: '❄️ Gel' },
      { key: 'blessing', label: '✝️ Bénédiction' },
      { key: 'purifying_light', label: '🌟 Lumière pure' },
    ];
    return out;
  }

  function _render() {
    const cats = _categoriesOfEntities();
    const modeLabel = mode === 'spawn' ? '🎯 MODE SPAWN' : '📏 MODE TUNING';

    let html = `
      <button class="mode-toggle" id="dbg-mode-toggle">${modeLabel} (clic pour basculer)</button>
      <div class="debug-warn">DEBUG — à retirer après branchement arbre tech</div>
      <h3>${mode === 'spawn' ? 'Spawn (clic bouton → clic map)' : 'Tuning (clic sprite en jeu)'}</h3>
    `;

    if (mode === 'spawn') {
      const blocks = [
        { title: '🔬 Science',  list: cats.science  || [] },
        { title: '🔮 Magie',    list: cats.magic    || [] },
        { title: '✝️ Religion', list: cats.religion || [] },
      ];
      for (const b of blocks) {
        html += `<div class="debug-section"><div class="debug-section-title">${b.title}</div>`;
        for (const e of b.list) {
          html += `<button data-spawn="${e.key}">${e.key}</button>`;
        }
        html += '</div>';
      }
      html += `<div class="debug-section"><div class="debug-section-title">🪄 Sorts (au curseur)</div>`;
      for (const s of cats.spells) {
        html += `<button data-spell="${s.key}">${s.label}</button>`;
      }
      html += `</div>`;
      html += `<div class="debug-section" style="font-size:10px;color:#94a3b8;">
        Raccourcis : <b>1</b>🔥 <b>2</b>❄️ <b>3</b>✝️ <b>4</b>🌟 <b>5</b>🌀portal
      </div>`;
    } else {
      html += `<div class="debug-section">Clic sur un sprite en jeu pour ouvrir le slider scale.</div>`;
      html += `<button class="export-config" id="dbg-export">📋 EXPORTER CONFIG</button>`;
      const overrideKeys = Object.keys(scaleOverrides);
      if (overrideKeys.length > 0) {
        html += `<div class="debug-section"><div class="debug-section-title">Overrides actifs</div>`;
        for (const k of overrideKeys) {
          html += `<div>${k} → ${scaleOverrides[k].toFixed(2)}</div>`;
        }
        html += `</div>`;
      }
    }

    panel.innerHTML = html;

    document.getElementById('dbg-mode-toggle').addEventListener('click', () => {
      mode = (mode === 'spawn') ? 'tuning' : 'spawn';
      pendingSpawn = null;
      popup.style.display = 'none';
      _render();
    });

    // Spawn buttons
    panel.querySelectorAll('[data-spawn]').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingSpawn = btn.getAttribute('data-spawn');
        btn.style.outline = '2px solid #f59e0b';
        setTimeout(() => { btn.style.outline = ''; }, 400);
      });
    });
    // Spell buttons → cast au curseur immédiatement (utilise dernier worldX/Y)
    panel.querySelectorAll('[data-spell]').forEach(btn => {
      btn.addEventListener('click', () => {
        const main = _getMainScene();
        if (!main || !main.input) return;
        const ptr = main.input.activePointer;
        if (typeof Network !== 'undefined') Network.castSpell(btn.getAttribute('data-spell'), ptr.worldX, ptr.worldY);
      });
    });
    if (mode === 'tuning') {
      const ex = document.getElementById('dbg-export');
      if (ex) ex.addEventListener('click', _exportConfig);
    }
  }

  function _getMainScene() {
    if (!window.game || !window.game.scene) return null;
    return window.game.scene.scenes.find(s => s.scene && s.scene.key === 'MainScene');
  }

  // Appelé depuis MainScene quand le joueur clique sur la map (mode SPAWN)
  function tryHandleMapClick(worldX, worldY) {
    if (mode !== 'spawn' || !pendingSpawn) return false;
    if (typeof Network !== 'undefined') Network.debugSpawn(pendingSpawn, worldX, worldY);
    pendingSpawn = null;
    return true;
  }

  // Appelé depuis MainScene quand le joueur clique sur un sprite (mode TUNING)
  function tryHandleSpriteClick(unitType, screenX, screenY) {
    if (mode !== 'tuning' || !unitType) return false;
    currentTunedType = unitType;
    _openPopup(unitType, screenX, screenY);
    return true;
  }

  function _openPopup(type, sx, sy) {
    const cfg = (typeof ENTITIES_CONFIG !== 'undefined') ? ENTITIES_CONFIG[type] : null;
    const baseScale = scaleOverrides[type] != null ? scaleOverrides[type] : (cfg ? cfg.scale : 1.0);
    popup.style.display = 'block';
    popup.style.left = Math.min(window.innerWidth - 240, sx + 20) + 'px';
    popup.style.top  = Math.min(window.innerHeight - 140, sy + 20) + 'px';
    popup.innerHTML = `
      <div class="name">${type}</div>
      <div>Scale : <span id="dbg-scale-val">${baseScale.toFixed(2)}</span></div>
      <input type="range" id="dbg-scale-slider" min="0.3" max="3.0" step="0.05" value="${baseScale}" />
      <div class="row">
        <button id="dbg-scale-minus">−</button>
        <button id="dbg-scale-plus">+</button>
        <button id="dbg-scale-reset">Reset 1.0</button>
        <button id="dbg-scale-close" style="margin-left:auto;">×</button>
      </div>
    `;
    const slider = document.getElementById('dbg-scale-slider');
    const valEl  = document.getElementById('dbg-scale-val');
    const apply = (v) => {
      const f = Math.max(0.3, Math.min(3.0, parseFloat(v)));
      scaleOverrides[type] = f;
      valEl.textContent = f.toFixed(2);
      slider.value = f;
      _applyScaleLive(type, f);
    };
    slider.addEventListener('input', (e) => apply(e.target.value));
    document.getElementById('dbg-scale-minus').addEventListener('click', () => apply((parseFloat(slider.value) - 0.05).toFixed(2)));
    document.getElementById('dbg-scale-plus' ).addEventListener('click', () => apply((parseFloat(slider.value) + 0.05).toFixed(2)));
    document.getElementById('dbg-scale-reset').addEventListener('click', () => apply(1.0));
    document.getElementById('dbg-scale-close').addEventListener('click', () => { popup.style.display = 'none'; });
  }

  // Applique le scale en direct sur toutes les instances en jeu.
  // ATTENTION : MainScene._updateUnitBarPositions() applique un wobble Y permanent qui
  // pollue sprite.scaleY chaque frame. Il faut donc :
  //   - Lire/écrire UNIQUEMENT _baseScaleX / _baseScaleY (référence stable)
  //   - Ne JAMAIS multiplier par sprite.scaleY (qui contient le wobble)
  function _applyScaleLive(type, scale) {
    const main = _getMainScene();
    if (!main || !main.unitSprites) return;
    if (typeof ENTITIES_CONFIG !== 'undefined' && ENTITIES_CONFIG[type]) {
      ENTITIES_CONFIG[type].scale = scale;
    }
    for (const arr of Object.values(main.unitSprites)) {
      const s = arr && arr[0];
      if (!s || s._unitType !== type) continue;
      const oldMult = s._scaleMult || 1.0;
      const ratio = scale / oldMult;
      // Multiplie _baseScale (référence stable) — le wobble s'appliquera dessus à la frame suivante
      const newBaseX = (s._baseScaleX || s.scaleX) * ratio;
      const newBaseY = (s._baseScaleY || s.scaleY) * ratio;
      s._baseScaleX = newBaseX;
      s._baseScaleY = newBaseY;
      s.setScale(newBaseX, newBaseY);
      s._scaleMult = scale;
      // L'emoji overlay (placeholder) suit le scale du sprite
      const overlay = arr[4];
      if (overlay && overlay.setScale) {
        overlay.setScale(overlay.scaleX * ratio, overlay.scaleY * ratio);
      }
    }
  }

  function _exportConfig() {
    const date = new Date().toISOString().slice(0, 10);
    let txt = `// Valeurs ajustées via mode tuning le ${date}\n`;
    if (typeof ENTITIES_CONFIG === 'undefined') {
      console.log(txt + '// (ENTITIES_CONFIG non chargé)');
      return;
    }
    for (const [key, cfg] of Object.entries(ENTITIES_CONFIG)) {
      txt += `${key}: { ..., scale: ${(cfg.scale || 1.0).toFixed(2)} },\n`;
    }
    console.log('═══════════════════════════════════════');
    console.log('Bloc à coller dans entitiesConfig.js :');
    console.log('═══════════════════════════════════════');
    console.log(txt);
    alert('Config exportée dans la console (ouvre les DevTools)');
  }

  function getMode() { return mode; }
  function hasPendingSpawn() { return !!pendingSpawn; }

  return { init, tryHandleMapClick, tryHandleSpriteClick, getMode, hasPendingSpawn };
})();
