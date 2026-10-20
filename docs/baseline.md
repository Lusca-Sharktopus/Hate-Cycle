# Baseline: a "foto" do site atual (T03)

Antes de migrar para o Astro, congelamos um retrato do site Python de hoje. Na T18 (paridade) o site Astro é comparado com ele para provar que **nenhuma URL, ID de comentário, título ou texto se perdeu**.

## Como gerar de novo

```bash
python3 tools/baseline.py                # tudo (cerca de 2 min)
python3 tools/baseline.py --sem-screens  # só os arquivos versionados, sem navegador (rápido)
python3 tools/baseline.py --so-screens   # só os screenshots
```

O script gera o site atual (sem `base_url`, sem rascunhos) numa pasta temporária fora do projeto, lê os HTMLs e grava em `baseline/`. O `public/` não é tocado. Rodar duas vezes seguidas não muda nada em `baseline/` (exceto os PNGs, que não são versionados). Só regere a foto se o site **atual** mudar de propósito (conteúdo novo, correção de bug); depois confira o `git diff baseline/`, que mostra exatamente o que mudou.

## O que tem em `baseline/`

| Arquivo | Conteúdo |
|---|---|
| `urls.json` | `html`: todas as 193 páginas HTML (ex.: `/pt/news/x/`); `redirects_site_antigo`: destino de `/PT.html`, `/ossos.html`…; `outros_gerados`: `/en/feed.xml`, `/pt/feed.xml`; `outros_de_static_relevantes`: `/CNAME`. |
| `comentarios.json` | `ids_unicos` (87) e `por_pagina`: os `data-page` de cada página. |
| `paginas.json` | Por URL: `title`, `description`, `lang`, `canonical`, `hreflang`, `og:*`, links alternativos (RSS) e `meta_refresh`. |
| `feeds.json` | Itens (título, link, data) dos dois `feed.xml`. |
| `estaticos.json` | Os 266 arquivos de `static/` com um hash curto (provam que imagens e scripts chegam iguais). `custom.css` fica de fora (é pessoal do autor). |
| `texto/*.txt` | Texto visível de cada página, um arquivo por URL (`/pt/news/x/` vira `pt__news__x.txt`; a raiz é `_raiz.txt`). |
| `screens/` | PNGs `desktop/` (1100 px) e `mobile/` (390 px) das páginas-chave. **Fora do git** (~77 MB); regere com o script. |

As 193 páginas = 92 em `/en/` + 92 em `/pt/` + 9 na raiz (`/`, `/404.html` e 7 redirects do site antigo).

## Critério do texto normalizado

- Vale o conteúdo de `<main id="main">` (a página sem cabeçalho, rodapé e menu, que se repetem e trazem o ano atual). Páginas sem `<main>` (redirects) usam o `<body>`.
- Ignorados: `script`, `style`, `noscript`, `template`, `svg`.
- Cada bloco (`p`, `div`, `li`, títulos, `br`…) vira uma linha; espaços repetidos, quebras e espaço sem quebra viram um espaço só; linhas vazias somem.
- O texto alternativo das imagens entra como linha começando com `[img] `.
- Nada mais é mexido: versalete (Hᴀᴛᴇ Cʏᴄʟᴇ), trema, aspas curvas, texto glitch e runas ficam como estão.
- Texto que o JavaScript escreve depois (comentários, por exemplo) não aparece.

## Páginas-chave dos screenshots

Lista na constante `PAGINAS_CHAVE` do script: home, Histórias, obra Luz & Sangue, Ossos do Ofício 01, Pederneira 01, Luz & Sangue 02, lista de notícias, notícia comum, notícia colagem (HDVR), duas notícias com backdrop, Sobre, raiz e 404, nos idiomas em que existem. As páginas são cortadas em 9000 px de altura (o capítulo de Ossos é maior). Animações ficam desligadas, a tela de abertura é pulada, e as fontes do Google não carregam no sandbox: aparecem fontes de reserva.

## Como a T18 usa a foto

| Item | Comparação |
|---|---|
| URLs (`urls.json`) | **Igualdade exata** de conjunto (nada a mais, nada a menos). Redirects: mesmo destino. |
| IDs de comentário | **Igualdade exata** de conjunto e por página. |
| `title`, `lang`, `hreflang`, `canonical` | **Igualdade**. `description` e `og:*`: igualdade, ou diferença explicada. |
| Texto (`texto/`) | Diff tolerante a espaços (aplicar a mesma normalização ao HTML do Astro). Diferenças precisam de justificativa. |
| Feeds, estáticos | Mesmos itens e mesmos hashes. |
| Screenshots | Comparação visual lado a lado, nos dois tamanhos, usando o mesmo script de captura. |

## Observações do site atual (não corrigidas aqui)

- `/pt/works/all-in-a-nights-work/01/` não existe: Ossos do Ofício só tem versão em inglês. Por isso `/ossos.html` redireciona para `/pt/` e `/nights.html` para `/en/`, e não para o capítulo.
