const Network = (() => {
  let socket = null;
  let state  = { players: {}, units: {}, matchState: 'waiting', winnerId: null, playerSummary: [], fog: null };
  let myId   = null;
  let mapInfo = { mapWidth: 2000, mapHeight: 2000, tileSize: 40, gridW: 50, gridH: 50, mapType: 'no_water', mapSize: 'medium' };
  let config  = {
    unitTypes: {}, techTree: {}, hdvLevels: [],
    villageRadius: 70, villageCaptureTicks: 200, villageMaxHp: 300,
    villageUpgradeCost: 150, villageGoldPerSec: 0.5,
    villageLevels: [
      { level: 1, allowedUnits: ['soldier'], goldPerSec: 0.5, buildRadius: 160 },
      { level: 2, allowedUnits: 'all',        goldPerSec: 1.0, buildRadius: 220 },
    ],
    villageHalfSize: 32,
    spawnPositions: [],
    buildingTypes: {},
  };
  let onSpawnFailedCallback      = null;
  let onAttackCallback           = null;
  let onUnitSummonedCallback     = null;
  let onPlayerEliminatedCallback = null;
  let onGameOverCallback         = null;
  let onMatchRestartedCallback   = null;
  let onVillageCapturedCallback  = null;
  let onVillageDestroyedCallback = null;
  let onBarbarianRaidCallback    = null;
  let onCampClearedCallback      = null;
  let onTechUnlockedCallback     = null;
  let onInitReceivedCallback     = null;
  let onPilgrimExplosionCallback = null;
  let onTreatySignedCallback     = null;
  let onTreatyBrokenCallback     = null;
  let initReceived = false;

  // ── Bump animation pour les compteurs HUD (Phase 6 glassmorphism) ──
  // Met à jour textContent et déclenche l'anim value-bump (gain doré) /
  // value-down (perte rouge) seulement si la valeur a changé.
  function _bumpVal(el, valueStr) {
    if (!el) return;
    const old = el.textContent;
    if (old === valueStr) return;
    el.textContent = valueStr;
    // Direction : tente une comparaison numérique pour choisir l'anim
    const a = parseFloat(old);
    const b = parseFloat(valueStr);
    const cls = (!isNaN(a) && !isNaN(b) && b < a) ? 'value-down' : 'value-bump';
    el.classList.remove('value-bump', 'value-down');
    // reflow pour redémarrer l'anim si elle était déjà en cours
    // (lecture forcée d'offsetWidth)
    void el.offsetWidth;
    el.classList.add(cls);
  }

  // ── Connexion & rooms ────────────────────────────────────────
  // connect() ouvre le socket SANS auth : le joueur n'entre dans une
  // partie qu'au lobby:create / lobby:join (acks ci-dessous). L'event
  // 'init' habituel arrive juste avant l'ack et démarre le jeu normalement.
  function connect() {
    if (socket) return; // idempotent (déjà connecté)
    socket = io();
    _registerListeners();
  }

  // Crée une room { name, mapSize, visibility } → ack { ok, code, isHost } ou { error }
  function createRoom(opts, cb) {
    connect();
    socket.emit('lobby:create', opts, (ack) => { if (cb) cb(ack); });
  }
  // Rejoint une room par code (insensible à la casse, le serveur uppercase)
  // → ack { ok, code, isHost } ou { error }
  function joinRoom(code, name, cb) {
    connect();
    socket.emit('lobby:join', { name, code }, (ack) => { if (cb) cb(ack); });
  }
  // Liste des parties publiques → ack { rooms: [{ code, hostName, count, max, mapSize, state }] }
  function listRooms(cb) {
    connect();
    socket.emit('lobby:list', {}, (ack) => { if (cb) cb(ack); });
  }

  function _registerListeners() {
    socket.on('init', (data) => {
      myId = data.playerId;
      if (data.mapWidth)  mapInfo.mapWidth  = data.mapWidth;
      if (data.mapHeight) mapInfo.mapHeight = data.mapHeight;
      if (data.tileSize)  mapInfo.tileSize  = data.tileSize;
      if (data.gridW)     mapInfo.gridW     = data.gridW;
      if (data.gridH)     mapInfo.gridH     = data.gridH;
      if (data.mapType)   mapInfo.mapType   = data.mapType;
      if (data.mapSize)   mapInfo.mapSize   = data.mapSize;
      if (data.unitTypes)   config.unitTypes   = data.unitTypes;
      if (data.techTree)    config.techTree    = data.techTree;
      if (data.hdvLevels)   config.hdvLevels   = data.hdvLevels;
      if (data.villageRadius)       config.villageRadius       = data.villageRadius;
      if (data.villageCaptureTicks) config.villageCaptureTicks = data.villageCaptureTicks;
      if (data.villageMaxHp)        config.villageMaxHp        = data.villageMaxHp;
      if (data.villageUpgradeCost)  config.villageUpgradeCost  = data.villageUpgradeCost;
      if (data.villageGoldPerSec)   config.villageGoldPerSec   = data.villageGoldPerSec;
      if (data.villageLevels)       config.villageLevels       = data.villageLevels;
      if (data.villageHalfSize)     config.villageHalfSize     = data.villageHalfSize;
      if (data.spawnPositions)      config.spawnPositions      = data.spawnPositions;
      if (data.buildingTypes)       config.buildingTypes       = data.buildingTypes;
      if (data.buildGrid)           config.buildGrid           = data.buildGrid;
      if (data.buildingMinDistHdv)  config.buildingMinDistHdv  = data.buildingMinDistHdv;
      if (data.spells)              config.spells              = data.spells;
      initReceived = true;
      if (onInitReceivedCallback) onInitReceivedCallback();
    });

    socket.on('gameState', (newState) => {
      // Normalise les buffers binaires (ArrayBuffer côté client) en Uint8Array
      if (newState.fog) {
        if (newState.fog.visible  instanceof ArrayBuffer) newState.fog.visible  = new Uint8Array(newState.fog.visible);
        if (newState.fog.explored instanceof ArrayBuffer) newState.fog.explored = new Uint8Array(newState.fog.explored);
      }
      state = newState;

      // Les compteurs UI utilisent playerSummary (non filtré spatial), pas state.players
      const summary = state.playerSummary || Object.values(state.players).map(p => ({ id: p.id, eliminated: p.eliminated }));
      const alive   = summary.filter(p => !p.eliminated);

      const elCount = document.getElementById('count');
      if (elCount) elCount.textContent = summary.length;

      const elAlive = document.getElementById('alive');
      const elTotal = document.getElementById('total');
      if (elAlive) elAlive.textContent = alive.length;
      if (elTotal) elTotal.textContent = summary.length;

      const me = myId && state.players[myId];
      if (me) {
        const elGold = document.getElementById('my-gold');
        const elHp   = document.getElementById('my-hp');
        const elPr   = document.getElementById('my-pr');
        const elMana = document.getElementById('my-mana');
        const elFaith= document.getElementById('my-faith');
        if (elGold) _bumpVal(elGold, String(Math.floor(me.gold)));
        if (elPr)   _bumpVal(elPr,   String(Math.floor(me.researchPoints || 0)));
        if (elMana) _bumpVal(elMana, String(Math.floor(me.mana  || 0)));
        if (elFaith)_bumpVal(elFaith,String(Math.floor(me.faith || 0)));
        const elPop    = document.getElementById('my-pop');
        const elPopMax = document.getElementById('my-pop-max');
        if (elPop)    _bumpVal(elPop, String(Math.floor(me.populationUsed || 0)));
        if (elPopMax) elPopMax.textContent = Math.floor(me.populationMax || 8);

        // Affichage conditionnel mana/faith selon bâtiments possédés
        const MAGIC_BLDGS = new Set(['sanctum', 'mage_tower']);
        const RELIG_BLDGS = new Set(['altar', 'temple', 'cathedral']);
        const myBuildings = (state.buildings || []).filter(b => b.ownerId === myId);
        const hasMagic = myBuildings.some(b => MAGIC_BLDGS.has(b.type));
        const hasFaith = myBuildings.some(b => RELIG_BLDGS.has(b.type))
                       || Object.values(state.units || {}).some(u => u.ownerId === myId && u.type === 'pilgrim');
        const elManaRow  = document.getElementById('my-mana-row');
        const elFaithRow = document.getElementById('my-faith-row');
        if (elManaRow)  elManaRow.style.display  = hasMagic ? 'inline' : 'none';
        if (elFaithRow) elFaithRow.style.display = hasFaith ? 'inline' : 'none';
        if (elHp) {
          if (me.eliminated) {
            elHp.textContent = 'ÉLIMINÉ';
            elHp.className   = 'text-danger';
          } else if (me.hp <= 0) {
            elHp.textContent = 'DÉTRUIT';
            elHp.className   = 'text-danger';
          } else {
            elHp.textContent = `${me.hp}/${me.maxHp}`;
            elHp.className   = '';
          }
        }

        const specEl = document.getElementById('spectator-label');
        if (specEl) specEl.style.display = me.eliminated ? 'block' : 'none';
      }

      const elUnits = document.getElementById('my-unit-count');
      if (elUnits && myId) {
        _bumpVal(elUnits, String(Object.values(state.units || {}).filter(u => u.ownerId === myId).length));
      }

      const elWaiting = document.getElementById('waiting-msg');
      if (elWaiting) elWaiting.style.display = state.matchState === 'waiting' ? 'block' : 'none';

      // Bouton "Ajouter un bot" : réservé à l'hôte de la room, tant qu'il reste de la place
      const elAddBot = document.getElementById('add-bot-btn');
      if (elAddBot) {
        const amHost = (typeof Lobby !== 'undefined') ? Lobby.isHost() : true;
        elAddBot.style.display = (summary.length < 4 && amHost) ? 'inline-block' : 'none';
      }

      // Rafraîchit le panneau HDV s'il est ouvert (gold, HP, techs en temps réel)
      if (typeof HdvPanel !== 'undefined' && HdvPanel.isVisible()) HdvPanel.refresh();
      if (typeof VillagePanel !== 'undefined' && VillagePanel.isVisible()) VillagePanel.refresh();
      if (typeof BuildingInfoPanel !== 'undefined' && BuildingInfoPanel.isVisible()) BuildingInfoPanel.refresh();
      // Update léger des compteurs PR/Mana/Foi dans l'overlay tech (pas de rebuild SVG)
      if (typeof TechTreeOverlay !== 'undefined' && TechTreeOverlay.isOpen() && me) TechTreeOverlay.updateResources(me);
    });

    socket.on('attacks', (attacks) => {
      if (!onAttackCallback) return;
      for (const data of attacks) onAttackCallback(data);
    });

    socket.on('spawnFailed', ({ reason }) => {
      if (onSpawnFailedCallback) onSpawnFailedCallback(reason, lastSpawnAttempt);
      if (typeof HdvPanel !== 'undefined') HdvPanel.onSpawnFailed(reason, lastSpawnAttempt);
    });

    socket.on('serverFull', () => {
      alert('Le serveur est plein (4 joueurs max). Réessaie plus tard !');
    });

    socket.on('playerEliminated', (data) => {
      if (onPlayerEliminatedCallback) onPlayerEliminatedCallback(data);
    });

    socket.on('villageCaptured', (data) => {
      if (onVillageCapturedCallback) onVillageCapturedCallback(data);
    });

    socket.on('villageDestroyed', (data) => {
      if (onVillageDestroyedCallback) onVillageDestroyedCallback(data);
    });

    socket.on('barbarianRaid', (data) => {
      if (onBarbarianRaidCallback) onBarbarianRaidCallback(data);
    });

    socket.on('campCleared', (data) => {
      if (onCampClearedCallback) onCampClearedCallback(data);
    });

    socket.on('techUnlocked', (data) => {
      // Update local state IMMÉDIATEMENT pour que refresh() voit la nouvelle tech
      // (sans attendre le prochain broadcast gameState — sinon décalage visible)
      if (data.playerId === myId && state.players && state.players[myId]) {
        const me = state.players[myId];
        me.unlockedTechs = me.unlockedTechs || [];
        if (!me.unlockedTechs.includes(data.techId)) me.unlockedTechs.push(data.techId);
      }
      if (onTechUnlockedCallback) onTechUnlockedCallback(data);
      if (typeof TechTreeOverlay !== 'undefined' && TechTreeOverlay.isOpen()) TechTreeOverlay.refresh();
    });

    socket.on('spellCast', (data) => {
      if (typeof SpellCast !== 'undefined') SpellCast.playCastAnim(data);
    });
    socket.on('pilgrimExplosion', (data) => {
      if (onPilgrimExplosionCallback) onPilgrimExplosionCallback(data);
    });
    socket.on('unitSummoned', (data) => {
      if (onUnitSummonedCallback) onUnitSummonedCallback(data);
    });

    socket.on('treatySigned', (data) => {
      // Maj immédiate des alliances locales (sans attendre le prochain gameState)
      if (state.players) {
        if (state.players[data.a]) { state.players[data.a].allies = state.players[data.a].allies || []; if (!state.players[data.a].allies.includes(data.b)) state.players[data.a].allies.push(data.b); }
        if (state.players[data.b]) { state.players[data.b].allies = state.players[data.b].allies || []; if (!state.players[data.b].allies.includes(data.a)) state.players[data.b].allies.push(data.a); }
      }
      if (onTreatySignedCallback) onTreatySignedCallback(data);
    });
    socket.on('treatyBroken', (data) => {
      if (state.players) {
        if (state.players[data.a] && Array.isArray(state.players[data.a].allies)) state.players[data.a].allies = state.players[data.a].allies.filter(x => x !== data.b);
        if (state.players[data.b] && Array.isArray(state.players[data.b].allies)) state.players[data.b].allies = state.players[data.b].allies.filter(x => x !== data.a);
      }
      if (onTreatyBrokenCallback) onTreatyBrokenCallback(data);
    });

    socket.on('gameOver', (data) => {
      if (onGameOverCallback) onGameOverCallback(data);
      _showGameOver(data);
    });

    socket.on('matchRestarted', () => {
      const overlay = document.getElementById('game-over-overlay');
      if (overlay) overlay.style.display = 'none';
      if (onMatchRestartedCallback) onMatchRestartedCallback();
    });

    socket.on('matchEnded', () => {
      const overlay = document.getElementById('match-ended-overlay');
      if (overlay) overlay.style.display = 'flex';
      socket.disconnect();
    });
  }

  function _showGameOver(data) {
    const overlay  = document.getElementById('game-over-overlay');
    const titleEl  = document.getElementById('game-over-title');
    const reasonEl = document.getElementById('game-over-reason');
    const durEl    = document.getElementById('game-over-duration');
    const tbody    = document.getElementById('stats-body');
    if (!overlay || !titleEl) return;

    const isWinner = data.winnerId && data.winnerId === myId;

    if (data.winnerId === myId) {
      titleEl.textContent = '🏆 VICTOIRE !';
      titleEl.style.color = '#f1c40f';
    } else if (data.winnerId) {
      titleEl.textContent = '💀 DÉFAITE';
      titleEl.style.color = '#e74c3c';
    } else {
      titleEl.textContent = '🤝 MATCH NUL';
      titleEl.style.color = '#95a5a6';
    }

    if (reasonEl) {
      reasonEl.textContent = data.reason === 'draw'
        ? 'Égalité parfaite'
        : '⚔️ Victoire par élimination';
    }

    if (durEl && data.matchDurationMs) {
      const totalSec = Math.floor(data.matchDurationMs / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      durEl.textContent = `Durée : ${mins}m ${secs}s`;
    }

    if (tbody && data.players) {
      const medals = ['🥇', '🥈', '🥉'];
      tbody.innerHTML = data.players.map((p, i) => {
        const isMe      = p.id === myId;
        const isWin     = p.id === data.winnerId;
        const rowClass  = isMe ? 'my-row' : isWin ? 'winner-row' : p.eliminated ? 'eliminated-row' : '';
        const medal     = medals[i] || `${i + 1}`;
        // Couleur cohérente avec la palette néon en jeu (slot client, pas couleur serveur)
        const pColor    = (typeof Theme !== 'undefined') ? Theme.factionColorStr(p.id) : p.color;
        const nameStyle = `color:${pColor}; font-weight:bold;`;
        const prefix    = p.eliminated ? '💀 ' : '';
        return `<tr class="${rowClass}">
          <td class="rank-medal">${medal}</td>
          <td class="player-name-cell"><span style="${nameStyle}">${prefix}${p.name}</span>${isMe ? ' <span style="color:#3498db;font-size:11px;">(toi)</span>' : ''}</td>
          <td>${p.kills}</td>
          <td>${p.unitsCreated}</td>
          <td>${p.totalGoldEarned}</td>
          <td><strong>${p.finalScore}</strong></td>
        </tr>`;
      }).join('');
    }

    overlay.style.display = 'flex';
  }

  let lastSpawnAttempt = 'soldier';
  function spawnUnit(unitType) {
    lastSpawnAttempt = unitType || 'soldier';
    if (socket) socket.emit('spawnUnit', { unitType: lastSpawnAttempt });
  }
  function moveUnits(unitIds, targetX, targetY) {
    if (socket) socket.emit('moveUnits', { unitIds, targetX, targetY });
  }
  function attackTarget(unitIds, targetId, targetType) {
    if (socket) socket.emit('attackTarget', { unitIds, targetId, targetType });
  }
  function requestRestart() { if (socket) socket.emit('requestRestart'); }
  function upgradeHdv()     { if (socket) socket.emit('upgradeHdv'); }
  function defendArea(unitIds, x, y, radius) {
    if (socket) socket.emit('defendArea', { unitIds, x, y, radius: radius || 280 });
  }
  function unlockTech(techId) {
    if (socket) socket.emit('unlockTech', { techId });
  }
  function castSpell(spellId, x, y) {
    if (socket) socket.emit('castSpell', { spellId, x, y });
  }
  function proposeTreaty(targetId) {
    if (socket) socket.emit('proposeTreaty', { targetId });
  }
  function breakTreaty(targetId) {
    if (socket) socket.emit('breakTreaty', { targetId });
  }
  function addBot()         { if (socket) socket.emit('addBot'); }
  // L'hôte lance la partie (rooms à démarrage manuel) → ack { ok } ou { error }
  function startMatch(cb)   { if (socket) socket.emit('lobby:start', {}, (ack) => { if (cb) cb(ack); }); }
  function upgradeVillage(villageId)  { if (socket) socket.emit('upgradeVillage', { villageId }); }
  function villageSpawnUnit(villageId, unitType) { if (socket) socket.emit('villageSpawnUnit', { villageId, unitType }); }
  function buildBuilding(type, x, y, baseType, baseId) {
    if (socket) socket.emit('buildBuilding', { type, x, y, baseType, baseId });
  }
  function sellBuilding(buildingId) {
    if (socket) socket.emit('sellBuilding', { buildingId });
  }
  function debugSpawn(entityType, x, y) {
    if (socket) socket.emit('debugSpawn', { entityType, x, y });
  }
  function debugCastPortal(unitIds, destX, destY) {
    if (socket) socket.emit('debugCastPortal', { unitIds, destX, destY });
  }

  function setOnSpawnFailed(cb)      { onSpawnFailedCallback = cb; }
  function setOnAttack(cb)           { onAttackCallback = cb; }
  function setOnPlayerEliminated(cb) { onPlayerEliminatedCallback = cb; }
  function setOnGameOver(cb)         { onGameOverCallback = cb; }
  function setOnMatchRestarted(cb)   { onMatchRestartedCallback = cb; }
  function setOnVillageCaptured(cb)  { onVillageCapturedCallback = cb; }
  function setOnVillageDestroyed(cb) { onVillageDestroyedCallback = cb; }
  function setOnBarbarianRaid(cb)    { onBarbarianRaidCallback = cb; }
  function setOnCampCleared(cb)      { onCampClearedCallback = cb; }
  function setOnTechUnlocked(cb)     { onTechUnlockedCallback = cb; }
  function setOnInitReceived(cb)     { onInitReceivedCallback = cb; if (initReceived && cb) cb(); }
  function setOnUnitSummoned(cb)     { onUnitSummonedCallback = cb; }
  function setOnPilgrimExplosion(cb) { onPilgrimExplosionCallback = cb; }
  function setOnTreatySigned(cb)     { onTreatySignedCallback = cb; }
  function setOnTreatyBroken(cb)     { onTreatyBrokenCallback = cb; }
  function isInitReceived()          { return initReceived; }
  function getState()                { return state; }
  function getMyId()                 { return myId; }
  function getMapInfo()              { return mapInfo; }
  function getConfig()               { return config; }

  return {
    connect, createRoom, joinRoom, listRooms,
    getState, getMyId, getMapInfo, getConfig,
    spawnUnit, moveUnits, attackTarget, requestRestart, upgradeHdv, addBot, startMatch,
    upgradeVillage, villageSpawnUnit, defendArea, buildBuilding, sellBuilding, unlockTech, castSpell, proposeTreaty, breakTreaty,
    debugSpawn, debugCastPortal,
    setOnSpawnFailed, setOnAttack,
    setOnPlayerEliminated, setOnGameOver, setOnMatchRestarted, setOnVillageCaptured, setOnVillageDestroyed, setOnTechUnlocked, setOnBarbarianRaid, setOnCampCleared, setOnInitReceived, setOnUnitSummoned,
    setOnPilgrimExplosion, setOnTreatySigned, setOnTreatyBroken,
    isInitReceived,
  };
})();
