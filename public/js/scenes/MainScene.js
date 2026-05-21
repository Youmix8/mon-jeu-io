const UNIT_RADIUS = 15;
const BAR_W       = 30;
const BAR_H       = 4;
const BAR_Y       = -(UNIT_RADIUS + 8);

// ════════════════════════════════════════════════════════════════════
// CATALOGUE DES ASSETS — source de vérité pour le préchargement
// Chaque entrée : { key, path, category }
// category → couleur du placeholder si le fichier PNG est absent
// ════════════════════════════════════════════════════════════════════
const ASSET_CATALOG = {
  UNITS_NEW: [
    { key: 'crossbowman',     path: 'assets/crossbowman.png',     category: 'science'  },
    { key: 'heavy_knight',    path: 'assets/heavy_knight.png',    category: 'science'  },
    { key: 'catapult',        path: 'assets/catapult.png',        category: 'science'  },
    { key: 'cannon',          path: 'assets/cannon.png',          category: 'science'  },
    { key: 'general',         path: 'assets/general.png',         category: 'science'  },
    { key: 'elite_guard',     path: 'assets/elite_guard.png',     category: 'science'  },
    { key: 'mage',            path: 'assets/mage.png',            category: 'magic'    },
    { key: 'necromancer',     path: 'assets/necromancer.png',     category: 'magic'    },
    { key: 'skeleton',        path: 'assets/skeleton.png',        category: 'magic'    },
    { key: 'lich',            path: 'assets/lich.png',            category: 'magic'    },
    { key: 'skeleton_knight', path: 'assets/skeleton_knight.png', category: 'magic'    },
    { key: 'fire_elemental',  path: 'assets/fire_elemental.png',  category: 'magic'    },
    { key: 'arcane_dragon',   path: 'assets/arcane_dragon.png',   category: 'magic'    },
    { key: 'pilgrim',         path: 'assets/pilgrim.png',         category: 'religion' },
    { key: 'inquisitor',      path: 'assets/inquisitor.png',      category: 'religion' },
    { key: 'paladin',         path: 'assets/paladin.png',         category: 'religion' },
    { key: 'angel',           path: 'assets/angel.png',           category: 'religion' },
    { key: 'god_avatar',      path: 'assets/god_avatar.png',      category: 'religion' },
  ],
  BUILDINGS_NEW: [
    { key: 'boat',            path: 'assets/boat.png',            category: 'science'  },
    { key: 'port',            path: 'assets/port.png',            category: 'science'  },
    { key: 'tower_archer',    path: 'assets/tower_archer.png',    category: 'science'  },
    { key: 'bombard_tower',   path: 'assets/bombard_tower.png',   category: 'science'  },
    { key: 'citadel',         path: 'assets/citadel.png',         category: 'science'  },
    { key: 'tower_mage',      path: 'assets/tower_mage.png',      category: 'magic'    },
    { key: 'sanctum',         path: 'assets/sanctum.png',         category: 'magic'    },
    { key: 'altar',           path: 'assets/altar.png',           category: 'religion' },
    { key: 'temple',          path: 'assets/temple.png',          category: 'religion' },
    { key: 'cathedral',       path: 'assets/cathedral.png',       category: 'religion' },
    { key: 'path_tile',       path: 'assets/path_tile.png',       category: 'science', isTile: true },
  ],
  SPELLS_FX: [
    { key: 'spell_portal',      path: 'assets/spell_portal.png',      category: 'magic'    },
    { key: 'spell_fireball',    path: 'assets/spell_fireball.png',     category: 'magic'    },
    { key: 'spell_freeze',      path: 'assets/spell_freeze.png',       category: 'magic'    },
    { key: 'spell_blessing',    path: 'assets/spell_blessing.png',     category: 'religion' },
    { key: 'spell_holy_light',  path: 'assets/spell_holy_light.png',   category: 'religion' },
  ],
  PROJECTILES: [
    { key: 'proj_arrow',             path: 'assets/proj_arrow.png',             category: 'projectile' },
    { key: 'proj_crossbow_bolt',     path: 'assets/proj_crossbow_bolt.png',     category: 'projectile' },
    { key: 'proj_catapult_rock',     path: 'assets/proj_catapult_rock.png',     category: 'projectile' },
    { key: 'proj_cannonball',        path: 'assets/proj_cannonball.png',        category: 'projectile' },
    { key: 'proj_throwing_spear',    path: 'assets/proj_throwing_spear.png',    category: 'projectile' },
    { key: 'proj_magic_bolt',        path: 'assets/proj_magic_bolt.png',        category: 'projectile' },
    { key: 'proj_fireball_small',    path: 'assets/proj_fireball_small.png',    category: 'projectile' },
    { key: 'proj_lightning',         path: 'assets/proj_lightning.png',         category: 'projectile' },
    { key: 'proj_ice_shard',         path: 'assets/proj_ice_shard.png',         category: 'projectile' },
    { key: 'proj_dark_orb',          path: 'assets/proj_dark_orb.png',          category: 'projectile' },
    { key: 'proj_dragon_breath',     path: 'assets/proj_dragon_breath.png',     category: 'projectile' },
    { key: 'proj_holy_bolt',         path: 'assets/proj_holy_bolt.png',         category: 'projectile' },
    { key: 'proj_inquisitor_hammer', path: 'assets/proj_inquisitor_hammer.png', category: 'projectile' },
    { key: 'proj_divine_beam',       path: 'assets/proj_divine_beam.png',       category: 'projectile' },
  ],
  UI_ICONS: [
    { key: 'icon_research', path: 'assets/icon_research.png', category: 'ui' },
    { key: 'icon_mana',     path: 'assets/icon_mana.png',     category: 'ui' },
    { key: 'icon_faith',    path: 'assets/icon_faith.png',    category: 'ui' },
    { key: 'icon_favor',    path: 'assets/icon_favor.png',    category: 'ui' },
    { key: 'axis_science',  path: 'assets/axis_science.png',  category: 'ui' },
    { key: 'axis_magic',    path: 'assets/axis_magic.png',    category: 'ui' },
    { key: 'axis_religion', path: 'assets/axis_religion.png', category: 'ui' },
  ],
};

// Couleur du rectangle placeholder généré pour chaque catégorie (0xRRGGBB)
const PLACEHOLDER_COLORS = {
  science:    0x6b7280,  // gris ardoise
  magic:      0x9333ea,  // violet
  religion:   0xf59e0b,  // doré
  projectile: 0xf97316,  // orange
  ui:         0x3b82f6,  // bleu
};

// Dimensions du placeholder par catalogue
const PLACEHOLDER_SIZES = {
  UNITS_NEW:     { w: 32, h: 32 },
  BUILDINGS_NEW: { w: 44, h: 44 },
  SPELLS_FX:     { w: 48, h: 48 },
  PROJECTILES:   { w: 14, h:  6 },
  UI_ICONS:      { w: 22, h: 22 },
};

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
    // Charge les assets PNG. Si un asset est manquant ou échoue, on log un
    // warning et génère un placeholder coloré dans create() via _generateMissingPlaceholders().
    this.assetMissing = {};
    this.load.on('loaderror', (file) => {
      console.warn(`[ASSET MISSING] "${file.key}" (${file.src})`);
      this.assetMissing[file.key] = true;
    });

    // ── Assets existants ──────────────────────────────────────────
    this.load.image('soldier', 'assets/soldier.png');
    this.load.image('archer',  'assets/archer.png');
    this.load.image('cavalry', 'assets/cavalry.png');
    this.load.image('hdv',     'assets/hdv.png');
    this.load.image('village', 'assets/village.png');
    this.load.image('grass',   'assets/grass_tile.png');
    this.load.image('tree',    'assets/tree.png');
    this.load.image('rock',    'assets/rock.png');
    this.load.image('bush',    'assets/bush.png');
    this.load.image('flowers', 'assets/flowers.png');

    // ── Nouveaux assets — chargés depuis ASSET_CATALOG ───────────
    for (const [group, entries] of Object.entries(ASSET_CATALOG)) {
      for (const entry of entries) {
        // On enregistre la catégorie avant de tenter le load
        // (utile dans _generateMissingPlaceholders pour choisir la couleur)
        if (!this._assetMeta) this._assetMeta = {};
        this._assetMeta[entry.key] = { category: entry.category, group, isTile: !!entry.isTile };

        this.load.image(entry.key, entry.path);
        // path_tile est chargé une 2e fois sous un alias pour l'usage tileSprite
        if (entry.isTile) {
          this._assetMeta[entry.key + '_tile'] = { category: entry.category, group, isTile: true };
          this.load.image(entry.key + '_tile', entry.path);
        }
      }
    }
  }

  _hasAsset(key) {
    return !(this.assetMissing && this.assetMissing[key]) && this.textures.exists(key);
  }

  // Génère une texture Phaser colorée pour chaque asset manquant, puis retire
  // la clé de this.assetMissing afin que _hasAsset() retourne true.
  // Appelé au début de create(), avant toute création de sprite.
  _generateMissingPlaceholders() {
    const missingKeys = Object.keys(this.assetMissing || {});
    if (missingKeys.length === 0) {
      console.log('[ASSETS] Tous les assets chargés avec succès.');
      return;
    }

    const meta    = this._assetMeta || {};

    for (const key of missingKeys) {
      const info  = meta[key] || { category: 'science', group: 'UNITS_NEW' };
      const color = PLACEHOLDER_COLORS[info.category] || 0x888888;
      const size  = PLACEHOLDER_SIZES[info.group]     || { w: 32, h: 32 };

      const g = this.make.graphics({ add: false });
      g.fillStyle(color, 0.92);
      g.fillRect(0, 0, size.w, size.h);
      // Bordure blanche fine pour les distinguer du fond
      g.lineStyle(1.5, 0xffffff, 0.65);
      g.strokeRect(1, 1, size.w - 2, size.h - 2);
      // Croix centrale pour que le placeholder soit visuellement identifiable
      const cx = size.w / 2, cy = size.h / 2, r = Math.min(cx, cy) * 0.45;
      g.lineStyle(1.5, 0xffffff, 0.55);
      g.lineBetween(cx - r, cy, cx + r, cy);
      g.lineBetween(cx, cy - r, cx, cy + r);
      g.generateTexture(key, size.w, size.h);
      g.destroy();

      // Retire de assetMissing → _hasAsset() retournera true pour ce placeholder
      delete this.assetMissing[key];
    }

    console.warn(
      `[ASSETS MANQUANTS — ${missingKeys.length}] Placeholders colorés générés :\n` +
      `  ${missingKeys.join(', ')}\n` +
      `  → Copiez les PNG dans public/assets/ pour les remplacer sans rechargement du code.`
    );
  }

  create() {
    // Génère des textures placeholder pour tous les assets qui ont échoué au chargement.
    // Doit être appelé en PREMIER dans create() avant toute création de sprite.
    this._generateMissingPlaceholders();

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

    // ── DEBUG : raccourcis 1-5 pour sorts (gratuits, cast direct au curseur) ──
    // 1=fireball, 2=freeze, 3=blessing, 4=purifying_light, 5=portal sur unités sélectionnées
    const debugSpellMap = { ONE: 'fireball', TWO: 'freeze', THREE: 'blessing', FOUR: 'purifying_light' };
    Object.keys(debugSpellMap).forEach((k) => {
      this.input.keyboard.on('keydown-' + k, () => {
        if (!this.mapBuilt) return;
        const ptr = this.input.activePointer;
        Network.castSpell(debugSpellMap[k], ptr.worldX, ptr.worldY);
      });
    });
    this.input.keyboard.on('keydown-FIVE', () => {
      if (!this.mapBuilt) return;
      if (this.selectedUnitIds.size === 0) return;
      const ptr = this.input.activePointer;
      Network.debugCastPortal(Array.from(this.selectedUnitIds), ptr.worldX, ptr.worldY);
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
      // DEBUG : panneau debug intercepte le clic en mode TUNING ou SPAWN-pending
      if (pointer.button === 0 && typeof DebugPanel !== 'undefined') {
        // Mode SPAWN avec spawn en attente → place sur la map
        if (DebugPanel.getMode && DebugPanel.getMode() === 'spawn' && DebugPanel.hasPendingSpawn && DebugPanel.hasPendingSpawn()) {
          DebugPanel.tryHandleMapClick(pointer.worldX, pointer.worldY);
          return;
        }
        // Mode TUNING : si clic sur un sprite avec _unitType, ouvre le slider
        if (DebugPanel.getMode && DebugPanel.getMode() === 'tuning') {
          const hit = currentlyOver.find(go => go._unitType);
          if (hit) {
            DebugPanel.tryHandleSpriteClick(hit._unitType, pointer.x, pointer.y);
            return;
          }
        }
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
    const RAD = cfg.villageRadius || 70;
    const seen = new Set();
    const myId = Network.getMyId();
    const useAsset = this._hasAsset('village');

    const VILLAGE_DISPLAY = 110;
    for (const v of villages) {
      seen.add(v.id);
      const owner = v.ownerId ? players[v.ownerId] : null;
      const ownerColorInt = owner ? Phaser.Display.Color.HexStringToColor(owner.color).color : 0xffffff;
      const destroyed = v.hp <= 0 && !v.ownerId;

      let sprite = this.villageSprites[v.id];
      if (!sprite) {
        // Sprite principal village (plus de cercle séparé — tint sur le sprite)
        let main;
        if (useAsset) {
          main = this.add.sprite(v.x, v.y, 'village')
            .setOrigin(0.5, 0.5)
            .setDisplaySize(VILLAGE_DISPLAY, VILLAGE_DISPLAY)
            .setDepth(30);
          // Tint d'équipe : neutre = blanc, capturé = couleur du joueur
          main.setTint(owner ? ownerColorInt : 0xffffff);
        } else {
          main = this.add.rectangle(v.x, v.y, 50, 50, owner ? ownerColorInt : 0x8b7355)
            .setStrokeStyle(3, 0x000000, 0.7)
            .setDepth(30);
        }

        // Label : niveau village (Lv 1 / Lv 2)
        const label = this.add.text(v.x, v.y + 52, `Village Lv ${v.level || 1}`, {
          fontSize: '13px', fontFamily: '"Quicksand", sans-serif', fontStyle: 'bold',
          color: '#ffffff', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 0).setDepth(70);

        // Barre HP (au-dessus, depth 60)
        const hpBarBg   = this.add.rectangle(v.x, v.y - 52, 90, 8, 0x111111, 0.9)
          .setStrokeStyle(1.5, 0x000000, 0.6).setOrigin(0.5, 0.5).setDepth(60);
        const hpBarFill = this.add.rectangle(v.x - 45, v.y - 52, 90 * (v.hp / MAX_HP), 8, 0x22c55e)
          .setOrigin(0, 0.5).setDepth(60);

        // Barre de capture (en dessous de la barre HP, depth 60)
        const capBarBg   = this.add.rectangle(v.x, v.y - 42, 90, 6, 0x222222, 0.9)
          .setStrokeStyle(1, 0x000000, 0.5).setOrigin(0.5, 0.5).setDepth(60);
        const capBarFill = this.add.rectangle(v.x - 45, v.y - 42, 0, 6, 0xfbbf24)
          .setOrigin(0, 0.5).setDepth(60);

        // Bordure carrée couleur équipe (depth 5) — visible UNIQUEMENT si possédé
        const zoneBorder = this.add.graphics().setDepth(5);

        // Click handler : si c'est MON village, ouvre le panel village
        if (useAsset && main.setInteractive) {
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
        }

        sprite = { main, label, hpBarBg, hpBarFill, capBarBg, capBarFill, zoneBorder };
        this.villageSprites[v.id] = sprite;
      }

      // Met à jour la bordure carrée si possédé (sinon cachée)
      if (sprite.zoneBorder) {
        sprite.zoneBorder.clear();
        if (owner && !destroyed) {
          const vLvls = cfg.villageLevels || [];
          const lvl = vLvls[(v.level || 1) - 1] || vLvls[0] || {};
          const buildR = lvl.buildRadius || 160;
          sprite.zoneBorder.lineStyle(3, ownerColorInt, 0.55);
          sprite.zoneBorder.strokeRect(v.x - buildR, v.y - buildR, buildR * 2, buildR * 2);
        }
      }

      // Update : positions + tint + visibility
      sprite.main.setPosition(v.x, v.y);
      sprite.main.setAlpha(destroyed ? 0.35 : 1);
      if (sprite.main.setTint) {
        sprite.main.setTint(owner ? ownerColorInt : 0xffffff);
      }

      sprite.label.setPosition(v.x, v.y + 52);
      sprite.label.setText(destroyed ? '💥 Détruit' : `Village Lv ${v.level || 1}`);
      sprite.label.setColor(destroyed ? '#ef4444' : '#ffffff');

      // HP bar : visible si capturé
      const showHp = !!owner && v.hp > 0;
      sprite.hpBarBg.setVisible(showHp);
      sprite.hpBarFill.setVisible(showHp);
      if (showHp) {
        sprite.hpBarBg.setPosition(v.x, v.y - 52);
        sprite.hpBarFill.setPosition(v.x - 45, v.y - 52);
        const hpRatio = v.hp / MAX_HP;
        sprite.hpBarFill.width = 90 * hpRatio;
        const c = hpRatio > 0.6 ? 0x22c55e : hpRatio > 0.3 ? 0xf59e0b : 0xef4444;
        sprite.hpBarFill.setFillStyle(c);
      }

      const showCap = v.captureProgress > 0;
      const ratio   = Math.max(0, Math.min(1, v.captureProgress / CAP_TICKS));
      sprite.capBarBg.setVisible(showCap);
      sprite.capBarFill.setVisible(showCap);
      if (showCap) {
        const capY = showHp ? v.y - 42 : v.y - 52;
        sprite.capBarBg.setPosition(v.x, capY);
        sprite.capBarFill.setPosition(v.x - 45, capY);
        sprite.capBarFill.width = 90 * ratio;
        const capturer = v.capturingPlayerId ? players[v.capturingPlayerId] : null;
        sprite.capBarFill.setFillStyle(capturer ? Phaser.Display.Color.HexStringToColor(capturer.color).color : 0xfbbf24);
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

    // ── SOL (depth 0) : grass tileSprite si disponible, sinon rectangle vert ──
    if (this._hasAsset('grass')) {
      this.add.tileSprite(0, 0, this.MAP_W, this.MAP_H, 'grass')
        .setOrigin(0, 0)
        .setDepth(0);
    } else {
      this.add.rectangle(this.MAP_W / 2, this.MAP_H / 2, this.MAP_W, this.MAP_H, 0x9fdc7c).setDepth(0);
      // Patches d'herbe : effet visuel pour casser la monotonie
      const patches = this.add.graphics();
      patches.fillStyle(0x7ab560, 0.55);
      for (let i = 0; i < 80; i++) {
        const px = Math.random() * this.MAP_W;
        const py = Math.random() * this.MAP_H;
        const pr = 50 + Math.random() * 90;
        patches.fillCircle(px, py, pr);
      }
      patches.setDepth(0);
    }

    // Bordure de la map
    const border = this.add.graphics().setDepth(0);
    border.lineStyle(8, 0x4d6b3e, 0.95);
    border.strokeRect(0, 0, this.MAP_W, this.MAP_H);

    // ── DECOR PROCÉDURAL (depth 10) : arbres, rochers, buissons, fleurs ──
    this._placeDecor();

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

  // ── Décor procédural ──────────────────────────────────────────
  // Place ~40-60 éléments de décor (arbres, rochers, buissons, fleurs)
  // de manière déterministe (seedé par position). Évite la zone autour
  // des spawns HDV pour ne pas cacher les bases au démarrage.
  _placeDecor() {
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
    // HDV sprite tinté à la couleur de l'équipe (plus de cercle séparé).
    // Le sprite lui-même est cliquable et plus gros pour englober l'ancienne zone (sprite + cercle).
    const HDV_DISPLAY = 160;
    const BAR_W_HDV = 110, BAR_H_HDV = 11;
    const BAR_Y_OFF = -HDV_DISPLAY / 2 - 18;
    const myId = Network.getMyId();
    const useAsset = this._hasAsset('hdv');

    for (const id of Object.keys(this.hdvSprites)) {
      if (!players[id]) { this.hdvSprites[id].forEach(o => o && o.destroy()); delete this.hdvSprites[id]; }
    }

    for (const [id, player] of Object.entries(players)) {
      const colorInt  = Phaser.Display.Color.HexStringToColor(player.color).color;
      const hpRatio   = Math.max(0, player.hp / player.maxHp);
      const destroyed = player.hp <= 0;

      // Rayon de zone constructible selon le level HDV (récupéré depuis la config)
      const cfgH = Network.getConfig();
      const hdvLvls = cfgH.hdvLevels || [];
      const lvl = hdvLvls[(player.hdvLevel || 1) - 1] || hdvLvls[0] || {};
      const buildR = lvl.buildRadius || 240;

      if (!this.hdvSprites[id]) {
        // Bordure carrée permanente couleur équipe (depth 5, derrière tout le reste)
        const zoneBorder = this.add.graphics().setDepth(5);
        zoneBorder.lineStyle(3, colorInt, 0.55);
        zoneBorder.strokeRect(player.x - buildR, player.y - buildR, buildR * 2, buildR * 2);

        // HDV : sprite PNG tinté équipe, sinon fallback procédural
        let hdvObj;
        if (useAsset) {
          hdvObj = this.add.sprite(player.x, player.y, 'hdv')
            .setOrigin(0.5, 0.5)
            .setDisplaySize(HDV_DISPLAY, HDV_DISPLAY)
            .setDepth(30);
          hdvObj.setTint(destroyed ? 0x888888 : colorInt);
        } else if (this.textures.exists('hdv-castle')) {
          hdvObj = this.add.sprite(player.x, player.y, 'hdv-castle')
            .setOrigin(0.5, 0.85)
            .setDisplaySize(HDV_DISPLAY + 30, HDV_DISPLAY + 40)
            .setTint(destroyed ? 0x888888 : colorInt)
            .setDepth(30);
        } else {
          hdvObj = this.add.rectangle(player.x, player.y, HDV_DISPLAY, HDV_DISPLAY, destroyed ? 0x888888 : colorInt)
            .setStrokeStyle(4, 0x111111, 0.85)
            .setDepth(30);
        }
        if (destroyed) hdvObj.setAlpha(0.45);

        if (id === myId) {
          hdvObj.setInteractive();
          hdvObj.on('pointerover', () => this.input.setDefaultCursor('pointer'));
          hdvObj.on('pointerout',  () => this.input.setDefaultCursor('default'));
          hdvObj.on('pointerdown', () => HdvPanel.toggle());
        }

        const barBg    = this.add.rectangle(player.x, player.y + BAR_Y_OFF, BAR_W_HDV, BAR_H_HDV, 0x431407, 0.95)
          .setStrokeStyle(1.5, 0x000000, 0.7).setOrigin(0.5, 0.5).setDepth(60);
        const barFill  = this.add.rectangle(player.x - BAR_W_HDV / 2, player.y + BAR_Y_OFF, BAR_W_HDV * hpRatio, BAR_H_HDV, 0x22c55e)
          .setOrigin(0, 0.5).setDepth(60);
        const nameLabel = this.add.text(player.x, player.y + BAR_Y_OFF - BAR_H_HDV - 8, player.name,
          { fontSize: '16px', fontFamily: '"Quicksand", sans-serif', fontStyle: 'bold', color: player.color, stroke: '#000000', strokeThickness: 4 }
        ).setOrigin(0.5, 1).setDepth(70);
        const hpLabel = this.add.text(player.x, player.y + HDV_DISPLAY / 2 + 8, `${player.hp}/${player.maxHp}`,
          { fontSize: '13px', fontFamily: '"Quicksand", sans-serif', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }
        ).setOrigin(0.5, 0).setDepth(70);

        // [hdvObj, barBg, barFill, nameLabel, hpLabel, zoneBorder]
        this.hdvSprites[id] = [hdvObj, barBg, barFill, nameLabel, hpLabel, zoneBorder];
        this.hdvSprites[id]._currentBuildR = buildR; // mémorise pour détecter les changements de level

      } else {
        const [hdvObj, barBg, barFill, nameLabel, hpLabel, zoneBorder] = this.hdvSprites[id];

        hdvObj.setPosition(player.x, player.y);
        if (hdvObj.setTint) hdvObj.setTint(destroyed ? 0x888888 : colorInt);
        hdvObj.setAlpha(destroyed ? 0.45 : 1);

        if (!destroyed && hpRatio < 0.3) {
          hdvObj.setAlpha(0.9 + 0.1 * Math.sin(Date.now() / 200));
        }

        // Update zone border si le level a changé (rayon différent) ou si le HDV bouge
        if (zoneBorder && (this.hdvSprites[id]._currentBuildR !== buildR || true)) {
          zoneBorder.clear();
          zoneBorder.lineStyle(3, colorInt, destroyed ? 0.15 : 0.55);
          zoneBorder.strokeRect(player.x - buildR, player.y - buildR, buildR * 2, buildR * 2);
          this.hdvSprites[id]._currentBuildR = buildR;
        }

        barBg.setPosition(player.x, player.y + BAR_Y_OFF);
        barFill.setPosition(player.x - BAR_W_HDV / 2, player.y + BAR_Y_OFF);
        barFill.width = BAR_W_HDV * hpRatio;
        const barColor = hpRatio > 0.6 ? 0x22c55e : hpRatio > 0.3 ? 0xf59e0b : 0xef4444;
        barFill.setFillStyle(barColor);

        nameLabel.setPosition(player.x, player.y + BAR_Y_OFF - BAR_H_HDV - 8)
          .setText(player.eliminated ? '💀 ÉLIMINÉ' : player.name)
          .setColor(player.eliminated ? '#ef4444' : player.color);
        hpLabel.setPosition(player.x, player.y + HDV_DISPLAY / 2 + 8).setText(`${player.hp}/${player.maxHp}`);
      }
    }
  }

  // ── Units ─────────────────────────────────────────────────────────

  _syncUnits(units, players) {
    const myId = Network.getMyId();

    for (const id of Object.keys(this.unitSprites)) {
      if (!units[id]) {
        // Animation de mort sur le sprite principal (fade + scale → destroy)
        const arr = this.unitSprites[id];
        const sprite = arr && arr[0];
        if (sprite && typeof Animations !== 'undefined') {
          Animations.animateUnitDeath(this, sprite);
          // Détruire les autres éléments immédiatement (barres, badge)
          for (let i = 1; i < arr.length; i++) if (arr[i]) arr[i].destroy();
        } else if (arr) {
          arr.forEach(o => { if (o) o.destroy(); });
        }
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
        // Lecture de la config centralisée pour l'asset, la taille et le scale
        const cfg = (typeof ENTITIES_CONFIG !== 'undefined') ? ENTITIES_CONFIG[unit.type] : null;
        const assetKey  = (cfg && cfg.assetKey)    || unit.type;
        const unitSize  = (cfg && cfg.displaySize) || 40;
        const scaleMult = (cfg && cfg.scale)       || 1.0;
        const useAsset  = this._hasAsset(assetKey);

        let sprite;
        if (useAsset) {
          sprite = this.add.sprite(unit.x, unit.y, assetKey)
            .setOrigin(0.5, 0.5)
            .setDisplaySize(unitSize * scaleMult, unitSize * scaleMult)
            .setDepth(50);
          sprite.setTint(colorInt);
        } else {
          // Fallback SpriteFactory pour les 3 unités historiques
          const texKey = unit.type === 'archer' ? 'unit-archer'
                      : unit.type === 'knight' ? 'unit-knight'
                      : 'unit-soldier';
          sprite = this.add.sprite(unit.x, unit.y, texKey).setTint(colorInt).setDepth(50);
          if (scaleMult !== 1.0) sprite.setScale(sprite.scaleX * scaleMult, sprite.scaleY * scaleMult);
        }

        sprite._scaleMult = scaleMult;
        // Mémorise les scales APRÈS setDisplaySize → le wobble ne casse pas la taille
        sprite._baseScaleX = sprite.scaleX;
        sprite._baseScaleY = sprite.scaleY;
        sprite._unitId      = id;
        sprite._unitOwnerId = unit.ownerId;
        sprite._unitType    = unit.type;
        sprite._idlePhase   = Math.random() * Math.PI * 2;

        if (unit.ownerId === myId) {
          sprite.setInteractive(new Phaser.Geom.Circle(sprite.width / 2, sprite.height / 2, 30), Phaser.Geom.Circle.Contains);
          sprite.on('pointerover', () => this.input.setDefaultCursor('pointer'));
          sprite.on('pointerout',  () => this.input.setDefaultCursor('default'));
        }

        const barBg   = this.add.rectangle(unit.x, unit.y + BAR_Y, BAR_W, BAR_H, 0x111111, 0.85)
          .setStrokeStyle(1, 0x000000, 0.7).setOrigin(0.5, 0.5).setDepth(60);
        const barFill = this.add.rectangle(unit.x - BAR_W / 2, unit.y + BAR_Y, BAR_W * (unit.hp / unit.maxHp), BAR_H, 0x22c55e)
          .setOrigin(0, 0.5).setDepth(60);

        const badge = this.add.text(unit.x + 18, unit.y - 18, this._modeIcon(unit.mode), {
          fontSize: '12px', fontFamily: '"Quicksand", sans-serif',
        }).setOrigin(0.5, 0.5).setDepth(70);

        // Animations de spawn (invoqués) et idle ambient (boss / volants)
        if (typeof Animations !== 'undefined') {
          if (cfg && cfg.summoned) Animations.animateUnitSpawn(this, sprite, unit.type);
          if (cfg && (cfg.boss || cfg.flying)) Animations.animateIdleAmbient(this, sprite, unit.type);
          if (unit.type === 'fire_elemental') Animations.animateIdleAmbient(this, sprite, unit.type);
        }

        // [sprite, barBg, barFill, badge] — plus de cocarde, tint sur le sprite
        this.unitSprites[id] = [sprite, barBg, barFill, badge];

      } else if (posChanged || hpChanged) {
        const [sprite, , barFill, badge] = this.unitSprites[id];
        if (badge) badge.setText(this._modeIcon(unit.mode));
        if (sprite.setTint) sprite.setTint(colorInt);

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
      ring.setDepth(55); // au-dessus des unités, sous les barres de vie
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
    // Wobble idle : oscillation verticale TRÈS subtile via le scale,
    // PRÉSERVE le baseScale du sprite (sinon le PNG natif s'affiche à sa taille brute).
    const t = Date.now() / 420;
    for (const [, sprites] of Object.entries(this.unitSprites)) {
      if (sprites.length < 3) continue;
      const [sprite, barBg, barFill, badge] = sprites;
      const phase = (sprite._idlePhase || 0);
      const wobble = Math.sin(t + phase); // [-1, 1]
      barBg.setPosition(sprite.x, sprite.y + BAR_Y - 4);
      barFill.setPosition(sprite.x - BAR_W / 2, sprite.y + BAR_Y - 4);
      if (badge) badge.setPosition(sprite.x + 22, sprite.y - 22);
      // Multiplie le baseScale (pas setScale absolu) pour garder la taille définie par setDisplaySize
      const bx = sprite._baseScaleX || sprite.scaleX;
      const by = sprite._baseScaleY || sprite.scaleY;
      if (bx && by) {
        sprite.setScale(bx, by * (1 + wobble * 0.025));
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

    // Lecture config : si projectile défini → spawn sprite projectile qui vole
    const cfg = (typeof ENTITIES_CONFIG !== 'undefined') ? ENTITIES_CONFIG[attacker.type] : null;
    if (cfg && cfg.projectile && this._hasAsset(cfg.projectile) && attacker.type !== 'archer') {
      this._playProjectileAnim(attacker.x, attacker.y, tx, ty, cfg.projectile);
      return;
    }

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

  // ── Projectile générique : sprite tourné vers la cible + anim arrivée ──
  _playProjectileAnim(sx, sy, tx, ty, projKey) {
    const angle = Math.atan2(ty - sy, tx - sx);
    const dist  = Math.hypot(tx - sx, ty - sy);
    // Projectiles lourds = plus lents
    const HEAVY = new Set(['proj_catapult_rock', 'proj_cannonball', 'proj_dragon_breath']);
    const speed = HEAVY.has(projKey) ? 200 : 300; // px/s
    const duration = Math.max(80, Math.min(1200, (dist / speed) * 1000));

    const proj = this.add.sprite(sx, sy, projKey).setRotation(angle).setDepth(56);
    if (typeof Animations !== 'undefined' && Animations.animateProjectile) {
      Animations.animateProjectile(this, proj, projKey);
    }
    this.tweens.add({
      targets: proj, x: tx, y: ty,
      duration, ease: 'Quad.easeOut',
      onComplete: () => {
        // Petit flash d'impact
        const flash = this.add.circle(tx, ty, 14, 0xffffff, 0.7).setDepth(54);
        this.tweens.add({
          targets: flash, scale: { from: 0.5, to: 1.6 }, alpha: { from: 0.7, to: 0 },
          duration: 200, onComplete: () => flash.destroy(),
        });
        proj.destroy();
      },
    });
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
