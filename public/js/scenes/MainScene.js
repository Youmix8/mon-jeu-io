const UNIT_RADIUS = 15;
const BAR_W       = 30;
const BAR_H       = 4;
const BAR_Y       = -(UNIT_RADIUS + 8); // HP bar sits above the circle

class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
    this.hdvSprites  = {};
    this.unitSprites = {};        // unitId → [circle, barBg, barFill]
    this.unitTweens  = {};
    this.unitServerPos = {};      // unitId → {x,y,hp} — last server values
    this.selectionRings = {};
    this.selectedUnitIds = new Set();
    this.lastStateJson = '';
    this.cursors = null;
    this.wasd    = null;
    this.isDragging      = false;
    this.dragStartX      = 0;
    this.dragStartY      = 0;
    this.dragRectGraphics = null;
    this.attackGraphics   = null; // shared, redrawn every frame
    this.attackLines      = [];   // [{ax,ay,tx,ty,startTime}]
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

    // Single Graphics object for all attack lines — cleared and redrawn each frame
    this.attackGraphics = this.add.graphics();

    // Trackpad pan (scroll) and pinch-to-zoom
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

    Network.setOnSpawnFailed((reason) => {
      if (reason !== 'not_enough_gold') return;
      const el = document.getElementById('my-gold-row');
      if (!el) return;
      el.classList.remove('flash-error');
      void el.offsetWidth;
      el.classList.add('flash-error');
    });

    Network.setOnPlayerEliminated((data) => {
      console.log(`${data.name} éliminé !`);
    });

    Network.setOnGameOver((data) => {
      const overlay  = document.getElementById('game-over-overlay');
      const title    = document.getElementById('game-over-title');
      const subtitle = document.getElementById('game-over-subtitle');
      if (!overlay || !title || !subtitle) return;

      const myId = Network.getMyId();
      if (data.winnerId === myId) {
        title.textContent = '🏆 VICTOIRE !';
        title.style.color = '#f1c40f';
        subtitle.innerHTML = '';
      } else if (data.winnerId) {
        title.textContent = '💀 DÉFAITE';
        title.style.color = '#e74c3c';
        subtitle.innerHTML = `Vainqueur : <span style="color:${data.winnerColor};font-weight:bold">${data.winnerName}</span>`;
      } else {
        title.textContent = '🎬 Fin de partie';
        title.style.color = '#ffffff';
        subtitle.textContent = 'Match nul !';
      }
      overlay.style.display = 'flex';
    });

    Network.setOnMatchRestarted(() => {
      const overlay = document.getElementById('game-over-overlay');
      if (overlay) overlay.style.display = 'none';
      const myId = Network.getMyId();
      const me   = Network.getState().players[myId];
      if (me) this.cameras.main.centerOn(me.x, me.y);
    });

    Network.setOnAttack((data) => {
      const state = Network.getState();
      const attacker = state.units && state.units[data.attackerId];
      if (!attacker) return;
      let tx, ty;
      if (data.targetType === 'unit') {
        const t = state.units && state.units[data.targetId];
        if (!t) return;
        tx = t.x; ty = t.y;
      } else {
        const t = state.players && state.players[data.targetId];
        if (!t) return;
        tx = t.x; ty = t.y;
      }
      this.attackLines.push({ ax: attacker.x, ay: attacker.y, tx, ty, startTime: Date.now() });
    });

    // ── Input ─────────────────────────────────────────────────────────────

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
        if (currentlyOver.length > 0) return; // hit HDV or other interactive → skip drag
        this.isDragging = true;
        this.dragStartX = pointer.worldX;
        this.dragStartY = pointer.worldY;
        this.dragRectGraphics = this.add.graphics();
      } else if (pointer.button === 2) {
        if (this.selectedUnitIds.size === 0) return;
        const myId  = Network.getMyId();
        const state = Network.getState();
        const myPlayer = state.players[myId];
        if (myPlayer && myPlayer.eliminated) return; // spectator — no orders
        const wx = pointer.worldX, wy = pointer.worldY;

        // Check for enemy unit hit (radius 20 for usability)
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

        // Check for enemy HDV hit (80x80 rect ±45 around center)
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

        // Regular move
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
        const myId = Network.getMyId();
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

    // Every-frame position followers
    this._updateRingPositions();
    this._updateUnitBarPositions();

    // Drag rectangle
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

    // Attack lines — single shared graphics, redrawn each frame, removed when faded
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

    // Sync game objects when server state changes
    const state = Network.getState();
    const stateJson = JSON.stringify({ p: state.players, u: state.units });
    if (stateJson === this.lastStateJson) return;
    this.lastStateJson = stateJson;

    this._syncHDVs(state.players);
    this._syncUnits(state.units || {}, state.players);
  }

  // ── HDVs ─────────────────────────────────────────────────────────────────

  _syncHDVs(players) {
    const HDV_SIZE  = 80, BAR_W_HDV = 90, BAR_H_HDV = 8, BAR_Y_OFF = -HDV_SIZE / 2 - 18;
    const myId = Network.getMyId();

    for (const id of Object.keys(this.hdvSprites)) {
      if (!players[id]) { this.hdvSprites[id].forEach(o => o.destroy()); delete this.hdvSprites[id]; }
    }

    for (const [id, player] of Object.entries(players)) {
      const colorInt = Phaser.Display.Color.HexStringToColor(player.color).color;
      const hpRatio  = Math.max(0, player.hp / player.maxHp);
      const destroyed = player.hp <= 0;

      if (!this.hdvSprites[id]) {
        const rect = this.add.rectangle(player.x, player.y, HDV_SIZE, HDV_SIZE, destroyed ? 0x888888 : colorInt);
        rect.setStrokeStyle(3, 0x000000, 0.6);
        if (destroyed) rect.setAlpha(0.4);

        if (id === myId) {
          rect.setInteractive();
          rect.on('pointerover', () => this.input.setDefaultCursor('pointer'));
          rect.on('pointerout',  () => this.input.setDefaultCursor('default'));
          rect.on('pointerdown', () => Network.spawnUnit());
        }

        const barBg = this.add.rectangle(player.x, player.y + BAR_Y_OFF, BAR_W_HDV, BAR_H_HDV, 0x7f0000).setOrigin(0.5, 0.5);
        const barFill = this.add.rectangle(player.x - BAR_W_HDV / 2, player.y + BAR_Y_OFF, BAR_W_HDV * hpRatio, BAR_H_HDV, 0x00cc44).setOrigin(0, 0.5);
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

  // ── Units ─────────────────────────────────────────────────────────────────

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
        // New unit — snap position, no tween
        const circle = this.add.circle(unit.x, unit.y, UNIT_RADIUS, colorInt);
        circle.setStrokeStyle(2, 0x000000);
        circle._unitId      = id;
        circle._unitOwnerId = unit.ownerId;

        if (unit.ownerId === myId) {
          circle.setInteractive(new Phaser.Geom.Circle(0, 0, 25), Phaser.Geom.Circle.Contains); // larger hit area than visual radius
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

  // ── Selection ─────────────────────────────────────────────────────────────

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

  // HP bars follow their circles (which may be mid-tween)
  _updateUnitBarPositions() {
    for (const [, sprites] of Object.entries(this.unitSprites)) {
      if (sprites.length < 3) continue;
      const [circle, barBg, barFill] = sprites;
      barBg.setPosition(circle.x, circle.y + BAR_Y);
      barFill.setPosition(circle.x - BAR_W / 2, circle.y + BAR_Y);
    }
  }

  _showMoveIndicator(x, y, isAttack = false) {
    const g = this.add.graphics();
    g.lineStyle(2, isAttack ? 0xe74c3c : 0xffffff, 1);
    g.strokeCircle(0, 0, 12);
    g.setPosition(x, y);
    this.tweens.add({ targets: g, alpha: 0, duration: 300, ease: 'Power2', onComplete: () => g.destroy() });
  }
}
