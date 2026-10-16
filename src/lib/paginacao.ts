// Busca e páginas de uma lista (a lista de Notícias): as regras do bloco 6 do static/site.js, como funções puras.
//
// ⚠ Este arquivo NÃO importa nada de propósito: ele vai para o navegador (o <script> de src/components/ListaDeNoticias.astro
// o importa), e qualquer import traria junto o config.json do site. Só funções sobre texto e números.
// A prova de que as regras são as do site atual: tests/regras.test.ts (números das páginas) e o roteiro no navegador
// tools/noticias_playwright.py (o site.js de hoje × o <script> do Astro, passo a passo).
//
// De onde vem cada regra (static/site.js, bloco 6 "Notícias: 10 por página…"):
//   normalizarBusca  → norm()                         (minúsculas, sem acentos)
//   palavrasDaBusca  → o `q` de filtered()            (a busca é "todas as palavras aparecem")
//   combinaComBusca  → o `every` de filtered()
//   paginaPedida     → `parseInt(?p=…) || 1`
//   paginaValida     → o clamp do começo de render()
//   barraDePaginas   → o laço de render() que monta os botões
//   itensDaPagina    → o slice de render()

/** Quantos itens aparecem por página da lista (o `data-per` do HTML; o site.js usa 10 se faltar). */
export const ITENS_POR_PAGINA = 10;

/** norm() do site.js: minúsculas e sem acentos ("Residência" → "residencia"). */
export function normalizarBusca(texto: string | undefined): string {
  return (texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** As palavras da busca: normalizadas, separadas por espaços, sem vazios. Busca vazia = nenhuma palavra = tudo combina. */
export function palavrasDaBusca(consulta: string | undefined): string[] {
  return normalizarBusca(consulta).split(/\s+/).filter(Boolean);
}

/** O texto (já normalizado) contém TODAS as palavras? */
export function combinaComBusca(textoNormalizado: string, palavras: readonly string[]): boolean {
  return palavras.every((p) => textoNormalizado.indexOf(p) > -1);
}

/** O número da página que o endereço pede (`?p=3`): parseInt(…, 10) || 1, como no site.js (pode vir fora dos limites). */
export function paginaPedida(busca: string): number {
  return parseInt(new URLSearchParams(busca).get("p") ?? "", 10) || 1;
}

/** Quantas páginas tem uma lista (sempre pelo menos 1). */
export function totalDePaginas(totalDeItens: number, porPagina = ITENS_POR_PAGINA): number {
  return Math.max(1, Math.ceil(totalDeItens / porPagina));
}

/** A página pedida, corrigida para existir (render() do site.js: nem menos de 1, nem mais que a última). */
export function paginaValida(pedida: number, totalDeItens: number, porPagina = ITENS_POR_PAGINA): number {
  return Math.min(Math.max(1, pedida), totalDePaginas(totalDeItens, porPagina));
}

/** Um botão da barra de páginas: um número, "anterior", "próximo" ou as reticências entre blocos de números. */
export type ItemDaBarraDePaginas =
  | { tipo: "anterior"; pagina: number }
  | { tipo: "numero"; pagina: number; atual: boolean }
  | { tipo: "reticencias" }
  | { tipo: "proximo"; pagina: number };

/**
 * A barra de páginas, como o site.js a monta: "‹ anterior", a primeira, a última e as 2 de cada lado da atual, com "…"
 * onde falta número, e "próximo ›". Uma página só = barra vazia.
 */
export function barraDePaginas(atual: number, total: number): ItemDaBarraDePaginas[] {
  if (total <= 1) return [];
  const itens: ItemDaBarraDePaginas[] = [];
  if (atual > 1) itens.push({ tipo: "anterior", pagina: atual - 1 });
  const mostrados: number[] = [];
  for (let n = 1; n <= total; n++) if (n === 1 || n === total || Math.abs(n - atual) <= 2) mostrados.push(n);
  mostrados.forEach((n, i) => {
    const antes = mostrados[i - 1];
    if (i > 0 && antes !== undefined && n - antes > 1) itens.push({ tipo: "reticencias" });
    itens.push({ tipo: "numero", pagina: n, atual: n === atual });
  });
  if (atual < total) itens.push({ tipo: "proximo", pagina: atual + 1 });
  return itens;
}

/** Os itens da página `pagina` (1, 2, 3…) de uma lista. */
export function itensDaPagina<T>(itens: readonly T[], pagina: number, porPagina = ITENS_POR_PAGINA): T[] {
  const p = paginaValida(pagina, itens.length, porPagina);
  return itens.slice((p - 1) * porPagina, p * porPagina);
}
