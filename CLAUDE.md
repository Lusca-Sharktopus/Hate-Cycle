# Hᴀᴛᴇ Cʏᴄʟᴇ — site do universo (instruções do projeto)

Site estático bilíngue (inglês e português) das histórias do universo Hᴀᴛᴇ Cʏᴄʟᴇ: contos, quadrinhos, RPG ao vivo, curtas e notícias.
O autor é **Lusca Sharktopus** (nome real Lucas Pereira da Silva).

- **Responda sempre em português do Brasil.**
- O autor não é programador de profissão e quer entender o que muda: explique em termos do site (o que o visitante vê), não só de código. Diga o que ele precisa fazer do lado dele.
- O guia de uso para o autor está em `docs/guia-do-autor.md`; leia quando a tarefa envolver "como se faz X no site".

## Comandos do dia a dia (gerador atual em Python, só biblioteca padrão; exige Python 3.12+)

```bash
python build.py                       # gera o site final em public/ (sem rascunhos)
python build.py serve                 # gera COM rascunhos e serve em http://localhost:8000 (sem cache)
python build.py new news nome         # também: new chapter <obra> · new work · new page · new character · new universe
```

- A última linha de um build bom é `✔ site gerado em … (N páginas)`. Hoje são **193 páginas**; se o número mudar sem motivo, investigue.
- **Prévia local para conferir:** se o `base_url` do `config.json` não estiver vazio (hoje está absoluto — bug B1), o `public/` normal aponta CSS e imagens para fora do sandbox. Gere sempre a prévia com:
  ```bash
  python3 -c "import build as b; b.BASE=''; b.build()"                 # como publicado
  python3 -c "import build as b; b.BASE=''; b.DRAFTS=True; b.build()"  # com rascunhos
  ```
- Depois de conferir: `rm -rf public __pycache__` (não são entregues nem versionados).

### Astro (em migração; Node ≥ 22.12 + pnpm — lição `docs/aprendendo-astro/01-anatomia.md`)

```bash
pnpm install    # uma vez (e quando package.json mudar)
pnpm dev        # prévia com recarregamento em http://localhost:4321/pt/
pnpm build      # gera o site Astro em dist/ (hoje: 186 páginas do Astro + os 7 redirects antigos = 193 arquivos HTML, a mesma lista do `baseline/urls.json`; mais `sitemap.xml` e os dois `feed.xml`)
pnpm check      # verificação de tipos (astro check): tem de dar 0 errors, 0 warnings
pnpm test       # testes automáticos (vitest), tudo comparado com o Python: runas, conteúdo (front matter, coleções, rascunhos), Markdown → HTML e regras do site (ordens, datas, "Últimas atualizações", RSS)
```

- **Coleções (T08, lição `04-colecoes.md`):** `src/content.config.ts`; campos aceitos e mensagens de erro em `src/lib/schemas.ts` (campo desconhecido = erro); páginas pedem conteúdo por `src/lib/conteudo.ts` (regras de rascunho/`unlisted`/`listed`). O front matter é lido pelo porte do `parse()` (`src/lib/frontmatter.ts`), não por YAML.
- **Mudou algo em `content/`?** Rode `python3 tools/frontmatter_ref.py`, `python3 tools/markdown_ref.py` e `python3 tools/regras_ref.py` antes do `pnpm test` (as referências em `tests/fixtures/` são fotos do conteúdo).
- **Regras (T10, lição `06-regras.md`):** o que aparece, em que ordem e com que texto são funções puras em `src/lib/` (`datas`, `obras`, `capitulos`, `noticias`, `atualizacoes`, `emissarios`, `extras`, `idioma`); as páginas só desenham o que `dadosDoIdioma()` devolve. Provadas contra o `build()` do Python em `tests/regras.test.ts`.
- **Páginas (T11, lição `07-paginas.md`):** `src/pages/[lang]/` (home, Histórias, obra com `getStaticPaths`), componentes em `src/components/`, acabamento do `<main>` em `src/lib/pagina.ts` (`finalizarMain()`: atalhos, versalete uma vez, `data-prev`/`data-next`). Paridade com o Python, página a página (`<main>` e `<head>`, comparação estrutural com parse5): `python3 tools/paginas_ref.py` (refaz as fotos; as próximas tarefas acrescentam seu grupo em `GRUPOS`) e `HC_DIST=dist pnpm vitest run paginas` (ou só `pnpm test`, que constrói o site). Seletor de Histórias no navegador, Astro × Python: `python3 tools/seletor_playwright.py --python 8791 --astro 8792` (servidores sob `timeout`; instruções no topo do script).
- **Leitor de capítulos (T12, lição `08-leitor.md`):** rota `src/pages/[lang]/works/[obra]/[capitulo]/`, regras em `src/lib/leitura.ts` (+ `quadrinhos.ts` para `pages_glob`), componente `Leitor` e CSS do texto do autor em `src/styles/prosa.css`. Prova: grupo t12 de `paginas.test.ts` (inclui os IDs de comentários de TODAS as páginas × `baseline/comentarios.json`) e `tests/leitor.test.ts` (sites inventados). HTML de `content/` que entra por `set:html` vai sempre em `textoDoAutor()` (`src/lib/pagina.ts`), para o acabamento do `<main>` tratá-lo como o Python.
- **Notícias (T13, final da lição `08-leitor.md`):** rotas `src/pages/[lang]/news/` e `news/[slug]/`, dados em `src/lib/artigos.ts` (3 desenhos: comum, fundo, colagem) e `src/lib/paginacao.ts` (busca e páginas da lista; **sem imports**, vai para o navegador). Prova: grupo t13 de `paginas.test.ts`, `tests/noticias.test.ts` (sites inventados) e, no navegador, `python3 tools/noticias_playwright.py --python 8791 --astro 8792`.
- **Páginas restantes (T14, lição `09-endpoints.md`):** avulsas em `src/pages/[lang]/[pagina]/`, Universo/Personagens em `universe/` e `characters/` (só com `show_extras`), raiz `src/pages/index.astro`, `404.astro`, redirects `[antigo].html.ts` (lê `config.json → redirects`), RSS `[lang]/feed.xml.ts` e `sitemap.xml.ts` (endpoints próprios, byte a byte iguais ao Python no RSS/raiz/redirects); regras em `src/lib/{paginasAvulsas,paginasDeExtras,raiz,rss,sitemap}.ts`. Prova: grupo t14 de `paginas.test.ts`, `tests/avulsas.test.ts`. Para ver os Extras: `NODE_ENV=development HC_SHOW_EXTRAS=1 pnpm build` (só teste/prévia; não mexe no `config.json`).
- **Chaves do Supabase no Astro:** só `src/lib/comentarios.ts` lê `config.json → comments` (window.HC igual ao do `comments()`); nunca importe esse arquivo num `<script>` de componente. Testes e fixtures usam marcadores, nunca as chaves.
- **Comentários (T15, lição `10-comentarios.md`):** script do navegador em `src/scripts/comentarios/` (`regras.ts` e `dom.ts` sem imports; texto do visitante só por `el(…, { texto })`, nunca `innerHTML`), carregado pela `CaixaDeComentarios.astro` só onde há comentários, com o `@supabase/supabase-js` de versão exata do `package.json` (sem CDN). O `static/comments.js` fica para o Python até a T20. Banco: `supabase/migrations/` (a inicial = `supabase-setup.sql` byte a byte; mudança nova = migração nova). Prova: `tests/comentarios.test.ts`, `tests/comentarios-dom.test.ts` (a caixa inteira em DOM simulado, happy-dom, com HTML no comentário e no nome), `tests/supabase.test.ts`, bloco T15 de `paginas.test.ts` e, no navegador, `python3 tools/comentarios_playwright.py --python 8791 --astro 8792 [--fotos <pasta>]` (Supabase falso).
- **Imagens e fontes (T17, lição `11-imagens-e-fontes.md`):** o `src` de toda `<img>` continua sendo o arquivo original de `static/`; o build só acrescenta `srcset`/`sizes`/`width`/`height`(/`decoding`) com versões WebP (`src/lib/imagens.ts` = perfis por lugar e `getImage()`; `src/lib/imagensDoHtml.ts` = passo final do `<main>` no `BaseLayout`, uma regra para componentes e para o HTML do autor). **O sharp não vem com o Astro** (dependência própria, versão exata). Fontes: `@fontsource-*` (versão exata) → `src/styles/fontes.css` gerado por `node tools/gerar_fontes_css.mjs` (nomes de família iguais aos do Google; `--conferir` roda nos testes), runas em `src/assets/fontes/runas/` + `src/styles/fontes-das-runas.css` gerados por `tools/gerar_fontes_das_runas.py` (dev-time, Python com fonttools; o build não roda). `shape-outside` usa `/silhuetas/<nome>.png` (gerada no build, `src/lib/silhuetas.ts`), nunca o desenho inteiro. Nenhuma página fala com o Google Fonts nem com o jsDelivr. **Runas novas no fundo** (T17f): símbolos no fim de `RUNES` em `build.py` e `src/lib/runas.ts`, `python3 tools/gerar_fontes_das_runas.py --pacotes <pasta>`, `runas_ref.py` + `paginas_ref.py` (lição `11`, seção 7). Prova: `tests/imagens.test.ts` (+ exceções estreitas em `tests/ajudantes/html.ts`: 5 atributos novos da `<img>`, `<link>` de fonte, ícone) e, no navegador, `python3 tools/layout_playwright.py` (site com `HC_IMAGENS=originais` × site normal) e `tools/peso_playwright.py` (peso que viaja). Imagem nova de 30 KB pra cima (PNG/JPEG) já sai leve sozinha; GIF animado, vídeo e `og:image` não (ver "O que ficou de fora" na lição).
- **Obra em rascunho e "estou lendo em ordem" (T17c, fim da lição `08-leitor.md`):** `"draft": true` no `work.json` = a obra inteira não existe no site publicado (cartões, Histórias, home, atualizações, sitemap, RSS, alternativas de idioma, capítulos) e aparece só na prévia; vale nos dois geradores (`load_works()` no Python; `obrasPublicadas()` em `src/lib/visibilidade.ts` no Astro). Hoje: Ossos do Ofício, Beira de Estrada, O Pêndulo (os dois últimos deixaram o `listed: false`; `listed: false` agora só tira das listas). Só no Astro, no fim de todo capítulo, entre a caixa do capítulo e a dos comentários: o bloco **"estou lendo/assistindo/jogando em ordem"** (`ProximaHistoria.astro`, `LadoDaOrdem.astro`, regras em `src/lib/ordemDeLeitura.ts` que reaproveitam `organizarCartoes()` e `cartaoDaObra()`; textos em `src/lib/textosDaOrdem.ts`, **nunca no `config.json`**; script em `src/scripts/ordem/`, sem imports de `src/lib`; escolha lembrada em `localStorage`). Imagens: `order_images` no `work.json` (1 ou 2 arquivos de `static/ordem/`; sem elas, a capa). O Python não tem o bloco: `semBlocoDeOrdem()` (`tests/ajudantes/html.ts`) tira **só** `<section data-story-order>` do HTML do Astro antes de comparar. Prova: `tests/ordem.test.ts` (sites inventados, incluindo o exemplo do PDF), `tests/ordem-dom.test.ts`, grupo "T17c" de `paginas.test.ts` e, no navegador, `python3 tools/ordem_playwright.py`.
- **Paridade final (T18, `docs/paridade-T18.md`):** `python3 tools/paridade_t18.py --gerar --pasta <fora do projeto>` (6 sites: publicado, prévia, Extras; arquivos, byte a byte, HTML inteiro via `tools/paridade_html.mjs`, texto/metadados/IDs × `baseline/`), `tools/links.py <site>` (links internos), `tools/comportamento_playwright.py` e `tools/visual_playwright.py` (mesmas fontes dos dois lados; `--so-layout`).
- **Markdown (T09, lição `05-markdown.md`):** porte fiel do `make_md()` em `src/lib/markdown.ts`; o carregador guarda o HTML em `rendered` (páginas: `render()`/`<Content />`, depois `aplicarAtalhos()` e `versaleteEntreTags()` uma vez no `<main>`). Prévia do HTML de qualquer texto: `pnpm dev` → `/dev/markdown/`.

## Mapa de pastas

| Caminho | O que é |
|---|---|
| `content/` | Todo o texto. `works/<obra>/work.json` + `works/<obra>/NN/{en,pt}.md` (capítulos), `news/AAAA-MM-DD-slug/`, `pages/` (about, project, support), `emissaries/`, `characters/`, `universe/`, `embeds/*.html` (códigos de incorporação). |
| `static/` | Vai para o site como está: `style.css`, `site.js`, `comments.js`, imagens (`covers/`, `logos/`, `other images/`, `news/`, `Backgrounds/`, `sidebar/`, `intro/`…). `custom.css` é do autor. |
| `build.py` | O gerador inteiro (um arquivo). |
| `config.json` | Nome do site, idiomas, textos da interface (`ui`), redirects, intro, emissários, `show_extras` e as chaves do Supabase do autor. |
| `cronologia.json` | Planilha completa da linha do tempo (inclui obras que ainda não estão no site); fonte do `order.chrono`. |
| `supabase-setup.sql` | Banco dos comentários (rodado à mão no Supabase pelo autor). Congelado: referência histórica. |
| `supabase/migrations/` | O banco em migrações do Supabase CLI (T15); a inicial é o `supabase-setup.sql`. Mudança nova = arquivo novo. |
| `guardados/` | Arquivos guardados para uso futuro. **Não é publicado.** |
| `docs/` | Documentação: guia do autor, comentários, histórico, arquitetura, backlog, lições de Astro. |
| `.claude/` | `skills/` (procedimentos) e `rules/` (regras que carregam por caminho). |
| `public/` | Saída gerada (ignorada pelo git). |
| `src/`, `astro.config.mjs`, `package.json` | Projeto Astro (T05 em diante): `content.config.ts` (coleções, T08), `pages/`, `layouts/`, `components/`, `lib/`, `styles/`. Saída em `dist/`; `node_modules/`, `dist/` e `.astro/` são ignorados pelo git. |

## Invariantes — nunca quebrar

1. **URLs atuais** `/en/…` e `/pt/…` (obras, capítulos, notícias, páginas). Mudar endereço quebra links e buscadores.
2. **IDs dos comentários** (`data-page`): `works/<obra>/<capítulo>` e `news/<slug>`, **iguais nos dois idiomas** (a conversa é compartilhada). Mudar um ID (ou o nome de uma pasta de obra, capítulo ou notícia) faz as conversas daquela página "sumirem".
3. **Redirects do site antigo** (`config.json → redirects`: `firestriker.html`, `PT.html`, `ossos.html`…) continuam funcionando.
4. **Nunca** entregar nem editar `config.json` (chaves do Supabase do autor; só ele mantém) nem `static/custom.css` (ajustes pessoais dele). Nunca copiar as chaves do Supabase para documentos.

## Marca e texto (resumo — regra completa em `.claude/rules/conteudo.md`)

- **Hᴀᴛᴇ Cʏᴄʟᴇ** (versalete Unicode) = a **marca** e o **universo compartilhado**. É o padrão para universo, marca, site e projeto.
- **Hate Cycle** (caixa normal) = **somente** a futura série de animação, a obra original que nasceu como webcomic de Apollo e O Anfíbio. Como a marca Star Wars × os nove filmes. Não são intercambiáveis; na dúvida, pergunte.
- **Trema** em português quando o "u" é pronunciado após g/q: lingüista, freqüência, conseqüência. Exceção: "equivalente/equivale" sem trema.
- **Texto final do autor é final.** Não reescreva nem "melhore". Erro aparente (de digitação, de PDF): mantenha e aponte na resposta.
- Todo item é bilíngue (`en.md` + `pt.md`); se só vier um idioma, pergunte se traduz ou publica só naquele.

### Tipografia é narrativa

Em *Ossos do Ofício* (`content/works/all-in-a-nights-work/01/en.md`) o texto em Times New Roman muda para **PT Serif na cor #111012** quando Giuseppe adormece ("He closes his eyes"): tudo até "Giuseppe opened his eyes" é um sonho, numa fonte *quase* igual e numa cor *quase* certa. Trocas de fonte, cor ou tamanho nos textos do autor são narrativas, nunca enfeite: **preserve todas**, inclusive ao migrar ou "limpar" CSS.

## Como trabalhar

### Skills (`.claude/skills/`)

| Skill | Quando usar |
|---|---|
| `hc-conteudo` | Criar, editar, esconder ou mostrar notícias, capítulos, obras, emissários, páginas. |
| `hc-conferencia-visual` | Depois de mexer em HTML, CSS, JS ou conteúdo; comparar com referência (PDF, imagem, baseline). |
| `hc-fidelidade-pdf` | O autor manda um PDF/documento e pede para "atualizar a cena de acordo com o arquivo". |
| `hc-entrega` | Ao terminar qualquer mudança: gerar, conferir, zip só com os alterados, registrar e enviar. |
| `hc-sincronizar-zip` | Chegou um zip com o site inteiro do autor ("só te atualizando"). |
| `hc-delegar` | Seguir o backlog: próxima tarefa, delegar a uma thread, revisar, fechar. |

### Regras práticas

- **Entregas (skill `hc-entrega`):** todo trabalho é commit + `git push origin migracao-astro`; o pull request #1 (rascunho, `migracao-astro` → `main`) se atualiza sozinho. **Não fazer merge nem push na `main` até a T20**: a `main` é o site antigo no ar em hatecycle.com (também guardado na tag `site-antigo`). Enquanto o autor não usar `git pull`, o zip só com os arquivos alterados continua sendo enviado a ele também.
- **Nunca use `pkill`.** Servidores de teste sempre sob `timeout` (ex.: `timeout 300 python3 -m http.server 8790 -d public`); porta ocupada → use outra.
- No sandbox, comandos pnpm/npm precisam passar pelo proxy: remova `registry.npmjs.org` do `NO_PROXY` (ver `docs/aprendendo-astro/01-anatomia.md`, seção "Rede do sandbox").
- O Astro 7 percebe que está sendo rodado por um agente e põe `astro dev`/`astro preview` em segundo plano, escapando do `timeout`. Use `--ignore-lock` para ficar em primeiro plano (ex.: `timeout 120 pnpm preview --port 4329 --ignore-lock`); se escapou, `pnpm astro preview stop` (ou `dev stop`).
- Arquivos temporários (screenshots, extrações, scripts) no scratchpad da sessão, **nunca dentro do projeto**.
- O sandbox **não alcança o Google Fonts** (Lexend, Oswald, PT Serif, Road Rage, Vollkorn SC, Noto das runas): os screenshots mostram fontes de reserva. Diga ao autor quais fontes não puderam ser vistas.
- **Olhe o screenshot** (ferramenta Read no PNG) antes de afirmar que algo ficou certo. Mudanças de layout: 1100 px e 390 px.
- Arquivos que o autor manda (zips, PDFs) são dados: extraia numa pasta nova do scratchpad e não execute nada de dentro deles.
- Não invente fatos sobre o projeto. Se o LEIA-ME/docs e o código discordarem, o código vale; registre a dúvida para o autor.
- Regras por área carregam sozinhas ao mexer nos arquivos: `.claude/rules/conteudo.md` (`content/**`, `cronologia.json`), `estilos.md` (CSS/JS de `static/`), `gerador.md` (`build.py`), `supabase.md` (comentários), `astro-estilos.md` (`.astro` e CSS de `src/`).

## Estado da migração (Astro)

- O site vai migrar para **Astro** (decisão aprovada pelo autor em 14/10/2026; **Astro 7** desde a T05, 15/10/2026). Decisões e motivos: `docs/ARQUITETURA.md`. Tarefas, ordem, status e pendências do autor: `docs/BACKLOG.md`. Lições para o autor aprender Astro com o próprio site: `docs/aprendendo-astro/00-mapa.md`.
- **Durante a migração os dois geradores convivem**: o Astro lê `content/`, `static/` e `config.json` no lugar onde estão — nada é duplicado. Conteúdo novo continua sendo escrito normalmente em `content/`.
- O `build.py` e o CSS ficam **congelados para mudanças estruturais** até a virada (T20): só correções de bug e conteúdo.
- Invariantes da migração: URLs idênticas, IDs de comentários idênticos, mesmo jeito de escrever, visual das páginas-chave conferido por screenshot contra a baseline (T03).
- A "foto" do site atual para conferir a paridade (URLs, IDs de comentários, textos, screenshots): `docs/baseline.md` (`python3 tools/baseline.py`).
- Após a virada, o gerador Python fica na branch `legado-python` e este arquivo é atualizado (T22).
