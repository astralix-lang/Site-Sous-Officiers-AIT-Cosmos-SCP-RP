# Déployer le Portail Sous-Officiers sur Vercel

Le portail utilise Supabase pour les données partagées et Discord pour l'authentification. Les comptes ne se créent plus avec un e-mail et un mot de passe : la première connexion Discord crée une demande **en attente** qu'un Admin devra accepter ou refuser.

## Publication

1. Importez le dépôt GitHub dans Vercel.
2. Laissez **Framework Preset** sur **Next.js**.
3. Laissez **Build Command** et **Output Directory** sans modification.
4. Dans **Settings → Environment Variables**, ajoutez les variables ci-dessous pour **Production**, **Preview** et **Development**.
5. Déployez le projet.

Vercel détecte automatiquement pnpm grâce à `pnpm-lock.yaml` et lance `pnpm build`.

## Variables d'environnement

Ajoutez ces noms et leurs valeurs dans Vercel. Ce sont des secrets : ne les mettez jamais dans le code, GitHub ou une variable commençant par `NEXT_PUBLIC_`.

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
DISCORD_REDIRECT_URI
DISCORD_WEBHOOK_RECOMMENDATION
DISCORD_WEBHOOK_PCS_EXP
DISCORD_WEBHOOK_OBSERVATION_HDR
DISCORD_WEBHOOK_OBSERVATION_SO
DISCORD_WEBHOOK_SERGEANT_REPORT
```

- `SUPABASE_URL` et `SUPABASE_SECRET_KEY` : connexion serveur à la base Supabase.
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` et `DISCORD_REDIRECT_URI` : connexion OAuth Discord.
- Les cinq variables `DISCORD_WEBHOOK_*` : les webhooks privés correspondant aux formulaires.

## Créer l'application Discord

1. Ouvrez [Discord Developer Portal](https://discord.com/developers/applications) puis **New Application**.
2. Dans **OAuth2 → General**, ajoutez l'URL de redirection exacte :

   ```text
   https://votre-domaine/api/auth/discord/callback
   ```

   Pour l'URL Vercel actuelle, utilisez :

   ```text
   https://portail-so-ait.vercel.app/api/auth/discord/callback
   ```

3. Copiez l'**Application ID** dans `DISCORD_CLIENT_ID` et générez un secret OAuth2 à placer dans `DISCORD_CLIENT_SECRET`.
4. Mettez la même URL dans `DISCORD_REDIRECT_URI` sur Vercel.

Le portail demande automatiquement les autorisations Discord `identify` et `email` : il n'est pas nécessaire de créer un lien OAuth manuellement.

### Première connexion Admin

Si l'e-mail vérifié de votre compte Discord est déjà le même que celui de votre compte Admin existant, il sera relié automatiquement lors de la première connexion Discord.

Sinon, ajoutez temporairement `DISCORD_BOOTSTRAP_USER_ID` avec votre identifiant utilisateur Discord. Le premier Admin existant sera alors relié à ce compte Discord. Retirez ensuite cette variable de Vercel.

## Base Supabase

Exécutez une fois le script [discord_oauth_migration.sql](supabase/discord_oauth_migration.sql) dans **Supabase → SQL Editor**. Il ajoute les colonnes Discord et les états `en attente`, `approuvé` et `refusé` sans supprimer les comptes existants.

## Après le déploiement

- Ouvrez l'URL fournie par Vercel puis cliquez sur **Continuer avec Discord**.
- Les nouveaux utilisateurs voient un message d'attente.
- Dans **Admin → Comptes utilisateurs**, ouvrez une demande, attribuez son niveau d'accès et son grade, puis choisissez **Approuvé** ou **Refusé**.
- Toute modification envoyée sur GitHub déclenche automatiquement un nouveau déploiement Vercel.

## Développement local

Créez `.env.local` à partir de `.env.example`, renseignez les variables, puis lancez :

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Pour vérifier la version de production localement :

```powershell
pnpm build
pnpm start
```
