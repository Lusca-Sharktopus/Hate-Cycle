-- Hᴀᴛᴇ Cʏᴄʟᴇ — migração inicial do banco dos comentários (Supabase CLI), registrada na T15 (16/10/2026).
--
-- É o banco que já está no ar: uma CÓPIA EXATA do supabase-setup.sql (blocos 1 a 5), guardada como a primeira migração
-- para que, daqui para frente, toda mudança no banco seja um arquivo NOVO nesta pasta (passo a passo em
-- docs/comentarios-supabase.md, seção "Migrações").
--
-- ⚠ NÃO rode este arquivo no projeto que já está no ar: lá tudo isto já existe (o "create table" daria erro).
--   No projeto do ar, esta migração é só MARCADA como já aplicada (supabase migration repair --status applied 20261016000000).
--   Num projeto novo (ou no Supabase local, `supabase start`), ela cria tudo do zero.
-- Prova de que é igual: tests/supabase.test.ts (tudo abaixo da linha marcada = supabase-setup.sql, byte a byte).
--
-- ───── daqui para baixo: cópia exata de supabase-setup.sql ─────
-- Hᴀᴛᴇ Cʏᴄʟᴇ — banco de dados dos comentários (Supabase)
-- Cole TUDO isto no "SQL Editor" do Supabase e clique em Run. Pode rodar uma vez só.

-- 1) Perfis (nome público de cada conta)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 30),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "perfis sao publicos" on public.profiles for select using (true);
-- (sem policy de insert/update: ninguém consegue se promover a admin pelo site)

-- cria o perfil automaticamente quando alguém cria conta
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  n := trim(coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''));
  if char_length(n) > 30 then n := left(n, 30); end if;
  if char_length(n) < 2 then n := 'user-' || substr(new.id::text, 1, 6); end if;
  insert into public.profiles (id, display_name) values (new.id, n);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Comentários
create table public.comments (
  id bigint generated always as identity primary key,
  page_id text not null check (char_length(page_id) between 1 and 200),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  parent_id bigint references public.comments(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index comments_page_idx on public.comments (page_id, created_at);
alter table public.comments enable row level security;

create policy "comentarios sao publicos" on public.comments for select using (true);
create policy "quem tem conta pode comentar" on public.comments for insert to authenticated
  with check (auth.uid() = user_id);
create policy "apagar o proprio ou ser admin" on public.comments for delete to authenticated
  using (auth.uid() = user_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- 3) Anti-spam: 1 comentário a cada 10 segundos por pessoa; respostas só na mesma página, 1 nível
create or replace function public.check_new_comment() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.comments where user_id = new.user_id and created_at > now() - interval '10 seconds') then
    raise exception 'rate limit: wait a few seconds';
  end if;
  if new.parent_id is not null and not exists (
       select 1 from public.comments where id = new.parent_id and page_id = new.page_id and parent_id is null) then
    raise exception 'invalid parent comment';
  end if;
  return new;
end $$;
create trigger comments_check before insert on public.comments
  for each row execute function public.check_new_comment();

-- 4) DEPOIS de criar a SUA conta no site, torne-se admin (pode apagar qualquer comentário).
--    Troque o e-mail, tire os "--" do começo das 3 linhas e rode:
-- update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'SEU-EMAIL@exemplo.com');


-- 5) EDITAR COMENTÁRIOS (rode este bloco também em projetos que já tinham o script antigo)
alter table public.comments add column if not exists edited_at timestamptz;

drop policy if exists "editar o proprio comentario" on public.comments;
create policy "editar o proprio comentario" on public.comments for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- só o texto pode mudar; o resto fica travado e a data de edição é marcada automaticamente
create or replace function public.check_edit_comment() returns trigger language plpgsql as $$
begin
  new.id := old.id; new.page_id := old.page_id; new.user_id := old.user_id;
  new.parent_id := old.parent_id; new.created_at := old.created_at;
  if new.body is distinct from old.body then new.edited_at := now(); else new.edited_at := old.edited_at; end if;
  return new;
end $$;
drop trigger if exists comments_edit_check on public.comments;
create trigger comments_edit_check before update on public.comments
  for each row execute function public.check_edit_comment();
