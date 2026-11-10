---
paths:
  - "supabase-setup.sql"
  - "static/comments.js"
  - "supabase/**"
  - "src/scripts/comentarios/**"
  - "src/lib/comentarios.ts"
  - "src/components/*Comentarios.astro"
  - "tools/comentarios_playwright.py"
---

# Regras dos comentários (Supabase)

Guia de configuração para o autor (passo a passo no painel do Supabase e do Google): `docs/comentarios-supabase.md`. Aqui fica só o que importa para quem mexe no código.

## Segredos

- As chaves ficam em `config.json → "comments": { "supabase_url", "supabase_anon_key" }`, que é do autor: **nunca edite, entregue nem copie esses valores** para código, documentação, testes ou relatórios. Em exemplos use marcadores como `<sua Project URL>` e `<sua chave anon public>`.
- Só a chave **anon** (pública por desenho, protegida pelo RLS) pode ir para o navegador. **Nunca** a `service_role`.

## Como funciona hoje

- O `build.py` (`comments()`) gera `<section class="hc-comments" data-page="<ID>">`, injeta `window.HC = {url, key, lang, ui}` (textos `c_*` de `config.json → ui` + `COMMENT_UI_DEFAULTS`) e carrega `supabase-js@2` do jsDelivr (versão **não fixada**) e `static/comments.js`.
- **Astro (T15):** mesma `<section>` e mesmo `window.HC` (`src/lib/comentarios.ts`, o único que lê as chaves), mais o script empacotado de `src/components/CaixaDeComentarios.astro` → `src/scripts/comentarios/` (porte do `comments.js`, com `@supabase/supabase-js` de versão **exata** no `package.json`). Mudou o comportamento da caixa? Mude **os dois** (`comments.js` e `caixa.ts`) enquanto o Python for referência, e rode `tools/comentarios_playwright.py` (Supabase falso, Python × Astro). Texto do visitante só por `el(…, { texto })` de `dom.ts`; nunca `innerHTML`. O `el()` recusa atributos `on*` e `href`, `src`, `srcdoc`, `formaction`, `action`, `xlink:href`, `style` (`ATRIBUTOS_RECUSADOS`); precisando de um deles, crie um caminho explícito para valor fixo do código, não tire o nome da lista. A prova pelo resultado é `tests/comentarios-dom.test.ts` (happy-dom + cliente Supabase falso injetado em `iniciarComentarios()`): mexeu em `caixa.ts`, ele tem de continuar verde.
- **IDs de página:** `works/<obra>/<capítulo>` e `news/<slug>`, **iguais nos dois idiomas** (uma conversa só para EN e PT). Mudar o formato ou um slug "apaga" as conversas. Invariante da migração.
- Sem as duas chaves no `config.json`, nenhuma caixa aparece no site publicado; na prévia (`DRAFTS`) aparece o aviso `c_not_configured`. `comments: false` no front matter tira os comentários de uma página.
- `build.py` limpa a URL colada (tira `/` final e `/rest/v1…`, `/auth/v1…`).

## Banco (`supabase-setup.sql`, rodado à mão no SQL Editor)

Blocos numerados — preserve a numeração e o comportamento idempotente dos blocos novos:

1. **`public.profiles`** (`id` → `auth.users`, `display_name` 2–30 caracteres, `is_admin`, `created_at`); RLS ligado; leitura pública; **sem policy de insert/update** (ninguém se promove a admin pelo site). Trigger `on_auth_user_created` → `handle_new_user()` cria o perfil com `display_name` / `full_name` / `name` dos metadados (contas Google usam o nome da conta) ou `user-xxxxxx`.
2. **`public.comments`** (`id` identity, `page_id` 1–200, `user_id` default `auth.uid()`, `parent_id`, `body` 1–2000 sem contar espaços das pontas, `created_at`); índice `(page_id, created_at)`; RLS: leitura pública, insert só `authenticated` com `auth.uid() = user_id`, delete do próprio ou de admin.
3. **Anti-spam** (`check_new_comment()`, before insert): 1 comentário a cada 10 s por pessoa; resposta só a comentário raiz da mesma página (1 nível).
4. **Virar admin:** `update public.profiles set is_admin = true where id = (select id from auth.users where email = '…')` — comentado; o autor roda depois de criar a conta.
5. **Editar comentários:** coluna `edited_at` (`add column if not exists`), policy de update do próprio, trigger `check_edit_comment()` que trava tudo menos `body` e marca `edited_at` quando o texto muda. Projetos antigos rodam só este bloco.

Mudança no banco (desde a T15) = **nova migração** em `supabase/migrations/<AAAAMMDDHHMMSS>_<nome>.sql` (`supabase migration new <nome>`), **idempotente** (`if not exists`, `or replace`, `drop … if exists`), + instrução para o autor em `docs/comentarios-supabase.md`. O `supabase-setup.sql` e a migração inicial (`20261016000000_inicial.sql`, igual a ele byte a byte, `tests/supabase.test.ts`) não mudam. Sem `supabase/config.toml` de propósito (ver o guia, seção 5). Achados de segurança do B25: fechados pela migração `20261103000000_endurecer_comentarios.sql` (datas do servidor, limite de 10 s sem corrida e também na edição, `page_id` no formato dos IDs, corpo não vazio, `search_path` fixo, privilégios mínimos) + **"[comentário apagado]"** (opção b do autor, 02/11): `deleted_at`, `user_id` pode ser nulo (`on delete set null`), gatilhos `soft_delete_comment` (before delete), `cleanup_deleted_parent` (after delete), `before_delete_profile`; a caixa (comments.js e caixa.ts) pede `deleted_at` com recuo e mostra `c_deleted`. Prova: `python3 tools/banco_local.py` (Postgres local + imitação do Supabase, 53 casos com os do marca-página). A lista pública de nomes (`profiles`) ficou como está, decisão do autor (02/11). **Aplicada no projeto do ar em 03/11/2026** (pelo SQL Editor; o banco do autor não tinha o bloco 5 do setup, que a migração agora recria). **Marca-páginas** (`20261103020000_marca_paginas.sql`, 03/11): `public.bookmarks` (PK `user_id,page_id`; RLS só os próprios; `anon` sem acesso; gatilho `check_bookmark`: data do servidor, dono/capítulo imutáveis, "not allowed" antes do RLS, máx. 1000 com trava por pessoa e upsert de existente liberado; `page_id` ≤ 120; revisão independente de 03/11), **aplicada no projeto do ar em 03/11/2026**, usada só por `src/scripts/marcaPagina/index.ts` pela conexão compartilhada `src/scripts/supabase/cliente.ts`. **Janela da conta** (`20261103040000_conta.sql`, 03/11, revisão independente): `limpar_nome()` (regra única do nome, também no cadastro: espaços Unicode, invisíveis/direção recusados, 2–30, "lusca"/"sharktopus" só admin), `change_my_name(novo)` (1 troca por hora, `name_changed_at`) e `delete_my_account()` (apaga em `auth.users`; perfil, marca-páginas e comentários seguem as regras de cascata/soft delete), ambas `security definer` com `search_path ''`, só sobre `auth.uid()`, `execute` só para `authenticated`; usadas só por `src/scripts/comentarios/conta.ts`; **aplicada no projeto do ar em 03/11/2026**. **Favoritos** (`20261103060000_favoritos.sql`, 03/11): `public.favorites` (PK `user_id,work_id`; `work_id` = pasta da obra, `^[a-z0-9]+(-[a-z0-9]+)*$` ≤ 80; RLS só os próprios, sem update; `check_favorite`: "not allowed" antes do RLS, data do servidor, máx. 300 com trava por pessoa), **aplicada no projeto do ar em 03/11/2026**, usada só por `src/scripts/favoritos/index.ts`; a página recebe a conexão por `window.HC_FAV` (`favoritosDaPagina()` em `src/lib/comentarios.ts`). **Fotos de perfil** (`20261110000000_fotos_de_perfil.sql`, 10/11): `profiles.avatar_path` (check: `<id>/[a-z0-9]{12,40}.(webp|jpg)`), balde público `avatars` (WebP/JPEG ≤ 200 KB), policies em `storage.objects` (ver/subir/apagar só na própria pasta; subir só com nome no formato e menos de 3 arquivos, por `avatars_da_pessoa()`), `set_my_avatar(caminho)` (security definer, só sobre `auth.uid()`, exige o arquivo no balde, devolve o caminho antigo); usada só por `src/scripts/comentarios/conta.ts`; **ainda não aplicada pelo autor**.

## `static/comments.js`

- Login por e-mail/senha e **Google** (`signInWithOAuth({ provider: 'google', redirectTo: página atual })`; precisa do provider ativado no painel — ver o guia). Login com Google ainda não funciona no site do autor (B2 do backlog).
- Lê os comentários com `edited_at`; se a coluna não existir (bloco 5 não rodado), refaz a consulta sem ela e segue funcionando (o botão Editar é que dará erro). Mantenha esse recuo.
- "Editar" só nos próprios comentários; "(editado)" em cinza ao lado do nome, com data no `title`. Apagar: dono ou admin, com confirmação.
- No campo de texto (comentário, resposta, edição): **Enter envia, Shift+Enter pula linha**.
- Modal de login `.c-modal` (z-index 1000).
- Textos sempre de `window.HC.ui` (PT/EN); não escreva texto de interface fixo no JS.

## Testar

Login real não é testável no sandbox. No navegador: `tools/comentarios_playwright.py` (Supabase falso no nível da rede; serve para os dois sites; `--fotos` tira as capturas). O mock `shot.py … --supabase` da skill `hc-conferencia-visual` só funciona no site Python (troca o `window.supabase` do CDN, que o Astro não usa). SQL: dá para validar num Postgres local com uma imitação de `auth`/papéis (lição 10, seção 9). Mudanças de segurança (RLS, policies, chave) pedem revisão independente (tarefa de risco alto).
