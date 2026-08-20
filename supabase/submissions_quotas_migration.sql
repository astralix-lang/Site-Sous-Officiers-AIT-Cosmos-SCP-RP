-- Historique partagé des formulaires et compteurs de quotas.
-- À exécuter une seule fois dans Supabase > SQL Editor.

create table if not exists public.portal_submissions (
  id uuid primary key,
  type text not null check (type in ('recommendation', 'pcs_exp', 'observation_hdr', 'observation_so', 'sergeant_report')),
  values jsonb not null default '{}'::jsonb,
  author_id uuid not null references public.portal_users(id) on delete cascade,
  author_name text not null,
  author_grade text,
  author_role text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  edited_by uuid references public.portal_users(id) on delete set null
);

create index if not exists portal_submissions_created_at_idx on public.portal_submissions (created_at desc);
create index if not exists portal_submissions_author_created_at_idx on public.portal_submissions (author_id, created_at desc);

create table if not exists public.portal_quota_settings (
  id smallint primary key default 1 check (id = 1),
  targets jsonb not null default '{"recommendation": 1, "pcs_exp": 1, "observations": 1, "mission_internal": 0}'::jsonb,
  exemptions jsonb not null default '{}'::jsonb,
  mission_counts jsonb not null default '{}'::jsonb,
  reset_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.portal_quota_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.portal_submissions enable row level security;
alter table public.portal_quota_settings enable row level security;

-- Seules les routes serveur du portail, avec la clé Supabase serveur,
-- accèdent à ces données. Aucune règle anonyme n’est ajoutée.
