// =============================================================
// THEME — Direction artistique "obsidienne néon"
// Source de vérité unique pour le rendu client.
// Toute couleur, taille, glow, forme du jeu vient d'ici.
// =============================================================

const Theme = (() => {

  // ── Couleurs FOND / TERRAIN / GRILLE (string hex pour CSS + int pour Phaser) ──
  const BG = {
    canvas:     '#070d11', // bg Phaser
    terrain:    '#0a1a1f', // sol jouable
    minimap:    '#06101a',
    holePunch:  '#04121a', // trou central HDV/village
  };
  const GRID = {
    color:      0x285a64,  // base hue
    alpha:      0.12,
    step:       300,       // pas en px monde
    border:     0x22d3ee,  // bordure carte
    borderA:    0.20,
    buildZone:  0x22d3ee,  // cercle zone constructible
    buildZoneA: 0.12,
  };

  // ── 4 couleurs néon d'équipe (string + int) ──
  // L'index 0 est TOUJOURS attribué au joueur local ("Tu") = cyan.
  const FCOL_STR = ['#22d3ee', '#fb7185', '#c084fc', '#a3e635'];
  const FCOL_INT = [0x22d3ee, 0xfb7185, 0xc084fc, 0xa3e635];
  const NEUTRAL_STR = '#94a3b8';
  const NEUTRAL_INT = 0x94a3b8;

  // ── Couleurs pastille d'axe (interne unité) ──
  const AXC_STR = { sci: '#cbd5e1', mag: '#a78bfa', rel: '#fcd34d' };
  const AXC_INT = { sci: 0xcbd5e1, mag: 0xa78bfa, rel: 0xfcd34d };

  // ── Couleurs ressources / PV / capture ──
  const RES = {
    gold:    '#fbbf24',
    pr:      '#38bdf8',
    mana:    '#818cf8',
    faith:   '#f472b6',
    pop:     '#22c55e',
    hdvLvl:  '#e2e8f0',
  };
  const HP = {
    bg:      0x000000,
    full:    0x22c55e,   // ratio > 0.4
    low:     0xfb7185,   // ratio ≤ 0.4
    base:    0x22c55e,   // bâtiments/bases : toujours vert
    capture: 0xfbbf24,   // barre capture village
    threshold: 0.4,
  };

  // ── Mapping serveur → axe d'unité (sci/mag/rel) ──
  const AXIS = {
    // Science
    soldier:'sci', archer:'sci', knight:'sci', catapult:'sci', settler:'sci',
    heavy_knight:'sci', crossbowman:'sci', general:'sci', cannon:'sci', elite_guard:'sci',
    // Magie
    necromancer:'mag', skeleton:'mag', skeleton_knight:'mag',
    fire_elemental:'mag', arcane_dragon:'mag',
    // Religion
    pilgrim:'rel', inquisitor:'rel', holy_knight:'rel',
    angel:'rel', god_avatar:'rel',
  };

  // ── Table FORMES par type d'unité (sh, sz, ax) ──
  // sh : 'tri','diamond','chevron','square','hex','star','ring','boss'
  // sz : demi-taille en px monde
  const UNIT_SHAPES = {
    // ── Science ──
    soldier:        { sh:'tri',     sz: 9,  ax:'sci' },
    archer:         { sh:'diamond', sz: 8,  ax:'sci' },
    knight:         { sh:'chevron', sz:10,  ax:'sci' },
    catapult:       { sh:'square',  sz:11,  ax:'sci' },
    heavy_knight:   { sh:'hex',     sz:11,  ax:'sci' },
    crossbowman:    { sh:'diamond', sz: 8,  ax:'sci' },
    general:        { sh:'hex',     sz:13,  ax:'sci' },
    cannon:         { sh:'square',  sz:12,  ax:'sci' },
    elite_guard:    { sh:'hex',     sz:12,  ax:'sci' },
    settler:        { sh:'tri',     sz: 9,  ax:'sci' },
    // ── Magie ──
    necromancer:    { sh:'star',    sz:10,  ax:'mag' },
    skeleton:       { sh:'tri',     sz: 8,  ax:'mag' },
    skeleton_knight:{ sh:'chevron', sz: 9,  ax:'mag' },
    fire_elemental: { sh:'boss',    sz:14,  ax:'mag' },
    arcane_dragon:  { sh:'boss',    sz:20,  ax:'mag', fly:true },
    // ── Religion ──
    pilgrim:        { sh:'ring',    sz: 9,  ax:'rel' },
    inquisitor:     { sh:'ring',    sz:10,  ax:'rel' },
    holy_knight:    { sh:'ring',    sz:11,  ax:'rel' },
    angel:          { sh:'boss',    sz:15,  ax:'rel', fly:true },
    god_avatar:     { sh:'boss',    sz:22,  ax:'rel' },
  };

  // ── Faune PvE (sans pastille d'axe) ──
  const BEAST = {
    boar: { sh:'tri', sz:10, color: 0xa16207 },
    wolf: { sh:'tri', sz: 9, color: 0x64748b },
  };

  // ── PvE neutres (barbares, camps, boss) — palette §11.9 du spec ──
  // ownerId reconnaissable : préfixe 'neutral_'.
  const NEUTRAL_OWNERS = {
    neutral_barbarian: { color: 0xef4444, glowMul: 1.0 },   // rouge sang
    neutral_fauna:     { color: null,    glowMul: 1.0 },    // utilise BEAST color
    neutral_boss:      { color: 0xdc2626, glowMul: 1.5 },   // rouge plus saturé, glow renforcé
  };
  function isNeutralOwner(ownerId) {
    return typeof ownerId === 'string' && (ownerId.startsWith('neutral_') || NEUTRAL_OWNERS[ownerId]);
  }
  function neutralColor(ownerId, unitType) {
    const def = NEUTRAL_OWNERS[ownerId];
    if (!def) return NEUTRAL_INT;
    if (def.color != null) return def.color;
    if (unitType && BEAST[unitType]) return BEAST[unitType].color;
    return NEUTRAL_INT;
  }

  // ── Bases : HDV + village (forme hex) ──
  const BASE = {
    hdv:     { r: 28, glow: 14, glyph: '★' },
    village: { r: 20, glow: 14 }, // numéro de niveau au centre
  };

  // ── Bâtiment (tour, sanctum, etc.) : carré 20×20 ──
  const BUILDING = {
    size:        20,  // demi-côté = 10
    glow:        8,
    rampart:     0x475569, // exception : mur neutre gris
  };

  // ── Glow : params postFX.addGlow (outer, inner) ──
  // Règle : outer ≈ shadowBlur / 4.
  const GLOW = {
    unit:        { outer: 2.0, inner: 0,   quality: 0.15 },
    unitBoss:    { outer: 4.0, inner: 1.0, quality: 0.15 },
    base:        { outer: 3.0, inner: 0,   quality: 0.15 },
    building:    { outer: 2.0, inner: 0,   quality: 0.15 },
    beam:        { outer: 2.0, inner: 0,   quality: 0.15 },
  };

  // ── Beams (projectiles) ──
  // Source → couleur du tir.
  const BEAM = {
    magic:    0xa78bfa, // nécro, élémentaire, dragon
    holy:     0xfcd34d, // inquisiteur, ange, avatar divin
    ranged:   0xe2e8f0, // archer, arbalétrier, catapulte, canon
    melee:    null,     // pas de beam : juste particules d'impact
    duration: 120,      // ms
    width:    2,        // px écran
  };
  // Mapping type d'unité → catégorie beam
  const BEAM_BY_TYPE = {
    soldier:'melee', knight:'melee', heavy_knight:'melee', elite_guard:'melee',
    skeleton:'melee', skeleton_knight:'melee', holy_knight:'melee', general:'melee',
    settler:'melee', pilgrim:'melee',
    archer:'ranged', crossbowman:'ranged', catapult:'ranged', cannon:'ranged',
    necromancer:'magic', fire_elemental:'magic', arcane_dragon:'magic',
    inquisitor:'holy', angel:'holy', god_avatar:'holy',
  };

  // ── Particules ──
  const PARTICLE = {
    impactCount: 1,
    impactLife:  300,
    deathCount:  10,
    deathLife:   600,
    speedImpact: { min: 30, max: 60 },
    speedDeath:  { min: 60, max: 120 },
    size:        3,
  };

  // ── Sélection ──
  const SELECTION = {
    ringColor: 0x22d3ee,
    ringWidth: 2,
    ringOffset: 5, // sz + offset = rayon du ring
  };

  // ── FX gel ──
  const FREEZE_COLOR = 0x67e8f9;
  const FREEZE_ALPHA = 0.4;

  // ── Slot mapping client (joueurId → 0..3) ──
  // Garantit stabilité de la couleur dans la session.
  // L'index 0 est réservé au joueur local s'il est connu.
  const _slotByPid = new Map();
  let _slotsTaken  = [false, false, false, false];
  let _myPid       = null;

  function setMyId(pid) {
    if (!pid || _myPid === pid) return;
    _myPid = pid;
    // Force le slot 0 sur le joueur local
    if (_slotByPid.get(pid) !== 0) {
      const old = _slotByPid.get(pid);
      if (old != null) _slotsTaken[old] = false;
      // Si un autre joueur occupe le slot 0, on le déplace au premier slot libre.
      for (const [otherPid, s] of _slotByPid.entries()) {
        if (s === 0 && otherPid !== pid) {
          _slotsTaken[0] = false;
          _slotByPid.delete(otherPid);
          slotOf(otherPid); // réassigne
          break;
        }
      }
      _slotByPid.set(pid, 0);
      _slotsTaken[0] = true;
    }
  }

  function slotOf(pid) {
    if (!pid) return -1;
    if (_slotByPid.has(pid)) return _slotByPid.get(pid);
    if (pid === _myPid) {
      _slotByPid.set(pid, 0);
      _slotsTaken[0] = true;
      return 0;
    }
    for (let i = 0; i < 4; i++) {
      if (!_slotsTaken[i]) {
        _slotsTaken[i] = true;
        _slotByPid.set(pid, i);
        return i;
      }
    }
    // overflow (>4 joueurs) : wrap
    const i = _slotByPid.size % 4;
    _slotByPid.set(pid, i);
    return i;
  }

  function factionColorInt(pid, unitType) {
    if (!pid) return NEUTRAL_INT;
    if (isNeutralOwner(pid)) return neutralColor(pid, unitType);
    const s = slotOf(pid);
    return s >= 0 ? FCOL_INT[s] : NEUTRAL_INT;
  }
  function factionColorStr(pid, unitType) {
    if (!pid) return NEUTRAL_STR;
    if (isNeutralOwner(pid)) {
      const c = neutralColor(pid, unitType);
      return '#' + c.toString(16).padStart(6, '0');
    }
    const s = slotOf(pid);
    return s >= 0 ? FCOL_STR[s] : NEUTRAL_STR;
  }

  function unitShape(type) {
    return UNIT_SHAPES[type] || BEAST[type] || { sh:'tri', sz:9, ax:'sci' };
  }

  function beamColor(attackerType, attackerOwnerPid) {
    const cat = BEAM_BY_TYPE[attackerType];
    if (cat === 'magic')  return BEAM.magic;
    if (cat === 'holy')   return BEAM.holy;
    if (cat === 'ranged') return BEAM.ranged;
    if (cat === 'melee')  return null;
    // building : couleur d'équipe
    return factionColorInt(attackerOwnerPid);
  }

  return {
    BG, GRID, FCOL_STR, FCOL_INT, NEUTRAL_STR, NEUTRAL_INT,
    AXC_STR, AXC_INT, RES, HP,
    AXIS, UNIT_SHAPES, BEAST, NEUTRAL_OWNERS,
    BASE, BUILDING, GLOW, BEAM, BEAM_BY_TYPE,
    PARTICLE, SELECTION, FREEZE_COLOR, FREEZE_ALPHA,
    setMyId, slotOf, factionColorInt, factionColorStr,
    unitShape, beamColor, isNeutralOwner, neutralColor,
  };
})();

if (typeof window !== 'undefined') window.Theme = Theme;
