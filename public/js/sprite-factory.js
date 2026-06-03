// =============================================================
// SPRITE FACTORY — formes géométriques néon procédurales.
// Toutes les textures sont générées en BLANC une seule fois,
// puis tintées par la couleur d'équipe à l'usage (setTint).
// Aucun PNG n'est consommé — direction artistique "obsidienne néon".
// =============================================================

const SpriteFactory = (() => {

  // Taille de référence : on génère chaque shape à TEX_SIZE/2 = 30 px de rayon.
  // L'unité finale est ensuite ré-échelonnée à sa vraie `sz` via setDisplaySize.
  const TEX_R = 30;
  const TEX_PAD = 20;          // marge nécessaire pour le glow néon
  const TEX_SIZE = TEX_R * 2 + TEX_PAD * 2;

  function generateAll(scene) {
    _shape(scene, 'sf-tri',     g => _drawTri(g, TEX_R));
    _shape(scene, 'sf-diamond', g => _drawDiamond(g, TEX_R));
    _shape(scene, 'sf-chevron', g => _drawChevron(g, TEX_R));
    _shape(scene, 'sf-square',  g => _drawSquare(g, TEX_R));
    _shape(scene, 'sf-hex',     g => _drawHex(g, TEX_R, 0));
    _shape(scene, 'sf-star',    g => _drawStar(g, TEX_R));
    _shape(scene, 'sf-ring',    g => _drawRing(g, TEX_R));
    _shape(scene, 'sf-boss',    g => _drawBoss(g, TEX_R));

    // Base : hex de rayon TEX_R, sans glyphe (glyphe = Text séparé).
    _shape(scene, 'sf-base-hex', g => _drawHex(g, TEX_R, 0));

    // Particule : carré 3px blanc (taille spec).
    _shape(scene, 'sf-particle', g => {
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 3, 3);
    }, 3, 3);

    // Anneau de sélection cyan (couleur fixe — pas de tint nécessaire).
    _shape(scene, 'sf-selection', g => {
      g.lineStyle(2, 0x22d3ee, 1);
      g.strokeCircle(_center(), _center(), TEX_R);
    });
  }

  // Helper : crée une texture WxH (par défaut TEX_SIZE×TEX_SIZE) et y dessine.
  function _shape(scene, key, drawFn, W = TEX_SIZE, H = TEX_SIZE) {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ add: false });
    drawFn(g);
    g.generateTexture(key, W, H);
    g.destroy();
  }

  // ── Dessins de formes (centrées sur TEX_R+3, TEX_R+3) ──
  // Note : on dessine en BLANC opaque. Le tint d'équipe colore tout.
  function _center() { return TEX_R + TEX_PAD; }

  function _drawTri(g, sz) {
    const c = _center();
    g.fillStyle(0xffffff, 1);
    g.beginPath();
    g.moveTo(c, c - sz);
    g.lineTo(c - sz, c + sz);
    g.lineTo(c + sz, c + sz);
    g.closePath();
    g.fillPath();
  }
  function _drawDiamond(g, sz) {
    const c = _center();
    g.fillStyle(0xffffff, 1);
    g.beginPath();
    g.moveTo(c, c - sz);
    g.lineTo(c + sz, c);
    g.lineTo(c, c + sz);
    g.lineTo(c - sz, c);
    g.closePath();
    g.fillPath();
  }
  function _drawChevron(g, sz) {
    const c = _center();
    g.fillStyle(0xffffff, 1);
    g.beginPath();
    g.moveTo(c, c - sz);
    g.lineTo(c + sz, c + sz);
    g.lineTo(c, c + sz * 0.3);
    g.lineTo(c - sz, c + sz);
    g.closePath();
    g.fillPath();
  }
  function _drawSquare(g, sz) {
    const c = _center();
    g.fillStyle(0xffffff, 1);
    g.fillRect(c - sz, c - sz, sz * 2, sz * 2);
  }
  function _drawHex(g, sz, rot) {
    const c = _center();
    g.fillStyle(0xffffff, 1);
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + rot;
      const px = c + Math.cos(a) * sz;
      const py = c + Math.sin(a) * sz;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
  }
  function _drawStar(g, sz) {
    const c = _center();
    g.fillStyle(0xffffff, 1);
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2 - Math.PI / 2;
      const r = (i % 2 === 0) ? sz : sz * 0.45;
      const px = c + Math.cos(a) * r;
      const py = c + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
  }
  function _drawRing(g, sz) {
    const c = _center();
    // Disque plein
    g.fillStyle(0xffffff, 1);
    g.fillCircle(c, c, sz);
    // Anneau externe alpha 0.5 (visible avec tint car la fillCircle remplit aussi)
    g.lineStyle(1.5, 0xffffff, 0.5);
    g.strokeCircle(c, c, sz + 3);
  }
  function _drawBoss(g, sz) {
    const c = _center();
    g.fillStyle(0xffffff, 1);
    // Hexagone rotation -0.3 rad
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 - 0.3;
      const px = c + Math.cos(a) * sz;
      const py = c + Math.sin(a) * sz;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
    // Le disque blanc central (alpha 1) — sera RÉ-AJOUTÉ comme overlay au runtime
    // pour rester blanc face au tint d'équipe ; ici on laisse le hex plein blanc.
  }

  return {
    generateAll,
    TEX_R, TEX_SIZE,
  };
})();

if (typeof window !== 'undefined') window.SpriteFactory = SpriteFactory;
