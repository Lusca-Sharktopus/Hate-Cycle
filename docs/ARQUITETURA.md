# Arquitetura — registro de decisões

Decisões aprovadas pelo autor em **14/10/2026** para a migração do site do gerador Python (`build.py`) para Astro. Cada decisão segue o formato: contexto → decisão → alternativas consideradas → consequências. As tarefas que executam essas decisões estão em `docs/BACKLOG.md`; as lições para aprender Astro com o próprio site, em `docs/aprendendo-astro/00-mapa.md`.

Mudar uma decisão daqui = nova entrada neste arquivo (com data), não edição silenciosa da antiga.

---

## D1 — Framework: Astro 6 → Astro 7 (atualizado em 15/10/2026, ver abaixo)

- **Contexto:** o site é estático, bilíngue, com muito texto em Markdown e regras próprias de escrita (versalete, IPA, `[[links]]`, divisor de cena, `{{atalhos}}`). O gerador atual é um único arquivo Python de ~1000 linhas, difícil de testar e de evoluir.
- **Decisão:** **Astro 6.** Gera site estático sem JavaScript por padrão, com ilhas só onde precisa; coleções de conteúdo com schemas Zod; i18n `en`/`pt` com prefixo nos dois idiomas; Markdown + MDX; `astro:assets` para imagens; API de fontes; `@astrojs/rss` e sitemap. Requer **Node ≥ 22.12**. A Cloudflare comprou o Astro em jan/2026; o projeto segue open source.
- **Alternativas consideradas:**
  - **Eleventy** — 2ª opção. Sem schemas nativos; governança incerta depois da proposta de renomear para "Build Awesome" (mar/2026, pausada).
  - **Hugo** — sem plugins para as transformações de texto do site.
  - **Next / Nuxt / SvelteKit** — frameworks de aplicação; excesso para um site de leitura.
  - **Python modular** (Jinja2, markdown-it-py, pydantic) — plano B, se o Astro não servir.
- **Consequências:** o autor precisa de Node 22.12+ e pnpm na máquina (Parte 0 do mapa de lições). Erros de conteúdo passam a ser apontados no build (arquivo e campo). Os plugins de Markdown precisam reproduzir exatamente o `make_md()` atual (T09).
- **Atualização de 15/10/2026 — Astro 7 (T05):** o projeto começa direto no **Astro 7** (instalado: `astro` 7.3.8, com Vite 8). Motivo: o Astro 6 parou de receber atualizações em junho de 2026 (a 7.0.0 saiu em 22/06/2026); começar na 6 seria herdar uma migração logo de cara. O resto da decisão (site estático, i18n com prefixo, coleções, Node ≥ 22.12) não muda. Mudanças da 7 que afetam este site:
  - **`compressHTML`** passou a ter padrão `'jsx'`, que apaga o espaço entre elementos quando há quebra de linha no meio (testado no 7.3.8: `<span class="hc">Hate Cycle</span>`, quebra de linha, `<a>continua</a>` sai como "Hate Cyclecontinua"). O site depende desses espaços (versalete em `<span class="hc">`, links no meio de frases). **Decisão: `compressHTML: false`** — o HTML sai com os espaços como foram escritos, igual ao `build.py` (que não comprime nada). `true` (o padrão da 6, que mantém um espaço) também serviria; `false` foi escolhido por ser o mais próximo do site atual e mais fácil de comparar na T18. Reavaliar na T17 (desempenho), se valer a pena.
  - **Markdown (observação para a T09):** o processador padrão agora é o **Sätteri**, e o `@astrojs/markdown-remark` deixou de vir instalado. Os plugins remark/rehype da T09 exigem instalar `@astrojs/markdown-remark` e configurar `markdown.processor: unified()` (importado de `@astrojs/markdown-remark`); `markdown.remarkPlugins`/`rehypePlugins` continuam existindo, mas só funcionam com esse pacote. O Sätteri também aceita plugins MDAST/HAST — a T09 decide qual caminho reproduz melhor o `make_md()`.
    → **Decidido na T09 (15/10/2026): nenhum dos dois.** Porte fiel do `make_md()` para TypeScript; ver D4, atualização de 15/10/2026.
  - **Compilador em Rust**, mais rígido: tag não fechada vira erro de build, e aninhamento inválido (ex.: `<div>` dentro de `<p>`) não é mais "consertado" — passa como está. Atenção na T09/T12 com o HTML cru dos capítulos (cena 1 de Ossos, tiras, carta).
  - **Servidores em segundo plano quando rodados por um agente:** `astro dev`/`astro preview` detectam o Claude e se desligam do terminal. Nas sessões, usar `--ignore-lock` (fica em primeiro plano, respeita o `timeout`) ou `astro preview stop`. No computador do autor, nada muda.
  - `src/fetch.ts` passou a ser um nome reservado (roteamento avançado): não criar um arquivo com esse nome.
- **Atualização de 16/10/2026 (T14):** três itens da decisão original mudaram de forma, sem mudar o site. (1) O bloco `i18n` saiu do `astro.config.mjs`: os dois idiomas continuam com prefixo (`/en/…`, `/pt/…`) pela rota `src/pages/[lang]/`, com os valores de `config.json → languages`; nada usava os atalhos do `astro:i18n`, e a regra automática dele fazia a prévia responder 404 em endereços sem idioma (`/`, `/dev/markdown/`). (2) RSS e redirects são endpoints próprios, não `@astrojs/rss` nem o `redirects` nativo, porque os dois escrevem XML/HTML diferentes dos de hoje (o feed sai byte a byte igual ao do Python). (3) Sitemap também é endpoint próprio (`src/pages/sitemap.xml.ts`), não `@astrojs/sitemap`, para listar só as páginas reais (sem raiz, 404, redirects nem capítulos `unlisted`). Lição `09-endpoints.md`.

## D2 — Linguagem e ferramentas: TypeScript estrito + pnpm

- **Contexto:** regras do site (ordens, visibilidade, "Últimas atualizações", datas) hoje estão misturadas com HTML no `build.py`.
- **Decisão:** TypeScript em modo estrito; gerenciador de pacotes **pnpm**.
- **Alternativas consideradas:** JavaScript puro (sem verificação de tipos); npm/yarn (pnpm é mais rápido e econômico).
- **Consequências:** `pnpm astro check` passa a fazer parte da verificação; erros de tipo aparecem no editor (VS Code + extensão Astro).

## D3 — Hospedagem: GitHub Pages com deploy por GitHub Actions

- **Contexto:** o site está no GitHub Pages; o `public/` é gerado e enviado à mão.
- **Decisão:** continua no **GitHub Pages**, agora com deploy automático por **GitHub Actions**. Reavaliar Cloudflare/Netlify depois (dariam redirects 301 reais e prévia por pull request). **Mudar uma coisa de cada vez.**
- **Alternativas consideradas:** Cloudflare Pages ou Netlify já na migração (adiado para não trocar framework e hospedagem ao mesmo tempo).
- **Consequências:** redirects do site antigo continuam como páginas HTML de redirecionamento. Depende de o GitHub ser conectado (T04) e da virada (T20).

## D4 — Formato dos capítulos: `.md` por padrão, `.mdx` só onde precisa

- **Contexto:** a maior parte dos capítulos é texto; algumas cenas (ex.: Ossos do Ofício, cena 1) usam HTML cru com classes próprias.
- **Decisão:** capítulos em **`.md`**; **`.mdx`** só onde houver componentes de história.
- **Alternativas consideradas:** tudo em MDX (mais poderoso, porém mais frágil para o autor escrever).
- **Consequências:** o jeito de escrever do autor não muda; componentes ficam restritos a cenas especiais.
- **Atualização de 15/10/2026 — T09: o Markdown do site é convertido por um porte fiel do `make_md()`, não por remark/rehype nem pelo Sätteri.**
  - **Contexto:** o backlog previa plugins remark/rehype (ou do Sätteri, o processador padrão do Astro 7) que reproduzissem o `make_md()`. Só que o `make_md()` não é Markdown padrão: é um conversor de ~60 linhas feito à mão, com regras próprias (blocos por linha em branco, quebra simples vira espaço, `---` é o divisor de cena da obra, HTML cru passa sem escape, `@/`, `[[links]]`, `{{atalhos}}`, `{{embed:…}}`, ênfase por expressão regular). Medido na T09 com o processador padrão do Astro 7 (Sätteri com os padrões do Astro: GFM e pontuação "inteligente"): dos **189** corpos com texto de `content/`, **189** saem com HTML diferente e **166** continuam diferentes mesmo ignorando detalhes de escrita do HTML (`<br />` × `<br>`, espaços). Exemplos reais: `"Kartekta'i"` vira `“Kartekta’i”` e `it's`/`...there` viram `it’s`/`…there` (o texto do autor mudaria); `[[works/firestriker|Leia aqui!]]` sai literal; `---` vira `<hr>` em vez da imagem do divisor; `{{embed:…}}` sai literal.
  - **Decisão:** porte linha a linha de `make_md()`, `smallcaps()`/`ipa_ok()`, `url_embed()`/`embed_html()` para `src/lib/markdown.ts` (funções puras), com o contexto de cada entrada montado em `src/lib/corpos.ts` (idioma; `divider` da obra só nos capítulos; o índice dos `[[links]]` com as mesmas regras de rascunho/`unlisted`/`show_extras`; a página Sobre com o texto do Projeto na frente). Ligado ao Astro pela **via oficial da Content Layer**: o carregador de cada coleção (`src/lib/leitor.ts`) preenche `rendered.html` de cada entrada, e as páginas usam `render(entrada)` / `<Content />` como em qualquer projeto Astro. Mesmo motivo do carregador da T08 (o front matter também não é YAML): **o jeito de escrever não muda (D7), então o Astro aprende a ler como o `build.py`**. Plugins teriam de desligar e desfazer o que o parser padrão faz (pontuação inteligente, GFM, regras de ênfase, listas, escapes, entidades, quebras) e refazer o resto, sem prova de igualdade. Nenhum pacote novo (`@astrojs/markdown-remark`, remark, rehype não instalados); `astro.config.mjs` não muda.
  - **Prova:** `tests/markdown.test.ts` compara texto a texto, **sem normalização**, com a referência gerada pelo próprio Python (`tools/markdown_ref.py`): todos os corpos de `content/` (build e prévia, com e sem versalete), as chamadas ao `make_md()` de um `build()` de verdade (= o `rendered.html` do carregador), 1132 casos inventados (à mão e sorteados), links e códigos de incorporação, o versalete direto, e as classes `\w`/`\s`/`\d` caractere por caractere. Zero diferenças. Conferido também no Astro real (`render()` de entradas reais, no `pnpm build` e no `pnpm dev`, e os bytes do arquivo final).
  - **Consequências:**
    - **Versalete:** como no `build.py` (o `shell()` aplica a todo o `<main>`), o `rendered.html` vem **sem** versalete; cada página aplica `versaleteEntreTags()` **uma vez** no `<main>` inteiro (T11+). Aplicar duas vezes não dá o mesmo resultado.
    - **Atalhos** `{{stories}}`/`{{emissaries}}`/`{{other-stories}}`: no `rendered.html` viram marcadores `<!--hc:atalho:nome-->`; a página troca pelo HTML dos componentes com `aplicarAtalhos()` **antes** do versalete (T11/T14).
    - Na prévia, o carregador relê o `content/` inteiro a cada mudança (o HTML de uma entrada depende de outras: títulos dos `[[links]]`, embeds, `work.json`).
    - Diferença conhecida e aceita: `\w`/`\d` do porte usam o Unicode do Node (16.0); o Python 3.13 usa o 15.1. Divergem só em 4382 caracteres de `\w` (4302 letras + 80 algarismos) que o Python ainda não conhece (o teste confere); nenhum aparece no conteúdo.
    - Um capítulo que um dia virar `.mdx` (D4 original, T12) não passa por este conversor; a T12 decide como os dois convivem.

## D5 — Comentários: Supabase continua, banco versionado

- **Contexto:** comentários com contas já funcionam no Supabase (`supabase-setup.sql` rodado à mão; `supabase-js` carregado do CDN sem versão fixa).
- **Decisão:** **Supabase continua**. O banco passa a ser versionado em `supabase/migrations/` (Supabase CLI); `supabase-js` instalado como dependência **com versão fixa**.
- **Alternativas consideradas:** trocar de serviço de comentários (perderia as conversas e as contas existentes).
- **Consequências:** IDs de página precisam continuar idênticos; mudanças de segurança (RLS, chave anônima) recebem revisão independente (T15).

## D6 — Camadas

- **Contexto:** no `build.py`, leitura de conteúdo, regras e HTML estão no mesmo lugar.
- **Decisão:** cinco camadas, cada uma só depende da de baixo:
  1. **Conteúdo** — `content/` + schemas;
  2. **Regras** — `src/lib`, funções puras testadas;
  3. **Apresentação** — layouts e componentes;
  4. **Interatividade** — ilhas;
  5. **Serviços** — Supabase.
- **Alternativas consideradas:** manter tudo nos componentes (mais rápido no início, mais difícil de testar).
- **Consequências:** as regras ganham testes (Vitest) comparados com saídas do gerador Python (T10).

## D7 — Invariantes da migração

- **Contexto:** o site está no ar, com links compartilhados, comentários e um jeito de escrever que o autor domina.
- **Decisão:** a migração precisa manter:
  - **URLs idênticas** (`/en/…`, `/pt/…`, redirects do site antigo);
  - **IDs de comentários idênticos** (`works/<obra>/<capítulo>`, `news/<slug>`);
  - **o mesmo jeito de escrever** (pastas, `en.md`/`pt.md`, campos, atalhos);
  - **visual das páginas-chave** conferido por screenshot contra uma baseline (T03, T18).
- **Alternativas consideradas:** aproveitar para mudar URLs ou o visual (rejeitado: mudar uma coisa de cada vez).
- **Consequências:** tarefas de paridade (T09, T12, T18) e revisão independente (T19) antes da virada.

## D8 — Migração em fases, com convivência

- **Contexto:** o autor continua publicando durante a migração.
- **Decisão:** o Astro lê `content/`, `static/` e `config.json` **no lugar onde estão** (nada é duplicado). O gerador Python continua funcionando até a virada (T20) e depois fica numa branch `legado-python`.
- **Alternativas consideradas:** cópia do conteúdo para uma pasta nova (risco de duas versões divergentes).
- **Consequências:** `build.py` e CSS ficam congelados para mudanças estruturais (só correções de bug) até a virada; voltar ao gerador antigo deve levar minutos (documentado na T20).

## D9 — Fora do escopo por enquanto

- **Tailwind** — o site tem direção de arte sob medida; fica CSS com tokens + estilos por componente. Desde a T06 (15/10/2026), todo CSS do Astro fica em `@layer site`, para que o `custom.css` do autor (fora de camada) continue vencendo; regra em `.claude/rules/astro-estilos.md`.
- **CMS no navegador** — o autor escreve em arquivos.
- **Monorepo** — um site só.
- **Servidor / SSR** — o site continua estático.

## D10 — Fluxo de trabalho

- **Contexto:** o GitHub ainda não está conectado ao ambiente do Claude.
- **Decisão:** trabalho registrado em git; **entregas por zip** (só arquivos alterados) até o GitHub ser conectado; depois, por **pull request**.
- **Consequências:** skill `hc-entrega` é trocada por PR na T04/T22.
