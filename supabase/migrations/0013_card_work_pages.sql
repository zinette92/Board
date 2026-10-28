-- Le plan de travail devient un carnet de PAGES : un titre, du markdown et la
-- date de dernière touche par page. Même rangement que les checklists — un
-- jsonb sur la carte, rien de plus.
alter table public.cards
  add column if not exists work_pages jsonb not null default '[]'::jsonb;

-- Les plans déjà écrits deviennent leur première page, sans rien perdre.
-- `work_plan` reste en place, inutilisé : la colonne ne coûte rien et garde
-- une copie du texte d'avant, au cas où.
update public.cards
set work_pages = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'title', 'Plan',
    'content', work_plan,
    'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
)
where coalesce(work_plan, '') <> '' and work_pages = '[]'::jsonb;

-- Contrôle : la colonne, puis le nombre de cartes déjà dotées d'une page.
select table_name, column_name, data_type
from information_schema.columns
where table_name = 'cards' and column_name = 'work_pages';

select count(*) as cartes_avec_page from public.cards where work_pages <> '[]'::jsonb;
