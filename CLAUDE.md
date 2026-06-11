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

- **URL prod** : https://mon-jeu-io-qzw8.onrender.com (service Render créé par
  Robin sur SON compte, branché sur la branche **`developpement`**).
  ⚠️ L'ancienne URL `mon-jeu-io-17dn` appartient à un service orphelin d'un
  compte Render introuvable — ne plus l'utiliser.
- **Repo** : `Youmix8/mon-jeu-io` — auto-deploy depuis **`developpement`** via
  `render.yaml` (~3 min).
- **Dernier commit (session "session-1-camera-lobbys")** : voir ligne « Dernière
  mise à jour » en bas de ce fichier.
- **Roadmap priorisée** (lobbys, contrôles RTS, options/accessibilité) :
  `/Users/madeinai/.claude/plans/le-jeu-qui-est-sparkling-valley.md`.

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

**Déploiement** : `git push origin HEAD:developpement` → Render redéploie en
~3 min. ⚠️ Depuis la session-1 : la **branche de déploiement est
`developpement`** (cf. `branch:` dans render.yaml). L'ancien service Render
branché sur `main` (URL `mon-jeu-io-17dn`) appartient à un compte Render
introuvable — il a été remplacé par un nouveau service Blueprint créé par
Robin sur son compte, branché sur `developpement`. Continuer à merger/pousser
`main` pour l'historique, mais c'est `developpement` qui part en prod.

**Tester localement** : `http://localhost:3000` (plusieurs onglets = plusieurs
joueurs). Le lobby permet de choisir uniquement la TAILLE de carte (l'eau a
été retirée du jeu).

---

## 🗂️ Architecture des fichiers

### Backend (`server.js`, monolithique)

⚠️ **Depuis la session-1-camera-lobbys (phase 1 lobbys)** : tout l'état mutable
d'une partie est encapsulé dans **`createGame(config)`** (factory closure,
lignes ~306 → « fin de createGame() »). Les tables `const` (UNIT_TYPES, SPELLS…)
restent au niveau module. Le corps de la factory garde l'indentation module
d'origine (refactor mécanique — relire les diffs avec `git diff -w`).
Interface : `{ tick, addPlayer, addBot, humanCount, playerCount, getMatchState }`.
En bas du fichier : le **RoomManager** (phases 2+3 faites en session-2) —
`rooms` Map (code 5 chars sans 0/O/1/I/L), `MAX_ROOMS=20`, TTL 3 h, events
`lobby:create/join/list` en acks Socket.io, `emitAll` → `io.to('room:'+code)`,
destruction des rooms vides (setImmediate + sweep 60 s), réassignation d'hôte,
scheduler unique try/catch par room, compat anciens clients (handshake
auth.name → room publique auto). `addPlayer(socket, name)` retourne
`{ok, reason}` ; `addBot` réservé à l'hôte via `config.isHost`.
Les broadcasts internes passent par **`emitAll(event, data)`** (JAMAIS
`io.emit` — fuite inter-rooms). `io.to(pid).emit('gameState')` reste direct.

Sections principales (dans la factory) :
1. Constantes module (`MAP_SIZES`, `UNIT_TYPES`, `BUILDING_TYPES`, `SPELLS`,
   `HDV_LEVELS`, `VILLAGE_LEVELS`, `SUMMONED_ONLY_TYPES`, `SPLASH_AOE_UNITS`)
2. Helpers neutres PvE (`isNeutralOwner`, `sameSide`, `areAllied`, `friendly`)
3. Helpers combat (`effectiveRange`, `effectiveCooldown`,
   `offensiveDamageMult`, `defensiveDamageMult` — multiplicateurs centralisés)
4. Génération spawns + villages (le code eau a été **entièrement purgé**
   en session volet-A — plus aucun stub `isWaterAt`/`waterTiles`)
5. Bot IA (`botTick`) — spécialité (science/magic/religion) + `BOT_BUILD_PLANS`
6. Handlers Socket.io (dans `addPlayer(socket)`, ex-corps de io.on('connection'))
7. Game loop 20 Hz (`tick()`, ex-corps du setInterval) : behavior IA → mouvement
   → combat → behaviors spéciaux → résurrection (necro/lich) → ressources
   passives → broadcast filtré fog

### Frontend (`public/js/`)

| Fichier | Rôle |
|---|---|
| `scenes/MainScene.js` | Scène Phaser : rendu unités/bâtiments/HDV/villages **en formes géométriques néon**, fog, inputs, beams projectiles, particules ADD |
| `network.js` | Wrapper Socket.io client + callbacks events serveur. `connect()` (sans auth) + `createRoom/joinRoom/listRooms` (acks lobby) |
| `lobby.js` | Écran lobby à étapes (créer/rejoindre par code/liste publique), overlay d'attente de room (code + copier lien + joueurs + bot hôte), deep link `?room=CODE`, bouton plein écran ⛶ |
| `config/theme.js` | **Source unique** de palette néon (FCOL équipes, AXC axes, UNIT_SHAPES, GLOW params, BEAM colors, slot mapping joueur) |
| `config/neonGlyphs.js` | Mapping centralisé emoji médiéval → glyphe néon Unicode (49 techs + ressources + unités + bâtiments) |
| `config/entitiesConfig.js` | `ENTITIES_CONFIG` — métadonnées historiques des entités, encore utilisé par debug-panel |
| `utils/animations.js` | Helpers tweens hérités (animateUnitMove/Attack/Death/Spawn, animateSpellCast) — utilisé par sorts |
| `sprite-factory.js` | **Texture procédurale néon** : 8 shapes blanches tintables (tri/diamond/chevron/square/hex/star/ring/boss) + sf-base-hex + sf-projectile + sf-particle + sf-selection cyan |
| `hdv-panel.js` | Panel HDV : production unités + tech tree access + upgrade |
| `village-panel.js` | Panel village (2 niveaux : Lv1 soldat seul, Lv2 toutes unités déblo.) |
| `building-info-panel.js` | Panel au clic d'un bâtiment : HP, portée, effets, bouton vendre (50 % remboursé) |
| `diplomacy-panel.js` | Panel diplomatie (bouton HUD + touche **P**) : pactes de non-agression, gaté par tech `diplomacy` |
| `spell-cast.js` | Sorts actifs (hotkeys F/G/H/J) : preview AoE, cooldown client, cast → serveur |
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
- **Fin de combat / fin de move** : une unité en mode `attack` sans cible, ou en
  `move` arrivée à destination, **se ré-ancre en `defend` SUR PLACE** (rayon 320)
  → plus de "statues" passives après une riposte ou un attack-move.
- **Non-combattants** (`damage 0` : pèlerin, colon) : skippés dans la boucle
  combat ET dans l'engagement opportuniste — ils n'attaquent jamais.
- **AoE** : `SPLASH_AOE_UNITS` = fire_elemental (rayon 40, 15 dmg),
  god_avatar (rayon 60, 20 dmg). Tag `_aoeAroundTarget` traité section 3.6.b.
- **Aura général** : +25 % dmg aux alliés <200 d'un Général.
- **Aura peur god_avatar** : ennemis <400 → speed ×0.5 (`fearedUntil`),
  épargne les alliés diplomatiques (`friendly`).
- **`effectiveRange(unit)`** : archer ×0.8 si `crossbows` ; +15 % si
  `reconnaissance` et type ∈ {archer, crossbowman, catapult, cannon}.
- **`effectiveCooldown(ownerId, type, base)`** : ×0.8 si tech `ballistics` et
  type ∈ unités tireuses ou tours (`tower`, `bombard_tower`).
- **`offensiveDamageMult` / `defensiveDamageMult`** : tous les bonus/malus
  vs unités (inquisiteur, pyromancy, pénalité siège / unwavering_faith,
  excommunication) passent par ces 2 helpers — appliqués au tir principal,
  au splash pyromancy ET au ricochet, et UNIQUEMENT une fois à portée
  (le proc cryomancy ne roll plus à 20 Hz pendant la poursuite).

### Tech tree (49 nœuds, 3 axes)

`server/techTree.js`. Validation au boot via `validateTechTree()`. Coût total ~4320 PR.

| Axe | Nœuds | Style |
|---|---|---|
| Science | 19 | Économie + militaire conventionnel (9 unités, 4 bâtiments) |
| Magie | 15 | **1 seul mage = Nécromancien** + 2 boss (fire_elemental, arcane_dragon) + invocations |
| Religion | 15 | Soin/auras (5 unités saintes + buffs défensifs) |

**Système eau retiré** (commit `bd7576a`, purge totale en session volet-A) :
- Plus AUCUN stub : `isWaterAt`/`waterTiles`/`embarkBoat`/`disembarkBoat`/
  `waypoint`/champs navals du botState ont été supprimés serveur ET client.
- `applyMapConfig` force toujours `currentMapType = 'no_water'`.
- Le payload init n'envoie plus `waterTiles`.

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
  (mini-AoE 30 px à chaque tir magique, ×0.5 dmg périphérie — les kills splash
  créditent bien gold PvE + compteur de camp via `onNeutralUnitKilled`).
- **Tech `arcane_ricochet`** (T4) : tirs mages rebondissent 1× sur ennemi
  <120 px de la cible (×0.6 dmg).
- `MAGIC_UNDEAD = {necromancer, skeleton, skeleton_knight, fire_elemental, arcane_dragon}`.
- `skeleton`/`skeleton_knight` ∈ `SUMMONED_ONLY_TYPES` : refusés par
  `unitTypeUnlocked()` → injouables via spawnUnit/villageSpawnUnit (anti-cheat).

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

**Les routes contiennent TOUS les prérequis dans l'ordre** (fix volet-A : avant,
`construction`/`roads`/`diplomacy`/`teleportation` manquaient → ballistics,
empire, renaissance, time_mastery étaient inaccessibles à vie).

Boucle (~1.5 s) :
1. Recherche tech selon spécialité
2. Upgrade HDV (gold ≥ cost + 100)
3. Construction selon `BOT_BUILD_PLANS[specialty]` — **économie d'abord**
   (magic : 2 sanctums + 2 mage_towers ; religion : 2 autels + 2 temples +
   1 cathédrale), tours défensives ensuite. C'est ce qui donne mana/foi aux
   bots — sans ça ils ne produisaient jamais leurs unités de spécialité.
4. Spawn unité selon `BOT_UNITS_BY_SPECIALTY[specialty]` (pèlerins cap à 4)
5. Capture village neutre (army ≥ 4 **combattants** — pèlerins/colons exclus)
6. **Wave coordonnée** (army ≥ 10) → `attackTargetId = HDV`. Le repli défensif
   anti-raid annule aussi `attackTargetId` (sinon le rappel était sans effet).

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
- nécromancien = `star` sz 10 · skeleton = `tri` sz 8 · skeleton_knight = `chevron` sz 9
- fire_elemental = `boss` sz 14 · arcane_dragon = `boss` sz 20
- pèlerin/inquisiteur/holy_knight = `ring`
- ange = `boss` sz 15 · god_avatar = `boss` sz 22
- (les clés mortes `wizard`/`lich`/`paladin`/`skeleton_cavalry` ont été purgées
  de theme.js en session volet-A)

**Projectiles différenciés** :
- archer/crossbow/catapult/cannon → **mini-sprite volant** `sf-projectile`
  (point lumineux 4×4 avec trail particle, 280 ms)
- nécro/élémentaire/dragon = beam **laser violet** `#a78bfa` instantané (120 ms fade)
- inquisiteur/ange/avatar = beam **laser or** `#fcd34d`
- tour de joueur = beam couleur d'équipe

**Invocations** : pop néon à l'apparition — squelette (`source:'necro'`) =
halo+burst **violet magie**, clone de liche (`source:'lich_clone'`) = halo
**couleur d'équipe**. Le clone garde la forme de sa victime, la couleur dit
le camp (l'ancienne signature lime des squelettes créait une confusion avec
la couleur d'équipe du slot 3).

**Raccourcis** : T arbre tech · **V vue d'ensemble** (était F → conflit avec
le hotkey Fireball) · ` debug · Ctrl+A tout sélectionner · **Espace** recentrer
sur HDV (double-tap <350 ms : dernière alerte, expire 30 s) · **clic milieu**
drag-pan caméra · **double-clic** sélectionne le type à l'écran.

**Caméra (session-1)** : zoom Ctrl+molette **centré curseur** (`getWorldPoint`
avant/après + `cam.preRender()`), pan clavier **lissé** (vitesse/accel delta-time,
`_panVel`), **edge-scroll** 24 px (`edgeScrollEnabled`, à exposer dans le futur
menu options), minimap **drag continu**, pseudo en `localStorage('mji-name')`.

**Pop / squash / shake / pulse glow** :
- Pop apparition unité : scale 0→1 en 180 ms `Back.easeOut`
- Squash mort : scale → 0 + alpha → 0 en 200 ms avant burst particules
- Camera shake boss tué : 180 ms 0.004
- Camera shake HDV propre touché : 120 ms 0.0025
- Pulse glow boss : `outerStrength` oscille 0.85↔1.15 sur 1.4 s sine yoyo

**Rebrand emojis** : `neonGlyphs.js` fournit les glyphes Unicode néon
(◆ ◈ ▤ ✦ ✚ ⌬ ⊕ ⌂ ▰ ◎ ⌨ ⚙) avec classes CSS `.g-*` (text-shadow currentColor).
⚠️ Couverture PARTIELLE : HUD (index.html) et tech-tree-overlay seulement.
Les panneaux HDV/village/bâtiment et le kill feed utilisent encore les emojis
serveur (`u.icon`) → reste du volet B de l'audit.

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

- `MAP_WIDTH/HEIGHT/GRID_W/GRID_H` sont des `let` **de la closure createGame()**
  (per-partie), recalculés dans `applyMapConfig()`. Toute fonction qui les lit
  DOIT être déclarée dans la factory — jamais au niveau module.
- Ne JAMAIS réintroduire un `io.emit(` dans la factory : utiliser `emitAll(`
  (en phase 2 multi-rooms, `io.emit` fuiterait vers toutes les parties).
- `nowMs` est déclaré au TOUT DÉBUT de `tick()` (ex-setInterval du game loop).
  Si tu ajoutes du code AVANT et utilises `nowMs`, TDZ → crash.
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
  `unitType` pour résoudre correctement les bêtes PvE. Ne JAMAIS afficher
  `player.color` du serveur dans l'UI (palette par slot serveur ≠ slot client) :
  toujours passer par `Theme.factionColorStr/Int`.
- **Boucle combat** : les unités `damage <= 0` sont skippées dès l'entrée.
  Ne pas réintroduire de fallback `(unit.damage || 5)` / `(unit.range || 80)`
  → c'est ce qui faisait combattre pèlerins et colons à 5 dmg / 80 de portée.
- **Modificateurs de dégâts** : passer par `offensiveDamageMult` /
  `defensiveDamageMult` (et les appliquer APRÈS le check `inRange`). Tout effet
  de bord (proc cryomancy) placé avant `inRange` se déclenche à 20 Hz pendant
  la poursuite.
- **`utils/animations.js` et `config/entitiesConfig.js` ne sont PAS chargés
  dans index.html** : tout code client `typeof Animations !== 'undefined'` ou
  `typeof ENTITIES_CONFIG !== 'undefined'` est silencieusement mort (volet B :
  charger ou purger). Conséquence active : **`DebugPanel.init()` throw
  toujours** (« cats.spells is not iterable ») — contourné en try/catch dans
  lobby.js, le panneau debug (touche `) est donc CASSÉ tant que ce n'est pas
  réparé.
- **Tests en preview MCP** : le RAF de l'onglet en arrière-plan est en pause
  (tweens/update() figés, canvas noir sur les captures) et `preview_click`
  peut provoquer un faux reload de page — tester les flux UI avec des clics
  JS purs via preview_eval (`document.getElementById(...).click()`).

---

## 📝 État de l'audit (volets A + B + C, juin 2026)

L'audit complet en 3 volets a été réalisé. **Volet A (bugs) appliqué**, puis
**Volet B (features) + Volet C (game feel)** appliqués sur direction de Robin
(sorts réactivés, roads en passif vitesse, UI diplomatie, game feel). Récap :

### ✅ Volet A — corrigé
- 🟥 Bots magic/religion sans économie → `BOT_BUILD_PLANS` (sanctum/mage_tower,
  altar/temple/cathedral) — vérifié en partie réelle (logs `construit altar/temple`).
- 🟥 Routes tech bots avec prérequis manquants → routes complétées et ordonnées.
- 🟥 Proc cryomancy hors-portée (roll 20 Hz pendant la poursuite) → après `inRange`.
- 🟧 Kills splash pyromancy sans `onNeutralUnitKilled` (camps innettoyables) → fixé.
- 🟧 AoE god_avatar jamais implémentée → `SPLASH_AOE_UNITS` (rayon 60, 20 dmg).
- 🟧 Unités "statues" après riposte/kill/move → ré-ancrage `defend` sur place.
- 🟧 Effet gel client testait `u.freeze` (inexistant) → `u.frozenUntil > Date.now()`.
- 🟧 Visuel d'invocation gé sur `source==='soul_harvest'` (legacy) → pop violet
  (squelette) / couleur d'équipe (clone liche).
- 🟧 skeleton/skeleton_knight spawnables sans tech → `SUMMONED_ONLY_TYPES` (serveur).
- 🟧 `ballistics` ignorait la bombarde (`'bombard'` vs `bombard_tower`) → fixé
  (+ `unlocks.buildings` de gunpowder corrigé).
- 🟩 Crossbows -20 % portée jamais appliqué → dans `effectiveRange`.
- 🟩 Pèlerins/colons combattaient (fallbacks `|| 5` / `|| 80`) → non-combattants skippés.
- 🟩 Mur teinté faction (`'rampart'` vs `'wall'`) → gris fixe.
- 🟩 Conflit touche F (fireball vs vue d'ensemble) → vue = V.
- 🟩 Aura peur affectait les alliés diplomatiques → `friendly()`.
- 🟩 unwavering_faith/excommunication ignorés par splash/ricochet →
  `defensiveDamageMult` par victime.
- 🟩 Couleurs kill feed / scoreboard = couleurs serveur legacy → `Theme.factionColorStr`.
- 🟩 Purge totale : code eau/naval/waypoint, `TECH_TREE={}` + clé dupliquée du
  payload init, champs `techPoints/researchedTechs/activeSpells`, handlers
  `embarkBoat/disembarkBoat/researchTech`, `_placeDecor_DEPRECATED`,
  `_playArrowAnimation`, `_hasAsset`, clés theme mortes, consts MainScene mortes.
- ➕ Bonus : kill feed pour raids barbares + camps nettoyés ; unités neutres
  visibles sur la minimap ; bots excluent les non-combattants des waves ;
  village panel "Niveau x / 5" ; COLORS serveur alignées palette néon.

### ✅ Volet B — appliqué (session "volet-BC", 11 juin 2026)
1. **Sorts actifs RÉACTIVÉS** : `castSpell` serveur rebranché (fireball/freeze/
   blessing/purifying_light), chacun avec `cooldownMs` propre + crédit kills/PvE.
   Les 4 sorts d'INVOCATION ont été retirés de `SPELLS` (doublon avec la
   production d'unités). Cooldown miroir côté client (`SpellCast.lastCastAt`) +
   toast "en recharge". `playCastAnim` refait full néon (onde de choc + burst ADD).
2. **UI Diplomatie** : nouveau `diplomacy-panel.js` (bouton HUD + touche **P**),
   liste des joueurs vivants, statuts allié/neutre/en-attente, gaté par tech
   `diplomacy` (et exige que les 2 camps l'aient). `network.js` : `breakTreaty`
   + listeners `treatySigned`/`treatyBroken` (maj `allies` locale immédiate).
   Kill feed sur pacte signé/rompu (callbacks détenus par MainScene, slot unique).
3. **TechIndicators** : `init()` dans `_buildMap`, `sync()` après `_syncHDVs` →
   badges + halos de techs au-dessus des HDV désormais vivants.
4. **Omniscience Renaissance** : `minimap.js` consomme `state.omniscient` (liseré
   doré + révélation de tous les ennemis hors fog).
5. **`roads`** → passif `road_speed` (+12 % vitesse toutes unités, cumul avec
   teleportation). Plus de bâtiment `road` fantôme.
6. **martyrs** : `pilgrimExplosion` rebranché via callback (nova de soin verte
   dans MainScene) — ne dépend plus de `Animations` (non chargé).
7. **Feedback `spawnFailed`** : toast HUD lisible (`_hudToast`) pour TOUTES les
   causes (pop/mana/foi/PR/verrou/recharge/zone…), plus seulement le gold.
8. **Glyphes néon** : panneaux HDV/village/bâtiment via `NeonGlyphs.unit/building`,
   préfixes kill feed (☠ ▰ ✺ ⚔ ⊕ ✗).

### ✅ Volet C — game feel appliqué (même session)
- **Damage numbers** flottants : `dmg` ajouté au payload `attacks` serveur
  (4 chemins : combat ciblé, idle, tour, citadelle). Client : chiffre doré quand
  JE frappe / rouge quand J'encaisse, filtré sur mes unités (perf + lisibilité),
  gros chiffre sur les boss.
- **Impact punch** : `_impactPunch` (scale ×1.28 yoyo 70 ms via `_baseScaleX/Y`).
- **Kill streaks** : `_registerKill` (fenêtre 3 s) → bannière DOUBLE/TRIPLE/
  QUADRA/PENTA KILL / MASSACRE, couleur montant avec le palier.
- **Screen flash** : `_screenFlash` (voile ADD plein écran fixé caméra) sur kill de boss.

### ✅ Session-1-camera-lobbys (11 juin 2026) — P0 de la roadmap « confort »
Roadmap complète priorisée (issue de l'audit caméra/UI/serveur) dans
`~/.claude/plans/le-jeu-qui-est-sparkling-valley.md`. Décisions Robin :
lobbys = code 5 chars + liste publique ; Google OAuth reporté ; desktop-only.
- **Lot caméra/UX client** : zoom centré curseur, pan clavier lissé delta-time,
  Espace recentrage / ×2 dernière alerte, edge-scroll 24 px, drag-pan clic
  milieu, minimap drag continu, double-clic même type, toast « aucune unité
  sélectionnée », pseudo localStorage, hints à jour.
- **Lobbys phase 1 (serveur)** : extraction `createGame(config)` (factory
  closure, diff minimal 63+/15−), `addPlayer`/`tick`, `emitAll` injecté
  (17 sites), `defaultRoom` unique — comportement validé par smoke test
  socket.io 19/19 (init, config map, fog par joueur, spawn/move, bots,
  machine d'état, reset no-humans).
- **Reste du chantier lobbys** : phase 2 RoomManager + events `lobby:*`,
  phase 3 UI client (créer/rejoindre/liste + écran d'attente + `?room=`),
  phase 4 polish. Puis P1 : formations, shift-queue, groupes de contrôle.

### ✅ Session-2-rooms (11 juin 2026) — lobbys phases 2+3 + plein écran
Demandes Robin : plein écran (fix edge-scroll haut en fenêtré), système de
rooms complet, propositions d'améliorations interface.
- **Serveur** : RoomManager complet (cf. section Backend). 21/21 tests
  d'intégration + 19/19 tests gameplay.
- **Client** : lobby à étapes (Créer/Rejoindre par code/Parties publiques),
  overlay d'attente (code, copier le lien, joueurs, bot hôte), ligne « Salon »
  HUD, deep link `?room=CODE`, bouton plein écran ⛶ (bas-droite), Retour au
  lobby au game over, restyle néon du lobby (map-size-btn sombres).
- **Découverte** : DebugPanel.init() throw depuis toujours (ENTITIES_CONFIG
  absent) → contourné, vraie réparation au backlog.

### 🔜 Reste (backlog volet B/C non demandé cette session)
- Tutoriel intégré, audio (SFX/ambiance), contrôles tactiles mobile.
- `utils/animations.js` + `config/entitiesConfig.js` toujours non chargés
  (lignes mana/foi du building-info-panel via ENTITIES_CONFIG restent mortes —
  à brancher ou purger). Le visuel martyrs ne dépend plus d'eux.
- Perf : cap global d'unités, collisions O(n²), GC particules, throttle broadcast.
- Architecture : découpe de server.js en modules.
- Équilibrage magie post-refonte + équilibrage des sorts réactivés (à observer
  en partie réelle).

---

**Dernière mise à jour** : session "session-2-rooms" (11 juin 2026), commits
`83cb234` (RoomManager serveur) + `1c41ee2` (UI rooms + plein écran) sur la
branche **`developpement`** (= branche de déploiement Render, nouvelle URL
prod `mon-jeu-io-qzw8`). Le jeu a maintenant : caméra moderne (session-1),
vrai système de lobbys (créer/rejoindre par code/liste publique, parties
simultanées isolées), plein écran. Prochaine session (au choix de Robin) :
lot « interface » P2 (menu options, mode daltonien, tooltips, purge emojis,
file de production) et/ou P1 contrôles RTS (formations, shift-queue, groupes
de contrôle). Roadmap : `~/.claude/plans/le-jeu-qui-est-sparkling-valley.md`.

Quand tu mets à jour ce doc, change cette ligne avec le hash du dernier
commit de ta session.
