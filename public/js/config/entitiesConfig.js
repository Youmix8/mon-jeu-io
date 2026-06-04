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
//   fallbackAssetKey : clé d'asset à utiliser si l'assetKey est un placeholder
//                      (pour réutiliser visuellement soldier/archer/cavalry)
//   scale       : facteur de scale visuel — soldier=2.0 référence
//                 Plus gros : boss, unités lourdes ; plus petit : invocations légères
//   displaySize : taille d'affichage Phaser en px (setDisplaySize carré)
//   hp, dmg, speed, range, cost : stats gameplay (miroir de server.js UNIT_TYPES)
//   projectile  : clé asset du projectile lancé (units à distance)
//   aura, special, summoned, lifetime, flying, boss, bonusVs, regen, etc.
// ════════════════════════════════════════════════════════════════════

const ENTITIES_CONFIG = {

  // ══════════════════════════════════════════════════════════════════
  // UNITÉS — AXE SCIENCE
  // ══════════════════════════════════════════════════════════════════

  // Référence — scale 2.0 = base de comparaison
  soldier: {
    type: 'unit', category: 'science',
    assetKey: 'soldier',
    scale: 2.0, displaySize: 40,
    hp: 50, dmg: 5, speed: 80, range: 80, cost: 10,
  },

  archer: {
    type: 'unit', category: 'science',
    assetKey: 'archer',
    scale: 2.0, displaySize: 40,
    hp: 30, dmg: 4, speed: 80, range: 250, cost: 15,
    projectile: 'proj_arrow',
  },

  // Serveur : 'knight' — asset PNG : cavalry.png
  knight: {
    type: 'unit', category: 'science',
    assetKey: 'cavalry',
    scale: 2.2, displaySize: 48,
    hp: 80, dmg: 8, speed: 140, range: 55, cost: 25,
  },

  catapult: {
    type: 'unit', category: 'science',
    assetKey: 'catapult', fallbackAssetKey: 'cavalry',
    scale: 2.4, displaySize: 52,
    hp: 70, dmg: 25, speed: 50, range: 220, cost: 60,
    projectile: 'proj_catapult_rock',
    antiBuilding: true,
  },

  settler: {
    type: 'unit', category: 'science',
    assetKey: 'soldier',
    scale: 1.8, displaySize: 40,
    hp: 40, dmg: 0, speed: 100, range: 0, cost: 80,
  },

  heavy_knight: {
    type: 'unit', category: 'science',
    assetKey: 'heavy_knight', fallbackAssetKey: 'cavalry',
    scale: 2.4, displaySize: 48,
    hp: 150, dmg: 12, speed: 100, range: 55, cost: 50,
  },

  crossbowman: {
    type: 'unit', category: 'science',
    assetKey: 'crossbowman', fallbackAssetKey: 'archer',
    scale: 2.0, displaySize: 40,
    hp: 35, dmg: 7, speed: 75, range: 200, cost: 25,
    projectile: 'proj_crossbow_bolt',
  },

  general: {
    type: 'unit', category: 'science',
    assetKey: 'general', fallbackAssetKey: 'soldier',
    scale: 2.3, displaySize: 48,
    hp: 120, dmg: 10, speed: 110, range: 80, cost: 120,
    aura: { type: 'damage_boost', value: 0.25, radius: 200 },
  },

  cannon: {
    type: 'unit', category: 'science',
    assetKey: 'cannon', fallbackAssetKey: 'cavalry',
    scale: 2.4, displaySize: 52,
    hp: 60, dmg: 35, speed: 40, range: 280, cost: 100,
    projectile: 'proj_cannonball',
  },

  elite_guard: {
    type: 'unit', category: 'science',
    assetKey: 'elite_guard', fallbackAssetKey: 'soldier',
    scale: 2.3, displaySize: 48,
    hp: 200, dmg: 20, speed: 110, range: 60, cost: 80,
  },

  // ══════════════════════════════════════════════════════════════════
  // UNITÉS — AXE MAGIE
  // ══════════════════════════════════════════════════════════════════

  // Serveur : 'wizard' — asset PNG : mage.png
  wizard: {
    type: 'unit', category: 'magic',
    assetKey: 'mage', fallbackAssetKey: 'archer',
    scale: 2.0, displaySize: 40,
    hp: 40, dmg: 10, speed: 80, range: 200, cost: 50,
    projectile: 'proj_magic_bolt',
  },

  necromancer: {
    type: 'unit', category: 'magic',
    assetKey: 'necromancer', fallbackAssetKey: 'archer',
    scale: 2.1, displaySize: 40,
    hp: 50, dmg: 6, speed: 80, range: 150, cost: 80,
    projectile: 'proj_dark_orb',
    special: 'resurrect_on_kill',
  },

  skeleton: {
    type: 'unit', category: 'magic',
    assetKey: 'skeleton', fallbackAssetKey: 'soldier',
    scale: 1.7, displaySize: 36,
    hp: 30, dmg: 5, speed: 80, range: 60, cost: 0,
    summoned: true, lifetime: 60000,
  },

  lich: {
    type: 'unit', category: 'magic',
    assetKey: 'lich', fallbackAssetKey: 'archer',
    scale: 2.3, displaySize: 44,
    hp: 120, dmg: 15, speed: 80, range: 180, cost: 150,
    projectile: 'proj_dark_orb',
    special: 'resurrect_knight_on_kill',
  },

  skeleton_knight: {
    type: 'unit', category: 'magic',
    assetKey: 'skeleton_knight', fallbackAssetKey: 'cavalry',
    scale: 2.1, displaySize: 44,
    hp: 60, dmg: 8, speed: 80, range: 35, cost: 0,
    summoned: true, lifetime: 60000,
  },

  fire_elemental: {
    type: 'unit', category: 'magic',
    assetKey: 'fire_elemental', fallbackAssetKey: 'soldier',
    scale: 2.8, displaySize: 52,
    hp: 250, dmg: 25, speed: 80, range: 50, cost: 0,
    summoned: true, lifetime: 60000,
    aoeRadius: 40,
  },

  arcane_dragon: {
    type: 'unit', category: 'magic',
    assetKey: 'arcane_dragon', fallbackAssetKey: 'cavalry',
    scale: 3.5, displaySize: 80,
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
    assetKey: 'pilgrim', fallbackAssetKey: 'soldier',
    scale: 1.0, displaySize: 40,
    hp: 40, dmg: 0, speed: 100, range: 0, cost: 20,
    generatesFaith: 0.5,
    deathExplosion: { heal: 200, radius: 100 },
  },

  inquisitor: {
    type: 'unit', category: 'religion',
    assetKey: 'inquisitor', fallbackAssetKey: 'soldier',
    scale: 1.0, displaySize: 40,
    hp: 60, dmg: 8, speed: 90, range: 90, cost: 30,
    projectile: 'proj_inquisitor_hammer',
    bonusVs: ['magic', 'undead'], bonusMultiplier: 2,
  },

  // Serveur : 'holy_knight' — asset PNG : paladin.png
  holy_knight: {
    type: 'unit', category: 'religion',
    assetKey: 'paladin', fallbackAssetKey: 'cavalry',
    scale: 1.0, displaySize: 48,
    hp: 130, dmg: 14, speed: 110, range: 60, cost: 70,
    regen: 5,
  },

  angel: {
    type: 'unit', category: 'religion',
    assetKey: 'angel', fallbackAssetKey: 'archer',
    scale: 1.3, displaySize: 56,
    hp: 300, dmg: 20, speed: 100, range: 200, cost: 0,
    projectile: 'proj_holy_bolt',
    flying: true, summoned: true, lifetime: 90000,
    healAura: { value: 3, radius: 120 },
  },

  god_avatar: {
    type: 'unit', category: 'religion',
    assetKey: 'god_avatar', fallbackAssetKey: 'cavalry',
    scale: 2.3, displaySize: 96,
    hp: 1500, dmg: 60, speed: 50, range: 80, cost: 0,
    summoned: true, lifetime: 999999,
    boss: true, aoeRadius: 60,
    fearAura: { slowPct: 0.5, radius: 400 },
  },

  // ══════════════════════════════════════════════════════════════════
  // BÂTIMENTS — AXE SCIENCE
  // ══════════════════════════════════════════════════════════════════

  tower: {
    type: 'building', category: 'science',
    assetKey: 'tower_archer',
    scale: 3.0, displaySize: 48,
    hp: 250, cost: 60,
    autoAttack: { dmg: 6, range: 220, fireRate: 1100, projectile: 'proj_arrow' },
  },

  wall: {
    type: 'building', category: 'science',
    assetKey: 'wall',
    scale: 2.0, displaySize: 50,
    hp: 500, cost: 25,
  },

  bombard_tower: {
    type: 'building', category: 'science',
    assetKey: 'bombard_tower',
    scale: 2.2, displaySize: 52,
    hp: 350, cost: 120,
    autoAttack: { dmg: 18, range: 280, fireRate: 3000, projectile: 'proj_cannonball' },
  },

  citadel: {
    type: 'building', category: 'science',
    assetKey: 'citadel',
    scale: 2.6, displaySize: 64,
    hp: 2000, cost: 300,
    autoAttack: { dmg: 10, range: 200, fireRate: 1200, projectile: 'proj_arrow' },
    hdvUpgrade: true,
  },

  // port / boat retirés (système eau supprimé).

  // ══════════════════════════════════════════════════════════════════
  // BÂTIMENTS — AXE MAGIE
  // ══════════════════════════════════════════════════════════════════

  sanctum: {
    type: 'building', category: 'magic',
    assetKey: 'sanctum',
    scale: 2.0, displaySize: 48,
    hp: 200, cost: 50,
    manaGen: 0.5,
  },

  mage_tower: {
    type: 'building', category: 'magic',
    assetKey: 'tower_mage',
    scale: 2.2, displaySize: 52,
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
    scale: 2.0, displaySize: 44,
    hp: 200, cost: 40,
    faithGen: 0.5,
  },

  temple: {
    type: 'building', category: 'religion',
    assetKey: 'temple',
    scale: 2.4, displaySize: 56,
    hp: 350, cost: 110,
    faithGen: 1.5,
  },

  cathedral: {
    type: 'building', category: 'religion',
    assetKey: 'cathedral',
    scale: 2.8, displaySize: 64,
    hp: 500, cost: 220,
    faithGen: 3,
  },
};

// ── Compat Node.js (require) + browser global ─────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ENTITIES_CONFIG };
}
