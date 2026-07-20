-- Données partagées du portail : conversations et notifications.
-- À exécuter une seule fois dans Supabase > SQL Editor.

create table if not exists public.portal_chats (
  id uuid primary key,
  type text not null check (type in ('direct', 'group')),
  name text,
  created_by uuid not null references public.portal_users(id) on delete cascade,
  participants jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_chat_messages (
  id uuid primary key,
  chat_id uuid not null references public.portal_chats(id) on delete cascade,
  sender_id uuid not null references public.portal_users(id) on delete cascade,
  sender_name text not null,
  html text,
  text_content text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists portal_chats_updated_at_idx on public.portal_chats (updated_at desc);
create index if not exists portal_chat_messages_chat_id_created_at_idx on public.portal_chat_messages (chat_id, created_at asc);

create table if not exists public.portal_notifications (
  id uuid primary key,
  recipient_ids jsonb,
  kind text not null default 'form' check (kind in ('form', 'message', 'info')),
  title text not null,
  body text not null,
  target text not null default 'home',
  created_at timestamptz not null default now()
);

create index if not exists portal_notifications_created_at_idx on public.portal_notifications (created_at desc);

create table if not exists public.portal_notification_dismissals (
  notification_id uuid not null references public.portal_notifications(id) on delete cascade,
  user_id uuid not null references public.portal_users(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create table if not exists public.portal_audit_logs (
  id uuid primary key,
  actor_id uuid references public.portal_users(id) on delete set null,
  actor_name text not null default 'Systeme',
  actor_role text,
  category text not null default 'account',
  action text not null,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists portal_audit_logs_created_at_idx on public.portal_audit_logs (created_at desc);

alter table public.portal_chats enable row level security;
alter table public.portal_chat_messages enable row level security;
alter table public.portal_notifications enable row level security;
alter table public.portal_notification_dismissals enable row level security;
alter table public.portal_audit_logs enable row level security;

-- Les appels viennent uniquement des routes serveur protégées du portail
-- (clé serveur Supabase). Aucune règle anonyme n’est ajoutée.

-- Le nom est facultatif sur le portail : une chaîne vide reste donc valide.
alter table public.portal_users drop constraint if exists portal_users_last_name_check;
alter table public.portal_users add constraint portal_users_last_name_check check (char_length(last_name) <= 60);
