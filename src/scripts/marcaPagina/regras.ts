// O marca-página (03/11/2026): as regras, sem DOM e sem imports (testadas em tests/marca-pagina.test.ts).
//
// Decisões do autor (02/11, docs/BACKLOG.md → "Marca-página: decisões"):
//   - o marcador fica na margem direita do texto; um clique na faixa leva o marcador à altura do clique; dá para arrastar;
//   - a posição é guardada como "parágrafo + fração dentro dele" (não em pixels): noutra tela, o marcador volta ao mesmo parágrafo;
//   - sem conta, fica só neste navegador (localStorage), sem aviso nenhum (o convite saiu em 03/11, pedido do autor); com conta, fica na conta;
//   - ao entrar, os do navegador sobem para a conta só nos capítulos em que a conta ainda não tem marca-página (a conta tem prioridade).

/** Onde a pessoa parou: o índice do bloco de texto (parágrafo, figura…) e a fração da altura dele (0 = topo, 1 = fim). */
export interface Ancora {
  paragrafo: number;
  fracao: number;
}

/** Um bloco de texto do capítulo: onde começa e quanto mede, em pixels, contados do topo da área do texto. */
export interface Bloco {
  topo: number;
  altura: number;
}

/** Os marca-páginas guardados no navegador: { "works/<obra>/<capítulo>": { p, f, t } } (t = quando, em ms). */
export type MarcasDoNavegador = Record<string, { p: number; f: number; t: number }>;

export const CHAVE_DAS_MARCAS = "hc-marca-paginas";

const limitar = (x: number, de: number, ate: number) => Math.min(ate, Math.max(de, x));

/** A âncora de uma altura (em px, do topo da área do texto): o bloco que contém a altura; acima do 1º = topo do 1º, abaixo do último = fim dele. */
export function ancoraDaAltura(blocos: readonly Bloco[], y: number): Ancora {
  if (!blocos.length) return { paragrafo: 0, fracao: 0 };
  for (let i = 0; i < blocos.length; i++) {
    const b = blocos[i] as Bloco;
    const proximo = blocos[i + 1];
    // o espaço entre dois blocos conta como o fim do de cima
    const fim = proximo ? Math.max(b.topo + b.altura, proximo.topo) : b.topo + b.altura;
    if (y < fim || !proximo) {
      const altura = Math.max(1, fim - b.topo);
      return { paragrafo: i, fracao: Math.round(limitar((y - b.topo) / altura, 0, 1) * 1000) / 1000 };
    }
  }
  return { paragrafo: blocos.length - 1, fracao: 1 };
}

/** A altura (px) de uma âncora; parágrafo que não existe mais (texto editado) = o último. */
export function alturaDaAncora(blocos: readonly Bloco[], a: Ancora): number {
  if (!blocos.length) return 0;
  const i = limitar(Math.floor(a.paragrafo), 0, blocos.length - 1);
  const b = blocos[i] as Bloco;
  const proximo = blocos[i + 1];
  const fim = proximo ? Math.max(b.topo + b.altura, proximo.topo) : b.topo + b.altura;
  return b.topo + limitar(a.fracao, 0, 1) * (fim - b.topo);
}

/** O ID do marca-página = o ID dos comentários do capítulo: /pt/works/<obra>/<capítulo>/ → works/<obra>/<capítulo>. */
export function idDoCapitulo(caminho: string): string | null {
  const m = /^\/[a-z]{2}\/works\/([a-z0-9-]+)\/([0-9]{2,3})\/?$/.exec(caminho);
  return m ? `works/${m[1]}/${m[2]}` : null;
}

/** Âncora válida vinda de fora (navegador, banco)? */
export function ancoraValida(x: unknown): Ancora | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const p = Number(o["paragrafo"] ?? o["p"]);
  const f = Number(o["fracao"] ?? o["f"]);
  if (!Number.isInteger(p) || p < 0 || p > 100000 || !Number.isFinite(f) || f < 0 || f > 1) return null;
  return { paragrafo: p, fracao: f };
}

/** Lê os marca-páginas do navegador (texto do localStorage), ignorando o que estiver estragado. */
export function lerMarcas(texto: string | null): MarcasDoNavegador {
  if (!texto) return {};
  try {
    const bruto = JSON.parse(texto) as unknown;
    if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
    const saida: MarcasDoNavegador = {};
    for (const [id, v] of Object.entries(bruto as Record<string, unknown>)) {
      const a = ancoraValida(v);
      if (a && /^works\/[a-z0-9-]+\/[0-9]{2,3}$/.test(id)) saida[id] = { p: a.paragrafo, f: a.fracao, t: Number((v as { t?: unknown }).t) || 0 };
    }
    return saida;
  } catch {
    return {};
  }
}

/**
 * Ao entrar na conta: quais marca-páginas do navegador sobem (só os de capítulos em que a conta NÃO tem um; a conta tem prioridade).
 * `daConta` = os IDs de capítulo que a conta já tem.
 */
export function marcasQueSobem(doNavegador: MarcasDoNavegador, daConta: ReadonlySet<string>): { page_id: string; paragrafo: number; fracao: number }[] {
  return Object.entries(doNavegador)
    .filter(([id]) => !daConta.has(id))
    .map(([id, m]) => ({ page_id: id, paragrafo: m.p, fracao: m.f }));
}

/** Os textos, por idioma da página. */
export const TEXTOS = {
  pt: {
    rotulo: "Marca-página",
    faixa: "Margem do marca-página: clique para marcar onde você parou",
    dica: "Clique na margem ao lado do texto (ou arraste o marcador) para marcar onde você parou.",
    onde: (p: number, total: number) => `Marca-página: parágrafo ${p} de ${total}. Setas para cima e para baixo movem o marcador.`,
  },
  en: {
    rotulo: "Bookmark",
    faixa: "Bookmark margin: click to mark where you stopped",
    dica: "Click the margin next to the text (or drag the marker) to mark where you stopped.",
    onde: (p: number, total: number) => `Bookmark: paragraph ${p} of ${total}. Up and down arrows move the marker.`,
  },
} as const;

export function textosDoIdioma(lang: string): (typeof TEXTOS)["pt"] | (typeof TEXTOS)["en"] {
  return lang.toLowerCase().startsWith("pt") ? TEXTOS.pt : TEXTOS.en;
}
