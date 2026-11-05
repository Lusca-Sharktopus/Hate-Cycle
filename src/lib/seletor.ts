// A ORDEM, o filtro e a busca do seletor de Histórias: o cérebro do que o visitante vê ao mexer no seletor.
//
// Mora num arquivo à parte (e não em obras.ts) por um motivo prático: este código roda NO NAVEGADOR (o <script> de
// src/components/SeletorDeHistorias.astro o importa), e quem vai para o navegador não deve arrastar junto o config.json
// inteiro. Aqui não há nenhum `import` de valores — só tipos —, então o que o visitante baixa é só esta lógica.
// obras.ts reexporta tudo daqui, e tests/regras.test.ts continua provando que é igual ao static/site.js (bloco 1).
//
// De onde vem no site atual:
//   organizarCartoes → static/site.js, bloco 1, função apply() (as três ordens, a busca e o filtro de mídia)
//   normalizarBusca  → norm() do mesmo bloco
import type { Lang } from "./config";

/** Valores de ordem de uma obra (`data-release` e `data-chrono` do cartão): número, ou "hide" se o work.json diz `false`. */
export type ValorDeOrdem = number | "hide";
export interface ValoresDeOrdem {
  release?: ValorDeOrdem;
  chrono?: ValorDeOrdem;
}

/** As três ordens do seletor, na ordem em que aparecem no menu. */
export const MODOS_DE_ORDEM = ["release", "chrono", "alpha"] as const;
export type ModoDeOrdem = (typeof MODOS_DE_ORDEM)[number];

/** O que a ordenação precisa saber de cada cartão (é o que ficava nos `data-*` do HTML). */
export interface CartaoParaOrdenar {
  titulo: string;
  ordem: ValoresDeOrdem;
  midia?: string | undefined;
}

/** O que a pessoa escolheu no seletor. */
export interface EscolhasDoSeletor {
  modo: ModoDeOrdem;
  /** true = botão de inverter acionado. */
  decrescente: boolean;
  /** Tipo de mídia escolhido; "" = todos. */
  midia: string;
  /** Texto da caixa de busca (só o título conta). */
  busca: string;
  lang: Lang;
}

/** norm() de static/site.js: minúsculas e sem acentos, para a busca não depender deles. */
export function normalizarBusca(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * apply() de static/site.js (bloco 1): dado o que a pessoa escolheu, quais cartões aparecem e em que ordem.
 *  - não combina com a busca (todas as palavras no título) ou com a mídia → fica oculto;
 *  - nas ordens de lançamento/cronológica, `false` no work.json ("hide") também oculta;
 *  - sem número naquela ordem → aparece, mas depois dos numerados (na ordem original);
 *  - numerados: pelo número (ou pelo título, na alfabética, sem ligar para maiúsculas, acentos e pontuação);
 *    `decrescente` inverte só os numerados.
 * `cartoes` vêm na ordem do HTML original (a de lançamento): é ela que desempata.
 */
export function organizarCartoes<T extends CartaoParaOrdenar>(cartoes: readonly T[], escolhas: EscolhasDoSeletor): { visiveis: T[]; ocultos: T[] } {
  const palavras = normalizarBusca(escolhas.busca).split(/\s+/).filter(Boolean);
  const combina = (c: T) => (!escolhas.midia || c.midia === escolhas.midia) && palavras.every((p) => normalizarBusca(c.titulo).includes(p));
  const ocultos: T[] = [];
  const numerados: T[] = [];
  const semNumero: T[] = [];
  for (const c of cartoes) {
    const valor = escolhas.modo === "alpha" ? undefined : c.ordem[escolhas.modo];
    if (!combina(c)) ocultos.push(c);
    else if (escolhas.modo !== "alpha" && valor === "hide") ocultos.push(c);
    else if (escolhas.modo !== "alpha" && (valor === undefined || Number.isNaN(valor))) semNumero.push(c);
    else numerados.push(c);
  }
  numerados.sort((a, b) => {
    const r =
      escolhas.modo === "alpha"
        ? a.titulo.localeCompare(b.titulo, escolhas.lang, { sensitivity: "base", ignorePunctuation: true })
        : Number(a.ordem[escolhas.modo]) - Number(b.ordem[escolhas.modo]);
    return escolhas.decrescente ? -r : r;
  });
  return { visiveis: [...numerados, ...semNumero], ocultos };
}
