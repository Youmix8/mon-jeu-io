# CLAUDE.md — Contexte projet pour Claude Code

> **Lis ce fichier en entier avant toute modification.** Il contient tout ce
> qu'il faut savoir pour être immédiatement productif sur ce projet.
> **Communique avec l'utilisateur en FRANÇAIS** (il est francophone).

---

## 🎮 TL;DR

RTS multijoueur temps réel `.io` (max 4 joueurs), inspiré de Polytopia.
Phaser 3 côté client, Node + Express + Socket.io côté serveur, déployé sur
Render. URL prod : **https://mon-jeu-io-17dn.onrender.com**

Repo GitHub : `Youmix8/mon-jeu-io`. Auto-deploy depuis `main` via `render.yaml`.

---

## ⚙️ Stack

| Couche | Tech | Fichier(s) clés |
|---|---|---|
| Backend | Node 20 + Express + Socket.io 4 | `server.js` (~2700 lignes, monolithique) + `server/techTree.js` |
| Frontend rendu | Phaser 3 (CDN) | `public/js/scenes/MainScene.js` (~1700 lignes) |
| Frontend modules | JS vanilla (pas de bundler) | `public/js/*.js` chargés via `<script>` dans `public/index.html` |
| Config partagée | Hybride global + CommonJS | `public/js/config/entitiesConfig.js` (chargé client via script tag, serveur via `require`) |
| Déploiement | Render.com Blueprint | `render.yaml` |

**Pas de build step.** Les fichiers JS sont servis tels quels par Express via `app.use(express.static('public'))`.

---

## 🚀 Commandes essentielles

```bash
npm install          # premier setup
npm start            # lance le serveur sur :3000 (ou $PORT)
```

**Déploiement** : push sur `main` → Render redéploie automatiquement en ~3 min.

**Tester localement** : ouvre plusieurs onglets sur `http://localhost:3000`, chaque onglet = un joueur.

---

## 🗂️ Architecture des fichiers

### Backend (`server.js`, monolithique — refactor à venir)

Sections principales dans l'ordre :
1. Constantes (MAP_SIZES, UNIT_TYPES, BUILDING_TYPES, SPELLS, HDV_LEVELS, VILLAGE_LEVELS)
2. Helpers map / eau (generateWaterTiles, isWaterAt, findFreeSpawnPos, applyMapConfig)
3. Génération spawns + villages (avec garantie côtière `ensureCoastalVillages`)
4. Fog of war (Uint8Array par joueur, broadcastFilteredState)
5. **IA bot** (`botTick` — stratégique : construit tours, capture villages, vagues coordonnées)
6. Handlers Socket.io (un gros bloc `io.on('connection', socket => { ... })`)
7. Game loop (`setInterval` 20Hz) : behavior IA → mouvement → collisions → combat → behaviors spéciaux → ressources passives → broadcast

### Frontend (`public/js/`)

| Fichier | Rôle |
|---|---|
| `scenes/MainScene.js` | Scène Phaser principale : rendu unités/bâtiments/HDV/villages, fog, inputs, animations attaque/projectile |
| `network.js` | Wrapper Socket.io client (init, getState, emit functions) + handlers events serveur |
| `config/entitiesConfig.js` | `ENTITIES_CONFIG` : 33 entités avec assetKey, scale, displaySize, stats. Source de vérité visuelle. |
| `utils/animations.js` | Helpers tweens : animateUnitMove/Attack/Death/Spawn, animateProjectile, animateIdleAmbient |
| `hdv-panel.js` | Panel HTML qui s'ouvre au clic HDV : production unités + tech tree access + upgrade |
| `village-panel.js` | Pareil pour villages (5 niveaux : Hameau → Métropole) |
| `building-info-panel.js` | Panel au clic d'un bâtiment : HP, portée, effets, bouton vendre (50% remboursé) |
| `tech-tree-overlay.js` | Overlay SVG plein écran de l'arbre tech (touche T). 49 nœuds, 3 axes radiaux. |
| `build-mode.js` | Mode placement de bâtiments avec ghost sprite + validation grille |
| `radial-menu.js` | Menu radial qui apparaît au maintien clic droit (Attack/Move/Defend) |
| `debug-panel.js` | Panel debug (touche backtick `) — spawn gratuit + tuning scales |
| `sprite-factory.js` | Générateur de textures procédurales (fallback historique pour soldier/archer/cavalry) |
| `minimap.js` | Mini-carte bottom-left |
| `game.js` | Bootstrap Phaser + handler lobby (choix map type/size avant Network.init) |

---

## 🎯 Systèmes gameplay clés

### Ressources joueur (4)
- **Gold** : produit par HDV + villages possédés. Modifié par techs `agriculture` (+1/s), `empire` (×1.5).
- **PR (Research Points)** : produit par HDV (0.5/s base). Boost par techs `stargazing` (+0.3/s), `printing` (×2).
- **Mana** : produit par bâtiments Sanctum (+0.5/s), Mage Tower (+1/s). Capé à 200.
- **Foi (faith)** : produit par Altar (+0.5/s), Temple (+1.5/s), Cathedral (+3/s), Pèlerin unité (+0.5/s). Capé à 200.

### Population
- Tous les joueurs ont `populationUsed` (calculé dynamiquement) et `populationMax`.
- Base 8, +3 par niveau HDV, +2 par village capturé, +1 par level village.
- Chaque unité a un coût pop (`populationCost` dans `UNIT_TYPES`). `spawnUnit` refuse si pop plein.

### Combat
- Tick 20 Hz. Game loop dans `server.js` `setInterval` en bas du fichier.
- Unités ont `mode` : `defend` (par défaut, scan zone) / `move` (vers targetX,Y) / `attack` (vers attackTarget).
- **Riposte auto** : unité attaquée prend son attaquant comme cible si elle n'a pas de cible.
- **Combat AoE** : fire_elemental (rayon 40), god_avatar (rayon 60). Tag `_aoeAroundTarget` traité en section 3.6.
- **Aura général** : +25% dmg aux alliés dans rayon 200 d'un Général.
- **Aura peur god_avatar** : ennemis dans rayon 400 ont speed ×0.5 (via `fearedUntil`).

### Tech tree (49 nœuds, 3 axes)

**Source serveur** : `server/techTree.js` (`TECH_TREE` exporté).

| Axe | Nœuds | Coût total PR | Style |
|---|---|---|---|
| Science | 19 | ~1610 | Économie + militaire conventionnel (9 unités, 4 bâtiments) |
| Magie | 15 | ~1320 | 5 unités magie + nombreux passifs (mana ×, dmg boost, etc.) |
| Religion | 15 | ~1390 | Soin/auras (5 unités saintes + buffs défensifs) |

Chaque axe a 6 tiers. Le HDV est au centre, les nœuds rayonnent.

**⚠️ Important** : certains passifs `unlocks.passives` ne sont PAS implémentés
côté serveur (juste affichés). Liste à jour des passifs ACTIFS dans `server.js`,
rechercher `hasTech(...)` pour voir lesquels ont du code. Au moment de l'écriture
de ce doc : ~12 passifs actifs sur ~25 listés. Les autres sont décoratifs.

### Eau & map types
4 types de map (lobby choice) :
- `no_water` (Plaines) : 0% eau
- `lakes` : 4-8 lacs ronds aléatoires
- `continental` : rivière sinusoïdale traversante
- `island` : continent central + océan tout autour

**Stockage** : `waterTiles` Uint8Array global serveur (1=eau, 0=terre), envoyé au
client dans le payload `init`. Helpers : `isWaterAt(x,y)`, `isWaterTile(tx,ty)`,
`hasWaterNeighbor(x,y)`.

**Blocage mouvement** : unités terrestres ne peuvent pas entrer dans l'eau,
slide axe par axe. Boats peuvent UNIQUEMENT aller sur eau. Push-out défensif
chaque tick pour les unités coincées dans l'eau (hérités).

**Village côtier garanti** : `ensureCoastalVillages(minCoastal=2)` après
génération force ≥2 villages avec water-adjacent tile.

### Bateaux (transport)
- Capacité 4 passagers. `boat.passengers = [{type, hp, maxHp, ...}]` (snapshot des unités).
- **Embarquer** : sélection unités terrestres + clic droit sur boat propre (≤100px) → embarque.
- **Débarquer** : sélection boat avec passagers + clic droit sur tile terre → recrée les unités.
- Events : `embarkBoat({boatId, unitIds})`, `disembarkBoat({boatId, destX, destY})`.
- Badge visuel : "🧍N/4" au-dessus du boat quand passagers > 0.

### IA bot (`botTick`)

État persistant `bot.botState = { lastWaveTime, lastBuildTime, lastVillageScout, targetPlayerId }`.

Boucle de décision (~1.5s) :
1. Recherche tech selon `BOT_TECH_PRIORITY` (économie → militaire → spécial)
2. Upgrade HDV si gold ≥ cost + 100 marge
3. Construction tour (max 2 autour du HDV, valide eau/distance/case)
4. Spawn unité (préfère hauts tiers, cappé à 40 unités max)
5. **Capture villages** : si army ≥ 4 et 8s depuis dernier scout → envoie 3 unités vers village neutre proche
6. **Wave coordonnée** : si army ≥ 10 et 6s depuis dernière wave → envoie 70% vers joueur le plus faible (score `(1-hpFrac)*800 - dist/8`)

**⚠️ Limitation actuelle** : le bot ignore TOTALEMENT le naval. Ne fait pas de
port, pas de bateau. Sur map island, le bot reste coincé sur son continent.

---

## 📦 Assets

Les PNG sont dans `public/assets/` (versionnés dans git). 50/55 attendus présents.
**Toujours manquants** : `skeleton_knight.png`, `path_tile.png`, `spell_fireball.png`,
`spell_freeze.png` → fallback intelligent + emoji badge dans `_syncUnits`.

Le système de chargement Phaser (`ASSET_CATALOG` dans MainScene.js) gère
automatiquement les assets manquants en générant un placeholder coloré avec
emoji du type d'unité superposé.

**`_placeholderKeys` (Set)** : track les clés dont le PNG manque → un sprite
qui utilise cette clé reçoit un emoji overlay (4ème ou 5ème élément du tuple
`unitSprites[id]`).

---

## 🎨 Conventions visuelles

### Sprites unités/bâtiments

**Source de vérité** : `ENTITIES_CONFIG[type]` dans `entitiesConfig.js`.

Champs critiques :
- `assetKey` : clé Phaser de la texture (peut différer du type — ex: `knight` → assetKey `cavalry`)
- `scale` : multiplicateur taille (1.0 → 3.5 selon entité)
- `displaySize` : taille de base en px (40 pour unité, 44+ pour bâtiment)
- `projectile` : clé du PNG projectile (proj_arrow, proj_magic_bolt, etc.)

### Naming legacy à connaître
- Serveur utilise `knight` (chevalier), asset = `cavalry.png`
- Serveur utilise `wizard` (sorcier), asset = `mage.png`
- Serveur utilise `holy_knight` (chevalier sacré), asset = `paladin.png`
- Serveur utilise `tower` (tour archer), asset = `tower_archer.png`

### Depth ordering (z-index)
- Sol/grass : 0
- Eau : 1
- Décor : 10
- HDV / villages / bâtiments : 28-30
- Unités : 50
- Selection ring : 55
- Slash mêlée : 55
- Bars HP / badges / icon overlay : 60-70
- **Projectiles : 110** (AU-DESSUS du fog 100 — sinon masqués bot vs bot)
- Fog : 100

### Animations
- `_updateUnitBarPositions` applique un wobble Y permanent qui POLLUE `sprite.scaleY` chaque frame.
- **JAMAIS lire `sprite.scaleX/Y` pour modifier le scale** — utiliser `sprite._baseScaleX/_baseScaleY` (référence stable). Sinon → bug "aplatissement irréversible" (fix critique commit `3f51d2c`).
- Pour des animations idle ambient sur des unités qui bougent (ex: angel) : utiliser `angle` (rotation), pas `y` ni `scaleY`, car le tween mouvement écrase la position.

---

## 🛠️ Workflow git & branches

- Branche principale : `main` (auto-deploy Render)
- Cette branche de session : `claude/zen-ptolemy-5f057c` (worktree dans `.claude/worktrees/`)
- **Pour déployer** : `git push origin HEAD:main` (fast-forward depuis la branche worktree)
- Commits en français, conventional commits avec scope (`fix:`, `feat:`, `chore:`, etc.)
- Toujours signer : `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

### Messages de commit attendus
Format multi-lignes via heredoc, avec :
- Titre court (50 char max) avec scope
- Ligne vide
- Description structurée : `BUG/FEATURE — résumé`, `Cause :`, `Fix :`, etc.

---

## 🐛 Bugs connus / dette technique (à connaître)

| # | Sujet | État |
|---|---|---|
| 1 | **Boats sans combat naval** : `damage: 0, range: 0` → pas d'attaque entre bateaux | Latent, non prioritaire |
| 2 | **IA bot ignore le naval** : pas de port/bateau construit, coincée sur île | Latent, gros chantier |
| 3 | **Passifs tech décoratifs** : ~13/25 passifs n'ont aucun code serveur | Implémenter au cas par cas |
| 4 | **Debug panel accessible en prod** (touche `` ` ``) | Cheat possible — à gater par env var |
| 5 | **HUD double 👥 emoji** (pop + unit count) | UX mineur |
| 6 | **Pas de feedback "port nécessite eau adjacente"** | UX |
| 7 | **Pas de tutoriel intégré** | Onboarding |
| 8 | **Cold start free tier ~30s** | Limite Render — passer Starter ($7/mois) si besoin |

### Pièges techniques (gotchas)
- `MAP_WIDTH/HEIGHT/GRID_W/GRID_H` sont `let`, recalculés dans `applyMapConfig()`. Si tu utilises ces vars dans une closure stockée, attention au moment de capture.
- `waterTiles` est une variable globale séparée de `gameState` (pour des raisons de timing au load — gameState n'existe pas encore quand on appelle `applyMapConfig`).
- `nowMs` est déclaré au TOUT DÉBUT du `setInterval` du game loop. Si tu ajoutes du code AVANT et utilises `nowMs`, il sera dans la TDZ → crash. Toujours déclarer juste après.
- Le serveur émet `attacks` event **non filtré** par fog. Le client doit gérer le cas où l'attaquant ou la cible n'est pas dans `state.units` (fallback sur `attackerX/Y` / `targetX/Y` inclus dans le payload).
- `TechTreeOverlay` : le keydown listener T est attaché au load top-level, PAS dans `ensureDOM()`. Si tu déplaces ce listener par accident → cycle vicieux mort (T ne marche jamais).

---

## 💬 Style de communication avec l'utilisateur

L'utilisateur (**Robin**) :
- **Parle français** — réponds toujours en français.
- Préfère les **réponses structurées avec tableaux**, pas des paragraphes longs.
- Aime quand tu es **critique de ton propre code** (point fort signalé explicitement).
- Donne souvent **plusieurs bugs en un seul message** — traite-les tous, n'en oublie aucun.
- Apprécie quand tu **proposes plusieurs options avec pros/cons** avant de coder.
- Veut du **code AAA propre, jouable, addictif**.
- Teste en condition réelle entre 2 sessions et revient avec retours terrain.

### Pattern de session typique
1. Robin liste 3-5 bugs/améliorations en un message
2. Tu **audites** (lis le code concerné, identifies la vraie cause)
3. Tu fixes **toutes** les choses listées (pas 1 par 1)
4. Tu commit en français avec message structuré
5. Tu pushes sur main (auto-deploy Render)
6. Tu résumes ce qui est fait + ce qui reste (audit critique de toi-même)

### Utilise `AskUserQuestion`
Quand tu dois choisir entre plusieurs approches design (équilibrage, UX), pose
la question avec des options claires. Ne décide pas tout seul sur les choix
créatifs.

---

## 🎯 Priorités actuelles (au moment de la session zen-ptolemy)

État au dernier commit (`4cd5d6d`) :
- ✅ Bugs critiques résolus : caméra dérive, projectiles, ange tremble, tech panel
  refresh, buildings cliquables, riposte auto
- ✅ Système population implémenté
- ✅ Coûts unités revus (gold + mana/foi selon catégorie)
- ✅ Pathfinding eau basique (slide axe par axe + push-out défensif)
- ✅ Boats transport (embark/disembark)
- ✅ Village côtier garanti sur maps avec eau
- ✅ Audit équilibrage : 6 passifs critiques activés

À faire dans une prochaine session (par ordre d'impact estimé) :
1. **IA bot naval** : qu'elle construise des ports/bateaux pour franchir les océans
2. **Combat naval** : donner damage aux bateaux ou créer des unités navales
3. **Implémenter les passifs restants** : `magic_hp_boost`, `martyr_explosion`,
   `magic_slow_chance`, `reveal_enemy_techs`, etc.
4. **Tutoriel intégré** (1ère partie : 3 tooltips guidés)
5. **Audio** (musique + SFX — impact énorme, effort faible)
6. **Particules + screen shake** sur kills et impacts importants
7. **Touch controls mobile**

---

## 📚 Références utiles

- Phaser 3 docs : https://docs.phaser.io/api-documentation/api-documentation
- Phaser 3 examples : https://phaser.io/examples
- Socket.io docs : https://socket.io/docs/v4/
- Render Blueprint spec : https://render.com/docs/blueprint-spec

---

## 🚨 NE PAS FAIRE

- **Ne pas remplacer `Phaser` par un autre engine** — le user a confirmé qu'on reste sur Phaser 3.
- **Ne jamais modifier `git config`** ou les hooks.
- **Ne pas commit des secrets** (pas de DB pour l'instant donc no concern actuellement).
- **Ne pas spammer les commits** : groupe les fixes liés en un seul commit avec un message structuré.
- **Ne pas oublier de pousser sur `main`** après le commit local (sinon Render ne déploie pas).
- **Ne pas modifier les PNG existants** — le user les fournit, gère juste l'intégration code.
- **Ne pas créer de nouveaux fichiers README/docs** sauf demande explicite (cette règle vient des consignes globales Claude Code).

---

**Dernière mise à jour** : commit `4cd5d6d` (session zen-ptolemy-5f057c).
Quand tu mets à jour ce doc, change cette ligne avec le hash du dernier commit
de ta session.
