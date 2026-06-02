const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { TECH_TREE: NEW_TECH_TREE, validateTechTree } = require('./server/techTree');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

validateTechTree();

// Tailles de map disponibles (configurable depuis le lobby)
const MAP_SIZES = {
  small:  { width: 3000, height: 3000, villageMin: 6,  villageMax: 10 },
  medium: { width: 4500, height: 4500, villageMin: 10, villageMax: 16 },
  large:  { width: 6000, height: 6000, villageMin: 16, villageMax: 24 },
};
const DEFAULT_MAP_TYPE = 'continental'; // 'no_water' | 'lakes' | 'continental' | 'island'
const DEFAULT_MAP_SIZE = 'medium';

// Variables courantes (initialisées dans regenerateMap, peuvent changer entre parties)
let MAP_WIDTH  = MAP_SIZES[DEFAULT_MAP_SIZE].width;
let MAP_HEIGHT = MAP_SIZES[DEFAULT_MAP_SIZE].height;
let currentMapType = DEFAULT_MAP_TYPE;
let currentMapSize = DEFAULT_MAP_SIZE;

const MAX_PLAYERS = 4;
const GOLD_PER_SECOND = 1;
const UNIT_RADIUS = 15;
const TICK_RATE   = 20;
const TICK_MS     = 1000 / TICK_RATE;
const ATTACK_COOLDOWN_MS = 1000;
const HDV_HALF_SIZE      = 60;
const LOOK_AHEAD         = 60;
const AVOID_BUFFER       = 25;
const AVOID_STRENGTH     = 1.8;
const SPAWN_MARGIN       = 500;   // distance min HDV ↔ bord
const MIN_SPAWN_DIST     = 1500;  // distance min HDV ↔ HDV
const SPAWN_MAX_ATTEMPTS = 500;

// Fog of war — grille de tuiles pour calculer la visibilité
const TILE_SIZE   = 50;
const BUILD_GRID  = TILE_SIZE; // alias : la grille de construction = la grille du fog

// Snap des coordonnées du monde au centre de la case de construction la plus proche
function snapToGrid(x, y) {
  return {
    x: Math.floor(x / BUILD_GRID) * BUILD_GRID + BUILD_GRID / 2,
    y: Math.floor(y / BUILD_GRID) * BUILD_GRID + BUILD_GRID / 2,
  };
}
let   GRID_W      = MAP_WIDTH  / TILE_SIZE;   // recalculé dans applyMapConfig()
let   GRID_H      = MAP_HEIGHT / TILE_SIZE;
const VISION_UNIT = 240;

// ────────── Tech tree, types d'unités, niveaux HDV ──────────

// Système de population : chaque unité occupe un nombre de "places" de pop.
// Le total ne peut dépasser le populationMax du joueur (calculé via HDV+villages).
// Les boss (dragon, god_avatar) coûtent 10-15 → on n'en a qu'1-2 par partie max.

const UNIT_TYPES = {
  // Unité de base — toujours disponible
  soldier:       { id: 'soldier',       name: 'Soldat',          cost: 10,  manaCost: 0,  faithCost: 0,  populationCost: 1,  hp: 50,  speed:  80, range:  35, damage:  5,  requiresTech: null,
                   icon: '⚔️', desc: 'Polyvalent. Disponible dès le départ.' },
  // Unités Science Tier 2-6
  archer:        { id: 'archer',        name: 'Archer',          cost: 18,  manaCost: 0,  faithCost: 0,  populationCost: 1,  hp: 30,  speed:  80, range: 250, damage:  4,  requiresTech: 'archery',
                   icon: '🏹', desc: 'Longue portée mais fragile.' },
  knight:        { id: 'knight',        name: 'Chevalier',       cost: 30,  manaCost: 0,  faithCost: 0,  populationCost: 2,  hp: 80,  speed: 140, range:  35, damage:  8,  requiresTech: 'riding',
                   icon: '🐎', desc: 'Lourd et rapide, gros dégâts au contact.' },
  catapult:      { id: 'catapult',      name: 'Catapulte',       cost: 70,  manaCost: 0,  faithCost: 0,  populationCost: 3,  hp: 70,  speed:  50, range: 220, damage: 25,  requiresTech: 'siege_engineering',
                   icon: '⚙️', desc: 'Lente, dégâts massifs sur bâtiments.' },
  settler:       { id: 'settler',       name: 'Colon',           cost: 90,  manaCost: 0,  faithCost: 0,  populationCost: 2,  hp: 40,  speed: 100, range:   0, damage:  0,  requiresTech: 'colonization',
                   icon: '🚩', desc: 'Fonde un village au point de destination.' },
  heavy_knight:  { id: 'heavy_knight',  name: 'Chevalier lourd', cost: 60,  manaCost: 0,  faithCost: 0,  populationCost: 2,  hp: 150, speed: 100, range:  35, damage: 12,  requiresTech: 'steel_forge',
                   icon: '🛡', desc: 'Tank lourd, gros dégâts au contact.' },
  crossbowman:   { id: 'crossbowman',   name: 'Arbalétrier',     cost: 30,  manaCost: 0,  faithCost: 0,  populationCost: 1,  hp: 35,  speed:  75, range: 200, damage:  7,  requiresTech: 'crossbows',
                   icon: '🎯', desc: 'Archer amélioré. Plus de dégâts, moins de portée.' },
  general:       { id: 'general',       name: 'Général',         cost: 140,  manaCost: 0,  faithCost: 0,  populationCost: 3, hp: 120, speed: 110, range:  40, damage: 10,  requiresTech: 'war_academy',
                   icon: '🎖', desc: 'Aura +25% dégâts aux unités proches (rayon 200).' },
  cannon:        { id: 'cannon',        name: 'Canon',           cost: 120,  manaCost: 0,  faithCost: 0,  populationCost: 3, hp: 60,  speed:  40, range: 280, damage: 35,  requiresTech: 'gunpowder',
                   icon: '💣', desc: 'Très lent, dégâts énormes à longue portée.' },
  elite_guard:   { id: 'elite_guard',   name: 'Garde d\'élite',  cost: 100, manaCost: 0,  faithCost: 0,  populationCost: 3,  hp: 200, speed: 110, range:  35, damage: 20,  requiresTech: 'renaissance',
                   icon: '👑', desc: 'L\'élite militaire. Le meilleur soldat du jeu.' },
  // Unités Magie
  wizard:        { id: 'wizard',        name: 'Sorcier',         cost: 50,  manaCost: 30,  faithCost: 0,  populationCost: 1,  hp: 40,  speed:  80, range: 200, damage: 10,  requiresTech: 'mage_tower',
                   icon: '🧙', desc: 'Dégâts magiques à distance, ignore les armures.' },
  necromancer:   { id: 'necromancer',   name: 'Nécromancien',    cost: 80,  manaCost: 50,  faithCost: 0,  populationCost: 2,  hp: 50,  speed:  80, range: 150, damage:  6,  requiresTech: 'necromancy',
                   icon: '💀', desc: 'Attaque magique à distance. (Résurrection : à venir.)' },
  skeleton:      { id: 'skeleton',      name: 'Squelette',       cost: 15,  manaCost: 10,  faithCost: 0,  populationCost: 1,   hp: 30,  speed:  80, range:  30, damage:  5,  requiresTech: null,
                   icon: '☠️', desc: 'Invoqué par le Nécromancien. Durée 60s.' },
  lich:          { id: 'lich',          name: 'Liche',           cost: 150,  manaCost: 80,  faithCost: 0,  populationCost: 4, hp: 120, speed:  80, range: 180, damage: 15,  requiresTech: 'lich',
                   icon: '☠️', desc: 'Nécromancien suprême : longue portée + dégâts massifs.' },
  // Unités Religion
  pilgrim:       { id: 'pilgrim',       name: 'Pèlerin',         cost: 20,  manaCost: 0,  faithCost: 10,  populationCost: 1,  hp: 40,  speed: 100, range:   0, damage:  0,  requiresTech: 'pilgrimage',
                   icon: '🚶', desc: 'Ne combat pas. +0.5 foi/sec à son propriétaire.' },
  inquisitor:    { id: 'inquisitor',    name: 'Inquisiteur',     cost: 30,  manaCost: 0,  faithCost: 15,  populationCost: 2,  hp: 60,  speed:  90, range:  90, damage:  8,  requiresTech: 'inquisition',
                   icon: '🗡', desc: 'Double dégâts vs unités magiques/undead.' },
  holy_knight:   { id: 'holy_knight',   name: 'Chevalier sacré', cost: 70,  manaCost: 0,  faithCost: 30,  populationCost: 2,  hp: 130, speed: 110, range:  35, damage: 14,  requiresTech: 'sacred_order',
                   icon: '🛡', desc: 'Combattant sacré. +5 HP/sec auto-regen.' },
  // ── Nouvelles unités étape 3 (summoned/boss) ──
  skeleton_knight: { id: 'skeleton_knight', name: 'Cavalier squelette', cost: 30,  manaCost: 15,  faithCost: 0,  populationCost: 2, hp: 60, speed: 80, range: 35, damage: 8, requiresTech: null,
                     icon: '☠️', desc: 'Invoqué par la Liche au kill. Durée 60s.' },
  fire_elemental:  { id: 'fire_elemental',  name: 'Élémentaire de feu', cost: 100,  manaCost: 60,  faithCost: 0,  populationCost: 5, hp: 250, speed: 80, range: 40, damage: 25, requiresTech: null,
                     icon: '🔥', desc: 'Invocation. AoE rayon 40. Durée 60s.' },
  arcane_dragon:   { id: 'arcane_dragon',   name: 'Dragon arcanique',   cost: 250,  manaCost: 150,  faithCost: 0,  populationCost: 10, hp: 800, speed: 120, range: 250, damage: 40, requiresTech: null,
                     icon: '🐲', desc: 'Boss invoqué. Vole. Durée 60s.' },
  angel:           { id: 'angel',           name: 'Ange',               cost: 100,  manaCost: 0,  faithCost: 70,  populationCost: 6, hp: 300, speed: 100, range: 200, damage: 20, requiresTech: null,
                     icon: '👼', desc: 'Vole. Aura soin +3 HP/s rayon 120. Durée 90s.' },
  god_avatar:      { id: 'god_avatar',      name: 'Avatar divin',       cost: 250,  manaCost: 0,  faithCost: 150,  populationCost: 15, hp: 1500, speed: 50, range: 60, damage: 60, requiresTech: null,
                     icon: '🌟', desc: 'Boss. Aura peur (ennemis ralentis 50% rayon 400). AoE 60.' },
  // Bateau : se déplace UNIQUEMENT sur l'eau, produit depuis un Port
  boat:            { id: 'boat',            name: 'Bateau',             cost: 90,  manaCost: 0,  faithCost: 0,  populationCost: 1, hp: 100, speed: 100, range: 0,  damage: 0, requiresTech: 'marine',
                     icon: '⛵', desc: 'Va sur l\'eau uniquement. Produit depuis un Port.' },
};

// Unités invoquées : durée de vie ms (mortes après expiration)
const SUMMONED_LIFETIMES = {
  skeleton: 60000,
  skeleton_knight: 60000,
  fire_elemental: 60000,
  arcane_dragon: 60000,
  angel: 90000,
  god_avatar: 999999,
};

// Compat ancien système : ces 4 clés étaient utilisées dans le code legacy.
// On les garde vides pour pas tout casser ; la vraie source = NEW_TECH_TREE.
const TECH_TREE = {};

// hdvLevel 1 = état de départ
// goldPerSec : taux de gold passif de l'HDV à ce niveau
// buildRadius : rayon de la zone constructible (plus petit que la vision)
const HDV_LEVELS = [
  { level: 1, maxHp: 1000, vision: 340, upgradeCost:   50, goldPerSec: 1, buildRadius: 240 },
  { level: 2, maxHp: 1200, vision: 380, upgradeCost:  150, goldPerSec: 2, buildRadius: 280 },
  { level: 3, maxHp: 1400, vision: 420, upgradeCost:  350, goldPerSec: 3, buildRadius: 320 },
  { level: 4, maxHp: 1600, vision: 460, upgradeCost:  700, goldPerSec: 4, buildRadius: 360 },
  { level: 5, maxHp: 1800, vision: 500, upgradeCost: null, goldPerSec: 5, buildRadius: 400 }, // max
];

const MAX_HDV_LEVEL = HDV_LEVELS.length;

// ────────── Bâtiments constructibles ──────────
const BUILDING_TYPES = {
  tower: {
    id: 'tower', name: 'Tour d\'archer', icon: '🏹',
    cost: 60, hp: 250,
    range: 220, damage: 6, cooldownMs: 1100,
    halfSize: 22, // pour hitbox
    desc: 'Tire automatiquement les ennemis à portée.',
  },
  wall: {
    id: 'wall', name: 'Rempart', icon: '🧱',
    cost: 25, hp: 500,
    range: 0, damage: 0, cooldownMs: 0,
    halfSize: 25,
    desc: 'Mur solide. Bloque le passage, pas d\'attaque.',
  },
  bombard_tower: {
    id: 'bombard_tower', name: 'Tour à bombarde', icon: '💣',
    cost: 120, hp: 350,
    range: 280, damage: 18, cooldownMs: 3000,
    halfSize: 26,
    requiresTech: 'gunpowder',
    desc: 'Tour lourde longue portée. Dégâts massifs, cadence lente.',
  },
  port: {
    id: 'port', name: 'Port', icon: '⚓',
    cost: 150, hp: 300,
    range: 0, damage: 0, cooldownMs: 0,
    halfSize: 28,
    requiresTech: 'marine',
    desc: 'Permet de produire des bateaux. Nécessaire pour la voie maritime.',
  },
  // ── Magie ──
  sanctum: {
    id: 'sanctum', name: 'Sanctum', icon: '🔮',
    cost: 50, hp: 200,
    range: 0, damage: 0, cooldownMs: 0,
    halfSize: 24,
    requiresTech: 'elements_study',
    desc: '+0.5 mana/sec. Source magique.',
  },
  mage_tower: {
    id: 'mage_tower', name: 'Tour de mage', icon: '🧙',
    cost: 90, hp: 250,
    range: 0, damage: 0, cooldownMs: 0,
    halfSize: 26,
    requiresTech: 'mage_tower',
    desc: '+1 mana/sec. Permet de produire des Sorciers.',
  },
  // ── Religion ──
  altar: {
    id: 'altar', name: 'Autel', icon: '🕯',
    cost: 40, hp: 200,
    range: 0, damage: 0, cooldownMs: 0,
    halfSize: 22,
    requiresTech: 'animism',
    desc: '+0.5 foi/sec.',
  },
  temple: {
    id: 'temple', name: 'Temple', icon: '⛩',
    cost: 110, hp: 350,
    range: 0, damage: 0, cooldownMs: 0,
    halfSize: 28,
    requiresTech: 'temple',
    desc: '+1.5 foi/sec. Upgrade de l\'Autel.',
  },
  cathedral: {
    id: 'cathedral', name: 'Cathédrale', icon: '⛪',
    cost: 220, hp: 500,
    range: 0, damage: 0, cooldownMs: 0,
    halfSize: 32,
    requiresTech: 'cathedral',
    desc: '+3 foi/sec. Foi doublée.',
  },
};

const BUILDING_MIN_DIST     = 60;  // distance min entre 2 bâtiments
const BUILDING_MIN_DIST_HDV = 70;  // distance min HDV / village ↔ bâtiment
const MAX_UNIT_BATCH        = 500; // cap d'unités par appel moveUnits/attackTarget/defendArea (anti-cheat)

// ────────── Sorts actifs (axe Magie) ──────────
const SPELLS = {
  // ── Magie (mana) ──
  fireball: {
    id: 'fireball', name: 'Boule de feu', icon: '🔥',
    type: 'aoe_damage', costType: 'mana',
    cost: 30,
    radius: 80, damage: 30,
    requiresTech: 'pyromancy',
    hotkey: 'F',
    desc: 'AoE 80, 30 dmg, 30 mana.',
  },
  freeze: {
    id: 'freeze', name: 'Gel', icon: '❄️',
    type: 'aoe_slow', costType: 'mana',
    cost: 25,
    radius: 90, durationMs: 5000, slowFactor: 0.3,
    requiresTech: 'cryomancy',
    hotkey: 'G',
    desc: 'AoE 90, ralentit 70% pendant 5s, 25 mana.',
  },
  // ── Religion (foi) ──
  blessing: {
    id: 'blessing', name: 'Bénédiction', icon: '✝️',
    type: 'aoe_heal', costType: 'faith',
    cost: 30,
    radius: 140, heal: 50,
    requiresTech: 'blessing',
    hotkey: 'H',
    desc: 'AoE 140, +50 HP instantanés à tes unités, 30 foi.',
  },
  purifying_light: {
    id: 'purifying_light', name: 'Lumière purificatrice', icon: '🌟',
    type: 'aoe_purify', costType: 'faith',
    cost: 25,
    radius: 110, damage: 15, magicMult: 3, // ×3 dmg vs magie/undead
    requiresTech: 'purifying_light',
    hotkey: 'J',
    desc: 'AoE 110, 15 dmg (×3 vs magie/undead), 25 foi.',
  },
  // ── Sorts d'invocation (étape branchement arbre tech) ──
  summon_elemental: {
    id: 'summon_elemental', name: 'Convocation élémentaire', icon: '🌋',
    type: 'summon_unit', costType: 'mana',
    cost: 80, unitType: 'fire_elemental',
    requiresTech: 'elemental_summon',
    desc: 'Invoque un Élémentaire de feu (60s, 250 HP).',
  },
  summon_angel: {
    id: 'summon_angel', name: 'Ange gardien', icon: '👼',
    type: 'summon_unit', costType: 'faith',
    cost: 100, unitType: 'angel',
    requiresTech: 'guardian_angel',
    desc: 'Invoque un Ange (90s, 300 HP, aura soin alliés).',
  },
  arcane_dragon: {
    id: 'arcane_dragon', name: 'Avatar des Arcanes', icon: '🐲',
    type: 'summon_unit', costType: 'mana',
    cost: 150, unitType: 'arcane_dragon',
    requiresTech: 'arcane_avatar',
    oncePerMatch: true,
    desc: 'Invoque le Dragon arcanique (1× par partie, 60s, 800 HP).',
  },
  divine_avatar: {
    id: 'divine_avatar', name: 'Avatar divin', icon: '🌟',
    type: 'summon_unit', costType: 'faith',
    cost: 200, unitType: 'god_avatar',
    requiresTech: 'divine_invocation',
    oncePerMatch: true,
    desc: 'Invoque l\'Avatar du Dieu (1× par partie, 1500 HP, aura peur).',
  },
};

// Unités "magie/undead" (cibles bonus de Lumière purificatrice + Inquisiteur)
const MAGIC_UNDEAD = new Set(['wizard', 'necromancer', 'lich', 'skeleton', 'skeleton_knight', 'fire_elemental', 'arcane_dragon']);
// Unités "religion" pour aura d'excommunication (religion_curse_aura)
const RELIGION_UNITS = new Set(['holy_knight', 'inquisitor', 'pilgrim', 'paladin', 'angel', 'god_avatar']);

// ────────── Villages neutres (modèle Polytopia : base secondaire conquérable) ──────────
const VILLAGE_RADIUS         = 70;              // rayon de capture
const VILLAGE_CAPTURE_TICKS  = 10 * TICK_RATE;  // 10 s à 20 Hz = 200 ticks
const VILLAGE_MIN_DIST_HDV   = 700;
const VILLAGE_MIN_DIST_OTHER = 600;
const VILLAGE_COUNT_MIN      = 10;
const VILLAGE_COUNT_MAX      = 16;
const VILLAGE_MAX_HP         = 300;             // PV du village (peut être détruit)
const VILLAGE_GOLD_PER_SEC   = 0.5;             // gold passif au propriétaire
const VILLAGE_HALF_SIZE      = 50;              // pour collisions / hitbox attaque
const VILLAGE_VISION         = 220;             // vision donnée au propriétaire
const VILLAGE_UPGRADE_COST   = 150;             // coût Lv1 → Lv2 (multiplié par niveau)

// 5 niveaux de village. Chaque niveau : +rayon de construction, +HP max, +gold/s,
// vision augmentée. Le upgradeCost croît : Lv1→2=150, Lv2→3=300, Lv3→4=500, Lv4→5=800
const VILLAGE_LEVELS = [
  { level: 1, allowedUnits: ['soldier'],        goldPerSec: 0.5, buildRadius: 160, maxHp: 300, vision: 220, upgradeCost: 150,  name: 'Hameau' },
  { level: 2, allowedUnits: 'all',              goldPerSec: 1.0, buildRadius: 220, maxHp: 400, vision: 260, upgradeCost: 300,  name: 'Village' },
  { level: 3, allowedUnits: 'all',              goldPerSec: 1.5, buildRadius: 280, maxHp: 550, vision: 300, upgradeCost: 500,  name: 'Bourg' },
  { level: 4, allowedUnits: 'all',              goldPerSec: 2.0, buildRadius: 340, maxHp: 750, vision: 340, upgradeCost: 800,  name: 'Cité' },
  { level: 5, allowedUnits: 'all',              goldPerSec: 3.0, buildRadius: 400, maxHp: 1000, vision: 380, upgradeCost: null, name: 'Métropole' },
];
const MAX_VILLAGE_LEVEL = VILLAGE_LEVELS.length;

// ────────── Faction neutre PvE (barbares, faune, mini-boss) ──────────
const NEUTRAL_OWNER_BARBARIAN = 'neutral_barbarian';
const NEUTRAL_OWNER_FAUNA     = 'neutral_fauna';
const NEUTRAL_OWNER_BOSS      = 'neutral_boss';
const NEUTRAL_OWNERS = new Set([NEUTRAL_OWNER_BARBARIAN, NEUTRAL_OWNER_FAUNA, NEUTRAL_OWNER_BOSS]);
function isNeutralOwner(ownerId) { return NEUTRAL_OWNERS.has(ownerId); }
// Même camp (ne s'attaquent pas) : identiques OU tous deux neutres (factions neutres alliées).
function sameSide(a, b) {
  if (a === b) return true;
  return isNeutralOwner(a) && isNeutralOwner(b);
}

// Aggro de groupe : quand un combat s'engage près d'un groupe, les alliés LIBRES
// proches (mode defend/attack, sans cible) convergent sur le même ennemi → la horde
// focus au lieu de laisser une seule unité se battre en 1v1.
const RALLY_RADIUS = 220;
function rallyNearbyAllies(originUnit, enemyId, enemyType) {
  if (!originUnit || enemyId == null) return;
  const r2 = RALLY_RADIUS * RALLY_RADIUS;
  for (const ally of Object.values(gameState.units)) {
    if (ally.id === originUnit.id) continue;
    if (ally.attackTargetId !== null) continue;        // déjà engagé
    if ((ally.damage || 0) <= 0) continue;             // non-combattant (pèlerin, colon, bateau)
    if (ally.mode !== 'defend' && ally.mode !== 'attack') continue; // ne hijacke pas les ordres de déplacement / la faune
    if (!sameSide(ally.ownerId, originUnit.ownerId)) continue;
    const dx = ally.x - originUnit.x, dy = ally.y - originUnit.y;
    if (dx * dx + dy * dy > r2) continue;
    ally.attackTargetId   = enemyId;
    ally.attackTargetType = enemyType || 'unit';
    ally.targetX = null; ally.targetY = null;
    if (ally.mode === 'defend') ally.mode = 'attack';
  }
}

// A — Villages barbares : raids agressifs après 5 min (plus de garnison défensive —
// les villages restent librement capturables, comme le modèle Polytopia).
const NEUTRAL_GOLD_DROP_BARBARIAN    = 8;
const RAID_DELAY_MS     = 5 * 60 * 1000;
const RAID_INTERVAL_MS  = 60 * 1000;
const RAID_UNITS_PER    = 2;
const RAID_MAX_ACTIVE   = 6;
const RAID_HP           = 60;
const RAID_DMG          = 8;

// B — Camps de bandits (mini-dungeons) : 5 mobs + 1 mini-boss.
const CAMP_COUNT          = 2;
const CAMP_MOB_COUNT      = 5;
const CAMP_MOB_HP         = 55;
const CAMP_MOB_DMG        = 9;
const CAMP_BOSS_HP        = 320;
const CAMP_BOSS_DMG       = 18;
const CAMP_REWARD_GOLD    = 150;
const CAMP_DEFEND_RADIUS  = 180;
const CAMP_MIN_DIST_HDV     = 800;
const CAMP_MIN_DIST_VILLAGE = 500;
const CAMP_MIN_DIST_OTHER   = 1200;

// D — Faune dispersée : paquets de bêtes faibles qui errent (passives, ripostent).
const FAUNA_PACK_COUNT     = 10;
const FAUNA_PER_PACK_MIN   = 2;
const FAUNA_PER_PACK_MAX   = 3;
const FAUNA_HP             = 15;
const FAUNA_DMG            = 2;
const FAUNA_SPEED          = 50;
const FAUNA_GOLD_DROP      = 5;
const FAUNA_WANDER_RADIUS  = 80;
const FAUNA_WANDER_MS      = 8000;
const FAUNA_MIN_DIST_HDV   = 400;
const FAUNA_TYPES          = ['boar', 'wolf'];

// ────────── Eau & génération de map ──────────────────────────────
// gameState.waterTiles : Uint8Array de longueur GRID_W*GRID_H, 1 = eau, 0 = terre.
// Types de map : 'no_water' | 'lakes' | 'continental' | 'island'.

function _fillCircle(arr, gw, gh, cx, cy, r) {
  const yMin = Math.max(0, Math.floor(cy - r));
  const yMax = Math.min(gh - 1, Math.ceil(cy + r));
  const xMin = Math.max(0, Math.floor(cx - r));
  const xMax = Math.min(gw - 1, Math.ceil(cx + r));
  const r2 = r * r;
  for (let ty = yMin; ty <= yMax; ty++) {
    for (let tx = xMin; tx <= xMax; tx++) {
      const dx = tx - cx, dy = ty - cy;
      if (dx*dx + dy*dy <= r2) arr[ty * gw + tx] = 1;
    }
  }
}

function generateWaterTiles(type, gw, gh) {
  const arr = new Uint8Array(gw * gh);
  if (type === 'no_water') return arr;

  if (type === 'lakes') {
    // 4 à 8 lacs aléatoires
    const lakeCount = 4 + Math.floor(Math.random() * 5);
    for (let l = 0; l < lakeCount; l++) {
      const cx = 6 + Math.random() * (gw - 12);
      const cy = 6 + Math.random() * (gh - 12);
      const r  = 3 + Math.random() * 5;
      _fillCircle(arr, gw, gh, cx, cy, r);
    }
  } else if (type === 'continental') {
    // Une rivière/détroit sinusoïdal qui traverse la map (verticalement ou horizontalement)
    const vertical = Math.random() < 0.5;
    const halfWidth = 2.5 + Math.random() * 2;
    const amplitude = Math.min(gw, gh) * 0.18;
    const freq = 0.08 + Math.random() * 0.06;
    if (vertical) {
      const baseX = gw * (0.4 + Math.random() * 0.2);
      for (let ty = 0; ty < gh; ty++) {
        const off = Math.sin(ty * freq) * amplitude;
        for (let tx = Math.floor(baseX + off - halfWidth); tx <= Math.ceil(baseX + off + halfWidth); tx++) {
          if (tx >= 0 && tx < gw) arr[ty * gw + tx] = 1;
        }
      }
    } else {
      const baseY = gh * (0.4 + Math.random() * 0.2);
      for (let tx = 0; tx < gw; tx++) {
        const off = Math.sin(tx * freq) * amplitude;
        for (let ty = Math.floor(baseY + off - halfWidth); ty <= Math.ceil(baseY + off + halfWidth); ty++) {
          if (ty >= 0 && ty < gh) arr[ty * gw + tx] = 1;
        }
      }
    }
  } else if (type === 'island') {
    // Disque grass au centre, océan tout autour. Bord irrégulier pour réalisme.
    const cx = gw / 2, cy = gh / 2;
    const baseR = Math.min(gw, gh) * 0.36;
    for (let ty = 0; ty < gh; ty++) {
      for (let tx = 0; tx < gw; tx++) {
        const dx = tx - cx, dy = ty - cy;
        const angle = Math.atan2(dy, dx);
        // Bord irrégulier : variation ±10% en fonction de l'angle
        const localR = baseR * (1 + Math.sin(angle * 3) * 0.08 + Math.sin(angle * 7) * 0.05);
        if (dx*dx + dy*dy > localR * localR) arr[ty * gw + tx] = 1;
      }
    }
  }
  return arr;
}

// waterTiles : Uint8Array global, recréé à chaque applyMapConfig
let waterTiles = new Uint8Array(0);

// Tile (tx, ty) → est-ce une tile d'eau ?
function isWaterTile(tx, ty) {
  if (!waterTiles || waterTiles.length === 0) return false;
  if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) return false;
  return waterTiles[ty * GRID_W + tx] === 1;
}
// (x, y) coordonnées monde → est-ce de l'eau ?
function isWaterAt(x, y) {
  return isWaterTile(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE));
}
// ────────── Pathfinding simple — contournement de l'eau ──────────
// Pour les unités terrestres : si la trajectoire directe traverse trop d'eau,
// on calcule un waypoint intermédiaire pour contourner le lac/rivière.
// Algorithme simple (suffisant pour des grands plans d'eau, pas pour des labyrinthes) :
//   1. Compte les tiles d'eau sur le segment direct (raycast 30px par sample)
//   2. Si >3 tiles d'eau croisées → essaie un waypoint perpendiculaire au milieu
//   3. Offsets progressifs (200, 400, 600, 800, 1200 px de chaque côté)
function pathHasWaterCount(fromX, fromY, toX, toY) {
  const dist = Math.hypot(toX - fromX, toY - fromY);
  const steps = Math.max(5, Math.floor(dist / 30));
  let waterCount = 0;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isWaterAt(fromX + (toX - fromX) * t, fromY + (toY - fromY) * t)) waterCount++;
  }
  return waterCount;
}
function findWaypointAroundWater(fromX, fromY, toX, toY) {
  const mx = (fromX + toX) / 2, my = (fromY + toY) / 2;
  const dx = toX - fromX, dy = toY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len; // unité perpendiculaire
  for (const offset of [200, 400, 600, 800, 1200]) {
    for (const sign of [1, -1]) {
      const wx = mx + px * sign * offset;
      const wy = my + py * sign * offset;
      if (wx < 50 || wx > MAP_WIDTH - 50 || wy < 50 || wy > MAP_HEIGHT - 50) continue;
      if (isWaterAt(wx, wy)) continue;
      if (pathHasWaterCount(fromX, fromY, wx, wy) > 2) continue;
      if (pathHasWaterCount(wx, wy, toX, toY) > 2) continue;
      return { x: Math.round(wx), y: Math.round(wy) };
    }
  }
  return null;
}

// Cherche une position de spawn libre (non-eau) autour de (cx, cy).
// Pour unités terrestres : essaie 16 angles, retourne la 1ère position grass.
// Pour bateaux (preferWater=true) : retourne la 1ère position water.
// Fallback : centre exact si rien trouvé.
function findFreeSpawnPos(cx, cy, baseRadius = 80, preferWater = false) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const angle = (attempt / 16) * Math.PI * 2 + Math.random() * 0.2;
    const dist  = baseRadius + (attempt > 7 ? 40 : 0); // si proches échouent, élargit
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    if (x < 30 || x > MAP_WIDTH - 30 || y < 30 || y > MAP_HEIGHT - 30) continue;
    const isW = isWaterAt(x, y);
    if (preferWater ? isW : !isW) return { x: Math.round(x), y: Math.round(y) };
  }
  return { x: Math.round(cx), y: Math.round(cy) };
}

// Au moins une tile d'eau dans les 8 voisines (utilisé pour port)
function hasWaterNeighbor(x, y) {
  const tx = Math.floor(x / TILE_SIZE);
  const ty = Math.floor(y / TILE_SIZE);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (isWaterTile(tx + dx, ty + dy)) return true;
    }
  }
  return false;
}

// Recalcule TOUT en fonction du type/size de map. Appelé au démarrage et
// quand le 1er joueur (ou un reset) déclenche une nouvelle config.
function applyMapConfig(type, size) {
  if (size && MAP_SIZES[size]) {
    const sz = MAP_SIZES[size];
    MAP_WIDTH  = sz.width;
    MAP_HEIGHT = sz.height;
    currentMapSize = size;
  }
  if (type) currentMapType = type;
  GRID_W = Math.floor(MAP_WIDTH  / TILE_SIZE);
  GRID_H = Math.floor(MAP_HEIGHT / TILE_SIZE);
  waterTiles = generateWaterTiles(currentMapType, GRID_W, GRID_H);
  console.log(`[map] config: type=${currentMapType} size=${currentMapSize} (${MAP_WIDTH}x${MAP_HEIGHT}, grid ${GRID_W}x${GRID_H}, water tiles ${waterTiles.reduce((s,v)=>s+v,0)}/${GRID_W*GRID_H})`);
}

function generateVillages(spawns) {
  // Adapte count à la taille de map effective
  const sz = MAP_SIZES[currentMapSize] || MAP_SIZES.medium;
  const minC = sz.villageMin || VILLAGE_COUNT_MIN;
  const maxC = sz.villageMax || VILLAGE_COUNT_MAX;
  const count = minC + Math.floor(Math.random() * (maxC - minC + 1));
  const villages = [];
  let attempts = 0, idCounter = 1;
  while (villages.length < count && attempts < 1500) {
    attempts++;
    const x = 200 + Math.random() * (MAP_WIDTH  - 400);
    const y = 200 + Math.random() * (MAP_HEIGHT - 400);
    // Refuse les positions sur l'eau (les villages sont terrestres)
    if (isWaterAt(x, y)) continue;
    if (spawns.some(s => Math.hypot(s.x - x, s.y - y) < VILLAGE_MIN_DIST_HDV)) continue;
    if (villages.some(v => Math.hypot(v.x - x, v.y - y) < VILLAGE_MIN_DIST_OTHER)) continue;
    villages.push({
      id: `v_${idCounter++}`,
      x: Math.round(x), y: Math.round(y),
      ownerId: null,
      hp: VILLAGE_MAX_HP, maxHp: VILLAGE_MAX_HP,
      captureProgress: 0,
      capturingPlayerId: null,
      level: 1,
      lastAttackTime: 0, // pas utilisé pour combat mais cohérent
    });
  }
  console.log(`Villages générés: ${villages.length} (${count} demandés)`);
  // Garantit qu'au moins 2 villages sont côtiers (water-adjacent) si la map a de l'eau
  // → permet la stratégie navale (port → bateau) sans avoir de chance de spawn
  ensureCoastalVillages(villages, spawns, 2);
  return villages;
}

// Force au moins `minCoastal` villages à avoir une tile d'eau adjacente.
// Cherche une water tile, trouve une tile terre adjacente, y place un village.
// No-op si pas d'eau sur la map ou si déjà assez de villages côtiers.
function ensureCoastalVillages(villages, spawns, minCoastal) {
  const totalWater = waterTiles.reduce((s, v) => s + v, 0);
  if (totalWater === 0) return; // map sans eau
  const coastalCount = villages.filter(v => hasWaterNeighbor(v.x, v.y)).length;
  let toAdd = Math.max(0, minCoastal - coastalCount);
  if (toAdd === 0) return;

  // Collecte les water tiles qui ont au moins un voisin terre (= les côtes)
  const coastWaterTiles = [];
  for (let ty = 0; ty < GRID_H; ty++) {
    for (let tx = 0; tx < GRID_W; tx++) {
      if (waterTiles[ty * GRID_W + tx] !== 1) continue;
      // Voisin terre ?
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ntx = tx + dx, nty = ty + dy;
          if (ntx >= 0 && ntx < GRID_W && nty >= 0 && nty < GRID_H && !isWaterTile(ntx, nty)) {
            coastWaterTiles.push({ tx: ntx, ty: nty }); // la tile TERRE adjacente
            dx = dy = 2; // break double
          }
        }
      }
    }
  }
  if (coastWaterTiles.length === 0) return;
  // Mélange (Fisher-Yates)
  for (let i = coastWaterTiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [coastWaterTiles[i], coastWaterTiles[j]] = [coastWaterTiles[j], coastWaterTiles[i]];
  }
  let idCounter = villages.length + 100;
  for (const t of coastWaterTiles) {
    if (toAdd <= 0) break;
    const wx = t.tx * TILE_SIZE + TILE_SIZE / 2;
    const wy = t.ty * TILE_SIZE + TILE_SIZE / 2;
    if (spawns.some(s => Math.hypot(s.x - wx, s.y - wy) < VILLAGE_MIN_DIST_HDV)) continue;
    if (villages.some(v => Math.hypot(v.x - wx, v.y - wy) < VILLAGE_MIN_DIST_OTHER)) continue;
    villages.push({
      id: `v_coast_${idCounter++}`,
      x: Math.round(wx), y: Math.round(wy),
      ownerId: null,
      hp: VILLAGE_MAX_HP, maxHp: VILLAGE_MAX_HP,
      captureProgress: 0, capturingPlayerId: null,
      level: 1, lastAttackTime: 0,
    });
    toAdd--;
  }
  console.log(`[Map] ${minCoastal - toAdd} village(s) côtier(s) garantis (eau navigable)`);
}

function villageAllowsUnit(village, player, typeId) {
  const def = UNIT_TYPES[typeId];
  if (!def) return false;
  if (village.level === 1) return typeId === 'soldier';
  // Level 2 : tout ce que le joueur a débloqué via l'arbre tech v2
  return !def.requiresTech || hasTech(player, def.requiresTech);
}

// ════════════ PvE : factions neutres (barbares / camps / faune) ════════════

// Raid barbare : 2 unités en 'move' vers un joueur cible.
function spawnRaidFromVillage(village, targetPlayer) {
  if (!village || !targetPlayer || targetPlayer.eliminated) return 0;
  for (let i = 0; i < RAID_UNITS_PER; i++) {
    const angle = (i / RAID_UNITS_PER) * Math.PI * 2 + Math.random() * 0.4;
    const dist  = 50 + Math.random() * 20;
    const unitId = `unit_${nextUnitId++}`;
    gameState.units[unitId] = {
      id: unitId, ownerId: NEUTRAL_OWNER_BARBARIAN,
      x: Math.round(village.x + Math.cos(angle) * dist),
      y: Math.round(village.y + Math.sin(angle) * dist),
      type: 'soldier', hp: RAID_HP, maxHp: RAID_HP,
      speed: 80, range: 35, damage: RAID_DMG, cost: 0,
      targetX: targetPlayer.x + (Math.random() - 0.5) * 80,
      targetY: targetPlayer.y + (Math.random() - 0.5) * 80,
      attackTargetId: null, attackTargetType: null, lastAttackTime: 0,
      mode: 'move', defendX: targetPlayer.x, defendY: targetPlayer.y, defendRadius: 0,
      neutralRole: 'raid', neutralVillageId: village.id, raidTargetPlayerId: targetPlayer.id,
    };
  }
  return RAID_UNITS_PER;
}

// Camps de bandits : génération des positions (loin HDV/villages/autres camps).
function generateCamps(spawns, villages) {
  const camps = [];
  let attempts = 0, idCounter = 1;
  while (camps.length < CAMP_COUNT && attempts < 1000) {
    attempts++;
    const x = 300 + Math.random() * (MAP_WIDTH  - 600);
    const y = 300 + Math.random() * (MAP_HEIGHT - 600);
    if (isWaterAt(x, y)) continue;
    if (spawns.some(s => Math.hypot(s.x - x, s.y - y) < CAMP_MIN_DIST_HDV)) continue;
    if (villages.some(v => Math.hypot(v.x - x, v.y - y) < CAMP_MIN_DIST_VILLAGE)) continue;
    if (camps.some(c => Math.hypot(c.x - x, c.y - y) < CAMP_MIN_DIST_OTHER)) continue;
    camps.push({ id: `camp_${idCounter++}`, x: Math.round(x), y: Math.round(y), cleared: false, mobsAlive: CAMP_MOB_COUNT + 1 });
  }
  console.log(`[PvE] Camps de bandits : ${camps.length} (${CAMP_COUNT} demandés)`);
  return camps;
}
function spawnCampMobs(camp) {
  if (!gameState || !camp) return;
  for (let i = 0; i < CAMP_MOB_COUNT; i++) {
    const angle = (i / CAMP_MOB_COUNT) * Math.PI * 2;
    const dist  = 60 + Math.random() * 50;
    const isArcher = i % 2 === 1;
    const unitId = `unit_${nextUnitId++}`;
    gameState.units[unitId] = {
      id: unitId, ownerId: NEUTRAL_OWNER_BARBARIAN,
      x: Math.round(camp.x + Math.cos(angle) * dist),
      y: Math.round(camp.y + Math.sin(angle) * dist),
      type: isArcher ? 'archer' : 'soldier', hp: CAMP_MOB_HP, maxHp: CAMP_MOB_HP,
      speed: 80, range: isArcher ? 250 : 35, damage: CAMP_MOB_DMG, cost: 0,
      targetX: null, targetY: null, attackTargetId: null, attackTargetType: null,
      lastAttackTime: 0,
      mode: 'defend', defendX: camp.x, defendY: camp.y, defendRadius: CAMP_DEFEND_RADIUS,
      neutralRole: 'camp_mob', neutralCampId: camp.id,
    };
  }
  const bossId = `unit_${nextUnitId++}`;
  gameState.units[bossId] = {
    id: bossId, ownerId: NEUTRAL_OWNER_BOSS,
    x: camp.x, y: camp.y, type: 'elite_guard', hp: CAMP_BOSS_HP, maxHp: CAMP_BOSS_HP,
    speed: 70, range: 35, damage: CAMP_BOSS_DMG, cost: 0,
    targetX: null, targetY: null, attackTargetId: null, attackTargetType: null,
    lastAttackTime: 0,
    mode: 'defend', defendX: camp.x, defendY: camp.y, defendRadius: CAMP_DEFEND_RADIUS,
    neutralRole: 'camp_boss', neutralCampId: camp.id,
  };
}
function spawnAllCampMobs() {
  for (const c of gameState.camps) if (!c.cleared) spawnCampMobs(c);
}
function rewardCampClear(camp, player) {
  if (!camp || !player || player.eliminated) return;
  player.gold += CAMP_REWARD_GOLD; player.totalGoldEarned += CAMP_REWARD_GOLD;
  const freeType = unitTypeUnlocked(player, 'knight') ? 'knight' : 'soldier';
  const def = UNIT_TYPES[freeType];
  const pos = findFreeSpawnPos(player.x, player.y, 70 + Math.random() * 30, false);
  const unitId = `unit_${nextUnitId++}`;
  gameState.units[unitId] = {
    id: unitId, ownerId: player.id, x: pos.x, y: pos.y, type: freeType,
    hp: def.hp, maxHp: def.hp,
    speed: def.speed, range: def.range, damage: def.damage, cost: def.cost,
    targetX: null, targetY: null, attackTargetId: null, attackTargetType: null,
    lastAttackTime: 0, mode: 'defend', defendX: player.x, defendY: player.y, defendRadius: 320,
  };
  player.unitsCreated++;
  io.emit('campCleared', { campId: camp.id, x: camp.x, y: camp.y,
    byPlayerId: player.id, byName: player.name, byColor: player.color,
    rewardGold: CAMP_REWARD_GOLD, freeUnit: freeType });
  console.log(`[PvE] Camp ${camp.id} nettoyé par ${player.name} (+${CAMP_REWARD_GOLD} gold, +1 ${freeType})`);
}

// Faune : paquets de bêtes faibles qui errent.
function spawnAllFauna(spawns) {
  let packs = 0, animals = 0, attempts = 0;
  while (packs < FAUNA_PACK_COUNT && attempts < 800) {
    attempts++;
    const ox = 200 + Math.random() * (MAP_WIDTH  - 400);
    const oy = 200 + Math.random() * (MAP_HEIGHT - 400);
    if (isWaterAt(ox, oy)) continue;
    if (spawns.some(s => Math.hypot(s.x - ox, s.y - oy) < FAUNA_MIN_DIST_HDV)) continue;
    const packType = FAUNA_TYPES[Math.floor(Math.random() * FAUNA_TYPES.length)];
    const n = FAUNA_PER_PACK_MIN + Math.floor(Math.random() * (FAUNA_PER_PACK_MAX - FAUNA_PER_PACK_MIN + 1));
    for (let i = 0; i < n; i++) {
      const ax = ox + (Math.random() - 0.5) * 60, ay = oy + (Math.random() - 0.5) * 60;
      const unitId = `unit_${nextUnitId++}`;
      gameState.units[unitId] = {
        id: unitId, ownerId: NEUTRAL_OWNER_FAUNA,
        x: Math.round(ax), y: Math.round(ay), type: packType,
        hp: FAUNA_HP, maxHp: FAUNA_HP, speed: FAUNA_SPEED, range: 30, damage: FAUNA_DMG, cost: 0,
        targetX: null, targetY: null, attackTargetId: null, attackTargetType: null,
        lastAttackTime: 0, mode: 'wander',
        wanderOriginX: Math.round(ox), wanderOriginY: Math.round(oy), wanderNextMs: 0,
        neutralRole: 'fauna',
      };
      animals++;
    }
    packs++;
  }
  console.log(`[PvE] Faune : ${animals} animaux en ${packs} paquets`);
}

// Récompense gold + clear de camp quand un mob/boss neutre meurt (appelé sur chaque kill d'unité).
function onNeutralUnitKilled(target, killerOwnerId, entry) {
  const killer = gameState.players[killerOwnerId];
  if (!killer || killer.eliminated) return;
  if (target.ownerId === NEUTRAL_OWNER_BARBARIAN) {
    killer.gold += NEUTRAL_GOLD_DROP_BARBARIAN; killer.totalGoldEarned += NEUTRAL_GOLD_DROP_BARBARIAN;
    if (entry) entry.goldDrop = NEUTRAL_GOLD_DROP_BARBARIAN;
  } else if (target.ownerId === NEUTRAL_OWNER_FAUNA) {
    killer.gold += FAUNA_GOLD_DROP; killer.totalGoldEarned += FAUNA_GOLD_DROP;
    if (entry) entry.goldDrop = FAUNA_GOLD_DROP;
  }
  if (target.neutralCampId) {
    const camp = gameState.camps.find(c => c.id === target.neutralCampId);
    if (camp && !camp.cleared) {
      camp.mobsAlive = Math.max(0, camp.mobsAlive - 1);
      if (camp.mobsAlive === 0) { camp.cleared = true; rewardCampClear(camp, killer); }
    }
  }
}

// Distance bord-à-bord entre une unité et un village (cercle vs AABB carré)
function unitToVillageDist(unit, v) {
  const cx = Math.max(v.x - VILLAGE_HALF_SIZE, Math.min(unit.x, v.x + VILLAGE_HALF_SIZE));
  const cy = Math.max(v.y - VILLAGE_HALF_SIZE, Math.min(unit.y, v.y + VILLAGE_HALF_SIZE));
  return Math.hypot(unit.x - cx, unit.y - cy);
}

// Distance bord-à-bord entre une unité et un bâtiment
function unitToBuildingDist(unit, b) {
  const def = BUILDING_TYPES[b.type];
  const half = (def && def.halfSize) || 22;
  const cx = Math.max(b.x - half, Math.min(unit.x, b.x + half));
  const cy = Math.max(b.y - half, Math.min(unit.y, b.y + half));
  return Math.hypot(unit.x - cx, unit.y - cy);
}

// Rayon constructible autour d'une base (HDV ou village)
function baseBuildRadius(baseType, baseObj) {
  if (baseType === 'hdv') {
    const lvl = HDV_LEVELS[(baseObj.hdvLevel || 1) - 1] || HDV_LEVELS[0];
    return lvl.buildRadius || 240;
  } else {
    const lvl = VILLAGE_LEVELS[(baseObj.level || 1) - 1] || VILLAGE_LEVELS[0];
    return lvl.buildRadius || 160;
  }
}

// Helper : un joueur a-t-il débloqué une tech ?
function hasTech(player, techId) {
  return player && Array.isArray(player.unlockedTechs) && player.unlockedTechs.includes(techId);
}

// ────────── Système de population ──────────
// Pop max = 8 (base) + 3 par level HDV au-dessus de 1 + 2 par village possédé
//          + 1 par level village au-dessus de 1
// Pop utilisée = somme des populationCost des unités du joueur
const BASE_POPULATION = 8;
function getPopulationMax(player) {
  let pop = BASE_POPULATION;
  pop += Math.max(0, (player.hdvLevel || 1) - 1) * 3;
  for (const v of gameState.villages) {
    if (v.ownerId !== player.id || v.hp <= 0) continue;
    pop += 2;
    pop += Math.max(0, (v.level || 1) - 1);
  }
  return pop;
}
function getPopulationUsed(player) {
  let used = 0;
  for (const u of Object.values(gameState.units)) {
    if (u.ownerId !== player.id) continue;
    const def = UNIT_TYPES[u.type];
    used += (def && def.populationCost) || 1;
  }
  return used;
}

// Citadelle : si la tech 'citadel' est débloquée, le HDV gagne 3× HP
function recomputeHdvStats(player) {
  const lvl = HDV_LEVELS[player.hdvLevel - 1] || HDV_LEVELS[0];
  let maxHp = lvl.maxHp;
  let vision = lvl.vision;
  // Tech 'citadel' (Science T6) : 3× HP
  if (hasTech(player, 'citadel')) maxHp *= 3;
  player.maxHp  = maxHp;
  player.vision = vision;
}

function computeGoldRate(player) {
  const hdvLvl = HDV_LEVELS[(player.hdvLevel || 1) - 1] || HDV_LEVELS[0];
  let rate = hdvLvl.goldPerSec || GOLD_PER_SECOND;
  // Tech Agriculture : +1 gold/sec passif
  if (hasTech(player, 'agriculture')) rate += 1;
  // Bonus villages possédés (selon leur niveau)
  for (const v of gameState.villages) {
    if (v.ownerId !== player.id || v.hp <= 0) continue;
    const vLvl = VILLAGE_LEVELS[(v.level || 1) - 1] || VILLAGE_LEVELS[0];
    rate += vLvl.goldPerSec || VILLAGE_GOLD_PER_SEC;
  }
  // Tech Empire : +50% sur tout
  if (hasTech(player, 'empire')) rate *= 1.5;
  return rate;
}

// Génération de Points de Recherche (PR) par seconde
function computePrRate(player) {
  let rate = 0.5; // base : HDV génère 0.5 PR/sec
  if (hasTech(player, 'stargazing')) rate += 0.3;
  if (hasTech(player, 'printing'))   rate *= 2; // Imprimerie : ×2 PR
  return rate;
}

// Génération de Mana par seconde (par bâtiments)
function computeManaRate(player) {
  let rate = 0;
  for (const b of gameState.buildings) {
    if (b.ownerId !== player.id || b.hp <= 0) continue;
    if (b.type === 'sanctum')    rate += 0.5;
    if (b.type === 'mage_tower') rate += 1;
  }
  // Tech "Enchantement" : ×1.5 sur tous les bâtiments magiques
  if (hasTech(player, 'enchantment')) rate *= 1.5;
  return rate;
}

// Génération de Foi par seconde (par bâtiments + pèlerins)
function computeFaithRate(player) {
  let rate = 0;
  for (const b of gameState.buildings) {
    if (b.ownerId !== player.id || b.hp <= 0) continue;
    if (b.type === 'altar')      rate += 0.5;
    if (b.type === 'temple')     rate += 1.5;
    if (b.type === 'cathedral')  rate += 3; // double du temple
  }
  // Pèlerins
  for (const u of Object.values(gameState.units)) {
    if (u.ownerId === player.id && u.type === 'pilgrim') rate += 0.5;
  }
  return rate;
}

function unitHpBonusFromVillages(_player) {
  // Plus de bonus HP via village (les villages ne sont plus typés)
  return 0;
}

// Multiplicateur HP max appliqué au spawn selon les techs passives du propriétaire.
// Centralise les bonus pour qu'ils s'appliquent depuis HDV / village / bot / spawn invoqué.
function unitHpMult(player, typeId) {
  let mult = 1;
  // Passif 'magic_hp_boost' (illusion) : +15% HP max pour unités magie/undead
  if (player && hasTech(player, 'illusion') && MAGIC_UNDEAD.has(typeId)) {
    mult *= 1.15;
  }
  // Passif 'all_hp_regen' (blessing) : +10% HP max sur TOUTES les unités du joueur
  if (player && hasTech(player, 'blessing')) {
    mult *= 1.10;
  }
  return mult;
}

// Rayon de vision d'une unité — boosté par le passif 'magic_speed_vision' (lightning)
// pour les unités magie / undead : +30 %.
function unitVisionRadius(unit) {
  if (!unit) return VISION_UNIT;
  const owner = gameState.players && gameState.players[unit.ownerId];
  if (owner && MAGIC_UNDEAD.has(unit.type) && hasTech(owner, 'lightning')) {
    return Math.round(VISION_UNIT * 1.30);
  }
  return VISION_UNIT;
}

// ────────── Bot IA ──────────
let nextBotId = 1;
const BOT_NAMES = ['Atlas', 'Hermès', 'Apollon', 'Arès', 'Hadès', 'Zeus'];

function addBot() {
  const slot = getAvailableSlot();
  if (slot === -1) return null;
  const spawn = currentSpawns[slot];
  const botId = `bot_${nextBotId++}`;
  const botPlayer = {
    id: botId,
    slot,
    isBot: true,
    x: spawn.x, y: spawn.y,
    color: COLORS[slot],
    name: `🤖 ${BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]}`,
    gold: 0, hp: HDV_LEVELS[0].maxHp, maxHp: HDV_LEVELS[0].maxHp,
    eliminated: false, eliminatedAt: null,
    kills: 0, unitsCreated: 0, totalGoldEarned: 0, joinTime: Date.now(),
    hdvLevel: 1,
    // Tech tree v2 : ressources et déblocages
    researchPoints: 0, mana: 0, faith: 0,
    unlockedTechs: [],
    // Legacy compat (encore référencés par du code non migré)
    techPoints: 0, researchedTechs: [],
    activeSpells: [],
    allies: [], // ids des joueurs avec pacte de non-agression
    vision: HDV_LEVELS[0].vision,
    populationUsed: 0, populationMax: BASE_POPULATION,
    botCooldown: 0,
  };
  gameState.players[botId] = botPlayer;
  initVisibility(botId);
  peakPlayerCount = Math.max(peakPlayerCount, Object.keys(gameState.players).length);
  console.log(`Bot "${botPlayer.name}" added — slot ${slot}`);
  checkMatchState();
  return botPlayer;
}

// ────────── IA stratégique des bots ──────────
// Cycle de décision : DEVELOP (économie) → EXPAND (villages) → ATTACK (waves)
// État persistant sur bot.botState : { strategy, lastWaveTime, lastVillageTargetTime,
//   lastBuildTime, targetPlayerId }
//
// Boucle :
//  1. Recherche techs prioritaires (économie d'abord, puis militaire, puis spécial)
//  2. Upgrade HDV quand abordable (garde 100 gold de marge)
//  3. Construction défensive (tours près du HDV) si gold permet et tech débloquée
//  4. Spawn unité (préfère unités haut tiers débloquées)
//  5. Capture village neutre le plus proche (envoie 3 unités si army >= 4)
//  6. Wave d'attaque coordonnée (10+ unités groupées vers cible faible, cooldown 5s)
//
// Différence vs ancien : ne spam plus 1 unité/sec sur l'HDV ennemi ; constitue
// d'abord une army, capture les villages pour le passif, et lance des vagues groupées.

const BOT_TECH_PRIORITY = [
  // Économie d'abord (gold passif = snowball)
  'agriculture',
  // Militaire de base
  'archery', 'riding',
  // Défense
  'military_architecture',  // tour
  // Économie avancée
  'empire',
  // Militaire avancé
  'steel_forge', 'crossbows', 'war_academy',
  'siege_engineering',      // catapulte
  // Sciences avancées
  'gunpowder', 'citadel',
  'renaissance',
];

// Priorité tech additionnelle pour bots ayant détecté de l'eau sur la map.
// Insérée APRÈS les techs de base (économie + archery/riding) mais AVANT le militaire haut tier.
const BOT_TECH_PRIORITY_NAVAL = [
  'construction', // prérequis marine
  'marine',       // débloque port + bateau
];

function botTick(bot) {
  if (bot.eliminated) return;
  bot.botState = bot.botState || {
    lastWaveTime: 0, lastBuildTime: 0, lastVillageScout: 0,
    lastPortTime: 0, lastBoatSpawnTime: 0, lastNavalWaveTime: 0,
    hasNavalAmbition: null,
  };
  const nowMs = Date.now();

  // Détecte une seule fois si la map a assez d'eau pour justifier l'effort naval.
  // currentMapType est 'no_water' | 'lakes' | 'continental' | 'island'.
  if (bot.botState.hasNavalAmbition === null) {
    bot.botState.hasNavalAmbition = (typeof currentMapType !== 'undefined' && currentMapType !== 'no_water');
  }

  // 1. RECHERCHE TECH ────────────────────────────────────────────
  // Priorité de base, puis naval si pertinent (insertion juste après archery/riding).
  const techRoute = bot.botState.hasNavalAmbition
    ? [...BOT_TECH_PRIORITY.slice(0, 3), ...BOT_TECH_PRIORITY_NAVAL, ...BOT_TECH_PRIORITY.slice(3)]
    : BOT_TECH_PRIORITY;
  for (const tid of techRoute) {
    if ((bot.unlockedTechs || []).includes(tid)) continue;
    const node = NEW_TECH_TREE[tid];
    if (!node) continue;
    if ((bot.researchPoints || 0) < node.cost) continue;
    if (!(node.requires || []).every(r => (bot.unlockedTechs || []).includes(r))) continue;
    bot.researchPoints -= node.cost;
    bot.unlockedTechs.push(tid);
    recomputeHdvStats(bot);
    console.log(`[Bot ${bot.name}] tech débloquée : ${tid}`);
    break;
  }

  // 2. UPGRADE HDV ────────────────────────────────────────────────
  if (bot.hdvLevel < MAX_HDV_LEVEL) {
    const cost = HDV_LEVELS[bot.hdvLevel - 1].upgradeCost;
    if (bot.gold >= cost + 100) { // garde 100 gold de marge
      bot.gold -= cost;
      bot.hdvLevel++;
      bot.researchPoints = (bot.researchPoints || 0) + 50;
      recomputeHdvStats(bot);
      bot.hp = bot.maxHp;
      console.log(`[Bot ${bot.name}] → HDV lv ${bot.hdvLevel}`);
    }
  }

  // 3. CONSTRUCTION DÉFENSIVE (tour près du HDV) ──────────────────
  // Construit jusqu'à 2 tours d'archer à environ 130px du HDV.
  if (hasTech(bot, 'military_architecture') && bot.gold > 80
      && nowMs - bot.botState.lastBuildTime > 3000) {
    const myTowers = gameState.buildings.filter(b => b.ownerId === bot.id && b.type === 'tower');
    const towerDef = BUILDING_TYPES.tower;
    if (myTowers.length < 2 && bot.gold >= towerDef.cost) {
      // Trouve une position libre autour du HDV (8 directions)
      const buildRadius = baseBuildRadius('hdv', bot);
      for (let attempt = 0; attempt < 8; attempt++) {
        const angle = (attempt / 8) * Math.PI * 2 + Math.random() * 0.4;
        const dist = Math.min(buildRadius - 30, 130);
        const px = bot.x + Math.cos(angle) * dist;
        const py = bot.y + Math.sin(angle) * dist;
        const snap = snapToGrid(px, py);
        // Vérifie qu'on ne pose pas sur l'eau, qu'on ne chevauche pas un autre bâtiment,
        // et qu'on respecte la distance min au HDV
        if (isWaterAt(snap.x, snap.y)) continue;
        if (Math.hypot(bot.x - snap.x, bot.y - snap.y) < BUILDING_MIN_DIST_HDV) continue;
        if (gameState.buildings.some(b => b.x === snap.x && b.y === snap.y)) continue;
        // OK, construis
        bot.gold -= towerDef.cost;
        gameState.buildings.push({
          id: `b_${nextBuildingId++}`,
          ownerId: bot.id, type: 'tower',
          x: snap.x, y: snap.y,
          hp: towerDef.hp, maxHp: towerDef.hp,
          lastAttackTime: 0,
        });
        bot.botState.lastBuildTime = nowMs;
        console.log(`[Bot ${bot.name}] construit une Tour en (${snap.x}, ${snap.y})`);
        break;
      }
    }
  }

  // 3.5. CONSTRUCTION PORT (naval) ────────────────────────────────
  // Construit 1 port à proximité d'une water tile dans la zone constructible du HDV.
  if (hasTech(bot, 'marine') && bot.gold >= BUILDING_TYPES.port.cost
      && nowMs - bot.botState.lastPortTime > 4000) {
    const myPorts = gameState.buildings.filter(b => b.ownerId === bot.id && b.type === 'port');
    if (myPorts.length < 1) {
      const portDef = BUILDING_TYPES.port;
      const buildR = baseBuildRadius('hdv', bot);
      // Scan en spirale autour du HDV pour trouver une case-grille avec voisin eau
      let placed = false;
      for (let attempt = 0; attempt < 24 && !placed; attempt++) {
        const angle = (attempt / 24) * Math.PI * 2 + Math.random() * 0.3;
        const dist  = 110 + Math.random() * (buildR - 130);
        const px = bot.x + Math.cos(angle) * dist;
        const py = bot.y + Math.sin(angle) * dist;
        const snap = snapToGrid(px, py);
        if (isWaterAt(snap.x, snap.y)) continue;
        if (!hasWaterNeighbor(snap.x, snap.y)) continue;
        if (Math.hypot(bot.x - snap.x, bot.y - snap.y) < BUILDING_MIN_DIST_HDV) continue;
        if (gameState.buildings.some(b => b.x === snap.x && b.y === snap.y)) continue;
        bot.gold -= portDef.cost;
        gameState.buildings.push({
          id: `b_${nextBuildingId++}`,
          ownerId: bot.id, type: 'port',
          x: snap.x, y: snap.y,
          hp: portDef.hp, maxHp: portDef.hp,
          lastAttackTime: 0,
        });
        bot.botState.lastPortTime = nowMs;
        console.log(`[Bot ${bot.name}] construit un Port en (${snap.x}, ${snap.y})`);
        placed = true;
      }
    }
  }

  // 4. SPAWN UNITÉ ────────────────────────────────────────────────
  // Préfère les unités haut tiers débloquées ; respect du cap de population.
  const myUnits = Object.values(gameState.units).filter(u => u.ownerId === bot.id);
  const botPopUsed = getPopulationUsed(bot);
  const botPopMax  = getPopulationMax(bot);

  // 4.bis. SPAWN BOAT (si port construit + tech marine + sous le cap de 2 bateaux)
  if (hasTech(bot, 'marine') && bot.gold >= UNIT_TYPES.boat.cost
      && nowMs - bot.botState.lastBoatSpawnTime > 5000
      && botPopUsed + (UNIT_TYPES.boat.populationCost || 1) <= botPopMax) {
    const myBoats = myUnits.filter(u => u.type === 'boat');
    const myPorts = gameState.buildings.filter(b => b.ownerId === bot.id && b.type === 'port' && b.hp > 0);
    if (myPorts.length > 0 && myBoats.length < 2) {
      // Trouve water tile adjacente au port
      let found = null;
      for (const port of myPorts) {
        const tx0 = Math.floor(port.x / TILE_SIZE);
        const ty0 = Math.floor(port.y / TILE_SIZE);
        for (let r = 1; r <= 3 && !found; r++) {
          for (let dy = -r; dy <= r && !found; dy++) {
            for (let dx = -r; dx <= r && !found; dx++) {
              if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
              if (isWaterTile(tx0 + dx, ty0 + dy)) {
                found = {
                  x: (tx0 + dx) * TILE_SIZE + TILE_SIZE / 2,
                  y: (ty0 + dy) * TILE_SIZE + TILE_SIZE / 2,
                };
              }
            }
          }
        }
        if (found) break;
      }
      if (found) {
        const def = UNIT_TYPES.boat;
        bot.gold -= def.cost;
        bot.unitsCreated++;
        const unitId = `unit_${nextUnitId++}`;
        gameState.units[unitId] = {
          id: unitId, ownerId: bot.id,
          x: found.x, y: found.y, type: 'boat',
          hp: def.hp, maxHp: def.hp,
          speed: def.speed, range: def.range, damage: def.damage, cost: def.cost,
          targetX: null, targetY: null,
          attackTargetId: null, attackTargetType: null,
          lastAttackTime: 0,
          mode: 'defend', defendX: found.x, defendY: found.y, defendRadius: 320,
          passengers: [],
        };
        bot.botState.lastBoatSpawnTime = nowMs;
        console.log(`[Bot ${bot.name}] a produit un Bateau (port→eau)`);
      }
    }
  }
  if (botPopUsed < botPopMax) {
    const preferOrder = ['heavy_knight', 'crossbowman', 'general', 'catapult', 'knight', 'archer', 'soldier'];
    for (const typeId of preferOrder) {
      const def = UNIT_TYPES[typeId];
      if (!unitTypeUnlocked(bot, typeId)) continue;
      if (bot.gold < def.cost) continue;
      if (def.manaCost && (bot.mana || 0) < def.manaCost) continue;
      if (def.faithCost && (bot.faith || 0) < def.faithCost) continue;
      if (botPopUsed + (def.populationCost || 1) > botPopMax) continue;
      bot.gold -= def.cost;
      if (def.manaCost)  bot.mana  = Math.max(0, (bot.mana  || 0) - def.manaCost);
      if (def.faithCost) bot.faith = Math.max(0, (bot.faith || 0) - def.faithCost);
      bot.unitsCreated++;
      const pos = findFreeSpawnPos(bot.x, bot.y, 70 + Math.random() * 30, false);
      const unitId = `unit_${nextUnitId++}`;
      const botHp = Math.round(def.hp * unitHpMult(bot, typeId));
      gameState.units[unitId] = {
        id: unitId, ownerId: bot.id,
        x: pos.x, y: pos.y,
        type: typeId,
        hp: botHp, maxHp: botHp,
        speed: def.speed, range: def.range, damage: def.damage, cost: def.cost,
        targetX: null, targetY: null,
        attackTargetId: null, attackTargetType: null,
        lastAttackTime: 0,
        mode: 'defend', defendX: bot.x, defendY: bot.y, defendRadius: 320,
      };
      break;
    }
  }

  // Unités au repos disponibles pour des ordres (proches du HDV)
  const armyAtBase = myUnits.filter(u =>
    u.mode === 'defend' && u.attackTargetId === null
    && Math.hypot(u.x - bot.x, u.y - bot.y) < 400
  );

  // 4.9. DÉFENSE PvE — menace barbare proche du HDV → repli défensif 30s ──────
  // (la faune est ignorée ; seuls les barbares garnison/raid déclenchent l'alerte)
  const BOT_RAID_ALERT = 600, BOT_DEFENSE_MS = 30000;
  let threatNear = false;
  for (const u of Object.values(gameState.units)) {
    if (u.ownerId !== NEUTRAL_OWNER_BARBARIAN) continue;
    if ((u.x - bot.x) ** 2 + (u.y - bot.y) ** 2 <= BOT_RAID_ALERT * BOT_RAID_ALERT) { threatNear = true; break; }
  }
  if (threatNear) bot.botState.defenseUntil = nowMs + BOT_DEFENSE_MS;
  if ((bot.botState.defenseUntil || 0) > nowMs) {
    // Rappel des unités offensives vers le HDV, pas de nouvelle offensive.
    for (const u of myUnits) {
      if (u.mode === 'move') {
        u.mode = 'defend'; u.defendX = bot.x; u.defendY = bot.y; u.defendRadius = 360;
        u.targetX = null; u.targetY = null;
      }
    }
    return;
  }

  // 5. CAPTURE VILLAGES NEUTRES ───────────────────────────────────
  // Envoie 3 unités vers le village neutre le plus proche tous les 8s
  if (armyAtBase.length >= 4 && nowMs - bot.botState.lastVillageScout > 8000) {
    const neutralVillages = gameState.villages.filter(v => !v.ownerId);
    if (neutralVillages.length > 0) {
      let nearest = null, bestDsq = Infinity;
      for (const v of neutralVillages) {
        const dsq = (v.x - bot.x)**2 + (v.y - bot.y)**2;
        if (dsq < bestDsq) { bestDsq = dsq; nearest = v; }
      }
      if (nearest) {
        const toSend = armyAtBase.slice(0, 3);
        for (const u of toSend) {
          u.targetX = nearest.x + (Math.random() - 0.5) * 60;
          u.targetY = nearest.y + (Math.random() - 0.5) * 60;
          u.mode = 'move';
        }
        bot.botState.lastVillageScout = nowMs;
        console.log(`[Bot ${bot.name}] envoie 3 unités capturer village ${nearest.id}`);
      }
    }
  }

  // 6. WAVE D'ATTAQUE COORDONNÉE ──────────────────────────────────
  // Quand au moins 10 unités au HDV ET 6s depuis dernière wave
  const stillAtBase = myUnits.filter(u =>
    u.mode === 'defend' && u.attackTargetId === null
    && Math.hypot(u.x - bot.x, u.y - bot.y) < 400
  );
  if (stillAtBase.length >= 10 && nowMs - bot.botState.lastWaveTime > 6000) {
    // Cible : adversaire le plus FAIBLE (HP HDV) pondéré par distance
    let target = null, bestScore = -Infinity;
    for (const p of Object.values(gameState.players)) {
      if (p.id === bot.id || p.eliminated || p.hp <= 0) continue;
      if ((bot.allies || []).includes(p.id)) continue;
      const dist = Math.hypot(p.x - bot.x, p.y - bot.y);
      const hpFrac = p.hp / p.maxHp; // 1.0 = full, 0.0 = mort
      // Score : favorise faible HP + distance proche
      const score = (1 - hpFrac) * 800 - dist / 8;
      if (score > bestScore) { bestScore = score; target = p; }
    }
    if (target) {
      // 70% de l'army part en wave, 30% reste défensive
      const waveSize = Math.floor(stillAtBase.length * 0.7);
      const wave = stillAtBase.slice(0, waveSize);
      for (const u of wave) {
        u.targetX = target.x + (Math.random() - 0.5) * 180;
        u.targetY = target.y + (Math.random() - 0.5) * 180;
        u.mode = 'move';
      }
      bot.botState.lastWaveTime = nowMs;
      bot.botState.targetPlayerId = target.id;
      console.log(`[Bot ${bot.name}] WAVE de ${wave.length} unités sur ${target.name} (HP ${target.hp}/${target.maxHp})`);
    }
  }

  // 7. WAVE NAVALE ───────────────────────────────────────────────
  // Si on a un bateau libre (sans passagers) et qu'une cible ennemie est "bloquée"
  // par de l'eau, embarque jusqu'à 4 unités terrestres proches du bateau, puis envoie
  // le bateau vers la côte ennemie pour débarquer.
  if (hasTech(bot, 'marine') && nowMs - bot.botState.lastNavalWaveTime > 12000) {
    const myBoats = myUnits.filter(u => u.type === 'boat');
    const freeBoats = myBoats.filter(b => (!b.passengers || b.passengers.length === 0));
    if (freeBoats.length > 0) {
      // Cible : un HDV ennemi accessible uniquement en passant par >3 tiles d'eau
      let navalTarget = null;
      for (const p of Object.values(gameState.players)) {
        if (p.id === bot.id || p.eliminated || p.hp <= 0) continue;
        if ((bot.allies || []).includes(p.id)) continue;
        const waterTiles = pathHasWaterCount(bot.x, bot.y, p.x, p.y);
        if (waterTiles >= 3) { navalTarget = p; break; }
      }
      if (navalTarget) {
        const boat = freeBoats[0];
        // Embarque jusqu'à 4 unités terrestres à proximité du bateau (≤200px)
        const candidates = myUnits.filter(u =>
          u.type !== 'boat' && u.type !== 'pilgrim' && u.type !== 'settler'
          && (u.damage || 0) > 0
          && Math.hypot(u.x - boat.x, u.y - boat.y) <= 200
          && (u.mode === 'defend' || u.mode === 'attack')
        ).slice(0, 4);
        if (candidates.length >= 2) {
          boat.passengers = boat.passengers || [];
          for (const c of candidates) {
            if (boat.passengers.length >= 4) break;
            boat.passengers.push({
              type: c.type, hp: c.hp, maxHp: c.maxHp,
              speed: c.speed, range: c.range, damage: c.damage, cost: c.cost,
            });
            delete gameState.units[c.id];
          }
          // Trouve une water tile côtière près du HDV cible et envoie le bateau là
          let landing = null;
          const tx0 = Math.floor(navalTarget.x / TILE_SIZE);
          const ty0 = Math.floor(navalTarget.y / TILE_SIZE);
          for (let r = 2; r <= 8 && !landing; r++) {
            for (let dy = -r; dy <= r && !landing; dy++) {
              for (let dx = -r; dx <= r && !landing; dx++) {
                if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                if (isWaterTile(tx0 + dx, ty0 + dy)) {
                  landing = {
                    x: (tx0 + dx) * TILE_SIZE + TILE_SIZE / 2,
                    y: (ty0 + dy) * TILE_SIZE + TILE_SIZE / 2,
                  };
                }
              }
            }
          }
          if (landing) {
            boat.targetX = landing.x;
            boat.targetY = landing.y;
            boat.mode = 'move';
            boat._navalLanding = { x: navalTarget.x, y: navalTarget.y }; // pour débarquement auto
            bot.botState.lastNavalWaveTime = nowMs;
            console.log(`[Bot ${bot.name}] WAVE NAVALE : ${boat.passengers.length} passagers vers ${navalTarget.name}`);
          } else {
            // Pas trouvé de tile côtière — abandonne (rare)
            console.log(`[Bot ${bot.name}] WAVE NAVALE annulée : pas de tile côtière trouvée`);
          }
        }
      }
    }

    // Débarquement automatique : si un bateau du bot avec passagers est ≤ 80px de sa landing
    for (const boat of myBoats) {
      if (!boat._navalLanding || !boat.passengers || boat.passengers.length === 0) continue;
      const d = Math.hypot(boat.x - boat._navalLanding.x, boat.y - boat._navalLanding.y);
      if (d > 250) continue; // pas encore arrivé
      // Cherche une tile terre proche du HDV cible pour débarquer
      const tx0 = Math.floor(boat._navalLanding.x / TILE_SIZE);
      const ty0 = Math.floor(boat._navalLanding.y / TILE_SIZE);
      let landTile = null;
      for (let r = 1; r <= 4 && !landTile; r++) {
        for (let dy = -r; dy <= r && !landTile; dy++) {
          for (let dx = -r; dx <= r && !landTile; dx++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            if (!isWaterTile(tx0 + dx, ty0 + dy)) {
              landTile = {
                x: (tx0 + dx) * TILE_SIZE + TILE_SIZE / 2,
                y: (ty0 + dy) * TILE_SIZE + TILE_SIZE / 2,
              };
            }
          }
        }
      }
      if (!landTile) continue;
      // Recrée les unités sur la terre et donne ordre d'attaque sur le HDV
      const targetHdvX = boat._navalLanding.x, targetHdvY = boat._navalLanding.y;
      for (const pInfo of boat.passengers) {
        const pos = findFreeSpawnPos(landTile.x, landTile.y, 40 + Math.random() * 30, false);
        const unitId = `unit_${nextUnitId++}`;
        gameState.units[unitId] = {
          id: unitId, ownerId: bot.id,
          x: pos.x, y: pos.y, type: pInfo.type,
          hp: pInfo.hp, maxHp: pInfo.maxHp,
          speed: pInfo.speed, range: pInfo.range, damage: pInfo.damage, cost: pInfo.cost,
          targetX: targetHdvX + (Math.random() - 0.5) * 100,
          targetY: targetHdvY + (Math.random() - 0.5) * 100,
          attackTargetId: null, attackTargetType: null,
          lastAttackTime: 0,
          mode: 'move', defendX: pos.x, defendY: pos.y, defendRadius: 280,
        };
      }
      const count = boat.passengers.length;
      boat.passengers = [];
      boat._navalLanding = null;
      io.emit('boatDisembarked', { boatId: boat.id, count, x: landTile.x, y: landTile.y });
      console.log(`[Bot ${bot.name}] DÉBARQUE ${count} unités en (${landTile.x},${landTile.y})`);
    }
  }
}

function unitTypeUnlocked(player, typeId) {
  const def = UNIT_TYPES[typeId];
  if (!def) return false;
  if (!def.requiresTech) return true;
  return hasTech(player, def.requiresTech);
}

// Fallback en coin DYNAMIQUE (relatif à la taille actuelle de la map).
// Bug fix : auparavant hardcodé { x:500, y:500 }, { x:4000, y:500 }… ce qui
// envoyait 3 HDV sur 4 HORS de la map quand celle-ci faisait 3000 (Petite).
// `isWaterTile` retourne false pour les tiles hors-grille → la boucle de
// correction "push vers le centre" ne se déclenchait pas, et le HDV du bot
// finissait positionné à (4000, …) hors de la map 3000×3000.
function fallbackSpawns() {
  const m = SPAWN_MARGIN;
  return [
    { x: m,             y: m              },
    { x: MAP_WIDTH - m, y: m              },
    { x: m,             y: MAP_HEIGHT - m },
    { x: MAP_WIDTH - m, y: MAP_HEIGHT - m },
  ];
}

const COLORS = ['#ff6b6b', '#4dabf7', '#69db7c', '#ffd43b']; // rouge corail, bleu ciel, vert pomme, jaune solaire

// Génère MAX_PLAYERS points avec distance min entre eux (rejection sampling).
// Fallback aux coins si on n'arrive pas à placer.
function generateSpawns() {
  const spawns = [];
  let attempts = 0;
  while (spawns.length < MAX_PLAYERS && attempts < SPAWN_MAX_ATTEMPTS) {
    attempts++;
    const x = SPAWN_MARGIN + Math.random() * (MAP_WIDTH  - 2 * SPAWN_MARGIN);
    const y = SPAWN_MARGIN + Math.random() * (MAP_HEIGHT - 2 * SPAWN_MARGIN);
    // Refuse les spawns sur l'eau ou avec une water tile dans les 3 tiles autour
    if (isWaterAt(x, y)) continue;
    let nearWater = false;
    for (let dy = -2; dy <= 2 && !nearWater; dy++) {
      for (let dx = -2; dx <= 2 && !nearWater; dx++) {
        if (isWaterAt(x + dx * TILE_SIZE, y + dy * TILE_SIZE)) nearWater = true;
      }
    }
    if (nearWater) continue;
    const ok = spawns.every(s => Math.hypot(s.x - x, s.y - y) >= MIN_SPAWN_DIST);
    if (ok) spawns.push({ x: Math.round(x), y: Math.round(y) });
  }
  if (spawns.length < MAX_PLAYERS) {
    console.warn(`generateSpawns: only placed ${spawns.length}/${MAX_PLAYERS} after ${attempts} tries, using fallback corners`);
    // Fallback : utilise les coins mais vérifie qu'ils sont sur terre, sinon les pousse vers le centre.
    // Les coins sont recalculés à partir de la taille de map ACTUELLE (cf. fallbackSpawns).
    return fallbackSpawns().map(s => {
      let x = s.x, y = s.y;
      // Clamp dans la map (sécurité supplémentaire)
      x = Math.max(SPAWN_MARGIN, Math.min(MAP_WIDTH  - SPAWN_MARGIN, x));
      y = Math.max(SPAWN_MARGIN, Math.min(MAP_HEIGHT - SPAWN_MARGIN, y));
      // Évite l'eau : pousse vers le centre par pas de 20 %
      let safety = 20;
      while (isWaterAt(x, y) && safety-- > 0) {
        x += (MAP_WIDTH/2 - x) * 0.2;
        y += (MAP_HEIGHT/2 - y) * 0.2;
      }
      return { x: Math.round(x), y: Math.round(y) };
    });
  }
  console.log('Random spawns:', spawns.map(s => `(${s.x},${s.y})`).join(' '));
  return spawns;
}

// Initialisation map (waterTiles, dimensions, grid)
applyMapConfig(DEFAULT_MAP_TYPE, DEFAULT_MAP_SIZE);
let currentSpawns = generateSpawns();
let initialVillages = generateVillages(currentSpawns);
let initialCamps    = generateCamps(currentSpawns, initialVillages);

// playerId → { explored: Uint8Array, visible: Uint8Array }
const playerVisibility = {};

function initVisibility(playerId) {
  playerVisibility[playerId] = {
    explored: new Uint8Array(GRID_W * GRID_H),
    visible:  new Uint8Array(GRID_W * GRID_H),
  };
}

function resetVisibilityAll() {
  for (const v of Object.values(playerVisibility)) {
    v.explored.fill(0);
    v.visible.fill(0);
  }
}

// Marque les tuiles dans le rayon r autour de (cx, cy) dans arr (Uint8Array).
function markCircle(arr, cx, cy, r) {
  const minTx = Math.max(0, Math.floor((cx - r) / TILE_SIZE));
  const maxTx = Math.min(GRID_W - 1, Math.floor((cx + r) / TILE_SIZE));
  const minTy = Math.max(0, Math.floor((cy - r) / TILE_SIZE));
  const maxTy = Math.min(GRID_H - 1, Math.floor((cy + r) / TILE_SIZE));
  const r2 = r * r;
  for (let ty = minTy; ty <= maxTy; ty++) {
    const row = ty * GRID_W;
    const py  = ty * TILE_SIZE + TILE_SIZE / 2;
    const dy  = py - cy;
    const dy2 = dy * dy;
    for (let tx = minTx; tx <= maxTx; tx++) {
      const px = tx * TILE_SIZE + TILE_SIZE / 2;
      const dx = px - cx;
      if (dx * dx + dy2 <= r2) arr[row + tx] = 1;
    }
  }
}

function computeVisibility(player) {
  const vis = playerVisibility[player.id];
  if (!vis) return;
  vis.visible.fill(0);
  if (!player.eliminated && player.hp > 0) {
    // Tech 'cartography' : révèle TOUT la map (vision instantanée partout)
    if (hasTech(player, 'cartography')) {
      vis.visible.fill(1);
    } else {
      markCircle(vis.visible, player.x, player.y, player.vision || HDV_LEVELS[0].vision);
      for (const unit of Object.values(gameState.units)) {
        if (unit.ownerId === player.id) markCircle(vis.visible, unit.x, unit.y, unitVisionRadius(unit));
      }
      for (const v of gameState.villages) {
        if (v.ownerId !== player.id || v.destroyed) continue;
        markCircle(vis.visible, v.x, v.y, VILLAGE_VISION);
      }
    }
  }
  // OR dans explored
  const ex = vis.explored, vi = vis.visible;
  for (let i = 0; i < vi.length; i++) if (vi[i]) ex[i] = 1;
}

function buildFilteredState(viewerId) {
  const viewer = gameState.players[viewerId];
  if (!viewer) return null;
  const vis = playerVisibility[viewerId];
  const seeAll = viewer.eliminated || !vis;

  const filteredPlayers = {};
  const filteredUnits   = {};
  const playerSummary   = [];

  for (const [pid, p] of Object.entries(gameState.players)) {
    // Les techs débloquées sont PUBLIQUES (visibles par tous, indépendamment du fog)
    // → permet d'afficher les effets visuels de passifs sur les unités/bâtiments
    //   d'un joueur même quand son HDV est dans le brouillard. Robin a explicitement
    //   demandé que les ennemis voient les passifs adverses.
    playerSummary.push({
      id: p.id, name: p.name, color: p.color, eliminated: p.eliminated,
      unlockedTechs: Array.isArray(p.unlockedTechs) ? p.unlockedTechs.slice() : [],
    });
    if (seeAll || pid === viewerId) { filteredPlayers[pid] = p; continue; }
    const idx = Math.floor(p.y / TILE_SIZE) * GRID_W + Math.floor(p.x / TILE_SIZE);
    // HDV : visible si tuile visible OU explorée (HDV statique = on garde la mémoire)
    if (vis.visible[idx] || vis.explored[idx]) filteredPlayers[pid] = p;
  }

  for (const [uid, u] of Object.entries(gameState.units)) {
    if (seeAll || u.ownerId === viewerId) { filteredUnits[uid] = u; continue; }
    const idx = Math.floor(u.y / TILE_SIZE) * GRID_W + Math.floor(u.x / TILE_SIZE);
    // Unité : visible uniquement si tuile actuellement visible (pas la mémoire)
    if (vis.visible[idx]) filteredUnits[uid] = u;
  }

  // Villages — visibles si tuile actuellement visible OU explorée
  const filteredVillages = [];
  for (const v of gameState.villages) {
    if (seeAll) { filteredVillages.push(v); continue; }
    const idx = Math.floor(v.y / TILE_SIZE) * GRID_W + Math.floor(v.x / TILE_SIZE);
    if (vis.visible[idx] || vis.explored[idx]) filteredVillages.push(v);
  }

  // Bâtiments — visibles uniquement si tuile actuellement visible (pas la mémoire)
  // (les bâtiments peuvent être détruits, donc on ne montre pas un fantôme exploré)
  const filteredBuildings = [];
  for (const b of gameState.buildings) {
    if (seeAll || b.ownerId === viewerId) { filteredBuildings.push(b); continue; }
    const idx = Math.floor(b.y / TILE_SIZE) * GRID_W + Math.floor(b.x / TILE_SIZE);
    if (vis.visible[idx]) filteredBuildings.push(b);
  }

  // Passif 'minimap_omniscience' (renaissance, Science T6) : positions BRUTES
  // de tous les joueurs / unités / villages / bâtiments, non filtrées par fog.
  // Le client (Minimap) les utilise pour afficher tous les mouvements ennemis.
  // Payload léger : juste les coords + ownerId + type, pas les stats complètes.
  let omniscient = null;
  if (hasTech(viewer, 'renaissance')) {
    omniscient = {
      players: Object.values(gameState.players).map(p => ({
        id: p.id, x: p.x, y: p.y, color: p.color, eliminated: !!p.eliminated,
      })),
      villages: gameState.villages.map(v => ({
        id: v.id, x: v.x, y: v.y, ownerId: v.ownerId || null, hp: v.hp,
      })),
      units: Object.values(gameState.units).map(u => ({
        id: u.id, x: u.x, y: u.y, ownerId: u.ownerId, type: u.type,
      })),
      buildings: gameState.buildings.map(b => ({
        id: b.id, x: b.x, y: b.y, ownerId: b.ownerId, type: b.type,
      })),
    };
  }

  // Camps de bandits — toujours visibles sur la minimap (objectifs PvE connus).
  const campsLite = gameState.camps.map(c => ({ id: c.id, x: c.x, y: c.y, cleared: c.cleared }));

  return {
    players: filteredPlayers,
    units: filteredUnits,
    villages: filteredVillages,
    camps: campsLite,
    buildings: filteredBuildings,
    matchState: gameState.matchState,
    winnerId: gameState.winnerId,
    matchStartTime: gameState.matchStartTime,
    playerSummary,
    omniscient,
    fog: seeAll ? null : {
      visible:  Buffer.from(vis.visible.buffer, vis.visible.byteOffset, vis.visible.byteLength),
      explored: Buffer.from(vis.explored.buffer, vis.explored.byteOffset, vis.explored.byteLength),
      gridW: GRID_W,
      gridH: GRID_H,
      tileSize: TILE_SIZE,
    },
  };
}

function broadcastFilteredState() {
  // 1. Calculer la visibilité de chaque joueur
  for (const player of Object.values(gameState.players)) computeVisibility(player);
  // 2. Émettre l'état filtré à chacun
  for (const pid of Object.keys(gameState.players)) {
    const filtered = buildFilteredState(pid);
    if (filtered) io.to(pid).emit('gameState', filtered);
  }
}

const gameState = {
  players: {},
  units: {},
  villages: initialVillages,
  camps: initialCamps,
  buildings: [],
  matchState: 'waiting',
  winnerId: null,
  matchStartTime: null,
};
let nextBuildingId = 1;
let nextUnitId = 1;
let tickCount  = 0;
let peakPlayerCount = 0;

// Spawn initial des entités PvE neutres (gameState + nextUnitId existent maintenant)
spawnAllCampMobs();
spawnAllFauna(currentSpawns);

app.use(express.static('public'));

function getAvailableSlot() {
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const taken = Object.values(gameState.players).some(p => p.slot === i);
    if (!taken) return i;
  }
  return -1;
}

function computeDesiredDir(unit, goalX, goalY, skipPlayerId = null, skipBuildingId = null) {
  const dx = goalX - unit.x;
  const dy = goalY - unit.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return [0, 0];

  let desiredX = dx / dist;
  let desiredY = dy / dist;

  // Évite les HDV
  for (const hdv of Object.values(gameState.players)) {
    if (skipPlayerId && hdv.id === skipPlayerId) continue;
    if (Math.hypot(goalX - hdv.x, goalY - hdv.y) < HDV_HALF_SIZE + 60) continue;

    const aheadX = unit.x + desiredX * LOOK_AHEAD;
    const aheadY = unit.y + desiredY * LOOK_AHEAD;
    const toHdvX = aheadX - hdv.x;
    const toHdvY = aheadY - hdv.y;
    const distSq = toHdvX * toHdvX + toHdvY * toHdvY;
    const avoidR = HDV_HALF_SIZE + UNIT_RADIUS + AVOID_BUFFER;
    if (distSq > 0 && distSq < avoidR * avoidR) {
      const d = Math.sqrt(distSq);
      const strength = (1 - d / avoidR) * AVOID_STRENGTH;
      desiredX += (toHdvX / d) * strength;
      desiredY += (toHdvY / d) * strength;
    }
  }

  // Évite les bâtiments (sauf si c'est la cible courante)
  for (const b of gameState.buildings) {
    if (skipBuildingId && b.id === skipBuildingId) continue;
    const def = BUILDING_TYPES[b.type];
    if (!def) continue;
    const half = def.halfSize || 22;
    // Si le goal est lui-même dans/près du bâtiment, on ne l'évite pas (on veut aller dessus)
    if (Math.hypot(goalX - b.x, goalY - b.y) < half + 30) continue;
    const aheadX = unit.x + desiredX * LOOK_AHEAD;
    const aheadY = unit.y + desiredY * LOOK_AHEAD;
    const toBX = aheadX - b.x;
    const toBY = aheadY - b.y;
    const distSq = toBX * toBX + toBY * toBY;
    const avoidR = half + UNIT_RADIUS + 20; // buffer un peu plus petit que HDV
    if (distSq > 0 && distSq < avoidR * avoidR) {
      const d = Math.sqrt(distSq);
      const strength = (1 - d / avoidR) * 1.4; // un peu plus doux que les HDV
      desiredX += (toBX / d) * strength;
      desiredY += (toBY / d) * strength;
    }
  }

  const len = Math.hypot(desiredX, desiredY);
  if (len > 0) { desiredX /= len; desiredY /= len; }
  return [desiredX, desiredY];
}

function unitToHdvDist(unit, hdv) {
  const cx = Math.max(hdv.x - HDV_HALF_SIZE, Math.min(unit.x, hdv.x + HDV_HALF_SIZE));
  const cy = Math.max(hdv.y - HDV_HALF_SIZE, Math.min(unit.y, hdv.y + HDV_HALF_SIZE));
  return Math.hypot(unit.x - cx, unit.y - cy);
}

function buildGameOverPayload(winnerId, reason) {
  const matchDurationMs = gameState.matchStartTime ? Date.now() - gameState.matchStartTime : 0;
  const winner = winnerId ? gameState.players[winnerId] : null;
  const players = Object.values(gameState.players).map(p => {
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      kills: p.kills,
      unitsCreated: p.unitsCreated,
      totalGoldEarned: p.totalGoldEarned,
      gold: p.gold,
      eliminated: p.eliminated,
      finalScore: p.gold + Object.values(gameState.units)
        .filter(u => u.ownerId === p.id)
        .reduce((sum, u) => sum + (u.cost || 10), 0),
    };
  });
  players.sort((a, b) => b.finalScore - a.finalScore);
  return {
    winnerId,
    winnerName: winner ? winner.name : null,
    winnerColor: winner ? winner.color : null,
    reason,
    matchDurationMs,
    players,
  };
}

function emitGameOver(winnerId, reason) {
  gameState.matchState = 'ended';
  gameState.winnerId = winnerId;
  io.emit('gameOver', buildGameOverPayload(winnerId, reason));
}

function checkMatchState() {
  if (gameState.matchState === 'ended') return;

  const players = Object.values(gameState.players);
  const alive   = players.filter(p => !p.eliminated);

  if (peakPlayerCount < 2) {
    gameState.matchState = 'waiting';
    gameState.matchStartTime = null;
    return;
  }

  if (alive.length >= 2) {
    if (gameState.matchState !== 'playing') {
      gameState.matchState = 'playing';
      if (!gameState.matchStartTime) gameState.matchStartTime = Date.now();
    }
  } else if (alive.length === 1) {
    const winner = alive[0];
    emitGameOver(winner.id, 'elimination');
    console.log(`Game over! Winner: ${winner.name}`);
  } else {
    emitGameOver(null, 'draw');
    console.log('Game over! Draw (0 players alive)');
  }
}

function eliminatePlayer(player, toDelete) {
  if (player.eliminated) return;
  player.eliminated     = true;
  player.eliminatedAt   = Date.now();
  player.hp             = 0;
  for (const uid of Object.keys(gameState.units)) {
    if (gameState.units[uid].ownerId === player.id) toDelete.add(uid);
  }
  io.emit('playerEliminated', { playerId: player.id, name: player.name, color: player.color });
  const aliveCount = Object.values(gameState.players).filter(p => !p.eliminated).length;
  console.log(`Player ${player.id} eliminated. ${aliveCount} players left`);
  checkMatchState();
}

function resetMatch() {
  currentSpawns = generateSpawns();
  gameState.villages = generateVillages(currentSpawns);
  gameState.camps    = generateCamps(currentSpawns, gameState.villages);
  gameState.buildings = [];
  resetVisibilityAll();
  for (const p of Object.values(gameState.players)) {
    p.hdvLevel        = 1;
    p.techPoints      = 0;
    p.researchedTechs = [];
    p.researchPoints  = 0;
    p.mana            = 0;
    p.faith           = 0;
    p.unlockedTechs   = [];
    p.activeSpells    = [];
    p.allies          = [];
    p.hp              = HDV_LEVELS[0].maxHp;
    p.maxHp           = HDV_LEVELS[0].maxHp;
    p.vision          = HDV_LEVELS[0].vision;
    p.eliminated      = false;
    p.eliminatedAt    = null;
    p.gold            = 0;
    p.kills           = 0;
    p.unitsCreated    = 0;
    p.totalGoldEarned = 0;
    p.joinTime        = Date.now();
    const spawn = currentSpawns[p.slot];
    p.x = spawn.x;
    p.y = spawn.y;
  }
  for (const uid of Object.keys(gameState.units)) delete gameState.units[uid];
  spawnAllCampMobs();
  spawnAllFauna(currentSpawns);
  const playerCount        = Object.keys(gameState.players).length;
  peakPlayerCount          = playerCount;
  gameState.winnerId       = null;
  gameState.matchStartTime = playerCount >= 2 ? Date.now() : null;
  gameState.matchState     = playerCount >= 2 ? 'playing' : 'waiting';
  console.log(`Match reset. State: ${gameState.matchState}, Players: ${playerCount}`);
}

io.on('connection', (socket) => {
  // Zombie recovery: ended state with no players left — auto-reset
  if (gameState.matchState === 'ended' && Object.keys(gameState.players).length === 0) {
    gameState.matchState     = 'waiting';
    gameState.winnerId       = null;
    gameState.matchStartTime = null;
    peakPlayerCount          = 0;
    for (const uid of Object.keys(gameState.units)) delete gameState.units[uid];
    currentSpawns = generateSpawns();
    gameState.villages = generateVillages(currentSpawns);
    gameState.camps    = generateCamps(currentSpawns, gameState.villages);
    gameState.buildings = [];
    spawnAllCampMobs();
    spawnAllFauna(currentSpawns);
    console.log('Recovered zombie ended state on new connection');
  }

  if (gameState.matchState === 'ended') {
    socket.emit('matchEnded');
    socket.disconnect(true);
    return;
  }

  const slot = getAvailableSlot();
  if (slot === -1) {
    console.log('Server full — refusing connection', socket.id);
    socket.emit('serverFull');
    socket.disconnect(true);
    return;
  }

  const rawName    = (socket.handshake.auth && socket.handshake.auth.name) || '';
  const playerName = rawName.trim().slice(0, 20) || `Joueur ${slot + 1}`;

  // Config map envoyée par le 1er joueur : appliquée si on est encore en waiting
  // et qu'aucun autre joueur n'est dans la partie (premier arrivé = premier servi)
  const reqMapType = (socket.handshake.auth && socket.handshake.auth.mapType) || null;
  const reqMapSize = (socket.handshake.auth && socket.handshake.auth.mapSize) || null;
  if ((reqMapType || reqMapSize)
      && gameState.matchState === 'waiting'
      && Object.keys(gameState.players).length === 0) {
    applyMapConfig(reqMapType, reqMapSize);
    currentSpawns       = generateSpawns();
    gameState.villages  = generateVillages(currentSpawns);
    gameState.buildings = [];
  }

  const spawn  = currentSpawns[slot];
  const player = {
    id: socket.id,
    slot,
    x: spawn.x,
    y: spawn.y,
    color: COLORS[slot],
    name: playerName,
    gold: 0,
    hp: HDV_LEVELS[0].maxHp,
    maxHp: HDV_LEVELS[0].maxHp,
    eliminated: false,
    eliminatedAt: null,
    kills: 0,
    unitsCreated: 0,
    totalGoldEarned: 0,
    joinTime: Date.now(),
    // Tech tree v2
    hdvLevel: 1,
    researchPoints: 0, mana: 0, faith: 0,
    unlockedTechs: [],
    techPoints: 0, researchedTechs: [], // legacy compat
    activeSpells: [],
    allies: [],
    vision: HDV_LEVELS[0].vision,
    populationUsed: 0, populationMax: BASE_POPULATION,
  };

  gameState.players[socket.id] = player;
  initVisibility(socket.id);
  peakPlayerCount = Math.max(peakPlayerCount, Object.keys(gameState.players).length);
  console.log(`Player "${playerName}" (${socket.id.slice(0,6)}) connected — slot ${slot}`);

  checkMatchState();
  socket.emit('init', {
    playerId: socket.id,
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    tileSize: TILE_SIZE,
    gridW: GRID_W,
    gridH: GRID_H,
    mapType: currentMapType,
    mapSize: currentMapSize,
    waterTiles: Buffer.from(waterTiles.buffer, waterTiles.byteOffset, waterTiles.byteLength),
    unitTypes: UNIT_TYPES,
    techTree: TECH_TREE,
    hdvLevels: HDV_LEVELS,
    villageRadius: VILLAGE_RADIUS,
    villageCaptureTicks: VILLAGE_CAPTURE_TICKS,
    villageMaxHp: VILLAGE_MAX_HP,
    villageUpgradeCost: VILLAGE_UPGRADE_COST,
    villageGoldPerSec: VILLAGE_GOLD_PER_SEC,
    villageLevels: VILLAGE_LEVELS,
    villageHalfSize: VILLAGE_HALF_SIZE,
    spawnPositions: currentSpawns,
    buildingTypes: BUILDING_TYPES,
    techTree: NEW_TECH_TREE, // arbre tech v2 radial
    spells: SPELLS,
    buildGrid: BUILD_GRID,
    buildingMinDistHdv: BUILDING_MIN_DIST_HDV,
  });
  broadcastFilteredState();

  socket.on('spawnUnit', (data) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    const typeId = (data && data.unitType) || 'soldier';
    const def    = UNIT_TYPES[typeId];
    if (!def) { socket.emit('spawnFailed', { reason: 'invalid_unit_type' }); return; }
    if (!unitTypeUnlocked(p, typeId)) {
      socket.emit('spawnFailed', { reason: 'unit_locked' });
      return;
    }
    // Check coûts : gold + mana (magie) ou foi (religion) selon l'unité
    if (p.gold < def.cost) {
      socket.emit('spawnFailed', { reason: 'not_enough_gold' });
      return;
    }
    if (def.manaCost && (p.mana || 0) < def.manaCost) {
      socket.emit('spawnFailed', { reason: 'not_enough_mana' });
      return;
    }
    if (def.faithCost && (p.faith || 0) < def.faithCost) {
      socket.emit('spawnFailed', { reason: 'not_enough_faith' });
      return;
    }
    // Check population : refuse si la nouvelle unité ferait dépasser le cap
    const popCost = def.populationCost || 1;
    const popUsed = getPopulationUsed(p);
    const popMax  = getPopulationMax(p);
    if (popUsed + popCost > popMax) {
      socket.emit('spawnFailed', { reason: 'population_cap', popUsed, popMax, popCost });
      return;
    }

    // Bateau : doit spawner depuis un port (et dans l'eau adjacente)
    let spawnX, spawnY;
    if (typeId === 'boat') {
      const ports = gameState.buildings.filter(b => b.type === 'port' && b.ownerId === socket.id && b.hp > 0);
      if (ports.length === 0) {
        socket.emit('spawnFailed', { reason: 'no_port' });
        return;
      }
      // Cherche la water tile la plus proche d'un port quelconque
      let found = null;
      for (const port of ports) {
        const tx0 = Math.floor(port.x / TILE_SIZE);
        const ty0 = Math.floor(port.y / TILE_SIZE);
        for (let r = 1; r <= 3 && !found; r++) {
          for (let dy = -r; dy <= r && !found; dy++) {
            for (let dx = -r; dx <= r && !found; dx++) {
              if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // anneau de rayon r
              if (isWaterTile(tx0 + dx, ty0 + dy)) {
                found = {
                  x: (tx0 + dx) * TILE_SIZE + TILE_SIZE / 2,
                  y: (ty0 + dy) * TILE_SIZE + TILE_SIZE / 2,
                };
              }
            }
          }
        }
        if (found) break;
      }
      if (!found) {
        socket.emit('spawnFailed', { reason: 'no_water_near_port' });
        return;
      }
      spawnX = found.x; spawnY = found.y;
    } else {
      // Cherche une position grass libre autour du HDV (évite spawn dans l'eau)
      const pos = findFreeSpawnPos(p.x, p.y, 70 + Math.random() * 30, false);
      spawnX = pos.x; spawnY = pos.y;
    }

    p.gold -= def.cost;
    if (def.manaCost)  p.mana  = Math.max(0, (p.mana  || 0) - def.manaCost);
    if (def.faithCost) p.faith = Math.max(0, (p.faith || 0) - def.faithCost);
    p.unitsCreated++;
    const unitId = `unit_${nextUnitId++}`;

    const hpBase = Math.round(def.hp * unitHpMult(p, typeId));
    const hpBonus = unitHpBonusFromVillages(p) + (hpBase - def.hp);
    gameState.units[unitId] = {
      id: unitId,
      ownerId: socket.id,
      x: spawnX,
      y: spawnY,
      type: typeId,
      hp: def.hp + hpBonus,
      maxHp: def.hp + hpBonus,
      speed: def.speed,
      range: def.range,
      damage: def.damage,
      cost: def.cost,
      targetX: null,
      targetY: null,
      attackTargetId:   null,
      attackTargetType: null,
      lastAttackTime: 0,
      // IA : par défaut, le pion défend son HDV avec un rayon de 320px.
      // Il y retourne après chaque combat et engage tout ennemi qui entre dans la zone.
      mode: 'defend',
      defendX: p.x,
      defendY: p.y,
      defendRadius: 320,
    };
  });

  socket.on('defendArea', ({ unitIds, x, y, radius }) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    if (!Array.isArray(unitIds) || unitIds.length > MAX_UNIT_BATCH) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const cx = Math.max(0, Math.min(MAP_WIDTH,  x));
    const cy = Math.max(0, Math.min(MAP_HEIGHT, y));
    const r  = Math.max(100, Math.min(600, radius || 280));
    const valid = unitIds.filter(id => gameState.units[id] && gameState.units[id].ownerId === socket.id);
    for (const id of valid) {
      const u = gameState.units[id];
      u.mode = 'defend';
      u.defendX = cx; u.defendY = cy; u.defendRadius = r;
      u.targetX = null; u.targetY = null;
      u.attackTargetId = null; u.attackTargetType = null;
    }
  });

  socket.on('upgradeHdv', () => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    if (p.hdvLevel >= MAX_HDV_LEVEL) return;
    const cost = HDV_LEVELS[p.hdvLevel - 1].upgradeCost;
    if (p.gold < cost) {
      socket.emit('spawnFailed', { reason: 'not_enough_gold' });
      return;
    }
    p.gold -= cost;
    p.hdvLevel += 1;
    p.researchPoints = (p.researchPoints || 0) + 50; // bonus PR à l'upgrade HDV
    recomputeHdvStats(p);
    p.hp = p.maxHp; // heal complet à l'upgrade
    console.log(`Player ${p.name} → HDV lv ${p.hdvLevel}`);
  });

  // ── Tech tree v2 : débloque un nœud via Points de Recherche (PR) ──
  // ── Diplomatie minimale : pacte de non-agression bilatéral ──
  // Implémentation simple : les deux joueurs doivent avoir la tech 'diplomacy'.
  // Premier qui clique = "demande envoyée" (proposalsOut). Si le deuxième envoie
  // dans l'autre sens, le pacte est conclu (ajout à `allies` des deux côtés).
  socket.on('proposeTreaty', ({ targetId } = {}) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    if (!hasTech(p, 'diplomacy')) return;
    const t = gameState.players[targetId];
    if (!t || t.eliminated || t.id === p.id) return;
    if (p.allies.includes(t.id)) return; // déjà alliés
    p.proposalsOut = p.proposalsOut || [];
    if (!p.proposalsOut.includes(t.id)) p.proposalsOut.push(t.id);
    // Si l'autre a déjà proposé : on conclut
    if ((t.proposalsOut || []).includes(p.id)) {
      p.allies.push(t.id);
      t.allies.push(p.id);
      p.proposalsOut = p.proposalsOut.filter(x => x !== t.id);
      t.proposalsOut = t.proposalsOut.filter(x => x !== p.id);
      io.emit('treatySigned', { a: p.id, b: t.id, aName: p.name, bName: t.name });
      console.log(`Pacte de non-agression : ${p.name} ↔ ${t.name}`);
    }
  });
  socket.on('breakTreaty', ({ targetId } = {}) => {
    const p = gameState.players[socket.id];
    const t = gameState.players[targetId];
    if (!p || !t) return;
    p.allies = (p.allies || []).filter(x => x !== t.id);
    t.allies = (t.allies || []).filter(x => x !== p.id);
    io.emit('treatyBroken', { a: p.id, b: t.id });
  });

  socket.on('unlockTech', ({ techId } = {}) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    const node = NEW_TECH_TREE[techId];
    if (!node) return;
    if ((p.unlockedTechs || []).includes(techId)) return;
    // Vérifie tous les prérequis
    for (const req of (node.requires || [])) {
      if (!(p.unlockedTechs || []).includes(req)) {
        socket.emit('spawnFailed', { reason: 'missing_requires' });
        return;
      }
    }
    if ((p.researchPoints || 0) < node.cost) {
      socket.emit('spawnFailed', { reason: 'not_enough_pr' });
      return;
    }
    p.researchPoints -= node.cost;
    p.unlockedTechs.push(techId);
    // Effets passifs immédiats (recompute stats si concerné)
    if (techId === 'citadel') {
      recomputeHdvStats(p);
      p.hp = p.maxHp; // heal full au moment de l'upgrade
    }
    console.log(`[${p.name}] tech débloquée : ${techId} (${node.cost} PR)`);
    io.emit('techUnlocked', { playerId: p.id, techId, name: node.name, icon: node.icon, axis: node.axis });
    // Broadcast immédiat pour que le client voie le nouvel état sans attendre le tick
    broadcastFilteredState();
  });
  // Legacy alias (ancien event, plus utilisé mais garde la compat)
  socket.on('researchTech', () => { /* no-op : remplacé par unlockTech */ });

  socket.on('moveUnits', ({ unitIds, targetX, targetY }) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    if (!Array.isArray(unitIds) || unitIds.length > MAX_UNIT_BATCH) return;
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;

    const cx = Math.max(0, Math.min(MAP_WIDTH,  targetX));
    const cy = Math.max(0, Math.min(MAP_HEIGHT, targetY));

    const valid = unitIds.filter(id => gameState.units[id] && gameState.units[id].ownerId === socket.id);
    if (valid.length === 0) return;

    for (const id of valid) {
      const unit = gameState.units[id];
      unit.targetX = cx;
      unit.targetY = cy;
      unit.attackTargetId   = null;
      unit.attackTargetType = null;
      unit.mode = 'move';
      // Pathfinding eau : calcule un waypoint de contournement si lac sur la trajectoire
      unit.waypoint = null;
      if (unit.type !== 'boat') {
        const waterCount = pathHasWaterCount(unit.x, unit.y, cx, cy);
        if (waterCount > 3) {
          const wp = findWaypointAroundWater(unit.x, unit.y, cx, cy);
          if (wp) unit.waypoint = wp;
        }
      }
    }
  });

  socket.on('attackTarget', ({ unitIds, targetId, targetType }) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    if (!Array.isArray(unitIds) || unitIds.length > MAX_UNIT_BATCH) return;
    if (!targetId || (targetType !== 'unit' && targetType !== 'hdv' && targetType !== 'village')) return;

    const valid = unitIds.filter(id => gameState.units[id] && gameState.units[id].ownerId === socket.id);
    if (valid.length === 0) return;

    for (const id of valid) {
      const unit = gameState.units[id];
      unit.attackTargetId   = targetId;
      unit.attackTargetType = targetType;
      unit.targetX = null;
      unit.targetY = null;
      unit.mode = 'attack';
    }
  });

  // ── Construction d'un bâtiment dans la zone d'une base (HDV/village) ──
  // ── Transport de troupes par bateau ────────────────────────────────
  // Capacité 4 passagers max par bateau. Embarquement nécessite proximité (≤ 100px).
  // Débarquement nécessite une tile terre (pas de l'eau).
  const BOAT_CAPACITY = 4;
  socket.on('embarkBoat', ({ boatId, unitIds } = {}) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    const boat = gameState.units[boatId];
    if (!boat || boat.ownerId !== socket.id || boat.type !== 'boat') return;
    if (!Array.isArray(unitIds)) return;
    boat.passengers = boat.passengers || [];
    let embarkedCount = 0;
    for (const uid of unitIds) {
      if (boat.passengers.length >= BOAT_CAPACITY) break;
      const u = gameState.units[uid];
      if (!u || u.ownerId !== socket.id) continue;
      if (u.type === 'boat') continue;
      if (Math.hypot(u.x - boat.x, u.y - boat.y) > 100) continue;
      // Mémorise l'état de l'unité (recréée à débarquement)
      boat.passengers.push({
        type: u.type, hp: u.hp, maxHp: u.maxHp,
        speed: u.speed, range: u.range, damage: u.damage, cost: u.cost,
      });
      delete gameState.units[uid];
      embarkedCount++;
    }
    if (embarkedCount > 0) {
      io.emit('boatEmbarked', { boatId, passengerCount: boat.passengers.length, embarked: embarkedCount });
      console.log(`Bateau ${boatId} : ${embarkedCount} unité(s) embarquée(s) (total ${boat.passengers.length}/${BOAT_CAPACITY})`);
    }
  });
  socket.on('disembarkBoat', ({ boatId, destX, destY } = {}) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    const boat = gameState.units[boatId];
    if (!boat || boat.ownerId !== socket.id || boat.type !== 'boat') return;
    if (!boat.passengers || boat.passengers.length === 0) return;
    if (!Number.isFinite(destX) || !Number.isFinite(destY)) return;
    // La destination doit être une tile terre (sinon le débarquement n'a pas de sens)
    if (isWaterAt(destX, destY)) {
      socket.emit('spawnFailed', { reason: 'must_disembark_on_land' });
      return;
    }
    // Pour chaque passager, recrée à proximité de destX/destY (tile terre)
    for (const pInfo of boat.passengers) {
      const pos = findFreeSpawnPos(destX, destY, 40 + Math.random() * 30, false);
      const unitId = `unit_${nextUnitId++}`;
      gameState.units[unitId] = {
        id: unitId, ownerId: socket.id,
        x: pos.x, y: pos.y, type: pInfo.type,
        hp: pInfo.hp, maxHp: pInfo.maxHp,
        speed: pInfo.speed, range: pInfo.range, damage: pInfo.damage, cost: pInfo.cost,
        targetX: null, targetY: null,
        attackTargetId: null, attackTargetType: null,
        lastAttackTime: 0,
        mode: 'defend', defendX: pos.x, defendY: pos.y, defendRadius: 280,
      };
    }
    const count = boat.passengers.length;
    boat.passengers = [];
    io.emit('boatDisembarked', { boatId, count, x: destX, y: destY });
    console.log(`Bateau ${boatId} : ${count} unité(s) débarquée(s) en (${destX}, ${destY})`);
  });

  // Vendre un bâtiment : rembourse 50% du coût initial, détruit le bâtiment.
  socket.on('sellBuilding', ({ buildingId } = {}) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    const idx = gameState.buildings.findIndex(b => b.id === buildingId);
    if (idx < 0) return;
    const b = gameState.buildings[idx];
    if (b.ownerId !== socket.id) return; // doit être le propriétaire
    const def = BUILDING_TYPES[b.type];
    if (!def) return;
    const refund = Math.floor((def.cost || 0) * 0.5);
    p.gold += refund;
    gameState.buildings.splice(idx, 1);
    io.emit('buildingSold', { buildingId, refund, ownerId: p.id });
    console.log(`${p.name} vend ${b.type} (+${refund} gold remboursés)`);
  });

  socket.on('buildBuilding', ({ type, x, y, baseType, baseId }) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    const def = BUILDING_TYPES[type];
    if (!def) return;
    if (def.requiresTech && !hasTech(p, def.requiresTech)) {
      socket.emit('spawnFailed', { reason: 'building_locked' });
      return;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    // Détermine la base ancre (HDV propre OU village possédé)
    let base, baseObj;
    if (baseType === 'hdv') {
      if (baseId && baseId !== p.id) return; // doit être son HDV
      baseObj = p; base = p;
    } else if (baseType === 'village') {
      const v = gameState.villages.find(vv => vv.id === baseId);
      if (!v || v.ownerId !== p.id) return;
      baseObj = v; base = v;
    } else {
      return;
    }
    // Snap au centre de la case de la grille (Clash-of-Clans style)
    const snapped = snapToGrid(x, y);
    x = snapped.x;
    y = snapped.y;
    // Position doit être dans le carré constructible (norme L∞ = max(|dx|,|dy|))
    const r = baseBuildRadius(baseType, baseObj);
    if (Math.max(Math.abs(x - base.x), Math.abs(y - base.y)) > r) {
      socket.emit('spawnFailed', { reason: 'out_of_build_zone' });
      return;
    }
    // Une case = 1 bâtiment max (collision exacte sur même case)
    for (const b of gameState.buildings) {
      if (b.x === x && b.y === y) {
        socket.emit('spawnFailed', { reason: 'cell_occupied' });
        return;
      }
    }
    // Trop près d'un HDV/village (zone de respect autour des bases)
    for (const pl of Object.values(gameState.players)) {
      if (Math.hypot(pl.x - x, pl.y - y) < BUILDING_MIN_DIST_HDV) {
        socket.emit('spawnFailed', { reason: 'too_close_to_base' });
        return;
      }
    }
    for (const vv of gameState.villages) {
      if (Math.hypot(vv.x - x, vv.y - y) < BUILDING_MIN_DIST_HDV) {
        socket.emit('spawnFailed', { reason: 'too_close_to_base' });
        return;
      }
    }
    // Port : doit avoir au moins une tile d'eau adjacente
    if (type === 'port' && !hasWaterNeighbor(x, y)) {
      socket.emit('spawnFailed', { reason: 'port_needs_water' });
      return;
    }
    // Coût
    if (p.gold < def.cost) {
      socket.emit('spawnFailed', { reason: 'not_enough_gold' });
      return;
    }
    p.gold -= def.cost;
    const bid = `b_${nextBuildingId++}`;
    gameState.buildings.push({
      id: bid,
      ownerId: p.id,
      type,
      x, y,
      hp: def.hp, maxHp: def.hp,
      lastAttackTime: 0,
    });
    console.log(`Bâtiment ${type} construit par ${p.name} en (${Math.round(x)},${Math.round(y)})`);
  });

  // ── Village : améliorer Lv1 → Lv2 ────────────────────────────
  socket.on('upgradeVillage', ({ villageId }) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    const v = gameState.villages.find(vv => vv.id === villageId);
    if (!v || v.ownerId !== socket.id) return;
    if (v.level >= MAX_VILLAGE_LEVEL) return;
    const curLvl = VILLAGE_LEVELS[v.level - 1] || VILLAGE_LEVELS[0];
    const cost = curLvl.upgradeCost;
    if (!cost) return; // niveau max
    if (p.gold < cost) {
      socket.emit('spawnFailed', { reason: 'not_enough_gold' });
      return;
    }
    p.gold -= cost;
    v.level += 1;
    const newLvl = VILLAGE_LEVELS[v.level - 1];
    v.maxHp = newLvl.maxHp;
    v.hp = Math.min(v.maxHp, v.hp + 150); // bonus heal à l'upgrade
    p.researchPoints = (p.researchPoints || 0) + 40 * v.level; // bonus PR croissant
    console.log(`Village ${v.id} amélioré Lv ${v.level} (${newLvl.name}) par ${p.name}`);
  });

  // ── Village : produire une unité (similaire à spawnUnit mais depuis un village) ──
  socket.on('villageSpawnUnit', ({ villageId, unitType }) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    const v = gameState.villages.find(vv => vv.id === villageId);
    if (!v || v.ownerId !== socket.id) return;
    const typeId = unitType || 'soldier';
    const def = UNIT_TYPES[typeId];
    if (!def) { socket.emit('spawnFailed', { reason: 'invalid_unit_type' }); return; }
    if (!villageAllowsUnit(v, p, typeId)) {
      socket.emit('spawnFailed', { reason: 'unit_locked_at_village' });
      return;
    }
    if (p.gold < def.cost) {
      socket.emit('spawnFailed', { reason: 'not_enough_gold' });
      return;
    }
    if (def.manaCost && (p.mana || 0) < def.manaCost) {
      socket.emit('spawnFailed', { reason: 'not_enough_mana' });
      return;
    }
    if (def.faithCost && (p.faith || 0) < def.faithCost) {
      socket.emit('spawnFailed', { reason: 'not_enough_faith' });
      return;
    }
    // Check population
    const popCost = def.populationCost || 1;
    if (getPopulationUsed(p) + popCost > getPopulationMax(p)) {
      socket.emit('spawnFailed', { reason: 'population_cap' });
      return;
    }
    p.gold -= def.cost;
    if (def.manaCost)  p.mana  = Math.max(0, (p.mana  || 0) - def.manaCost);
    if (def.faithCost) p.faith = Math.max(0, (p.faith || 0) - def.faithCost);
    p.unitsCreated++;
    const pos = findFreeSpawnPos(v.x, v.y, 55 + Math.random() * 25, false);
    const unitId = `unit_${nextUnitId++}`;
    const vHp = Math.round(def.hp * unitHpMult(p, typeId));
    gameState.units[unitId] = {
      id: unitId, ownerId: socket.id,
      x: pos.x, y: pos.y,
      type: typeId,
      hp: vHp, maxHp: vHp,
      speed: def.speed, range: def.range, damage: def.damage, cost: def.cost,
      targetX: null, targetY: null,
      attackTargetId: null, attackTargetType: null,
      lastAttackTime: 0,
      // Mode défense centré sur le village (base secondaire)
      mode: 'defend', defendX: v.x, defendY: v.y, defendRadius: 280,
    };
  });

  // ── DEBUG : spawn instantané gratuit (à retirer après branchement arbre tech) ──
  socket.on('debugSpawn', ({ entityType, x, y } = {}) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const cx = Math.max(0, Math.min(MAP_WIDTH,  x));
    const cy = Math.max(0, Math.min(MAP_HEIGHT, y));

    // Bâtiments : insère dans gameState.buildings
    const bdef = BUILDING_TYPES[entityType];
    if (bdef) {
      const bid = `b_${nextBuildingId++}`;
      gameState.buildings.push({
        id: bid, ownerId: p.id, type: entityType,
        x: cx, y: cy, hp: bdef.hp, maxHp: bdef.hp, lastAttackTime: 0,
      });
      return;
    }
    // Unités : insère dans gameState.units
    const udef = UNIT_TYPES[entityType];
    if (udef) {
      const unitId = `unit_${nextUnitId++}`;
      gameState.units[unitId] = {
        id: unitId, ownerId: p.id,
        x: cx, y: cy, type: entityType,
        hp: udef.hp, maxHp: udef.hp,
        speed: udef.speed, range: udef.range, damage: udef.damage, cost: 0,
        targetX: null, targetY: null,
        attackTargetId: null, attackTargetType: null,
        lastAttackTime: 0,
        mode: 'defend', defendX: cx, defendY: cy, defendRadius: 320,
        spawnTime: Date.now(),
      };
    }
  });

  // ── DEBUG : portail de téléportation (cast direct, gratuit) ──
  socket.on('debugCastPortal', ({ unitIds, destX, destY } = {}) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    if (!Number.isFinite(destX) || !Number.isFinite(destY)) return;
    if (!Array.isArray(unitIds)) return;
    const tx = Math.max(0, Math.min(MAP_WIDTH,  destX));
    const ty = Math.max(0, Math.min(MAP_HEIGHT, destY));
    for (const uid of unitIds) {
      const u = gameState.units[uid];
      if (!u || u.ownerId !== socket.id) continue;
      u.x = tx + (Math.random() - 0.5) * 60;
      u.y = ty + (Math.random() - 0.5) * 60;
      u.targetX = null; u.targetY = null;
      u.attackTargetId = null; u.attackTargetType = null;
    }
    io.emit('spellCast', { spellId: 'portal', x: tx, y: ty, casterId: p.id, color: p.color, radius: 80 });
  });

  socket.on('addBot', () => {
    if (Object.keys(gameState.players).length >= MAX_PLAYERS) return;
    addBot();
    broadcastFilteredState();
  });

  // ── Sorts actifs ──── DÉSACTIVÉS ──
  // Les sorts ont été remplacés par des passifs / unit unlocks dans l'arbre tech.
  // Les unités boss (élémentaire, ange, dragon, avatar divin) se produisent
  // désormais via spawnUnit normal (gold + mana/foi + population).
  // L'event reste en place pour compat client mais ne fait rien.
  socket.on('castSpell', () => { /* no-op : sorts supprimés */ });
  socket.on('_legacyCastSpell_disabled', ({ spellId, x, y } = {}) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    const spell = SPELLS[spellId];
    if (!spell) return;
    if (spell.requiresTech && !hasTech(p, spell.requiresTech)) {
      socket.emit('spawnFailed', { reason: 'spell_locked' });
      return;
    }
    // Cooldown serveur (anti-spam)
    p.spellCooldowns = p.spellCooldowns || {};
    const lastCast = p.spellCooldowns[spellId] || 0;
    if (Date.now() - lastCast < 400) return;
    const costType = spell.costType || 'mana';
    if ((p[costType] || 0) < spell.cost) {
      socket.emit('spawnFailed', { reason: costType === 'faith' ? 'not_enough_faith' : 'not_enough_mana' });
      return;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    // Clamp aux bornes de la map (anti-cheat)
    x = Math.max(0, Math.min(MAP_WIDTH,  x));
    y = Math.max(0, Math.min(MAP_HEIGHT, y));
    p[costType] -= spell.cost;
    p.spellCooldowns[spellId] = Date.now();

    const isAlly = (u) => u.ownerId === p.id || (p.allies && p.allies.includes(u.ownerId));

    if (spell.type === 'aoe_damage') {
      for (const u of Object.values(gameState.units)) {
        if (isAlly(u)) continue;
        if (Math.hypot(u.x - x, u.y - y) <= spell.radius) {
          u.hp -= spell.damage;
        }
      }
    } else if (spell.type === 'aoe_slow') {
      const until = Date.now() + spell.durationMs;
      for (const u of Object.values(gameState.units)) {
        if (isAlly(u)) continue;
        if (Math.hypot(u.x - x, u.y - y) <= spell.radius) {
          u.frozenUntil = until;
        }
      }
    } else if (spell.type === 'aoe_heal') {
      for (const u of Object.values(gameState.units)) {
        if (!isAlly(u)) continue;
        if (Math.hypot(u.x - x, u.y - y) <= spell.radius) {
          u.hp = Math.min(u.maxHp || u.hp, u.hp + spell.heal);
        }
      }
    } else if (spell.type === 'aoe_purify') {
      for (const u of Object.values(gameState.units)) {
        if (isAlly(u)) continue;
        if (Math.hypot(u.x - x, u.y - y) <= spell.radius) {
          const dmg = spell.damage * (MAGIC_UNDEAD.has(u.type) ? (spell.magicMult || 1) : 1);
          u.hp -= dmg;
        }
      }
    } else if (spell.type === 'summon_unit') {
      // Invocation : crée une unité du type spécifié, propriétaire du caster
      const udef = UNIT_TYPES[spell.unitType];
      if (!udef) return;
      // 1×/partie : refuse si déjà cast
      if (spell.oncePerMatch) {
        p.spellsUsedOnce = p.spellsUsedOnce || {};
        if (p.spellsUsedOnce[spellId]) {
          // Rembourse la ressource (déjà débitée plus haut)
          p[costType] += spell.cost;
          socket.emit('spawnFailed', { reason: 'spell_once_per_match' });
          return;
        }
        p.spellsUsedOnce[spellId] = true;
      }
      const unitId = `unit_${nextUnitId++}`;
      gameState.units[unitId] = {
        id: unitId, ownerId: p.id,
        x, y, type: spell.unitType,
        hp: udef.hp, maxHp: udef.hp,
        speed: udef.speed, range: udef.range, damage: udef.damage, cost: 0,
        targetX: null, targetY: null,
        attackTargetId: null, attackTargetType: null,
        lastAttackTime: 0,
        mode: 'defend', defendX: x, defendY: y, defendRadius: 320,
        spawnTime: Date.now(),
      };
      io.emit('unitSummoned', { unitId, type: spell.unitType, x, y, ownerId: p.id });
    }
    // Broadcast pour l'animation côté client
    io.emit('spellCast', { spellId, x, y, casterId: p.id, color: p.color, radius: spell.radius || 80 });
  });

  socket.on('requestRestart', () => {
    if (gameState.matchState !== 'ended') return;
    resetMatch();
    console.log(`Match restarted by ${socket.id.slice(0,6)}`);
    io.emit('matchRestarted');
    broadcastFilteredState();
  });

  socket.on('disconnect', () => {
    const player   = gameState.players[socket.id];
    const wasAlive = player && !player.eliminated;

    for (const [unitId, unit] of Object.entries(gameState.units)) {
      if (unit.ownerId === socket.id) delete gameState.units[unitId];
    }
    // Nettoyage diplomatie : retire le joueur de toutes les alliances et propositions
    for (const pl of Object.values(gameState.players)) {
      if (pl.id === socket.id) continue;
      if (Array.isArray(pl.allies))        pl.allies        = pl.allies.filter(id => id !== socket.id);
      if (Array.isArray(pl.proposalsOut))  pl.proposalsOut  = pl.proposalsOut.filter(id => id !== socket.id);
    }
    delete gameState.players[socket.id];
    delete playerVisibility[socket.id];
    console.log(`Player ${socket.id.slice(0,6)} disconnected`);

    // Plus aucun humain : on vire aussi les bots et on reset
    const humansLeft = Object.values(gameState.players).filter(p => !p.isBot).length;
    if (humansLeft === 0) {
      // Supprime les bots et leurs unités
      for (const pid of Object.keys(gameState.players)) {
        if (gameState.players[pid].isBot) {
          delete gameState.players[pid];
          delete playerVisibility[pid];
        }
      }
      for (const uid of Object.keys(gameState.units)) delete gameState.units[uid];
      gameState.matchState     = 'waiting';
      gameState.winnerId       = null;
      gameState.matchStartTime = null;
      peakPlayerCount          = 0;
      currentSpawns = generateSpawns();
      gameState.villages = generateVillages(currentSpawns);
      gameState.camps    = generateCamps(currentSpawns, gameState.villages);
      gameState.buildings = [];
      spawnAllCampMobs();
      spawnAllFauna(currentSpawns);
      console.log('No humans left, full reset (bots removed)');
    } else if (wasAlive) {
      checkMatchState();
    }

    broadcastFilteredState();
  });
});

// Game loop — order: behavior → move → collisions → combat → gold → broadcast
setInterval(() => {
  tickCount++;
  const nowMs = Date.now();

  // 0. Behavior IA — auto-cible selon le mode (defend / move opportuniste)
  for (const unit of Object.values(gameState.units)) {
    if (unit.attackTargetId !== null) continue; // déjà engagé

    if (unit.mode === 'defend') {
      const radius = unit.defendRadius || 320;
      const cx = unit.defendX, cy = unit.defendY;
      let best = null, bestScore = Infinity, bestType = null;
      // Cible prioritaire : la plus faible en HP dans le rayon (focus kill)
      // Score = hp + 0.5 * distance (ratio simple)
      for (const other of Object.values(gameState.units)) {
        if (sameSide(other.ownerId, unit.ownerId)) continue;
        const d = Math.hypot(other.x - cx, other.y - cy);
        if (d > radius) continue;
        const score = other.hp + d * 0.3;
        if (score < bestScore) { best = other; bestScore = score; bestType = 'unit'; }
      }
      for (const player of Object.values(gameState.players)) {
        if (player.id === unit.ownerId || player.hp <= 0 || player.eliminated) continue;
        const d = Math.hypot(player.x - cx, player.y - cy);
        if (d > radius + HDV_HALF_SIZE) continue;
        // HDVs : moins prioritaires (gros HP) mais reste cible si rien d'autre
        const score = player.hp * 0.05 + d * 0.3 + 200; // pénalité pour préférer les unités
        if (score < bestScore) { best = player; bestScore = score; bestType = 'hdv'; }
      }
      if (best) {
        unit.attackTargetId = best.id;
        unit.attackTargetType = bestType;
        // Aggro de groupe : les alliés libres proches focus le même ennemi
        if (bestType === 'unit') rallyNearbyAllies(unit, best.id, 'unit');
      } else {
        // Pas d'ennemi en vue : retourne au point de défense si trop loin
        const dToCenter = Math.hypot(cx - unit.x, cy - unit.y);
        if (dToCenter > 40) {
          unit.targetX = cx;
          unit.targetY = cy;
        } else {
          unit.targetX = null;
          unit.targetY = null;
        }
      }
    } else if (unit.mode === 'move') {
      // Engagement opportuniste : si un ennemi entre à portée+40 sur le chemin → attaque
      const scanR = (unit.range || 80) + 40;
      let nearest = null, nearestDist = scanR;
      for (const other of Object.values(gameState.units)) {
        if (sameSide(other.ownerId, unit.ownerId)) continue;
        const d = Math.hypot(other.x - unit.x, other.y - unit.y);
        if (d < nearestDist) { nearest = other; nearestDist = d; }
      }
      if (nearest) {
        unit.attackTargetId = nearest.id;
        unit.attackTargetType = 'unit';
        rallyNearbyAllies(unit, nearest.id, 'unit');
        // On garde targetX/targetY : après le kill, la cible est null et le pion reprend sa route
      }
    } else if (unit.mode === 'wander') {
      // Faune : erre lentement autour de son origine. Passive (la riposte est gérée
      // par le code de riposte générique à la prise de dégâts).
      const nowW = Date.now();
      if (unit.targetX === null && nowW >= (unit.wanderNextMs || 0)) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * FAUNA_WANDER_RADIUS;
        unit.targetX = unit.wanderOriginX + Math.cos(a) * r;
        unit.targetY = unit.wanderOriginY + Math.sin(a) * r;
        unit.wanderNextMs = nowW + FAUNA_WANDER_MS + Math.random() * 2000;
      }
    }
    // mode === 'attack' ou non défini : aucune auto-cible (comportement existant)
  }

  // 1. Move (ATTACK_MOVE / MOVE / IDLE) — stats par unité
  for (const unit of Object.values(gameState.units)) {
    const baseSpeed = unit.speed || 80;
    const isFrozen  = unit.frozenUntil  && unit.frozenUntil  > nowMs;
    const isFeared  = unit.fearedUntil  && unit.fearedUntil  > nowMs;
    // Bonus tech : Téléportation/Mobilité magique → +15% vitesse toutes unités
    const owner = gameState.players[unit.ownerId];
    let speedBonus = 1.0;
    if (owner && hasTech(owner, 'teleportation')) speedBonus *= 1.15;
    // Bonus tech 'lightning' (magic_speed_vision) → +25% vitesse pour unités magie
    if (owner && hasTech(owner, 'lightning') && MAGIC_UNDEAD.has(unit.type)) speedBonus *= 1.25;
    // Frozen : 0.3× (gel magique) — Feared : 0.5× (aura god_avatar)
    const speedMult = isFrozen ? 0.3 : (isFeared ? 0.5 : speedBonus);
    const uSpeed    = baseSpeed * speedMult;
    const uRange = unit.range || 80;
    const step = uSpeed / TICK_RATE;
    const effectiveRange = uRange - UNIT_RADIUS;
    let goalX, goalY, skipPlayerId = null, skipBuildingId = null;

    if (unit.attackTargetId !== null) {
      if (unit.attackTargetType === 'unit') {
        const target = gameState.units[unit.attackTargetId];
        if (!target) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        if (Math.hypot(target.x - unit.x, target.y - unit.y) <= uRange) continue;
        goalX = target.x; goalY = target.y;
      } else if (unit.attackTargetType === 'village') {
        const target = gameState.villages.find(vv => vv.id === unit.attackTargetId);
        if (!target || target.hp <= 0) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        if (unitToVillageDist(unit, target) <= effectiveRange) continue;
        goalX = target.x; goalY = target.y;
      } else if (unit.attackTargetType === 'building') {
        const target = gameState.buildings.find(bb => bb.id === unit.attackTargetId);
        if (!target || target.hp <= 0) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        if (unitToBuildingDist(unit, target) <= effectiveRange) continue;
        goalX = target.x; goalY = target.y;
        skipBuildingId = unit.attackTargetId;
      } else {
        const target = gameState.players[unit.attackTargetId];
        if (!target || target.hp <= 0) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        if (unitToHdvDist(unit, target) <= effectiveRange) continue;
        goalX = target.x; goalY = target.y;
        skipPlayerId = unit.attackTargetId;
      }
    } else if (unit.targetX !== null) {
      // Waypoint actif (contournement d'eau) → on vise le waypoint d'abord
      if (unit.waypoint) {
        goalX = unit.waypoint.x; goalY = unit.waypoint.y;
        if (Math.hypot(unit.x - goalX, unit.y - goalY) < 40) {
          unit.waypoint = null; // waypoint atteint → cap sur la vraie cible
        }
      } else {
        goalX = unit.targetX; goalY = unit.targetY;
      }
      const dist = Math.hypot(unit.targetX - unit.x, unit.targetY - unit.y);
      if (!unit.waypoint && dist <= step) {
        unit.x = unit.targetX; unit.y = unit.targetY;
        unit.targetX = null;   unit.targetY = null;
        // Colon arrivé à destination : fonde un village
        if (unit.type === 'settler') {
          unit._foundVillage = true;
        }
        continue;
      }
    } else {
      continue;
    }

    const [nx, ny] = computeDesiredDir(unit, goalX, goalY, skipPlayerId, skipBuildingId);
    const newX = unit.x + nx * step;
    const newY = unit.y + ny * step;
    // Blocage eau/terre : seul le boat va dans l'eau, les autres restent sur terre
    const isBoat = unit.type === 'boat';
    if (!isBoat && isWaterAt(newX, newY)) {
      // Unité terrestre essaie d'entrer dans l'eau → essaie axe par axe (slide le long du bord)
      if (!isWaterAt(newX, unit.y)) unit.x = newX;
      else if (!isWaterAt(unit.x, newY)) unit.y = newY;
      // sinon bloqué (reste sur place)
    } else if (isBoat && !isWaterAt(newX, newY)) {
      if (isWaterAt(newX, unit.y)) unit.x = newX;
      else if (isWaterAt(unit.x, newY)) unit.y = newY;
    } else {
      unit.x = newX;
      unit.y = newY;
    }
  }

  // 1.5. Colons arrivés : transforme en village
  for (const uid of Object.keys(gameState.units)) {
    const u = gameState.units[uid];
    if (u && u._foundVillage) {
      // Vérifie distance min des autres villages/HDV
      const tooClose =
        Object.values(gameState.players).some(p => Math.hypot(p.x - u.x, p.y - u.y) < 400) ||
        gameState.villages.some(v => Math.hypot(v.x - u.x, v.y - u.y) < VILLAGE_MIN_DIST_OTHER);
      if (!tooClose) {
        gameState.villages.push({
          id: `v_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
          x: u.x, y: u.y,
          ownerId: u.ownerId,
          hp: VILLAGE_MAX_HP, maxHp: VILLAGE_MAX_HP,
          captureProgress: 0, capturingPlayerId: null,
          level: 1, lastAttackTime: 0,
        });
        io.emit('villageCaptured', { villageId: 'colon', ownerId: u.ownerId,
          ownerName: (gameState.players[u.ownerId] || {}).name || 'Colon',
          ownerColor: (gameState.players[u.ownerId] || {}).color || '#fff' });
        console.log(`Village fondé par Colon (${u.ownerId})`);
      }
      delete gameState.units[uid]; // le colon disparaît
    }
  }

  // 2. Collisions — soft separation
  const unitArr   = Object.values(gameState.units);
  const playerArr = Object.values(gameState.players);

  for (let i = 0; i < unitArr.length; i++) {
    for (let j = i + 1; j < unitArr.length; j++) {
      const a = unitArr[i], b = unitArr[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      const minDist = UNIT_RADIUS * 2;
      if (distSq === 0) { b.x += 1; b.y += 1; continue; }
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        const half = (minDist - dist) / 2;
        const nx = dx / dist, ny = dy / dist;
        a.x -= nx * half; a.y -= ny * half;
        b.x += nx * half; b.y += ny * half;
      }
    }
  }

  for (const unit of unitArr) {
    for (const player of playerArr) {
      const cx = Math.max(player.x - HDV_HALF_SIZE, Math.min(unit.x, player.x + HDV_HALF_SIZE));
      const cy = Math.max(player.y - HDV_HALF_SIZE, Math.min(unit.y, player.y + HDV_HALF_SIZE));
      const dx = unit.x - cx, dy = unit.y - cy;
      const distSq = dx * dx + dy * dy;
      if (distSq === 0) { unit.x += UNIT_RADIUS + 1; continue; }
      if (distSq < UNIT_RADIUS * UNIT_RADIUS) {
        const dist = Math.sqrt(distSq);
        const overlap = UNIT_RADIUS - dist;
        unit.x += (dx / dist) * overlap;
        unit.y += (dy / dist) * overlap;
      }
    }
  }

  // Collision unités vs bâtiments (push out) — les remparts forment de vraies barrières
  for (const unit of unitArr) {
    for (const b of gameState.buildings) {
      if (b.hp <= 0) continue;
      const def = BUILDING_TYPES[b.type];
      const half = (def && def.halfSize) || 22;
      const cx = Math.max(b.x - half, Math.min(unit.x, b.x + half));
      const cy = Math.max(b.y - half, Math.min(unit.y, b.y + half));
      const dx = unit.x - cx, dy = unit.y - cy;
      const distSq = dx * dx + dy * dy;
      if (distSq === 0) { unit.x += UNIT_RADIUS + 1; continue; }
      if (distSq < UNIT_RADIUS * UNIT_RADIUS) {
        const dist = Math.sqrt(distSq);
        const overlap = UNIT_RADIUS - dist;
        unit.x += (dx / dist) * overlap;
        unit.y += (dy / dist) * overlap;
      }
    }
  }

  for (const unit of unitArr) {
    unit.x = Math.max(UNIT_RADIUS, Math.min(MAP_WIDTH  - UNIT_RADIUS, unit.x));
    unit.y = Math.max(UNIT_RADIUS, Math.min(MAP_HEIGHT - UNIT_RADIUS, unit.y));
  }

  // Push-out défensif : unités terrestres coincées dans l'eau → tile terre proche.
  // Couvre le cas hérité (spawn pre-fix) + collision avec push-out hors map.
  for (const unit of unitArr) {
    if (unit.type === 'boat') continue;
    if (!isWaterAt(unit.x, unit.y)) continue;
    const tx0 = Math.floor(unit.x / TILE_SIZE);
    const ty0 = Math.floor(unit.y / TILE_SIZE);
    for (let r = 1; r <= 6; r++) {
      let escaped = false;
      for (let dy = -r; dy <= r && !escaped; dy++) {
        for (let dx = -r; dx <= r && !escaped; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const ntx = tx0 + dx, nty = ty0 + dy;
          if (ntx < 0 || ntx >= GRID_W || nty < 0 || nty >= GRID_H) continue;
          if (!isWaterTile(ntx, nty)) {
            unit.x = ntx * TILE_SIZE + TILE_SIZE / 2;
            unit.y = nty * TILE_SIZE + TILE_SIZE / 2;
            escaped = true;
          }
        }
      }
      if (escaped) break;
    }
  }

  // 3. Combat (ATTACK_MOVE: specific target | IDLE: nearest enemy | MOVE: skip)
  const toDelete = new Set();
  const attacks  = [];

  // Pré-calcule la position des Généraux par joueur (pour l'aura)
  const generalsByOwner = {};
  for (const u of Object.values(gameState.units)) {
    if (u.type === 'general') {
      (generalsByOwner[u.ownerId] = generalsByOwner[u.ownerId] || []).push(u);
    }
  }
  const generalAuraDmgBonus = (unit) => {
    const list = generalsByOwner[unit.ownerId];
    if (!list) return 1;
    for (const g of list) {
      if (g.id === unit.id) continue;
      if (Math.hypot(g.x - unit.x, g.y - unit.y) <= 200) return 1.25;
    }
    return 1;
  };

  for (const unit of Object.values(gameState.units)) {
    if (toDelete.has(unit.id)) continue;
    // Cooldown d'attaque — réduit de 20% pour les unités magie/undead si tech 'time_mastery'
    let atkCooldown = ATTACK_COOLDOWN_MS;
    if (MAGIC_UNDEAD.has(unit.type) && hasTech(gameState.players[unit.ownerId], 'time_mastery')) {
      atkCooldown *= 0.8;
    }
    if (nowMs - unit.lastAttackTime < atkCooldown) continue;
    const uRange  = unit.range  || 80;
    // Aura Général : +25% dégâts pour les unités proches d'un Général allié
    let uDamage = (unit.damage || 5) * generalAuraDmgBonus(unit);
    // Inquisiteur : ×2 dmg vs unités magiques/undead
    const effectiveRange = uRange - UNIT_RADIUS;

    // Tech 'crossbows' : archer +50% dmg, -20% portée
    if (unit.type === 'archer' && hasTech(gameState.players[unit.ownerId], 'crossbows')) {
      uDamage *= 1.5;
    }

    if (unit.attackTargetId !== null) {
      let target, inRange = false;
      if (unit.attackTargetType === 'unit') {
        target = gameState.units[unit.attackTargetId];
        if (!target || toDelete.has(target.id)) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        // Inquisiteur : ×2 dmg vs magique/undead, ×3 si tech 'purifying_light' débloquée
        if (unit.type === 'inquisitor' && MAGIC_UNDEAD.has(target.type)) {
          const owner = gameState.players[unit.ownerId];
          uDamage *= hasTech(owner, 'purifying_light') ? 3 : 2;
        }
        // Tech 'pyromancy' : +30% dmg pour unités magie/undead du joueur
        if (MAGIC_UNDEAD.has(unit.type) && hasTech(gameState.players[unit.ownerId], 'pyromancy')) {
          uDamage *= 1.3;
        }
        // Tech 'unwavering_faith' (côté CIBLE) : -25% dmg reçus si l'attaquant est magie/undead
        if (MAGIC_UNDEAD.has(unit.type) && target.ownerId
            && hasTech(gameState.players[target.ownerId], 'unwavering_faith')) {
          uDamage *= 0.75;
        }
        // Passif 'magic_curse_aura' (CIBLE) : si la cible est <150 d'un mage du défenseur
        //  ET le défenseur a tech 'curses' → l'attaquant ennemi inflige -15% dmg.
        if (target.ownerId && target.ownerId !== unit.ownerId
            && hasTech(gameState.players[target.ownerId], 'curses')) {
          const def = gameState.players[target.ownerId];
          // Cherche un mage allié au défenseur dans le rayon 150 de la cible
          for (const mage of Object.values(gameState.units)) {
            if (mage.ownerId !== def.id) continue;
            if (!MAGIC_UNDEAD.has(mage.type)) continue;
            if (Math.hypot(mage.x - target.x, mage.y - target.y) <= 150) { uDamage *= 0.85; break; }
          }
        }
        // Passif 'religion_curse_aura' (CIBLE) : idem pour les unités religion, -20%.
        if (target.ownerId && target.ownerId !== unit.ownerId
            && hasTech(gameState.players[target.ownerId], 'excommunication')) {
          const def = gameState.players[target.ownerId];
          for (const rel of Object.values(gameState.units)) {
            if (rel.ownerId !== def.id) continue;
            if (!RELIGION_UNITS.has(rel.type)) continue;
            if (Math.hypot(rel.x - target.x, rel.y - target.y) <= 150) { uDamage *= 0.80; break; }
          }
        }
        // Passif 'magic_slow_chance' (cryomancy) : à chaque tir magique, 20% chance
        //  d'appliquer un freeze de 2s sur la cible.
        if (MAGIC_UNDEAD.has(unit.type)
            && hasTech(gameState.players[unit.ownerId], 'cryomancy')
            && Math.random() < 0.20) {
          target.frozenUntil = nowMs + 2000;
        }
        // Catapulte/Canon : pénalité contre unités (gros vs bâtiments seulement)
        if ((unit.type === 'catapult' || unit.type === 'cannon') && target.type) {
          uDamage *= 0.4;
        }
        inRange = Math.hypot(target.x - unit.x, target.y - unit.y) <= uRange;
      } else if (unit.attackTargetType === 'village') {
        target = gameState.villages.find(vv => vv.id === unit.attackTargetId);
        if (!target || target.hp <= 0) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        inRange = unitToVillageDist(unit, target) <= effectiveRange;
      } else if (unit.attackTargetType === 'building') {
        target = gameState.buildings.find(bb => bb.id === unit.attackTargetId);
        if (!target || target.hp <= 0) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        inRange = unitToBuildingDist(unit, target) <= effectiveRange;
      } else {
        target = gameState.players[unit.attackTargetId];
        if (!target || target.hp <= 0) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        inRange = unitToHdvDist(unit, target) <= effectiveRange;
      }
      if (!inRange) continue;

      // Tech 'crusade' : +25% dégâts sur HDV / bâtiments / villages
      if ((unit.attackTargetType === 'hdv' || unit.attackTargetType === 'building'
           || unit.attackTargetType === 'village')
          && hasTech(gameState.players[unit.ownerId], 'crusade')) {
        uDamage *= 1.25;
      }

      unit.lastAttackTime = nowMs;
      target.hp = Math.max(0, target.hp - uDamage);
      // Fire elemental : tag pour AoE splash (traité en section 3.6)
      if (unit.type === 'fire_elemental' && unit.attackTargetType === 'unit') {
        unit._aoeAroundTarget = { x: target.x, y: target.y };
      }
      // Riposte automatique : si la cible est une unité capable d'attaquer et n'a
      // pas de cible, elle prend son attaquant comme cible (et passe en mode 'attack'
      // pour pouvoir sortir de sa zone de défense si nécessaire).
      // → fix le bug "soldats restent passifs quand un mage les tire à distance"
      if (unit.attackTargetType === 'unit' && target.attackTargetId === null
          && (target.damage || 0) > 0 && target.hp > 0) {
        target.attackTargetId   = unit.id;
        target.attackTargetType = 'unit';
        target.targetX = null; target.targetY = null;
        if (target.mode === 'defend') target.mode = 'attack';
        // Aggro de groupe : les alliés de la victime convergent sur l'agresseur
        rallyNearbyAllies(target, unit.id, 'unit');
      }

      // Inclut attacker/target X/Y pour que le client puisse afficher le projectile
      // même si l'unité (attaquant OU cible) est filtrée par fog of war
      const attackEntry = {
        attackerId: unit.id, attackerX: unit.x, attackerY: unit.y, attackerType: unit.type,
        targetType: unit.attackTargetType, targetId: target.id,
        targetX: target.x, targetY: target.y,
      };

      if (unit.attackTargetType === 'unit' && target.hp <= 0) {
        // Tag pour résurrection au kill (necro/lich) — voir section 3.6
        target._killedByType  = unit.type;
        target._killedByOwner = unit.ownerId;
        toDelete.add(target.id);
        attackEntry.killed = true;
        const killer = gameState.players[unit.ownerId];
        if (killer && !killer.eliminated) killer.kills++;
        onNeutralUnitKilled(target, unit.ownerId, attackEntry);
        unit.attackTargetId = null; unit.attackTargetType = null;
      } else if (unit.attackTargetType === 'hdv' && target.hp <= 0) {
        eliminatePlayer(target, toDelete);
        unit.attackTargetId = null; unit.attackTargetType = null;
      } else if (unit.attackTargetType === 'village' && target.hp <= 0) {
        // Village détruit → redevient neutre (Polytopia style)
        const prevOwner = target.ownerId;
        target.ownerId = null;
        target.level = 1;
        target.captureProgress = 0;
        target.capturingPlayerId = null;
        target.hp = 0;
        attackEntry.killed = true;
        io.emit('villageDestroyed', { villageId: target.id, byPlayerId: unit.ownerId, prevOwnerId: prevOwner });
        unit.attackTargetId = null; unit.attackTargetType = null;
      } else if (unit.attackTargetType === 'building' && target.hp <= 0) {
        // Bâtiment détruit : supprimé du state
        target._toDelete = true;
        attackEntry.killed = true;
        unit.attackTargetId = null; unit.attackTargetType = null;
      }
      attacks.push(attackEntry);

    } else if (unit.targetX === null) {
      // IDLE auto-attack
      let best = null, bestDist = Infinity, bestType = null;

      for (const other of Object.values(gameState.units)) {
        if (toDelete.has(other.id) || sameSide(other.ownerId, unit.ownerId)) continue;
        const d = Math.hypot(other.x - unit.x, other.y - unit.y);
        if (d <= uRange && d < bestDist) { best = other; bestDist = d; bestType = 'unit'; }
      }
      for (const player of Object.values(gameState.players)) {
        if (player.id === unit.ownerId || player.hp <= 0) continue;
        const edgeDist = unitToHdvDist(unit, player);
        if (edgeDist <= effectiveRange && edgeDist < bestDist) {
          best = player; bestDist = edgeDist; bestType = 'hdv';
        }
      }

      if (!best) continue;

      unit.lastAttackTime = nowMs;
      best.hp = Math.max(0, best.hp - uDamage);
      if (unit.type === 'fire_elemental' && bestType === 'unit') {
        unit._aoeAroundTarget = { x: best.x, y: best.y };
      }
      // Riposte automatique pour les unités attaquées en IDLE auto-attack
      if (bestType === 'unit' && best.attackTargetId === null && (best.damage || 0) > 0 && best.hp > 0) {
        best.attackTargetId   = unit.id;
        best.attackTargetType = 'unit';
        best.targetX = null; best.targetY = null;
        if (best.mode === 'defend') best.mode = 'attack';
      }
      const attackEntry = {
        attackerId: unit.id, attackerX: unit.x, attackerY: unit.y, attackerType: unit.type,
        targetType: bestType, targetId: best.id,
        targetX: best.x, targetY: best.y,
      };

      if (bestType === 'unit' && best.hp <= 0) {
        best._killedByType  = unit.type;
        best._killedByOwner = unit.ownerId;
        toDelete.add(best.id);
        attackEntry.killed = true;
        const killer = gameState.players[unit.ownerId];
        if (killer && !killer.eliminated) killer.kills++;
        onNeutralUnitKilled(best, unit.ownerId, attackEntry);
      } else if (bestType === 'hdv' && best.hp <= 0) {
        eliminatePlayer(best, toDelete);
      }
      attacks.push(attackEntry);
    }
    // MOVE: skip combat
  }

  // 3.4. Bâtiments combat : Tours + Citadelle (HDV avec tech) tirent auto sur ennemis
  for (const b of gameState.buildings) {
    if (b.hp <= 0) continue;
    const def = BUILDING_TYPES[b.type];
    if (!def || !def.damage || def.damage <= 0) continue;
    if (nowMs - b.lastAttackTime < (def.cooldownMs || 1000)) continue;
    let bestTarget = null, bestDist = def.range;
    for (const u of Object.values(gameState.units)) {
      if (u.ownerId === b.ownerId || toDelete.has(u.id)) continue;
      // Skip alliés (pacte de non-agression)
      const owner = gameState.players[b.ownerId];
      if (owner && (owner.allies || []).includes(u.ownerId)) continue;
      const d = Math.hypot(u.x - b.x, u.y - b.y);
      if (d < bestDist) { bestDist = d; bestTarget = u; }
    }
    if (bestTarget) {
      b.lastAttackTime = nowMs;
      bestTarget.hp = Math.max(0, bestTarget.hp - def.damage);
      // Riposte : l'unité touchée par la tour la prend pour cible si elle est libre
      if (bestTarget.attackTargetId === null && (bestTarget.damage || 0) > 0 && bestTarget.hp > 0) {
        bestTarget.attackTargetId   = b.id;
        bestTarget.attackTargetType = 'building';
        bestTarget.targetX = null; bestTarget.targetY = null;
        if (bestTarget.mode === 'defend') bestTarget.mode = 'attack';
      }
      const entry = { attackerId: b.id, attackerType: 'building', attackerBuildingType: b.type, targetType: 'unit', targetId: bestTarget.id, bx: b.x, by: b.y };
      if (bestTarget.hp <= 0) {
        toDelete.add(bestTarget.id);
        entry.killed = true;
        const owner = gameState.players[b.ownerId];
        if (owner && !owner.eliminated) owner.kills++;
        onNeutralUnitKilled(bestTarget, b.ownerId, entry);
      }
      attacks.push(entry);
    }
  }

  // 3.5. Citadelle : HDV avec tech 'citadel' tire automatiquement sur les ennemis proches
  for (const p of Object.values(gameState.players)) {
    if (p.eliminated || p.hp <= 0) continue;
    if (!hasTech(p, 'citadel')) continue;
    p.lastCitadelAttack = p.lastCitadelAttack || 0;
    if (nowMs - p.lastCitadelAttack < 1200) continue;
    const CIT_RANGE = 240, CIT_DMG = 8;
    let best = null, bd = CIT_RANGE;
    for (const u of Object.values(gameState.units)) {
      if (u.ownerId === p.id || toDelete.has(u.id)) continue;
      if ((p.allies || []).includes(u.ownerId)) continue;
      const d = Math.hypot(u.x - p.x, u.y - p.y);
      if (d < bd) { bd = d; best = u; }
    }
    if (best) {
      p.lastCitadelAttack = nowMs;
      best.hp = Math.max(0, best.hp - CIT_DMG);
      const entry = { attackerId: 'citadel_' + p.id, attackerType: 'building', attackerBuildingType: 'citadel', targetType: 'unit', targetId: best.id, bx: p.x, by: p.y };
      if (best.hp <= 0) {
        toDelete.add(best.id);
        entry.killed = true;
        p.kills++;
        onNeutralUnitKilled(best, p.id, entry);
      }
      attacks.push(entry);
    }
  }

  // ── 3.6 Behaviors spéciaux ────────────────────────────────────────
  // a) god_avatar fear aura : marque ennemis dans rayon 400 comme "feared" (slow 50%)
  // b) fire_elemental : dégâts AoE rayon 40 autour de sa cible (au moment du tick d'attaque)
  // c) Pilgrim mort : explosion de soin AoE 200 HP rayon 100 alliés
  // d) Necromancer/Lich : résurrection au kill (skeleton / skeleton_knight, 60s)
  // e) Lifetime decay : summoned units meurent après leur durée de vie
  // f) Angel heal aura : appliquée dans la section 1/s plus bas

  // a) Fear aura (god_avatar)
  for (const u of Object.values(gameState.units)) {
    if (u.type !== 'god_avatar') continue;
    for (const other of Object.values(gameState.units)) {
      if (other.ownerId === u.ownerId || toDelete.has(other.id)) continue;
      if (Math.hypot(other.x - u.x, other.y - u.y) <= 400) {
        other.fearedUntil = nowMs + 200; // refresh chaque tick (~50ms)
      }
    }
  }

  // b) AoE damage du fire_elemental autour de sa cible
  // (réapplique à chaque tick d'attaque réussie — on tag dans la boucle combat ci-dessus
  //  via _aoeAroundTarget — fallback : pass)
  for (const u of Object.values(gameState.units)) {
    if (u.type !== 'fire_elemental' || !u._aoeAroundTarget) continue;
    const center = u._aoeAroundTarget;
    u._aoeAroundTarget = null;
    for (const other of Object.values(gameState.units)) {
      if (other.ownerId === u.ownerId || toDelete.has(other.id)) continue;
      const d = Math.hypot(other.x - center.x, other.y - center.y);
      if (d > 0 && d <= 40) {
        other.hp = Math.max(0, other.hp - 15); // 15 dmg splash
        if (other.hp <= 0) toDelete.add(other.id);
      }
    }
  }

  // c) Pilgrim death → soin AoE allies (et d) Necro/Lich resurrect
  // toDelete contient les unités tuées ce tick (par attaque/AoE)
  const newSummons = [];
  for (const deadId of toDelete) {
    const dead = gameState.units[deadId];
    if (!dead) continue;
    // c) Pilgrim explosion — uniquement si tech 'martyrs' débloquée
    if (dead.type === 'pilgrim') {
      const pilgrimOwner = gameState.players[dead.ownerId];
      if (pilgrimOwner && hasTech(pilgrimOwner, 'martyrs')) {
        for (const ally of Object.values(gameState.units)) {
          if (ally.ownerId !== dead.ownerId || toDelete.has(ally.id)) continue;
          if (Math.hypot(ally.x - dead.x, ally.y - dead.y) <= 100) {
            ally.hp = Math.min(ally.maxHp || ally.hp, ally.hp + 200);
          }
        }
        io.emit('pilgrimExplosion', { x: dead.x, y: dead.y, ownerId: dead.ownerId });
      }
    }
    // d) Si tué par necro/lich → résurrection alliée du killer
    if (dead._killedByType === 'necromancer' || dead._killedByType === 'lich') {
      const summonedType = dead._killedByType === 'lich' ? 'skeleton_knight' : 'skeleton';
      const def = UNIT_TYPES[summonedType];
      if (def && dead._killedByOwner) {
        newSummons.push({
          ownerId: dead._killedByOwner,
          x: dead.x, y: dead.y,
          type: summonedType,
          def,
        });
      }
    }
  }
  for (const s of newSummons) {
    const unitId = `unit_${nextUnitId++}`;
    gameState.units[unitId] = {
      id: unitId, ownerId: s.ownerId,
      x: s.x, y: s.y,
      type: s.type,
      hp: s.def.hp, maxHp: s.def.hp,
      speed: s.def.speed, range: s.def.range, damage: s.def.damage, cost: 0,
      targetX: null, targetY: null,
      attackTargetId: null, attackTargetType: null,
      lastAttackTime: 0,
      mode: 'defend', defendX: s.x, defendY: s.y, defendRadius: 320,
      spawnTime: nowMs,
    };
    io.emit('unitSummoned', { unitId, type: s.type, x: s.x, y: s.y, ownerId: s.ownerId });
  }

  // e) Lifetime decay (summoned units)
  for (const uid of Object.keys(gameState.units)) {
    const u = gameState.units[uid];
    if (toDelete.has(uid)) continue;
    const lifetime = SUMMONED_LIFETIMES[u.type];
    if (!lifetime) continue;
    u.spawnTime = u.spawnTime || nowMs;
    if (nowMs - u.spawnTime >= lifetime) toDelete.add(uid);
  }

  if (attacks.length > 0) io.emit('attacks', attacks);

  for (const id of toDelete) {
    delete gameState.units[id];
  }
  // Supprime les bâtiments détruits
  for (let i = gameState.buildings.length - 1; i >= 0; i--) {
    if (gameState.buildings[i]._toDelete || gameState.buildings[i].hp <= 0) {
      gameState.buildings.splice(i, 1);
    }
  }

  // 3.5. Villages — capture progressive (10 s) si une seule team présente.
  // Un village détruit (hp<=0, ownerId=null) se comporte exactement comme un village neutre.
  for (const v of gameState.villages) {
    const r2 = VILLAGE_RADIUS * VILLAGE_RADIUS;
    const ownersInside = new Set();
    for (const unit of Object.values(gameState.units)) {
      const dx = unit.x - v.x, dy = unit.y - v.y;
      if (dx * dx + dy * dy > r2) continue;
      if (isNeutralOwner(unit.ownerId)) continue; // les mobs neutres de passage ne bloquent/capturent pas
      ownersInside.add(unit.ownerId);
    }
    if (ownersInside.size === 1) {
      const claimer = [...ownersInside][0];
      const player  = gameState.players[claimer];
      if (!player || player.eliminated) continue;
      if (v.ownerId === claimer) continue;
      if (v.capturingPlayerId !== claimer) {
        if (v.captureProgress > 0) {
          v.captureProgress = Math.max(0, v.captureProgress - 2);
          if (v.captureProgress === 0) v.capturingPlayerId = claimer;
        } else {
          v.capturingPlayerId = claimer;
        }
      } else {
        v.captureProgress++;
        if (v.captureProgress >= VILLAGE_CAPTURE_TICKS) {
          v.ownerId = claimer;
          v.captureProgress = 0;
          v.capturingPlayerId = null;
          v.hp = VILLAGE_MAX_HP; // restauré à pleine HP à la capture
          v.level = 1;            // toujours Lv1 au moment de la prise
          io.emit('villageCaptured', { villageId: v.id, ownerId: claimer, ownerName: player.name, ownerColor: player.color });
          console.log(`Village ${v.id} capturé par ${player.name}`);
        }
      }
    } else if (ownersInside.size === 0) {
      if (v.captureProgress > 0) {
        v.captureProgress = Math.max(0, v.captureProgress - 1);
        if (v.captureProgress === 0) v.capturingPlayerId = null;
      }
    }
  }

  // 4. Ressources passives une fois par seconde (alive players only)
  if (tickCount % TICK_RATE === 0) {
    for (const p of Object.values(gameState.players)) {
      if (p.eliminated) continue;
      const goldRate  = computeGoldRate(p);
      const prRate    = computePrRate(p);
      const manaRate  = computeManaRate(p);
      const faithRate = computeFaithRate(p);
      p.gold            += goldRate;
      p.totalGoldEarned += goldRate;
      p.researchPoints  = (p.researchPoints || 0) + prRate;
      p.mana            = Math.min(200, (p.mana  || 0) + manaRate);  // cap mana à 200
      p.faith           = Math.min(200, (p.faith || 0) + faithRate); // cap foi à 200
      // Population (synchro vers le client)
      p.populationUsed = getPopulationUsed(p);
      p.populationMax  = getPopulationMax(p);
    }

    // Aura HDV "Prière" : +1 HP/s à chaque unité du joueur à <200 d'un HDV propre
    // + Auto-regen Chevalier sacré (+5 HP/s) + Ange (+3 HP/s aux alliés rayon 120)
    // + Tech 'blessing' : +0.5 HP/s à TOUTES les unités du joueur
    // Pré-calcule les anges par propriétaire pour l'aura
    const angelsByOwner = {};
    for (const u of Object.values(gameState.units)) {
      if (u.type === 'angel') (angelsByOwner[u.ownerId] = angelsByOwner[u.ownerId] || []).push(u);
    }

    for (const u of Object.values(gameState.units)) {
      if (u.hp <= 0 || u.hp >= u.maxHp) {
        if (u.type === 'holy_knight' && u.hp > 0 && u.hp < u.maxHp) {
          u.hp = Math.min(u.maxHp, u.hp + 5);
        }
        continue;
      }
      let heal = 0;
      if (u.type === 'holy_knight') heal += 5;
      const owner = gameState.players[u.ownerId];
      if (owner && !owner.eliminated) {
        if (hasTech(owner, 'prayer') && Math.hypot(u.x - owner.x, u.y - owner.y) <= 200) heal += 1;
        // Tech 'blessing' : +0.5 HP/s à toutes les unités du joueur
        if (hasTech(owner, 'blessing')) heal += 0.5;
      }
      // Aura ange : +3 HP/s aux alliés dans rayon 120
      const angels = angelsByOwner[u.ownerId];
      if (angels) {
        for (const a of angels) {
          if (a.id === u.id) continue;
          if (Math.hypot(a.x - u.x, a.y - u.y) <= 120) { heal += 3; break; }
        }
      }
      if (heal > 0) u.hp = Math.min(u.maxHp, u.hp + heal);
    }
  }

  // 4.5. Bot IA — décide toutes les ~1.5s (30 ticks)
  if (tickCount % 30 === 0) {
    for (const p of Object.values(gameState.players)) {
      if (p.isBot) botTick(p);
    }
  }

  // 4.6. Raids barbares — toutes les 5s, villages neutres "fâchés" (> 5 min) → vague vers le joueur proche
  if (tickCount % (5 * TICK_RATE) === 0 && gameState.matchState === 'playing') {
    const nowR = Date.now();
    let activeRaids = 0;
    for (const u of Object.values(gameState.units)) {
      if (u.ownerId === NEUTRAL_OWNER_BARBARIAN && u.neutralRole === 'raid' && u.hp > 0) activeRaids++;
    }
    if (activeRaids < RAID_MAX_ACTIVE) {
      const alivePlayers = Object.values(gameState.players).filter(p => !p.eliminated && p.hp > 0);
      if (alivePlayers.length > 0) {
        for (const v of gameState.villages) {
          if (v.ownerId !== null || v.hp <= 0) continue;
          if (!v.neutralSince) v.neutralSince = nowR; // init paresseuse (villages créés sans le champ)
          if (nowR - v.neutralSince < RAID_DELAY_MS) continue;
          if (nowR - (v.raidLastSpawn || 0) < RAID_INTERVAL_MS) continue;
          let best = null, bestD = Infinity;
          for (const p of alivePlayers) {
            const d = Math.hypot(p.x - v.x, p.y - v.y);
            if (d < bestD) { bestD = d; best = p; }
          }
          if (!best) continue;
          const spawned = spawnRaidFromVillage(v, best);
          if (spawned > 0) {
            v.raidLastSpawn = nowR;
            activeRaids += spawned;
            io.emit('barbarianRaid', { villageId: v.id, villageX: v.x, villageY: v.y,
              targetPlayerId: best.id, targetName: best.name, targetColor: best.color, count: spawned });
            console.log(`[PvE] Raid barbare : ${v.id} → ${best.name} (${spawned})`);
            if (activeRaids >= RAID_MAX_ACTIVE) break;
          }
        }
      }
    }
  }

  // 5. Broadcast — filtré par joueur (fog of war)
  broadcastFilteredState();
}, TICK_MS);

const PORT = process.env.PORT || 3000;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nErreur : port ${PORT} déjà utilisé.\nKill le serveur précédent avec :\n  lsof -ti :${PORT} | xargs kill -9\n`);
    process.exit(1);
  } else {
    throw err;
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
