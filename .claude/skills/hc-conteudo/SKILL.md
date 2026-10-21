---
name: hc-conteudo
description: Criar, editar, esconder ou mostrar conteúdo do site Hᴀᴛᴇ Cʏᴄʟᴇ — notícias, capítulos, obras, emissários, páginas — seguindo as regras editoriais do autor (Hᴀᴛᴇ Cʏᴄʟᴇ × Hate Cycle, trema, aspas curvas, versalete, bilíngue PT/EN). Use em qualquer pedido de texto, publicação, ocultação ou troca de categoria de obra.
---

# Conteúdo do site

## Regras editoriais (valem em tudo que for escrito no site)

1. **Hᴀᴛᴇ Cʏᴄʟᴇ** (letras Unicode em versalete) = a **marca e o universo compartilhado**. É o padrão.
   **Hate Cycle** (caixa normal) = **apenas a futura série de animação**, a obra original (nasceu como webcomic de Apollo e O Anfíbio). Como Star Wars (marca) × os nove filmes.
   Na dúvida, pergunte; não "corrija" o texto do autor sem confirmar.
2. **Trema** em português quando o "u" é pronunciado após g/q (lingüista, freqüência, conseqüência). Exceção: "equivalente/equivale" sem trema.
3. **Aspas e apóstrofos curvos** (“ ” ’) no texto corrido. Ao copiar texto do autor, mantenha exatamente o que ele escreveu — inclusive aspas retas se ele usou.
4. **Versalete** se escreve com as letras Unicode (`ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡʏᴢ`); o gerador converte para `<span class="hc">`. Transcrições fonéticas entre barras (`/ˈwɪθ/`) viram `<span class="ipa">`.
5. **Texto final do autor é final.** Não reescreva, não "melhore". Erros aparentes: mantenha e aponte na resposta.
6. **Trocas de fonte e cor são narrativas.** Em Ossos do Ofício, o texto passa de Times New Roman para PT Serif #111012 quando Giuseppe adormece; tudo até "Giuseppe opened his eyes" é sonho. Preserve esse tipo de troca.
7. Todo item é **bilíngue**: pasta com `en.md` e `pt.md`. Se o autor só mandar um idioma, pergunte se traduz ou se publica só naquele (apagar o outro arquivo = existe só num idioma). Ao traduzir, aplique a mesma regra de nomes da marca nos dois.

## Comandos (gerador atual, Python)

| Quero… | Comando | Onde fica |
|---|---|---|
| Notícia | `python3 build.py new news nome` | `content/news/AAAA-MM-DD-nome/{en,pt}.md` |
| Capítulo | `python3 build.py new chapter <obra>` | `content/works/<obra>/NN/{en,pt}.md` |
| Obra | `python3 build.py new work <obra>` | `content/works/<obra>/work.json` |
| Página | `python3 build.py new page nome` | `content/pages/nome/` |
| Emissário | copiar uma pasta existente | `content/emissaries/nome/` |

## Campos

**Front matter (`---` no topo do `.md`)**: `title`, `date`, `summary`, `thumb`, `image`, `tags: [a, b]`, `draft: true` (só na prévia), `unlisted: true` (capítulo fora da lista, mas acessível), `comments: false`, `youtube: ID`, `pages_glob: comics/x/01/*.png`, `layout: wide`, `menu: extras`, `related: [universe/x]`.
Notícias com design: `backdrop_top`/`backdrop_bottom`; colagem: `stickers` (linhas `arquivo | l3 t2 w26 a-4`) + `overlay`.
Emissário: `title`, `role`, `image` (quadrada, em `static/emissaries/`), `order`, redes (`instagram`, `tiktok`, `youtube`, `x`, `bluesky`, `website`, `email`).

**`work.json`**: `kind` (`prose` | `comic` | `video`), `universe` (true = Histórias Hᴀᴛᴇ Cʏᴄʟᴇ; false = "Outras histórias"), `oneshot`, `title`/`blurb`/`cover`/`logo` com `{"en","pt"}`, `divider` (imagem do `---`), `order: {"release": n, "chrono": n}`, `reading_font: "times"`, `media`, `listed` (false tira das listas, mas a página existe), `draft` (true = obra inteira em rascunho, só na prévia), `order_art` (a arte do bloco "estou lendo em ordem" em camadas animadas: `size` e `layers` com `x`, `y`, `width`, `rotate`, `opacity` e `hover`; passo a passo no guia do autor) ou `order_images` (1 ou 2 imagens; sem nenhuma das duas vale a capa), `langs`, `external` (link para fora), `updated`.

**`media`** (filtro da página Histórias; rótulos em `MEDIA_LABELS` no `build.py`): `short-story`, `webcomic`, `live-ttrpg`, `short-film`, `animated-show`, `videogame`, `misc` (PT "Miscelânea", EN "Miscellaneous").

## Mostrar / esconder

- Obra inteira: `"draft": true` no `work.json` (ex.: Ossos do Ofício, Beira de Estrada, O Pêndulo); publicar = apagar a linha.
- Capítulo/notícia: `draft: true` (só prévia) ou `unlisted: true` (capítulo acessível por link).
- Emissário: `draft: true` nos dois `.md` ou `config.json → "emissaries": {"hide": ["slug"]}`.
- "Extras" (Universo, Personagens): `config.json → "show_extras"`.

## Ordem cronológica e de lançamento

`order.chrono` segue a planilha da linha do tempo guardada em `cronologia.json` (inclui obras que ainda não estão no site). `order.release` é a ordem de lançamento. Confira os números já usados antes de atribuir um novo.

## Imagens no texto

- Markdown: `![legenda](pasta/imagem.png)` sozinho no parágrafo vira `<figure>`.
- HTML cru (blocos que começam com `<div`, `<figure`, `<img`…): use `src="@/pasta/arquivo.png"` — o `@/` resolve o `base_url`.
- Divisor de cena: uma linha `---` sozinha.
- Posts de redes: `{{embed:link}}` ou `{{embed:link A | link B}}` (botão para alternar).

## Depois de editar

Gere, confira (`hc-conferencia-visual`) e entregue (`hc-entrega`). Em notícias, confira também a home ("Últimas atualizações") — notícia e capítulo da mesma obra com até 3 dias de diferença se fundem num cartão só.
