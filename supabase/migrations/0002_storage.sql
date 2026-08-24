-- ============================================================================
--  perso-board — Storage (buckets + accès)
-- ============================================================================
--
-- Séparé de `0001_init.sql` : sur certains projets, la partie Storage n'est pas
-- exécutable depuis l'éditeur SQL (le rôle de l'éditeur n'est pas propriétaire
-- de `storage.objects`). Isoler ce morceau permet de voir l'erreur exacte
-- plutôt que de la noyer dans un script de 220 lignes.
--
-- Si ce fichier échoue, créer les deux buckets à la main —
-- Dashboard → Storage → New bucket, en **Private** — puis relancer : la partie
-- `insert` ne fera alors rien et seules les politiques seront posées.

-- Buckets privés : les fichiers ne sont lisibles que par URL signée.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false), ('wallpapers', 'wallpapers', false)
on conflict (id) do nothing;

-- Un dossier par utilisateur (`{user_id}/…`) : la politique compare le premier
-- segment du chemin à l'identifiant de la session.
drop policy if exists "attachments_owner" on storage.objects;
create policy "attachments_owner" on storage.objects for all to authenticated
  using (
    bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wallpapers_owner" on storage.objects;
create policy "wallpapers_owner" on storage.objects for all to authenticated
  using (
    bucket_id = 'wallpapers' and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'wallpapers' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Contrôle : doit renvoyer les deux buckets.
select id, public from storage.buckets where id in ('attachments', 'wallpapers');
