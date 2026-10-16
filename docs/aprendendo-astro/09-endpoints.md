# Lição 09 — As páginas que faltavam, a raiz, o 404, o RSS, o sitemap e os redirects (T14)

Com a T14 o Astro passa a gerar **o site inteiro**: `pnpm build` produz as mesmas **192 páginas HTML** do `python build.py`, nos mesmos endereços, mais os dois feeds e um `sitemap.xml` novo.

| O visitante vê | Endereço |
|---|---|
| Sobre e Apoio | `/en/about/`, `/pt/about/`, `/en/support/`, `/pt/support/` |
| A raiz, que escolhe o idioma | `/` |
| A página de erro | `/404.html` |
| Os endereços do site antigo | `/PT.html`, `/firestriker.html`, `/light.html`, `/luz.html`, `/nights.html`, `/ossos.html`, `/pederneira.html` |
| O feed de notícias | `/en/feed.xml`, `/pt/feed.xml` |
| O mapa para buscadores (novo) | `/sitemap.xml` |
| Universo e Personagens (só se `show_extras` for `true`) | `/<idioma>/universe/…`, `/<idioma>/characters/…` |

Para o visitante **nada muda**. A raiz, os redirects e o RSS saem **byte a byte iguais** aos do Python; Sobre e 404 saem iguais nas capturas de tela (1100 px e 390 px), exceto pelo quadro do GIF animado do Apollo e do Anfíbio, que se mexe sozinho.

## O que você vai entender

1. **Páginas avulsas** (`content/pages/`) com uma rota só: `[lang]/[pagina]`.
2. **Endpoints**: arquivos que devolvem texto (XML, HTML cru) em vez de uma página desenhada.
3. **Por que a raiz, os redirects e o RSS são escritos à mão** (e não pelas ferramentas prontas do Astro).
4. **O 404**.
5. **O sitemap**: escolha e motivo.
6. **Os Extras** (Universo e Personagens) e como testar páginas que hoje estão desligadas.
7. **dev × preview** com a raiz e o 404.
8. **Como se prova** que é igual.

## Abra lado a lado

1. `build.py`, o fim do `build()` (~linhas 883–952): páginas avulsas, Universo, Personagens, raiz, 404, redirects.
2. `src/pages/[lang]/[pagina]/index.astro` e `src/lib/paginasAvulsas.ts`.
3. `src/pages/index.astro`, `src/pages/404.astro`, `src/pages/[antigo].html.ts`, `src/lib/raiz.ts`.
4. `src/pages/[lang]/feed.xml.ts` e `src/lib/rss.ts`.
5. `src/pages/sitemap.xml.ts` e `src/lib/sitemap.ts`.
6. `src/lib/paginasDeExtras.ts` e as quatro rotas de `universe/` e `characters/`.
7. A prova: `tools/paginas_ref.py` (grupo `t14`), `tests/paginas.test.ts`, `tests/avulsas.test.ts`.

## 1. Páginas avulsas: uma rota para todas

`content/pages/about/` e `content/pages/support/` viram `/pt/about/`, `/pt/support/`… por **uma** rota, `src/pages/[lang]/[pagina]/index.astro`: o `getStaticPaths()` devolve uma página por idioma e por pasta. Criar uma página nova (`python build.py new page`) não exige código novo. Detalhes que vêm do Python:

- `route: false` (a pasta `project`) **não** ganha endereço: o texto dela é colado dentro de "Sobre".
- `layout: wide` = coluna larga e título só para leitor de tela; sem isso, coluna estreita.
- O `<article>` leva a classe `page-<pasta>` (`page-about`): é onde o CSS da Sobre (os GIFs do Apollo e do Anfíbio, a foto do autor) se agarra.
- Os atalhos `{{stories}}`, `{{emissaries}}` e `{{other-stories}}` entram pelos *slots* `atalho-*` da lição 07.

**O script de GIFs do `site.js`** (bloco 3) não foi portado: o seletor dele é `.page-project .prose`, e nenhuma página tem essa classe (a Sobre é `.page-about`). Ele nunca fez nada no site de hoje. O `site.js` continua sendo carregado como está.

## 2. Endpoints: devolver texto, não uma página

Um arquivo `.ts` em `src/pages/` que exporta `GET` devolve uma `Response` qualquer. É assim que nascem `feed.xml`, `sitemap.xml` e `PT.html`. O nome do arquivo manda no nome da saída: `[antigo].html.ts` com `antigo = "PT"` gera `/PT.html`.

Um truque a mais: um arquivo `.astro` que faz `return new Response(...)` no bloco `---` entrega **o texto exato**, sem o Astro embrulhar em nada. É o que a raiz (`src/pages/index.astro`) faz.

## 3. Por que à mão, e não `@astrojs/rss` nem `redirects`

O princípio da migração é "o mesmo site de ontem". As ferramentas prontas escrevem **outro** texto:

- **`@astrojs/rss`** escreve um XML diferente do atual (outra ordem de campos, quebras de linha, outro cabeçalho). Trocar o feed pode fazer leitores de feed acharem que todas as notícias são novas. `src/lib/rss.ts` reproduz o do Python **em uma linha só**, igual: 30 itens mais recentes, datas no formato RFC 822. Pacote novo evitado.
- **`redirects` do Astro** gera `<title>Redirecting to: …</title>`, `noindex` e um segundo link canônico. O Python escreve uma linha: `canonical` + `meta refresh` + link. `src/lib/raiz.ts` repete a do Python, e a lista continua vindo de `config.json → redirects` (trocar um destino lá troca a página aqui; nada foi copiado). Só nomes simples terminados em `.html` são aceitos; qualquer outro valor derruba o build com uma mensagem clara, em vez de sumir calado.
- Os redirects `index.html` e os que apontam para `/` **não** viram página (a raiz já existe), como no Python.

A raiz tem três camadas: um script que lê o idioma guardado ou o do navegador, um `meta refresh` para o primeiro idioma e os links no corpo.

## 4. O 404

`src/pages/404.astro` repete o do Python: inglês como idioma da página, menu mínimo (só "Histórias" e o seletor de idioma; para isso o `Header`/`BaseLayout` ganharam a propriedade `menuMinimo`), **sem** hreflang, uma frase em cada idioma com o link da home, e a semente das runas é `"404"` (o `build.py` usa o título quando não há semente; o título é `404`).

## 5. O sitemap: endpoint próprio

Escolha: **`src/pages/sitemap.xml.ts` + `src/lib/sitemap.ts`**, sem `@astrojs/sitemap`.

- O pacote oficial lista **todas** as páginas geradas. O site tem páginas que **não** devem estar no mapa: capítulos `unlisted`/`noindex` (Ossos do Ofício), a raiz, o 404 e os redirects.
- O endpoint usa os **mesmos dados que as rotas** (`dadosDeTodosOsIdiomas()`), então o mapa nunca diverge do site: obra escondida, rascunho, Extras desligados… tudo segue a mesma regra.
- Sem pacote novo para manter. Sem `lastmod` nem `hreflang` (o site não tem datas confiáveis por página, e o hreflang já está no `<head>` de cada página).

Hoje: **182 endereços**. O teste confere o mapa contra o `dist/` (nenhum endereço do mapa falta, e nenhuma página indexável fica fora).

Não existe `static/robots.txt`. Se você criar um, vale acrescentar a linha `Sitemap: https://hatecycle.com/sitemap.xml` (pergunta no relatório).

## 6. Extras: páginas que existem mas estão desligadas

Com `show_extras: false` (o valor de hoje) as listas e itens de Universo e Personagens não existem, nem o menu "Extras", nem o botão "Explorar o universo". O código está pronto e provado mesmo assim, de dois jeitos:

1. **Sites inventados** (`tests/avulsas.test.ts`): ambientes pequenos, com Extras ligados, desenhados pela *Container API* do Astro.
2. **Uma segunda construção inteira**, com rascunhos e Extras: `NODE_ENV=development HC_SHOW_EXTRAS=1 pnpm build`. O `NODE_ENV=development` faz o build incluir rascunhos (é o `import.meta.env.DEV`), e `HC_SHOW_EXTRAS=1|0` (lida em `src/lib/config.ts`) **só existe para testes e prévia**: não altera o `config.json` (que não se toca). O teste compara cabeçalho e `<main>` de todas as páginas com o Python construído do mesmo jeito (`DRAFTS=True` e `show_extras=True`).

Ligar de verdade, quando você quiser: trocar `show_extras` no `config.json`, do seu lado.

## 7. dev × preview

- `pnpm preview` (o `dist/` pronto): `/`, `/PT.html`, `/404.html`, `/sitemap.xml` e `/en/feed.xml` respondem 200; um endereço que não existe mostra a página 404.
- `pnpm dev`: `/`, `/PT.html` e `/en/about/` respondem 200; `/404.html` mostra a página 404 **com status 404** (é o esperado: a página serve de erro). Antes da T14 o bloco `i18n` do Astro fazia a raiz e `/dev/markdown/` darem 404 no dev; ele foi removido (veja a lição 01).
- No GitHub Pages, o `404.html` é servido para qualquer endereço inexistente, como hoje.

## 8. Como se prova que é igual

- `python3 tools/paginas_ref.py` ganhou o grupo **`t14`** (páginas avulsas, 404, Extras) e a lista de arquivos exatos (raiz, `*.html` antigos, feeds); o resultado é `tests/fixtures/paginas-t14-python.json`. As outras fotos não mudaram.
- `tests/paginas.test.ts`: a lista de endereços do `dist/` é **igual** à de `baseline/urls.json`; raiz, redirects e feeds são comparados **byte a byte**; o RSS é validado como XML; o sitemap é conferido contra o `dist/`; e a construção com rascunhos e Extras é comparada com o Python página a página.
- `tests/avulsas.test.ts`: sites inventados com redirects, Extras e atalhos; mutar uma regra (`role` → `rolex`) faz um teste falhar.
- Capturas Astro × Python (Sobre PT e EN, 404, ficha de personagem, lista do Universo, Apoio), a 1100 px e 390 px, com as animações CSS paradas: idênticas, exceto o GIF.

## Rode você mesmo

```bash
pnpm build && ls dist/PT.html dist/404.html dist/sitemap.xml dist/en/feed.xml
pnpm test
NODE_ENV=development HC_SHOW_EXTRAS=1 pnpm build   # o site com rascunhos e Extras (apague o dist/ depois)
```

## Tente

1. Abra `dist/PT.html` e `public/PT.html` (do Python) e compare: são a mesma linha.
2. Em uma cópia do `config.json` (nunca no original), troque o destino de um redirect e rode `pnpm build`: a página muda sozinha.
3. Acrescente `"foo/bar.html": "/en/"` aos redirects de uma cópia: o build para com uma mensagem dizendo qual entrada não vale.
