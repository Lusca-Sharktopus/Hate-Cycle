---
name: hc-fidelidade-pdf
description: Transpor um capítulo ou cena de um PDF/documento do autor para o site Hᴀᴛᴇ Cʏᴄʟᴇ com fidelidade total — texto, fontes, tamanhos, cores, itálico/negrito/sublinhado, versalete, texto glitch (zalgo), imagens e diagramação. Use quando o autor anexar um PDF (ou docx exportado) e pedir para "atualizar a cena de acordo com o arquivo".
---

# Fidelidade a PDF

O autor usa a tipografia como narrativa. Exemplo: em Ossos do Ofício, o texto troca de Times New Roman para **PT Serif em #111012** quando Giuseppe adormece — tudo até "Giuseppe opened his eyes" é sonho, numa fonte *quase* igual com uma cor *quase* certa. Nada no PDF é decorativo por acaso: preserve cada troca.

## 1. Inventário

```bash
P=<caminho do pdf>; D=<scratchpad>/pdf; mkdir -p $D
pdfinfo "$P"; pdffonts "$P"; pdfimages -list "$P"
pdftoppm -r 110 -png "$P" $D/pg          # uma imagem por página, para olhar e comparar
```
Olhe **todas** as páginas renderizadas com Read antes de escrever qualquer coisa.

## 2. Estilos de cada trecho

```bash
S=.claude/skills/hc-fidelidade-pdf/scripts
python3 -I $S/estilos.py "$P"                 # fonte/tamanho/cor por trecho, linha a linha
python3 -I $S/estilos.py "$P" --pagina 3 --bruto   # texto na ordem do fluxo (zalgo intacto)
```
- **Zalgo / acentos combinantes:** use sempre o texto `--bruto` (ordem do fluxo). O ordenado por posição embaralha os acentos.
- **Linhas com espaços à esquerda** em sequência escalonada = texto contornando uma imagem (float + `shape-outside`), não recuo.
- **Linhas vazias em série** no PDF costumam ser espaço reservado para uma imagem posicionada; não viram parágrafos vazios.
- **Sublinhado** não aparece nos caracteres: procure em `linhas:` (traço fino sob a palavra).
- **Versalete Unicode** (`Lᴏʀᴅ`, `Hᴀᴛᴇ Cʏᴄʟᴇ`) aparece como Times de reserva no PDF; mantenha os caracteres Unicode.
- Ligaduras `ﬁ`/`ﬂ` do PDF → `fi`/`fl`.

## 3. Imagens

```bash
python3 -I $S/imagens.py "$P" $D/img      # já aplica a transparência (smask)
```
Antes de copiar para `static/other images/`, compare com o que já existe (mesmas dimensões → diferença de pixels). Reaproveite o arquivo existente se for idêntico. Use nomes descritivos em minúsculas (`ossos-cena-1-final.png`). Imagem com o divisor de cena "embutido" substitui o `---`/divisor daquela cena.

Se a imagem for igual ao que o cabeçalho do capítulo já mostra (ex.: a logo da obra), **não** repita no corpo.

## 4. Conversão de medidas

- Base de leitura: Times New Roman 11 pt = `1.08rem` (`.story.font-times`). Logo **1 pt ≈ 0.0982 rem**; tamanhos relativos em `em` a partir de 11 pt (10 pt = `.909em`, 19 pt = `1.727em`).
- Recuo de primeira linha de 36 pt ≈ `3.5rem`.
- Cores: converta a tupla RGB do PDF para hex (`(0.0667,0.0588,0.0745)` = `#111012`). Times em preto puro, PT Serif em `#111012`.
- Entrelinha: mantenha a do site (`1.7`) salvo pedido do autor; diga isso na entrega.
- Largura de imagem: (largura no PDF ÷ 453 pt de área útil) em %.

## 5. Montagem no conteúdo

- Cada parágrafo estilizado vira um bloco `<div class="s1 …">` em linha própria, separado por linha em branco (o gerador trata blocos que começam com `<div` como HTML cru). Gere o markdown com um script Python a partir de listas de parágrafos — não digite à mão parágrafo por parágrafo.
- Classes já existentes (fim do `static/style.css`): `.s1` (Times), `.ps` (PT Serif #111012), `.indent`, `.rr` (Road Rage), `.mid`, `.gap`, `.dashes`, `.zalgo`, `.sc`, `.s1-gif`, `.s1-art`. Reaproveite; crie classes novas com prefixo da cena.
- Fontes novas do Google Fonts entram no `<link>` do `shell()` em `build.py`.
- Caminhos de imagem dentro de HTML cru: prefixo `@/` (`src="@/other images/x.png"`) para o gerador resolver `base_url`.

## 6. Conferir e relatar

Conferência lado a lado com `hc-conferencia-visual` (página do PDF × screenshot). Na entrega, liste:
- o que foi reproduzido (tabela: elemento → como ficou);
- interpretações suas (entrelinha, logo não repetida, etc.);
- **erros aparentes do PDF mantidos de propósito** (frases cortadas, "a some", "It 's") — o autor decide;
- que as fontes do Google não puderam ser vistas no sandbox.
