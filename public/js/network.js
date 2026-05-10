const Network = (() => {
  let socket = null;
  let state  = { players: {}, units: {}, matchState: 'waiting', winnerId: null };
  let myId   = null;
  let onSpawnFailedCallback      = null;
  let onAttackCallback           = null;
  let onPlayerEliminatedCallback = null;
  let onGameOverCallback         = null;
  let onMatchRestartedCallback   = null;

  function init() {
    socket = io();

    socket.on('init', ({ playerId }) => {
      myId = playerId;
    });

    socket.on('gameState', (newState) => {
      state = newState;

      const players = Object.values(state.players);
      const alive   = players.filter(p => !p.eliminated);

      // Player count
      const elCount = document.getElementById('count');
      if (elCount) elCount.textContent = players.length;

      // Alive count
      const elAlive = document.getElementById('alive');
      const elTotal = document.getElementById('total');
      if (elAlive) elAlive.textContent = alive.length;
      if (elTotal) elTotal.textContent = players.length;

      // My stats
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

      // Waiting message
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
    });

    socket.on('matchRestarted', () => {
      if (onMatchRestartedCallback) onMatchRestartedCallback();
    });

    socket.on('matchEnded', () => {
      const overlay = document.getElementById('match-ended-overlay');
      if (overlay) overlay.style.display = 'flex';
      socket.disconnect();
    });
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

  return {
    init, getState, getMyId,
    spawnUnit, moveUnits, attackTarget, requestRestart,
    setOnSpawnFailed, setOnAttack,
    setOnPlayerEliminated, setOnGameOver, setOnMatchRestarted,
  };
})();
