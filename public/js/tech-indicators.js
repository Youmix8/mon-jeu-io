// ════════════════════════════════════════════════════════════════════
// TechIndicators — visualise les passifs / techs débloqués d'un joueur
// au-dessus de son HDV (badges) + halos sur le HDV pour les passifs de
// zone (prayer / citadel).
//
// Visibilité publique : le serveur publie unlockedTechs dans playerSummary
// (non filtré par fog) → on voit les passifs adverses dès qu'on perçoit
// leur HDV. Robin l'a explicitement demandé.
//
// On compose 3 couches :
//   1. Badges : petits jetons emoji autour de la barre de nom du HDV,
//      un par tech débloquée qui a un effet (économie / militaire / aura).
//   2. Halos HDV : anneaux pulsants pour les passifs de ZONE :
//        - prayer        → halo vert (soin allié rayon 200)
//        - citadel       → halo rouge/or (auto-attaque rayon 200)
//        - empire        → halo doré court (économie)
//   3. (Sous-couche future : auras d'unités catégorie magie/religion)
// ════════════════════════════════════════════════════════════════════

const TechIndicators = (() => {

  // Mapping tech → effet visuel. icon : emoji ; color : 0xRRGGBB pour la
  // pastille de fond ; tier permet de trier l'ordre des badges (économie
  // d'abord, militaire ensuite). Une tech sans entrée ici ne reçoit pas
  // de badge (ex : nœuds qui débloquent juste une unité — l'unité est
  // déjà sa propre représentation visuelle).
  const TECH_VISUALS = {
    // ── Science / économie ──
    agriculture:    { icon: '🌾', color: 0x84cc16, label: 'Agriculture' },
    construction:   { icon: '🛠', color: 0x94a3b8, label: 'Construction' },
    roads:          { icon: '🛣', color: 0xb45309, label: 'Voies' },
    marine:         { icon: '⛵', color: 0x60a5fa, label: 'Marine' },
    cartography:    { icon: '🗺', color: 0x60a5fa, label: 'Cartographie' },
    diplomacy:      { icon: '🤝', color: 0x93c5fd, label: 'Diplomatie' },
    empire:         { icon: '👑', color: 0xfbbf24, label: 'Empire (+50% gold)' },
    printing:       { icon: '📜', color: 0x8b5cf6, label: 'Imprimerie (×2 PR)' },
    citadel:        { icon: '🏰', color: 0xef4444, label: 'Citadelle (3× HP HDV)' },
    renaissance:    { icon: '👁', color: 0xfde68a, label: 'Renaissance — Omniscience minimap' },
    crossbows:      { icon: '🎯', color: 0xea580c, label: 'Arbalètes (archer +50% dmg)' },
    military_architecture: { icon: '🏯', color: 0x6b7280, label: 'Architecture militaire' },

    // ── Magie ──
    stargazing:     { icon: '⭐', color: 0xfde047, label: 'Étoiles (+0.3 PR/s)' },
    elements_study: { icon: '🔮', color: 0x9333ea, label: 'Éléments' },
    pyromancy:      { icon: '🔥', color: 0xf97316, label: 'Pyromancie (mage +30% dmg)' },
    cryomancy:      { icon: '❄', color: 0x60a5fa, label: 'Cryomancie (slow 2s)' },
    lightning:      { icon: '⚡', color: 0xfde047, label: 'Foudre (mage +25% speed / +30% vision)' },
    teleportation:  { icon: '🌀', color: 0x67e8f9, label: 'Téléportation (toutes +15% speed)' },
    enchantment:    { icon: '✨', color: 0xa78bfa, label: 'Enchantement (mana ×1.5)' },
    illusion:       { icon: '👤', color: 0xa78bfa, label: 'Illusion (mage +15% HP)' },
    curses:         { icon: '🧪', color: 0x6b21a8, label: 'Malédictions (-15% dmg ennemi <150)' },
    time_mastery:   { icon: '⏳', color: 0xc4b5fd, label: 'Maîtrise du temps (-20% cooldown mage)' },
    mage_tower:     { icon: '🧙', color: 0x8b5cf6, label: 'Tour de mage' },
    necromancy:     { icon: '💀', color: 0x4c1d95, label: 'Nécromancie' },
    lich:           { icon: '☠', color: 0x4c1d95, label: 'Liche' },
    elemental_summon: { icon: '🌋', color: 0xdc2626, label: 'Élémentaire' },
    arcane_avatar:  { icon: '🐉', color: 0x8b5cf6, label: 'Dragon arcanique' },

    // ── Religion ──
    animism:        { icon: '🕯', color: 0xfde68a, label: 'Animisme' },
    prayer:         { icon: '🙏', color: 0x86efac, label: 'Prière (+1 HP/s près HDV)' },
    temple:         { icon: '⛩', color: 0xfbbf24, label: 'Temple' },
    pilgrimage:     { icon: '🚶', color: 0xfde68a, label: 'Pèlerinage' },
    inquisition:    { icon: '🗡', color: 0xeab308, label: 'Inquisition' },
    blessing:       { icon: '✝', color: 0x86efac, label: 'Bénédiction (toutes +10% HP, +0.5 regen)' },
    purifying_light:{ icon: '🌟', color: 0xfde047, label: 'Lumière purificatrice (inqui ×3)' },
    sacred_order:   { icon: '🛡', color: 0xfafaf9, label: 'Ordre sacré' },
    cathedral:      { icon: '⛪', color: 0xfbbf24, label: 'Cathédrale' },
    crusade:        { icon: '⚔', color: 0xef4444, label: 'Croisade (+25% dmg vs bâtiments)' },
    martyrs:        { icon: '💧', color: 0xfecaca, label: 'Martyrs (pèlerin → heal AoE)' },
    guardian_angel: { icon: '👼', color: 0xfef3c7, label: 'Ange Gardien' },
    excommunication:{ icon: '🚫', color: 0x854d0e, label: 'Excommunication (-20% dmg <150)' },
    unwavering_faith:{ icon: '🛡', color: 0xfafaf9, label: 'Foi inébranlable (-25% dmg magique)' },
    divine_invocation:{ icon: '👁', color: 0xfde047, label: 'Avatar divin' },
  };

  // Halos de ZONE sur le HDV (passifs avec rayon d'effet)
  const HALO_VISUALS = {
    prayer:  { color: 0x86efac, radius: 200, alphaFrom: 0.10, alphaTo: 0.28, duration: 1600 },
    citadel: { color: 0xfbbf24, radius: 200, alphaFrom: 0.16, alphaTo: 0.35, duration: 900 },
    empire:  { color: 0xfbbf24, radius: 90,  alphaFrom: 0.12, alphaTo: 0.26, duration: 1900 },
  };

  // Constantes de mise en page
  const HDV_DISPLAY = 160;
  const BADGE_Y_OFFSET = -(HDV_DISPLAY / 2) - 56; // au-dessus du nom du joueur
  const BADGE_SPACING  = 26;
  const BADGE_RADIUS   = 11;
  const BADGES_PER_ROW = 8;
  const ROW_HEIGHT     = 26;

  let scene = null;
  // playerId → { hdvHalos: { techId: graphics }, badges: { _key, items: [{bg, txt, dx, dy}] } }
  const stateByPid = {};

  function init(_scene) {
    scene = _scene;
  }

  function _ensurePlayerSlot(pid) {
    if (!stateByPid[pid]) stateByPid[pid] = { hdvHalos: {}, badges: null };
    return stateByPid[pid];
  }

  function _renderHalos(pid, player, techs) {
    const slot = _ensurePlayerSlot(pid);
    const wanted = new Set(techs.filter(t => HALO_VISUALS[t]));
    // Supprime les halos non plus actifs
    for (const tid of Object.keys(slot.hdvHalos)) {
      if (!wanted.has(tid)) {
        if (slot.hdvHalos[tid]._tween) slot.hdvHalos[tid]._tween.stop();
        slot.hdvHalos[tid].destroy();
        delete slot.hdvHalos[tid];
      }
    }
    // Ajoute les manquants
    for (const tid of wanted) {
      if (slot.hdvHalos[tid]) continue;
      const v = HALO_VISUALS[tid];
      const halo = scene.add.circle(player.x, player.y, v.radius, v.color, v.alphaFrom)
        .setDepth(6) // au-dessus du sol/eau (0-2), sous les bâtiments (28+)
        .setStrokeStyle(2, v.color, Math.min(0.7, v.alphaTo + 0.15));
      const tw = scene.tweens.add({
        targets: halo,
        alpha: { from: v.alphaFrom, to: v.alphaTo },
        scaleX: { from: 0.96, to: 1.04 },
        scaleY: { from: 0.96, to: 1.04 },
        duration: v.duration, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      halo._tween = tw;
      slot.hdvHalos[tid] = halo;
    }
    // Repositionne tous les halos sur la position actuelle du HDV
    for (const tid of Object.keys(slot.hdvHalos)) {
      slot.hdvHalos[tid].setPosition(player.x, player.y);
    }
  }

  function _renderBadges(pid, player, techs) {
    const slot = _ensurePlayerSlot(pid);
    // Sélectionne les techs avec un effet visuel listé
    const filtered = techs.filter(t => TECH_VISUALS[t]);
    const key = filtered.join(',');

    // Si la liste n'a pas changé, juste repositionner les badges existants
    if (slot.badges && slot.badges._key === key) {
      const items = slot.badges.items;
      const baseY = player.y + BADGE_Y_OFFSET;
      items.forEach(it => {
        it.bg.setPosition(player.x + it.dx, baseY + it.dy);
        it.txt.setPosition(player.x + it.dx, baseY + it.dy);
      });
      return;
    }
    // Sinon : reconstruire
    if (slot.badges) {
      slot.badges.items.forEach(it => { it.bg.destroy(); it.txt.destroy(); });
    }
    const items = [];
    if (filtered.length === 0) {
      slot.badges = { _key: key, items };
      return;
    }
    // Distribue en lignes (8 badges/ligne max), centrées
    const baseY = player.y + BADGE_Y_OFFSET;
    let i = 0;
    while (i < filtered.length) {
      const row = filtered.slice(i, i + BADGES_PER_ROW);
      const rowIdx = Math.floor(i / BADGES_PER_ROW);
      const rowDy  = -rowIdx * ROW_HEIGHT;
      const startX = -((row.length - 1) * BADGE_SPACING) / 2;
      row.forEach((tid, k) => {
        const v = TECH_VISUALS[tid];
        const dx = startX + k * BADGE_SPACING;
        const bg = scene.add.circle(player.x + dx, baseY + rowDy, BADGE_RADIUS, v.color, 0.92)
          .setDepth(71)
          .setStrokeStyle(1.5, 0x111111, 0.85);
        const txt = scene.add.text(player.x + dx, baseY + rowDy, v.icon, {
          fontSize: '14px', stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5, 0.5).setDepth(72);
        items.push({ bg, txt, dx, dy: rowDy });
      });
      i += BADGES_PER_ROW;
    }
    slot.badges = { _key: key, items };
  }

  // Nettoie un joueur qui n'a plus de HDV visible (ou qui a quitté)
  function _destroyPlayer(pid) {
    const slot = stateByPid[pid];
    if (!slot) return;
    Object.values(slot.hdvHalos).forEach(h => { if (h._tween) h._tween.stop(); h.destroy(); });
    if (slot.badges) slot.badges.items.forEach(it => { it.bg.destroy(); it.txt.destroy(); });
    delete stateByPid[pid];
  }

  // Mise à jour appelée par MainScene.update() après _syncHDVs
  // visibleHdvPlayerIds : Set des joueurs dont le HDV est rendu côté client
  function sync(playerSummary, visibleHdvPlayerIds, statePlayers) {
    // Auto-init défensif : si init() n'a pas été appelé pour une raison
    // (timing de Phaser, hot reload, etc.), récupère la scène globalement.
    if (!scene && typeof window !== 'undefined' && window.game && window.game.scene) {
      const ms = window.game.scene.getScene('MainScene');
      if (ms) scene = ms;
    }
    if (!scene) return;
    // Nettoie les joueurs qui n'ont plus de HDV visible
    for (const pid of Object.keys(stateByPid)) {
      if (!visibleHdvPlayerIds.has(pid)) _destroyPlayer(pid);
    }
    // Pour chaque joueur dont le HDV est visible, mets à jour ses indicateurs
    const techsByPid = {};
    for (const s of playerSummary || []) techsByPid[s.id] = s.unlockedTechs || [];
    for (const pid of visibleHdvPlayerIds) {
      const player = statePlayers[pid];
      if (!player) continue;
      const techs = techsByPid[pid] || [];
      _renderHalos(pid, player, techs);
      _renderBadges(pid, player, techs);
    }
  }

  return { init, sync, TECH_VISUALS, HALO_VISUALS };
})();
