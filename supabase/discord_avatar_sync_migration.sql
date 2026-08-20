-- Photos de profil Discord et jeton de rafraîchissement sécurisé.
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- Le jeton n'est jamais renvoyé au navigateur : il est utilisé uniquement
-- côté serveur pour actualiser les avatars à la demande d'un administrateur.

alter table public.portal_users add column if not exists discord_avatar_url text;
alter table public.portal_users add column if not exists discord_refresh_token text;
alter table public.portal_users add column if not exists discord_token_expires_at timestamptz;
