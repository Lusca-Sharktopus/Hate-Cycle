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
7. **As runas**: de 21 pedidos ao Google para 25 arquivinhos de 15 KB no total.
8. **Silhuetas**: o truque do texto que contorna o Giuseppe, que baixava a imagem duas vezes.
9. **Como provar que nada mudou** (testes + navegador).
10. **O que ficou de fora** e por quê.

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

1. `lerImagem(arquivo)` abre o arquivo com o **sharp** (a biblioteca de imagens que o Astro usa) e decide se vale a pena: só PNG/JPEG de 30 KB para cima, não animado. (Ícones pequenos, GIFs animados e imagens que já são menores que a menor versão ficam como estão.)
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
- **O que não se mexe**: ícones de 24 px dos botões de post incorporado, o divisor de cena, imagens com `srcset` seu, endereços de fora do site, GIFs animados, tudo abaixo de 30 KB.

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

O fundo de runas usa 83 símbolos, desenhados por 19 das 20 famílias Noto da lista (a 20ª, Noto Sans JP, fica só de reserva). O Google entregava um recorte por família (`&text=` com os 83 símbolos): 20 `<link>` por página. Agora `tools/gerar_fontes_das_runas.py` (Python com `fonttools`; **só você ou a Claude rodam**, e só se a lista `RUNES` de `src/lib/runas.ts` mudar) faz o mesmo recorte **uma vez** e grava o resultado no projeto:

- `src/assets/fontes/runas/*.woff2`: 25 arquivos, **15 KB no total**;
- `src/styles/fontes-das-runas.css`: um `@font-face` por arquivo, com o `unicode-range` exato dos símbolos dele;
- `src/assets/fontes/runas/cobertura.json`: o que cada arquivo cobre (os testes conferem com a lista `RUNES`: nenhum símbolo sem fonte, nenhum sobrando).

O navegador escolhe, para cada símbolo, a **primeira** família da lista `font-family` de `.runes i` (`Runas.astro`) que o tem; o gerador usa a mesma regra, então cada símbolo sai da mesma fonte de antes.

## 8. Silhuetas: o texto que contorna o desenho

Quando o texto contorna o Giuseppe (e a foto do autor, e os dois GIFs da página Sobre), o CSS diz `shape-outside: url("…/Giuseppe.png")`: "contorne o desenho deste arquivo". O navegador baixa esse arquivo **inteiro** (1,6 MB o Giuseppe) só para ler a transparência, e, como o pedido do contorno é de outro tipo que o da `<img>`, ele baixa **de novo** o que a imagem já tinha (os dois GIFs apareciam duas vezes na rede).

O contorno só depende de **onde há desenho** (qualquer pixel com alfa maior que zero, o limiar padrão). Então o build gera, de cada desenho, uma **silhueta**: mesmo tamanho, mesmo "onde há desenho", sem cores, em PNG de 2 a 8 KB (`/silhuetas/giuseppe.png`, gerada por `src/pages/silhuetas/[nome].png.ts`). O `shape-outside` aponta para ela; a `<img>` continua usando o desenho de verdade. Provas: o `pnpm test` compara pixel a pixel "tem desenho / não tem" de cada silhueta com o original (zero diferenças) e garante que o CSS não mexe no limiar (`shape-image-threshold`); no navegador, as linhas do texto ficam nas mesmas posições (`tools/layout_playwright.py`).

Se você acrescentar um desenho novo em que o texto deva dar a volta, a silhueta dele é uma linha em `SILHUETAS` (`src/lib/silhuetas.ts`); peça à Claude.

## 9. Como provar que nada mudou

1. **`pnpm test`** (6.539 testes; eram 6.475):
   - As páginas continuam iguais às do Python (`tests/paginas.test.ts`) com **exceções estreitas e documentadas** em `tests/ajudantes/html.ts`: numa `<img>` com `srcset`, os 5 atributos novos (`srcset`, `sizes`, `width`, `height`, `decoding`) não entram na comparação, mas todo o resto sim (`src`, `class`, `alt`, `loading`, `style`, a ordem); os `<link>` de fonte (os do Google no Python, os de preload no Astro) saem dos dois lados; os dois ícones contam como um.
   - **`tests/imagens.test.ts`** prova o que essas exceções escondem, para **todas as páginas** e **todas as versões** (397 imagens, 239 arquivos): o `src` ainda existe; cada versão existe, é WebP, tem a largura do `srcset`, nunca amplia o original, sai do arquivo do `src` e é **a mesma imagem** (o original encolhido ao tamanho dela, comparado em miniatura: diferença pequena e correlação alta; uma imagem trocada reprovaria); `width`/`height` são os do original. Também: nenhuma página nem CSS fala com o Google Fonts ou com o jsDelivr; todo `@font-face` aponta para um arquivo que existe; as duas fontes pré-carregadas estão declaradas; as runas têm fonte para todo símbolo; as silhuetas têm o mesmo contorno.
2. **No navegador** (`tools/layout_playwright.py`): dois sites gerados — um com `HC_IMAGENS=originais` (sem nenhuma versão leve e com o `shape-outside` antigo) e o novo —, lado a lado em 1100 e 390 px, 9 páginas. A posição e o tamanho de **todos os elementos** são iguais (diferença máxima 0,25 px em 1100 px e 0,42 px em 390 px, só arredondamento do navegador), exceto uma logo de título de capítulo que fica 0,8 px mais estreita porque a versão WebP tem altura arredondada. A diferença de pixels fica em 0,05% a 1,5% da página, nas bordas de texto e de desenho (a qualidade do WebP). As capturas foram vistas uma a uma.
3. **Offline**: o build roda sem rede nenhuma (`unshare -n pnpm build`, com o cache do Astro apagado): 192 páginas, 15 s.

## 10. O que ficou de fora

| O quê | Ganho estimado | Por que não agora |
|---|---|---|
| Vídeo da abertura (`intro/logo.webm`, 1,1 MB) em 720p | ~600 KB na primeira visita de cada pessoa | Mexe no arquivo que **você** fez, e na nitidez da logo em telas retina. Decisão sua. |
| GIFs animados (Apollo, Anfíbio e o "NO… …I CAN'T…": ~0,4 MB cada) para WebP animado | ~0,5 MB na Sobre | O tempo e a repetição dos quadros precisam de conferência quadro a quadro. |
| AVIF em vez de WebP | mais ~30–40% nas imagens | Build bem mais lento; o ganho absoluto é pequeno agora. |
| `og:image` (a capa de 3,5 MB que aparece quando alguém cola o link no WhatsApp ou no Discord) | pouco para o visitante; ajuda a prévia do link | Mudar o endereço muda o `<meta>` (que a paridade com o site atual confere) e depende de você aprovar qual imagem. |
| `static/Produtos` (54 MB, não usado por nenhuma página) | só o tamanho do que se publica | É seu, não se apaga. |
| `fontes.css` partido por família (hoje 30 KB, 6,6 KB comprimido, bloqueia a pintura) | ~4 KB no primeiro desenho | O ganho é pequeno; a complexidade, não. |
| `ossos-memoria-1` (tira de 918×5888 px, 968 KB na versão de 800 px) | ~300 KB nesse capítulo | Qualidade menor numa arte longa; precisa do seu olho. |

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
