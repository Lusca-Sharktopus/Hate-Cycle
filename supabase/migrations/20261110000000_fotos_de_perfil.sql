-- Hᴀᴛᴇ Cʏᴄʟᴇ — foto de perfil (pedido do autor, 09/11/2026, design "Profile Design.png" / "Icon Edit Design.png"): na janela da conta a
-- pessoa escolhe uma imagem, recorta num círculo e ela aparece na janela e ao lado do nome em cada comentário. Sem foto, o site mostra
-- uma runa sorteada (fixa para cada pessoa), sem nada no banco.
--
-- Como fica guardado:
--   - o arquivo, no Storage do Supabase, no "balde" público `avatars`, na pasta da própria pessoa: `<id da conta>/<nome aleatório>.webp`
--     (o navegador já manda a imagem recortada, 256 × 256, em WebP; o Safari, que não sabe gravar WebP, manda .jpg; o balde só aceita
--     esses dois tipos, até 200 KB);
--   - o caminho do arquivo em public.profiles.avatar_path (a lista pública de nomes, que os comentários já leem).
--
-- Quem pode o quê:
--   - qualquer visitante VÊ uma foto pelo endereço público (como vê o nome); ninguém lista a pasta de outra pessoa;
--   - só a própria pessoa (logada) põe e tira arquivos da SUA pasta, no máximo 3 de cada vez (a foto nova sobe antes de a velha sair);
--   - o caminho no perfil só muda por set_my_avatar(caminho), que só age sobre quem chama e só aceita um arquivo que já está na pasta
--     dessa pessoa (ou null, para tirar a foto). Devolve o caminho antigo, para o navegador apagar o arquivo velho.
--
-- Pode ser rodado mais de uma vez sem estragar nada (idempotente). Depende de 20261103040000_conta.sql.
-- Como aplicar: docs/comentarios-supabase.md, seção 5 (SQL Editor → colar → Run). Prova: tools/banco_local.py (casos "foto:").

-- ───── o caminho no perfil ─────
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles drop constraint if exists profiles_avatar_path_formato;
alter table public.profiles add constraint profiles_avatar_path_formato
  check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[a-z0-9]{12,40}\.(webp|jpg)$'));

-- ───── o balde ─────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 204800, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 204800, allowed_mime_types = array['image/webp', 'image/jpeg'];

-- quantos arquivos a pessoa já tem no balde (security definer: a policy de insert não pode ler a própria tabela sem recursão)
create or replace function public.avatars_da_pessoa(dono uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from storage.objects where bucket_id = 'avatars' and name like dono::text || '/%'
$$;
revoke execute on function public.avatars_da_pessoa(uuid) from public, anon;
grant execute on function public.avatars_da_pessoa(uuid) to authenticated;

drop policy if exists "avatars: ver os proprios" on storage.objects;
create policy "avatars: ver os proprios" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "avatars: subir na propria pasta" on storage.objects;
create policy "avatars: subir na propria pasta" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and name ~ ('^' || (select auth.uid())::text || '/[a-z0-9]{12,40}\.(webp|jpg)$')
    and public.avatars_da_pessoa((select auth.uid())) < 3
  );
drop policy if exists "avatars: apagar os proprios" on storage.objects;
create policy "avatars: apagar os proprios" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- sem policy de update: foto nova = arquivo novo (nome aleatório), e o endereço público nunca serve uma versão velha do cache

-- ───── trocar a foto do perfil ─────
create or replace function public.set_my_avatar(caminho text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  eu uuid := auth.uid();
  antigo text;
begin
  if eu is null then
    raise exception 'not allowed';
  end if;
  if caminho is not null then
    if caminho !~ ('^' || eu::text || '/[a-z0-9]{12,40}\.(webp|jpg)$') then
      raise exception 'invalid avatar';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = caminho) then
      raise exception 'avatar not found';
    end if;
  end if;
  select avatar_path into antigo from public.profiles where id = eu for update;
  update public.profiles set avatar_path = caminho where id = eu;
  return antigo;
end $$;
revoke execute on function public.set_my_avatar(text) from public, anon;
grant execute on function public.set_my_avatar(text) to authenticated;
