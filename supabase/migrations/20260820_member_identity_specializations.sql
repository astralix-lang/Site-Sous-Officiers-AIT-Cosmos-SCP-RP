-- Informations demandées à chaque membre et spécialités de l'effectif.
alter table public.portal_users
  add column if not exists steam_id_64 text,
  add column if not exists discord_contact_id text,
  add column if not exists specialization_instruction text not null default 'Aucune',
  add column if not exists specialization_pm text not null default 'Aucune',
  add column if not exists specialization_mdc text not null default 'Aucune',
  add column if not exists specialization_ing text not null default 'Aucune';

-- Les membres déjà liés à Discord reçoivent leur identifiant Discord existant.
update public.portal_users
set discord_contact_id = discord_id
where (discord_contact_id is null or discord_contact_id = '')
  and discord_id is not null
  and discord_id <> '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'portal_users_steam_id_64_format') then
    alter table public.portal_users
      add constraint portal_users_steam_id_64_format
      check (steam_id_64 is null or steam_id_64 ~ '^[0-9]{17}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'portal_users_discord_contact_id_format') then
    alter table public.portal_users
      add constraint portal_users_discord_contact_id_format
      check (discord_contact_id is null or discord_contact_id ~ '^[0-9]{17,20}$');
  end if;
end $$;

notify pgrst, 'reload schema';
