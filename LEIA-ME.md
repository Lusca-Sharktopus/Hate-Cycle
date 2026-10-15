# Site Hᴀᴛᴇ Cʏᴄʟᴇ — como usar

Você escreve em arquivos de texto (Markdown) e roda **um comando**; o `build.py` gera o site inteiro
(inglês + português, listagens, "Últimas atualizações", botões de próximo/anterior, RSS) na pasta `public/`.
Precisa só de Python 3.8+ (nada para instalar).

## Primeira vez
1. Copie suas pastas de imagens (`logos`, `covers`, `other images`, `Backgrounds`, `Produtos`) para dentro de **`static/`**.
   Tudo que está em `static/` vai para o site como está.
2. `python build.py serve` → abre a prévia em http://localhost:8000 (**mostra os rascunhos**).
3. `python build.py` → gera o site final em `public/` (sem rascunhos). Suba o conteúdo de `public/` para a hospedagem.
4. Em `config.json`: preencha `site_url` (ex.: `"https://hatecycle.com"`) para ativar o RSS. Se o site ficar
   numa subpasta (ex.: GitHub Pages de projeto), preencha `base_url` (ex.: `"/meu-repo"`).

## Tarefas do dia a dia
Cada item tem uma pasta com `en.md` e `pt.md`. Só existe em um idioma? Apague o outro arquivo.

| Quero…                         | Comando                                   | Onde edito |
|--------------------------------|-------------------------------------------|------------|
| Publicar uma notícia           | `python build.py new news nome-do-post`   | `content/news/DATA-nome-do-post/` |
| Novo capítulo (HQ, texto, vídeo) | `python build.py new chapter firestriker` | `content/works/firestriker/02/`   |
| Cadastrar uma história nova    | `python build.py new work minha-historia` | `content/works/minha-historia/work.json` |
| Página de personagem           | `python build.py new character nome`      | `content/characters/nome/` |
| Página sobre o universo        | `python build.py new universe nome`       | `content/universe/nome/` |
| Página avulsa (ex.: sobre)     | `python build.py new page nome`           | `content/pages/nome/` |
| Adicionar um Emissário         | copie uma pasta de `content/emissaries/`  | `content/emissaries/nome/` (`en.md` e `pt.md`) |

**Quadrinhos:** ponha as páginas em `static/comics/minha-hq/01/` (`1.png`, `2.png`, …) e, no capítulo, use
`pages_glob: comics/minha-hq/01/*.png` — a ordem é numérica. No `work.json`, `"kind": "comic"`.
**Texto:** `"kind": "prose"`. Uma linha `---` sozinha vira o divisor de cena (imagem definida em `"divider"`).
**Vídeo:** `"kind": "video"` e `youtube: ID_DO_VIDEO` no capítulo. **História de um capítulo só:** `"oneshot": true`.
**Link externo** (YouTube, Tapas…): `"external"` no `work.json` (o botão vai direto para lá).
**Esconder algo:** `draft: true` no topo do arquivo (aparece só na prévia). `"listed": false` esconde uma obra inteira.

## Escrevendo (Markdown)
Linha em branco = novo parágrafo · `*itálico*` · `**negrito**` · `[texto](url)` · `![legenda](pasta/imagem.png)` · `## título`.
Links entre páginas do universo: `[[characters/olivia-purinna]]`, `[[universe/hidden-magic]]`, `[[works/firestriker]]`
(ou com texto: `[[characters/harry|o assistente]]`). O mesmo nome de pasta deve ser usado nos dois idiomas.
Campos úteis: personagem → `role`, `image`, `appears_in: [firestriker]`, `related: [universe/x]`; universo → `category`, `order`.

## O que veio do site antigo
- Firestriker/Pederneira, Luz & Sangue, HDVR e as "outras histórias" já estão migrados. *All in a Night's Work / Ossos do Ofício*
  está como rascunho e oculto (o texto de `night.html` já está em `content/works/all-in-a-nights-work/`; tire `draft: true` e
  `"listed": false` quando quiser publicar).
- As URLs antigas (`firestriker.html`, `PT.html`…) redirecionam para as novas (lista em `config.json → redirects`).
- Há 3 páginas de exemplo (notícia, 2 personagens, 1 do universo) marcadas como `draft: true` — edite ou apague.
- `produtos.html`, `estrada.html` e `roadside.html` não foram migrados (estavam vazios ou eram só uma lista de imagens).

## Atenção
- **Comentários:** agora são próprios do site (contas + comentários, sem Disqus). Veja `COMENTARIOS-LEIA-ME.md` para ligar.
- Em HTML cru dentro do Markdown, escreva os caminhos de imagem a partir da raiz (`/other images/…`) e, se usar `base_url`, inclua-o.
- O visual fica todo em `static/style.css`. No topo do arquivo estão a paleta da marca (`--green`, `--mint`, `--teal`, `--cyan`, `--night`)
  e as fontes (`--font-text` = Lexend, `--font-head` = Oswald).
- Menu: *Stories* e *About* sempre aparecem; *News Feed* aparece quando há notícias publicadas; *Extras* agrupa Universo, Personagens e
  qualquer página com `menu: extras` no topo; *Support* aparece quando existir a página `content/pages/support/` sem `draft: true`.
- Página larga como a "Sobre": `layout: wide` no topo do arquivo. Para o texto contornar imagens, use as classes `apollo-gif`, `anfibio-gif` e `autor-foto`.

## Novidades desta versão
- **Ordem das histórias** (página Histórias): o visitante escolhe Lançamento, Cronológica ou Alfabética e pode inverter. Os números ficam em cada
  `work.json`, no campo `"order": {"release": 2, "chrono": 30}`. Obras **sem** número cronológico (como *Alô? Residência dos Di Vario*) somem só nessa ordem.
  Números já usados: cronológica → Ossos do Ofício 10, Luz & Sangue 20, Pederneira 30 (Beira de Estrada = 40 e O Pêndulo = 50, quando existirem);
  lançamento → Alô? 1, Pederneira 2, Luz & Sangue 3, Ossos do Ofício 4 (novas obras: 5, 6…).
- **Páginas Histórias e Sobre:** o texto de cada página fica em `content/pages/project/` (Histórias) e `content/pages/about/` (Sobre). Dentro do texto,
  as linhas `{{stories}}`, `{{emissaries}}` e `{{other-stories}}` marcam onde entram os cards. Mude a ordem mudando as linhas de lugar.
- **Outros Emissários:** cada pasta em `content/emissaries/` tem `title` (nome), `role` (função), `image` (ex.: `emissaries/saf.png`, quadrada, dentro de `static/`),
  o texto breve (embaixo do `---`) e links: `instagram`, `tiktok`, `youtube`, `x`, `bluesky`, `website`, `email`. Cinco por linha; o sexto desce para a linha de baixo
  (em telas menores, 3 ou 2 por linha).

## Seus ajustes pessoais: `static/custom.css`
Coloque aqui qualquer ajuste de aparência seu (ex.: tamanho da logo). Esse arquivo é carregado depois do `style.css` e ganha dele.
Quando eu mandar uma versão nova do site, o `style.css` pode ser substituído sem apagar os seus ajustes — só **não** substitua o `custom.css`.

## Histórias em carrossel
As fileiras de cards rolam para o lado (setas ▷, arrastar no celular ou teclas Tab/setas). A borda esmaece quando há mais cards fora da tela.

## Histórias "em breve" e página de leitura oculta
- Uma história sem nenhum capítulo publicado aparece no carrossel com o botão cinza "Em breve" (sem link). É o caso de *Ossos do Ofício* e *Beira de Estrada*.
- **Ossos do Ofício** já tem a página de leitura pronta (em inglês) com `unlisted: true` no topo de `content/works/all-in-a-nights-work/01/en.md`.
  *unlisted* = a página existe e funciona, mas não aparece no carrossel, na home nem em buscas (`noindex`). Para conferir:
  - no computador (`python build.py serve`): o card ganha o link "👁 Prévia da página de leitura";
  - no site publicado: abra direto `seu-site/en/works/all-in-a-nights-work/01/`.
  Para **lançar**: apague a linha `unlisted: true` (e ponha `date: AAAA-MM-DD` se quiser que apareça em "Últimas atualizações") — o botão vira "Leia aqui" sozinho.
- As capas e textos dos cards "em breve" estão em `work.json` (`cover`, `blurb`). Coloquei o nome de capa `covers/EN/Cover All in a Night's Work.png` por palpite;
  se o arquivo tiver outro nome, corrija no `work.json`. Enquanto a capa não existir, o card mostra um bloco liso.

## Luz & Sangue com episódios
A obra agora tem `content/works/light-and-blood/01` e `02` (campo `youtube:` com o ID do vídeo). No card, o botão leva à lista de episódios; em cada
episódio há botões redondos ◁ ▷ (os mesmos do carrossel) para ir ao anterior/próximo. Novo episódio: `python build.py new chapter light-and-blood`.

## "Outras histórias"
Foram retiradas da home e da página Sobre (os arquivos `content/works/two-ways` etc. continuam existindo). Para trazê-las de volta,
escreva a linha `{{other-stories}}` no lugar desejado de `content/pages/about/pt.md` (ou `project/pt.md`).

## Ajustes recentes (resumo)
- **Datas dos episódios:** campo `date: AAAA-MM-DD` no topo de cada capítulo/episódio (aparece na lista e sob o título; em português sai como "18 de ago. de 2026").
- **Fonte própria de uma história:** em `work.json`, `"reading_font": "times"` (usado em *Ossos do Ofício*).
- **Texto em volta de uma imagem:** a imagem com `class="jusep"` (Giuseppe) flutua à esquerda e o texto acompanha o contorno do desenho (precisa ser PNG com fundo transparente).
- **Carta que vira:** só gira ao **clicar** (clique de novo para voltar; também funciona com Tab + Enter).
- **Cache do navegador:** os arquivos de estilo/script agora levam um carimbo (`?v=...`) que muda sozinho a cada alteração, e a prévia (`serve`) não usa cache.
  Assim o navegador nunca mostra uma versão velha do site depois de uma atualização.

## Imagens
Todas as suas imagens (IMAGENS.zip) já estão em `static/` com os nomes certos (o zip original trazia acentos quebrados, como `#U00e1`; foram corrigidos).
A pasta `static/Produtos` ainda não é usada por nenhuma página.

## Tela de abertura
Na primeira página de cada visita aparece `static/intro/fundo.png` cobrindo a tela e a animação da logo (`static/intro/logo.webm`);
os dois desvanecem juntos quando a página termina de carregar, mas só depois de a logo ter aparecido por inteiro (`min_ms`).
Não repete nas páginas seguintes da mesma visita, e não aparece para quem pediu "reduzir movimento" no sistema.
- Ajustes em `config.json → "intro"`: `enabled` (liga/desliga), `min_ms` (tempo mínimo na tela, padrão 4200) e `max_ms` (limite máximo, padrão 10000).
- Para rever no seu computador: abra `http://localhost:8000/?intro=1`.
- A animação original (4K, 11 MB) foi convertida para 1080p mantendo a transparência: 1,1 MB. A original continua com você.

## Busca de histórias
Na página Histórias, ao lado do seletor de ordem: digitar filtra o carrossel (título e sinopse, sem diferenciar maiúsculas nem acentos).

## Extras
Retirado por enquanto: `config.json → "show_extras": false` (menu, páginas de Universo/Personagens e o botão da home). Para voltar, troque para `true`.

## Notícias
18 notícias cadastradas (vídeos do canal Hello? Di Vario Residency, posts do Instagram, o lançamento de Pederneira em 18/04/2025, a postagem da aba Comunidade
e 7 posts do X). Nos vídeos curtos do YouTube o vídeo aparece incorporado na própria notícia. Os posts do Reddit estão em `NOTICIAS-PENDENTES.md`.

## Notícias: design, páginas, busca e posts incorporados
- **Visual:** data, título grande, miniatura quadrada à esquerda, etiquetas (tags) e resumo com "leia mais", como no seu design.
  A miniatura é o campo `thumb:` do cabeçalho da notícia (as imagens ficam em `static/news/`, uma por notícia).
- **Ordem:** sempre pela **data da notícia** (`date:`), não pela ordem em que você adiciona. É só preencher a data certa.
- **10 por página**, com números de página no fim (1 2 3 … Próxima), como numa pesquisa do Google. Há uma barra de busca no topo
  que procura em todas as notícias (título, tags, data e texto), sem diferenciar maiúsculas nem acentos.
- **Posts do Instagram, Reddit e X:** salve o código de incorporação em `content/embeds/nome.html` e, no texto da notícia, escreva `{{embed:nome}}` onde o post deve aparecer.
- **Rascunho:** `draft: true` esconde a notícia do site publicado (ela continua aparecendo no `python build.py serve`).

## Outros ajustes desta rodada
- A busca da página Histórias agora considera **só o título** (não a sinopse).
- **O Pêndulo** está oculto dos carrosséis (`"listed": false` no `work.json`; troque para `true` quando quiser mostrá-lo).
- Emissários: textos atualizados; link do YouTube do Adolas Podcast adicionado; trecho sobre a Safe Haven removido do Sobre.
- Nas notícias em português, o canal aparece como "Alô? Residência dos di Vario".

## Notícias (layout novo)
- Visual igual ao mockup: data, título, miniatura quadrada à esquerda (`thumb: news/nome.png` no cabeçalho da notícia), etiquetas e resumo com "leia mais".
- 10 notícias por página, números de página no fim (como numa busca do Google) e caixa para buscar notícias (título, etiquetas e texto).
- A ordem é sempre pela **data** da notícia (`date:`), não pela ordem em que foi adicionada. Pode cadastrar notícias antigas depois que elas entram no lugar certo.
- Posts incorporados (Instagram, Reddit, X): salve o código em `content/embeds/nome.html` e escreva `{{embed:nome}}` no texto da notícia.
- Notícia com `draft: true` (ex.: o Feliz Natal dos di Vario) só aparece no `python build.py serve`, não no site publicado.
- A busca da página Histórias considera apenas o título.
- *O Pêndulo* está oculto dos carrosséis (`"listed": false` no `work.json`).

## Transcrições fonéticas (IPA)
Qualquer trecho entre barras com símbolos fonéticos, como `/ɦaʊ̯.ˈʔu.ᵐbʷa/`, é exibido automaticamente em Arial (Lexend não tem esses símbolos).
A mesma regra protege o texto: dentro da transcrição, letras como ʏ ou ʀ não viram versalete.

## Rodada "Quase tudo pronto" — como ligar/desligar coisas

- **Textos dos Emissários** (ocultos por enquanto): em `config.json`, `"emissaries": { "show_texts": false, ... }` → mude para `true` para mostrá-los de novo.
- **Saf** (oculta por enquanto): em `config.json`, `"emissaries": { "hide": ["saf"] }` → deixe a lista vazia (`[]`) para ela voltar.
- **O Pêndulo na página de Histórias**: está visível. Para ocultá-lo de novo (lançar sem ele), abra `content/works/the-pendulum/work.json` e troque `"listed": true` por `"listed": false`.
- **Tamanho do logo no topo**: em `static/custom.css` (seu arquivo), acrescente `:root { --logo-w: 160px; }` (ajuste o número).
- **Carrossel da home**: mostra no máximo 5 histórias, sempre as atualizadas mais recentemente (data do último capítulo/episódio, ou `"updated": "AAAA-MM-DD"` no work.json). No fim, a seta vira o botão "Ver todas as histórias".
- **Página de Histórias**: grade fixa de 4 por linha (2 em telas médias, 1 em celulares).
- **Últimas Atualizações (home)**: se um episódio novo e a notícia sobre ele saíram em até 3 dias, aparece só um cartão (o do episódio, com o texto da notícia).
- **Notícias**: o título não é link (use a miniatura ou "leia mais"). Posts do Twitter/X: em português só o post incorporado; em inglês, o texto traduzido + post.

## Posts incorporados nas notícias (centralizados, com botão de alternar)

- Os posts incorporados ficam **centralizados**.
- Para incorporar, escreva numa linha só, no texto da notícia: `{{embed:nome-do-arquivo}}` (arquivo em `content/embeds/`) **ou** direto o link: `{{embed:https://x.com/usuario/status/123…}}`. Links aceitos: X/Twitter, Instagram (post ou reel), TikTok, YouTube (vídeo ou Short) e Reddit.
- Para o "alt" (o leitor alterna entre dois ou mais posts, com botões ao lado): separe com `|` — `{{embed:link-do-X | link-do-Instagram | link-do-TikTok}}`. Os botões levam o ícone/nome de cada rede.
- Notícias em **rascunho** têm `draft: true` no começo do arquivo (pt.md e en.md): apague essa linha para publicar. Se ainda houver `{{embed:PENDENTE-1}}`, troque pelo link do post. Para achar pendências, procure `PENDENTE` ou `draft: true` em `content/news/`.
- Comentários: as notícias já têm o espaço para comentários, igual aos capítulos. Ele só aparece no site publicado depois que o Supabase for configurado (veja COMENTARIOS-LEIA-ME.md); na prévia local aparece um aviso no lugar.

## "Hᴀᴛᴇ Cʏᴄʟᴇ" × "Hate Cycle" (regra de nomes)
Duas grafias, dois significados diferentes. **Não são intercambiáveis.**

- **Hᴀᴛᴇ Cʏᴄʟᴇ** (versalete) = a **marca** e o **universo compartilhado**, que reúne contos, quadrinhos, jogos, filmes, o sistema de RPG, a Especulação Evolutiva, o merchandise, etc. É o padrão: use sempre esta grafia ao falar do universo, da marca, do site ou do projeto como um todo.
- **Hate Cycle** (caixa normal) = **apenas** a futura **série de animação**, primeiro projeto do universo a ser idealizado (nasceu como webcomic de Apollo e O Anfíbio). É a obra de onde o universo cresceu, do mesmo jeito que os nove filmes de Star Wars deram origem à marca Star Wars.

Como escrever o versalete: digite as letras Unicode minúsculas-maiúsculas direto no texto (`Hᴀᴛᴇ Cʏᴄʟᴇ`). O `build.py` (função `smallcaps()`) troca por `<span class="hc">Hate Cycle</span>`, que usa versalete de verdade no CSS (`.hc` no `style.css`). O mesmo vale para outras palavras em versalete, como `Sᴇɴʜᴏʀ`/`Lᴏʀᴅ`.

Onde cada uma aparece hoje: o versalete está no `config.json` (nome do site, textos da capa, "Histórias Hᴀᴛᴇ Cʏᴄʟᴇ"), nas páginas Sobre e O Projeto e nas notícias. A grafia normal só aparece em `cronologia.json`, na linha da série de animação (`"media": "animated-show"`) — que é o uso certo.

## Ortografia (português)
O site usa o trema (ortografia anterior ao acordo de 1990) quando o "u" é pronunciado após g/q: lingüista, freqüência, conseqüência, etc. Exceção: "equivalente" e "equivale" ficam sem trema.

## Filtro por tipo de mídia e cronologia
- Em cada `content/works/<obra>/work.json`, o campo `"media"` define o tipo (aparece no filtro da página Histórias): `short-story`, `webcomic`, `live-ttrpg`, `short-film`, `animated-show`, `videogame`. Os nomes em PT/EN ficam em `MEDIA_LABELS` no `build.py`; para criar um tipo novo, acrescente ali.
- `order.chrono` segue a posição da planilha da linha do tempo. A planilha completa (inclusive obras que ainda não estão no site) está guardada em `cronologia.json`.

## Runas no fundo
Cada página ganha uma "impressão rúnica" própria, sorteada a partir do endereço da página (sempre a mesma para a mesma página). Está em `rune_imprint()` no `build.py`: lista de símbolos em `RUNES`, quantidade (`n=26`, e nenhuma runa encosta em outra), tamanhos (`size`), giro máximo (±45° em `rot`) e brilho/ritmo (`lo`, `hi`, `dur`). As fontes Noto vêm do Google Fonts, restritas a esses símbolos. O estilo e a animação ficam no fim do `style.css` (`.runes`); quem pede "reduzir movimento" no sistema vê as runas paradas.

## Ideias guardadas para depois

- **Fotos de perfil nos comentários** (adiada a pedido): (1) usar a foto da conta Google automaticamente; (2) avatares prontos para escolher (personagens de Hᴀᴛᴇ Cʏᴄʟᴇ ou iniciais coloridas); (3) upload de foto própria via Supabase Storage (bucket `avatars`, regras de acesso, limite de tamanho, sem moderação automática). Exige coluna `avatar_url` em `public.profiles`, ajuste em `static/comments.js` e um menu "Meu perfil". Combinação sugerida: Google automático + avatares prontos.

## Guardado para uso em breve

- **Imagem:** `guardados/no-i-cant.gif` ("NO... ...I CAN'T...", 943×376). Fica fora do site até ser usada (a pasta `guardados/` não é publicada).
- **Fontes a usar:** **Road Rage** e **PT Serif** (ambas do Google Fonts; carregar com um `<link>` por família, como as demais).

## Barra lateral de botões (DESLIGADA por enquanto)

- Para religar: em `build.py`, troque `SIDEBAR_ON = False` por `True` (as redes sociais voltam do rodapé para a barra). O Adolas Podcast foi tirado dos Emissários por causa dela; para recolocá-lo lá, apague `draft: true` em `content/emissaries/adolas-podcast/*.md`.

- Fica à direita do conteúdo em telas largas (≥ 1100 px) e vai para baixo do conteúdo, antes do rodapé, em telas estreitas. As redes sociais do projeto saíram do rodapé e vivem aqui.
- Ordem: divisor → "Siga o projeto" (+ redes) → "Siga o autor" (Instagram, X, TikTok) → Discord (sem link) → divisor → Catarse (sem link) → botão branco "Tip Jar" → divisor → "Projetos parceiros" (Adolas Podcast, Corte do Submundo, Lusca Sharktopus, Safe Haven, Two Ways, cada um com link e versão "hover").
- **Imagens em `static/sidebar/`.** Por enquanto são *placeholders*; para usar a arte definitiva, substitua o arquivo mantendo o MESMO nome: `divisor.png`, `Discord Server.png`, `Catarse.png`, `kofi.png`, `Adolas Podcast.png` + `Adolas Podcast hover.png` (idem `Corte do Submundo`, `Lusca Sharktopus`, `Safe Haven`, `Two Ways`).
- Textos, links dos parceiros e redes do autor ficam no topo do bloco "barra lateral" do `build.py` (`SIDEBAR_UI`, `AUTHOR_SOCIALS`, `PARTNERS`). O botão Tip Jar não tem link ainda: cole o endereço do Ko-fi em `KOFI_URL`.
