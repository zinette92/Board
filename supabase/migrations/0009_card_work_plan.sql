-- Le plan de travail d'une carte : du texte libre, à côté de la description.
-- La description dit ce qu'est la tâche ; le plan de travail dit comment on
-- s'y prend. Colonne texte simple, jamais nulle — une carte sans plan porte
-- la chaîne vide, ce qui évite un cas « null » dans toute l'application.
alter table public.cards
  add column if not exists work_plan text not null default '';

-- Contrôle : la colonne doit apparaître ci-dessous.
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_name = 'cards' and column_name = 'work_plan';
