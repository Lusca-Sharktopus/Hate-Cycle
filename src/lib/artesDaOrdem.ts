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
//             asas do Giuseppe ("print giuseppe 3.png"). Sem ele (o padrão), o que sair da moldura é cortado. No celular (até 700 px) a
//             caixa é estreita e as duas artes ficam lado a lado: ali a moldura volta a cortar (a camada não cobre a outra história).
//             Com `bleed`, use `size` QUADRADO (ex.: [1000, 1000]): a tela fica do tamanho da moldura, e x, y e width passam a valer em %
//             da moldura (podem passar de 0–100 para sair dela).
// Uma transição só (suave, a mesma para todas as camadas) leva do estado inicial ao do mouse; ao tirar o mouse ela volta.
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
}

/** O `order_art` do work.json. */
export interface ArteCrua {
  size: readonly [number, number];
  layers: readonly CamadaCrua[];
  bleed?: boolean | undefined;
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
}

/** A arte pronta para desenhar. */
export interface ArteEmCamadas {
  /** A proporção da tela de montagem, no formato do CSS `aspect-ratio` ("2087 / 1752"). */
  proporcao: string;
  /** A mesma proporção como número (largura ÷ altura), para o CSS encaixar a tela na moldura. */
  razao: number;
  /** Alguma camada surge (com movimento reduzido, a arte troca de uma vez para o desenho final). */
  temSurge: boolean;
  /** As camadas podem sair da moldura até a borda da caixa (`bleed: true`, T17l; no celular a moldura volta a cortar). */
  sangra: boolean;
  /** De trás para a frente. */
  camadas: CamadaDaArte[];
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
  const camadas = crua.layers.map((c) => ({
    imagem: c.image,
    estilo: estiloDaCamada(c),
    surge: c.hover?.opacity !== undefined && c.hover.opacity !== (c.opacity ?? 1),
    sizes: sizesDaCamada(c, razao),
  }));
  return {
    proporcao: `${numeroCss(crua.size[0])} / ${numeroCss(crua.size[1])}`,
    razao: Number(razao.toFixed(4)),
    temSurge: camadas.some((c) => c.surge),
    sangra: crua.bleed === true,
    camadas,
  };
}
