# CLAUDE.md — Contexte projet pour Claude Code

> **Lis ce fichier en entier avant toute modification.** Il contient tout ce
> qu'il faut savoir pour être immédiatement productif sur ce projet.
> **Communique avec l'utilisateur (Robin) en FRANÇAIS.**

---

## 🎮 TL;DR

RTS multijoueur temps réel `.io` (max 4 joueurs), inspiré de Polytopia, en
direction artistique **« obsidienne néon »** depuis la refonte visuelle de
mai 2026. Phaser 3 (CDN) côté client, Node + Express + Socket.io côté
serveur, déployé sur Render.

- **URL prod** : https://mon-jeu-io-17dn.onrender.com
- **Repo** : `Youmix8/mon-jeu-io` — auto-deploy depuis `main` via
  `render.yaml` (~3 min).
- **Dernier commit (session "tech-refonte-magie-bot-rebrand")** : `108461e`.

---

## ⚙️ Stack

| Couche | Tech | Fichier(s) clés |
|---|---|---|
| Backend | Node 20 + Express + Socket.io 4 | `server.js` (~3000 l., monolithique) + `server/techTree.js` (49 nœuds) |
| Frontend rendu | Phaser 3.90 (CDN) | `public/js/scenes/MainScene.js` (~1750 l.) |
| Frontend modules | JS vanilla (pas de bundler) | `public/js/*.js` chargés via `<script>` dans `public/index.html` |
| Config DA | Tokens & glyphes | `public/js/config/theme.js` + `public/js/config/neonGlyphs.js` |
| Déploiement | Render.com Blueprint | `render.yaml` |

**Pas de build step.** Les fichiers JS sont servis tels quels par Express via
`app.use(express.static('public'))`.

---

## 🚀 Commandes essentielles

```bash
npm install          # premier setup
npm start            # lance le serveur sur :3000 (ou $PORT)
```

**Déploiement** : `git push origin HEAD:main` → Render redéploie en ~3 min.

**Tester localement** : `http://localhost:3000` (plusieurs onglets = plusieurs
joueurs). Le lobby permet de choisir uniquement la TAILLE de carte (l'eau a
été retirée du jeu).

---

## 🗂️ Architecture des fichiers

### Backend (`server.js`, monolithique)

Sections principales :
1. Constantes (`MAP_SIZES`, `UNIT_TYPES`, `BUILDING_TYPES`, `SPELLS`,
   `HDV_LEVELS`, `VILLAGE_LEVELS`)
2. Helpers neutres PvE (`isNeutralOwner`, `sameSide`, `areAllied`, `friendly`)
3. **Helpers eau stubés** (`generateWaterTiles`, `isWaterAt`, etc. — tous
   no-op depuis la suppression du système naval)
4. Génération spawns + villages
5. Bot IA (`botTick`) — diversifié par spécialité (science/magic/religion)
6. Handlers Socket.io
7. Game loop (20 Hz) : behavior IA → mouvement → combat → behaviors spéciaux
   → résurrection (necro/lich) → ressources passives → broadcast filtré fog

### Frontend (`public/js/`)

| Fichier | Rôle |
|---|---|
| `scenes/MainScene.js` | Scène Phaser : rendu unités/bâtiments/HDV/villages **en formes géométriques néon**, fog, inputs, beams projectiles, particules ADD |
| `network.js` | Wrapper Socket.io client + callbacks events serveur |
| `config/theme.js` | **Source unique** de palette néon (FCOL équipes, AXC axes, UNIT_SHAPES, GLOW params, BEAM colors, slot mapping joueur) |
| `config/neonGlyphs.js` | Mapping centralisé emoji médiéval → glyphe néon Unicode (49 techs + ressources + unités + bâtiments) |
| `config/entitiesConfig.js` | `ENTITIES_CONFIG` — métadonnées historiques des entités, encore utilisé par debug-panel |
| `utils/animations.js` | Helpers tweens hérités (animateUnitMove/Attack/Death/Spawn, animateSpellCast) — utilisé par sorts |
| `sprite-factory.js` | **Texture procédurale néon** : 8 shapes blanches tintables (tri/diamond/chevron/square/hex/star/ring/boss) + sf-base-hex + sf-projectile + sf-particle + sf-selection cyan |
| `hdv-panel.js` | Panel HDV : production unités + tech tree access + upgrade |
| `village-panel.js` | Panel village (2 niveaux : Lv1 soldat seul, Lv2 toutes unités déblo.) |
| `building-info-panel.js` | Panel au clic d'un bâtiment : HP, portée, effets, bouton vendre (50 % remboursé) |
| `tech-tree-overlay.js` | Overlay SVG plein écran (touche T). Axes recolorés cyan/violet/or. Glyphes via `NeonGlyphs.tech()`. |
| `tech-indicators.js` | Badges emoji au-dessus du HDV (légende live des techs débloquées) |
| `build-mode.js` | Mode placement bâtiment ghost sprite + grille cyan |
| `radial-menu.js` | Menu radial maintien clic droit (palette néon : Attaquer rose-rouge / Déplacer cyan / Défendre or) |
| `debug-panel.js` | Panel debug (touche `` ` ``) — spawn gratuit + tuning (gaté en prod via NODE_ENV) |
| `minimap.js` | Mini-carte bottom-left — fond obsidienne, fog 0.55/0.96, carrés HDV 6×6, viewport cyan, losanges rouges clignotants pour camps PvE |
| `game.js` | Bootstrap Phaser (bg `#070d11`) + handler lobby (taille uniquement) |

---

## 🎯 Systèmes gameplay clés

### Ressources joueur (4)
- **Gold** : HDV + villages possédés. Boost `agriculture` (+1/s), `empire` (×1.5).
- **PR (Research Points)** : HDV (0.5/s base). Boost `stargazing` (+0.3/s), `printing` (×2).
- **Mana** : Sanctum (+0.5/s), Mage Tower (+1/s). Cap 200.
- **Foi** : Altar (+0.5/s), Temple (+1.5/s), Cathedral (+3/s), Pèlerin (+0.5/s). Cap 200.

### Population
- Base 8, +3 par niveau HDV, +2 par village capturé, +1 par level village.
- `populationCost` par unité ; `spawnUnit` refuse si pop plein.

### Combat (20 Hz)
- Modes : `defend` (scan zone) / `move` (vers `targetX/Y`) / `attack` (vers `attackTargetId`).
- **Riposte auto** : unité touchée prend son attaquant comme cible si libre.
- **AoE** : fire_elemental (40), god_avatar (60). Tag `_aoeAroundTarget` traité section 3.6.
- **Aura général** : +25 % dmg aux alliés <200 d'un Général.
- **Aura peur god_avatar** : ennemis <400 → speed ×0.5 (`fearedUntil`).
- **`effectiveRange(unit)`** : +15 % portée si tech `reconnaissance` et type ∈ {archer, crossbowman, catapult, cannon}.
- **`effectiveCooldown(ownerId, type, base)`** : ×0.8 si tech `ballistics` et type ∈ unités tireuses ou tours (cadence +25 %).

### Tech tree (49 nœuds, 3 axes)

`server/techTree.js`. Validation au boot via `validateTechTree()`. Coût total ~4320 PR.

| Axe | Nœuds | Style |
|---|---|---|
| Science | 19 | Économie + militaire conventionnel (9 unités, 4 bâtiments) |
| Magie | 15 | **1 seul mage = Nécromancien** + 2 boss (fire_elemental, arcane_dragon) + invocations |
| Religion | 15 | Soin/auras (5 unités saintes + buffs défensifs) |

**Système eau retiré** (commit `bd7576a`) :
- Helpers `isWaterAt`/`isWaterTile`/`hasWaterNeighbor`/`pathHasWaterCount` no-op.
- `applyMapConfig` force toujours `currentMapType = 'no_water'`.
- Plus de `port`, `boat`, `embarkBoat`, `disembarkBoat`, `ensureCoastalVillages`, bot naval.
- `waterTiles` reste un Uint8Array vide dans le payload init (compat client).

### Axe Magie (refonte session magic-bot-rebrand)
- **Une seule unité magique de base = Nécromancien** (HP 70, dmg 14, range 200,
  coût 60 gold + 30 mana, débloqué par `mage_tower` T2).
- Wizard + Lich (unit) **retirés**.
- **Tech `mage_tower`** (T2) : débloque nécromancien + bâtiment Mage Tower (+1 mana/s).
- **Tech `necromancy`** (T4) : passif `necro_revive_buff` (squelettes +20 %
  HP/dmg, cap d'undeads actifs 9 → 12).
- **Tech `lich`** (T5) : passif `lich_clone_revive` — chaque kill du Nécro
  ressuscite la victime en **CLONE allié -40 % HP/-40 % dmg pendant 30 s**
  (au lieu d'un simple squelette).
- **Tech `pyromancy`** (T2 magie) : +45 % dmg magique + passif `magic_splash`
  (mini-AoE 30 px à chaque tir magique, ×0.5 dmg périphérie).
- **Tech `arcane_ricochet`** (T4) : tirs mages rebondissent 1× sur ennemi
  <120 px de la cible (×0.6 dmg).
- `MAGIC_UNDEAD = {necromancer, skeleton, skeleton_knight, fire_elemental, arcane_dragon}`.

### Axes Science / Religion (récap rapide)
- Science : agriculture, construction, archery, riding, roads, **ballistics**
  (T2 — cadence +25 %), military_architecture, siege_engineering, colonization,
  **reconnaissance** (T3 — vision +30 % / portée +15 % distance), diplomacy,
  steel_forge, crossbows, empire, war_academy, gunpowder, printing, citadel,
  renaissance (omniscience minimap).
- Religion : animism, prayer, temple, pilgrimage, inquisition, blessing,
  purifying_light, sacred_order, cathedral, crusade, martyrs, guardian_angel,
  excommunication, unwavering_faith, divine_invocation.

### IA bot (`botTick`)

Chaque bot reçoit une **spécialité aléatoire** au spawn (`pickBotSpecialty()`) :
- `science` : route `BOT_TECH_PRIORITY_SCIENCE`, unités préférées elite_guard → cannon → heavy_knight → ...
- `magic` : route `BOT_TECH_PRIORITY_MAGIC`, unités arcane_dragon → fire_elemental → necromancer → ...
- `religion` : route `BOT_TECH_PRIORITY_RELIGION`, unités god_avatar → angel → holy_knight → ...

Après épuisement de sa route primaire, le bot enchaîne sur les autres axes
(snowball late-game). Logué `Bot Atlas added — slot 1 — spécialité magic`.

Boucle (~1.5 s) :
1. Recherche tech selon spécialité
2. Upgrade HDV (gold ≥ cost + 100)
3. Construction tour (max 2 autour HDV)
4. Spawn unité selon `BOT_UNITS_BY_SPECIALTY[specialty]`
5. Capture village neutre (army ≥ 4)
6. **Wave coordonnée** (army ≥ 10) → `attackTargetId = HDV` (fix passivité de
   l'ancienne wave qui posait juste un `targetX/Y`)

### Direction artistique « obsidienne néon »

**Fond** `#070d11`, **terrain** `#0a1a1f`, **grille** cyan alpha 0.12.

**4 couleurs équipe** (slot 0 = joueur local toujours cyan) :
- Slot 0 : `#22d3ee` cyan
- Slot 1 : `#fb7185` rose-rouge
- Slot 2 : `#c084fc` violet
- Slot 3 : `#a3e635` lime

**3 couleurs d'axe d'unité** (pastille interne) :
- sci : `#cbd5e1` blanc
- mag : `#a78bfa` violet
- rel : `#fcd34d` or

**Encodage** : **équipe = tint + glow**, **rôle = forme géométrique**, **axe = pastille interne**.

**Formes** par type (sprite-factory) :
- soldat = `tri` sz 9 · archer = `diamond` sz 8 · chevalier = `chevron` sz 10
- catapulte = `square` sz 11 · heavy_knight/general/elite_guard = `hex`
- nécromancien = `star` sz 9 · skeleton = `tri` sz 8
- fire_elemental = `boss` sz 14 · arcane_dragon = `boss` sz 20
- pèlerin/inquisiteur/holy_knight/paladin = `ring`
- ange = `boss` sz 15 · god_avatar = `boss` sz 22

**Projectiles différenciés** :
- archer/crossbow/catapult/cannon → **mini-sprite volant** `sf-projectile`
  (point lumineux 4×4 avec trail particle, 280 ms)
- sorcier/nécro = beam **laser violet** `#a78bfa` instantané (120 ms fade)
- inquisiteur/ange/avatar = beam **laser or** `#fcd34d`
- tour de joueur = beam couleur d'équipe

**Pop / squash / shake / pulse glow** :
- Pop apparition unité : scale 0→1 en 180 ms `Back.easeOut`
- Squash mort : scale → 0 + alpha → 0 en 200 ms avant burst particules
- Camera shake boss tué : 180 ms 0.004
- Camera shake HDV propre touché : 120 ms 0.0025
- Pulse glow boss : `outerStrength` oscille 0.85↔1.15 sur 1.4 s sine yoyo

**Rebrand emojis** : `neonGlyphs.js` substitue 100 % des emojis médiévaux
par des symboles Unicode néon (◆ ◈ ▤ ✦ ✚ ⌬ ⊕ ⌂ ▰ ◎ ⌨ ⚙) avec classes
CSS `.g-*` qui appliquent un text-shadow currentColor (glow néon).

---

## 🌍 Système PvE (intact post-refonte néon)

Factions neutres dans `gameState.units` via `ownerId` spécial :
- `neutral_barbarian` (couleur `#ef4444` rouge sang en néon)
- `neutral_fauna` (boar/wolf, couleurs propres `#a16207` / `#64748b`)
- `neutral_boss` (couleur `#dc2626` rouge saturé, forme boss + glow renforcé)

Helpers : `sameSide(a,b)` (neutres alliés entre eux), `areAllied(a,b)` (pacte
diplomatique), `friendly(a,b)` = l'union.

- **A — Villages barbares (raids)** : villages neutres > 5 min → 2 barbares/60 s
  vers le joueur proche, cap 6 actifs. +8 gold/barbare killed.
- **B — Camps de bandits** : 2 camps par partie (5 mobs + 1 boss elite_guard
  HP 320). Toujours visibles sur la minimap (losange rouge clignotant).
  Clear → +150 gold + 1 unité gratuite.
- **D — Faune** : 10 paquets boar/wolf, mode `wander`, riposte si attaquée.
  +5 gold/animal killed.

`gameState.camps` broadcasté en version light. Reset : `spawnAllCampMobs()` +
`spawnAllFauna()` après chaque init/resetMatch/zombie-recovery/no-humans/config-map.

---

## 💬 Style de communication avec Robin

- **FR uniquement.**
- Tableaux > paragraphes.
- Critique de son propre code apprécié.
- Plusieurs bugs/améliorations par message → traite-les TOUS.
- Propose des options pros/cons avant de coder.
- Veut du code AAA propre, jouable, addictif.
- Teste en condition réelle entre 2 sessions et revient avec des retours.

### Pattern de session typique
1. Robin liste 3-5 demandes
2. Tu **audites** (lis le code concerné, identifies la vraie cause)
3. Tu **fixes toutes** les choses listées (pas 1 par 1)
4. Tu commit en français avec messages structurés (`feat(scope):` / `fix(scope):` / `chore(scope):`)
5. Tu pushes sur main (auto-deploy Render)
6. Tu résumes ce qui est fait + ce qui reste (audit critique de toi-même)

### Utilise `AskUserQuestion`
Pour les choix créatifs ambigus. Ne décide pas tout seul sur le gameplay
ou l'esthétique.

---

## 🚨 NE PAS FAIRE

- **Pas de remplacement de Phaser** par un autre engine.
- **Pas de modification `git config`** ni de hooks.
- **Pas de commit de secrets.**
- **Pas de spam de commits** : groupe les fixes liés.
- **Pas d'oubli du push** sur `main` après commit local.
- **Pas de modification des PNG existants** dans `public/assets/` (héritage,
  plus utilisés par le render néon, mais conservés pour info).
- **Pas de création de README/docs** sauf demande explicite.
- **Pas de réactivation de l'eau** sans demande explicite (système supprimé).

---

## ⚠️ Pièges techniques connus

- `MAP_WIDTH/HEIGHT/GRID_W/GRID_H` sont `let`, recalculés dans `applyMapConfig()`.
  Attention si capturés dans une closure.
- `nowMs` est déclaré au TOUT DÉBUT du `setInterval` du game loop. Si tu ajoutes
  du code AVANT et utilises `nowMs`, TDZ → crash.
- Le serveur émet `attacks` event **non filtré** par fog. Le client gère le cas
  où attaquant ou cible n'est pas dans `state.units` (fallback sur
  `attackerX/Y` / `targetX/Y` inclus dans le payload).
- `TechTreeOverlay` : le keydown listener T est attaché au load top-level,
  PAS dans `ensureDOM()`. Si tu le déplaces → cycle vicieux.
- **postFX cassé dans ce build Phaser** : utiliser `preFX.addGlow` à la place.
  `sprite.preFX.setPadding(8)` puis `preFX.addGlow(color, outer, inner, false, quality)`.
- **Piège `_baseScaleX/_baseScaleY`** : JAMAIS lire `sprite.scaleX/Y` pour
  modifier le scale (le wobble idle pollue ces valeurs). Toujours utiliser
  les `_baseScaleX/_baseScaleY` mémorisés après `setDisplaySize`.
- **`effectiveRange()` shadow** : ne PAS créer une variable locale nommée
  `effectiveRange` (collision avec le helper global). Utiliser `attackReach`.
- **Couleurs joueur** : `Theme.factionColorInt(pid, unitType?)` — passer
  `unitType` pour résoudre correctement les bêtes PvE.

---

## 📝 PROCHAINE TÂCHE — Audit complet

Robin veut un **audit en profondeur** sur 3 axes, avec une nouvelle conversation
sur le modèle le plus puissant (Opus 4). Le prompt est préparé ci-dessous, à
copier-coller au début de la session.

### Brief de l'audit attendu

**1. Bugs**
- Quels comportements observables (visuel, gameplay, réseau) ne sont pas conformes
  à ce qui est documenté ici ?
- Quels passifs / techs sont déclarés mais non implémentés (recherche
  `hasTech('xxx')` vs déclaration dans `techTree.js`) ?
- Quels chemins de code sont morts (références à `boat`, `port`, `marine`,
  `cartography` qui auraient survécu au retrait du système eau) ?
- Quelles erreurs silencieuses dans le code (références à des variables qui
  n'existent plus après une refonte, etc.) ?

**2. Fonctionnalités non activées correctement**
- Diplomatie (`proposeTreaty`) — UI complète ? handler serveur ?
- Sorts actifs (`castSpell` Fireball/Freeze/Bénédiction/Lumière) — calibrage,
  visuel, son ?
- Renaissance (omniscience minimap) — implémenté ?
- Tech `roads` (chemins) — passif décoratif ou réel boost de vitesse ?
- Pacte de non-agression — UI accessible ?
- `martyrs` (Pèlerin explose en heal AoE) — vraie AoE ?
- Tutoriel intégré — manquant.
- Audio — manquant entièrement.

**3. Pistes d'amélioration**
- Game feel : hit-stop, damage numbers flottants, kill streaks.
- UX : tutoriel, tooltips, info bulles sur les unités/passifs.
- Métagame : matchmaking, classement, replay.
- Performance : nombre d'unités max, garbage collection des particles.
- Architecture : `server.js` ~3000 l. en un fichier — découpe utile ?

### Fichiers à privilégier dans l'audit

| Catégorie | Fichiers |
|---|---|
| Logique serveur | `server.js`, `server/techTree.js` |
| Render principal | `public/js/scenes/MainScene.js` |
| Config DA | `public/js/config/theme.js`, `public/js/config/neonGlyphs.js`, `public/js/config/entitiesConfig.js` |
| Tech tree client | `public/js/tech-tree-overlay.js`, `public/js/tech-indicators.js` |
| Panneaux | `public/js/hdv-panel.js`, `public/js/village-panel.js`, `public/js/building-info-panel.js` |
| Interactions | `public/js/build-mode.js`, `public/js/radial-menu.js`, `public/js/spell-cast.js`, `public/js/debug-panel.js` |
| Réseau | `public/js/network.js` |

### Méthodologie attendue

1. Lecture exhaustive (TOUT le code, pas juste les fichiers les plus
   évidents).
2. Croisement déclaration / implémentation des passifs et techs.
3. Recherche de chemins morts (eau, boat, port, marine, cartography, wizard,
   lich unit, soul_harvest legacy fields).
4. Test mental du game loop : un tick complet, une wave de bot, une
   capture de village, un kill de mage avec tech lich.
5. Rapport structuré final : tableau **Bugs** / **Features non terminées**
   / **Améliorations proposées** (avec priorité 🟥 🟧 🟩 et effort 🛠).

---

## 📦 Prompt à copier dans la nouvelle conversation Opus

```
Audite ce projet — repo `mon-jeu-io`, branche `main`.

Lis CLAUDE.md en intégralité D'ABORD : il documente toute l'architecture,
la palette néon, les conventions, les pièges techniques connus et les
sections gameplay à jour (le système eau a été retiré, l'axe magie a
été refondu, les bots sont diversifiés par spécialité, le rebrand
néon-glyphes est en place).

Puis fais un AUDIT COMPLET en TROIS volets :

### 1. BUGS
   - Comportements non conformes à la doc.
   - Passifs / techs déclarés mais non implémentés
     (croiser `unlocks.passives` dans `server/techTree.js` avec les
     occurrences `hasTech(player, 'xxx')` dans `server.js`).
   - Chemins de code morts : références résiduelles à `boat`, `port`,
     `marine`, `cartography`, `wizard`, `lich` (unit), `soul_harvest`,
     `_soulHarvest`, naval, water, embark, disembark, hasNavalAmbition.
   - Erreurs silencieuses : variables non définies après refonte
     (`softTint`, `unitSize`, `scaleMult`, `cfg.flying`, `iconOverlay`,
     `isPrimaryPlaceholder`, etc.).
   - Bugs UI : kill feed couleurs, panel HDV broken, tech tree pan/zoom.

### 2. FONCTIONNALITÉS NON ACTIVÉES OU INCOMPLÈTES
   - Diplomatie (`proposeTreaty`, `acceptTreaty`) — UI accessible ?
   - Sorts actifs (Fireball F, Freeze G, Bénédiction H, Lumière J) — calibrage,
     dégâts, visuels OK ?
   - Renaissance (omniscience minimap) — actif ?
   - `roads` (chemins) — passif décoratif ou réel boost de vitesse ?
   - `martyrs` — AoE heal effective ?
   - Tutoriel — manquant.
   - Audio — manquant entièrement.
   - Visuel ricochet / soul_harvest spawn / squelette néon — bien rendu ?
   - Wave de bot — engagement réel sur HDV après le fix `attackTargetId` ?

### 3. PISTES D'AMÉLIORATION
   - Game feel : hit-stop, damage numbers flottants, kill streaks, screen flash
     sur kill important, idle bob ±1 px.
   - UX : tutoriel intégré (3 tooltips guidés), info bulles passifs/unités,
     onboarding lobby.
   - Métagame : matchmaking, classement, replay, mode spectateur amélioré.
   - Performance : cap unités, GC particles, throttle broadcast.
   - Architecture : découpe `server.js` (~3000 l.) en modules
     (`server/combat.js`, `server/bot.js`, `server/handlers.js`,
     `server/economy.js`).
   - Équilibrage : voir si la magie reste viable après suppression de
     wizard+lich (1 seul mage = nécromancien).

### Format du rapport

Présente le rapport en 3 tableaux distincts. Chaque ligne :

| # | Sujet | Description courte | Cause / preuve | Priorité | Effort |
|---|-------|---------------------|------------------|----------|---------|

- Priorité : 🟥 critique / 🟧 important / 🟩 nice-to-have
- Effort : 🛠 (< 30 min) / 🛠🛠 (< 2 h) / 🛠🛠🛠 (demi-journée) /
  🛠🛠🛠🛠 (journée+)
- Cause / preuve : numéro de ligne + extrait minimal du code (≤ 5 l.).

Ensuite, **résume en 5 bullets max** les actions ultra-prioritaires
(🟥 + 🛠 ou 🛠🛠) que je devrais traiter dès la prochaine session.

### Contraintes

- NE fixe RIEN tant que je n'ai pas validé. Audit en lecture seule.
- Privilégie la PRÉCISION (citer les lignes, montrer les vrais snippets)
  sur le volume.
- Communique en FRANÇAIS.
- Si tu doutes d'un comportement, signale-le comme "à vérifier en jeu réel"
  plutôt que de l'inventer.
```

---

**Dernière mise à jour** : commit `108461e` (session
"tech-refonte-magie-bot-rebrand") — magie refondue (1 seul mage, lich =
clone -40 %), bots avec spécialité aléatoire + fix passivité wave,
rebrand emojis → glyphes néon. Prochain chantier : **audit Opus** —
exécuter le prompt ci-dessus dans une nouvelle conversation.

Quand tu mets à jour ce doc, change cette ligne avec le hash du dernier
commit de ta session.
