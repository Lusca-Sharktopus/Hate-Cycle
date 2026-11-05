# Lição 04 — Coleções de conteúdo: o Astro passa a conhecer tudo o que está em `content/` (T08)

Até a T07, o Astro sabia desenhar a moldura do site (cabeçalho, rodapé, runas, abertura), mas não sabia **nada** sobre as suas histórias, notícias e emissários. Na T08 ele passou a conhecer todo o `content/` como **coleções**: listas de itens com formato conferido.

O site no ar **não muda nada**, e o **jeito de escrever também não**: as mesmas pastas, os mesmos `en.md`/`pt.md`, os mesmos campos no topo do arquivo, o mesmo `work.json`. O que muda é que, a partir de agora, **um campo errado vira um erro claro no `pnpm build`**, dizendo o arquivo, o campo e o valor, em vez de passar despercebido.

> **Conferido por máquina:** os 195 `.md` e os 10 `work.json` de `content/` são lidos pelo Astro **exatamente** como pelo `build.py` (campo por campo, e o texto também). E, por coleção e por idioma, os itens publicados são os mesmos do Python, tanto no build (sem rascunhos) quanto na prévia (com rascunhos). O menu do `/pt/` e do `/en/` saiu idêntico ao da T06.

## O que você vai entender

1. O que é uma **coleção** e um **carregador** (*loader*).
2. Por que o site usa um **carregador próprio**, e não o leitor de Markdown que vem com o Astro.
3. O que é um **schema** (Zod): a "ficha" de campos de cada tipo de conteúdo.
4. Como as **referências** entre itens (`related`, `appears_in`) são conferidas.
5. Como uma página pede conteúdo: **`getCollection()`**, `getEntry()` e as consultas de `src/lib/conteudo.ts` (com as regras de rascunho, `unlisted`, `listed`…).
6. O que acontece **quando você erra um campo** (a mensagem de verdade).

## Abra lado a lado (nesta ordem)

1. No `build.py`: `scalar()` e `parse()` (linhas ~94–119) e `load_items()`/`load_works()` (linhas ~189–233).
2. `src/content.config.ts`: a lista das coleções (curta).
3. `src/lib/frontmatter.ts`: o porte de `scalar()`/`parse()`.
4. `src/lib/leitor.ts`: o porte de `load_items()`/`load_works()` e o carregador.
5. `src/lib/schemas.ts`: os campos aceitos e as mensagens de erro.
6. `src/lib/visibilidade.ts` e `src/lib/conteudo.ts`: quem aparece no site.
7. `src/lib/nav.ts`: o menu, agora lendo as coleções.
8. `tools/frontmatter_ref.py` e `tests/conteudo.test.ts`: a prova.

## 1. Coleção e carregador

Pense numa **coleção** como um fichário: cada gaveta é um tipo de conteúdo, cada ficha é um item, e toda ficha da gaveta tem os mesmos campos. O site tem sete gavetas, todas declaradas em `src/content.config.ts`:

| Coleção | De onde vem | ID de cada item (exemplo) | Itens hoje |
|---|---|---|---|
| `news` | `content/news/<pasta>/<idioma>.md` | `2023-08-18-orcs/pt` | 166 (83 pastas × 2 idiomas) |
| `pages` | `content/pages/<pasta>/<idioma>.md` | `about/en` | 6 |
| `emissaries` | `content/emissaries/<pasta>/<idioma>.md` | `saf/pt` | 10 |
| `characters` | `content/characters/<pasta>/<idioma>.md` | `harry/en` | 4 |
| `universe` | `content/universe/<pasta>/<idioma>.md` | `hidden-magic/pt` | 2 |
| `works` | `content/works/<obra>/work.json` | `firestriker` | 10 |
| `chapters` | `content/works/<obra>/<NN>/<idioma>.md` | `firestriker/01/en` | 7 |

O **ID** é o caminho do arquivo sem o `.md`, e é de propósito: dele saem os endereços (`/pt/news/2023-08-18-orcs/`) e os IDs dos comentários (`news/2023-08-18-orcs`, `works/firestriker/01`). É por isso que, como sempre, **não se renomeia uma pasta já publicada**.

Fica de fora: `content/embeds/*.html` (os códigos de incorporação do `{{embed:…}}`). Eles não são itens com campos; entram junto com o Markdown (T09).

Quem enche cada gaveta é o **carregador** (*loader*). No Astro 7, um carregador é só um objeto com um nome e uma função `load()`:

```ts
// src/lib/leitor.ts (resumido)
export function carregador(colecao: Colecao): Loader {
  return {
    name: `hate-cycle-${colecao}`,
    load: async ({ store, parseData, generateDigest, logger, watcher, config }) => {
      // 1. lê os arquivos de content/ (no lugar, sem copiar)
      const entradas = lerColecao(raiz, colecao);
      // 2. confere cada um com o schema (parseData) — um campo errado pára aqui
      const data = await parseData({ id: e.id, data: e.data, filePath: e.arquivo });
      // 3. guarda no "store" do Astro: é dali que getCollection() vai ler
      store.set({ id: e.id, data, body: e.body, filePath: …, digest: generateDigest(e.texto) });
      // 4. na prévia (pnpm dev), relê a coleção quando algo muda na pasta dela
      watcher?.on("all", …);
    },
  };
}
```

E `src/content.config.ts` só liga carregador e schema, coleção por coleção:

```ts
export const collections = {
  news: defineCollection({ loader: carregador("news"), schema: schemas.news }),
  …
  chapters: defineCollection({ loader: carregador("chapters"), schema: schemas.chapters }),
};
```

O **corpo** do arquivo (o texto em Markdown, abaixo do segundo `---`) fica guardado cru em cada item (`entry.body`). Transformar esse texto em HTML, com o versalete, os `[[links]]` e o divisor de cena, é a T09.

## 2. Por que um carregador próprio: o seu `---` não é YAML

O Astro já vem com um carregador pronto, o `glob()`, que lê arquivos `.md` e interpreta o bloco `---` do topo como **YAML**. Parece a mesma coisa, mas não é: o `build.py` nunca usou YAML de verdade. Ele usa um leitor mínimo próprio, `scalar()`/`parse()`, que lê cada linha como "campo: tudo o que vem depois do **primeiro** dois-pontos". Esse leitor é mais tolerante, e você sempre escreveu contando com isso:

```
title: Official Artwork: Orcs
summary: "We're lost!", shouted Harry, my young assistant.
order: 2
image:
```

Conferido com o leitor de YAML que vem junto com o Astro:

- `title: Official Artwork: Orcs` → **erro** em YAML (o segundo `:` parece começar outro campo). No `build.py`, o título é "Official Artwork: Orcs".
- `summary: "We're lost!", shouted Harry…` → **erro** em YAML (abre aspas, fecha, e continua). No `build.py`, o resumo é a frase inteira, com as aspas.
- `order: 2` → em YAML vira o **número** 2; no `build.py`, o texto "2".
- `image:` vazio → em YAML vira "nada" (`null`); no `build.py`, um texto vazio.

Somando: um YAML de verdade **recusaria 55 dos 195 arquivos** de `content/` e leria outros 21 de um jeito diferente. Para o Astro aceitar, você teria de pôr aspas em dezenas de títulos. A decisão D7 (`docs/ARQUITETURA.md`) diz que o jeito de escrever **não muda**; então o Astro é que aprendeu a ler como o `build.py`:

- `src/lib/frontmatter.ts` é o **porte linha a linha** de `scalar()` e `parse()`. Inclusive os detalhes: `true`/`false` (em qualquer caixa) viram verdadeiro/falso; `[a, b]` vira lista; `"entre aspas"` perde as aspas só se elas abrem **e** fecham; linhas começando com `#` são comentário; `  - item` acrescenta à lista do campo anterior; o BOM do Bloco de Notas e as quebras de linha do Windows (`\r\n`) são tratados como no Python.
- `src/lib/leitor.ts` é o porte de `load_items()`/`load_works()`: mesmas pastas, mesmos arquivos (`en.md`, `pt.md`, `work.json`), mesma ordem (a ordem "natural" das pastas de capítulo: `2` antes de `10`).

| No `build.py` | No Astro |
|---|---|
| `scalar(v)` | `scalar(v)` em `src/lib/frontmatter.ts` |
| `parse(path)` | `parseArquivo(caminho)` = `decodificar()` (o `"utf-8-sig"`) + `parse(texto)` |
| `load_items(section)` | `lerItens(raiz, secao)` em `src/lib/leitor.ts` |
| `load_works()` (as obras) | `lerObras(raiz)` |
| `load_works()` (os capítulos) | `lerCapitulos(raiz)`; o `i` do `enumerate` virou `_origem.posicao` |
| `natural()` | `compararNatural()` |

Um detalhe de tradução, para você reconhecer no código: o Python e o JavaScript discordam sobre **o que é espaço**. O `strip()` do Python tira alguns caracteres de controle que o `trim()` do JavaScript não tira, e o JavaScript tira o BOM (`﻿`), que o Python não tira. Por isso o porte tem o seu próprio `pyStrip()`. (O teste tem casos inventados só para isso; trocar `pyStrip` por `trim` faz dois deles falharem.)

### `_origem`: de onde o item veio

O carregador acrescenta a cada item um campo `_origem` com o que vem do **caminho** do arquivo, e não do texto: a pasta (`slug`) e o idioma (`lang`); nos capítulos, a obra, a pasta do capítulo e a posição dela (`posicao`, o número do capítulo quando não há `chapter:`). O sublinhado avisa: é do site, você não escreve esse campo (se escrever, o build pára e diz que o nome é reservado).

## 3. Schemas: a ficha de cada gaveta

O **schema** diz, para cada coleção, quais campos existem, de que tipo, e o que fazer quando estão errados. É escrito com **Zod 4** (`import { z } from "astro/zod"`), em `src/lib/schemas.ts`. As peças, com os seus campos de verdade:

```ts
const data = () => texto().refine(dataValida, {
  error: (i) => `${descrever(i.input)} não é uma data válida: use AAAA-MM-DD, com mês e dia que existam (ex.: 2024-08-18).`,
});

const simNao = () => z.boolean({ error: (i) => `tem de ser true ou false, sem aspas, mas veio ${descrever(i.input)}.` });

kind: umDe(TIPOS_DE_OBRA, "um tipo de obra (kind)").optional(),   // prose, comic, video, film
media: umDe(MIDIAS, "um tipo de mídia (media)").optional(),       // short-story, webcomic, live-ttrpg…
```

E a ficha das notícias, por exemplo, é: os campos **comuns** a todo `.md` (`title`, `date`, `summary`, `image`, `tags`, `related`, `draft`, `comments`) + os da notícia (`thumb`, `backdrop_top`, `backdrop_bottom`, `stickers`, `overlay`). A lista completa de cada coleção está no próprio arquivo, uma linha por campo, com comentário. Ela foi tirada da skill `hc-conteudo` e conferida contra o que o `build.py` realmente lê.

Decisões que valem a pena conhecer:

- **Campo desconhecido é erro.** O `build.py` ignora em silêncio um campo que não conhece. Então `dat: 2024-08-18` (faltou o "e") ou `unlsited: true` passavam sem aviso, e o site saía sem data ou com o capítulo à mostra. Agora o build pára e lista os campos aceitos. Se um dia você quiser um campo novo **de propósito**, ele precisa ser acrescentado em `src/lib/schemas.ts` (de qualquer forma, um campo novo só faz algo se o código o usar).
- **Datas continuam texto `AAAA-MM-DD`**, como o `build.py` as usa, mas agora conferidas: `2024-13-45` ou `2023-02-29` (2023 não é bissexto) são erro. Data vazia (`date:` sem nada) vale como "sem data", como hoje.
- **Sim/não sem aspas.** `draft: yes` ou `draft: "true"`: o `build.py` só considera rascunho o `true` de verdade, então esses dois **publicavam** o item. Agora são erro.
- **Listas.** `tags: Post` (sem colchetes nem tracinho) vira erro: o `build.py` leria letra por letra (`P`, `o`, `s`, `t`). `tags:` vazio continua valendo como lista vazia.
- **Outros cuidados** que o `build.py` não tinha: `youtube:` do capítulo tem de ser o ID de 11 caracteres (não o link inteiro); cada figurinha de `stickers` tem de ter posições válidas (`l3 t2 w26 a-4`); no `work.json`, `order.release` tem de ser número e `title`/`cover`/… só aceitam as chaves `en` e `pt`.
- **Imagem que não existe em `static/`** é só um **aviso** no build (não pára), com o arquivo e o campo. Hoje não há nenhuma.

## 4. Referências: `related` e `appears_in`

Alguns campos apontam para outros itens:

```
related:
  - characters/harry
  - universe/hidden-magic
appears_in:
  - firestriker
```

O schema confere cada um: `related` tem de ser `seção/pasta` (seções: `news`, `universe`, `characters`, `pages`, `emissaries`, `works`) e a pasta tem de existir; `appears_in` tem de ser uma obra com `work.json`. Um rascunho conta como existente (o link só não aparece no site publicado, como hoje). Um item que existe só em um idioma também conta (no outro idioma o link some, como hoje).

O Astro tem uma ferramenta própria para isso, `reference()`, mas ela não serve aqui por dois motivos: um `related` pode apontar para **várias** coleções (`reference()` aponta para uma só), e, no Astro 7, uma referência quebrada só gera uma linha de erro no registro **sem parar o build** (está em `node_modules/astro/dist/content/content-layer.js`, `#validateReferences`). Aqui ela pára.

## 5. Pedindo conteúdo numa página: `getCollection()`, `getEntry()` e `src/lib/conteudo.ts`

No Astro, uma página pede os itens de uma coleção assim:

```ts
import { getCollection, getEntry } from "astro:content";
const todas = await getCollection("news");            // as 166 notícias (os dois idiomas, rascunhos inclusos)
const pederneira = await getEntry("works", "firestriker"); // uma obra pelo ID
```

Mas "todas" não é o que o site publica: faltam as regras do `build.py` (rascunho só na prévia, capítulo `unlisted` fora das listas, obra com `listed: false`, `langs`, `show_extras`, `emissaries.hide`). Para nenhuma página esquecer uma regra, elas estão num lugar só:

- `src/lib/visibilidade.ts`: as regras como **funções puras** (recebem a lista, devolvem a lista filtrada), com o pedaço do `build.py` de onde cada uma veio. Ex.: `obraListada()` é o `wlisted()`; `capitulosDaObra()` separa listados e ocultos como o `load_works()`.
- `src/lib/conteudo.ts`: as **consultas** que as páginas usam, já com as regras e o modo certo:

```ts
import { itensPublicados, capitulos, obrasListadas } from "../lib/conteudo";
const noticias = await itensPublicados("news", "pt");           // sem rascunhos no build
const { listados, ocultos } = await capitulos("light-and-blood", "en");
const obras = await obrasListadas("pt");                          // respeita listed e langs
```

**Rascunhos:** `COM_RASCUNHOS` é `import.meta.env.DEV`, que o Astro deixa verdadeiro no `pnpm dev` e falso no `pnpm build`. É o `DRAFTS` do `build.py`: `pnpm dev` = `python build.py serve` (com rascunhos), `pnpm build` = `python build.py` (sem). Repare que o carregador guarda **tudo**, inclusive rascunhos: quem decide o que aparece são as consultas. Por isso um rascunho também é conferido pelo schema (um erro num rascunho pára o build).

O primeiro usuário disso é o menu. Na T06, `src/lib/nav.ts` olhava as pastas de `content/` direto, com um leitor provisório; agora pede às coleções:

```ts
const [news, universe, characters, pages] = await Promise.all([
  itensPublicados("news", lang, comRascunhos),
  itensPublicados("universe", lang, comRascunhos),
  …
]);
return calcularMenu(lang, { news: news.length, … }, showExtras);
```

O HTML do `<nav>` do `/pt/` e do `/en/` saiu idêntico ao de antes, no build (sem "Apoio", que é rascunho) e na prévia (com "Apoio").

## 6. Quando você erra um campo

Uma notícia de teste com três erros (data impossível, um campo que não existe em notícia e um `related` para algo que não existe):

```
---
title: Teste de erro: T08
date: 2024-13-45
kind: novel
related: [universe/nao-existe]
---
```

`pnpm build` pára com:

```
[InvalidContentEntryDataError] news → 2099-01-01-t08-teste-erro/pt data does not match collection schema.

  date: "2024-13-45" não é uma data válida: use AAAA-MM-DD, com mês e dia que existam (ex.: 2024-08-18).
  related.0: "universe/nao-existe" não existe (não há content/universe/nao-existe/ com en.md ou pt.md). Erro de digitação ou item apagado/renomeado?
  kind: campo desconhecido (erro de digitação?). Campos aceitos em notícias: title, date, summary, image, tags, related, draft, comments, thumb, backdrop_top, backdrop_bottom, stickers, overlay.

  Location:
    /home/…/content/news/2099-01-01-t08-teste-erro/pt.md:0:0
```

Como ler: a primeira linha diz **a coleção e o item** (`news → <pasta>/<idioma>`); cada linha de baixo é **um campo** (`related.0` = o primeiro item da lista `related`) com o **valor** que veio e o que se esperava; `Location` é o **arquivo**. (O "data does not match collection schema" é o Astro dizendo, em inglês, que os campos não batem com a ficha.)

Num `work.json`:

```
  kind: "novel" não é um tipo de obra (kind) conhecido. Use um destes: prose, comic, video, film.
  order.release: tem de ser um número, sem aspas, mas veio "7".
  media: "novela" não é um tipo de mídia (media) conhecido. Use um destes: short-story, webcomic, live-ttrpg, short-film, animated-show, videogame, misc.
```

Duas coisas a saber:

- **Vários arquivos com erro na mesma coleção** aparecem todos de uma vez (os demais logo acima do erro principal, com o caminho do arquivo). Se duas **coleções** diferentes tiverem erro, o build mostra uma delas; corrija e rode de novo.
- **Na prévia (`pnpm dev`)** o servidor **não cai**: o erro aparece no terminal assim que você salva o arquivo, e o site continua mostrando a última versão boa até você corrigir.

## 7. A prova: `pnpm test`

Como na lição 03, "está igual" é mostrado por teste:

1. **`tools/frontmatter_ref.py`** (Python, só biblioteca padrão) importa o `build.py` **sem gerar o site** e grava em `tests/fixtures/conteudo-python.json`: o `parse()` de **todos** os `.md` de `content/`; o `json.loads()` de todos os `work.json`; 43 arquivos inventados com os cantos do parser (BOM, `\r\n`, aspas que não fecham, listas dentro de listas, espaços estranhos, arquivo que não é UTF-8…); e o que o `build()` publica com e sem rascunhos (para isso ele roda o `build()` de verdade, mas com a escrita de arquivos trocada por uma função que só anota os endereços: nada é gravado).
2. **`tests/conteudo.test.ts`** (Vitest) compara, um a um: o front matter e o corpo de cada arquivo; cada `work.json`; cada caso inventado; que **todo o conteúdo atual passa nos schemas**; e, por coleção e por idioma, **quais** itens são publicados no build e na prévia, o menu (`has`), o índice dos `[[links]]` e **todos os 194/196 endereços** que o `build()` escreveria. E ainda 14 testes de erros e avisos (data impossível, `kind` desconhecido, `related` quebrado, campo desconhecido, imagem que não existe…), conferindo a mensagem.

As contagens que o teste confere hoje:

| Coleção (idioma) | Build: Astro × Python | Prévia: Astro × Python |
|---|---|---|
| notícias (en / pt) | 83 × 83 / 83 × 83 | 83 × 83 / 83 × 83 |
| páginas (en / pt) | 2 × 2 / 2 × 2 | 3 × 3 / 3 × 3 (+ Apoio, rascunho) |
| emissários (en / pt) | 4 × 4 / 4 × 4 | 5 × 5 / 5 × 5 (+ Adolas, rascunho) |
| personagens (en / pt) | 0 × 0 / 0 × 0 | 2 × 2 / 2 × 2 (rascunhos) |
| universo (en / pt) | 0 × 0 / 0 × 0 | 1 × 1 / 1 × 1 (rascunho) |
| obras listadas (en / pt) | 4 × 4 / 8 × 8 | 4 × 4 / 8 × 8 |
| capítulos listados (en / pt) | 3 × 3 / 3 × 3 | 3 × 3 / 3 × 3 |
| capítulos ocultos (en / pt) | 1 × 1 / 0 × 0 | 1 × 1 / 0 × 0 |
| endereços gerados | 194 × 194 | 196 × 196 |

(Personagens e Universo existem na prévia, mas não ganham página nem menu porque `show_extras` está desligado no `config.json`, como no site atual.)

**Importante: a referência é uma foto do `content/`.** Mudou uma notícia, criou um capítulo, tirou um `draft`? O teste avisa "A referência está velha"; é só rodar `python tools/frontmatter_ref.py` e depois `pnpm test` de novo. (Isso vale enquanto o `build.py` existir, até a virada, T20.)

## 8. Resumo: `build.py` × Astro (T08)

| No `build.py` | No Astro |
|---|---|
| `scalar()`, `parse()` | `src/lib/frontmatter.ts` |
| `load_items()`, `load_works()` | `src/lib/leitor.ts` (`lerItens`, `lerObras`, `lerCapitulos`) + `carregador()` |
| as listas `news`, `pages`, `works`… dentro de `build()` | as coleções de `src/content.config.ts` |
| (nada: campo errado passava calado) | `src/lib/schemas.ts`: campo errado ou desconhecido pára o build |
| `fm.get("draft") is True and not DRAFTS` | `passaRascunho()` + `COM_RASCUNHOS` (`pnpm dev` × `pnpm build`) |
| `wlisted()`, `unlisted`, `show_extras`, `emissaries.hide` | `src/lib/visibilidade.ts`, usado por `src/lib/conteudo.ts` |
| `has` em `build()` | `menuDoIdioma()` em `src/lib/nav.ts`, lendo as coleções |

## 9. Rode você mesmo

```bash
pnpm test       # 991 passed (700 das runas + 291 do conteúdo)
pnpm check      # 0 errors, 0 warnings
pnpm build      # "[content] Synced content" = as 7 coleções carregaram e passaram nos schemas
```

## 10. Tente

1. **Erre um campo de propósito.** Abra uma notícia qualquer (ex.: `content/news/2023-08-18-orcs/pt.md`), troque `date: 2023-08-18` por `date: 2023-08-32` e rode `pnpm build`. Leia a mensagem: coleção, item, campo, valor, arquivo. **Desfaça** e rode de novo: tudo volta a passar.
2. **Erre o nome de um campo.** Na mesma notícia, troque `thumb:` por `thum:`. Veja a lista de campos aceitos na mensagem. Desfaça.
3. **Veja a prévia avisar.** Com `pnpm dev` aberto, faça o erro 1 e salve: o erro aparece no terminal em seguida, e o site continua no ar com a versão anterior. Desfaça e salve: o aviso some.
4. **Pense (sem mexer):** se você renomear a pasta `content/characters/harry`, o que acontece com o `related: [characters/harry]` da Olivia? (Dica: seção 4. E, lembrete do `CLAUDE.md`: renomear pastas publicadas também muda o endereço e os comentários.)

## Para a próxima lição

A T09 pega o **corpo** que ficou guardado cru em cada item (`entry.body`) e o transforma em HTML exatamente como o `make_md()` de hoje: parágrafos, versalete, `[[links]]` (usando o índice que esta lição já confere), divisor de cena e os `{{atalhos}}`.
