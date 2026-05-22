# Mon Jeu .io

RTS multijoueur temps réel en .io, inspiré de Polytopia.

## Stack

- **Backend** : Node.js + Express + Socket.io
- **Frontend** : Phaser 3 (CDN), Socket.io client, JavaScript vanilla

## Lancer en local

```bash
npm install
npm start
```

Puis ouvre `http://localhost:3000` dans plusieurs onglets pour tester le multi (chaque onglet = un joueur, max 4).

## Contrôles

| Action | Contrôle |
|---|---|
| Sélectionner des unités | Clic gauche / drag |
| Déplacer ou attaquer | Clic droit |
| Créer un soldat (10 gold) | Clic sur son HDV |
| Déplacer la caméra | ZQSD ou drag 2 doigts |
| Zoom | Pinch ou Ctrl+scroll |

## Déployé sur

🎮 **[https://mon-jeu-io-17dn.onrender.com](https://mon-jeu-io-17dn.onrender.com)**

Auto-déploiement depuis `main` via [render.yaml](./render.yaml) (Render.com, free tier,
region Frankfurt). Cold start ~30s après 15 min d'inactivité.
