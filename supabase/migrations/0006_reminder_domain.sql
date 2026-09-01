-- Domaine d'un rappel : les trois mêmes que les objectifs. Les rappels
-- existants deviennent « personnel » — à reclasser depuis leur fiche.
alter table public.reminders
  add column if not exists domain text not null default 'personal';

-- Contrôle : la colonne doit apparaître ci-dessous.
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_name = 'reminders' and column_name = 'domain';
