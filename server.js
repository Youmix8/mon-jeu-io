const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MAP_WIDTH  = 2000;
const MAP_HEIGHT = 2000;
const MAX_PLAYERS = 4;
const GOLD_PER_SECOND = 1;
const HDV_MAX_HP = 1000;
const UNIT_COST   = 10;
const UNIT_HP     = 50;
const UNIT_MAX_HP = 50;
const UNIT_RADIUS = 15;
const UNIT_SPEED  = 80;
const TICK_RATE   = 20;
const TICK_MS     = 1000 / TICK_RATE;
const ATTACK_RANGE       = 80;
const ATTACK_DAMAGE      = 5;
const ATTACK_COOLDOWN_MS = 1000;
const HDV_HALF_SIZE      = 40;
const LOOK_AHEAD         = 60;
const AVOID_BUFFER       = 25;
const AVOID_STRENGTH     = 1.8;

const SPAWNS = [
  { x: 200,  y: 200  },
  { x: 1800, y: 200  },
  { x: 200,  y: 1800 },
  { x: 1800, y: 1800 },
];

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f'];

const gameState = { players: {}, units: {}, matchState: 'waiting', winnerId: null };
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

// Returns normalised direction [dx, dy] toward goal with HDV steering avoidance.
// skipPlayerId: don't steer around this HDV (used when it's the attack target)
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

// Edge-to-edge distance between a circular unit and a square HDV (circle vs AABB)
function unitToHdvDist(unit, hdv) {
  const cx = Math.max(hdv.x - HDV_HALF_SIZE, Math.min(unit.x, hdv.x + HDV_HALF_SIZE));
  const cy = Math.max(hdv.y - HDV_HALF_SIZE, Math.min(unit.y, hdv.y + HDV_HALF_SIZE));
  return Math.hypot(unit.x - cx, unit.y - cy);
}

// Evaluate and transition matchState after any player count / elimination change
function checkMatchState() {
  if (gameState.matchState === 'ended') return;

  const players = Object.values(gameState.players);
  const alive   = players.filter(p => !p.eliminated);

  if (peakPlayerCount < 2) {
    gameState.matchState = 'waiting';
    return;
  }

  if (alive.length >= 2) {
    gameState.matchState = 'playing';
  } else if (alive.length === 1) {
    gameState.matchState = 'ended';
    const winner = alive[0];
    gameState.winnerId = winner.id;
    const eliminatedPlayers = players.filter(p => p.eliminated)
      .map(p => ({ id: p.id, name: p.name, color: p.color }));
    io.emit('gameOver', { winnerId: winner.id, winnerName: winner.name, winnerColor: winner.color, eliminatedPlayers });
    console.log(`Game over! Winner: ${winner.name}`);
  } else {
    gameState.matchState = 'ended';
    gameState.winnerId = null;
    io.emit('gameOver', { winnerId: null, winnerName: null, winnerColor: null,
      eliminatedPlayers: players.map(p => ({ id: p.id, name: p.name, color: p.color })) });
    console.log('Game over! Draw (0 players alive)');
  }
}

// Mark a player as eliminated, delete their units, emit event, check match state
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

// Reset all players to spawn positions and restart the match state
function resetMatch() {
  for (const p of Object.values(gameState.players)) {
    p.hp            = HDV_MAX_HP;
    p.eliminated    = false;
    p.eliminatedAt  = null;
    p.gold          = 0;
    const spawn = SPAWNS[p.slot];
    p.x = spawn.x;
    p.y = spawn.y;
  }
  for (const uid of Object.keys(gameState.units)) delete gameState.units[uid];
  const playerCount    = Object.keys(gameState.players).length;
  peakPlayerCount      = playerCount;
  gameState.winnerId   = null;
  gameState.matchState = playerCount >= 2 ? 'playing' : 'waiting';
  console.log(`Match reset. State: ${gameState.matchState}, Players: ${playerCount}`);
}

io.on('connection', (socket) => {
  // Zombie recovery: ended state with no players left — auto-reset
  if (gameState.matchState === 'ended' && Object.keys(gameState.players).length === 0) {
    gameState.matchState = 'waiting';
    gameState.winnerId   = null;
    peakPlayerCount      = 0;
    for (const uid of Object.keys(gameState.units)) delete gameState.units[uid];
    console.log('Recovered zombie ended state on new connection');
  }

  // Refuse new connections once a live match is still running with a winner
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

  const spawn = SPAWNS[slot];
  const player = {
    id: socket.id,
    slot,
    x: spawn.x,
    y: spawn.y,
    color: COLORS[slot],
    name: `Joueur ${slot + 1}`,
    gold: 0,
    hp: HDV_MAX_HP,
    maxHp: HDV_MAX_HP,
    eliminated: false,
    eliminatedAt: null,
  };

  gameState.players[socket.id] = player;
  peakPlayerCount = Math.max(peakPlayerCount, Object.keys(gameState.players).length);
  console.log(`Player ${socket.id} connected at (${spawn.x},${spawn.y}) — slot ${slot}`);

  checkMatchState();
  socket.emit('init', { playerId: socket.id, mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT });
  io.emit('gameState', gameState);

  socket.on('spawnUnit', () => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    if (p.gold < UNIT_COST) {
      socket.emit('spawnFailed', { reason: 'not_enough_gold' });
      return;
    }
    p.gold -= UNIT_COST;

    const angle  = Math.random() * Math.PI * 2;
    const dist   = 60 + Math.random() * 40;
    const unitId = `unit_${nextUnitId++}`;

    gameState.units[unitId] = {
      id: unitId,
      ownerId: socket.id,
      x: Math.round(p.x + Math.cos(angle) * dist),
      y: Math.round(p.y + Math.sin(angle) * dist),
      type: 'soldier',
      hp: UNIT_HP,
      maxHp: UNIT_MAX_HP,
      targetX: null,
      targetY: null,
      attackTargetId:   null,
      attackTargetType: null,
      lastAttackTime: 0,
    };

    // (spawn log suppressed — too verbose)
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
    }
    // (move log suppressed — too verbose)
  });

  socket.on('attackTarget', ({ unitIds, targetId, targetType }) => {
    const p = gameState.players[socket.id];
    if (!p || p.eliminated) return;
    if (!Array.isArray(unitIds)) return;
    if (!targetId || (targetType !== 'unit' && targetType !== 'hdv')) return;

    const valid = unitIds.filter(id => gameState.units[id] && gameState.units[id].ownerId === socket.id);
    if (valid.length === 0) return;

    for (const id of valid) {
      const unit = gameState.units[id];
      unit.attackTargetId   = targetId;
      unit.attackTargetType = targetType;
      unit.targetX = null;
      unit.targetY = null;
    }
    // (attack-move log suppressed — too verbose)
  });

  socket.on('requestRestart', () => {
    if (gameState.matchState !== 'ended') return;
    resetMatch();
    console.log(`Match restarted by ${socket.id.slice(0,6)}`);
    io.emit('matchRestarted');
    io.emit('gameState', gameState);
  });

  socket.on('disconnect', () => {
    const player  = gameState.players[socket.id];
    const wasAlive = player && !player.eliminated;

    for (const [unitId, unit] of Object.entries(gameState.units)) {
      if (unit.ownerId === socket.id) delete gameState.units[unitId];
    }
    delete gameState.players[socket.id];
    console.log(`Player ${socket.id} disconnected`);

    if (Object.keys(gameState.players).length === 0) {
      // Last player gone — full reset so the next person can start fresh
      gameState.matchState = 'waiting';
      gameState.winnerId   = null;
      peakPlayerCount      = 0;
      for (const uid of Object.keys(gameState.units)) delete gameState.units[uid];
      console.log('Server empty, full reset');
    } else if (wasAlive) {
      checkMatchState();
    }

    io.emit('gameState', gameState);
  });
});

// Game loop — order: move → collisions → combat → gold → broadcast
setInterval(() => {
  tickCount++;
  const step = UNIT_SPEED / TICK_RATE;
  const effectiveRange = ATTACK_RANGE - UNIT_RADIUS;

  // 1. Move (3 states: ATTACK_MOVE / MOVE / IDLE)
  for (const unit of Object.values(gameState.units)) {
    let goalX, goalY, skipPlayerId = null;

    if (unit.attackTargetId !== null) {
      if (unit.attackTargetType === 'unit') {
        const target = gameState.units[unit.attackTargetId];
        if (!target) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        if (Math.hypot(target.x - unit.x, target.y - unit.y) <= ATTACK_RANGE) continue;
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
      continue; // IDLE
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
  const nowMs   = Date.now();
  const toDelete = new Set();
  const attacks  = [];

  for (const unit of Object.values(gameState.units)) {
    if (toDelete.has(unit.id)) continue;
    if (nowMs - unit.lastAttackTime < ATTACK_COOLDOWN_MS) continue;

    if (unit.attackTargetId !== null) {
      let target, inRange = false;
      if (unit.attackTargetType === 'unit') {
        target = gameState.units[unit.attackTargetId];
        if (!target || toDelete.has(target.id)) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        inRange = Math.hypot(target.x - unit.x, target.y - unit.y) <= ATTACK_RANGE;
      } else {
        target = gameState.players[unit.attackTargetId];
        if (!target || target.hp <= 0) { unit.attackTargetId = null; unit.attackTargetType = null; continue; }
        const edgeDist = unitToHdvDist(unit, target);
        inRange = edgeDist <= effectiveRange;
      }
      if (!inRange) continue;

      unit.lastAttackTime = nowMs;
      target.hp = Math.max(0, target.hp - ATTACK_DAMAGE);
      attacks.push({ attackerId: unit.id, targetType: unit.attackTargetType, targetId: target.id });

      if (unit.attackTargetType === 'unit' && target.hp <= 0) {
        toDelete.add(target.id);
        unit.attackTargetId = null; unit.attackTargetType = null;
      } else if (unit.attackTargetType === 'hdv' && target.hp <= 0) {
        eliminatePlayer(target, toDelete);
        unit.attackTargetId = null; unit.attackTargetType = null;
      }

    } else if (unit.targetX === null) {
      // IDLE auto-attack
      let best = null, bestDist = Infinity, bestType = null;

      for (const other of Object.values(gameState.units)) {
        if (toDelete.has(other.id) || other.ownerId === unit.ownerId) continue;
        const d = Math.hypot(other.x - unit.x, other.y - unit.y);
        if (d <= ATTACK_RANGE && d < bestDist) { best = other; bestDist = d; bestType = 'unit'; }
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
      best.hp = Math.max(0, best.hp - ATTACK_DAMAGE);
      attacks.push({ attackerId: unit.id, targetType: bestType, targetId: best.id });

      if (bestType === 'unit' && best.hp <= 0) {
        toDelete.add(best.id);
      } else if (bestType === 'hdv' && best.hp <= 0) {
        eliminatePlayer(best, toDelete);
      }
    }
    // MOVE: skip combat
  }

  if (attacks.length > 0) io.emit('attacks', attacks);

  for (const id of toDelete) {
    delete gameState.units[id];
  }

  // 4. Gold once per second (only for alive players)
  if (tickCount % TICK_RATE === 0) {
    for (const p of Object.values(gameState.players)) {
      if (!p.eliminated) p.gold += GOLD_PER_SECOND;
    }
  }

  // 5. Broadcast
  io.emit('gameState', gameState);
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
