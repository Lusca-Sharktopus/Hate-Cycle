# Lição 02 — A moldura de toda página: layout, componentes, CSS e tokens (T06)

Na T05 o Astro ganhou duas páginas vazias. Na T06 elas ganharam **a moldura do site**: o `<head>` completo (título, descrição, Open Graph, fontes, hreflang), o **cabeçalho** (logo, menu, seletor de idioma) e o **rodapé** (redes, © e RSS). Qualquer página nova que usar o `BaseLayout` já nasce com tudo isso, igualzinho ao site de hoje.

O site no ar **não muda nada**: o `python build.py` continua gerando as mesmas 192 páginas em `public/`.

> **Conferido por máquina:** cabeçalho e rodapé do Astro foram comparados com os do site Python em 1100 px e 390 px, em PT e EN. Mesmos elementos, mesmos textos, mesmos links, mesmas posições e **todos os estilos calculados idênticos** (só difere o caminho da textura de papel, de propósito; veja a seção 2). As diferenças que sobram são as esperadas: as runas do fundo (T07) e as fontes do Google (o sandbox não as carrega).

## O que você vai entender

1. **Props tipadas** de um layout e o **`<slot />`** (o buraco do conteúdo).
2. **Componentes** (`Header`, `Footer`) e como um layout os usa como se fossem tags HTML.
3. **CSS global × CSS com escopo**, e onde moram os **tokens** (as variáveis da marca).
4. Por que o seu `custom.css` continua mandando em tudo: o truque de `@layer`.
5. **`<script>` dentro de um componente.**
6. **De onde vem cada texto da tela:** `config.json` → `src/lib/` → componente. E por que `t("pt", "chave_errada")` **não compila**.
7. O `<head>` linha por linha, comparado com o `shell()`: hreflang, Open Graph, RSS.
8. A regra de quais itens aparecem no menu (`has`), que virou `src/lib/nav.ts`.

## Abra lado a lado (nesta ordem)

1. `src/styles/tokens.css`
2. `src/styles/global.css`
3. `src/layouts/BaseLayout.astro`
4. `src/components/Header.astro`
5. `src/components/Footer.astro`
6. `src/lib/config.ts`
7. `src/lib/nav.ts` e `src/lib/assets.ts`
8. `src/pages/pt/index.astro`
9. `dist/pt/index.html` (depois de `pnpm build`) e, no `build.py`, a função `shell()` (linhas 355–440)

---

## 1. Três andares de CSS

Hoje todo o visual está num arquivo só, `static/style.css` (560 linhas). No Astro ele se divide em três andares, cada um com um papel:

| Andar | Arquivo | O que tem | Vale para |
|---|---|---|---|
| **Tokens** | `src/styles/tokens.css` | só variáveis: cores da marca, fontes, raios, sombras, larguras | o site todo |
| **Global** | `src/styles/global.css` | reset, corpo da página (o degradê verde), tipografia base, `.hc` (versalete), `.skip`, `.layout`, `.sheet` | o site todo |
| **Componente** | `<style>` dentro de `Header.astro`, `Footer.astro`… | só as regras daquela peça | **só aquele componente** |

### Tokens: mudou aqui, mudou no site inteiro

O topo do `static/style.css` já tinha as variáveis da marca, e elas foram copiadas **com os mesmos valores**:

```css
/* src/styles/tokens.css */
--green: #135c48;      /* verde escuro: títulos, botões */
--mint: #2ee0b0;       /* verde-menta */
--cyan: #00e9fd;       /* ciano: brilhos e hover */
--night: #271b39;      /* roxo-noite: texto, hero, leitor de HQ */
```

Quatro valores que antes estavam "soltos" no CSS antigo viraram tokens, porque aparecem várias vezes ou são claramente da marca: `--ink` (cor do texto do corpo, `#14101c`), `--on-brand` (o branco do texto sobre o degradê), `--shadow-sheet`/`--shadow-menu`/`--shadow-text` (sombras) e as larguras `--w-header`, `--w-sheet`, `--w-layout`. Nenhuma cor foi "melhorada".

**Para que serve:** um componente não escreve `#135c48`, escreve `var(--green)`. Se um dia a cor da marca mudar, muda numa linha. É a mesma regra que o `.claude/rules/estilos.md` já pedia ("use as variáveis").

`--logo-w` (o tamanho da logo) continua existindo e continua podendo ser ajustado no **seu** `static/custom.css`: `:root { --logo-w: 160px; }`.

### Um detalhe: o caminho da textura de papel

No CSS antigo: `--paper: url("Backgrounds/paper-texture.avif")` (sem barra no começo, relativo ao `style.css`, que mora na raiz). No Astro o CSS é empacotado numa pasta chamada `/_astro/`, e um caminho relativo apontaria para `/_astro/Backgrounds/…` (errado). Por isso virou `url("/Backgrounds/paper-texture.avif")`, **a partir da raiz do site**. É a única diferença de valor entre os dois CSS, e é proposital.

### Global × com escopo

Abra `src/components/Header.astro` e vá até o `<style>` no fim. Repare que os seletores são os mesmos do `style.css` (`.site-header`, `.main-nav`, `.dd-menu`…). Mas no Astro **cada `<style>` de componente vale só para aquele componente**: o Astro marca todos os elementos do componente com um atributo único e acrescenta o atributo em cada seletor. Veja o resultado, em `dist/_astro/*.css`:

```css
.site-header[data-astro-cid-nen7h5rs] { … }
.main-nav[data-astro-cid-nen7h5rs] > a[data-astro-cid-nen7h5rs] { … }
```

E no HTML gerado: `<header class="site-header" data-astro-cid-nen7h5rs>`. Resultado prático: você pode usar `.social` no rodapé sem medo de afetar outra coisa chamada `.social` em outra página. Isso é o que `style.css` não permitia (tudo no mesmo saco).

O contrário (`<style is:global>` ou o seletor `:global(…)`) desliga o escopo. Usamos o **global** só para o que realmente é do site inteiro (`global.css`) e para o que o conteúdo do autor (os `.md`) precisa alcançar.

> Fatos conferidos no Astro 7.3.8: o padrão `scopedStyleStrategy` é `"attribute"` (é o que você vê acima), e um `<style>` de componente ganha de um CSS importado de mesma força.

## 2. O truque do `@layer` (por que o seu `custom.css` continua mandando)

O `shell()` do `build.py` escreve, nesta ordem:

```html
<link rel="stylesheet" href="/style.css?v=…">
<link rel="stylesheet" href="/custom.css">
```

O `custom.css` vem **depois**, então empata e ganha: é o seu arquivo de ajustes pessoais (por exemplo, o tamanho da logo). No Astro isso quase quebrou: o Astro coloca o CSS que ele empacota **no fim do `<head>`**, depois de tudo que escrevemos à mão. Em `dist/pt/index.html`:

```html
<link rel="stylesheet" href="/custom.css">          ← o seu (antes!)
…
<link rel="stylesheet" href="/_astro/BaseLayout.….css"></head>   ← o do Astro (depois, ganharia)
```

Testamos: com um `custom.css` de mentira (`:root { --logo-w: 60px; }`), a logo continuava com 187 px. O ajuste do autor **não funcionava**.

A solução é a *cascade layer*, um recurso do CSS: **CSS dentro de uma camada (`@layer`) sempre perde para CSS fora de qualquer camada, não importa a ordem nem a especificidade.** Então todos os nossos estilos ficam dentro de `@layer site { … }`:

```css
/* src/styles/tokens.css, global.css e o <style> de cada componente */
@layer site {
  .site-footer { … }
}
```

e o `custom.css`, que não tem camada, ganha de tudo. Com o mesmo teste, a logo fica com 60 px.

**Regra para as próximas tarefas:** todo `<style>` de componente novo vai dentro de `@layer site { }`. Está escrito em `src/styles/README.md` e `src/components/README.md`. (Efeito colateral bom: um ajuste seu em `custom.css` agora ganha até de regras mais "fortes" do que ele, coisa que no site antigo nem sempre acontecia.)

## 3. O layout: `shell()` virou `BaseLayout.astro`

A assinatura do `shell()` e as props do `BaseLayout` lado a lado:

```python
# build.py, linha 355
def shell(lang, title, main, alt=None, cls="", desc="", image="", has=None, noindex=False, seed=""):
```
```astro
---
// src/layouts/BaseLayout.astro
interface Props {
  lang: Lang;
  title?: string;                              // opcional
  description?: string;                        // era `desc`
  image?: string;                              // og:image
  alternates?: Partial<Record<Lang, string>>;  // era `alt` (o endereço desta página em cada idioma)
  noindex?: boolean;
  bodyClass?: string;                          // era `cls`
  seed?: string;                               // semente das runas (T07)
}
const { lang, title, description, image, alternates = {}, noindex = false, bodyClass = "", seed: _seed } = Astro.props;
---
```

- **`interface Props`** é o contrato. `title?: string` (com `?`) é opcional; `lang: Lang` é obrigatório e só aceita `"en"` ou `"pt"`. Esquecer o `lang` ou escrever `lang="es"` faz o `pnpm check` reclamar.
- **`alternates`** é o que o `build.py` chama de `alt`: um dicionário "idioma → endereço desta mesma página". A página inicial passa `{ en: "/en/", pt: "/pt/" }`.
- **`has` sumiu das props:** quem decide os itens do menu agora é o próprio cabeçalho (seção 7).
- **`main` sumiu das props:** virou o `<slot />`. No Python você passava o HTML pronto como argumento; no Astro você escreve entre as tags:

```astro
<!-- src/pages/pt/index.astro -->
<BaseLayout lang="pt" alternates={{ en: "/en/", pt: "/pt/" }}>
  <h1>{siteName}</h1>
  <p>{t("pt", "tagline")}</p>
</BaseLayout>
```

e dentro do layout:

```astro
<div class="layout">
  <main id="main" class={isReader ? undefined : "sheet"}>
    <slot />        <!-- tudo o que a página colocou entre <BaseLayout> e </BaseLayout> cai aqui -->
  </main>
</div>
```

`class={undefined}` faz o Astro **não escrever** o atributo. É a tradução do `"" if "reader" in cls else ' class="sheet"'` do Python.

**`seed: _seed`:** a prop `seed` já é aceita (as runas do fundo usam o endereço da página como semente), mas as runas são da T07. O `_` na frente avisa o TypeScript "sei que não uso isto ainda". No lugar onde elas entrarão há um comentário `<!-- T07: … -->`.

**Dois valores que o Astro já sabe:** `Astro.url.pathname` (o endereço da página, ex.: `/pt/`) e `Astro.site` (o `site` do `astro.config.mjs`, `https://hatecycle.com`). O layout os usa para o hreflang do próprio idioma e para o `og:image`.

## 4. O `<head>`, linha por linha

| Linha em `shell()` | No `BaseLayout.astro` | Observação |
|---|---|---|
| `<title>{esc(ttl)}</title>` com `ttl = site if title == site else f"{title} \| {site}"` | `<title>{fullTitle}</title>` | mesma regra, desde a T05 |
| `<meta name="robots" content="noindex, nofollow">` se `noindex` | `{noindex && <meta … />}` | em Astro, `condição && <tag/>` escreve a tag só se for verdade |
| `<meta name="description" content="{desc or T(lang,'hero_sub')}">` | `description \|\| t(lang, "hero_sub")` | |
| `og:title`, `og:description` | idem | |
| `og:image` = `site_url + asset(image)` | `new URL(assetUrl(image), site).href` | **muda de propósito**, veja abaixo |
| `<link rel="icon" href="/logos/favicon.png">` | igual | |
| `preconnect` + `<link … googleapis …>` | igual, o **mesmo** link do Google Fonts | fontes servidas pelo próprio site: T17 |
| `rune_fonts_links()` | comentário `<!-- T07 -->` | |
| `<link rel="stylesheet" href="/style.css?v=…">` | **não existe** | os estilos vêm de `tokens.css`, `global.css` e dos componentes |
| `<link rel="stylesheet" href="/custom.css">` | igual (com `?v=` quando o arquivo existe) | continua **depois**; veja a seção 2 |
| `<link rel="alternate" hreflang="…">` por idioma | `hreflangs.map(…)` | |
| `<link rel="alternate" type="application/rss+xml">` | igual | o `feed.xml` em si só vem na T14 |
| script e div da tela de abertura (`intro_head`/`intro_body`) | comentários `<!-- T07 -->` | |

### hreflang

```python
# build.py, linha 381
hreflangs = "".join(f'<link rel="alternate" hreflang="{l}" href="{u(alt[l])}">' for l in LANGS if alt.get(l))
```
```astro
// BaseLayout.astro
const todos: Partial<Record<Lang, string>> = { [lang]: pagina, ...alternates };
const hreflangs = langs.flatMap((l) => { const href = todos[l]; return href ? [{ lang: l, href }] : [];});
```

Dois detalhes: a página sempre se inclui (`{ [lang]: pagina, …}` é o `alt.setdefault(lang, url)` do `page()`), e um idioma sem tradução da página simplesmente não ganha `<link hreflang>` (o `if alt.get(l)` do Python).

### og:image — a única diferença intencional

O `shell()` monta `site_url + asset(image)`. O `asset()` ainda cola na frente o `BASE` (`config.json → base_url`), que hoje é um endereço completo (bug **B1** do `docs/BACKLOG.md`). Resultado hoje, no site real:

```
https://hatecycle.comhttps://Lusca-Sharktopus.github.io/Hate-Cycle/covers/x.png
```

No Astro não existe `base` (o site fica na raiz do domínio), então o endereço sai certo:

```
https://hatecycle.com/covers/Teste%20%C3%87.png
```

(O `assetUrl()` de `src/lib/assets.ts` codifica espaços, `&`, `'` e acentos exatamente como o `asset()` do Python: foi testado com os nomes reais de capas.)

## 5. O cabeçalho: `Header.astro`

```astro
---
interface Props {
  lang: Lang;
  alternates?: Partial<Record<Lang, string>>;
  current?: string;           // padrão: Astro.url.pathname
}
const { lang, alternates = {}, current = Astro.url.pathname } = Astro.props;
const menu = menuDoIdioma(lang);                                   // src/lib/nav.ts
const links: MenuLink[] = [{ href: `/${lang}/works/`, label: t(lang, "works") }];
if (menu.about) links.push({ href: `/${lang}/about/`, label: t(lang, "about") });
if (menu.news) links.push({ href: `/${lang}/news/`, label: t(lang, "news") });
---
```

É a tradução direta do trecho do `shell()` que monta o menu:

```python
nav = link(f"/{lang}/works/", T(lang, "works"))
if h["about"]: nav += link(f"/{lang}/about/", T(lang, "about"))
if h["news"]:  nav += link(f"/{lang}/news/", T(lang, "news"))
```

- **Itens condicionais:** "Histórias" sempre; "Sobre", "Notícias", o menu "Extras" e "Apoio" só se existirem (seção 7).
- **`aria-current="page"`** marca o item da página atual (o sublinhado branco do CSS). Em Astro: `aria-current={current === l.href ? "page" : undefined}`; com `undefined` o atributo nem é escrito.
- **`{links.map((l) => <a …>{l.label}</a>)}`** é o `for` do Python virando HTML: uma `<a>` para cada item da lista.
- **Seletor de idioma:** o mesmo `<details class="dd lang-dd">` do site atual. Ele mostra o idioma atual e, dentro, links para os outros (`hreflang` e `lang` em cada link). O link vai para a mesma página no outro idioma, se `alternates` disser qual é; senão, para a home do idioma (`alternates[l] ?? …`, a mesma regra do `alt.get(l) or f"/{l}/"` do Python).
- **Logo:** `<img src={assetUrl(logoFile)} alt={siteName}>`. Por enquanto é o mesmo arquivo de `static/` (2,3 MB: a otimização é a T17).

### `<script>` dentro do componente

No fim de toda página, o `shell()` escreve este JavaScript solto:

```html
<script>document.addEventListener('click',function(e){document.querySelectorAll('details.dd[open]').forEach(function(d){if(!d.contains(e.target))d.removeAttribute('open')})});</script>
```

Ele fecha o menu suspenso quando você clica fora. No Astro ele mora no próprio `Header.astro`, que é o único componente que usa os menus:

```astro
<script>
  document.addEventListener("click", (e) => {
    document.querySelectorAll<HTMLDetailsElement>("details.dd[open]").forEach((d) => {
      if (!d.contains(e.target as Node | null)) d.removeAttribute("open");
    });
  });
</script>
```

Regras do Astro para um `<script>` sem atributos num componente (conferidas na documentação oficial): é **TypeScript**, vira `type="module"`, é **empacotado e entregue uma vez só** mesmo que o componente apareça várias vezes na página, e scripts pequenos são **escritos direto no HTML**. Em `dist/pt/index.html` ele aparece como um `<script type="module">` com o mesmo código já minificado, logo depois do cabeçalho. Esta é a base de tudo o que vem na T11 (ordenação, carrossel…): cada comportamento vai morar no componente que o usa, em vez de num `site.js` único para o site todo.

## 6. De onde vem cada texto

```
config.json   "ui": { "pt": { "works": "Histórias", "extras": "Extras", … } }
   ↓ import
src/lib/config.ts      t("pt", "works")                          ← a única porta de entrada
   ↓ import
Header.astro           <a href=…>{t(lang, "works")}</a>
   ↓ pnpm build
dist/pt/index.html     <a href="/pt/works/">Histórias</a>
```

Compare com o `build.py`:

```python
# linha 68
def T(lang, key):
    return CFG["ui"].get(lang, {}).get(key) or CFG["ui"]["en"].get(key, key)
```
```ts
// src/lib/config.ts
export function t(lang: Lang, key: UiKey): string {
  return config.ui[lang][key];
}
```

A diferença é a que a lição 01 anunciou, agora completa. O `T()` do Python aceita **qualquer** texto como chave e, se não achar, cai para o inglês e, se ainda não achar, **mostra o próprio nome da chave na tela**. O `t()` do Astro só aceita as chaves que existem: `UiKey` é a lista de todas as chaves de texto simples de `ui` (`home`, `news`, `works`… `all_stories`), declaradas em `interface UiText`. Teste o que acontece com um erro de digitação:

```ts
t("pt", "chave_errada")
// src/pages/pt/index.astro:10:15 - error ts(2345): Argument of type '"chave_errada"' is not assignable to parameter of type 'UiKey'.
```

Os outros "primos" do `build.py` também estão em `config.ts`:

| `build.py` | `src/lib/config.ts` | Para quê |
|---|---|---|
| `T(lang, key)` | `t(lang, key)` | texto simples |
| `T(lang, "months")` (lista) | `tList(lang, "months")` | listas: meses, rótulos "mais antigo primeiro" |
| `TK(lang, key, kind)` | `tk(lang, key, kind)` | versão "episódio" (`chapter_ep`…) para obras em vídeo; só aceita chaves que têm versão `_ep` |
| `tr(v, lang)` | `tr(value, lang)` | valor traduzível `{"en": …, "pt": …}` dos arquivos de conteúdo |

### Se o `config.json` mudar, o `pnpm check` avisa

`src/lib/config.ts` descreve **tudo** o que o Astro usa do `config.json`: o `ui` inteiro (as ~95 chaves), `languages`, `logo`, `socials`, `author`, `site_url`, `show_extras` e `intro`. O arquivo é lido no lugar (sem cópia), e o TypeScript confere que ele bate com o tipo:

| Se alguém… | O `pnpm check` diz |
|---|---|
| apaga ou renomeia uma chave de `ui` (ou do `config.json`) | `Type … is not assignable to type 'Record<Lang, UiText>'` |
| troca o tipo de um campo (lista virando texto…) | o mesmo erro |
| acrescenta uma chave nova em `ui` e esquece de declarar | `Type 'true' is not assignable to type 'never'`, em `config.ts` (é a "trava" `uiSemSobras`) |

Os três casos foram provocados de propósito e depois desfeitos. **Continua proibido** importar `comments` (as chaves do Supabase) neste arquivo.

## 7. Quais itens existem no menu: `src/lib/nav.ts`

No `build()` do Python, as variáveis `has` decidem o menu:

```python
# build.py, linhas 663–669 (resumo)
if universe[l]: ex.append(...)  ·  if chars[l]: ex.append(...)
if CFG.get("show_extras", True): ex += [páginas com menu: extras]
has[l] = {"news": bool(news[l]), "extras": ex,
          "about": any(p["slug"] == "about" for p in pages[l]),
          "support": any(p["slug"] == "support" for p in pages[l])}
```

Em TypeScript são duas partes, de propósito:

- **`calcularMenu(lang, fatos, mostrarExtras)`** — a **regra**, função pura (mesmas entradas, mesma saída; não lê arquivo nenhum). É testável sozinha: na T10 ganha testes de verdade.
- **`menuDoIdioma(lang)`** — a **leitura provisória** de `content/` para montar os "fatos" (há notícias? existe `content/pages/about/pt.md`? tem `draft: true`?). É **provisória até a T08**, quando os conteúdos passam a vir de `getCollection()` e só esta parte é trocada.

Hoje o resultado é: **Histórias, Sobre, Notícias** nos dois idiomas. "Apoio" não aparece porque `content/pages/support` está em rascunho (`draft: true`); "Extras" não aparece porque `show_extras` está `false` no seu `config.json` (B10 do backlog).

**Rascunhos na prévia:** como o `python build.py serve`, o `pnpm dev` mostra os rascunhos (então "Apoio" aparece no menu durante o `pnpm dev`); o `pnpm build` não. É o `import.meta.env.DEV` em `nav.ts`. (Testado: com `show_extras` ligado e rascunhos incluídos, o menu do Astro ficou idêntico ao do `python build.py serve`, com o menu suspenso "Extras" e "Apoio".)

## 8. O rodapé: `Footer.astro`

Mesma ideia, bem menor: percorre `socialLinks` (de `config.json → socials`) e escreve o "© 2023 - ano by autor" com o ano **do build** (`new Date().getFullYear()`, o `datetime.date.today().year` do Python). O link do RSS (`t(lang, "rss")` = "Feed RSS" / "RSS feed") só aparece se existir `site_url`. O `&copy; 2023` é fixo, como no `shell()` (o `config.json` tem `copyright_from: 2024`, que o gerador atual nunca usou; ficou como está).

## 9. Resumo: `build.py` × Astro (T06)

| No `build.py` | No Astro |
|---|---|
| `shell(...)` | `src/layouts/BaseLayout.astro` |
| parâmetro `main` | `<slot />` |
| parâmetros `desc`, `alt`, `cls`, `noindex`, `image` | props `description`, `alternates`, `bodyClass`, `noindex`, `image` |
| trecho `<header>` do `shell()` | `src/components/Header.astro` |
| trecho `<footer>` do `shell()` | `src/components/Footer.astro` |
| `has` / `has[l]` em `build()` | `src/lib/nav.ts` (`calcularMenu` + `menuDoIdioma`) |
| `T()`, `TK()`, `tr()` | `t()`/`tList()`, `tk()`, `tr()` em `src/lib/config.ts` |
| `asset()`, `ver()` | `assetUrl()`, `assetVersioned()` em `src/lib/assets.ts` |
| `:root {…}` do `style.css` | `src/styles/tokens.css` |
| `body {…}`, `.skip`, `.layout`, `.sheet`, `.hc` | `src/styles/global.css` |
| `.site-header …`, `.dd …`, `.site-footer …` | `<style>` dentro de `Header.astro` e `Footer.astro` |
| `<script>` solto no fim da página | `<script>` do `Header.astro` |
| `style.css?v=…` | um arquivo em `/_astro/` com nome que muda sozinho (o "hash") |
| `custom.css` depois do `style.css` | `custom.css` fora de camada, depois de tudo (`@layer site`) |

### O que ainda **não** está no layout

| Falta | Quando |
|---|---|
| Runas do fundo e tela de abertura | T07 (lugares marcados com `<!-- T07 -->`) |
| `site.js` (ordenação, carrossel, notícias, carta que vira…) | T11 em diante, componente por componente |
| `comments.js` | T15 |
| `feed.xml` de verdade (o link já existe, o arquivo não), raiz `/`, 404 | T14 |
| Fontes e logo otimizadas | T17 |
| Barra lateral (`SIDEBAR_ON` é `False`) | só se o autor ligar (B3) |
| "Skip to content" em português | ficou em inglês nos dois idiomas, como hoje; pergunta ao autor |

## 10. Rode você mesmo

Dentro da pasta do projeto (Parte 0 do `00-mapa.md` já feita):

```bash
pnpm dev        # http://localhost:4321/pt/  e  http://localhost:4321/en/
pnpm check      # 0 errors, 0 warnings, 0 hints
pnpm build      # gera dist/ — abra dist/pt/index.html num editor e compare com a seção 4
```

Na prévia, clique em **Português** (canto direito do cabeçalho): abre o menu com **English**. Clique fora: fecha. Troque para **English** e veja o idioma, o `<html lang>` e o menu mudarem. Use "Exibir código-fonte da página" no navegador para ver o `<head>`.

## 11. Tente

1. **Mude a cor da marca num lugar só.** Com o `pnpm dev` aberto, em `src/styles/tokens.css` troque `--teal: #25737a;` por `--teal: #a02060;` e salve: o fim do degradê (rodapé) muda de cor sozinho. Desfaça.
2. **Dê título e descrição à página.** Em `src/pages/pt/index.astro`, troque `<BaseLayout lang="pt" …>` por `<BaseLayout lang="pt" title="Teste" description="Minha descrição" …>` e salve. Abra o código-fonte da página: o `<title>` virou "Teste | Hᴀᴛᴇ Cʏᴄʟᴇ" e a descrição aparece em `<meta name="description">` e em `og:description`. Desfaça.
3. **Provoque um erro de tipo.** Troque `t("pt", "tagline")` por `t("pt", "tagLine")` e rode `pnpm check`. Anote a mensagem. Desfaça e rode de novo.
4. **(Seu arquivo, sua decisão.)** Se você quiser testar o truque do `@layer` de verdade, crie ou edite o **seu** `static/custom.css` com `:root { --logo-w: 100px; }` e recarregue a prévia: a logo encolhe. Se não funcionar, avise: é bug da migração.
5. **Pense (sem mexer):** por que "Apoio" aparece no menu durante o `pnpm dev` mas não no `dist/` gerado por `pnpm build`? (Dica: seção 7.)

## Para a próxima lição

A T07 traz as runas do fundo e a tela de abertura para os lugares marcados com `<!-- T07 -->`. A lição 03 mostra como portar para TypeScript um algoritmo do Python (o sorteio com semente das runas) e como **provar com um teste** que o resultado é o mesmo.
