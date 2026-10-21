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
// Uma transição só (suave, a mesma para todas as camadas) leva do estado inicial ao do mouse; ao tirar o mouse ela volta.
//
// Como o navegador recebe: cada camada é uma <img> com variáveis de CSS (`--x`, `--hx`…) no atributo `style`; quem anima é o CSS do
// ProximaHistoria.astro. Sem JavaScript a composição já aparece (é CSS). Com "reduzir movimento" nada se mexe; só aparecem de vez as
// camadas cuja opacidade muda (ex.: o Thymorr).

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
}

/** Uma camada pronta para desenhar. */
export interface CamadaDaArte {
  /** Caminho relativo a static/. */
  imagem: string;
  /** O atributo `style` da <img>: as variáveis de CSS de posição, tamanho, giro e opacidade (iniciais e do mouse por cima). */
  estilo: string;
  /** A opacidade muda no mouse por cima (a camada "surge" ou some): com movimento reduzido, ela ainda aparece, no lugar final. */
  surge: boolean;
}

/** A arte pronta para desenhar. */
export interface ArteEmCamadas {
  /** A proporção da tela de montagem, no formato do CSS `aspect-ratio` ("2087 / 1752"). */
  proporcao: string;
  /** De trás para a frente. */
  camadas: CamadaDaArte[];
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
  return {
    proporcao: `${numeroCss(crua.size[0])} / ${numeroCss(crua.size[1])}`,
    camadas: crua.layers.map((c) => ({
      imagem: c.image,
      estilo: estiloDaCamada(c),
      surge: c.hover?.opacity !== undefined && c.hover.opacity !== (c.opacity ?? 1),
    })),
  };
}
