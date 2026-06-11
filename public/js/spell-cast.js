// SpellCast — mode "lancer de sort" client-side.
// Hotkeys F / G (mappés via Network.getConfig().spells[*].hotkey).
// Flow : touche → activate(spellId) → preview cercle au curseur → clic gauche → emit castSpell → exit mode.
//        Échap / clic droit → cancel.

const SpellCast = (() => {
  let scene  = null;
  let active = null;          // spellId en cours, ou null
  let ghost  = null;          // Phaser.GameObjects.Graphics (preview AoE)
  let label  = null;          // texte flottant (coût mana, sort)
  const lastCastAt = {};      // spellId → timestamp du dernier cast réussi (cooldown client)

  function init(sc) {
    scene = sc;
    // Hotkeys globaux (capturés par window, vérifient le contexte)
    document.addEventListener('keydown', _onKey);
  }

  function _onKey(e) {
    // Skip si on tape dans un input ou un overlay actif (build mode, tech tree)
    if (document.activeElement && ['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
    // Skip si un modificateur est enfoncé (Ctrl+F = recherche navigateur, etc.)
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (typeof BuildMode !== 'undefined' && BuildMode.isActive()) return;
    if (typeof TechTreeOverlay !== 'undefined' && TechTreeOverlay.isOpen && TechTreeOverlay.isOpen()) return;

    if (e.key === 'Escape' && active) { cancel(); return; }

    const cfg = Network.getConfig();
    const spells = cfg.spells || {};
    for (const sp of Object.values(spells)) {
      if (sp.hotkey && e.key.toUpperCase() === sp.hotkey.toUpperCase()) {
        // Validations rapides côté client (UX, le serveur revalide)
        const me = (Network.getState().players || {})[Network.getMyId()];
        if (!me) return;
        if (sp.requiresTech && !(me.unlockedTechs || []).includes(sp.requiresTech)) {
          _flashHud(`🔒 ${sp.name} verrouillé — recherche ${sp.requiresTech}`);
          return;
        }
        // Cooldown client (miroir du serveur) — évite les clics gaspillés
        const cd   = sp.cooldownMs || 1000;
        const left = cd - (Date.now() - (lastCastAt[sp.id] || 0));
        if (left > 0) {
          _flashHud(`${sp.icon} ${sp.name} en recharge (${(left / 1000).toFixed(1)}s)`);
          return;
        }
        const costType = sp.costType || 'mana';
        const current  = (costType === 'faith') ? (me.faith || 0) : (me.mana || 0);
        const costLbl  = (costType === 'faith') ? '✚ foi' : '✦ mana';
        if (current < sp.cost) {
          _flashHud(`Pas assez de ${costLbl} (${sp.cost} requis)`);
          return;
        }
        activate(sp.id);
        return;
      }
    }
  }

  function activate(spellId) {
    cancel();
    const cfg = Network.getConfig();
    const sp = (cfg.spells || {})[spellId];
    if (!sp || !scene) return;
    active = spellId;
    const color = _colorFor(sp);
    ghost = scene.add.graphics().setDepth(95);
    ghost.lineStyle(2, color, 0.85);
    ghost.fillStyle(color, 0.12);
    const costIcon = (sp.costType === 'faith') ? '🙏' : '🔮';
    label = scene.add.text(0, 0, `${sp.icon} ${sp.name} (${sp.cost} ${costIcon}) — clic gauche pour lancer, Échap pour annuler`, {
      fontSize: '13px', fontFamily: 'Inter', color: '#fff', backgroundColor: 'rgba(15,23,42,0.85)', padding: { x: 8, y: 5 },
    }).setDepth(96).setOrigin(0.5, 1).setScrollFactor(0);
    label.setPosition(scene.scale.width / 2, scene.scale.height - 12);
  }

  function update(wx, wy) {
    if (!active || !ghost) return;
    const sp = (Network.getConfig().spells || {})[active];
    if (!sp) return;
    ghost.clear();
    const color = _colorFor(sp);
    ghost.lineStyle(2, color, 0.85);
    ghost.fillStyle(color, 0.12);
    ghost.fillCircle(wx, wy, sp.radius);
    ghost.strokeCircle(wx, wy, sp.radius);
  }

  function _colorFor(sp) {
    if (!sp) return 0xffffff;
    if (sp.type === 'aoe_damage')  return 0xef4444; // rouge
    if (sp.type === 'aoe_slow')    return 0x60a5fa; // bleu
    if (sp.type === 'aoe_heal')    return 0x22c55e; // vert
    if (sp.type === 'aoe_purify')  return 0xfbbf24; // doré
    return 0xffffff;
  }

  function tryCast(wx, wy) {
    if (!active) return false;
    Network.castSpell(active, wx, wy);
    lastCastAt[active] = Date.now(); // démarre le cooldown client
    cancel();
    return true;
  }

  function cancel() {
    if (ghost) { ghost.destroy(); ghost = null; }
    if (label) { label.destroy(); label = null; }
    active = null;
  }

  function isActive() { return active !== null; }

  function _flashHud(msg) {
    // Toast vite-fait (réutilise label si possible, sinon nouveau)
    if (!scene) return;
    const t = scene.add.text(scene.scale.width / 2, scene.scale.height - 60, msg, {
      fontSize: '14px', fontFamily: 'Inter', color: '#fff',
      backgroundColor: 'rgba(220,38,38,0.92)', padding: { x: 10, y: 6 },
    }).setOrigin(0.5, 1).setDepth(120).setScrollFactor(0);
    scene.tweens.add({ targets: t, alpha: 0, duration: 1400, ease: 'Quad.easeIn', onComplete: () => t.destroy() });
  }

  // Animation à jouer quand un sort est lancé (par n'importe qui) — full néon.
  // Onde de choc (cercle qui se dilate du centre au rayon réel) + flash de
  // remplissage + burst de particules ADD, le tout teinté par le type de sort.
  function playCastAnim(data) {
    if (!scene || !scene.sys || !scene.sys.isActive() || !data) return;
    const sp = (Network.getConfig().spells || {})[data.spellId];
    if (!sp) return;
    const color  = _colorFor(sp);
    const radius = data.radius || sp.radius || 80;
    const isExpl = (sp.type === 'aoe_damage' || sp.type === 'aoe_purify');

    // 1. Flash de remplissage instantané qui s'estompe (la zone touchée)
    const fill = scene.add.circle(data.x, data.y, radius, color, isExpl ? 0.38 : 0.26)
      .setDepth(53).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: fill, alpha: { from: fill.alpha, to: 0 },
      scale: { from: 0.85, to: 1 }, duration: isExpl ? 420 : 700,
      ease: 'Quad.easeOut', onComplete: () => fill.destroy(),
    });

    // 2. Onde de choc : anneau fin qui se dilate de 0 → rayon
    const ring = scene.add.circle(data.x, data.y, radius, color, 0)
      .setStrokeStyle(3, color, 1).setDepth(54).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: ring, scale: { from: 0.15, to: 1.05 }, alpha: { from: 1, to: 0 },
      duration: isExpl ? 450 : 600, ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    // 3. Burst de particules néon (vers l'extérieur pour les dégâts,
    //    implosion douce pour soin/gel)
    const emitter = scene.add.particles(data.x, data.y, 'particle', {
      tint: color,
      speed: { min: radius * 0.6, max: radius * 1.6 },
      scale: { start: 1.4, end: 0 }, alpha: { start: 1, end: 0 },
      lifespan: isExpl ? 420 : 600, quantity: isExpl ? 18 : 12,
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    });
    emitter.explode();
    scene.time.delayedCall(700, () => emitter.destroy());
  }

  return { init, activate, update, tryCast, cancel, isActive, playCastAnim };
})();
