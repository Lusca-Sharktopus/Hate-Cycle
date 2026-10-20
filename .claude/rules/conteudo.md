---
paths:
  - "content/**"
  - "cronologia.json"
---

# Regras de conteúdo (textos do site)

Valem para tudo dentro de `content/` e para `cronologia.json`. Procedimento passo a passo: skill `hc-conteudo`. Guia para o autor: `docs/guia-do-autor.md`.

## Marca: Hᴀᴛᴇ Cʏᴄʟᴇ × Hate Cycle

Duas grafias, dois significados. **Não são intercambiáveis.**

- **Hᴀᴛᴇ Cʏᴄʟᴇ** (versalete Unicode) = a **marca** e o **universo compartilhado** (contos, quadrinhos, jogos, filmes, o sistema de RPG, a Especulação Evolutiva, o merchandise etc.). É o padrão: universo, marca, site, projeto como um todo.
- **Hate Cycle** (caixa normal) = **somente** a futura **série de animação**, primeiro projeto do universo a ser idealizado (nasceu como webcomic de Apollo e O Anfíbio). É a obra de onde o universo cresceu, como os nove filmes de Star Wars deram origem à marca Star Wars.
- Usos corretos de caixa normal hoje: `cronologia.json` (linha da série, `"media": "animated-show"`) e o trecho histórico de `content/pages/project/{en,pt}.md` que fala da webcomic original ("…Hate Cycle soon became more than that"). O versalete aparece no `config.json` (nome do site, textos da capa, "Histórias Hᴀᴛᴇ Cʏᴄʟᴇ"), nas páginas Sobre e O Projeto e nas notícias.
- Na dúvida, pergunte. Não "corrija" o texto do autor sem confirmar. Ao traduzir, aplique a mesma regra nos dois idiomas.

## Ortografia e pontuação

- **Trema** (ortografia anterior ao acordo de 1990) quando o "u" é pronunciado após g/q: lingüista, freqüência, conseqüência, agüentar, tranqüilo. **Exceção:** "equivalente" e "equivale" ficam sem trema.
- **Aspas e apóstrofos curvos** (“ ” ‘ ’) no texto corrido que você escrever. Ao copiar texto do autor, mantenha exatamente o que ele escreveu (inclusive aspas retas).
- **Texto final do autor é final.** Não reescreva, não "melhore". Erros aparentes (inclusive de PDF: frases cortadas, "It 's"): mantenha e aponte na resposta.

## Versalete e transcrições fonéticas

- Versalete se escreve com as letras Unicode direto no texto: `ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡʏᴢ` (não existe "x"). Ex.: `Hᴀᴛᴇ Cʏᴄʟᴇ`, `Sᴇɴʜᴏʀ`, `Lᴏʀᴅ`. O `build.py` (`smallcaps()`) troca por `<span class="hc">Hate Cycle</span>`, versalete de verdade no CSS (`.hc`), porque Lexend e Oswald não têm esses glifos.
- **IPA:** trecho entre barras com símbolos fonéticos (`/ɦaʊ̯.ˈʔu.ᵐbʷa/`, 2 a 40 caracteres, sem espaço) vira `<span class="ipa">` em Arial. Dentro da transcrição as letras como ʏ ou ʀ **não** viram versalete. Só conta como IPA se tiver algum símbolo fonético que não seja do alfabeto de versalete.

## Bilíngue

- Cada item é uma pasta com `en.md` e `pt.md`. Existe só num idioma? Apague o outro arquivo (pergunte antes ao autor se é para traduzir).
- O **mesmo nome de pasta** nos dois idiomas (é o que liga as versões, os `[[links]]` e os IDs de comentários).
- **Não renomeie pastas** de obra, capítulo ou notícia já publicadas: muda a URL e o ID dos comentários (`works/<obra>/<capítulo>`, `news/<slug>`), e as conversas somem.

## Front matter (`---` no topo do `.md`)

Comuns: `title`, `date: AAAA-MM-DD`, `summary`, `image`, `tags: [a, b]`, `related: [universe/x, characters/y]`, `draft: true` (só aparece na prévia `serve`), `comments: false` (sem comentários).

- **Capítulo/episódio:** `date` (aparece na lista e sob o título; PT sai "18 de ago. de 2026"; entra em "Últimas atualizações"), `unlisted: true` (página existe e funciona, mas fica fora de listas, home e buscas — `noindex`), `chapter` (número exibido, se diferente da ordem), `youtube: ID` (vídeo), `pages_glob: comics/minha-hq/01/*.png` ou `pages: [..]` (HQ; ordem numérica).
- **Notícia:** `thumb: news/nome.png` (miniatura quadrada; imagens em `static/news/`), `tags`, `date` (a ordem é sempre pela data). Design especial: `backdrop_top` / `backdrop_bottom` (imagens sangrando até a borda da folha); colagem: `stickers` (linhas `arquivo | l3 t2 w26 a-4`) + `overlay`.
- **Página avulsa:** `layout: wide` (página larga, como Sobre), `menu: extras` (entra no menu Extras), `route: false` (não gera página própria).
- **Personagem:** `role`, `image`, `appears_in: [firestriker]`, `related`, `order`. **Universo:** `category`, `order`.
- **Emissário:** `title` (nome), `role` (função), `image` (quadrada, ex.: `emissaries/saf.png`), `order`, redes `instagram`, `tiktok`, `youtube`, `x`, `bluesky`, `website`, `email`; o texto breve vai abaixo do `---`.

## `work.json` (uma obra)

`kind` (`prose` | `comic` | `video`; `the-pendulum` está com `"film"`, valor que o gerador não trata de forma especial), `universe` (true = Histórias Hᴀᴛᴇ Cʏᴄʟᴇ; false = "Outras histórias"), `oneshot` (história de um capítulo só: o card vai direto ao capítulo), `title` / `blurb` / `cover` / `logo` / `cta` com `{"en": …, "pt": …}`, `divider` (imagem do divisor de cena), `order: {"release": n, "chrono": n}`, `reading_font: "times"` (Times New Roman no leitor, usado em Ossos do Ofício), `media`, `listed` (false esconde a obra das listas, mas a página de leitura continua existindo), `draft` (true = obra inteira em rascunho: some do site publicado em todo lugar e só aparece na prévia; tirar a linha para publicar), `order_images` (lista com 1 ou 2 imagens de `static/`, a normal e a que troca ao passar o mouse; arte do bloco "estou lendo em ordem" no Astro; sem ela vale a capa), `langs` (idiomas em que a obra aparece), `external` (link para fora: YouTube, Tapas…), `updated: "AAAA-MM-DD"` (conta como atualização para o carrossel da home).

### `media` (filtro da página Histórias)

`short-story` (Conto), `webcomic`, `live-ttrpg` (RPG ao Vivo), `short-film` (Curta-metragem), `animated-show` (Série Animada), `videogame`, `misc` (Miscelânea). Rótulos PT/EN em `MEDIA_LABELS` no `build.py`; tipo novo = acrescentar lá (o `build.py` está congelado: avise o autor que é a exceção).

### Ordens

- `order.release` = ordem de lançamento: Alô? Residência dos Di Vario (`hdvr`) 1, Pederneira 2, Luz & Sangue 3, Ossos do Ofício 4, Beira de Estrada 5, O Pêndulo 6. Obra nova: próximo número.
- `order.chrono` = **posição na planilha** `cronologia.json` (inclui obras ainda fora do site). Obra sem número cronológico (`hdvr`, `"chrono": false`) some só nessa ordem. Confira a planilha antes de atribuir.

## Mostrar / esconder

- Obra inteira em rascunho: `"draft": true` no `work.json` (hoje: Ossos do Ofício, Beira de Estrada e O Pêndulo; só a prévia as mostra; para publicar, apague a linha). `"listed": false` só tira a obra das listas e cartões (a página dela continua acessível por link) e não é o jeito de "guardar para depois".
- Obra sem capítulo publicado aparece com botão cinza "Em breve" (sem link).
- Capítulo/notícia: `draft: true` (só prévia) ou `unlisted: true` (capítulo acessível por link direto; na prévia o card ganha "👁 Prévia da página de leitura"). Lançar = apagar a linha.
- Emissário: `draft: true` nos dois `.md` ou `config.json → "emissaries": {"hide": ["slug"]}`; textos de todos: `"show_texts"`.
- Extras (Universo, Personagens): `config.json → "show_extras"`.
- **Não edite `config.json`**: diga ao autor qual chave mudar.

## Markdown do site (`make_md()` no `build.py`)

- Linha em branco = novo parágrafo; quebra simples vira espaço; dois espaços ou `\` no fim = `<br>`.
- `*itálico*`, `**negrito**`, `[texto](url)`, `## título`, listas `- `, citações `> `.
- `![legenda](pasta/imagem.png)` sozinho no parágrafo vira `<figure>` (caminho relativo a `static/`).
- **`---` sozinho numa linha = divisor de cena** (imagem do `"divider"` da obra), não régua.
- `[[characters/olivia-purinna]]`, `[[works/firestriker]]`, `[[news/slug|texto]]` = link interno no mesmo idioma.
- **HTML cru**: bloco que começa com `<div`, `<figure`, `<img`, `<iframe`, `<section`, `<table`, `<details`, `<ul`, `<ol`, `<blockquote`, `<hr`, `<video`, `<audio`, `<script` passa direto. Imagens dentro dele: `src="@/other images/x.png"` — o `@/` resolve o `base_url`. Nunca escreva o `base_url` à mão.
- **Atalhos** (sozinhos na linha): `{{stories}}`, `{{emissaries}}`, `{{other-stories}}` (cards nas páginas Histórias/Sobre; a ordem das linhas é a ordem na página); `{{embed:nome}}` (arquivo `content/embeds/nome.html`), `{{embed:https://…}}` (X/Twitter, Instagram post/reel, TikTok, YouTube vídeo/Short, Reddit) e `{{embed:A | B | C}}` (botões para alternar). Pendências: procure `PENDENTE` ou `draft: true` em `content/news/`.

## Tipografia narrativa — Ossos do Ofício

Em `content/works/all-in-a-nights-work/01/en.md` (cena 1 transposta do PDF), cada parágrafo é um `<div class="s1 …">`:
- Times New Roman (`.s1`) é a realidade; **PT Serif em #111012** (`.ps`) começa em "He closes his eyes" quando Giuseppe adormece. Tudo até "Giuseppe opened his eyes" é um **sonho**, numa fonte *quase* igual e numa cor *quase* certa. Road Rage (`.rr`) na frase de destaque logo após o GIF `no-i-cant.gif` (`.s1-gif`, "NO… …I CAN’T…"); tudo isso faz parte da cena.
- Trocas de fonte, cor e tamanho são narrativas: **nunca** unifique, "limpe" ou troque por algo parecido. Ao transpor PDFs, use `hc-fidelidade-pdf`.
