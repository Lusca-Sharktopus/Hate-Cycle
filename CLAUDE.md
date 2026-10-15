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

- A última linha de um build bom é `✔ site gerado em … (N páginas)`. Hoje são **192 páginas**; se o número mudar sem motivo, investigue.
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
pnpm build      # gera o site Astro em dist/ (hoje: só /en/ e /pt/ de esqueleto)
pnpm check      # verificação de tipos (astro check): tem de dar 0 errors, 0 warnings
```

## Mapa de pastas

| Caminho | O que é |
|---|---|
| `content/` | Todo o texto. `works/<obra>/work.json` + `works/<obra>/NN/{en,pt}.md` (capítulos), `news/AAAA-MM-DD-slug/`, `pages/` (about, project, support), `emissaries/`, `characters/`, `universe/`, `embeds/*.html` (códigos de incorporação). |
| `static/` | Vai para o site como está: `style.css`, `site.js`, `comments.js`, imagens (`covers/`, `logos/`, `other images/`, `news/`, `Backgrounds/`, `sidebar/`, `intro/`…). `custom.css` é do autor. |
| `build.py` | O gerador inteiro (um arquivo). |
| `config.json` | Nome do site, idiomas, textos da interface (`ui`), redirects, intro, emissários, `show_extras` e as chaves do Supabase do autor. |
| `cronologia.json` | Planilha completa da linha do tempo (inclui obras que ainda não estão no site); fonte do `order.chrono`. |
| `supabase-setup.sql` | Banco dos comentários (rodado à mão no Supabase pelo autor). |
| `guardados/` | Arquivos guardados para uso futuro. **Não é publicado.** |
| `docs/` | Documentação: guia do autor, comentários, histórico, arquitetura, backlog, lições de Astro. |
| `.claude/` | `skills/` (procedimentos) e `rules/` (regras que carregam por caminho). |
| `public/` | Saída gerada (ignorada pelo git). |
| `src/`, `astro.config.mjs`, `package.json` | Projeto Astro (T05 em diante): `pages/`, `layouts/`, `components/`, `lib/`, `styles/`. Saída em `dist/`; `node_modules/`, `dist/` e `.astro/` são ignorados pelo git. |

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
