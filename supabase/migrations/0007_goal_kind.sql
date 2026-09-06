-- Forme d'un objectif : simple (tout ou rien), steps (liste d'étapes) ou
-- smart (formulaire complet). L'existant devient « smart », la seule forme
-- qui existait jusqu'ici.
alter table public.goals
  add column if not exists kind text not null default 'smart',
  add column if not exists steps jsonb not null default '[]'::jsonb;

-- Contrôle : les deux colonnes doivent apparaître ci-dessous.
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_name = 'goals' and column_name in ('kind', 'steps');
