// Console de triche — un petit terminal qui s'ouvre avec la touche Entrée
// (en jeu uniquement). Syntaxe : `tirer <ressource> <montant>` (le mot « tirer »
// est optionnel). Ressources : gold · pt (points de recherche) · mana · foi.
// Exemples :  tirer gold 500   ·   pt 100   ·   tirer mana 50   ·   foi 80
//
// Le serveur (handler 'cheat') applique le gain et renvoie 'cheatResult'
// → CheatConsole.onResult() affiche le retour dans le terminal.

const CheatConsole = (() => {
  let root, logEl, inputEl;
  let open = false;
  const history = [];      // commandes précédentes (flèche haut/bas)
  let histIdx = -1;

  // Alias de ressources acceptés → renvoyés tels quels au serveur (qui les mappe)
  const KNOWN = ['gold', 'or', 'argent', 'pt', 'pr', 'recherche', 'talent', 'talents',
                 'point', 'points', 'mana', 'foi', 'faith'];

  function _inGame() {
    const lobby = document.getElementById('lobby-overlay');
    const inLobby = lobby && lobby.style.display !== 'none';
    return !inLobby && typeof Network !== 'undefined' && !!Network.getMyId && !!Network.getMyId();
  }

  function _build() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'cheat-console';
    root.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:90px', 'transform:translateX(-50%)',
      'width:min(560px,92vw)', 'z-index:2000', 'display:none',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'background:rgba(6,13,18,0.94)', 'border:1px solid #22d3ee',
      'border-radius:10px', 'box-shadow:0 8px 40px rgba(0,0,0,0.6),0 0 24px rgba(34,211,238,0.25)',
      'backdrop-filter:blur(8px)', 'overflow:hidden',
    ].join(';');

    const header = document.createElement('div');
    header.textContent = '⌨ Console de triche — tape « aide » · Échap pour fermer';
    header.style.cssText = 'padding:6px 12px;font-size:11px;letter-spacing:0.5px;color:#22d3ee;border-bottom:1px solid #134;background:rgba(34,211,238,0.06);';

    logEl = document.createElement('div');
    logEl.style.cssText = 'max-height:180px;overflow-y:auto;padding:8px 12px;font-size:12.5px;line-height:1.5;color:#cbd5e1;';

    const inputWrap = document.createElement('div');
    inputWrap.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px 12px;border-top:1px solid #134;';
    const prompt = document.createElement('span');
    prompt.textContent = '›';
    prompt.style.cssText = 'color:#22d3ee;font-weight:700;';
    inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.autocomplete = 'off';
    inputEl.spellcheck = false;
    inputEl.placeholder = 'tirer gold 500';
    inputEl.style.cssText = 'flex:1;background:transparent;border:none;outline:none;color:#e2e8f0;font-family:inherit;font-size:13px;';

    inputWrap.appendChild(prompt);
    inputWrap.appendChild(inputEl);
    root.appendChild(header);
    root.appendChild(logEl);
    root.appendChild(inputWrap);
    document.body.appendChild(root);

    inputEl.addEventListener('keydown', (e) => {
      e.stopPropagation(); // ne pas laisser fuiter vers les raccourcis du jeu
      if (e.key === 'Enter')       { _run(inputEl.value); inputEl.value = ''; histIdx = -1; }
      else if (e.key === 'Escape') { close(); }
      else if (e.key === 'ArrowUp')   { _recall(-1); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { _recall(1);  e.preventDefault(); }
    });

    _print('Bienvenue. Ex : tirer gold 500 · pt 100 · mana 50 · foi 80', '#64748b');
  }

  function _recall(dir) {
    if (!history.length) return;
    if (histIdx === -1) histIdx = history.length;
    histIdx = Math.max(0, Math.min(history.length, histIdx + dir));
    inputEl.value = history[histIdx] || '';
  }

  function _print(text, color) {
    const line = document.createElement('div');
    line.textContent = text;
    if (color) line.style.color = color;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
    while (logEl.childElementCount > 60) logEl.removeChild(logEl.firstChild);
  }

  function _help() {
    _print('Commandes : tirer <ressource> <montant>', '#22d3ee');
    _print('  ressources : gold · pt (recherche) · mana · foi', '#94a3b8');
    _print('  ex : tirer gold 1000   ·   pt 250   ·   mana 100   ·   foi 100', '#94a3b8');
    _print('  (le mot « tirer » est optionnel ; montant négatif = retirer)', '#64748b');
  }

  function _run(raw) {
    const cmd = (raw || '').trim();
    if (!cmd) return;
    history.push(cmd);
    if (history.length > 50) history.shift();
    _print('› ' + cmd, '#e2e8f0');

    let toks = cmd.toLowerCase().split(/\s+/);
    if (['aide', 'help', '?'].includes(toks[0])) { _help(); return; }
    // « tirer » (ou give/add/donne) optionnel en tête
    if (['tirer', 'give', 'add', 'donne', 'donner', 'set'].includes(toks[0])) toks = toks.slice(1);

    const res = toks[0];
    const amount = parseInt(toks[1], 10);
    if (!res || !KNOWN.includes(res)) {
      _print(`✗ ressource inconnue. Tape « aide ».`, '#fb7185');
      return;
    }
    if (!Number.isFinite(amount)) {
      _print(`✗ montant manquant. Ex : tirer ${res} 100`, '#fb7185');
      return;
    }
    if (typeof Network !== 'undefined' && Network.cheat) Network.cheat(res, amount);
  }

  // Retour serveur (event 'cheatResult')
  function onResult(data) {
    if (!data) return;
    if (data.ok) _print(`✓ ${data.msg}`, '#a3e635');
    else         _print(`✗ ${data.msg || 'échec'}`, '#fb7185');
  }

  function openConsole() {
    _build();
    open = true;
    root.style.display = 'block';
    setTimeout(() => inputEl.focus(), 0);
  }
  function close() {
    open = false;
    if (root) root.style.display = 'none';
    if (inputEl) inputEl.blur();
  }
  function isOpen() { return open; }

  function init() {
    // Entrée ouvre le terminal (en jeu, hors champ de saisie)
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.repeat) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return; // pseudo, code room, etc.
      if (open) return; // déjà ouvert (l'input gère l'Entrée lui-même)
      if (!_inGame()) return;
      e.preventDefault();
      openConsole();
    });
  }

  return { init, openConsole, close, isOpen, onResult };
})();

CheatConsole.init();
