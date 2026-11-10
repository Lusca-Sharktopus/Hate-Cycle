-- Hᴀᴛᴇ Cʏᴄʟᴇ — imagens nos comentários (pedido do autor, 10/11/2026): quem tem conta pode anexar até 4 imagens (ou GIFs) a um
-- comentário. A imagem fica no Storage do Supabase e o comentário guarda, numa linha própria do texto, o caminho dela:
-- {img:<id da conta>/<nome aleatório>.webp}. (Os GIFs do KLIPY não passam por aqui: o comentário guarda o endereço do KLIPY.)
--
-- Como fica guardado:
--   - o arquivo, no "balde" público `comment-images`, na pasta da própria pessoa: `<id da conta>/<nome aleatório>.<webp|jpg|gif>`
--     (o navegador já reduz a imagem para no máximo 1600 px e grava em WebP; o Safari grava JPEG; GIF animado vai como está);
--     o balde só aceita esses três tipos, até 2 MB cada.
--
-- Quem pode o quê:
--   - qualquer visitante VÊ uma imagem pelo endereço público (como vê o comentário); ninguém lista a pasta de outra pessoa;
--   - só a própria pessoa (logada) põe arquivos na SUA pasta: no máximo 30 por dia e 500 no total (trava contra quem tentasse usar o
--     balde do site como depósito);
--   - a pessoa apaga os próprios arquivos (o site apaga sozinho ao apagar o comentário ou tirar a imagem na edição); o admin
--     (profiles.is_admin) apaga qualquer um, para moderar.
--
-- Pode ser rodado mais de uma vez sem estragar nada (idempotente). Depende de 20261016000000_inicial.sql (public.profiles).
-- Como aplicar: docs/comentarios-supabase.md, seção 5 (SQL Editor → colar → Run). Prova: tools/banco_local.py (casos "imagem:").

-- ───── o balde ─────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comment-images', 'comment-images', true, 2097152, array['image/webp', 'image/jpeg', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/webp', 'image/jpeg', 'image/gif'];

-- quantos arquivos QUEM CHAMA subiu (desde `desde`; null = no total). security definer: a policy de insert não pode ler a própria
-- tabela sem recursão. Sem parâmetro de pessoa: ninguém conta a pasta de outra.
create or replace function public.minhas_imagens(desde timestamptz default null) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from storage.objects
  where bucket_id = 'comment-images' and name like auth.uid()::text || '/%' and (desde is null or created_at >= desde)
$$;
revoke execute on function public.minhas_imagens(timestamptz) from public, anon;
grant execute on function public.minhas_imagens(timestamptz) to authenticated;

-- a pessoa é admin? (para a moderação apagar arquivos de qualquer um)
create or replace function public.sou_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;
revoke execute on function public.sou_admin() from public, anon;
grant execute on function public.sou_admin() to authenticated;

drop policy if exists "comment-images: ver os proprios" on storage.objects;
create policy "comment-images: ver os proprios" on storage.objects for select to authenticated
  using (bucket_id = 'comment-images' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.sou_admin())));
drop policy if exists "comment-images: subir na propria pasta" on storage.objects;
create policy "comment-images: subir na propria pasta" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comment-images'
    and name ~ ('^' || (select auth.uid())::text || '/[a-z0-9]{12,40}\.(webp|jpg|gif)$')
    and public.minhas_imagens(now() - interval '24 hours') < 30
    and public.minhas_imagens() < 500
  );
drop policy if exists "comment-images: apagar os proprios ou moderar" on storage.objects;
create policy "comment-images: apagar os proprios ou moderar" on storage.objects for delete to authenticated
  using (bucket_id = 'comment-images' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.sou_admin())));
-- sem policy de update: imagem nova = arquivo novo (nome aleatório), e o endereço público nunca serve uma versão velha do cache
