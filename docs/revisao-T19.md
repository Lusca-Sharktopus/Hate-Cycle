# T19 — Revisão independente da migração (relatório)

Feita em 21/10/2026 sobre o commit `cbd2b65` (branch `migracao-astro`), por um agente que não participou da construção. Tudo foi refeito num **clone limpo** do repositório (no scratchpad da sessão, fora do projeto), com `pnpm install --frozen-lockfile`. Nenhum arquivo do projeto foi alterado além deste relatório. As chaves do Supabase não aparecem aqui. O Supabase real e os serviços do autor não foram acessados.

## Veredito: **pode virar**

**Nenhum impedimento.** Tudo o que o visitante encontra hoje em hatecycle.com (o site feito à mão da `main`) continua respondendo no site novo. Cada endereço tem uma destas três saídas:

- o mesmo arquivo, byte a byte;
- o conteúdo novo que o próprio autor escreveu;
- o redirecionamento que ele decidiu (`config.json → redirects` e B35).

O que some são 7 imagens que só as páginas antigas usavam e 9 arquivos `desktop.ini` do Windows (seção 5). Nenhuma página que continua no ar usa esses arquivos.

A virada continua dependendo das condições que a T20 já tinha. Na seção 2 há também quatro coisas para o autor conferir até sexta. Nenhuma delas é defeito do site novo.

---

## 1. Impedimentos

Nenhum.

## 2. Antes do merge de sábado (condições da T20 e conferências do autor, não são impedimentos da T19)

| # | O quê | Situação no commit revisado | Quem |
|---|---|---|---|
| C1 | **Workflow do GitHub Actions** (build no PR, deploy na `main`) | **Ainda não existe** (`.github/` não está no repositório). Sem ele, o PR não tem "build verde" e o merge não publicaria nada. É o escopo da T20. | T20 |
| C2 | Settings → Pages → Source = **GitHub Actions** e o domínio **hatecycle.com** continua preenchido em Settings → Pages | Não deu para conferir daqui. Com deploy por Actions, o GitHub **ignora** o arquivo `CNAME` do site gerado: quem manda é o campo de domínio da tela de Pages. | autor (sexta), T20 |
| C3 | Tag `site-antigo` (B15) | Não deu para conferir daqui. | autor |
| C4 | **O workflow de deploy não pode depender do `pnpm test`** | Conferido: uma notícia nova faz **54 testes falharem** até alguém refazer as referências com Python (ver R3). Se o deploy esperar os testes, a primeira notícia depois da virada não vai ao ar. | T20 |
| C5 | **Decisão do B27** registrada no BACKLOG ("decidir antes ou junto da T20") | Pendente. Aceitar o risco por agora também é uma decisão válida; ela só precisa ficar escrita (números na R6). | autor |
| C6 | **Supabase → Authentication → URL Configuration:** *Site URL* = `https://hatecycle.com` e *Redirect URLs* com `https://hatecycle.com/**` (`docs/comentarios-supabase.md`, passo 5) | Não deu para conferir daqui. Sem isso, a confirmação de cadastro, o "esqueci a senha" e o Google mandam o visitante para o endereço errado. Os comentários são novos para o visitante, então isso não é piora, mas é a primeira vez que eles vão ao ar de verdade. | autor |
| C7 | **Comentários antigos do Disqus** | O site no ar tem Disqus (`hatecycle-com`) em `firestriker.html`, `pederneira.html` e `night.html`. Depois da virada, esses endereços redirecionam para as páginas novas, que usam os comentários próprios, e **as conversas do Disqus deixam de aparecer**. A troca para comentários próprios ("sem Disqus") foi decisão do autor, registrada no LEIA-ME antigo. **Vale ele olhar no painel do Disqus se havia comentários** e, se quiser guardá-los, exportar por lá. Não dá para levá-los para o Supabase automaticamente. | autor |

## 3. Ressalvas (não bloqueiam; podem ficar para depois)

| # | Achado | Como reproduzir | Sugestão |
|---|---|---|---|
| R1 | **A ferramenta da T18 sai com código 1 no commit revisado.** O `tools/paridade_t18.py` acusa uma diferença: "páginas do Astro × baseline/urls.json: só no Astro `/estrada.html`, `/night.html`, `/produtos.html`, `/roadside.html`". São as 4 páginas do B35, acrescentadas no mesmo commit do relatório. A baseline as lista em `outros_de_static_relevantes`, e o `tests/paginas.test.ts` foi ajustado (linha 274), mas a ferramenta não foi. O site está certo. | `python3 tools/paridade_t18.py --gerar --pasta <fora do projeto>` | Na linha 194 do `paridade_t18.py`, tirar de `urls` as `.html` de `outros_de_static_relevantes` antes de comparar, como o teste faz. |
| R2 | **Números de documentação defasados pelo B35.** `docs/paridade-T18.md` diz 193 páginas, 268 arquivos de `static/` e 463/793 arquivos. No commit revisado são 197 HTML, 272 arquivos de `static/` e 467/797 arquivos. O `CLAUDE.md` diz "193 arquivos HTML" no `dist/`, e hoje são 197. A diferença são as 4 páginas do B35. | contar `find dist -name '*.html'` | Atualizar na T22 (ou numa linha de nota no relatório da T18). |
| R3 | **O `pnpm test` é uma "foto" do conteúdo.** Com uma notícia nova em `content/news/`, 54 de 6.620 testes falham (RSS, home, índice de links, contagens) até alguém rodar `tools/frontmatter_ref.py`, `markdown_ref.py`, `regras_ref.py` e `paginas_ref.py`, que exigem Python 3.12+ e o `build.py`. O `pnpm build` continua bom (188 páginas). Isso já está escrito no CLAUDE.md, mas pesa em três tarefas. | criar uma notícia num clone e rodar `pnpm test` | **T20:** não usar o `pnpm test` como condição do deploy (C4). **T21:** antes de pôr os testes no CI, separar o que é "regra" (sites inventados, que continuam valendo) do que é "foto do conteúdo de 20/10". **T22:** quando o `build.py` sair da branch principal, essas ferramentas param de funcionar, então os testes de foto precisam ser aposentados ou trocados. |
| R4 | **16 arquivos do site no ar somem** (lista na seção 5). São 9 `desktop.ini` do Windows e 7 imagens: 4 capas de obras fora do universo (B11, decidido), o fundo antigo das páginas de história e 2 arquivos que mudaram de nome com o mesmo conteúdo. Só um link direto de fora para essas imagens deixaria de funcionar. Nenhuma página que fica no ar as usa. | `git ls-tree -r origin/main` × `dist/` | Nada a fazer, a não ser que o autor saiba de alguém usando esses endereços. |
| R5 | **Diferenças de conteúdo em relação ao site no ar, todas vindas do conteúdo novo do autor.** Ver a lista abaixo. | ler `origin/main:index.html` | Só para o autor confirmar que está ciente. |
| R6 | **B27 em números.** 128 das 172 páginas com comentários carregam código de terceiros no mesmo endereço da sessão: Reddit em 76, X em 52, Instagram em 36 (algumas têm mais de um). Os vídeos do YouTube (24) e do TikTok (4) ficam em `iframe`, isolados, e não entram no B27. A página Apoio **não** carrega script do Ko-fi: tem só um link e uma imagem vinda de `storage.ko-fi.com`. Nenhum script vem de CDN. | `grep` de `<script src=` no `dist/` | Decisão do autor (C5). Enquanto ela não sai, uma atenuação simples para a conta de administrador é sair da conta depois de moderar. |
| R7 | **Acessibilidade herdada do gerador Python** (não é nova do Astro): o botão do Ko-fi na página Apoio tem branco sobre `#00bfa5`, contraste de ~2,3:1 (o mínimo é 4,5:1). As notícias com posts do X têm 5 links sem texto por página quando o script do X não carrega (o "↗ X" que aparece vem do CSS, e o leitor de tela não o lê). | axe-core 4.10.3, seção 7 | Depois da virada. |
| R8 | **Buscadores** (iguais ao Python e ao site no ar, que não tem nada disso): `hreflang` com endereço relativo (o Google pede endereço completo), nenhuma página com `canonical`, `og:image` só em obras e capítulos, nenhum `robots.txt` (B24). | ver o `<head>` de qualquer página | T21 ou depois. |
| R9 | **`/custom.css` responde 404 em todas as 185 páginas com layout** (B33, decidido para a T22). Não quebra nada, mas é um pedido a mais, que segura a primeira pintura de cada página até a resposta chegar. | `tools/links.py` | Decidir na T22, como já está no B33. |
| R10 | **Detalhes iguais nos dois geradores:** a raiz `/` lê `localStorage` sem proteção. Se o navegador bloquear o armazenamento, o `<meta refresh>` leva para `/en/` mesmo quem usa português. A raiz e as páginas de redirecionamento não têm `lang`. A 404 é `lang="en"`, com texto nos dois idiomas. Esc não fecha o menu de idioma (só clicar fora). | navegador | Depois da virada. |
| R11 | **Erros aparentes no texto do autor (mantidos, só apontados):** em *Firestriker* (EN), "perhaps I was rude in my assessment, **ut** this doesn't change tha-" (igual no site no ar). Na notícia "Dia 2…", o post incorporado do Reddit se chama "Day 1 of Drawing…": é outro post (ID diferente do Dia 1), mas foi o autor quem o intitulou assim no próprio Reddit. | ler a página | Autor decide. |
| R12 | O `tools/paridade_html.mjs` reconhece os scripts do site por pedaços do código. Um script novo que contivesse um desses pedaços passaria como "comportamento conhecido". Para uma ferramenta de paridade isso basta: a segurança dos scripts dos comentários tem testes próprios. | — | Nada; só registrado. |

**R5, as diferenças de conteúdo** (o que o visitante do site no ar vai notar):

- A home antiga (`index.html`, em inglês) virou a raiz, que escolhe o idioma pelo navegador. As âncoras `#sobre`, `#historias` e `#contato` não levam mais a lugar nenhum.
- As histórias fora do universo que o `PT.html` listava saíram do site (Goblin, Trilha do Caçador, Two Ways e os links para o xbato e as playlists). Decisão do B11.
- *Ossos do Ofício* (`night.html`, `nights.html`, `ossos.html`) volta para a home: a obra está em rascunho. Decisão do B16, do B35 e da T17b.
- Os comentários do Disqus dão lugar aos comentários próprios (C7).
- As redes sociais da home antiga eram as **pessoais** do autor: X @KingOfAllOceans, **Bluesky** luscasharktopus, Instagram @lusca_desenhos e o canal pessoal do YouTube. O rodapé novo mostra as **do projeto** (`config.json → socials`: Instagram, YouTube, TikTok e X do Hᴀᴛᴇ Cʏᴄʟᴇ), e o **Bluesky não aparece em lugar nenhum**. O e-mail de contato continua na página Sobre.

## 4. O que foi conferido e passou

| Verificação | Resultado |
|---|---|
| **1. Auditoria da T18:** `tools/paridade_t18.py` (6 sites gerados de novo) | Arquivos de `static/` iguais byte a byte (272) e iguais à `baseline/estaticos.json`. Os 330 arquivos que só o Astro publica caem todos nos grupos decididos. 11 arquivos iguais byte a byte (raiz, CNAME, feeds, 7 redirects). Metadados, texto e IDs: 193/193 = baseline, nos dois sites. 86 IDs em 172 páginas = `baseline/comentarios.json`. Prévia (198/194/173) e Extras (208/204/173) iguais Python × Astro. Única "diferença": R1. |
| `tools/paridade_html.mjs` | 197/197 páginas iguais depois das regras decididas (12 byte a byte), 0 falhas. `window.HC` igual em 172 páginas. Contagens por regra iguais às do relatório (185/172/6). |
| `tools/links.py` (publicado, prévia, Extras, Python) | 7.690 links internos no publicado, **0 quebrados** fora o `/custom.css` (B33); nenhuma âncora quebrada. Externos por domínio iguais ao relatório. O Python faz ainda 4.440 pedidos ao Google Fonts e 172 ao jsDelivr, que o Astro não faz. |
| `tools/comportamento_playwright.py` | Os 7 grupos ok e iguais nos dois sites: abertura, carrossel a 1100 e a 390, idioma e cabeçalho a 1100 e a 390, 404/site antigo/raiz, carta que vira. |
| Roteiros antigos | Seletor: 62 passos idênticos. Notícias: 124 + 122 passos idênticos. Comentários com Supabase falso: 10 roteiros, 117 passos idênticos, nenhuma injeção de HTML. Bloco de ordem: tudo certo (publicado e prévia). |
| Teste de mutação da ferramenta de paridade | 3 de 3 mudanças plantadas numa cópia do site foram apontadas: uma letra trocada no texto da Pederneira, um `<script>` a mais numa notícia e um `data-page` trocado. |
| Exceções de `tests/ajudantes/html.ts` | Estreitas: cada uma tira só o que a decisão diz. Têm testes próprios, inclusive negativos: `semBlocoDeOrdem` em `tests/ordem.test.ts` (uma `<div data-story-order>` ou uma seção sem o atributo não saem); `semScriptsAntigosDosComentarios` com "sobrou" conferido; os 5 atributos das imagens em `tests/imagens.test.ts` (o build nunca repete atributo do autor). |
| **2. Site no ar × site novo** | Os 135 arquivos da `origin/main`: 105 iguais byte a byte, 14 mudam (todos explicados) e 16 somem (R4). Detalhe na seção 5. Nomes com acento (25), espaço (53), `&` (2), apóstrofo (3) e maiúsculas (115) conferidos byte a byte (todos em NFC). |
| **3. Sorteio de 20 páginas** | 20 páginas × PT/EN × 1100/390 px = 80 capturas, olhadas uma a uma (seção 6): nenhuma com erro de JavaScript, imagem quebrada ou rolagem para o lado. Idioma, título, descrição, `hreflang` e `data-page` certos, e iguais à baseline. |
| Tipografia narrativa (*Ossos do Ofício*, prévia) | 56 trechos da cena 1: **0 diferenças de estilo calculado** Astro × Python. O sonho (42 trechos) está em **PT Serif, `rgb(17,16,18)` = `#111012`**, de "for a fraction of a moment…" (logo depois de "He closes his eyes") até antes de "Giuseppe opened his eyes.", que volta à Times New Roman. A PT Serif e a Road Rage carregam de verdade, servidas pelo próprio site. Capturas olhadas. |
| Rascunhos não vazam | Nenhum HTML ou XML do site publicado cita *Ossos do Ofício*, *Beira de Estrada*, *O Pêndulo* ou o Giuseppe. Não há pasta `/dev/`, `config.json`, `.md`, `.sql` nem arquivo oculto no `dist/`. |
| **4. Segurança dos comentários** | A chave aparece em 172 arquivos: exatamente as 172 páginas com caixa de comentários. Ela é um JWT de papel `anon`, e não aparece em nenhum `.js` nem `.css`. Nenhum `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` com dado do visitante (o único `innerHTML` do site é o desenho fixo da seta do carrossel). `el()` recusa `on*`, `href`, `src`, `srcdoc`, `style` e afins. `@supabase/supabase-js` 2.117.2 exato no `package.json` e no lockfile, empacotado num único `/_astro/CaixaDeComentarios…js`, sem CDN. `pnpm audit --prod`: nenhuma vulnerabilidade. Busca em **todos os commits** do repositório: um único JWT, o `anon` do `config.json`; nenhum `service_role`, `sb_secret_` ou chave privada (as menções a `service_role` são documentação e testes que proíbem). Scripts de terceiros: R6. |
| **5. Acessibilidade** | axe-core 4.10.3 (instalado no scratchpad) em 14 páginas-chave × PT/EN × 1100/390: **só 2 regras, com as mesmas contagens no Python** (R7). **Nenhum problema novo do Astro.** O site no ar hoje tem bem mais: imagens sem `alt` em todas as páginas, nenhuma com `<main>`, `iframe` sem título e `produtos.html` sem `lang` nem título. **Teclado:** "Pular para o conteúdo" → logo → menu → idioma (Enter abre; Tab chega ao outro idioma; Enter leva à mesma página no outro idioma). Seletor de Histórias: busca, tipo, ordem pela seta e inversão com Enter. Bloco "estou lendo em ordem": o `<select>` vira ativo e troca pela seta, e Tab chega aos dois lados. Foco visível (contorno de 3 px) em todos, e o mesmo resultado no Python. `lang`: 92 páginas `en` + 92 `pt-BR`, nenhuma fora do lugar. |
| **6. GitHub Pages** | `CNAME` (`hatecycle.com`, igual ao da `main`) e `404.html` na raiz. `/_astro/` com 81 arquivos (B34: sem problema com deploy por Actions). `site: "https://hatecycle.com"` sem `base`. Sitemap (184 endereços), feeds e `og:image` com `https://hatecycle.com/…`. **Build sem rede** (rede desligada com `unshare -n`): 186 páginas em 16 s, sem erro. `dist/`: **158 MB, 797 arquivos, o maior com 4,5 MB** (bem abaixo dos 100 MB por arquivo e de 1 GB por artefato). `.nvmrc` = 22. |
| **7. Testes** | `pnpm test`: 6.620 verdes em 15 arquivos (62 s). `pnpm check`: 0 erros, 0 avisos, 2 dicas. `pnpm build`: 186 páginas. **Num computador limpo:** clone novo + `pnpm install --frozen-lockfile`; `pnpm test` também passa **sem rede, sem Python** (todo `python`/`python3` trocado por um falso que registraria a chamada: nenhuma chamada) e com `HOME` vazio. Não depende de nenhum site do scratchpad: o próprio teste constrói o site numa pasta temporária. Ressalva: R3. |

## 5. O site no ar (`origin/main`, 135 arquivos) × o `dist/` novo

**Iguais byte a byte (105):** `CNAME`, `produtos.html` e as 67 imagens de `Produtos/` (B35: "mantida igual"), `logos/favicon.png`, as duas logos do Hᴀᴛᴇ Cʏᴄʟᴇ, as capas de HDVR, Pederneira/Firestriker, Luz & Sangue e O Pêndulo, as logos das obras, `other images/` (GIFs do Apollo e do Anfíbio, ícones, Giuseppe, carta, divisores) e `Backgrounds/paperbg.jpg`.

**Mudam (14):**

| Endereço | Hoje | No site novo | Decisão |
|---|---|---|---|
| `/` e `/index.html` | home antiga em inglês | raiz que escolhe `/pt/` ou `/en/` | T14 (`config.json → redirects`: `index.html → /`) |
| `/PT.html` | home antiga em português | → `/pt/` | `config.json` |
| `/firestriker.html`, `/pederneira.html` | o conto (com Disqus) | → capítulo `/en/` ou `/pt/works/firestriker/01/`, com o texto completo: ~97% das palavras iguais e o resto revisões do autor | `config.json` |
| `/light.html`, `/luz.html` | episódio 1 (vídeo `J2j6xoIz0LE`) | → `/en/` ou `/pt/works/light-and-blood/01/`, mesmo vídeo | `config.json` |
| `/nights.html`, `/ossos.html` | *Ossos do Ofício* | → `/en/` ou `/pt/` | B16 |
| `/night.html` | *Ossos* EN (com Disqus) | → `/en/` | B35 |
| `/estrada.html`, `/roadside.html` | páginas em branco | → `/pt/` ou `/en/` | B35 |
| `/style.css` | CSS do site antigo | CSS do gerador Python (nenhuma página nova o usa) | convivência (D8) |
| `covers/EN/Cover All in a Night's Work.png`, `covers/PT/Capa Ossos do Ofício.png` | capa antiga | capa nova do autor, mesmo endereço | conteúdo do autor |

Os endereços sem `.html` que o GitHub Pages aceita hoje (`/firestriker`, `/PT`…) continuam valendo, porque os arquivos `.html` continuam lá.

**Somem (16):**

- 9 `desktop.ini`: `Backgrounds/`, `Produtos/`, `covers/`, `covers/EN/`, `covers/PT/`, `logos/`, `logos/EN/`, `logos/PT/` e `other images/`. Arquivos do Windows, nenhuma página usa.
- `covers/PT/Capa Ascencao.png`, `Capa Ego.png`, `Capa Trilha.png` e `Capa Two Ways.png`: obras fora do universo, guardadas em `guardados/obras-fora-do-universo/capas/` (B11).
- `Backgrounds/background-new-texture-paper-shape-high-quality-have-copy-space-text_440279-941.avif`: o fundo das páginas antigas de história, que agora redirecionam.
- `covers/EN/Cover Roadside.jpg`: o mesmo arquivo agora se chama `Cover Roadside.png` (conteúdo idêntico).
- `other images/AIANW Scene 1 Divider.png`: o mesmo arquivo agora se chama `ossos-cena-1-final.png` (conteúdo idêntico).

## 6. As 20 páginas sorteadas

Sorteio com semente fixa, pelo menos uma de cada tipo pedido. Cada uma em PT e EN, a 1100 e a 390 px, com rolagem até o fim antes da captura (para as imagens preguiçosas carregarem). Fontes: as do próprio site (Lexend, Oswald, PT Serif, Road Rage e as Noto das runas carregaram). Posts incorporados e vídeos bloqueados (nada sai da máquina): aparecem como a caixa preta do vídeo ou o texto de reserva do post.

| # | Página | Tipo | Observação |
|---|---|---|---|
| 1 | `/pt/` | home | "Últimas atualizações", carrossel e "Ver todas as histórias"; EN traduzida |
| 2 | `/pt/works/` | Histórias | 3 cartões e controles, nos dois idiomas |
| 3 | `/pt/works/light-and-blood/` | obra | capa, botões e lista de episódios |
| 4 | `/pt/works/firestriker/01/` | capítulo de prosa | logo, texto justificado em Times, degradê final letra a letra, bloco de ordem com a arte de Luz & Sangue, comentários `works/firestriker/01` |
| 5 | `/pt/works/light-and-blood/01/` | capítulo de vídeo | vídeo, "próximo", bloco "estou assistindo", comentários `works/light-and-blood/01` |
| 6 | `/pt/news/2026-08-18-novo-episodio-luz-e-sangue/` | notícia comum | anterior/próximo com título cortado com "…" e "Todas as notícias" inteiro (T13b) |
| 7 | `/pt/news/2025-04-18-saiu-pederneira/` | notícia com fundo | ilustração no topo e no pé |
| 8 | `/pt/news/2024-06-13-primeiro-video-hdvr/` | colagem | figurinhas, papel amassado e Short vertical |
| 9 | `/pt/news/2024-04-25-non-canon-funny-exchange/` | post incorporado (X) | em PT o conteúdo é só o post; em EN há a transcrição (conteúdo do autor, igual no Python) |
| 10 | `/pt/about/` | Sobre | Projeto + autor com GIFs contornados, Emissários e Contato |
| 11 | `/pt/support/` | Apoio | Catarse (PT) e Patreon (EN), botão do Ko-fi e link provisório do YouTube (B30) |
| 12 | `/pt/esta-pagina-nao-existe/` | 404 | código 404, links de volta nos dois idiomas (no celular, B32) |
| 13 | `/pt/news/` | lista de notícias | busca e paginação 1 2 3 … 9 |
| 14 | `/pt/works/light-and-blood/02/` | capítulo de vídeo | "anterior" e bloco de ordem |
| 15 | `/pt/news/2026-06-06-bem-vindos-luz-e-sangue/` | notícia com fundo | versalete em "Sᴇɴʜᴏʀ"/"Lᴏʀᴅ" |
| 16 | `/pt/news/2025-10-17-a-bit-slow/` | notícia com vídeo | Short vertical |
| 17 | `/pt/news/2025-12-11-dia-11-especulacao-evolutiva/` | post incorporado (Reddit) | texto longo com grego (Ἀλφειός, σάρξ) intacto |
| 18 | `/pt/news/2025-12-09-dia-9-especulacao-evolutiva/` | post incorporado (Reddit) | transcrição fonética (IPA) e grego intactos |
| 19 | `/pt/news/2024-06-21-genius-genius-dumb/` | posts alternados (Instagram/X) | os dois botões de troca |
| 20 | `/pt/news/2025-12-02-dia-2-especulacao-evolutiva/` | post incorporado (Reddit) | R11 |

Em todas: `<html lang>` certo (`pt-BR`/`en`), título e descrição = baseline, 2 `hreflang` (`en` e `pt`) para a mesma página no outro idioma, nenhum `canonical` (como no Python e no site no ar, R8), e `data-page` igual nos dois idiomas (`news/<pasta>` e `works/<obra>/<nn>`).

## 7. Acessibilidade em números (axe-core 4.10.3)

| Regra | Astro | Python | Site no ar (8 páginas) |
|---|---|---|---|
| `color-contrast` (botão do Ko-fi, Apoio) | 4 | 4 | — |
| `link-name` (posts do X sem o script do X) | 20 (5 por captura × 4 capturas) | 20 | 4 por home (ícones sem texto) |
| `image-alt` | 0 | 0 | em todas (até 48 em `produtos.html`) |
| `landmark-one-main`, `region`, `page-has-heading-one` | 0 | 0 | em todas |
| `frame-title` | 0 | 0 | `light.html`, `luz.html` |
| `html-has-lang`, `document-title` | 0 | 0 | `produtos.html` (mantida igual por decisão do autor) |

Classificação: **nenhum problema novo do Astro**. Os dois que existem vêm do gerador Python (paridade) e não existiam no site no ar porque lá não há página Apoio nem notícias. O site novo melhora muito em relação ao que está no ar.

## 8. O que não pôde ser conferido, e por quê

- **GitHub:** estado do PR #1, existência e resultado de um workflow (não há workflow no commit), configuração do Pages, domínio e tag `site-antigo`. São serviços do autor, e a regra desta revisão era não acessá-los.
- **Supabase real:** configuração de URLs do Auth (C6), login com Google (B2), RLS no projeto de verdade, e se o projeto tem contas ou comentários. Regra da revisão. A lógica do navegador foi conferida com o Supabase falso.
- **Disqus:** se há comentários antigos (C7).
- **Posts incorporados de verdade** (Reddit, X, Instagram, TikTok, YouTube): o sandbox bloqueia a internet. Por isso não deu para ver a largura real dos posts no celular (B22, a rolagem lateral) nem o texto que eles mostram.
- **Navegadores e aparelhos reais** (Safari no iPhone, Android, Windows/macOS do autor) e Lighthouse: só o Chromium do Playwright. A barra de comentários no celular com Lexend (B23) só o autor confirma.
- **O site Python com as fontes do Google:** o sandbox não alcança o Google Fonts. Isso já não importa para a virada, porque o Astro serve as próprias fontes e elas foram vistas.
- **`tools/visual_playwright.py`** (46 pares, ~1 h 30): não rodado de novo. No lugar, as 80 capturas próprias da seção 6 e a comparação de estilo calculado da cena de Ossos.

## 9. Como refazer

Na raiz de um clone limpo (fora do projeto), com `pnpm install --frozen-lockfile`:

```bash
D=/tmp/t19                                   # qualquer pasta fora do projeto
unshare -n pnpm build                        # build sem rede (Linux; precisa de root)
python3 tools/paridade_t18.py --gerar --pasta $D/sites --json $D/paridade.json   # sai com 1 por causa da R1
node tools/paridade_html.mjs --python $D/sites/py-publicado --astro $D/sites/astro-publicado
python3 tools/links.py $D/sites/astro-publicado
timeout 1500 python3 tools/comportamento_playwright.py --python $D/sites/py-publicado --astro $D/sites/astro-publicado \
    --previa-python $D/sites/py-previa --previa-astro $D/sites/astro-previa
pnpm test && pnpm check
git ls-tree -r -z --name-only origin/main    # e comparar cada arquivo com dist/ (seção 5)
```

Os roteiros próprios desta revisão (comparação `origin/main` × `dist/`, sorteio e capturas, estilo calculado de Ossos, axe-core, teclado, teste de mutação, teste sem Python) ficaram no scratchpad da sessão, que é temporário. Eles não entram no projeto. O que eles fazem está descrito nas seções acima, e qualquer um deles pode virar ferramenta de `tools/` na T21, se for útil.
