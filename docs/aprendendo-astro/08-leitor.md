# Lição 08 — O leitor de capítulos: onde os seus textos aparecem (T12)

Até a T11 o Astro já desenhava a home, Histórias e a página de Luz & Sangue. Faltava o principal: **a página onde se lê**. Na T12 nascem os capítulos, nos mesmos endereços de hoje:

| O visitante vê | Endereço (igual ao de hoje) |
|---|---|
| Ossos do Ofício (capítulo `unlisted`, só em inglês) | `/en/works/all-in-a-nights-work/01/` |
| Pederneira (capítulo único, fonte Times, o degradê do fim) | `/pt/works/firestriker/01/` e `/en/works/firestriker/01/` |
| Luz & Sangue, episódios 1 e 2 (vídeo, com setas e "Todos os episódios") | `/pt/works/light-and-blood/01/`, `…/02/` e os dois em `/en/` |

Para o visitante **nada muda**. As 10 capturas lado a lado (Python × Astro, 1100 px e 390 px) só diferem no que se mexe sozinho: o brilho das runas animadas do fundo e o quadro do GIF animado de Ossos ("NO… …I CAN'T…"). Com as runas paradas ("reduzir movimento") e o GIF congelado num quadro, saíram idênticas pixel a pixel, inclusive o sonho de Ossos, o Giuseppe contornado pelo texto, as tiras, a carta (frente e verso) e o degradê de Pederneira. Os comentários continuam com **os mesmos IDs**, e o `comments.js` de hoje funciona sem mudança.

> **Mudança de plano em relação ao mapa original.** O mapa previa "componentes dentro do texto (MDX)" para os efeitos das histórias. Na T09 a decisão D4 mudou (`docs/ARQUITETURA.md`): o Markdown do site é um **porte fiel do `make_md()`**, sem MDX. Esta lição mostra por que isso basta: os efeitos são **HTML cru com classes** dentro do seu texto, e continuam funcionando sem nenhum componente no meio do texto.

## O que você vai entender

1. **Rota aninhada**: um arquivo `[obra]/[capitulo]` que vira uma página por capítulo.
2. **O leitor só desenha**: tudo o que a página mostra é decidido em `src/lib/leitura.ts`.
3. **Prosa, vídeo e quadrinho**: como o mesmo componente mostra os três formatos.
4. **Os efeitos do seu texto sem MDX**: sonho, Giuseppe, carta, tiras, degradê.
5. **Anterior / próximo / voltar**.
6. **Por que os IDs de comentários são sagrados**, e onde moram as chaves do Supabase.
7. **JavaScript só onde precisa**: a carta que vira.
8. **Como se prova que é igual**, o que difere por motivo técnico e os bugs do site atual que foram reproduzidos.

## Abra lado a lado (nesta ordem)

1. `build.py`, o laço dos capítulos dentro do `build()` (linhas ~788–828), e `pager()`, `arrow()`, `draft_banner()` e `comments()` (~577–613).
2. `src/pages/[lang]/works/[obra]/[capitulo]/index.astro`: a rota (40 linhas).
3. `src/lib/leitura.ts`: as regras do leitor. Ao lado, `src/lib/capitulos.ts` (T10), de onde vêm título, número, anterior/próximo e o ID dos comentários.
4. `src/components/Leitor.astro`, e os pedaços: `CabecalhoDoCapitulo`, `Pager`, `Seta`, `Comentarios`, `CartaQueVira`, `PostsAlternados`.
5. `src/styles/prosa.css`: o CSS do **seu texto** (o fim dele é a cena 1 de Ossos).
6. `src/lib/comentarios.ts` e `src/lib/quadrinhos.ts`.
7. A prova: `tests/paginas.test.ts` (grupo t12 e a lista de IDs), `tests/leitor.test.ts`, `tools/paginas_ref.py`.

## 1. A rota aninhada

Na lição 07, `[obra]` virava uma página por obra. Agora há **duas** partes que mudam no endereço:

```
src/pages/[lang]/works/[obra]/index.astro              →  /pt/works/light-and-blood/
src/pages/[lang]/works/[obra]/[capitulo]/index.astro   →  /pt/works/light-and-blood/02/
```

O `getStaticPaths()` da rota de capítulo devolve um `params` com as três partes, `{ lang: "pt", obra: "light-and-blood", capitulo: "02" }`, e, em `props`, a página já pronta (`leitura`). É o laço `for w in works: for c in capítulos` do `build.py`:

```ts
for (const lang of langs)
  for (const obra of dadosDe[lang].obras)
    for (const leitura of leiturasDaObra(obra, lang, capitulos, ferramentas))
      saidas.push({ params: { lang, obra: obra.data._origem.slug, capitulo: leitura.pasta }, props: { leitura } });
```

Regras que vêm junto, iguais às de hoje:

- **Toda obra** gera as páginas dos seus capítulos, **inclusive** obra escondida (`listed: false`) e obra com link para fora. Esconder a obra tira o cartão das listas, mas o endereço do capítulo continua existindo.
- **Rascunho** (`draft: true`) só existe no `pnpm dev`, com a faixa amarela "Rascunho" no topo.
- **`unlisted: true`** gera a página, mas com `noindex` (fora dos buscadores), sem anterior/próximo e sem "voltar", e **sem nenhum `hreflang`**. Esse último detalhe é do site atual: o `build.py` marca o próprio idioma como "não existe" para capítulos `unlisted`. Para imitar isso, o `BaseLayout` passou a aceitar `null` nas alternativas (seção 8).

## 2. O leitor só desenha

Abra a rota: ela não decide nada. Quem decide é `leiturasDaObra()` (`src/lib/leitura.ts`), uma **função pura**: recebe a obra e os capítulos e devolve, para cada capítulo, um `LeituraDoCapitulo`, com:

- os dados do `<head>`: título da aba ("Light & Blood — Episode 2"), descrição (o `summary:`), imagem (a capa), `noindex` e os outros idiomas;
- a classe do `<body>`: `reader reader-video`. Com `reader`, o `<main>` **não** ganha a "folha" de papel; o leitor tem as dele;
- o cabeçalho: logo (como link para a obra, exceto em obra de capítulo único), título e data;
- o conteúdo: prosa, vídeo ou quadrinho (seção 3);
- os comentários (seção 6) e se o texto precisa de JavaScript (seção 7).

Duas coisas "de fora" entram como **ferramentas**, para o teste poder trocá-las: o *glob* de `static/` (as páginas dos quadrinhos) e a função que monta os comentários. Assim, `tests/leitor.test.ts` roda **as mesmas regras** com sites inventados, numa pasta temporária, com chaves de mentira.

## 3. Prosa, vídeo e quadrinho

A regra do formato é a do `build.py` (`formatoDeLeitura()`, T10): obra `"kind": "comic"` → **quadrinho**; capítulo com `youtube:` ou obra `"kind": "video"` → **vídeo**; o resto → **prosa**.

| Formato | O que aparece (em ordem) |
|---|---|
| Prosa | folha de papel → cabeçalho → linha fina → **o seu texto** (com `font-times` se o `work.json` tem `"reading_font": "times"`) → pager |
| Vídeo | folha → cabeçalho → vídeo do YouTube (com setas redondas ao lado, se houver episódio anterior/próximo) → sua nota, se houver → "Todos os episódios" |
| Quadrinho | folha **escura** (roxo-noite), logo invertida → pager → as páginas → sua nota → pager de novo |

As páginas do quadrinho vêm de `pages:` (uma lista) e de `pages_glob:` (ex.: `comics/beira/01/*.png`), em **ordem numérica natural** (`2.png` antes de `10.png`). Nenhuma HQ está publicada hoje, mas o leitor já foi provado com quadrinhos inventados contra o Python (`src/lib/quadrinhos.ts`). Detalhes que o site atual tem e que foram mantidos: `*` também pega arquivos que começam com ponto e subpastas; `*.png` não pega `.PNG`.

## 4. Os efeitos do seu texto, sem MDX

O seu Markdown já tem HTML cru, e é ele que faz os efeitos:

```html
<div class="s1 mid gap">He closes his eyes<span class="ps"> for a fraction of a moment…</span></div>
<div class="s1 ps">The other man, with a newspaper in hands, …</div>
<img class="jusep" src="/other images/Giuseppe.png" alt="Giuseppe">
<div class="flip-card"><div class="flip-card-inner">…</div></div>
<span style="opacity:0.47">a</span>   ← o degradê do fim de Pederneira, letra a letra
```

O caminho até a tela:

1. O carregador (T09) passa o seu texto pelo porte do `make_md()`. Blocos que começam com `<div`, `<img`… **passam sem mudança** (o `@/` vira o caminho certo). Resultado: `rendered.html`.
2. O `Leitor` põe esse HTML dentro de `<div class="prose story font-times">` com `<Fragment set:html={textoDoAutor(c.nota)} />`. `set:html` significa "cole este HTML como está"; `textoDoAutor()` (`src/lib/pagina.ts`) marca o trecho como **seu**, para o acabamento do `<main>` não mexer nele além do que o Python mexe (seção 8).
3. O CSS das classes está em `src/styles/prosa.css`, copiado de `static/style.css` **com os mesmos valores**. Por exemplo, o sonho:

```css
.story .s1.ps, .story .s1 .ps { font-family: "PT Serif", Georgia, serif; font-size: .909em; color: #111012; }
```

Repare no `.story` no começo: o sonho só vale **dentro do leitor**. Fora dele, o mesmo HTML não muda de fonte, nem no site atual.

Por que não MDX? Porque nada aqui precisa de um "componente dentro do texto": o efeito é **o seu HTML + uma regra de CSS**. Com MDX, você teria de escrever de outro jeito (`.mdx`, `import`, `<Componente />`) e o texto ficaria mais frágil. O jeito de escrever não mudou (D7).

Conferido no navegador, nos dois sites (estilo calculado, não só a aparência): o sonho sai em "PT Serif", cor rgb(17, 16, 18) = **#111012**, 15,7 px contra os 17,3 px do Times ao redor; o Giuseppe tem `float: left` e `shape-outside` com o desenho dele; o Road Rage, o zalgo e o "Lᴏʀᴅ" saem como hoje.

## 5. Anterior, próximo e voltar

As regras são as da T10 (`paginasDosCapitulos()`): os vizinhos vêm só dos capítulos **listados**; obra de capítulo único e capítulo `unlisted` não têm vizinhos nem "voltar". O desenho é o `Pager.astro`, o `pager()` do Python: botão redondo com a seta (`Seta.astro`), o rótulo ("Anterior") e, embaixo, em letra menor, o título do vizinho. O botão do meio é "Todos os capítulos" ou "Todos os episódios". Nas notícias (T13) o mesmo `Pager` vai mostrar "Todas as notícias".

Um detalhe do site atual que foi mantido: a logo do capítulo de uma obra com link externo leva à página da obra, que não existe (só com capítulo de obra externa, coisa que hoje não há).

## 6. Os IDs de comentários são sagrados

Cada conversa no Supabase está guardada com o ID da página: `works/<obra>/<capítulo>`, **sem o idioma** (quem comenta em `/pt/` e em `/en/` está na mesma conversa). Se o Astro escrevesse `works/firestriker/01/pt`, ou se uma pasta mudasse de nome, as conversas continuariam no banco, mas **nenhuma página as mostraria mais**. Por isso:

- `Comentarios.astro` reproduz **o mesmo HTML** do `comments()`: a `<section class="hc-comments" data-page="…">`, o `<script>window.HC=…</script>`, o supabase-js do jsDelivr e o `/comments.js?v=…`. O `comments.js` de hoje não precisou mudar (o porte dele é a T15). **Desde a T15**, os dois `<script src>` (CDN e `/comments.js`) deram lugar ao script empacotado da `CaixaDeComentarios.astro`; a `<section>`, o `data-page` e o `window.HC` continuam iguais (lição 10).
- `tests/paginas.test.ts` lê **todas** as páginas que o Astro gera e compara a lista de `data-page` com `baseline/comentarios.json`. Hoje são 7 páginas e 4 IDs (`works/all-in-a-nights-work/01`, `works/firestriker/01`, `works/light-and-blood/01`, `works/light-and-blood/02`), idênticos. A T13 estende o mesmo teste às notícias.

**As chaves do Supabase.** O `window.HC` leva a URL do projeto e a chave *anon*, como hoje. Isso é de propósito: a chave anon é pública por desenho, e quem protege o banco é o RLS (`supabase-setup.sql`). Mesmo assim, ela mora em **um arquivo só**: `src/lib/comentarios.ts` é o único que lê `config.json → comments`, e não a entrega a ninguém. No `dist/`, a chave aparece só dentro do `window.HC` das 7 páginas com comentários, nada nos arquivos JavaScript. Nos testes e nas fixtures, os valores viram marcadores (`__SUPABASE_URL__`, `__SUPABASE_ANON_KEY__`). As regras de sempre continuam: `comments: false` tira a caixa; sem as duas chaves, o site publicado não mostra nada e o `pnpm dev` mostra o aviso "comentários não configurados".

## 7. JavaScript só onde precisa

O `site.js` de hoje roda em todas as páginas. No Astro, o bloco 4 (a carta que vira) virou `CartaQueVira.astro`: um componente que é **só** um `<script>`. O `Leitor` o inclui apenas quando o seu texto tem uma `.flip-card`. Por isso Pederneira e Luz & Sangue não levam esse JavaScript; Ossos leva. O comportamento é o mesmo nos dois sites, testado no navegador: clique vira, clique de novo desvira, Enter e Espaço também viram, e o Espaço não rola a página.

O mesmo vale para `PostsAlternados.astro` (o botão que alterna entre dois posts incorporados, `{{embed:A | B}}`). Nenhum capítulo usa hoje; está pronto para quando usar, e as notícias (T13) reaproveitam.

## 8. Como se prova que é igual

- **As 7 páginas reais**: `tests/paginas.test.ts`, grupo t12. É a mesma comparação estrutural da lição 07 (`<head>`, `<main>`, runas, cabeçalho, rodapé), contra o HTML que o `build.py` gera (`tests/fixtures/paginas-t12-python.json`, tirado por `python3 tools/paginas_ref.py`).
- **O que hoje não existe no site**: `tests/leitor.test.ts` refaz 7 sites (o real, os 3 inventados da T10 e 3 inventados para o leitor), cada um em build e em prévia, e compara **514 capítulos** com o Python: quadrinhos com `pages`/`pages_glob` (ordem natural, pastas, `**`, arquivo oculto), vídeo com e sem setas, prosa com fonte, divisor e logo, oneshot com e sem logo, obra externa, escondida e só-pt, rascunho, `unlisted`, `comments: false`, comentários sem chaves (nada no build, aviso na prévia), com só uma chave, e com chaves "sujas" (espaços e `/rest/v1/` no fim, que o `build.py` limpa). Depois da revisão independente: títulos com `<`, `>` e versalete que vão parar em atributos (`A -> Hᴀᴛᴇ <- B` no alt das páginas da HQ, no alt da logo, no title/aria-label das setas do vídeo), HTML cru do autor com `<`/`>` num atributo, um `<script type="module">` escrito pelo autor e páginas de HQ com algarismos de outras escritas (`p１.png`, `p٣.png`) e números enormes no nome.
- **No navegador**: capturas lado a lado e o teste da carta (seção 7).

### Diferenças técnicas aceitas

| O que difere | Por quê | O visitante nota? |
|---|---|---|
| O CSS do leitor vem num arquivo `/_astro/…css` próprio, e só nas páginas de capítulo | Empacotamento do Astro (lição 07) | Não |
| `shape-outside` do Giuseppe aponta para `/other%20images/Giuseppe.png` (no `style.css`, `other images/…` relativo) | O CSS empacotado mora em `/_astro/`, então o caminho precisa começar na raiz; o Vite escreve o espaço como `%20` | Não (mesmo arquivo) |
| O script da carta é um `<script type="module">` no fim da página, e só em Ossos | Antes era o `site.js` em toda página | Não |
| `BaseLayout` aceita `null` em `alternates` | Para imitar o `alt_c` do Python: capítulo `unlisted` sem `hreflang` | Não (o HTML sai igual) |
| GIF animado ("NO… …I CAN'T…") e runas do fundo podem aparecer em outro instante numa captura | São animações; com as runas paradas e o GIF congelado no 1º quadro, as duas capturas são idênticas | Não |
| Marcas `<!--hc:autor-->…<!--/hc:autor-->` em volta do seu texto, só durante o acabamento | O Astro escreve `<` e `>` crus nos atributos (o Python escreve `&lt;`/`&gt;`). Sem cuidado, o versalete do `<main>` entraria num `alt="A -> Hᴀᴛᴇ <- B"` e quebraria o HTML. O acabamento protege os atributos dos componentes, mas deixa o seu texto exatamente como o Python o trata, inclusive um `<script type="module">` seu, que fica no lugar | Não (as marcas somem antes de a página ser gravada) |

### Bugs do site atual reproduzidos (de propósito, até a virada)

- **Capítulo `unlisted` sem nenhum `hreflang`**, nem para si mesmo.
- **Ordem natural com empate**: num quadrinho, `01.png` e `1.png` valem o mesmo número. O Python deixa a ordem que o sistema de arquivos der, que pode mudar de computador para computador; o Astro usa a ordem alfabética do caminho. Conselho: não misture os dois estilos de nome num capítulo.
- O `<nav>` do pager diz `aria-label="Chapters"` em inglês, também em português (e nas notícias).
- A caixinha de baixo (`reader-box paper slim`) aparece vazia quando o capítulo tem `comments: false`.
- Capítulo de obra com link externo: o "voltar" e a logo apontam para a página da obra, que não existe.
- O `related:` de um capítulo não aparece no leitor (só em notícias e páginas), como hoje.

## Rode você mesmo

```bash
pnpm dev                                       # http://localhost:4321/pt/works/firestriker/01/
pnpm build                                     # 13 páginas (as 6 da T11 + os 7 capítulos)
HC_DIST=dist pnpm vitest run paginas           # as páginas reais e a lista de IDs de comentários
pnpm vitest run leitor                         # os 514 capítulos dos sites inventados
python3 tools/paginas_ref.py                   # refaz as fotos do Python (depois de mudar content/ ou config.json)
```

## Tente

1. **Ache o divisor de cena de Pederneira.** Abra `/pt/works/firestriker/01/` no `pnpm dev` e encontre a imagem entre as cenas (inspecione: `<img class="scene-divider" …>`). Agora siga o rastro no código: a linha `---` no seu `content/works/firestriker/01/pt.md` → o `divider` do `content/works/firestriker/work.json` → `contextoDoCorpo()` em `src/lib/corpos.ts` (só capítulos recebem o divisor da obra) → `markdownParaHtml()` em `src/lib/markdown.ts` (procure `scene-divider`) → o CSS `.scene-divider` em `src/styles/prosa.css`. Em nenhum momento um `.astro` decidiu algo.
2. **Veja o seu HTML passar intacto.** Crie uma notícia de teste (`python3 build.py new news teste-sonho`) e, nos dois arquivos (`en.md` e `pt.md`), troque a linha `# draft: true   (tire o # para esconder do site publicado)` por uma linha só com `draft: true` (sem o `#` e **sem** o comentário entre parênteses, que viraria parte do valor: o Astro pararia com erro e o Python não trataria a notícia como rascunho). Escreva no corpo, num parágrafo sozinho: `<div class="s1 ps">Um trecho do sonho.</div>`. Abra `http://localhost:4321/dev/markdown/` e escolha a notícia: o HTML gerado mantém o `<div class="s1 ps">` exatamente como você escreveu. A fonte **não** muda ali, porque a regra exige estar dentro de `.story` (seção 4). Depois **apague a pasta** `content/news/<data>-teste-sonho/`.
3. **Quebre um ID de comentário de propósito** (e desfaça). Em `src/lib/capitulos.ts`, acrescente `/${lang}` ao fim do `idDosComentarios`, rode `pnpm build` e `HC_DIST=dist pnpm vitest run paginas`. O teste da lista de IDs aponta exatamente quais conversas "sumiriam". Desfaça a mudança.

## O que as próximas tarefas reaproveitam

- **T13 (notícias):** todo HTML de `content/` que entrar por `set:html` vai embrulhado em `textoDoAutor()` (`src/lib/pagina.ts`), como no `Leitor` e no `CardEmissario`: é o que mantém o versalete e os scripts do seu texto exatamente como no Python. Reaproveitar também `Pager` (com o meio "Todas as notícias"), `Comentarios` + `src/lib/comentarios.ts` (`comentariosDaPagina(lang, "news/<slug>", COM_RASCUNHOS)`), `src/styles/prosa.css` (embeds, Shorts, ficha de feitiço), `PostsAlternados` e `CartaQueVira` (incluídos quando o texto precisa, com `usaClasse()` de `leitura.ts`), o aviso de rascunho (`.draft-banner` já está em `prosa.css`). Acrescentar o grupo `t13` em `GRUPOS` (`tools/paginas_ref.py`) e em `GRUPOS` de `tests/paginas.test.ts`. O teste da lista de IDs passa a cobrir as notícias sozinho.
- **T14:** o `BaseLayout` já aceita `null` em `alternates`, se alguma página precisar de "sem hreflang".
- **T15:** trocar o HTML de `Comentarios.astro` (os 3 `<script is:inline>`) pelo módulo TypeScript, **mantendo o `data-page`**, e manter o teste da lista de IDs. As chaves continuam só em `comentarios.ts`.

## Notícias (T13): a lista e o artigo

As notícias não ganharam lição própria porque quase tudo já existia: a notícia é um "capítulo" com outro desenho. O que é novo:

- **A lista** (`/pt/news/`): 10 notícias por página, caixa de busca e barra de páginas. As regras (busca por todas as palavras, sem acento nem maiúscula; `?p=3`; os botões com "…") ficam em `src/lib/paginacao.ts`, **sem nenhum `import`** de propósito: esse arquivo vai para o navegador, e qualquer import traria junto o `config.json`. O `<script>` de `ListaDeNoticias.astro` só liga essas funções à página (é o bloco 6 do `site.js`). Sem JavaScript, as 83 notícias ficam visíveis e a barra de páginas fica vazia, como hoje.
- **Os 3 desenhos do artigo** (`desenhoDaNoticia()` em `src/lib/artigos.ts`): a **colagem** (`stickers:` + `overlay:`) vence o **fundo** (`backdrop_top:`/`backdrop_bottom:`), que vence o **comum** (figura grande `image:`). Cada um tem seu trecho em `ArtigoDeNoticia.astro`.
- **Posts alternados** (botões Instagram/TikTok/YouTube) e carta que vira entram só nas páginas cujo texto os usa.
- **Reaproveitado da T12:** `Pager` (com "Todas as notícias" no meio), `Comentarios` (ID `news/<pasta>`, igual nos dois idiomas) e `prosa.css`. O que é só de notícia e já serve à T14: `Relacionados` ("Veja também").

### Diferenças técnicas aceitas

| O que difere | Por quê | O visitante nota? |
|---|---|---|
| CSS em `/_astro/…css` | Empacotamento do Astro (lição 07) | Não |
| O script da lista é um `<script type="module">` no fim da página, em vez do `site.js` | Mesmo motivo do leitor | Não |
| O esquema é mais rígido que o Python: figurinha com posição inválida (`stickers:`) ou `related:` para notícia que não existe **dão erro no build**; o Python ignora em silêncio | Erro cedo é melhor que figurinha sumida | Só você, ao escrever |

### Bugs do site atual reproduzidos (de propósito, até a virada)

- **Buscar "hate" não acha nada** nas notícias cujo título tem "Hᴀᴛᴇ Cʏᴄʟᴇ": o `data-search` guarda as letras do versalete, e "hate" (letras normais) não combina. Buscar "Hᴀᴛᴇ" acha. Consertar é decisão sua (T20).
- `aria-label="Chapters"` no pager das notícias (já listado acima).
- `?p=2x` vale 2 (o `parseInt` do navegador), `?p=0`, `?p=abc` e `?p=-2` valem 1 e `?p=99` vale a última página.

### Ajustes pedidos pelo autor (16/10/2026): título cortado no pager e comentários em caixa própria

- **Corte do título** (`cortarTitulo()` em `src/lib/titulos.ts`, porte de `clip_title()` do `build.py`): as laterais do pager mostram no máximo 40 caracteres (contados como o Python: versalete e emoji valem 1), cortando no fim de palavra, sem pontuação solta, e terminando em "…". Quem corta é a regra pura (`paginador()` em `leitura.ts`); o componente `Pager` só desenha o `title` e o `aria-label` com o título inteiro (só quando houve corte). Vale também para os capítulos, onde nada muda (títulos de até 28 letras).
- **Duas caixas:** a notícia fica em `.news-box` e os comentários em `.reader-box.paper.slim`, como nos capítulos; o `<body>` ganha `news-page` para o `<main>` virar só o espaço das duas caixas. Notícia com `comments: false` não leva a caixa vazia.
- Prova: `cortarTitulo()` × Python em `tests/regras.test.ts` (casos inventados e os títulos reais) e, nas páginas, o grupo t13 de `paginas.test.ts`.

### Pedido do autor (21/10/2026, T17j): degradê no fim do resumo cortado

- **O que o visitante vê:** na lista de Notícias, quando o resumo automático (130 caracteres) foi **cortado**, as últimas palavras somem num degradê em vez de terminar em "…", e as reticências passam para o link: "…leia mais" / "…read more" (como a descrição de um canal no YouTube). O `summary:` que você escreve não é cortado e fica como antes ("leia mais", sem reticências).
- **No código:** `resumoFoiCortado()` e `partesDoResumoCortado()` em `src/lib/resumos.ts` (funções puras: o começo e o fim do resumo, que juntos são o resumo inteiro menos o "…"); a linha da lista ganhou `corte` (`src/lib/noticias.ts`); `ListaDeNoticias.astro` põe o fim num `<span class="news-fade">` e o "…" no começo do link (o rótulo continua vindo do `config.json`, que não muda). O degradê vai da cor do texto ao **transparente** (`background-clip: text`), por isso some na textura de papel da folha, seja qual for a cor atrás. É só visual: as letras continuam no texto, para o leitor de tela, a busca e o copiar. No modo de alto contraste do sistema o fim aparece normal.
- **Paridade:** `resumoCortadoComoNoPython()` (`tests/ajudantes/html.ts`) desfaz, no HTML do Astro, só essa forma exata (provada com casos negativos em `tests/noticias.test.ts`); no navegador, `python3 tools/home_playwright.py`.

### Tente (notícias)

1. **Quebre a busca de propósito** (e desfaça). Em `src/lib/paginacao.ts`, troque `palavras.every` por `palavras.some` em `combinaComBusca`. Rode `pnpm test`: os testes de `tests/noticias.test.ts` apontam a busca que deixou de bater. Para ver no navegador, `pnpm dev`, abra `/pt/news/` e busque duas palavras de títulos diferentes: com `some` aparecem notícias demais. Desfaça a mudança.

Para conferir tudo contra o site atual: `HC_DIST=dist pnpm vitest run paginas` (as 168 páginas de notícias) e `python3 tools/noticias_playwright.py --python 8791 --astro 8792` (busca, páginas e botões dos posts no navegador, passo a passo; leva uns 2 min e as instruções estão no topo do script).

## "Estou lendo em ordem…" (T17c, T17h e T17i): quem vem antes e depois, a obra em rascunho, o pulo do "Em breve", as imagens em camadas e a caixa que não muda de tamanho

Duas coisas novas que se apoiam uma na outra. A primeira é uma **regra de publicação**; a segunda, um **bloco novo no fim de cada capítulo**, que só existe no Astro (o `build.py` está congelado e não o tem).

### 1. `"draft": true` no `work.json` = a obra inteira não existe no site publicado

- **O que o visitante vê:** no site publicado, uma obra em rascunho não aparece em lugar nenhum: nem cartão (nem o cinza "Em breve"), nem em Histórias, na home, em "Últimas atualizações", no mapa do site, no RSS ou no seletor de idioma, e as páginas de capítulo dela não são geradas. Na prévia (`python build.py serve` ou `pnpm dev`) ela aparece como qualquer rascunho. Publicar = apagar a linha.
- **Hoje:** *Ossos do Ofício*, *Beira de Estrada* e *O Pêndulo* (estas duas tinham `"listed": false`; `draft` virou o **interruptor único** de "ainda não publicado", e `listed: false` ficou só para "fora das listas, mas a página existe").
- **No código:** o schema aceita `draft` (`src/lib/schemas.ts`, como qualquer campo: campo desconhecido é erro) e **uma função** decide: `obrasPublicadas(obras, comRascunhos)` em `src/lib/visibilidade.ts`. Quem monta o site (`dadosDoIdioma()`, `src/lib/idioma.ts`), os índices de links (`corpos.ts`) e as páginas (`conteudo.ts`) passam as obras por ela **antes** de qualquer regra (ordem, cartões, atualizações, sitemap…). Assim não há "uma regra por lugar" para esquecer. No Python a mesma regra são 2 linhas em `load_works()`.
- **Prova:** `tools/regras_ref.py` ganhou obras inventadas (rascunho com capítulo, rascunho externa, `draft: false`, rascunho + `listed: false`) e uma notícia que cita cada uma; o `build()` do Python, em build e em prévia, é a referência de `tests/conteudo.test.ts` e `tests/regras.test.ts`.

### 2. O bloco "estou lendo em ordem"

- **Nada de "Em breve" (T17h):** quem ainda não tem nada lançado **naquele modo** é pulado. "Lançado" é exatamente "o cartão da obra em Histórias tem botão de verdade" (`cartaoDaObra(...).botao.tipo === "link"`): no publicado, só as públicas com capítulo ou link externo; na prévia, também os rascunhos que têm capítulo. `ladoDaObra()` devolve `null` para as outras e `blocoDaOrdem()` anda para o lado (anterior ou seguinte) até achar a primeira lançada. A obra do capítulo em que o visitante está não é pulada, e "fora da ordem" (`chrono: false`) continua sendo decidido na lista inteira, antes de pular. Sumiram o texto "Em breve: …", o `emBreve` de `textosDaOrdem.ts` e a classe `so-soon`.
- **Os dados são regras puras:** `src/lib/ordemDeLeitura.ts` (`blocoDaOrdem()`). Ele **reaproveita** `organizarCartoes()` (a ordenação da grade de Histórias) e `cartaoDaObra()` (quem tem algo lançado e o link externo): não há regra de ordem nova.
- **Para onde cada lado leva (T17i):** quem vem **antes** leva ao **último** capítulo daquela história; quem vem **depois**, ao **primeiro** (`ladoDaObra(…, "prev" | "next")`). "Capítulos" = os listados da obra naquele idioma e modo (no publicado só os públicos, na prévia também os rascunhos; `unlisted` não conta), os mesmos da lista da página da obra. Obra de um capítulo só: os dois lados levam a ele. Obra com link externo (Alô?) continua no link, em outra aba, como o cartão. Antes, Luz & Sangue levava à página da obra. Por isso o `"chrono": false`, os empates, o "sem número vai para o fim" e "só existe o que o site mostra naquele modo" valem aqui do mesmo jeito que em Histórias.
- **O desenho:** `ProximaHistoria.astro` (a caixa) e `LadoDaOrdem.astro` (cada lado). O servidor desenha **as duas ordens** e esconde a que não é a padrão; o seletor vem `disabled`. Sem JavaScript o bloco já funciona na Cronológica; com JavaScript o seletor é ligado.
- **O script** (`src/scripts/ordem/`): `regras.ts` (sem nenhum `import`: lembrar a escolha em `localStorage`, tudo dentro de `try/catch`), `bloco.ts` (só alterna `hidden`, o `value` do seletor e o texto do nome da ordem por `textContent`) e `index.ts`. Nada de `innerHTML` e nada que leia o `config.json`: `tests/ordem-dom.test.ts` olha o código e, num navegador simulado, o resultado.
- **Os textos** moram em `src/lib/textosDaOrdem.ts` (não no `config.json`, que é seu). Os de inglês são proposta.
- **As imagens:** três jeitos, o primeiro que a obra tiver vale: `order_art` (camadas animadas, T17h, seção 3 abaixo), `order_images` (lista de 1 ou 2 caminhos em `static/`) ou a capa. Passam pelo caminho das imagens da T17 (perfis `ordemDeLeitura` e `camadaDaOrdem` em `src/lib/imagens.ts`: `srcset` WebP, `width`/`height`, carregamento preguiçoso).
- **Prova da paridade:** o Python não tem o bloco, então `tests/ajudantes/html.ts → semBlocoDeOrdem()` tira do HTML do Astro **só** as `<section data-story-order>` antes de comparar com o Python. A exceção é estreita de propósito: `tests/ordem.test.ts` prova que, sem o bloco, o Leitor é idêntico ao de antes, que o que sai não tem comentários, scripts nem texto do autor, e `tests/paginas.test.ts` (grupo "T17c") confere nas páginas reais que há **exatamente um** bloco por capítulo, como filho direto do `<main>`, entre a caixa do capítulo e a dos comentários, e nenhum em outras páginas. Os IDs dos comentários não mudam.
- **No navegador:** `python3 tools/ordem_playwright.py` (instruções no topo do script).

### 3. As imagens em camadas animadas (T17h)

O autor mandou, para *Luz & Sangue*, *Alô? Residência dos Di Vario* e *Pederneira*, um PNG por personagem e dois "compostos" (a arte antes do mouse e com o mouse por cima). A composição virou **dados no `work.json`** (`order_art`), não código:

- **Por que no `work.json`:** é onde o autor já mexe para ligar uma obra a suas imagens (`order_images`). Uma arte nova = `static/ordem/` + um campo, sem tocar em `src/`. O schema (`arteEmCamadas()` em `src/lib/schemas.ts`) confere tudo no build, em português, e campo desconhecido é erro. `src/lib/artesDaOrdem.ts` (o modelo, bem comentado) traduz o campo para o que o componente desenha; o guia do autor tem a tabela dos campos.
- **O modelo:** uma **tela de montagem** (`size`, só a proporção importa) e camadas **de trás para a frente**, cada uma com o **centro** (`x`, `y` em %), a `width` (em % da tela), `rotate` e `opacity`, mais um `hover` com só o que muda.
- **Como o navegador anima (tudo CSS, nenhum JavaScript novo):** cada camada é um `<img class="so-layer">` com variáveis de CSS no `style` (`--x --y --w --r --o`, e `--hx --hy --hw --hr --ho` para o mouse). O CSS do `ProximaHistoria.astro` posiciona pelo centro (`left`/`top` + `translate: -50% -50%`) e, no `:hover`/`:focus-visible` do link, troca para `var(--hx, var(--x))` etc. **Uma transição só** (0,6 s, a mesma curva) para as cinco propriedades. A tela corta o que sair dela, por isso o estado do mouse tem de caber na tela. Com `prefers-reduced-motion` nada se mexe nem gira; só as camadas cuja opacidade muda (`.so-surge`: o Thymorr) aparecem de uma vez, já no lugar final.
- **Como as posições foram tiradas:** com **casamento de pontos de imagem** (SIFT + RANSAC, em Python/OpenCV), camada por camada, contra o composto: o resultado é escala, giro e posição de cada personagem em cada estado (o erro típico é 1–2 px em 2000). Ordem de empilhamento: testada pelas 6 permutações contra o composto (ganha a de menor diferença). O Python/OpenCV não faz parte do site; foi só para medir. Diferenças contra as imagens do autor (1100 px): ver o relatório da T17h.
- **O que foi decidido e o autor pode mudar:** o **Thymorr** só tem o estado final nas imagens (o inicial é invisível), então ele começa 7% da largura da tela mais para o centro (`x` 62,18 → 69,18); **Lucas e Wellersson** só têm o estado inicial (a referência), então o "afastar" (cada um 30 px da tela de 595, mais 8% de crescimento) é nosso; a tela de Alô? é a da referência com margens (+24 px à esquerda, +8 à direita, +20 em cima) para o estado do mouse caber.
- **O John** (216 × 448 px) é ampliado 1,8× na tela de 2087 px do autor, mas ocupa só ~60 px na tela do visitante: nunca passa do tamanho real dele. As outras camadas (até 1461 px) ganham versões leves de 160 a 960 px.

### 4. Ossos do Ofício e Beira de Estrada, a caixa do mesmo tamanho e o rótulo numa linha (T17i)

Pedidos do PDF de 21/10 (mudanças 4, 5, 7, 8 e 9). As duas obras são rascunho: só aparecem na prévia. Ossos tem capítulo só em inglês (aparece no bloco em `/en/`); a **Beira de Estrada ainda não tem capítulo**, então é pulada no bloco até ganhar o primeiro (a arte já está pronta e foi conferida numa cópia do projeto com um capítulo inventado).

- **Ossos do Ofício** (`order_art` em `content/works/all-in-a-nights-work/work.json`): asas atrás, Giuseppe, olhos na frente. As **três crescem juntas** (19%); asas e olhos vão de 0 a 1 de opacidade. Os dois PNGs do Giuseppe saíram da mesma tela do autor com o mesmo canto de cima à esquerda (medido: deslocamento 0, 0), então os olhos têm a mesma escala do Giuseppe e um centro calculado para o canto coincidir; como o CSS anima `left`, `top` e `width` em linha reta com a mesma curva, os olhos ficam colados no rosto **durante** a transição, não só no começo e no fim (`tests/ordem.test.ts` confere a conta; `tools/ordem_playwright.py` mede no navegador no começo, no meio e no fim). As asas, invisíveis no começo, crescem do mesmo jeito (presas ao Giuseppe). A tela (3311 × 1884) é o que o desenho final ocupa, com as asas inteiras.
- **Beira de Estrada** (`order_art` em `content/works/roadside/work.json`, no lugar do antigo `order_images`, cujas duas imagens foram apagadas de `static/ordem/`): Jean atrás, Cezar e Iris na frente e os olhos da Iris por cima, com **exatamente** os números de Cezar e Iris (o arquivo tem o mesmo tamanho) e opacidade 0 → 1. Crescem 13%, inclinam (Jean +4,05°, Cezar e Iris −5,69°) e se afastam (cada um ~5% da tela), como Lucas e Wellersson. Tela 1950 × 2143.
- **Como foi medido:** o mesmo método da T17h (SIFT + RANSAC, em Python/OpenCV, camada por camada contra `Demo Ossos.png` e `Demo Estrada.png`; ordem de empilhamento pelas permutações). As demos mostram os dois estados lado a lado, sem uma tela comum, então a distância entre o começo e o fim na horizontal não sai delas: o que se fixou foi **o Giuseppe não sai do lugar na horizontal** (o pedido fala em crescer, não em andar) e, na Beira, **o meio entre os dois fica parado** (cada um se afasta o mesmo tanto, como Lucas e Wellersson). A altura vem das demos (a mesma folha). Diferença média contra as demos, depois de montar com os números arredondados: 0,8 a 2,3 em 255.
- **Movimento reduzido (mudou):** a arte que tem algo **surgindo** troca **de uma vez** para o desenho final do autor (o do mouse), sem animação. Antes, só a camada que surgia aparecia no lugar final e as outras ficavam paradas; com os olhos isso os deixaria fora do rosto. Vale também para Pederneira (Olivia e Harry agora pulam, sem animar, para o lugar do mouse, com o Thymorr). A arte que só se mexe (Luz & Sangue, Alô?) continua parada. No CSS: `.so-stage.so-tem-surge` (o `temSurge` de `arteEmCamadas()`).
- **A caixa do mesmo tamanho nas duas ordens (mudança 9).** Antes, a altura vinha da arte (cada tela tem uma proporção) e do rótulo (que quebrava em 1, 2 ou 3 linhas): na Pederneira, a 1100 px, 416 px na Cronológica e 484 no Lançamento. Agora é igual **por construção**: (1) toda arte mora numa **moldura quadrada** (`.so-art`, `PROPORCAO_DA_MOLDURA` = 1 em `src/lib/artesDaOrdem.ts`) e a tela de montagem (`.so-stage`) se encaixa dentro dela como um `object-fit: contain` (`width: min(100cqw, 100cqh × razão)`, encostada embaixo e no centro): tela larga ocupa a largura toda, tela alta a altura toda; o quadrado é a proporção mais próxima das artes de hoje (nenhuma ficou menor que antes, fora a Pederneira, 1%); (2) o rótulo é **uma linha** com altura de linha fixa; (3) o lado que não existe (a primeira ou a última da ordem) guarda o lugar com um **lado fantasma** invisível (`span.so-lugar`, `aria-hidden`, sem link). Medido em todo capítulo (publicado, prévia e a cópia com a Beira): 1000 × 459,25 px a 1100, 358 × 306,5 a 390, 288 × 271,5 a 320, nas duas ordens e com o mouse em cada lado.
- **O rótulo numa linha só (mudança 8).** O máximo ficou um pouco menor (`--so-cap: clamp(.85rem, 2.2vw, 1.6rem)`; era `clamp(.95rem, 2.5vw, 1.8rem)`) e o rótulo não quebra (`white-space: nowrap`). Para nunca cortar nem sair da caixa, o **build mede** cada rótulo na fonte de verdade (a tabela `src/lib/largurasDoRotulo.ts`, gerada da Lexend 500 por `tools/gerar_larguras_do_rotulo.py`; letra fora da tabela conta como a mais larga) e escreve na caixa `--so-em` (os dois rótulos lado a lado + 1,5 em de espaço, na ordem que precisa de mais) e `--so-em-1` (o maior rótulo sozinho). O CSS usa a menor entre o máximo e `100cqi ÷ --so-em` (cada `.so-order` é um container): o texto cabe em qualquer largura, e a letra é a mesma nas duas ordens. Só CSS não bastaria (o CSS não sabe a largura de um texto antes de desenhá-lo); um script que encolhe o texto depois de desenhar daria um pulo na tela e não valeria sem JavaScript. No **celular** cada rótulo ganha uma linha da largura toda (o de quem vem antes logo abaixo das artes, à esquerda; o de quem vem depois embaixo, à direita; `subgrid`), senão o maior título ficaria com 8 px a 320 px. Medidas do maior título ("Assistir Alô? Residência dos Di Vario"): 24,2 px a 1100, 13,6 a 390, 12,9 a 320 (máximo: 24,2 / 13,6 / 13,6).
- **Capítulo de quadrinho:** a regra da folha escura do Leitor (`.reader-comic .reader-box:first-of-type`) pegava o bloco, que é a primeira `<section>` da página (roxo-noite, rótulo verde quase invisível, outra margem). O bloco agora volta a ser a folha de papel nesses capítulos (`.reader-comic .reader-box.paper.story-order`). Não aparecia porque ainda não há capítulo de quadrinho; apareceria no primeiro da Beira de Estrada.
- **Peso:** cada camada leva o próprio `sizes` (a fração da moldura que ela ocupa no maior estado, `sizesDaCamada()`), e o passo das imagens (`imagensDoHtml.ts`) respeita um `sizes` já escrito. Nenhum PNG original viaja: Ossos 113 KB (computador), 255 KB (tela 2×), 142 KB (celular 3×); Beira 87 / 222 / 110 KB.

### Tente (ordem)

00. **Veja o link para o último capítulo.** Rode `pnpm dev`, abra `/pt/works/firestriker/01/`: na Cronológica, "Assistir Luz & Sangue" leva ao capítulo 02 (o último); troque para Lançamento: agora leva ao 01 (o primeiro).

0. **Mexa numa animação.** Em `content/works/light-and-blood/work.json`, dentro de `"hover"` do John, troque `"rotate": -6.52` por `"rotate": -30` e rode `pnpm dev`: no fim de um capítulo da Pederneira, passe o mouse na arte de Luz & Sangue. Volte o número.

1. **Veja uma história nova entrar na fila (e uma sem capítulo ser pulada).** Copie `content/works/firestriker/` (que tem um capítulo) para `content/works/teste/`, troque o título e os números de `order` (ex.: `"release": 2.5, "chrono": 6.5`), rode `pnpm dev` e abra o capítulo da *Pederneira*: a caixa mostra a nova. Agora apague a pasta `01/` de dentro de `teste/` e recarregue: ela some da caixa (nada de "Em breve"), mesmo continuando em Histórias como cartão cinza. Apague a pasta `teste` depois.
2. **Quebre a ordem de propósito.** Em `src/lib/ordemDeLeitura.ts`, troque `decrescente: false` por `true` em `sequenciaDaOrdem()` e rode `pnpm vitest run ordem`: os testes do exemplo do PDF falham. Desfaça.

## Leitor página a página dos quadrinhos (T17d): as runas da Beira de Estrada

Pedido do autor (20/10, mudança 4), só no Astro e, por enquanto, só na prévia (as três obras são rascunho). Junto vieram a página do *Cat-Crow-Thing* (janela da demo e botão da Steam) e o vídeo provisório de *O Pêndulo*.

### O que o visitante vê

- **Uma página por vez**, que cabe inteira na tela (altura da janela menos um respiro; nunca maior que o arquivo), com uma seta redonda de cada lado (as mesmas do vídeo de Luz & Sangue) e, embaixo, **as Oito Runas d'A Força**: ᚣ 弓 ♐︎ ᚸ エ ꑭ ⼒ Ⱝ. A da página atual brilha (ciano, com o brilho das runas do fundo); as outras ficam apagadas e acendem com o mouse ou o foco. Clicar numa runa vai direto àquela página.
- **As setas:** a da direita vai à próxima página; na 8ª, à 1ª do próximo capítulo; na 8ª do capítulo mais recente, **some**. A da esquerda faz o mesmo ao contrário (na 1ª, vai à **8ª** do anterior; no primeiro capítulo, some). "Capítulos" = os listados daquele idioma e modo (na prévia os rascunhos contam; capítulo `unlisted` não tem vizinhos), os mesmos do pager.
- **O endereço:** a página mora só no **fragmento** (`/pt/works/roadside/01/#p5`). O endereço do capítulo e o ID dos comentários (`works/roadside/01`, igual nos dois idiomas) não mudam. Mandar o link com `#p5` abre na página 5; o "voltar" do navegador volta uma página.
- **Teclado e leitor de tela:** ← e → fazem o mesmo que as setas (só com o leitor na tela e fora de campo de texto: quem digita um comentário não vira a página); Tab passa pelas runas, cada uma com o nome "Página 3 de 8"; ao trocar de página, um aviso escondido (`aria-live`) fala "Página 3 de 8".
- **Sem JavaScript**, as 8 páginas aparecem uma embaixo da outra, sem setas nem runas: exatamente o leitor de quadrinhos de antes (e o do Python).

### Como funciona (e por que assim)

1. **Liga-se por um campo**, não pelo nome da pasta: `"page_runes"` no `work.json` (o schema confere a lista; `src/lib/folheador.ts` confere que **todo capítulo tem uma página por runa**, senão o build pára dizendo qual capítulo). Outra obra pode ter outras runas, ou nenhuma (o leitor de sempre).
2. **O servidor desenha tudo** (`Folheador.astro`): o mesmo `<div class="comic">` com as mesmas `<img>` do leitor de quadrinhos, dentro de um palco com as duas setas, e a fileira de runas, já no estado da **página 1**. Antes de o script rodar, o CSS só mostra a 1ª página (para a tela não pular de 8 páginas para 1); o `<noscript>` traz a regra que mostra todas quando não há JavaScript.
3. **O script** (`src/scripts/folheador/`, empacotado só nas páginas com o leitor) lê o `#pN`, esconde as outras páginas com `hidden`, marca a runa (`aria-current="page"`, que o CSS faz brilhar) e troca `href`/`title`/`aria-label` das setas. As regras (`regras.ts`) são **as mesmas** que o servidor usou para a página 1, e não importam nada (vão para o navegador). Ninguém monta HTML: só atributos e o texto do aviso.
4. **Clicar numa runa ou numa seta é um link de verdade** (`href="#p3"` ou o endereço do outro capítulo): o navegador muda o fragmento e guarda no histórico; o script só escuta o `hashchange`. Por isso voltar/avançar e link direto funcionam sem código especial. Fragmento que não é de página (a volta do login traz `#access_token=…`) é ignorado.
5. **Sem espera:** a página atual e as vizinhas ganham `loading="eager"` (a escondida baixa já, na versão leve certa do `srcset` da T17).
6. **As runas** usam as fontes do fundo de runas (`src/styles/fontes-das-runas.css`, servidas pelo próprio site desde a T17; as oito já estavam no catálogo desde a T17f). O ♐ ganha o seletor de texto (U+FE0E) para não virar emoji colorido.

### A página de jogo e O Pêndulo

- **Cat-Crow-Thing:** `"game": {"demo": "", "steam": ""}` no `work.json`. `JanelaDoJogo.astro` (dados em `src/lib/jogo.ts`) põe, logo depois da linha fina sob o título, uma janela 16:9 escura com "Demo em breve" e o botão com a logo da Steam à esquerda. **Sem link** o botão é um `<span>` apagado, `aria-disabled`, sem mãozinha, com "Link em breve" ao lado (decisão: um botão que não leva a lugar nenhum mas parece clicável pareceria quebrado; apagado e com o aviso, fica claro que ainda vem). Com `steam` preenchido, vira um `<a>` para a Steam em outra aba; com `demo`, a janela mostra a demo num `<iframe>` com `sandbox` (o jogo roda no endereço dele e não alcança a sessão de quem comenta). O texto do capítulo aparece embaixo do botão.
- **O Pêndulo:** um capítulo `01` com `youtube:` (o vídeo do episódio 1 de Luz & Sangue, provisório): a página é a de vídeo de sempre.

### Paridade

O Python (congelado) desenha a Beira como o leitor de quadrinhos de sempre e o Cat-Crow-Thing como um capítulo de texto vazio. Duas exceções estreitas em `tests/ajudantes/html.ts`, só no HTML do Astro: `folheadorComoNoPython()` troca o `div.folheador` **de forma exata** pelo `div.comic` de dentro, e `semJanelaDoJogo()` tira o `div.jogo` que vem logo depois do `hr.thin`. `tests/folheador.test.ts` prova que, sem elas, o capítulo sai idêntico ao leitor de sempre, e que qualquer outra forma (um filho a mais, texto no aviso, outra classe) não é tirada.

### Rode você mesmo

```bash
NODE_ENV=development HC_OUT_DIR=/tmp/previa pnpm build   # a prévia, com as três obras
pnpm vitest run folheador                                # regras, sites inventados, o script num navegador simulado
python3 tools/folheador_playwright.py --previa 8792      # no navegador (servidor da prévia na porta 8792, sob timeout)
```

### Tente

1. **Quebre a contagem de propósito.** Em `content/works/roadside/work.json`, apague a última runa de `page_runes` e rode `pnpm build`: ele pára, e a mensagem diz que o capítulo tem 8 páginas e a lista, 7 (no `pnpm dev`, a mesma mensagem aparece ao abrir o capítulo). Volte a runa.
2. **Mude uma runa.** Troque `"⼒"` por `"ᛟ"` e abra `/pt/works/roadside/01/#p7` no `pnpm dev`: a 7ª runa mudou (e brilha, porque você abriu direto na página 7). Volte.

## Posts incorporados em moldura isolada (T17g → T17j, B27): o post aparece sozinho, como antes, sem o programa da rede social na sua página

### O problema, em uma frase

Quem comenta fica "conectado": o Supabase guarda essa sessão no `localStorage` do **endereço do site**. Até o site antigo, cada notícia com post do X, do Reddit ou do Instagram punha na página o **script** desses sites (`widgets.js`, `embed.js`), e um script roda com os mesmos poderes da página que o carrega: se um deles fosse adulterado, poderia ler a sessão de quem está conectado, inclusive a sua, de administrador.

### O que você decidiu (21/10/2026, 20:14)

Primeiro (T17g) os posts passaram a carregar só com um clique. Você preferiu sem clique, "desde que não possua diferença com o que estava antes visualmente e em funcionalidade". Então, desde a T17j: **o post aparece sozinho, do mesmo tamanho e no mesmo lugar de antes**, mas o programa da rede social roda **dentro de uma moldura isolada**, no endereço dela, e não no seu.

### O porquê, numa tabela

| | Antes (script oficial na nossa página) | Agora (moldura isolada) |
|---|---|---|
| Onde o programa do X/Reddit/Instagram roda | no endereço `hatecycle.com`, junto da sessão de quem comenta | dentro de um `<iframe>`, no endereço **deles** (`platform.twitter.com`, `embed.reddit.com`, `www.instagram.com`) |
| Pode ler a sessão (o `localStorage` do site)? | **sim**, se o script fosse adulterado | **não**: o navegador não deixa um endereço ler o `localStorage` de outro |
| O que aparece na tela | o `<iframe>` que o script criava | **o mesmo `<iframe>`**, com os mesmos atributos e estilos, criado pelo nosso script |
| Sem JavaScript | o texto do código (o `blockquote`) | o mesmo |
| A rede social fora do ar ou bloqueada | ficava o texto do código | depois de 30 s sem resposta, o texto do código volta |

O segredo é que o script oficial **já** criava um `<iframe>` com a "página de incorporação" do serviço; o perigo era só o script em si, que rodava na nossa página para criar esse `<iframe>`. Agora quem cria o `<iframe>` é o nosso script (que não lê nada de terceiros), e o programa deles só roda lá dentro.

### Como funciona

1. **No build** (`src/lib/postsIncorporados.ts`, chamado pelo `BaseLayout.astro`): em todo `<div class="embed">`, os `<script>` saem; **nada é acrescentado**. O `<blockquote>` do código que você colou fica exatamente como está, e o HTML da página fica igual ao do Python, a não ser pelo `<script>` que saiu.
2. **No navegador** (`src/scripts/embeds/`, só nas páginas que têm post), ao carregar, sem clique:
   - **X:** como o `widgets.js`, põe antes do `blockquote` um `<div class="twitter-tweet twitter-tweet-rendered">` com o `<iframe>` da `Tweet.html`. Enquanto a primeira altura não chega, o texto continua à vista e a moldura fica escondida; quando chega, a moldura aparece e o texto sai.
   - **Reddit e Instagram:** como os scripts deles, o `<iframe>` toma o lugar do `blockquote` logo de saída e cresce quando a medida chega.
   - **Alternâncias** (`{{embed:A | B}}`): o post de um painel escondido ganha a moldura quando o painel aparece (antes, trocar de painel mandava o script do serviço redesenhar; o resultado é o mesmo: o post já nasce do tamanho certo).
3. **A altura:** o serviço avisa por mensagem (`postMessage`). O script só aceita mensagem **da janela daquela moldura e do endereço do serviço**, no formato do serviço; a altura fica entre 60 e 5.000 px, e o `0` que o Reddit manda quando a página ainda não tem tamanho é ignorado (a moldura não encolhe a nada).
4. **O sandbox:** cada moldura tem um `sandbox` (as permissões do `<iframe>`). O do Reddit é **o mesmo que o próprio Reddit já usa**; o do X e o do Instagram deixam rodar o programa deles, no endereço deles, e abrir links em outra aba, mas não deixam mudar a sua página, enviar formulário, baixar arquivo nem abrir diálogo.
5. **O endereço da sua página** que vai ao serviço (como antes: o X e o Reddit pedem) leva só o endereço, **nunca** o `?…` nem o `#…`: na volta do login por e-mail ou Google o `#` traz o token da sessão.

### O que você faz quando cola um post novo

**Nada muda.** Continue escrevendo `{{embed:link}}` ou colando o código de incorporação em `content/embeds/<nome>.html` (com o `<script>` junto, que o build tira sozinho). Vídeos do YouTube e do TikTok continuam como eram.

### O que sobra de risco

- O conteúdo do serviço aparece sem o visitante pedir, como antes (o serviço vê o IP de quem abre a página, como o YouTube). Mas a sessão de quem comenta continua **fora do alcance** dele.
- Uma página de incorporação adulterada pode mandar mensagens à nossa página: elas só mexem na **altura** daquela moldura (limitada).

### Como se prova

- `tests/embeds.test.ts`: as regras (endereço do post, endereço da moldura com os parâmetros do script oficial, atributos e estilos, mensagens nos formatos reais, sandbox); o passo de build (só sai script, nada entra); a exceção de paridade (`semScriptsDosPosts()` tira **só** o `<script src>` dos quatro endereços de script dos serviços, dentro de um `.embed`); o site construído (nenhum `<script src>` de fora em nenhuma página; os scripts que o Python tinha são tantos quanto os posts do Astro, página a página: 144 páginas, 184 posts).
- `tests/embeds-dom.test.ts` (navegador simulado): a moldura de cada serviço com os atributos na ordem do script oficial; mensagens de outra janela ou de outro endereço ignoradas; serviço mudo; painéis; `#access_token` fora do endereço.
- No navegador de verdade, com **serviços falsos** (o sandbox não tem internet): `python3 tools/embeds_playwright.py [--fotos <pasta>] [--lento]`.

### Tente

1. **No seu computador (tem internet):** `pnpm dev` e abra `/pt/news/2024-04-29-hygranocianos/` (X), `/pt/news/2024-02-23-avialuna-aeternogyrinians/` (Reddit) e `/pt/news/2025-04-14-speedpaint-pederneira/` (Instagram). Compare com o site antigo no ar: tamanho, cantos, sombra, vídeo, tela cheia, links abrindo em outra aba.
2. **Veja a moldura por dentro:** no navegador, botão direito no post → Inspecionar: o `<iframe>` tem `sandbox="…"` e o endereço é o do serviço.
