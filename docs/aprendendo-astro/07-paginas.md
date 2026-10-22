# Lição 07 — As primeiras páginas de verdade: Home, Histórias e a página da obra (T11)

Até a T10 o Astro sabia ler o `content/`, transformar o texto em HTML e **decidir** (que obra aparece, em que ordem, com que data). Faltava **desenhar**. Na T11 nascem as três primeiras páginas reais do site, nos dois idiomas:

| O visitante vê | Endereço (igual ao de hoje) | Arquivo do Astro |
|---|---|---|
| A home (hero, "Últimas atualizações", carrossel, "Sobre o projeto") | `/pt/` e `/en/` | `src/pages/[lang]/index.astro` |
| A grade de Histórias, com busca, filtro e ordem | `/pt/works/` e `/en/works/` | `src/pages/[lang]/works/index.astro` |
| A página de uma obra com vários episódios (hoje, só Luz & Sangue) | `/pt/works/light-and-blood/` e `/en/works/light-and-blood/` | `src/pages/[lang]/works/[obra]/index.astro` |

Para o visitante **nada muda**: a prova está nos 12 screenshots lado a lado (Python × Astro, 1100 px e 390 px) e nos testes de paridade. Os pares saíram idênticos pixel a pixel (com as runas paradas e as fontes do Google fora do ar nos dois lados).

## O que você vai entender

1. **Rotas dinâmicas**: como UM arquivo (`[lang]`, `[obra]`) vira várias páginas, com `getStaticPaths()`. É o que o `for` do `build()` faz hoje.
2. **Páginas "burras"**: a página só desenha o que `src/lib/` devolve.
3. **Componentes com props**: `WorkCard`, `SecaoHistorias`, `Carrossel`…
4. **`<script>` só onde precisa**: apenas o seletor, o carrossel e dois "reservas" de imagem.
5. **Versalete uma vez só no `<main>`**, e por que a ordem importa.
6. **Como se prova que é igual** (comparação estrutural, não de texto) e **o que é diferente de propósito**.

## Abra lado a lado (nesta ordem)

1. `build.py`: o `build()` a partir da linha ~662 (`for l in LANGS`), a home (~690–766) e as páginas de obra (~769); `card_work()`, `sorter_html()` e `shell()` (~357).
2. `src/pages/[lang]/works/[obra]/index.astro`: o exemplo mais completo de `getStaticPaths()`.
3. `src/pages/[lang]/index.astro` e `src/pages/[lang]/works/index.astro`: as outras duas, bem curtas.
4. `src/lib/paginas.ts` (dados para desenhar) e `src/lib/pagina.ts` (`finalizarMain()`, o acabamento do `<main>`).
5. `src/layouts/BaseLayout.astro`: onde o miolo é capturado e finalizado.
6. `src/components/`: `WorkCard`, `SecaoHistorias`, `SeletorDeHistorias`, `Carrossel`, `ConteudoDaHome`, `ConteudoDaObra`.
7. `static/site.js` (bloco 1, o seletor) ao lado de `src/lib/seletor.ts` e do `<script>` de `SeletorDeHistorias.astro`.
8. A prova: `tests/paginas.test.ts`, `tests/componentes.test.ts`, `tests/ajudantes/html.ts`, `tools/paginas_ref.py`, `tools/seletor_playwright.py`.

## 1. Rotas dinâmicas e `getStaticPaths()`

No `build.py` as páginas nascem de repetições: para cada idioma, para cada obra, `write(url, html)`. No Astro, **o nome do arquivo é a rota**, e colchetes dizem "aqui vai um valor que muda":

```
src/pages/[lang]/index.astro              →  /pt/   /en/
src/pages/[lang]/works/index.astro        →  /pt/works/   /en/works/
src/pages/[lang]/works/[obra]/index.astro →  /pt/works/light-and-blood/   /en/works/light-and-blood/
```

Como o site é estático (tudo gerado antes de ir ao ar), o Astro precisa saber **quais valores existem**. Quem diz é a função `getStaticPaths()`, que devolve a lista de páginas a gerar. Esta é a da home de Histórias (a mais simples):

```ts
export function getStaticPaths() {
  return langs.map((lang) => ({ params: { lang } }));   // [{params:{lang:"en"}}, {params:{lang:"pt"}}]
}
```

E esta é a da obra, o equivalente ao laço `for w in works` do `build()`:

```ts
for (const lang of langs) {
  const dados = dadosDe[lang];
  for (const obra of dados.obras) {
    const slug = obra.data._origem.slug;
    const pagina = paginaDaObra(obra, lang, dados.capitulosDe(obra));
    if (!pagina) continue;                    // obra sem página própria: nenhuma rota é criada
    saidas.push({ params: { lang, obra: slug }, props: { pagina, alternates: … } });
  }
}
```

Três coisas para notar:

- **`params`** completa o endereço (`[lang]`, `[obra]`); **`props`** entrega à página os dados já prontos. Assim a página não precisa recalcular nada.
- **Quem decide se uma obra tem página é `paginaDaObra()`** (T10, `src/lib/capitulos.ts`), igual ao `if` do `build.py`. Obra de capítulo único, com link externo ou sem capítulo devolve `null`, e `getStaticPaths()` simplesmente não cria a rota. Por isso hoje só existe `/light-and-blood/`. Se amanhã você publicar um segundo capítulo de Firestriker, a página dele passa a existir **sozinha**, sem mexer em código.
- **O endereço é o mesmo de antes**, e `/en/` e `/pt/` continuam com a mesma pasta de obra (`light-and-blood`) nos dois idiomas, porque os comentários dependem disso (invariante 2 do `CLAUDE.md`).

Os esqueletos `src/pages/en/index.astro` e `src/pages/pt/index.astro` (T05) foram **apagados**: um único `[lang]/index.astro` os substitui.

## 2. A página só desenha

Abra `src/pages/[lang]/works/index.astro`. Tem 10 linhas úteis. Ela **não decide nada**: pede `dadosDoIdioma(lang)` (T10), pede `dadosDosAtalhos()` (`src/lib/paginas.ts`) e entrega os dados aos componentes. Quem decide "quais obras", "em que ordem", "qual botão" é `src/lib/`; os componentes só espalham isso em HTML.

Isso é o que torna os testes possíveis: as regras já foram provadas contra o Python na T10; na T11 só falta provar que **o desenho** é igual.

## 3. Componentes com props

`WorkCard.astro` é o cartão de uma obra. Hoje, no Python, é a função `card_work(w, lang)`; no Astro, é um componente que recebe **um cartão pronto** (`CartaoDaObra`, calculado em `src/lib/obras.ts`):

```astro
---
const { cartao } = Astro.props;       // as props: o "argumento" do componente
---
<div class="work-card" data-title={cartao.titulo} …>
```

O mesmo cartão é usado em três lugares: a grade de Histórias, o carrossel da home e a seção "outras histórias". Se um dia você quiser mudar o cartão, muda em **um** arquivo.

Os atalhos `{{stories}}`, `{{other-stories}}` e `{{emissaries}}`, que você pode escrever em qualquer texto de `content/`, também viraram componentes (`SecaoHistorias`, `OutrasHistorias`, `SecaoEmissarios`). `tests/componentes.test.ts` desenha cada um com dados de verdade **e** com "sites inventados" (obra fora do universo, sem capa, emissário sem foto…) e compara com o `SHORT` do `build.py`.

### Como um componente chega dentro do texto: slots `atalho-*`

O texto de uma página (por exemplo, o de Sobre) traz o marcador `{{stories}}`. O layout recebe o componente por um **slot nomeado**:

```astro
<ConteudoDeHistorias lang={lang} />
<SecaoHistorias slot="atalho-stories" … />
```

O `BaseLayout` desenha o slot `atalho-stories` e `aplicarAtalhos()` troca o marcador pelo HTML dele. É a ponte entre "texto do autor" e "componente do Astro". A T14 (Sobre) reaproveita exatamente isso.

## 4. `<script>` só onde precisa

O site **não tem JavaScript no navegador** além do que é necessário. No Astro, um `<script>` dentro de um componente vira JavaScript no navegador. Na T11 há só quatro:

| Componente | Para quê |
|---|---|
| `SeletorDeHistorias` | busca, filtro de tipo, ordem e sentido (o bloco 1 do `site.js`) |
| `Carrossel` | setas e a "borda esmaecida" do carrossel da home (o bloco 2 do `site.js`). Desde a T17j (pedido do autor): até 4 histórias, e a seta da direita é um `<a href>` desenhado no servidor ("Ver todas as histórias" no mouse/foco; no celular, sempre à vista abaixo); o `<script>` só cria as setas de **rolar**, quando há para onde rolar |
| `WorkCard` e `CardEmissario` | se a imagem falhar ao carregar, mostram o fundo reserva |

**O seletor é o caso instrutivo.** A decisão "quais cartões aparecem e em que ordem" é a função pura `organizarCartoes()`, que na T10 morava em `obras.ts` e era provada por teste. Mas `obras.ts` importa o `config.json`, e **o `config.json` não pode ir para o navegador** (tem as chaves do Supabase). Solução: a função foi movida para `src/lib/seletor.ts`, um arquivo **sem nenhum import de valores** (só um `import type`), que roda tanto no teste quanto no navegador:

```ts
// <script> de SeletorDeHistorias.astro
import { MODOS_DE_ORDEM, organizarCartoes } from "../lib/seletor";
…
const { visiveis, ocultos } = organizarCartoes(cartoes, { modo, decrescente, midia, busca, lang });
```

Comparado com o `site.js`: o `apply()` de lá faz a regra e mexe no DOM tudo junto; aqui a regra é a função (a mesma que o teste do Python já provou) e o `<script>` só **lê** os `data-*` dos cartões e **reordena** o DOM. O resultado é provado em navegador de verdade por `tools/seletor_playwright.py` (seção 7).

Um detalhe de engenharia: o Astro põe o `<script>` do componente **no meio do HTML**, no primeiro lugar onde o componente aparece. Isso quebraria o `<main>` igual ao do Python (e o versalete leria o código do script). Por isso `finalizarMain()` tira os `<script type="module">` do miolo e o layout os põe depois do rodapé, onde o site atual tem o `<script src="site.js">`.

## 5. Versalete uma vez só no `<main>`

Lembra do `Hᴀᴛᴇ Cʏᴄʟᴇ` (lição 05)? O texto do autor guarda a marca em versalete Unicode, e o site a transforma em `<span class="hc">` **no `<main>` inteiro**, incluindo o texto dos componentes. A ordem em `src/lib/pagina.ts`, igual à do `shell()` do Python, é:

1. `aplicarAtalhos()`: os marcadores viram o HTML dos componentes;
2. `versaleteEntreTags()`: **uma vez**, no `<main>` todo;
3. `data-prev`/`data-next`: os rótulos das setas, acrescentados a `class="works"`.

Aplicar o versalete duas vezes dá resultado **diferente** (as transcrições `/…/` ganhariam um segundo `<span class="ipa">`). Por isso nenhum componente aplica versalete por conta própria: **só** o `BaseLayout`, via `finalizarMain()`. Regra para as próximas tarefas: **componente novo desenha texto cru e deixa o versalete para o layout**.

## 6. Como se prova que a página é igual

Dois níveis, ambos em `pnpm test`:

- **`tests/paginas.test.ts`** constrói o site Astro de verdade (numa pasta temporária; use `HC_DIST=dist pnpm vitest run paginas` para reaproveitar o `dist/` já feito) e compara, para cada página, com o HTML completo que o `build.py` gera (`tests/fixtures/paginas-t11-python.json`, tirado por `python3 tools/paginas_ref.py`): o `<head>`, o `<main>`, o cabeçalho, o rodapé, as runas e a classe do `<body>`.
- **`tests/componentes.test.ts`** desenha cada componente com o Container API do Astro e compara com o Python em 8 "ambientes" (conteúdo real com e sem rascunhos e três sites inventados) e nos dois idiomas.

**Por que não comparar texto contra texto?** O Python e o Astro escrevem o mesmo HTML de jeitos diferentes: `&#x27;` × `&#39;`, `class=emi-text` sem aspas × com aspas, uma quebra de linha a mais. Para o navegador, tudo isso é igual. Então `tests/ajudantes/html.ts` usa um **leitor de HTML de verdade** (`parse5`, o mesmo que os navegadores usam) e compara **a árvore**: as mesmas tags, na mesma ordem, os mesmos atributos (e a lista de classes, item por item, na mesma ordem) e o mesmo texto. O que ele **ignora**, de propósito: comentários, `data-astro-cid-*` e a quantidade de espaço em branco que não aparece na tela (o espaço entre dois `<a>` **conta**, porque aparece).

### As diferenças técnicas que restam (e por que são aceitáveis)

| O que difere | Por quê | O visitante nota? |
|---|---|---|
| Caminhos do CSS e do JS (`/_astro/…hash….css`, `.js`) em vez de `/style.css` e `/site.js` | O Astro empacota e põe um "carimbo" no nome (cache correto). O teste confere que o `<link>` de `custom.css` continua depois do CSS do site (para o seu CSS vencer) | Não |
| `data-astro-cid-…` no Header e no Footer | Marca de escopo do `<style>` dos componentes da T06 | Não |
| Texto do `<script>` da tela de abertura | No Python é uma linha minificada; no Astro vem do componente `Abertura`, formatado, com `define:vars`. O teste compara que há o mesmo número de scripts e que cada um tem as mesmas peças-chave (`hc-intro`, `prefers-reduced-motion: reduce`, o tempo limite) | Não |
| Ano do rodapé | O `© 2023 - 2026` é calculado na hora do build; o teste normaliza o ano para não quebrar em 1.º de janeiro | Não |
| `&#39;` × `&#x27;`, aspas em atributos, comentários HTML | Formas diferentes de escrever o mesmo | Não |

### Bugs do site atual que o Astro reproduz (de propósito, até a virada)

A migração não "conserta" nada sem você pedir: o objetivo é **paridade**. Foram reproduzidos, por exemplo: o `data-labels` do seletor com espaços (`json.dumps` do Python: `", "` e `": "`, imitado por `direcoesComoJson()`); o `<p></p>` vazio nos cartões de "Últimas atualizações" sem resumo; e o `replace('class="works"', …)` do `shell()`, que acrescenta `data-prev`/`data-next` em **qualquer** elemento com essa classe exata. Qualquer correção entra como tarefa separada, depois da virada.

## 7. O seletor, em navegador de verdade

O seletor só funciona com JavaScript; um teste de HTML não o exercita. Por isso `tools/seletor_playwright.py` abre `/pt/works/` e `/en/works/` do site Python **e** do Astro, executa o mesmo roteiro (cada ordem em cada sentido, cada tipo, buscas com maiúscula, sem acento, com espaços e "nenhum resultado", combinações, recarregar a página) e compara, passo a passo, a **ordem** dos cartões, quais estão **ocultos**, a mensagem "Nenhuma história encontrada." e o que ficou no `localStorage` (a ordem escolhida é lembrada). São 66 passos; qualquer diferença faz o script sair com erro e dizer qual.

## Rode você mesmo

```bash
pnpm dev                                                   # http://localhost:4321/pt/  e /pt/works/
pnpm build                                                 # gera dist/ com 6 páginas
HC_DIST=dist pnpm vitest run paginas                       # paridade do <main>/<head> de cada página, usando o dist/ pronto
pnpm vitest run componentes                                # componentes × SHORT do Python
python3 tools/paginas_ref.py                               # refaz as fotos do Python (depois de mudar content/ ou config.json)
```

O seletor no navegador (com o site Python gerado em outra pasta; sempre sob `timeout`, e sem `pkill`):

```bash
timeout 300 python3 -m http.server 8791 -d <pasta do site Python> &
timeout 300 python3 -m http.server 8792 -d dist &
python3 tools/seletor_playwright.py --python 8791 --astro 8792
```

## Tente (sem tocar no `config.json` real)

1. **Quebre o desenho de propósito.** Em `src/components/WorkCard.astro`, troque a classe `work-card` por `work-cartao`, rode `pnpm build` e depois `HC_DIST=dist pnpm vitest run paginas`. O teste vai apontar a página, o trecho da árvore e a diferença. Desfaça.
2. **Mude uma regra e veja só o desenho reagir.** Copie `config.json` para o scratchpad (NUNCA edite o real), mude o texto `ui.pt.hate_stories_sub` na cópia e veja onde ele aparece lendo `SecaoHistorias.astro`. Nenhuma página precisa mudar: elas só desenham `t(lang, "hate_stories_sub")`.
3. **Veja uma rota nascer sozinha.** Numa CÓPIA do repositório (nunca no seu), crie um segundo episódio de Firestriker (`python3 build.py new chapter firestriker`, preenchendo `en.md` e `pt.md`), rode `pnpm build` e veja `/pt/works/firestriker/` aparecer em `dist/`, sem editar nenhum `.astro`.
4. **Leia `getStaticPaths()` de trás para frente:** se a lista devolvida tivesse uma obra a mais, o que o Astro faria? (Resposta: uma página a mais, sem aviso. É por isso que `paginas.test.ts` confere o **conjunto** de endereços do escopo, e não só o conteúdo de cada um.)

## O que as próximas tarefas reaproveitam

- **T12 (capítulos), T13 (notícias), T14 (Sobre, raiz, 404, RSS):** acrescentem o grupo em `GRUPOS` de `tools/paginas_ref.py`, rodem o script e estendam `tests/paginas.test.ts` com o novo conjunto de URLs; a comparação (`tests/ajudantes/html.ts`) e o `BaseLayout` com `finalizarMain()` já servem. O Sobre usa `SecaoEmissarios` e os slots `atalho-*`.
- O script do bloco 3 do `site.js` (gifs de `.page-project .prose`) não precisou ser portado: nenhuma página tem `.page-project .prose` **com** GIFs dentro (a Sobre, que tem os GIFs, é `.page-about`; Histórias é `.page-project`, mas sem GIFs), então ele não faz nada (conferido na T18). O `site.js` continua sendo carregado como está (lição 09).
- Qualquer componente novo com `<script>`: `type="module"` já é tratado por `finalizarMain()`; escreva `<style is:global>` dentro de `@layer site` (o escopo do Astro, `data-astro-cid-*`, mudaria o HTML e o `custom.css` do autor perderia a briga de especificidade).
