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

- `Comentarios.astro` reproduz **o mesmo HTML** do `comments()`: a `<section class="hc-comments" data-page="…">`, o `<script>window.HC=…</script>`, o supabase-js do jsDelivr e o `/comments.js?v=…`. O `comments.js` de hoje não precisou mudar (o porte dele é a T15).
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
