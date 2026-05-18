// Génère toutes les textures du jeu via Phaser Graphics (pas d'assets externes).
// Le corps principal des unités est dessiné en BLANC (tinté par la faction).
// Les détails (armes, armure, ombres) sont en couleurs fixes.

const SpriteFactory = {

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
    this._arrow(scene);
    this._slash(scene);
  },

  // ── HDV : château vu de dessus (3 tours + drapeau) ───────────────
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

    // Corps central
    g.fillRect(28, 30, W - 56, 90);

    // Tour centrale au sommet (avec drapeau)
    g.fillRect(W / 2 - 12, 12, 24, 26);

    // Crénelages
    const mWidth = 6, mHeight = 8;
    [10, 18, 26].forEach(x => g.fillRect(x - mWidth / 2, 42, mWidth, mHeight));
    [38, 52, 66, 80].forEach(x => g.fillRect(x - mWidth / 2, 27, mWidth, mHeight));
    [W - 26, W - 18, W - 10].forEach(x => g.fillRect(x - mWidth / 2, 42, mWidth, mHeight));
    [W / 2 - 6, W / 2 + 6].forEach(x => g.fillRect(x - mWidth / 2, 9, mWidth, mHeight));

    // Mât du drapeau
    g.fillStyle(0x222222, 1);
    g.fillRect(W / 2 - 1, 0, 2, 24);

    // Drapeau (tinté par faction)
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(W / 2 + 1, 2,  W / 2 + 18, 8,  W / 2 + 1, 14);

    // Porte (sombre, pas tintée)
    g.fillStyle(0x2c1810, 1);
    g.fillRect(W / 2 - 10, 80, 20, 40);
    g.fillStyle(0x4a2c1a, 1);
    g.fillRect(W / 2 - 10, 80, 20, 6);

    // Lignes de pierre
    g.lineStyle(1, 0x333333, 0.35);
    g.lineBetween(28, 60, W - 28, 60);
    g.lineBetween(28, 85, W / 2 - 10, 85);
    g.lineBetween(W / 2 + 10, 85, W - 28, 85);
    g.lineBetween(8, 70, 30, 70);
    g.lineBetween(W - 30, 70, W - 8, 70);

    g.generateTexture('hdv-castle', W, H);
    g.destroy();
  },

  // ── Soldat : humanoïde vu de dessus avec épée + bouclier ────────
  _soldier(scene) {
    const S = 48;
    const g = scene.make.graphics({ add: false });
    const cx = S / 2, cy = S / 2;

    // Ombre au sol
    g.fillStyle(0x000000, 0.30);
    g.fillEllipse(cx, cy + 11, 22, 7);

    // Bouclier rond à gauche (gris métal + croix)
    g.fillStyle(0xa0a0a8, 1);
    g.fillCircle(cx - 11, cy + 2, 7);
    g.lineStyle(1.5, 0x333333, 1);
    g.strokeCircle(cx - 11, cy + 2, 7);
    g.lineStyle(1.5, 0x6b2c2c, 1);
    g.lineBetween(cx - 15, cy + 2, cx - 7, cy + 2);
    g.lineBetween(cx - 11, cy - 2, cx - 11, cy + 6);

    // Épée à droite (lame argentée + garde + pommeau)
    g.fillStyle(0xe0e0e6, 1); // lame
    g.fillTriangle(cx + 6, cy - 12, cx + 10, cy - 12, cx + 8, cy + 4);
    g.lineStyle(1, 0x555555, 1);
    g.strokeTriangle(cx + 6, cy - 12, cx + 10, cy - 12, cx + 8, cy + 4);
    g.fillStyle(0xfbbf24, 1); // garde dorée
    g.fillRect(cx + 4, cy + 2, 8, 2.5);
    g.fillStyle(0x6b3410, 1); // poignée brune
    g.fillRect(cx + 7, cy + 4, 2, 4);
    g.fillStyle(0xfbbf24, 1); // pommeau
    g.fillCircle(cx + 8, cy + 9, 1.5);

    // Corps / tunique (tinté faction)
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(cx, cy + 2, 16, 18);
    g.lineStyle(2, 0x222222, 1);
    g.strokeEllipse(cx, cy + 2, 16, 18);

    // Détail tunique (ceinture sombre)
    g.fillStyle(0x4a2c1a, 1);
    g.fillRect(cx - 7, cy + 4, 14, 2);

    // Tête (peau)
    g.fillStyle(0xf2c896, 1);
    g.fillCircle(cx, cy - 6, 5);
    g.lineStyle(1.5, 0x222222, 1);
    g.strokeCircle(cx, cy - 6, 5);

    // Casque métal (couvre le haut de la tête)
    g.fillStyle(0x9aa0aa, 1);
    g.beginPath();
    g.arc(cx, cy - 6, 6, Math.PI, 2 * Math.PI);
    g.closePath();
    g.fillPath();
    g.lineStyle(1.5, 0x333333, 1);
    g.beginPath();
    g.arc(cx, cy - 6, 6, Math.PI, 2 * Math.PI);
    g.strokePath();
    // Cimier rouge sur le casque
    g.fillStyle(0xc8442c, 1);
    g.fillRect(cx - 1, cy - 14, 2, 4);

    g.generateTexture('unit-soldier', S, S);
    g.destroy();
  },

  // ── Archer : silhouette fine avec capuche + arc et flèche ───────
  _archer(scene) {
    const S = 48;
    const g = scene.make.graphics({ add: false });
    const cx = S / 2, cy = S / 2;

    // Ombre
    g.fillStyle(0x000000, 0.30);
    g.fillEllipse(cx, cy + 10, 18, 6);

    // Carquois sur le dos (brun, flèches dépassant)
    g.fillStyle(0x6b3410, 1);
    g.fillRect(cx + 5, cy - 4, 4, 10);
    g.lineStyle(1, 0x2e1808, 1);
    g.strokeRect(cx + 5, cy - 4, 4, 10);
    // Plumes des flèches dans le carquois
    g.fillStyle(0xc8442c, 1);
    g.fillTriangle(cx + 5.5, cy - 8, cx + 7, cy - 4, cx + 8.5, cy - 8);
    g.fillStyle(0xfbbf24, 1);
    g.fillTriangle(cx + 5.5, cy - 6, cx + 7, cy - 4, cx + 8.5, cy - 6);

    // Corps fin (tinté faction)
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(cx, cy + 2, 13, 17);
    g.lineStyle(2, 0x222222, 1);
    g.strokeEllipse(cx, cy + 2, 13, 17);

    // Ceinture
    g.fillStyle(0x3b2510, 1);
    g.fillRect(cx - 6, cy + 4, 12, 1.5);

    // Tête + capuche pointue (vert forêt classique)
    g.fillStyle(0xf2c896, 1);
    g.fillCircle(cx, cy - 6, 4.5);

    // Capuche par-dessus
    g.fillStyle(0x2c5234, 1);
    g.beginPath();
    g.moveTo(cx - 6, cy - 4);
    g.lineTo(cx, cy - 16);
    g.lineTo(cx + 6, cy - 4);
    g.lineTo(cx + 5, cy - 1);
    g.lineTo(cx - 5, cy - 1);
    g.closePath();
    g.fillPath();
    g.lineStyle(1.5, 0x1a3520, 1);
    g.beginPath();
    g.moveTo(cx - 6, cy - 4);
    g.lineTo(cx, cy - 16);
    g.lineTo(cx + 6, cy - 4);
    g.strokePath();

    // Arc devant (grand arc en bois, à gauche)
    g.lineStyle(2.5, 0x6b3410, 1);
    g.beginPath();
    g.arc(cx - 13, cy + 1, 10, -Math.PI / 2 - 0.3, Math.PI / 2 + 0.3);
    g.strokePath();
    // Corde de l'arc (tendue)
    g.lineStyle(1, 0xe8e8e8, 0.95);
    g.lineBetween(cx - 13, cy - 8, cx - 10, cy + 1);
    g.lineBetween(cx - 13, cy + 10, cx - 10, cy + 1);
    // Flèche encochée
    g.lineStyle(1.5, 0x8b5a2b, 1);
    g.lineBetween(cx - 10, cy + 1, cx + 2, cy + 1);
    // Pointe de la flèche
    g.fillStyle(0x9aa0aa, 1);
    g.fillTriangle(cx + 2, cy - 1, cx + 5, cy + 1, cx + 2, cy + 3);

    g.generateTexture('unit-archer', S, S);
    g.destroy();
  },

  // ── Chevalier : un vrai cheval avec cavalier + lance ────────────
  _knight(scene) {
    const S = 58;
    const g = scene.make.graphics({ add: false });
    const cx = S / 2, cy = S / 2;

    // Ombre cheval (allongée)
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(cx, cy + 12, 36, 9);

    // Pattes (4) — brun foncé, en bas
    g.fillStyle(0x4a2810, 1);
    g.fillRect(cx - 11, cy + 4, 3, 8);
    g.fillRect(cx - 5,  cy + 4, 3, 8);
    g.fillRect(cx + 2,  cy + 4, 3, 8);
    g.fillRect(cx + 8,  cy + 4, 3, 8);

    // Corps cheval (long ovale brun)
    g.fillStyle(0x8b4f2b, 1);
    g.fillEllipse(cx, cy + 2, 28, 14);
    g.lineStyle(2, 0x3b1f0e, 1);
    g.strokeEllipse(cx, cy + 2, 28, 14);

    // Crinière (ligne plus claire le long du dos)
    g.fillStyle(0x4a2810, 1);
    g.fillEllipse(cx, cy - 3, 18, 3);

    // Tête du cheval (vers la droite/avant)
    g.fillStyle(0x8b4f2b, 1);
    g.fillEllipse(cx + 14, cy, 10, 7);
    g.lineStyle(1.5, 0x3b1f0e, 1);
    g.strokeEllipse(cx + 14, cy, 10, 7);
    // Oreilles
    g.fillStyle(0x4a2810, 1);
    g.fillTriangle(cx + 11, cy - 4, cx + 13, cy - 7, cx + 13, cy - 3);
    g.fillTriangle(cx + 15, cy - 4, cx + 17, cy - 7, cx + 17, cy - 3);
    // Œil
    g.fillStyle(0x111111, 1);
    g.fillCircle(cx + 16, cy - 1, 0.8);
    // Naseau
    g.fillStyle(0x3b1f0e, 1);
    g.fillCircle(cx + 18, cy + 1, 0.8);

    // Selle (tinté faction)
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(cx - 2, cy - 2, 16, 9);
    g.lineStyle(1.5, 0x222222, 1);
    g.strokeEllipse(cx - 2, cy - 2, 16, 9);

    // Cavalier — torse (tinté faction)
    g.fillStyle(0xffffff, 1);
    g.fillEllipse(cx - 2, cy - 6, 11, 12);
    g.lineStyle(1.5, 0x222222, 1);
    g.strokeEllipse(cx - 2, cy - 6, 11, 12);
    // Ceinture
    g.fillStyle(0x3b1f0e, 1);
    g.fillRect(cx - 7, cy - 5, 11, 1.5);

    // Tête + casque heaume (gris métal)
    g.fillStyle(0x9aa0aa, 1);
    g.fillCircle(cx - 2, cy - 13, 5);
    g.lineStyle(1.5, 0x333333, 1);
    g.strokeCircle(cx - 2, cy - 13, 5);
    // Fente du heaume
    g.fillStyle(0x111111, 1);
    g.fillRect(cx - 4, cy - 13, 4, 1.5);
    // Plumet rouge
    g.fillStyle(0xc8442c, 1);
    g.fillTriangle(cx - 2, cy - 17, cx + 1, cy - 22, cx + 3, cy - 16);

    // Lance dépassant à droite (en bois avec fer)
    g.lineStyle(2.5, 0x6b3410, 1);
    g.lineBetween(cx + 5, cy - 8, cx + 22, cy - 14);
    // Fer de lance
    g.fillStyle(0xe0e0e6, 1);
    g.fillTriangle(cx + 22, cy - 14, cx + 26, cy - 16, cx + 22, cy - 12);
    g.lineStyle(1, 0x444444, 1);
    g.strokeTriangle(cx + 22, cy - 14, cx + 26, cy - 16, cx + 22, cy - 12);

    g.generateTexture('unit-knight', S, S);
    g.destroy();
  },

  // ── Anneau de sélection ───────────────────────────────────────────
  _selectionRing(scene) {
    const S = 56;
    const g = scene.make.graphics({ add: false });
    g.lineStyle(3, 0xfbbf24, 1);
    g.strokeCircle(S / 2, S / 2, 24);
    g.lineStyle(1, 0xffe082, 0.6);
    g.strokeCircle(S / 2, S / 2, 22);
    g.generateTexture('selection-ring', S, S);
    g.destroy();
  },

  // ── Flèche en vol (projectile pour archer) ─────────────────────
  _arrow(scene) {
    const W = 22, H = 6;
    const g = scene.make.graphics({ add: false });
    // Hampe brune
    g.lineStyle(2, 0x6b3410, 1);
    g.lineBetween(2, H / 2, W - 5, H / 2);
    // Pointe métallique
    g.fillStyle(0xe0e0e6, 1);
    g.fillTriangle(W - 5, 0, W, H / 2, W - 5, H);
    // Plumes
    g.fillStyle(0xc8442c, 1);
    g.fillTriangle(0, 0, 4, H / 2, 0, H);
    g.generateTexture('arrow', W, H);
    g.destroy();
  },

  // ── Effet slash (arc de lame pour soldat / chevalier) ───────────
  _slash(scene) {
    const S = 60;
    const g = scene.make.graphics({ add: false });
    const cx = S / 2, cy = S / 2;
    // Arc semi-cercle blanc translucide qui suggère un swing
    g.lineStyle(5, 0xffffff, 1);
    g.beginPath();
    g.arc(cx, cy, 22, -Math.PI / 3, Math.PI / 3);
    g.strokePath();
    g.lineStyle(2.5, 0xffe082, 0.9);
    g.beginPath();
    g.arc(cx, cy, 18, -Math.PI / 3, Math.PI / 3);
    g.strokePath();
    g.generateTexture('slash', S, S);
    g.destroy();
  },

  // ── Villages (textures fixes, pas de tint) ──────────────────────
  _goldmine(scene) {
    const S = 80;
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0x6b4423, 1);
    g.fillCircle(S / 2, S / 2, 30);
    g.lineStyle(3, 0x3e2614, 1);
    g.strokeCircle(S / 2, S / 2, 30);
    g.fillStyle(0xfbbf24, 1);
    g.fillCircle(S / 2 - 6, S / 2 + 4, 6);
    g.fillCircle(S / 2 + 5, S / 2 + 6, 5);
    g.fillCircle(S / 2 + 1, S / 2 - 1, 7);
    g.fillStyle(0xffe082, 1);
    g.fillCircle(S / 2 - 7, S / 2 + 2, 2);
    g.fillCircle(S / 2 + 6, S / 2 + 4, 2);
    g.fillCircle(S / 2,     S / 2 - 3, 2);
    g.lineStyle(3, 0x8b5a2b, 1);
    g.lineBetween(S / 2 - 18, S / 2 - 18, S / 2 + 4, S / 2 - 4);
    g.fillStyle(0x9ca3af, 1);
    g.fillTriangle(S / 2 - 22, S / 2 - 22,  S / 2 - 12, S / 2 - 24,  S / 2 - 16, S / 2 - 14);
    g.generateTexture('village-goldmine', S, S);
    g.destroy();
  },

  _watchtower(scene) {
    const S = 80;
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0x4a5d3a, 1);
    g.fillCircle(S / 2, S / 2 + 8, 30);
    g.lineStyle(3, 0x2e3d23, 1);
    g.strokeCircle(S / 2, S / 2 + 8, 30);
    g.fillStyle(0xd6d3d1, 1);
    g.fillRect(S / 2 - 10, S / 2 - 18, 20, 38);
    g.lineStyle(2, 0x57534e, 1);
    g.strokeRect(S / 2 - 10, S / 2 - 18, 20, 38);
    g.fillStyle(0xd6d3d1, 1);
    [-7, 0, 7].forEach(dx => {
      g.fillRect(S / 2 + dx - 2, S / 2 - 24, 4, 6);
    });
    g.fillStyle(0x4dabf7, 1);
    g.fillCircle(S / 2, S / 2 - 4, 4);
    g.fillStyle(0x1e293b, 1);
    g.fillCircle(S / 2, S / 2 - 4, 2);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(S / 2 - 1, S / 2 - 5, 0.8);
    g.generateTexture('village-watchtower', S, S);
    g.destroy();
  },

  _shrine(scene) {
    const S = 80;
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0xe9d8c4, 1);
    g.fillCircle(S / 2, S / 2 + 6, 30);
    g.lineStyle(3, 0x8b6f47, 1);
    g.strokeCircle(S / 2, S / 2 + 6, 30);
    g.fillStyle(0xc4a47a, 1);
    g.fillRect(S / 2 - 22, S / 2 + 18, 44, 4);
    g.fillRect(S / 2 - 18, S / 2 + 14, 36, 4);
    g.fillStyle(0xfafaf9, 1);
    g.fillRect(S / 2 - 16, S / 2 - 4, 5, 18);
    g.fillRect(S / 2 + 11, S / 2 - 4, 5, 18);
    g.fillRect(S / 2 - 3,  S / 2 - 4, 6, 18);
    g.fillStyle(0xfecdd3, 1);
    g.fillTriangle(S / 2 - 22, S / 2 - 4,  S / 2 + 22, S / 2 - 4,  S / 2, S / 2 - 22);
    g.lineStyle(2, 0x9f1239, 1);
    g.strokeTriangle(S / 2 - 22, S / 2 - 4,  S / 2 + 22, S / 2 - 4,  S / 2, S / 2 - 22);
    g.fillStyle(0xfbbf24, 1);
    this._fillStar(g, S / 2, S / 2 - 28, 5, 6, 2.5);
    g.generateTexture('village-shrine', S, S);
    g.destroy();
  },

  _forge(scene) {
    const S = 80;
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0x7c2d12, 1);
    g.fillCircle(S / 2, S / 2 + 6, 30);
    g.lineStyle(3, 0x431407, 1);
    g.strokeCircle(S / 2, S / 2 + 6, 30);
    g.fillStyle(0xfb923c, 0.8);
    g.fillCircle(S / 2, S / 2 + 10, 12);
    g.fillStyle(0xfde047, 0.7);
    g.fillCircle(S / 2 + 2, S / 2 + 10, 6);
    g.fillStyle(0x374151, 1);
    g.fillRect(S / 2 - 16, S / 2 - 8, 32, 10);
    g.fillRect(S / 2 - 6,  S / 2 + 2, 12, 8);
    g.fillTriangle(S / 2 + 16, S / 2 - 8,  S / 2 + 22, S / 2 - 6,  S / 2 + 16, S / 2 - 2);
    g.lineStyle(1, 0x111827, 1);
    g.strokeRect(S / 2 - 16, S / 2 - 8, 32, 10);
    g.lineStyle(3, 0x8b5a2b, 1);
    g.lineBetween(S / 2 - 12, S / 2 - 22, S / 2 - 2, S / 2 - 12);
    g.fillStyle(0x9ca3af, 1);
    g.fillRect(S / 2 - 18, S / 2 - 28, 14, 8);
    g.lineStyle(1, 0x4b5563, 1);
    g.strokeRect(S / 2 - 18, S / 2 - 28, 14, 8);
    g.fillStyle(0xfde047, 1);
    g.fillCircle(S / 2 + 10, S / 2 - 14, 1.5);
    g.fillCircle(S / 2 - 10, S / 2 - 4, 1.5);
    g.fillCircle(S / 2 + 14, S / 2 - 2, 1);
    g.generateTexture('village-forge', S, S);
    g.destroy();
  },

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
