# Lição 11 — Imagens leves e fontes do próprio site: o que pesa numa página e como o Astro ajuda (T17)

Até a T15 o site dava ao visitante os **arquivos que você guardou em `static/`, do jeito que estão**: a logo do topo tem 2,3 MB, as capas têm de 2 a 3,5 MB, o Giuseppe 1,6 MB. O navegador do visitante baixava tudo isso para desenhar uma logo de 187 px e uma capa de 230 px de largura. E as fontes vinham do Google Fonts (outro endereço, mais 21 pedidos só para os símbolos das runas do fundo).

A T17 resolve os dois problemas **sem mudar nada do que o visitante vê**: o mesmo desenho, nos mesmos lugares, nas mesmas posições; só chega em arquivos muito menores e as fontes saem do próprio site.

## O resultado (medido: computador 1100 px; celular 390 px com tela 2x)

Peso que **viajou pela rede** (já comprimido, como o visitante recebe), página inteira depois de rolar até o fim, "visita seguinte" (a abertura aparece uma vez por visita; a "primeira visita" soma o vídeo da abertura, 1,1 MB):

| Página (computador) | Antes | Depois | Redução |
|---|---|---|---|
| Home (visita seguinte) | 13,5 MB | 259 KB | 98% |
| Home (primeira visita, com a abertura) | 14,8 MB | 1,4 MB | 91% |
| Histórias | 12,5 MB | 223 KB | 98% |
| Capítulo *Ossos do Ofício* (cena 1) | 16,3 MB | 1,8 MB | 89% |
| Capítulo *Pederneira* | 2,5 MB | 259 KB | 90% |
| Lista de notícias | 5,3 MB | 263 KB | 95% |
| Notícia (*Saiu Pederneira*) | 2,5 MB | 431 KB | 83% |
| Sobre | 6,4 MB | 1,1 MB | 84% |

Lighthouse (desempenho, simulação de celular, a medida padrão dele): a **home foi de 58 para 96–97** (LCP de 40 s para 2,3–2,5 s; TBT de 590 para 120–130 ms; CLS de 0,05 para 0,01). O capítulo de *Ossos do Ofício* foi de 72 para 78–84.

Atenção a uma coisa nessa tabela: o "antes" **não inclui as fontes do Google** (o sandbox em que o teste rodou não alcança o Google; num navegador de verdade somam mais uns 100 a 150 KB e 21 pedidos), e o "depois" **inclui** as fontes do próprio site (80 a 235 KB, conforme a página). A comparação é, portanto, a favor do "antes"; a redução real é um pouco maior.

## O que você vai entender

1. **O que pesa numa página** e como se mede (`tools/peso_playwright.py`, Lighthouse).
2. **`srcset` e `sizes`**: o navegador escolhe o tamanho certo para a tela dele.
3. **`astro:assets` e `getImage()`**: o Astro faz as versões menores, e por que o `src` não muda.
4. **WebP, não AVIF** (e a exceção do JPEG no degradê da abertura).
5. **Perfis por lugar**: a capa do carrossel, a figura da notícia e a página de quadrinho não têm o mesmo tamanho.
6. **Fontes do próprio site** com os pacotes `@fontsource`, sem trocar o nome de nenhuma fonte.
7. **As runas**: de 21 pedidos ao Google para 31 arquivinhos de 19 KB no total (eram 25 e 15 KB até o catálogo crescer, T17f).
8. **Silhuetas**: o truque do texto que contorna o Giuseppe, que baixava a imagem duas vezes.
9. **Como provar que nada mudou** (testes + navegador).
10. **O que ficou de fora** e por quê.
11. **O vídeo da abertura em 720p e os GIFs em WebP animado** (T17e, 22/10/2026, as duas respostas do autor à B29).

## Abra lado a lado

1. `src/lib/imagens.ts`: os **perfis** (`PERFIS`), `largurasDaImagem()`, `otimizar()`, `icones()` e `fundoLeve()`.
2. `src/lib/imagensDoHtml.ts`: acha cada `<img>` do `<main>` e acrescenta `srcset`, `sizes`, `width` e `height`.
3. `src/layouts/BaseLayout.astro`: onde as duas peças se encaixam (e onde saíram os `<link>` do Google).
4. `src/components/Header.astro` (a logo do topo) e `src/components/Abertura.astro` (o degradê de fundo).
5. `tools/gerar_fontes_css.mjs` e `src/styles/fontes.css` (o resultado); `tools/gerar_fontes_das_runas.py`, `src/styles/fontes-das-runas.css` e `src/assets/fontes/runas/`.
6. `src/lib/silhuetas.ts`, `src/pages/silhuetas/[nome].png.ts` e as três linhas de `shape-outside` (`src/styles/prosa.css`, `src/components/PaginaAvulsa.astro`).
7. `astro.config.mjs` (a regra de não embutir fontes no CSS).
8. As provas: `tests/imagens.test.ts`, `tests/ajudantes/html.ts` (as exceções estreitas), `tools/peso_playwright.py` e `tools/layout_playwright.py`.

## 1. O que pesa numa página

Uma página são **pedidos**: o HTML, o CSS, o JavaScript, as fontes, as imagens, o vídeo. Quase tudo que pesava no site eram imagens (de 80% a 98% dos bytes); o HTML, o CSS e o JS somados passam pouco de 100 KB. Por isso a regra de ouro da T17 é: **mande ao navegador só o tamanho de imagem que ele vai desenhar**.

Para medir, não adianta "olhar o tamanho do arquivo": o que conta é o que o visitante baixa na página (e uma imagem `loading="lazy"` só vem quando ele rola até ela). `tools/peso_playwright.py` abre cada página num Chromium de verdade, com cache vazio, conta os bytes que viajaram (já comprimidos) e separa por tipo. O Lighthouse (nota 0 a 100) traduz isso em tempo percebido; a nota da home leva em conta o **LCP** (quando o maior elemento aparece), o **TBT** (quanto o JavaScript trava a página) e o **CLS** (quanto o conteúdo pula enquanto carrega).

## 2. `srcset` e `sizes`

```html
<img src="/covers/PT/Capa Pederneira.png"
     srcset="/covers/PT/Capa Pederneira_Z1ReFlj.webp 280w, /covers/PT/Capa Pederneira_xxxx.webp 560w"
     sizes="(max-width: 700px) 290px, 230px" width="…" height="…" …>
```

- `srcset` lista as versões e a **largura de cada uma em pixels** (`280w`).
- `sizes` diz **quanto espaço a imagem ocupa na tela** (aqui: 290 px no celular, 230 no computador). Com essas duas informações o navegador faz a conta sozinho: espaço × densidade da tela (um celular 2x precisa de o dobro de pixels) e escolhe a versão mais próxima.
- `width` e `height` são o **tamanho do arquivo original**. O CSS do site continua mandando no tamanho desenhado; esses dois atributos só dão ao navegador a **proporção** antes de a imagem chegar, e assim o texto embaixo não pula (o CLS da home caiu de 0,05 para 0,01 também por isso).
- O `src` ficou **exatamente como era** (o arquivo original). Quem não entende `srcset` (quase ninguém hoje) continua vendo a imagem; e o HTML que você escreve nos textos continua sendo o seu.

O que decide os números de `sizes` de cada lugar é o CSS real da página. Eles foram medidos nas larguras de 1500, 1100, 700 e 390 px (o resultado de cada medida está nos comentários de `PERFIS`). `sizes` errado não quebra nada, só faz o navegador baixar uma versão maior ou menor que a ideal.

## 3. `astro:assets` e `getImage()`

O Astro tem componentes prontos (`<Image>`, `<Picture>`) que geram as versões de uma imagem importada no código. Aqui não serviam: as imagens estão em `static/` e dentro de **HTML que você escreve** (`content/**.md`), não em componentes. Então a T17 usa a função de baixo nível, `getImage()`, de dentro de `src/lib/imagens.ts`:

1. `lerImagem(arquivo)` abre o arquivo com o **sharp** (a biblioteca de imagens que o Astro usa) e decide se vale a pena: só PNG/JPEG de 30 KB para cima, não animado. (Ícones pequenos e imagens que já são menores que a menor versão ficam como estão; o GIF animado tem caminho próprio, seção 11.)
2. `otimizar(arquivo, perfil)` pede ao `getImage()` as versões em WebP nas larguras do perfil e devolve `srcset`, `sizes`, `width` e `height`.
3. O Astro grava as versões **ao lado do original** (`/covers/PT/Capa Pederneira_Z1ReFlj.webp`) e guarda o resultado em cache (`node_modules/.astro/assets`): o segundo build não refaz nada. Se você trocar uma imagem por outra de mesmo nome, o carimbo (SHA-1 do conteúdo, no `?v=` interno) muda e as versões são refeitas sozinhas.

> **O sharp não vem junto com o Astro.** O Astro 7, instalado com pnpm, não traz o sharp: o build parava com `MissingSharp`. Ele entrou no `package.json` como dependência com **versão exata** (`sharp 0.35.5`). Mais 11 MB em `node_modules` (de 309 para 320 MB), a maior parte o binário nativo da biblioteca; nada disso vai para o site publicado.

Como as imagens das páginas estão dentro do HTML pronto, o passo `otimizarImagensDoHtml()` (em `imagensDoHtml.ts`, chamado pelo `BaseLayout` no fim do acabamento do `<main>`) lê o HTML com o **parse5** (o mesmo leitor de HTML que os testes usam; por isso ele passou de dependência de teste para dependência do site), acha cada `<img>` e **só acrescenta atributos ao fim da tag**. O resto do texto fica byte a byte como estava. A mesma regra serve para a capa do carrossel (componente), a miniatura da notícia (componente) e a figura que você pôs no meio de um capítulo (texto seu).

## 4. WebP, não AVIF

- **WebP** é lido por todos os navegadores de hoje e comprime muito bem: a capa de *Pederneira* foi de 3,5 MB (PNG) para 44 KB na largura em que aparece.
- **AVIF** comprimiria ainda uns 30 a 40% a mais, mas o build ficaria bem mais lento (cada versão custa segundos) e o ganho a mais é pequeno perto do que já se ganhou. Ficou como possibilidade (seção 10).
- **A qualidade é por perfil** (82 a 88): arte com hachura fina (as tiras de quadrinho) pede mais que uma miniatura. Os valores foram escolhidos olhando cada tipo lado a lado, nas larguras de uso.
- **Uma exceção, o degradê da abertura** (`static/intro/fundo.png`, 287 KB): é um degradê escuro com *ruído de propósito*; o WebP com perda mostrava faixas visíveis (como "degraus") no escuro. Virou JPEG qualidade 95 (12 KB), sem faixas. O arquivo original continua publicado (e fica sem uso pelo CSS).
- O **ícone da aba** (`logos/favicon.png`, 1,7 MB, 3508 px) ganhou duas versões PNG (32 e 192 px, 2 KB e 33 KB); o navegador pega a que precisa. O original continua lá.

## 5. Perfis por lugar

O mesmo arquivo pesa menos ou mais conforme onde aparece. `PERFIS` em `imagens.ts` tem um por lugar (logo, capa do carrossel, capa da grade, "Últimas atualizações", emissário, miniatura de notícia, figura de notícia, figurinha, logo do título de capítulo, página de quadrinho, ilustração grande, tira, carta que vira, foto do autor, imagem solta no texto), e `perfilDoLugar()` em `imagensDoHtml.ts` escolhe o perfil pelas **classes da imagem e das caixas em volta dela** (`work-card` dentro de `rail` = capa do carrossel). Isso é uma função pura, testada em `tests/imagens.test.ts`.

Regras que ela segue, sempre:

- **Nunca amplia**: se o original é menor que a versão pedida, a última versão tem o tamanho do original.
- **`width`/`height` só entram se não atrapalham**: se você já pôs `width`, `height` ou uma altura no `style`, a tag não ganha esses dois.
- **Preguiçosas** (`loading="lazy"`) ganham também `decoding="async"`; a logo do topo e as capas da dobra não ganham `lazy` nem ganharam: são a primeira coisa da página.
- **O que não se mexe**: ícones de 24 px dos botões de post incorporado, o divisor de cena, imagens com `srcset` seu, endereços de fora do site, tudo abaixo de 30 KB. (O GIF animado não passa pelos perfis: ganha um WebP animado sem perda, seção 11.)

## 6. Fontes do próprio site

Antes, `<link href="https://fonts.googleapis.com/…">` fazia o navegador ir a **dois endereços de fora** (preconnect) antes de saber que letra usar. Agora:

- Os pacotes **`@fontsource`** (versão exata no `package.json`) trazem os **mesmos arquivos** do Google Fonts, empacotados no npm. `tools/gerar_fontes_css.mjs` copia os blocos `@font-face` de cada pacote para `src/styles/fontes.css`, trocando só três coisas: o nome da família (de "Lexend Variable" de volta para **"Lexend"**), o intervalo de pesos (o mesmo que o link do Google pedia: Lexend 300–800, Oswald 300–700, Noto Emoji 300–700) e o caminho do arquivo.
- **Os nomes das fontes não mudaram.** `font-family: "PT Serif"` ou `"Road Rage"` no seu texto, e no `custom.css`, funcionam exatamente como antes. A tipografia que conta a história (o sonho do Giuseppe em PT Serif #111012) está inteira; desta vez ela aparece **de verdade** nas capturas do Astro (o sandbox não alcançava o Google, então antes elas mostravam a fonte de reserva).
- Cada fonte é cortada por alfabeto (`unicode-range`: latim, latim estendido, cirílico, vietnamita…): o navegador baixa só o pedaço de que a página precisa. A maioria das páginas baixa só o "latim".
- `font-display: swap`: o texto aparece logo, na fonte de reserva, e troca quando a fonte chega (o mesmo comportamento do link do Google).
- **Pré-carregamento** (`<link rel="preload" as="font" crossorigin>`) só das duas fontes que toda página usa no começo, Lexend e Oswald (latim): o navegador as pede antes de terminar de ler o CSS. O `crossorigin` é obrigatório (sem ele, fonte pré-carregada é baixada duas vezes).
- **A pegadinha do Vite** (`astro.config.mjs`): por padrão o Vite **embute** arquivos menores que 4 KB dentro do CSS (em base64). Os recortes das runas têm de 0,4 a 1,3 KB: embutidos, o CSS (que bloqueia a pintura) ganharia ~20 KB para todas as páginas. A regra `assetsInlineLimit` manda nunca embutir fontes.
- Quem **gera** o `fontes.css` é um script, mas o build não o roda (não precisa de rede nem de nada novo): ele só lê o arquivo. `tests/imagens.test.ts` roda `node tools/gerar_fontes_css.mjs --conferir` e falha se o arquivo estiver diferente do que o gerador produz.

## 7. As runas do fundo

O fundo de runas usa 111 símbolos (83 até a T17f, que acrescentou 28), desenhados pelas 22 famílias Noto da lista. O Google entregava um recorte por família (`&text=` com os símbolos): 22 `<link>` por página. Agora `tools/gerar_fontes_das_runas.py` (Python com `fonttools`; **só você ou a Claude rodam**, e só se a lista `RUNES` de `src/lib/runas.ts` mudar) faz o mesmo recorte **uma vez** e grava o resultado no projeto:

- `src/assets/fontes/runas/*.woff2`: 31 arquivos, **19,1 KB no total** (o do CJK é só o recorte dos 5 ou 6 glifos usados, 0,6 KB cada, nunca a fonte inteira). Por página, o navegador baixa só os recortes das 26 runas sorteadas (unicode-range): média de 9,5 KB, no máximo 12,1 KB (antes: 8,3 e 10,7 KB);
- `src/styles/fontes-das-runas.css`: um `@font-face` por arquivo, com o `unicode-range` exato dos símbolos dele;
- `src/assets/fontes/runas/cobertura.json`: o que cada arquivo cobre (os testes conferem com a lista `RUNES`: nenhum símbolo sem fonte, nenhum sobrando).

O navegador escolhe, para cada símbolo, a **primeira** família da lista `font-family` de `.runes i` (`Runas.astro`) que o tem; o gerador usa a mesma regra, então cada símbolo sai da mesma fonte de antes.

**Como acrescentar runas novas** (foi o que a T17f fez com 28 de uma vez):

1. Ponha os símbolos no **fim** da lista `RUNES` nos **dois** lugares, na mesma ordem: `build.py` e `src/lib/runas.ts`. Sem repetir (`python3` com `dict.fromkeys` mostra o que já existe; cuidado com parecidos: o `Ⱝ` U+2C1D que já havia não é o `Ⱝ` U+2C2D de A Força). Símbolo que o navegador desenharia como emoji colorido entra também em `RUNES_TEXT_PRES`. Mudar a lista muda o sorteio do fundo de **todas** as páginas, nos dois geradores por igual.
2. Descubra qual família Noto tem cada glifo (os pacotes `@fontsource` ficam fora do projeto; as instruções estão no topo de `tools/gerar_fontes_das_runas.py`). Se nenhuma das famílias da lista tem o glifo, o gerador para e diz qual (foi assim que entraram Noto Sans Brahmi e Noto Music). Família nova vai em quatro lugares: `FAMILIAS` do gerador, o `font-family` de `.runes i` em `Runas.astro`, `RUNE_FAMILIES_EXTRA` em `src/lib/runas.ts` e em `build.py` (o Python ainda pede ao Google Fonts, por `&text=`).
3. Rode `python3 tools/gerar_fontes_das_runas.py --pacotes <pasta>`; confira o `cobertura.json`.
4. Refaça as referências: `python3 tools/runas_ref.py` e `python3 tools/paginas_ref.py`; depois `pnpm test` (se o número de `<link>` de fonte mudou, `tests/runas.test.ts` pede o número novo). Gere o site e olhe uma página com todas as runas (nenhuma pode ser quadradinho).

## 8. Silhuetas: o texto que contorna o desenho

Quando o texto contorna o Giuseppe (e a foto do autor, e os dois GIFs da página Sobre), o CSS diz `shape-outside: url("…/Giuseppe.png")`: "contorne o desenho deste arquivo". O navegador baixa esse arquivo **inteiro** (1,6 MB o Giuseppe) só para ler a transparência, e, como o pedido do contorno é de outro tipo que o da `<img>`, ele baixa **de novo** o que a imagem já tinha (os dois GIFs apareciam duas vezes na rede; desde a T17e a `<img>` baixa o WebP animado deles e o contorno, só a silhueta).

O contorno só depende de **onde há desenho** (qualquer pixel com alfa maior que zero, o limiar padrão). Então o build gera, de cada desenho, uma **silhueta**: mesmo tamanho, mesmo "onde há desenho", sem cores, em PNG de 2 a 8 KB (`/silhuetas/giuseppe.png`, gerada por `src/pages/silhuetas/[nome].png.ts`). O `shape-outside` aponta para ela; a `<img>` continua usando o desenho de verdade. Provas: o `pnpm test` compara pixel a pixel "tem desenho / não tem" de cada silhueta com o original (zero diferenças) e garante que o CSS não mexe no limiar (`shape-image-threshold`); no navegador, as linhas do texto ficam nas mesmas posições (`tools/layout_playwright.py`).

Se você acrescentar um desenho novo em que o texto deva dar a volta, a silhueta dele é uma linha em `SILHUETAS` (`src/lib/silhuetas.ts`); peça à Claude.

## 9. Como provar que nada mudou

1. **`pnpm test`** (6.919 testes na T17e; eram 6.539 na T17):
   - As páginas continuam iguais às do Python (`tests/paginas.test.ts`) com **exceções estreitas e documentadas** em `tests/ajudantes/html.ts`: numa `<img>` com `srcset`, os 5 atributos novos (`srcset`, `sizes`, `width`, `height`, `decoding`) não entram na comparação, mas todo o resto sim (`src`, `class`, `alt`, `loading`, `style`, a ordem); os `<link>` de fonte (os do Google no Python, os de preload no Astro) saem dos dois lados; os dois ícones contam como um.
   - **`tests/imagens.test.ts`** prova o que essas exceções escondem, para **todas as páginas** e **todas as versões** (397 imagens, 239 arquivos): o `src` ainda existe; cada versão existe, é WebP, tem a largura do `srcset`, nunca amplia o original, sai do arquivo do `src` e é **a mesma imagem** (o original encolhido ao tamanho dela, comparado em miniatura: diferença pequena e correlação alta; uma imagem trocada reprovaria); `width`/`height` são os do original. Também: nenhuma página nem CSS fala com o Google Fonts ou com o jsDelivr; todo `@font-face` aponta para um arquivo que existe; as duas fontes pré-carregadas estão declaradas; as runas têm fonte para todo símbolo; as silhuetas têm o mesmo contorno.
2. **No navegador** (`tools/layout_playwright.py`): dois sites gerados — um com `HC_IMAGENS=originais` (sem nenhuma versão leve e com o `shape-outside` antigo) e o novo —, lado a lado em 1100 e 390 px, 9 páginas. A posição e o tamanho de **todos os elementos** são iguais (diferença máxima 0,25 px em 1100 px e 0,42 px em 390 px, só arredondamento do navegador), exceto uma logo de título de capítulo que fica 0,8 px mais estreita porque a versão WebP tem altura arredondada. A diferença de pixels fica em 0,05% a 1,5% da página, nas bordas de texto e de desenho (a qualidade do WebP). As capturas foram vistas uma a uma.
3. **Offline**: o build roda sem rede nenhuma (`unshare -n pnpm build`, com o cache do Astro apagado): 192 páginas, 15 s.

## 10. O que ficou de fora

> **Atualização (T17e):** o vídeo da abertura em 720p e os GIFs animados em WebP animado, que estavam aqui, foram feitos depois de você aprovar (20/10); estão na seção 11. O resto da tabela continua valendo.

| O quê | Ganho estimado | Por que não agora |
|---|---|---|
| AVIF em vez de WebP | mais ~30–40% nas imagens | Build bem mais lento; o ganho absoluto é pequeno agora. |
| `og:image` (a capa de 3,5 MB que aparece quando alguém cola o link no WhatsApp ou no Discord) | pouco para o visitante; ajuda a prévia do link | Mudar o endereço muda o `<meta>` (que a paridade com o site atual confere) e depende de você aprovar qual imagem. |
| `static/Produtos` (54 MB, não usado por nenhuma página) | só o tamanho do que se publica | É seu, não se apaga. |
| `fontes.css` partido por família (hoje 30 KB, 6,6 KB comprimido, bloqueia a pintura) | ~4 KB no primeiro desenho | O ganho é pequeno; a complexidade, não. |
| `ossos-memoria-1` (tira de 918×5888 px, 968 KB na versão de 800 px) | ~300 KB nesse capítulo | Qualidade menor numa arte longa; precisa do seu olho. |

## 11. O vídeo da abertura em 720p e os GIFs em WebP animado (T17e)

Duas das sobras da seção 10, depois de você ter dito "pode sim" (vídeo) e "sinta-se à vontade" (GIFs). **Os seus arquivos continuam intactos em `static/`** e continuam publicados no mesmo endereço; o site só deixa de entregá-los ao visitante.

### O resultado (medido: `tools/peso_playwright.py`, KB que viajam pela rede)

| Página | Antes | Depois | Ganho |
|---|---|---|---|
| Home, **primeira visita** (com a abertura), computador | 1.370 | 764 | −606 |
| Home, primeira visita, celular 2x | 1.430 | 825 | −605 |
| Home, visita seguinte (sem abertura) | 241 | 241 | 0 |
| Sobre, computador | 1.079 | 623 | −456 |
| Sobre, celular 2x | 1.089 | 634 | −455 |
| Capítulo de *Ossos do Ofício* (prévia), primeira visita, computador | 3.028 | 2.408 | −620 |
| Capítulo de *Ossos do Ofício*, visita seguinte, computador | 1.900 | 1.884 | −16 |

Arquivo a arquivo: `logo.webm` 1.117 KB → 511 KB (1920×1080 → 1280×720); `Apollo Site.gif` 384 KB → 291 KB; `Anfíbio Site.gif` 405 KB → 43 KB; `no-i-cant.gif` 53 KB → 38 KB.

### O vídeo: um arquivo derivado, feito uma vez, fora do build

O GitHub Actions **não tem ffmpeg e não precisa ter**: o vídeo leve é feito aqui, uma vez, por uma ferramenta de desenvolvimento (como o recorte das runas), e fica guardado no projeto.

- `tools/gerar_video_da_abertura.py` lê `config.json → intro.video` (só lê), decodifica com o `libvpx-vp9` (o decodificador "nativo" do ffmpeg **joga fora o canal de transparência**; por isso o `-c:v libvpx-vp9` antes do `-i`), reduz a 1280×720 (lanczos) e grava VP9 com transparência (`yuva420p`), CRF 34, sem `alt-ref` (o VP9 com alfa exige), `-fps_mode passthrough` (cada quadro no mesmo instante do original). Saem dois arquivos em `src/assets/intro/`: `logo-720p.webm` e a **ficha** `logo-720p.json` (SHA-256 do original de onde saiu, SHA-256 do leve, tamanho, quadros, duração).
- `src/components/Abertura.astro` importa o leve com `?url` (o Vite o publica em `/_astro/logo-720p.<carimbo>.webm`) e `src/lib/videoDaAbertura.ts` decide: **só usa o leve se o SHA-256 do `static/intro/logo.webm` de hoje for o da ficha**. Se você trocar o vídeo e ninguém refizer o leve, o site publica o **seu original** (nunca um vídeo velho) e o build avisa no terminal ("o vídeo da abertura mudou…"). O resto da abertura (`min_ms`, `max_ms`, `sessionStorage`, "reduzir movimento", `?intro`) é o mesmo código de antes.
- `tests/video-da-abertura.test.ts` impede esquecimento: falha se a ficha não for a do vídeo de hoje, e prova, sem ffmpeg (leitor de contêiner em `tests/ajudantes/webm.ts`), que o leve tem **os mesmos 151 quadros nos mesmos instantes**, a mesma duração (5,038 s), o mesmo `ALPHA_MODE` e a mesma proporção. `tests/imagens.test.ts` ("T17e no site construído") prova que toda página aponta para o leve e que o original continua publicado byte a byte.
- **Nitidez** (olhada, não só medida): contra o original reduzido a 1280 px, o PSNR sobre o fundo roxo é 39,4 dB no pior quadro e 50,1 dB em média (alfa: erro médio 0,3 em 255). Em tela comum (1100 px, o máximo que a abertura ocupa: `min(94vw, 1100px)`) os dois são indistinguíveis; em tela retina (2x) o desenho de **traço fino** do começo da animação fica um pouco mais macio (o original era ampliado 1,15x, o leve 1,7x), e o brilho e a logo cheia ficam iguais. Se um dia isso incomodar, o meio-termo é 1440×810 (~0,7 MB): mude `LARGURA, ALTURA` na ferramenta e rode de novo.
- **Quando você trocar o vídeo:** veja o guia do autor, seção 16. Em resumo: troque o arquivo, rode `python3 tools/gerar_video_da_abertura.py` (precisa do ffmpeg com libvpx-vp9) ou peça à Claude, e `pnpm test`.

### Os GIFs: WebP animado **sem perda**

`src/lib/animadas.ts` + `src/pages/animadas/[nome].webp.ts` (o mesmo desenho das silhuetas: arquivos gerados no build, que não existem em `static/`). Por que **não** pelo `getImage()` do Astro, como o resto das imagens: ele só sabe fazer WebP **com perda**, e o WebP sem perda deste caso é ao mesmo tempo menor (Anfíbio, Ossos) e **igual ao pixel**. O caminho:

- todo `.gif` de `static/` com 2 quadros ou mais vira `/animadas/<nome>-<carimbo>.webp` (carimbo = SHA-1 do GIF: trocou o GIF, o endereço muda e o navegador não guarda o velho); o `sharp` lê todos os quadros (`pages: -1`) e escreve `webp({ lossless: true, loop, delay })` com os atrasos e a repetição **lidos do GIF**. (Atraso de 10 ms ou menos toca como 100 ms no navegador com GIF; a conversão faz o mesmo.)
- `imagensDoHtml.ts` acrescenta à `<img>` só `srcset="/animadas/….webp 1x"` e `width`/`height` (sem `sizes`, que não vale com `1x`: o tamanho natural fica igual ao do GIF). O `src` continua o GIF; `content/` não mudou; o `shape-outside` da Sobre continua usando as silhuetas (lê o primeiro quadro do GIF, que não mudou).
- **O que o GIF do "NO… …I CAN'T…" é de fato:** lendo os bytes do arquivo, os quadros duram **2000 ms, 100 ms e 100 ms** (o "NO…" fica parado 2 s e depois vêm dois quadros rápidos), com repetição infinita. O WebP tem exatamente esses três tempos.
- **As provas** (`tests/animadas.test.ts`): tamanho, número de quadros, **atraso de cada quadro lido do cabeçalho do WebP** (não pelo sharp), repetição infinita, e **cada pixel visível de cada quadro igual ao do GIF**, com transparência (zero diferenças; trocando para "com perda" o teste reprova). Em `tests/imagens.test.ts`: toda `<img>` de GIF animado de todas as páginas tem o `srcset` certo e o GIF original continua publicado. **No navegador** (`python3 tools/animadas_playwright.py --dist dist`): o Chromium grava a tela (screencast) tocando o GIF e o WebP, e os dois mostram os mesmos 8, 8 e 3 desenhos (SHA-1 dos quadros de tela **iguais**), na mesma ordem, repetindo (9 voltas em 9 s), com os mesmos tempos (±23 ms, o Apollo ±54 ms por folga do screencast). Em *Ossos do Ofício*, a captura do trecho a 1100 e a 390 px, GIF × WebP, tem **zero pixels diferentes** e a mesma caixa (534×212,9 e 188×74,9 px).
- Peso: Anfíbio 405 → 43 KB e Ossos 53 → 38 KB. O **Apollo** (cheio de pontilhado) só cai de 384 para 291 KB sem perda. Com perda ele cairia para ~140 KB (qualidade 80) ou ~200 KB (90), mas deixaria de ser o mesmo desenho pixel a pixel; **não foi feito** (pergunta para você no BACKLOG, B29).
- `HC_IMAGENS=originais` (o site de controle do teste de layout) também desliga o WebP animado.

### Rode você mesmo

```bash
pnpm build
ls -la dist/animadas dist/_astro/*.webm       # os três WebP e o vídeo 720p
grep -o 'const video = "[^"]*"' dist/pt/index.html
grep -o '<img[^>]*gif[^>]*>' dist/pt/about/index.html
timeout 300 python3 tools/animadas_playwright.py --dist dist --porta 8797    # GIF × WebP no navegador
python3 tools/gerar_video_da_abertura.py --conferir                           # a ficha ainda é a do vídeo de hoje?
```

## Rode você mesmo

```bash
pnpm build                                   # as versões leves aparecem ao lado dos originais em dist/
ls -la dist/covers/PT | grep Pederneira      # o original (3,5 MB) e as versões .webp (dezenas de KB)
grep -o '<img[^>]*srcset[^>]*>' dist/pt/index.html | head -3
grep -c "fonts.googleapis" dist/pt/index.html  # 0: nenhuma página fala com o Google
pnpm test                                    # inclui tests/imagens.test.ts
```

Medir o peso (servidor e navegador sobem sozinhos; use `timeout`):

```bash
timeout 900 python3 tools/peso_playwright.py --dist dist --porta 8795 --saida /tmp/peso.json --paginas /pt/ /pt/works/
```

## Tente

1. Abra `dist/pt/index.html` e compare o `src` e o `srcset` da logo: o `src` é o PNG de 2,3 MB, o `srcset` tem três WebP.
2. Em `src/lib/imagens.ts`, mude `qualidade` de `capaDaGrade` de 82 para 30 e rode `pnpm build`: as capas da grade (`dist/pt/works/`) ficam visivelmente piores. Qualidade é uma decisão de olho, não de teste; os testes só pegam imagem **trocada** ou errada. Desfaça.
3. Em `src/lib/imagens.ts`, deixe `capaDaObra` só com `larguras: [260]` (sem a de 520) e rode `pnpm build`: o site continua funcionando, mas a capa da página da obra fica borrada em tela de celular 2x, que pediria 520 px. `sizes` e larguras são uma conta, não um palpite.
4. Troque uma capa em `static/covers/` por outra imagem de **mesmo nome** e rode `pnpm build`: as versões leves são refeitas (o carimbo mudou).
5. Rode `node tools/gerar_fontes_css.mjs --conferir`: "confere com o gerador". Edite uma linha de `src/styles/fontes.css` e rode de novo: o comando acusa.
