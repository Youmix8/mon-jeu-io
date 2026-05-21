document.addEventListener('contextmenu', e => e.preventDefault());

// Phaser starts immediately (canvas visible behind the lobby)
const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#1a1a2e',
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
let selectedMapType = 'lakes';
let selectedMapSize = 'medium';

// Boutons type de carte
document.querySelectorAll('.map-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.map-type-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedMapType = btn.dataset.type;
  });
});
// Boutons taille de carte
document.querySelectorAll('.map-size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.map-size-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedMapSize = btn.dataset.size;
  });
});

function startGame() {
  const name = nameInput.value.trim().slice(0, 20);
  lobbyOverlay.style.display = 'none';
  Network.init(name, { mapType: selectedMapType, mapSize: selectedMapSize });
  if (typeof DebugPanel !== 'undefined') DebugPanel.init();
}

playBtn.addEventListener('click', startGame);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startGame();
});

nameInput.focus();
