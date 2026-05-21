// ════════════════════════════════════════════════════════════════════
// ENTITIES_CONFIG — source de vérité pour toutes les entités du jeu.
//
// Utilisé côté CLIENT (global window.ENTITIES_CONFIG via <script>)
//   et côté SERVEUR (require('./public/js/config/entitiesConfig')).
//
// Champs :
//   type        : 'unit' | 'building'
//   category    : 'science' | 'magic' | 'religion'
//   assetKey    : clé Phaser de la texture (= type si identique, sinon explicite)
//   scale       : facteur de scale visuel — 1.0 par défaut, ajusté via mode tuning
//   displaySize : taille d'affichage Phaser en px (setDisplaySize carré)
//   hp, dmg, speed, range, cost : stats gameplay (miroir de server.js UNIT_TYPES)
//   projectile  : clé asset du projectile lancé (units à distance)
//   aura        : { type, value, radius } — effets passifs de zone
//   special     : comportements serveur spéciaux (chaîne libre)
//   summoned    : true si invoquée (durée limitée)
//   lifetime    : durée de vie en ms (summoned seulement)
//   flying      : true si ignore obstacles au sol
//   boss        : true si unité "boss" (spawn spécial, anim dramatique)
//   bonusVs     : categories contre lesquelles les dégâts sont multipliés
//   bonusMultiplier : facteur de bonus (bonusVs)
//   regen       : HP/sec d'auto-régénération passive
//   generatesFaith : foi/sec passive générée par l'unité
//   deathExplosion  : { heal, radius } soin AoE à la mort
//   healAura    : { value, radius } soin passif de zone/sec
//   fearAura    : { slowPct, radius } ralentissement passif de zone
//   aoeRadius   : rayon AoE des attaques au contact
//   antiBuilding: true si dégâts bonifiés vs bâtiments
//   autoAttack  : { dmg, range, fireRate, projectile } (bâtiments défensifs)
//   manaGen     : mana/sec générée (bâtiments magiques)
//   faithGen    : foi/sec générée (bâtiments religion)
//   produces    : type d'unité que le bâtiment peut produire
// ════════════════════════════════════════════════════════════════════

const ENTITIES_CONFIG = {

  // ══════════════════════════════════════════════════════════════════
  // UNITÉS — AXE SCIENCE
  // ══════════════════════════════════════════════════════════════════

  soldier: {
    type: 'unit', category: 'science',
    assetKey: 'soldier',
    scale: 1.0, displaySize: 40,
    hp: 50, dmg: 5, speed: 80, range: 80, cost: 10,
  },

  archer: {
    type: 'unit', category: 'science',
    assetKey: 'archer',
    scale: 1.0, displaySize: 40,
    hp: 30, dmg: 4, speed: 80, range: 250, cost: 15,
    projectile: 'proj_arrow',
  },

  // Serveur : 'knight' — asset PNG : cavalry.png (héritage du nom)
  knight: {
    type: 'unit', category: 'science',
    assetKey: 'cavalry',
    scale: 1.0, displaySize: 48,
    hp: 80, dmg: 8, speed: 140, range: 55, cost: 25,
  },

  catapult: {
    type: 'unit', category: 'science',
    assetKey: 'catapult',
    scale: 1.0, displaySize: 52,
    hp: 70, dmg: 25, speed: 50, range: 220, cost: 60,
    projectile: 'proj_catapult_rock',
    antiBuilding: true,
  },

  settler: {
    type: 'unit', category: 'science',
    assetKey: 'soldier',        // pas d'asset dédié pour l'instant
    scale: 1.0, displaySize: 40,
    hp: 40, dmg: 0, speed: 100, range: 0, cost: 80,
  },

  heavy_knight: {
    type: 'unit', category: 'science',
    assetKey: 'heavy_knight',
    scale: 1.0, displaySize: 48,
    hp: 150, dmg: 12, speed: 100, range: 55, cost: 50,
  },

  crossbowman: {
    type: 'unit', category: 'science',
    assetKey: 'crossbowman',
    scale: 1.0, displaySize: 40,
    hp: 35, dmg: 7, speed: 75, range: 200, cost: 25,
    projectile: 'proj_crossbow_bolt',
  },

  general: {
    type: 'unit', category: 'science',
    assetKey: 'general',
    scale: 1.0, displaySize: 48,
    hp: 120, dmg: 10, speed: 110, range: 80, cost: 120,
    aura: { type: 'damage_boost', value: 0.25, radius: 200 },
  },

  cannon: {
    type: 'unit', category: 'science',
    assetKey: 'cannon',
    scale: 1.0, displaySize: 52,
    hp: 60, dmg: 35, speed: 40, range: 280, cost: 100,
    projectile: 'proj_cannonball',
  },

  elite_guard: {
    type: 'unit', category: 'science',
    assetKey: 'elite_guard',
    scale: 1.0, displaySize: 48,
    hp: 200, dmg: 20, speed: 110, range: 60, cost: 80,
  },

  // ══════════════════════════════════════════════════════════════════
  // UNITÉS — AXE MAGIE
  // ══════════════════════════════════════════════════════════════════

  // Serveur : 'wizard' — asset PNG : mage.png
  wizard: {
    type: 'unit', category: 'magic',
    assetKey: 'mage',
    scale: 1.0, displaySize: 40,
    hp: 40, dmg: 10, speed: 80, range: 200, cost: 50,
    projectile: 'proj_magic_bolt',
  },

  necromancer: {
    type: 'unit', category: 'magic',
    assetKey: 'necromancer',
    scale: 1.0, displaySize: 40,
    hp: 50, dmg: 6, speed: 80, range: 150, cost: 80,
    projectile: 'proj_dark_orb',
    // À chaque kill ennemi dans rayon 150 → spawn un skeleton allié (60s)
    special: 'resurrect_on_kill',
  },

  skeleton: {
    type: 'unit', category: 'magic',
    assetKey: 'skeleton',
    scale: 1.0, displaySize: 36,
    hp: 30, dmg: 5, speed: 80, range: 60, cost: 0,
    summoned: true, lifetime: 60000,
  },

  lich: {
    type: 'unit', category: 'magic',
    assetKey: 'lich',
    scale: 1.0, displaySize: 44,
    hp: 120, dmg: 15, speed: 80, range: 180, cost: 150,
    projectile: 'proj_dark_orb',
    // À chaque kill → spawn un skeleton_knight allié (60s)
    special: 'resurrect_knight_on_kill',
  },

  // Pas encore dans server.js — sera ajouté à l'étape 3
  skeleton_knight: {
    type: 'unit', category: 'magic',
    assetKey: 'skeleton_knight',
    scale: 1.0, displaySize: 44,
    hp: 60, dmg: 8, speed: 80, range: 35, cost: 0,
    summoned: true, lifetime: 60000,
  },

  fire_elemental: {
    type: 'unit', category: 'magic',
    assetKey: 'fire_elemental',
    scale: 1.0, displaySize: 52,
    hp: 250, dmg: 25, speed: 80, range: 50, cost: 0,
    summoned: true, lifetime: 60000,
    aoeRadius: 40,
  },

  arcane_dragon: {
    type: 'unit', category: 'magic',
    assetKey: 'arcane_dragon',
    scale: 1.0, displaySize: 80,
    hp: 800, dmg: 40, speed: 120, range: 250, cost: 0,
    projectile: 'proj_dragon_breath',
    summoned: true, lifetime: 60000,
    flying: true, boss: true,
  },

  // ══════════════════════════════════════════════════════════════════
  // UNITÉS — AXE RELIGION
  // ══════════════════════════════════════════════════════════════════

  pilgrim: {
    type: 'unit', category: 'religion',
    assetKey: 'pilgrim',
    scale: 1.0, displaySize: 40,
    hp: 40, dmg: 0, speed: 100, range: 0, cost: 20,
    generatesFaith: 0.5,
    // À la mort : soin AoE 200 HP dans rayon 100 sur les alliés
    deathExplosion: { heal: 200, radius: 100 },
  },

  inquisitor: {
    type: 'unit', category: 'religion',
    assetKey: 'inquisitor',
    scale: 1.0, displaySize: 40,
    hp: 60, dmg: 8, speed: 90, range: 90, cost: 30,
    projectile: 'proj_inquisitor_hammer',
    bonusVs: ['magic', 'undead'], bonusMultiplier: 2,
  },

  // Serveur : 'holy_knight' — asset PNG : paladin.png
  holy_knight: {
    type: 'unit', category: 'religion',
    assetKey: 'paladin',
    scale: 1.0, displaySize: 48,
    hp: 130, dmg: 14, speed: 110, range: 60, cost: 70,
    regen: 5,
  },

  // Pas encore dans server.js — sera ajouté à l'étape 3
  angel: {
    type: 'unit', category: 'religion',
    assetKey: 'angel',
    scale: 1.0, displaySize: 56,
    hp: 300, dmg: 20, speed: 100, range: 200, cost: 0,
    projectile: 'proj_holy_bolt',
    flying: true, summoned: true, lifetime: 90000,
    healAura: { value: 3, radius: 120 },
  },

  god_avatar: {
    type: 'unit', category: 'religion',
    assetKey: 'god_avatar',
    scale: 1.0, displaySize: 96,
    hp: 1500, dmg: 60, speed: 50, range: 80, cost: 0,
    summoned: true, lifetime: 999999,
    boss: true, aoeRadius: 60,
    fearAura: { slowPct: 0.5, radius: 400 },
  },

  // ══════════════════════════════════════════════════════════════════
  // BÂTIMENTS — AXE SCIENCE
  // ══════════════════════════════════════════════════════════════════

  // Serveur : 'tower' — asset PNG : tower_archer.png
  tower: {
    type: 'building', category: 'science',
    assetKey: 'tower_archer',
    scale: 1.0, displaySize: 48,
    hp: 250, cost: 60,
    autoAttack: { dmg: 6, range: 220, fireRate: 1100, projectile: 'proj_arrow' },
  },

  wall: {
    type: 'building', category: 'science',
    assetKey: 'wall',              // pas d'asset PNG dédié
    scale: 1.0, displaySize: 50,
    hp: 500, cost: 25,
  },

  // Pas encore dans server.js — à wirer à l'étape 3
  bombard_tower: {
    type: 'building', category: 'science',
    assetKey: 'bombard_tower',
    scale: 1.0, displaySize: 52,
    hp: 350, cost: 120,
    autoAttack: { dmg: 18, range: 280, fireRate: 3000, projectile: 'proj_cannonball' },
  },

  citadel: {
    type: 'building', category: 'science',
    assetKey: 'citadel',
    scale: 1.0, displaySize: 64,
    hp: 2000, cost: 300,
    autoAttack: { dmg: 10, range: 200, fireRate: 1200, projectile: 'proj_arrow' },
    hdvUpgrade: true,
  },

  port: {
    type: 'building', category: 'science',
    assetKey: 'port',
    scale: 1.0, displaySize: 56,
    hp: 300, cost: 150,
    produces: 'boat',
  },

  boat: {
    type: 'unit', category: 'science',
    assetKey: 'boat',
    scale: 1.0, displaySize: 60,
    hp: 100, dmg: 0, speed: 100, range: 0, cost: 80,
    water: true,
  },

  // ══════════════════════════════════════════════════════════════════
  // BÂTIMENTS — AXE MAGIE
  // ══════════════════════════════════════════════════════════════════

  sanctum: {
    type: 'building', category: 'magic',
    assetKey: 'sanctum',
    scale: 1.0, displaySize: 48,
    hp: 200, cost: 50,
    manaGen: 0.5,
  },

  mage_tower: {
    type: 'building', category: 'magic',
    assetKey: 'tower_mage',
    scale: 1.0, displaySize: 52,
    hp: 250, cost: 90,
    manaGen: 1,
    produces: 'wizard',
  },

  // ══════════════════════════════════════════════════════════════════
  // BÂTIMENTS — AXE RELIGION
  // ══════════════════════════════════════════════════════════════════

  altar: {
    type: 'building', category: 'religion',
    assetKey: 'altar',
    scale: 1.0, displaySize: 44,
    hp: 200, cost: 40,
    faithGen: 0.5,
  },

  temple: {
    type: 'building', category: 'religion',
    assetKey: 'temple',
    scale: 1.0, displaySize: 56,
    hp: 350, cost: 110,
    faithGen: 1.5,
  },

  cathedral: {
    type: 'building', category: 'religion',
    assetKey: 'cathedral',
    scale: 1.0, displaySize: 64,
    hp: 500, cost: 220,
    faithGen: 3,
  },
};

// ── Compat Node.js (require) + browser global ─────────────────────
// Le fichier est chargé via <script> côté client → ENTITIES_CONFIG est global.
// Le serveur le charge via require() → module.exports.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ENTITIES_CONFIG };
}
