// O LEITOR PÁGINA A PÁGINA dos quadrinhos (T17d): as REGRAS — que página o endereço pede, para onde cada seta leva, que tecla vira a página.
//
// ⚠ Vai para o navegador (e também é lido por src/lib/folheador.ts, no build, para o servidor desenhar a página 1 com as MESMAS regras):
// NÃO importa nada. Qualquer import traria junto o config.json, e o que vai para o visitante não pode levar nada do que é do autor.
//
// A página dentro do capítulo mora só no FRAGMENTO do endereço (`#p3`): o endereço do capítulo (/pt/works/roadside/01/) e o ID dos
// comentários (works/roadside/01) não mudam. O fragmento faz o "voltar"/"avançar" do navegador e o link direto funcionarem sozinhos.

/** Um destino de seta: para onde vai e o que o leitor de tela (e a dica do mouse) diz. */
export interface Destino {
  href: string;
  rotulo: string;
}

/** O fragmento de uma página: 3 → "#p3". */
export function fragmentoDaPagina(n: number): string {
  return `#p${n}`;
}

/** A página que o fragmento pede ("#p5" → 5), ou null se ele não é de página ou não existe neste capítulo (ex.: "#access_token=…" do login). */
export function paginaDoFragmento(fragmento: string, total: number): number | null {
  const m = /^#p([1-9]\d{0,3})$/.exec(fragmento);
  if (!m) return null;
  const n = Number(m[1]);
  return n <= total ? n : null;
}

/** O que cada seta faz numa página: anterior/próxima página do capítulo; nas pontas, o capítulo vizinho (ou nada: a seta some). */
export interface Vizinhanca {
  /** A última página do capítulo anterior (null = este é o primeiro capítulo). */
  capituloAnterior: Destino | null;
  /** A primeira página do próximo capítulo (null = este é o capítulo mais recente). */
  proximoCapitulo: Destino | null;
  /** "Página anterior" e "Próxima página" no idioma da página. */
  paginaAnterior: string;
  proximaPagina: string;
}

export function setasDaPagina(n: number, total: number, v: Vizinhanca): { anterior: Destino | null; proxima: Destino | null } {
  return {
    anterior: n > 1 ? { href: fragmentoDaPagina(n - 1), rotulo: v.paginaAnterior } : v.capituloAnterior,
    proxima: n < total ? { href: fragmentoDaPagina(n + 1), rotulo: v.proximaPagina } : v.proximoCapitulo,
  };
}

/** "Página {n} de {total}" → "Página 3 de 8". */
export function rotuloDaPagina(modelo: string, n: number, total: number): string {
  return modelo.replaceAll("{n}", String(n)).replaceAll("{total}", String(total));
}

/** O que importa de uma tecla apertada. */
export interface Tecla {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  /** A tecla foi apertada dentro de um campo de texto (a caixa de comentários, a busca…)? */
  emCampoDeTexto: boolean;
}

/** ← = anterior, → = próxima; com Alt/Ctrl/Cmd/Shift, ou digitando num campo, a tecla é do navegador ou do campo. */
export function direcaoDaTecla(t: Tecla): "anterior" | "proxima" | null {
  if (t.altKey || t.ctrlKey || t.metaKey || t.shiftKey || t.emCampoDeTexto) return null;
  if (t.key === "ArrowLeft") return "anterior";
  if (t.key === "ArrowRight") return "proxima";
  return null;
}

/** As páginas que vale baixar já (a atual e as vizinhas), para a próxima aparecer sem espera. */
export function paginasParaBaixar(n: number, total: number): number[] {
  return [n, n + 1, n - 1].filter((p) => p >= 1 && p <= total);
}
