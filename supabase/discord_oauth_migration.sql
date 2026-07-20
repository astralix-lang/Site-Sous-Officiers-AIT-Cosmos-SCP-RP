-- Connexion Discord et validation manuelle des demandes d'accès.
-- À exécuter une seule fois dans Supabase > SQL Editor avant d'activer Discord sur Vercel.

alter table public.portal_users add column if not exists discord_id text;
alter table public.portal_users add column if not exists discord_username text;
alter table public.portal_users add column if not exists approval_status text not null default 'approved';

-- Les anciens comptes gardaient un mot de passe obligatoire. Avec Discord,
-- ces colonnes deviennent facultatives pour les nouveaux comptes.
alter table public.portal_users alter column password_hash drop not null;
alter table public.portal_users alter column password_salt drop not null;

update public.portal_users set approval_status = 'approved' where approval_status is null;

alter table public.portal_users drop constraint if exists portal_users_approval_status_check;
alter table public.portal_users add constraint portal_users_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected'));

create unique index if not exists portal_users_discord_id_unique
  on public.portal_users (discord_id) where discord_id is not null;

create index if not exists portal_users_approval_status_idx
  on public.portal_users (approval_status, created_at desc);
