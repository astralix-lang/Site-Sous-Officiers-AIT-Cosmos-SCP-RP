# Héberger le Portail Sous-Officiers

Cette archive contient le code source du portail. Aucun mot de passe, webhook Discord ou autre secret n’est inclus.

## Prérequis

- Node.js 22 ou version plus récente
- pnpm 11 ou version plus récente
- Un nom de domaine avec HTTPS pour la production

## Configuration

1. Copiez `.env.example` vers `.env.local`.
2. Ajoutez dans `.env.local` les cinq webhooks Discord correspondant aux salons du portail.
3. Ne publiez et ne partagez jamais `.env.local`.

## Installation et lancement

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Pour travailler localement :

```powershell
pnpm dev
```

## Points importants

- Conservez les en-têtes de sécurité présents dans `next.config.mjs`.
- Placez le site derrière HTTPS et un proxy inverse si votre hébergeur le demande.
- Les webhooks Discord restent uniquement côté serveur.
- Les comptes et les données fonctionnelles sont actuellement conservés dans le navigateur. Pour partager réellement les mêmes comptes et données entre plusieurs appareils, il faudra ensuite ajouter une base de données et une authentification serveur.
