-- docs/propostas/: SQL proposto, NUNCA aplicado automaticamente (fica fora de supabase/migrations/ de propósito).
-- Origem: revisão independente de segurança da T15 (16/10/2026), testada num Postgres local com imitação do Supabase.
-- Para usar: o autor decide (B25); a proposta vira supabase/migrations/<data>_endurecer_comentarios.sql e passa por nova revisão.
-- Atenção antes de aplicar: o check de page_id (item 4) barra comentários em páginas cujo endereço fuja do padrão de hoje
-- (works/<obra>/<NN> e news/AAAA-MM-DD-<slug>); se o site ganhar outro tipo de página com comentários, ajuste o padrão.

-- PROPOSTA (revisão de segurança da T15) — NÃO aplicada. Idempotente.
-- Corrige: created_at/edited_at escolhidos pelo cliente (contorna o limite e falsifica datas), corrida no limite de
-- frequência, edição sem limite, corpo com espaços/linhas em branco sem fim, page_id livre, search_path das funções,
-- privilégios desnecessários.

-- 1) Na criação, as datas são sempre do servidor; envios da mesma pessoa entram um de cada vez (sem corrida).
create or replace function public.check_new_comment() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  new.edited_at := null;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hc-comments:' || new.user_id::text, 0));
  if exists (select 1 from public.comments where user_id = new.user_id and created_at > now() - interval '10 seconds') then
    raise exception 'rate limit: wait a few seconds';
  end if;
  if new.parent_id is not null and not exists (
       select 1 from public.comments where id = new.parent_id and page_id = new.page_id and parent_id is null) then
    raise exception 'invalid parent comment';
  end if;
  return new;
end $$;

-- 2) Edição: mesmas travas de antes + no máximo uma edição a cada 10 s por comentário.
create or replace function public.check_edit_comment() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.id := old.id; new.page_id := old.page_id; new.user_id := old.user_id;
  new.parent_id := old.parent_id; new.created_at := old.created_at;
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

-- 3) Perfil novo: search_path vazio (recomendação do Supabase para security definer).
alter function public.handle_new_user() set search_path = '';

-- 4) Corpo: no máximo 2000 caracteres no total e não pode ser só espaço/quebra de linha; page_id no formato dos IDs.
--    "not valid": vale para o que entrar daqui para frente, sem barrar a migração por causa de linhas antigas.
alter table public.comments drop constraint if exists comments_body_total;
alter table public.comments add constraint comments_body_total
  check (char_length(body) <= 2000 and btrim(body, E' \t\r\n') <> '') not valid;
alter table public.comments drop constraint if exists comments_page_id_formato;
alter table public.comments add constraint comments_page_id_formato
  check (page_id ~ '^(works/[a-z0-9-]+/[0-9]{2,3}|news/[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+)$') not valid;

-- 5) Privilégios: o site só lê perfis e lê/cria/edita/apaga comentários (o RLS continua decidindo quem).
revoke truncate, references, trigger on public.comments, public.profiles from anon, authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.comments from anon;
