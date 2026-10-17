# Lição 05 — Markdown: o seu texto vira HTML exatamente como hoje (T09)

Até a T08, o Astro sabia **ler** todo o `content/` (os campos e o texto cru de cada arquivo), mas não sabia **mostrar** o texto: transformar o que você escreve abaixo do segundo `---` no HTML que o navegador entende. Na T09 ele aprendeu, e aprendeu do **mesmo jeito** que o `build.py`: com os seus `[[links]]`, o divisor de cena de cada obra, os posts incorporados, os atalhos e o versalete.

O site no ar **não muda nada**, e o **jeito de escrever também não**. Ainda não há página de notícia ou de capítulo no Astro (isso é da T11 em diante); o que a T09 entrega é o HTML de cada texto **pronto e conferido**, esperando as páginas.

> **Conferido por máquina:** o HTML de **todos os 195** `.md` de `content/` sai do Astro **idêntico, caractere por caractere**, ao do `build.py`, no build e na prévia, com e sem o versalete; e também o de 1132 textos inventados (escritos à mão para cada regra e sorteados com pedaços "perigosos"). Nada foi "aproximado": a comparação é texto contra texto, sem nenhuma normalização. Conferido ainda dentro do Astro de verdade, no `pnpm build` e no `pnpm dev`: Ossos do Ofício 01, Pederneira, as páginas Projeto e Sobre e notícias com posts, colagem, backdrop e IPA.

## O que você vai entender

1. O que é **transformar Markdown em HTML**.
2. Por que o site tem um **"Markdown próprio"**, e por que o Astro aprendeu esse jeito em vez de usar o Markdown que vem com ele.
3. Como o texto chega às páginas: **`rendered`, `render()` e `<Content />`**.
4. Como os **`[[links]]`**, o **divisor de cena**, os **embeds**, os **atalhos** e o **versalete** são tratados.
5. Como o **teste prova** que é igual (e como quebrá-lo de propósito).

## Abra lado a lado (nesta ordem)

1. No `build.py`: `make_md()` (linhas ~128–188), `smallcaps()`/`ipa_ok()` (~45–60), a linha ~358 do `shell()` (o versalete no `<main>`), `url_embed()`/`embed_html()` (~527–600) e a página Sobre (~920).
2. `src/lib/markdown.ts`: o porte do `make_md()`, do versalete e dos embeds.
3. `src/lib/corpos.ts`: o "contexto" de cada texto (idioma, divisor, índice dos links, atalhos, página Sobre).
4. `src/lib/leitor.ts`, parte final (`carregador`): onde o HTML é guardado.
5. `src/pages/dev/markdown/[...entrada].astro`: a ferramenta da prévia para ver tudo isso no navegador.
6. `tools/markdown_ref.py` e `tests/markdown.test.ts`: a prova.

## 1. Markdown → HTML

O navegador só entende **HTML**. Quando você escreve, em Ossos do Ofício:

```
Even then, this was their first mission as the newly founded *Wings of Order* – or *Ałas dełe Ordene*, as is written on their sign back in Italy – after they left their previous guild.
```

alguém tem de transformar isso em:

```html
<p>Even then, this was their first mission as the newly founded <em>Wings of Order</em> – or <em>Ałas dełe Ordene</em>, as is written on their sign back in Italy – after they left their previous guild.</p>
```

(`<p>` = parágrafo, `<em>` = itálico.) No site atual quem faz isso é a função `make_md()` do `build.py`. No Astro, é `markdownParaHtml()` (`src/lib/markdown.ts`), que roda **durante o build**, como o sorteio das runas da lição 03: o visitante recebe o HTML pronto.

## 2. O "Markdown do site" não é o Markdown padrão

"Markdown" é uma família de jeitos de escrever texto com marcações simples. O `make_md()` é um **conversor feito à mão**, com ~60 linhas e regras próprias, que você já conhece (estão em `.claude/rules/conteudo.md`):

| Você escreve | Vira |
|---|---|
| linha em branco | novo parágrafo |
| quebra de linha simples | **espaço** (o parágrafo continua) |
| dois espaços ou `\` no fim da linha | quebra de linha (`<br>`) |
| `*itálico*`, `**negrito**` | `<em>`, `<strong>` |
| `# Título` a `#### Título` | `<h2>` a `<h4>` (o `#` também vira `<h2>`: o `<h1>` é o título da página) |
| `---` sozinho | **divisor de cena** da obra (a imagem do `divider` do `work.json`); fora dos capítulos, uma linha `<hr class="scene-divider">` |
| `[[works/firestriker]]`, `[[news/x\|texto]]` | link interno no mesmo idioma (se o item estiver publicado) |
| bloco começando com `<div`, `<img`, `<figure`… | HTML cru, passa como está; `src="@/pasta/x.png"` vira o endereço do arquivo |
| `{{embed:…}}`, `{{emissaries}}`… | posts incorporados, cards da página |
| `Hᴀᴛᴇ Cʏᴄʟᴇ`, `/qo.ma.'ⁿdi.ʎa/` | versalete de verdade, transcrição em Arial |

### O Astro já tem um Markdown pronto. Por que não usar?

Porque ele é **outro** Markdown. O Astro 7 vem com um processador chamado **Sätteri**, que segue o padrão mais comum (CommonMark + GFM) e, por padrão, ainda "embeleza" a pontuação. Passamos os **seus** textos por ele (é o mesmo programa que o Astro usaria) e comparamos com o `make_md()`. Três exemplos reais:

- **Kartekta (pt):** você escreveu `ou "Kartekta'i" como são chamadas`, com aspas retas. O padrão do Astro devolve `ou “Kartekta’i” como são chamadas`: trocou as suas aspas e o seu apóstrofo por curvos. Em Pederneira (en), `“it's getting late…”` vira `it’s` e `“...there”` vira `“…there”` (três pontos viram reticências). **O seu texto mudaria**, e texto final é final.
- **Saiu Pederneira (pt):** `[[works/firestriker|Leia aqui!]]` sai **literalmente assim**, com os colchetes, no meio da notícia. No site é um link para `/pt/works/firestriker/01/`.
- **Pederneira (pt):** o `---` entre as cenas vira `<hr>` (uma linha cinza) em vez da imagem do divisor de cena de Pederneira.

Nos números: dos **189** textos com conteúdo em `content/`, **189** sairiam com HTML diferente, e **166** continuariam diferentes mesmo ignorando detalhes de escrita do HTML (como `<br />` × `<br>`). Desses 166, 146 têm `{{embed:…}}` ou atalho, 28 têm `[[links]]` e 46 têm aspas retas ou "..." (um texto pode ter mais de um motivo).

O plano antigo (no backlog) era escrever **plugins** para o Markdown do Astro imitar o `make_md()`. Mas os plugins teriam de **desligar** e **desfazer** muita coisa que o padrão faz (pontuação, regras de itálico, listas, escapes, quebras) e **refazer** o resto — mais código, mais frágil, e sem prova de que ficou igual. Então a decisão foi a mesma da T08 com o front matter: **o Astro aprende a ler como o `build.py`**. O `make_md()` foi **portado linha a linha** para TypeScript, e um teste prova, texto por texto, que é igual. (Registro da decisão: `docs/ARQUITETURA.md`, D4, atualização de 15/10/2026.) Nenhum pacote novo foi instalado.

## 3. Como o porte foi feito

Cada pedaço do Python tem um correspondente com o mesmo comportamento:

| No `build.py` | No Astro |
|---|---|
| `make_md(lang, divider)(texto)` | `markdownParaHtml(texto, contexto)` em `src/lib/markdown.ts` |
| os ramos de `render()` (embed, atalho, divisor, título, figura, HTML cru, lista, citação, parágrafo) | os mesmos ramos, **na mesma ordem** (a ordem decide qual regra vence) |
| `soft()`, `inline()`, `wiki()` | `soft()`, `inline()`, `wiki()` |
| `smallcaps()`, `_smallcaps()`, `ipa_ok()` | `versalete()`, `versaleteSemIpa()`, `ipaOk()` |
| a linha do `shell()` que aplica o versalete no `<main>` | `versaleteEntreTags()` |
| `url_embed()`, `embed_html()` | `urlEmbed()`, `embedHtml()` |
| `esc()`, `asset()` | `esc()`, `assetUrl()` (sem `base_url`: o site fica na raiz do domínio) |
| `INDEX` (variável global) | `indiceDeLinks()` em `src/lib/corpos.ts` |
| `SHORT` (variável global) | `MARCADORES_DE_ATALHO` + `aplicarAtalhos()` em `src/lib/corpos.ts` |

O Python consultava variáveis globais (`INDEX`, `SHORT`); a versão nova recebe tudo por parâmetro (o "contexto"). Assim a mesma função serve para o site e para o teste.

### As pegadinhas entre Python e JavaScript

O `make_md()` é quase todo feito de **expressões regulares** (padrões de busca, como `\*(.+?)\*` para o itálico). As duas linguagens escrevem os padrões igual, mas **entendem algumas letras de outro jeito**. Copiar "ao pé da letra" daria um site quase igual — e quase igual não serve. O que foi preciso acertar:

- **O que é uma letra.** No Python, `\w` ("letra") inclui `é`, `ç`, `ã`. No JavaScript, só `a–z`, `A–Z`, `0–9` e `_`. Por isso, no Python, `é*a*é` **não** vira itálico (o `*` está colado em letra), e no JavaScript ingênuo viraria. O porte usa a definição do Python.
- **O que é espaço.** O Python acha que alguns caracteres de controle são espaço e o JavaScript não, e vice-versa (o mesmo `pyStrip()` da lição 04).
- **"Qualquer caractere".** O `.` do Python aceita tudo menos a quebra de linha; o do JavaScript também recusa alguns separadores de linha raros. O porte usa "tudo menos quebra de linha", como o Python.
- **Letras "duplas".** Letras como as de `✨𝓶𝓪𝓰𝓲𝓬 ✨` (Dia 3 da Especulação Evolutiva) ocupam dois "espaços" na memória do JavaScript. Com a opção certa (`u`), contam como **uma**, como no Python.
- **Unicode novo.** O Node conhece o Unicode 16; o Python 3.13, o 15.1. O teste confere, um por um, todos os caracteres que existem (mais de 1 milhão): as definições só divergem em letras e algarismos que o Python ainda nem conhece (nenhum aparece no seu conteúdo).

Cada uma dessas pegadinhas tem um caso no teste, e trocar qualquer uma pela versão "ingênua" faz o teste falhar (seção 6).

## 4. Do arquivo à página: `rendered`, `render()` e `<Content />`

Lembra do **carregador** da lição 04, que lê `content/` e enche cada coleção? Agora ele também faz isto, para cada entrada:

```ts
// src/lib/leitor.ts (resumido)
const html = htmlDosCorpos(tudo, colecao, { comRascunhos, mostrarExtras: showExtras, lerEmbed: lerEmbedDoDisco(raiz) });
store.set({ id, data, body, rendered: { html: html.get(id) }, … });
```

`rendered.html` é o jeito **oficial** do Astro de um carregador entregar o HTML pronto. Com ele, as páginas (T11 em diante) mostram o texto como em qualquer projeto Astro:

```astro
---
import { getEntry, render } from "astro:content";
const noticia = await getEntry("news", "2025-04-18-saiu-pederneira/pt");
const { Content } = await render(noticia);   // Content = um componente com o HTML do texto
---
<div class="prose"><Content /></div>
```

O "contexto" de cada texto é montado em `src/lib/corpos.ts`, com as regras do `build.py`:

- **Idioma:** o do arquivo (`en.md` ou `pt.md`).
- **Divisor:** só nos capítulos (o `divider` do `work.json` da obra).
- **Índice dos `[[links]]`:** com rascunhos na prévia (`pnpm dev`), sem eles no `pnpm build`, como o `python build.py serve` × `python build.py`.
- **Página Sobre:** o `build.py` monta a página Sobre com o texto de `pages/project` **na frente** do texto de `pages/about`, e converte os dois **juntos**. O `rendered.html` do `about` já vem assim.

Duas coisas ficam para a página fazer, como no `build.py`:

1. **Trocar os atalhos.** `{{emissaries}}` vira, no `rendered.html`, o marcador `<!--hc:atalho:emissaries-->` (um comentário HTML, invisível). Os cards dos emissários são feitos pela página (T11), que troca o marcador com `aplicarAtalhos(html, { emissaries: … })`.
2. **Aplicar o versalete no `<main>` inteiro, uma vez.** O `build.py` não põe o versalete no texto: ele aplica no fim, de uma vez, em **todo** o `<main>` da página (texto, títulos, cards). O Astro faz igual com `versaleteEntreTags()`. Uma vez só: aplicado de novo, a transcrição `/qo.ma.'ⁿdi.ʎa/` ganharia um segundo `<span class="ipa">` (há um teste que mostra isso).

Na prévia (`pnpm dev`), salvou qualquer arquivo de `content/`, o carregador refaz o HTML de todos os textos: o HTML de um texto depende de outros (o título de uma notícia aparece no `[[link]]` que aponta para ela; um embed novo muda o `{{embed:…}}`). Testado: com uma notícia A apontando para uma B que ainda não existia, o link apareceu em A assim que B foi criada.

## 5. Os recursos do seu Markdown, um por um

**`[[links]]`.** `[[seção/pasta]]` ou `[[seção/pasta|texto]]`. Vira link só se o item estiver **publicado naquele idioma**: rascunho só conta na prévia; obra só conta se tiver capítulo listado (ou link externo), e obra de capítulo único aponta direto para o capítulo (`[[works/firestriker]]` → `/pt/works/firestriker/01/`); com `show_extras: false`, personagens e universo não contam. Se não achar, sobra só o texto (ou o nome da pasta). Exemplo real: o texto do emissário Saf tem `[[works/all-in-a-nights-work|Ossos do Ofício]]`, que hoje sai como texto simples, porque o único capítulo de Ossos está `unlisted` (B6); quando ele for publicado, o link aparece sozinho.

**Divisor de cena.** `---` sozinho numa linha, nos capítulos, vira a imagem do divisor da obra (em Pederneira: `other images/Firestriker Scene Divider.png`); nas notícias, uma linha simples. `***` e `___` valem igual.

**Embeds.** `{{embed:nome}}` cola o arquivo `content/embeds/nome.html`; `{{embed:link}}` monta o post a partir do link (X/Twitter, Instagram, TikTok, YouTube vídeo ou Short, Reddit) e põe um "↗ X" embaixo; `{{embed:A | B}}` faz o bloco com **botões para alternar** (com os ícones de `static/social/`). Opção que não dá em nada (arquivo que não existe, link de site desconhecido) é pulada.

**Atalhos.** `{{stories}}`, `{{emissaries}}`, `{{other-stories}}`, sozinhos na linha: marcadores que a página troca (seção 4). Um atalho desconhecido some, como hoje.

**Versalete e IPA.** `Hᴀᴛᴇ Cʏᴄʟᴇ` → `<span class="hc">Hate Cycle</span>`; `Sᴇɴʜᴏʀ` → `<span class="hc">Senhor</span>`; e, na notícia do Dia 13: `qomandilla <span class="ipa">/qo.ma.'ⁿdi.ʎa/</span>` (dentro da transcrição, as letras ficam intactas).

## 6. A prova: `pnpm test`

Como nas lições 03 e 04:

1. **`tools/markdown_ref.py`** (Python, só biblioteca padrão) importa o `build.py` **sem gerar o site** e grava em `tests/fixtures/markdown-python.json`: o `make_md()` de **todos** os `.md` de `content/`, no contexto de cada um, sem e com o versalete, no build e na prévia; **todas as chamadas** ao `make_md()` feitas por um `build()` de verdade (para provar que o contexto é o mesmo, inclusive a página Sobre); 132 casos escritos à mão (um ou mais para cada regra: itálico colado em pontuação, negrito dentro de itálico, link com parênteses, imagem sem legenda, HTML cru com `@/`, listas com `*` e `-`, citação de várias linhas, títulos, `---`/`***`/`___`, embeds com 1, 2 e 3 opções, atalho desconhecido, link para rascunho e para item que não existe, `<` e `&` soltos, emojis, versalete dentro e fora de `/…/`…); 1000 casos sorteados; links e códigos de incorporação; e as definições de "letra", "espaço" e "algarismo" do Python.
2. **`tests/markdown.test.ts`** compara tudo, **texto a texto**: 2143 testes.

**E se o porte estivesse errado?** Para mostrar que o teste pega, estragamos de propósito uma regra de cada vez:

| Estrago proposital | Testes que falharam |
|---|---|
| itálico com a "letra" do JavaScript (só `a–z`) | 9 |
| quebra de linha sem o `\n` depois do `<br>` | 203 |
| `trim()` do JavaScript no lugar do `strip()` do Python | 32 |
| "qualquer caractere" do JavaScript no negrito | 4 |
| índice dos links com rascunhos também no build | 2 |
| transcrição fonética com 1 caractere (no Python, de 2 a 40) | 9 |

**A referência é uma foto do `content/`.** Mudou um texto, um embed ou um `work.json`? O teste avisa "A referência está velha". É só rodar os **dois** scripts (o da lição 04 e o desta) e testar de novo:

```bash
python tools/frontmatter_ref.py
python tools/markdown_ref.py
pnpm test
```

## 7. A ferramenta da prévia: `/dev/markdown/`

Enquanto as páginas de verdade não chegam (T11–T13), há uma ferramenta **só da prévia** para você ver o HTML de qualquer texto: com `pnpm dev` aberto, vá a `http://localhost:4321/dev/markdown/`. Clique numa entrada e veja, de cima para baixo: (1) como fica, com o versalete; (2) o que `<Content />` devolve; (3) o HTML como texto; (4) o Markdown que você escreveu. Ela **não existe** no `pnpm build` (não gera nenhuma página no `dist/`), então nunca vai para o ar.

## 8. Resumo: `build.py` × Astro (T09)

| No `build.py` | No Astro |
|---|---|
| `make_md()` | `markdownParaHtml()` em `src/lib/markdown.ts` |
| `smallcaps()` + a linha do `shell()` | `versalete()` + `versaleteEntreTags()` (a página aplica no `<main>`, uma vez) |
| `url_embed()`, `embed_html()` | `urlEmbed()`, `embedHtml()` |
| `INDEX`, `SHORT` (globais) | `indiceDeLinks()`, `MARCADORES_DE_ATALHO`/`aplicarAtalhos()` em `src/lib/corpos.ts` |
| `md(...)` chamado em cada página, com o contexto certo | o carregador guarda `rendered.html` em cada entrada; a página usa `render()` / `<Content />` |
| `python build.py --ver`… (não existia) | `python tools/markdown_ref.py --ver content/…/pt.md` e a ferramenta `/dev/markdown/` |

## 9. Rode você mesmo

```bash
pnpm test       # 3134 passed (700 das runas + 291 do conteúdo + 2143 do Markdown)
pnpm check      # 0 errors, 0 warnings
pnpm build      # nada muda nas páginas: o HTML de cada texto fica pronto dentro das coleções
pnpm dev        # e abra http://localhost:4321/dev/markdown/
python tools/markdown_ref.py --ver content/news/2025-04-18-saiu-pederneira/pt.md   # o HTML que o Python gera
```

## 10. Tente

1. **Escreva um texto de teste.** Crie a pasta `content/news/2099-12-31-teste-markdown/` com um `pt.md`:

   ```
   ---
   title: Teste de Markdown
   draft: true
   ---

   Um parágrafo com *itálico*, **negrito**, Hᴀᴛᴇ Cʏᴄʟᴇ e um link: [[works/firestriker|Pederneira]].

   ---

   Depois do divisor.
   ```

   Com `pnpm dev` aberto, vá a `http://localhost:4321/dev/markdown/` → `news` → `2099-12-31-teste-markdown/pt`. Repare: o `---` virou uma linha simples (é uma notícia; num capítulo seria a imagem do divisor da obra), o link aponta para `/pt/works/firestriker/01/` e "Hate Cycle" aparece em versalete na caixa 1, mas em letras Unicode na caixa 2 (o versalete é aplicado pela página).
2. **Compare com o Python:** `python tools/markdown_ref.py --ver content/news/2099-12-31-teste-markdown/pt.md --previa` deve imprimir exatamente o HTML da caixa 3.
3. **Veja o teste pedir uma foto nova:** rode `pnpm test`. Ele falha dizendo que a referência está velha (o arquivo novo não está na foto). Rode os dois scripts da seção 6 e `pnpm test` de novo: tudo verde.
4. **Desfaça:** apague a pasta `2099-12-31-teste-markdown`, rode os dois scripts e `pnpm test` mais uma vez. (`git status` não deve mostrar nada em `tests/fixtures/`.)
5. **Quebre o teste de propósito.** Em `src/lib/markdown.ts`, na função `soft()`, troque `"<br>\n"` por `"<br>"` e rode `pnpm test`: uns 200 testes falham, cada um mostrando o arquivo e a diferença (`Expected` = Python, `Received` = Astro). Desfaça a troca (Ctrl+Z) e rode de novo.
6. **Pense (sem mexer):** por que o versalete não pode ser aplicado no texto **e** de novo no `<main>`? (Dica: seção 4, a transcrição do Dia 13.)

## Para a próxima lição

A T10 traz para `src/lib` as **regras** do site que ainda estão misturadas com HTML no `build.py` (ordem das obras, "Últimas atualizações", datas em português e inglês), como funções testadas. Depois, na T11, as primeiras páginas de verdade usam tudo isto: `render()`, `aplicarAtalhos()` e `versaleteEntreTags()`.
