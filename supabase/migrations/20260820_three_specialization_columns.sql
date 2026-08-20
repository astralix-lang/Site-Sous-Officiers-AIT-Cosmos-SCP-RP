-- Trois spécialisations indépendantes par membre.
alter table public.portal_users
  add column if not exists specialization_1 text not null default 'Aucune',
  add column if not exists specialization_2 text not null default 'Aucune',
  add column if not exists specialization_3 text not null default 'Aucune';

-- Conserve les spécialisations précédemment attribuées lorsque c'est possible.
update public.portal_users as member
set
  specialization_1 = coalesce((select choices.value from unnest(array[
    nullif(member.specialization_instruction, 'Aucune'),
    nullif(member.specialization_pm, 'Aucune'),
    nullif(member.specialization_mdc, 'Aucune'),
    nullif(member.specialization_ing, 'Aucune')
  ]) as choices(value) where choices.value is not null limit 1), 'Aucune'),
  specialization_2 = coalesce((select choices.value from unnest(array[
    nullif(member.specialization_instruction, 'Aucune'),
    nullif(member.specialization_pm, 'Aucune'),
    nullif(member.specialization_mdc, 'Aucune'),
    nullif(member.specialization_ing, 'Aucune')
  ]) as choices(value) where choices.value is not null offset 1 limit 1), 'Aucune'),
  specialization_3 = coalesce((select choices.value from unnest(array[
    nullif(member.specialization_instruction, 'Aucune'),
    nullif(member.specialization_pm, 'Aucune'),
    nullif(member.specialization_mdc, 'Aucune'),
    nullif(member.specialization_ing, 'Aucune')
  ]) as choices(value) where choices.value is not null offset 2 limit 1), 'Aucune')
where specialization_1 = 'Aucune'
  and specialization_2 = 'Aucune'
  and specialization_3 = 'Aucune';

notify pgrst, 'reload schema';
