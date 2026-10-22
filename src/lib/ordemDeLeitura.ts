// O bloco "estou lendo/assistindo/jogando em ordem…" (T17c): quem vem ANTES e quem vem DEPOIS da história que o visitante está
// lendo, na ordem cronológica ou na de lançamento. Só no Astro (o build.py não tem este bloco).
//
// Funções puras, sem HTML: recebem as obras já carregadas e devolvem DADOS. Quem desenha é src/components/ProximaHistoria.astro.
// Prova: tests/ordem.test.ts (sites inventados, incluindo o exemplo do PDF do autor: Pederneira em cronológica → anterior Luz & Sangue,
// seguinte = a próxima já lançada; Beira de Estrada e O Pêndulo, sem capítulo, são puladas).
//
// As REGRAS DE ORDEM não são novas: usam exatamente o `organizarCartoes()` do seletor de Histórias (src/lib/seletor.ts), com a mesma lista de
// obras que a grade de Histórias mostra (`dados.universo`: listadas, do universo, em ordem de lançamento). Por isso:
//   - `"chrono": false` (ex.: Alô? Residência dos Di Vario) fica FORA da ordem cronológica e DENTRO da de lançamento;
//   - obra sem número naquela ordem vai para depois das numeradas;
//   - empate de número: vale a ordem de lançamento da lista (e, nela, a ordem das pastas);
//   - o "999" (obra sem `order.release`) é o de separarObras(): o fim da lista.
// E o que "existe no site naquele modo" é o que a grade de Histórias mostra naquele modo: no site publicado, só as publicadas; na prévia,
// também as de rascunho (`draft: true` no work.json). Publicar uma história nova "entre" duas faz os vizinhos se ajustarem sozinhos.
//
// NADA DE "EM BREVE" (T17h, pedido do autor de 21/10): uma história que ainda não tem nada lançado NAQUELE MODO (rascunho sem capítulo,
// obra sem capítulo e sem link externo: o cartão cinza "Em breve" de Histórias) é PULADA, e o bloco vai direto para a próxima já lançada.
// "Lançada" = o cartão dela tem botão de verdade (cartaoDaObra → botao.tipo === "link"): no site publicado contam só as públicas com algo
// para abrir; na prévia, as públicas e os rascunhos que têm capítulo. A obra do capítulo em que o visitante está não é pulada.
//
// PARA ONDE CADA LADO LEVA (T17i, pedido do autor de 21/10): quem vem DEPOIS leva ao PRIMEIRO capítulo dela (a pessoa vai começar a
// história); quem vem ANTES, ao ÚLTIMO (a pessoa está voltando na ordem e chega ao fim da anterior). "Capítulos" = os listados daquela
// obra naquele idioma e naquele modo (no publicado só os públicos; na prévia também os rascunhos), os mesmos que a lista da página da obra
// mostra. Obra de um capítulo só: os dois lados levam a ele. Obra com link externo (vídeo, RPG ao vivo no YouTube…) continua levando ao
// link, como o cartão dela em Histórias.
//
// O RÓTULO NUMA LINHA SÓ (T17i): o build mede cada rótulo na fonte de verdade (src/lib/largurasDoRotulo.ts, gerado da Lexend 500) e
// escreve na caixa quantos "em" os dois rótulos lado a lado precisam (`emDosRotulos`); o CSS escolhe a letra que cabe na largura da caixa.
import { ORDEM_PADRAO, ORDENS } from "../scripts/ordem/regras";
import type { Lang } from "./config";
import { arteEmCamadas, type ArteCrua, type ArteEmCamadas } from "./artesDaOrdem";
import { LARGURA_MAXIMA, LARGURAS, UNIDADES_POR_EM } from "./largurasDoRotulo";
import { cartaoDaObra, capaDaObra, logoDaObra, tituloDaObra, urlDoCapitulo, valoresDeOrdem, type CapitulosDaObra, type ObraComDados } from "./obras";
import { organizarCartoes } from "./seletor";
import { TEXTOS_DA_ORDEM, type OrdemDeLeitura, type Verbo } from "./textosDaOrdem";

export { TEXTOS_DA_ORDEM, type OrdemDeLeitura, type Verbo } from "./textosDaOrdem";

/** As duas ordens, na ordem do seletor, e a padrão (as constantes moram em src/scripts/ordem/regras.ts, que o navegador também lê). */
export const ORDENS_DE_LEITURA: readonly OrdemDeLeitura[] = ORDENS;
export { ORDEM_PADRAO };

/** O que as regras leem de uma obra: o que as de src/lib/obras.ts leem, mais a arte do bloco (`order_art` ou `order_images`). */
export interface ObraParaOrdem extends ObraComDados {
  data: ObraComDados["data"] & { order_images?: readonly string[] | undefined; order_art?: ArteCrua | undefined };
}

/** Midias cujo "consumo" é assistir (vídeo, filme, curta, animação, RPG ao vivo — que é vídeo). */
const MIDIAS_PARA_ASSISTIR = new Set(["live-ttrpg", "short-film", "animated-show"]);

/**
 * O verbo da obra: jogo (`media: videogame`) → jogar; vídeo, filme, curta, animação, RPG ao vivo → assistir; o resto (prosa, quadrinho)
 * → ler. O `media` manda no "jogar" (o `kind` do work.json não tem "jogo"); para assistir, vale o `kind` (video/film) OU o `media`.
 */
export function verboDaObra(obra: ObraParaOrdem): Verbo {
  const { kind, media } = obra.data;
  if (media === "videogame") return "play";
  if (kind === "video" || kind === "film" || (media !== undefined && MIDIAS_PARA_ASSISTIR.has(media))) return "watch";
  return "read";
}

/** Um lado do bloco (a história anterior ou a seguinte). */
export interface LadoDaOrdem {
  slug: string;
  titulo: string;
  verbo: Verbo;
  /** O texto do link, já com o verbo e o título: "Assistir Luz & Sangue". */
  rotulo: string;
  /**
   * Para onde vai (T17i): o link externo da obra, se ela tem (como o cartão em Histórias); senão, o PRIMEIRO capítulo (lado "seguinte")
   * ou o ÚLTIMO (lado "anterior"), entre os listados naquele idioma e modo.
   */
  destino: { tipo: "link"; href: string; externo: boolean };
  /** A largura do rótulo, em "em" da fonte do rótulo (para o CSS escolher o tamanho que cabe numa linha). */
  emDoRotulo: number;
  /**
   * A arte do lado, por ordem de preferência: a composição em CAMADAS do work.json (`order_art`, T17h), as imagens `order_images` (a normal e,
   * se houver, a do mouse por cima) ou, sem nenhuma, a capa da obra (`ehCapa`: o CSS a encaixa na mesma caixa); sem capa, a logo; sem nada,
   * null (a caixa fica vazia). Caminhos relativos a static/.
   */
  arte: ArteDeImagens | ArteDeCamadas | null;
}

/** A arte de uma ou duas imagens (a normal e a do mouse por cima) ou da capa. */
export interface ArteDeImagens {
  tipo: "imagens";
  principal: string;
  hover: string | null;
  ehCapa: boolean;
}

/** A arte em camadas animadas (ver src/lib/artesDaOrdem.ts). */
export interface ArteDeCamadas extends ArteEmCamadas {
  tipo: "camadas";
}

/** Os dois lados de UMA ordem. */
export interface ListaDaOrdem {
  anterior: LadoDaOrdem | null;
  proximo: LadoDaOrdem | null;
  /** A obra atual não está nesta ordem (ex.: `"chrono": false`, ou obra escondida das listas): os dois lados ficam vazios e o bloco explica. */
  foraDaOrdem: boolean;
}

/** Tudo o que o bloco do fim de um capítulo mostra, nas DUAS ordens (a página leva as duas; o script só alterna qual aparece). */
export interface BlocoDaOrdem {
  lang: Lang;
  /** O tipo da obra atual (muda "estou lendo" para "estou assistindo"…). */
  verbo: Verbo;
  /** "estou lendo em ordem". */
  titulo: string;
  /** A ordem com que a página abre sem JavaScript (a do desenho do autor). */
  ordemInicial: OrdemDeLeitura;
  /** As opções do seletor, com o nome de cada ordem. */
  opcoes: { valor: OrdemDeLeitura; rotulo: string }[];
  listas: Record<OrdemDeLeitura, ListaDaOrdem>;
  /** Por ordem: o aviso de "fora da ordem" (só aparece quando `foraDaOrdem`). */
  avisosDeForaDaOrdem: Record<OrdemDeLeitura, string>;
  /**
   * Quantos "em" os rótulos de UMA linha da caixa precisam, na ordem que precisa de mais (os dois lados + o espaço entre eles). O CSS usa
   * a mesma letra nas duas ordens (`--so-em`): trocar de ordem não muda o tamanho do texto nem o da caixa.
   */
  emDosRotulos: number;
  /**
   * No celular cada rótulo tem uma linha só dele (o de quem vem antes em cima, o de quem vem depois embaixo): quantos "em" o MAIOR rótulo
   * da caixa precisa (+ uma folga), nas duas ordens (`--so-em-1`).
   */
  emDoMaiorRotulo: number;
}

/** O espaço mínimo entre os dois rótulos de uma linha, em "em". */
export const ESPACO_ENTRE_ROTULOS_EM = 1.5;
/** A folga do rótulo que tem a linha só para ele (celular), em "em". */
export const FOLGA_DO_ROTULO_SOZINHO_EM = 0.3;
/** Folga sobre a soma das larguras das letras (o kerning da fonte quase sempre aperta, mas o texto nunca pode sair maior que a conta). */
const FOLGA_DA_MEDIDA = 1.03;

/** A largura de um texto na fonte do rótulo (Lexend 500), em "em", com folga. Letra fora da tabela conta como a mais larga. */
export function larguraDoRotulo(texto: string): number {
  let unidades = 0;
  for (const letra of texto) unidades += LARGURAS.get(letra.codePointAt(0) ?? 0) ?? LARGURA_MAXIMA;
  return Number(((unidades / UNIDADES_POR_EM) * FOLGA_DA_MEDIDA).toFixed(3));
}

/** Os "em" de uma linha da caixa: os rótulos que existem + o espaço entre eles (sempre conta, mesmo com um lado só). */
export function emDaLinha(lista: ListaDaOrdem): number {
  const lados = [lista.anterior, lista.proximo].flatMap((l) => (l ? [l.emDoRotulo] : []));
  return Number((lados.reduce((a, b) => a + b, 0) + ESPACO_ENTRE_ROTULOS_EM).toFixed(3));
}

/** A arte de uma obra para o bloco: ver `LadoDaOrdem.arte`. */
export function arteDaObra(obra: ObraParaOrdem, lang: Lang): LadoDaOrdem["arte"] {
  if (obra.data.order_art) return { tipo: "camadas", ...arteEmCamadas(obra.data.order_art) };
  const proprias = (obra.data.order_images ?? []).filter((a) => a.trim() !== "");
  const principal = proprias[0];
  if (principal) return { tipo: "imagens", principal, hover: proprias[1] ?? null, ehCapa: false };
  const capa = capaDaObra(obra, lang) || logoDaObra(obra, lang);
  return capa ? { tipo: "imagens", principal: capa, hover: null, ehCapa: true } : null;
}

/** De que lado da caixa a obra fica: "prev" = a que vem ANTES (à esquerda), "next" = a que vem DEPOIS (à direita). */
export type LadoDaCaixa = "prev" | "next";

/**
 * O lado de uma obra: título, verbo, destino e arte. `null` = a obra ainda não tem nada lançado naquele modo (o cartão dela é o cinza
 * "Em breve"): ela não entra na ordem (ver o topo do arquivo). `lado` decide o capítulo: o último (anterior) ou o primeiro (seguinte).
 */
export function ladoDaObra(obra: ObraParaOrdem, lang: Lang, capitulos: CapitulosDaObra, comRascunhos: boolean, lado: LadoDaCaixa): LadoDaOrdem | null {
  const botao = cartaoDaObra(obra, lang, capitulos, comRascunhos).botao;
  if (botao.tipo !== "link") return null;
  // link externo: o mesmo do cartão; senão, o capítulo da ponta certa (o botão do cartão só existe se há capítulos listados)
  const capitulo = lado === "prev" ? capitulos.listados.at(-1) : capitulos.listados[0];
  const destino = botao.externo || !capitulo ? { tipo: "link" as const, href: botao.href, externo: botao.externo } : { tipo: "link" as const, href: urlDoCapitulo(capitulo), externo: false };
  const titulo = tituloDaObra(obra, lang);
  const verbo = verboDaObra(obra);
  const rotulo = `${TEXTOS_DA_ORDEM[lang].verbo[verbo]} ${titulo}`;
  return {
    slug: obra.data._origem.slug,
    titulo,
    verbo,
    rotulo,
    destino,
    emDoRotulo: larguraDoRotulo(rotulo),
    arte: arteDaObra(obra, lang),
  };
}

/**
 * As obras que existem numa ordem, na sequência dela: as mesmas que a grade de Histórias mostraria ordenada por aquela ordem
 * (crescente), sem busca nem filtro. `universo` = `dados.universo` (src/lib/idioma.ts).
 */
export function sequenciaDaOrdem<O extends ObraParaOrdem>(universo: readonly O[], ordem: OrdemDeLeitura, lang: Lang): O[] {
  const cartoes = universo.map((obra) => ({ obra, titulo: tituloDaObra(obra, lang), ordem: valoresDeOrdem(obra), midia: obra.data.media }));
  return organizarCartoes(cartoes, { modo: ordem, decrescente: false, midia: "", busca: "", lang }).visiveis.map((c) => c.obra);
}

/** O bloco do fim de um capítulo da obra `atual`. `capitulosDe(obra)` = os capítulos (listados e ocultos) da obra naquele idioma. */
export function blocoDaOrdem<O extends ObraParaOrdem>(
  atual: O,
  lang: Lang,
  universo: readonly O[],
  capitulosDe: (obra: O) => CapitulosDaObra,
  comRascunhos: boolean,
): BlocoDaOrdem {
  const textos = TEXTOS_DA_ORDEM[lang];
  const verbo = verboDaObra(atual);
  const lado = (o: O, qual: LadoDaCaixa): LadoDaOrdem | null => ladoDaObra(o, lang, capitulosDe(o), comRascunhos, qual);
  const lista = (ordem: OrdemDeLeitura): ListaDaOrdem => {
    const sequencia = sequenciaDaOrdem(universo, ordem, lang);
    const i = sequencia.findIndex((o) => o.data._origem.slug === atual.data._origem.slug);
    if (i < 0) return { anterior: null, proximo: null, foraDaOrdem: true };
    // o vizinho é o primeiro, para cada lado, que já tem algo lançado: quem ainda é "Em breve" é pulado (nada de "Em breve" no bloco)
    const primeiroLancado = (candidatas: O[], qual: LadoDaCaixa): LadoDaOrdem | null => {
      for (const o of candidatas) {
        const l = lado(o, qual);
        if (l) return l;
      }
      return null;
    };
    return { anterior: primeiroLancado(sequencia.slice(0, i).reverse(), "prev"), proximo: primeiroLancado(sequencia.slice(i + 1), "next"), foraDaOrdem: false };
  };
  const listas = { chrono: lista("chrono"), release: lista("release") };
  return {
    lang,
    verbo,
    titulo: textos.titulo[verbo],
    ordemInicial: ORDEM_PADRAO,
    opcoes: ORDENS_DE_LEITURA.map((valor) => ({ valor, rotulo: textos.ordem[valor] })),
    listas,
    avisosDeForaDaOrdem: { chrono: textos.foraDaOrdem.chrono, release: textos.foraDaOrdem.release },
    emDosRotulos: Math.max(...ORDENS_DE_LEITURA.map((o) => emDaLinha(listas[o]))),
    emDoMaiorRotulo: Number(
      (Math.max(0, ...ORDENS_DE_LEITURA.flatMap((o) => [listas[o].anterior, listas[o].proximo]).flatMap((l) => (l ? [l.emDoRotulo] : []))) + FOLGA_DO_ROTULO_SOZINHO_EM).toFixed(3),
    ),
  };
}
