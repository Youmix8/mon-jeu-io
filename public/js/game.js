document.addEventListener('contextmenu', e => e.preventDefault());

// Phaser starts immediately (canvas visible behind the lobby)
const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: Theme.BG.canvas,
  scene: [MainScene],
};

const game = new Phaser.Game(config);
window.game = game;

window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});

// Lobby — connect only after the player submits their name
const lobbyOverlay = document.getElementById('lobby-overlay');
const nameInput    = document.getElementById('name-input');
const playBtn      = document.getElementById('play-btn');

// État de la config map (mis à jour par les boutons du lobby)
// L'eau a été retirée : type forcé à 'no_water' côté serveur, ici uniquement la taille.
const selectedMapType = 'no_water';
let selectedMapSize = 'medium';

// Boutons taille de carte
document.querySelectorAll('.map-size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.map-size-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedMapSize = btn.dataset.size;
  });
});

// Pré-remplit le pseudo de la session précédente (try/catch : mode privé)
try {
  const savedName = localStorage.getItem('mji-name');
  if (savedName) nameInput.value = savedName;
} catch (_) { /* localStorage indisponible */ }

function startGame() {
  const name = nameInput.value.trim().slice(0, 20);
  try {
    if (name) localStorage.setItem('mji-name', name);
  } catch (_) { /* localStorage indisponible */ }
  lobbyOverlay.style.display = 'none';
  Network.init(name, { mapType: selectedMapType, mapSize: selectedMapSize });
  if (typeof DebugPanel !== 'undefined') DebugPanel.init();
}

playBtn.addEventListener('click', startGame);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startGame();
});

nameInput.focus();
