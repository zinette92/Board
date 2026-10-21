-- L'heure de la relance d'une carte en attente, « HH:MM » ou null. Même
-- découpage que l'échéance d'une carte (`due_on` / `due_time`) : la date dans
-- sa colonne, l'heure dans la sienne. Nulle quand la relance n'a pas d'heure.
alter table public.cards
  add column if not exists waiting_time text;

-- Contrôle : la colonne doit apparaître ci-dessous.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'cards' and column_name = 'waiting_time';
