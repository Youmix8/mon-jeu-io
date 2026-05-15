const Network = (() => {
  let socket = null;
  let state  = { players: {}, units: {}, matchState: 'waiting', winnerId: null, playerSummary: [], fog: null };
  let myId   = null;
  let mapInfo = { mapWidth: 2000, mapHeight: 2000, tileSize: 40, gridW: 50, gridH: 50 };
  let onSpawnFailedCallback      = null;
  let onAttackCallback           = null;
  let onPlayerEliminatedCallback = null;
  let onGameOverCallback         = null;
  let onMatchRestartedCallback   = null;

  function init(playerName) {
    socket = io({ auth: { name: playerName || '' } });

    socket.on('init', (data) => {
      myId = data.playerId;
      if (data.mapWidth)  mapInfo.mapWidth  = data.mapWidth;
      if (data.mapHeight) mapInfo.mapHeight = data.mapHeight;
      if (data.tileSize)  mapInfo.tileSize  = data.tileSize;
      if (data.gridW)     mapInfo.gridW     = data.gridW;
      if (data.gridH)     mapInfo.gridH     = data.gridH;
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
        if (elGold) elGold.textContent = me.gold;
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
        elUnits.textContent = Object.values(state.units || {}).filter(u => u.ownerId === myId).length;
      }

      const elWaiting = document.getElementById('waiting-msg');
      if (elWaiting) elWaiting.style.display = state.matchState === 'waiting' ? 'block' : 'none';
    });

    socket.on('attacks', (attacks) => {
      if (!onAttackCallback) return;
      for (const data of attacks) onAttackCallback(data);
    });

    socket.on('spawnFailed', ({ reason }) => {
      if (onSpawnFailedCallback) onSpawnFailedCallback(reason);
    });

    socket.on('serverFull', () => {
      alert('Le serveur est plein (4 joueurs max). Réessaie plus tard !');
    });

    socket.on('playerEliminated', (data) => {
      if (onPlayerEliminatedCallback) onPlayerEliminatedCallback(data);
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
        const nameStyle = `color:${p.color}; font-weight:bold;`;
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

  function spawnUnit()  { if (socket) socket.emit('spawnUnit'); }
  function moveUnits(unitIds, targetX, targetY) {
    if (socket) socket.emit('moveUnits', { unitIds, targetX, targetY });
  }
  function attackTarget(unitIds, targetId, targetType) {
    if (socket) socket.emit('attackTarget', { unitIds, targetId, targetType });
  }
  function requestRestart() { if (socket) socket.emit('requestRestart'); }

  function setOnSpawnFailed(cb)      { onSpawnFailedCallback = cb; }
  function setOnAttack(cb)           { onAttackCallback = cb; }
  function setOnPlayerEliminated(cb) { onPlayerEliminatedCallback = cb; }
  function setOnGameOver(cb)         { onGameOverCallback = cb; }
  function setOnMatchRestarted(cb)   { onMatchRestartedCallback = cb; }
  function getState()                { return state; }
  function getMyId()                 { return myId; }
  function getMapInfo()              { return mapInfo; }

  return {
    init, getState, getMyId, getMapInfo,
    spawnUnit, moveUnits, attackTarget, requestRestart,
    setOnSpawnFailed, setOnAttack,
    setOnPlayerEliminated, setOnGameOver, setOnMatchRestarted,
  };
})();
