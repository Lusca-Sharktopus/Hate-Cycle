# Backlog — migração para Astro e pendências

Uma **thread por tarefa, em sequência**: a próxima só começa depois que a atual foi revisada e entregue (procedimento na skill `hc-delegar`). Modelo e esforço foram escolhidos pela dificuldade:

- **Opus** — decisões de arquitetura, paridade fina (tipografia, Markdown), segurança (Supabase) e revisões independentes.
- **Sonnet** — implementação com especificação clara (páginas, componentes, testes, deploy).
- **Haiku** — reservado a tarefas mecânicas que surgirem no meio do caminho (renomear em lote, converter campos com regra fixa). Nenhuma tarefa principal é mecânica o bastante hoje.
- **Esforço**: baixo · médio · alto · muito alto (`low` · `medium` · `high` · `xhigh` no parâmetro `effort`).

**Durante a migração os dois geradores convivem**: o Astro lê `content/`, `static/` e `config.json` no lugar onde estão — nada é duplicado. Conteúdo novo continua sendo escrito normalmente em `content/`. Mudanças estruturais no `build.py`/CSS ficam congeladas (só correção de bug) até a virada (T20).

## Tabela

| ID | Tarefa | Fase | Modelo | Esforço | Depende de | Risco | Status |
|---|---|---|---|---|---|---|---|
| T01 | Skills do projeto | 0 | Opus | alto | — | baixo | feita (15/10/2026) |
| T02 | CLAUDE.md, regras e docs | 0 | Opus | médio | T01 | baixo | feita (15/10/2026) |
| T03 | Foto do site atual (baseline) | 0 | Sonnet | médio | T02 | baixo | feita (15/10/2026) — `docs/baseline.md` |
| T04 | Levar o projeto ao repositório do GitHub | 0 | Sonnet | médio ¹ | T02 | médio | feita (15/10/2026) — PR #1 |
| T05 | Projeto Astro lado a lado | 1 | Opus | alto | T03 | médio | feita (15/10/2026) — [lição 01](aprendendo-astro/01-anatomia.md) |
| T06 | Layout base (tokens, cabeçalho, rodapé, idiomas, SEO) | 1 | Sonnet | alto | T05 | médio | pendente |
| T07 | Runas e tela de abertura | 1 | Opus | médio | T06 | baixo | pendente |
| T08 | Coleções de conteúdo e schemas | 2 | Opus | alto | T05 | médio | pendente |
| T09 | Pipeline de Markdown com paridade | 2 | Opus | muito alto | T08 | **alto** | pendente |
| T10 | Regras do site em `src/lib` + testes | 3 | Sonnet | alto | T08 | médio | pendente |
| T11 | Home, Histórias, página da obra, Emissários | 3 | Sonnet | alto | T06, T09, T10 | médio | pendente |
| T12 | Leitor de capítulos (prosa, HQ, vídeo, episódios) | 3 | Opus | alto | T11 | **alto** | pendente |
| T13 | Notícias (lista, artigo, colagem, backdrop, embeds) | 3 | Sonnet | alto | T11 | médio | pendente |
| T14 | Páginas restantes, 404, raiz, RSS, sitemap, redirects | 3 | Sonnet | médio | T13 | médio | pendente |
| T15 | Comentários em TypeScript + migrações do Supabase | 4 | Opus | alto | T12, T13 | **alto** | pendente |
| T16 | Busca (Pagefind) e anti-spam no cadastro | 4 | Sonnet | médio | T15 | baixo | **bloqueada** (decisão do autor) |
| T17 | Imagens e fontes otimizadas | 5 | Sonnet | alto | T14 | médio | pendente |
| T18 | Paridade com a baseline + correções | 6 | Opus | alto | T15, T17 | **alto** | pendente |
| T19 | Revisão independente da migração | 6 | Opus | muito alto | T18 | **alto** | pendente |
| T19b | Acabamento do autor no site novo (elementos gráficos, detalhes, notícias novas) | 6 | Sonnet (quando precisar) | médio | T19 | baixo | pendente |
| T20 | Virada: deploy automático e branch legado | 6 | Sonnet | médio | T19b, T04 | **alto** | pendente |
| T21 | Qualidade contínua (testes no CI, links, acessibilidade) | 7 | Sonnet | médio | T20 | baixo | pendente |
| T22 | Atualizar CLAUDE.md, regras e skills para o Astro | 7 | Sonnet | médio | T20 | baixo | pendente |

¹ Subiu de baixo para médio: a branch nova não tem histórico em comum com a `main` (precisa ser reconstruída sobre ela para o pull request existir) e o envio de ~119 MB tem de ser feito em partes.

Tarefas de risco **alto** recebem, além da thread de construção, uma thread curta de revisão com um agente que não participou dela.

## Detalhe de cada tarefa

### T01 — Skills do projeto ✔
`.claude/skills/`: `hc-entrega`, `hc-conferencia-visual` (com `scripts/shot.py`), `hc-fidelidade-pdf` (com `scripts/estilos.py` e `scripts/imagens.py`), `hc-conteudo`, `hc-sincronizar-zip`, `hc-delegar`. Feitas nesta conversa porque dependem do histórico de trabalho que só esta thread tinha.

### T02 — CLAUDE.md, regras e docs
- **Escopo:** `CLAUDE.md` na raiz (< 200 linhas); `.claude/rules/*.md` com `paths:` para conteúdo, estilos, gerador e Supabase; `docs/guia-do-autor.md` (como usar, a partir do LEIA-ME), `docs/comentarios-supabase.md` (a partir do COMENTARIOS-LEIA-ME), `docs/HISTORICO.md` (as seções de "novidades"/"ajustes" do LEIA-ME); ideias e pendências vão para a seção "Fora da migração" deste backlog; `LEIA-ME.md` vira uma porta de entrada curta que aponta para `docs/`.
- **Fora do escopo:** qualquer mudança em `build.py`, CSS, JS ou conteúdo.
- **Aceite:** `wc -l CLAUDE.md` < 200; nenhuma informação do LEIA-ME/COMENTARIOS perdida (tabela de mapeamento seção → destino no relatório); regras com frontmatter `paths:` válido; `python3 build.py` com as mesmas 192 páginas.

### T03 — Foto do site atual (baseline)
- **Escopo:** `tools/baseline.py` que gera o site atual (sem `base_url`, sem rascunhos) numa pasta temporária e grava em `baseline/`: lista de URLs, lista de IDs de comentários (`data-page`), título/descrição/hreflang por página e texto visível normalizado por página (JSON). Screenshots desktop (1100) e celular (390) das páginas-chave em `baseline/screens/` (fora do git; o script recria quando precisar).
- **Páginas-chave:** home PT/EN, Histórias, cada página de obra, Ossos 01, Pederneira 01, Luz & Sangue 02, HDVR, lista de notícias, uma notícia comum, uma "colagem", uma com backdrop, Sobre, 404.
- **Aceite:** um comando gera tudo; contagens batem com o build atual (192 páginas); `docs/baseline.md` explica como usar na comparação (T18).

### T04 — Levar o projeto ao repositório do GitHub
- **Situação (15/10):** conta conectada e repositório `Lusca-Sharktopus/Hate-Cycle` anexado à sessão (leitura ok). Falta o **app do Claude no GitHub** ter acesso ao repositório para permitir envio: https://github.com/apps/claude/installations/select_target .
- **O que há no repositório:** a `main` tem o **site antigo** (HTML feito à mão) e `CNAME` = `hatecycle.com` — é o que está no ar. A `main` não deve ser tocada até a virada (T20).
- **Tamanho:** a branch nova leva ~119 MB de objetos que o repositório ainda não tem (imagens). Enviar em partes (commits intermediários com lotes de imagens) para não estourar o limite por envio.
- **Escopo:** anexar o repositório, comparar com a cópia local, decidir junto com o autor se o repositório guarda o código-fonte ou só o site gerado, subir numa branch `migracao-astro` e abrir PR. A partir daí, entregas viram PRs (atualizar `hc-entrega`).
- **Aceite:** PR aberto com o estado atual; nenhuma alteração direta na branch principal.

### T05 — Projeto Astro lado a lado
- **Escopo:** Astro 7 (a 6 parou de receber atualizações em junho de 2026; a 7.x é a atual) + TypeScript estrito + pnpm na raiz (`package.json`, `astro.config.mjs`, `tsconfig.json`, `.nvmrc` com Node ≥ 22.12); i18n `en`/`pt` com prefixo nos dois; `publicDir: "static"` (provisório); saída em `dist/`; `src/` com estrutura da arquitetura; `BaseLayout` mínimo e uma página por idioma; lê `config.json` direto (sem duplicar).
- **Fora do escopo:** visual, conteúdo, componentes reais.
- **Aceite:** `pnpm build` e `pnpm astro check` sem erros; `dist/en/index.html` e `dist/pt/index.html` existem; o `python3 build.py` continua gerando 192 páginas; lição `01`.

### T06 — Layout base
- **Escopo:** tokens de cor/fonte em `src/styles/tokens.css`, base global, `BaseLayout` com `<head>` completo (meta, hreflang, Open Graph, fontes), `Header` (logo, menu com itens condicionais, seletor de idioma com links alternativos), `Footer` (redes, "© 2023 - ano", RSS), link "pular para o conteúdo". Textos da interface lidos de `config.json → ui` com tipagem.
- **Aceite:** cabeçalho e rodapé iguais aos da baseline em 1100 e 390 px (screenshots lado a lado no relatório); lição `02`.

### T07 — Runas e tela de abertura
- **Escopo:** componente `RuneImprint` com o mesmo algoritmo de `rune_imprint()`. **Meta: arranjo idêntico ao atual** — reimplementar o gerador do Python (Mersenne Twister com semente via `init_by_array`, `random()` de 53 bits, `shuffle` via `getrandbits`). Se a igualdade exata não sair, parar e perguntar ao autor se aceita arranjos diferentes (mas fixos por página). Tela de abertura (`intro`) com as mesmas regras de sessão e "reduzir movimento".
- **Aceite:** teste comparando posições geradas pelo Python e pelo TS para 10 URLs; lição `03`.

### T08 — Coleções de conteúdo e schemas
- **Escopo:** `src/content.config.ts` com loaders `glob()` apontando para `content/` (notícias, páginas, emissários, personagens, universo, capítulos) e para os `work.json`; schemas Zod com todos os campos de `hc-conteudo`; referências (`related`, `appears_in`) validadas; utilitário de rascunho (`draft` só na prévia).
- **Aceite:** build passa com todo o conteúdo atual; um campo inválido proposital gera erro claro (teste); contagens por coleção iguais às do gerador Python; erros reais encontrados no conteúdo listados (não corrigir texto do autor sem perguntar); lição `04`.

### T09 — Pipeline de Markdown com paridade ⚠
- **Escopo:** plugins remark/rehype para: quebras de linha "suaves" do gerador atual, blocos de HTML cru, prefixo `@/`, `---` → divisor de cena da obra, `[[links]]`, versalete Unicode → `.hc`, IPA → `.ipa`, atalhos `{{stories}}`/`{{emissaries}}`/`{{other-stories}}`/`{{embed:…}}`.
- **Aceite:** teste que renderiza **todos** os `.md` com o `make_md()` do Python e com o pipeline novo, normaliza e compara — zero diferenças não explicadas; lição `05`. Revisão independente.

### T10 — Regras do site em `src/lib`
- **Escopo:** listagem/ordem de obras (lançamento, cronológica, alfabética), obras "outras histórias", capítulos ocultos, "Últimas atualizações" (incl. fusão notícia+capítulo em até 3 dias), emissários (ordem, ocultos), itens do menu, datas PT/EN. Funções puras.
- **Aceite:** testes Vitest comparando com saídas exportadas do Python; lição `06`.

### T11 — Home, Histórias, obra, Emissários
- **Escopo:** rotas dinâmicas e componentes (`WorkCard`, carrossel, seletor de ordem/filtro/busca de histórias em TS, grade de emissários, página da obra com lista de capítulos).
- **Aceite:** screenshots iguais à baseline (1100/390); seletor testado no Playwright; lição `07`.

### T12 — Leitor de capítulos ⚠
- **Escopo:** prosa (`reading_font`, divisor, Giuseppe com `shape-outside`, cena 1 de Ossos, tiras do quadrinho, carta que vira), HQ (`pages_glob` em ordem numérica), vídeo (YouTube, episódios de Luz & Sangue), oneshot, links externos, anterior/próximo, aviso de rascunho, seção de comentários com os **mesmos IDs**.
- **Aceite:** Ossos 01, Pederneira 01 (degradê), Luz & Sangue 02 e HDVR iguais à baseline; lista de IDs de comentários idêntica; lição `08`. Revisão independente.

### T13 — Notícias
- **Escopo:** lista, artigo, tags, design "colagem" (stickers + papel), backdrop topo/pé, posts incorporados com alternância, Shorts verticais.
- **Aceite:** as 3 variações de design iguais à baseline; mesma quantidade de notícias por idioma.

### T14 — Páginas restantes e endpoints
- **Escopo:** Sobre/Projeto (layout largo, GIFs contornados), Apoio, Extras atrás de `show_extras`, raiz que escolhe o idioma, 404, RSS (`@astrojs/rss`, links corretos), sitemap, redirects do site antigo.
- **Aceite:** lista de URLs igual à da baseline (+ sitemap); RSS válido; lição `09`.

### T15 — Comentários ⚠
- **Escopo:** `comments.js` → módulo TypeScript com `@supabase/supabase-js` instalado e com versão fixa, carregado só onde há comentários; mesmos IDs de página; `supabase/migrations/` a partir do `supabase-setup.sql` (Supabase CLI), documentação.
- **Aceite:** testes Playwright com Supabase simulado (comentar, responder, editar, "(editado)", Enter/Shift+Enter, modal de login); revisão independente de segurança (RLS, chave anônima); lição `10`.

### T16 — Busca e anti-spam (aguarda decisão)
Pagefind para busca de texto completo em histórias e notícias; captcha (Turnstile ou hCaptcha) no cadastro do Supabase.

### T17 — Imagens e fontes
- **Escopo:** imagens via `astro:assets` (WebP/AVIF, tamanhos responsivos) — em especial a logo do cabeçalho (2,3 MB em todas as páginas hoje) e as capas; fontes servidas pelo próprio site (API de fontes do Astro); decidir o que fazer com o recorte de glifos das runas.
- **Aceite:** tabela antes/depois de peso da home e de um capítulo; Lighthouse mobile da home ≥ 90 em desempenho; lição `11`.

### T18 — Paridade com a baseline ⚠
- **Escopo:** comparar URLs, IDs de comentários, textos e screenshots; corrigir ou justificar cada diferença.
- **Aceite:** relatório com zero diferenças não explicadas.

### T19 — Revisão independente ⚠
Agente que não participou de nada: audita o relatório da T18, sorteia 20 páginas para conferir à mão, revisa segurança dos comentários e acessibilidade básica. Saída: "pode virar" ou lista de impedimentos.

### T19b — Acabamento do autor
Decisão do autor (15/10/2026): **o site antigo continua no ar em hatecycle.com até o novo ficar pronto**. Depois do Astro pronto e revisado (T19), o autor ainda acrescenta elementos gráficos, detalhes e talvez mais notícias; as threads desta fase são pedidos pontuais dele. Só depois do OK explícito do autor vem a virada.

### T20 — Virada ⚠
- **Escopo:** workflow do GitHub Actions publicando no GitHub Pages; `base`/`site` corretos; branch `legado-python` com o gerador antigo; `build.py`, `public/` e afins saem da branch principal; `static/` reorganizado entre `public/` e `src/assets/`.
- **Aceite:** deploy verde e site no ar conferido; volta ao gerador antigo documentada (minutos); lição `12`.

### T21 — Qualidade contínua
Playwright (fumaça + visuais das páginas-chave) e Vitest no CI; verificador de links; checagem de acessibilidade (axe); Dependabot.

### T22 — Atualizar instruções
CLAUDE.md, `.claude/rules` e todas as skills refletindo os comandos e a estrutura do Astro (`hc-entrega` passa a ser PR).

## Fora da migração (aguardando o autor)

| ID | Item | Situação |
|---|---|---|
| B1 | **Bug:** `config.json → base_url` está como URL completa (`https://Lusca-Sharktopus.github.io/Hate-Cycle`). Os links do RSS e a `og:image` saem como `https://hatecycle.comhttps://Lusca-Sharktopus.github.io/…`. O repositório tem `CNAME` = `hatecycle.com`, ou seja, o site fica na raiz do domínio: o certo é `"base_url": ""` e `"site_url": "https://hatecycle.com"`. | O autor troca no `config.json` dele antes de publicar o site novo |
| B2 | Login com Google não funciona | Aguardando a mensagem de erro / o que acontece ao clicar |
| B3 | Barra lateral de botões (desligada) | Aguardando assets finais e link do Ko-fi / Tip Jar |
| B4 | Fotos de perfil nos comentários | Adiado a pedido |
| B5 | Adolas Podcast nos Emissários (oculto com `draft: true`) | Restaurar? |
| B6 | Publicar Ossos do Ofício: hoje aparece como "Em breve"; o capítulo 01 existe só em inglês e está `unlisted` | Quando? Vai ter versão em português? |
| B7 | Assets ainda sem uso: `ossos-memoria-vito.png`, `feliz-natal-di-vario-ilustracao.jpg` | Onde entram? |
| B8 | O gerador diz "Python 3.8+", mas só roda no **Python 3.12+** (f-strings novas no `build.py`; conferido com 3.11 e 3.12) | Qual Python o autor tem? Se for < 3.12, corrigir as linhas (exceção ao congelamento) |
| B9 | Textos dos Emissários ocultos (`config.json → emissaries.show_texts: false`) | Voltar a mostrar? |
| B10 | Extras (Universo, Personagens) retirados (`show_extras: false`); 3 páginas de exemplo em rascunho (`harry`, `olivia-purinna`, `hidden-magic`) | Editar, apagar ou religar? |
| B11 | "Outras histórias" fora da home e da página Sobre (voltam com `{{other-stories}}`) | Trazer de volta? |
| B12 | *O Pêndulo* e *Beira de Estrada* ocultos (`"listed": false`) | Quando mostrar? |
| B13 | Pasta `static/Produtos` sem uso em nenhuma página | Página de produtos/merch no futuro? |
| B14 | `NOTICIAS-PENDENTES.md` (posts do Reddit) citado no antigo LEIA-ME, mas o arquivo não existe; há embeds do Reddit em `content/embeds/` | Ainda falta cadastrar algum post? |
| B15 | Criar a tag `site-antigo` no commit `31904c2` da `main` (o envio de tags é bloqueado nesta sessão): GitHub → Releases → *Draft a new release* → *Choose a tag* → digite `site-antigo` → *Create new tag* com alvo `main` → *Publish release* (ou só salve como rascunho). | Autor, quando puder (precisa existir antes da T20) |
| B16 | Redirects de Ossos do Ofício no `config.json` (arquivo do autor): `ossos.html` → `/pt/` e `nights.html` → `/en/`. **Resposta do autor (15/10): a versão em português vem depois** — manter como está. Quando o capítulo em PT sair, o autor troca `ossos.html` para `/pt/works/all-in-a-nights-work/01/` (e, se quiser, `nights.html` para `/en/works/all-in-a-nights-work/01/`). | Autor, junto com a publicação de Ossos em PT |
