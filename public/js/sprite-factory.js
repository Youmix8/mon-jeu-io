// Génère toutes les textures du jeu via Phaser Graphics (pas d'assets externes).
// Les sprites sont dessinés en blanc avec quelques détails sombres ; le tint
// de chaque sprite donne la couleur de la faction (rouge, bleu, vert, jaune).
// Les villages ont des textures fixes (pas tintées par faction).

const SpriteFactory = {

  // Appelé une fois depuis MainScene._buildMap()
  generateAll(scene) {
    this._hdv(scene);
    this._soldier(scene);
    this._archer(scene);
    this._knight(scene);
    this._goldmine(scene);
    this._watchtower(scene);
    this._shrine(scene);
    this._forge(scene);
    this._selectionRing(scene);
  },

  // ── HDV : château avec 3 tours crénelées + drapeau au sommet ─────
  _hdv(scene) {
    const W = 120, H = 130;
    const g = scene.make.graphics({ add: false });

    // Ombre portée
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(W / 2, H - 5, W * 0.85, 14);

    // Tours latérales (basses)
    g.fillStyle(0xffffff, 1);
    g.fillRect(8,   45, 22, 75);
    g.fillRect(W - 30, 45, 22, 75);

    // Corps central (le plus haut)
    g.fillRect(28, 30, W - 56, 90);

    // Tour centrale au sommet (avec drapeau)
    g.fillRect(W / 2 - 12, 12, 24, 26);

    // Crénelages : petits carrés sur le dessus de chaque tour
    const mWidth = 6, mHeight = 8;
    // Tour gauche : 3 crénelages
    [10, 18, 26].forEach(x => g.fillRect(x - mWidth / 2, 42, mWidth, mHeight));
    // Corps central : 4 crénelages
    [38, 52, 66, 80].forEach(x => g.fillRect(x - mWidth / 2, 27, mWidth, mHeight));
    // Tour droite : 3 crénelages
    [W - 26, W - 18, W - 10].forEach(x => g.fillRect(x - mWidth / 2, 42, mWidth, mHeight));
    // Tour centrale (sommet) : 2 crénelages
    [W / 2 - 6, W / 2 + 6].forEach(x => g.fillRect(x - mWidth / 2, 9, mWidth, mHeight));

    // Mât du drapeau (gris foncé pour pas être tinté)
    g.fillStyle(0x222222, 1);
    g.fillRect(W / 2 - 1, 0, 2, 24);

    // Drapeau (sera tinté par la faction → on le laisse en blanc)
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(W / 2 + 1, 2,  W / 2 + 18, 8,  W / 2 + 1, 14);

    // Porte (toujours sombre, pas tintée)
    g.fillStyle(0x2c1810, 1);
    g.fillRect(W / 2 - 10, 80, 20, 40);
    g.fillStyle(0x4a2c1a, 1);
    g.fillRect(W / 2 - 10, 80, 20, 6); // linteau

    // Lignes de pierre subtiles (gris foncé)
    g.lineStyle(1, 0x333333, 0.35);
    g.lineBetween(28, 60, W - 28, 60);
    g.lineBetween(28, 85, W / 2 - 10, 85);
    g.lineBetween(W / 2 + 10, 85, W - 28, 85);
    g.lineBetween(8, 70, 30, 70);
    g.lineBetween(W - 30, 70, W - 8, 70);

    g.generateTexture('hdv-castle', W, H);
    g.destroy();
  },

  // ── Soldat : cercle avec casque + épée croisée ────────────────
  _soldier(scene) {
    const S = 40;
    const g = scene.make.graphics({ add: false });
    // Corps (tinté faction)
    g.fillStyle(0xffffff, 1);
    g.fillCircle(S / 2, S / 2, 14);
    // Bordure foncée
    g.lineStyle(2.5, 0x222222, 1);
    g.strokeCircle(S / 2, S / 2, 14);
    // Casque (cercle sombre plus petit en haut)
    g.fillStyle(0x333333, 1);
    g.fillCircle(S / 2, S / 2 - 4, 7);
    g.lineStyle(1, 0x000000, 0.7);
    g.strokeCircle(S / 2, S / 2 - 4, 7);
    // Croix / épée diagonale (blanc argenté)
    g.lineStyle(2, 0xe8e8e8, 1);
    g.lineBetween(S / 2 - 5, S / 2 + 3, S / 2 + 5, S / 2 + 7);
    g.generateTexture('unit-soldier', S, S);
    g.destroy();
  },

  // ── Archer : cercle plus petit avec arc visible ───────────────
  _archer(scene) {
    const S = 40;
    const g = scene.make.graphics({ add: false });
    // Corps
    g.fillStyle(0xffffff, 1);
    g.fillCircle(S / 2, S / 2, 12);
    g.lineStyle(2, 0x222222, 1);
    g.strokeCircle(S / 2, S / 2, 12);
    // Capuche pointue
    g.fillStyle(0x444444, 1);
    g.beginPath();
    g.arc(S / 2, S / 2 - 2, 7, Math.PI, 0);
    g.closePath();
    g.fillPath();
    // Arc (semi-cercle à droite)
    g.lineStyle(2, 0x8b5a2b, 1);
    g.beginPath();
    g.arc(S / 2 + 6, S / 2, 7, -Math.PI / 2, Math.PI / 2);
    g.strokePath();
    // Corde
    g.lineStyle(1, 0xeeeeee, 0.9);
    g.lineBetween(S / 2 + 6, S / 2 - 7, S / 2 + 6, S / 2 + 7);
    g.generateTexture('unit-archer', S, S);
    g.destroy();
  },

  // ── Chevalier : cercle large avec armure lourde + croix ──────
  _knight(scene) {
    const S = 44;
    const g = scene.make.graphics({ add: false });
    // Corps (plus gros)
    g.fillStyle(0xffffff, 1);
    g.fillCircle(S / 2, S / 2, 16);
    // Bordure très épaisse (armure)
    g.lineStyle(4, 0x222222, 1);
    g.strokeCircle(S / 2, S / 2, 16);
    // Crête / panache (3 picots dorés)
    g.fillStyle(0xfbbf24, 1);
    g.fillTriangle(S / 2 - 6, S / 2 - 12,  S / 2 - 3, S / 2 - 18,  S / 2,    S / 2 - 12);
    g.fillTriangle(S / 2 - 1, S / 2 - 13,  S / 2 + 2, S / 2 - 19,  S / 2 + 5, S / 2 - 13);
    g.fillTriangle(S / 2 + 4, S / 2 - 12,  S / 2 + 7, S / 2 - 18,  S / 2 + 10, S / 2 - 12);
    // Croix de chevalier au centre (rouge argenté, vu de dessus)
    g.fillStyle(0x222222, 1);
    g.fillRect(S / 2 - 2, S / 2 - 7, 4, 14);
    g.fillRect(S / 2 - 7, S / 2 - 2, 14, 4);
    g.generateTexture('unit-knight', S, S);
    g.destroy();
  },

  // ── Anneau de sélection (jaune doré, pulse via tween) ────────
  _selectionRing(scene) {
    const S = 50;
    const g = scene.make.graphics({ add: false });
    g.lineStyle(3, 0xfbbf24, 1);
    g.strokeCircle(S / 2, S / 2, 22);
    g.lineStyle(1, 0xffe082, 0.6);
    g.strokeCircle(S / 2, S / 2, 20);
    g.generateTexture('selection-ring', S, S);
    g.destroy();
  },

  // ── Village : Mine d'or (pioche + pépites) ───────────────────
  _goldmine(scene) {
    const S = 80;
    const g = scene.make.graphics({ add: false });
    // Base ronde (terre)
    g.fillStyle(0x6b4423, 1);
    g.fillCircle(S / 2, S / 2, 30);
    g.lineStyle(3, 0x3e2614, 1);
    g.strokeCircle(S / 2, S / 2, 30);
    // Tas de pépites d'or
    g.fillStyle(0xfbbf24, 1);
    g.fillCircle(S / 2 - 6, S / 2 + 4, 6);
    g.fillCircle(S / 2 + 5, S / 2 + 6, 5);
    g.fillCircle(S / 2 + 1, S / 2 - 1, 7);
    // Highlights jaune clair
    g.fillStyle(0xffe082, 1);
    g.fillCircle(S / 2 - 7, S / 2 + 2, 2);
    g.fillCircle(S / 2 + 6, S / 2 + 4, 2);
    g.fillCircle(S / 2,     S / 2 - 3, 2);
    // Pioche (manche brun + tête grise)
    g.lineStyle(3, 0x8b5a2b, 1);
    g.lineBetween(S / 2 - 18, S / 2 - 18, S / 2 + 4, S / 2 - 4);
    g.fillStyle(0x9ca3af, 1);
    g.fillTriangle(S / 2 - 22, S / 2 - 22,  S / 2 - 12, S / 2 - 24,  S / 2 - 16, S / 2 - 14);
    g.generateTexture('village-goldmine', S, S);
    g.destroy();
  },

  // ── Village : Tour de guet (haute tour + œil) ─────────────────
  _watchtower(scene) {
    const S = 80;
    const g = scene.make.graphics({ add: false });
    // Base ronde (herbe)
    g.fillStyle(0x4a5d3a, 1);
    g.fillCircle(S / 2, S / 2 + 8, 30);
    g.lineStyle(3, 0x2e3d23, 1);
    g.strokeCircle(S / 2, S / 2 + 8, 30);
    // Tour rectangulaire (pierre claire)
    g.fillStyle(0xd6d3d1, 1);
    g.fillRect(S / 2 - 10, S / 2 - 18, 20, 38);
    g.lineStyle(2, 0x57534e, 1);
    g.strokeRect(S / 2 - 10, S / 2 - 18, 20, 38);
    // Crénelages au sommet
    g.fillStyle(0xd6d3d1, 1);
    [-7, 0, 7].forEach(dx => {
      g.fillRect(S / 2 + dx - 2, S / 2 - 24, 4, 6);
    });
    // Fenêtre / œil bleu au milieu de la tour
    g.fillStyle(0x4dabf7, 1);
    g.fillCircle(S / 2, S / 2 - 4, 4);
    g.fillStyle(0x1e293b, 1);
    g.fillCircle(S / 2, S / 2 - 4, 2);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(S / 2 - 1, S / 2 - 5, 0.8);
    g.generateTexture('village-watchtower', S, S);
    g.destroy();
  },

  // ── Village : Sanctuaire (temple + étoile) ────────────────────
  _shrine(scene) {
    const S = 80;
    const g = scene.make.graphics({ add: false });
    // Base ronde (marbre clair)
    g.fillStyle(0xe9d8c4, 1);
    g.fillCircle(S / 2, S / 2 + 6, 30);
    g.lineStyle(3, 0x8b6f47, 1);
    g.strokeCircle(S / 2, S / 2 + 6, 30);
    // Marches
    g.fillStyle(0xc4a47a, 1);
    g.fillRect(S / 2 - 22, S / 2 + 18, 44, 4);
    g.fillRect(S / 2 - 18, S / 2 + 14, 36, 4);
    // Colonnes
    g.fillStyle(0xfafaf9, 1);
    g.fillRect(S / 2 - 16, S / 2 - 4, 5, 18);
    g.fillRect(S / 2 + 11, S / 2 - 4, 5, 18);
    g.fillRect(S / 2 - 3,  S / 2 - 4, 6, 18);
    // Toit triangulaire (rose pâle)
    g.fillStyle(0xfecdd3, 1);
    g.fillTriangle(S / 2 - 22, S / 2 - 4,  S / 2 + 22, S / 2 - 4,  S / 2, S / 2 - 22);
    g.lineStyle(2, 0x9f1239, 1);
    g.strokeTriangle(S / 2 - 22, S / 2 - 4,  S / 2 + 22, S / 2 - 4,  S / 2, S / 2 - 22);
    // Étoile dorée au sommet
    g.fillStyle(0xfbbf24, 1);
    this._fillStar(g, S / 2, S / 2 - 28, 5, 6, 2.5);
    g.generateTexture('village-shrine', S, S);
    g.destroy();
  },

  // ── Village : Forge (enclume + marteau) ───────────────────────
  _forge(scene) {
    const S = 80;
    const g = scene.make.graphics({ add: false });
    // Base ronde (terre cuite chaude)
    g.fillStyle(0x7c2d12, 1);
    g.fillCircle(S / 2, S / 2 + 6, 30);
    g.lineStyle(3, 0x431407, 1);
    g.strokeCircle(S / 2, S / 2 + 6, 30);
    // Feu / braises (orange au centre-bas)
    g.fillStyle(0xfb923c, 0.8);
    g.fillCircle(S / 2, S / 2 + 10, 12);
    g.fillStyle(0xfde047, 0.7);
    g.fillCircle(S / 2 + 2, S / 2 + 10, 6);
    // Enclume (corps gris foncé)
    g.fillStyle(0x374151, 1);
    g.fillRect(S / 2 - 16, S / 2 - 8, 32, 10);  // sommet
    g.fillRect(S / 2 - 6,  S / 2 + 2, 12, 8);   // pied
    g.fillTriangle(S / 2 + 16, S / 2 - 8,  S / 2 + 22, S / 2 - 6,  S / 2 + 16, S / 2 - 2); // bec
    g.lineStyle(1, 0x111827, 1);
    g.strokeRect(S / 2 - 16, S / 2 - 8, 32, 10);
    // Marteau (manche brun + tête grise)
    g.lineStyle(3, 0x8b5a2b, 1);
    g.lineBetween(S / 2 - 12, S / 2 - 22, S / 2 - 2, S / 2 - 12);
    g.fillStyle(0x9ca3af, 1);
    g.fillRect(S / 2 - 18, S / 2 - 28, 14, 8);
    g.lineStyle(1, 0x4b5563, 1);
    g.strokeRect(S / 2 - 18, S / 2 - 28, 14, 8);
    // Étincelles
    g.fillStyle(0xfde047, 1);
    g.fillCircle(S / 2 + 10, S / 2 - 14, 1.5);
    g.fillCircle(S / 2 - 10, S / 2 - 4, 1.5);
    g.fillCircle(S / 2 + 14, S / 2 - 2, 1);
    g.generateTexture('village-forge', S, S);
    g.destroy();
  },

  // Helper : étoile à n branches (rayon extérieur Ro, rayon intérieur Ri)
  _fillStar(g, cx, cy, n, Ro, Ri) {
    const step = Math.PI / n;
    const pts = [];
    for (let i = 0; i < 2 * n; i++) {
      const r = (i % 2 === 0) ? Ro : Ri;
      const a = -Math.PI / 2 + i * step;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    g.fillPoints(pts, true);
  },
};
