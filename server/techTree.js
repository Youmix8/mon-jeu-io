// TECH TREE v3 — arbre radial à 3 axes (Science / Magie / Religion).
// Restructuration "session-3" : chaque nœud a désormais un effet TANGIBLE
// (plus de simple déblocage vide), 3 identités accentuées, capstones nerfés.
//   Science  : économie + armée polyvalente fiable
//   Magie    : burst & invocations, à haut risque (early renforcé)
//   Religion : sustain, défense, anti-magie
// Chaque nœud :
//   id            : identifiant unique (NE PAS renommer — référencé par hasTech
//                   côté server.js et par les routes des bots)
//   axis          : 'science' | 'magic' | 'religion'
//   tier          : 1 à 6
//   name          : nom affiché
//   icon          : emoji (placeholder en attendant les vrais assets)
//   desc          : description courte
//   cost          : coût en PR (points de recherche)
//   requires      : array d'IDs prérequis (tous doivent être débloqués)
//   unlocks       : { units, buildings, spells, passives }
//   pos           : { x, y } position dans l'arbre (coordonnées arbitraires utilisées par le client)
//
// L'arbre est centré sur (0, 0). Les axes partent à :
//   Science  : angle -π/2 (haut)
//   Magie    : angle  π/2 + 2π/3 ≈ 210° (bas-gauche)
//   Religion : angle  π/2 - 2π/3 ≈ -30° (bas-droite)

const AXES = {
  science:  { angle: -Math.PI / 2 },
  magic:    { angle:  Math.PI / 2 + Math.PI * 2 / 3 }, // bas-gauche
  religion: { angle:  Math.PI / 2 - Math.PI * 2 / 3 }, // bas-droite
};

// Helper pour positionner un nœud : tier (1-6), spread (-2..+2 = position latérale dans le tier)
// Layout aéré : ~115px d'arc constant entre 2 spreads voisins, quel que soit le tier.
function pos(axis, tier, spread) {
  const baseAngle = AXES[axis].angle;
  const radius    = 240 + (tier - 1) * 200; // tier1=240 ... tier6=1240
  const ARC_STEP  = 115;
  const spreadAng = (spread || 0) * (ARC_STEP / radius);
  const a = baseAngle + spreadAng;
  return { x: Math.round(Math.cos(a) * radius), y: Math.round(Math.sin(a) * radius) };
}

const TECH_TREE = {
  // ============================================================
  // 🔬 SCIENCE — économie + armée polyvalente fiable (19 nœuds)
  // ============================================================
  agriculture: {
    id: 'agriculture', axis: 'science', tier: 1, name: 'Agriculture', icon: '🌾',
    desc: '+1 gold/sec passif sur ton HDV.',
    cost: 10, requires: [],
    unlocks: { passives: ['gold_bonus_1'] },
    pos: pos('science', 1, -1),
  },
  construction: {
    id: 'construction', axis: 'science', tier: 1, name: 'Construction', icon: '🛠',
    desc: '+25 % de PV sur TOUS tes bâtiments. Ouvre les Voies et la Balistique.',
    cost: 10, requires: [],
    unlocks: { passives: ['building_hp_boost'] },
    pos: pos('science', 1, 1),
  },

  archery: {
    id: 'archery', axis: 'science', tier: 2, name: 'Tir à l\'arc', icon: '🏹',
    desc: 'Débloque l\'Archer (portée 250) + tes Archers gagnent +10 % de portée.',
    cost: 30, requires: ['agriculture'],
    unlocks: { units: ['archer'], passives: ['archer_range'] },
    pos: pos('science', 2, -1.5),
  },
  riding: {
    id: 'riding', axis: 'science', tier: 2, name: 'Équitation', icon: '🐎',
    desc: 'Débloque le Chevalier (HP 80, dégâts 8) + Chevaliers +10 % de vitesse.',
    cost: 30, requires: ['agriculture'],
    unlocks: { units: ['knight'], passives: ['cavalry_speed'] },
    pos: pos('science', 2, -0.5),
  },
  roads: {
    id: 'roads', axis: 'science', tier: 2, name: 'Voies', icon: '🛣',
    desc: 'Réseau routier : +12 % vitesse de déplacement pour toutes tes unités.',
    cost: 20, requires: ['construction'],
    unlocks: { passives: ['road_speed'] },
    pos: pos('science', 2, 0.5),
  },
  ballistics: {
    id: 'ballistics', axis: 'science', tier: 2, name: 'Balistique', icon: '🎯',
    desc: '+25 % cadence de tir (archer, arbalétrier, catapulte, canon, tour, bombarde).',
    cost: 40, requires: ['construction'],
    unlocks: { passives: ['rate_of_fire'] },
    pos: pos('science', 2, 1.5),
  },

  military_architecture: {
    id: 'military_architecture', axis: 'science', tier: 3, name: 'Architecture militaire', icon: '🏯',
    desc: 'Débloque la Tour d\'Archer + tes tours gagnent +15 % de portée.',
    cost: 50, requires: ['archery'],
    unlocks: { buildings: ['tower'], passives: ['tower_range'] },
    pos: pos('science', 3, -1.5),
  },
  siege_engineering: {
    id: 'siege_engineering', axis: 'science', tier: 3, name: 'Ingénierie de siège', icon: '⚙️',
    desc: 'Débloque la Catapulte + tes engins de siège infligent +25 % de dégâts aux bâtiments.',
    cost: 60, requires: ['riding'],
    unlocks: { units: ['catapult'], passives: ['siege_vs_buildings'] },
    pos: pos('science', 3, -0.5),
  },
  colonization: {
    id: 'colonization', axis: 'science', tier: 3, name: 'Logistique', icon: '🚩',
    desc: 'Débloque le Colon (fonde un village) + +0,5 gold/sec par village que tu possèdes.',
    cost: 60, requires: ['roads', 'agriculture'],
    unlocks: { units: ['settler'], passives: ['village_gold'] },
    pos: pos('science', 3, 0.5),
  },
  reconnaissance: {
    id: 'reconnaissance', axis: 'science', tier: 3, name: 'Reconnaissance', icon: '🔭',
    desc: '+30 % vision sur toutes tes unités et +15 % de portée pour les unités à distance.',
    cost: 40, requires: ['ballistics'],
    unlocks: { passives: ['recon_vision_range'] },
    pos: pos('science', 3, 1.5),
  },

  diplomacy: {
    id: 'diplomacy', axis: 'science', tier: 4, name: 'Diplomatie', icon: '🤝',
    desc: 'Permet de proposer des pactes de non-agression aux autres joueurs.',
    cost: 70, requires: ['colonization'],
    unlocks: { passives: ['diplomacy'] },
    pos: pos('science', 4, -1),
  },
  steel_forge: {
    id: 'steel_forge', axis: 'science', tier: 4, name: 'Forge d\'acier', icon: '🔨',
    desc: 'Débloque le Chevalier lourd (HP 150) + tes unités de mêlée gagnent +10 % de PV.',
    cost: 80, requires: ['siege_engineering'],
    unlocks: { units: ['heavy_knight'], passives: ['melee_hp'] },
    pos: pos('science', 4, 0),
  },
  crossbows: {
    id: 'crossbows', axis: 'science', tier: 4, name: 'Arbalètes', icon: '🎯',
    desc: 'Débloque l\'Arbalétrier + améliore les Archers (+ dégâts, -10 % portée).',
    cost: 70, requires: ['military_architecture'],
    unlocks: { units: ['crossbowman'], passives: ['archer_buff'] },
    pos: pos('science', 4, 1),
  },

  empire: {
    id: 'empire', axis: 'science', tier: 5, name: 'Empire', icon: '👑',
    desc: '+50 % de génération de gold sur HDV et villages.',
    cost: 110, requires: ['diplomacy'],
    unlocks: { passives: ['gold_x150'] },
    pos: pos('science', 5, -1),
  },
  war_academy: {
    id: 'war_academy', axis: 'science', tier: 5, name: 'Académie de guerre', icon: '⚔️',
    desc: 'Débloque le Général (HP 160, dégâts 16) : aura +25 % dégâts aux unités proches.',
    cost: 120, requires: ['steel_forge'],
    unlocks: { units: ['general'] },
    pos: pos('science', 5, 0),
  },
  gunpowder: {
    id: 'gunpowder', axis: 'science', tier: 5, name: 'Poudre noire', icon: '💥',
    desc: 'Débloque le Canon (mobile) et la Bombarde (défensive).',
    cost: 140, requires: ['steel_forge', 'siege_engineering'],
    unlocks: { units: ['cannon'], buildings: ['bombard_tower'] },
    pos: pos('science', 5, 1),
  },

  printing: {
    id: 'printing', axis: 'science', tier: 6, name: 'Imprimerie', icon: '📜',
    desc: '×1,5 de génération de PR (boost de recherche).',
    cost: 170, requires: ['empire'],
    unlocks: { passives: ['pr_x150'] },
    pos: pos('science', 6, -1),
  },
  citadel: {
    id: 'citadel', axis: 'science', tier: 6, name: 'Citadelle', icon: '🏰',
    desc: 'Upgrade HDV en Citadelle : ×1,8 PV et tir automatique sur les ennemis proches.',
    cost: 190, requires: ['war_academy'],
    unlocks: { passives: ['citadel_hdv'] },
    pos: pos('science', 6, 0),
  },
  renaissance: {
    id: 'renaissance', axis: 'science', tier: 6, name: 'Renaissance', icon: '🌟',
    desc: 'END NODE. Débloque la Garde d\'Élite + RADAR : un balayage révèle tous les ennemis sur la mini-carte 3 s toutes les 30 s.',
    cost: 240, requires: ['printing', 'citadel', 'gunpowder'],
    unlocks: { units: ['elite_guard'], passives: ['minimap_radar'] },
    pos: pos('science', 6, 1),
  },

  // ============================================================
  // ✨ MAGIE — burst & invocations, à haut risque (15 nœuds)
  // ============================================================
  elements_study: {
    id: 'elements_study', axis: 'magic', tier: 1, name: 'Étude des éléments', icon: '🔮',
    desc: 'Débloque le Sanctum (générateur de mana) + +0,3 mana/sec de base.',
    cost: 10, requires: [],
    unlocks: { buildings: ['sanctum'], passives: ['base_mana'] },
    pos: pos('magic', 1, -0.5),
  },
  stargazing: {
    id: 'stargazing', axis: 'magic', tier: 1, name: 'Lecture des étoiles', icon: '⭐',
    desc: '+0.3 PR/sec passif.',
    cost: 10, requires: [],
    unlocks: { passives: ['pr_bonus_03'] },
    pos: pos('magic', 1, 0.5),
  },

  pyromancy: {
    id: 'pyromancy', axis: 'magic', tier: 2, name: 'Pyromancie', icon: '🔥',
    desc: 'Unités magie +45 % dégâts + chaque tir magique inflige une mini-AoE de 30 px (×0.5 dmg périphérie).',
    cost: 30, requires: ['elements_study'],
    unlocks: { passives: ['magic_dmg_boost', 'magic_splash'] },
    pos: pos('magic', 2, -1),
  },
  cryomancy: {
    id: 'cryomancy', axis: 'magic', tier: 2, name: 'Cryomancie', icon: '❄️',
    desc: 'Maîtrise du froid : 20 % de chance de ralentir la cible 2 s à chaque tir magique.',
    cost: 30, requires: ['elements_study'],
    unlocks: { passives: ['magic_slow_chance'] },
    pos: pos('magic', 2, 0),
  },
  mage_tower: {
    id: 'mage_tower', axis: 'magic', tier: 2, name: 'Tour de mage', icon: '🧙',
    desc: 'Débloque le Nécromancien (HP 70, dmg 14, 20 mana) — sa victime ressuscite en allié. Construit aussi la Tour de mage (+1 mana/sec).',
    cost: 50, requires: ['elements_study'],
    unlocks: { units: ['necromancer'], buildings: ['mage_tower'] },
    pos: pos('magic', 2, 1),
  },

  lightning: {
    id: 'lightning', axis: 'magic', tier: 3, name: 'Foudre', icon: '⚡',
    desc: 'Éclair : unités magie +25 % vitesse + vision +30 %.',
    cost: 60, requires: ['pyromancy'],
    unlocks: { passives: ['magic_speed_vision'] },
    pos: pos('magic', 3, -1.2),
  },
  teleportation: {
    id: 'teleportation', axis: 'magic', tier: 3, name: 'Téléportation', icon: '🌀',
    desc: 'Mobilité magique : toutes tes unités +15 % vitesse de déplacement.',
    cost: 60, requires: ['cryomancy'],
    unlocks: { passives: ['all_speed_boost'] },
    pos: pos('magic', 3, 0),
  },
  enchantment: {
    id: 'enchantment', axis: 'magic', tier: 3, name: 'Enchantement', icon: '✨',
    desc: 'Enchantement : génération de mana de tes bâtiments ×1.5.',
    cost: 50, requires: ['mage_tower'],
    unlocks: { passives: ['mana_gen_boost'] },
    pos: pos('magic', 3, 1.2),
  },

  necromancy: {
    id: 'necromancy', axis: 'magic', tier: 4, name: 'Nécromancie', icon: '💀',
    desc: 'Renforce le revive : cap d\'undeads actifs +3 et squelettes invoqués avec +20 % HP/dmg.',
    cost: 100, requires: ['mage_tower', 'lightning'],
    unlocks: { passives: ['necro_revive_buff'] },
    pos: pos('magic', 4, -1.2),
  },
  illusion: {
    id: 'illusion', axis: 'magic', tier: 4, name: 'Illusion', icon: '👤',
    desc: 'Illusion : tes unités magiques +15 % HP max.',
    cost: 80, requires: ['teleportation'],
    unlocks: { passives: ['magic_hp_boost'] },
    pos: pos('magic', 4, 0),
  },
  arcane_ricochet: {
    id: 'arcane_ricochet', axis: 'magic', tier: 4, name: 'Ricochet arcanique', icon: '💫',
    desc: 'Les tirs de tes mages rebondissent 1× sur l\'ennemi le plus proche (<120 px, dégâts ×0.6).',
    cost: 80, requires: ['enchantment'],
    unlocks: { passives: ['arcane_ricochet'] },
    pos: pos('magic', 4, 1.2),
  },

  elemental_summon: {
    id: 'elemental_summon', axis: 'magic', tier: 5, name: 'Convocation élémentaire', icon: '🌋',
    desc: 'Débloque l\'Élémentaire de feu (250 HP, AoE 40) + tes invocations durent +20 %.',
    cost: 150, requires: ['lightning', 'pyromancy'],
    unlocks: { units: ['fire_elemental'], passives: ['summon_duration'] },
    pos: pos('magic', 5, -1),
  },
  lich: {
    id: 'lich', axis: 'magic', tier: 5, name: 'Liche', icon: '☠️',
    desc: 'À chaque kill du Nécromancien, la victime ressuscite en CLONE allié (-40 % HP/dmg, 30 s) au lieu d\'un squelette.',
    cost: 170, requires: ['necromancy'],
    unlocks: { passives: ['lich_clone_revive'] },
    pos: pos('magic', 5, 0),
  },
  time_mastery: {
    id: 'time_mastery', axis: 'magic', tier: 5, name: 'Maîtrise du temps', icon: '⏳',
    desc: 'Cooldown d\'attaque de tes unités magie -12 %.',
    cost: 170, requires: ['illusion', 'arcane_ricochet'],
    unlocks: { passives: ['magic_atk_speed'] },
    pos: pos('magic', 5, 1),
  },

  arcane_avatar: {
    id: 'arcane_avatar', axis: 'magic', tier: 6, name: 'Avatar des Arcanes', icon: '🐉',
    desc: 'Débloque le Dragon arcanique (800 HP, vol, 60 s par invocation).',
    cost: 270, requires: ['elemental_summon', 'lich'],
    unlocks: { units: ['arcane_dragon'] },
    pos: pos('magic', 6, 0),
  },

  // ============================================================
  // ⛪ RELIGION — sustain, défense, anti-magie (15 nœuds)
  // ============================================================
  animism: {
    id: 'animism', axis: 'religion', tier: 1, name: 'Animisme', icon: '🕯',
    desc: 'Débloque l\'Autel (générateur de foi) + +0,3 foi/sec de base.',
    cost: 10, requires: [],
    unlocks: { buildings: ['altar'], passives: ['base_faith'] },
    pos: pos('religion', 1, -0.5),
  },
  prayer: {
    id: 'prayer', axis: 'religion', tier: 1, name: 'Prière', icon: '🙏',
    desc: '+1 HP/sec passif sur toutes tes unités à moins de 200 d\'un HDV.',
    cost: 10, requires: [],
    unlocks: { passives: ['hdv_heal_aura'] },
    pos: pos('religion', 1, 0.5),
  },

  temple: {
    id: 'temple', axis: 'religion', tier: 2, name: 'Temple', icon: '⛩',
    desc: 'Upgrade l\'Autel : +1.5 foi/sec. Source de foi principale.',
    cost: 40, requires: ['animism'],
    unlocks: { buildings: ['temple'] },
    pos: pos('religion', 2, -1),
  },
  pilgrimage: {
    id: 'pilgrimage', axis: 'religion', tier: 2, name: 'Pèlerinage', icon: '🚶',
    desc: 'Débloque le Pèlerin : ne combat pas mais +0.5 foi/sec à son propriétaire.',
    cost: 30, requires: ['prayer'],
    unlocks: { units: ['pilgrim'] },
    pos: pos('religion', 2, 0),
  },
  inquisition: {
    id: 'inquisition', axis: 'religion', tier: 2, name: 'Inquisition', icon: '🗡',
    desc: 'Débloque l\'Inquisiteur : double dégâts vs unités magiques et undead.',
    cost: 40, requires: ['animism'],
    unlocks: { units: ['inquisitor'] },
    pos: pos('religion', 2, 1),
  },

  blessing: {
    id: 'blessing', axis: 'religion', tier: 3, name: 'Bénédiction', icon: '✝️',
    desc: 'Bénédiction : toutes tes unités +10 % HP max + 0.5 HP/s de regen passive.',
    cost: 60, requires: ['temple'],
    unlocks: { passives: ['all_hp_regen'] },
    pos: pos('religion', 3, -1.2),
  },
  purifying_light: {
    id: 'purifying_light', axis: 'religion', tier: 3, name: 'Lumière purificatrice', icon: '🌟',
    desc: 'Lumière purificatrice : dégâts de l\'Inquisiteur vs magie/undead ×3 (au lieu de ×2).',
    cost: 60, requires: ['inquisition'],
    unlocks: { passives: ['inquisitor_buff'] },
    pos: pos('religion', 3, 0),
  },
  sacred_order: {
    id: 'sacred_order', axis: 'religion', tier: 3, name: 'Ordre sacré', icon: '🛡',
    desc: 'Débloque le Chevalier Sacré (+5 HP/s) + tes unités saintes gagnent +10 % de PV.',
    cost: 80, requires: ['temple'],
    unlocks: { units: ['holy_knight'], passives: ['holy_hp'] },
    pos: pos('religion', 3, 1.2),
  },

  cathedral: {
    id: 'cathedral', axis: 'religion', tier: 4, name: 'Cathédrale', icon: '⛪',
    desc: 'Upgrade le Temple : +3 foi/sec. Le moteur de foi de fin de partie.',
    cost: 110, requires: ['sacred_order', 'blessing'],
    unlocks: { buildings: ['cathedral'] },
    pos: pos('religion', 4, -1.2),
  },
  crusade: {
    id: 'crusade', axis: 'religion', tier: 4, name: 'Croisade', icon: '⚔️',
    desc: 'Croisade : +25 % dégâts de toutes tes unités contre HDV et bâtiments.',
    cost: 100, requires: ['sacred_order'],
    unlocks: { passives: ['anti_building_dmg'] },
    pos: pos('religion', 4, 0),
  },
  martyrs: {
    id: 'martyrs', axis: 'religion', tier: 4, name: 'Martyrs', icon: '💧',
    desc: 'Quand un Pèlerin meurt, il explose en heal AoE (+200 HP aux alliés).',
    cost: 80, requires: ['pilgrimage'],
    unlocks: { passives: ['martyr_explosion'] },
    pos: pos('religion', 4, 1.2),
  },

  guardian_angel: {
    id: 'guardian_angel', axis: 'religion', tier: 5, name: 'Ange Gardien', icon: '👼',
    desc: 'Débloque l\'Ange (300 HP, vol, aura de soin aux alliés).',
    cost: 170, requires: ['cathedral'],
    unlocks: { units: ['angel'] },
    pos: pos('religion', 5, -1),
  },
  excommunication: {
    id: 'excommunication', axis: 'religion', tier: 5, name: 'Excommunication', icon: '🚫',
    desc: 'Excommunication : ennemis à <150 px d\'une unité Religion -20 % dégâts.',
    cost: 150, requires: ['purifying_light', 'inquisition'],
    unlocks: { passives: ['religion_curse_aura'] },
    pos: pos('religion', 5, 0),
  },
  unwavering_faith: {
    id: 'unwavering_faith', axis: 'religion', tier: 5, name: 'Foi inébranlable', icon: '🛡',
    desc: 'Toutes tes unités ignorent 25 % des dégâts magiques.',
    cost: 150, requires: ['crusade', 'martyrs'],
    unlocks: { passives: ['magic_resist_25'] },
    pos: pos('religion', 5, 1),
  },

  divine_invocation: {
    id: 'divine_invocation', axis: 'religion', tier: 6, name: 'Invocation divine', icon: '👁',
    desc: 'Débloque l\'Avatar divin (900 HP, dmg 45, aura de peur, AoE 60).',
    cost: 270, requires: ['guardian_angel', 'unwavering_faith'],
    unlocks: { units: ['god_avatar'] },
    pos: pos('religion', 6, 0),
  },
};

// Validation au démarrage : tous les requires pointent sur des nœuds existants
function validateTechTree() {
  const ids = new Set(Object.keys(TECH_TREE));
  let errors = 0;
  for (const [id, node] of Object.entries(TECH_TREE)) {
    if (node.id !== id) {
      console.error(`[techTree] id ${id} != node.id ${node.id}`);
      errors++;
    }
    for (const req of node.requires || []) {
      if (!ids.has(req)) {
        console.error(`[techTree] ${id} requires ${req} (introuvable)`);
        errors++;
      }
    }
  }
  if (errors === 0) {
    console.log(`[techTree] ${ids.size} nœuds OK`);
  }
  return errors === 0;
}

module.exports = { TECH_TREE, AXES, validateTechTree };
