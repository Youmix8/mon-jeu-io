const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MAP_WIDTH  = 4500;
const MAP_HEIGHT = 4500;
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
const GRID_W      = MAP_WIDTH  / TILE_SIZE;   // 90
const GRID_H      = MAP_HEIGHT / TILE_SIZE;   // 90
const VISION_UNIT = 240;

// ────────── Tech tree, types d'unités, niveaux HDV ──────────

const UNIT_TYPES = {
  soldier: { id: 'soldier', name: 'Soldat',    cost: 10, hp: 50, speed:  80, range:  80, damage: 5, requiresTech: null,
             icon: '⚔️', desc: 'Polyvalent. Disponible dès le départ.' },
  archer:  { id: 'archer',  name: 'Archer',    cost: 15, hp: 30, speed:  80, range: 140, damage: 4, requiresTech: 'forging',
             icon: '🏹', desc: 'Longue portée mais fragile.' },
  knight:  { id: 'knight',  name: 'Chevalier', cost: 25, hp: 80, speed: 140, range:  55, damage: 8, requiresTech: 'cavalry',
             icon: '🐎', desc: 'Lourd et rapide, gros dégâts au contact.' },
};

const TECH_TREE = {
  forging:       { id: 'forging',       name: 'Forge',         icon: '🗡',  cost: 1, tier: 1, requires: [], desc: 'Débloque l\'Archer.',           effect: { unlockUnit: 'archer'  } },
  cavalry:       { id: 'cavalry',       name: 'Cavalerie',     icon: '🐎', cost: 1, tier: 1, requires: [], desc: 'Débloque le Chevalier.',       effect: { unlockUnit: 'knight'  } },
  economy:       { id: 'economy',       name: 'Économie',      icon: '💰', cost: 1, tier: 1, requires: [], desc: '+1 gold/sec passif.',          effect: { goldBonus: 1          } },
  fortification: { id: 'fortification', name: 'Fortification', icon: '🛡',  cost: 1, tier: 1, requires: [], desc: '+400 HP HDV (heal inclus).',    effect: { hdvHpBonus: 400       } },
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
};

const BUILDING_MIN_DIST     = 60;  // distance min entre 2 bâtiments
const BUILDING_MIN_DIST_HDV = 70;  // distance min HDV / village ↔ bâtiment

// ────────── Villages neutres (modèle Polytopia : base secondaire conquérable) ──────────
const VILLAGE_RADIUS         = 70;              // rayon de capture
const VILLAGE_CAPTURE_TICKS  = 10 * TICK_RATE;  // 10 s à 20 Hz = 200 ticks
const VILLAGE_MIN_DIST_HDV   = 700;
const VILLAGE_MIN_DIST_OTHER = 600;
const VILLAGE_COUNT_MIN      = 5;
const VILLAGE_COUNT_MAX      = 9;
const VILLAGE_MAX_HP         = 300;             // PV du village (peut être détruit)
const VILLAGE_GOLD_PER_SEC   = 0.5;             // gold passif au propriétaire
const VILLAGE_HALF_SIZE      = 50;              // pour collisions / hitbox attaque
const VILLAGE_VISION         = 220;             // vision donnée au propriétaire
const VILLAGE_UPGRADE_COST   = 150;             // coût Lv1 → Lv2

const VILLAGE_LEVELS = [
  { level: 1, allowedUnits: ['soldier'], goldPerSec: 0.5, buildRadius: 160 },
  { level: 2, allowedUnits: 'all',        goldPerSec: 1.0, buildRadius: 220 },
];

function generateVillages(spawns) {
  const count = VILLAGE_COUNT_MIN + Math.floor(Math.random() * (VILLAGE_COUNT_MAX - VILLAGE_COUNT_MIN + 1));
  const villages = [];
  let attempts = 0, idCounter = 1;
  while (villages.length < count && attempts < 800) {
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
  // Level 2 : tout ce que le joueur a débloqué
  return !def.requiresTech || (player.researchedTechs || []).includes(def.requiresTech);
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

// Recalcule maxHp et vision du HDV en fonction du niveau + techs recherchées
function recomputeHdvStats(player) {
  const lvl = HDV_LEVELS[player.hdvLevel - 1] || HDV_LEVELS[0];
  let maxHp = lvl.maxHp;
  let vision = lvl.vision;
  for (const techId of player.researchedTechs) {
    const eff = TECH_TREE[techId] && TECH_TREE[techId].effect;
    if (!eff) continue;
    if (eff.hdvHpBonus)  maxHp  += eff.hdvHpBonus;
    if (eff.visionBonus) vision += eff.visionBonus;
  }
  player.maxHp  = maxHp;
  player.vision = vision;
}

function computeGoldRate(player) {
  // Base : taux de l'HDV selon son niveau
  const hdvLvl = HDV_LEVELS[(player.hdvLevel || 1) - 1] || HDV_LEVELS[0];
  let rate = hdvLvl.goldPerSec || GOLD_PER_SECOND;
  // Bonus techs
  for (const techId of player.researchedTechs) {
    const eff = TECH_TREE[techId] && TECH_TREE[techId].effect;
    if (eff && eff.goldBonus) rate += eff.goldBonus;
  }
  // Bonus villages possédés (selon leur niveau)
  for (const v of gameState.villages) {
    if (v.ownerId !== player.id || v.hp <= 0) continue;
    const vLvl = VILLAGE_LEVELS[(v.level || 1) - 1] || VILLAGE_LEVELS[0];
    rate += vLvl.goldPerSec || VILLAGE_GOLD_PER_SEC;
  }
  return rate;
}

function unitHpBonusFromVillages(_player) {
  // Plus de bonus HP via village (les villages ne sont plus typés)
  return 0;
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
    hdvLevel: 1, techPoints: 0, researchedTechs: [],
    vision: HDV_LEVELS[0].vision,
    botCooldown: 0, // tickCount + N → prochaine décision
  };
  gameState.players[botId] = botPlayer;
  initVisibility(botId);
  peakPlayerCount = Math.max(peakPlayerCount, Object.keys(gameState.players).length);
  console.log(`Bot "${botPlayer.name}" added — slot ${slot}`);
  checkMatchState();
  return botPlayer;
}

// Logique IA simple :
//  - Spawn une unité dès qu'il a assez de gold (préfère Knight > Archer > Soldier)
//  - Recherche les techs dès qu'il a 1 pt
//  - Upgrade HDV dès qu'il peut se le payer
//  - Envoie ses unités idle vers le HDV ennemi le plus proche
function botTick(bot) {
  if (bot.eliminated) return;

  // Recherche tech (priorité : forging > cavalry > economy > fortification)
  if ((bot.techPoints || 0) > 0) {
    const priority = ['forging', 'cavalry', 'economy', 'fortification'];
    for (const tid of priority) {
      if (!bot.researchedTechs.includes(tid)) {
        bot.techPoints--;
        bot.researchedTechs.push(tid);
        const eff = TECH_TREE[tid].effect || {};
        if (eff.hdvHpBonus) { recomputeHdvStats(bot); bot.hp = Math.min(bot.maxHp, bot.hp + eff.hdvHpBonus); }
        if (eff.visionBonus) recomputeHdvStats(bot);
        console.log(`[Bot ${bot.name}] researched ${tid}`);
        break;
      }
    }
  }

  // Upgrade HDV
  if (bot.hdvLevel < MAX_HDV_LEVEL) {
    const cost = HDV_LEVELS[bot.hdvLevel - 1].upgradeCost;
    if (bot.gold >= cost + 50) { // garder un peu de gold pour spawner
      bot.gold -= cost;
      bot.hdvLevel++;
      bot.techPoints++;
      recomputeHdvStats(bot);
      bot.hp = bot.maxHp;
      console.log(`[Bot ${bot.name}] → HDV lv ${bot.hdvLevel}`);
    }
  }

  // Spawn unit — préfère le meilleur dispo
  const preferOrder = ['knight', 'archer', 'soldier'];
  for (const typeId of preferOrder) {
    const def = UNIT_TYPES[typeId];
    if (!unitTypeUnlocked(bot, typeId)) continue;
    if (bot.gold < def.cost) continue;
    bot.gold -= def.cost;
    bot.unitsCreated++;
    const angle = Math.random() * Math.PI * 2;
    const dist  = 60 + Math.random() * 40;
    const unitId = `unit_${nextUnitId++}`;
    const hpBonus = unitHpBonusFromVillages(bot);
    gameState.units[unitId] = {
      id: unitId, ownerId: bot.id,
      x: Math.round(bot.x + Math.cos(angle) * dist),
      y: Math.round(bot.y + Math.sin(angle) * dist),
      type: typeId,
      hp: def.hp + hpBonus, maxHp: def.hp + hpBonus,
      speed: def.speed, range: def.range, damage: def.damage, cost: def.cost,
      targetX: null, targetY: null,
      attackTargetId: null, attackTargetType: null,
      lastAttackTime: 0,
      mode: 'defend', defendX: bot.x, defendY: bot.y, defendRadius: 320,
    };
    break; // une unité par tick d'IA
  }

  // Envoie une partie des unités du bot en attaque (mode 'move' vers HDV/village)
  const myUnits = Object.values(gameState.units).filter(u =>
    u.ownerId === bot.id && u.mode === 'defend' && u.attackTargetId === null
  );
  if (myUnits.length < 3) return; // attend d'avoir au moins 3 défenseurs avant d'attaquer

  // Cible : HDV ennemi le plus proche du centre de mes unités
  let bestTargetX = null, bestTargetY = null, bestDistSq = Infinity;
  for (const p of Object.values(gameState.players)) {
    if (p.id === bot.id || p.eliminated || p.hp <= 0) continue;
    const dSq = (p.x - bot.x) ** 2 + (p.y - bot.y) ** 2;
    if (dSq < bestDistSq) { bestDistSq = dSq; bestTargetX = p.x; bestTargetY = p.y; }
  }
  // Si rien, prendre un village neutre proche
  if (bestTargetX === null) {
    for (const v of gameState.villages) {
      if (v.ownerId === bot.id) continue;
      const dSq = (v.x - bot.x) ** 2 + (v.y - bot.y) ** 2;
      if (dSq < bestDistSq) { bestDistSq = dSq; bestTargetX = v.x; bestTargetY = v.y; }
    }
  }
  if (bestTargetX === null) return;

  // 60% des défenseurs partent en attaque, 40% restent en défense
  const sendCount = Math.max(1, Math.floor(myUnits.length * 0.6));
  for (let i = 0; i < sendCount && i < myUnits.length; i++) {
    const u = myUnits[i];
    u.targetX = bestTargetX + (Math.random() - 0.5) * 100;
    u.targetY = bestTargetY + (Math.random() - 0.5) * 100;
    u.mode = 'move';
  }
}

function unitTypeUnlocked(player, typeId) {
  const def = UNIT_TYPES[typeId];
  if (!def) return false;
  if (!def.requiresTech) return true;
  return player.researchedTechs.includes(def.requiresTech);
}

const FALLBACK_SPAWNS = [
  { x: 500,  y: 500  },
  { x: 4000, y: 500  },
  { x: 500,  y: 4000 },
  { x: 4000, y: 4000 },
];

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
    const ok = spawns.every(s => Math.hypot(s.x - x, s.y - y) >= MIN_SPAWN_DIST);
    if (ok) spawns.push({ x: Math.round(x), y: Math.round(y) });
  }
  if (spawns.length < MAX_PLAYERS) {
    console.warn(`generateSpawns: only placed ${spawns.length}/${MAX_PLAYERS} after ${attempts} tries, using fallback corners`);
    return FALLBACK_SPAWNS.map(s => ({ ...s }));
  }
  console.log('Random spawns:', spawns.map(s => `(${s.x},${s.y})`).join(' '));
  return spawns;
}

let currentSpawns = generateSpawns();
let initialVillages = generateVillages(currentSpawns);

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
    markCircle(vis.visible, player.x, player.y, player.vision || HDV_LEVELS[0].vision);
    for (const unit of Object.values(gameState.units)) {
      if (unit.ownerId === player.id) markCircle(vis.visible, unit.x, unit.y, VISION_UNIT);
    }
    // Chaque village possédé donne sa propre aura de vision
    for (const v of gameState.villages) {
      if (v.ownerId !== player.id || v.destroyed) continue;
      markCircle(vis.visible, v.x, v.y, VILLAGE_VISION);
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
    playerSummary.push({ id: p.id, name: p.name, color: p.color, eliminated: p.eliminated });
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

  return {
    players: filteredPlayers,
    units: filteredUnits,
    villages: filteredVillages,
    buildings: filteredBuildings,
    matchState: gameState.matchState,
    winnerId: gameState.winnerId,
    matchStartTime: gameState.matchStartTime,
    playerSummary,
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
  buildings: [],
  matchState: 'waiting',
  winnerId: null,
  matchStartTime: null,
};
let nextBuildingId = 1;
let nextUnitId = 1;
let tickCount  = 0;
let peakPlayerCount = 0;

app.use(express.static('public'));

function getAvailableSlot() {
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const taken = Object.values(gameState.players).some(p => p.slot === i);
    if (!taken) return i;
  }
  return -1;
}

function computeDesiredDir(unit, goalX, goalY, skipPlayerId = null) {
  const dx = goalX - unit.x;
  const dy = goalY - unit.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return [0, 0];

  let desiredX = dx / dist;
  let desiredY = dy / dist;

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
  gameState.buildings = [];
  resetVisibilityAll();
  for (const p of Object.values(gameState.players)) {
    p.hdvLevel        = 1;
    p.techPoints      = 0;
    p.researchedTechs = [];
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
    gameState.buildings = [];
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
    // Tech tree state
    hdvLevel: 1,
    techPoints: 0,
    researchedTechs: [],
    vision: HDV_LEVELS[0].vision,
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
    if (p.gold < def.cost) {
      socket.emit('spawnFailed', { reason: 'not_enough_gold' });
      return;
    }
    p.gold -= def.cost;
    p.unitsCreated++;

    const angle  = Math.random() * Math.PI * 2;
    const dist   = 60 + Math.random() * 40;
    const unitId = `unit_${nextUnitId++}`;

    const hpBonus = unitHpBonusFromVillages(p);
    gameState.units[unitId] = {
      id: unitId,
      ownerId: socket.id,
      x: Math.round(p.x + Math.cos(angle) * dist),
      y: Math.round(p.y + Math.sin(angle) * dist),
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
    if (!Array.isArray(unitIds)) return;
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
    p.techPoints += 1;
    recomputeHdvStats(p);
    p.hp = p.maxHp; // heal complet à l'upgrade
    console.log(`Player ${p.name} → HDV lv ${p.hdvLevel}`);
  });

  socket.on('researchTech', ({ techId } = {}) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    const tech = TECH_TREE[techId];
    if (!tech) return;
    if (p.researchedTechs.includes(techId)) return;
    if (p.techPoints < tech.cost) return;
    // Prérequis
    for (const req of tech.requires) {
      if (!p.researchedTechs.includes(req)) return;
    }
    p.techPoints -= tech.cost;
    p.researchedTechs.push(techId);
    // Effets
    const eff = tech.effect || {};
    if (eff.hdvHpBonus) {
      recomputeHdvStats(p);
      p.hp = Math.min(p.maxHp, p.hp + eff.hdvHpBonus); // heal du bonus
    }
    if (eff.visionBonus) recomputeHdvStats(p);
    // unlockUnit + goldBonus : effets calculés à la volée, rien à faire ici
    console.log(`Player ${p.name} researched ${techId}`);
  });

  socket.on('moveUnits', ({ unitIds, targetX, targetY }) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    if (!Array.isArray(unitIds)) return;
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
    if (!Array.isArray(unitIds)) return;
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
  socket.on('buildBuilding', ({ type, x, y, baseType, baseId }) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    const def = BUILDING_TYPES[type];
    if (!def) return;
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
    // Position doit être dans le rayon constructible
    const r = baseBuildRadius(baseType, baseObj);
    if (Math.hypot(x - base.x, y - base.y) > r) {
      socket.emit('spawnFailed', { reason: 'out_of_build_zone' });
      return;
    }
    // Distance minimale par rapport aux autres entités
    for (const b of gameState.buildings) {
      if (Math.hypot(b.x - x, b.y - y) < BUILDING_MIN_DIST) {
        socket.emit('spawnFailed', { reason: 'too_close_to_building' });
        return;
      }
    }
    // Trop près d'un HDV/village
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
      x: Math.round(x), y: Math.round(y),
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
    if (v.level >= 2) return;
    if (p.gold < VILLAGE_UPGRADE_COST) {
      socket.emit('spawnFailed', { reason: 'not_enough_gold' });
      return;
    }
    p.gold -= VILLAGE_UPGRADE_COST;
    v.level = 2;
    v.hp = Math.min(v.maxHp, v.hp + 100); // bonus heal
    p.techPoints = (p.techPoints || 0) + 1; // bonus pt tech à l'upgrade village
    console.log(`Village ${v.id} amélioré Lv 2 par ${p.name} (+1 pt tech)`);
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
    p.gold -= def.cost;
    p.unitsCreated++;
    const angle = Math.random() * Math.PI * 2;
    const dist  = 50 + Math.random() * 30;
    const unitId = `unit_${nextUnitId++}`;
    gameState.units[unitId] = {
      id: unitId, ownerId: socket.id,
      x: Math.round(v.x + Math.cos(angle) * dist),
      y: Math.round(v.y + Math.sin(angle) * dist),
      type: typeId,
      hp: def.hp, maxHp: def.hp,
      speed: def.speed, range: def.range, damage: def.damage, cost: def.cost,
      targetX: null, targetY: null,
      attackTargetId: null, attackTargetType: null,
      lastAttackTime: 0,
      // Mode défense centré sur le village (base secondaire)
      mode: 'defend', defendX: v.x, defendY: v.y, defendRadius: 280,
    };
  });

  socket.on('addBot', () => {
    if (Object.keys(gameState.players).length >= MAX_PLAYERS) return;
    addBot();
    broadcastFilteredState();
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
      gameState.buildings = [];
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
        if (other.ownerId === unit.ownerId) continue;
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
        if (other.ownerId === unit.ownerId) continue;
        const d = Math.hypot(other.x - unit.x, other.y - unit.y);
        if (d < nearestDist) { nearest = other; nearestDist = d; }
      }
      if (nearest) {
        unit.attackTargetId = nearest.id;
        unit.attackTargetType = 'unit';
        // On garde targetX/targetY : après le kill, la cible est null et le pion reprend sa route
      }
    }
    // mode === 'attack' ou non défini : aucune auto-cible (comportement existant)
  }

  // 1. Move (ATTACK_MOVE / MOVE / IDLE) — stats par unité
  for (const unit of Object.values(gameState.units)) {
    const uSpeed = unit.speed || 80;
    const uRange = unit.range || 80;
    const step = uSpeed / TICK_RATE;
    const effectiveRange = uRange - UNIT_RADIUS;
    let goalX, goalY, skipPlayerId = null;

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
      } else {
        const target = gameState.players[unit.attackTargetId];
        if (!target || target.hp <= 0) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        if (unitToHdvDist(unit, target) <= effectiveRange) continue;
        goalX = target.x; goalY = target.y;
        skipPlayerId = unit.attackTargetId;
      }
    } else if (unit.targetX !== null) {
      goalX = unit.targetX; goalY = unit.targetY;
      const dist = Math.hypot(goalX - unit.x, goalY - unit.y);
      if (dist <= step) {
        unit.x = unit.targetX; unit.y = unit.targetY;
        unit.targetX = null;   unit.targetY = null;
        continue;
      }
    } else {
      continue;
    }

    const [nx, ny] = computeDesiredDir(unit, goalX, goalY, skipPlayerId);
    unit.x += nx * step;
    unit.y += ny * step;
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

  for (const unit of unitArr) {
    unit.x = Math.max(UNIT_RADIUS, Math.min(MAP_WIDTH  - UNIT_RADIUS, unit.x));
    unit.y = Math.max(UNIT_RADIUS, Math.min(MAP_HEIGHT - UNIT_RADIUS, unit.y));
  }

  // 3. Combat (ATTACK_MOVE: specific target | IDLE: nearest enemy | MOVE: skip)
  const nowMs    = Date.now();
  const toDelete = new Set();
  const attacks  = [];

  for (const unit of Object.values(gameState.units)) {
    if (toDelete.has(unit.id)) continue;
    if (nowMs - unit.lastAttackTime < ATTACK_COOLDOWN_MS) continue;
    const uRange  = unit.range  || 80;
    const uDamage = unit.damage || 5;
    const effectiveRange = uRange - UNIT_RADIUS;

    if (unit.attackTargetId !== null) {
      let target, inRange = false;
      if (unit.attackTargetType === 'unit') {
        target = gameState.units[unit.attackTargetId];
        if (!target || toDelete.has(target.id)) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
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

      unit.lastAttackTime = nowMs;
      target.hp = Math.max(0, target.hp - uDamage);
      const attackEntry = { attackerId: unit.id, targetType: unit.attackTargetType, targetId: target.id };

      if (unit.attackTargetType === 'unit' && target.hp <= 0) {
        toDelete.add(target.id);
        attackEntry.killed = true;
        const killer = gameState.players[unit.ownerId];
        if (killer && !killer.eliminated) killer.kills++;
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
        if (toDelete.has(other.id) || other.ownerId === unit.ownerId) continue;
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
      const attackEntry = { attackerId: unit.id, targetType: bestType, targetId: best.id };

      if (bestType === 'unit' && best.hp <= 0) {
        toDelete.add(best.id);
        attackEntry.killed = true;
        const killer = gameState.players[unit.ownerId];
        if (killer && !killer.eliminated) killer.kills++;
      } else if (bestType === 'hdv' && best.hp <= 0) {
        eliminatePlayer(best, toDelete);
      }
      attacks.push(attackEntry);
    }
    // MOVE: skip combat
  }

  // 3.4. Bâtiments combat : Tours tirent automatiquement sur les unités ennemies à portée
  for (const b of gameState.buildings) {
    if (b.hp <= 0) continue;
    const def = BUILDING_TYPES[b.type];
    if (!def || !def.damage || def.damage <= 0) continue; // Wall : pas d'attaque
    if (nowMs - b.lastAttackTime < (def.cooldownMs || 1000)) continue;
    // Cherche l'ennemi le plus proche (unité) à portée
    let bestTarget = null, bestDist = def.range;
    for (const u of Object.values(gameState.units)) {
      if (u.ownerId === b.ownerId || toDelete.has(u.id)) continue;
      const d = Math.hypot(u.x - b.x, u.y - b.y);
      if (d < bestDist) { bestDist = d; bestTarget = u; }
    }
    if (bestTarget) {
      b.lastAttackTime = nowMs;
      bestTarget.hp = Math.max(0, bestTarget.hp - def.damage);
      const entry = { attackerId: b.id, attackerType: 'building', targetType: 'unit', targetId: bestTarget.id, bx: b.x, by: b.y };
      if (bestTarget.hp <= 0) {
        toDelete.add(bestTarget.id);
        entry.killed = true;
        const owner = gameState.players[b.ownerId];
        if (owner && !owner.eliminated) owner.kills++;
      }
      attacks.push(entry);
    }
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
      if (dx * dx + dy * dy <= r2) ownersInside.add(unit.ownerId);
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

  // 4. Gold once per second (alive players only) — taux modulé par les techs
  if (tickCount % TICK_RATE === 0) {
    for (const p of Object.values(gameState.players)) {
      if (!p.eliminated) {
        const rate = computeGoldRate(p);
        p.gold += rate;
        p.totalGoldEarned += rate;
      }
    }
  }

  // 4.5. Bot IA — décide toutes les ~1.5s (30 ticks)
  if (tickCount % 30 === 0) {
    for (const p of Object.values(gameState.players)) {
      if (p.isBot) botTick(p);
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
