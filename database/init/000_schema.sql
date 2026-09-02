CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE portal_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  role text NOT NULL,
  grade text NOT NULL,
  presence text,
  blocked boolean NOT NULL DEFAULT false,
  password_hash text,
  password_salt text,
  password_iterations integer NOT NULL DEFAULT 210000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  discord_id text,
  discord_username text,
  approval_status text NOT NULL DEFAULT 'approved',
  discord_avatar_url text,
  discord_refresh_token text,
  discord_token_expires_at timestamptz,
  steam_id_64 text,
  discord_contact_id text,
  specialization_instruction text NOT NULL DEFAULT 'Aucune',
  specialization_pm text NOT NULL DEFAULT 'Aucune',
  specialization_mdc text NOT NULL DEFAULT 'Aucune',
  specialization_ing text NOT NULL DEFAULT 'Aucune',
  specialization_1 text NOT NULL DEFAULT 'Aucune',
  specialization_2 text NOT NULL DEFAULT 'Aucune',
  specialization_3 text NOT NULL DEFAULT 'Aucune'
);

CREATE TABLE portal_notifications (
  id uuid PRIMARY KEY,
  recipient_ids jsonb,
  kind text NOT NULL DEFAULT 'form',
  title text NOT NULL,
  body text NOT NULL,
  target text NOT NULL DEFAULT 'home',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE portal_chats (
  id uuid PRIMARY KEY,
  type text NOT NULL,
  name text,
  created_by uuid NOT NULL REFERENCES portal_users(id),
  participants jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE portal_chat_messages (
  id uuid PRIMARY KEY,
  chat_id uuid NOT NULL REFERENCES portal_chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES portal_users(id),
  sender_name text NOT NULL,
  html text,
  text_content text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz
);

CREATE TABLE portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE portal_audit_logs (
  id uuid PRIMARY KEY,
  actor_id uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  actor_name text NOT NULL DEFAULT 'Système',
  actor_role text,
  category text NOT NULL DEFAULT 'account',
  action text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE portal_notification_dismissals (
  notification_id uuid NOT NULL REFERENCES portal_notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX portal_notifications_created_at_idx ON portal_notifications (created_at DESC);
CREATE INDEX portal_chats_updated_at_idx ON portal_chats (updated_at DESC);
CREATE INDEX portal_chat_messages_chat_id_created_at_idx ON portal_chat_messages (chat_id, created_at);
CREATE INDEX portal_audit_logs_created_at_idx ON portal_audit_logs (created_at DESC);

CREATE ROLE portal_api NOLOGIN;
GRANT USAGE ON SCHEMA public TO portal_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO portal_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO portal_api;
