const UNIT_RADIUS = 15;
const BAR_W       = 30;
const BAR_H       = 4;
const BAR_Y       = -(UNIT_RADIUS + 8);

// Factions neutres PvE — miroir des NEUTRAL_OWNER_* serveur.
const NEUTRAL_FACTIONS = {
  neutral_barbarian: { name: 'Barbares', color: '#6b6b6b', colorInt: 0x6b6b6b },
  neutral_fauna:     { name: 'Faune',    color: '#8b6f47', colorInt: 0x8b6f47 },
  neutral_boss:      { name: 'Boss',     color: '#8b4513', colorInt: 0x8b4513 },
};
function getOwnerDisplay(ownerId, players) {
  if (players && players[ownerId]) {
    return { name: players[ownerId].name, color: players[ownerId].color,
             colorInt: Phaser.Display.Color.HexStringToColor(players[ownerId].color).color, isNeutral: false };
  }
  const n = NEUTRAL_FACTIONS[ownerId];
  if (n) return { name: n.name, color: n.color, colorInt: n.colorInt, isNeutral: true };
  return { name: 'Inconnu', color: '#ffffff', colorInt: 0xffffff, isNeutral: false };
}
function isFaunaType(t) { return t === 'boar' || t === 'wolf'; }

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
// Projectiles : 28x10 pour bien visibles en vol (avant : 14x6 c'était trop petit)
const PLACEHOLDER_SIZES = {
  UNITS_NEW:     { w: 32, h: 32 },
  BUILDINGS_NEW: { w: 44, h: 44 },
  SPELLS_FX:     { w: 48, h: 48 },
  PROJECTILES:   { w: 28, h: 10 },
  UI_ICONS:      { w: 22, h: 22 },
};

// Couleurs spécifiques par clé de projectile pour distinguer les types en vol
const PROJECTILE_COLORS = {
  proj_arrow:             0xd97706,  // bois/ambre
  proj_crossbow_bolt:     0x92400e,  // bois foncé
  proj_catapult_rock:     0x6b7280,  // pierre grise
  proj_cannonball:        0x1f2937,  // boulet noir
  proj_throwing_spear:    0xa16207,  // lance bois
  proj_magic_bolt:        0x8b5cf6,  // violet magique
  proj_fireball_small:    0xf97316,  // orange feu
  proj_lightning:         0xfbbf24,  // jaune éclair
  proj_ice_shard:         0x60a5fa,  // bleu glace
  proj_dark_orb:          0x4c1d95,  // pourpre sombre
  proj_dragon_breath:     0xdc2626,  // rouge dragon
  proj_holy_bolt:         0xfde047,  // jaune sacré
  proj_inquisitor_hammer: 0x78350f,  // marron marteau
  proj_divine_beam:       0xfef9c3,  // lumière divine
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
    this._placeholderKeys = this._placeholderKeys || new Set();
    const missingKeys = Object.keys(this.assetMissing || {});
    if (missingKeys.length === 0) {
      console.log('[ASSETS] Tous les assets chargés avec succès.');
      return;
    }

    const meta    = this._assetMeta || {};

    for (const key of missingKeys) {
      const info  = meta[key] || { category: 'science', group: 'UNITS_NEW' };
      const color = (info.group === 'PROJECTILES' && PROJECTILE_COLORS[key])
                  ? PROJECTILE_COLORS[key]
                  : (PLACEHOLDER_COLORS[info.category] || 0x888888);
      const size  = PLACEHOLDER_SIZES[info.group] || { w: 32, h: 32 };

      const g = this.make.graphics({ add: false });
      g.fillStyle(color, 1);
      // Forme adaptée par catégorie : projectile = forme allongée pointue
      if (info.group === 'PROJECTILES') {
        // Corps : rectangle plein + pointe triangulaire à droite (sens du tir)
        g.fillRect(0, 0, size.w - 6, size.h);
        g.fillTriangle(size.w - 6, 0, size.w, size.h / 2, size.w - 6, size.h);
        g.lineStyle(1.5, 0xffffff, 0.9);
        g.strokeRect(0, 0, size.w - 6, size.h);
      } else {
        g.fillRect(0, 0, size.w, size.h);
        g.lineStyle(1.5, 0xffffff, 0.65);
        g.strokeRect(1, 1, size.w - 2, size.h - 2);
        // Croix centrale pour identifier les placeholders unités/bâtiments
        const cx = size.w / 2, cy = size.h / 2, r = Math.min(cx, cy) * 0.45;
        g.lineStyle(1.5, 0xffffff, 0.55);
        g.lineBetween(cx - r, cy, cx + r, cy);
        g.lineBetween(cx, cy - r, cx, cy + r);
      }
      g.generateTexture(key, size.w, size.h);
      g.destroy();

      // Mémorise que cette clé est un placeholder (utilisé pour superposer l'emoji)
      this._placeholderKeys.add(key);
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

    // Reset toutes les touches caméra si la fenêtre perd le focus (raccourci nav, alt-tab…).
    // Sans ça, isDown reste true et la caméra dérive en continu.
    const resetCamKeys = () => {
      [this.cursors.left, this.cursors.right, this.cursors.up, this.cursors.down,
       this.wasd.left, this.wasd.right, this.wasd.up, this.wasd.down].forEach(k => {
        if (k && typeof k.reset === 'function') k.reset();
      });
    };
    window.addEventListener('blur', resetCamKeys);
    document.addEventListener('visibilitychange', () => { if (document.hidden) resetCamKeys(); });

    this.input.mouse.disableContextMenu();
    this.attackGraphics = this.add.graphics();

    // Particle texture for unit death burst
    const pg = this.make.graphics({ add: false });
    pg.fillStyle(0xffffff, 1);
    pg.fillCircle(4, 4, 4);
    pg.generateTexture('particle', 8, 8);
    pg.destroy();

    // ── FX caméra : vignette + color grading chaud (ambiance verrouillée) ──
    // API FX Phaser 3.90 : nécessite le renderer WebGL (pas Canvas).
    if (this.cameras.main.postFX && this.game.renderer && this.game.renderer.type === Phaser.WEBGL) {
      // Vignette douce : centre clair, bords assombris (subtil pour rester lisible)
      this.cameras.main.postFX.addVignette(0.5, 0.5, 0.85, 0.45);
      // Color grading chaud très léger : un peu de saturation + hue légèrement chaud
      const cm = this.cameras.main.postFX.addColorMatrix();
      if (cm.saturate) cm.saturate(0.08);
      if (cm.hue)      cm.hue(-4);
      if (cm.brightness) cm.brightness(1.01);
    }

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

    // Raccourcis sorts F/G/H/J/1-5 SUPPRIMÉS (sorts désactivés en phase 4).
    // Les ressources mana/foi servent maintenant à PRODUIRE les unités magie/religion
    // depuis le panel HDV/village (au lieu de caster des sorts).

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

    Network.setOnBarbarianRaid((data) => {
      const myId = Network.getMyId();
      if (data.targetPlayerId === myId) {
        this._addKillFeedEntry(`🔥 Un raid barbare arrive sur toi ! (${data.count})`, '#ff4444');
      } else {
        this._addKillFeedEntry(`⚠️ Raid barbare → ${data.targetName} (${data.count})`, data.targetColor || '#999999');
      }
    });

    Network.setOnCampCleared((data) => {
      const myId = Network.getMyId();
      const unitName = data.freeUnit === 'knight' ? 'chevalier' : 'soldat';
      if (data.byPlayerId === myId) {
        this._addKillFeedEntry(`🏆 Camp nettoyé ! +${data.rewardGold}💰 +1 ${unitName}`, '#fbbf24');
      } else {
        this._addKillFeedEntry(`🏴 ${data.byName} a nettoyé un camp de bandits`, data.byColor || '#999999');
      }
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
      // Si la cible est filtrée par fog → fallback sur data.targetX/Y serveur
      // → permet de voir les projectiles même quand la cible n'est pas visible localement
      let tx, ty;
      if (data.targetType === 'unit') {
        const t = state.units && state.units[data.targetId];
        if (t) { tx = t.x; ty = t.y; this._flashUnit(data.targetId); }
        else if (data.targetX != null) { tx = data.targetX; ty = data.targetY; }
        else return;
        if (data.killed && t) {
          this._spawnDeathParticles(t.x, t.y, getOwnerDisplay(t.ownerId, state.players).colorInt);
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
        // Projectile depuis le bâtiment : utilise le vrai PNG du projectile selon le type
        const ax = (data.bx != null) ? data.bx : tx;
        const ay = (data.by != null) ? data.by : ty;
        // Détermine le type de projectile : tour/citadel = arrow, bombard = cannonball
        const bldType = data.attackerBuildingType || 'tower';
        const projKey = (bldType === 'bombard_tower') ? 'proj_cannonball'
                      : 'proj_arrow';
        if (this._hasAsset(projKey)) {
          this._playProjectileAnim(ax, ay, tx, ty, projKey);
        } else {
          this._playArrowAnimation(ax, ay, tx, ty); // fallback legacy
        }
      } else {
        // L'attaquant peut être filtré par fog → fallback sur attackerX/Y serveur
        let attacker = state.units && state.units[data.attackerId];
        if (!attacker && data.attackerX != null) {
          attacker = { x: data.attackerX, y: data.attackerY, type: data.attackerType || 'soldier' };
        }
        if (!attacker) return;
        this._playAttackAnimation(attacker, tx, ty, data.attackerId);
        // Kill feed unit→unit (différencie les kills PvE)
        if (data.killed && data.targetType === 'unit') {
          const t = state.units && state.units[data.targetId];
          const killerD = getOwnerDisplay(attacker.ownerId, state.players);
          const targetD = t ? getOwnerDisplay(t.ownerId, state.players) : null;
          if (!killerD.isNeutral && targetD && targetD.isNeutral) {
            const drop = (data.goldDrop != null) ? ` (+${data.goldDrop}💰)` : '';
            const beast = targetD.name.toLowerCase().replace(/s$/, '');
            this._addKillFeedEntry(`⚔️ ${killerD.name} a tué un ${beast}${drop}`, killerD.color);
          } else if (!killerD.isNeutral) {
            this._addKillFeedEntry(`⚔️ ${killerD.name} a tué une unité`, killerD.color);
          } else if (targetD && !targetD.isNeutral) {
            this._addKillFeedEntry(`☠️ ${killerD.name} ont tué une unité de ${targetD.name}`, killerD.color);
          }
        }
      }
    });

    // ── Input ─────────────────────────────────────────────────────

    this.input.on('pointerdown', (pointer, currentlyOver) => {
      // Ferme BuildingInfoPanel si on clique ailleurs que sur un bâtiment
      // (le sprite bâtiment ré-ouvrira son panel s'il est cliqué)
      if (typeof BuildingInfoPanel !== 'undefined' && BuildingInfoPanel.isVisible
          && BuildingInfoPanel.isVisible()) {
        const clickedBuilding = currentlyOver.find(go => go._buildingId);
        if (!clickedBuilding) BuildingInfoPanel.close();
      }
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

    // ── Scroll caméra UNIQUEMENT si aucun panel HTML ne capture le focus ──
    // (Sinon, les raccourcis Chrome type Ctrl+Shift+D peuvent rendre une touche
    //  stuck en isDown=true → caméra dérive à l'infini)
    const anyPanelOpen =
      (typeof HdvPanel       !== 'undefined' && HdvPanel.isVisible       && HdvPanel.isVisible()) ||
      (typeof VillagePanel   !== 'undefined' && VillagePanel.isVisible   && VillagePanel.isVisible()) ||
      (typeof TechTreeOverlay!== 'undefined' && TechTreeOverlay.isOpen   && TechTreeOverlay.isOpen()) ||
      (typeof DebugPanel     !== 'undefined' && DebugPanel.isOpen        && DebugPanel.isOpen());
    // Focus sur un élément interactif HTML ? → skip scroll (sécurité supplémentaire)
    const ae = document.activeElement;
    const focusOnUi = ae && ae !== document.body && (ae.tagName === 'INPUT' || ae.tagName === 'BUTTON' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT');

    if (!anyPanelOpen && !focusOnUi) {
      if (this.cursors.left.isDown  || this.wasd.left.isDown)  cam.scrollX -= SPEED;
      if (this.cursors.right.isDown || this.wasd.right.isDown) cam.scrollX += SPEED;
      if (this.cursors.up.isDown    || this.wasd.up.isDown)    cam.scrollY -= SPEED;
      if (this.cursors.down.isDown  || this.wasd.down.isDown)  cam.scrollY += SPEED;
    }

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

    // Indicateurs de passifs (badges + halos HDV) — visibles par TOUS les joueurs
    if (typeof TechIndicators !== 'undefined') {
      const visibleHdvPids = new Set(Object.keys(this.hdvSprites));
      TechIndicators.sync(state.playerSummary || [], visibleHdvPids, state.players);
    }
  }

  // ── Villages neutres ─────────────────────────────────────────────

  _syncBuildings(buildings, players) {
    if (!this.buildingSprites) this.buildingSprites = {};
    const cfg = Network.getConfig();
    const seen = new Set();
    for (const b of buildings) {
      seen.add(b.id);
      const def = (cfg.buildingTypes || {})[b.type] || {};
      const owner = players[b.ownerId];
      const colorInt = owner ? Phaser.Display.Color.HexStringToColor(owner.color).color : 0xffffff;
      let s = this.buildingSprites[b.id];

      // Lecture config visuelle (entitiesConfig.js) — assetKey, scale, displaySize
      const eCfg = (typeof ENTITIES_CONFIG !== 'undefined') ? ENTITIES_CONFIG[b.type] : null;
      const assetKey  = (eCfg && eCfg.assetKey)    || b.type;
      const scaleMult = (eCfg && eCfg.scale)       || 2.0;
      const dispSize  = (eCfg && eCfg.displaySize) || ((def.halfSize || 22) * 2);
      const finalSize = dispSize * scaleMult;
      const usePng    = this._hasAsset(assetKey) && !(this._placeholderKeys && this._placeholderKeys.has(assetKey));

      if (!s) {
        // Ombre portée sous le bâtiment (depth 27, sous le sprite 28)
        const shadow = this.add.ellipse(b.x, b.y + finalSize * 0.36, finalSize * 0.62, finalSize * 0.24, 0x000000, 0.28).setDepth(27);

        let bg;
        if (usePng) {
          // Vrai PNG : sprite tinté équipe ADOUCIE (préserve le design du sprite)
          bg = this.add.sprite(b.x, b.y, assetKey)
            .setOrigin(0.5, 0.5)
            .setDisplaySize(finalSize, finalSize)
            .setDepth(28);
          bg.setTint(this._factionTint(colorInt));
          bg.setTintFill && (bg.tintFill = false); // multiply (par défaut), pas fill
        } else {
          // Placeholder rectangle + icône emoji
          bg = this.add.rectangle(b.x, b.y, finalSize, finalSize, colorInt, 0.85)
            .setStrokeStyle(2.5, 0x111111, 0.9).setDepth(28);
        }

        // Aura pulsante subtile pour les bâtiments magie / religion (vie + lisibilité)
        let aura = null;
        if (eCfg && (eCfg.category === 'magic' || eCfg.category === 'religion')) {
          const auraColor = eCfg.category === 'magic' ? 0x9333ea : 0xfbbf24;
          aura = this.add.ellipse(b.x, b.y + finalSize * 0.30, finalSize * 0.85, finalSize * 0.42, auraColor, 0.18).setDepth(26);
          this.tweens.add({ targets: aura, alpha: { from: 0.10, to: 0.26 }, scaleX: { from: 0.92, to: 1.06 }, scaleY: { from: 0.92, to: 1.06 },
            duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        }

        // Pop de construction : squash&stretch d'apparition + poussière
        const popBaseX = bg._baseScaleX = bg.scaleX;
        const popBaseY = bg._baseScaleY = bg.scaleY;
        bg.setScale(popBaseX * 0.4, popBaseY * 0.4);
        this.tweens.add({ targets: bg, scaleX: popBaseX, scaleY: popBaseY, duration: 380, ease: 'Back.easeOut' });
        this._spawnBuildPuff(b.x, b.y + finalSize * 0.3, finalSize);

        // Icône emoji : superposée UNIQUEMENT en placeholder (pas sur vrai sprite)
        const icon = usePng ? null : this.add.text(b.x, b.y, def.icon || '🏗', {
          fontSize: (finalSize * 0.55) + 'px',
        }).setOrigin(0.5, 0.5).setDepth(29);

        // Petite bannière de propriétaire (sous le sprite) — pour identifier l'équipe
        // même quand le tint est subtil
        const banner = owner ? this.add.rectangle(b.x, b.y + finalSize / 2 + 4, finalSize * 0.6, 3, colorInt, 1).setDepth(29) : null;

        const hpBg   = this.add.rectangle(b.x, b.y - finalSize / 2 - 8, finalSize + 10, 5, 0x111111, 0.85)
          .setStrokeStyle(1, 0x000000, 0.7).setOrigin(0.5, 0.5).setDepth(60);
        const hpFill = this.add.rectangle(b.x - (finalSize + 10) / 2, b.y - finalSize / 2 - 8, (finalSize + 10), 5, 0x22c55e)
          .setOrigin(0, 0.5).setDepth(60);

        // Marquage pour le mode TUNING du debug panel (clic → slider scale)
        bg._unitType = b.type;
        bg._unitOwnerId = b.ownerId;
        bg._buildingId = b.id;

        // Click handler universel : LEFT click ouvre le BuildingInfoPanel.
        // RIGHT click traverse vers le world handler (pour attaquer un bâtiment ennemi).
        if (bg.setInteractive) {
          bg.setInteractive();
          bg.on('pointerover', () => this.input.setDefaultCursor('pointer'));
          bg.on('pointerout',  () => this.input.setDefaultCursor('default'));
          bg.on('pointerdown', (pointer) => {
            // Right click → ne bloque pas, laisse passer au world handler pour attaque
            if (pointer && pointer.button !== 0) return;
            // Mode TUNING actif → laisse DebugPanel gérer
            if (typeof DebugPanel !== 'undefined' && DebugPanel.getMode && DebugPanel.getMode() === 'tuning') return;
            if (typeof BuildingInfoPanel !== 'undefined') {
              const fresh = (Network.getState().buildings || []).find(bb => bb.id === b.id);
              if (fresh) BuildingInfoPanel.open(fresh);
            }
          });
        }

        s = { bg, shadow, aura, icon, banner, hpBg, hpFill, _finalSize: finalSize, _usePng: usePng };
        this.buildingSprites[b.id] = s;
      }

      const sz = s._finalSize;
      s.bg.setPosition(b.x, b.y);
      if (s.shadow) s.shadow.setPosition(b.x, b.y + sz * 0.36);
      if (s.aura)   s.aura.setPosition(b.x, b.y + sz * 0.30);
      if (s._usePng) {
        if (s.bg.setTint) s.bg.setTint(this._factionTint(colorInt));
      } else if (s.bg.setFillStyle) {
        s.bg.setFillStyle(colorInt, 0.85);
      }
      if (s.icon) s.icon.setPosition(b.x, b.y);
      if (s.banner) {
        s.banner.setPosition(b.x, b.y + sz / 2 + 4);
        s.banner.setFillStyle(colorInt, 1);
      }
      s.hpBg.setPosition(b.x, b.y - sz / 2 - 8);
      s.hpFill.setPosition(b.x - (sz + 10) / 2, b.y - sz / 2 - 8);
      const hpRatio = b.hp / b.maxHp;
      s.hpFill.width = (sz + 10) * hpRatio;
      const c = hpRatio > 0.6 ? 0x22c55e : hpRatio > 0.3 ? 0xf59e0b : 0xef4444;
      s.hpFill.setFillStyle(c);
    }
    // Cleanup : bâtiment détruit → burst de debris (pierre + poussière) à sa
    // position avant de détruire les sprites. Léger shake caméra pour le poids.
    for (const id of Object.keys(this.buildingSprites)) {
      if (!seen.has(id)) {
        const s = this.buildingSprites[id];
        const bx = s.bg ? s.bg.x : 0;
        const by = s.bg ? s.bg.y : 0;
        const sz = s._finalSize || 50;
        if (s.bg) this._spawnBuildingDebris(bx, by, sz);
        // Shake subtil proportionnel à la taille (gros bâtiments → plus visible)
        this.cameras.main.shake(180, Math.min(0.006, 0.0015 + sz / 12000));
        Object.values(s).forEach(o => o && o.destroy && o.destroy());
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
        // Ombre portée sous le village (depth 29, sous le sprite 30)
        const vShadow = this.add.ellipse(v.x, v.y + VILLAGE_DISPLAY * 0.34, VILLAGE_DISPLAY * 0.6, VILLAGE_DISPLAY * 0.22, 0x000000, 0.26).setDepth(29);

        // Sprite principal village (plus de cercle séparé — tint sur le sprite)
        let main;
        if (useAsset) {
          main = this.add.sprite(v.x, v.y, 'village')
            .setOrigin(0.5, 0.5)
            .setDisplaySize(VILLAGE_DISPLAY, VILLAGE_DISPLAY)
            .setDepth(30);
          // Tint d'équipe ADOUCI : neutre = blanc, capturé = couleur du joueur
          main.setTint(owner ? this._factionTint(ownerColorInt) : 0xffffff);
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

        // Badge garnison barbare (⚔ N) — visible tant que la garnison défend
        const garrisonBadge = this.add.text(v.x + 36, v.y - 38, '', {
          fontSize: '14px', fontFamily: '"Quicksand", sans-serif', fontStyle: 'bold',
          color: '#e5e5e5', stroke: '#000000', strokeThickness: 3,
          backgroundColor: 'rgba(40,40,40,0.85)', padding: { x: 4, y: 2 },
        }).setOrigin(0.5, 0.5).setDepth(62).setVisible(false);

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

        sprite = { main, vShadow, label, hpBarBg, hpBarFill, capBarBg, capBarFill, zoneBorder, garrisonBadge };
        this.villageSprites[v.id] = sprite;
      }

      // Badge garnison : compte les barbares vivants attachés à ce village neutre
      if (sprite.garrisonBadge) {
        if (!owner && v.hp > 0) {
          const allUnits = Network.getState().units || {};
          let count = 0;
          for (const u of Object.values(allUnits)) {
            if (u.neutralVillageId === v.id && u.neutralRole === 'garrison' && u.hp > 0) count++;
          }
          sprite.garrisonBadge.setVisible(count > 0);
          if (count > 0) { sprite.garrisonBadge.setPosition(v.x + 36, v.y - 38); sprite.garrisonBadge.setText(`⚔ ${count}`); }
        } else {
          sprite.garrisonBadge.setVisible(false);
        }
      }
      if (sprite.vShadow) {
        sprite.vShadow.setPosition(v.x, v.y + VILLAGE_DISPLAY * 0.34);
        sprite.vShadow.setAlpha(destroyed ? 0.12 : 0.26);
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
        sprite.main.setTint(owner ? this._factionTint(ownerColorInt) : 0xffffff);
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
      // Tint crème vert très clair → désature le PNG d'herbe trop contrasté/saturé,
      // les unités et bâtiments ressortent mieux sur ce fond plus doux.
      this.add.tileSprite(0, 0, this.MAP_W, this.MAP_H, 'grass')
        .setOrigin(0, 0)
        .setDepth(0)
        .setTint(0xd9e8be);
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

    // ── EAU (depth 1) : water tiles dessinées par-dessus le sol ──
    this._renderWaterTiles();

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
    if (typeof TechIndicators !== 'undefined') TechIndicators.init(this);
    this.buildingSprites = {};

    this.mapBuilt = true;
    console.log(`Map built: ${this.MAP_W}×${this.MAP_H}, grid ${info.gridW}×${info.gridH}, minZoom ${this.minZoom.toFixed(3)}`);
  }

  // ── Décor procédural ──────────────────────────────────────────
  // Place ~40-60 éléments de décor (arbres, rochers, buissons, fleurs)
  // de manière déterministe (seedé par position). Évite la zone autour
  // des spawns HDV pour ne pas cacher les bases au démarrage.
  // Dessine la carte d'eau (water tiles) par-dessus le sol grass.
  // Couleurs : bleu plus foncé pour l'eau profonde (intérieur), bleu clair en bord.
  _renderWaterTiles() {
    const waterTiles = Network.getWaterTiles && Network.getWaterTiles();
    if (!waterTiles || waterTiles.length === 0) return;
    const info = Network.getMapInfo();
    const ts = info.tileSize || 50;
    const gw = info.gridW, gh = info.gridH;
    if (!gw || !gh) return;

    const g = this.add.graphics().setDepth(1);
    // Couleur "eau profonde" et "eau bord" (couleur plus claire si pas d'eau adjacente)
    const COL_DEEP = 0x1e4a72;
    const COL_SHALLOW = 0x2e6e9c;
    const COL_FOAM = 0xbfe0f5;  // écume côtière (bleu très clair)
    for (let ty = 0; ty < gh; ty++) {
      for (let tx = 0; tx < gw; tx++) {
        if (waterTiles[ty * gw + tx] !== 1) continue;
        // Compte voisins d'eau pour déterminer profonde/peu profonde
        let waterNeighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = tx + dx, ny = ty + dy;
            if (nx >= 0 && nx < gw && ny >= 0 && ny < gh && waterTiles[ny * gw + nx] === 1) waterNeighbors++;
          }
        }
        const col = waterNeighbors >= 7 ? COL_DEEP : COL_SHALLOW;
        g.fillStyle(col, 1);
        g.fillRect(tx * ts, ty * ts, ts, ts);
      }
    }

    // ── Écume côtière : ligne claire sur chaque arête d'eau qui touche la terre ──
    const foam = this.add.graphics().setDepth(2);
    foam.lineStyle(3, COL_FOAM, 0.85);
    const isWater = (tx, ty) => tx >= 0 && tx < gw && ty >= 0 && ty < gh && waterTiles[ty * gw + tx] === 1;
    for (let ty = 0; ty < gh; ty++) {
      for (let tx = 0; tx < gw; tx++) {
        if (!isWater(tx, ty)) continue;
        const X = tx * ts, Y = ty * ts;
        if (!isWater(tx, ty - 1)) foam.lineBetween(X, Y, X + ts, Y);             // bord nord
        if (!isWater(tx, ty + 1)) foam.lineBetween(X, Y + ts, X + ts, Y + ts);   // bord sud
        if (!isWater(tx - 1, ty)) foam.lineBetween(X, Y, X, Y + ts);             // bord ouest
        if (!isWater(tx + 1, ty)) foam.lineBetween(X + ts, Y, X + ts, Y + ts);   // bord est
      }
    }
    // Respiration de l'écume (alpha qui pulse doucement = vagues qui viennent et vont)
    this.tweens.add({ targets: foam, alpha: { from: 0.55, to: 1.0 }, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Respiration subtile de la surface d'eau elle-même
    this.tweens.add({ targets: g, alpha: { from: 0.92, to: 1.0 }, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this._waterGraphics = g;
    this._foamGraphics  = foam;
  }

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

        // Évite les water tiles (pas d'arbres sur l'eau)
        const wt = Network.getWaterTiles && Network.getWaterTiles();
        if (wt) {
          const info = Network.getMapInfo();
          const ts = info.tileSize || 50, gw = info.gridW;
          const tx = Math.floor(x / ts), ty = Math.floor(y / ts);
          if (tx >= 0 && ty >= 0 && tx < info.gridW && ty < info.gridH && wt[ty * gw + tx] === 1) continue;
        }

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
        const hdvTint = destroyed ? 0x888888 : this._factionTint(colorInt);
        let hdvObj;
        if (useAsset) {
          hdvObj = this.add.sprite(player.x, player.y, 'hdv')
            .setOrigin(0.5, 0.5)
            .setDisplaySize(HDV_DISPLAY, HDV_DISPLAY)
            .setDepth(30);
          hdvObj.setTint(hdvTint);
        } else if (this.textures.exists('hdv-castle')) {
          hdvObj = this.add.sprite(player.x, player.y, 'hdv-castle')
            .setOrigin(0.5, 0.85)
            .setDisplaySize(HDV_DISPLAY + 30, HDV_DISPLAY + 40)
            .setTint(hdvTint)
            .setDepth(30);
        } else {
          hdvObj = this.add.rectangle(player.x, player.y, HDV_DISPLAY, HDV_DISPLAY, destroyed ? 0x888888 : colorInt)
            .setStrokeStyle(4, 0x111111, 0.85)
            .setDepth(30);
        }
        if (destroyed) hdvObj.setAlpha(0.45);
        hdvObj._factionColor = hdvTint;

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

        // Ombre portée sous le château (depth 29, sous le HDV 30) — appendée en
        // fin de tuple (index 6) pour ne pas casser le destructuring positionnel.
        const hdvShadow = this.add.ellipse(player.x, player.y + HDV_DISPLAY * 0.34, HDV_DISPLAY * 0.66, HDV_DISPLAY * 0.24, 0x000000, 0.30).setDepth(29);

        // [hdvObj, barBg, barFill, nameLabel, hpLabel, zoneBorder, hdvShadow]
        this.hdvSprites[id] = [hdvObj, barBg, barFill, nameLabel, hpLabel, zoneBorder, hdvShadow];
        this.hdvSprites[id]._currentBuildR = buildR; // mémorise pour détecter les changements de level

      } else {
        const [hdvObj, barBg, barFill, nameLabel, hpLabel, zoneBorder] = this.hdvSprites[id];

        hdvObj.setPosition(player.x, player.y);
        const hdvShadow = this.hdvSprites[id][6];
        if (hdvShadow) { hdvShadow.setPosition(player.x, player.y + HDV_DISPLAY * 0.34); hdvShadow.setAlpha(destroyed ? 0.14 : 0.30); }
        // Détection de la transition vivant → détruit : debris + shake (événement majeur)
        if (destroyed && !hdvObj._wasDestroyed) {
          this._spawnBuildingDebris(player.x, player.y, HDV_DISPLAY);
          this.cameras.main.shake(280, 0.008);
          hdvObj._wasDestroyed = true;
        }
        const hdvTintU = destroyed ? 0x888888 : this._factionTint(colorInt);
        if (hdvObj.setTint) hdvObj.setTint(hdvTintU);
        hdvObj._factionColor = hdvTintU;
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
        if (sprite && sprite._shadow) {
          // L'ombre s'estompe avec le corps
          this.tweens.add({ targets: sprite._shadow, alpha: 0, duration: 300,
            onComplete: () => sprite._shadow && sprite._shadow.destroy() });
        }
        // Mort d'un boss (dragon arcane, god avatar) : shake caméra subtil
        const _deadCfg = (sprite && typeof ENTITIES_CONFIG !== 'undefined') ? ENTITIES_CONFIG[sprite._unitType] : null;
        if (_deadCfg && _deadCfg.boss) {
          this.cameras.main.shake(250, 0.006);
        }
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
      const _display = getOwnerDisplay(unit.ownerId, players);
      const isFauna  = isFaunaType(unit.type);
      const colorInt = _display.colorInt; // joueur OU faction neutre (gris/rouille)
      const prev     = this.unitServerPos[id];
      const paxCount = (unit.passengers && unit.passengers.length) || 0;
      const posChanged = !prev || prev.x !== unit.x || prev.y !== unit.y;
      const hpChanged  = !prev || prev.hp !== unit.hp;
      const paxChanged = unit.type === 'boat' && (!prev || prev.pax !== paxCount);
      this.unitServerPos[id] = { x: unit.x, y: unit.y, hp: unit.hp, pax: paxCount };

      if (!this.unitSprites[id]) {
        // Lecture de la config centralisée pour l'asset, la taille et le scale
        const cfg = (typeof ENTITIES_CONFIG !== 'undefined') ? ENTITIES_CONFIG[unit.type] : null;
        let assetKey   = (cfg && cfg.assetKey)    || unit.type;
        const unitSize  = (cfg && cfg.displaySize) || 40;
        const scaleMult = (cfg && cfg.scale)       || 1.0;

        // Si l'asset principal est un placeholder coloré ET qu'on a un fallback
        // visuellement cohérent (soldier/archer/cavalry), on l'utilise → l'unité
        // hérite d'un vrai design au lieu d'un carré coloré.
        // L'emoji du type reste superposé pour distinction visuelle.
        const isPrimaryPlaceholder = this._placeholderKeys && this._placeholderKeys.has(assetKey);
        if (isPrimaryPlaceholder && cfg && cfg.fallbackAssetKey
            && this.textures.exists(cfg.fallbackAssetKey)
            && !(this._placeholderKeys && this._placeholderKeys.has(cfg.fallbackAssetKey))) {
          assetKey = cfg.fallbackAssetKey;
        }
        // Faune : textures procédurales pré-colorées (boar/wolf), rendues SANS tint d'équipe.
        if (isFauna) { assetKey = unit.type === 'wolf' ? 'fauna-wolf' : 'fauna-boar'; }
        const useAsset  = this._hasAsset(assetKey);

        // Neutres : tint de faction (gris cendré / rouille). Faune : pas de tint (texture colorée).
        const softTint = isFauna ? 0xffffff : this._factionTint(colorInt);
        let sprite;
        if (useAsset) {
          sprite = this.add.sprite(unit.x, unit.y, assetKey)
            .setOrigin(0.5, 0.5)
            .setDisplaySize(isFauna ? 28 : unitSize * scaleMult, isFauna ? 28 : unitSize * scaleMult)
            .setDepth(isFauna ? 48 : 50);
          sprite.setTint(softTint);
        } else {
          // Fallback SpriteFactory pour les 3 unités historiques
          const texKey = unit.type === 'archer' ? 'unit-archer'
                      : unit.type === 'knight' ? 'unit-knight'
                      : 'unit-soldier';
          sprite = this.add.sprite(unit.x, unit.y, texKey).setTint(softTint).setDepth(50);
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
        sprite._factionColor = softTint;   // teinte affichée (restaurée après flash)
        sprite._factionRaw   = colorInt;    // couleur brute vive (ring de sélection)
        // Multiplicateurs de scale d'attaque (squash&stretch) lus par le wobble
        sprite._atkScaleX = 1;
        sprite._atkScaleY = 1;

        // Ombre portée elliptique sous l'unité (depth 48, sous le sprite 50).
        // Plus petite/diffuse pour les volants (suggère la hauteur).
        const shW = unitSize * scaleMult * (cfg && cfg.flying ? 0.40 : 0.58);
        const shadow = this.add.ellipse(unit.x, unit.y, shW, shW * 0.40, 0x000000,
          cfg && cfg.flying ? 0.16 : 0.26).setDepth(48);
        sprite._shadow = shadow;
        // Offset abaissé : l'ombre se pose sous les pieds (était un peu haute)
        sprite._shadowOffsetY = unitSize * scaleMult * (cfg && cfg.flying ? 0.62 : 0.46);

        if (unit.ownerId === myId) {
          sprite.setInteractive(new Phaser.Geom.Circle(sprite.width / 2, sprite.height / 2, 30), Phaser.Geom.Circle.Contains);
          sprite.on('pointerover', () => this.input.setDefaultCursor('pointer'));
          sprite.on('pointerout',  () => this.input.setDefaultCursor('default'));
        }

        const barBg   = this.add.rectangle(unit.x, unit.y + BAR_Y, BAR_W, BAR_H, 0x111111, 0.85)
          .setStrokeStyle(1, 0x000000, 0.7).setOrigin(0.5, 0.5).setDepth(60);
        const barFill = this.add.rectangle(unit.x - BAR_W / 2, unit.y + BAR_Y, BAR_W * (unit.hp / unit.maxHp), BAR_H, 0x22c55e)
          .setOrigin(0, 0.5).setDepth(60);

        const initBadgeTxt = isFauna ? ''
          : (unit.type === 'boat' && paxCount > 0) ? `🧍${paxCount}/4`
          : this._modeIcon(unit.mode);
        const badge = this.add.text(unit.x + 18, unit.y - 18, initBadgeTxt, {
          fontSize: '12px', fontFamily: '"Quicksand", sans-serif',
        }).setOrigin(0.5, 0.5).setDepth(70);

        // Animations de spawn (invoqués) et idle ambient (boss / volants)
        if (typeof Animations !== 'undefined') {
          if (cfg && cfg.summoned) Animations.animateUnitSpawn(this, sprite, unit.type);
          if (cfg && (cfg.boss || cfg.flying)) Animations.animateIdleAmbient(this, sprite, unit.type);
          if (unit.type === 'fire_elemental') Animations.animateIdleAmbient(this, sprite, unit.type);
        }
        // Glow faction pour les boss (dragon arcane, god avatar) + fire elemental — aura tinted.
        if (cfg && (cfg.boss || unit.type === 'fire_elemental') && sprite.postFX) {
          const glowCol = (unit.type === 'fire_elemental') ? 0xff7b33
                        : (unit.type === 'god_avatar')    ? 0xfde047
                        : (unit.type === 'arcane_dragon') ? 0x8b5cf6
                        : colorInt;
          try { sprite.postFX.addGlow(glowCol, 6, 0, false, 0.1, 10); } catch (_) {}
        }

        // Si l'asset PRIMAIRE était un placeholder (peu importe qu'on ait swappé
        // vers un fallback intelligent), superpose l'emoji du type pour
        // distinguer visuellement les unités qui partagent le même sprite.
        // → soldier/archer/knight (vrais sprites) : pas d'emoji
        // → heavy_knight / paladin / inquisitor / etc. : emoji sur sprite hérité
        let iconOverlay = null;
        if (isPrimaryPlaceholder) {
          const ut = (Network.getConfig().unitTypes || {})[unit.type] || {};
          const icon = ut.icon || '❓';
          // Position : en haut à droite du sprite (badge "type"), pas centré
          const offsetX = unitSize * 0.35 * scaleMult;
          const offsetY = -unitSize * 0.35 * scaleMult;
          iconOverlay = this.add.text(unit.x + offsetX, unit.y + offsetY, icon, {
            fontSize: Math.floor(unitSize * 0.38 * scaleMult) + 'px',
            stroke: '#000', strokeThickness: 3,
          }).setOrigin(0.5, 0.5).setDepth(52);
          iconOverlay._iconOffsetX = offsetX;
          iconOverlay._iconOffsetY = offsetY;
        }

        // [sprite, barBg, barFill, badge, iconOverlay?] — l'overlay est optionnel
        this.unitSprites[id] = iconOverlay
          ? [sprite, barBg, barFill, badge, iconOverlay]
          : [sprite, barBg, barFill, badge];

      } else if (posChanged || hpChanged || paxChanged) {
        const [sprite, , barFill, badge] = this.unitSprites[id];
        if (badge && !isFauna) {
          // Boat avec passagers : montre "🧍N/4" au lieu du mode
          if (unit.type === 'boat' && paxCount > 0) badge.setText(`🧍${paxCount}/4`);
          else badge.setText(this._modeIcon(unit.mode));
        }
        // Faune : texture pré-colorée, pas de re-tint. Autres : tint de faction.
        const softTint = isFauna ? 0xffffff : this._factionTint(colorInt);
        if (!isFauna && sprite.setTint && !sprite._attacking && !sprite._flashing) { sprite.setTint(softTint); }
        sprite._factionColor = softTint;
        sprite._factionRaw   = colorInt;

        if (hpChanged) {
          const ratio = Math.max(0, unit.hp / unit.maxHp);
          const c = ratio > 0.6 ? 0x22c55e : ratio > 0.3 ? 0xf59e0b : 0xef4444;
          barFill.setFillStyle(c);
          // Barre de vie animée (tween de la largeur, subtil)
          this.tweens.add({ targets: barFill, width: BAR_W * ratio, duration: 120, ease: 'Quad.easeOut' });
        }
        if (posChanged && !sprite._attacking) {
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
      // Sprite-based ring with pulse tween — teinté couleur de faction
      const ownerSprite = this.unitSprites[id][0];
      const ring = this.add.sprite(ownerSprite.x, ownerSprite.y, 'selection-ring');
      ring.setDepth(55); // au-dessus des unités, sous les barres de vie
      const ringColor = ownerSprite._factionRaw != null ? ownerSprite._factionRaw : 0xfbbf24;
      ring.setTint(ringColor);
      // Glow néon faction (API FX Phaser 3.90) — fait ressortir la sélection
      if (ring.postFX) {
        try { ring.postFX.addGlow(ringColor, 4, 0, false, 0.1, 8); } catch (_) {}
      }
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
      const [sprite, barBg, barFill, badge, iconOverlay] = sprites;
      const phase = (sprite._idlePhase || 0);
      const wobble = Math.sin(t + phase); // [-1, 1]
      barBg.setPosition(sprite.x, sprite.y + BAR_Y - 4);
      barFill.setPosition(sprite.x - BAR_W / 2, sprite.y + BAR_Y - 4);
      if (badge) badge.setPosition(sprite.x + 22, sprite.y - 22);
      if (iconOverlay) {
        const ox = iconOverlay._iconOffsetX || 0;
        const oy = iconOverlay._iconOffsetY || 0;
        iconOverlay.setPosition(sprite.x + ox, sprite.y + oy);
      }
      // Ombre portée : suit l'unité, légèrement écrasée quand l'unité s'étire (saut/lunge)
      if (sprite._shadow) {
        sprite._shadow.setPosition(sprite.x, sprite.y + (sprite._shadowOffsetY || 0));
      }
      // Multiplie le baseScale (pas setScale absolu) pour garder la taille définie
      // par setDisplaySize. Inclut le squash&stretch d'attaque (_atkScaleX/Y).
      const bx = sprite._baseScaleX || sprite.scaleX;
      const by = sprite._baseScaleY || sprite.scaleY;
      if (bx && by) {
        const ax = sprite._atkScaleX || 1;
        const ay = sprite._atkScaleY || 1;
        sprite.setScale(bx * ax, by * ay * (1 + wobble * 0.025));
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

    // ── Boat embark/disembark (avant le reste) ───────────────────────
    const selUnits = Array.from(this.selectedUnitIds)
      .map(id => (state.units || {})[id]).filter(Boolean);
    const myBoats = selUnits.filter(u => u.type === 'boat' && u.ownerId === myId);
    const myGroundSel = selUnits.filter(u => u.ownerId === myId && u.type !== 'boat');
    const isOnWater = Network.isWaterAt && Network.isWaterAt(wx, wy);

    // DISEMBARK : sélection contient un boat avec passagers + clic tile terre
    if (myBoats.length > 0 && !isOnWater) {
      const boatsWithPax = myBoats.filter(b => b.passengers && b.passengers.length > 0);
      if (boatsWithPax.length > 0) {
        for (const b of boatsWithPax) Network.disembarkBoat(b.id, wx, wy);
        this._showMoveIndicator(wx, wy, false);
        return;
      }
    }

    // EMBARK : clic droit sur own boat + unités terrestres sélectionnées proches
    let hitOwnBoat = null;
    for (const [uid, unit] of Object.entries(state.units || {})) {
      if (unit.ownerId !== myId || unit.type !== 'boat') continue;
      if (Math.hypot(wx - unit.x, wy - unit.y) <= 35) { hitOwnBoat = unit; break; }
    }
    if (hitOwnBoat && myGroundSel.length > 0) {
      const close = myGroundSel.filter(u => Math.hypot(u.x - hitOwnBoat.x, u.y - hitOwnBoat.y) <= 100);
      if (close.length > 0) {
        Network.embarkBoat(hitOwnBoat.id, close.map(u => u.id));
        this._showMoveIndicator(hitOwnBoat.x, hitOwnBoat.y, false);
        return;
      }
    }

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

    // Bâtiment ennemi → attaque (tolérance basée sur la taille visuelle réelle du bâtiment)
    const cfg = Network.getConfig();
    let hitEnemyBuilding = null;
    for (const b of (state.buildings || [])) {
      if (b.ownerId === myId) continue;
      const def = (cfg.buildingTypes || {})[b.type] || {};
      const eCfg = (typeof ENTITIES_CONFIG !== 'undefined') ? ENTITIES_CONFIG[b.type] : null;
      const scaleMult = (eCfg && eCfg.scale) || 2.0;
      // Tolérance = halfSize × scaleMult avec minimum 40px (clic généreux)
      const tol = Math.max(40, ((def.halfSize || 22) * scaleMult));
      if (Math.abs(wx - b.x) <= tol && Math.abs(wy - b.y) <= tol) { hitEnemyBuilding = b.id; break; }
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

  // Teinte de faction ADOUCIE : mélange la couleur vers le blanc pour que le
  // tint multiplicatif n'assombrisse pas le PNG (une couleur saturée comme le
  // rouge écrase les canaux verts/bleus). On garde le hue de l'équipe, en plus clair.
  _factionTint(colorInt) {
    const c = Phaser.Display.Color.IntegerToColor(colorInt);
    const m = 0.55; // 55 % vers le blanc
    const r = Math.round(c.red   + (255 - c.red)   * m);
    const g = Math.round(c.green + (255 - c.green) * m);
    const b = Math.round(c.blue  + (255 - c.blue)  * m);
    return (r << 16) | (g << 8) | b;
  }

  // Flash de coup encaissé : silhouette blanche brève (setTintFill) puis retour
  // à la teinte de faction. (Anciennement setFillStyle → cassé sur les Sprites.)
  _flashUnit(unitId) {
    const sprites = this.unitSprites[unitId];
    if (!sprites) return;
    const sprite = sprites[0];
    if (!sprite || !sprite.setTintFill) return;
    sprite._flashing = true;
    sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => {
      const s = this.unitSprites[unitId] && this.unitSprites[unitId][0];
      if (s && s.setTint) { s._flashing = false; s.setTint(s._factionColor != null ? s._factionColor : 0xffffff); }
    });
  }

  _flashHdv(playerId) {
    const sprites = this.hdvSprites[playerId];
    if (!sprites) return;
    const obj = sprites[0];
    if (!obj) return;
    if (obj.setTintFill) {
      obj.setTintFill(0xffffff);
      this.time.delayedCall(80, () => {
        const o = this.hdvSprites[playerId] && this.hdvSprites[playerId][0];
        if (o && o.setTint) o.setTint(o._factionColor != null ? o._factionColor : 0xffffff);
      });
    } else if (obj.setFillStyle) {
      const orig = obj.fillColor;
      obj.setFillStyle(0xffffff);
      this.time.delayedCall(80, () => {
        if (this.hdvSprites[playerId]) obj.setFillStyle(orig);
      });
    }
  }

  // Arc d'arme (croissant de lame) + étincelle d'impact pour la mêlée.
  _spawnWeaponArc(ax, ay, tx, ty, type) {
    const angle = Math.atan2(ty - ay, tx - ax);
    // Point de contact ~65% vers la cible
    const px = ax + (tx - ax) * 0.65;
    const py = ay + (ty - ay) * 0.65;
    const gold = (type === 'knight' || type === 'heavy_knight' || type === 'holy_knight'
               || type === 'general' || type === 'elite_guard' || type === 'god_avatar');
    const arc = this.add.sprite(px, py, 'slash')
      .setRotation(angle - 0.85).setDepth(56).setScale(0.7).setAlpha(0.95);
    if (gold) arc.setTint(0xfde047);
    this.tweens.add({
      targets: arc,
      rotation: angle + 0.85,
      scale: { from: 0.7, to: 1.25 },
      alpha: { from: 0.95, to: 0 },
      duration: 200, ease: 'Cubic.easeOut',
      onComplete: () => arc.destroy(),
    });
    // Étincelle d'impact sur la cible
    const spark = this.add.circle(tx, ty, 6, gold ? 0xfff3b0 : 0xffffff, 0.9).setDepth(57);
    this.tweens.add({
      targets: spark, scale: { from: 0.5, to: 2.2 }, alpha: { from: 0.9, to: 0 },
      duration: 180, onComplete: () => spark.destroy(),
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

  // Debris de destruction d'un bâtiment : éclats de pierre + bouffée de poussière
  _spawnBuildingDebris(x, y, size) {
    const chunks = Math.min(22, Math.max(10, Math.round(size / 5)));
    const debris = this.add.particles(x, y, 'particle', {
      tint: [0x6b5b4a, 0x4a3f33, 0x8a7960, 0xa6967c],
      speed: { min: 80, max: 220 },
      angle: { min: 0, max: 360 },
      scale: { start: size / 38, end: 0.1 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 500, max: 850 },
      gravityY: 320,
      rotate: { start: 0, end: 720 },
      emitting: false,
    }).setDepth(70);
    debris.explode(chunks);
    const dust = this.add.particles(x, y, 'particle', {
      tint: [0xd6c9b0, 0xb8a78c, 0xe5dcc7],
      speed: { min: 40, max: 130 },
      angle: { min: 180, max: 360 },
      scale: { start: size / 32, end: 0 },
      alpha: { start: 0.7, end: 0 },
      lifespan: 700,
      emitting: false,
    }).setDepth(68);
    dust.explode(Math.max(8, Math.round(chunks * 0.7)));
    this.time.delayedCall(1100, () => { debris.destroy(); dust.destroy(); });
  }

  // Poussière de construction (apparition d'un bâtiment)
  _spawnBuildPuff(x, y, size) {
    const n = Math.min(14, Math.max(6, Math.round(size / 8)));
    const emitter = this.add.particles(x, y, 'particle', {
      tint: [0xcbb89a, 0xa1887f, 0xe5e0d8],
      speed: { min: 30, max: 90 },
      angle: { min: 200, max: 340 },
      scale: { start: size / 55, end: 0 },
      alpha: { start: 0.7, end: 0 },
      lifespan: 450,
      gravityY: 80,
      emitting: false,
    }).setDepth(29);
    emitter.explode(n);
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

  // ── Animations d'attaque selon la catégorie d'unité ─────────────
  //   mêlée      : anticipation → lunge → recoil + arc d'arme
  //   distance   : draw → fire (puis projectile)
  //   caster     : channel → cast (puis projectile)
  _playAttackAnimation(attacker, tx, ty, attackerId) {
    const cfg = (typeof ENTITIES_CONFIG !== 'undefined') ? ENTITIES_CONFIG[attacker.type] : null;
    const sprite = (attackerId && this.unitSprites[attackerId]) ? this.unitSprites[attackerId][0] : null;
    const hasRig = (sprite && typeof Animations !== 'undefined');

    // DISTANCE / CASTER : projectile défini → l'anim déclenche le tir au bon moment
    if (cfg && cfg.projectile && this._hasAsset(cfg.projectile)) {
      const fire = () => {
        const ox = sprite ? sprite.x : attacker.x;
        const oy = sprite ? sprite.y : attacker.y;
        this._playProjectileAnim(ox, oy, tx, ty, cfg.projectile);
      };
      const isCaster = cfg.category === 'magic' || cfg.category === 'religion';
      if (hasRig && isCaster && Animations.animateCast) Animations.animateCast(this, sprite, tx, ty, fire);
      else if (hasRig && Animations.animateDraw)        Animations.animateDraw(this, sprite, tx, ty, fire);
      else fire();
      return;
    }

    // MÊLÉE : rig lunge + arc d'arme au moment de la frappe
    const strike = () => {
      const ox = sprite ? sprite.x : attacker.x;
      const oy = sprite ? sprite.y : attacker.y;
      this._spawnWeaponArc(ox, oy, tx, ty, attacker.type);
    };
    if (hasRig && Animations.animateMelee) Animations.animateMelee(this, sprite, tx, ty, strike);
    else strike();
  }

  // ── Projectile générique : sprite tourné vers la cible + anim arrivée ──
  _playProjectileAnim(sx, sy, tx, ty, projKey) {
    if (!this.textures.exists(projKey)) return; // sécurité
    const angle = Math.atan2(ty - sy, tx - sx);
    const dist  = Math.hypot(tx - sx, ty - sy);
    // Projectiles lourds = plus lents
    const HEAVY = new Set(['proj_catapult_rock', 'proj_cannonball', 'proj_dragon_breath']);
    const speed = HEAVY.has(projKey) ? 240 : 320; // px/s
    const duration = Math.max(150, Math.min(1200, (dist / speed) * 1000));

    // Taille cohérente : flèches/balles ~48px de long (lourds 56). Minimum 14px de
    // hauteur pour rester clairement visible.
    const targetLen = HEAVY.has(projKey) ? 56 : 48;
    // Depth 110 : AU-DESSUS du fog of war (depth 100) — sinon les projectiles
    // entre 2 unités ennemies dans le fog sont masqués par l'overlay noir
    const proj = this.add.sprite(sx, sy, projKey)
      .setRotation(angle).setDepth(110);
    let natW = 32, natH = 12;
    try {
      const tex = this.textures.get(projKey).getSourceImage();
      if (tex && tex.width)  natW = tex.width;
      if (tex && tex.height) natH = tex.height;
    } catch (_) {}
    const ratio = natH / natW;
    const finalH = Math.max(14, targetLen * ratio);
    proj.setDisplaySize(targetLen, finalH);

    if (typeof Animations !== 'undefined' && Animations.animateProjectile) {
      Animations.animateProjectile(this, proj, projKey);
    }

    // Traînée : émetteur de particules qui suit le projectile (couleur du type).
    const trailColor = PROJECTILE_COLORS[projKey] || 0xffffff;
    // Glow néon du projectile (API FX) — couleur thématique, halo discret
    if (proj.postFX) {
      try { proj.postFX.addGlow(trailColor, 4, 0, false, 0.1, 8); } catch (_) {}
    }
    const heavy = HEAVY.has(projKey);
    const trail = this.add.particles(0, 0, 'particle', {
      follow: proj,
      tint: trailColor,
      scale: { start: heavy ? 0.9 : 0.6, end: 0 },
      alpha: { start: 0.7, end: 0 },
      speed: 0,
      lifespan: heavy ? 320 : 200,
      frequency: 16,
      quantity: 1,
      blendMode: 'ADD',
    }).setDepth(109);

    this.tweens.add({
      targets: proj, x: tx, y: ty,
      duration, ease: 'Quad.easeOut',
      onComplete: () => {
        // Coupe l'émission + le suivi (le projectile va être détruit), laisse
        // les particules résiduelles s'éteindre.
        trail.stop();
        if (trail.stopFollow) trail.stopFollow();
        this.time.delayedCall(360, () => trail.destroy());

        // Flash d'impact + couleur thématique
        const impactColors = {
          proj_dark_orb: 0x9333ea, proj_holy_bolt: 0xfde047, proj_dragon_breath: 0xdc2626,
          proj_fireball_small: 0xf97316, proj_lightning: 0xfbbf24, proj_ice_shard: 0x60a5fa,
          proj_magic_bolt: 0x8b5cf6, proj_inquisitor_hammer: 0xfde68a, proj_divine_beam: 0xfef9c3,
        };
        const flashColor = impactColors[projKey] || trailColor;
        const flash = this.add.circle(tx, ty, heavy ? 22 : 16, flashColor, 0.85).setDepth(110);
        this.tweens.add({
          targets: flash, scale: { from: 0.5, to: heavy ? 2.4 : 1.8 }, alpha: { from: 0.85, to: 0 },
          duration: heavy ? 280 : 220, onComplete: () => flash.destroy(),
        });
        // Burst de particules d'impact (éclats colorés)
        const burst = this.add.particles(tx, ty, 'particle', {
          tint: flashColor,
          speed: { min: heavy ? 80 : 50, max: heavy ? 200 : 130 },
          scale: { start: heavy ? 0.9 : 0.6, end: 0 },
          alpha: { start: 0.9, end: 0 },
          lifespan: heavy ? 380 : 260,
          blendMode: 'ADD',
          emitting: false,
        }).setDepth(110);
        burst.explode(heavy ? 12 : 7);
        this.time.delayedCall(500, () => burst.destroy());
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
