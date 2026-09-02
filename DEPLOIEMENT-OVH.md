# Déploiement OVH

Le portail est prévu pour fonctionner sur un VPS Ubuntu avec Docker et Caddy.

## Pré-requis

- Un nom de domaine pointant vers l'IPv4 du VPS.
- Les variables de production dans `.env.production` (copiées depuis Vercel, sans les publier dans Git).
- Dans Discord Developer Portal, l'URL de redirection : `https://<domaine>/api/auth/discord/callback`.
- Dans Google Cloud, les origines et redirections autorisées mises à jour avec le même domaine.

## Lancement

```bash
docker compose up -d --build
```

Caddy crée et renouvelle automatiquement le certificat HTTPS une fois le DNS propagé.
