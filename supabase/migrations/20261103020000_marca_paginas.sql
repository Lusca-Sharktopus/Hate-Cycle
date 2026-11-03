-- Hᴀᴛᴇ Cʏᴄʟᴇ — marca-páginas (pedido do autor; decisões de 02/11/2026, docs/BACKLOG.md → "Marca-página: decisões").
--
-- Cada pessoa com conta guarda UM marca-página por capítulo: onde parou, como "parágrafo + fração dentro dele" (não em pixels, para valer
-- em qualquer tela; noutro aparelho o marcador pode cair um pouco acima ou abaixo, no mesmo parágrafo). Sem conta, o marca-página fica só
-- no navegador (localStorage, código do site); ao entrar, o do navegador sobe para a conta só nos capítulos em que a conta ainda não tem
-- marca-página (a conta tem prioridade). Ninguém vê o marca-página de outra pessoa.
--
-- Pode ser rodado mais de uma vez sem estragar nada (idempotente). Depende de 20261103000000_endurecer_comentarios.sql (public.profiles).
-- Como aplicar: docs/comentarios-supabase.md, seção 5. Prova: tools/banco_local.py.

create table if not exists public.bookmarks (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  page_id text not null check (page_id ~ '^works/[a-z0-9-]+/[0-9]{2,3}$'),
  paragrafo integer not null check (paragrafo between 0 and 100000),
  fracao real not null default 0 check (fracao >= 0 and fracao <= 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, page_id)
);
alter table public.bookmarks enable row level security;

drop policy if exists "marca-paginas: ler os proprios" on public.bookmarks;
create policy "marca-paginas: ler os proprios" on public.bookmarks for select to authenticated using (auth.uid() = user_id);
drop policy if exists "marca-paginas: criar os proprios" on public.bookmarks;
create policy "marca-paginas: criar os proprios" on public.bookmarks for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "marca-paginas: mudar os proprios" on public.bookmarks;
create policy "marca-paginas: mudar os proprios" on public.bookmarks for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "marca-paginas: apagar os proprios" on public.bookmarks;
create policy "marca-paginas: apagar os proprios" on public.bookmarks for delete to authenticated using (auth.uid() = user_id);

-- data sempre do servidor; dono e capítulo não mudam depois de criado; no máximo 1000 marca-páginas por pessoa (o site tem dezenas de
-- capítulos; o limite só impede alguém de usar a tabela como depósito)
create or replace function public.check_bookmark() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.page_id := old.page_id;
  elsif (select count(*) from public.bookmarks where user_id = new.user_id) >= 1000 then
    raise exception 'too many bookmarks';
  end if;
  return new;
end $$;
drop trigger if exists bookmarks_check on public.bookmarks;
create trigger bookmarks_check before insert or update on public.bookmarks
  for each row execute function public.check_bookmark();

-- privilégios: visitante sem conta não toca na tabela; quem tem conta lê/cria/muda/apaga (o RLS decide que só os próprios)
revoke all on public.bookmarks from anon;
revoke truncate, references, trigger on public.bookmarks from authenticated;
grant select, insert, update, delete on public.bookmarks to authenticated;
revoke execute on function public.check_bookmark() from public, anon, authenticated;
