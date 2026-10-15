# Arquitetura — registro de decisões

Decisões aprovadas pelo autor em **14/10/2026** para a migração do site do gerador Python (`build.py`) para Astro. Cada decisão segue o formato: contexto → decisão → alternativas consideradas → consequências. As tarefas que executam essas decisões estão em `docs/BACKLOG.md`; as lições para aprender Astro com o próprio site, em `docs/aprendendo-astro/00-mapa.md`.

Mudar uma decisão daqui = nova entrada neste arquivo (com data), não edição silenciosa da antiga.

---

## D1 — Framework: Astro 6

- **Contexto:** o site é estático, bilíngue, com muito texto em Markdown e regras próprias de escrita (versalete, IPA, `[[links]]`, divisor de cena, `{{atalhos}}`). O gerador atual é um único arquivo Python de ~1000 linhas, difícil de testar e de evoluir.
- **Decisão:** **Astro 6.** Gera site estático sem JavaScript por padrão, com ilhas só onde precisa; coleções de conteúdo com schemas Zod; i18n `en`/`pt` com prefixo nos dois idiomas; Markdown + MDX; `astro:assets` para imagens; API de fontes; `@astrojs/rss` e sitemap. Requer **Node ≥ 22.12**. A Cloudflare comprou o Astro em jan/2026; o projeto segue open source.
- **Alternativas consideradas:**
  - **Eleventy** — 2ª opção. Sem schemas nativos; governança incerta depois da proposta de renomear para "Build Awesome" (mar/2026, pausada).
  - **Hugo** — sem plugins para as transformações de texto do site.
  - **Next / Nuxt / SvelteKit** — frameworks de aplicação; excesso para um site de leitura.
  - **Python modular** (Jinja2, markdown-it-py, pydantic) — plano B, se o Astro não servir.
- **Consequências:** o autor precisa de Node 22.12+ e pnpm na máquina (Parte 0 do mapa de lições). Erros de conteúdo passam a ser apontados no build (arquivo e campo). Os plugins de Markdown precisam reproduzir exatamente o `make_md()` atual (T09).

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

- **Tailwind** — o site tem direção de arte sob medida; fica CSS com tokens + estilos por componente.
- **CMS no navegador** — o autor escreve em arquivos.
- **Monorepo** — um site só.
- **Servidor / SSR** — o site continua estático.

## D10 — Fluxo de trabalho

- **Contexto:** o GitHub ainda não está conectado ao ambiente do Claude.
- **Decisão:** trabalho registrado em git; **entregas por zip** (só arquivos alterados) até o GitHub ser conectado; depois, por **pull request**.
- **Consequências:** skill `hc-entrega` é trocada por PR na T04/T22.
