# T18 — Paridade do site Astro com o site atual (relatório)

Feito em 20/10/2026, sobre o commit `936eb48` (branch `migracao-astro`). Para o autor e para a revisão independente (T19).

## 1. Resumo (uma página)

**Veredito: o site Astro reproduz o site atual. Nenhuma diferença ficou sem explicação.** Todas as diferenças que sobraram vêm de decisões já tomadas e documentadas (T06, T07, T14, T15, T17, T17c) ou de defeitos que já existem hoje no site Python e que o Astro repete de propósito.

O que foi comparado, sempre **site gerado × site gerado** (Python com `BASE = ""` × `pnpm build`), em três pares: publicado, prévia com rascunhos e prévia com rascunhos e Extras (`show_extras`).

| O quê | Resultado |
|---|---|
| Lista de páginas | 193 = 193 = `baseline/urls.json` (prévia: 194 = 194; com Extras: 204 = 204). Fora delas, o Astro tem só a pasta `/dev/` da prévia, que nunca vai para o publicado. |
| Arquivos de `static/` | Os 268 (todos, menos o `custom.css` do autor) estão nos dois sites, **iguais byte a byte** ao `static/` e aos hashes de `baseline/estaticos.json`. |
| Arquivos que só o Astro publica | 330, todos explicados: 241 versões leves WebP, 76 fontes, 5 pacotes de CSS/JS, 4 silhuetas, 2 ícones, 1 fundo da abertura em JPEG, o `sitemap.xml`. |
| Byte a byte | Raiz `/`, `CNAME`, os dois `feed.xml` e as 7 páginas do site antigo (`/PT.html`…): 11 arquivos idênticos. |
| HTML inteiro de cada página (`<head>`, `<body>`, cabeçalho, rodapé, scripts) | 193 de 193 iguais depois de tiradas as diferenças decididas (8 já idênticas byte a byte). Prévia: 194/194; com Extras: 204/204. |
| Título, descrição, idioma, canonical, hreflang, `og:*`, RSS, redirecionamento, **texto visível** | 193 de 193 iguais à baseline, nos dois sites. |
| IDs das conversas de comentários | 86 IDs em 172 páginas, **mesma lista, página por página**, que `baseline/comentarios.json`. Nenhum ID tem o idioma dentro. Prévia: 87 em 173, iguais no Python e no Astro. |
| Links internos | Nenhum quebrado no publicado, na prévia e com Extras, a não ser `/custom.css`, que falta igual nos dois sites porque o arquivo do autor não está no repositório (achado A3). 7.633 links internos conferidos no publicado. |
| Comportamento no navegador | Seletor de Histórias (62 passos), Notícias (124 + 122 passos), comentários (117 passos com Supabase falso), bloco de ordem e um roteiro novo (abertura, carrossel, carta, idioma, menu no celular, 404, redirects, raiz): **iguais nos dois sites**. |
| Visual | 23 páginas-chave × 1100 e 390 px, com as mesmas fontes de reserva dos dois lados. A posição de **todos** os elementos ficou igual (diferença máxima de 0,8 px), com uma exceção já decidida: a barra de comentários mais alta no celular em português (B23, +22/23 px). |

Testes: `pnpm test` com 6.620 verdes e `pnpm check` com 0 erros e 0 avisos. Nenhuma mudança no código do site (`src/`), no `build.py`, no `config.json`, no `static/custom.css` nem em `baseline/`.

## 2. Diferenças por grupo (causa, decisão, onde está provada)

Cada regra abaixo é aplicada pela ferramenta `tools/paridade_html.mjs`, uma de cada vez. A ferramenta conta em quantas páginas cada regra agiu e só tira exatamente o que a decisão diz. O que sobra aparece como diferença, e não sobrou nada.

| # | Diferença (o que muda no arquivo) | Páginas (publicado) | Causa / decisão | Onde está provada |
|---|---|---|---|---|
| G1 | **Fontes.** O Python pede ao Google Fonts (2 `preconnect` + 1 `<link>` do texto + até 20 das runas). O Astro serve as fontes do próprio site (76 `.woff2` em `/_astro/`) e só pré-carrega 2 delas. | 185 | T17, lição 11 | `tests/imagens.test.ts` (fontes), `tests/ajudantes/html.ts`; aqui: os 2 pré-carregamentos de cada página apontam para arquivos que existem |
| G2 | **Ícone.** 1 `<link rel="icon">` no Python; 2 no Astro (32 e 192 px, versões leves do mesmo desenho). | 185 | T17 | `tests/ajudantes/html.ts`; aqui: os dois arquivos existem |
| G3 | **Imagens com versões leves.** O `src` de toda `<img>` é o mesmo; o Astro acrescenta `srcset`, `sizes`, `width`, `height` e `decoding`. São 241 arquivos `.webp`, todos de imagens que existem em `static/`. | 185 | T17 | `tests/imagens.test.ts`; `tools/layout_playwright.py` (T17); aqui: nenhuma versão leve "órfã" |
| G4 | **Fundo da tela de abertura.** `/intro/fundo.png` (287 KB) × `/intro/fundo_<hash>.jpeg` (12 KB). | 185 | T17 | aqui: o arquivo existe; na abertura (seção 4) o fundo aparece |
| G5 | **CSS.** `/style.css?v=` no Python; `/_astro/*.css` e `<style>` por componente no Astro, em `@layer site`. O `/custom.css` do autor continua sendo o **último** CSS de toda página, nos dois sites. | 185 | T05/T06 (D9, `@layer site`), lições 02 e 07 | visual (seção 5) e `tools/layout_playwright.py`; aqui: `/custom.css` presente e por último em todas as páginas |
| G6 | **Marca de escopo do CSS.** O Astro põe atributos `data-astro-cid-*` nos elementos de componentes com estilo próprio. | 185 | T06 (lição 07) | `tests/ajudantes/html.ts` |
| G7 | **Scripts do site.** O Python carrega o `site.js` (um arquivo para tudo, em toda página) e 3 scripts escritos no HTML (abertura, vídeo da abertura, fechar o menu de idioma). O Astro tem um script por componente, só nas páginas que precisam dele. A ferramenta reconhece cada script pelo que ele faz e confere, página por página, que **todo bloco do `site.js` que agiria naquela página tem o seu script no Astro**, e que o Astro não tem script a mais. | 185 | T07 (abertura reescrita), T11 (blocos 1, 2 e 5), T12 (bloco 4), T13 (blocos 6 e 7), T14 (bloco 3 não portado: não age em página nenhuma) | tabela abaixo; roteiros de navegador da seção 4 |
| G8 | **Comentários.** O Python carrega o supabase-js do jsDelivr (versão "2", sem fixar) e o `/comments.js`. O Astro usa um script empacotado com o `@supabase/supabase-js` 2.117.2. O `window.HC` (endereço e chave pública) é **igual** nos dois, nas 172 páginas. | 172 | T15, lição 10 | `tests/paginas.test.ts` (bloco T15), `tools/comentarios_playwright.py` |
| G9 | **Bloco "estou lendo/assistindo em ordem…"** no fim de cada capítulo, só no Astro, com 2 links externos a mais para o YouTube (o "Alô?" na ordem de lançamento da Pederneira). | 6 (prévia: 7) | T17c | `tests/ordem.test.ts`, grupo T17c de `paginas.test.ts`, `tools/ordem_playwright.py` |
| G10 | **Posts do X, do Reddit e do Instagram só com clique (T17g, B27).** O Python põe o `<script src>` do serviço dentro de cada `.embed`; o Astro não tem nenhum script de terceiros e põe, no fim do mesmo `.embed`, o quadro `div.embed-gate` (aviso, botão, link do post original) e o atributo `data-embed-servico`. O `blockquote` do autor é idêntico nos dois. | 144 (184 quadros) | T17g, lição 08 | `tests/embeds.test.ts` (as duas exceções, e o teste de que elas não escondem mais nada), `tools/embeds_playwright.py` |
| G10 | **Sitemap** (`/sitemap.xml`), só no Astro. | 1 arquivo | T14 (ARQUITETURA D1, atualização de 16/10) | `tests/paginas.test.ts` (sitemap) |
| G11 | **Formas diferentes de escrever o mesmo HTML.** Por exemplo, `<body class>` no Astro × `<body class="">` no Python, ou espaços e quebras de linha entre tags. O navegador lê os dois do mesmo jeito. | — | `compressHTML: false` (D1, T05); régua de `tests/ajudantes/html.ts` | a comparação estrutural (parse5) já ignora isso |
| G12 | **Visual:** imagens WebP × PNG originais (diferença pequena e espalhada nas bordas dos desenhos); textos e ícones deslocados até 0,8 px, porque o navegador arredonda a altura das imagens de um jeito no Python e de outro no Astro, que agora traz `width`/`height` (T17). | todas | T17 (no T17 a diferença medida foi de até 0,4 px; aqui, 0,8 px numa logo de título) | seção 5 |
| G13 | **Visual, só no celular e só em português:** a barra "Escreva um comentário…" mostra o texto inteiro em duas linhas, e a caixa de comentários fica 22–23 px mais alta. | 5 das 23 páginas-chave a 390 px | **B23**, corrigido só no Astro (T15) | seção 5 (todos os 23 elementos que se movem estão na caixa de comentários ou abaixo dela) |
| G14 | **Arquivos de `static/` que o Astro publica mas não usa mais:** `style.css`, `site.js`, `comments.js`, `logos/favicon.png`, `intro/fundo.png`. No sentido inverso, o Python publica as artes de `static/ordem/` sem usá-las. | — | Convivência dos dois geradores (D8); a limpeza fica para depois da virada (T20: `comments.js`; T22: reorganizar `static/`) | `tools/links.py` (lista "arquivos que nenhum link alcança") |

**Scripts por grupo de páginas (publicado).** Os mesmos comportamentos estão nos dois sites. A seção 4 mostra os roteiros de navegador que confirmam que eles funcionam igual.

| Páginas | Comportamentos (iguais nos dois) | Só no Astro (decidido) |
|---|---|---|
| todas as 185 com layout | abertura (classe, vídeo, fechar), menu de idioma fecha ao clicar fora | — |
| home (2) | + carrossel, capa ausente | — |
| Histórias (2) | + seletor de Histórias, capa ausente | — |
| Sobre (2) | + foto de emissário ausente | — |
| lista de notícias (2) | + busca e páginas | — |
| notícias (142 + 24 com posts alternados) | (+ posts alternados nas 24) | comentários (T15) |
| capítulos (6) | — | comentários (T15), bloco de ordem (T17c) |
| prévia: Ossos do Ofício 01 | + carta que vira | comentários, bloco de ordem |

## 3. Achados corrigidos

Nenhum erro de porte foi achado no Astro: o código do site (`src/`) não precisou mudar. As correções foram de documentação, mais as ferramentas novas.

| Achado | Correção |
|---|---|
| A lição 07, a lição 09 (e o resultado da T14 no BACKLOG) diziam que "nenhuma página tem a classe `.page-project`". **Não é bem assim:** a página Histórias tem `.page-project .prose`. O bloco 3 do `site.js` continua sem fazer nada porque ali não há GIFs (`.apollo-gif`/`.anfibio-gif`), então a conclusão (não precisava portar) continua certa. O comentário em `src/components/PaginaAvulsa.astro` já estava certo. | Texto corrigido em `docs/aprendendo-astro/07-paginas.md` e `09-endpoints.md`. A ferramenta `tools/paridade_html.mjs` confere, página por página, que o bloco 3 não age em nenhuma. |
| `docs/baseline.md` falava em 87 IDs e 266 arquivos de `static/`. Hoje são 86 IDs (desde que Ossos do Ofício virou rascunho, T17b) e 268 arquivos. A baseline em si estava certa (foi refeita na T17b/T17c). | Números atualizados em `docs/baseline.md`. `baseline/` não mudou. |
| `tools/comentarios_playwright.py` marca as capturas lado a lado como "DIFERENTES" também a 1100 px. Na T15 elas eram idênticas; desde a T17 o Astro carrega as fontes de verdade e o Python não. **Não é diferença do site.** | Só registrado aqui. A comparação com as mesmas fontes dos dois lados está em `tools/visual_playwright.py`. |

Ferramentas novas, reutilizáveis (instruções no topo de cada uma):

- `tools/paridade_t18.py`: gera os 6 sites numa pasta fora do projeto e compara tudo (arquivos, byte a byte, HTML inteiro, régua da baseline, IDs).
- `tools/paridade_html.mjs`: o HTML inteiro de cada página, com as regras G1–G10 contadas e a tabela de scripts.
- `tools/links.py`: verificador de links internos (`href`, `src`, `srcset`, `url()` de CSS, scripts, sitemap e feeds; `%20`, `%26` e acentos decodificados como o servidor faz; âncoras `#id`).
- `tools/comportamento_playwright.py`: abertura, carrossel, carta, idioma, menu no celular, 404, redirects e raiz, Astro × Python.
- `tools/visual_playwright.py`: capturas com as mesmas fontes, diferença pixel a pixel, posição de cada elemento e uma captura com as fontes reais.

Testes de mutação das ferramentas, feitos à mão: um texto trocado no rodapé, um `<script>` a mais e o script do carrossel retirado foram os três apontados. Um link quebrado, uma âncora inexistente, uma imagem que falta no `srcset`, um `url()` relativo de CSS e um arquivo com `&`, espaço e `Ç` no nome também foram apontados.

## 4. Comportamento no navegador (Chromium do Playwright, só `localhost`)

| Roteiro | Resultado |
|---|---|
| `tools/seletor_playwright.py` | 62 passos em 2 páginas: ordem e visibilidade idênticas |
| `tools/noticias_playwright.py` | lista: 124 passos; posts alternados: 122 passos em 24 notícias; idênticos |
| `tools/comentarios_playwright.py` | 10 roteiros, 117 passos: a caixa, os pedidos ao Supabase e as confirmações idênticos; nenhuma injeção de HTML rodou |
| `tools/ordem_playwright.py` (publicado + prévia) | tudo certo, incluindo teclado, sem JavaScript, `localStorage` com erro, "reduzir movimento" e 390 px sem rolagem lateral |
| `tools/comportamento_playwright.py` (novo) | **abertura:** a classe entra, o vídeo `/intro/logo.webm` é criado, a tela some sozinha e guarda `hc-intro`; não volta na 2ª página; `?intro` a traz de volta; "reduzir movimento" a desliga. **Carrossel** a 1100 e 390 px: setas, passos, teclado e o link "ver todas" no fim (1100). **Carta que vira** (prévia): clique, Enter e espaço. **Idioma** em 10 páginas e 2 larguras: o menu abre, leva à mesma página no outro idioma e fecha ao clicar fora. **Celular:** todos os itens do menu visíveis, sem rolagem lateral. **404** (código 404, com os links de volta) para 3 endereços inexistentes. **Site antigo:** os 9 endereços de `config.json → redirects` terminam no mesmo lugar. **Raiz `/`:** pt-BR → `/pt/`, en-US → `/en/`, fr-FR → `/en/`, e `localStorage lang=en` vence. Tudo igual nos dois sites. |

Dois defeitos apareceram **igualzinho nos dois sites**, ou seja, já existem no site de hoje (achados para o autor B31 e B32, seção 6).

## 5. Visual

**Como foi feito:**

- `tools/visual_playwright.py` fotografou 23 páginas-chave a 1100 e 390 px: home, Histórias, Luz & Sangue, Pederneira 01, Luz & Sangue 02, Notícias, notícia comum, colagem e com fundo (cada uma nos dois idiomas), Sobre, Apoio e 404.
- No Astro, os arquivos `.woff2` foram bloqueados. Assim os dois sites caem nas mesmas fontes de reserva, já que o Python não alcança o Google Fonts no sandbox.
- O bloco de ordem foi escondido (`display: none`).
- As páginas foram fotografadas inteiras, até 22.000 px.
- A caixa de comentários recebeu a mesma lista vazia de um Supabase falso nos dois sites.

**Resultado:**

- **Posição de todos os elementos** (58 a 1.107 por página): diferença máxima de 0,25 px em 44 das 46 capturas; 0,8 px na logo de título da Pederneira PT a 1100 px (G12).
- **As 5 páginas em português com comentários, a 390 px:** a caixa de comentários fica 22–23 px mais alta (B23, G13). Os 23 elementos que se movem estão todos na caixa de comentários ou abaixo dela (a barra, o botão, o aviso e o rodapé).
- **Pixels:** de 0,04% a 1,6% dos pixels diferem, só nas imagens (WebP) e em contornos de texto deslocados menos de 1 px. Olhei os mapas de diferença e as capturas lado a lado da home, de Histórias, da colagem, da Sobre e do fim da Pederneira: não há imagem faltando nem nada fora do lugar. Na Sobre, o GIF animado do Apollo aparece num quadro diferente da animação (o GIF continua animando nas duas capturas).
- **Com as fontes reais** (Lexend, Oswald, as Noto das runas), o Astro aparece como o autor vai ver. As capturas `*-astro-fontes.png` estão na pasta indicada na seção 8. Olhei a home a 1100 px e Luz & Sangue 02 a 390 px. Elas mostram as fontes que o site serve (as mesmas famílias do Google). PT Serif, Road Rage e Vollkorn SC não aparecem nessas páginas: só em Ossos do Ofício (rascunho) e nas fichas de feitiço.

**O que não deu para ver aqui:** o site Python com as fontes do Google (o sandbox não alcança o Google Fonts). Como os nomes de família são os mesmos, o autor deve ver no navegador dele o mesmo desenho de letra nos dois sites.

## 6. Achados para o autor

| ID | Achado | O que o visitante vê | Sugestão |
|---|---|---|---|
| **B31** | **Carrossel da home no celular:** a 390 px, o encaixe dos cartões (`scroll-snap`) para o último cartão ~47 px antes do fim da rolagem. A seta da direita nunca vira o botão "Ver todas as histórias" e, no fim, fica parada sem fazer nada. Acontece hoje no site Python e igual no Astro. No computador (1100 px) a seta já nasce como "Ver todas" e funciona. | Quem está no celular e chega ao último cartão aperta a seta e nada acontece. | Corrigir depois da virada (no Astro: considerar "no fim" quando faltar menos que um passo, ou quando o último cartão estiver todo visível). Corrigir antes também é possível, só no script do carrossel (não muda o HTML). Decisão do autor. |
| **B32** | **404 no celular:** o menu tem só 2 itens e o seletor de idioma fica na ponta direita. Aberto, o menu ("Português") passa ~75 px da borda da tela e aparece cortado. Igual nos dois sites. | Na página de erro, no celular, a opção de idioma aparece pela metade. | Ajuste de CSS depois da virada (alinhar o `.dd-menu` pela direita quando o seletor estiver na ponta). |
| **B33** | **`custom.css` e o deploy automático (importante para a T20):** o `static/custom.css` está no `.gitignore`. Com o deploy pelo GitHub Actions (T20), o arquivo **não vai existir no site publicado**. Toda página continua pedindo `/custom.css` (hoje é o único link interno quebrado: falta igual nos dois sites, porque o arquivo também não está aqui) e os ajustes pessoais do autor **não vão aparecer** em hatecycle.com. Não quebra nada visível além disso. | Nada quebra, mas o que o autor ajustou no `custom.css` (por exemplo, `--logo-w`) não vale no site novo. | Antes da virada, o autor escolhe: (a) versionar o `custom.css` (tirar do `.gitignore`; ele passa a ir para o GitHub), (b) passar os ajustes para o CSS do site, ou (c) aceitar sem ele. **Pergunta para o autor: o `custom.css` dele hoje tem algum ajuste que precisa estar no ar?** |
| B34 (para a T20, não para o autor) | O Astro põe os pacotes numa pasta `/_astro/`. Com o GitHub Pages em "Deploy from a branch" (Jekyll), pastas que começam com `_` **não são publicadas**. Com "GitHub Actions", que é o combinado da T20, isso não acontece. | — | Manter "Source = GitHub Actions" (já está no roteiro da T20). Se algum dia voltar para "branch", pôr um `.nojekyll`. |
| B1 (atualização) | O Astro não usa o `base_url` do `config.json` (o site fica na raiz, `site: "https://hatecycle.com"`). No site novo, o `og:image` e os links do RSS já saem certos (`https://hatecycle.com/...`), iguais ao Python com `BASE = ""`. | — | Trocar o `base_url` só importa se o autor voltar a publicar pelo Python. |
| — | Arquivos que nenhuma página usa, nos dois sites: `Backgrounds/paperbg.jpg`, a pasta `Produtos/` (B13), as capas e logos das obras em rascunho (aparecem na prévia), `ossos-memoria-vito.png` e `feliz-natal-di-vario-ilustracao.jpg` (B7). | — | Só informativo (lista completa: `tools/links.py`). |

## 7. Números

- **Arquivos (publicado):** Python 463, Astro 793 = 268 de `static/` (iguais) + 193 HTML + 2 feeds + 330 só do Astro (241 WebP, 76 fontes, 5 CSS/JS, 4 silhuetas, 2 ícones, 1 JPEG, 1 sitemap). Prévia: 464 × 841. Com Extras: 474 × 851.
- **Páginas:** 193 (publicado), 194 (prévia), 204 (com Extras), as mesmas nos dois geradores. O `build.py` informa 193 e o Astro "186 page(s) built" (+ os 7 redirects = 193 HTML).
- **HTML inteiro:** 193/193, 194/194 e 204/204 iguais depois das regras G1–G10.
- **Régua da baseline:** metadados e texto 193/193 = baseline nos dois sites; IDs 86 em 172 páginas = baseline.
- **Links:** publicado: 9.025 referências, 7.633 internas, **0 quebradas** (fora `/custom.css`, B33), 1.390 externas (x.com 310, instagram.com 269, youtube.com 236, reddit.com 228, tiktok.com 193, embed.reddit.com 76, platform.x.com 72, ko-fi.com 2, storage.ko-fi.com 2, patreon.com 1, catarse.com.br 1). Prévia: 7.807 internas, 0 quebradas; com Extras: 8.507, 0 quebradas; com a pasta `/dev/`: 8.594, 0 quebradas. O Python, para comparar: 5.572 internas, 0 quebradas (fora `/custom.css`), e mais 4.440 pedidos ao `fonts.googleapis.com`, 185 ao `fonts.gstatic.com` e 172 ao `cdn.jsdelivr.net`, que o Astro não faz.
- **Comportamentos:** 62 + 246 + 117 passos nos roteiros que já existiam; o roteiro de ordem passou inteiro; 7 grupos no roteiro novo (abertura, carrossel ×2, idioma e menu ×2, 404/site antigo/raiz, carta).
- **Capturas:** 46 pares comparados (23 páginas × 2 larguras), mais 46 com as fontes reais e 46 mapas de diferença; 46 comparações de layout.
- **Testes:** `pnpm test` com 6.620 testes verdes (15 arquivos); `pnpm check` com 0 erros, 0 avisos e 2 dicas.

## 8. Como refazer tudo

Na raiz do repositório, com `pnpm install` feito e o Chromium do Playwright disponível. As pastas temporárias ficam **fora** do projeto.

```bash
D=/tmp/t18                                                     # qualquer pasta fora do projeto
python3 tools/paridade_t18.py --gerar --pasta $D/sites --json $D/paridade.json   # 6 sites + arquivos, byte a byte, HTML, baseline, IDs (~1 min)
node tools/paridade_html.mjs --python $D/sites/py-publicado --astro $D/sites/astro-publicado   # detalhe do HTML e dos scripts
python3 tools/links.py $D/sites/astro-publicado                # (e astro-previa, astro-extras, --com-dev)
timeout 1500 python3 tools/comportamento_playwright.py --python $D/sites/py-publicado --astro $D/sites/astro-publicado \
    --previa-python $D/sites/py-previa --previa-astro $D/sites/astro-previa
timeout 5400 python3 tools/visual_playwright.py --python $D/sites/py-publicado --astro $D/sites/astro-publicado --saida $D/visual
timeout 3000 python3 tools/visual_playwright.py --python $D/sites/py-publicado --astro $D/sites/astro-publicado --saida $D/layout --so-layout
# os roteiros que já existiam (servidores sob timeout; nunca pkill):
timeout 3600 python3 -m http.server 8791 -b 127.0.0.1 -d $D/sites/py-publicado &
timeout 3600 python3 -m http.server 8792 -b 127.0.0.1 -d $D/sites/astro-publicado &
timeout 3600 python3 -m http.server 8794 -b 127.0.0.1 -d $D/sites/astro-previa &
python3 tools/seletor_playwright.py --python 8791 --astro 8792
python3 tools/noticias_playwright.py --python 8791 --astro 8792
python3 tools/comentarios_playwright.py --python 8791 --astro 8792 --fotos $D/fotos-comentarios
python3 tools/ordem_playwright.py --astro 8792 --previa 8794
pnpm check && pnpm test
```

Cuidado (visto nesta tarefa): se um servidor de uma sessão anterior ainda estiver escutando a mesma porta em `[::]`, os roteiros que usam `localhost` falam com ele em vez do novo. Use portas livres ou espere o `timeout` do antigo acabar.

Nesta tarefa, as capturas ficaram em `/tmp/claude-0/-home-claude/32446c6c-a20f-5060-b78d-76689a1a40e6/scratchpad/t18/visual/` (fora do git, temporárias).
