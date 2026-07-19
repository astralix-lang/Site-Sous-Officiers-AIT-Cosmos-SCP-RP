# Déployer le Portail Sous-Officiers sur Vercel

Le projet est prêt pour Vercel et utilise Next.js. Aucun mot de passe, webhook Discord ou clé Supabase n’est inclus dans le dépôt.

## Publication

1. Importez le dépôt GitHub dans Vercel.
2. Laissez **Framework Preset** sur **Next.js**.
3. Laissez **Build Command** et **Output Directory** sans modification.
4. Dans **Environment Variables**, ajoutez les huit variables ci-dessous pour **Production**, **Preview** et **Development**.
5. Cliquez sur **Deploy**.

Vercel détecte automatiquement pnpm grâce à `pnpm-lock.yaml` et lance `pnpm build`.

## Variables d’environnement requises

Ajoutez ces noms et leurs valeurs dans Vercel. Ce sont des secrets : ne les mettez jamais dans le code, dans GitHub ou dans une variable commençant par `NEXT_PUBLIC_`.

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
PORTAL_SETUP_CODE
DISCORD_WEBHOOK_RECOMMENDATION
DISCORD_WEBHOOK_PCS_EXP
DISCORD_WEBHOOK_OBSERVATION_HDR
DISCORD_WEBHOOK_OBSERVATION_SO
DISCORD_WEBHOOK_SERGEANT_REPORT
```

- `SUPABASE_URL` : l’URL du projet Supabase.
- `SUPABASE_SECRET_KEY` : la clé serveur Supabase ; elle permet de gérer les comptes partagés.
- `PORTAL_SETUP_CODE` : code utilisé uniquement si aucune compte Admin n’existe encore.
- Les cinq variables `DISCORD_WEBHOOK_*` : les webhooks privés correspondant aux formulaires.

## Après le déploiement

- Ouvrez l’URL fournie par Vercel.
- Les comptes déjà créés dans Supabase restent utilisables : il n’y a rien à recréer.
- Toute modification envoyée sur GitHub déclenchera automatiquement un nouveau déploiement Vercel.

## Développement local

Créez `.env.local` à partir de `.env.example`, renseignez les huit variables, puis lancez :

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Pour vérifier la version de production localement :

```powershell
pnpm build
pnpm start
```
