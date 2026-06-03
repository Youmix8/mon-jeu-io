const UNIT_RADIUS = 15;
const BAR_W       = 30;
const BAR_H       = 4;
const BAR_Y       = -(UNIT_RADIUS + 8);

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
    this.assetMissing = {};
  }

  _hasAsset(key) {
    // Aucun asset PNG en mode néon — toujours faux pour forcer la voie procédurale.
    return false;
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

    // Particle texture for unit death burst
    const pg = this.make.graphics({ add: false });
    pg.fillStyle(0xffffff, 1);
    pg.fillCircle(4, 4, 4);
    pg.generateTexture('particle', 8, 8);
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

    // ── F — vue d'ensemble (fit map) ──────────────────────────────
    this.input.keyboard.on('keydown-F', () => {
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
      if (reason !== 'not_enough_gold') return;
      const el = document.getElementById('my-gold-row');
      if (!el) return;
      el.classList.remove('flash-error');
      void el.offsetWidth;
      el.classList.add('flash-error');
    });

    Network.setOnPlayerEliminated((data) => {
      this._addKillFeedEntry(`💀 ${data.name} éliminé !`, data.color);
    });

    Network.setOnVillageCaptured((data) => {
      this._addKillFeedEntry(`🏘 ${data.ownerName} capture un village`, data.ownerColor);
    });

    Network.setOnVillageDestroyed((data) => {
      const state = Network.getState();
      const attacker = state.players[data.byPlayerId];
      const attackerName = attacker ? attacker.name : 'Quelqu\'un';
      const attackerColor = attacker ? attacker.color : '#ef4444';
      this._addKillFeedEntry(`💥 ${attackerName} détruit un village`, attackerColor);
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

      // ── Résoudre la position de la cible ──
      let tx, ty;
      if (data.targetType === 'unit') {
        const t = state.units && state.units[data.targetId];
        if (!t) return;
        tx = t.x; ty = t.y;
        this._flashUnit(data.targetId);
        if (data.killed) {
          const owner = state.players[t.ownerId];
          const colorInt = owner
            ? Phaser.Display.Color.HexStringToColor(owner.color).color
            : 0xffffff;
          this._spawnDeathParticles(t.x, t.y, colorInt);
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
        this._flashHdv(data.targetId);
      }

      // ── Résoudre l'attaquant (unité OU bâtiment) ──
      if (data.attackerType === 'building') {
        // Flèche depuis le bâtiment (les coords sont fournies en bx, by)
        const ax = (data.bx != null) ? data.bx : tx;
        const ay = (data.by != null) ? data.by : ty;
        this._playArrowAnimation(ax, ay, tx, ty);
      } else {
        const attacker = state.units && state.units[data.attackerId];
        if (!attacker) return;
        this._playAttackAnimation(attacker, tx, ty);
        // Kill feed unit→unit
        if (data.killed && data.targetType === 'unit') {
          const killerOwner = state.players[attacker.ownerId];
          if (killerOwner) {
            this._addKillFeedEntry(`⚔️ ${killerOwner.name} a tué une unité`, killerOwner.color);
          }
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
  }

  // ── Villages neutres ─────────────────────────────────────────────

  _syncBuildings(buildings, players) {
    if (!this.buildingSprites) this.buildingSprites = {};
    const cfg = Network.getConfig();
    const myId = Network.getMyId();
    const seen = new Set();
    for (const b of buildings) {
      seen.add(b.id);
      const def = (cfg.buildingTypes || {})[b.type] || {};
      const owner = players[b.ownerId];
      const colorInt = owner ? Phaser.Display.Color.HexStringToColor(owner.color).color : 0xffffff;
      let s = this.buildingSprites[b.id];
      const SIZE = (def.halfSize || 22) * 2;
      if (!s) {
        // Placeholder visuel : icône emoji sur un fond carré tinté équipe
        const bg = this.add.rectangle(b.x, b.y, SIZE, SIZE, colorInt, 0.85)
          .setStrokeStyle(2.5, 0x111111, 0.9).setDepth(28);
        const icon = this.add.text(b.x, b.y, def.icon || '🏗', {
          fontSize: (SIZE * 0.7) + 'px',
        }).setOrigin(0.5, 0.5).setDepth(29);
        const hpBg   = this.add.rectangle(b.x, b.y - SIZE / 2 - 8, SIZE + 10, 5, 0x111111, 0.85)
          .setStrokeStyle(1, 0x000000, 0.7).setOrigin(0.5, 0.5).setDepth(60);
        const hpFill = this.add.rectangle(b.x - (SIZE + 10) / 2, b.y - SIZE / 2 - 8, (SIZE + 10), 5, 0x22c55e)
          .setOrigin(0, 0.5).setDepth(60);

        // Click handler : sur une tour → affiche le cercle de portée 2.5s
        if (b.type === 'tower' && def.range) {
          bg.setInteractive();
          bg.on('pointerdown', () => {
            const ring = this.add.graphics().setDepth(90);
            ring.lineStyle(2, 0xfbbf24, 0.85);
            ring.strokeCircle(b.x, b.y, def.range);
            ring.fillStyle(0xfbbf24, 0.05);
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
      s.bg.setFillStyle(colorInt, 0.85);
      s.icon.setPosition(b.x, b.y);
      s.hpBg.setPosition(b.x, b.y - SIZE / 2 - 8);
      s.hpFill.setPosition(b.x - (SIZE + 10) / 2, b.y - SIZE / 2 - 8);
      const hpRatio = b.hp / b.maxHp;
      s.hpFill.width = (SIZE + 10) * hpRatio;
      const c = hpRatio > 0.6 ? 0x22c55e : hpRatio > 0.3 ? 0xf59e0b : 0xef4444;
      s.hpFill.setFillStyle(c);
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
    this.textures.get('fog-texture').setFilter(Phaser.Textures.FilterMode.LINEAR);

    // Mini-carte
    if (typeof Minimap !== 'undefined') Minimap.init(this.cameras.main);
    if (typeof RadialMenu !== 'undefined') RadialMenu.init(this);
    if (typeof BuildMode !== 'undefined') BuildMode.init(this);
    if (typeof SpellCast !== 'undefined') SpellCast.init(this);
    this.buildingSprites = {};

    this.mapBuilt = true;
    console.log(`Map built: ${this.MAP_W}×${this.MAP_H}, grid ${info.gridW}×${info.gridH}, minZoom ${this.minZoom.toFixed(3)}`);
  }

  // ── Décor procédural — DÉSACTIVÉ (look néon, terrain plat) ──
  _placeDecor_DEPRECATED() {
    const cfg = Network.getConfig();
    const spawns = (cfg.spawnPositions || []);
    const SAFE_RADIUS = 220; // évite ce rayon autour des spawns

    // Pseudo-random déterministe basé sur (x, y)
    const seedRand = (x, y, k) => {
      const s = Math.sin(x * (12345 + k * 7) + y * (54321 + k * 11)) * 43758.5453;
      return s - Math.floor(s); // [0, 1)
    };

    const types = [
      { key: 'tree',    size: 80, weight: 0.35 },
      { key: 'rock',    size: 60, weight: 0.20 },
      { key: 'bush',    size: 50, weight: 0.25 },
      { key: 'flowers', size: 40, weight: 0.20 },
    ];

    const step = 200;
    let placed = 0;
    for (let gy = step / 2; gy < this.MAP_H; gy += step) {
      for (let gx = step / 2; gx < this.MAP_W; gx += step) {
        // Pseudo-random : 60% des cellules ont du décor
        if (seedRand(gx, gy, 0) > 0.6) continue;

        const ox = (seedRand(gx, gy, 1) - 0.5) * 80;
        const oy = (seedRand(gx, gy, 2) - 0.5) * 80;
        const x = gx + ox, y = gy + oy;

        // Évite la zone autour des spawns
        let nearSpawn = false;
        for (const s of spawns) {
          if (Math.hypot(s.x - x, s.y - y) < SAFE_RADIUS) { nearSpawn = true; break; }
        }
        if (nearSpawn) continue;

        // Choix du type pondéré
        const r = seedRand(gx, gy, 3);
        let acc = 0, picked = types[0];
        for (const t of types) { acc += t.weight; if (r <= acc) { picked = t; break; } }

        if (!this._hasAsset(picked.key)) continue;
        const sprite = this.add.image(x, y, picked.key)
          .setDisplaySize(picked.size, picked.size)
          .setDepth(10);
        // Légère variation d'angle pour les arbres/buissons
        if (picked.key === 'tree' || picked.key === 'bush' || picked.key === 'flowers') {
          sprite.setAngle((seedRand(gx, gy, 4) - 0.5) * 20);
        }
        placed++;
      }
    }
    console.log(`Décor placé : ${placed} éléments`);
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
    for (let i = 0; i < vis.length; i++) {
      let a;
      if (vis[i]) a = 0;          // visible : transparent
      else if (exp[i]) a = 140;   // exploré : noir 55 %
      else a = 255;               // jamais vu : noir plein
      const j = i * 4;
      data[j]   = 0;
      data[j+1] = 0;
      data[j+2] = 0;
      data[j+3] = a;
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
        this.unitSprites[id].forEach(o => { if (o) o.destroy(); });
        delete this.unitSprites[id];
        if (this.unitTweens[id])    { this.unitTweens[id].stop(); delete this.unitTweens[id]; }
        delete this.unitServerPos[id];
        this.selectedUnitIds.delete(id);
        if (this.selectionRings[id]) { this.selectionRings[id].destroy(); delete this.selectionRings[id]; }
      }
    }

    for (const [id, unit] of Object.entries(units)) {
      const colorInt = Theme.factionColorInt(unit.ownerId);
      const shape    = Theme.unitShape(unit.type);
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
        // Couleur : faction pour joueur, couleur propre pour bête
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

        // ── Pastille d'axe (sci/mag/rel) : disque coloré au centre ──
        // Bêtes : pas de pastille. Boss : disque blanc central (au lieu de pastille axe).
        let axisDot = null;
        if (!isBeast) {
          if (isBoss) {
            // Disque blanc central rayon sz*0.4
            axisDot = this.add.circle(unit.x, unit.y, sz * 0.4, 0xffffff, 1).setDepth(51);
          } else {
            const axColor = Theme.AXC_INT[shape.ax] || 0xffffff;
            const dotR = Math.max(1.5, sz * 0.28);
            axisDot = this.add.circle(unit.x, unit.y, dotR, axColor, 1).setDepth(51);
          }
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

      // Effet gel : disque cyan semi-transparent autour de l'unité si freeze > 0
      const u = stateUnits[id];
      const isFrozen = u && u.freeze && u.freeze > 0;
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

  _spawnDeathParticles(x, y, colorInt) {
    const emitter = this.add.particles(x, y, 'particle', {
      tint: colorInt,
      speed: { min: 50, max: 150 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 500,
      gravityY: 200,
      emitting: false,
    });
    emitter.explode(10);
    this.time.delayedCall(700, () => emitter.destroy());
  }

  // Flèche générique (pour les tours et autres attaquants distants)
  _playArrowAnimation(ax, ay, tx, ty) {
    const angle = Math.atan2(ty - ay, tx - ax);
    const arrow = this.add.sprite(ax, ay, 'arrow')
      .setRotation(angle)
      .setDepth(55);
    this.tweens.add({
      targets: arrow,
      x: tx, y: ty,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => arrow.destroy(),
    });
  }

  // ── Animations d'attaque selon le type d'unité ──────────────────
  _playAttackAnimation(attacker, tx, ty) {
    const dx = tx - attacker.x, dy = ty - attacker.y;
    const angle = Math.atan2(dy, dx);
    if (attacker.type === 'archer') {
      // Flèche qui vole de l'archer à la cible
      const arrow = this.add.sprite(attacker.x, attacker.y, 'arrow')
        .setRotation(angle)
        .setDepth(55);
      this.tweens.add({
        targets: arrow,
        x: tx, y: ty,
        duration: 220,
        ease: 'Quad.easeOut',
        onComplete: () => arrow.destroy(),
      });
    } else {
      // Soldat / Chevalier : arc de slash blanc apparaissant sur la cible
      const slash = this.add.sprite(tx, ty, 'slash')
        .setRotation(angle)
        .setDepth(55)
        .setScale(0.5);
      this.tweens.add({
        targets: slash,
        scale: { from: 0.7, to: 1.15 },
        alpha: { from: 1, to: 0 },
        duration: 220,
        ease: 'Cubic.easeOut',
        onComplete: () => slash.destroy(),
      });
      // Chevalier : impact flash doré supplémentaire
      if (attacker.type === 'knight') {
        const flash = this.add.circle(tx, ty, 18, 0xfbbf24, 0.55).setDepth(54);
        this.tweens.add({
          targets: flash,
          scale: { from: 0.6, to: 1.8 },
          alpha: { from: 0.6, to: 0 },
          duration: 250,
          onComplete: () => flash.destroy(),
        });
      }
    }
  }

  _showMoveIndicator(x, y, isAttack = false) {
    const g = this.add.graphics();
    g.lineStyle(2, isAttack ? 0xe74c3c : 0xffffff, 1);
    g.strokeCircle(0, 0, 12);
    g.setPosition(x, y);
    this.tweens.add({ targets: g, alpha: 0, duration: 300, ease: 'Power2', onComplete: () => g.destroy() });
  }

  // ── Kill feed ─────────────────────────────────────────────────────

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
