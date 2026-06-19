# 🌳 Retravail de l'arbre tech — Tracker

> Chantier : revoir **chaque tech une par une** (vérifier que l'effet décrit est codé + ajuster effet/équilibrage). 
> **Ordre** : Science T1→T6, puis Magie, puis Religion. **Une seule tech à la fois.** 
> Une tech n'est cochée ✅ QUE lorsque **Robin a testé en jeu et dit « OK suivante »**. 
> Branche : `developpement` (chaque tech validée part en prod). Le protocole détaillé est dans CLAUDE.md.

Statut : ⬜ à faire · 🔄 en cours · ✅ validé par Robin


## 🔬 SCIENCE


### Tier 1

- ⬜ **`agriculture`** — Agriculture (10 PR)
    - Effet déclaré : +1 gold/sec passif sur ton HDV.
    - Débloque : passifs: gold_bonus_1
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`construction`** — Construction (10 PR)
    - Effet déclaré : +25 % de PV sur TOUS tes bâtiments. Ouvre les Voies et la Balistique.
    - Débloque : passifs: building_hp_boost
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐

### Tier 2

- ⬜ **`archery`** — Tir à l'arc (30 PR)
    - Effet déclaré : Débloque l'Archer (portée 250) + tes Archers gagnent +10 % de portée.
    - Débloque : unités: archer · passifs: archer_range
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`riding`** — Équitation (30 PR)
    - Effet déclaré : Débloque le Chevalier (HP 80, dégâts 8) + Chevaliers +10 % de vitesse.
    - Débloque : unités: knight · passifs: cavalry_speed
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`roads`** — Voies (20 PR)
    - Effet déclaré : Réseau routier : +12 % vitesse de déplacement pour toutes tes unités.
    - Débloque : passifs: road_speed
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`ballistics`** — Balistique (40 PR)
    - Effet déclaré : +25 % cadence de tir (archer, arbalétrier, catapulte, canon, tour, bombarde).
    - Débloque : passifs: rate_of_fire
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐

### Tier 3

- ⬜ **`military_architecture`** — Architecture militaire (50 PR)
    - Effet déclaré : Débloque la Tour d'Archer + tes tours gagnent +15 % de portée.
    - Débloque : bât: tower · passifs: tower_range
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`siege_engineering`** — Ingénierie de siège (60 PR)
    - Effet déclaré : Débloque la Catapulte + tes engins de siège infligent +25 % de dégâts aux bâtiments.
    - Débloque : unités: catapult · passifs: siege_vs_buildings
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`colonization`** — Logistique (60 PR)
    - Effet déclaré : Débloque le Colon (fonde un village) + +0,5 gold/sec par village que tu possèdes.
    - Débloque : unités: settler · passifs: village_gold
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`reconnaissance`** — Reconnaissance (40 PR)
    - Effet déclaré : +30 % vision sur toutes tes unités et +15 % de portée pour les unités à distance.
    - Débloque : passifs: recon_vision_range
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐

### Tier 4

- ⬜ **`diplomacy`** — Diplomatie (70 PR)
    - Effet déclaré : Permet de proposer des pactes de non-agression aux autres joueurs.
    - Débloque : passifs: diplomacy
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`steel_forge`** — Forge d'acier (80 PR)
    - Effet déclaré : Débloque le Chevalier lourd (HP 150) + tes unités de mêlée gagnent +10 % de PV.
    - Débloque : unités: heavy_knight · passifs: melee_hp
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`crossbows`** — Arbalètes (70 PR)
    - Effet déclaré : Débloque l'Arbalétrier + améliore les Archers (+ dégâts, -10 % portée).
    - Débloque : unités: crossbowman · passifs: archer_buff
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐

### Tier 5

- ⬜ **`empire`** — Empire (110 PR)
    - Effet déclaré : +50 % de génération de gold sur HDV et villages.
    - Débloque : passifs: gold_x150
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`war_academy`** — Académie de guerre (120 PR)
    - Effet déclaré : Débloque le Général (HP 160, dégâts 16) : aura +25 % dégâts aux unités proches.
    - Débloque : unités: general
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`gunpowder`** — Poudre noire (140 PR)
    - Effet déclaré : Débloque le Canon (mobile) et la Bombarde (défensive).
    - Débloque : unités: cannon · bât: bombard_tower
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐

### Tier 6

- ⬜ **`printing`** — Imprimerie (170 PR)
    - Effet déclaré : ×1,5 de génération de PR (boost de recherche).
    - Débloque : passifs: pr_x150
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`citadel`** — Citadelle (190 PR)
    - Effet déclaré : Upgrade HDV en Citadelle : ×1,8 PV et tir automatique sur les ennemis proches.
    - Débloque : passifs: citadel_hdv
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`renaissance`** — Renaissance (240 PR)
    - Effet déclaré : END NODE. Débloque la Garde d'Élite + RADAR : un balayage révèle tous les ennemis sur la mini-carte 3 s toutes les 30 s.
    - Débloque : unités: elite_guard · passifs: minimap_radar
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐

## ✨ MAGIE


### Tier 1

- ⬜ **`elements_study`** — Étude des éléments (10 PR)
    - Effet déclaré : Débloque le Sanctum (générateur de mana) + +0,3 mana/sec de base.
    - Débloque : bât: sanctum · passifs: base_mana
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`stargazing`** — Lecture des étoiles (10 PR)
    - Effet déclaré : +0.3 PR/sec passif.
    - Débloque : passifs: pr_bonus_03
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐

### Tier 2

- ⬜ **`pyromancy`** — Pyromancie (30 PR)
    - Effet déclaré : Unités magie +45 % dégâts + chaque tir magique inflige une mini-AoE de 30 px (×0.5 dmg périphérie).
    - Débloque : passifs: magic_dmg_boost, magic_splash
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`cryomancy`** — Cryomancie (30 PR)
    - Effet déclaré : Maîtrise du froid : 20 % de chance de ralentir la cible 2 s à chaque tir magique.
    - Débloque : passifs: magic_slow_chance
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`mage_tower`** — Tour de mage (50 PR)
    - Effet déclaré : Débloque le Nécromancien (HP 70, dmg 14, 20 mana) — sa victime ressuscite en allié. Construit aussi la Tour de mage (+1 mana/sec).
    - Débloque : unités: necromancer · bât: mage_tower
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐

### Tier 3

- ⬜ **`lightning`** — Foudre (60 PR)
    - Effet déclaré : Éclair : unités magie +25 % vitesse + vision +30 %.
    - Débloque : passifs: magic_speed_vision
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`teleportation`** — Téléportation (60 PR)
    - Effet déclaré : Mobilité magique : toutes tes unités +15 % vitesse de déplacement.
    - Débloque : passifs: all_speed_boost
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`enchantment`** — Enchantement (50 PR)
    - Effet déclaré : Enchantement : génération de mana de tes bâtiments ×1.5.
    - Débloque : passifs: mana_gen_boost
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐

### Tier 4

- ⬜ **`necromancy`** — Nécromancie (100 PR)
    - Effet déclaré : Renforce le revive : cap d'undeads actifs +3 et squelettes invoqués avec +20 % HP/dmg.
    - Débloque : passifs: necro_revive_buff
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`illusion`** — Illusion (80 PR)
    - Effet déclaré : Illusion : tes unités magiques +15 % HP max.
    - Débloque : passifs: magic_hp_boost
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`arcane_ricochet`** — Ricochet arcanique (80 PR)
    - Effet déclaré : Les tirs de tes mages rebondissent 1× sur l'ennemi le plus proche (<120 px, dégâts ×0.6).
    - Débloque : passifs: arcane_ricochet
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐

### Tier 5

- ⬜ **`elemental_summon`** — Convocation élémentaire (150 PR)
    - Effet déclaré : Débloque l'Élémentaire de feu (250 HP, AoE 40) + tes invocations durent +20 %.
    - Débloque : unités: fire_elemental · passifs: summon_duration
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`lich`** — Liche (170 PR)
    - Effet déclaré : À chaque kill du Nécromancien, la victime ressuscite en CLONE allié (-40 % HP/dmg, 30 s) au lieu d'un squelette.
    - Débloque : passifs: lich_clone_revive
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`time_mastery`** — Maîtrise du temps (170 PR)
    - Effet déclaré : Cooldown d'attaque de tes unités magie -12 %.
    - Débloque : passifs: magic_atk_speed
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐

### Tier 6

- ⬜ **`arcane_avatar`** — Avatar des Arcanes (270 PR)
    - Effet déclaré : Débloque le Dragon arcanique (800 HP, vol, 60 s par invocation).
    - Débloque : unités: arcane_dragon
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐

## ⛪ RELIGION


### Tier 1

- ⬜ **`animism`** — Animisme (10 PR)
    - Effet déclaré : Débloque l'Autel (générateur de foi) + +0,3 foi/sec de base.
    - Débloque : bât: altar · passifs: base_faith
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`prayer`** — Prière (10 PR)
    - Effet déclaré : +1 HP/sec passif sur toutes tes unités à moins de 200 d'un HDV.
    - Débloque : passifs: hdv_heal_aura
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐

### Tier 2

- ⬜ **`temple`** — Temple (40 PR)
    - Effet déclaré : Upgrade l'Autel : +1.5 foi/sec. Source de foi principale.
    - Débloque : bât: temple
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`pilgrimage`** — Pèlerinage (30 PR)
    - Effet déclaré : Débloque le Pèlerin : ne combat pas mais +0.5 foi/sec à son propriétaire.
    - Débloque : unités: pilgrim
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`inquisition`** — Inquisition (40 PR)
    - Effet déclaré : Débloque l'Inquisiteur : double dégâts vs unités magiques et undead.
    - Débloque : unités: inquisitor
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐

### Tier 3

- ⬜ **`blessing`** — Bénédiction (60 PR)
    - Effet déclaré : Bénédiction : toutes tes unités +10 % HP max + 0.5 HP/s de regen passive.
    - Débloque : passifs: all_hp_regen
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`purifying_light`** — Lumière purificatrice (60 PR)
    - Effet déclaré : Lumière purificatrice : dégâts de l'Inquisiteur vs magie/undead ×3 (au lieu de ×2).
    - Débloque : passifs: inquisitor_buff
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`sacred_order`** — Ordre sacré (80 PR)
    - Effet déclaré : Débloque le Chevalier Sacré (+5 HP/s) + tes unités saintes gagnent +10 % de PV.
    - Débloque : unités: holy_knight · passifs: holy_hp
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐

### Tier 4

- ⬜ **`cathedral`** — Cathédrale (110 PR)
    - Effet déclaré : Upgrade le Temple : +3 foi/sec. Le moteur de foi de fin de partie.
    - Débloque : bât: cathedral
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`crusade`** — Croisade (100 PR)
    - Effet déclaré : Croisade : +25 % dégâts de toutes tes unités contre HDV et bâtiments.
    - Débloque : passifs: anti_building_dmg
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`martyrs`** — Martyrs (80 PR)
    - Effet déclaré : Quand un Pèlerin meurt, il explose en heal AoE (+200 HP aux alliés).
    - Débloque : passifs: martyr_explosion
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐

### Tier 5

- ⬜ **`guardian_angel`** — Ange Gardien (170 PR)
    - Effet déclaré : Débloque l'Ange (300 HP, vol, aura de soin aux alliés).
    - Débloque : unités: angel
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`excommunication`** — Excommunication (150 PR)
    - Effet déclaré : Excommunication : ennemis à <150 px d'une unité Religion -20 % dégâts.
    - Débloque : passifs: religion_curse_aura
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
- ⬜ **`unwavering_faith`** — Foi inébranlable (150 PR)
    - Effet déclaré : Toutes tes unités ignorent 25 % des dégâts magiques.
    - Débloque : passifs: magic_resist_25
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐

### Tier 6

- ⬜ **`divine_invocation`** — Invocation divine (270 PR)
    - Effet déclaré : Débloque l'Avatar divin (900 HP, dmg 45, aura de peur, AoE 60).
    - Débloque : unités: god_avatar
    - État implémentation : _(à auditer)_
    - Décision design / équilibrage : _(à remplir)_
    - Validé en jeu par Robin : ☐
