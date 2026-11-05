-- Hᴀᴛᴇ Cʏᴄʟᴇ — histórias favoritas (pedido do autor, 03/11/2026: estrela na capa ao passar o mouse, como os GIFs favoritados do Discord,
-- e um botão no topo da página Histórias para mostrar só as favoritas; sem conta, uma janela avisa que o recurso exige login).
--
-- Cada pessoa com conta guarda as SUAS histórias favoritas: o identificador da obra (o nome da pasta em content/works/, igual nos dois
-- idiomas, ex.: "firestriker"). Ninguém vê os favoritos de outra pessoa; visitante sem conta não toca na tabela.
-- As mesmas proteções dos marca-páginas (revisão independente de 03/11): data do servidor, quem grava em nome de outra pessoa é recusado
-- antes de tudo, limite por pessoa contado com uma trava (pedidos simultâneos não passam dele), privilégios mínimos.
--
-- Pode ser rodado mais de uma vez sem estragar nada (idempotente). Depende de 20261103000000_endurecer_comentarios.sql (public.profiles).
-- Como aplicar: docs/comentarios-supabase.md, seção 5. Prova: tools/banco_local.py.

create table if not exists public.favorites (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  work_id text not null check (work_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(work_id) <= 80),
  created_at timestamptz not null default now(),
  primary key (user_id, work_id)
);
alter table public.favorites enable row level security;

drop policy if exists "favoritos: ler os proprios" on public.favorites;
create policy "favoritos: ler os proprios" on public.favorites for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "favoritos: criar os proprios" on public.favorites;
create policy "favoritos: criar os proprios" on public.favorites for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "favoritos: apagar os proprios" on public.favorites;
create policy "favoritos: apagar os proprios" on public.favorites for delete to authenticated using ((select auth.uid()) = user_id);
-- sem policy de update: um favorito só entra ou sai

-- data sempre do servidor; no máximo 300 favoritos por pessoa (o site tem poucas obras; o limite só impede alguém de usar a tabela como
-- depósito); favoritar de novo a mesma obra não conta
create or replace function public.check_favorite() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    raise exception 'not allowed';
  end if;
  new.created_at := now();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hc-favorites:' || new.user_id::text, 0));
  if not exists (select 1 from public.favorites where user_id = new.user_id and work_id = new.work_id)
     and (select count(*) from public.favorites where user_id = new.user_id) >= 300 then
    raise exception 'too many favorites';
  end if;
  return new;
end $$;
drop trigger if exists favorites_check on public.favorites;
create trigger favorites_check before insert on public.favorites
  for each row execute function public.check_favorite();

-- privilégios: visitante sem conta não toca na tabela; quem tem conta lê/cria/apaga (o RLS decide que só os próprios)
revoke all on public.favorites from anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;
revoke execute on function public.check_favorite() from public, anon, authenticated;
