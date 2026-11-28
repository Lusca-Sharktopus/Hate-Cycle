-- Hᴀᴛᴇ Cʏᴄʟᴇ — novidades e notificações (pedido do autor, 28/11/2026): na janela da conta, ao lado da lixeira, um sino. Ele mostra as
-- notícias (e, quando existir, os posts do Blog) mais recentes, marca as que a pessoa ainda não viu (bolinha no sino e no botão da conta
-- do cabeçalho) e tem o botão para receber notificações do navegador neste aparelho.
--
-- Três tabelas:
--   public.site_updates        o que já saiu no site e QUANDO apareceu (a notícia só tem dia, não hora). Quem escreve é só a função do
--                              Supabase avisar-novidades (supabase/functions/), depois de cada publicação; qualquer um lê (é público).
--   public.notification_state  quando cada pessoa abriu o sino pela última vez. Só por funções (abaixo), só a própria pessoa.
--   public.push_subscriptions  os aparelhos em que a pessoa ligou as notificações (o endereço que o navegador dá + as duas chaves dele).
--                              Ninguém lê pelo site; só a função do Supabase (com a chave de serviço dela) lê, para mandar. Entra e sai só por funções.
--
-- Os endereços das inscrições só podem ser dos serviços de notificação dos navegadores (Google, Mozilla, Apple, Microsoft): a função
-- manda pedidos para esses endereços, e ninguém deve conseguir fazê-la mandar pedidos a um endereço qualquer. A mesma lista está em
-- src/scripts/conta/regrasDasNovidades.ts (enderecoDeNotificacaoPermitido).
--
-- Pode ser rodado mais de uma vez sem estragar nada (idempotente). Depende de 20261103000000_endurecer_comentarios.sql (public.profiles).
-- Como aplicar: docs/comentarios-supabase.md, seção 5. Prova: tools/banco_local.py (casos "novidades:").

-- ───── o que já saiu no site ─────
create table if not exists public.site_updates (
  item_id text primary key check (item_id ~ '^(news|blog)/[a-z0-9]+(-[a-z0-9]+)*$' and char_length(item_id) <= 200),
  first_seen_at timestamptz not null default now()
);
alter table public.site_updates enable row level security;
drop policy if exists "novidades: todos leem" on public.site_updates;
create policy "novidades: todos leem" on public.site_updates for select to anon, authenticated using (true);
revoke all on public.site_updates from anon, authenticated;
grant select on public.site_updates to anon, authenticated;

-- ───── quando a pessoa abriu o sino ─────
create table if not exists public.notification_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.notification_state enable row level security;
revoke all on public.notification_state from anon, authenticated;
-- sem policies: só as duas funções abaixo (security definer) tocam na tabela, e só na linha de quem chama

-- a última vez que a pessoa abriu o sino; na primeira vez (conta nova, ou conta de antes das notificações) anota AGORA, para ninguém
-- começar com a lista inteira marcada como "não vista"
create or replace function public.my_notifications_seen() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  eu uuid := auth.uid();
  quando timestamptz;
begin
  if eu is null then
    raise exception 'not allowed';
  end if;
  insert into public.notification_state (user_id) values (eu) on conflict (user_id) do nothing;
  select seen_at into quando from public.notification_state where user_id = eu;
  return quando;
end $$;

-- abriu o sino: tudo o que saiu até agora conta como visto
create or replace function public.mark_notifications_seen() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  eu uuid := auth.uid();
begin
  if eu is null then
    raise exception 'not allowed';
  end if;
  insert into public.notification_state (user_id, seen_at) values (eu, now())
    on conflict (user_id) do update set seen_at = now();
  return now();
end $$;

-- ───── os aparelhos com notificações ligadas ─────
create table if not exists public.push_subscriptions (
  endpoint text primary key check (
    char_length(endpoint) <= 1000
    and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[!-~]+$'
  ),
  user_id uuid not null references public.profiles(id) on delete cascade,
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{86,88}={0,2}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{21,24}={0,2}$'),
  lang text not null check (lang in ('pt', 'en')),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_id on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
-- sem policies: o site não lê nem escreve direto; a função do Supabase usa a chave de serviço do próprio Supabase (que passa por cima do RLS)

-- liga as notificações neste aparelho (ou troca o idioma). O mesmo navegador pode ter sido de outra conta antes (a pessoa saiu e entrou
-- com outra): o endereço passa para quem ligou agora. No máximo 10 aparelhos por pessoa.
create or replace function public.save_push_subscription(endereco text, chave_p256dh text, chave_auth text, idioma text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  eu uuid := auth.uid();
begin
  if eu is null then
    raise exception 'not allowed';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hc-push:' || eu::text, 0));
  if not exists (select 1 from public.push_subscriptions s where s.endpoint = endereco and s.user_id = eu)
     and (select count(*) from public.push_subscriptions s where s.user_id = eu) >= 10 then
    raise exception 'too many subscriptions';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, lang)
    values (endereco, eu, chave_p256dh, chave_auth, idioma)
    on conflict on constraint push_subscriptions_pkey
    do update set user_id = eu, p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang, created_at = now();
end $$;

-- desliga neste aparelho (só o que é da própria pessoa)
create or replace function public.remove_push_subscription(endereco text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not allowed';
  end if;
  delete from public.push_subscriptions s where s.endpoint = endereco and s.user_id = auth.uid();
end $$;

-- este aparelho está ligado para mim? (o botão do sino mostra "ligado" só se o banco também tem a inscrição desta conta)
create or replace function public.has_push_subscription(endereco text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from public.push_subscriptions s where s.endpoint = endereco and s.user_id = auth.uid())
$$;

-- privilégios: só quem tem conta chama as funções; visitante sem conta, nada
revoke execute on function public.my_notifications_seen() from public, anon;
revoke execute on function public.mark_notifications_seen() from public, anon;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function public.remove_push_subscription(text) from public, anon;
revoke execute on function public.has_push_subscription(text) from public, anon;
grant execute on function public.my_notifications_seen() to authenticated;
grant execute on function public.mark_notifications_seen() to authenticated;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;
grant execute on function public.has_push_subscription(text) to authenticated;
