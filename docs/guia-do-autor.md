# Guia do autor — como usar o site Hᴀᴛᴇ Cʏᴄʟᴇ

Você escreve em arquivos de texto (Markdown) e roda **um comando**; o `build.py` gera o site inteiro
(inglês + português, listagens, "Últimas atualizações", botões de próximo/anterior, RSS) na pasta `public/`.
Precisa só do Python (nada para instalar além dele).

> **Versão do Python:** o antigo LEIA-ME dizia "Python 3.8+", mas o gerador de hoje só funciona a partir do **Python 3.12** (conferido). Se o comando der erro de sintaxe, atualize o Python.

> **Migração:** o site está sendo migrado para Astro (ver `docs/ARQUITETURA.md` e `docs/BACKLOG.md`). Até a virada, tudo neste guia continua valendo. O jeito de escrever (pastas, `en.md`/`pt.md`, campos no topo dos arquivos) não muda.
>
> **Publicação depois da virada (sábado 24/10/2026):** você não sobe mais nenhuma pasta `public/`. O GitHub constrói e publica o site sozinho sempre que uma mudança entra na `main`. Veja a seção [Publicar o site](#publicar-o-site-depois-da-virada) logo abaixo e o roteiro completo em `docs/virada.md`.

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
3. `python build.py` → gera o site final em `public/` (sem rascunhos). **Até a virada:** suba o conteúdo de `public/` para a hospedagem. **Depois da virada** isto não é mais preciso: o site é publicado pelo GitHub (ver [Publicar o site](#publicar-o-site-depois-da-virada)); o `public/` serve só para você conferir no seu computador.
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

Depois de editar: `python build.py serve` para ver (com rascunhos) e `python build.py` para gerar o site final (no site novo: `pnpm dev` para ver com rascunhos e `pnpm build` para gerar o site final em `dist/`). Para o site **entrar no ar**, veja a próxima seção.

### Publicar o site (depois da virada)

A partir de sábado 24/10/2026, **publicar = enviar a mudança para a branch `main` do GitHub**. O GitHub então liga uma "linha de montagem" (aba **Actions** do repositório), que confere o código, constrói o site e o coloca em hatecycle.com, tudo sozinho, em **2 a 5 minutos** (mais até 10 minutos de cache, em que algumas pessoas ainda veem a versão anterior).

Há dois caminhos:

1. **Você me manda, eu publico** (o de hoje): você me envia o zip ou os arquivos; eu coloco no projeto, construo o site para conferir, envio para a `main` e te aviso quando estiver no ar.
2. **Você mesmo, pelo site do GitHub:** no repositório, abra a pasta (ex.: `content/news/`), clique em **Add file → Upload files**, arraste a pasta nova, deixe marcado **Commit directly to the `main` branch** e clique em **Commit changes**. Depois acompanhe em **Actions** até a bolinha ficar verde. Limites do navegador: 100 arquivos por envio e 25 MB por arquivo.

Se a bolinha ficar **vermelha**, o site no ar **não muda** (continua a versão anterior). Clique nela para ler o aviso (ele diz o arquivo e o campo errado); o GitHub também manda e-mail. A linha de montagem confere se o site **constrói**, não se o texto está certo: uma notícia só em um idioma, ou com gralha, vai ao ar assim mesmo.

Se algo der muito errado, o site antigo está guardado e dá para pô-lo de volta em minutos: `docs/virada.md`, seção 3.

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

> **No site novo (Astro):** o texto acompanha o contorno pela *silhueta* do desenho (`/silhuetas/giuseppe.png`, gerada sozinha no build a partir do desenho em `static/other images/`; o contorno é o mesmo, só não baixa o arquivo grande de novo). Se você trocar o desenho do Giuseppe, da foto do autor ou dos GIFs da página Sobre por outro de **mesmo nome**, a silhueta é refeita sozinha. Para um desenho **novo** em que o texto deva dar a volta, peça: é uma linha em `src/lib/silhuetas.ts`.

### Quadrinho página a página, com as runas embaixo (Beira de Estrada; só no site novo)

Desde 22/10 (T17d), um quadrinho pode ser lido **uma página por vez**: a página no meio, uma seta redonda de cada lado e, embaixo, uma runa por página (na *Beira de Estrada*, as Oito Runas d'A Força: ᚣ 弓 ♐︎ ᚸ エ ꑭ ⼒ Ⱝ). A runa da página em que o visitante está brilha; clicar numa runa vai direto àquela página. A seta da direita vai à próxima página e, na última, à primeira do próximo capítulo; na última página do capítulo mais recente ela some. A da esquerda faz o mesmo ao contrário (na 1ª página, vai à **última** do capítulo anterior). Também funcionam as setas ← → do teclado, o Tab nas runas e o "voltar" do navegador.

- **Como ligar:** no `work.json` da obra, `"page_runes": ["ᚣ", "弓", "♐︎", "ᚸ", "エ", "ꑭ", "⼒", "Ⱝ"]` (uma runa por página, na ordem; a obra tem de ser `"kind": "comic"`). Todo capítulo tem de ter **exatamente** esse número de páginas: se um capítulo tiver 7 ou 9, o site **não é gerado** e a mensagem diz qual capítulo e quantas páginas ele tem (assim um capítulo pela metade nunca vai ao ar sem ninguém ver).
- **O endereço não muda:** o capítulo continua em `/pt/works/roadside/01/` e os comentários continuam os mesmos (a conversa `works/roadside/01`, igual nos dois idiomas). A página dentro do capítulo vai no fim do endereço: `/pt/works/roadside/01/#p5` abre direto na página 5 (bom para mandar link).
- **Sem JavaScript** (ou no site antigo, em Python), as páginas aparecem uma embaixo da outra, como antes.
- **Hoje (provisório):** os capítulos 01 e 02 usam as 8 imagens "pagina placeholder 1…8.png" que você mandou em 20/10, guardadas **uma vez** em `static/comics/provisorio/` (os dois capítulos apontam para lá com `pages_glob: comics/provisorio/*.png`). Desde 22/10 eles têm os títulos que você mandou ("A Garotinha dos Olhos Vermelhos" / "The Little Girl with Red Eyes" e "Procurando um lugar seguro" / "Finding a safe place", no `title:`), ainda sem data. Os nomes dos capítulos 3 a 5 estão guardados em `guardados/beira-de-estrada-capitulos.md` (com o jeito de criar cada um).
- **O fundo (desde 22/10):** a caixa do leitor página a página é a folha de **papel** de sempre (não mais o roxo-noite dos quadrinhos), com o título, a logo e a barra "Anterior · Todos os capítulos · Próximo" nas cores das outras caixas de papel; as runas apagadas ficam no verde dos títulos e a da página atual em petróleo com o brilho ciano em volta. Quadrinho lido rolando (sem `page_runes`) continua no roxo-noite.
- **Trocar pelas páginas de verdade:** ponha as 8 páginas de cada capítulo numa pasta própria, por exemplo `static/comics/beira/01/` (`1.png` … `8.png`; a ordem é numérica) e `static/comics/beira/02/`, e troque a linha `pages_glob:` de `content/works/roadside/01/pt.md` **e** `en.md` para `pages_glob: comics/beira/01/*.png` (e o mesmo no 02). Se quiser, acrescente `date: AAAA-MM-DD` e `title:`. Depois apague a pasta `static/comics/provisorio/` (a linha `# PROVISÓRIO …` no topo dos arquivos também pode sair). Páginas com texto em português e em inglês? Use pastas diferentes por idioma (ex.: `comics/beira/pt/01/*.png` no `pt.md`).
- **Os textos para leitor de tela** ("Página 3 de 8", "Próxima página", "Capítulo anterior: Capítulo 1") ficam em `src/lib/textosDoFolheador.ts`, não no `config.json`. Lição: [08, seção "Leitor página a página"](aprendendo-astro/08-leitor.md#leitor-página-a-página-dos-quadrinhos-t17d-as-runas-da-beira-de-estrada).

### Página de um jogo: a janela da demo e o botão da Steam (Cat-Crow-Thing; só no site novo)

A página do *Cat-Crow-Thing* (`content/works/cat-crow-thing/`, em rascunho) mostra, logo abaixo do título, uma **janela de tela de jogo** (16:9) e, embaixo dela, o botão com a logo da Steam à esquerda e "Wishlist on Steam" (inglês) / "Adicione à Wishlist" (português). Isso vem do campo `game` do `work.json`:

```json
"game": {
  "demo": "",
  "steam": ""
}
```

- **Hoje, os dois vazios:** a janela fica escura, com "Demo em breve" no meio (nada de outro site é carregado), e o botão aparece **apagado e sem link**, com "Link em breve" ao lado: não leva a lugar nenhum e não parece quebrado.
- **Quando a página da Steam existir:** ponha o endereço completo, `"steam": "https://store.steampowered.com/app/…"`. O botão vira um link (abre em outra aba) e o "Link em breve" some.
- **Quando a demo existir:** se ela estiver num site que deixa jogar dentro de outra página (itch.io, por exemplo), ponha o endereço da demo em `"demo": "https://…"`: ela aparece dentro da janela, isolada (o jogo roda no endereço dele e não alcança a sessão de quem comenta). Se a demo for um arquivo seu (um jogo exportado para navegador), me mande e eu vejo o melhor jeito de pôr no site.
- O endereço tem de começar com `https://` (senão o site não é gerado, e a mensagem explica).
- **Texto embaixo do botão:** o que você escrever depois do `---` em `content/works/cat-crow-thing/01/pt.md` e `en.md` aparece embaixo do botão. Hoje está vazio (você ainda não mandou a apresentação do jogo; o cartão em Histórias também está sem texto, falta o `blurb` no `work.json`).
- O botão do cartão em Histórias diz "Jogue aqui" / "Play here" (`cta` no `work.json`; proposta, troque se quiser). Os textos "Demo em breve" e "Link em breve" ficam em `src/lib/textosDoJogo.ts`.

### O Pêndulo (vídeo provisório)

*O Pêndulo* (rascunho) tem agora a página dele, um vídeo do YouTube como os episódios de *Luz & Sangue*. **Provisoriamente** é o vídeo do episódio 1 de *Luz & Sangue* (`J2j6xoIz0LE`). Para pôr o filme: troque o `youtube:` em `content/works/the-pendulum/01/pt.md` e `en.md` pelo ID do vídeo de verdade (o que vem depois de `v=` no link) e apague a linha `# PROVISÓRIO …`.

### Carta que vira

Só gira ao **clicar** (clique de novo para voltar; também funciona com Tab + Enter).

## 5. Mostrar, esconder e lançar

| Quero… | Como |
|---|---|
| Esconder um capítulo/notícia/página (rascunho) | `draft: true` no topo do arquivo. Aparece só na prévia (`python build.py serve`). |
| Guardar uma obra inteira como rascunho (ainda não publicada) | `"draft": true` no `work.json` (hoje: *Ossos do Ofício*, *Beira de Estrada*, *O Pêndulo* e *Cat-Crow-Thing*). No site publicado a obra **não existe**: some do carrossel, de Histórias, da home, de "Últimas atualizações", dos capítulos, do mapa do site e do RSS. Na prévia (`python build.py serve` ou `pnpm dev`) ela aparece como as outras. **Para publicar, apague a linha `"draft": true`.** |
| Tirar uma obra só das listas, sem guardá-la | `"listed": false` no `work.json`. A obra não aparece em Histórias, mas as páginas dela continuam existindo e acessíveis por link. (Para "guardar para depois", use `draft`.) |
| Página pronta, mas fora das listas | `unlisted: true` no topo do capítulo (ver abaixo). |
| Tirar comentários de uma página | `comments: false` no topo do arquivo. |

### Histórias "em breve"

- Uma história **publicada** (sem `draft`) mas sem nenhum capítulo ainda aparece no carrossel com o botão cinza "Em breve" (sem link). Quem está com `"draft": true` não aparece, nem como "Em breve", no site publicado; só na prévia.
- As capas e textos dos cards "em breve" estão em `work.json` (`cover`, `blurb`). Enquanto a capa não existir, o card mostra um bloco liso.

### Página de leitura oculta (`unlisted`)

*unlisted* = a página do capítulo existe e funciona, mas não aparece no carrossel, na home nem em buscas (`noindex`). Serve para mostrar uma página a alguém por link antes de lançar. Para lançar, apague a linha `unlisted: true`.

### Ossos do Ofício (hoje em rascunho)

*Ossos do Ofício* está com `"draft": true` no `work.json` e `draft: true` no `en.md` da cena 1. Só a prévia a mostra. Para publicar: apague o `"draft": true` do `work.json` **e** o `draft: true` do capítulo (e ponha `date: AAAA-MM-DD`, se quiser que apareça em "Últimas atualizações"). Quando só uma das duas linhas é apagada, a obra aparece em Histórias com o botão cinza "Em breve".

## 6. Página Histórias e carrosséis

### Ordem das histórias

O visitante escolhe **Lançamento**, **Cronológica** ou **Alfabética** e pode inverter. Os números ficam em cada `work.json`, no campo `"order": {"release": 2, "chrono": 30}`.

- **Lançamento** (`release`): Alô? Residência dos Di Vario 1, Pederneira 2, Luz & Sangue 3, Ossos do Ofício 4, Beira de Estrada 5, O Pêndulo 6. Novas obras: 7, 8…
- **Cronológica** (`chrono`): segue a **posição da obra na planilha da linha do tempo**, guardada completa (inclusive obras que ainda não estão no site) em `cronologia.json`. Hoje: Ossos do Ofício 4, Luz & Sangue 5, Pederneira 6, Beira de Estrada 7, O Pêndulo 11.
- Obras **sem** número cronológico (como *Alô? Residência dos Di Vario*, `"chrono": false`) somem só nessa ordem.

### "Estou lendo em ordem" no fim de cada capítulo (só no site novo, Astro)

No fim de cada capítulo (entre o texto e os comentários) e, desde 22/10, também na **página de cada obra**, logo depois da lista de capítulos (ex.: `/pt/works/light-and-blood/`; a "história atual" é a da página), há uma caixa com a frase **"estou lendo em ordem"** (ou "estou assistindo…" / "estou jogando…", conforme o tipo da história em que o visitante está) e um seletor **Cronológica / Lançamento**. À esquerda fica a história que vem **antes** nessa ordem, à direita a que vem **depois**; o botão diz "Ler …", "Assistir …" ou "Jogar …" conforme o tipo da história de **destino**, sempre numa linha só (o site diminui a letra se o título for comprido, nunca corta).

**Para onde cada lado leva (desde 22/10, seu pedido "Mude de volta…"):** história com **mais de um capítulo** → a **lista de capítulos** dela (a página da obra); história com **um capítulo só** → o capítulo. Os dois lados levam ao mesmo lugar (a regra de 21/10, "último capítulo da anterior, primeiro da seguinte", saiu). Contam só os capítulos que existem ali (no site publicado, os publicados; na prévia, também os rascunhos). Obra de link externo, como *Alô? Residência dos Di Vario*, continua levando ao link externo, em outra aba.

**História que só existe em outro idioma (desde 22/10, seu pedido sobre *Ossos do Ofício*):** numa página em português, uma história que não tem capítulo em português mas tem em inglês entra na caixa com o botão em português ("Ler Ossos do Ofício") e leva à página **em inglês** (o link vai marcado com o idioma de destino, para leitores de tela e buscadores). Vale para qualquer história e para o contrário (página em inglês, história só em português). Hoje só *Ossos do Ofício* (rascunho: só na prévia). A caixa tem **o mesmo tamanho** nas duas ordens e em todos os capítulos: toda arte fica num quadrado do mesmo tamanho (a arte se encaixa dentro, inteira, encostada embaixo) e o lado vazio guarda o lugar. A primeira da ordem fica sem lado esquerdo e a última sem lado direito. O site lembra a ordem que o visitante escolheu (no navegador dele); na primeira visita vale a Cronológica.

- **Quem entra:** só as histórias que existem no site naquele momento, **que já têm algo lançado** e **que têm arte para a caixa** (`order_art` ou `order_images` no `work.json`; desde 22/10, seu pedido "Pule qualquer história que eu não tenha enviado imagens": a capa deixou de servir de plano B). No site publicado, as publicadas; na prévia, também as de rascunho que já têm capítulo. Hoje ficam de fora, por não terem arte, *O Pêndulo* e *Cat-Crow-Thing* (as duas ainda são rascunho); quando você mandar as imagens delas, elas entram sozinhas. Quando você publica uma história nova, quem vinha antes e depois dela se ajusta sozinho (use os números de `order` do `work.json`, como já faz).
- **Quem não tem número** na ordem (ex.: `"chrono": false`) não entra nela; nessa ordem, a caixa avisa que a história fica fora dela.
- **Nada de "Em breve" (desde 21/10):** uma história que ainda não tem nada lançado (rascunho sem capítulo; obra sem capítulo e sem link externo, que em Histórias é o cartão cinza "Em breve") é **pulada**: a caixa vai direto para a próxima já lançada (e com arte), para os dois lados. Hoje, no site publicado, depois de *Pederneira* na Cronológica não vem ninguém (as próximas são rascunho); na prévia vem a *Beira de Estrada*, que tem os dois capítulos provisórios.
- **A arte de cada lado, de três jeitos** (vale o primeiro que a obra tiver no `work.json`):
  1. **Camadas animadas (`order_art`)**: vários personagens empilhados que se mexem quando o mouse passa por cima (ou o link recebe o foco do teclado). Hoje: *Luz & Sangue*, *Alô? Residência dos Di Vario*, *Pederneira*, *Ossos do Ofício* (asas atrás, Giuseppe, olhos na frente; as três crescem e asas e olhos surgem; desde 22/10 o Giuseppe tem o tamanho dos seus "print giuseppe 2/3" e as asas **saem do quadrado da arte**, por trás da frase de cima, cortadas pela borda da caixa) e *Beira de Estrada* (Jean atrás, Cezar e Iris na frente, os olhos da Iris surgindo por cima; crescem, inclinam e se afastam). Veja o passo a passo logo abaixo. (Ossos e Beira são rascunho: só na prévia.)
  2. **Duas imagens (`order_images`)**: a primeira é a normal; a segunda **aparece quando o mouse passa por cima**, com um leve crescimento (sem o crescimento para quem pediu menos movimento no aparelho). Pode ser só uma (então não troca). Hoje nenhuma obra usa (a Beira de Estrada usava até 22/10).

  Sem nenhuma das duas, a história **não entra** na caixa (ver "Quem entra"; antes de 22/10 a capa aparecia no lugar).

  As imagens não são espelhadas: o personagem olha para onde o desenho olha, de qualquer lado em que fique.

#### Como montar a arte em camadas de uma obra nova (`order_art`)

O que você faz do seu lado:

1. **Uma tela de montagem.** No seu editor de imagens, monte os personagens como quer que apareçam **antes** do mouse e salve esse "composto" (ex.: `Luz e Sangue Site Cronologia.png`, 2087 × 1752). Salve outro como quer que fique **com o mouse por cima** (`… hover.png`), na **mesma tela**. Tudo o que o estado do mouse tiver de fora da tela é cortado, então o composto do mouse é que define o tamanho da tela (foi assim com Luz & Sangue e Pederneira).
2. **Um PNG por personagem**, com fundo transparente (ex.: `Ellie Site Cronologia.png`), em `static/ordem/`, com o nome que você deu. Mande para mim também os dois compostos: com eles, eu **meço** a posição, o tamanho e o giro de cada personagem (foi assim que as três artes de hoje foram feitas) e escrevo os números no `work.json`.
3. Diga o que acontece no mouse para o que não aparece nos compostos (ex.: "o Thymorr começa um pouco mais para o centro e some").

O que fica escrito em `content/works/<obra>/work.json` (exemplo real, resumido, de *Pederneira*):

```json
"order_art": {
  "size": [2002, 2023],
  "layers": [
    { "image": "ordem/Thymorr Site Cronologia.png", "x": 62.18, "y": 44.52, "width": 61.66, "opacity": 0, "hover": { "x": 69.18, "opacity": 1 } },
    { "image": "ordem/Harry Site Cronologia.png", "x": 32.19, "y": 70.19, "width": 50.3, "hover": { "x": 27.3, "y": 71.56, "width": 53.85, "rotate": -5.54 } },
    { "image": "ordem/Olivia Site Cronologia.png", "x": 55.09, "y": 65.42, "width": 46.25, "hover": { "x": 55.48, "y": 63.54, "width": 48.9 } }
  ]
}
```

| Campo | O que é |
|---|---|
| `size` | `[largura, altura]` da tela de montagem, em pixels. Só importa a **proporção**: a tela inteira se encaixa no quadrado da arte (tela larga ocupa a largura toda; tela alta, a altura toda), sem deformar e sem cortar. |
| `layers` | As camadas **de trás para a frente**: a última fica na frente (Ellie na frente de John e Oliver; Olivia na frente do Harry; o Thymorr, atrás de todos; as asas atrás do Giuseppe e os olhos na frente dele). |
| `image` | O PNG da camada, dentro de `static/` (ex.: `ordem/Ellie Site Cronologia.png`). |
| `x`, `y` | O **centro** da camada, em % da largura (`x`) e da altura (`y`) da tela. |
| `width` | A largura da camada, em % da largura da tela. A altura acompanha o desenho, sem deformar. |
| `rotate` | Giro, em graus, em volta do centro (positivo = para a direita). Opcional. |
| `opacity` | De 0 (invisível) a 1. Opcional (padrão 1). |
| `hover` | **Só o que muda** com o mouse por cima (`x`, `y`, `width`, `rotate`, `opacity`); o que não aparece aqui fica como estava. Sem `hover`, a camada fica parada. |
| `bleed` | (opcional, fica ao lado de `size` e `layers`) `true` = as camadas podem **sair do quadrado da arte** até a borda da caixa, que funciona como máscara de camada (corta no canto arredondado), sempre **por trás** da frase "estou lendo em ordem" e do seletor, e sem pegar o clique (o seletor e a outra história continuam clicáveis). Use com `size` **quadrado** (ex.: `[1000, 1000]`): aí `x`, `y` e `width` valem em % do quadrado da arte e podem passar de 0–100 (as asas do Giuseppe têm `width` 265 a 282). No celular (até 700 px) a caixa é estreita e as duas artes ficam lado a lado, então ali o quadrado volta a cortar (as asas não cobrem a outra história). Hoje só *Ossos do Ofício*. |

Como se comporta: **uma transição só** (0,6 s, suave, a mesma para todas as camadas) leva do começo ao estado do mouse, e volta quando o mouse sai; vale também para o teclado. Sem JavaScript a composição já aparece (é só CSS). Para quem pediu **menos movimento** no aparelho nada anima: a arte que só se mexe (Luz & Sangue, Alô?) fica parada; a que tem algo surgindo (Pederneira, Ossos, Beira) troca **de uma vez** para o desenho do mouse, com tudo no lugar (os olhos em cima do rosto). **Uma camada que tem de acompanhar outra** (os olhos do Giuseppe, os da Iris): se o PNG tem o mesmo tamanho do personagem (como os olhos da Iris), use os mesmos números; se tem outro tamanho (os olhos do Giuseppe), me mande, que eu calculo a posição para os dois ficarem colados durante a animação inteira. No celular a composição encolhe junto com a coluna, sem rolagem para o lado. Se uma imagem do `order_art` não existir em `static/`, o build avisa. Se a obra tiver `order_art` **e** `order_images`, as camadas ganham. Os mesmos arquivos passam pelas versões leves (WebP) do site; o John, que é pequeno (216 × 448), não é ampliado além do tamanho real dele.

Para **mudar** uma arte que já existe (afastar mais o Lucas do Wellersson, o Thymorr começar mais perto do centro…), mexa só nos números do `hover` (ou me peça).

- **Textos da caixa:** estão em `src/lib/textosDaOrdem.ts` (não no `config.json`). Os em inglês são uma proposta, para você aprovar ou trocar.

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

- **Carrossel da home:** mostra no máximo **4** histórias (pedido seu de 21/10/2026, só no site novo, Astro; o site antigo mostrava 5), sempre as atualizadas mais recentemente (data do último capítulo/episódio, ou `"updated": "AAAA-MM-DD"` no `work.json`). No computador cabem as 4 lado a lado, sem rolar, e a seta da direita **é** o link para Histórias: ao passar o mouse (ou chegar nela com Tab) aparece "Ver todas as histórias", e o clique leva direto. No celular e no tablet (até 1000 px de largura) os cartões rolam para o lado e o botão "Ver todas as histórias" fica sempre visível logo abaixo. Mudar o número: `HISTORIAS_NA_HOME` em `src/lib/home.ts`.
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
- **Tutti** está fora dos Emissários desde 22/10/2026 (pedido seu): `draft: true` em `content/emissaries/tutti/en.md` e `pt.md` (o `config.json` não mudou). Para recolocá-lo, apague essa linha nos dois arquivos.
- **Adolas Podcast:** este guia dizia que ele estava fora (`draft: true`), mas hoje os arquivos dele não têm essa linha e ele aparece na Sobre. Para tirá-lo, é a mesma coisa que o Tutti.

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
- **Resumo cortado (só no site novo, Astro; pedido seu de 21/10/2026):** sem `summary:`, o resumo são as primeiras ~130 letras do texto; quando ele é cortado, as últimas palavras somem num degradê e o link vira "…leia mais". Com `summary:` escrito por você, o resumo aparece inteiro e o link fica "leia mais", como antes. (Em "Últimas atualizações", na home, o resumo cortado continua com "…", como antes.)
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
- **Reddit, X e Instagram aparecem sozinhos, como antes, numa moldura isolada (só no site novo, Astro).** Você continua escrevendo `{{embed:…}}` igual e **nada em `content/` muda**. O visitante vê o post do mesmo tamanho e jeito de antes, sem clicar em nada; a diferença é por dentro: o programa da rede social roda dentro de uma moldura, no endereço dela, e não consegue ler a sessão de quem comenta (item B27 do backlog; explicação na lição 08 de Astro). Sem JavaScript, fica o texto do código, como antes. Nas alternâncias (`A | B | C`), cada post aparece quando o painel dele é aberto. Vídeos do YouTube e do TikTok continuam como eram.
- **Código de incorporação colado à mão** (`content/embeds/*.html`): o `<script>` que vem junto é **tirado** na hora de montar a página (o texto e o link do post ficam, e a moldura é criada no navegador). O terminal avisa se achar um script de outra origem.
- **Se a rede social estiver fora do ar ou bloqueada** (por exemplo, um bloqueador de anúncios), depois de 30 s volta o texto do código com o link, como no site antigo quando o script não carregava.
- **Teste no seu computador antes da virada** (eu não tenho internet no sandbox e não pude ver os três serviços de verdade): `pnpm dev` e abra `/pt/news/2024-04-29-hygranocianos/` (X), `/pt/news/2024-02-23-avialuna-aeternogyrinians/` (Reddit) e `/pt/news/2025-04-14-speedpaint-pederneira/` (Instagram); compare com o site no ar (tamanho, cantos, sombra, vídeo, tela cheia, links abrindo em outra aba) e me diga se viu alguma diferença.

## 12. Comentários

Contas + comentários próprios do site (sem Disqus), no Supabase. Como ligar, login com Google e edição: `docs/comentarios-supabase.md`.
Cada capítulo e cada notícia tem comentários; a conversa é a mesma nos dois idiomas. Sem o Supabase configurado, no site publicado não aparece nada e, na prévia local, aparece um aviso no lugar.
No site novo (Astro) a caixa funciona igual; por dentro, ela usa um script próprio com o supabase-js numa versão fixa, e o banco passou a ter migrações versionadas em `supabase/migrations/` (como usar daqui para frente: `docs/comentarios-supabase.md`, seções 5 e 6). Você não precisa fazer nada no Supabase por causa disso.
Os comentários ficam numa caixa própria, separada da caixa do capítulo ou da notícia (nas três versões de notícia: comum, com fundo e colagem). Nos botões de anterior/próximo do fim da notícia, o título da notícia vizinha é cortado em 40 caracteres com "…" (o título inteiro aparece ao passar o mouse); isso é automático, não muda o título da notícia.

## 13. Menu e Extras

- *Stories* e *About* sempre aparecem; *News Feed* aparece quando há notícias publicadas; *Support* aparece quando existir a página `content/pages/support/` sem `draft: true`.
- *Extras* agrupa Universo, Personagens e qualquer página com `menu: extras` no topo.
- **Extras retirado por enquanto:** `config.json → "show_extras": false` (menu, páginas de Universo/Personagens e o botão da home). Para voltar, troque para `true`.

### Redes sociais do rodapé e os canais do YouTube (desde 21/10)

- O rodapé de todas as páginas mostra o ícone de cada rede (Instagram, YouTube, TikTok, X). Os endereços vêm do `config.json → socials`.
- **O ícone do YouTube leva ao canal do idioma da página** (só no site novo, Astro): páginas em inglês → `https://www.youtube.com/@HateCycleEn`; páginas em português → `https://www.youtube.com/@HateCycleBR`. Esses dois endereços moram em **um lugar só**: `src/lib/canais.ts` (`CANAIS_DO_YOUTUBE`, uma linha por idioma). Para trocar um canal, troque a linha do idioma ali (ou me peça); o `config.json` não precisa mudar, e o endereço antigo dele (`@HateCycle`) deixa de aparecer no site novo.
- Outro lugar do site que precise levar ao canal do Hᴀᴛᴇ Cʏᴄʟᴇ deve usar o mesmo mapa (`canalDoYoutube(lang)`), para as duas línguas ficarem sempre certas.
- **Página Apoio (português):** o link "Inscreva-se no canal no YouTube" leva ao **seu canal pessoal**, `https://www.youtube.com/@LuscaSharktopus` (escrito direto em `content/pages/support/pt.md`; vale nos dois geradores). A página Apoio em inglês não tem link de YouTube.

## 14. Aparência: cores, fontes e seus ajustes

- O visual fica todo em `static/style.css`. No topo do arquivo estão a paleta da marca (`--green`, `--mint`, `--teal`, `--cyan`, `--night`)
  e as fontes (`--font-text` = Lexend, `--font-head` = Oswald).
- **Seus ajustes pessoais: `static/custom.css`.** Coloque aqui qualquer ajuste de aparência seu. Esse arquivo é carregado depois do `style.css` e ganha dele.
  Quando chegar uma versão nova do site, o `style.css` pode ser substituído sem apagar os seus ajustes — só **não** substitua o `custom.css` (as atualizações nunca o trazem).
- **Fontes (site novo):** as fontes agora vêm do próprio site, não do Google. Os nomes não mudaram: no seu texto (`style="font-family: 'Road Rage'"`) e no `custom.css` valem **Lexend, Oswald, Vollkorn SC, Noto Emoji, PT Serif e Road Rage**, como sempre. Cada uma só é baixada pelas páginas que a usam.
  **Para usar uma fonte nova no texto:** peça à Claude ("quero usar a fonte X no texto"). Ela acrescenta a fonte à lista em `tools/gerar_fontes_css.mjs`, instala o pacote `@fontsource` dela (com versão fixa), gera de novo o `src/styles/fontes.css` e você passa a escrever `font-family: 'Nome da Fonte'`. (O site Python antigo, que ainda existe até a virada, só conhece as seis fontes acima.)
- **Tamanho do logo no topo:** em `static/custom.css`, acrescente `:root { --logo-w: 160px; }` (ajuste o número).
- **Cache do navegador:** os arquivos de estilo/script levam um carimbo (`?v=...`) que muda sozinho a cada alteração, e a prévia (`serve`) não usa cache.
  Assim o navegador nunca mostra uma versão velha do site depois de uma atualização.

## 15. Imagens

- Todas as suas imagens (IMAGENS.zip) já estão em `static/` com os nomes certos (o zip original trazia acentos quebrados, como `#U00e1`; foram corrigidos).
- A pasta `static/Produtos` ainda não é usada por nenhuma página.
- `guardados/` guarda arquivos para uso futuro; essa pasta **não** é publicada.
- Capas: `static/covers/EN/` e `static/covers/PT/`; logos das obras: `static/logos/`; imagens das notícias: `static/news/`.
- **Capa nova:** coloque o arquivo em `static/covers/PT/` (ou `EN/`) com o nome que o `work.json` usa e **não precisa reduzir nem otimizar**: pode ser o PNG ou JPEG grande de sempre. No site novo o build gera sozinho as versões leves em WebP (a capa de 3,5 MB chega ao visitante com ~44 KB) e o navegador escolhe a do tamanho da tela. O arquivo original continua publicado e é o `src` da imagem. Vale para **qualquer** PNG ou JPEG de 30 KB para cima: logos, imagens de notícias, emissários, páginas de quadrinho.
- **Imagem no meio do texto:** `![descrição](/other images/arquivo.png)` ou `<img src="/other images/arquivo.png" alt="descrição">` funcionam como sempre; o site acrescenta sozinho as versões leves (e `width`/`height`, para o texto não pular). Se você já puser `width`, `height` ou um `srcset` seu na tag, o site respeita o seu. **GIF animado** também ganha versão leve (WebP animado, sem perda: mesmos quadros, mesmos tempos, mesma repetição; o `src` continua o seu GIF). **Não são otimizados:** vídeos, imagens de outro endereço e arquivos abaixo de 30 KB.
- **Trocar uma imagem:** salve por cima, com o mesmo nome; as versões leves são refeitas no próximo build (e na prévia) sozinhas.
- **O que acompanha cada tipo:** pessoas com tela de celular recebem versões de ~280 a 560 px nas capas, de até 900 px nos capítulos e de até 1800 px nas tiras e páginas de quadrinho (para ficarem nítidas ao dar zoom).

## 16. Tela de abertura

Na primeira página de cada visita aparece `static/intro/fundo.png` (no site novo, uma versão leve em JPEG gerada dele; troque o `fundo.png` normalmente) cobrindo a tela e a animação da logo (`static/intro/logo.webm`);
os dois desvanecem juntos quando a página termina de carregar, mas só depois de a logo ter aparecido por inteiro (`min_ms`).
Não repete nas páginas seguintes da mesma visita, e não aparece para quem pediu "reduzir movimento" no sistema.

- Ajustes em `config.json → "intro"`: `enabled` (liga/desliga), `min_ms` (tempo mínimo na tela, padrão 4200) e `max_ms` (limite máximo, padrão 10000).
- Para rever no seu computador: abra `http://localhost:8000/?intro=1`.
- A animação original (4K, 11 MB) foi convertida para 1080p mantendo a transparência: 1,1 MB (`static/intro/logo.webm`). No site novo o visitante baixa uma versão **720p** dela (~0,5 MB, mesma duração, mesmos quadros, com a transparência), guardada em `src/assets/intro/`; o seu arquivo em `static/intro/` continua intacto e publicado.
- **Trocar o vídeo da abertura:** salve o novo por cima de `static/intro/logo.webm` (WebM VP9 com transparência, como o atual). Até alguém refazer a versão 720p, o site mostra o **seu vídeo novo em tamanho original** (funciona, só pesa mais; o build avisa no terminal). Para refazer: `python3 tools/gerar_video_da_abertura.py` (precisa do ffmpeg com libvpx-vp9 instalado; ou peça à Claude), depois `pnpm test`. Se mudar o **nome** do arquivo, mude também `config.json → intro.video`.
- **Trocar um GIF animado** (`static/other images/Apollo Site.gif`, `Anfíbio Site.gif`, `no-i-cant.gif`): salve por cima com o mesmo nome; o WebP animado é refeito sozinho no próximo build, com os tempos do GIF novo. Um GIF animado **novo** em um texto também ganha a versão sozinho. O teste `tests/animadas.test.ts` guarda a lista dos três GIFs e seus tempos; ao trocar um, peça à Claude para atualizar a lista.

## 17. Runas no fundo

Cada página ganha uma "impressão rúnica" própria, sorteada a partir do endereço da página (sempre a mesma para a mesma página).
Está em `rune_imprint()` no `build.py`: lista de símbolos em `RUNES`, quantidade (`n=26`, e nenhuma runa encosta em outra), tamanhos (`size`), giro máximo (±45° em `rot`) e brilho/ritmo (`lo`, `hi`, `dur`).
As fontes Noto vêm do Google Fonts, restritas a esses símbolos (no site novo, são recortes das mesmas fontes servidos pelo próprio site, `src/assets/fontes/runas/`; se você mudar a lista `RUNES`, peça à Claude para regenerar os recortes; hoje são 111 símbolos. Para acrescentar runas, mande os símbolos: a Claude põe no fim da lista nos dois geradores e refaz as fontes. Atenção: com a lista maior, o desenho do fundo de todas as páginas muda). O estilo e a animação ficam no fim do `style.css` (`.runes`); quem pede "reduzir movimento" no sistema vê as runas paradas.

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
- Depois da virada, o site antigo continua guardado na branch `site-antigo` do GitHub (cópia de segurança; como voltar a ele: `docs/virada.md`).
- O que foi migrado do site antigo, e o que não foi, está em `docs/HISTORICO.md`.
