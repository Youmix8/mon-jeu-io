const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { TECH_TREE: NEW_TECH_TREE, validateTechTree } = require('./server/techTree');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

validateTechTree();

app.use(express.static('public'));

// Tailles de map disponibles (configurable depuis le lobby)
const MAP_SIZES = {
  small:  { width: 3000, height: 3000, villageMin: 6,  villageMax: 10 },
  medium: { width: 4500, height: 4500, villageMin: 10, villageMax: 16 },
  large:  { width: 6000, height: 6000, villageMin: 16, villageMax: 24 },
};
const DEFAULT_MAP_TYPE = 'no_water'; // l'eau a été retirée du jeu — seul type valide
const DEFAULT_MAP_SIZE = 'medium';

// NB : MAP_WIDTH/MAP_HEIGHT/currentMapType/currentMapSize/GRID_W/GRID_H sont
// déclarés DANS createGame() : ce sont des variables PAR PARTIE (closure).

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
  // Unités Magie — un seul mage : le Nécromancien (refonte v3).
  // wizard et lich (unités) ont été retirés ; lich devient une tech-upgrade
  // qui transforme le revive en "copie de l'unité tuée à -40 % HP/dmg".
  necromancer:   { id: 'necromancer',   name: 'Nécromancien',    cost: 60,  manaCost: 30,  faithCost: 0,  populationCost: 2,  hp: 70,  speed:  80, range: 200, damage: 14,  requiresTech: 'mage_tower',
                   icon: '💀', desc: 'Mage à distance. Sa victime ressuscite en allié temporaire.' },
  skeleton:      { id: 'skeleton',      name: 'Squelette',       cost: 15,  manaCost: 10,  faithCost: 0,  populationCost: 1,   hp: 30,  speed:  80, range:  30, damage:  5,  requiresTech: null,
                   icon: '☠️', desc: 'Invoqué par le Nécromancien. Durée 60s.' },
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
  // Bateau retiré (système eau supprimé).
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
  // ── Port retiré (système eau supprimé) ──
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
    desc: '+1 mana/sec. Le moteur de ton économie de mana.',
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
  // Les sorts d'invocation ont été retirés : les boss (élémentaire, ange,
  // dragon, avatar) se produisent via spawnUnit. Il ne reste que les sorts
  // ACTIFS ciblés au sol, chacun avec un hotkey et un cooldown propre.
  fireball: {
    id: 'fireball', name: 'Boule de feu', icon: '🔥',
    type: 'aoe_damage', costType: 'mana',
    cost: 30, cooldownMs: 4000,
    radius: 90, damage: 32,
    requiresTech: 'pyromancy',
    hotkey: 'F',
    desc: 'AoE 90, 32 dmg, 30 mana (recharge 4s).',
  },
  freeze: {
    id: 'freeze', name: 'Gel', icon: '❄️',
    type: 'aoe_slow', costType: 'mana',
    cost: 25, cooldownMs: 5000,
    radius: 100, durationMs: 5000, slowFactor: 0.3,
    requiresTech: 'cryomancy',
    hotkey: 'G',
    desc: 'AoE 100, ralentit 70% pendant 5s, 25 mana (recharge 5s).',
  },
  // ── Religion (foi) ──
  blessing: {
    id: 'blessing', name: 'Bénédiction', icon: '✝️',
    type: 'aoe_heal', costType: 'faith',
    cost: 30, cooldownMs: 4000,
    radius: 150, heal: 55,
    requiresTech: 'blessing',
    hotkey: 'H',
    desc: 'AoE 150, +55 HP instantanés à tes unités, 30 foi (recharge 4s).',
  },
  purifying_light: {
    id: 'purifying_light', name: 'Lumière purificatrice', icon: '🌟',
    type: 'aoe_purify', costType: 'faith',
    cost: 25, cooldownMs: 4000,
    radius: 120, damage: 16, magicMult: 3, // ×3 dmg vs magie/undead
    requiresTech: 'purifying_light',
    hotkey: 'J',
    desc: 'AoE 120, 16 dmg (×3 vs magie/undead), 25 foi (recharge 4s).',
  },
};

// Unités "magie/undead" (cibles bonus de Lumière purificatrice + Inquisiteur)
const MAGIC_UNDEAD = new Set(['necromancer', 'skeleton', 'skeleton_knight', 'fire_elemental', 'arcane_dragon']);
// Unités "religion" pour aura d'excommunication (religion_curse_aura)
const RELIGION_UNITS = new Set(['holy_knight', 'inquisitor', 'pilgrim', 'angel', 'god_avatar']);
// Unités uniquement INVOQUÉES (revive nécro) — jamais productibles via spawnUnit/village.
// Le client les cache déjà ; ce set ferme aussi la porte côté serveur (anti-cheat).
const SUMMONED_ONLY_TYPES = new Set(['skeleton', 'skeleton_knight']);
// Unités à dégâts de zone autour de leur cible (appliqués en section 3.6.b du game loop)
const SPLASH_AOE_UNITS = {
  fire_elemental: { radius: 40, damage: 15 },
  god_avatar:     { radius: 60, damage: 20 },
};

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

// ════════════════════════════════════════════════════════════════════════════
// createGame(config) — fabrique UNE partie isolée.
// Tout l'état mutable d'une partie (map, gameState, fog, compteurs d'ids…) vit
// dans la closure de cette fonction ; les tables const ci-dessus restent
// partagées. Les fonctions internes gardent leurs noms et leur code d'origine :
// elles résolvent simplement leurs références vers les variables de LA partie.
//   config.emitAll(event, data) : broadcast aux joueurs de cette partie
//                                 (défaut : io.emit global — room unique).
//   config.mapType / config.mapSize : config map appliquée à la création.
// NB : le corps conserve l'indentation module d'origine (refactor mécanique,
// diff minimal — relire avec `git diff -w`).
// ════════════════════════════════════════════════════════════════════════════
function createGame(config = {}) {
const emitAll = config.emitAll || ((ev, data) => io.emit(ev, data));

// Dimensions de map de LA partie (recalculées dans applyMapConfig)
let MAP_WIDTH  = MAP_SIZES[DEFAULT_MAP_SIZE].width;
let MAP_HEIGHT = MAP_SIZES[DEFAULT_MAP_SIZE].height;
let currentMapType = DEFAULT_MAP_TYPE;
let currentMapSize = DEFAULT_MAP_SIZE;
let GRID_W = MAP_WIDTH  / TILE_SIZE;   // recalculé dans applyMapConfig()
let GRID_H = MAP_HEIGHT / TILE_SIZE;

function isNeutralOwner(ownerId) { return NEUTRAL_OWNERS.has(ownerId); }
// Même camp (ne s'attaquent pas) : identiques OU tous deux neutres (factions neutres alliées).
function sameSide(a, b) {
  if (a === b) return true;
  return isNeutralOwner(a) && isNeutralOwner(b);
}
// Deux JOUEURS liés par un pacte de non-agression (traité diplomatique).
function areAllied(a, b) {
  if (a === b || isNeutralOwner(a) || isNeutralOwner(b)) return false;
  const pa = gameState.players[a], pb = gameState.players[b];
  if (!pa || !pb) return false;
  return (pa.allies && pa.allies.includes(b)) || (pb.allies && pb.allies.includes(a));
}
// Ne doivent PAS s'attaquer : même camp OU alliés diplomatiques.
function friendly(a, b) { return sameSide(a, b) || areAllied(a, b); }

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
    if ((ally.damage || 0) <= 0) continue;             // non-combattant (pèlerin, colon)
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

// Cherche une position de spawn libre autour de (cx, cy) : essaie 16 angles,
// élargit le rayon si les premiers échouent, fallback au centre exact.
function findFreeSpawnPos(cx, cy, baseRadius = 80) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const angle = (attempt / 16) * Math.PI * 2 + Math.random() * 0.2;
    const dist  = baseRadius + (attempt > 7 ? 40 : 0); // si proches échouent, élargit
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    if (x < 30 || x > MAP_WIDTH - 30 || y < 30 || y > MAP_HEIGHT - 30) continue;
    return { x: Math.round(x), y: Math.round(y) };
  }
  return { x: Math.round(cx), y: Math.round(cy) };
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
  // L'eau a été retirée du jeu — on force toujours 'no_water' quelle que soit
  // la demande du client (compat avec les anciens types lakes/continental/island).
  currentMapType = 'no_water';
  GRID_W = Math.floor(MAP_WIDTH  / TILE_SIZE);
  GRID_H = Math.floor(MAP_HEIGHT / TILE_SIZE);
  console.log(`[map] config: type=${currentMapType} size=${currentMapSize} (${MAP_WIDTH}x${MAP_HEIGHT}, grid ${GRID_W}x${GRID_H})`);
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
  return villages;
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
  const pos = findFreeSpawnPos(player.x, player.y, 70 + Math.random() * 30);
  const unitId = `unit_${nextUnitId++}`;
  gameState.units[unitId] = {
    id: unitId, ownerId: player.id, x: pos.x, y: pos.y, type: freeType,
    hp: def.hp, maxHp: def.hp,
    speed: def.speed, range: def.range, damage: def.damage, cost: def.cost,
    targetX: null, targetY: null, attackTargetId: null, attackTargetType: null,
    lastAttackTime: 0, mode: 'defend', defendX: player.x, defendY: player.y, defendRadius: 320,
  };
  player.unitsCreated++;
  emitAll('campCleared', { campId: camp.id, x: camp.x, y: camp.y,
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

// Rayon de vision d'une unité — boosté par les passifs :
//   - 'lightning' (magie/undead) : +30 %
//   - 'reconnaissance' (toutes unités) : +30 %
// Les bonus se cumulent multiplicativement.
function unitVisionRadius(unit) {
  if (!unit) return VISION_UNIT;
  const owner = gameState.players && gameState.players[unit.ownerId];
  let mult = 1;
  if (owner && MAGIC_UNDEAD.has(unit.type) && hasTech(owner, 'lightning')) mult *= 1.30;
  if (owner && hasTech(owner, 'reconnaissance')) mult *= 1.30;
  return Math.round(VISION_UNIT * mult);
}

// ── Catégorie "unités à projectile" (impactée par ballistics / reconnaissance) ──
const RANGED_UNIT_TYPES = new Set(['archer', 'crossbowman', 'catapult', 'cannon']);
const RANGED_BUILDING_TYPES = new Set(['tower', 'bombard_tower']);

// Portée effective d'une unité :
//   - 'crossbows' (archer_buff) : archer -20 % de portée (le +50 % dmg est en combat)
//   - 'reconnaissance' : +15 % pour toutes les unités à distance
function effectiveRange(unit) {
  if (!unit) return 0;
  const owner = gameState.players && gameState.players[unit.ownerId];
  let range = unit.range || 0;
  if (owner && unit.type === 'archer' && hasTech(owner, 'crossbows')) {
    range = Math.round(range * 0.8);
  }
  if (owner && hasTech(owner, 'reconnaissance') && RANGED_UNIT_TYPES.has(unit.type)) {
    range = Math.round(range * 1.15);
  }
  return range;
}

// Cadence de tir effective (cooldown en ms) — réduite de 25 % par 'ballistics'
// pour les unités à projectile (archer/crossbow/catapulte/canon) et les tours.
function effectiveCooldown(ownerId, type, baseCooldownMs) {
  if (!baseCooldownMs) return baseCooldownMs;
  const owner = gameState.players && gameState.players[ownerId];
  if (!owner) return baseCooldownMs;
  if (!hasTech(owner, 'ballistics')) return baseCooldownMs;
  if (RANGED_UNIT_TYPES.has(type) || RANGED_BUILDING_TYPES.has(type)) {
    return Math.round(baseCooldownMs * 0.8);
  }
  return baseCooldownMs;
}

// Multiplicateurs OFFENSIFS de l'attaquant contre une unité cible
// (inquisiteur anti-magie, pyromancie, pénalité siège anti-unité).
// Appelés UNIQUEMENT quand l'attaque est à portée (jamais pendant la poursuite).
function offensiveDamageMult(attacker, target) {
  const owner = gameState.players[attacker.ownerId];
  let mult = 1;
  // Inquisiteur : ×2 dmg vs magique/undead, ×3 si tech 'purifying_light'
  if (attacker.type === 'inquisitor' && MAGIC_UNDEAD.has(target.type)) {
    mult *= (owner && hasTech(owner, 'purifying_light')) ? 3 : 2;
  }
  // Tech 'pyromancy' : +45 % dmg pour les unités magie/undead du joueur
  if (owner && MAGIC_UNDEAD.has(attacker.type) && hasTech(owner, 'pyromancy')) mult *= 1.45;
  // Catapulte/Canon : gros vs bâtiments, pénalisés contre les unités
  if (attacker.type === 'catapult' || attacker.type === 'cannon') mult *= 0.4;
  return mult;
}

// Multiplicateurs DÉFENSIFS côté victime (unwavering_faith, excommunication).
// Centralisé pour s'appliquer aussi aux dégâts dérivés (splash pyromancy, ricochet).
function defensiveDamageMult(attacker, victim) {
  const victimOwner = victim.ownerId && gameState.players[victim.ownerId];
  if (!victimOwner) return 1;
  let mult = 1;
  // 'unwavering_faith' : -25 % de dégâts magiques reçus
  if (MAGIC_UNDEAD.has(attacker.type) && hasTech(victimOwner, 'unwavering_faith')) mult *= 0.75;
  // 'excommunication' : -20 % si une unité Religion alliée est à <150 px de la victime
  if (victim.ownerId !== attacker.ownerId && hasTech(victimOwner, 'excommunication')) {
    for (const rel of Object.values(gameState.units)) {
      if (rel.ownerId !== victim.ownerId || !RELIGION_UNITS.has(rel.type)) continue;
      if (Math.hypot(rel.x - victim.x, rel.y - victim.y) <= 150) { mult *= 0.80; break; }
    }
  }
  return mult;
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
    // Tech tree : ressources et déblocages
    researchPoints: 0, mana: 0, faith: 0,
    unlockedTechs: [],
    allies: [], // ids des joueurs avec pacte de non-agression
    vision: HDV_LEVELS[0].vision,
    populationUsed: 0, populationMax: BASE_POPULATION,
    botCooldown: 0,
    // Spécialité bot (science / magic / religion) — détermine sa route tech et ses unités préférées.
    botSpecialty: pickBotSpecialty(),
  };
  gameState.players[botId] = botPlayer;
  initVisibility(botId);
  peakPlayerCount = Math.max(peakPlayerCount, Object.keys(gameState.players).length);
  console.log(`Bot "${botPlayer.name}" added — slot ${slot} — spécialité ${botPlayer.botSpecialty}`);
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

// ── Stratégies de tech par spécialité bot ──
// Chaque bot reçoit aléatoirement une spécialité au spawn (science/magic/religion).
// Il suit en priorité sa branche, mais débloque aussi les techs économiques de base.
// IMPORTANT : chaque route doit contenir TOUS les prérequis de ses nœuds, dans
// l'ordre — le bot recherche séquentiellement et saute les nœuds dont les
// `requires` ne sont pas satisfaits. (Fix : avant, 'construction' / 'roads' /
// 'diplomacy' / 'teleportation' manquaient → ballistics, empire, renaissance,
// time_mastery… étaient inaccessibles à vie pour les bots.)
const BOT_TECH_PRIORITY_SCIENCE = [
  'agriculture', 'construction', 'archery', 'riding',
  'roads', 'ballistics', 'military_architecture', 'reconnaissance',
  'siege_engineering', 'colonization', 'diplomacy',
  'steel_forge', 'crossbows', 'empire', 'war_academy',
  'gunpowder', 'printing', 'citadel', 'renaissance',
];
const BOT_TECH_PRIORITY_MAGIC = [
  // Économie de base d'abord
  'agriculture', 'stargazing', 'elements_study',
  // Mage tower (T2) débloque le nécromancien
  'mage_tower', 'pyromancy',
  // Militaire de base pour ne pas être démuni en early
  'archery', 'riding',
  // Magie avancée
  'lightning', 'enchantment', 'cryomancy', 'teleportation',
  'necromancy', 'illusion', 'arcane_ricochet',
  'lich', 'elemental_summon', 'time_mastery',
  'arcane_avatar',
];
const BOT_TECH_PRIORITY_RELIGION = [
  // Économie + religion de base
  'agriculture', 'animism', 'prayer',
  'temple', 'pilgrimage', 'inquisition',
  // Militaire de base
  'archery', 'riding',
  // Religion avancée
  'blessing', 'purifying_light', 'sacred_order',
  'cathedral', 'crusade', 'martyrs',
  'guardian_angel', 'excommunication', 'unwavering_faith',
  'divine_invocation',
];
// Pool d'unités prioritaires SPÉCIFIQUE à chaque spécialité, du plus fort au plus simple.
// Le bot tente toujours ses unités haut-tier d'abord ; à défaut, fallback militaire commun.
const BOT_UNITS_BY_SPECIALTY = {
  science:  ['elite_guard', 'cannon', 'heavy_knight', 'crossbowman', 'general', 'catapult', 'knight', 'archer', 'soldier'],
  magic:    ['arcane_dragon', 'fire_elemental', 'necromancer', 'knight', 'archer', 'soldier'],
  religion: ['god_avatar', 'angel', 'holy_knight', 'inquisitor', 'pilgrim', 'knight', 'archer', 'soldier'],
};

// Plans de construction par spécialité : bâtiments d'ÉCONOMIE (mana/foi) d'abord,
// défense (tour) ensuite. Sans ça, les bots magic/religion n'avaient JAMAIS de
// mana/foi et ne produisaient jamais leurs unités de spécialité.
const BOT_BUILD_PLANS = {
  science: [
    { type: 'tower',      tech: 'military_architecture', max: 2 },
  ],
  magic: [
    { type: 'sanctum',    tech: 'elements_study',        max: 2 },
    { type: 'mage_tower', tech: 'mage_tower',            max: 2 },
    { type: 'tower',      tech: 'military_architecture', max: 2 },
  ],
  religion: [
    { type: 'altar',      tech: 'animism',               max: 2 },
    { type: 'temple',     tech: 'temple',                max: 2 },
    { type: 'cathedral',  tech: 'cathedral',             max: 1 },
    { type: 'tower',      tech: 'military_architecture', max: 2 },
  ],
};

// Choix aléatoire de spécialité au moment du spawn d'un bot.
function pickBotSpecialty() {
  const r = Math.random();
  if (r < 0.34) return 'science';
  if (r < 0.67) return 'magic';
  return 'religion';
}

function botTick(bot) {
  if (bot.eliminated) return;
  bot.botState = bot.botState || {
    lastWaveTime: 0, lastBuildTime: 0, lastVillageScout: 0,
  };
  const nowMs = Date.now();

  // 1. RECHERCHE TECH ────────────────────────────────────────────
  // Chaque bot suit la route de sa spécialité, complétée par les autres axes
  // une fois sa propre branche épuisée (pour qu'il continue de progresser tard).
  const specialty = bot.botSpecialty || 'science';
  let primaryRoute;
  if (specialty === 'magic')         primaryRoute = BOT_TECH_PRIORITY_MAGIC;
  else if (specialty === 'religion') primaryRoute = BOT_TECH_PRIORITY_RELIGION;
  else                                primaryRoute = BOT_TECH_PRIORITY_SCIENCE;
  // En fin de chaîne : techs des deux autres axes (pour le snowball late-game)
  const techRoute = [
    ...primaryRoute,
    ...BOT_TECH_PRIORITY_SCIENCE,
    ...BOT_TECH_PRIORITY_MAGIC,
    ...BOT_TECH_PRIORITY_RELIGION,
  ];
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

  // 3. CONSTRUCTION ────────────────────────────────────────────────
  // Économie de spécialité d'abord (sanctum/mage_tower/autel/temple…),
  // défense (tour) ensuite — cf. BOT_BUILD_PLANS.
  if (nowMs - bot.botState.lastBuildTime > 3000) {
    const plans = BOT_BUILD_PLANS[specialty] || BOT_BUILD_PLANS.science;
    for (const plan of plans) {
      if (!hasTech(bot, plan.tech)) continue;
      const def = BUILDING_TYPES[plan.type];
      if (!def) continue;
      const count = gameState.buildings.filter(b => b.ownerId === bot.id && b.type === plan.type).length;
      if (count >= plan.max) continue;
      if (bot.gold < def.cost + 40) continue; // garde une marge pour les unités
      // Trouve une position libre autour du HDV (8 directions, rayon croissant)
      const buildRadius = baseBuildRadius('hdv', bot);
      let built = false;
      for (let attempt = 0; attempt < 8 && !built; attempt++) {
        const angle = (attempt / 8) * Math.PI * 2 + Math.random() * 0.4;
        const dist = Math.min(buildRadius - 30, 110 + attempt * 12);
        const snap = snapToGrid(bot.x + Math.cos(angle) * dist, bot.y + Math.sin(angle) * dist);
        if (Math.hypot(bot.x - snap.x, bot.y - snap.y) < BUILDING_MIN_DIST_HDV) continue;
        if (gameState.buildings.some(b => b.x === snap.x && b.y === snap.y)) continue;
        bot.gold -= def.cost;
        gameState.buildings.push({
          id: `b_${nextBuildingId++}`,
          ownerId: bot.id, type: plan.type,
          x: snap.x, y: snap.y,
          hp: def.hp, maxHp: def.hp,
          lastAttackTime: 0,
        });
        bot.botState.lastBuildTime = nowMs;
        console.log(`[Bot ${bot.name}] construit ${plan.type} en (${snap.x}, ${snap.y})`);
        built = true;
      }
      if (built) break;
    }
  }

  // 4. SPAWN UNITÉ ────────────────────────────────────────────────
  // Préfère les unités haut tiers débloquées ; respect du cap de population.
  const myUnits = Object.values(gameState.units).filter(u => u.ownerId === bot.id);
  const botPopUsed = getPopulationUsed(bot);
  const botPopMax  = getPopulationMax(bot);

  if (botPopUsed < botPopMax) {
    // Ordre de préférence selon la spécialité du bot (magie/religion/science).
    const preferOrder = BOT_UNITS_BY_SPECIALTY[specialty] || BOT_UNITS_BY_SPECIALTY.science;
    for (const typeId of preferOrder) {
      const def = UNIT_TYPES[typeId];
      if (!unitTypeUnlocked(bot, typeId)) continue;
      if (bot.gold < def.cost) continue;
      if (def.manaCost && (bot.mana || 0) < def.manaCost) continue;
      if (def.faithCost && (bot.faith || 0) < def.faithCost) continue;
      if (botPopUsed + (def.populationCost || 1) > botPopMax) continue;
      // Cap pèlerins : précieux pour la foi mais inutiles en combat — max 4.
      if (typeId === 'pilgrim' && myUnits.filter(u => u.type === 'pilgrim').length >= 4) continue;
      bot.gold -= def.cost;
      if (def.manaCost)  bot.mana  = Math.max(0, (bot.mana  || 0) - def.manaCost);
      if (def.faithCost) bot.faith = Math.max(0, (bot.faith || 0) - def.faithCost);
      bot.unitsCreated++;
      const pos = findFreeSpawnPos(bot.x, bot.y, 70 + Math.random() * 30);
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

  // Unités COMBATTANTES au repos disponibles pour des ordres (proches du HDV).
  // Les non-combattants (pèlerins, colons) restent à la base.
  const armyAtBase = myUnits.filter(u =>
    u.mode === 'defend' && u.attackTargetId === null
    && (u.damage || 0) > 0
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
    // On annule aussi attackTargetId : sinon le rappel était sans effet
    // (le mouvement suit la cible d'attaque quel que soit le mode).
    for (const u of myUnits) {
      if (u.mode === 'move') {
        u.mode = 'defend'; u.defendX = bot.x; u.defendY = bot.y; u.defendRadius = 360;
        u.targetX = null; u.targetY = null;
        u.attackTargetId = null; u.attackTargetType = null;
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
          // Mémorise la cible village : à l'arrivée, l'unité reste sur place
          // pour démarrer la capture (10s sur place).
          u.defendX = nearest.x; u.defendY = nearest.y; u.defendRadius = 70;
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
    && (u.damage || 0) > 0
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
      // 70% de l'army part en wave, 30% reste défensive.
      // FIX PASSIVITÉ : on assigne attackTargetId=HDV plutôt qu'un point flou,
      // de sorte que les unités gardent une cible explicite jusqu'à destruction.
      const waveSize = Math.floor(stillAtBase.length * 0.7);
      const wave = stillAtBase.slice(0, waveSize);
      for (const u of wave) {
        u.attackTargetId = target.id;
        u.attackTargetType = 'hdv';
        u.targetX = target.x + (Math.random() - 0.5) * 120;
        u.targetY = target.y + (Math.random() - 0.5) * 120;
        u.mode = 'move';
      }
      bot.botState.lastWaveTime = nowMs;
      bot.botState.targetPlayerId = target.id;
      console.log(`[Bot ${bot.name}] WAVE de ${wave.length} unités sur ${target.name} (HP ${target.hp}/${target.maxHp})`);
    }
  }
}

// Reverse-map unité → tech qui la débloque (via node.unlocks.units ou node.unitType).
// Permet d'exiger la tech pour les unités boss (god_avatar, arcane_dragon, angel,
// fire_elemental…) qui ont requiresTech:null dans UNIT_TYPES mais sont gatées par
// des nœuds tier 5-6 dans l'arbre. Sans ça, elles étaient spawnables sans tech.
const UNIT_UNLOCK_TECH = {};
for (const [tid, node] of Object.entries(NEW_TECH_TREE)) {
  if (node && node.unlocks && Array.isArray(node.unlocks.units)) {
    for (const ut of node.unlocks.units) if (!UNIT_UNLOCK_TECH[ut]) UNIT_UNLOCK_TECH[ut] = tid;
  }
  if (node && node.unitType && !UNIT_UNLOCK_TECH[node.unitType]) UNIT_UNLOCK_TECH[node.unitType] = tid;
}

function unitTypeUnlocked(player, typeId) {
  const def = UNIT_TYPES[typeId];
  if (!def) return false;
  // Invocations pures (squelettes) : jamais productibles directement
  if (SUMMONED_ONLY_TYPES.has(typeId)) return false;
  if (def.requiresTech) return hasTech(player, def.requiresTech);
  // Tech indirecte via l'arbre (unlocks.units) — ex. unités boss
  const indirect = UNIT_UNLOCK_TECH[typeId];
  if (indirect) return hasTech(player, indirect);
  return true;
}

// Fallback en coin DYNAMIQUE (relatif à la taille actuelle de la map).
// Bug fix : auparavant hardcodé { x:500, y:500 }, { x:4000, y:500 }… ce qui
// envoyait 3 HDV sur 4 HORS de la map quand celle-ci faisait 3000 (Petite).
function fallbackSpawns() {
  const m = SPAWN_MARGIN;
  return [
    { x: m,             y: m              },
    { x: MAP_WIDTH - m, y: m              },
    { x: m,             y: MAP_HEIGHT - m },
    { x: MAP_WIDTH - m, y: MAP_HEIGHT - m },
  ];
}

// Palette néon alignée sur le client (theme.js FCOL_STR) : cyan, rose-rouge, violet, lime.
// NB : le client recalcule ses propres couleurs par slot (joueur local = cyan) ;
// ces valeurs servent de fallback pour les payloads qui transportent une couleur.
const COLORS = ['#22d3ee', '#fb7185', '#c084fc', '#a3e635'];

// Génère MAX_PLAYERS points avec distance min entre eux (rejection sampling).
// Fallback aux coins si on n'arrive pas à placer.
function generateSpawns() {
  const spawns = [];
  let attempts = 0;
  while (spawns.length < MAX_PLAYERS && attempts < SPAWN_MAX_ATTEMPTS) {
    attempts++;
    const x = SPAWN_MARGIN + Math.random() * (MAP_WIDTH  - 2 * SPAWN_MARGIN);
    const y = SPAWN_MARGIN + Math.random() * (MAP_HEIGHT - 2 * SPAWN_MARGIN);
    const ok = spawns.every(s => Math.hypot(s.x - x, s.y - y) >= MIN_SPAWN_DIST);
    if (ok) spawns.push({ x: Math.round(x), y: Math.round(y) });
  }
  if (spawns.length < MAX_PLAYERS) {
    console.warn(`generateSpawns: only placed ${spawns.length}/${MAX_PLAYERS} after ${attempts} tries, using fallback corners`);
    // Fallback : coins recalculés à partir de la taille de map ACTUELLE, clampés.
    return fallbackSpawns().map(s => ({
      x: Math.round(Math.max(SPAWN_MARGIN, Math.min(MAP_WIDTH  - SPAWN_MARGIN, s.x))),
      y: Math.round(Math.max(SPAWN_MARGIN, Math.min(MAP_HEIGHT - SPAWN_MARGIN, s.y))),
    }));
  }
  console.log('Random spawns:', spawns.map(s => `(${s.x},${s.y})`).join(' '));
  return spawns;
}

// Initialisation map (dimensions, grid) — config de la room si fournie
applyMapConfig(config.mapType || DEFAULT_MAP_TYPE, config.mapSize || DEFAULT_MAP_SIZE);
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
    {
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
  emitAll('gameOver', buildGameOverPayload(winnerId, reason));
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
  emitAll('playerEliminated', { playerId: player.id, name: player.name, color: player.color });
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
    p.researchPoints  = 0;
    p.mana            = 0;
    p.faith           = 0;
    p.unlockedTechs   = [];
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

// Ajoute un joueur humain à CETTE partie (ex-corps de io.on('connection')).
// `joinName` : pseudo transmis par le flux lobby (phase 2) ; à défaut, fallback
// sur handshake.auth (anciens clients en cache).
// Retourne { ok: true } ou { ok: false, reason: 'ended'|'full' } — c'est
// l'appelant (couche lobby) qui décide quoi faire du refus (ack ou disconnect).
function addPlayer(socket, joinName) {
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
    return { ok: false, reason: 'ended' };
  }

  const slot = getAvailableSlot();
  if (slot === -1) {
    console.log(`Partie pleine — refus de ${socket.id.slice(0, 6)}`);
    return { ok: false, reason: 'full' };
  }

  const rawName    = (joinName != null && joinName !== '')
    ? String(joinName)
    : ((socket.handshake.auth && socket.handshake.auth.name) || '');
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
    gameState.camps     = generateCamps(currentSpawns, gameState.villages);
    gameState.buildings = [];
    // Purge les neutres de l'ancienne map (sinon faune/mobs orphelins, parfois dans l'eau)
    // et régénère camps + faune cohérents avec la nouvelle map.
    for (const uid of Object.keys(gameState.units)) {
      if (isNeutralOwner(gameState.units[uid].ownerId)) delete gameState.units[uid];
    }
    spawnAllCampMobs();
    spawnAllFauna(currentSpawns);
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
    hdvLevel: 1,
    researchPoints: 0, mana: 0, faith: 0,
    unlockedTechs: [],
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
    unitTypes: UNIT_TYPES,
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
    techTree: NEW_TECH_TREE, // arbre tech radial (3 axes)
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

    const pos = findFreeSpawnPos(p.x, p.y, 70 + Math.random() * 30);

    p.gold -= def.cost;
    if (def.manaCost)  p.mana  = Math.max(0, (p.mana  || 0) - def.manaCost);
    if (def.faithCost) p.faith = Math.max(0, (p.faith || 0) - def.faithCost);
    p.unitsCreated++;
    const unitId = `unit_${nextUnitId++}`;

    const hpBase = Math.round(def.hp * unitHpMult(p, typeId));
    gameState.units[unitId] = {
      id: unitId,
      ownerId: socket.id,
      x: pos.x,
      y: pos.y,
      type: typeId,
      hp: hpBase,
      maxHp: hpBase,
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
      emitAll('treatySigned', { a: p.id, b: t.id, aName: p.name, bName: t.name });
      console.log(`Pacte de non-agression : ${p.name} ↔ ${t.name}`);
    }
  });
  socket.on('breakTreaty', ({ targetId } = {}) => {
    const p = gameState.players[socket.id];
    const t = gameState.players[targetId];
    if (!p || !t) return;
    p.allies = (p.allies || []).filter(x => x !== t.id);
    t.allies = (t.allies || []).filter(x => x !== p.id);
    emitAll('treatyBroken', { a: p.id, b: t.id });
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
    emitAll('techUnlocked', { playerId: p.id, techId, name: node.name, icon: node.icon, axis: node.axis });
    // Broadcast immédiat pour que le client voie le nouvel état sans attendre le tick
    broadcastFilteredState();
  });
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
    emitAll('buildingSold', { buildingId, refund, ownerId: p.id });
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
    const pos = findFreeSpawnPos(v.x, v.y, 55 + Math.random() * 25);
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
    if (process.env.NODE_ENV === 'production') return; // anti-cheat : debug désactivé en prod
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
    if (process.env.NODE_ENV === 'production') return; // anti-cheat : debug désactivé en prod
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
    emitAll('spellCast', { spellId: 'portal', x: tx, y: ty, casterId: p.id, color: p.color, radius: 80 });
  });

  socket.on('addBot', () => {
    // Réservé à l'hôte de la room (anti-grief dans les parties publiques)
    if (config.isHost && !config.isHost(socket.id)) {
      socket.emit('spawnFailed', { reason: 'host_only' });
      return;
    }
    if (Object.keys(gameState.players).length >= MAX_PLAYERS) return;
    addBot();
    broadcastFilteredState();
  });

  // ── Sorts actifs ciblés au sol (hotkeys F/G/H/J) ──
  // AoE dégâts (fireball), ralentissement (freeze), soin (blessing),
  // purification anti-magie (purifying_light). Limités par coût ressource
  // + un cooldown propre à chaque sort. Les invocations passent par spawnUnit.
  socket.on('castSpell', ({ spellId, x, y } = {}) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    const spell = SPELLS[spellId];
    if (!spell) return;
    if (spell.requiresTech && !hasTech(p, spell.requiresTech)) {
      socket.emit('spawnFailed', { reason: 'spell_locked' });
      return;
    }
    // Cooldown propre au sort
    p.spellCooldowns = p.spellCooldowns || {};
    const lastCast = p.spellCooldowns[spellId] || 0;
    if (Date.now() - lastCast < (spell.cooldownMs || 1000)) {
      socket.emit('spawnFailed', { reason: 'spell_cooldown' });
      return;
    }
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

    const r2 = spell.radius * spell.radius;
    const inRadius = (u) => {
      const dx = u.x - x, dy = u.y - y;
      return dx * dx + dy * dy <= r2;
    };
    // Crédite un kill par sort (+ drops PvE / clear de camp) et supprime l'unité.
    const killBySpell = (u) => {
      u.hp = 0;
      delete gameState.units[u.id];
      if (!p.eliminated) p.kills++;
      onNeutralUnitKilled(u, p.id, null);
    };

    if (spell.type === 'aoe_damage') {
      for (const u of Object.values(gameState.units)) {
        if (friendly(u.ownerId, p.id) || !inRadius(u)) continue;
        u.hp = Math.max(0, u.hp - spell.damage);
        if (u.hp <= 0) killBySpell(u);
      }
    } else if (spell.type === 'aoe_slow') {
      const until = Date.now() + spell.durationMs;
      for (const u of Object.values(gameState.units)) {
        if (friendly(u.ownerId, p.id) || !inRadius(u)) continue;
        u.frozenUntil = until;
      }
    } else if (spell.type === 'aoe_heal') {
      for (const u of Object.values(gameState.units)) {
        if (!friendly(u.ownerId, p.id) || !inRadius(u)) continue;
        u.hp = Math.min(u.maxHp || u.hp, u.hp + spell.heal);
      }
    } else if (spell.type === 'aoe_purify') {
      for (const u of Object.values(gameState.units)) {
        if (friendly(u.ownerId, p.id) || !inRadius(u)) continue;
        const mult = MAGIC_UNDEAD.has(u.type) ? (spell.magicMult || 1) : 1;
        u.hp = Math.max(0, u.hp - spell.damage * mult);
        if (u.hp <= 0) killBySpell(u);
      }
    }
    // Broadcast pour l'animation client (couleur Theme côté client via casterId)
    emitAll('spellCast', { spellId, x, y, casterId: p.id, radius: spell.radius });
  });

  socket.on('requestRestart', () => {
    if (gameState.matchState !== 'ended') return;
    resetMatch();
    console.log(`Match restarted by ${socket.id.slice(0,6)}`);
    emitAll('matchRestarted');
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

  return { ok: true };
}

// Game loop — order: behavior → move → collisions → combat → gold → broadcast
// (ex-corps du setInterval 20 Hz ; appelé par le scheduler module-level)
function tick() {
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
        if (friendly(other.ownerId, unit.ownerId)) continue;
        const d = Math.hypot(other.x - cx, other.y - cy);
        if (d > radius) continue;
        const score = other.hp + d * 0.3;
        if (score < bestScore) { best = other; bestScore = score; bestType = 'unit'; }
      }
      for (const player of Object.values(gameState.players)) {
        if (player.id === unit.ownerId || player.hp <= 0 || player.eliminated) continue;
        if (areAllied(player.id, unit.ownerId)) continue;
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
      if (unit.targetX === null) {
        // Arrivé à destination (ou route perdue) : passe en garde SUR PLACE.
        // → un attack-move se termine en mode garde au lieu de laisser le pion inerte.
        unit.mode = 'defend';
        unit.defendX = unit.x;
        unit.defendY = unit.y;
        unit.defendRadius = unit.defendRadius || 320;
      } else if ((unit.damage || 0) > 0) {
        // Engagement opportuniste : si un ennemi entre à portée+40 sur le chemin → attaque
        const scanR = (unit.range || 80) + 40;
        let nearest = null, nearestDist = scanR;
        for (const other of Object.values(gameState.units)) {
          if (friendly(other.ownerId, unit.ownerId)) continue;
          const d = Math.hypot(other.x - unit.x, other.y - unit.y);
          if (d < nearestDist) { nearest = other; nearestDist = d; }
        }
        if (nearest) {
          unit.attackTargetId = nearest.id;
          unit.attackTargetType = 'unit';
          rallyNearbyAllies(unit, nearest.id, 'unit');
          // On garde targetX/targetY : après le kill, la cible est null et le pion reprend sa route
        }
      }
    } else if (unit.mode === 'attack') {
      // Combat terminé (cible morte ou perdue) : ré-ancre une défense SUR PLACE.
      // Fix "statue" : avant, une unité passée en mode attack (riposte, rally,
      // ordre joueur) restait inerte pour toujours une fois sa cible morte.
      unit.mode = 'defend';
      unit.defendX = unit.x;
      unit.defendY = unit.y;
      unit.defendRadius = unit.defendRadius || 320;
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
    // mode non défini : aucune auto-cible
  }

  // 1. Move (ATTACK_MOVE / MOVE / IDLE) — stats par unité
  for (const unit of Object.values(gameState.units)) {
    const baseSpeed = unit.speed || 80;
    const isFrozen  = unit.frozenUntil  && unit.frozenUntil  > nowMs;
    const isFeared  = unit.fearedUntil  && unit.fearedUntil  > nowMs;
    // Bonus tech de mobilité (cumulables) :
    //   - 'roads' (science T2) : +12% vitesse toutes unités
    //   - 'teleportation' (magie T3) : +15% vitesse toutes unités
    const owner = gameState.players[unit.ownerId];
    let speedBonus = 1.0;
    if (owner && hasTech(owner, 'roads')) speedBonus *= 1.12;
    if (owner && hasTech(owner, 'teleportation')) speedBonus *= 1.15;
    // Bonus tech 'lightning' (magic_speed_vision) → +25% vitesse pour unités magie
    if (owner && hasTech(owner, 'lightning') && MAGIC_UNDEAD.has(unit.type)) speedBonus *= 1.25;
    // Frozen : 0.3× (gel magique) — Feared : 0.5× (aura god_avatar)
    const speedMult = isFrozen ? 0.3 : (isFeared ? 0.5 : speedBonus);
    const uSpeed    = baseSpeed * speedMult;
    const uRange = effectiveRange(unit) || unit.range || 80;
    const step = uSpeed / TICK_RATE;
    const attackReach = uRange - UNIT_RADIUS;
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
        if (unitToVillageDist(unit, target) <= attackReach) continue;
        goalX = target.x; goalY = target.y;
      } else if (unit.attackTargetType === 'building') {
        const target = gameState.buildings.find(bb => bb.id === unit.attackTargetId);
        if (!target || target.hp <= 0) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        if (unitToBuildingDist(unit, target) <= attackReach) continue;
        goalX = target.x; goalY = target.y;
        skipBuildingId = unit.attackTargetId;
      } else {
        const target = gameState.players[unit.attackTargetId];
        if (!target || target.hp <= 0) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        if (unitToHdvDist(unit, target) <= attackReach) continue;
        goalX = target.x; goalY = target.y;
        skipPlayerId = unit.attackTargetId;
      }
    } else if (unit.targetX !== null) {
      goalX = unit.targetX; goalY = unit.targetY;
      const dist = Math.hypot(unit.targetX - unit.x, unit.targetY - unit.y);
      if (dist <= step) {
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
    unit.x += nx * step;
    unit.y += ny * step;
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
        emitAll('villageCaptured', { villageId: 'colon', ownerId: u.ownerId,
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
    // Non-combattants (pèlerin, colon) : jamais d'attaque, même en idle.
    // Fix : avant, les fallbacks `|| 5` et `|| 80` leur donnaient 5 dmg / 80 de portée.
    if ((unit.damage || 0) <= 0) continue;
    // Cooldown d'attaque — réduit de 20% pour les unités magie/undead si tech 'time_mastery'
    let atkCooldown = ATTACK_COOLDOWN_MS;
    if (MAGIC_UNDEAD.has(unit.type) && hasTech(gameState.players[unit.ownerId], 'time_mastery')) {
      atkCooldown *= 0.8;
    }
    // Tech 'ballistics' : +25% cadence sur les unités à projectile (cooldown ×0.8)
    atkCooldown = effectiveCooldown(unit.ownerId, unit.type, atkCooldown);
    if (nowMs - unit.lastAttackTime < atkCooldown) continue;
    const uRange  = effectiveRange(unit) || unit.range || 80;
    // Aura Général : +25% dégâts pour les unités proches d'un Général allié
    let uDamage = unit.damage * generalAuraDmgBonus(unit);
    const attackReach = uRange - UNIT_RADIUS;

    // Tech 'crossbows' : archer +50% dmg (le -20% de portée est dans effectiveRange)
    if (unit.type === 'archer' && hasTech(gameState.players[unit.ownerId], 'crossbows')) {
      uDamage *= 1.5;
    }

    if (unit.attackTargetId !== null) {
      let target, inRange = false;
      if (unit.attackTargetType === 'unit') {
        target = gameState.units[unit.attackTargetId];
        if (!target || toDelete.has(target.id)) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        inRange = Math.hypot(target.x - unit.x, target.y - unit.y) <= uRange;
      } else if (unit.attackTargetType === 'village') {
        target = gameState.villages.find(vv => vv.id === unit.attackTargetId);
        if (!target || target.hp <= 0) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        inRange = unitToVillageDist(unit, target) <= attackReach;
      } else if (unit.attackTargetType === 'building') {
        target = gameState.buildings.find(bb => bb.id === unit.attackTargetId);
        if (!target || target.hp <= 0) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        inRange = unitToBuildingDist(unit, target) <= attackReach;
      } else {
        target = gameState.players[unit.attackTargetId];
        if (!target || target.hp <= 0) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        inRange = unitToHdvDist(unit, target) <= attackReach;
      }
      if (!inRange) continue;

      // ── Modificateurs de dégâts — calculés UNIQUEMENT une fois à portée ──
      // offDamage = dégâts offensifs pré-défense : base des dégâts dérivés
      // (splash pyromancy, ricochet), chacun ré-appliquant la défense de SA victime.
      let offDamage = uDamage;
      if (unit.attackTargetType === 'unit') {
        offDamage = uDamage * offensiveDamageMult(unit, target);
        uDamage   = offDamage * defensiveDamageMult(unit, target);
        // Passif 'magic_slow_chance' (cryomancy) : 20% de chance de gel 2s par TIR.
        // (après le check inRange — avant, le roll tournait à 20 Hz pendant la
        // poursuite → gel quasi permanent à n'importe quelle distance)
        if (MAGIC_UNDEAD.has(unit.type)
            && hasTech(gameState.players[unit.ownerId], 'cryomancy')
            && Math.random() < 0.20) {
          target.frozenUntil = nowMs + 2000;
        }
      }
      // Tech 'crusade' : +25% dégâts sur HDV / bâtiments / villages
      if ((unit.attackTargetType === 'hdv' || unit.attackTargetType === 'building'
           || unit.attackTargetType === 'village')
          && hasTech(gameState.players[unit.ownerId], 'crusade')) {
        uDamage *= 1.25;
      }

      unit.lastAttackTime = nowMs;
      target.hp = Math.max(0, target.hp - uDamage);
      // AoE de zone (fire_elemental / god_avatar) : tag pour la section 3.6.b
      if (SPLASH_AOE_UNITS[unit.type] && unit.attackTargetType === 'unit') {
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
        dmg: Math.round(uDamage),
      };

      // ── Passif 'magic_splash' (pyromancy) : mini-AoE 30 px à chaque tir magique ──
      // Touche tous les ennemis voisins de la cible (×0.5 dmg). Joueurs alliés exclus.
      if (unit.attackTargetType === 'unit'
          && MAGIC_UNDEAD.has(unit.type)
          && hasTech(gameState.players[unit.ownerId], 'pyromancy')) {
        const splashRsq = 30 * 30;
        const splashHits = [];
        for (const u2 of Object.values(gameState.units)) {
          if (u2.id === target.id || u2.id === unit.id) continue;
          if (friendly(u2.ownerId, unit.ownerId)) continue;
          if (toDelete.has(u2.id) || u2.hp <= 0) continue;
          const dsq = (u2.x - target.x) ** 2 + (u2.y - target.y) ** 2;
          if (dsq <= splashRsq) {
            // Défense de CHAQUE victime périphérique (unwavering_faith, excommunication)
            const splashDmg = offDamage * 0.5 * defensiveDamageMult(unit, u2);
            u2.hp = Math.max(0, u2.hp - splashDmg);
            splashHits.push({ id: u2.id, x: u2.x, y: u2.y, killed: u2.hp <= 0 });
            if (u2.hp <= 0) {
              u2._killedByType = unit.type;
              u2._killedByOwner = unit.ownerId;
              toDelete.add(u2.id);
              const killer = gameState.players[unit.ownerId];
              if (killer && !killer.eliminated) killer.kills++;
              // Drops PvE + décompte de camp — sinon un camp dont le dernier
              // mob meurt au splash restait "innettoyable" à jamais.
              onNeutralUnitKilled(u2, unit.ownerId, null);
            }
          }
        }
        if (splashHits.length) attackEntry.magicSplash = { hits: splashHits, center: { x: target.x, y: target.y } };
      }

      // ── Tech 'arcane_ricochet' : tirs magiques rebondissent 1× sur ennemi <120 px (×0.6 dmg) ──
      if (unit.attackTargetType === 'unit'
          && MAGIC_UNDEAD.has(unit.type)
          && hasTech(gameState.players[unit.ownerId], 'arcane_ricochet')) {
        let ric = null, ricDsq = 120 * 120;
        for (const u2 of Object.values(gameState.units)) {
          if (u2.id === target.id || u2.id === unit.id) continue;
          if (friendly(u2.ownerId, unit.ownerId)) continue;
          if (toDelete.has(u2.id) || u2.hp <= 0) continue;
          const dsq = (u2.x - target.x) ** 2 + (u2.y - target.y) ** 2;
          if (dsq < ricDsq) { ric = u2; ricDsq = dsq; }
        }
        if (ric) {
          const ricDmg = offDamage * 0.6 * defensiveDamageMult(unit, ric);
          ric.hp = Math.max(0, ric.hp - ricDmg);
          attackEntry.ricochet = { targetId: ric.id, x: ric.x, y: ric.y, dmg: ricDmg };
          if (ric.hp <= 0) {
            ric._killedByType  = unit.type;
            ric._killedByOwner = unit.ownerId;
            toDelete.add(ric.id);
            attackEntry.ricochet.killed = true;
            const killer = gameState.players[unit.ownerId];
            if (killer && !killer.eliminated) killer.kills++;
            onNeutralUnitKilled(ric, unit.ownerId, attackEntry);
          }
        }
      }

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
        emitAll('villageDestroyed', { villageId: target.id, byPlayerId: unit.ownerId, prevOwnerId: prevOwner });
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
        if (toDelete.has(other.id) || friendly(other.ownerId, unit.ownerId)) continue;
        const d = Math.hypot(other.x - unit.x, other.y - unit.y);
        if (d <= uRange && d < bestDist) { best = other; bestDist = d; bestType = 'unit'; }
      }
      for (const player of Object.values(gameState.players)) {
        if (player.id === unit.ownerId || player.hp <= 0) continue;
        if (areAllied(player.id, unit.ownerId)) continue;
        const edgeDist = unitToHdvDist(unit, player);
        if (edgeDist <= attackReach && edgeDist < bestDist) {
          best = player; bestDist = edgeDist; bestType = 'hdv';
        }
      }

      if (!best) continue;

      unit.lastAttackTime = nowMs;
      // Mêmes modificateurs que le chemin ciblé (inquisiteur, pyromancie, défenses)
      if (bestType === 'unit') {
        uDamage = uDamage * offensiveDamageMult(unit, best) * defensiveDamageMult(unit, best);
      }
      best.hp = Math.max(0, best.hp - uDamage);
      if (SPLASH_AOE_UNITS[unit.type] && bestType === 'unit') {
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
        dmg: Math.round(uDamage),
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
    // Tech 'ballistics' : tower/bombard cadence +25% (cooldown ×0.8)
    const bCooldown = effectiveCooldown(b.ownerId, b.type, def.cooldownMs || 1000);
    if (nowMs - b.lastAttackTime < bCooldown) continue;
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
      const entry = { attackerId: b.id, attackerType: 'building', attackerBuildingType: b.type, targetType: 'unit', targetId: bestTarget.id, bx: b.x, by: b.y, dmg: Math.round(def.damage) };
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
      const entry = { attackerId: 'citadel_' + p.id, attackerType: 'building', attackerBuildingType: 'citadel', targetType: 'unit', targetId: best.id, bx: p.x, by: p.y, dmg: CIT_DMG };
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
  // b) fire_elemental / god_avatar : dégâts AoE autour de la cible (cf. SPLASH_AOE_UNITS)
  // c) Pilgrim mort : explosion de soin AoE 200 HP rayon 100 alliés
  // d) Nécromancien : résurrection au kill (squelette, ou clone si tech 'lich')
  // e) Lifetime decay : summoned units meurent après leur durée de vie
  // f) Angel heal aura : appliquée dans la section 1/s plus bas

  // a) Fear aura (god_avatar) — épargne les alliés diplomatiques (friendly)
  for (const u of Object.values(gameState.units)) {
    if (u.type !== 'god_avatar') continue;
    for (const other of Object.values(gameState.units)) {
      if (friendly(other.ownerId, u.ownerId) || toDelete.has(other.id)) continue;
      if (Math.hypot(other.x - u.x, other.y - u.y) <= 400) {
        other.fearedUntil = nowMs + 200; // refresh chaque tick (~50ms)
      }
    }
  }

  // b) AoE de zone autour de la cible (tag _aoeAroundTarget posé en boucle combat)
  for (const u of Object.values(gameState.units)) {
    const aoe = SPLASH_AOE_UNITS[u.type];
    if (!aoe || !u._aoeAroundTarget) continue;
    const center = u._aoeAroundTarget;
    u._aoeAroundTarget = null;
    for (const other of Object.values(gameState.units)) {
      if (friendly(other.ownerId, u.ownerId) || toDelete.has(other.id)) continue;
      const d = Math.hypot(other.x - center.x, other.y - center.y);
      if (d > 0 && d <= aoe.radius) {
        other.hp = Math.max(0, other.hp - aoe.damage);
        if (other.hp <= 0) {
          // Crédite le kill + drops PvE + clear de camp (sinon camp jamais nettoyé si
          // le mob final meurt par splash) + tag résurrection necro/lich.
          other._killedByType  = u.type;
          other._killedByOwner = u.ownerId;
          toDelete.add(other.id);
          const killer = gameState.players[u.ownerId];
          if (killer && !killer.eliminated) killer.kills++;
          onNeutralUnitKilled(other, u.ownerId, null);
        }
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
        emitAll('pilgrimExplosion', { x: dead.x, y: dead.y, ownerId: dead.ownerId });
      }
    }
    // d) Résurrection par Nécromancien (refonte v3)
    //  - Sans tech : squelette standard (60s)
    //  - Tech 'necromancy' : squelette +20 % HP/dmg, cap d'undeads +3
    //  - Tech 'lich' : CLONE de la victime à -40 % HP/dmg (durée 30s, prend priorité)
    if (dead._killedByType === 'necromancer' && dead._killedByOwner) {
      const owner = gameState.players[dead._killedByOwner];
      const hasLich = owner && hasTech(owner, 'lich');
      const hasNecromancy = owner && hasTech(owner, 'necromancy');
      // Cap d'undeads actifs pour ce joueur (anti-spam)
      const undeadCap = hasNecromancy ? 12 : 9;
      const activeUndeads = Object.values(gameState.units).filter(u =>
        u.ownerId === dead._killedByOwner && u._summonedByNecro === true
      ).length;
      if (activeUndeads < undeadCap) {
        if (hasLich) {
          // Clone de la victime : prend type/stats de la victime à -40 %
          const victimDef = UNIT_TYPES[dead.type];
          if (victimDef) {
            newSummons.push({
              ownerId: dead._killedByOwner,
              x: dead.x, y: dead.y,
              type: dead.type,
              override: {
                hp: Math.max(10, Math.round((dead.maxHp || victimDef.hp) * 0.6)),
                damage: Math.max(1, Math.round((victimDef.damage || 0) * 0.6)),
                speed: victimDef.speed,
                range: victimDef.range,
                lifetime: 30000,
              },
              source: 'lich_clone',
            });
          }
        } else {
          // Pas de tech lich : squelette standard (boost si tech necromancy)
          const def = UNIT_TYPES.skeleton;
          newSummons.push({
            ownerId: dead._killedByOwner,
            x: dead.x, y: dead.y,
            type: 'skeleton',
            override: hasNecromancy ? {
              hp: Math.round(def.hp * 1.2),
              damage: Math.round(def.damage * 1.2),
              speed: def.speed, range: def.range,
              lifetime: 60000,
            } : {
              hp: def.hp, damage: def.damage,
              speed: def.speed, range: def.range,
              lifetime: 60000,
            },
            source: 'necro',
          });
        }
      }
    }
  }
  for (const s of newSummons) {
    const unitId = `unit_${nextUnitId++}`;
    const stats = s.override || {
      hp: s.def && s.def.hp, damage: s.def && s.def.damage,
      speed: s.def && s.def.speed, range: s.def && s.def.range,
    };
    gameState.units[unitId] = {
      id: unitId, ownerId: s.ownerId,
      x: s.x, y: s.y,
      type: s.type,
      hp: stats.hp, maxHp: stats.hp,
      speed: stats.speed, range: stats.range, damage: stats.damage, cost: 0,
      targetX: null, targetY: null,
      attackTargetId: null, attackTargetType: null,
      lastAttackTime: 0,
      mode: 'defend', defendX: s.x, defendY: s.y, defendRadius: 320,
      spawnTime: nowMs,
      // Tag pour le cap d'undeads (toutes les invocations du nécro) + visuel client.
      _summonedByNecro: true,
      _summonSource: s.source,
      _summonLifetime: s.override && s.override.lifetime,
    };
    emitAll('unitSummoned', {
      unitId, type: s.type, x: s.x, y: s.y, ownerId: s.ownerId,
      source: s.source,
    });
  }

  // e) Lifetime decay (summoned units)
  for (const uid of Object.keys(gameState.units)) {
    const u = gameState.units[uid];
    if (toDelete.has(uid)) continue;
    // Override lifetime (revive/lich_clone) prioritaire sur le défaut du type.
    const lifetime = u._summonLifetime || SUMMONED_LIFETIMES[u.type];
    if (!lifetime) continue;
    u.spawnTime = u.spawnTime || nowMs;
    if (nowMs - u.spawnTime >= lifetime) toDelete.add(uid);
  }

  if (attacks.length > 0) emitAll('attacks', attacks);

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
          emitAll('villageCaptured', { villageId: v.id, ownerId: claimer, ownerName: player.name, ownerColor: player.color });
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
      if (u.hp <= 0 || u.hp >= u.maxHp) continue;
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
            emitAll('barbarianRaid', { villageId: v.id, villageX: v.x, villageY: v.y,
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
}

// ── Interface publique de la partie ──
function humanCount()  { return Object.values(gameState.players).filter((p) => !p.isBot).length; }
function playerCount() { return Object.keys(gameState.players).length; }
function humans() {
  return Object.values(gameState.players)
    .filter((p) => !p.isBot)
    .map((p) => ({ id: p.id, name: p.name, joinTime: p.joinTime }));
}

return {
  tick,
  addPlayer,
  addBot,
  humanCount,
  playerCount,
  humans,
  getMatchState: () => gameState.matchState,
};
} // ← fin de createGame()

// ════════════════════════════════════════════════════════════════════════════
// RoomManager — phase 2 lobbys : plusieurs parties simultanées.
// room = { code, visibility, hostId, hostName, mapSize, createdAt, game }.
// Events lobby:* avec acks Socket.io (réponse directe, pas de course d'events).
// ════════════════════════════════════════════════════════════════════════════
const rooms = new Map();                 // code → room
const MAX_ROOMS = 20;                    // cap mémoire (Render free 512 MB)
const ROOM_TTL_MS = 3 * 60 * 60 * 1000;  // filet de sécurité : 3 h max par room
// Alphabet sans caractères ambigus (0/O, 1/I/L)
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function genRoomCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
}

function createRoom({ visibility, mapSize, hostSocketId, hostName }) {
  const code = genRoomCode();
  const room = {
    code, visibility, mapSize,
    hostId: hostSocketId, hostName,
    createdAt: Date.now(), tickErrors: 0,
    game: null,
  };
  room.game = createGame({
    mapSize,
    emitAll: (ev, data) => io.to('room:' + code).emit(ev, data),
    isHost: (sid) => sid === room.hostId,
  });
  rooms.set(code, room);
  console.log(`[lobby] Room ${code} créée (${visibility}, ${mapSize}) par ${hostName} — ${rooms.size} room(s)`);
  return room;
}

function destroyRoom(room, reason) {
  if (!rooms.delete(room.code)) return;
  // Préviens et éjecte les éventuels sockets restants (TTL, crash) — pour une
  // room vide c'est un no-op.
  io.to('room:' + room.code).emit('matchEnded');
  io.in('room:' + room.code).disconnectSockets(true);
  console.log(`[lobby] Room ${room.code} détruite (${reason}) — ${rooms.size} room(s)`);
}

// Fait entrer un socket dans une room : channel d'abord (pour recevoir les
// emitAll dès l'init), puis addPlayer ; rollback du channel en cas de refus.
function enterRoom(socket, room, name) {
  socket.join('room:' + room.code);
  const res = room.game.addPlayer(socket, name);
  if (!res.ok) {
    socket.leave('room:' + room.code);
    return res;
  }
  socket.data.room = room;
  return { ok: true };
}

// Compat anciens clients (page en cache) : pseudo dans le handshake → rejoint
// une room publique en attente, sinon en crée une. Conserve l'ancien contrat
// (emit matchEnded/serverFull + disconnect en cas de refus).
function joinLegacy(socket, auth) {
  let room = null;
  for (const r of rooms.values()) {
    if (r.visibility !== 'public') continue;
    if (r.game.getMatchState() !== 'waiting') continue;
    if (r.game.playerCount() >= MAX_PLAYERS) continue;
    room = r;
    break;
  }
  const name = String(auth.name || '').trim().slice(0, 20);
  if (!room) {
    if (rooms.size >= MAX_ROOMS) { socket.emit('serverFull'); socket.disconnect(true); return; }
    room = createRoom({
      visibility: 'public',
      mapSize: (auth.mapSize && MAP_SIZES[auth.mapSize]) ? auth.mapSize : DEFAULT_MAP_SIZE,
      hostSocketId: socket.id,
      hostName: name || 'Joueur',
    });
  }
  const res = enterRoom(socket, room, auth.name || '');
  if (!res.ok) {
    socket.emit(res.reason === 'ended' ? 'matchEnded' : 'serverFull');
    socket.disconnect(true);
  }
}

io.on('connection', (socket) => {
  const auth = socket.handshake.auth || {};

  // ── Lobby : créer une partie ──
  socket.on('lobby:create', (data, ack) => {
    if (typeof ack !== 'function') return;
    if (socket.data.room) return ack({ error: 'already_in_room' });
    if (rooms.size >= MAX_ROOMS) return ack({ error: 'server_full' });
    const name = String((data && data.name) || '').trim().slice(0, 20);
    const room = createRoom({
      visibility: (data && data.visibility) === 'private' ? 'private' : 'public',
      mapSize: (data && MAP_SIZES[data.mapSize]) ? data.mapSize : DEFAULT_MAP_SIZE,
      hostSocketId: socket.id,
      hostName: name || 'Joueur',
    });
    const res = enterRoom(socket, room, name);
    if (!res.ok) { destroyRoom(room, 'création échouée'); return ack({ error: res.reason }); }
    ack({ ok: true, code: room.code, isHost: true });
  });

  // ── Lobby : rejoindre par code (insensible à la casse) ──
  socket.on('lobby:join', (data, ack) => {
    if (typeof ack !== 'function') return;
    if (socket.data.room) return ack({ error: 'already_in_room' });
    const code = String((data && data.code) || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return ack({ error: 'not_found' });
    if (room.game.getMatchState() === 'ended') return ack({ error: 'ended' });
    const name = String((data && data.name) || '').trim().slice(0, 20);
    const res = enterRoom(socket, room, name);
    if (!res.ok) return ack({ error: res.reason });
    ack({ ok: true, code: room.code, isHost: socket.id === room.hostId });
  });

  // ── Lobby : liste des parties publiques joignables ──
  socket.on('lobby:list', (_data, ack) => {
    if (typeof ack !== 'function') return;
    const list = [];
    for (const r of rooms.values()) {
      if (r.visibility !== 'public') continue;
      const state = r.game.getMatchState();
      if (state === 'ended') continue;
      const count = r.game.playerCount();
      if (count >= MAX_PLAYERS) continue;
      list.push({ code: r.code, hostName: r.hostName, count, max: MAX_PLAYERS, mapSize: r.mapSize, state });
    }
    ack({ rooms: list });
  });

  // ── Sortie : destruction des rooms vides + réassignation d'hôte ──
  // setImmediate : laisse d'abord le handler gameplay (dans addPlayer) retirer
  // le joueur de gameState, puis on regarde ce qu'il reste.
  socket.on('disconnect', () => {
    const room = socket.data.room;
    if (!room) return;
    setImmediate(() => {
      if (!rooms.has(room.code)) return;
      if (room.game.humanCount() === 0) { destroyRoom(room, 'vide'); return; }
      if (room.hostId === socket.id) {
        const hs = room.game.humans();
        if (hs.length > 0) {
          hs.sort((a, b) => (a.joinTime || 0) - (b.joinTime || 0));
          room.hostId = hs[0].id;
          room.hostName = hs[0].name;
          console.log(`[lobby] Room ${room.code} : nouvel hôte ${room.hostName}`);
        }
      }
    });
  });

  // Ancien client (pseudo dans le handshake) → flux legacy direct
  if (auth.name !== undefined) joinLegacy(socket, auth);
});

// Scheduler unique : tick toutes les rooms ; une room qui crash ne tue pas les
// autres (avant la phase 1, une exception dans le tick tuait tout le process).
setInterval(() => {
  for (const room of rooms.values()) {
    try {
      room.game.tick();
      room.tickErrors = 0;
    } catch (e) {
      room.tickErrors = (room.tickErrors || 0) + 1;
      console.error(`[room ${room.code}] tick crash (${room.tickErrors})`, e);
      if (room.tickErrors > 100) destroyRoom(room, 'crashs répétés');
    }
  }
}, TICK_MS);

// Sweep de sécurité (60 s) : rooms vides ratées + TTL + télémétrie mémoire.
setInterval(() => {
  const now = Date.now();
  for (const room of [...rooms.values()]) {
    if (room.game.humanCount() === 0) destroyRoom(room, 'vide (sweep)');
    else if (now - room.createdAt > ROOM_TTL_MS) destroyRoom(room, 'TTL 3 h');
  }
  if (rooms.size > 0) {
    console.log(`[lobby] ${rooms.size} room(s) actives — heap ${(process.memoryUsage().heapUsed / 1048576).toFixed(0)} MB`);
  }
}, 60000);

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
