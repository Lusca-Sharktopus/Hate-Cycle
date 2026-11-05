-- Hᴀᴛᴇ Cʏᴄʟᴇ — reforço de segurança dos comentários (B25) + "[comentário apagado]" (pedido do autor de 02/11/2026, opção b).
--
-- Origem: a proposta da revisão de segurança da T15 (docs/propostas/endurecer-comentarios.sql, 16/10/2026) e a decisão do autor
-- sobre comentário apagado que tem respostas: ele vira "[comentário apagado]" e as respostas das outras pessoas ficam.
-- O autor decidiu também (02/11) deixar a lista pública de nomes das contas (public.profiles) como está.
--
-- Pode ser rodado mais de uma vez sem estragar nada (idempotente). Como aplicar no projeto do ar: docs/comentarios-supabase.md,
-- seção "Migração de 03/11/2026: reforço do banco". Prova num Postgres local com imitação do Supabase: tools/banco_local.py.
--
-- O que muda:
--  1) datas sempre do servidor ao criar; envios da mesma pessoa entram um de cada vez (o limite de 10 s não é mais burlável);
--     resposta não pode ir para comentário apagado;
--  2) edição: no máximo uma a cada 10 s por comentário; comentário apagado não se edita;
--  3) comentário apagado que tem respostas fica como "[comentário apagado]" (texto e dono somem; as respostas ficam);
--     sem respostas, é apagado de vez; quando a última resposta de um comentário apagado some, ele some junto;
--  4) conta apagada: as respostas e os comentários sem resposta dela somem; os com respostas de outras pessoas viram "[comentário apagado]";
--  5) corpo não pode ser só espaço/quebra de linha; page_id só nos formatos dos IDs de página do site (works/, news/ e blog/);
--  6) funções com search_path fixo; o site perde permissões que nunca usou.

-- ───── 1) colunas e dono que pode faltar (conta apagada) ─────
alter table public.comments add column if not exists edited_at timestamptz;   -- (bloco 5 do setup; garante para projeto que não o rodou)
alter table public.comments add column if not exists deleted_at timestamptz;
alter table public.comments alter column user_id drop not null;
alter table public.comments drop constraint if exists comments_user_id_fkey;
alter table public.comments add constraint comments_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

-- ───── 2) criação: datas do servidor, um envio de cada vez por pessoa, resposta só a comentário raiz vivo da mesma página ─────
-- security definer: o "for share" no comentário-pai precisa ler a linha de outra pessoa sem as policies de update (que só deixam ver as
-- próprias); os comentários já são públicos para leitura, e quem pode inserir continua decidido pela policy de insert.
create or replace function public.check_new_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- pelo site, só em nome próprio (recusa cedo, antes do limite; o RLS também recusaria). SQL do painel (sem auth.uid()) passa.
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;
  new.created_at := now();
  new.edited_at := null;
  new.deleted_at := null;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hc-comments:' || new.user_id::text, 0));
  if exists (select 1 from public.comments where user_id = new.user_id and created_at > now() - interval '10 seconds') then
    raise exception 'rate limit: wait a few seconds';
  end if;
  if new.parent_id is not null then
    -- trava o comentário-pai enquanto confere (sem corrida com quem o apaga ao mesmo tempo)
    perform 1 from public.comments
      where id = new.parent_id and page_id = new.page_id and parent_id is null and deleted_at is null
      for share;
    if not found then
      raise exception 'invalid parent comment';
    end if;
  end if;
  return new;
end $$;

-- o gatilho de criação (bloco 3 do setup), recriado para valer em qualquer projeto
drop trigger if exists comments_check on public.comments;
create trigger comments_check before insert on public.comments
  for each row execute function public.check_new_comment();

-- ───── 3) edição: só o texto muda; uma edição a cada 10 s; marcar como apagado; conta apagada ─────
create or replace function public.check_edit_comment() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.id := old.id; new.page_id := old.page_id; new.parent_id := old.parent_id; new.created_at := old.created_at;
  -- conta apagada: o próprio banco (ON DELETE SET NULL de user_id) tira o dono. Pelo site isso não passa: a policy de update
  -- exige auth.uid() = user_id DEPOIS deste gatilho, e user_id nulo nunca é igual.
  if new.user_id is null and old.user_id is not null then
    new.body := '[apagado]'; new.edited_at := old.edited_at; new.deleted_at := coalesce(old.deleted_at, now());
    return new;
  end if;
  new.user_id := old.user_id;
  if old.deleted_at is not null then
    raise exception 'deleted comment cannot be edited';
  end if;
  if new.deleted_at is not null then
    -- apagar um comentário que tem respostas (feito pelo gatilho de exclusão abaixo): o texto e o dono somem, as respostas ficam.
    -- Pelo site isso não passa (a policy de update exige auth.uid() = user_id, que fica nulo): só o gatilho de exclusão faz.
    new.user_id := null; new.body := '[apagado]'; new.edited_at := old.edited_at; new.deleted_at := now();
    return new;
  end if;
  if new.body is distinct from old.body then
    if old.edited_at is not null and old.edited_at > now() - interval '10 seconds' then
      raise exception 'rate limit: wait a few seconds';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end $$;

-- o bloco 5 do setup (editar comentários): policy de update do próprio e gatilho de edição. Projetos criados com um setup antigo
-- (como o do autor, conferido em 03/11/2026: "trigger comments_edit_check does not exist") não o têm; aqui ele passa a existir sempre.
drop policy if exists "editar o proprio comentario" on public.comments;
create policy "editar o proprio comentario" on public.comments for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists comments_edit_check on public.comments;
create trigger comments_edit_check before update on public.comments
  for each row execute function public.check_edit_comment();

-- ───── 4) apagar: com respostas, vira "[comentário apagado]"; sem, some de vez ─────
-- Roda com os privilégios do dono das tabelas (security definer) só para fazer a troca; QUEM pode apagar continua sendo decidido
-- pela policy de delete ("apagar o proprio ou ser admin"), que o banco confere antes deste gatilho.
create or replace function public.soft_delete_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.parent_id is null and exists (select 1 from public.comments r where r.parent_id = old.id) then
    update public.comments set deleted_at = now() where id = old.id and deleted_at is null;
    return null; -- cancela a exclusão desta linha
  end if;
  return old;
end $$;
drop trigger if exists comments_soft_delete on public.comments;
create trigger comments_soft_delete before delete on public.comments
  for each row execute function public.soft_delete_comment();

-- quando some a última resposta de um comentário apagado, ele some junto
create or replace function public.cleanup_deleted_parent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.parent_id is not null then
    -- trava o pai antes de conferir (duas pessoas apagando as duas últimas respostas ao mesmo tempo não deixam "[apagado]" sozinho)
    perform 1 from public.comments where id = old.parent_id for update;
    delete from public.comments p
    where p.id = old.parent_id and p.deleted_at is not null
      and not exists (select 1 from public.comments r where r.parent_id = p.id);
  end if;
  return null;
end $$;
drop trigger if exists comments_cleanup on public.comments;
create trigger comments_cleanup after delete on public.comments
  for each row execute function public.cleanup_deleted_parent();

-- conta apagada (auth.users → profiles): antes de o banco tirar o dono dos comentários, some com o que não tem resposta de ninguém
create or replace function public.before_delete_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.comments where user_id = old.id and parent_id is not null;
  delete from public.comments c
  where c.user_id = old.id and c.parent_id is null
    and not exists (select 1 from public.comments r where r.parent_id = c.id);
  return old;
end $$;
drop trigger if exists profiles_before_delete on public.profiles;
create trigger profiles_before_delete before delete on public.profiles
  for each row execute function public.before_delete_profile();

-- ───── 5) perfil novo: search_path vazio (recomendação do Supabase para security definer) ─────
-- recriada inteira (igual à do setup, só com search_path vazio), com o gatilho, para valer também em projeto criado com setup antigo
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n text;
begin
  n := trim(coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''));
  if char_length(n) > 30 then n := left(n, 30); end if;
  if char_length(n) < 2 then n := 'user-' || substr(new.id::text, 1, 6); end if;
  insert into public.profiles (id, display_name) values (new.id, n);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- as regras de acesso (blocos 1 e 2 do setup), recriadas iguais, pelo mesmo motivo
alter table public.profiles enable row level security;
alter table public.comments enable row level security;
drop policy if exists "perfis sao publicos" on public.profiles;
create policy "perfis sao publicos" on public.profiles for select using (true);
drop policy if exists "comentarios sao publicos" on public.comments;
create policy "comentarios sao publicos" on public.comments for select using (true);
drop policy if exists "quem tem conta pode comentar" on public.comments;
create policy "quem tem conta pode comentar" on public.comments for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "apagar o proprio ou ser admin" on public.comments;
create policy "apagar o proprio ou ser admin" on public.comments for delete to authenticated
  using (auth.uid() = user_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ───── 6) corpo e page_id ─────
-- page_id: os IDs de página do site — works/<obra>/<NN>, news/<pasta> e (desde 03/11, seção nova) blog/<pasta>. tests/supabase.test.ts confere
-- que toda pasta de content/ cabe neste formato (obra ou post com letra maiúscula, acento ou "_" quebraria os comentários daquela página).
-- Antes de valer, limpa o que ficaria de fora (no projeto do ar, a tabela estava vazia em 02/11/2026; isto é só para nunca travar):
-- comentário em página que não existe no site some; data no futuro vira agora. Com os gatilhos desligados só durante a limpeza.
alter table public.comments disable trigger comments_edit_check;
alter table public.comments disable trigger comments_soft_delete;
alter table public.comments disable trigger comments_cleanup;
delete from public.comments
  where page_id !~ '^(works/[a-z0-9-]+/[0-9]{2,3}|(news|blog)/[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+)$'
     or btrim(body, E' \t\r\n') = '' or char_length(body) > 2000;
update public.comments set created_at = now() where created_at > now();
update public.comments set edited_at = now() where edited_at > now();
alter table public.comments enable trigger comments_edit_check;
alter table public.comments enable trigger comments_soft_delete;
alter table public.comments enable trigger comments_cleanup;
alter table public.comments drop constraint if exists comments_body_total;
alter table public.comments add constraint comments_body_total
  check (char_length(body) <= 2000 and btrim(body, E' \t\r\n') <> '');
alter table public.comments drop constraint if exists comments_page_id_formato;
alter table public.comments add constraint comments_page_id_formato
  check (page_id ~ '^(works/[a-z0-9-]+/[0-9]{2,3}|(news|blog)/[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+)$');

-- índices: o limite de 10 s (por pessoa) e as respostas de um comentário, sem percorrer a tabela inteira
create index if not exists comments_user_created_idx on public.comments (user_id, created_at);
create index if not exists comments_parent_idx on public.comments (parent_id);

-- ───── 7) privilégios: o site só lê perfis e lê/cria/edita/apaga comentários (o RLS continua decidindo quem) ─────
revoke truncate, references, trigger on public.comments, public.profiles from anon, authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.comments from anon;
revoke execute on function public.check_new_comment(), public.soft_delete_comment(), public.cleanup_deleted_parent(), public.before_delete_profile()
  from public, anon, authenticated;
