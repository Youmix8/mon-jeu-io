// =============================================================
// LOBBY — écran d'accueil à étapes (système de ROOMS)
// Créer une partie / rejoindre par code / liste des parties
// publiques + overlay d'attente de room + ligne salon HUD +
// bouton plein écran. Chargé APRÈS network.js, AVANT game.js.
// =============================================================

const Lobby = (() => {

  // Messages d'erreur FR pour les acks serveur
  const ERRORS = {
    not_found:       'Code invalide — aucune partie trouvée',
    full:            'Cette partie est pleine (4/4)',
    ended:           'Cette partie est terminée',
    server_full:     'Serveur plein — réessaie dans quelques minutes',
    already_in_room: 'Tu es déjà dans une partie',
  };
  const SIZE_LABELS = { small: 'Petite', medium: 'Moyenne', large: 'Grande' };
  const PANELS = ['lobby-panel-create', 'lobby-panel-join', 'lobby-panel-list'];

  // État local
  let selectedMapSize    = 'medium';
  let selectedVisibility = 'public';
  let isHost    = false;
  let roomCode  = null;
  let listTimer = null; // auto-refresh du panneau liste (4 s, seulement si visible)
  let waitTimer = null; // poll matchState de l'overlay d'attente (500 ms)

  // Raccourci DOM
  const $ = (id) => document.getElementById(id);

  // Échappe le HTML des chaînes serveur (pseudos) avant innerHTML
  function _esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function init() {
    Network.connect();
    _bindHome();
    _bindCreatePanel();
    _bindJoinPanel();
    _bindListPanel();
    _bindWaitOverlay();
    _bindFullscreen();
    _restoreName();
    _handleDeepLink();
    const nameInput = $('name-input');
    if (nameInput) nameInput.focus();
  }

  // ── Navigation entre panneaux (un seul visible à la fois) ────
  function _showPanel(panelId) {
    $('lobby-actions').style.display = panelId ? 'none' : 'flex';
    for (const id of PANELS) $(id).style.display = (id === panelId) ? 'block' : 'none';
    _clearErrors();
    // L'auto-refresh de la liste ne tourne QUE quand son panneau est visible
    if (panelId === 'lobby-panel-list') _startListRefresh();
    else _stopListRefresh();
  }

  function _bindHome() {
    $('lobby-action-create').addEventListener('click', () => _showPanel('lobby-panel-create'));
    $('lobby-action-join').addEventListener('click', () => {
      _showPanel('lobby-panel-join');
      $('room-code-input').focus();
    });
    $('lobby-action-list').addEventListener('click', () => _showPanel('lobby-panel-list'));
    document.querySelectorAll('.lobby-back-btn').forEach(btn => {
      btn.addEventListener('click', () => _showPanel(null));
    });
    // Entrée dans le champ pseudo : valide le panneau actuellement ouvert
    $('name-input').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if ($('lobby-panel-create').style.display !== 'none') _doCreate();
      else if ($('lobby-panel-join').style.display !== 'none') _doJoin();
    });
  }

  // ── Panneau CRÉER ────────────────────────────────────────────
  function _bindCreatePanel() {
    // Boutons taille de carte (logique reprise de l'ancien game.js)
    document.querySelectorAll('.map-size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.map-size-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedMapSize = btn.dataset.size;
      });
    });
    // Toggle Publique/Privée (segmented control)
    document.querySelectorAll('.visibility-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.visibility-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedVisibility = btn.dataset.vis;
      });
    });
    $('create-room-btn').addEventListener('click', _doCreate);
  }

  // ── Panneau REJOINDRE ────────────────────────────────────────
  function _bindJoinPanel() {
    const input = $('room-code-input');
    input.addEventListener('input', () => { input.value = input.value.toUpperCase(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') _doJoin(); });
    $('join-room-btn').addEventListener('click', () => _doJoin());
  }

  // ── Panneau LISTE (parties publiques) ────────────────────────
  function _bindListPanel() {
    // Délégation : les lignes sont régénérées à chaque refresh
    $('room-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.room-row-join');
      if (btn && btn.dataset.code) _doJoin(btn.dataset.code);
    });
  }

  function _startListRefresh() {
    _stopListRefresh();
    _refreshRooms();
    listTimer = setInterval(_refreshRooms, 4000);
  }
  function _stopListRefresh() {
    if (listTimer) { clearInterval(listTimer); listTimer = null; }
  }
  function _refreshRooms() {
    Network.listRooms((ack) => {
      // Ignore la réponse si le panneau a été fermé entre temps
      if ($('lobby-panel-list').style.display === 'none') return;
      _renderRooms((ack && ack.rooms) || []);
    });
  }
  function _renderRooms(rooms) {
    const wrap = $('room-list');
    if (!rooms.length) {
      wrap.innerHTML = '<div class="room-list-empty">Aucune partie publique — crée la tienne !</div>';
      return;
    }
    wrap.innerHTML = rooms.map(r => {
      const stateCls   = r.state === 'playing' ? 'playing' : 'waiting';
      const stateLabel = r.state === 'playing' ? 'En cours' : 'En attente';
      return `<div class="room-row">
        <span class="room-row-code">${_esc(r.code)}</span>
        <span class="room-row-host">Partie de ${_esc(r.hostName || '?')}</span>
        <span class="room-row-meta"><span class="g-pop">⌬</span> ${r.count}/${r.max} · ${SIZE_LABELS[r.mapSize] || _esc(r.mapSize)}</span>
        <span class="room-row-state ${stateCls}">${stateLabel}</span>
        <button type="button" class="room-row-join" data-code="${_esc(r.code)}">Rejoindre</button>
      </div>`;
    }).join('');
  }

  // ── Validation + actions create/join ─────────────────────────
  // Pseudo requis ; sauvegardé en localStorage avant l'emit.
  function _getName(panelKey) {
    const input = $('name-input');
    const name = (input.value || '').trim().slice(0, 20);
    if (!name) {
      _setError(panelKey, 'Choisis un pseudo d\'abord');
      input.focus();
      return null;
    }
    try { localStorage.setItem('mji-name', name); } catch (_) { /* localStorage indisponible */ }
    return name;
  }

  function _doCreate() {
    const name = _getName('create');
    if (!name) return;
    Network.createRoom({ name, mapSize: selectedMapSize, visibility: selectedVisibility }, (ack) => {
      if (!ack || !ack.ok) return _setError('create', ERRORS[ack && ack.error] || 'Erreur inconnue — réessaie');
      _enterRoom(ack);
    });
  }

  // codeFromList : code fourni par une ligne du panneau liste (sinon input manuel)
  function _doJoin(codeFromList) {
    const panelKey = codeFromList ? 'list' : 'join';
    const name = _getName(panelKey);
    if (!name) return;
    const code = (codeFromList || $('room-code-input').value || '').trim().toUpperCase();
    if (!codeFromList && code.length !== 5) return _setError(panelKey, 'Entre le code à 5 caractères');
    Network.joinRoom(code, name, (ack) => {
      if (!ack || !ack.ok) return _setError(panelKey, ERRORS[ack && ack.error] || 'Erreur inconnue — réessaie');
      _enterRoom(ack);
    });
  }

  // ── Entrée en room (ack ok) ──────────────────────────────────
  // Le serveur a déjà ajouté le joueur à la partie ('init' est arrivé
  // juste avant l'ack) : on bascule sur l'overlay d'attente.
  function _enterRoom(ack) {
    isHost   = !!ack.isHost;
    roomCode = ack.code;
    _stopListRefresh();
    $('lobby-overlay').style.display = 'none';
    // Ligne permanente "Salon <CODE>" dans le HUD
    $('room-code-hud').textContent = roomCode;
    $('room-code-line').style.display = 'block';
    _showWaitOverlay();
    // En dernier + try/catch : DebugPanel._render() throw si ENTITIES_CONFIG
    // n'est pas chargé (cas actuel — voir CLAUDE.md, backlog volet B)
    try {
      if (typeof DebugPanel !== 'undefined') DebugPanel.init();
    } catch (_) { /* panneau debug non critique */ }
  }

  // ── Overlay d'attente de room ────────────────────────────────
  function _bindWaitOverlay() {
    $('copy-link-btn').addEventListener('click', () => _copyInviteLink($('copy-link-btn')));
    $('room-view-map-btn').addEventListener('click', () => {
      $('room-wait-overlay').style.display = 'none'; // on peut déjà jouer en waiting
    });
    $('room-add-bot-btn').addEventListener('click', () => Network.addBot());
    $('room-code-line').addEventListener('click', () => _copyInviteLink($('room-code-copy-hint')));
  }

  function _showWaitOverlay() {
    $('room-code-display').textContent = roomCode;
    $('room-add-bot-btn').style.display = isHost ? 'inline-block' : 'none';
    $('room-wait-overlay').style.display = 'flex';
    _renderWaitPlayers();
    _startWaitPoll();
  }

  // Poll simple et robuste (500 ms) : tant que le match est en attente, on
  // rafraîchit la liste des joueurs ; dès qu'il démarre, on masque tout.
  function _startWaitPoll() {
    if (waitTimer) clearInterval(waitTimer);
    waitTimer = setInterval(() => {
      const st = Network.getState();
      if (st.matchState !== 'waiting') {
        $('room-wait-overlay').style.display = 'none';
        clearInterval(waitTimer);
        waitTimer = null;
        return;
      }
      if ($('room-wait-overlay').style.display !== 'none') _renderWaitPlayers();
    }, 500);
  }

  function _renderWaitPlayers() {
    const wrap = $('room-players');
    const summary = Network.getState().playerSummary || [];
    // Aligne le slot 0 (cyan) sur le joueur local avant de résoudre les couleurs
    if (typeof Theme !== 'undefined' && Network.getMyId()) Theme.setMyId(Network.getMyId());
    wrap.innerHTML = summary.map(p => {
      const color = (typeof Theme !== 'undefined') ? Theme.factionColorStr(p.id) : (p.color || '#94a3b8');
      const me = p.id === Network.getMyId() ? ' <span class="room-player-me">(toi)</span>' : '';
      return `<div class="room-player-row"><span class="room-player-swatch" style="background:${color}; color:${color};"></span>${_esc(p.name)}${me}</div>`;
    }).join('') || '<div class="room-player-row room-player-empty">Connexion…</div>';
  }

  // ── Copie du lien d'invitation ───────────────────────────────
  function _copyInviteLink(feedbackEl) {
    const url = `${location.origin}/?room=${roomCode}`;
    const done = () => _copiedFeedback(feedbackEl);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => { _fallbackCopy(url); done(); });
    } else {
      _fallbackCopy(url);
      done();
    }
  }
  // Fallback execCommand (vieux navigateurs / contexte non sécurisé)
  function _fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity  = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) { /* copie impossible */ }
    document.body.removeChild(ta);
  }
  // Feedback « Copié ✓ » 2 s puis restaure le texte d'origine
  function _copiedFeedback(el) {
    if (!el) return;
    if (el.dataset.originalText == null) el.dataset.originalText = el.textContent;
    el.textContent = 'Copié ✓';
    clearTimeout(el._copyTimer);
    el._copyTimer = setTimeout(() => { el.textContent = el.dataset.originalText; }, 2000);
  }

  // ── Bouton plein écran (lobby + jeu, toujours visible) ───────
  function _bindFullscreen() {
    const btn = $('fullscreen-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsEl) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) exit.call(document);
      } else {
        const root = document.documentElement;
        const req  = root.requestFullscreen || root.webkitRequestFullscreen;
        // .catch : le navigateur peut refuser (pas de geste utilisateur valide)
        const p = req ? req.call(root) : null;
        if (p && p.catch) p.catch(() => { /* refus plein écran non bloquant */ });
      }
    });
    const sync = () => {
      const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
      btn.classList.toggle('active', active);
      btn.title = active
        ? 'Quitter le plein écran'
        : 'Plein écran (recommandé : corrige le défilement au bord haut)';
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
  }

  // ── Divers ───────────────────────────────────────────────────
  // Pré-remplit le pseudo de la session précédente (try/catch : mode privé)
  function _restoreName() {
    try {
      const saved = localStorage.getItem('mji-name');
      if (saved) $('name-input').value = saved;
    } catch (_) { /* localStorage indisponible */ }
  }

  // Deep link ?room=CODE → ouvre directement le panneau REJOINDRE pré-rempli
  function _handleDeepLink() {
    const code = (new URLSearchParams(location.search).get('room') || '').trim().toUpperCase().slice(0, 5);
    if (!code) return;
    _showPanel('lobby-panel-join');
    $('room-code-input').value = code;
  }

  // Ligne d'erreur (une par panneau, une seule visible à la fois)
  function _setError(panelKey, msg) {
    _clearErrors();
    const el = $(`lobby-error-${panelKey}`);
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }
  function _clearErrors() {
    for (const key of ['create', 'join', 'list']) {
      const el = $(`lobby-error-${key}`);
      if (el) { el.textContent = ''; el.style.display = 'none'; }
    }
  }

  return {
    init,
    isHost: () => isHost, // consommé par network.js (bouton "Ajouter un bot" HUD)
  };
})();

if (typeof window !== 'undefined') window.Lobby = Lobby;
