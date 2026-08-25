-- ============================================================================
--  perso-board — cartes modèles
-- ============================================================================
--
-- Une « liste de modèles » contient des cartes gabarits. Elles se comportent
-- comme n'importe quelle carte, avec deux gestes en plus : les dupliquer, et
-- programmer l'envoi d'une **copie** dans une autre liste à une date donnée
-- (« revue hebdo », « déclaration d'impôts »…). L'original ne bouge jamais.
--
-- Rejouable sans dommage : `if not exists` partout.

alter table public.lists
  add column if not exists is_template boolean not null default false;

-- { listName, nextOn, repeat, setDueDate, active, lastRunOn } — voir
-- `CardSchedule` dans src/lib/types.ts. La destination est mémorisée par NOM
-- et non par identifiant, ce qui permet de recréer la liste si elle a été
-- supprimée plutôt que de perdre l'envoi.
alter table public.cards
  add column if not exists schedule jsonb;

-- Retrouver rapidement les envois à faire au chargement de l'application.
create index if not exists cards_schedule_idx
  on public.cards ((schedule ->> 'nextOn'))
  where schedule is not null;

-- Contrôle : les deux colonnes doivent apparaître.
select table_name, column_name, data_type
from information_schema.columns
where (table_name = 'lists' and column_name = 'is_template')
   or (table_name = 'cards' and column_name = 'schedule')
order by table_name;
