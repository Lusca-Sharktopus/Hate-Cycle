# Guia do autor — como usar o site Hᴀᴛᴇ Cʏᴄʟᴇ

Você escreve em arquivos de texto (Markdown) e roda **um comando**; o `build.py` gera o site inteiro
(inglês + português, listagens, "Últimas atualizações", botões de próximo/anterior, RSS) na pasta `public/`.
Precisa só do Python (nada para instalar além dele).

> **Versão do Python:** o antigo LEIA-ME dizia "Python 3.8+", mas o gerador de hoje só funciona a partir do **Python 3.12** (conferido). Se o comando der erro de sintaxe, atualize o Python.

> **Migração:** o site está sendo migrado para Astro (ver `docs/ARQUITETURA.md` e `docs/BACKLOG.md`). Até a virada, tudo neste guia continua valendo. O jeito de escrever (pastas, `en.md`/`pt.md`, campos no topo dos arquivos) não muda.

## Sumário

1. [Primeira vez](#1-primeira-vez)
2. [Tarefas do dia a dia](#2-tarefas-do-dia-a-dia)
3. [Escrevendo (Markdown)](#3-escrevendo-markdown)
4. [Histórias e capítulos](#4-histórias-e-capítulos)
5. [Mostrar, esconder e lançar](#5-mostrar-esconder-e-lançar)
6. [Página Histórias e carrosséis](#6-página-histórias-e-carrosséis)
7. [Home](#7-home)
8. [Páginas Histórias e Sobre](#8-páginas-histórias-e-sobre)
9. [Emissários](#9-emissários)
10. [Notícias](#10-notícias)
11. [Posts incorporados (Instagram, X, TikTok, YouTube, Reddit)](#11-posts-incorporados)
12. [Comentários](#12-comentários)
13. [Menu e Extras](#13-menu-e-extras)
14. [Aparência: cores, fontes e seus ajustes](#14-aparência-cores-fontes-e-seus-ajustes)
15. [Imagens](#15-imagens)
16. [Tela de abertura](#16-tela-de-abertura)
17. [Runas no fundo](#17-runas-no-fundo)
18. [Barra lateral de botões (desligada)](#18-barra-lateral-de-botões-desligada)
19. [Regra de nomes: Hᴀᴛᴇ Cʏᴄʟᴇ × Hate Cycle](#19-regra-de-nomes-hᴀᴛᴇ-cʏᴄʟᴇ--hate-cycle)
20. [Ortografia, versalete e transcrições fonéticas](#20-ortografia-versalete-e-transcrições-fonéticas)
21. [Site antigo e endereços](#21-site-antigo-e-endereços)

---

## 1. Primeira vez

1. Copie suas pastas de imagens (`logos`, `covers`, `other images`, `Backgrounds`, `Produtos`) para dentro de **`static/`**.
   Tudo que está em `static/` vai para o site como está. (Isso já foi feito: ver [Imagens](#15-imagens).)
2. `python build.py serve` → abre a prévia em http://localhost:8000 (**mostra os rascunhos**).
3. `python build.py` → gera o site final em `public/` (sem rascunhos). Suba o conteúdo de `public/` para a hospedagem.
4. Em `config.json`: preencha `site_url` (ex.: `"https://hatecycle.com"`) para ativar o RSS. Se o site ficar
   numa subpasta (ex.: GitHub Pages de projeto), preencha `base_url` (ex.: `"/meu-repo"`).
   - Atenção: hoje o seu `base_url` está como endereço completo, o que estraga os links do RSS. Ver item B1 em `docs/BACKLOG.md`.
5. Comentários: siga `docs/comentarios-supabase.md`.

## 2. Tarefas do dia a dia

Cada item tem uma pasta com `en.md` e `pt.md`. Só existe em um idioma? Apague o outro arquivo.

| Quero…                           | Comando                                   | Onde edito |
|----------------------------------|-------------------------------------------|------------|
| Publicar uma notícia             | `python build.py new news nome-do-post`   | `content/news/DATA-nome-do-post/` |
| Novo capítulo (HQ, texto, vídeo) | `python build.py new chapter firestriker` | `content/works/firestriker/02/`   |
| Cadastrar uma história nova      | `python build.py new work minha-historia` | `content/works/minha-historia/work.json` |
| Página de personagem             | `python build.py new character nome`      | `content/characters/nome/` |
| Página sobre o universo          | `python build.py new universe nome`       | `content/universe/nome/` |
| Página avulsa (ex.: sobre)       | `python build.py new page nome`           | `content/pages/nome/` |
| Adicionar um Emissário           | copie uma pasta de `content/emissaries/`  | `content/emissaries/nome/` (`en.md` e `pt.md`) |

Depois de editar: `python build.py serve` para ver (com rascunhos) e `python build.py` para gerar o site final.

**Não renomeie pastas** de obras, capítulos ou notícias que já estão no ar: o endereço da página muda e os comentários daquela página deixam de aparecer.

## 3. Escrevendo (Markdown)

- Linha em branco = novo parágrafo · `*itálico*` · `**negrito**` · `[texto](url)` · `![legenda](pasta/imagem.png)` · `## título`.
- Uma quebra de linha simples vira espaço; para quebrar a linha sem novo parágrafo, termine a linha com dois espaços ou `\`.
- Listas com `- ` no começo da linha; citação com `> `.
- **Divisor de cena:** uma linha `---` sozinha (vira a imagem definida em `"divider"` no `work.json`).
- **Links entre páginas do universo:** `[[characters/olivia-purinna]]`, `[[universe/hidden-magic]]`, `[[works/firestriker]]`
  (ou com texto: `[[characters/harry|o assistente]]`). Notícias também: `[[news/2025-04-04-guia-produtos-arcanos|último post]]`. O mesmo nome de pasta deve ser usado nos dois idiomas.
- **Campos no topo do arquivo** (entre as linhas `---`): personagem → `role`, `image`, `appears_in: [firestriker]`, `related: [universe/x]`; universo → `category`, `order`.
- **HTML cru dentro do Markdown** (um bloco que começa com `<div`, `<figure`, `<img`…): escreva os caminhos de imagem com `@/` na frente — `src="@/other images/arquivo.png"` — e o gerador põe o endereço certo do site sozinho (com ou sem `base_url`).
  O jeito antigo também funciona: caminho a partir da raiz (`/other images/…`), mas aí, se usar `base_url`, você precisa incluí-lo à mão.

## 4. Histórias e capítulos

### Tipos de obra (`work.json`)

- **Texto:** `"kind": "prose"`. Uma linha `---` sozinha vira o divisor de cena (imagem definida em `"divider"`).
- **Quadrinhos:** `"kind": "comic"`. Ponha as páginas em `static/comics/minha-hq/01/` (`1.png`, `2.png`, …) e, no capítulo, use
  `pages_glob: comics/minha-hq/01/*.png` — a ordem é numérica.
- **Vídeo:** `"kind": "video"` e `youtube: ID_DO_VIDEO` no capítulo.
- **História de um capítulo só:** `"oneshot": true` (o card leva direto à leitura).
- **Link externo** (YouTube, Tapas…): `"external"` no `work.json` (o botão vai direto para lá).
- **Histórias Hᴀᴛᴇ Cʏᴄʟᴇ × "Outras histórias":** `"universe": true` ou `false`.
- **Tipo de mídia** (filtro da página Histórias): `"media"` — ver [Página Histórias](#6-página-histórias-e-carrosséis).
- **Capa e texto do card:** `cover` e `blurb`, cada um com `{"en": …, "pt": …}`.

### Datas dos capítulos e episódios

Campo `date: AAAA-MM-DD` no topo de cada capítulo/episódio. Aparece na lista e sob o título (em português sai como "18 de ago. de 2026") e faz o capítulo entrar em "Últimas atualizações".

### Episódios (ex.: Luz & Sangue)

A obra tem `content/works/light-and-blood/01` e `02` (campo `youtube:` com o ID do vídeo). No card, o botão leva à lista de episódios; em cada
episódio há botões redondos ◁ ▷ (os mesmos do carrossel) para ir ao anterior/próximo. Novo episódio: `python build.py new chapter light-and-blood`.

### Fonte própria de uma história

Em `work.json`, `"reading_font": "times"` (usado em *Ossos do Ofício*: Times New Roman no leitor).

### Tipografia que conta a história (Ossos do Ofício)

Na cena 1 de *Ossos do Ofício*, o texto em Times New Roman muda para **PT Serif na cor #111012** quando Giuseppe adormece ("He closes his eyes"): tudo até "Giuseppe opened his eyes" é um sonho, numa fonte *quase* igual e numa cor *quase* certa. A cena também usa a fonte **Road Rage** e o GIF "NO… …I CAN’T…". Para transpor uma cena de um PDF com essa fidelidade, mande o PDF e peça "atualize a cena de acordo com o arquivo".

### Texto em volta de uma imagem

A imagem com `class="jusep"` (Giuseppe) flutua à esquerda e o texto acompanha o contorno do desenho (precisa ser PNG com fundo transparente).

### Carta que vira

Só gira ao **clicar** (clique de novo para voltar; também funciona com Tab + Enter).

## 5. Mostrar, esconder e lançar

| Quero… | Como |
|---|---|
| Esconder um capítulo/notícia/página (rascunho) | `draft: true` no topo do arquivo. Aparece só na prévia (`python build.py serve`). |
| Esconder uma obra inteira | `"listed": false` no `work.json` (hoje: *O Pêndulo* e *Beira de Estrada*). Troque para `true` para mostrar. |
| Página pronta, mas fora das listas | `unlisted: true` no topo do capítulo (ver abaixo). |
| Tirar comentários de uma página | `comments: false` no topo do arquivo. |

### Histórias "em breve"

- Uma história sem nenhum capítulo publicado aparece no carrossel com o botão cinza "Em breve" (sem link). É o caso de *Ossos do Ofício*.
- As capas e textos dos cards "em breve" estão em `work.json` (`cover`, `blurb`). Enquanto a capa não existir, o card mostra um bloco liso.

### Página de leitura oculta (`unlisted`) — Ossos do Ofício

- **Ossos do Ofício** já tem a página de leitura pronta (em inglês) com `unlisted: true` no topo de `content/works/all-in-a-nights-work/01/en.md`.
  *unlisted* = a página existe e funciona, mas não aparece no carrossel, na home nem em buscas (`noindex`). Para conferir:
  - no computador (`python build.py serve`): o card ganha o link "👁 Prévia da página de leitura";
  - no site publicado: abra direto `seu-site/en/works/all-in-a-nights-work/01/`.
- Para **lançar**: apague a linha `unlisted: true` (e ponha `date: AAAA-MM-DD` se quiser que apareça em "Últimas atualizações") — o botão vira "Leia aqui" sozinho.

## 6. Página Histórias e carrosséis

### Ordem das histórias

O visitante escolhe **Lançamento**, **Cronológica** ou **Alfabética** e pode inverter. Os números ficam em cada `work.json`, no campo `"order": {"release": 2, "chrono": 30}`.

- **Lançamento** (`release`): Alô? Residência dos Di Vario 1, Pederneira 2, Luz & Sangue 3, Ossos do Ofício 4, Beira de Estrada 5, O Pêndulo 6. Novas obras: 7, 8…
- **Cronológica** (`chrono`): segue a **posição da obra na planilha da linha do tempo**, guardada completa (inclusive obras que ainda não estão no site) em `cronologia.json`. Hoje: Ossos do Ofício 4, Luz & Sangue 5, Pederneira 6, Beira de Estrada 7, O Pêndulo 11.
- Obras **sem** número cronológico (como *Alô? Residência dos Di Vario*, `"chrono": false`) somem só nessa ordem.

### Filtro por tipo de mídia

Em cada `content/works/<obra>/work.json`, o campo `"media"` define o tipo: `short-story` (Conto), `webcomic`, `live-ttrpg` (RPG ao Vivo), `short-film` (Curta-metragem), `animated-show` (Série Animada), `videogame`, `misc` (Miscelânea). Os nomes em PT/EN ficam em `MEDIA_LABELS` no `build.py`; para criar um tipo novo, acrescente ali.

### Busca

Ao lado do seletor de ordem: digitar filtra as histórias **só pelo título**, sem diferenciar maiúsculas nem acentos.

### Grade e carrossel

- Página Histórias: grade fixa de 4 por linha (2 em telas médias, 1 em celulares).
- As fileiras de cards em carrossel rolam para o lado (setas ▷, arrastar no celular ou teclas Tab/setas). A borda esmaece quando há mais cards fora da tela.

### "Outras histórias"

Foram retiradas da home e da página Sobre (os arquivos `content/works/two-ways` etc. continuam existindo). Para trazê-las de volta,
escreva a linha `{{other-stories}}` no lugar desejado de `content/pages/about/pt.md` (ou `project/pt.md`) — e o mesmo no `en.md`.

## 7. Home

- **Carrossel da home:** mostra no máximo 5 histórias, sempre as atualizadas mais recentemente (data do último capítulo/episódio, ou `"updated": "AAAA-MM-DD"` no `work.json`). No fim, a seta vira o botão "Ver todas as histórias".
- **Últimas Atualizações:** se um episódio novo e a notícia sobre ele saíram em até 3 dias, aparece só um cartão (o do episódio, com o texto da notícia).

## 8. Páginas Histórias e Sobre

- O texto de cada página fica em `content/pages/project/` (Histórias) e `content/pages/about/` (Sobre). Dentro do texto,
  as linhas `{{stories}}`, `{{emissaries}}` e `{{other-stories}}` marcam onde entram os cards. Mude a ordem mudando as linhas de lugar.
- Página larga como a "Sobre": `layout: wide` no topo do arquivo.
- Para o texto contornar imagens, use as classes `apollo-gif`, `anfibio-gif` e `autor-foto`.

## 9. Emissários

- Cada pasta em `content/emissaries/` tem `title` (nome), `role` (função), `image` (ex.: `emissaries/saf.png`, quadrada, dentro de `static/`), `order` (posição),
  o texto breve (embaixo do `---`) e links: `instagram`, `tiktok`, `youtube`, `x`, `bluesky`, `website`, `email`.
- Cinco por linha; o sexto desce para a linha de baixo (em telas menores, 3 ou 2 por linha).
- **Textos dos Emissários** (ocultos por enquanto): em `config.json`, `"emissaries": { "show_texts": false, ... }` → mude para `true` para mostrá-los de novo.
- **Esconder um emissário:** em `config.json`, `"emissaries": { "hide": ["saf"] }`; deixe a lista vazia (`[]`) para todos aparecerem (hoje está vazia: a Saf aparece). Outra forma: `draft: true` nos dois `.md` dele.
- **Adolas Podcast** está fora dos Emissários (`draft: true` em `content/emissaries/adolas-podcast/*.md`) por causa da barra lateral; para recolocá-lo, apague essa linha.

## 10. Notícias

### Escrever e publicar

- `python build.py new news nome-do-post` cria `content/news/AAAA-MM-DD-nome-do-post/` com `en.md` e `pt.md`.
- **Ordem:** sempre pela **data da notícia** (`date:`), não pela ordem em que você adiciona. Pode cadastrar notícias antigas depois que elas entram no lugar certo.
- **Miniatura:** campo `thumb: news/nome.png` no topo da notícia (imagens em `static/news/`, uma por notícia).
- **Etiquetas:** `tags:` (lista).
- **Rascunho:** `draft: true` no começo do arquivo (pt.md e en.md) esconde a notícia do site publicado; ela continua aparecendo no `python build.py serve`. Apague essa linha para publicar.
- **Pendências:** se ainda houver `{{embed:PENDENTE-1}}`, troque pelo link do post. Para achar pendências, procure `PENDENTE` ou `draft: true` em `content/news/`.

### Como a lista aparece

- Visual igual ao mockup: data, título grande, miniatura quadrada à esquerda, etiquetas e resumo com "leia mais".
- O título não é link (use a miniatura ou "leia mais").
- **10 por página**, com números de página no fim (1 2 3 … Próxima), como numa pesquisa do Google.
- Caixa de busca no topo que procura em todas as notícias (título, etiquetas, data e texto), sem diferenciar maiúsculas nem acentos.
- Nos vídeos curtos do YouTube (Shorts) o vídeo aparece incorporado na própria notícia, em pé.
- Nas notícias em português, o canal aparece como "Alô? Residência dos di Vario".
- Posts do Twitter/X: em português só o post incorporado; em inglês, o texto traduzido + post.

### Notícias com design especial

- **Imagens no topo e no pé, sangrando até a borda da folha:** `backdrop_top: news/imagem.jpg` e `backdrop_bottom: news/imagem.jpg` (ex.: a notícia do lançamento de Pederneira).
- **Colagem** (figurinhas espalhadas + papel amassado por cima): `stickers:` com uma linha por figurinha, `arquivo | posição`, e `overlay:` com a imagem do papel. Exemplo (notícia do primeiro vídeo de Alô?):
  ```
  stickers:
    - news/stickers/formula.png | l3 t2 w26 a-4
  overlay: news/fundo-papel.jpg
  ```
  Na posição: `l`/`r` = distância da esquerda/direita, `t`/`b` = do topo/pé, `w` = largura (tudo em % da folha), `a` = giro em graus.

## 11. Posts incorporados

- Escreva numa linha só, no texto da notícia: `{{embed:nome-do-arquivo}}` (código de incorporação salvo em `content/embeds/nome-do-arquivo.html`) **ou** direto o link: `{{embed:https://x.com/usuario/status/123…}}`.
- Links aceitos: X/Twitter, Instagram (post ou reel), TikTok, YouTube (vídeo ou Short) e Reddit.
- Para o "alt" (o leitor alterna entre dois ou mais posts, com botões ao lado): separe com `|` — `{{embed:link-do-X | link-do-Instagram | link-do-TikTok}}`. Os botões levam o ícone/nome de cada rede.
- Os posts incorporados ficam **centralizados**.

## 12. Comentários

Contas + comentários próprios do site (sem Disqus), no Supabase. Como ligar, login com Google e edição: `docs/comentarios-supabase.md`.
Cada capítulo e cada notícia tem comentários; a conversa é a mesma nos dois idiomas. Sem o Supabase configurado, no site publicado não aparece nada e, na prévia local, aparece um aviso no lugar.

## 13. Menu e Extras

- *Stories* e *About* sempre aparecem; *News Feed* aparece quando há notícias publicadas; *Support* aparece quando existir a página `content/pages/support/` sem `draft: true`.
- *Extras* agrupa Universo, Personagens e qualquer página com `menu: extras` no topo.
- **Extras retirado por enquanto:** `config.json → "show_extras": false` (menu, páginas de Universo/Personagens e o botão da home). Para voltar, troque para `true`.

## 14. Aparência: cores, fontes e seus ajustes

- O visual fica todo em `static/style.css`. No topo do arquivo estão a paleta da marca (`--green`, `--mint`, `--teal`, `--cyan`, `--night`)
  e as fontes (`--font-text` = Lexend, `--font-head` = Oswald).
- **Seus ajustes pessoais: `static/custom.css`.** Coloque aqui qualquer ajuste de aparência seu. Esse arquivo é carregado depois do `style.css` e ganha dele.
  Quando chegar uma versão nova do site, o `style.css` pode ser substituído sem apagar os seus ajustes — só **não** substitua o `custom.css` (as atualizações nunca o trazem).
- **Tamanho do logo no topo:** em `static/custom.css`, acrescente `:root { --logo-w: 160px; }` (ajuste o número).
- **Cache do navegador:** os arquivos de estilo/script levam um carimbo (`?v=...`) que muda sozinho a cada alteração, e a prévia (`serve`) não usa cache.
  Assim o navegador nunca mostra uma versão velha do site depois de uma atualização.

## 15. Imagens

- Todas as suas imagens (IMAGENS.zip) já estão em `static/` com os nomes certos (o zip original trazia acentos quebrados, como `#U00e1`; foram corrigidos).
- A pasta `static/Produtos` ainda não é usada por nenhuma página.
- `guardados/` guarda arquivos para uso futuro; essa pasta **não** é publicada.
- Capas: `static/covers/EN/` e `static/covers/PT/`; logos das obras: `static/logos/`; imagens das notícias: `static/news/`.

## 16. Tela de abertura

Na primeira página de cada visita aparece `static/intro/fundo.png` cobrindo a tela e a animação da logo (`static/intro/logo.webm`);
os dois desvanecem juntos quando a página termina de carregar, mas só depois de a logo ter aparecido por inteiro (`min_ms`).
Não repete nas páginas seguintes da mesma visita, e não aparece para quem pediu "reduzir movimento" no sistema.

- Ajustes em `config.json → "intro"`: `enabled` (liga/desliga), `min_ms` (tempo mínimo na tela, padrão 4200) e `max_ms` (limite máximo, padrão 10000).
- Para rever no seu computador: abra `http://localhost:8000/?intro=1`.
- A animação original (4K, 11 MB) foi convertida para 1080p mantendo a transparência: 1,1 MB. A original continua com você.

## 17. Runas no fundo

Cada página ganha uma "impressão rúnica" própria, sorteada a partir do endereço da página (sempre a mesma para a mesma página).
Está em `rune_imprint()` no `build.py`: lista de símbolos em `RUNES`, quantidade (`n=26`, e nenhuma runa encosta em outra), tamanhos (`size`), giro máximo (±45° em `rot`) e brilho/ritmo (`lo`, `hi`, `dur`).
As fontes Noto vêm do Google Fonts, restritas a esses símbolos. O estilo e a animação ficam no fim do `style.css` (`.runes`); quem pede "reduzir movimento" no sistema vê as runas paradas.

## 18. Barra lateral de botões (desligada)

- **Para religar:** em `build.py`, troque `SIDEBAR_ON = False` por `True` (as redes sociais voltam do rodapé para a barra). O Adolas Podcast foi tirado dos Emissários por causa dela; para recolocá-lo lá, apague `draft: true` em `content/emissaries/adolas-podcast/*.md`.
- Fica à direita do conteúdo em telas largas (≥ 1100 px) e vai para baixo do conteúdo, antes do rodapé, em telas estreitas. Quando ligada, as redes sociais do projeto saem do rodapé e vivem nela.
- Ordem: divisor → "Siga o projeto" (+ redes) → "Siga o autor" (Instagram, X, TikTok) → Discord (sem link) → divisor → Catarse (sem link) → botão branco "Tip Jar" → divisor → "Projetos parceiros" (Adolas Podcast, Corte do Submundo, Lusca Sharktopus, Safe Haven, Two Ways, cada um com link e versão "hover").
- **Imagens em `static/sidebar/`.** Por enquanto são *placeholders*; para usar a arte definitiva, substitua o arquivo mantendo o MESMO nome: `divisor.png`, `Discord Server.png`, `Catarse.png`, `kofi.png`, `Adolas Podcast.png` + `Adolas Podcast hover.png` (idem `Corte do Submundo`, `Lusca Sharktopus`, `Safe Haven`, `Two Ways`).
- Textos, links dos parceiros e redes do autor ficam no topo do bloco "barra lateral" do `build.py` (`SIDEBAR_UI`, `AUTHOR_SOCIALS`, `PARTNERS`). O botão Tip Jar não tem link ainda: cole o endereço do Ko-fi em `KOFI_URL`.
- Pendência: item B3 em `docs/BACKLOG.md`.

## 19. Regra de nomes: Hᴀᴛᴇ Cʏᴄʟᴇ × Hate Cycle

Duas grafias, dois significados diferentes. **Não são intercambiáveis.**

- **Hᴀᴛᴇ Cʏᴄʟᴇ** (versalete) = a **marca** e o **universo compartilhado**, que reúne contos, quadrinhos, jogos, filmes, o sistema de RPG, a Especulação Evolutiva, o merchandise, etc. É o padrão: use sempre esta grafia ao falar do universo, da marca, do site ou do projeto como um todo.
- **Hate Cycle** (caixa normal) = **apenas** a futura **série de animação**, primeiro projeto do universo a ser idealizado (nasceu como webcomic de Apollo e O Anfíbio). É a obra de onde o universo cresceu, do mesmo jeito que os nove filmes de Star Wars deram origem à marca Star Wars.

Como escrever o versalete: digite as letras Unicode minúsculas-maiúsculas direto no texto (`Hᴀᴛᴇ Cʏᴄʟᴇ`). O `build.py` (função `smallcaps()`) troca por `<span class="hc">Hate Cycle</span>`, que usa versalete de verdade no CSS (`.hc` no `style.css`). O mesmo vale para outras palavras em versalete, como `Sᴇɴʜᴏʀ`/`Lᴏʀᴅ`.

Onde cada uma aparece hoje: o versalete está no `config.json` (nome do site, textos da capa, "Histórias Hᴀᴛᴇ Cʏᴄʟᴇ"), nas páginas Sobre e O Projeto e nas notícias. A grafia normal aparece em `cronologia.json`, na linha da série de animação (`"media": "animated-show"`), e no trecho de O Projeto que conta a origem da webcomic ("…Hate Cycle logo se tornou mais do que isso") — os dois são o uso certo.

## 20. Ortografia, versalete e transcrições fonéticas

- **Trema:** o site usa o trema (ortografia anterior ao acordo de 1990) quando o "u" é pronunciado após g/q: lingüista, freqüência, conseqüência, etc. Exceção: "equivalente" e "equivale" ficam sem trema.
- **Transcrições fonéticas (IPA):** qualquer trecho entre barras com símbolos fonéticos, como `/ɦaʊ̯.ˈʔu.ᵐbʷa/`, é exibido automaticamente em Arial (Lexend não tem esses símbolos).
  A mesma regra protege o texto: dentro da transcrição, letras como ʏ ou ʀ não viram versalete.

## 21. Site antigo e endereços

- As URLs antigas (`firestriker.html`, `PT.html`…) redirecionam para as novas (lista em `config.json → redirects`).
- Os endereços atuais (`/en/…` e `/pt/…`) não mudam com a migração para Astro.
- O que foi migrado do site antigo, e o que não foi, está em `docs/HISTORICO.md`.
