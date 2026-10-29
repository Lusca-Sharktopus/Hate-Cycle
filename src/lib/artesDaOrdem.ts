// A arte do bloco "estou lendo em ordem…" em CAMADAS ANIMADAS (T17h): vários personagens (cada um num PNG com fundo transparente)
// empilhados numa "tela de montagem", que com o mouse por cima crescem, giram, se afastam ou aparecem.
//
// ONDE MORA A COMPOSIÇÃO: no `work.json` de cada obra, no campo `order_art` (e não num módulo do código). Assim quem monta uma arte nova
// (o autor, ou o Claude no lugar dele) mexe só em `content/works/<obra>/work.json` e em `static/ordem/`, como já fazia com `order_images`.
// O schema (src/lib/schemas.ts → arteEmCamadas) confere o campo no build, com mensagens em português; o guia do autor
// (docs/guia-do-autor.md) tem o passo a passo. Este arquivo só traduz o `order_art` para o que o componente desenha.
//
// O MODELO (as medidas são as de uma tela de montagem, como no Photoshop; nada aqui é em pixels da tela do visitante):
//   size    = [largura, altura] da tela de montagem, em px (ex.: [2087, 1752]). Só importa a PROPORÇÃO: a arte inteira se ajusta à
//             largura disponível. Tudo o que sair da tela é cortado, então o estado com o mouse tem de caber nela.
//   layers  = as camadas, DE TRÁS PARA A FRENTE (a última fica na frente).
//   x, y    = o CENTRO da camada, em % da largura (x) e da altura (y) da tela.
//   width   = a largura da camada, em % da largura da tela (a altura acompanha o desenho, sem deformar).
//   rotate  = giro em graus em volta do centro (positivo = para a direita). Opcional, padrão 0.
//   opacity = de 0 (invisível) a 1. Opcional, padrão 1.
//   hover   = só o que MUDA com o mouse por cima (ou o foco do teclado): x, y, width, rotate e/ou opacity. O que não está em `hover`
//             fica como estava. Sem `hover`, a camada não se mexe.
//   bleed   = (opcional, T17l) true deixa as camadas SAÍREM da moldura da arte até a borda da caixa do bloco, que serve de "máscara de
//             camada" (corta no canto arredondado), por trás da frase de cima ("estou lendo em ordem" + o seletor). Pedido do autor para as
//             asas do Giuseppe ("print giuseppe 3.png"). Sem ele (o padrão), o que sair da moldura é cortado. Desde 28/10 vale também no
//             celular (até a T17m/T17p a moldura voltava a cortar lá, com degradê em tudo; o autor ligou o bleed nas cinco artes "para que
//             elas não fossem cortadas").
//   fade    = (opcional, POR CAMADA, 28/10) true = no celular (até 700 px, as duas artes lado a lado) só esta camada some num degradê
//             radial na borda da moldura (`span.so-esmaece` com `mask-image` no ProximaHistoria.astro). Hoje só as asas do Giuseppe
//             ("O degradê para fora deveria ser exclusivo para as asas do Giuseppe"). No computador não muda nada.
//             Vale com qualquer `size` (desde 28/10 as cinco artes têm `bleed`, com telas de proporções diferentes): as medidas continuam na
//             tela de montagem, que só deixa de cortar. Com `size` QUADRADO (Ossos, [1000, 1000]) a tela é a própria moldura, e x, y e
//             width podem passar de 0–100 para sair dela.
// Uma transição só (suave, a mesma para todas as camadas) leva do estado inicial ao do mouse; ao tirar o mouse ela volta.
//
// O TAMANHO (T17m, pedido do autor de 22/10): em toda arte, a CABEÇA dos personagens fica mais ou menos do tamanho da da Olivia e do Harry
// (Pederneira, a referência), antes e com o mouse. Para ajustar uma arte, todas as camadas escalam juntas em volta do pé do desenho
// (x' = âncora + (x − âncora) × s, o mesmo para y, width × s, nos dois estados): o movimento e os olhos colados não mudam.
// tools/ordem_playwright.py (com --previa) mede as cabeças no navegador; a lição 08 (seção 6 do bloco) tem a tabela. Desde 28/10 o tamanho
// final é o que o autor escolheu com a `escala` de cada obra (Alô? 1.6, Pederneira 1.1, Luz & Sangue 1.4, Beira 1.4, Ossos 2.1): a régua
// da T17m virou o ponto de partida e a ferramenta só mostra as medidas.
// O ponto de apoio da T17m foi o CENTRO DA BORDA DE BAIXO da tela de montagem (x 50%, y 100%): refazendo a conta com os números de
// antes e depois da T17m, Luz & Sangue, Alô? e Beira dão âncora (50,0; 100,0) a 0,01 (Ossos também desceu, à parte). Como a tela fica
// encostada embaixo e centrada na moldura, esse ponto é sempre o meio da borda de baixo da moldura, onde ficam os pés.
//
// A ESCALA DO AUTOR (T17o, pedido de 27/10): `escala` no `order_art` (opcional; padrão 1) faz essa MESMA conta no build, em volta do
// MESMO ponto, sobre os números escritos (que continuam os de sempre): x' = 50 + (x − 50) × s, y' = 100 + (y − 100) × s, width × s, no
// estado inicial e no `hover` (só nos campos que o `hover` tem; o que ele não tem cai no inicial já escalado, pelo `var(--hx, var(--x))`).
// rotate e opacity não mudam. Assim o movimento do mouse fica proporcional, camadas com os mesmos números (os olhos da Iris) continuam
// iguais e as coladas por conta (os olhos do Giuseppe) continuam coladas (a conta é a mesma semelhança para todas). A linha de baixo da
// tela não se mexe; um pé a d% da borda de baixo anda d% × (s − 1) da altura (2% × 0,3 = 0,6% com 1.3). Sem `escala`, ou com 1, nada é
// recalculado: o HTML sai idêntico ao de antes. O que passar da moldura é cortado como sempre (ou vai até a caixa, com `bleed`).
//
// Como o navegador recebe: cada camada é uma <img> com variáveis de CSS (`--x`, `--hx`…) no atributo `style`; quem anima é o CSS do
// ProximaHistoria.astro. Sem JavaScript a composição já aparece (é CSS).
//
// A MOLDURA (T17i, pedido do autor de 21/10: a caixa não pode mudar de tamanho ao trocar de ordem): toda arte do bloco, de qualquer obra,
// fica numa moldura de proporção FIXA (`PROPORCAO_DA_MOLDURA`, a mesma do CSS). A tela de montagem se encaixa dentro dela inteira, sem
// deformar e sem cortar (como `object-fit: contain`), encostada embaixo (no rótulo) e centrada na largura: tela larga (Ossos do Ofício,
// com as asas) ocupa a largura toda; tela alta (Beira de Estrada) ocupa a altura toda.
//
// "Reduzir movimento" (o aparelho do visitante pede menos animação): nada anima. Se a arte tem uma camada que SURGE (a opacidade muda:
// o Thymorr, as asas e os olhos do Giuseppe, os olhos da Iris), a arte troca DE UMA VEZ para o desenho do mouse por cima (o desenho final
// do autor, com tudo no lugar: os olhos em cima do rosto); se só se mexe (Luz & Sangue, Alô?), fica parada.

/** O que pode mudar no mouse por cima (todos opcionais). */
export interface MudancasDaCamada {
  x?: number | undefined;
  y?: number | undefined;
  width?: number | undefined;
  rotate?: number | undefined;
  opacity?: number | undefined;
}

/** Uma camada como está escrita no work.json. */
export interface CamadaCrua extends MudancasDaCamada {
  /** Caminho do PNG dentro de static/ (ex.: "ordem/Ellie Site Cronologia.png"). */
  image: string;
  x: number;
  y: number;
  width: number;
  hover?: MudancasDaCamada | undefined;
  /** (28/10) true = no celular esta camada some num degradê radial na borda da moldura (as asas do Giuseppe). */
  fade?: boolean | undefined;
}

/** O `order_art` do work.json. */
export interface ArteCrua {
  size: readonly [number, number];
  layers: readonly CamadaCrua[];
  bleed?: boolean | undefined;
  /** O tamanho de todas as camadas juntas (T17o): 1 (o padrão) = como está escrito. */
  escala?: number | undefined;
}

/** A faixa aceita para `escala` (o schema confere; src/lib/schemas.ts). */
export const ESCALA_MINIMA = 0.3;
export const ESCALA_MAXIMA = 3;

/** O ponto de apoio da escala, em % da tela de montagem: o meio da borda de baixo (o mesmo da T17m). */
export const APOIO_DA_ESCALA = { x: 50, y: 100 } as const;

/** Uma camada com todas as medidas escaladas em volta do ponto de apoio (rotate e opacity ficam como estão). */
function escalarCamada(c: CamadaCrua, s: number): CamadaCrua {
  const ex = (x: number) => APOIO_DA_ESCALA.x + (x - APOIO_DA_ESCALA.x) * s;
  const ey = (y: number) => APOIO_DA_ESCALA.y + (y - APOIO_DA_ESCALA.y) * s;
  const h = c.hover;
  return {
    ...c,
    x: ex(c.x),
    y: ey(c.y),
    width: c.width * s,
    hover: h && {
      ...h,
      ...(h.x !== undefined && { x: ex(h.x) }),
      ...(h.y !== undefined && { y: ey(h.y) }),
      ...(h.width !== undefined && { width: h.width * s }),
    },
  };
}

/** As camadas como o build as desenha: as escritas, ou (com `escala` diferente de 1) as escaladas juntas. */
export function camadasEscaladas(crua: ArteCrua): readonly CamadaCrua[] {
  const s = crua.escala ?? 1;
  return s === 1 ? crua.layers : crua.layers.map((c) => escalarCamada(c, s));
}

/** Uma camada pronta para desenhar. */
export interface CamadaDaArte {
  /** Caminho relativo a static/. */
  imagem: string;
  /** O atributo `style` da <img>: as variáveis de CSS de posição, tamanho, giro e opacidade (iniciais e do mouse por cima). */
  estilo: string;
  /** A opacidade muda no mouse por cima (a camada "surge" ou some). */
  surge: boolean;
  /** O atributo `sizes` da <img>: quanto ela ocupa na tela, no maior dos dois estados (o navegador escolhe a versão leve certa; T17). */
  sizes: string;
  /** (28/10, `fade: true`) no celular, some num degradê radial na borda da moldura. */
  esmaece: boolean;
}

/** Camadas vizinhas que se desenham juntas: as que esmaecem no celular ficam numa tela à parte, com a máscara (28/10). */
export interface GrupoDeCamadas {
  esmaece: boolean;
  camadas: CamadaDaArte[];
}

/** A arte pronta para desenhar. */
export interface ArteEmCamadas {
  /** A proporção da tela de montagem, no formato do CSS `aspect-ratio` ("2087 / 1752"). */
  proporcao: string;
  /** A mesma proporção como número (largura ÷ altura), para o CSS encaixar a tela na moldura. */
  razao: number;
  /** Alguma camada surge (com movimento reduzido, a arte troca de uma vez para o desenho final). */
  temSurge: boolean;
  /** As camadas podem sair da moldura até a borda da caixa (`bleed: true`, T17l; desde 28/10 também no celular). */
  sangra: boolean;
  /** De trás para a frente. */
  camadas: CamadaDaArte[];
  /** As mesmas camadas em grupos seguidos (de trás para a frente) com o mesmo `esmaece`. Sem `fade`, um grupo só = o HTML de antes. */
  grupos: GrupoDeCamadas[];
}

/** A proporção (largura ÷ altura) da moldura de TODA arte do bloco. É a do `aspect-ratio` de `.so-art` em ProximaHistoria.astro. */
export const PROPORCAO_DA_MOLDURA = 1;

/** Quanto a moldura ocupa na tela (a mesma conta do perfil `camadaDaOrdem` de src/lib/imagens.ts): ~46% da tela no celular, até ~340 px. */
const MOLDURA_NO_CELULAR_VW = 46;
const MOLDURA_NA_TELA_LARGA_PX = 340;

/** O `sizes` de uma camada: a fração da moldura que ela ocupa no seu maior tamanho. */
export function sizesDaCamada(c: CamadaCrua, razao: number): string {
  const daTela = Math.max(c.width, c.hover?.width ?? c.width) / 100; // fração da largura da tela de montagem
  const telaNaMoldura = Math.min(1, razao / PROPORCAO_DA_MOLDURA); // a tela alta não usa a largura toda da moldura
  const f = daTela * telaNaMoldura;
  return `(max-width: 700px) ${numeroCss(Number((MOLDURA_NO_CELULAR_VW * f).toFixed(1)))}vw, ${Math.max(1, Math.round(MOLDURA_NA_TELA_LARGA_PX * f))}px`;
}

/** Um número para dentro do CSS: sem notação científica e sem zeros à toa. */
function numeroCss(n: number): string {
  return String(Number(n.toFixed(4)));
}

/** As variáveis de CSS de uma camada. Só entra o que o autor escreveu; o resto o CSS resolve (`var(--hx, var(--x))`). */
export function estiloDaCamada(c: CamadaCrua): string {
  const v: string[] = [`--x:${numeroCss(c.x)}%`, `--y:${numeroCss(c.y)}%`, `--w:${numeroCss(c.width)}%`];
  if (c.rotate !== undefined) v.push(`--r:${numeroCss(c.rotate)}deg`);
  if (c.opacity !== undefined) v.push(`--o:${numeroCss(c.opacity)}`);
  const h = c.hover;
  if (h) {
    if (h.x !== undefined) v.push(`--hx:${numeroCss(h.x)}%`);
    if (h.y !== undefined) v.push(`--hy:${numeroCss(h.y)}%`);
    if (h.width !== undefined) v.push(`--hw:${numeroCss(h.width)}%`);
    if (h.rotate !== undefined) v.push(`--hr:${numeroCss(h.rotate)}deg`);
    if (h.opacity !== undefined) v.push(`--ho:${numeroCss(h.opacity)}`);
  }
  return v.join(";");
}

/** Do `order_art` do work.json para o que o componente desenha. */
export function arteEmCamadas(crua: ArteCrua): ArteEmCamadas {
  const razao = crua.size[0] / crua.size[1];
  const camadas = camadasEscaladas(crua).map((c) => ({
    imagem: c.image,
    estilo: estiloDaCamada(c),
    surge: c.hover?.opacity !== undefined && c.hover.opacity !== (c.opacity ?? 1),
    sizes: sizesDaCamada(c, razao),
    esmaece: c.fade === true,
  }));
  const grupos: GrupoDeCamadas[] = [];
  for (const c of camadas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.esmaece === c.esmaece) ultimo.camadas.push(c);
    else grupos.push({ esmaece: c.esmaece, camadas: [c] });
  }
  return {
    proporcao: `${numeroCss(crua.size[0])} / ${numeroCss(crua.size[1])}`,
    razao: Number(razao.toFixed(4)),
    temSurge: camadas.some((c) => c.surge),
    sangra: crua.bleed === true,
    camadas,
    grupos,
  };
}
