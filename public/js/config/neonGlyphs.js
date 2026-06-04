// =============================================================
// NEON GLYPHS — substitution centralisée des emojis médiévaux
// par des symboles Unicode néon cohérents avec la direction artistique.
// Les noms français des unités/bâtiments restent inchangés ; seuls
// les pictogrammes sont remplacés.
// =============================================================

const NeonGlyphs = (() => {

  // Tech tree (49 nœuds) — la couleur d'axe (cyan/violet/or) est appliquée
  // par le contexte (tech-tree-overlay), pas par le glyphe.
  const TECH = {
    // ── Science ──
    agriculture:           '◉',  // grain
    construction:          '⌂',  // toit
    archery:               '➤',  // flèche
    riding:                '⌬',  // roue
    roads:                 '═',  // segment
    ballistics:            '◎',  // viseur
    reconnaissance:        '◉',  // focus
    military_architecture: '⌂',  // tour
    siege_engineering:     '◈',  // diamant
    colonization:          '⚑',  // bannière
    diplomacy:             '⊕',  // anneaux
    steel_forge:           '◈',  // acier
    crossbows:             '✚',  // croisillon
    empire:                '✦',  // étoile
    war_academy:           '⚔',  // épées
    gunpowder:             '✺',  // explosion
    printing:              '▰',  // page
    citadel:               '⌂',  // citadelle
    renaissance:           '✸',  // soleil

    // ── Magie ──
    elements_study:        '⛧',  // sceau
    stargazing:            '✦',  // étoile
    pyromancy:             '✺',  // flamme
    cryomancy:             '❄',  // flocon
    mage_tower:            '△',  // triangle
    lightning:             '⚡',  // foudre
    teleportation:         '◯',  // portail
    enchantment:           '✧',  // étincelle
    necromancy:            '☠',  // crâne
    illusion:              '◐',  // demi-lune
    arcane_ricochet:       '✦',  // étoile
    elemental_summon:      '✺',  // explosion
    lich:                  '☠',  // crâne
    time_mastery:          '⏳',  // sablier
    arcane_avatar:         '◈',  // diamant

    // ── Religion ──
    animism:               '❂',  // soleil
    prayer:                '✛',  // petite croix
    temple:                '⛩',  // torii
    pilgrimage:            '⚭',  // chaîne
    inquisition:           '✚',  // croix forte
    blessing:              '✟',  // croix simple
    purifying_light:       '✺',  // rayonnement
    sacred_order:          '✚',  // ordre
    cathedral:             '⛪',  // église
    crusade:               '⚔',  // épées
    martyrs:               '✟',  // croix
    guardian_angel:        '✦',  // étoile
    excommunication:       '✗',  // banni
    unwavering_faith:      '⊕',  // bouclier
    divine_invocation:     '☉',  // œil divin
  };

  // Ressources HUD
  const RESOURCE = {
    gold:     '◈',
    pr:       '▤',
    research: '▤',
    mana:     '✦',
    faith:    '✚',
    pop:      '⌬',
    selected: '⊕',
    hp:       '❤',
  };

  // Unités (badges sur tooltip / panneaux) — fallback sur tech icon si besoin
  const UNIT = {
    soldier:          '▲',
    archer:           '◆',
    knight:           '▶',
    heavy_knight:     '⬢',
    crossbowman:      '◆',
    catapult:         '■',
    cannon:           '■',
    general:          '⬢',
    elite_guard:      '⬢',
    settler:          '⚑',
    necromancer:      '✦',
    skeleton:         '▲',
    fire_elemental:   '✺',
    arcane_dragon:    '✦',
    pilgrim:          '◯',
    inquisitor:       '◯',
    holy_knight:      '◯',
    angel:            '✦',
    god_avatar:       '✸',
    // PvE
    boar:             '▲',
    wolf:             '▲',
  };

  // Bâtiments
  const BUILDING = {
    tower:       '◈',
    bombard:     '◈',
    sanctum:     '△',
    mage_tower:  '△',
    altar:       '✚',
    temple:      '⛩',
    cathedral:   '⛪',
    rampart:     '═',
    wall:        '═',
  };

  function tech(id, fallback) { return TECH[id] || fallback || '◆'; }
  function resource(key, fb) { return RESOURCE[key] || fb || '◆'; }
  function unit(id, fb) { return UNIT[id] || fb || '◆'; }
  function building(id, fb) { return BUILDING[id] || fb || '◆'; }

  return { TECH, RESOURCE, UNIT, BUILDING, tech, resource, unit, building };
})();

if (typeof window !== 'undefined') window.NeonGlyphs = NeonGlyphs;
