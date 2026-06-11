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

// Tout le flux lobby (rooms : créer / rejoindre / liste, overlay d'attente,
// plein écran) vit dans lobby.js — chargé avant ce fichier.
Lobby.init();
