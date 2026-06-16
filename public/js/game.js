document.addEventListener('contextmenu', e => e.preventDefault());

// Phaser starts immediately (canvas visible behind la lobby)
// ── Fond canvas « bleu-nuit profond » (refonte fond style diep.io) ──
// On NE modifie PAS Theme.BG.canvas (#070d11) — un autre chantier peut y
// toucher. La couleur de fond du canvas Phaser est surchargée ici, en literal,
// vers un bleu-nuit légèrement plus vivant que le quasi-noir d'origine. Les
// bords de la map laissent voir ce fond hors zone jouable. Ajuster ici si
// besoin (#0a1622 = sombre discret, #0b1a2a = un cran plus bleu).
const CANVAS_BG = '#0a1622';
const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: CANVAS_BG,
  scene: [MainScene],
  render: {
    // Antialiasing activé (lignes de grille fines plus propres, mouvement plus
    // lisse à l'œil) + pixelArt désactivé pour ne pas crénerter les beams néon.
    antialias: true,
    roundPixels: false,
  },
};

const game = new Phaser.Game(config);
window.game = game;

// Resize de la fenêtre ET de l'entrée/sortie plein écran : on resize le canvas
// Phaser pour qu'il occupe toujours toute la zone. La scène réagit via son
// propre listener `this.scale.on('resize')` (recalcul minZoom + bounds).
function resizeGameToWindow() {
  game.scale.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resizeGameToWindow);
// fullscreenchange : le bouton ⛶ vit dans lobby.js, mais la bascule plein écran
// change innerWidth/innerHeight de façon asynchrone → on resize ici aussi.
// (préfixe webkit pour Safari.) Petit délai : la fenêtre n'a pas toujours ses
// dimensions finales au moment exact où l'event part.
function onFullscreenChange() {
  setTimeout(resizeGameToWindow, 60);
}
document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);

// Tout le flux lobby (rooms : créer / rejoindre / liste, overlay d'attente,
// plein écran) vit dans lobby.js — chargé avant ce fichier.
Lobby.init();
