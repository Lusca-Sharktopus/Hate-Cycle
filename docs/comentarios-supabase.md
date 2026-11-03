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

### Migração de 03/11/2026: reforço do banco (B25) e "[comentário apagado]"

Arquivo: `supabase/migrations/20261103000000_endurecer_comentarios.sql`. **Já rodada no seu projeto (03/11/2026).** Num projeto novo, rode-a depois do `supabase-setup.sql`.

O que muda para quem visita: quase nada na tela. Comentário apagado que tem respostas passa a aparecer como **"[comentário apagado]"** (sem nome, sem botões), e as respostas das outras pessoas ficam; sem respostas, ele some como antes. Quando a última resposta de um comentário apagado some, ele some junto. O resto fecha brechas de quem mexe no banco direto, sem passar pelo site: data inventada, limite de 10 s burlado, comentário em página que não existe, comentário só de espaços, edições sem limite, permissões que o site nunca usou. Conta apagada: as respostas e os comentários sem resposta dela somem; os que têm respostas de outras pessoas viram "[comentário apagado]".

**Como aplicar (sem o CLI, ~2 minutos):**

1. Supabase → seu projeto → **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/migrations/20261103000000_endurecer_comentarios.sql`, copie **tudo** e cole.
3. **Run**. Deve aparecer "Success. No rows returned". Se der erro, não tente de novo: me mande um print.
4. Pode rodar de novo sem estragar nada (ex.: se não tiver certeza de que rodou).

Com o CLI: `supabase db push` (depois de marcar a inicial como aplicada, passo 4 da seção anterior).

**Como foi provado:** `python3 tools/banco_local.py` sobe um Postgres local com uma imitação do Supabase, aplica todas as migrações (a última duas vezes) e roda os casos (53 hoje, com os do marca-página: cada brecha fechada e tudo o que o site faz continuando a funcionar). A caixa de comentários dos dois sites mostra "[comentário apagado]" (`c_deleted`, texto padrão no `build.py`/`src/lib/comentarios.ts`; dá para trocar pelo `config.json → ui`).

### Migração de 03/11/2026: marca-páginas

Arquivo: `supabase/migrations/20261103020000_marca_paginas.sql`. **Já rodada no seu projeto (03/11/2026, versão com os ajustes da revisão).** Num projeto novo, rode depois da de cima (ela usa a tabela de perfis).

O que muda para quem visita: quem tem conta passa a ter o marca-página guardado na conta (vale em qualquer aparelho). Sem conta, o marca-página continua funcionando, guardado só no navegador. Enquanto a migração não for rodada, nada quebra: sem conta, o marca-página funciona normalmente no navegador; com conta, o marcador anda na página, mas não fica guardado (com conta o site nunca grava no navegador, para não deixar a posição de uma pessoa num computador compartilhado).

A tabela `bookmarks` guarda, por pessoa e por capítulo, o parágrafo e a fração dentro dele. Cada pessoa só vê e mexe nos próprios (RLS); visitante sem conta não toca na tabela; no máximo 1000 por pessoa (com uma trava contra pedidos simultâneos); a conta apagada leva os marca-páginas junto. Revisada por um revisor independente em 03/11 (nada grave; os quatro ajustes que ele pediu já estão no arquivo).

**Como aplicar (~2 minutos):** igual à de cima: SQL Editor → New query → cole **tudo** de `supabase/migrations/20261103020000_marca_paginas.sql` → **Run** → "Success. No rows returned". Pode rodar de novo sem estragar nada. Se der erro, me mande um print.

**Como foi provado:** `python3 tools/banco_local.py` (os casos do marca-página: ler e gravar o próprio, não ver nem mexer no de outra pessoa, visitante sem conta barrado, dono e capítulo que não mudam, formato do capítulo, limite, conta apagada).

### Migração de 03/11/2026: a janela da conta

Arquivo: `supabase/migrations/20261103040000_conta.sql`. **Já rodada no seu projeto (03/11/2026, versão com os ajustes da revisão).** Num projeto novo, rode depois das duas de cima.

O que muda para quem visita (só no site novo): em "Conectado como **Fulano**", o nome vira um botão. O clique abre uma janela, com o resto da página escurecido, onde a pessoa troca o nome que aparece nos comentários (2 a 30 caracteres) e pode apagar a conta. Apagar pede uma segunda confirmação que explica o que some; a conta, o nome e os marca-páginas vão embora; os comentários somem, e os que têm respostas de outras pessoas ficam como "[comentário apagado]" (as mesmas regras da migração do reforço).

**Regras do nome** (revisão independente de 03/11, valem também para o nome de quem cria conta, inclusive pelo Google): de 2 a 30 caracteres; espaços a mais saem; nada de caracteres invisíveis ou que invertem a direção do texto (eles embaralhavam a data ao lado do nome); **"Lusca" e "Sharktopus" ficam reservados para a conta de admin** (a sua: depois de virar admin, você pode se chamar assim pela janela; quem tenta criar conta com esse nome fica com `user-xxxxxx`); e **uma troca de nome por hora** (o nome novo aparece em todos os comentários antigos, então sem limite dava para "assinar" com outro nome depois).

São duas funções do banco, `change_my_name` e `delete_my_account`, que só agem sobre quem as chama; visitante sem conta não pode usar nenhuma. Ninguém ganha permissão de mexer na tabela de perfis diretamente (o "admin" continua intocável). Enquanto a migração não for rodada, a janela abre, mas salvar o nome ou apagar a conta mostra "Algo deu errado".

**Depois de aplicar, vale um teste com uma conta descartável** (crie uma com outro e-mail, troque o nome, apague a conta e confira em Authentication → Users que ela sumiu).

**Como aplicar (~2 minutos):** SQL Editor → New query → cole **tudo** de `supabase/migrations/20261103040000_conta.sql` → **Run** → "Success. No rows returned". Pode rodar de novo sem estragar nada.

**Como foi provado:** `python3 tools/banco_local.py` (casos "conta:": trocar o próprio nome, nomes recusados, visitante barrado, ninguém mexe no perfil direto, apagar a conta levando perfil, marca-páginas e comentários pelas regras certas); no site, `tests/comentarios-dom.test.ts` (a janela num DOM simulado) e o Supabase falso de `tools/comentarios_playwright.py`.

### Migração de 03/11/2026: histórias favoritas

Arquivo: `supabase/migrations/20261103060000_favoritos.sql`. **Ainda não rodada no seu projeto.** Rode depois das de cima.

O que muda para quem visita (só no site novo, página Histórias): uma estrela no canto de cima de cada capa (aparece com o mouse em cima da capa) e um botão de estrela no começo da linha de busca, que mostra só as favoritas. Sem conta, os dois abrem uma janela avisando que o recurso exige login. Com conta, os favoritos ficam na tabela `favorites`: cada pessoa só vê e mexe nos próprios, visitante sem conta não toca nela, no máximo 300 por pessoa, e a conta apagada leva os favoritos junto. Enquanto a migração não for rodada, quem tem conta vê a estrela, mas favoritar mostra "Não deu para salvar o favorito".

**Como aplicar (~2 minutos):** SQL Editor → New query → cole **tudo** de `supabase/migrations/20261103060000_favoritos.sql` → **Run** → "Success. No rows returned". Pode rodar de novo sem estragar nada.

**Como foi provado:** `python3 tools/banco_local.py` (casos "favoritos:"); no site, `tests/favoritos.test.ts` e `tests/favoritos-dom.test.ts`.

## 6. O que mudou no site novo (Astro, T15)

Para quem visita, **nada**: mesma caixa, mesmos botões e textos, mesmas conversas (os IDs `works/<obra>/<capítulo>` e `news/<pasta>` não mudaram), e quem já estava conectado continua conectado (a sessão fica guardada no navegador com o mesmo nome).

Por dentro:
- o site Python continua usando o `static/comments.js` e o `supabase-js` do jsDelivr (versão "2", que muda sozinha quando sai uma nova). O site Astro usa um **script próprio em TypeScript** (`src/scripts/comentarios/`), com o `@supabase/supabase-js` **instalado numa versão fixa** (`package.json`, hoje 2.117.2) e empacotado junto: nada vem de outro site, e uma versão nova só entra quando alguém a instala e testa;
- esse script só é carregado nas páginas que têm comentários (capítulos e notícias);
- única diferença visível, de propósito: no celular, o texto de exemplo da barra ("Escreva um comentário…") aparece inteiro, em vez de cortado ao meio (B23 do backlog);
- as chaves continuam vindo do seu `config.json` (bloco `"comments"`), do mesmo jeito.

O `static/comments.js` sai na virada (T20), junto com o gerador Python.
