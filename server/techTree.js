// TECH TREE v2 — arbre radial à 3 axes (Science / Magie / Religion).
// Chaque nœud :
//   id            : identifiant unique
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
// Chaque tier est à un rayon de 140 + (tier-1) * 130 du centre.

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
  // 🔬 SCIENCE (militaire / civilisation) — 18 nœuds
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
    desc: 'Débloque les chemins (Voies) et la marine.',
    cost: 10, requires: [],
    unlocks: {},
    pos: pos('science', 1, 1),
  },

  archery: {
    id: 'archery', axis: 'science', tier: 2, name: 'Tir à l\'arc', icon: '🏹',
    desc: 'Débloque l\'unité Archer (portée 250, dégâts 4).',
    cost: 30, requires: ['agriculture'],
    unlocks: { units: ['archer'] },
    pos: pos('science', 2, -1.5),
  },
  riding: {
    id: 'riding', axis: 'science', tier: 2, name: 'Équitation', icon: '🐎',
    desc: 'Débloque l\'unité Chevalier (HP 80, vitesse 140, dégâts 8).',
    cost: 30, requires: ['agriculture'],
    unlocks: { units: ['knight'] },
    pos: pos('science', 2, -0.5),
  },
  roads: {
    id: 'roads', axis: 'science', tier: 2, name: 'Voies', icon: '🛣',
    desc: 'Permet de tracer des chemins. +30% vitesse sur un chemin.',
    cost: 20, requires: ['construction'],
    unlocks: { buildings: ['road'] },
    pos: pos('science', 2, 0.5),
  },
  marine: {
    id: 'marine', axis: 'science', tier: 2, name: 'Marine', icon: '⛵',
    desc: 'Débloque le Port (à venir : transport sur l\'eau).',
    cost: 40, requires: ['construction'],
    unlocks: { buildings: ['port'] },
    pos: pos('science', 2, 1.5),
  },

  military_architecture: {
    id: 'military_architecture', axis: 'science', tier: 3, name: 'Architecture militaire', icon: '🏯',
    desc: 'Débloque la Tour d\'Archer.',
    cost: 50, requires: ['archery'],
    unlocks: { buildings: ['tower'] },
    pos: pos('science', 3, -1.5),
  },
  siege_engineering: {
    id: 'siege_engineering', axis: 'science', tier: 3, name: 'Ingénierie de siège', icon: '⚙️',
    desc: 'Débloque la Catapulte (dégâts massifs sur bâtiments).',
    cost: 60, requires: ['riding'],
    unlocks: { units: ['catapult'] },
    pos: pos('science', 3, -0.5),
  },
  colonization: {
    id: 'colonization', axis: 'science', tier: 3, name: 'Colonisation', icon: '🚩',
    desc: 'Permet d\'envoyer un Colon fonder un nouveau village.',
    cost: 80, requires: ['roads', 'agriculture'],
    unlocks: { units: ['settler'] },
    pos: pos('science', 3, 0.5),
  },
  cartography: {
    id: 'cartography', axis: 'science', tier: 3, name: 'Cartographie', icon: '🗺',
    desc: 'Révèle l\'intégralité de la map (fog of war levé pour toi).',
    cost: 40, requires: ['marine'],
    unlocks: { passives: ['full_map_reveal'] },
    pos: pos('science', 3, 1.5),
  },

  diplomacy: {
    id: 'diplomacy', axis: 'science', tier: 4, name: 'Diplomatie', icon: '🤝',
    desc: 'Permet de proposer des pactes de non-agression aux autres joueurs.',
    cost: 80, requires: ['colonization'],
    unlocks: { passives: ['diplomacy'] },
    pos: pos('science', 4, -1),
  },
  steel_forge: {
    id: 'steel_forge', axis: 'science', tier: 4, name: 'Forge d\'acier', icon: '🔨',
    desc: 'Débloque le Chevalier lourd (HP 150, dégâts 12, lent).',
    cost: 80, requires: ['siege_engineering'],
    unlocks: { units: ['heavy_knight'] },
    pos: pos('science', 4, 0),
  },
  crossbows: {
    id: 'crossbows', axis: 'science', tier: 4, name: 'Arbalètes', icon: '🎯',
    desc: 'Améliore les Archers (+50% dmg, -20% portée) + débloque l\'Arbalétrier.',
    cost: 70, requires: ['military_architecture'],
    unlocks: { units: ['crossbowman'], passives: ['archer_buff'] },
    pos: pos('science', 4, 1),
  },

  empire: {
    id: 'empire', axis: 'science', tier: 5, name: 'Empire', icon: '👑',
    desc: '+50% de génération de gold sur HDV et villages.',
    cost: 120, requires: ['diplomacy'],
    unlocks: { passives: ['gold_x150'] },
    pos: pos('science', 5, -1),
  },
  war_academy: {
    id: 'war_academy', axis: 'science', tier: 5, name: 'Académie de guerre', icon: '⚔️',
    desc: 'Débloque le Général : aura +25% dégâts aux unités proches.',
    cost: 120, requires: ['steel_forge'],
    unlocks: { units: ['general'] },
    pos: pos('science', 5, 0),
  },
  gunpowder: {
    id: 'gunpowder', axis: 'science', tier: 5, name: 'Poudre noire', icon: '💥',
    desc: 'Débloque le Canon (mobile) et la Bombarde (défensive).',
    cost: 140, requires: ['steel_forge', 'siege_engineering'],
    unlocks: { units: ['cannon'], buildings: ['bombard'] },
    pos: pos('science', 5, 1),
  },

  printing: {
    id: 'printing', axis: 'science', tier: 6, name: 'Imprimerie', icon: '📜',
    desc: '+100% de génération de PR (boost recherche massif).',
    cost: 180, requires: ['empire'],
    unlocks: { passives: ['pr_x200'] },
    pos: pos('science', 6, -1),
  },
  citadel: {
    id: 'citadel', axis: 'science', tier: 6, name: 'Citadelle', icon: '🏰',
    desc: 'Upgrade HDV en Citadelle : 3× HP et tire automatiquement sur les ennemis proches.',
    cost: 200, requires: ['war_academy'],
    unlocks: { passives: ['citadel_hdv'] },
    pos: pos('science', 6, 0),
  },
  renaissance: {
    id: 'renaissance', axis: 'science', tier: 6, name: 'Renaissance', icon: '🌟',
    desc: 'END NODE. Débloque la Garde d\'Élite + omniscience minimap : tu vois en permanence TOUS les mouvements ennemis (HDV, villages, unités, bâtiments) sur la mini-carte, même dans le fog of war.',
    cost: 250, requires: ['printing', 'citadel', 'gunpowder'],
    unlocks: { units: ['elite_guard'], passives: ['minimap_omniscience'] },
    pos: pos('science', 6, 1),
  },

  // ============================================================
  // ✨ MAGIE (arcane / mystique) — 15 nœuds
  // ============================================================
  elements_study: {
    id: 'elements_study', axis: 'magic', tier: 1, name: 'Étude des éléments', icon: '🔮',
    desc: 'Débloque le Sanctum (bâtiment générateur de mana).',
    cost: 10, requires: [],
    unlocks: { buildings: ['sanctum'] },
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
    desc: 'Maitrise du feu : unites magie +30% degats (passif).',
    cost: 30, requires: ['elements_study'],
    unlocks: { passives: ['magic_dmg_boost'] },
    pos: pos('magic', 2, -1),
  },
  cryomancy: {
    id: 'cryomancy', axis: 'magic', tier: 2, name: 'Cryomancie', icon: '❄️',
    desc: 'Maitrise du froid : 20% chance de ralentir la cible 2s a chaque tir magique.',
    cost: 30, requires: ['elements_study'],
    unlocks: { passives: ['magic_slow_chance'] },
    pos: pos('magic', 2, 0),
  },
  mage_tower: {
    id: 'mage_tower', axis: 'magic', tier: 2, name: 'Tour de mage', icon: '🧙',
    desc: 'Produit le Sorcier (HP 40, dégâts magiques 10, portée 200) + +1 mana/sec.',
    cost: 50, requires: ['elements_study'],
    unlocks: { units: ['wizard'], buildings: ['mage_tower'] },
    pos: pos('magic', 2, 1),
  },

  lightning: {
    id: 'lightning', axis: 'magic', tier: 3, name: 'Foudre', icon: '⚡',
    desc: 'Eclair : unites magie +25% vitesse + vision +30%.',
    cost: 60, requires: ['pyromancy'],
    unlocks: { passives: ['magic_speed_vision'] },
    pos: pos('magic', 3, -1.2),
  },
  teleportation: {
    id: 'teleportation', axis: 'magic', tier: 3, name: 'Téléportation', icon: '🌀',
    desc: 'Mobilite magique : toutes tes unites +15% vitesse de deplacement.',
    cost: 60, requires: ['cryomancy'],
    unlocks: { passives: ['all_speed_boost'] },
    pos: pos('magic', 3, 0),
  },
  enchantment: {
    id: 'enchantment', axis: 'magic', tier: 3, name: 'Enchantement', icon: '✨',
    desc: 'Enchantement : generation de mana de tes batiments x1.5.',
    cost: 50, requires: ['mage_tower'],
    unlocks: { passives: ['mana_gen_boost'] },
    pos: pos('magic', 3, 1.2),
  },

  necromancy: {
    id: 'necromancy', axis: 'magic', tier: 4, name: 'Nécromancie', icon: '💀',
    desc: 'Débloque le Nécromancien : ressuscite un Squelette à chaque kill ennemi proche.',
    cost: 100, requires: ['mage_tower', 'lightning'],
    unlocks: { units: ['necromancer'] },
    pos: pos('magic', 4, -1.2),
  },
  illusion: {
    id: 'illusion', axis: 'magic', tier: 4, name: 'Illusion', icon: '👤',
    desc: 'Illusion : tes unites magiques +15% HP max.',
    cost: 80, requires: ['teleportation'],
    unlocks: { passives: ['magic_hp_boost'] },
    pos: pos('magic', 4, 0),
  },
  curses: {
    id: 'curses', axis: 'magic', tier: 4, name: 'Malédictions', icon: '🧪',
    desc: 'Maledictions : ennemis a <150px de tes mages subissent -15% degats.',
    cost: 80, requires: ['enchantment'],
    unlocks: { passives: ['magic_curse_aura'] },
    pos: pos('magic', 4, 1.2),
  },

  elemental_summon: {
    id: 'elemental_summon', axis: 'magic', tier: 5, name: 'Convocation élémentaire', icon: '🌋',
    desc: 'Debloque la production d Elementaires de feu (250 HP, AoE 40, 60s).',
    cost: 150, requires: ['lightning', 'pyromancy'],
    unlocks: { units: ['fire_elemental'] },
    pos: pos('magic', 5, -1),
  },
  lich: {
    id: 'lich', axis: 'magic', tier: 5, name: 'Liche', icon: '☠️',
    desc: 'Upgrade le Nécromancien en Liche (HP 120, dmg 15, ressuscite des Chevaliers squelettes).',
    cost: 180, requires: ['necromancy'],
    unlocks: { units: ['lich'], passives: ['necro_upgrade'] },
    pos: pos('magic', 5, 0),
  },
  time_mastery: {
    id: 'time_mastery', axis: 'magic', tier: 5, name: 'Maîtrise du temps', icon: '⏳',
    desc: 'Maitrise du temps : cooldown d attaque de tes unites magie -20%.',
    cost: 180, requires: ['illusion', 'curses'],
    unlocks: { passives: ['magic_atk_speed'] },
    pos: pos('magic', 5, 1),
  },

  arcane_avatar: {
    id: 'arcane_avatar', axis: 'magic', tier: 6, name: 'Avatar des Arcanes', icon: '🐉',
    desc: 'Debloque la production du Dragon arcanique (800 HP, vol, 60s par invoc).',
    cost: 250, requires: ['elemental_summon', 'lich'],
    unlocks: { units: ['arcane_dragon'] },
    pos: pos('magic', 6, 0),
  },

  // ============================================================
  // ⛪ RELIGION (foi / divin) — 15 nœuds
  // ============================================================
  animism: {
    id: 'animism', axis: 'religion', tier: 1, name: 'Animisme', icon: '🕯',
    desc: 'Débloque l\'Autel (bâtiment générateur de foi).',
    cost: 10, requires: [],
    unlocks: { buildings: ['altar'] },
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
    desc: 'Upgrade l\'Autel. 3× foi générée. Débloque les Faveurs divines.',
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
    desc: 'Benediction : toutes tes unites +10% HP max + 0.5 HP/s regen passive.',
    cost: 60, requires: ['temple'],
    unlocks: { passives: ['all_hp_regen'] },
    pos: pos('religion', 3, -1.2),
  },
  purifying_light: {
    id: 'purifying_light', axis: 'religion', tier: 3, name: 'Lumière purificatrice', icon: '🌟',
    desc: 'Lumiere purificatrice : Inquisiteur degats vs magie/undead x3 (au lieu de x2).',
    cost: 60, requires: ['inquisition'],
    unlocks: { passives: ['inquisitor_buff'] },
    pos: pos('religion', 3, 0),
  },
  sacred_order: {
    id: 'sacred_order', axis: 'religion', tier: 3, name: 'Ordre sacré', icon: '🛡',
    desc: 'Débloque le Chevalier Sacré (HP 130, dmg 14, +5 HP/sec auto-regen).',
    cost: 80, requires: ['temple'],
    unlocks: { units: ['holy_knight'] },
    pos: pos('religion', 3, 1.2),
  },

  cathedral: {
    id: 'cathedral', axis: 'religion', tier: 4, name: 'Cathédrale', icon: '⛪',
    desc: 'Upgrade le Temple. Foi doublée. Permet d\'avoir 2 faveurs actives en même temps.',
    cost: 120, requires: ['sacred_order', 'blessing'],
    unlocks: { buildings: ['cathedral'] },
    pos: pos('religion', 4, -1.2),
  },
  crusade: {
    id: 'crusade', axis: 'religion', tier: 4, name: 'Croisade', icon: '⚔️',
    desc: 'Croisade : +25% degats de toutes tes unites contre HDV et batiments.',
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
    desc: 'Debloque la production de l Ange (300 HP, vol, aura soin allies).',
    cost: 180, requires: ['cathedral'],
    unlocks: { units: ['angel'] },
    pos: pos('religion', 5, -1),
  },
  excommunication: {
    id: 'excommunication', axis: 'religion', tier: 5, name: 'Excommunication', icon: '🚫',
    desc: 'Excommunication : ennemis à <150px d une unité Religion -20% dégâts.',
    cost: 150, requires: ['purifying_light', 'inquisition'],
    unlocks: { passives: ['religion_curse_aura'] },
    pos: pos('religion', 5, 0),
  },
  unwavering_faith: {
    id: 'unwavering_faith', axis: 'religion', tier: 5, name: 'Foi inébranlable', icon: '🛡',
    desc: 'Toutes tes unités ignorent 25% des dégâts magiques.',
    cost: 150, requires: ['crusade', 'martyrs'],
    unlocks: { passives: ['magic_resist_25'] },
    pos: pos('religion', 5, 1),
  },

  divine_invocation: {
    id: 'divine_invocation', axis: 'religion', tier: 6, name: 'Invocation divine', icon: '👁',
    desc: 'Debloque la production de l Avatar divin (1500 HP, peur, AoE 60).',
    cost: 280, requires: ['guardian_angel', 'unwavering_faith'],
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
