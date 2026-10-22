# Histórico do site

Registro das mudanças anunciadas a cada versão/rodada do site. Até 15/10/2026 essas notas ficavam no `LEIA-ME.md`; foram trazidas para cá na tarefa T02 **com o texto original preservado** (seção "Registro original", abaixo). O que nelas é instrução de uso também está, atualizado, em `docs/guia-do-autor.md`.

A partir da migração para Astro, cada tarefa concluída fica registrada em `docs/BACKLOG.md` (coluna Status) e no histórico do git.

## Linha do tempo (git local)

| Data | Marco |
|---|---|
| 14/10/2026 | Autor aprova a migração para Astro (decisões em `docs/ARQUITETURA.md`). |
| 15/10/2026 | Estado atual do site (gerador Python) registrado no git antes da migração. |
| 15/10/2026 | T01: skills do projeto, backlog da migração e mapa de aprendizado do Astro. |
| 15/10/2026 | T02: `CLAUDE.md`, regras em `.claude/rules/`, documentação em `docs/`; `LEIA-ME.md` vira porta de entrada e `COMENTARIOS-LEIA-ME.md` vira `docs/comentarios-supabase.md`. |

## Concluído a partir do que estava "guardado para uso em breve"

O antigo LEIA-ME listava como guardados:

> - **Imagem:** `guardados/no-i-cant.gif` ("NO... ...I CAN'T...", 943×376). Fica fora do site até ser usada (a pasta `guardados/` não é publicada).
> - **Fontes a usar:** **Road Rage** e **PT Serif** (ambas do Google Fonts; carregar com um `<link>` por família, como as demais).

Os três **já foram usados** na cena 1 de *Ossos do Ofício* (`content/works/all-in-a-nights-work/01/en.md`): o GIF está em `static/other images/no-i-cant.gif` (classe `.s1-gif`), Road Rage na frase de destaque (`.rr`) e PT Serif em #111012 no trecho do sonho (`.ps`). As duas fontes entram no `<link>` do Google Fonts do `shell()` no `build.py` (num único `<link>` junto com as demais, e não um por família). A cópia original do GIF continua em `guardados/`.

## Notas de leitura — o que mudou desde que cada nota foi escrita

As notas abaixo são de rodadas diferentes e às vezes se contradizem. Conferido no código e no conteúdo em 15/10/2026:

- **Ossos do Ofício:** não está mais em rascunho nem com `"listed": false`. Hoje a obra está listada (`"listed": true`, aparece como "Em breve") e o capítulo `01` está pronto só em inglês, com `unlisted: true`.
- **Ordem cronológica:** os números 10/20/30/40/50 de "Novidades desta versão" foram substituídos pela posição na planilha `cronologia.json`: Ossos do Ofício 4, Luz & Sangue 5, Pederneira 6, Beira de Estrada 7, O Pêndulo 11 (Alô? sem número). Lançamento: Alô? 1, Pederneira 2, Luz & Sangue 3, Ossos 4, Beira de Estrada 5, O Pêndulo 6.
- **O Pêndulo:** "Outros ajustes desta rodada" diz oculto, "Quase tudo pronto" diz visível; hoje está **oculto** (`"listed": false`).
- **Beira de Estrada:** citada como "em breve"; hoje está **oculta** (`"listed": false`).
- **Saf:** "Quase tudo pronto" diz oculta (`"hide": ["saf"]`); hoje a lista `hide` está vazia, então ela **aparece**.
- **Notícias:** eram 18; hoje há 83 pastas em `content/news/`. O Feliz Natal dos di Vario (citado como rascunho) está publicado. Não há mais notícias com `draft: true` nem `PENDENTE`.
- **`NOTICIAS-PENDENTES.md`** (posts do Reddit) é citado, mas o arquivo não existe mais no projeto; os posts do Reddit estão hoje em `content/embeds/reddit-*.html`.
- **Páginas de exemplo:** restam 2 personagens (`harry`, `olivia-purinna`) e 1 página do universo (`hidden-magic`) com `draft: true`.
- **Comentários:** o arquivo `COMENTARIOS-LEIA-ME.md` citado nas notas agora é `docs/comentarios-supabase.md`.
- **Caminhos de imagem em HTML cru:** a nota "escreva a partir da raiz e inclua o `base_url`" foi superada pelo prefixo `@/` (ver o guia).
- **Versão do Python:** as notas dizem "Python 3.8+"; o gerador atual precisa do 3.12 ou mais novo.

## Registro original (texto do LEIA-ME até 15/10/2026)

### O que veio do site antigo

- Firestriker/Pederneira, Luz & Sangue, HDVR e as "outras histórias" já estão migrados. *All in a Night's Work / Ossos do Ofício*
  está como rascunho e oculto (o texto de `night.html` já está em `content/works/all-in-a-nights-work/`; tire `draft: true` e
  `"listed": false` quando quiser publicar).
- As URLs antigas (`firestriker.html`, `PT.html`…) redirecionam para as novas (lista em `config.json → redirects`).
- Há 3 páginas de exemplo (notícia, 2 personagens, 1 do universo) marcadas como `draft: true` — edite ou apague.
- `produtos.html`, `estrada.html` e `roadside.html` não foram migrados (estavam vazios ou eram só uma lista de imagens).

### Novidades desta versão

- **Ordem das histórias** (página Histórias): o visitante escolhe Lançamento, Cronológica ou Alfabética e pode inverter. Os números ficam em cada
  `work.json`, no campo `"order": {"release": 2, "chrono": 30}`. Obras **sem** número cronológico (como *Alô? Residência dos Di Vario*) somem só nessa ordem.
  Números já usados: cronológica → Ossos do Ofício 10, Luz & Sangue 20, Pederneira 30 (Beira de Estrada = 40 e O Pêndulo = 50, quando existirem);
  lançamento → Alô? 1, Pederneira 2, Luz & Sangue 3, Ossos do Ofício 4 (novas obras: 5, 6…).
- **Páginas Histórias e Sobre:** o texto de cada página fica em `content/pages/project/` (Histórias) e `content/pages/about/` (Sobre). Dentro do texto,
  as linhas `{{stories}}`, `{{emissaries}}` e `{{other-stories}}` marcam onde entram os cards. Mude a ordem mudando as linhas de lugar.
- **Outros Emissários:** cada pasta em `content/emissaries/` tem `title` (nome), `role` (função), `image` (ex.: `emissaries/saf.png`, quadrada, dentro de `static/`),
  o texto breve (embaixo do `---`) e links: `instagram`, `tiktok`, `youtube`, `x`, `bluesky`, `website`, `email`. Cinco por linha; o sexto desce para a linha de baixo
  (em telas menores, 3 ou 2 por linha).

### Ajustes recentes (resumo)

- **Datas dos episódios:** campo `date: AAAA-MM-DD` no topo de cada capítulo/episódio (aparece na lista e sob o título; em português sai como "18 de ago. de 2026").
- **Fonte própria de uma história:** em `work.json`, `"reading_font": "times"` (usado em *Ossos do Ofício*).
- **Texto em volta de uma imagem:** a imagem com `class="jusep"` (Giuseppe) flutua à esquerda e o texto acompanha o contorno do desenho (precisa ser PNG com fundo transparente).
- **Carta que vira:** só gira ao **clicar** (clique de novo para voltar; também funciona com Tab + Enter).
- **Cache do navegador:** os arquivos de estilo/script agora levam um carimbo (`?v=...`) que muda sozinho a cada alteração, e a prévia (`serve`) não usa cache.
  Assim o navegador nunca mostra uma versão velha do site depois de uma atualização.

### Imagens

Todas as suas imagens (IMAGENS.zip) já estão em `static/` com os nomes certos (o zip original trazia acentos quebrados, como `#U00e1`; foram corrigidos).
A pasta `static/Produtos` ainda não é usada por nenhuma página.

### Notícias

18 notícias cadastradas (vídeos do canal Hello? Di Vario Residency, posts do Instagram, o lançamento de Pederneira em 18/04/2025, a postagem da aba Comunidade
e 7 posts do X). Nos vídeos curtos do YouTube o vídeo aparece incorporado na própria notícia. Os posts do Reddit estão em `NOTICIAS-PENDENTES.md`.

### Notícias: design, páginas, busca e posts incorporados

- **Visual:** data, título grande, miniatura quadrada à esquerda, etiquetas (tags) e resumo com "leia mais", como no seu design.
  A miniatura é o campo `thumb:` do cabeçalho da notícia (as imagens ficam em `static/news/`, uma por notícia).
- **Ordem:** sempre pela **data da notícia** (`date:`), não pela ordem em que você adiciona. É só preencher a data certa.
- **10 por página**, com números de página no fim (1 2 3 … Próxima), como numa pesquisa do Google. Há uma barra de busca no topo
  que procura em todas as notícias (título, tags, data e texto), sem diferenciar maiúsculas nem acentos.
- **Posts do Instagram, Reddit e X:** salve o código de incorporação em `content/embeds/nome.html` e, no texto da notícia, escreva `{{embed:nome}}` onde o post deve aparecer.
- **Rascunho:** `draft: true` esconde a notícia do site publicado (ela continua aparecendo no `python build.py serve`).

### Outros ajustes desta rodada

- A busca da página Histórias agora considera **só o título** (não a sinopse).
- **O Pêndulo** está oculto dos carrosséis (`"listed": false` no `work.json`; troque para `true` quando quiser mostrá-lo).
- Emissários: textos atualizados; link do YouTube do Adolas Podcast adicionado; trecho sobre a Safe Haven removido do Sobre.
- Nas notícias em português, o canal aparece como "Alô? Residência dos di Vario".

### Notícias (layout novo)

- Visual igual ao mockup: data, título, miniatura quadrada à esquerda (`thumb: news/nome.png` no cabeçalho da notícia), etiquetas e resumo com "leia mais".
- 10 notícias por página, números de página no fim (como numa busca do Google) e caixa para buscar notícias (título, etiquetas e texto).
- A ordem é sempre pela **data** da notícia (`date:`), não pela ordem em que foi adicionada. Pode cadastrar notícias antigas depois que elas entram no lugar certo.
- Posts incorporados (Instagram, Reddit, X): salve o código em `content/embeds/nome.html` e escreva `{{embed:nome}}` no texto da notícia.
- Notícia com `draft: true` (ex.: o Feliz Natal dos di Vario) só aparece no `python build.py serve`, não no site publicado.
- A busca da página Histórias considera apenas o título.
- *O Pêndulo* está oculto dos carrosséis (`"listed": false` no `work.json`).

### Rodada "Quase tudo pronto" — como ligar/desligar coisas

- **Textos dos Emissários** (ocultos por enquanto): em `config.json`, `"emissaries": { "show_texts": false, ... }` → mude para `true` para mostrá-los de novo.
- **Saf** (oculta por enquanto): em `config.json`, `"emissaries": { "hide": ["saf"] }` → deixe a lista vazia (`[]`) para ela voltar.
- **O Pêndulo na página de Histórias**: está visível. Para ocultá-lo de novo (lançar sem ele), abra `content/works/the-pendulum/work.json` e troque `"listed": true` por `"listed": false`.
- **Tamanho do logo no topo**: em `static/custom.css` (seu arquivo), acrescente `:root { --logo-w: 160px; }` (ajuste o número).
- **Carrossel da home**: mostra no máximo 5 histórias, sempre as atualizadas mais recentemente (data do último capítulo/episódio, ou `"updated": "AAAA-MM-DD"` no work.json). No fim, a seta vira o botão "Ver todas as histórias".
- **Página de Histórias**: grade fixa de 4 por linha (2 em telas médias, 1 em celulares).
- **Últimas Atualizações (home)**: se um episódio novo e a notícia sobre ele saíram em até 3 dias, aparece só um cartão (o do episódio, com o texto da notícia).
- **Notícias**: o título não é link (use a miniatura ou "leia mais"). Posts do Twitter/X: em português só o post incorporado; em inglês, o texto traduzido + post.

### Posts incorporados nas notícias (centralizados, com botão de alternar)

- Os posts incorporados ficam **centralizados**.
- Para incorporar, escreva numa linha só, no texto da notícia: `{{embed:nome-do-arquivo}}` (arquivo em `content/embeds/`) **ou** direto o link: `{{embed:https://x.com/usuario/status/123…}}`. Links aceitos: X/Twitter, Instagram (post ou reel), TikTok, YouTube (vídeo ou Short) e Reddit.
- Para o "alt" (o leitor alterna entre dois ou mais posts, com botões ao lado): separe com `|` — `{{embed:link-do-X | link-do-Instagram | link-do-TikTok}}`. Os botões levam o ícone/nome de cada rede.
- Notícias em **rascunho** têm `draft: true` no começo do arquivo (pt.md e en.md): apague essa linha para publicar. Se ainda houver `{{embed:PENDENTE-1}}`, troque pelo link do post. Para achar pendências, procure `PENDENTE` ou `draft: true` em `content/news/`.
- Comentários: as notícias já têm o espaço para comentários, igual aos capítulos. Ele só aparece no site publicado depois que o Supabase for configurado (veja COMENTARIOS-LEIA-ME.md); na prévia local aparece um aviso no lugar.

