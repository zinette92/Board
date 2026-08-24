-- ============================================================================
--  perso-board — schéma initial
-- ============================================================================
--
-- Usage mono-utilisateur : chaque table porte `user_id`, et RLS n'autorise que
-- ses propres lignes. `default auth.uid()` évite au client d'avoir à envoyer
-- l'identifiant : il est déduit du jeton de session.
--
-- Convention : colonnes en snake_case (usage Postgres/PostgREST). La traduction
-- vers le camelCase de l'application se fait dans `src/lib/repo.ts`, et nulle
-- part ailleurs.
--
-- Les positions sont en `double precision` : le glisser-déposer insère entre
-- deux valeurs (moyenne) plutôt que de renuméroter toute la colonne.

-- ---------------------------------------------------------------- Tableaux --
create table if not exists public.boards (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  emoji text not null default '',
  position double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists boards_user_idx on public.boards (user_id);

-- ------------------------------------------------------------------ Listes --
create table if not exists public.lists (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  position double precision not null,
  -- Champ hérité : depuis le 18/08/2026 l'état « terminée » vit sur la carte.
  -- Conservé pour ne pas casser les lignes existantes.
  is_done boolean not null default false,
  wip_limit integer not null default 0,
  color text,
  collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists lists_board_idx on public.lists (user_id, board_id);

-- -------------------------------------------------------------- Étiquettes --
create table if not exists public.labels (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  -- Hex libre (#rrggbb) depuis la pipette, ou l'un des 8 noms historiques.
  color text not null,
  created_at timestamptz not null default now()
);
create index if not exists labels_user_idx on public.labels (user_id);

-- --------------------------------------------------------------- Objectifs --
create table if not exists public.goals (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  specific text not null default '',
  metric text not null default '',
  target double precision not null default 0,
  unit text not null default '',
  manual_progress double precision not null default 0,
  achievable text not null default '',
  relevant text not null default '',
  starts_on date not null,
  due_on date not null,
  -- Paliers : [{ id, label, target, dueOn }]. Toujours lus/écrits en bloc,
  -- jamais requêtés individuellement — d'où le JSON plutôt qu'une table.
  milestones jsonb not null default '[]'::jsonb,
  category text not null check (category in ('health', 'business', 'personal')),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  position double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists goals_user_idx on public.goals (user_id);

-- ------------------------------------------------------------------ Cartes --
create table if not exists public.cards (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  list_id uuid not null references public.lists(id) on delete cascade,
  title text not null,
  description text not null default '',
  position double precision not null,
  -- L'objectif peut disparaître sans emporter la tâche : elle est seulement
  -- détachée (même règle que dans l'application).
  goal_id uuid references public.goals(id) on delete set null,
  contribution double precision not null default 1,
  label_ids uuid[] not null default '{}',
  due_on date,
  due_time text,
  -- Coché à la main (le rond de la carte), jamais déduit de la liste.
  done_at timestamptz,
  checklists jsonb not null default '[]'::jsonb,
  attachment_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists cards_list_idx on public.cards (user_id, list_id);
create index if not exists cards_goal_idx on public.cards (user_id, goal_id);

-- ----------------------------------------------------------------- Rappels --
create table if not exists public.reminders (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  note text not null default '',
  label_ids uuid[] not null default '{}',
  starts_on date not null,
  at text not null default '09:00',
  -- null = rappel unique ; sinon { kind:'interval', interval, unit }
  -- ou { kind:'weekdays', days:[0-6] }.
  repeat jsonb,
  lead_days integer not null default 0,
  active boolean not null default true,
  -- Occurrences validées, une par une : ne PAS remplacer par une date-repère,
  -- sinon valider mardi validerait implicitement lundi.
  done_on date[] not null default '{}',
  notified_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reminders_user_idx on public.reminders (user_id);

-- ---------------------------------------------------------- Pièces jointes --
-- Les fichiers vivent dans le bucket Storage `attachments` ; cette table n'en
-- porte que les métadonnées, pour éviter de télécharger les octets rien que
-- pour afficher un nom et une taille.
create table if not exists public.attachments (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  name text not null,
  mime text not null,
  size bigint not null,
  -- Chemin dans le bucket : `{user_id}/{attachment_id}`.
  path text not null,
  created_at timestamptz not null default now()
);
create index if not exists attachments_card_idx on public.attachments (user_id, card_id);

-- ----------------------------------------------------------------- Réglages --
create table if not exists public.meta (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key text not null,
  value jsonb,
  primary key (user_id, key)
);

-- ------------------------------------------------------------- updated_at --
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['boards', 'lists', 'goals', 'cards', 'reminders'] loop
    execute format(
      'drop trigger if exists %I on public.%I', t || '_touch_updated_at', t
    );
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  end loop;
end $$;

-- ------------------------------------------------------------------ Droits --
-- RLS filtre les lignes ; les rôles API ont besoin des droits de base en plus.
grant usage on schema public to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'boards', 'lists', 'labels', 'goals', 'cards', 'reminders', 'attachments', 'meta'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create policy %I on public.%I for all
         using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_owner', t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------- Storage --
-- Buckets privés : les fichiers ne sont accessibles que par URL signée.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false), ('wallpapers', 'wallpapers', false)
on conflict (id) do nothing;

-- Un dossier par utilisateur (`{user_id}/…`) : la politique compare le premier
-- segment du chemin à l'identifiant de session.
do $$
declare b text;
begin
  foreach b in array array['attachments', 'wallpapers'] loop
    execute format('drop policy if exists %I on storage.objects', b || '_owner');
    execute format(
      'create policy %I on storage.objects for all to authenticated
         using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)
         with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)',
      b || '_owner', b, b
    );
  end loop;
end $$;
