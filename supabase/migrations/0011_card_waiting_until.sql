-- La date de relance d'une carte en attente : « rappelle-moi le 3 novembre ».
-- Sans elle, une carte mise en attente dort dans WAITING sans que rien ne la
-- réveille. Nulle quand aucune relance n'est prévue, vidée en même temps que
-- la raison quand la carte sort de l'attente.
alter table public.cards
  add column if not exists waiting_until date;

-- Contrôle : la colonne doit apparaître ci-dessous.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'cards' and column_name = 'waiting_until';
