-- Période d'un objectif : hebdo, mensuel, 90 jours (cycles ancrés au
-- 1er octobre 2026) ou annuel. Les objectifs existants deviennent mensuels.
alter table public.goals
  add column if not exists period text not null default 'monthly';

-- Contrôle : la colonne doit apparaître ci-dessous.
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_name = 'goals' and column_name = 'period';
