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
    const info = Network.getMapInfo();
    const MAP_W = info.mapWidth, MAP_H = info.mapHeight;
    this.MAP_W = MAP_W;
    this.MAP_H = MAP_H;

    // Map : pelouse vert clair
    this.add.rectangle(MAP_W / 2, MAP_H / 2, MAP_W, MAP_H, 0xa8e6a3);
    const border = this.add.graphics();
    border.lineStyle(6, 0x6b8a5e, 0.9);
    border.strokeRect(0, 0, MAP_W, MAP_H);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x88a07c, 0.22);
    for (let x = 0; x <= MAP_W; x += 100) { grid.moveTo(x, 0); grid.lineTo(x, MAP_H); }
    for (let y = 0; y <= MAP_H; y += 100) { grid.moveTo(0, y); grid.lineTo(MAP_W, y); }
    grid.strokePath();

    // Caméra : bornes exactes sur la map. Le minZoom dynamique garantit
    // que le viewport ne dépasse jamais la map dans aucune dimension
    // → aucun « hors-map » visible.
    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
    this._recomputeMinZoom();
    this.cameras.main.setZoom(this.minZoom); // démarre en vue d'ensemble

    // Recalcule la borne de zoom min si on redimensionne la fenêtre
    this.scale.on('resize', () => {
      this._recomputeMinZoom();
      const cam = this.cameras.main;
      if (cam.zoom < this.minZoom) cam.zoom = this.minZoom;
    });

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

    // Fog of war — texture canvas low-res, scaled up avec filtre linéaire pour un fondu doux
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width  = info.gridW;
    this.fogCanvas.height = info.gridH;
    this.fogCtx = this.fogCanvas.getContext('2d');
    // Init full black avant qu'on reçoive le premier gameState (sécurité)
    this.fogCtx.fillStyle = 'rgba(0,0,0,1)';
    this.fogCtx.fillRect(0, 0, info.gridW, info.gridH);
    this.textures.addCanvas('fog-texture', this.fogCanvas);
    this.fogImage = this.add.image(0, 0, 'fog-texture').setOrigin(0, 0);
    this.fogImage.setDisplaySize(MAP_W, MAP_H);
    this.fogImage.setDepth(100); // au-dessus de tout le monde du jeu
    this.textures.get('fog-texture').setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.lastFogSignature = '';
    this.cameraCentered = false; // recentre une fois sur mon HDV au début

    // Mini-carte
    if (typeof Minimap !== 'undefined') Minimap.init(this.cameras.main);

    this.input.manager.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
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

      this.attackLines.push({ ax: attacker.x, ay: attacker.y, tx, ty, startTime: Date.now() });

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

    // Attack lines
    const ATTACK_DURATION = 200;
    const now = Date.now();
    this.attackGraphics.clear();
    let i = this.attackLines.length;
    while (i--) {
      const ln = this.attackLines[i];
      const elapsed = now - ln.startTime;
      if (elapsed >= ATTACK_DURATION) { this.attackLines.splice(i, 1); continue; }
      const alpha = 0.8 * (1 - elapsed / ATTACK_DURATION);
      this.attackGraphics.lineStyle(3, 0xe74c3c, alpha);
      this.attackGraphics.beginPath();
      this.attackGraphics.moveTo(ln.ax, ln.ay);
      this.attackGraphics.lineTo(ln.tx, ln.ty);
      this.attackGraphics.strokePath();
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

    for (const v of villages) {
      seen.add(v.id);
      const typeDef = cfg.villageTypes && cfg.villageTypes[v.type];
      const icon = typeDef ? typeDef.icon : '🏘';
      const owner = v.ownerId ? players[v.ownerId] : null;
      const ownerColorInt = owner ? Phaser.Display.Color.HexStringToColor(owner.color).color : 0x888888;

      let sprite = this.villageSprites[v.id];
      if (!sprite) {
        // Cercle de base (neutre gris) + icône emoji + label type + barre de capture
        const base = this.add.circle(v.x, v.y, RAD * 0.55, 0x444444, 0.55);
        base.setStrokeStyle(3, 0x888888, 0.9);
        const iconText = this.add.text(v.x, v.y, icon, { fontSize: '30px' }).setOrigin(0.5, 0.5);
        const label    = this.add.text(v.x, v.y + RAD * 0.7, (typeDef ? typeDef.name : v.type), {
          fontSize: '11px', fontFamily: 'sans-serif', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 0);
        const barBg    = this.add.rectangle(v.x, v.y - RAD * 0.6, 70, 6, 0x111111, 0.85).setOrigin(0.5, 0.5);
        const barFill  = this.add.rectangle(v.x - 35, v.y - RAD * 0.6, 0, 6, 0xf1c40f).setOrigin(0, 0.5);
        sprite = { base, iconText, label, barBg, barFill };
        this.villageSprites[v.id] = sprite;
      }

      // Couleur de bordure : owner color si capturé, sinon gris
      sprite.base.setStrokeStyle(3, owner ? ownerColorInt : 0x888888, 0.95);
      sprite.base.setFillStyle(owner ? ownerColorInt : 0x444444, owner ? 0.25 : 0.55);

      // Barre de capture si en cours
      const showBar = v.captureProgress > 0;
      const ratio   = Math.max(0, Math.min(1, v.captureProgress / CAP_TICKS));
      sprite.barBg.setVisible(showBar);
      sprite.barFill.setVisible(showBar);
      if (showBar) {
        sprite.barFill.width = 70 * ratio;
        const capturer = v.capturingPlayerId ? players[v.capturingPlayerId] : null;
        sprite.barFill.setFillStyle(capturer ? Phaser.Display.Color.HexStringToColor(capturer.color).color : 0xf1c40f);
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
    const HDV_SIZE  = 80, BAR_W_HDV = 90, BAR_H_HDV = 8, BAR_Y_OFF = -HDV_SIZE / 2 - 18;
    const myId = Network.getMyId();

    for (const id of Object.keys(this.hdvSprites)) {
      if (!players[id]) { this.hdvSprites[id].forEach(o => o.destroy()); delete this.hdvSprites[id]; }
    }

    for (const [id, player] of Object.entries(players)) {
      const colorInt  = Phaser.Display.Color.HexStringToColor(player.color).color;
      const hpRatio   = Math.max(0, player.hp / player.maxHp);
      const destroyed = player.hp <= 0;

      if (!this.hdvSprites[id]) {
        // Ombre portée sous le HDV
        const shadow = this.add.ellipse(player.x, player.y + HDV_SIZE / 2 + 4, HDV_SIZE + 14, 14, 0x000000, 0.35);
        // Tour principale
        const rect = this.add.rectangle(player.x, player.y, HDV_SIZE, HDV_SIZE, destroyed ? 0x888888 : colorInt);
        rect.setStrokeStyle(4, 0x111111, 0.85);
        if (destroyed) rect.setAlpha(0.4);
        // Bande sombre intérieure pour relief
        const innerStripe = this.add.rectangle(player.x, player.y + HDV_SIZE / 4, HDV_SIZE - 12, 10, 0x000000, 0.18);
        // Toit / créneaux : 4 petits carrés au sommet
        const merlons = [];
        const merlonY = player.y - HDV_SIZE / 2 - 5;
        for (let mi = 0; mi < 4; mi++) {
          const mx = player.x - HDV_SIZE / 2 + 10 + mi * 20;
          merlons.push(this.add.rectangle(mx, merlonY, 12, 12, destroyed ? 0x888888 : colorInt).setStrokeStyle(2, 0x111111, 0.85));
        }

        if (id === myId) {
          rect.setInteractive();
          rect.on('pointerover', () => this.input.setDefaultCursor('pointer'));
          rect.on('pointerout',  () => this.input.setDefaultCursor('default'));
          rect.on('pointerdown', () => HdvPanel.toggle());
        }

        const barBg    = this.add.rectangle(player.x, player.y + BAR_Y_OFF, BAR_W_HDV, BAR_H_HDV, 0x7f0000).setOrigin(0.5, 0.5);
        const barFill  = this.add.rectangle(player.x - BAR_W_HDV / 2, player.y + BAR_Y_OFF, BAR_W_HDV * hpRatio, BAR_H_HDV, 0x00cc44).setOrigin(0, 0.5);
        const nameLabel = this.add.text(player.x, player.y + BAR_Y_OFF - BAR_H_HDV - 8, player.name,
          { fontSize: '14px', fontFamily: 'sans-serif', fontStyle: 'bold', color: player.color, stroke: '#000000', strokeThickness: 4 }
        ).setOrigin(0.5, 1);
        const hpLabel = this.add.text(player.x, player.y + HDV_SIZE / 2 + 12, `${player.hp}/${player.maxHp}`,
          { fontSize: '12px', fontFamily: 'sans-serif', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }
        ).setOrigin(0.5, 0);

        // [rect, barBg, barFill, nameLabel, hpLabel, shadow, innerStripe, ...merlons]
        this.hdvSprites[id] = [rect, barBg, barFill, nameLabel, hpLabel, shadow, innerStripe, ...merlons];

      } else {
        const [rect, barBg, barFill, nameLabel, hpLabel] = this.hdvSprites[id];

        if (destroyed) {
          rect.setFillStyle(0x888888).setAlpha(0.4);
        } else {
          rect.setFillStyle(colorInt).setAlpha(1);
        }

        barBg.setPosition(player.x, player.y + BAR_Y_OFF);
        barFill.setPosition(player.x - BAR_W_HDV / 2, player.y + BAR_Y_OFF);
        barFill.width = BAR_W_HDV * hpRatio;
        nameLabel.setPosition(player.x, player.y + BAR_Y_OFF - BAR_H_HDV - 8)
          .setText(player.eliminated ? '💀 ÉLIMINÉ' : player.name)
          .setColor(player.eliminated ? '#e74c3c' : player.color);
        hpLabel.setPosition(player.x, player.y + HDV_SIZE / 2 + 12).setText(`${player.hp}/${player.maxHp}`);
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
        const circle = this.add.circle(unit.x, unit.y, UNIT_RADIUS, colorInt);
        // Différenciation visuelle par type d'unité
        const stroke = unit.type === 'knight' ? 4 : 2;
        circle.setStrokeStyle(stroke, 0x000000);
        circle._unitId      = id;
        circle._unitOwnerId = unit.ownerId;

        if (unit.ownerId === myId) {
          circle.setInteractive(new Phaser.Geom.Circle(0, 0, 25), Phaser.Geom.Circle.Contains);
          circle.on('pointerover', () => this.input.setDefaultCursor('pointer'));
          circle.on('pointerout',  () => this.input.setDefaultCursor('default'));
        }

        const barBg   = this.add.rectangle(unit.x, unit.y + BAR_Y, BAR_W, BAR_H, 0x333333).setOrigin(0.5, 0.5);
        const barFill = this.add.rectangle(unit.x - BAR_W / 2, unit.y + BAR_Y, BAR_W * (unit.hp / unit.maxHp), BAR_H, 0x2ecc71).setOrigin(0, 0.5);

        // Archer : petit point blanc au centre
        let decoration = null;
        if (unit.type === 'archer') {
          decoration = this.add.circle(unit.x, unit.y, 4, 0xffffff);
        }

        this.unitSprites[id] = [circle, barBg, barFill, decoration];

      } else if (posChanged || hpChanged) {
        const [circle, , barFill] = this.unitSprites[id];
        circle.setFillStyle(colorInt);

        if (hpChanged) {
          barFill.width = Math.max(0, BAR_W * (unit.hp / unit.maxHp));
        }
        if (posChanged) {
          if (this.unitTweens[id]) this.unitTweens[id].stop();
          this.unitTweens[id] = this.tweens.add({
            targets: circle, x: unit.x, y: unit.y,
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
      const ring = this.add.graphics();
      ring.lineStyle(4, 0xf1c40f, 1);
      ring.strokeCircle(0, 0, UNIT_RADIUS + 5);
      ring.setPosition(this.unitSprites[id][0].x, this.unitSprites[id][0].y);
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
      const [circle, barBg, barFill, deco] = sprites;
      barBg.setPosition(circle.x, circle.y + BAR_Y);
      barFill.setPosition(circle.x - BAR_W / 2, circle.y + BAR_Y);
      if (deco) deco.setPosition(circle.x, circle.y);
    }
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
