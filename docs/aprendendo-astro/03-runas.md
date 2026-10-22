# Lição 03 — Runas com semente e tela de abertura: lógica no build, porte de algoritmo e prova por teste (T07)

Na T06 o Astro ganhou a moldura do site. Na T07 ganhou o **fundo de runas** e a **tela de abertura** (o vídeo da logo). Nas páginas do Astro, as runas ficam **exatamente nas mesmas posições** do site atual: mesma runa, mesmo tamanho, mesmo giro e mesmo ritmo de brilho, página por página.

O site no ar **não muda nada**: o `python build.py` continua gerando as mesmas 192 páginas.

> **Conferido por máquina:** o bloco `<div class="runes">` de `dist/pt/index.html` e de `dist/en/index.html` é idêntico, caractere por caractere, ao das páginas `/pt/` e `/en/` do site Python, e as posições medidas no navegador (1100 px e 390 px) são as mesmas. O teste automático compara **692 sementes** (as 192 páginas do site + 500 sorteadas) e dá 100% iguais.

## O que você vai entender

1. **Lógica em TypeScript que roda no build** (`src/lib/runas.ts`): o navegador só recebe o HTML pronto.
2. **O que é um gerador aleatório com semente**, e por que a mesma página sempre tem as mesmas runas.
3. **Como portar um algoritmo** de uma linguagem para outra sem "quase igual": quais detalhes do Python precisaram ser copiados à risca.
4. **Como provar que ficou igual**, com um teste automático (`pnpm test`, Vitest).
5. **`is:inline` × script processado pelo Astro**, na tela de abertura.

## Abra lado a lado (nesta ordem)

1. No `build.py`: `rune_imprint()` e `rune_fonts_links()` (linhas ~258–310) e, em `shell()`, `intro_head`/`intro_body` (linhas ~382–391).
2. `src/lib/runas.ts`: o porte.
3. `src/components/Runas.astro`: o componente que desenha as runas.
4. `src/components/Abertura.astro`: a tela de abertura.
5. `src/layouts/BaseLayout.astro`: onde os dois entram.
6. `tools/runas_ref.py` e `tests/runas.test.ts`: a prova.

## 1. Lógica no build: `src/lib/runas.ts`

Pense numa receita que é preparada antes de o cliente chegar. O sorteio das runas (que runa, onde, de que tamanho) acontece **no seu computador, durante o `pnpm build`**, e não no navegador do visitante. O visitante recebe só o resultado:

```html
<div class="runes" aria-hidden="true"><i style="--lx:15.8%;--ly:1.0%;--px:36.5%;--py:40.7%;--s:3.91;--r:-29deg;…">⚴︎</i>…</div>
```

Cada `<i>` é uma runa; as "custom properties" (`--lx`, `--ly`…) dizem ao CSS onde ela fica. Nenhuma linha de JavaScript vai para a página por causa das runas, como hoje.

O arquivo fica em `src/lib/` porque é **lógica pura**: recebe um texto (a semente) e devolve dados. Não sabe nada de página. Isso é a camada 2 da decisão D6 (`docs/ARQUITETURA.md`): regras separadas da apresentação, para poderem ser testadas sozinhas.

O componente só usa essa lógica (`src/components/Runas.astro`):

```astro
---
import { estiloDaRuna, sortearRunas } from "../lib/runas";
const runas = sortearRunas(Astro.props.seed);
---
<div class="runes" aria-hidden="true">{runas.map((r) => <i style={estiloDaRuna(r)}>{r.glifo}</i>)}</div>
```

`runas.map(...)` faz para cada runa um `<i>`, como o `out.append(f'<i style=…')` do Python.

## 2. Aleatório, mas sempre igual: a semente

Um computador não sorteia de verdade. Ele usa uma **fórmula** que, a partir de um número inicial (a **semente**), produz uma seqüência de números que *parecem* aleatórios. Mesma semente → mesma seqüência, sempre. É como embaralhar um baralho seguindo sempre os mesmos movimentos de mão: o resultado parece bagunçado, mas se repete.

No `build.py`, a semente de cada página é o **endereço dela**:

```python
def page(url, lang, title, main, alt=None, **kw):
    ...
    write(url, shell(lang, title, main, alt, has=has, seed=url, **kw))
```

Por isso `/pt/` tem sempre o mesmo arranjo, e `/en/` tem outro, também fixo. (O endereço é sem o `base_url`: `"/pt/"`, `"/en/works/firestriker/01/"`. A exceção é a página 404, que usa `"404"`, o título dela.)

No Astro, as páginas passam a semente para o layout:

```astro
<BaseLayout lang="pt" alternates={{ en: "/en/", pt: "/pt/" }} seed="/pt/">
```

E, se uma página esquecer, o `BaseLayout` usa o próprio endereço (`seed ?? Astro.url.pathname`), que dá o mesmo resultado.

## 3. Portar sem "quase": o que precisou ser copiado à risca

O JavaScript tem o seu próprio sorteador (`Math.random()`), mas **não aceita semente** e não é o do Python. Para as runas caírem nos mesmos lugares, o `runas.ts` reimplementa **o sorteador do próprio Python**, traduzido do código-fonte do CPython (`Modules/_randommodule.c` e `Lib/random.py`). Os detalhes que fizeram diferença:

| Peça | Python (`build.py`) | TypeScript (`runas.ts`) |
|---|---|---|
| Semente | `int(sha256(seed).hexdigest()[:16], 16)` | `sementeNumerica()`: o mesmo SHA-256, num `bigint` |
| Sorteador | `random.Random(...)`: o "Mersenne Twister" | `class PyRandom`: o mesmo algoritmo, linha a linha |
| Número entre 0 e 1 | `rnd.random()` (dois sorteios de 32 bits juntos) | `random()`, mesma conta |
| Embaralhar | `rnd.shuffle(glyphs)` | `shuffle()`, mesmo jeito de escolher cada troca |
| Lista de símbolos | `dict.fromkeys(RUNES)` | `[...new Set(Array.from(RUNES))]` |
| Distância | `math.hypot(...)` | `pyHypot()`: o algoritmo do CPython |
| Números no texto | `f"{x:.1f}"` | `pyFixed(x, 1)` |

Três armadilhas que valem a pena entender:

- **Símbolos "duplos".** Runas como 𐤉, 🜁 e 𑢶 ficam fora do conjunto básico do Unicode, e o JavaScript as guarda como **dois pedaços**. Percorrer o texto "pedaço por pedaço" quebraria cada uma em duas e mudaria o embaralhamento inteiro. `Array.from(RUNES)` percorre **por símbolo**, como o Python.
- **Arredondamento.** Em `0.125` com duas casas, o Python escreve `0.12` (empate vai para o número par) e o `toFixed` do JavaScript escreve `0.13`. O `pyFixed()` faz como o Python.
- **A distância.** O `Math.hypot` do JavaScript discorda do `math.hypot` do Python **no último dígito** em cerca de 36% das contas das runas (medido: 626.887 de 1.758.089). Como o resultado decide se duas runas "encostam", um dia isso poderia mudar um arranjo. O `pyHypot()` é o algoritmo do CPython e bate com ele em 200.000 de 200.000 pares testados.

## 4. A prova: `pnpm test`

Dizer "está igual" não basta: o teste **mostra**. Funciona em duas etapas:

1. **`tools/runas_ref.py`** (Python, só biblioteca padrão) importa o `build.py` **sem gerar o site** e chama a função de verdade, `rune_imprint()`, para 692 sementes: o endereço de cada uma das 192 páginas do site + 500 sementes sorteadas (com acentos, emojis, runas, texto vazio, números). Grava tudo em `tests/fixtures/runas-python.json`.
2. **`tests/runas.test.ts`** (Vitest) lê esse arquivo e, para cada semente, compara **o texto inteiro** que o TypeScript produz com o do Python:

```ts
test.each(paginas.map((c) => [c.url!, c] as const))("página %s", (_url, c) => {
  expect(runasHtml(c.semente)).toBe(c.html);
});
```

Um único número diferente, em qualquer runa de qualquer página, reprova.

Por que um **arquivo de referência** e não chamar o Python na hora do teste? Porque depois da virada (T20) o `build.py` sai da branch principal; o teste precisa continuar funcionando sem ele. E o teste também não depende de você ter Python instalado. Se um dia for preciso refazer a referência (com o `build.py` ainda presente): `python tools/runas_ref.py`.

Resultado esperado:

```
 Test Files  1 passed (1)
      Tests  700 passed (700)
```

(692 comparações, uma por semente; mais a conferência do tamanho da referência, o resumo, as fontes e 5 testes das peças: sorteador, arredondamento, distância, símbolos duplos e "mesma semente, mesmo arranjo".)

## 5. Tela de abertura: `is:inline` × script processado

A abertura tem três pedaços de JavaScript, e cada um precisa rodar num momento diferente. É aqui que aparece a diferença entre os dois tipos de `<script>` do Astro.

**Script processado** (sem nenhum atributo): o Astro pega o código, aceita TypeScript, junta, encolhe e o põe na página como `type="module"`, que **só roda depois de a página inteira ser lida**. É o padrão, e é o melhor na maioria dos casos.

**`<script is:inline>`**: o Astro não toca no código, e ele fica **exatamente onde foi escrito** e roda **na hora**. (Usar `define:vars` também deixa o script `is:inline`.)

Por isso:

- **No `<head>`**: a decisão "mostro a abertura?" precisa ser tomada **antes de a página aparecer**; senão o visitante veria o site "piscar" antes do vídeo. Então ela é `is:inline`, e recebe do build o tempo da trava de segurança com `define:vars`:

  ```astro
  <script is:inline define:vars={{ limite }}>
    var d = document.documentElement;
    try {
      if ((!sessionStorage.getItem("hc-intro") && !matchMedia("(prefers-reduced-motion: reduce)").matches) || /[?&]intro/.test(location.search)) {
        d.classList.add("intro");
        setTimeout(function () { d.classList.remove("intro"); }, limite);
      }
    } catch (e) {}
  </script>
  ```

  Em português: se o visitante ainda não viu a abertura nesta visita e não pediu ao sistema para "reduzir movimento" (ou se o endereço tem `?intro`), liga a abertura. E, aconteça o que acontecer, ela é desligada em `max_ms + 3` segundos (13 s).

- **Logo depois da `<div id="intro">`**: o vídeo é criado também `is:inline`, para começar a baixar o quanto antes (e só para quem vai mesmo ver a abertura).
- **A saída** (esperar o mínimo de 4,2 s, o fim do vídeo ou o carregamento da página; fade de 1 s; gravar `hc-intro` na sessão; no máximo 10 s) é um **script processado**, em TypeScript: ela não tem pressa e roda depois de a página ser lida, como o `site.js` (`defer`) de hoje.

Tudo isso só aparece se `config.json → intro.enabled` for `true`, como no `shell()`.

O componente é usado **duas vezes** no layout, porque a abertura tem um pedaço no `<head>` e outro no `<body>`:

```astro
<Abertura parte="cabeca" />   <!-- no <head> -->
...
<Runas seed={semente} />
<Abertura parte="corpo" />    <!-- no <body>, logo depois das runas, como hoje -->
```

## 6. CSS: global de propósito

Na lição 02, cada componente tinha CSS **com escopo** (o Astro marca os elementos com `data-astro-cid-…`). Aqui os dois componentes usam `<style is:global>`, dentro de `@layer site` como sempre:

- **Runas:** com escopo, cada `<i>` ganharia um atributo extra e o HTML deixaria de ser idêntico ao do site atual.
- **Abertura:** as classes `intro` e `intro-out` ficam no `<html>`, fora do componente; um CSS com escopo não as alcançaria.

Os valores são os mesmos do `static/style.css`, inclusive a regra de telas "em pé" (`max-aspect-ratio: 1/1`), que troca para a segunda posição sorteada (`--px`, `--py`), e a de "reduzir movimento", que pára o brilho.

As 20 `<link>` das fontes Noto das runas entram no `<head>` com `set:html`, exatamente como o `rune_fonts_links()` as escreve (o teste confere). Servir essas fontes pelo próprio site é a T17.

## 7. Resumo: `build.py` × Astro (T07)

| No `build.py` | No Astro |
|---|---|
| `RUNES`, `RUNES_TEXT_PRES`, `RUNE_FAMILIES_*` | constantes em `src/lib/runas.ts` (fonte única) |
| `rune_imprint(seed)` | `sortearRunas()` + `runasHtml()` em `src/lib/runas.ts`; desenhado por `Runas.astro` |
| `rune_fonts_links()` | `runasFontesHtml()` |
| `seed=url` em `page()` | prop `seed` do `BaseLayout` (padrão: o endereço da página) |
| `intro_head` / `intro_body` em `shell()` | `Abertura.astro` (`parte="cabeca"` / `parte="corpo"`) |
| bloco 5 do `static/site.js` | script processado em `Abertura.astro` |
| CSS de `.runes` e `.intro-screen` em `style.css` | `<style is:global>` nos dois componentes |

**Acrescentar runas ao catálogo:** a lista `RUNES` vive em dois lugares (`build.py` e `src/lib/runas.ts`), na mesma ordem, e as fontes dos glifos novos são recortes gerados por `tools/gerar_fontes_das_runas.py`. O passo a passo está na lição `11-imagens-e-fontes.md`, seção 7 ("Como acrescentar runas novas"). Lembrete: catálogo maior = sorteio diferente em todas as páginas, igual nos dois geradores.

## 8. Rode você mesmo

```bash
pnpm test       # 700 passed
pnpm dev        # http://localhost:4321/pt/ — abertura na primeira visita; depois, só as runas
pnpm build      # dist/pt/index.html: procure <div class="runes"
```

Para ver a abertura de novo na mesma aba, abra `http://localhost:4321/pt/?intro`.

## 9. Tente

1. **Mude a semente e veja o arranjo mudar.** Com o `pnpm dev` aberto, em `src/pages/pt/index.astro` troque `seed="/pt/"` por `seed="teste"` e salve: as runas mudam de lugar. Volte para `seed="/pt/"`: o arranjo original volta, idêntico. (É isso que "semente" quer dizer.)
2. **Quebre o teste de propósito.** Em `src/lib/runas.ts`, troque `const GAP = 0.025;` por `const GAP = 0.03;` (a folga mínima entre runas) e rode `pnpm test`. Quase todos os casos reprovam (aqui: 679 de 692), e o Vitest mostra o texto esperado (Python) e o recebido (TypeScript) da primeira página que falhou. Desfaça e rode de novo: tudo verde.
3. **Veja a abertura respeitar o "reduzir movimento".** No Windows, *Configurações → Acessibilidade → Efeitos visuais → Efeitos de animação* desligado; no macOS, *Ajustes → Acessibilidade → Tela → Reduzir movimento*. Abra a prévia numa aba anônima: sem abertura, e as runas param de pulsar. Volte a configuração.
4. **Pense (sem mexer):** se você renomear a pasta de uma notícia, o que acontece com as runas daquela página? (Dica: seção 2. E, como lembrete do `CLAUDE.md`, os comentários dela também "somem".)

## Para a próxima lição

A T08 começa a ler o seu conteúdo (`content/`) com **coleções**: notícias, capítulos e obras viram dados com formato conferido, e um campo errado no front matter vira um erro claro no build, apontando o arquivo.
