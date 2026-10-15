# Lição 01 — Anatomia de um projeto Astro (T05)

Na T05 o projeto ganhou um **segundo gerador**, o Astro, morando na mesma pasta que o `build.py`. Por enquanto ele só gera duas páginas de esqueleto (`/en/` e `/pt/`), sem visual nenhum. Parece pouco, mas é a fundação de tudo: onde ficam os arquivos, como um endereço nasce, como o Astro lê o mesmo `config.json` que o Python e como rodar tudo no seu computador.

O site no ar **não muda nada** com isso: o `python build.py` continua gerando as mesmas 192 páginas em `public/`. O Astro escreve em outra pasta (`dist/`).

## O que você vai entender

1. Para que serve cada arquivo novo (`package.json`, `astro.config.mjs`, `tsconfig.json`, `src/…`).
2. O que é um componente `.astro`: a parte entre as linhas `---` roda no build; o resto é HTML.
3. Roteamento por arquivo: `src/pages/pt/index.astro` vira o endereço `/pt/`.
4. Os dois idiomas com prefixo (`/en/` e `/pt/`).
5. De onde vem o título da aba: `config.json` → `src/lib/config.ts` → página → layout.
6. O que, no `build.py`, corresponde a cada peça: `shell()`, `write()`, `BASE`.

## Abra lado a lado (nesta ordem)

1. `package.json`
2. `astro.config.mjs`
3. `tsconfig.json`
4. `src/lib/config.ts`
5. `src/pages/pt/index.astro`
6. `src/layouts/BaseLayout.astro`
7. `dist/pt/index.html` (só existe depois de rodar `pnpm build`)

---

## 1. `package.json` — a lista de compras

O Python do `build.py` só usa a biblioteca padrão; nada para instalar. O Astro é diferente: é um pacote do mundo JavaScript (Node.js), e o `package.json` diz **quais pacotes o projeto usa** e **quais comandos existem**.

```json
"scripts": {
  "dev": "astro dev",
  "build": "astro build",
  "preview": "astro preview",
  "check": "astro check",
  "astro": "astro"
},
"dependencies": {
  "astro": "^7.3.8"
},
"devDependencies": {
  "@astrojs/check": "^0.9.10",
  "typescript": "^6.0.3"
}
```

- **`scripts`** são apelidos: `pnpm build` roda `astro build`, `pnpm dev` roda `astro dev` e assim por diante. O `"astro": "astro"` deixa você chamar qualquer subcomando, como `pnpm astro --help`.
- **`dependencies`**: o que o site precisa para ser gerado. Por enquanto, só o próprio Astro.
- **`devDependencies`**: ferramentas só de quem programa: o `@astrojs/check` e o `typescript` fazem a verificação de tipos (`pnpm check`). O TypeScript fica na versão 6 porque o `@astrojs/check` ainda não aceita a 7.
- **`"packageManager": "pnpm@10.28.0"`** registra com qual pnpm o projeto foi montado. **`"engines": { "node": ">=22.12.0" }`** avisa que o Astro 7 precisa de Node 22.12 ou mais novo.
- O `^` em `^7.3.8` quer dizer "a 7.3.8 ou uma 7.x mais nova". Quem trava a versão **exata** é o `pnpm-lock.yaml`.

Arquivos que acompanham:

| Arquivo/pasta | O que é | Vai para o git? |
|---|---|---|
| `pnpm-lock.yaml` | A "nota fiscal": versão exata de cada pacote instalado (o Astro puxa ~270 pacotes). Garante que o seu computador e o do Claude instalem exatamente a mesma coisa. Nunca edite à mão. | Sim |
| `node_modules/` | Os pacotes instalados de fato (criada pelo `pnpm install`). Pesada e recriável. | Não |
| `.nvmrc` | Diz `22`: quem usa o programa `nvm` troca para o Node 22 com `nvm use`. | Sim |

## 2. `astro.config.mjs` — as regras da casa

É o equivalente às constantes do topo do `build.py` (`OUT`, `BASE`, `LANGS`…). Cada linha tem um comentário no próprio arquivo; aqui vai o porquê de cada escolha.

### `site` (e por que não tem `base`)

```js
site: "https://hatecycle.com",
```

O `site` é o endereço final do site. O Astro usa isso para montar endereços completos (no futuro: RSS, sitemap, `og:image`).

Existe também uma opção `base`, para quando o site mora numa **subpasta** do domínio (por exemplo `usuario.github.io/Hate-Cycle/`). Ela é a irmã do `BASE` do `build.py`:

```python
# build.py, linha 20
BASE = CFG.get("base_url", "").rstrip("/")
```

e o `BASE` é grudado na frente de todo endereço por `u()`/`asset()`. Só que o seu repositório tem um arquivo `CNAME` com `hatecycle.com`: o site mora na **raiz** do domínio, então não há subpasta nenhuma e o Astro fica **sem `base`**. É por isso também que o `config.json` hoje tem um bug (B1 no `docs/BACKLOG.md`): o `base_url` está como endereço completo (`https://Lusca-Sharktopus.github.io/Hate-Cycle`) e acaba duplicado nos links do RSS. No Astro esse problema nem existe: `site` é o domínio, e não há `base`.

### `publicDir` e `outDir` — de onde vem, para onde vai

```js
publicDir: "./static",
outDir: "./dist",
```

- **`publicDir: "./static"`**: tudo o que está em `static/` é copiado **como está** para o site, igual ao que o `build.py` faz:

  ```python
  # build.py, linha 652
  shutil.copytree(STATIC, OUT, dirs_exist_ok=True, copy_function=shutil.copyfile)
  ```

  Isso é **provisório**: na virada (T20) a pasta `static/` será dividida entre `public/` (o que vai como está) e `src/assets/` (imagens que o Astro otimiza, T17). Vai tudo, inclusive o `CNAME`, a pasta `Produtos/` (ainda sem uso, item B13) e o seu `custom.css` quando ele estiver na pasta — exatamente como hoje, já que o `shell()` do Python também publica e usa o `custom.css`. A pasta `guardados/` fica fora de `static/`, então continua sem ser publicada.
- **`outDir: "./dist"`**: o site Astro sai em `dist/`, separado do `public/` do Python. Os dois geradores podem rodar sem um apagar o trabalho do outro. Equivale ao `OUT = … ROOT / "public"` da linha 17 do `build.py`.

### `trailingSlash` e `build.format` — endereços com barra no fim

```js
trailingSlash: "always",
build: {
  format: "directory",
},
```

Os endereços de hoje terminam em barra (`/pt/news/2023-08-18-orcs/`), e cada página é um `index.html` dentro de uma pasta. As duas opções reproduzem isso:

| Arquivo em `src/pages/` | Endereço | Arquivo gerado em `dist/` |
|---|---|---|
| `pt/index.astro` | `/pt/` | `pt/index.html` |
| `pt/about.astro` (futuro) | `/pt/about/` | `pt/about/index.html` |

É o mesmo que a função `write()` do Python faz quando o endereço termina em `/`:

```python
# build.py, linhas 121-124
def write(url, content):
    p = OUT / url.strip("/") / "index.html" if url.endswith("/") else OUT / url.strip("/")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, "utf-8")
```

Com `trailingSlash: "always"`, a prévia (`pnpm dev`) só aceita o endereço **com** barra: `http://localhost:4321/pt` dá "404", `http://localhost:4321/pt/` funciona. No GitHub Pages, `/pt` sem barra é redirecionado para `/pt/` sozinho, como hoje.

### `compressHTML: false` — os espaços entre palavras e links

```js
compressHTML: false,
```

O Astro 7 mudou o padrão desta opção para `'jsx'`, que apaga o espaço entre dois elementos quando há uma quebra de linha entre eles. Testamos com o Astro 7.3.8:

```html
<p>O universo <span class="hc">Hate Cycle</span>
<a href="/x/">continua</a> aqui</p>
```

| Valor | O visitante lê |
|---|---|
| `'jsx'` (padrão do Astro 7) | O universo Hate Cycle**continua** aqui |
| `true` (padrão antigo) | O universo Hate Cycle continua aqui |
| `false` (o escolhido) | O universo Hate Cycle continua aqui |

O site depende desses espaços o tempo todo: o versalete Hᴀᴛᴇ Cʏᴄʟᴇ vira `<span class="hc">` e há links no meio das frases. Com `false`, o HTML sai com os espaços exatamente como foram escritos, como o `build.py` já faz (ele não comprime nada). A diferença de tamanho é pequena.

### `i18n` — dois idiomas, os dois com prefixo

```js
i18n: {
  locales: ["en", "pt"],
  defaultLocale: "en",
  routing: {
    prefixDefaultLocale: true,
    redirectToDefaultLocale: false,
  },
},
```

- **`locales`**: os idiomas, com os mesmos nomes das chaves de `config.json → languages` e das pastas `src/pages/en/` e `src/pages/pt/`.
- **`defaultLocale: "en"`**: hoje, a raiz `/` tenta adivinhar o idioma do navegador e, quando não reconhece, cai em `/en/`; a página 404 também usa o inglês como idioma principal (`<html lang="en">`). O inglês é o idioma "padrão" do site atual, então ficou igual.
- **`prefixDefaultLocale: true`**: sem isso, o Astro colocaria o idioma padrão sem prefixo (o inglês ficaria em `/` e não em `/en/`). Com `true`, os dois idiomas têm prefixo, como hoje.
- **`redirectToDefaultLocale: false`**: com `true`, o Astro faria a raiz `/` mandar sempre para `/en/`. Mas a raiz de hoje é mais esperta (lembra a escolha do visitante e olha o idioma do navegador), e ela será refeita à mão na T14. Por isso fica `false` (que já é o padrão; está escrito só para ficar claro). **Enquanto a T14 não chega, o Astro não gera página nenhuma em `/`**: na prévia, `http://localhost:4321/` dá "404". É esperado.

## 3. `tsconfig.json` — o revisor de tipos

```json
{
  "extends": "astro/tsconfigs/strictest",
  "include": [".astro/types.d.ts", "src/**/*", "astro.config.mjs"],
  "exclude": ["dist", "public", "static", "guardados", "node_modules"]
}
```

TypeScript é JavaScript com **tipos**: você diz "isto é um texto", "isto é `"en"` ou `"pt"`", e o `pnpm check` acusa quando algo não bate, **antes** de o site ir ao ar. O Astro traz três níveis prontos (`base`, `strict`, `strictest`); usamos o mais rigoroso, `strictest`. Ele obriga, por exemplo, a tratar o caso de uma chave que não existe num dicionário — exatamente o tipo de erro que aparece quando se lê `config.json`, `work.json` e o front matter dos `.md`. Quem escreve o código é quase sempre o Claude; o rigor serve para os erros aparecerem para ele, e não para o leitor.

O `include` diz o que verificar: só o projeto Astro (`src/` e a configuração). Os scripts do site atual (`static/site.js`, `static/comments.js`) ficam de fora.

## 4. Um componente `.astro` tem duas metades

Abra `src/pages/pt/index.astro`:

```astro
---
// Este arquivo vira a página /pt/ (src/pages/pt/index.astro → dist/pt/index.html).
// Por enquanto é só um esqueleto: a home de verdade (capas, últimas atualizações) é a T11.
import BaseLayout from "../../layouts/BaseLayout.astro";
import { siteName, t } from "../../lib/config";
---

<BaseLayout lang="pt">
  <h1>{siteName}</h1>
  <p>{t("pt", "tagline")}</p>
  <p>{t("pt", "hero_sub")}</p>
</BaseLayout>
```

- **Entre as duas linhas `---`** (o "frontmatter" do componente) fica código TypeScript que roda **só durante o build**, no seu computador. Aqui ele só importa duas coisas: o layout e os textos do `config.json`. Nada disso chega ao navegador do visitante.
- **Abaixo do `---`** fica o HTML da página. As `{chaves}` encaixam valores de cima, como as `{}` das f-strings do Python. A mesma frase de efeito, nos dois geradores:

  ```python
  # build.py, linha 752 (home): você precisa lembrar do esc()
    <h1>{esc(T(lang, 'tagline'))}</h1>
  ```
  ```astro
  <p>{t("pt", "tagline")}</p>
  ```

  O Astro protege o texto sozinho (um `<` vira `&lt;`), sem precisar de `esc()`.
- **`<BaseLayout lang="pt">…</BaseLayout>`** usa outro componente como se fosse uma tag HTML. O `lang="pt"` é uma ***prop*** (um parâmetro, como os argumentos de uma função), e tudo o que está entre a abertura e o fechamento é entregue ao layout.

## 5. Roteamento por arquivo: o caminho do arquivo **é** o endereço

No `build.py`, o endereço de cada página é um texto escolhido no código: `write(f"/{lang}/news/", …)`. No Astro, **o lugar do arquivo dentro de `src/pages/` é o endereço**:

```
src/pages/en/index.astro  →  /en/  →  dist/en/index.html
src/pages/pt/index.astro  →  /pt/  →  dist/pt/index.html
```

Só arquivos dentro de `src/pages/` viram páginas. Por isso as outras pastas de `src/` têm outro papel:

| Pasta | Camada (D6 da `docs/ARQUITETURA.md`) | O que vai ali |
|---|---|---|
| `src/pages/` | apresentação | as páginas (cada arquivo = um endereço) |
| `src/layouts/` | apresentação | molduras de página (`BaseLayout.astro`) |
| `src/components/` | apresentação | pedaços reutilizáveis (cabeçalho, rodapé, cards) — a partir da T06 |
| `src/lib/` | regras | código sem HTML: leitura do `config.json`, ordenações, datas (T10) |
| `src/styles/` | apresentação | CSS do Astro — a partir da T06 |

`src/components/` e `src/styles/` ainda estão vazias; cada uma tem um `README.md` de uma linha dizendo o que vai entrar. (Em `src/pages/` não pode ter `README.md`: viraria uma página!)

**Por que dois arquivos (`en/index.astro` e `pt/index.astro`) e não um só?** Dá para ter um arquivo único `src/pages/[lang]/index.astro` que gera os dois idiomas, com uma função `getStaticPaths()`. É o que a T11 vai fazer, quando as páginas tiverem conteúdo de verdade (e é o assunto da lição 07). Para começar, dois arquivos pequenos mostram a regra "arquivo = endereço" sem nenhuma mágica.

## 6. De onde vem o título da aba (e o `lang`)

Siga o fio, do `config.json` até o HTML:

```
config.json                 "site_name": "Hᴀᴛᴇ Cʏᴄʟᴇ"      "languages": { "pt": { "html": "pt-BR" } }
   ↓ import
src/lib/config.ts           siteName                         htmlLang("pt")
   ↓ import
src/layouts/BaseLayout.astro  <title>{fullTitle}</title>     <html lang={htmlLang(lang)}>
   ↑ prop lang="pt"
src/pages/pt/index.astro    <BaseLayout lang="pt">
   ↓ pnpm build
dist/pt/index.html          <title>Hᴀᴛᴇ Cʏᴄʟᴇ</title>         <html lang="pt-BR">
```

**`src/lib/config.ts`** lê o `config.json` **no lugar onde ele está** (o caminho `../../config.json` sai de `src/lib/` e volta para a raiz). Nada é copiado: se você mudar o `config.json`, os dois geradores veem a mudança.

```ts
import { site_name, languages, ui } from "../../config.json";
```

Repare que ele importa **só três campos**. O resto do arquivo — inclusive as chaves do Supabase em `comments` — não é usado pelo Astro e não aparece em nenhum arquivo gerado (conferido em `dist/` na T05). Depois vem um **tipo** que descreve só o que é usado:

```ts
interface SiteConfig {
  site_name: string;
  languages: Record<Lang, { name: string; html: string }>;
  ui: Record<Lang, { tagline: string; hero_sub: string }>;
}
```

Se um dia `tagline` for renomeado ou apagado no `config.json`, o `pnpm check` acusa erro nesse arquivo, em vez de o site sair com um buraco.

A função `t()` é a prima da `T()` do `build.py`:

```python
# build.py, linha 68
def T(lang, key):
    return CFG["ui"].get(lang, {}).get(key) or CFG["ui"]["en"].get(key, key)
```
```ts
// src/lib/config.ts
export function t(lang: Lang, key: keyof SiteConfig["ui"][Lang]): string {
  return config.ui[lang][key];
}
```

A diferença: a do Python, se não acha a chave, usa o inglês ou o próprio nome da chave, e o erro passa despercebido. A do Astro só aceita chaves que existem (`"tagline"` ou `"hero_sub"`, por enquanto); um erro de digitação é apontado pelo `pnpm check`.

**O versalete.** O título sai como `Hᴀᴛᴇ Cʏᴄʟᴇ`, com as letras Unicode. Na página, o `shell()` do Python troca essas letras por `<span class="hc">Hate Cycle</span>` (versalete "de verdade" do CSS); no Astro isso volta na T06/T09. No `<title>` da aba, o site atual também usa as letras Unicode, então ali já está igual.

## 7. O layout: o esqueleto do `shell()`

Abra `src/layouts/BaseLayout.astro`:

```astro
---
import { siteName, htmlLang, type Lang } from "../lib/config";

interface Props {
  lang: Lang;
  /** Título da página. Sem título (ou igual ao nome do site), a aba mostra só o nome do site. */
  title?: string;
}

const { lang, title } = Astro.props;

// Mesma regra do shell(): ttl = site if title == site else f"{title} | {site}"
const fullTitle = !title || title === siteName ? siteName : `${title} | ${siteName}`;
---

<!doctype html>
<html lang={htmlLang(lang)}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{fullTitle}</title>
  </head>
  <body>
    <slot />
  </body>
</html>
```

- **`interface Props`** lista os parâmetros que o layout aceita: `lang` (obrigatório, só `"en"` ou `"pt"`) e `title` (o `?` diz que é opcional). É a assinatura do `shell(lang, title, main, …)` do Python.
- **`Astro.props`** é onde chegam os valores passados pela página (`lang="pt"`).
- **`<slot />`** é o buraco onde entra o conteúdo que a página colocou entre `<BaseLayout>` e `</BaseLayout>`. Faz o papel do parâmetro `main` do `shell()`.
- A regra do título é a mesma da linha 393 do `build.py`: `ttl = site if title == site else f"{title} | {site}"`.

Por enquanto o layout é **só o esqueleto**: sem CSS, sem cabeçalho, sem rodapé, sem fontes, sem tela de abertura, sem hreflang. Tudo isso é a T06 (lição 02).

## 8. Resumo: `build.py` × Astro

| No `build.py` | No Astro (T05) |
|---|---|
| `CFG = json.loads((ROOT / "config.json").read_text("utf-8"))` | `import { site_name, languages, ui } from "../../config.json"` em `src/lib/config.ts` |
| `T(lang, key)` | `t(lang, key)` em `src/lib/config.ts` |
| `shell(lang, title, main, …)` | `src/layouts/BaseLayout.astro` (props `lang`, `title`; `<slot />` = `main`) |
| `write(url, html)` | o caminho do arquivo em `src/pages/` + `build.format: "directory"` |
| `BASE`, `u()`, `asset()` | `site: "https://hatecycle.com"` e nenhum `base` (site na raiz do domínio) |
| `OUT = ROOT / "public"` | `outDir: "./dist"` |
| `shutil.copytree(STATIC, OUT, …)` | `publicDir: "./static"` |
| `LANGS = list(CFG["languages"])` | `i18n.locales: ["en", "pt"]` |
| `python build.py` | `pnpm build` |
| `python build.py serve` (porta 8000) | `pnpm dev` (porta 4321) |

## 9. O que sai em `dist/`

Depois de `pnpm build`, a pasta `dist/` tem:

| Em `dist/` | De onde veio |
|---|---|
| `en/index.html`, `pt/index.html` | Gerados pelo Astro a partir de `src/pages/en/index.astro` e `src/pages/pt/index.astro` |
| `CNAME`, `style.css`, `site.js`, `comments.js` | Copiados de `static/` (o `CNAME` é o que liga o GitHub Pages a hatecycle.com) |
| `Backgrounds/`, `covers/`, `emissaries/`, `intro/`, `logos/`, `news/`, `other images/`, `sidebar/`, `social/`, `Produtos/` | Copiados de `static/`, sem nenhuma mudança (cerca de 135 MB) |

Ainda **não** existem: a raiz `/`, a `404.html`, os `feed.xml` e os redirects do site antigo (`PT.html`, `ossos.html`…) — tudo isso é a T14. Também não há pasta `_astro/`: ela só aparece quando o Astro tiver CSS ou JavaScript próprios para empacotar.

## 10. Rode você mesmo

Antes, faça a **Parte 0** do `00-mapa.md` (Node 22.12+, pnpm 10, VS Code com a extensão Astro). Depois, no terminal, dentro da pasta do projeto:

```bash
pnpm install     # uma vez (e de novo sempre que o package.json mudar). Cria node_modules/
pnpm dev         # prévia com recarregamento instantâneo
```

Abra **http://localhost:4321/pt/** e **http://localhost:4321/en/** (com a barra no fim). Você vai ver uma página branca com o nome do site, a frase de efeito e a frase de apresentação. Lembre:

- `http://localhost:4321/` dá "404" por enquanto (a raiz é a T14).
- Na prévia aparece uma barrinha do Astro no pé da página (a *dev toolbar*). Ela só existe no `pnpm dev`; o site gerado não tem.
- Para parar a prévia: `Ctrl+C` no terminal.
- Na primeira vez o Astro avisa que coleta dados anônimos de uso. Se não quiser: `pnpm astro telemetry disable` (vale para o seu computador todo).

Os outros comandos:

```bash
pnpm build       # gera o site Astro em dist/  (termina com "2 page(s) built" e "Complete!")
pnpm preview     # serve o dist/ em http://localhost:4321 para ver o resultado final
pnpm check       # verificação de tipos; o resultado esperado é:
                 #   - 0 errors
                 #   - 0 warnings
                 #   - 0 hints
```

E o gerador antigo continua igual: `python build.py` → `public/` com 192 páginas.

## 11. Tente

1. **Veja a prévia recarregar sozinha.** Com o `pnpm dev` rodando e `http://localhost:4321/pt/` aberto, abra `src/pages/pt/index.astro` e acrescente uma linha logo abaixo de `<h1>{siteName}</h1>`:

   ```astro
   <p>Olá, Astro!</p>
   ```

   Salve. O navegador atualiza sozinho, sem você apertar F5. Depois apague a linha e salve de novo.
2. **Dê um título à página.** Troque `<BaseLayout lang="pt">` por `<BaseLayout lang="pt" title="Teste">` e salve: a aba passa a mostrar "Teste | Hᴀᴛᴇ Cʏᴄʟᴇ", a mesma regra do `shell()`. Desfaça.
3. **Provoque um erro de tipo.** Troque `t("pt", "tagline")` por `t("pt", "tagLine")` (L maiúsculo) e rode `pnpm check`. Ele aponta o arquivo, a linha e diz que só `"tagline"` ou `"hero_sub"` são aceitos. Desfaça e rode de novo: volta a "0 errors".
4. **(Opcional) Prove que não há cópia do `config.json`.** Mude o texto de `ui → pt → tagline` no `config.json` e recarregue a prévia: a frase muda no Astro (e mudaria também no `python build.py`). **Volte o texto ao original** depois — esse arquivo é o do site de verdade.

## Para a próxima lição

Na T06 (lição 02) o `BaseLayout` ganha o `<head>` completo (hreflang, Open Graph, fontes), o cabeçalho com o menu e o seletor de idioma, o rodapé e os tokens de cor da marca — e começamos a comparar com os screenshots da baseline.

---

## Anexo — rede do sandbox (nota técnica para o Claude)

No sandbox das sessões do Claude, o endereço do registro de pacotes (`registry.npmjs.org`) está na lista `NO_PROXY`, e o acesso direto não resolve DNS: `pnpm install` falha. Os comandos pnpm/npm precisam passar pelo proxy da sessão. Antes deles, no **mesmo** comando do shell, tire o registro do `NO_PROXY`:

```bash
export NO_PROXY="$(printf '%s' "$NO_PROXY" | tr ',' '\n' | grep -vx 'registry.npmjs.org' | paste -sd, -)"
export no_proxy="$NO_PROXY" npm_config_noproxy="$NO_PROXY" GLOBAL_AGENT_NO_PROXY="$NO_PROXY"
pnpm install
```

(O ambiente do shell não persiste entre comandos: repita o `export` em cada chamada.) No seu computador, nada disso é necessário.

Outra pegadinha só do sandbox: o Astro 7 percebe que está sendo rodado por um agente e põe `astro dev`/`astro preview` em **segundo plano**, escapando do `timeout`. Nas sessões, use `--ignore-lock` para manter o servidor em primeiro plano (`timeout 120 pnpm preview --port 4329 --ignore-lock`) ou pare com `pnpm astro preview stop` / `pnpm astro dev stop`.
