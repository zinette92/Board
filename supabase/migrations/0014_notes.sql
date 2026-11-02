-- Les notes : un carnet à part du tableau, rangé par catégories que le user
-- crée lui-même — elles ne se mélangent pas aux étiquettes des cartes, qui
-- répondent à un autre besoin.
--
-- Mêmes conventions que le reste : `user_id` sur chaque ligne, identifiant
-- fourni par le client, positions en `double precision` pour insérer entre
-- deux sans tout renuméroter.

create table if not exists public.note_categories (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  -- Hex libre (#rrggbb), comme les étiquettes.
  color text not null,
  position double precision not null,
  created_at timestamptz not null default now()
);
create index if not exists note_categories_user_idx on public.note_categories (user_id);

create table if not exists public.notes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Catégorie supprimée : la note survit, rangée nulle part, plutôt que de
  -- disparaître avec elle.
  category_id uuid references public.note_categories(id) on delete set null,
  title text not null default '',
  -- Markdown, comme la description d'une carte.
  body text not null default '',
  position double precision not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_user_idx on public.notes (user_id, category_id);

-- RLS : une ligne n'appartient qu'à son propriétaire, lecture comme écriture.
do $$
declare t text;
begin
  foreach t in array array['note_categories', 'notes'] loop
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

-- Contrôle : les deux tables, et leurs politiques.
select tablename, policyname from pg_policies
where schemaname = 'public' and tablename in ('notes', 'note_categories');
