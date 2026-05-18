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

  preload() {}

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
      const cfg = Network.getConfig();
      const typeDef = cfg.villageTypes && cfg.villageTypes[data.type];
      const icon = typeDef ? typeDef.icon : '🏘';
      this._addKillFeedEntry(`${icon} ${data.ownerName} capture une ${typeDef ? typeDef.name : 'zone'}`, data.ownerColor);
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
      const state    = Network.getState();
      const attacker = state.units && state.units[data.attackerId];
      if (!attacker) return;

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
      } else {
        const t = state.players && state.players[data.targetId];
        if (!t) return;
        tx = t.x; ty = t.y;
        this._flashHdv(data.targetId);
      }

      // ── Animation selon le type d'attaquant ───────────────────
      this._playAttackAnimation(attacker, tx, ty);

      // Kill feed for unit kills
      if (data.killed && data.targetType === 'unit') {
        const killerOwner = state.players[attacker.ownerId];
        if (killerOwner) {
          this._addKillFeedEntry(`⚔️ ${killerOwner.name} a tué une unité`, killerOwner.color);
        }
      }
    });

    // ── Input ─────────────────────────────────────────────────────

    this.input.on('pointerdown', (pointer, currentlyOver) => {
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
        const wx = pointer.worldX, wy = pointer.worldY;

        let hitEnemyUnit = null;
        for (const [uid, unit] of Object.entries(state.units || {})) {
          if (unit.ownerId === myId) continue;
          if (Math.hypot(wx - unit.x, wy - unit.y) <= 20) { hitEnemyUnit = uid; break; }
        }
        if (hitEnemyUnit) {
          Network.attackTarget(Array.from(this.selectedUnitIds), hitEnemyUnit, 'unit');
          this._showMoveIndicator(wx, wy, true);
          return;
        }

        let hitEnemyHdv = null;
        for (const [pid, player] of Object.entries(state.players || {})) {
          if (pid === myId || player.hp <= 0) continue;
          if (Math.abs(wx - player.x) <= 45 && Math.abs(wy - player.y) <= 45) { hitEnemyHdv = pid; break; }
        }
        if (hitEnemyHdv) {
          Network.attackTarget(Array.from(this.selectedUnitIds), hitEnemyHdv, 'hdv');
          this._showMoveIndicator(wx, wy, true);
          return;
        }

        Network.moveUnits(Array.from(this.selectedUnitIds), wx, wy);
        this._showMoveIndicator(wx, wy, false);
      }
    });

    this.input.on('pointerup', (pointer) => {
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

    // Recentre la caméra une fois sur mon HDV (spawn aléatoire)
    if (!this.cameraCentered) {
      const myId = Network.getMyId();
      const me   = myId && state.players[myId];
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

    const stateJson = JSON.stringify({ p: state.players, u: state.units });
    if (stateJson === this.lastStateJson) return;
    this.lastStateJson = stateJson;

    this._syncHDVs(state.players);
    this._syncUnits(state.units || {}, state.players);
  }

  // ── Villages neutres ─────────────────────────────────────────────

  _syncVillages(villages, players) {
    const cfg = Network.getConfig();
    const CAP_TICKS = cfg.villageCaptureTicks || 200;
    const RAD = cfg.villageRadius || 70;
    const seen = new Set();

    const VILLAGE_DISPLAY = 90; // taille à l'écran (la texture fait 80)
    for (const v of villages) {
      seen.add(v.id);
      const typeDef = cfg.villageTypes && cfg.villageTypes[v.type];
      const owner = v.ownerId ? players[v.ownerId] : null;
      const ownerColorInt = owner ? Phaser.Display.Color.HexStringToColor(owner.color).color : 0xffffff;
      const texKey = 'village-' + v.type;

      let sprite = this.villageSprites[v.id];
      if (!sprite) {
        // Cercle d'ownership en arrière-plan (transparent si neutre)
        const ownerRing = this.add.circle(v.x, v.y, RAD, 0x000000, 0).setStrokeStyle(4, ownerColorInt, owner ? 0.9 : 0);
        // Sprite détaillé du village
        const main = this.add.sprite(v.x, v.y, texKey).setDisplaySize(VILLAGE_DISPLAY, VILLAGE_DISPLAY);
        // Label nom (sous l'icône)
        const label = this.add.text(v.x, v.y + RAD * 0.7, (typeDef ? typeDef.name : v.type), {
          fontSize: '12px', fontFamily: '"Quicksand", sans-serif', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 0);
        // Barre de capture (au-dessus)
        const barBg    = this.add.rectangle(v.x, v.y - RAD * 0.85, 80, 8, 0x111111, 0.9).setStrokeStyle(1, 0x000000, 0.6).setOrigin(0.5, 0.5);
        const barFill  = this.add.rectangle(v.x - 40, v.y - RAD * 0.85, 0, 8, 0xfbbf24).setOrigin(0, 0.5);
        sprite = { ownerRing, main, label, barBg, barFill };
        this.villageSprites[v.id] = sprite;
      }

      // Anneau owner : on/off selon ownership
      sprite.ownerRing.setStrokeStyle(4, ownerColorInt, owner ? 0.9 : 0);

      // Barre de capture si en cours
      const showBar = v.captureProgress > 0;
      const ratio   = Math.max(0, Math.min(1, v.captureProgress / CAP_TICKS));
      sprite.barBg.setVisible(showBar);
      sprite.barFill.setVisible(showBar);
      if (showBar) {
        sprite.barFill.width = 80 * ratio;
        const capturer = v.capturingPlayerId ? players[v.capturingPlayerId] : null;
        sprite.barFill.setFillStyle(capturer ? Phaser.Display.Color.HexStringToColor(capturer.color).color : 0xfbbf24);
      }
    }

    // Cleanup villages disparus du state filtré (pas explorés)
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

    // Pelouse — palette plus vibrante, avec des patches d'herbe plus sombres pour la texture
    this.add.rectangle(this.MAP_W / 2, this.MAP_H / 2, this.MAP_W, this.MAP_H, 0x9fdc7c);
    // Patches d'herbe : 80 cercles aléatoires plus sombres pour casser la monotonie
    const patches = this.add.graphics();
    patches.fillStyle(0x7ab560, 0.55);
    for (let i = 0; i < 80; i++) {
      const px = Math.random() * this.MAP_W;
      const py = Math.random() * this.MAP_H;
      const pr = 50 + Math.random() * 90;
      patches.fillCircle(px, py, pr);
    }
    // Bordure de la map
    const border = this.add.graphics();
    border.lineStyle(8, 0x4d6b3e, 0.95);
    border.strokeRect(0, 0, this.MAP_W, this.MAP_H);

    // Grille subtile
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x6b8a5e, 0.18);
    for (let x = 0; x <= this.MAP_W; x += 100) { grid.moveTo(x, 0); grid.lineTo(x, this.MAP_H); }
    for (let y = 0; y <= this.MAP_H; y += 100) { grid.moveTo(0, y); grid.lineTo(this.MAP_W, y); }
    grid.strokePath();

    // Génère toutes les textures de sprites (HDV, unités, villages)
    if (typeof SpriteFactory !== 'undefined') SpriteFactory.generateAll(this);

    // Caméra : bornes exactes à la map réelle
    this.cameras.main.setBounds(0, 0, this.MAP_W, this.MAP_H);
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
    // Le sprite hdv-castle fait 120×130. Le centre logique du HDV (player.x,y)
    // est au centre du corps de pierre, donc le sprite est décalé vers le HAUT
    // (origine 0.5, ~0.65) pour que les pieds du château soient au sol.
    const HDV_DISPLAY_W = 110;
    const HDV_DISPLAY_H = 120;
    const BAR_W_HDV = 100, BAR_H_HDV = 10;
    const BAR_Y_OFF = -HDV_DISPLAY_H * 0.65 - 18; // au-dessus de la tour centrale
    const myId = Network.getMyId();

    for (const id of Object.keys(this.hdvSprites)) {
      if (!players[id]) { this.hdvSprites[id].forEach(o => o.destroy()); delete this.hdvSprites[id]; }
    }

    for (const [id, player] of Object.entries(players)) {
      const colorInt  = Phaser.Display.Color.HexStringToColor(player.color).color;
      const hpRatio   = Math.max(0, player.hp / player.maxHp);
      const destroyed = player.hp <= 0;

      if (!this.hdvSprites[id]) {
        // Le château : sprite avec tint faction. Origine au "sol" (0.5, 0.85)
        // pour que la base du château s'aligne sur player.y.
        const castle = this.add.sprite(player.x, player.y, 'hdv-castle')
          .setOrigin(0.5, 0.85)
          .setDisplaySize(HDV_DISPLAY_W, HDV_DISPLAY_H * (130 / 130));
        castle.setTint(destroyed ? 0x888888 : colorInt);
        if (destroyed) castle.setAlpha(0.45);

        if (id === myId) {
          castle.setInteractive();
          castle.on('pointerover', () => this.input.setDefaultCursor('pointer'));
          castle.on('pointerout',  () => this.input.setDefaultCursor('default'));
          castle.on('pointerdown', () => HdvPanel.toggle());
        }

        const barBg    = this.add.rectangle(player.x, player.y + BAR_Y_OFF, BAR_W_HDV, BAR_H_HDV, 0x431407, 0.95).setStrokeStyle(1.5, 0x000000, 0.7).setOrigin(0.5, 0.5);
        const barFill  = this.add.rectangle(player.x - BAR_W_HDV / 2, player.y + BAR_Y_OFF, BAR_W_HDV * hpRatio, BAR_H_HDV, 0x22c55e).setOrigin(0, 0.5);
        const nameLabel = this.add.text(player.x, player.y + BAR_Y_OFF - BAR_H_HDV - 8, player.name,
          { fontSize: '15px', fontFamily: '"Quicksand", sans-serif', fontStyle: 'bold', color: player.color, stroke: '#000000', strokeThickness: 4 }
        ).setOrigin(0.5, 1);
        const hpLabel = this.add.text(player.x, player.y + 8, `${player.hp}/${player.maxHp}`,
          { fontSize: '12px', fontFamily: '"Quicksand", sans-serif', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }
        ).setOrigin(0.5, 0);

        // [castle, barBg, barFill, nameLabel, hpLabel] — ancre castle pour interactivité
        this.hdvSprites[id] = [castle, barBg, barFill, nameLabel, hpLabel];

      } else {
        const [castle, barBg, barFill, nameLabel, hpLabel] = this.hdvSprites[id];

        castle.setPosition(player.x, player.y);
        castle.setTint(destroyed ? 0x888888 : colorInt);
        castle.setAlpha(destroyed ? 0.45 : 1);

        // Glow rouge subtil quand HP < 30%
        if (!destroyed && hpRatio < 0.3) {
          // pulse alpha doux entre 0.85 et 1.0
          castle.setAlpha(0.9 + 0.1 * Math.sin(Date.now() / 200));
        }

        barBg.setPosition(player.x, player.y + BAR_Y_OFF);
        barFill.setPosition(player.x - BAR_W_HDV / 2, player.y + BAR_Y_OFF);
        barFill.width = BAR_W_HDV * hpRatio;
        // Couleur de la barre HP : verte → orange → rouge selon ratio
        const barColor = hpRatio > 0.6 ? 0x22c55e : hpRatio > 0.3 ? 0xf59e0b : 0xef4444;
        barFill.setFillStyle(barColor);

        nameLabel.setPosition(player.x, player.y + BAR_Y_OFF - BAR_H_HDV - 8)
          .setText(player.eliminated ? '💀 ÉLIMINÉ' : player.name)
          .setColor(player.eliminated ? '#ef4444' : player.color);
        hpLabel.setPosition(player.x, player.y + 8).setText(`${player.hp}/${player.maxHp}`);
      }
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
      const owner    = players[unit.ownerId];
      const colorInt = owner ? Phaser.Display.Color.HexStringToColor(owner.color).color : 0xffffff;
      const prev     = this.unitServerPos[id];
      const posChanged = !prev || prev.x !== unit.x || prev.y !== unit.y;
      const hpChanged  = !prev || prev.hp !== unit.hp;
      this.unitServerPos[id] = { x: unit.x, y: unit.y, hp: unit.hp };

      if (!this.unitSprites[id]) {
        // Sprite selon le type ; tinté par la couleur de la faction
        const texKey = unit.type === 'archer' ? 'unit-archer'
                    : unit.type === 'knight' ? 'unit-knight'
                    : 'unit-soldier';
        const sprite = this.add.sprite(unit.x, unit.y, texKey).setTint(colorInt);
        // Hit area circulaire élargie (25px) pour faciliter le clic
        sprite._unitId      = id;
        sprite._unitOwnerId = unit.ownerId;

        if (unit.ownerId === myId) {
          sprite.setInteractive(new Phaser.Geom.Circle(20, 20, 25), Phaser.Geom.Circle.Contains);
          sprite.on('pointerover', () => this.input.setDefaultCursor('pointer'));
          sprite.on('pointerout',  () => this.input.setDefaultCursor('default'));
        }

        const barBg   = this.add.rectangle(unit.x, unit.y + BAR_Y, BAR_W, BAR_H, 0x111111, 0.85).setStrokeStyle(1, 0x000000, 0.7).setOrigin(0.5, 0.5);
        const barFill = this.add.rectangle(unit.x - BAR_W / 2, unit.y + BAR_Y, BAR_W * (unit.hp / unit.maxHp), BAR_H, 0x22c55e).setOrigin(0, 0.5);

        // Badge mode : petit icône en haut-droite de l'unité (🛡 defend, ⚔ attack, 🚶 move)
        const badge = this.add.text(unit.x + 12, unit.y - 14, this._modeIcon(unit.mode), {
          fontSize: '10px', fontFamily: '"Quicksand", sans-serif',
        }).setOrigin(0.5, 0.5).setDepth(10);

        // [sprite, barBg, barFill, badge]
        this.unitSprites[id] = [sprite, barBg, barFill, badge];

      } else if (posChanged || hpChanged) {
        const [sprite, , barFill, badge] = this.unitSprites[id];
        sprite.setTint(colorInt);
        if (badge) badge.setText(this._modeIcon(unit.mode));

        if (hpChanged) {
          const ratio = unit.hp / unit.maxHp;
          barFill.width = Math.max(0, BAR_W * ratio);
          const c = ratio > 0.6 ? 0x22c55e : ratio > 0.3 ? 0xf59e0b : 0xef4444;
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
      // Sprite-based ring with pulse tween
      const ring = this.add.sprite(this.unitSprites[id][0].x, this.unitSprites[id][0].y, 'selection-ring');
      ring.setDepth(50); // au-dessus des unités mais sous le fog
      this.tweens.add({
        targets: ring,
        scaleX: { from: 0.85, to: 1.05 },
        scaleY: { from: 0.85, to: 1.05 },
        alpha:  { from: 1.0,  to: 0.6 },
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
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
    for (const [, sprites] of Object.entries(this.unitSprites)) {
      if (sprites.length < 3) continue;
      const [circle, barBg, barFill, badge] = sprites;
      barBg.setPosition(circle.x, circle.y + BAR_Y);
      barFill.setPosition(circle.x - BAR_W / 2, circle.y + BAR_Y);
      if (badge) badge.setPosition(circle.x + 14, circle.y - 14);
    }
  }

  _modeIcon(mode) {
    if (mode === 'defend') return '🛡';
    if (mode === 'attack') return '⚔';
    if (mode === 'move')   return '';
    return '';
  }

  // ── Visual effects ────────────────────────────────────────────────

  _flashUnit(unitId) {
    const sprites = this.unitSprites[unitId];
    if (!sprites) return;
    const [circle] = sprites;
    const origColor = circle.fillColor;
    circle.setFillStyle(0xffffff);
    this.time.delayedCall(80, () => {
      if (this.unitSprites[unitId]) circle.setFillStyle(origColor);
    });
  }

  _flashHdv(playerId) {
    const sprites = this.hdvSprites[playerId];
    if (!sprites) return;
    const [rect] = sprites;
    const origColor = rect.fillColor;
    rect.setFillStyle(0xffffff);
    this.time.delayedCall(80, () => {
      if (this.hdvSprites[playerId]) rect.setFillStyle(origColor);
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
