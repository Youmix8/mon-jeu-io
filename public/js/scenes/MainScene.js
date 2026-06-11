class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
    this.hdvSprites   = {};
    this.unitSprites  = {};
    this.unitTweens   = {};
    this.unitServerPos = {};
    this.selectionRings = {};
    this.selectedUnitIds = new Set();
    this.villageSprites = {};  // villageId → [icon, ringFill, ringBg, label]
    this.lastVillageStateJson = '';
    this.lastStateJson = '';
    this.cursors = null;
    this.wasd    = null;
    this.isDragging      = false;
    this.dragStartX      = 0;
    this.dragStartY      = 0;
    this.dragRectGraphics = null;
    this.attackGraphics   = null;
    this.attackLines      = [];
  }

  preload() {
    // Direction artistique néon : 100% procédural. Aucun PNG n'est chargé.
  }

  create() {
    // IMPORTANT : ne pas construire la map ici car Network.init() n'a pas
    // encore reçu la taille réelle du serveur. On construit la map UNIQUEMENT
    // après réception de l'event 'init'. Voir _buildMap() plus bas.
    this.mapBuilt = false;
    this.lastFogSignature = '';
    this.cameraCentered = false;

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.Z,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.Q,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    this.input.mouse.disableContextMenu();
    this.attackGraphics = this.add.graphics();

    // Texture 'particle' = carré blanc 3×3 (spec néon). Tintée à l'usage.
    const pg = this.make.graphics({ add: false });
    pg.fillStyle(0xffffff, 1);
    pg.fillRect(0, 0, 3, 3);
    pg.generateTexture('particle', 3, 3);
    pg.destroy();

    // Recalcule la borne de zoom min si on redimensionne la fenêtre
    this.scale.on('resize', () => {
      if (!this.mapBuilt) return;
      this._recomputeMinZoom();
      const cam = this.cameras.main;
      if (cam.zoom < this.minZoom) cam.zoom = this.minZoom;
    });

    // Build map dès que le serveur a envoyé init (ou immédiatement si déjà reçu)
    Network.setOnInitReceived(() => this._buildMap());

    this.input.manager.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.mapBuilt) return;
      const cam = this.cameras.main;
      if (e.ctrlKey) {
        const zoomFactor = e.deltaY > 0 ? 0.96 : 1.04;
        cam.zoom = Phaser.Math.Clamp(cam.zoom * zoomFactor, this.minZoom, 1.6);
      } else {
        cam.scrollX += e.deltaX / cam.zoom;
        cam.scrollY += e.deltaY / cam.zoom;
      }
    }, { passive: false });

    // ── V — vue d'ensemble (fit map) ──────────────────────────────
    // (était F, mais F = hotkey du sort Boule de feu → conflit de raccourcis)
    this.input.keyboard.on('keydown-V', () => {
      if (!this.mapBuilt) return;
      const cam = this.cameras.main;
      this._recomputeMinZoom();
      cam.zoom = this.minZoom;
      cam.centerOn(this.MAP_W / 2, this.MAP_H / 2);
    });

    // ── Ctrl+A — select all own units ────────────────────────────
    this.input.keyboard.on('keydown-A', (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const myId = Network.getMyId();
      if (!myId) return;
      const units = Network.getState().units || {};
      this.selectedUnitIds.clear();
      for (const [uid, unit] of Object.entries(units)) {
        if (unit.ownerId === myId) this.selectedUnitIds.add(uid);
      }
      this._updateSelectionRings();
    });

    // ── Callbacks réseau ──────────────────────────────────────────

    Network.setOnSpawnFailed((reason) => {
      // Flash de la ligne gold (signal historique pour le manque d'or)
      if (reason === 'not_enough_gold') {
        const el = document.getElementById('my-gold-row');
        if (el) { el.classList.remove('flash-error'); void el.offsetWidth; el.classList.add('flash-error'); }
      }
      // Toast lisible pour TOUTES les autres causes (avant : silencieux → le
      // joueur ne comprenait pas pourquoi rien ne se passait).
      const MSG = {
        not_enough_gold:      '◈ Pas assez de gold',
        not_enough_mana:      '✦ Pas assez de mana',
        not_enough_faith:     '✚ Pas assez de foi',
        not_enough_pr:        '▤ Pas assez de points de recherche',
        population_cap:        '⌬ Population maximale atteinte',
        unit_locked:          '🔒 Unité non débloquée (recherche requise)',
        unit_locked_at_village:'🔒 Village de niveau supérieur requis',
        building_locked:      '🔒 Bâtiment non débloqué',
        missing_requires:     '🔒 Prérequis de recherche manquant',
        out_of_build_zone:    '⛔ Hors de la zone constructible',
        cell_occupied:        '⛔ Case déjà occupée',
        too_close_to_base:    '⛔ Trop près d\'une base',
        spell_locked:         '🔒 Sort non débloqué',
        spell_cooldown:       '⏳ Sort en recharge',
      };
      const msg = MSG[reason];
      if (msg) this._hudToast(msg);
    });

    Network.setOnPlayerEliminated((data) => {
      this._addKillFeedEntry(`☠ ${data.name} éliminé !`, Theme.factionColorStr(data.playerId));
    });

    // Pop néon d'invocation (résurrection nécro / clone de liche).
    // Squelette ('necro') = violet magie ; clone ('lich_clone') = couleur d'équipe
    // du propriétaire (le clone garde la forme de la victime → la couleur dit le camp).
    Network.setOnUnitSummoned((data) => {
      if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) return;
      const color = data.source === 'lich_clone'
        ? Theme.factionColorInt(data.ownerId)
        : Theme.BEAM.magic;
      // Halo expansif
      const halo = this.add.circle(data.x, data.y, 14, color, 0).setDepth(56);
      halo.setStrokeStyle(2.5, color, 1).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: halo, scale: { from: 0.3, to: 2.4 }, alpha: { from: 1, to: 0 },
        duration: 520, ease: 'Quad.easeOut', onComplete: () => halo.destroy(),
      });
      // Burst de particules néon
      const emitter = this.add.particles(data.x, data.y, 'particle', {
        tint: color, speed: { min: 40, max: 90 },
        scale: { start: 1.2, end: 0 }, alpha: { start: 1, end: 0 },
        lifespan: 500, blendMode: Phaser.BlendModes.ADD, emitting: false,
      });
      emitter.explode(12);
      this.time.delayedCall(600, () => emitter.destroy());
    });

    // Martyrs : le Pèlerin explose en soin AoE → nova verte expansive.
    Network.setOnPilgrimExplosion((data) => {
      if (!Number.isFinite(data.x) || !Number.isFinite(data.y)) return;
      const green = 0x22c55e;
      const ring = this.add.circle(data.x, data.y, 100, green, 0.22).setDepth(53)
        .setStrokeStyle(3, green, 1).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: ring, scale: { from: 0.2, to: 1 }, alpha: { from: 1, to: 0 },
        duration: 600, ease: 'Cubic.easeOut', onComplete: () => ring.destroy(),
      });
      const emitter = this.add.particles(data.x, data.y, 'particle', {
        tint: green, speed: { min: 50, max: 130 }, scale: { start: 1.3, end: 0 },
        alpha: { start: 1, end: 0 }, lifespan: 600, quantity: 14,
        blendMode: Phaser.BlendModes.ADD, emitting: false,
      });
      emitter.explode();
      this.time.delayedCall(700, () => emitter.destroy());
    });

    // PvE : raids barbares et camps nettoyés dans le kill feed
    Network.setOnBarbarianRaid((data) => {
      this._addKillFeedEntry(`⌖ Raid barbare → ${data.targetName}`, Theme.factionColorStr(data.targetPlayerId));
    });
    Network.setOnCampCleared((data) => {
      this._addKillFeedEntry(`✦ ${data.byName} nettoie un camp (+${data.rewardGold} ◈)`, Theme.factionColorStr(data.byPlayerId));
    });

    // Diplomatie : kill feed + relais vers le panneau (callbacks réseau à slot unique)
    Network.setOnTreatySigned((data) => {
      this._addKillFeedEntry(`⊕ Pacte : ${data.aName} ↔ ${data.bName}`, Theme.factionColorStr(data.a));
      if (typeof DiplomacyPanel !== 'undefined') DiplomacyPanel.notifyResolved(data.a, data.b);
    });
    Network.setOnTreatyBroken((data) => {
      const st = Network.getState();
      const an = (st.players[data.a] || {}).name || '?';
      const bn = (st.players[data.b] || {}).name || '?';
      this._addKillFeedEntry(`✗ Pacte rompu : ${an} / ${bn}`, Theme.HP.low);
      if (typeof DiplomacyPanel !== 'undefined') DiplomacyPanel.notifyResolved(data.a, data.b);
    });

    Network.setOnVillageCaptured((data) => {
      this._addKillFeedEntry(`▰ ${data.ownerName} capture un village`, Theme.factionColorStr(data.ownerId));
      // Flash de capture (juice §11.7) : pulse doré + 10 particules dorées au centre du village
      const v = (Network.getState().villages || []).find(vv => vv.id === data.villageId);
      if (v) {
        const ring = this.add.circle(v.x, v.y, 24, 0xfbbf24, 0).setDepth(57);
        ring.setStrokeStyle(3, 0xfbbf24, 0.95);
        ring.setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({
          targets: ring, scale: { from: 0.4, to: 2.2 }, alpha: { from: 1, to: 0 },
          duration: 600, ease: 'Quad.easeOut', onComplete: () => ring.destroy(),
        });
        const emitter = this.add.particles(v.x, v.y, 'particle', {
          tint: 0xfbbf24, speed: { min: 50, max: 110 },
          scale: { start: 1.4, end: 0 }, alpha: { start: 1, end: 0 },
          lifespan: 700, blendMode: Phaser.BlendModes.ADD, emitting: false,
        });
        emitter.explode(10);
        this.time.delayedCall(800, () => emitter.destroy());
      }
    });

    Network.setOnVillageDestroyed((data) => {
      const state = Network.getState();
      const attacker = state.players[data.byPlayerId];
      const attackerName = attacker ? attacker.name : 'Quelqu\'un';
      this._addKillFeedEntry(`✺ ${attackerName} détruit un village`, Theme.factionColorStr(data.byPlayerId));
    });

    Network.setOnGameOver((data) => {
      // network.js handles the overlay — nothing extra needed here
    });

    Network.setOnMatchRestarted(() => {
      const myId = Network.getMyId();
      const me   = Network.getState().players[myId];
      if (me) this.cameras.main.centerOn(me.x, me.y);
    });

    Network.setOnAttack((data) => {
      const state = Network.getState();
      const myId  = Network.getMyId();

      // ── Résoudre la position de la cible ──
      let tx, ty, targetMine = false;
      if (data.targetType === 'unit') {
        const t = state.units && state.units[data.targetId];
        if (!t) return;
        tx = t.x; ty = t.y;
        targetMine = (t.ownerId === myId);
        this._flashUnit(data.targetId);
        this._impactPunch(data.targetId);
        if (data.killed) {
          this._spawnDeathParticles(t.x, t.y, Theme.factionColorInt(t.ownerId, t.type));
          // Camera shake + screen flash si gros impact (boss tué) — juice §11.1
          const shape = Theme.unitShape(t.type);
          const isCampBoss = t.ownerId === 'neutral_boss' || t.neutralRole === 'camp_boss';
          if (shape.sh === 'boss' || isCampBoss) {
            this.cameras.main.shake(180, 0.004);
            this._screenFlash(0xfcd34d, 0.16, 160);
          }
        }
      } else if (data.targetType === 'village') {
        const v = (state.villages || []).find(vv => vv.id === data.targetId);
        if (!v) return;
        tx = v.x; ty = v.y;
      } else if (data.targetType === 'building') {
        const b = (state.buildings || []).find(bb => bb.id === data.targetId);
        if (!b) return;
        tx = b.x; ty = b.y;
      } else {
        const t = state.players && state.players[data.targetId];
        if (!t) return;
        tx = t.x; ty = t.y;
        // HDV touché : shake léger uniquement si c'est MON HDV
        if (data.targetId === Network.getMyId()) {
          this.cameras.main.shake(120, 0.0025);
        }
        this._flashHdv(data.targetId);
      }

      // ── Résoudre l'attaquant (unité OU bâtiment) ──
      let attackerColorInt = 0xffffff;
      let attackerOwnerId = null;
      if (data.attackerType === 'building') {
        // Beam depuis le bâtiment (les coords sont fournies en bx, by)
        const ax = (data.bx != null) ? data.bx : tx;
        const ay = (data.by != null) ? data.by : ty;
        // ownerId du bâtiment, si dispo, donne la couleur d'équipe pour le beam.
        // Citadelle : id = 'citadel_<playerId>' → le propriétaire est le joueur.
        const b = (state.buildings || []).find(bb => bb.id === data.attackerId);
        if (b && b.ownerId) attackerOwnerId = b.ownerId;
        else if (typeof data.attackerId === 'string' && data.attackerId.startsWith('citadel_')) attackerOwnerId = data.attackerId.slice(8);
        attackerColorInt = attackerOwnerId ? Theme.factionColorInt(attackerOwnerId) : Theme.BEAM.ranged;
        this._drawBeam(ax, ay, tx, ty, attackerColorInt);
      } else {
        const attacker = state.units && state.units[data.attackerId];
        if (!attacker) return;
        attackerOwnerId = attacker.ownerId;
        attackerColorInt = Theme.factionColorInt(attacker.ownerId);
        this._playAttackAnimation(attacker, tx, ty);
        if (data.killed && data.targetType === 'unit') {
          const killerOwner = state.players[attacker.ownerId];
          if (killerOwner) {
            this._addKillFeedEntry(`⚔ ${killerOwner.name} a tué une unité`, Theme.factionColorStr(attacker.ownerId));
          }
        }
      }
      const iAmAttacker = attackerOwnerId === myId;

      // Particule d'impact (couleur équipe attaquante) à chaque coup porté.
      this._spawnImpactParticles(tx, ty, attackerColorInt);

      // ── Damage numbers flottants (juice) — uniquement ce qui me concerne ──
      // Vert doré quand JE frappe, rouge quand JE encaisse. Évite le spam des
      // combats IA distants. Pas de chiffre sur les invocations/non-dégâts.
      if (data.dmg > 0 && (iAmAttacker || targetMine)) {
        const dnColor = iAmAttacker ? '#fde68a' : '#fb7185';
        const big = (data.targetType === 'unit') && Theme.unitShape(
          (state.units[data.targetId] || {}).type || ''
        ).sh === 'boss';
        this._spawnDamageNumber(tx, ty, data.dmg, dnColor, big);
      }

      // ── Kill streaks (juice) : compte mes kills d'unités rapprochés ──
      if (data.killed && data.targetType === 'unit' && iAmAttacker) {
        this._registerKill();
      }

      // Ricochet (tech 'arcane_ricochet') : mini-beam vers 2e cible + flash
      if (data.ricochet && Number.isFinite(data.ricochet.x) && Number.isFinite(data.ricochet.y)) {
        this._playRicochet(tx, ty, data.ricochet.x, data.ricochet.y);
        this._spawnImpactParticles(data.ricochet.x, data.ricochet.y, Theme.BEAM.magic);
        if (data.ricochet.killed) {
          this._spawnDeathParticles(data.ricochet.x, data.ricochet.y, Theme.BEAM.magic);
        }
      }
    });

    // ── Input ─────────────────────────────────────────────────────

    this.input.on('pointerdown', (pointer, currentlyOver) => {
      // Mode build prioritaire sur tous les autres clics
      if (typeof BuildMode !== 'undefined' && BuildMode.isActive()) {
        if (pointer.button === 0) {
          BuildMode.tryPlace(pointer.worldX, pointer.worldY);
        } else if (pointer.button === 2) {
          BuildMode.cancel(); // clic droit = annule
        }
        return;
      }
      // Mode sort actif : clic gauche = cast, clic droit = annule
      if (typeof SpellCast !== 'undefined' && SpellCast.isActive()) {
        if (pointer.button === 0) {
          SpellCast.tryCast(pointer.worldX, pointer.worldY);
        } else if (pointer.button === 2) {
          SpellCast.cancel();
        }
        return;
      }
      if (pointer.button === 0) {
        const myId   = Network.getMyId();
        const hitUnit = currentlyOver.find(go => go._unitOwnerId === myId);
        if (hitUnit) {
          if (pointer.event.shiftKey) {
            if (this.selectedUnitIds.has(hitUnit._unitId)) this.selectedUnitIds.delete(hitUnit._unitId);
            else this.selectedUnitIds.add(hitUnit._unitId);
          } else {
            this.selectedUnitIds.clear();
            this.selectedUnitIds.add(hitUnit._unitId);
          }
          this._updateSelectionRings();
          return;
        }
        if (currentlyOver.length > 0) return;
        this.isDragging = true;
        this.dragStartX = pointer.worldX;
        this.dragStartY = pointer.worldY;
        this.dragRectGraphics = this.add.graphics();
      } else if (pointer.button === 2) {
        if (this.selectedUnitIds.size === 0) return;
        const myId  = Network.getMyId();
        const state = Network.getState();
        const myPlayer = state.players[myId];
        if (myPlayer && myPlayer.eliminated) return;

        // Mémorise la position monde du clic droit + lance le timer de la roue.
        // Si l'utilisateur relâche AVANT 220ms : comportement par défaut (attack/move).
        // Sinon : la roue apparaît et le relâchement choisit l'action.
        this._rightPressWorld = { x: pointer.worldX, y: pointer.worldY };
        this._rightPressTime  = Date.now();
        this._rightPressDown  = true;
        if (typeof RadialMenu !== 'undefined') {
          RadialMenu.startPress(pointer.x, pointer.y, pointer.worldX, pointer.worldY);
        }
      }
    });

    // Suivi du mouvement pendant l'appui droit pour mettre à jour la sélection radiale
    this.input.on('pointermove', (pointer) => {
      if (this._rightPressDown && typeof RadialMenu !== 'undefined' && RadialMenu.isActive()) {
        RadialMenu.updateMove(pointer.x, pointer.y);
      }
      // Mode build : déplace le sprite fantôme à la souris
      if (typeof BuildMode !== 'undefined' && BuildMode.isActive()) {
        BuildMode.update(pointer.worldX, pointer.worldY);
      }
      if (typeof SpellCast !== 'undefined' && SpellCast.isActive()) {
        SpellCast.update(pointer.worldX, pointer.worldY);
      }
    });

    this.input.on('pointerup', (pointer) => {
      // ── Clic droit relâché : roue d'action OU action par défaut (selon durée) ──
      if (pointer.button === 2) {
        if (!this._rightPressDown) return;
        this._rightPressDown = false;
        const pressed = this._rightPressWorld;
        if (!pressed) return;

        // Le menu radial a-t-il été affiché et a-t-on choisi une option ?
        const picked = (typeof RadialMenu !== 'undefined') ? RadialMenu.endPress() : null;
        if (picked) {
          this._executeRadialAction(picked, pressed.x, pressed.y);
        } else {
          // Clic court → comportement par défaut (attack si cible, sinon move)
          this._defaultRightClick(pressed.x, pressed.y);
        }
        return;
      }
      // ── Clic gauche relâché : sélection drag ──
      if (!this.isDragging || pointer.button !== 0) return;
      this.isDragging = false;
      const x1 = Math.min(this.dragStartX, pointer.worldX);
      const y1 = Math.min(this.dragStartY, pointer.worldY);
      const x2 = Math.max(this.dragStartX, pointer.worldX);
      const y2 = Math.max(this.dragStartY, pointer.worldY);
      if (this.dragRectGraphics) { this.dragRectGraphics.destroy(); this.dragRectGraphics = null; }
      if ((x2-x1)**2 + (y2-y1)**2 < 64) {
        if (!pointer.event.shiftKey) { this.selectedUnitIds.clear(); this._updateSelectionRings(); }
      } else {
        const myId  = Network.getMyId();
        const units = Network.getState().units || {};
        if (!pointer.event.shiftKey) this.selectedUnitIds.clear();
        for (const [uid, unit] of Object.entries(units)) {
          if (unit.ownerId !== myId) continue;
          if (unit.x >= x1 && unit.x <= x2 && unit.y >= y1 && unit.y <= y2) this.selectedUnitIds.add(uid);
        }
        this._updateSelectionRings();
      }
    });
  }

  update() {
    if (!this.mapBuilt) return; // pas avant que l'event 'init' n'arrive
    const cam = this.cameras.main;
    const SPEED = 12 / cam.zoom;
    if (this.cursors.left.isDown  || this.wasd.left.isDown)  cam.scrollX -= SPEED;
    if (this.cursors.right.isDown || this.wasd.right.isDown) cam.scrollX += SPEED;
    if (this.cursors.up.isDown    || this.wasd.up.isDown)    cam.scrollY -= SPEED;
    if (this.cursors.down.isDown  || this.wasd.down.isDown)  cam.scrollY += SPEED;

    this._updateRingPositions();
    this._updateUnitBarPositions();

    if (this.isDragging && this.dragRectGraphics) {
      const ptr = this.input.activePointer;
      const rx = Math.min(this.dragStartX, ptr.worldX), rw = Math.abs(ptr.worldX - this.dragStartX);
      const ry = Math.min(this.dragStartY, ptr.worldY), rh = Math.abs(ptr.worldY - this.dragStartY);
      this.dragRectGraphics.clear();
      this.dragRectGraphics.fillStyle(0x3498db, 0.25);
      this.dragRectGraphics.fillRect(rx, ry, rw, rh);
      this.dragRectGraphics.lineStyle(2, 0x3498db, 1);
      this.dragRectGraphics.strokeRect(rx, ry, rw, rh);
    }

    // Zone de défense : cercle pointillé jaune autour des unités sélectionnées en mode defend
    this.attackGraphics.clear();
    const stateNow = Network.getState();
    if (this.selectedUnitIds.size > 0 && stateNow.units) {
      const drawn = new Set();
      for (const uid of this.selectedUnitIds) {
        const u = stateNow.units[uid];
        if (!u || u.mode !== 'defend') continue;
        const key = `${u.defendX},${u.defendY},${u.defendRadius}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
        this.attackGraphics.lineStyle(2, 0xfbbf24, 0.45);
        this.attackGraphics.strokeCircle(u.defendX, u.defendY, u.defendRadius);
        this.attackGraphics.fillStyle(0xfbbf24, 0.05);
        this.attackGraphics.fillCircle(u.defendX, u.defendY, u.defendRadius);
      }
    }

    const state = Network.getState();

    // Synchronise le slot couleur du joueur local (cyan)
    const myId = Network.getMyId();
    if (myId) Theme.setMyId(myId);

    // Recentre la caméra une fois sur mon HDV (spawn aléatoire)
    if (!this.cameraCentered) {
      const me = myId && state.players[myId];
      if (me) {
        this.cameras.main.centerOn(me.x, me.y);
        this.cameraCentered = true;
      }
    }

    this._redrawFog(state.fog);

    // Mini-carte
    if (typeof Minimap !== 'undefined') Minimap.render();

    // Villages mis à jour à chaque tick (capture progress en temps réel)
    this._syncVillages(state.villages || [], state.players);
    this._syncBuildings(state.buildings || [], state.players);

    const stateJson = JSON.stringify({ p: state.players, u: state.units });
    if (stateJson === this.lastStateJson) return;
    this.lastStateJson = stateJson;

    this._syncHDVs(state.players);
    this._syncUnits(state.units || {}, state.players);

    // Badges + halos de techs au-dessus des HDV visibles (publics, hors fog).
    if (typeof TechIndicators !== 'undefined') {
      TechIndicators.sync(state.playerSummary || [], new Set(Object.keys(state.players)), state.players);
    }
  }

  // ── Villages neutres ─────────────────────────────────────────────

  _syncBuildings(buildings, players) {
    if (!this.buildingSprites) this.buildingSprites = {};
    const cfg = Network.getConfig();
    const seen = new Set();
    const BSZ = Theme.BUILDING.size;
    const BTEX_SCALE = SpriteFactory.TEX_SIZE / SpriteFactory.TEX_R;
    // Le carré sf-square est dessiné avec demi-côté = TEX_R, donc côté = 2*TEX_R.
    // Pour avoir un carré de BSZ px à l'écran, displaySize = BSZ * (TEX_SIZE / (2*TEX_R)).
    const BDISPLAY = BSZ * BTEX_SCALE / 2;
    for (const b of buildings) {
      seen.add(b.id);
      const def = (cfg.buildingTypes || {})[b.type] || {};
      // Rempart ('wall' côté serveur) : couleur fixe gris. Sinon : faction.
      const isWall = b.type === 'wall';
      const tintColor = isWall ? Theme.BUILDING.rampart : Theme.factionColorInt(b.ownerId);
      let s = this.buildingSprites[b.id];
      if (!s) {
        // Carré tinté équipe + glow
        const bg = this.add.sprite(b.x, b.y, 'sf-square')
          .setOrigin(0.5, 0.5)
          .setDisplaySize(BDISPLAY, BDISPLAY)
          .setDepth(28);
        bg.setTint(tintColor);
        if (bg.preFX && bg.preFX.addGlow) {
          bg.preFX.setPadding(6);
          bg.preFX.addGlow(tintColor, Theme.GLOW.building.outer, Theme.GLOW.building.inner, false, Theme.GLOW.building.quality);
        }
        // Petit glyphe au centre (différencie tour/sanctum/etc.) — alpha bas pour discrétion
        const icon = this.add.text(b.x, b.y, def.icon || '', {
          fontSize: '10px', fontFamily: '"Inter", system-ui, sans-serif',
        }).setOrigin(0.5, 0.5).setDepth(29).setAlpha(0.85);
        // Barre HP : 22×3 à y-16
        const hpBg   = this.add.rectangle(b.x, b.y - BSZ / 2 - 6, BSZ + 2, 3, Theme.HP.bg, 0.85)
          .setOrigin(0.5, 0.5).setDepth(60);
        const hpFill = this.add.rectangle(b.x - (BSZ + 2) / 2, b.y - BSZ / 2 - 6, BSZ + 2, 3, Theme.HP.base)
          .setOrigin(0, 0.5).setDepth(60);

        // Click sur tour : affiche cercle de portée 2.5s (cyan)
        if (b.type === 'tower' && def.range) {
          bg.setInteractive();
          bg.on('pointerdown', () => {
            const ring = this.add.graphics().setDepth(90);
            ring.lineStyle(2, Theme.GRID.border, 0.85);
            ring.strokeCircle(b.x, b.y, def.range);
            ring.fillStyle(Theme.GRID.border, 0.06);
            ring.fillCircle(b.x, b.y, def.range);
            this.tweens.add({
              targets: ring, alpha: { from: 1, to: 0 },
              duration: 2500, ease: 'Quad.easeIn',
              onComplete: () => ring.destroy(),
            });
          });
        }
        s = { bg, icon, hpBg, hpFill };
        this.buildingSprites[b.id] = s;
      }
      s.bg.setPosition(b.x, b.y);
      s.bg.setTint(tintColor);
      s.icon.setPosition(b.x, b.y);
      s.hpBg.setPosition(b.x, b.y - BSZ / 2 - 6);
      s.hpFill.setPosition(b.x - (BSZ + 2) / 2, b.y - BSZ / 2 - 6);
      const hpRatio = b.hp / b.maxHp;
      s.hpFill.width = (BSZ + 2) * hpRatio;
      s.hpFill.setFillStyle(hpRatio > Theme.HP.threshold ? Theme.HP.base : Theme.HP.low);
    }
    // Cleanup
    for (const id of Object.keys(this.buildingSprites)) {
      if (!seen.has(id)) {
        const s = this.buildingSprites[id];
        Object.values(s).forEach(o => o && o.destroy());
        delete this.buildingSprites[id];
      }
    }
  }

  _syncVillages(villages, players) {
    const cfg = Network.getConfig();
    const CAP_TICKS = cfg.villageCaptureTicks || 200;
    const MAX_HP    = cfg.villageMaxHp || 300;
    const seen = new Set();

    // Hexagone village rayon 20, displaySize selon ratio texture
    const V_R = Theme.BASE.village.r;
    const V_DISPLAY = V_R * 2 * (SpriteFactory.TEX_SIZE / SpriteFactory.TEX_R);
    const HOLE_C = Phaser.Display.Color.HexStringToColor(Theme.BG.holePunch).color;
    const BAR_W = V_R * 2.2;

    for (const v of villages) {
      seen.add(v.id);
      const owner = v.ownerId ? players[v.ownerId] : null;
      const ownerColorInt = owner ? Theme.factionColorInt(v.ownerId) : Theme.NEUTRAL_INT;
      const destroyed = v.hp <= 0 && !v.ownerId;

      let sprite = this.villageSprites[v.id];
      if (!sprite) {
        // ── Hexagone village ──
        const main = this.add.sprite(v.x, v.y, 'sf-base-hex')
          .setOrigin(0.5, 0.5)
          .setDisplaySize(V_DISPLAY, V_DISPLAY)
          .setDepth(30);
        main.setTint(ownerColorInt);
        if (main.preFX && main.preFX.addGlow) {
          main.preFX.setPadding(10);
          main.preFX.addGlow(ownerColorInt, Theme.GLOW.base.outer, Theme.GLOW.base.inner, false, Theme.GLOW.base.quality);
        }
        main._baseScaleX = main.scaleX;
        main._baseScaleY = main.scaleY;

        // ── Trou central sombre + numéro de niveau ──
        const hole = this.add.circle(v.x, v.y, V_R * 0.45, HOLE_C, 1).setDepth(31);
        const label = this.add.text(v.x, v.y, String(v.level || 1), {
          fontSize: '14px', fontFamily: '"Inter", system-ui, sans-serif', fontStyle: 'bold',
          color: owner ? Theme.factionColorStr(v.ownerId) : Theme.NEUTRAL_STR,
        }).setOrigin(0.5, 0.5).setDepth(32);

        // ── Barre HP (au-dessus, vert) ──
        const hpBarBg   = this.add.rectangle(v.x, v.y - V_R - 10, BAR_W, 4, Theme.HP.bg, 0.85)
          .setOrigin(0.5, 0.5).setDepth(60);
        const hpBarFill = this.add.rectangle(v.x - BAR_W / 2, v.y - V_R - 10, BAR_W * (v.hp / MAX_HP), 4, Theme.HP.base)
          .setOrigin(0, 0.5).setDepth(60);

        // ── Barre capture (dorée, sous le village) ──
        const capBarBg   = this.add.rectangle(v.x, v.y + V_R + 4, V_R * 2, 3, 0x222222, 0.8)
          .setOrigin(0.5, 0.5).setDepth(60);
        const capBarFill = this.add.rectangle(v.x - V_R, v.y + V_R + 4, 0, 3, Theme.HP.capture)
          .setOrigin(0, 0.5).setDepth(60);

        // ── Zone constructible : cercle cyan alpha 0.12 ──
        const zoneBorder = this.add.graphics().setDepth(5);

        main.setInteractive();
        main.on('pointerover', () => {
          if (v.ownerId === Network.getMyId()) this.input.setDefaultCursor('pointer');
        });
        main.on('pointerout', () => this.input.setDefaultCursor('default'));
        main.on('pointerdown', () => {
          const cur = Network.getState().villages.find(vv => vv.id === v.id);
          if (cur && cur.ownerId === Network.getMyId() && typeof VillagePanel !== 'undefined') {
            VillagePanel.open(v.id);
          }
        });

        sprite = { main, label, hpBarBg, hpBarFill, capBarBg, capBarFill, zoneBorder, hole };
        this.villageSprites[v.id] = sprite;
      }

      // ── Zone constructible : seulement si possédé ──
      sprite.zoneBorder.clear();
      if (owner && !destroyed) {
        const vLvls = cfg.villageLevels || [];
        const lvl = vLvls[(v.level || 1) - 1] || vLvls[0] || {};
        const buildR = lvl.buildRadius || 160;
        sprite.zoneBorder.fillStyle(ownerColorInt, 0.08);
        sprite.zoneBorder.fillCircle(v.x, v.y, buildR);
        sprite.zoneBorder.lineStyle(2, ownerColorInt, 0.4);
        sprite.zoneBorder.strokeCircle(v.x, v.y, buildR);
      }

      // ── Update : positions + tint + numéro ──
      sprite.main.setPosition(v.x, v.y);
      sprite.main.setAlpha(destroyed ? 0.35 : 1);
      sprite.main.setTint(ownerColorInt);

      if (sprite.hole) sprite.hole.setPosition(v.x, v.y);
      sprite.label.setPosition(v.x, v.y);
      sprite.label.setText(destroyed ? '💥' : String(v.level || 1));
      sprite.label.setColor(destroyed ? '#ef4444' : (owner ? Theme.factionColorStr(v.ownerId) : Theme.NEUTRAL_STR));

      const showHp = !!owner && v.hp > 0;
      sprite.hpBarBg.setVisible(showHp);
      sprite.hpBarFill.setVisible(showHp);
      if (showHp) {
        sprite.hpBarBg.setPosition(v.x, v.y - V_R - 10);
        sprite.hpBarFill.setPosition(v.x - BAR_W / 2, v.y - V_R - 10);
        const hpRatio = v.hp / MAX_HP;
        sprite.hpBarFill.width = BAR_W * hpRatio;
        sprite.hpBarFill.setFillStyle(hpRatio > Theme.HP.threshold ? Theme.HP.base : Theme.HP.low);
      }

      const showCap = v.captureProgress > 0;
      const ratio   = Math.max(0, Math.min(1, v.captureProgress / CAP_TICKS));
      sprite.capBarBg.setVisible(showCap);
      sprite.capBarFill.setVisible(showCap);
      if (showCap) {
        sprite.capBarBg.setPosition(v.x, v.y + V_R + 4);
        sprite.capBarFill.setPosition(v.x - V_R, v.y + V_R + 4);
        sprite.capBarFill.width = (V_R * 2) * ratio;
        const capturer = v.capturingPlayerId ? players[v.capturingPlayerId] : null;
        sprite.capBarFill.setFillStyle(capturer ? Theme.factionColorInt(v.capturingPlayerId) : Theme.HP.capture);
      }
    }

    // Cleanup villages plus visibles
    for (const id of Object.keys(this.villageSprites)) {
      if (!seen.has(id)) {
        const s = this.villageSprites[id];
        Object.values(s).forEach(o => o && o.destroy());
        delete this.villageSprites[id];
      }
    }
  }

  // Calcule le zoom minimum pour que le viewport NE DÉPASSE JAMAIS la map.
  // Garantit qu'on ne voit jamais de zone hors-map.
  _recomputeMinZoom() {
    this.minZoom = Math.max(this.scale.width / this.MAP_W, this.scale.height / this.MAP_H);
  }

  // Construit la map (rectangle vert + bordure + grille + fog + bornes caméra).
  // Appelé une seule fois, après réception de l'event 'init' du serveur.
  _buildMap() {
    if (this.mapBuilt) return;
    const info = Network.getMapInfo();
    this.MAP_W = info.mapWidth;
    this.MAP_H = info.mapHeight;

    // ── SOL OBSIDIENNE (depth 0) ──
    this.add.rectangle(
      this.MAP_W / 2, this.MAP_H / 2,
      this.MAP_W, this.MAP_H,
      Phaser.Display.Color.HexStringToColor(Theme.BG.terrain).color
    ).setDepth(0);

    // ── GRILLE NÉON discrète (depth 1) ──
    const grid = this.add.graphics().setDepth(1);
    grid.lineStyle(1, Theme.GRID.color, Theme.GRID.alpha);
    const step = Theme.GRID.step;
    for (let x = step; x < this.MAP_W; x += step) grid.lineBetween(x, 0, x, this.MAP_H);
    for (let y = step; y < this.MAP_H; y += step) grid.lineBetween(0, y, this.MAP_W, y);

    // ── BORDURE CYAN (depth 2) ──
    const border = this.add.graphics().setDepth(2);
    border.lineStyle(4, Theme.GRID.border, Theme.GRID.borderA);
    border.strokeRect(0, 0, this.MAP_W, this.MAP_H);

    // Génère les textures procédurales (fallback si assets manquants)
    if (typeof SpriteFactory !== 'undefined') SpriteFactory.generateAll(this);

    // Caméra : padding de 250px hors map pour pouvoir scroller un peu au-delà
    // du bord (évite de devoir cliquer pile contre le bord de l'écran).
    const CAM_PAD = 250;
    this.cameras.main.setBounds(-CAM_PAD, -CAM_PAD, this.MAP_W + 2 * CAM_PAD, this.MAP_H + 2 * CAM_PAD);
    this._recomputeMinZoom();
    this.cameras.main.setZoom(this.minZoom);

    // Fog of war — canvas low-res, scaled up avec filtre linéaire
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width  = info.gridW;
    this.fogCanvas.height = info.gridH;
    this.fogCtx = this.fogCanvas.getContext('2d');
    this.fogCtx.fillStyle = 'rgba(0,0,0,1)';
    this.fogCtx.fillRect(0, 0, info.gridW, info.gridH);
    this.textures.addCanvas('fog-texture', this.fogCanvas);
    this.fogImage = this.add.image(0, 0, 'fog-texture').setOrigin(0, 0);
    this.fogImage.setDisplaySize(this.MAP_W, this.MAP_H);
    this.fogImage.setDepth(100);
    this.textures.get('fog-texture').setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Mini-carte
    if (typeof Minimap !== 'undefined') Minimap.init(this.cameras.main);
    if (typeof TechIndicators !== 'undefined') TechIndicators.init(this);
    if (typeof RadialMenu !== 'undefined') RadialMenu.init(this);
    if (typeof BuildMode !== 'undefined') BuildMode.init(this);
    if (typeof SpellCast !== 'undefined') SpellCast.init(this);
    this.buildingSprites = {};

    this.mapBuilt = true;
    console.log(`Map built: ${this.MAP_W}×${this.MAP_H}, grid ${info.gridW}×${info.gridH}, minZoom ${this.minZoom.toFixed(3)}`);
  }

  // ── Fog of war ────────────────────────────────────────────────────

  _redrawFog(fog) {
    if (!fog || !fog.visible || !fog.explored) {
      // Spectateur / éliminé : pas de fog
      this.fogImage.setVisible(false);
      return;
    }
    this.fogImage.setVisible(true);

    // Signature simple pour éviter de redessiner si rien n'a changé (compare longueurs + checksums rapides)
    const sig = fog.visible.byteLength + ':' + this._cheapSum(fog.visible) + ':' + this._cheapSum(fog.explored);
    if (sig === this.lastFogSignature) return;
    this.lastFogSignature = sig;

    const info = Network.getMapInfo();
    const gw = info.gridW, gh = info.gridH;
    const ctx = this.fogCtx;
    const img = ctx.getImageData(0, 0, gw, gh);
    const data = img.data;
    const vis = fog.visible, exp = fog.explored;
    // Spec : exploré rgba(4,8,12,0.55) ; jamais vu rgba(2,5,8,0.96)
    for (let i = 0; i < vis.length; i++) {
      const j = i * 4;
      if (vis[i]) {
        data[j] = data[j+1] = data[j+2] = data[j+3] = 0;
      } else if (exp[i]) {
        data[j]=4;   data[j+1]=8;   data[j+2]=12;  data[j+3]=140; // 0.55
      } else {
        data[j]=2;   data[j+1]=5;   data[j+2]=8;   data[j+3]=245; // 0.96
      }
    }
    ctx.putImageData(img, 0, 0);
    this.textures.get('fog-texture').refresh();
  }

  // Checksum très bon marché sur un Uint8Array (somme modulo)
  _cheapSum(arr) {
    let s = 0;
    for (let i = 0; i < arr.length; i += 7) s = (s + arr[i]) >>> 0;
    return s;
  }

  // ── HDVs ──────────────────────────────────────────────────────────

  _syncHDVs(players) {
    // HDV néon : hexagone glow rayon 28, trou central #04121a, ★ centré couleur équipe.
    const HDV_R = Theme.BASE.hdv.r;
    const HDV_DISPLAY = HDV_R * 2 * (SpriteFactory.TEX_SIZE / SpriteFactory.TEX_R);
    const BAR_W_HDV = HDV_R * 2.2, BAR_H_HDV = 4;
    const BAR_Y_OFF = -HDV_R - 10;
    const myId = Network.getMyId();

    for (const id of Object.keys(this.hdvSprites)) {
      if (!players[id]) { this.hdvSprites[id].forEach(o => o && o.destroy()); delete this.hdvSprites[id]; }
    }

    for (const [id, player] of Object.entries(players)) {
      const colorInt  = Theme.factionColorInt(id);
      const hpRatio   = Math.max(0, player.hp / player.maxHp);
      const destroyed = player.hp <= 0;

      // Rayon de zone constructible selon le level HDV
      const cfgH = Network.getConfig();
      const hdvLvls = cfgH.hdvLevels || [];
      const lvl = hdvLvls[(player.hdvLevel || 1) - 1] || hdvLvls[0] || {};
      const buildR = lvl.buildRadius || 240;

      if (!this.hdvSprites[id]) {
        // ── Zone constructible : carré couleur équipe alpha 0.55 (depth 5) ──
        const zoneBorder = this.add.graphics().setDepth(5);

        // ── Hexagone HDV (sf-base-hex) tinté équipe + glow ──
        const hdvObj = this.add.sprite(player.x, player.y, 'sf-base-hex')
          .setOrigin(0.5, 0.5)
          .setDisplaySize(HDV_DISPLAY, HDV_DISPLAY)
          .setDepth(30);
        hdvObj.setTint(destroyed ? 0x888888 : colorInt);
        if (hdvObj.preFX && hdvObj.preFX.addGlow) {
          hdvObj.preFX.setPadding(12);
          hdvObj.preFX.addGlow(destroyed ? 0x888888 : colorInt, Theme.GLOW.base.outer, Theme.GLOW.base.inner, false, Theme.GLOW.base.quality);
        }
        if (destroyed) hdvObj.setAlpha(0.45);
        hdvObj._baseScaleX = hdvObj.scaleX;
        hdvObj._baseScaleY = hdvObj.scaleY;

        // ── Trou central sombre (rayon r*0.45) ──
        const hole = this.add.circle(player.x, player.y, HDV_R * 0.45,
          Phaser.Display.Color.HexStringToColor(Theme.BG.holePunch).color, 1).setDepth(31);

        // ── Glyphe ★ couleur équipe ──
        const glyph = this.add.text(player.x, player.y, Theme.BASE.hdv.glyph, {
          fontSize: '20px', fontFamily: '"Inter", system-ui, sans-serif', fontStyle: 'bold',
          color: destroyed ? '#888888' : Theme.factionColorStr(id),
        }).setOrigin(0.5, 0.5).setDepth(32);

        if (id === myId) {
          hdvObj.setInteractive();
          hdvObj.on('pointerover', () => this.input.setDefaultCursor('pointer'));
          hdvObj.on('pointerout',  () => this.input.setDefaultCursor('default'));
          hdvObj.on('pointerdown', () => HdvPanel.toggle());
        }

        // ── Barre HP base : fond noir, vert plein ──
        const barBg   = this.add.rectangle(player.x, player.y + BAR_Y_OFF, BAR_W_HDV, BAR_H_HDV, Theme.HP.bg, 0.85)
          .setOrigin(0.5, 0.5).setDepth(60);
        const barFill = this.add.rectangle(player.x - BAR_W_HDV / 2, player.y + BAR_Y_OFF, BAR_W_HDV * hpRatio, BAR_H_HDV, Theme.HP.base)
          .setOrigin(0, 0.5).setDepth(60);

        const nameLabel = this.add.text(player.x, player.y + BAR_Y_OFF - 10, player.name, {
          fontSize: '14px', fontFamily: '"Inter", system-ui, sans-serif', fontStyle: '600',
          color: Theme.factionColorStr(id),
        }).setOrigin(0.5, 1).setDepth(70);
        const hpLabel = this.add.text(player.x, player.y + HDV_R + 8, `${player.hp}/${player.maxHp}`, {
          fontSize: '11px', fontFamily: '"Inter", system-ui, sans-serif',
          color: '#e2e8f0',
        }).setOrigin(0.5, 0).setDepth(70);

        this.hdvSprites[id] = [hdvObj, barBg, barFill, nameLabel, hpLabel, zoneBorder, hole, glyph];
        this.hdvSprites[id]._currentBuildR = buildR;
      }

      // ── Update (positions + tint + barre PV) ──
      const [hdvObj, barBg, barFill, nameLabel, hpLabel, zoneBorder, hole, glyph] = this.hdvSprites[id];

      hdvObj.setPosition(player.x, player.y);
      if (hdvObj.setTint) hdvObj.setTint(destroyed ? 0x888888 : colorInt);
      hdvObj.setAlpha(destroyed ? 0.45 : 1);
      if (!destroyed && hpRatio < 0.3) {
        hdvObj.setAlpha(0.9 + 0.1 * Math.sin(Date.now() / 200));
      }

      if (hole) hole.setPosition(player.x, player.y);
      if (glyph) {
        glyph.setPosition(player.x, player.y);
        glyph.setColor(destroyed ? '#888888' : Theme.factionColorStr(id));
      }

      // Zone constructible : redraw à chaque tick (peu coûteux)
      zoneBorder.clear();
      zoneBorder.fillStyle(Theme.GRID.buildZone, destroyed ? 0.04 : Theme.GRID.buildZoneA);
      zoneBorder.fillCircle(player.x, player.y, buildR);
      zoneBorder.lineStyle(2, Theme.GRID.buildZone, destroyed ? 0.18 : 0.5);
      zoneBorder.strokeCircle(player.x, player.y, buildR);
      this.hdvSprites[id]._currentBuildR = buildR;

      barBg.setPosition(player.x, player.y + BAR_Y_OFF);
      barFill.setPosition(player.x - BAR_W_HDV / 2, player.y + BAR_Y_OFF);
      barFill.width = BAR_W_HDV * hpRatio;
      barFill.setFillStyle(hpRatio > Theme.HP.threshold ? Theme.HP.base : Theme.HP.low);

      nameLabel.setPosition(player.x, player.y + BAR_Y_OFF - 10)
        .setText(player.eliminated ? '💀 ÉLIMINÉ' : player.name)
        .setColor(player.eliminated ? '#ef4444' : Theme.factionColorStr(id));
      hpLabel.setPosition(player.x, player.y + HDV_R + 8).setText(`${player.hp}/${player.maxHp}`);
    }
  }

  // ── Units ─────────────────────────────────────────────────────────

  _syncUnits(units, players) {
    const myId = Network.getMyId();

    for (const id of Object.keys(this.unitSprites)) {
      if (!units[id]) {
        // ── SQUASH DE MORT (juice §11.4) : scale → 0 + alpha → 0 en 200ms, puis destroy ──
        const arr = this.unitSprites[id];
        const sprite = arr && arr[0];
        if (sprite) {
          this.tweens.add({
            targets: sprite,
            scaleX: 0, scaleY: 0, alpha: 0,
            duration: 200, ease: 'Cubic.easeIn',
            onComplete: () => arr.forEach(o => { if (o && o.destroy) o.destroy(); }),
          });
          // Détruire immédiatement les éléments secondaires (barres, badge)
          for (let i = 1; i < arr.length; i++) {
            if (arr[i] && arr[i].destroy) {
              this.tweens.add({ targets: arr[i], alpha: 0, duration: 180, onComplete: () => arr[i] && arr[i].destroy && arr[i].destroy() });
            }
          }
        }
        delete this.unitSprites[id];
        if (this.unitTweens[id])    { this.unitTweens[id].stop(); delete this.unitTweens[id]; }
        delete this.unitServerPos[id];
        this.selectedUnitIds.delete(id);
        if (this.selectionRings[id]) { this.selectionRings[id].destroy(); delete this.selectionRings[id]; }
      }
    }

    for (const [id, unit] of Object.entries(units)) {
      const isNeutral = Theme.isNeutralOwner(unit.ownerId);
      const isCampBoss = unit.ownerId === 'neutral_boss' || (unit.neutralRole === 'camp_boss');
      const colorInt = Theme.factionColorInt(unit.ownerId, unit.type);
      // Mob d'un camp PvE traité comme un boss (forme boss + glow renforcé) si camp_boss.
      const shape    = isCampBoss ? { sh:'boss', sz:16, ax:null } : Theme.unitShape(unit.type);
      const isBoss   = shape.sh === 'boss';
      const isBeast  = !!Theme.BEAST[unit.type];
      const prev     = this.unitServerPos[id];
      const posChanged = !prev || prev.x !== unit.x || prev.y !== unit.y;
      const hpChanged  = !prev || prev.hp !== unit.hp;
      this.unitServerPos[id] = { x: unit.x, y: unit.y, hp: unit.hp };

      if (!this.unitSprites[id]) {
        // ── Forme principale (texture sf-{sh}) tintée couleur équipe ──
        const texKey = 'sf-' + shape.sh;
        const sz = shape.sz;
        // La texture mesure SpriteFactory.TEX_SIZE ; la forme à l'intérieur a un rayon TEX_R.
        // Pour avoir la forme à `sz` à l'écran, on étire la texture entière à sz * (TEX_SIZE/TEX_R).
        const displaySize = sz * (SpriteFactory.TEX_SIZE / SpriteFactory.TEX_R);
        const sprite = this.add.sprite(unit.x, unit.y, texKey)
          .setOrigin(0.5, 0.5)
          .setDisplaySize(displaySize, displaySize)
          .setDepth(50);
        // Couleur : faction pour joueur, couleur propre pour bête.
        const tintColor = isBeast ? Theme.BEAST[unit.type].color : colorInt;
        sprite.setTint(tintColor);
        // Glow néon via preFX (postFX désactivé dans ce build Phaser)
        const gp = isBoss ? Theme.GLOW.unitBoss : Theme.GLOW.unit;
        if (sprite.preFX && sprite.preFX.addGlow) {
          sprite.preFX.setPadding(8);
          sprite.preFX.addGlow(tintColor, gp.outer, gp.inner, false, gp.quality);
        }

        // Mémorise baseScale APRÈS setDisplaySize → wobble = multiplicateur
        sprite._baseScaleX = sprite.scaleX;
        sprite._baseScaleY = sprite.scaleY;
        sprite._unitId      = id;
        sprite._unitOwnerId = unit.ownerId;
        sprite._unitType    = unit.type;
        sprite._idlePhase   = Math.random() * Math.PI * 2;

        // ── Pastille d'axe (sci/mag/rel) ──
        // Bêtes + tous les neutres : pas de pastille d'axe.
        // Boss : disque blanc central.
        let axisDot = null;
        if (!isBeast && !isNeutral) {
          if (isBoss) {
            axisDot = this.add.circle(unit.x, unit.y, sz * 0.4, 0xffffff, 1).setDepth(51);
          } else {
            const axColor = Theme.AXC_INT[shape.ax] || 0xffffff;
            const dotR = Math.max(1.5, sz * 0.28);
            axisDot = this.add.circle(unit.x, unit.y, dotR, axColor, 1).setDepth(51);
          }
        } else if (isCampBoss) {
          // Boss de camp : disque blanc central (signature visuelle des boss).
          axisDot = this.add.circle(unit.x, unit.y, sz * 0.4, 0xffffff, 1).setDepth(51);
        }

        if (unit.ownerId === myId) {
          sprite.setInteractive(
            new Phaser.Geom.Circle(sprite.width / 2, sprite.height / 2, 30),
            Phaser.Geom.Circle.Contains
          );
          sprite.on('pointerover', () => this.input.setDefaultCursor('pointer'));
          sprite.on('pointerout',  () => this.input.setDefaultCursor('default'));
        }

        // ── Barre de vie (au-dessus du sprite, à sz+6 px) ──
        const barW = sz * 2;
        const barY = -(sz + 6);
        const barBg   = this.add.rectangle(unit.x, unit.y + barY, barW, 3, Theme.HP.bg, 0.85)
          .setOrigin(0.5, 0.5).setDepth(60);
        const barFill = this.add.rectangle(unit.x - barW / 2, unit.y + barY, barW * (unit.hp / unit.maxHp), 3, Theme.HP.full)
          .setOrigin(0, 0.5).setDepth(60);
        barFill._barW = barW;
        barFill._barY = barY;
        barBg._barY   = barY;

        const badge = this.add.text(unit.x + sz + 8, unit.y - sz - 6, this._modeIcon(unit.mode), {
          fontSize: '11px', fontFamily: '"Inter", system-ui, sans-serif',
        }).setOrigin(0.5, 0.5).setDepth(70);

        // ── Effet gel (créé à la demande dans _updateUnitBarPositions) ──
        const freeze = null;

        this.unitSprites[id] = [sprite, barBg, barFill, badge, axisDot, freeze];

        // ── POP D'APPARITION (juice §11.3) : scale 0 → 1 en 150ms, Back.easeOut ──
        sprite.setScale(sprite._baseScaleX * 0.1, sprite._baseScaleY * 0.1);
        if (axisDot) axisDot.setScale(0.1);
        this.tweens.add({
          targets: sprite,
          scaleX: sprite._baseScaleX,
          scaleY: sprite._baseScaleY,
          duration: 180, ease: 'Back.easeOut',
        });
        if (axisDot) this.tweens.add({ targets: axisDot, scale: 1, duration: 180, ease: 'Back.easeOut' });

        // ── PULSE GLOW pour les boss (juice §11.8) — outer oscille subtilement ──
        if (isBoss && sprite.preFX && sprite.preFX.list && sprite.preFX.list.length) {
          const glowFX = sprite.preFX.list[0];
          const gpBoss = Theme.GLOW.unitBoss;
          this.tweens.add({
            targets: glowFX,
            outerStrength: { from: gpBoss.outer * 0.85, to: gpBoss.outer * 1.15 },
            duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          });
        }

      } else if (posChanged || hpChanged) {
        const [sprite, , barFill, badge] = this.unitSprites[id];
        if (badge) badge.setText(this._modeIcon(unit.mode));

        if (hpChanged) {
          const ratio = unit.hp / unit.maxHp;
          const barW = barFill._barW || 18;
          barFill.width = Math.max(0, barW * ratio);
          const c = ratio > Theme.HP.threshold ? Theme.HP.full : Theme.HP.low;
          barFill.setFillStyle(c);
        }
        if (posChanged) {
          if (this.unitTweens[id]) this.unitTweens[id].stop();
          this.unitTweens[id] = this.tweens.add({
            targets: sprite, x: unit.x, y: unit.y,
            duration: 50, ease: 'Linear',
            onComplete: () => { delete this.unitTweens[id]; },
          });
        }
      }
    }
  }

  // ── Selection ─────────────────────────────────────────────────────

  _updateSelectionRings() {
    for (const id of Object.keys(this.selectionRings)) {
      if (!this.selectedUnitIds.has(id)) { this.selectionRings[id].destroy(); delete this.selectionRings[id]; }
    }
    for (const id of this.selectedUnitIds) {
      if (this.selectionRings[id] || !this.unitSprites[id]) continue;
      const unitSprite = this.unitSprites[id][0];
      const sz = (Theme.unitShape(unitSprite._unitType) || { sz: 9 }).sz;
      // Anneau cyan ; on dimensionne pour qu'il dépasse l'unité de SELECTION.ringOffset
      const targetDiameter = (sz + Theme.SELECTION.ringOffset) * 2;
      const ring = this.add.sprite(unitSprite.x, unitSprite.y, 'sf-selection')
        .setDisplaySize(targetDiameter, targetDiameter)
        .setDepth(55);
      ring._baseScaleX = ring.scaleX;
      ring._baseScaleY = ring.scaleY;
      this.tweens.add({
        targets: ring,
        scaleX: { from: ring._baseScaleX * 0.92, to: ring._baseScaleX * 1.08 },
        scaleY: { from: ring._baseScaleY * 0.92, to: ring._baseScaleY * 1.08 },
        alpha:  { from: 1.0, to: 0.55 },
        duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      this.selectionRings[id] = ring;
    }
    const el = document.getElementById('selected-count');
    if (el) el.textContent = this.selectedUnitIds.size;
  }

  _updateRingPositions() {
    for (const [id, ring] of Object.entries(this.selectionRings)) {
      const sp = this.unitSprites[id];
      if (sp) ring.setPosition(sp[0].x, sp[0].y);
    }
  }

  _updateUnitBarPositions() {
    // Wobble idle TRÈS subtil via multiplicateur sur baseScale.
    const t = Date.now() / 420;
    const stateUnits = Network.getState().units || {};
    for (const [id, sprites] of Object.entries(this.unitSprites)) {
      if (sprites.length < 3) continue;
      const [sprite, barBg, barFill, badge, axisDot] = sprites;
      const phase = (sprite._idlePhase || 0);
      const wobble = Math.sin(t + phase);
      const barY = (barFill && barFill._barY) || -16;
      const barW = (barFill && barFill._barW) || 18;
      barBg.setPosition(sprite.x, sprite.y + barY);
      barFill.setPosition(sprite.x - barW / 2, sprite.y + barY);
      if (axisDot) axisDot.setPosition(sprite.x, sprite.y);
      if (badge) {
        const sz = (Theme.unitShape(sprite._unitType) || { sz: 9 }).sz;
        badge.setPosition(sprite.x + sz + 8, sprite.y - sz - 6);
      }
      const bx = sprite._baseScaleX || sprite.scaleX;
      const by = sprite._baseScaleY || sprite.scaleY;
      if (bx && by) sprite.setScale(bx, by * (1 + wobble * 0.025));

      // Effet gel : disque cyan semi-transparent tant que frozenUntil (timestamp
      // serveur, epoch ms) n'est pas écoulé. (Fix : l'ancien check `u.freeze`
      // testait un champ qui n'a jamais existé côté serveur.)
      const u = stateUnits[id];
      const isFrozen = u && u.frozenUntil && u.frozenUntil > Date.now();
      let freezeObj = sprites[5];
      if (isFrozen) {
        const sz = (Theme.unitShape(sprite._unitType) || { sz: 9 }).sz;
        if (!freezeObj) {
          freezeObj = this.add.circle(sprite.x, sprite.y, sz + 2, Theme.FREEZE_COLOR, Theme.FREEZE_ALPHA).setDepth(52);
          sprites[5] = freezeObj;
        }
        freezeObj.setPosition(sprite.x, sprite.y);
      } else if (freezeObj) {
        freezeObj.destroy();
        sprites[5] = null;
      }
    }
  }

  _modeIcon(mode) {
    if (mode === 'defend') return '🛡';
    if (mode === 'attack') return '⚔';
    if (mode === 'move')   return '';
    return '';
  }

  // Clic droit court : comportement par défaut (attack si cible, sinon move)
  _defaultRightClick(wx, wy) {
    const myId  = Network.getMyId();
    const state = Network.getState();

    let hitEnemyUnit = null;
    for (const [uid, unit] of Object.entries(state.units || {})) {
      if (unit.ownerId === myId) continue;
      if (Math.hypot(wx - unit.x, wy - unit.y) <= 30) { hitEnemyUnit = uid; break; }
    }
    if (hitEnemyUnit) {
      Network.attackTarget(Array.from(this.selectedUnitIds), hitEnemyUnit, 'unit');
      this._showMoveIndicator(wx, wy, true);
      return;
    }

    let hitEnemyHdv = null;
    for (const [pid, player] of Object.entries(state.players || {})) {
      if (pid === myId || player.hp <= 0) continue;
      if (Math.abs(wx - player.x) <= 70 && Math.abs(wy - player.y) <= 70) { hitEnemyHdv = pid; break; }
    }
    if (hitEnemyHdv) {
      Network.attackTarget(Array.from(this.selectedUnitIds), hitEnemyHdv, 'hdv');
      this._showMoveIndicator(wx, wy, true);
      return;
    }

    // Bâtiment ennemi → attaque
    let hitEnemyBuilding = null;
    for (const b of (state.buildings || [])) {
      if (b.ownerId === myId) continue;
      if (Math.abs(wx - b.x) <= 30 && Math.abs(wy - b.y) <= 30) { hitEnemyBuilding = b.id; break; }
    }
    if (hitEnemyBuilding) {
      Network.attackTarget(Array.from(this.selectedUnitIds), hitEnemyBuilding, 'building');
      this._showMoveIndicator(wx, wy, true);
      return;
    }

    // Village : neutre → MOVE pour capturer (10s sur place) ; ennemi → ATTAQUE
    let villageNeutral = null, villageEnemy = null;
    for (const v of (state.villages || [])) {
      if (v.ownerId === myId) continue;
      if (Math.abs(wx - v.x) <= 55 && Math.abs(wy - v.y) <= 55) {
        if (!v.ownerId) villageNeutral = v;
        else villageEnemy = v.id;
        break;
      }
    }
    if (villageEnemy) {
      Network.attackTarget(Array.from(this.selectedUnitIds), villageEnemy, 'village');
      this._showMoveIndicator(wx, wy, true);
      return;
    }
    if (villageNeutral) {
      // Move au centre du village pour démarrer la capture (10s sur place)
      Network.moveUnits(Array.from(this.selectedUnitIds), villageNeutral.x, villageNeutral.y);
      this._showMoveIndicator(villageNeutral.x, villageNeutral.y, false);
      return;
    }

    Network.moveUnits(Array.from(this.selectedUnitIds), wx, wy);
    this._showMoveIndicator(wx, wy, false);
  }

  // Action explicitement choisie via la roue radiale
  _executeRadialAction(action, wx, wy) {
    const ids = Array.from(this.selectedUnitIds);
    if (ids.length === 0) return;
    if (action === 'attack') {
      // Cherche une cible proche (unit/HDV/village), sinon attack-move vers la position
      const state = Network.getState();
      const myId  = Network.getMyId();
      let target = null, type = null;
      for (const [uid, unit] of Object.entries(state.units || {})) {
        if (unit.ownerId === myId) continue;
        if (Math.hypot(wx - unit.x, wy - unit.y) <= 60) { target = uid; type = 'unit'; break; }
      }
      if (!target) {
        for (const [pid, player] of Object.entries(state.players || {})) {
          if (pid === myId || player.hp <= 0) continue;
          if (Math.abs(wx - player.x) <= 100 && Math.abs(wy - player.y) <= 100) { target = pid; type = 'hdv'; break; }
        }
      }
      if (!target) {
        // Attack n'engage QUE les villages ennemis (pas les neutres → ceux-là se capturent au move)
        for (const v of (state.villages || [])) {
          if (v.ownerId === myId || !v.ownerId) continue;
          if (Math.abs(wx - v.x) <= 90 && Math.abs(wy - v.y) <= 90) { target = v.id; type = 'village'; break; }
        }
      }
      if (target) {
        Network.attackTarget(ids, target, type);
      } else {
        // Pas de cible : on déplace en mode attaque (move puis engage les ennemis sur le chemin)
        Network.moveUnits(ids, wx, wy);
      }
      this._showMoveIndicator(wx, wy, true);
    } else if (action === 'move') {
      Network.moveUnits(ids, wx, wy);
      this._showMoveIndicator(wx, wy, false);
    } else if (action === 'defend') {
      // Défendre la zone autour du clic
      if (Network.defendArea) {
        Network.defendArea(ids, wx, wy, 280);
      }
      // Indicateur visuel : grand cercle doré qui fade
      const g = this.add.graphics();
      g.lineStyle(3, 0xfbbf24, 1);
      g.strokeCircle(0, 0, 60);
      g.setPosition(wx, wy);
      this.tweens.add({ targets: g, alpha: 0, duration: 600, ease: 'Power2', onComplete: () => g.destroy() });
    }
  }

  // ── Visual effects ────────────────────────────────────────────────

  _flashUnit(unitId) {
    const sprites = this.unitSprites[unitId];
    if (!sprites) return;
    const sprite = sprites[0];
    if (!sprite || !sprite.setTintFill) return;
    const baseTint = sprite.tintTopLeft || 0xffffff;
    sprite.setTintFill(0xffffff);
    this.time.delayedCall(80, () => {
      if (this.unitSprites[unitId] && sprite.setTint) sprite.setTint(baseTint);
    });
  }

  // ── Impact punch (juice) : petit coup de scale sur l'unité touchée ──
  // Lit/écrit _baseScaleX/Y (jamais sprite.scaleX/Y, pollué par le wobble idle).
  _impactPunch(unitId) {
    const sprites = this.unitSprites[unitId];
    if (!sprites) return;
    const sprite = sprites[0];
    if (!sprite) return;
    const bx = sprite._baseScaleX || sprite.scaleX;
    const by = sprite._baseScaleY || sprite.scaleY;
    this.tweens.add({
      targets: sprite,
      scaleX: bx * 1.28, scaleY: by * 1.28,
      duration: 70, yoyo: true, ease: 'Quad.easeOut',
    });
  }

  // ── Damage number flottant (juice) : monte et fade ──
  _spawnDamageNumber(x, y, dmg, colorStr, big) {
    const jitter = (Math.random() - 0.5) * 14;
    const txt = this.add.text(x + jitter, y - 8, String(dmg), {
      fontFamily: '"Inter", system-ui, sans-serif',
      fontSize: big ? '20px' : '14px',
      fontStyle: '800',
      color: colorStr,
      stroke: '#04121a',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(80);
    this.tweens.add({
      targets: txt,
      y: y - (big ? 56 : 40),
      alpha: { from: 1, to: 0 },
      scale: { from: big ? 1.15 : 1, to: 0.85 },
      duration: big ? 900 : 680,
      ease: 'Quad.easeOut',
      onComplete: () => txt.destroy(),
    });
  }

  // ── Screen flash bref (juice) : voile coloré plein écran qui s'estompe ──
  // Rectangle fixé à la caméra (scrollFactor 0), alpha contrôlé, blend ADD.
  _screenFlash(colorInt, alpha, durationMs) {
    const w = this.scale.width, h = this.scale.height;
    const veil = this.add.rectangle(w / 2, h / 2, w, h, colorInt, alpha || 0.16)
      .setScrollFactor(0).setDepth(200).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: veil, alpha: 0, duration: durationMs || 160,
      ease: 'Quad.easeOut', onComplete: () => veil.destroy(),
    });
  }

  // ── Kill streaks (juice) : kills rapprochés du joueur local ──
  _registerKill() {
    const now = Date.now();
    if (!this._killStreak || now - this._killStreak.last > 3000) {
      this._killStreak = { count: 0, last: now };
    }
    this._killStreak.count++;
    this._killStreak.last = now;
    const c = this._killStreak.count;
    const LABELS = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'QUADRA KILL', 5: 'PENTA KILL' };
    if (c >= 2) this._killStreakBanner(c >= 6 ? 'MASSACRE' : (LABELS[c] || 'PENTA KILL'), c);
  }

  _killStreakBanner(text, count) {
    let el = document.getElementById('kill-streak');
    if (!el) { el = document.createElement('div'); el.id = 'kill-streak'; document.body.appendChild(el); }
    // Couleur qui monte en intensité avec le streak
    const color = count >= 5 ? '#fb7185' : count >= 4 ? '#fcd34d' : count >= 3 ? '#a78bfa' : '#22d3ee';
    el.textContent = `${text} ×${count}`;
    el.style.color = color;
    el.style.textShadow = `0 0 18px ${color}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove('show'), 1400);
  }

  _flashHdv(playerId) {
    const sprites = this.hdvSprites[playerId];
    if (!sprites) return;
    const sprite = sprites[0];
    if (!sprite || !sprite.setTintFill) return;
    const baseTint = sprite.tintTopLeft || 0xffffff;
    sprite.setTintFill(0xffffff);
    this.time.delayedCall(80, () => {
      if (this.hdvSprites[playerId] && sprite.setTint) sprite.setTint(baseTint);
    });
  }

  _spawnImpactParticles(x, y, colorInt) {
    const emitter = this.add.particles(x, y, 'particle', {
      tint: colorInt,
      speed: { min: Theme.PARTICLE.speedImpact.min, max: Theme.PARTICLE.speedImpact.max },
      scale: { start: 1.0, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: Theme.PARTICLE.impactLife,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    emitter.explode(Theme.PARTICLE.impactCount);
    this.time.delayedCall(Theme.PARTICLE.impactLife + 50, () => emitter.destroy());
  }

  _spawnDeathParticles(x, y, colorInt) {
    const emitter = this.add.particles(x, y, 'particle', {
      tint: colorInt,
      speed: { min: Theme.PARTICLE.speedDeath.min, max: Theme.PARTICLE.speedDeath.max },
      scale: { start: 1.2, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: Theme.PARTICLE.deathLife,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    emitter.explode(Theme.PARTICLE.deathCount);
    this.time.delayedCall(Theme.PARTICLE.deathLife + 100, () => emitter.destroy());
  }

  // ── Beam de tir (Graphics ligne) : segment lumineux qui fade en 120 ms ──
  _drawBeam(x0, y0, x1, y1, color) {
    const g = this.add.graphics().setDepth(55);
    g.setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(Theme.BEAM.width, color, 1);
    g.lineBetween(x0, y0, x1, y1);
    // Petit halo : 2e ligne plus fine plus claire
    g.lineStyle(1, 0xffffff, 0.7);
    g.lineBetween(x0, y0, x1, y1);
    this.tweens.add({
      targets: g,
      alpha: { from: 1, to: 0 },
      duration: Theme.BEAM.duration,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
    return g;
  }

  // ── Projectile néon volant : sprite tinté qui vole de attacker → target en 280ms ──
  // Utilisé pour les unités à projectile (archer, crossbow, catapult, cannon).
  // Trail particle néon derrière (couleur de tint).
  _drawProjectile(x0, y0, x1, y1, color) {
    const proj = this.add.sprite(x0, y0, 'sf-projectile')
      .setOrigin(0.5, 0.5).setDisplaySize(7, 7).setDepth(55);
    proj.setTint(color);
    proj.setBlendMode(Phaser.BlendModes.ADD);
    // Glow via preFX (cohérence avec les autres sprites néon)
    if (proj.preFX && proj.preFX.addGlow) {
      proj.preFX.setPadding(6);
      proj.preFX.addGlow(color, 2.5, 0, false, 0.15);
    }
    // Trail : emitter qui suit le sprite et émet 1 particule tous les 25ms
    const emitter = this.add.particles(x0, y0, 'particle', {
      tint: color, follow: proj,
      speed: { min: 5, max: 15 }, scale: { start: 1.0, end: 0 },
      alpha: { start: 0.7, end: 0 }, lifespan: 220,
      frequency: 25, blendMode: Phaser.BlendModes.ADD,
    });
    this.tweens.add({
      targets: proj, x: x1, y: y1,
      duration: 280, ease: 'Quad.easeOut',
      onComplete: () => {
        emitter.stop();
        this.time.delayedCall(250, () => emitter.destroy());
        proj.destroy();
      },
    });
    return proj;
  }

  // ── Animations d'attaque pour les unités : beam si distance, sinon flash mêlée ──
  _playAttackAnimation(attacker, tx, ty) {
    const dist = Math.hypot(tx - attacker.x, ty - attacker.y);
    const category = Theme.BEAM_BY_TYPE[attacker.type] || 'melee';

    if (category === 'melee' || dist <= 50) {
      // Mêlée : pas de beam — flash blanc au point d'impact (l'effet de particules
      // d'impact vient de l'event 'attack' via _spawnImpactParticles).
      const flash = this.add.circle(tx, ty, 8, 0xffffff, 0.7).setDepth(54);
      flash.setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: flash,
        scale: { from: 0.4, to: 1.6 },
        alpha: { from: 0.7, to: 0 },
        duration: 180, ease: 'Cubic.easeOut',
        onComplete: () => flash.destroy(),
      });
      return;
    }

    // ── Catégorie 'ranged' : nouveau visuel projectile néon volant ──
    // Archer/Arbalétrier/Catapulte/Canon ont leur propre sprite qui vole.
    // Magie/Holy gardent les beams laser instantanés (signature visuelle distincte).
    if (category === 'ranged') {
      this._drawProjectile(attacker.x, attacker.y, tx, ty, Theme.BEAM.ranged);
      return;
    }

    // Beam distant pour magie/holy : couleur dépend de la catégorie
    let color;
    if (category === 'magic') color = Theme.BEAM.magic;
    else if (category === 'holy') color = Theme.BEAM.holy;
    else color = Theme.BEAM.ranged;
    this._drawBeam(attacker.x, attacker.y, tx, ty, color);
  }

  // ── Ricochet visible (juice tech 'arcane_ricochet') ──
  // Affiche un mini-beam du 1er impact vers la 2e cible + flash au point de ricochet.
  _playRicochet(srcX, srcY, dstX, dstY) {
    // Mini-flash au point de départ (1er impact)
    const flash = this.add.circle(srcX, srcY, 6, 0xffffff, 0.85).setDepth(56);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: flash, scale: { from: 0.4, to: 1.4 }, alpha: { from: 1, to: 0 },
      duration: 200, ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });
    // Beam de rebond — délai 80ms pour que l'œil capte le rebond, pas instantané
    this.time.delayedCall(60, () => {
      this._drawBeam(srcX, srcY, dstX, dstY, Theme.BEAM.magic);
    });
  }

  _showMoveIndicator(x, y, isAttack = false) {
    const color = isAttack ? Theme.HP.low : Theme.GRID.border;
    const g = this.add.graphics().setDepth(56);
    g.setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(2, color, 1);
    g.strokeCircle(0, 0, 12);
    g.setPosition(x, y);
    this.tweens.add({ targets: g, alpha: 0, scale: 1.4, duration: 300, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
  }

  // ── Kill feed ─────────────────────────────────────────────────────

  // Toast HUD éphémère centré-bas (erreurs d'action : ressources, pop, verrou…).
  // Déduplique les messages rapprochés pour éviter le spam au clic répété.
  _hudToast(msg) {
    let el = document.getElementById('hud-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hud-toast';
      document.body.appendChild(el);
    }
    if (el._lastMsg === msg && Date.now() - (el._lastAt || 0) < 700) return;
    el._lastMsg = msg; el._lastAt = Date.now();
    el.textContent = msg;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove('show'), 1600);
  }

  _addKillFeedEntry(text, color) {
    const feed = document.getElementById('kill-feed');
    if (!feed) return;
    const entry = document.createElement('div');
    entry.className = 'kill-entry';
    entry.style.borderLeftColor = color || '#fff';
    entry.textContent = text;
    feed.appendChild(entry);
    // Remove after animation ends (3s total)
    setTimeout(() => {
      if (entry.parentNode) entry.parentNode.removeChild(entry);
    }, 3000);
    // Keep feed to max 5 entries
    while (feed.children.length > 5) feed.removeChild(feed.firstChild);
  }
}
