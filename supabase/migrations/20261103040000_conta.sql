-- Hᴀᴛᴇ Cʏᴄʟᴇ — a janela da conta (pedido do autor, 03/11/2026: "uma janela que aparece na tela e escurece a página atrás quando o
-- usuário clica no próprio nome"): trocar o próprio nome e apagar a própria conta.
--
-- Duas funções que o site chama (supabase-js: rpc). Cada uma só age sobre QUEM CHAMA (auth.uid()); ninguém troca o nome nem apaga a
-- conta de outra pessoa. Ninguém ganha permissão de mexer na tabela profiles direto (continua sem policy de update: o is_admin fica
-- intocável). Visitante sem conta não pode chamar nenhuma das duas.
--
-- Pode ser rodado mais de uma vez sem estragar nada (idempotente). Depende de 20261103000000_endurecer_comentarios.sql (o que acontece
-- com os comentários de uma conta apagada) e de 20261103020000_marca_paginas.sql (os marca-páginas vão junto).
-- Como aplicar: docs/comentarios-supabase.md, seção 5. Prova: tools/banco_local.py.

-- ───── a regra do nome (revisão independente de 03/11) ─────
-- Uma regra só, usada pelo cadastro (handle_new_user) e pela janela (change_my_name):
--   - todo espaço Unicode vira espaço comum; espaços repetidos viram um; sem espaços nas pontas;
--   - recusa o que não se vê ou embaralha a linha do comentário: caracteres de controle, de largura zero, de direção do texto (o RLO
--     invertia a data ao lado do nome), hífen suave, preenchimentos, braille vazio, BOM, tags;
--   - de 2 a 30 caracteres (o ZWJ e os seletores de variação dos emojis não contam como "visíveis");
--   - o nome do autor ("lusca", "sharktopus", sem acentos, maiúsculas nem pontuação) fica reservado para quem é admin. Homóglifos (um "с"
--     cirílico no lugar do "c") não dá para barrar: o que mostra o autor de verdade é o ✦ de admin.
alter table public.profiles add column if not exists name_changed_at timestamptz;

create or replace function public.limpar_nome(bruto text, eu uuid, out nome text, out por_que text)
language plpgsql stable set search_path = '' as $$
declare
  esqueleto text;
begin
  nome := pg_catalog.normalize(coalesce(bruto, ''), 'NFC');
  nome := pg_catalog.regexp_replace(nome, '[\s\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+', ' ', 'g');
  nome := pg_catalog.btrim(nome);
  if nome ~ '[[:cntrl:]\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u2800\u3164\uFEFF\uFFA0\uFFF9-\uFFFB\U000E0000-\U000E007F]' then
    nome := null; por_que := 'invalid name'; return;
  end if;
  if pg_catalog.char_length(pg_catalog.regexp_replace(nome, '[ \u200D\uFE00-\uFE0F]', '', 'g')) < 2 or pg_catalog.char_length(nome) > 30 then
    nome := null; por_que := 'name length'; return;
  end if;
  esqueleto := pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.normalize(nome, 'NFKD'), '[^a-zA-Z0-9]', '', 'g'));
  if (esqueleto like '%lusca%' or esqueleto like '%sharktopus%')
     and not exists (select 1 from public.profiles p where p.id = eu and p.is_admin) then
    nome := null; por_que := 'name taken'; return;
  end if;
end $$;
revoke execute on function public.limpar_nome(text, uuid) from public, anon, authenticated;

-- cadastro: a mesma regra; nome que não passa vira user-xxxxxx (nunca trava a criação da conta)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select * into r from public.limpar_nome(
    pg_catalog.left(pg_catalog.btrim(coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), 30),
    new.id);
  insert into public.profiles (id, display_name)
    values (new.id, coalesce(r.nome, 'user-' || pg_catalog.substr(new.id::text, 1, 6)));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───── trocar o próprio nome ─────
-- No máximo uma troca por hora (o nome aparece em todos os comentários antigos da pessoa: sem limite, dava para escrever com um nome
-- e "assinar" com outro depois). Salvar o mesmo nome de novo não gasta a troca. Devolve o nome como ficou guardado.
create or replace function public.change_my_name(novo text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  eu uuid := auth.uid();
  r record;
begin
  if eu is null then
    raise exception 'not allowed';
  end if;
  select * into r from public.limpar_nome(novo, eu);
  if r.nome is null then
    raise exception '%', r.por_que;
  end if;
  update public.profiles
    set name_changed_at = case when display_name = r.nome then name_changed_at else now() end,
        display_name = r.nome
    where id = eu and (name_changed_at is null or name_changed_at < now() - interval '1 hour' or display_name = r.nome);
  if not found then
    if exists (select 1 from public.profiles where id = eu) then
      raise exception 'rate limit: wait before renaming';
    end if;
    raise exception 'no profile';
  end if;
  return r.nome;
end $$;

-- ───── apagar a própria conta ─────
-- Apaga o usuário em auth.users; o resto vai junto, pelas regras que já existem: o perfil (on delete cascade), os marca-páginas (cascade
-- do perfil) e os comentários (before_delete_profile: as respostas e os comentários sem resposta somem; os que têm respostas de outras
-- pessoas viram "[comentário apagado]"). As sessões e os logins por Google/Discord/Twitter dessa conta também somem (o próprio Auth).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  eu uuid := auth.uid();
begin
  if eu is null then
    raise exception 'not allowed';
  end if;
  delete from auth.users where id = eu;
end $$;

-- ───── quem pode chamar ─────
revoke execute on function public.change_my_name(text), public.delete_my_account() from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.change_my_name(text), public.delete_my_account() to authenticated;
