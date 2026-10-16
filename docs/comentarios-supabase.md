# Comentários com contas (sem Disqus)

O site continua sendo só arquivos; contas e comentários ficam num serviço gratuito chamado **Supabase**.
Cada capítulo e cada notícia ganha comentários, e **a conversa é a mesma nos dois idiomas** (inglês e português).

Enquanto o `config.json` estiver em branco, nenhuma caixa de comentários aparece no site publicado (só um aviso na prévia local, `python build.py serve`).

Sumário:
1. [Configuração inicial (uma vez, ~10 minutos)](#1-configuração-inicial-uma-vez-10-minutos)
2. [Login com o Google](#2-login-com-o-google)
3. [Editar comentários](#3-editar-comentários)
4. [Como os comentários funcionam para quem visita](#4-como-os-comentários-funcionam-para-quem-visita)
5. [Migrações do banco (Supabase CLI) — daqui para frente](#5-migrações-do-banco-supabase-cli--daqui-para-frente)
6. [O que mudou no site novo (Astro, T15)](#6-o-que-mudou-no-site-novo-astro-t15)

## 1. Configuração inicial (uma vez, ~10 minutos)

1. Crie uma conta no site do Supabase ([supabase.com](https://supabase.com)) e um **New project** (guarde a senha do banco; não vai precisar dela no site).
2. No menu do projeto: **SQL Editor → New query**. Abra o arquivo `supabase-setup.sql`, copie tudo, cole ali e clique **Run**.
3. **Project Settings → API**: copie a **Project URL** e a chave **anon public**.
4. Cole as duas em `config.json`, no bloco `"comments"`:
   ```
   "comments": { "supabase_url": "<sua Project URL>", "supabase_anon_key": "<sua chave anon public>" }
   ```
   (a chave *anon* é feita para ficar pública; **nunca** use a `service_role`).
5. **Authentication → URL Configuration**: em *Site URL* ponha o endereço do seu site (para os links de confirmação de e-mail funcionarem).
   Em *Redirect URLs* adicione o mesmo endereço com `/**` no final. Para testar no seu computador, adicione também `http://localhost:8000/**`.
6. Rode `python build.py` de novo. Crie a sua conta em qualquer capítulo, confirme o e-mail e rode o último bloco do `supabase-setup.sql`
   (o que começa com `update public.profiles ...`, bloco "4)"; troque o e-mail pelo seu e tire os `--` do começo das 3 linhas) para se tornar administrador — assim você apaga qualquer comentário.

Pronto: cada capítulo e cada notícia ganha comentários. A conversa é a mesma nos dois idiomas.

> As chaves do Supabase só existem no **seu** `config.json`. Por isso as atualizações do site nunca trazem esse arquivo: ele é seu.

## 2. Login com o Google

O botão "Continuar com o Google" só funciona depois que você ativa o Google no Supabase:

1. Em <https://console.cloud.google.com> crie um projeto → **APIs e serviços → Tela de consentimento OAuth** (tipo *Externo*, preencha nome do app e e-mail).
2. **Credenciais → Criar credenciais → ID do cliente OAuth** → tipo *Aplicativo da Web*.
   - Em **URIs de redirecionamento autorizados** cole o endereço da sua **Project URL** seguido de `/auth/v1/callback` (ex.: `<sua Project URL>/auth/v1/callback`).
   - Em **Origens JavaScript autorizadas** ponha o endereço do seu site.
3. Copie o **ID do cliente** e a **chave secreta** que o Google mostrar.
4. No Supabase: **Authentication → Providers → Google** → ative e cole os dois valores → Save.
5. Confira em **Authentication → URL Configuration** se o *Site URL* e os *Redirect URLs* (com `/**`) são os do seu site.
6. **Se você já tinha rodado o `supabase-setup.sql` antes**, rode no SQL Editor só este trecho, para que contas do Google usem o nome da conta Google (e não `user-abc123`):

```sql
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
```

> Situação atual: o login com Google ainda não funciona no site publicado (item B2 de `docs/BACKLOG.md`, aguardando a mensagem de erro / o que acontece ao clicar).

## 3. Editar comentários

Quem comentou vê um botão "Editar" nos próprios comentários; depois de editado aparece "(editado)" em cinza ao lado do nome.

**Se você já tinha rodado o `supabase-setup.sql` antes**, rode no SQL Editor só o bloco `-- 5) EDITAR COMENTÁRIOS` que está no final do arquivo
(ele usa `if not exists` / `or replace`, então não dá erro de "já existe"). Até rodar, os comentários continuam aparecendo normalmente, mas o botão Editar dará erro.

## 4. Como os comentários funcionam para quem visita

- No campo de comentário (e nas respostas e edições): **Enter envia**, **Shift+Enter** pula linha.
- Respostas têm um nível só (responde-se a um comentário, não a uma resposta).
- Anti-spam: cada pessoa pode enviar 1 comentário a cada 10 segundos.
- Cada um apaga os próprios comentários; o administrador (você) apaga qualquer um.
- As notícias têm o mesmo espaço de comentários dos capítulos. Na prévia local, sem as chaves, aparece um aviso no lugar.
- Para tirar os comentários de uma página específica: `comments: false` no topo do arquivo.

Ideia guardada para depois: fotos de perfil nos comentários (item B4 de `docs/BACKLOG.md`).

## 5. Migrações do banco (Supabase CLI) — daqui para frente

Até a T15 o banco existia só como o `supabase-setup.sql`, colado à mão no SQL Editor. Agora ele também está registrado como **migrações**: arquivos SQL numerados em `supabase/migrations/`, que o **Supabase CLI** (o programa de linha de comando do Supabase) sabe quais já rodaram no seu projeto e quais ainda faltam. Assim cada mudança no banco fica guardada no git, com data, e nunca é rodada duas vezes.

- `supabase/migrations/20261016000000_inicial.sql` é **o banco que já está no ar**: um cabeçalho de comentários + o `supabase-setup.sql` inteiro, byte a byte (o teste `tests/supabase.test.ts` confere). Ele foi validado num Postgres local, com o próprio CLI: o banco que ele cria é idêntico ao do `supabase-setup.sql`.
- **Nada muda no seu banco.** Você não precisa fazer nada agora; o site novo continua usando o mesmo projeto, as mesmas tabelas e as mesmas contas.
- Não existe `supabase/config.toml` de propósito: o CLI não precisa dele para os comandos abaixo (conferido com o CLI 2.118.0), e o arquivo que o `supabase init` cria vem com configurações de Auth de exemplo (*Site URL* `http://127.0.0.1:3000` etc.) que, se um dia fossem enviadas com `supabase config push`, trocariam as do seu projeto. Se você quiser rodar o Supabase inteiro no seu computador (`supabase start`, que exige o Docker), rode `supabase init` só nessa hora e **não** use `config push`.

### Uma vez só: ligar o CLI ao seu projeto (opcional, quando quiser começar)

1. Instale o CLI (não vem no `pnpm install`, porque são ~150 MB): `pnpm dlx supabase@2.118.0 --version` roda sem instalar; ou instale pelo site do Supabase (Homebrew no Mac, Scoop no Windows). Nos comandos abaixo, `supabase` = `pnpm dlx supabase@2.118.0`.
2. Na pasta do projeto: `supabase login` (abre o navegador) e `supabase link --project-ref <o ID do seu projeto>` (o ID é a primeira parte da sua Project URL: as letras entre `https://` e o primeiro ponto; o CLI pede a senha do banco). O `link` guarda o ID em `supabase/.temp/`, que o git ignora.
3. `supabase migration list` — mostra `20261016000000` em **Local** e vazio em **Remote** (o seu projeto ainda não sabe que essa migração "já está lá").
4. **`supabase migration repair --status applied 20261016000000`** — marca a inicial como já aplicada, **sem rodar nada** no banco. Não pule este passo: sem ele, o `db push` tentaria criar as tabelas de novo (daria erro de "já existe" e pararia).
5. `supabase migration list` de novo — agora as duas colunas mostram `20261016000000`.

### Cada mudança nova no banco

1. `supabase migration new <nome-curto>` (ex.: `supabase migration new data-do-comentario`) cria `supabase/migrations/<data-e-hora>_<nome>.sql`, vazio.
2. Escreva o SQL ali, no mesmo estilo de sempre: **que possa rodar de novo sem erro** (`if not exists`, `create or replace`, `drop … if exists`). Mudança de segurança (RLS, policies, funções) passa por revisão independente.
3. `supabase db push --dry-run` mostra o que seria aplicado; `supabase db push` aplica.
4. Sem o CLI dá para fazer como antes: copie o arquivo novo inteiro, cole no SQL Editor e clique **Run** (depois, ao começar a usar o CLI, marque-o também com `migration repair --status applied <data-e-hora>`).

Nunca rode `supabase db reset --linked` (apaga o banco do projeto ligado) nem `supabase config push`.

O `supabase-setup.sql` fica congelado como está (é o que este guia manda colar num projeto novo, e o site Python ainda é a referência até a virada, T20). Mudanças novas vão em migrações, não nele.

## 6. O que mudou no site novo (Astro, T15)

Para quem visita, **nada**: mesma caixa, mesmos botões e textos, mesmas conversas (os IDs `works/<obra>/<capítulo>` e `news/<pasta>` não mudaram), e quem já estava conectado continua conectado (a sessão fica guardada no navegador com o mesmo nome).

Por dentro:
- o site Python continua usando o `static/comments.js` e o `supabase-js` do jsDelivr (versão "2", que muda sozinha quando sai uma nova). O site Astro usa um **script próprio em TypeScript** (`src/scripts/comentarios/`), com o `@supabase/supabase-js` **instalado numa versão fixa** (`package.json`, hoje 2.117.2) e empacotado junto: nada vem de outro site, e uma versão nova só entra quando alguém a instala e testa;
- esse script só é carregado nas páginas que têm comentários (capítulos e notícias);
- única diferença visível, de propósito: no celular, o texto de exemplo da barra ("Escreva um comentário…") aparece inteiro, em vez de cortado ao meio (B23 do backlog);
- as chaves continuam vindo do seu `config.json` (bloco `"comments"`), do mesmo jeito.

O `static/comments.js` sai na virada (T20), junto com o gerador Python.
