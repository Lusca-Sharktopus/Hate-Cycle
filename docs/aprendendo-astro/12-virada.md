# Lição 12 — A virada: GitHub Actions, GitHub Pages e como voltar atrás (T20)

Até aqui, o site Astro vivia na sua máquina (`pnpm build` → pasta `dist/`) e o site que as pessoas veem era outro: a `main` do GitHub, uma pasta de arquivos prontos feita à mão. A T20 junta as duas pontas: **o GitHub passa a rodar o `pnpm build` sozinho** a cada mudança na `main` e **publica o resultado** em hatecycle.com. Não existe mais "subir o `public/`".

Esta lição é diferente das outras: quase não tem código do site. O arquivo principal é um roteiro de montagem (`.github/workflows/deploy.yml`), e o que se aprende é *o que acontece entre o seu `git push` e o visitante abrindo a página*.

## O que você vai entender

1. **O que é o GitHub Actions** (e o que é um *workflow*, um *job*, um *step*).
2. **O workflow do site, linha por linha.**
3. **Ações fixadas por SHA**: por que `@v7` não basta.
4. **O que o GitHub Pages faz com o pacote** (o *artefato*) e onde entram o domínio, o HTTPS e o cache.
5. **Por que o `pnpm test` não está no deploy** (e o que protege o site no lugar).
6. **Como voltar atrás** em minutos.
7. **O que muda no dia a dia** de quem escreve no site.
8. **Como se confere o site no ar** (`tools/conferir_no_ar.py`).

## Abra lado a lado

1. `.github/workflows/deploy.yml` (o workflow).
2. `docs/virada.md` (o roteiro do autor: a véspera, o dia da virada, voltar atrás, dia a dia; a virada, marcada para sábado 24/10 e depois para segunda 26/10, está sem data marcada (decisão do autor de 27/10)).
3. `tools/conferir_no_ar.py` (a conferência dos endereços-chave).
4. `package.json` (`packageManager`, `engines`) e `.nvmrc` (de onde o workflow tira as versões do pnpm e do Node).
5. `astro.config.mjs` (`site`, `outDir`, `publicDir`) e `static/CNAME` (o arquivo com `hatecycle.com`, que o Astro copia para `dist/CNAME`; confira com `cat dist/CNAME`).

## 1. O que é o GitHub Actions

É um computador **emprestado pelo GitHub**, que liga quando algo acontece no seu repositório (um `push`, um pull request, um clique em "Run workflow"), executa uma lista de tarefas que *você* escreveu e desliga. Você não instala nada: o computador vem vazio (um Ubuntu sem o seu projeto), então a lista de tarefas começa baixando o código e instalando o Node e o pnpm.

Três palavras:

- **Workflow**: o arquivo `.github/workflows/*.yml`. Tudo que está em `.github/workflows/` o GitHub lê sozinho.
- **Job**: um grupo de tarefas que roda em **um** computador. O nosso tem dois: `construir` e `publicar`. Jobs diferentes rodam em computadores diferentes.
- **Step**: uma tarefa dentro do job. Ou é um `run:` (um comando de terminal, como `pnpm build`), ou é um `uses:` (uma **ação**: um pacote pronto, feito por outra pessoa, como "baixar o código").

O YAML (o formato do arquivo) é só lista e indentação: o que está mais para a direita pertence ao que está logo acima.

## 2. O workflow, linha por linha

### Quando roda

```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:
```

- **`pull_request` para a `main`**: quando alguém abre ou atualiza um pull request. Só **constrói**. É o "ensaio": o PR nº 1 mostra uma bolinha verde ou vermelha antes de a mudança entrar. Nada vai ao ar.
- **`push` na `main`**: quando algo entra na `main` (inclusive o *merge* do PR). Constrói **e publica**.
- **`workflow_dispatch`**: o botão **Run workflow** na aba Actions. Serve para republicar sem mudar nada (por exemplo, depois de voltar atrás).

### Permissões e fila

```yaml
permissions:
  contents: read
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

- Todo workflow recebe um "crachá" temporário, o `GITHUB_TOKEN`. Pelo **princípio do menor privilégio**, o crachá de todo o fluxo só **lê** o código. Só o job que publica recebe mais (abaixo).
- `concurrency` evita duas execuções iguais ao mesmo tempo. Num pull request, uma execução nova **cancela** a velha (a velha não interessa mais). Num push na `main`, **nunca cancela**: poderia cortar uma publicação no meio.

### O job `construir`

| Step | O que faz | Por quê |
|---|---|---|
| `actions/checkout` | Baixa o código do commit. `persist-credentials: false` não deixa o crachá gravado na pasta. | O computador começa vazio. |
| `pnpm/action-setup` | Instala o pnpm na versão do `packageManager` do `package.json` (hoje 10.28.0). | Uma verdade só: a versão que você usa é a que o GitHub usa. Por isso não há `version:` no workflow. |
| `actions/setup-node` | Instala o Node da versão do `.nvmrc` (22) e liga o **cache do pnpm**. | O pnpm vem **antes** porque o cache do `setup-node` precisa achá-lo. O cache guarda os pacotes baixados entre execuções. |
| "Conferir que não há variáveis de prévia" | Falha se `NODE_ENV`, `HC_SHOW_EXTRAS`, `HC_IMAGENS` ou `HC_OUT_DIR` estiverem definidas. | São as quatro variáveis que o código do site lê. `NODE_ENV=development` mostraria **rascunhos**; `HC_SHOW_EXTRAS` ligaria Universo e Personagens. Hoje nenhuma está definida: o passo é só uma trava para o dia em que alguém, sem querer, defina. |
| `pnpm install --frozen-lockfile` | Instala **exatamente** o que o `pnpm-lock.yaml` diz. | Se o `package.json` e o lockfile discordam, **falha** em vez de instalar outra versão. |
| `pnpm check` | O `astro check`: tipos. Tem de dar 0 erros. | Pega erro de programação antes de publicar. |
| `pnpm build` | Gera `dist/`. | O site. Erros de front matter do conteúdo (campo desconhecido, `draft: yes`) param aqui, com mensagem. |
| "Conferir o resultado" | Confere `dist/CNAME` = `hatecycle.com`, que existem `index.html`, `404.html`, `pt/` e `en/`, os dois `feed.xml`, `sitemap.xml`, `_astro/`, e que **não** existe `dist/dev/`; e (T17m) que nenhuma página carrega `<script src>` de fora do site, a não ser os três scripts oficiais dos posts (X, Reddit, Instagram), escritos um por um com `--permitir` (`node tools/scripts_de_fora.mjs dist`, que lê cada HTML inteiro: tag quebrada em linhas, aspas simples, sem aspas, `//` sem protocolo). | Rede de segurança barata contra publicar um site vazio ou com cara de prévia, ou com um script desconhecido colado num texto. Não conta páginas (o número muda a cada notícia). |
| `actions/upload-pages-artifact` | Empacota `dist/` num arquivo (um `.tar`) e guarda como **artefato**. | É o que o Pages sabe receber (seção 4). |

### O job `publicar`

```yaml
publicar:
  needs: construir
  if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'
  permissions:
    pages: write
    id-token: write
  environment:
    name: github-pages
    url: ${{ steps.pages.outputs.page_url }}
  concurrency:
    group: pages
    cancel-in-progress: false
  steps:
    - uses: actions/deploy-pages@…
```

- `needs: construir`: só começa depois de o primeiro job terminar **bem**. Construção vermelha = nada é publicado.
- `if`: nunca em pull request, e só a partir da `main`. Um "Run workflow" numa outra branch constrói, mas não publica.
- `permissions`: aqui, e só aqui, o crachá ganha `pages: write` (criar uma publicação no Pages) e `id-token: write` (provar ao Pages, com um comprovante assinado, que o pedido vem *desta* `main` e não de um impostor).
- `environment: github-pages`: um "lugar de publicação" com nome. O GitHub o cria sozinho e, por padrão, só deixa a `main` publicar nele. A `url:` aparece no resumo da execução.
- `concurrency: pages` com `cancel-in-progress: false`: **uma** publicação por vez, e uma que já começou nunca é cortada no meio.
- O step `actions/deploy-pages` é uma linha porque não precisa de nada: ele acha sozinho o artefato `github-pages` do job anterior.

## 3. Ações fixadas por SHA

Cada `uses:` aponta para o código de outra pessoa que roda **com o crachá do seu repositório**. Escrever `actions/checkout@v7` significa "o que o dono do repositório `checkout` colocar na etiqueta `v7` *hoje*", e o dono pode mover a etiqueta (ou alguém que invadiu a conta dele pode). Em março de 2025 isso aconteceu de verdade com a ação `tj-actions/changed-files`: etiquetas antigas foram movidas para um código que roubava segredos de quem a usava.

Por isso cada ação está fixada pelo **SHA do commit** (40 letras e números), que não muda nunca, e a versão fica num comentário para humanos:

```yaml
uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

Como se descobre o SHA: `git ls-remote --tags https://github.com/actions/checkout.git` lista as etiquetas. Cuidado com as etiquetas **anotadas** (como as do `pnpm/action-setup`): o SHA da etiqueta é o de um objeto "etiqueta", e o do **commit** é o da linha com `^{}` no fim. O workflow usa o do commit. (A conferência da T20 também baixou cada repositório e confirmou que o SHA é um commit, que a etiqueta aponta para ele e que o `action.yml` roda em Node 24.)

O preço: o SHA não se atualiza sozinho. A T21 põe o **Dependabot**, que abre um pull request quando sai versão nova, com o SHA novo.

## 4. O que o GitHub Pages faz com o pacote

1. O `upload-pages-artifact` junta `dist/` num `.tar` e o guarda como artefato do *run* (por 1 dia). Limites do Pages: **1 GB** o artefato/site e **100 MB** por arquivo. O nosso `dist/` tem **174 MiB** (858 arquivos, medido na T17m em 22/10; era 155 MiB e 797 arquivos na T20), o maior arquivo tem 10 MB (o banner da página Apoio, `support/banner.png`).
2. O `deploy-pages` pede ao Pages: "publique este artefato". O Pages troca o site inteiro **de uma vez** (não arquivo por arquivo): quem está no site vê o antigo ou o novo, nunca um meio-termo.
3. O site vai para uma rede de servidores (CDN) que guarda cópias por até **10 minutos** (`cache-control: max-age=600`). É por isso que, depois de verde, uma pessoa ainda pode ver a versão anterior por um tempo.
4. **Domínio e HTTPS.** Com "Deploy from a branch", o domínio vinha do arquivo `CNAME` da branch. Com **GitHub Actions** o arquivo `CNAME` do site é **ignorado**: o domínio é o campo **Custom domain** de Settings → Pages. (O `dist/CNAME` continua existindo, de propósito: é inofensivo e documenta o domínio. O certificado HTTPS é do domínio, não do site, e não muda.)
5. **A pasta `_astro/`** (CSS, JavaScript e fontes com carimbo no nome) só seria publicada com "Deploy from a branch" se houvesse um arquivo `.nojekyll`, porque aquele modo passa o site pelo Jekyll, que ignora pastas com `_`. Com Actions o Jekyll **não roda**; não precisa de nada (B34).
6. **404.** Para qualquer endereço que não existe, o Pages devolve o `404.html` da raiz **com status 404**. É a página que o Astro gera em `src/pages/404.astro`.

## 5. Por que o `pnpm test` não está no deploy

O `pnpm test` roda 6.620 testes, e muitos são **fotos do conteúdo**: comparam o site Astro com uma referência gerada pelo Python em `tests/fixtures/` numa data. Se você publica uma notícia nova, o conteúdo muda, a "foto" fica velha e **54 testes falham** até alguém rodar `tools/*_ref.py` (que pedem Python 3.12 e o `build.py`). Se o deploy esperasse o `pnpm test`, **a primeira notícia depois da virada não iria ao ar**. (Condição C4 da revisão T19, achado R3.)

O que protege o site no lugar:

- `pnpm check` (tipos);
- `pnpm build`, que **para com mensagem** se o front matter estiver errado (B20);
- "Conferir o resultado" (a rede de segurança acima);
- a regra de que uma construção vermelha **nunca publica** (`needs:`): o site no ar fica como estava;
- `tools/conferir_no_ar.py`, depois, no site de verdade.

Os testes continuam existindo e são rodados à mão (`pnpm test`) por quem mexe em `src/`. A T21 separa os testes de **regra** (sites inventados, que valem sempre) dos de **foto**, e só então os leva para o CI.

## 6. Como voltar atrás

O site antigo está guardado inteiro na branch **`site-antigo`** (a `main` de antes da virada, commit `31904c2`). Voltar é trocar *de onde o Pages publica*:

Settings → Pages → **Source = Deploy from a branch** → Branch **`site-antigo`** / **/ (root)** → Save.

Em 1 a 3 minutos o Pages publica a branch como está (com o Jekyll, que para um site de HTML feito à mão não faz diferença). O `CNAME` da `site-antigo` é `hatecycle.com`; confira no campo Custom domain.

Voltar ao novo: Source = GitHub Actions de novo, e Actions → Site → **Run workflow** na `main` (o `workflow_dispatch` serve exatamente para isto).

O que voltar atrás **não** desfaz: os comentários no Supabase (o site antigo só não os mostra) e a `main` com o site novo (ela não é apagada; só deixa de ser a que o Pages publica). Voltar é trocar o que está no ar, não apagar história.

## 7. O que muda no dia a dia

| Antes | Depois |
|---|---|
| `python build.py` + subir `public/` à mão | `git push` na `main`; o GitHub constrói e publica |
| Um erro de escrita só aparecia quando alguém abria a página | Erro de front matter derruba a construção (bolinha vermelha, e-mail) e o site no ar **não muda** |
| Sem ensaio | Todo pull request mostra "build verde" antes de entrar |
| Voltar atrás = refazer à mão | Voltar atrás = trocar a Source em Settings → Pages |

O autor não usa git: manda arquivos, e quem faz o commit e o push é o assistente (o fluxo "manda pra mim → eu publico"), ou ele envia pelo botão **Add file → Upload files** do site do GitHub, na `main`, o que também dispara o workflow. Tudo isso está em `docs/virada.md`.

## 8. Conferir o site no ar

`tools/conferir_no_ar.py` (só biblioteca padrão do Python) pega um endereço base e, para cada endereço-chave, confere o **status HTTP**, o **título** e um **pedaço de texto**:

```bash
python3 tools/conferir_no_ar.py https://hatecycle.com              # o site no ar
python3 tools/conferir_no_ar.py https://hatecycle.com --espera 600 # repete até passar (cache)
timeout 120 python3 tools/conferir_no_ar.py --servir dist          # imita o Pages localmente
```

O que ele cobre: a raiz, as duas homes, Histórias, capítulos (com o `data-page`, que é o ID da conversa de comentários), uma notícia, Sobre e Apoio, os redirecionamentos do site antigo, os dois feeds e o sitemap, imagens com acento e `&` no nome, o 404, os **rascunhos que não podem aparecer** (`config.json` e `build.py` também não), e, descobertos de dentro das páginas, um CSS, uma fonte e o script dos comentários de `/_astro/` (que têm nome com carimbo novo a cada build).

Contra o site de verdade só dá para rodar numa máquina com internet; no sandbox da sessão ele foi testado contra o `dist/` num servidor local (`--servir`), incluindo um `dist/` estragado de propósito, em que apontou as 5 falhas plantadas.

## Rode você mesmo

```bash
# o que o GitHub vai fazer, na sua máquina, numa pasta limpa:
git clone <o repositório> teste && cd teste
pnpm install --frozen-lockfile && pnpm check && pnpm build
cat dist/CNAME                                   # hatecycle.com
find dist -name '*.html' | wc -l                 # 197 hoje
du -sh dist                                      # ~158 MB

timeout 120 python3 tools/conferir_no_ar.py --servir dist
```

Para ver o workflow rodando de verdade: Actions → **Site** → o último *run*. Clique no job `construir` e leia cada step: são as linhas que você leu na seção 2, com o que saiu no terminal.

## Tente

1. Num clone seu (nunca na `main`), apague uma linha de `content/news/…/pt.md` para deixar um campo do topo errado (`dat: 2026-10-30`), rode `pnpm build` e leia a mensagem. É a mesma que você veria na bolinha vermelha do GitHub.
2. No `deploy.yml`, acrescente `NODE_ENV: development` num `env:` do job `construir` e abra um pull request de teste: o passo "Conferir que não há variáveis de prévia" tem de falhar. Desfaça.
3. Rode `git ls-remote --tags https://github.com/pnpm/action-setup.git | grep v6.1.0` e veja as duas linhas (`v6.1.0` e `v6.1.0^{}`): qual delas é o commit?
4. Rode `timeout 120 python3 tools/conferir_no_ar.py --servir dist`, depois apague `dist/pt/feed.xml` e rode de novo: a linha "RSS em português" tem de aparecer como FALHOU.
