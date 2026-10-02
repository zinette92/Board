-- La raison d'une mise en attente : « en attente du devis », « réponse de X »…
-- Elle s'affiche sur la carte, au bas du tableau, et n'a de sens que tant que
-- `waiting` est vrai — la retirer de l'attente la vide. Texte simple, jamais
-- nul, comme `work_plan`.
alter table public.cards
  add column if not exists waiting_reason text not null default '';

-- Contrôle : la colonne doit apparaître ci-dessous.
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_name = 'cards' and column_name = 'waiting_reason';
