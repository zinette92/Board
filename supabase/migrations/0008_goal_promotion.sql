-- Une étape d'objectif peut devenir un objectif d'une période plus courte.
-- L'objectif dérivé garde le lien vers son origine ; l'étape porte l'id du
-- dérivé, dans la colonne jsonb `steps` (aucune colonne à ajouter pour elle).
alter table public.goals
  add column if not exists source_goal_id uuid references public.goals(id) on delete set null,
  add column if not exists source_step_id uuid;

create index if not exists goals_source_goal_idx on public.goals (source_goal_id)
  where source_goal_id is not null;

-- Contrôle : les deux colonnes doivent apparaître ci-dessous.
select table_name, column_name, data_type
from information_schema.columns
where table_name = 'goals' and column_name in ('source_goal_id', 'source_step_id');
