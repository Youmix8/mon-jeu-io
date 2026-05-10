// Prevent the browser context menu on right-click inside the game
document.addEventListener('contextmenu', e => e.preventDefault());

Network.init();

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#1a1a2e',
  scene: [MainScene],
};

const game = new Phaser.Game(config);

window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});
