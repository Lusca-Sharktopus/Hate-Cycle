// O LEITOR PÁGINA A PÁGINA dos quadrinhos (T17d, só no Astro): os dados que o componente Folheador desenha.
//
// Liga-se por um campo do work.json, `page_runes` (uma runa por página, na ordem), e só vale para obra "kind": "comic". Na Beira de Estrada
// são as Oito Runas d'A Força: ᚣ 弓 ♐︎ ᚸ エ ꑭ ⼒ Ⱝ. O servidor desenha o capítulo como o leitor de quadrinhos de sempre (as páginas uma
// embaixo da outra, que é o que aparece sem JavaScript) e, em volta, as setas e a fileira de runas já no estado da PÁGINA 1. O script
// (src/scripts/folheador/) mostra uma página por vez, a que o endereço pede (`#p3`), e troca o destino das setas com as MESMAS regras
// (src/scripts/folheador/regras.ts), que este arquivo também usa.
//
// As setas: a da direita vai à próxima página; na última, à primeira do próximo capítulo; na última do capítulo mais recente, some. A da
// esquerda faz o mesmo ao contrário (na 1ª página, a ÚLTIMA do capítulo anterior). "Capítulo" = os listados da obra naquele idioma e modo
// (no publicado só os públicos; na prévia também os rascunhos), os mesmos do pager. Capítulo `unlisted` não tem vizinhos.
// Prova: tests/folheador.test.ts (sites inventados e o real) e tests/folheador-dom.test.ts (o script num navegador simulado).
import type { Lang } from "./config";
import { RUNES_TEXT_PRES } from "./runas";
import { TEXTOS_DO_FOLHEADOR } from "./textosDoFolheador";
import { fragmentoDaPagina, rotuloDaPagina, setasDaPagina, type Destino } from "../scripts/folheador/regras";

export type { Destino } from "../scripts/folheador/regras";

/** Uma runa da fileira de baixo: leva àquela página. */
export interface RunaDaPagina {
  numero: number;
  /** O símbolo (com o seletor de texto U+FE0E quando precisa, para não virar emoji colorido). */
  runa: string;
  /** "#p3" */
  href: string;
  /** "Página 3 de 8" */
  rotulo: string;
}

/** Uma seta: o destino na página 1 (o que o servidor desenha) e o que o script precisa para as outras páginas. */
export interface SetaDoFolheador {
  /** Para onde vai na página 1; null = some (lugar guardado, invisível). */
  inicial: Destino | null;
  /** O rótulo dentro do capítulo ("Próxima página"). */
  rotuloDaPagina: string;
  /** O capítulo vizinho (a última página do anterior / a primeira do próximo); null = não tem. */
  capitulo: Destino | null;
}

export interface Folheador {
  total: number;
  /** O nome da fileira de runas ("Páginas do capítulo"). */
  rotuloDasRunas: string;
  runas: RunaDaPagina[];
  anterior: SetaDoFolheador;
  proxima: SetaDoFolheador;
}

/** Um capítulo vizinho: o endereço, o título e quantas páginas tem (para a seta da esquerda ir à última dele). */
export interface CapituloVizinho {
  url: string;
  titulo: string;
  paginas: number;
}

/** O símbolo como vai para a página: os que viram emoji colorido ganham o U+FE0E (como no fundo de runas), se o autor não o escreveu. */
export function glifoDaRuna(runa: string): string {
  return RUNES_TEXT_PRES.has(runa) ? `${runa}︎` : runa;
}

/**
 * Os dados do leitor página a página de um capítulo, ou null se a obra não usa (`page_runes` ausente). `onde` = o endereço do capítulo,
 * para a mensagem de erro. ERRO (o build pára) se o capítulo não tiver exatamente uma página por runa: o autor combinou que todo
 * capítulo tem o mesmo número de páginas, e uma runa sobrando (ou faltando) seria um capítulo pela metade sem ninguém perceber.
 */
export function folheadorDoCapitulo(lang: Lang, runas: readonly string[] | undefined, paginas: number, anterior: CapituloVizinho | null, proximo: CapituloVizinho | null, onde: string): Folheador | null {
  if (!runas) return null;
  if (paginas !== runas.length) {
    throw new Error(`${onde}: o capítulo tem ${paginas} página(s), mas o work.json → page_runes tem ${runas.length} runa(s). O leitor página a página precisa de uma runa por página (confira o pages/pages_glob do capítulo e a lista page_runes).`);
  }
  const t = TEXTOS_DO_FOLHEADOR[lang];
  const capituloAnterior = anterior ? { href: `${anterior.url}${fragmentoDaPagina(anterior.paginas)}`, rotulo: `${t.capituloAnterior}: ${anterior.titulo}` } : null;
  const proximoCapitulo = proximo ? { href: `${proximo.url}${fragmentoDaPagina(1)}`, rotulo: `${t.proximoCapitulo}: ${proximo.titulo}` } : null;
  const inicial = setasDaPagina(1, paginas, { capituloAnterior, proximoCapitulo, paginaAnterior: t.paginaAnterior, proximaPagina: t.proximaPagina });
  return {
    total: paginas,
    rotuloDasRunas: t.runas,
    runas: runas.map((runa, i) => ({ numero: i + 1, runa: glifoDaRuna(runa), href: fragmentoDaPagina(i + 1), rotulo: rotuloDaPagina(t.pagina, i + 1, paginas) })),
    anterior: { inicial: inicial.anterior, rotuloDaPagina: t.paginaAnterior, capitulo: capituloAnterior },
    proxima: { inicial: inicial.proxima, rotuloDaPagina: t.proximaPagina, capitulo: proximoCapitulo },
  };
}
