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
    this.lastStateJson = '';
    this.cursors = null;
    this.wasd    = null;
    this.isDragging      = false;
    this.dragStartX      = 0;
    this.dragStartY      = 0;
    this.dragRectGraphics = null;
    this.attackGraphics   = null;
    this.attackLines      = [];
    this.arrowGraphics    = null;
  }

  preload() {}

  create() {
    const MAP_W = 2000, MAP_H = 2000;

    this.add.rectangle(MAP_W / 2, MAP_H / 2, MAP_W, MAP_H, 0xa8e6a3);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x888888, 0.25);
    for (let x = 0; x <= MAP_W; x += 100) { grid.moveTo(x, 0); grid.lineTo(x, MAP_H); }
    for (let y = 0; y <= MAP_H; y += 100) { grid.moveTo(0, y); grid.lineTo(MAP_W, y); }
    grid.strokePath();

    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
    this.cameras.main.setZoom(1);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.Z,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.Q,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    this.input.mouse.disableContextMenu();

    this.attackGraphics = this.add.graphics();

    // Enemy direction arrows — fixed to screen (scrollFactor 0)
    this.arrowGraphics = this.add.graphics();
    this.arrowGraphics.setScrollFactor(0);
    this.arrowGraphics.setDepth(100);

    // Particle texture for unit death burst
    const pg = this.make.graphics({ add: false });
    pg.fillStyle(0xffffff, 1);
    pg.fillCircle(4, 4, 4);
    pg.generateTexture('particle', 8, 8);
    pg.destroy();

    this.input.manager.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const cam = this.cameras.main;
      if (e.ctrlKey) {
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        cam.zoom = Phaser.Math.Clamp(cam.zoom * zoomFactor, 0.4, 2.0);
      } else {
        cam.scrollX += e.deltaX / cam.zoom;
        cam.scrollY += e.deltaY / cam.zoom;
      }
    }, { passive: false });

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
    this._drawEnemyIndicators();

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
    const stateJson = JSON.stringify({ p: state.players, u: state.units });
    if (stateJson === this.lastStateJson) return;
    this.lastStateJson = stateJson;

    this._syncHDVs(state.players);
    this._syncUnits(state.units || {}, state.players);
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
        const rect = this.add.rectangle(player.x, player.y, HDV_SIZE, HDV_SIZE, destroyed ? 0x888888 : colorInt);
        rect.setStrokeStyle(3, 0x000000, 0.6);
        if (destroyed) rect.setAlpha(0.4);

        if (id === myId) {
          rect.setInteractive();
          rect.on('pointerover', () => this.input.setDefaultCursor('pointer'));
          rect.on('pointerout',  () => this.input.setDefaultCursor('default'));
          rect.on('pointerdown', (pointer) => {
            if (pointer.event.detail === 2) {
              // Double-click: select all own units
              const units = Network.getState().units || {};
              this.selectedUnitIds.clear();
              for (const [uid, unit] of Object.entries(units)) {
                if (unit.ownerId === myId) this.selectedUnitIds.add(uid);
              }
              this._updateSelectionRings();
            } else {
              Network.spawnUnit();
            }
          });
        }

        const barBg    = this.add.rectangle(player.x, player.y + BAR_Y_OFF, BAR_W_HDV, BAR_H_HDV, 0x7f0000).setOrigin(0.5, 0.5);
        const barFill  = this.add.rectangle(player.x - BAR_W_HDV / 2, player.y + BAR_Y_OFF, BAR_W_HDV * hpRatio, BAR_H_HDV, 0x00cc44).setOrigin(0, 0.5);
        const nameLabel = this.add.text(player.x, player.y + BAR_Y_OFF - BAR_H_HDV - 4, player.name,
          { fontSize: '13px', fontFamily: 'sans-serif', color: player.color, stroke: '#000000', strokeThickness: 3 }
        ).setOrigin(0.5, 1);
        const hpLabel = this.add.text(player.x, player.y + HDV_SIZE / 2 + 6, `${player.hp}/${player.maxHp}`,
          { fontSize: '12px', fontFamily: 'sans-serif', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }
        ).setOrigin(0.5, 0);

        this.hdvSprites[id] = [rect, barBg, barFill, nameLabel, hpLabel];

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
        nameLabel.setPosition(player.x, player.y + BAR_Y_OFF - BAR_H_HDV - 4)
          .setText(player.eliminated ? '💀 ÉLIMINÉ' : player.name)
          .setColor(player.eliminated ? '#e74c3c' : player.color);
        hpLabel.setPosition(player.x, player.y + HDV_SIZE / 2 + 6).setText(`${player.hp}/${player.maxHp}`);
      }
    }
  }

  // ── Units ─────────────────────────────────────────────────────────

  _syncUnits(units, players) {
    const myId = Network.getMyId();

    for (const id of Object.keys(this.unitSprites)) {
      if (!units[id]) {
        this.unitSprites[id].forEach(o => o.destroy());
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
        circle.setStrokeStyle(2, 0x000000);
        circle._unitId      = id;
        circle._unitOwnerId = unit.ownerId;

        if (unit.ownerId === myId) {
          circle.setInteractive(new Phaser.Geom.Circle(0, 0, 25), Phaser.Geom.Circle.Contains);
          circle.on('pointerover', () => this.input.setDefaultCursor('pointer'));
          circle.on('pointerout',  () => this.input.setDefaultCursor('default'));
        }

        const barBg   = this.add.rectangle(unit.x, unit.y + BAR_Y, BAR_W, BAR_H, 0x333333).setOrigin(0.5, 0.5);
        const barFill = this.add.rectangle(unit.x - BAR_W / 2, unit.y + BAR_Y, BAR_W * (unit.hp / unit.maxHp), BAR_H, 0x2ecc71).setOrigin(0, 0.5);

        this.unitSprites[id] = [circle, barBg, barFill];

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
      const [circle, barBg, barFill] = sprites;
      barBg.setPosition(circle.x, circle.y + BAR_Y);
      barFill.setPosition(circle.x - BAR_W / 2, circle.y + BAR_Y);
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

  // ── Enemy direction indicators ────────────────────────────────────

  _drawEnemyIndicators() {
    this.arrowGraphics.clear();
    const state = Network.getState();
    const myId  = Network.getMyId();
    if (!myId) return;

    const cam    = this.cameras.main;
    const W      = this.scale.width;
    const H      = this.scale.height;
    const margin = 28;

    for (const [pid, player] of Object.entries(state.players || {})) {
      if (pid === myId || player.hp <= 0) continue;

      // World → screen
      const sx = (player.x - cam.worldView.x) * cam.zoom;
      const sy = (player.y - cam.worldView.y) * cam.zoom;

      // Already visible — no arrow needed
      if (sx >= -10 && sx <= W + 10 && sy >= -10 && sy <= H + 10) continue;

      // Direction from screen centre to target
      const cx = W / 2, cy = H / 2;
      const dx = sx - cx, dy = sy - cy;

      // Clamp to screen edge
      const scaleX = Math.abs(dx) > 0 ? (W / 2 - margin) / Math.abs(dx) : Infinity;
      const scaleY = Math.abs(dy) > 0 ? (H / 2 - margin) / Math.abs(dy) : Infinity;
      const s  = Math.min(scaleX, scaleY);
      const ex = cx + dx * s;
      const ey = cy + dy * s;

      const colorInt = Phaser.Display.Color.HexStringToColor(player.color).color;
      const angle    = Math.atan2(dy, dx);
      const size     = 11;

      this.arrowGraphics.fillStyle(colorInt, 0.9);
      this.arrowGraphics.fillTriangle(
        ex + Math.cos(angle) * size * 1.6,       ey + Math.sin(angle) * size * 1.6,
        ex + Math.cos(angle + 2.4) * size,        ey + Math.sin(angle + 2.4) * size,
        ex + Math.cos(angle - 2.4) * size,        ey + Math.sin(angle - 2.4) * size
      );

      // Small white outline
      this.arrowGraphics.lineStyle(1.5, 0xffffff, 0.6);
      this.arrowGraphics.strokeTriangle(
        ex + Math.cos(angle) * size * 1.6,       ey + Math.sin(angle) * size * 1.6,
        ex + Math.cos(angle + 2.4) * size,        ey + Math.sin(angle + 2.4) * size,
        ex + Math.cos(angle - 2.4) * size,        ey + Math.sin(angle - 2.4) * size
      );
    }
  }
}
