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

### Tente (notícias)

1. **Quebre a busca de propósito** (e desfaça). Em `src/lib/paginacao.ts`, troque `palavras.every` por `palavras.some` em `combinaComBusca`. Rode `pnpm test`: os testes de `tests/noticias.test.ts` apontam a busca que deixou de bater. Para ver no navegador, `pnpm dev`, abra `/pt/news/` e busque duas palavras de títulos diferentes: com `some` aparecem notícias demais. Desfaça a mudança.

Para conferir tudo contra o site atual: `HC_DIST=dist pnpm vitest run paginas` (as 168 páginas de notícias) e `python3 tools/noticias_playwright.py --python 8791 --astro 8792` (busca, páginas e botões dos posts no navegador, passo a passo; leva uns 2 min e as instruções estão no topo do script).

## "Estou lendo em ordem…" (T17c e T17h): quem vem antes e depois, a obra em rascunho, o pulo do "Em breve" e as imagens em camadas

Duas coisas novas que se apoiam uma na outra. A primeira é uma **regra de publicação**; a segunda, um **bloco novo no fim de cada capítulo**, que só existe no Astro (o `build.py` está congelado e não o tem).

### 1. `"draft": true` no `work.json` = a obra inteira não existe no site publicado

- **O que o visitante vê:** no site publicado, uma obra em rascunho não aparece em lugar nenhum: nem cartão (nem o cinza "Em breve"), nem em Histórias, na home, em "Últimas atualizações", no mapa do site, no RSS ou no seletor de idioma, e as páginas de capítulo dela não são geradas. Na prévia (`python build.py serve` ou `pnpm dev`) ela aparece como qualquer rascunho. Publicar = apagar a linha.
- **Hoje:** *Ossos do Ofício*, *Beira de Estrada* e *O Pêndulo* (estas duas tinham `"listed": false`; `draft` virou o **interruptor único** de "ainda não publicado", e `listed: false` ficou só para "fora das listas, mas a página existe").
- **No código:** o schema aceita `draft` (`src/lib/schemas.ts`, como qualquer campo: campo desconhecido é erro) e **uma função** decide: `obrasPublicadas(obras, comRascunhos)` em `src/lib/visibilidade.ts`. Quem monta o site (`dadosDoIdioma()`, `src/lib/idioma.ts`), os índices de links (`corpos.ts`) e as páginas (`conteudo.ts`) passam as obras por ela **antes** de qualquer regra (ordem, cartões, atualizações, sitemap…). Assim não há "uma regra por lugar" para esquecer. No Python a mesma regra são 2 linhas em `load_works()`.
- **Prova:** `tools/regras_ref.py` ganhou obras inventadas (rascunho com capítulo, rascunho externa, `draft: false`, rascunho + `listed: false`) e uma notícia que cita cada uma; o `build()` do Python, em build e em prévia, é a referência de `tests/conteudo.test.ts` e `tests/regras.test.ts`.

### 2. O bloco "estou lendo em ordem"

- **Nada de "Em breve" (T17h):** quem ainda não tem nada lançado **naquele modo** é pulado. "Lançado" é exatamente "o cartão da obra em Histórias tem botão de verdade" (`cartaoDaObra(...).botao.tipo === "link"`): no publicado, só as públicas com capítulo ou link externo; na prévia, também os rascunhos que têm capítulo. `ladoDaObra()` devolve `null` para as outras e `blocoDaOrdem()` anda para o lado (anterior ou seguinte) até achar a primeira lançada. A obra do capítulo em que o visitante está não é pulada, e "fora da ordem" (`chrono: false`) continua sendo decidido na lista inteira, antes de pular. Sumiram o texto "Em breve: …", o `emBreve` de `textosDaOrdem.ts` e a classe `so-soon`.
- **Os dados são regras puras:** `src/lib/ordemDeLeitura.ts` (`blocoDaOrdem()`). Ele **reaproveita** `organizarCartoes()` (a ordenação da grade de Histórias) e `cartaoDaObra()` (o destino do botão do cartão): não há regra de ordem nova. Por isso o `"chrono": false`, os empates, o "sem número vai para o fim" e "só existe o que o site mostra naquele modo" valem aqui do mesmo jeito que em Histórias.
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

### Tente (ordem)

0. **Mexa numa animação.** Em `content/works/light-and-blood/work.json`, dentro de `"hover"` do John, troque `"rotate": -6.52` por `"rotate": -30` e rode `pnpm dev`: no fim de um capítulo da Pederneira, passe o mouse na arte de Luz & Sangue. Volte o número.

1. **Veja uma história nova entrar na fila (e uma sem capítulo ser pulada).** Copie `content/works/firestriker/` (que tem um capítulo) para `content/works/teste/`, troque o título e os números de `order` (ex.: `"release": 2.5, "chrono": 6.5`), rode `pnpm dev` e abra o capítulo da *Pederneira*: a caixa mostra a nova. Agora apague a pasta `01/` de dentro de `teste/` e recarregue: ela some da caixa (nada de "Em breve"), mesmo continuando em Histórias como cartão cinza. Apague a pasta `teste` depois.
2. **Quebre a ordem de propósito.** Em `src/lib/ordemDeLeitura.ts`, troque `decrescente: false` por `true` em `sequenciaDaOrdem()` e rode `pnpm vitest run ordem`: os testes do exemplo do PDF falham. Desfaça.

## Posts incorporados só com clique (T17g, B27): nenhum script de terceiros na sua página

### O problema, em uma frase

Quem comenta fica "conectado": o Supabase guarda essa sessão no `localStorage` do **endereço do site**. Até aqui, cada notícia com post do Reddit, do X ou do Instagram punha na página o **script desses sites** (`widgets.js`, `embed.js`), e um script roda com os mesmos poderes do site que o carrega: se um deles fosse adulterado, poderia ler a sessão de quem está conectado, inclusive a sua, de administrador. Eram 144 das 172 páginas com comentários (76 com Reddit, 72 posts do X, 36 do Instagram).

### O que você decidiu e o que o visitante vê agora

Os posts de Reddit, X e Instagram **só carregam depois de um clique**. Antes, aparece uma caixa tracejada com o texto do próprio post (o que o código de incorporação já trazia), o aviso "Este post é do X e só é carregado quando você clica.", o botão **Mostrar post do X** (em inglês, *Show X post*) e o link **Abrir o post original no X ↗**. Nada é pedido a esses sites até o clique. Sem JavaScript, ficam o texto do post e o link (o botão não aparece). Nas alternâncias `{{embed:A | B | C}}`, os botões de troca (X · Instagram · …) funcionam como sempre e **cada post só carrega quando o visitante clica nele**. Vídeos do YouTube e do TikTok (que já eram `iframe` do próprio YouTube e do TikTok, isolados pelo navegador) ficam como estavam. **Você continua escrevendo `{{embed:…}}` igual.**

### Como funciona (e o que mudou no código)

1. **No build** (`src/lib/embedsComClique.ts`, chamado pelo `BaseLayout.astro`): em todo `<div class="embed">`, tira os `<script>` (os três de sempre, mais qualquer outro que apareça: sai e vira aviso no terminal), deixa o `<blockquote>` do autor **exatamente como está**, marca o `<div>` com `data-embed-servico="x|reddit|instagram"` e põe no fim dele o quadro (`<div class="embed-gate">`: aviso, botão e link para o original, com `hidden` no aviso e no botão até o JavaScript ligar). Os arquivos de `content/` **não mudam**: a transformação acontece só ao montar a página. Os textos (os dois idiomas) estão em `src/lib/textosDosEmbeds.ts`, nunca no `config.json`.
2. **No navegador** (`src/scripts/embeds/`, só nas páginas que têm quadro): o script liga o botão e, **no clique**, cria **um** `<iframe>`. O iframe aponta para a **página de incorporação do próprio serviço** (`embed.reddit.com`, `platform.twitter.com/embed/Tweet.html`, `www.instagram.com/…/embed/`), com `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"` (sem `allow-top-navigation`, formulários, downloads nem diálogos). O código do serviço roda **na origem dele**; o navegador não deixa essa origem tocar no `localStorage` do seu site. **Nenhum script de terceiros é carregado na origem do site**, nem antes nem depois do clique.
3. **A altura:** o serviço avisa a altura do post por `postMessage`; o script só aceita mensagem **da janela daquele iframe e da origem do serviço**, no formato do serviço, e limita a altura entre 60 e 3.000 px. Qualquer outra mensagem é ignorada. Antes da primeira medida, o quadro usa a altura que o próprio Reddit gravou no código (`data-embed-height`) ou uma padrão por serviço, com rolagem por dentro.
4. **Se o post não carregar:** o link para o original fica **sempre** visível (antes e depois do clique). Passados 20 s sem o quadro terminar de carregar, aparece o aviso de erro e o botão volta (tentar de novo).

### Por que NÃO o `iframe srcdoc` sem `allow-same-origin` (o desenho que se pensou primeiro)

A ideia era montar, no clique, um `<iframe srcdoc sandbox="allow-scripts …">` com o `blockquote` e o script do serviço: o código de terceiros rodaria numa "origem opaca", sem acesso a nada nosso. O problema é o que acontece **dentro** do widget: o sandbox é **herdado por todos os quadros dentro dele**, então a página do X que o `widgets.js` cria também fica numa origem opaca (`null`). Há relato de quem testou no Chrome (repositório `maretol/maretol-base`, issue 1302 e PR 1324, setembro de 2026): com `widgets.js` num `srcdoc` sem `allow-same-origin`, o X **só mostra o blockquote, sem virar post**; com a `Tweet.html` direta e sem `allow-same-origin`, a tela fica **em branco**, porque a consulta a `cdn.syndication.twimg.com` sai com `Origin: null` e o CORS recusa. O relato é só do X; para Reddit e Instagram **não achei relato nenhum** (a internet daqui é bloqueada e eu não pude testar os serviços de verdade), mas a mesma herança vale para eles.

O caminho escolhido dá o **mesmo isolamento** por outro meio: em vez de rodar o script do serviço dentro de uma janela nossa, **não carregamos script nenhum**; mostramos a página que o próprio serviço feita para ser incorporada, **na origem dele**. É o mesmo princípio do YouTube que já está no site. O `allow-same-origin` do sandbox aí vale **para o serviço** (a origem do endereço do iframe), não para o site: o código confere que a origem do endereço montado é a do serviço e **nunca** a da página (e nunca usa `srcdoc`, que é o que tornaria o `allow-same-origin` perigoso).

| Serviço | Caminho | O que o iframe abre | Mensagem de altura |
|---|---|---|---|
| X | iframe direto para a página do próprio X (sem script nosso nem do X no site) | `https://platform.twitter.com/embed/Tweet.html?id=…&dnt=true&…` | `{"twttr.embed":{"method":"twttr.private.resize","params":[{"height":N}]}}` |
| Reddit | idem | `https://embed.reddit.com/r/…/comments/…/?embed=true&theme=light` | `{"type":"resize.embed","data":N}` |
| Instagram | idem | `https://www.instagram.com/(p|reel|tv)/…/embed/` (`captioned/` se o código trazia legenda) | `{"type":"MEASURE","details":{"height":N}}` |

⚠ **O que eu não pude verificar** (sem internet aqui): que as três páginas de incorporação aceitam abrir assim, e os formatos das mensagens de altura (estão **de memória** dos widgets oficiais). Se algum formato estiver errado, o post aparece com a altura padrão e rolagem por dentro (não quebra). Se uma página de incorporação não abrir, o visitante vê o quadro em branco e o link para o original. É por isso que **você precisa testar no seu computador** (ver "Tente").

### O "plano C" (um interruptor por serviço)

Em `src/scripts/embeds/regras.ts`, cada serviço tem `comBotao: true`. Com `false`, o quadro daquele serviço fica **só com o link para o original** (sem aviso e sem botão): o post nunca carrega, e o site continua seguro. Serve se um serviço não funcionar no teste e você preferir o link a um quadro em branco.

### O que sobra de risco

- O código do X, do Reddit e do Instagram **continua rodando no navegador do visitante, quando ele clica**, e vê o IP e o que esses sites já veem de qualquer visitante (como no YouTube). Mas **sem acesso ao site**: não lê `localStorage`, cookies nem a página, e não pode mandar a página para outro lugar (sem `allow-top-navigation`). Abrir janela só por clique do visitante.
- Se a página de incorporação de um serviço for adulterada, ela pode mandar mensagens à nossa página: elas só mexem na **altura** do quadro (limitada).
- Os iframes do YouTube e do TikTok (de `{{embed:link}}` de vídeo) continuam carregando ao abrir a página, **sem clique** (são isolados pelo navegador, mas contatam o YouTube/TikTok). Fora do pedido; dá para pôr o mesmo clique depois, se quiser.

### Como se prova que é igual (e que o que muda é só isso)

- `tests/embeds.test.ts`: regras (endereço do post, endereço do quadro, mensagens, sandbox); o passo de build com HTML inventado (o que sai, o que fica, avisos, plano C); as duas exceções de paridade; **o site construído**: nenhum `<script src>` fora de `/_astro/` em nenhuma página, nenhum arquivo cita `widgets.js`/`embed.js`, 144 páginas com 184 quadros (Reddit 76, X 72, Instagram 36), um quadro por `blockquote`, e **os scripts que o Python tinha são tantos quanto os quadros do Astro, página a página**; cada post de `content/` vira um quadro com endereço válido; o código do navegador sem as palavras proibidas (`innerHTML`, `srcdoc`, `eval`, `createElement("script")`…); contraste do botão (≥ 4,5:1).
- `tests/embeds-dom.test.ts` (navegador simulado, padrão dos comentários): o clique cria **um** iframe com o sandbox exato, **sem `srcdoc`**, de outra origem; mensagem de outra janela, de outra origem ou com formato errado é ignorada; tempo esgotado e tentar de novo; a alternância; texto com `<img onerror>` aparece como letras.
- `tests/ajudantes/html.ts → semQuadrosDosPosts()` e `semScriptsDosPosts()`: a exceção de paridade. Do Astro sai **só** o atributo `data-embed-servico` e o `div.embed-gate` que é o último filho do mesmo `.embed`; do Python, **só** o `<script src>` dos quatro endereços (`platform.x.com`, `platform.twitter.com`, `embed.reddit.com`, `www.instagram.com`) **dentro de um `.embed`**. Em todo o resto, o `<main>` das notícias é igual ao do Python (6.620 testes anteriores seguem verdes).
- No navegador de verdade: `python3 tools/embeds_playwright.py [--fotos <pasta>]` troca os três serviços por **serviços falsos** e prova: antes do clique, zero pedidos a eles; depois, só ao serviço do post; o iframe cresce; de dentro do widget falso, ler/escrever o `localStorage` da página, o documento do topo e o cookie dão `SecurityError`, e navegar o topo não funciona; mensagens falsas de outro iframe e da própria página não mexem na altura; alternância; sem JavaScript; teclado (Tab, foco visível, Enter) e capturas a 1100 e 390 px.

### Tente

1. **No seu computador (tem internet):** `pnpm dev`, abra `/pt/news/2024-02-23-avialuna-aeternogyrinians/` (Reddit), `/pt/news/2024-04-29-hygranocianos/` (X) e `/pt/news/2023-08-19-conheca-os-talassimbiontes/` (Reddit | Instagram), clique em **Mostrar post** e veja se o post aparece. Conte-me o que viu (aparece? a altura está boa? o post rola por dentro?).
2. **Desligue um serviço de propósito:** em `src/scripts/embeds/regras.ts`, troque `comBotao: true` do X por `false`, rode `pnpm dev` e abra a notícia do X: sobra só o texto e o link. Desfaça.
