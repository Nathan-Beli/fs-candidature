# Federal Studio — Portail de candidatures

Application web pour gérer des candidatures avec **connexion Discord**.

- 🔐 Connexion via Discord (OAuth2).
- 👑 Le propriétaire (ID Discord `1016479613297369139`) peut **créer et gérer** les candidatures.
- 🧑‍🤝‍🧑 Les autres membres ont **accès aux candidatures** et peuvent **postuler**.
- 🔗 Chaque candidature génère un **lien partageable** unique.
- 🤖 Possibilité de **connecter un bot Discord** (token + serveur) pour relayer les candidatures dans un salon et autoriser un rôle administrateur.

## Prérequis

- Node.js 18+ (testé sur Node 22)

## Installation

```bash
npm install
cp .env.example .env
# Renseigne DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, SESSION_SECRET dans .env
npm start
```

L'application démarre sur `http://localhost:3000`.

## Configuration Discord (connexion)

1. Va sur le [Discord Developer Portal](https://discord.com/developers/applications) et crée (ou ouvre) une application.
2. Onglet **OAuth2** :
   - Copie le **Client ID** et le **Client Secret** dans `.env`.
   - Dans **Redirects**, ajoute : `http://localhost:3000/callback` (ou ton URL publique + `/callback`).
3. Lance `npm start`.

## Connexion du bot (page « Bot »)

Une fois connecté en tant qu'administrateur, ouvre l'onglet **Bot** et renseigne :

| Champ | Description |
|-------|-------------|
| Token du bot | Discord Developer Portal → onglet **Bot** → Token |
| ID du serveur | Guild ID du serveur Federal Studio |
| ID du salon | Salon où envoyer les nouvelles candidatures |
| ID du rôle admin | (optionnel) rôle autorisé à créer des candidatures |

Active l'intent **Server Members Intent** sur le bot pour la vérification des rôles.

## Permissions

- **Propriétaire** : `ADMIN_ID` (par défaut `1016479613297369139`) — accès complet.
- **Rôle admin** (optionnel) : membres du serveur ayant le rôle configuré — peuvent créer des candidatures.
- **Membres** : peuvent voir et postuler aux candidatures ouvertes.

## Données

Les candidatures et réponses sont stockées dans `data/db.json` (créé automatiquement, ignoré par git).

## Structure

```
server.js          Application Express + routes
src/db.js          Stockage JSON (candidatures, réponses, paramètres)
src/auth.js        Configuration Passport Discord + permissions
src/discord.js     Helpers API Discord (bot, rôles, envoi de messages)
views/             Templates EJS
public/            CSS, logo, assets statiques
```
