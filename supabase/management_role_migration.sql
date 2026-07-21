-- Ajout du niveau Gérance : il possède les droits fonctionnels d'un Admin,
-- mais seul un Admin peut attribuer ou retirer ce niveau depuis le portail.
alter table public.portal_users drop constraint if exists portal_users_role_check;

alter table public.portal_users add constraint portal_users_role_check
  check (role in ('admin', 'management', 'referent', 'senior', 'officer'));
