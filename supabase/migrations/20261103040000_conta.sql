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

-- ───── trocar o próprio nome ─────
-- Limpa o nome (tira espaços das pontas, junta espaços repetidos, recusa caracteres de controle) e confere o tamanho de 2 a 30
-- caracteres (o mesmo limite da tabela). Devolve o nome como ficou guardado.
create or replace function public.change_my_name(novo text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  eu uuid := auth.uid();
  n text;
begin
  if eu is null then
    raise exception 'not allowed';
  end if;
  n := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(novo, '')), '\s+', ' ', 'g');
  if n ~ '[[:cntrl:]]' then
    raise exception 'invalid name';
  end if;
  if pg_catalog.char_length(n) < 2 or pg_catalog.char_length(n) > 30 then
    raise exception 'name length';
  end if;
  update public.profiles set display_name = n where id = eu;
  if not found then
    raise exception 'no profile';
  end if;
  return n;
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
grant execute on function public.change_my_name(text), public.delete_my_account() to authenticated;
