-- Mise en attente manuelle d'une carte.
-- Rien à voir avec `schedule` : c'est un drapeau que le user pose lui-même.
alter table public.cards
  add column if not exists waiting boolean not null default false;

-- Contrôle : la colonne doit apparaître ci-dessous.
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_name = 'cards' and column_name = 'waiting';
