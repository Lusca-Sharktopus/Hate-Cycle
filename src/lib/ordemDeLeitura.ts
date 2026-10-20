// O bloco "estou lendo/assistindo/jogando em ordem…" (T17c): quem vem ANTES e quem vem DEPOIS da história que o visitante está
// lendo, na ordem cronológica ou na de lançamento. Só no Astro (o build.py não tem este bloco).
//
// Funções puras, sem HTML: recebem as obras já carregadas e devolvem DADOS. Quem desenha é src/components/ProximaHistoria.astro.
// Prova: tests/ordem.test.ts (sites inventados, incluindo o exemplo do PDF do autor: Pederneira em cronológica → anterior Luz & Sangue,
// seguinte Beira de Estrada, este só na prévia).
//
// As REGRAS DE ORDEM não são novas: usam exatamente o `organizarCartoes()` do seletor de Histórias (src/lib/seletor.ts), com a mesma lista de
// obras que a grade de Histórias mostra (`dados.universo`: listadas, do universo, em ordem de lançamento). Por isso:
//   - `"chrono": false` (ex.: Alô? Residência dos Di Vario) fica FORA da ordem cronológica e DENTRO da de lançamento;
//   - obra sem número naquela ordem vai para depois das numeradas;
//   - empate de número: vale a ordem de lançamento da lista (e, nela, a ordem das pastas);
//   - o "999" (obra sem `order.release`) é o de separarObras(): o fim da lista.
// E o que "existe no site naquele modo" é o que a grade de Histórias mostra naquele modo: no site publicado, só as publicadas; na prévia,
// também as de rascunho (`draft: true` no work.json). Publicar uma história nova "entre" duas faz os vizinhos se ajustarem sozinhos.
import { ORDEM_PADRAO, ORDENS } from "../scripts/ordem/regras";
import type { Lang } from "./config";
import { cartaoDaObra, capaDaObra, logoDaObra, tituloDaObra, valoresDeOrdem, type CapitulosDaObra, type ObraComDados } from "./obras";
import { organizarCartoes } from "./seletor";
import { TEXTOS_DA_ORDEM, type OrdemDeLeitura, type Verbo } from "./textosDaOrdem";

export { TEXTOS_DA_ORDEM, type OrdemDeLeitura, type Verbo } from "./textosDaOrdem";

/** As duas ordens, na ordem do seletor, e a padrão (as constantes moram em src/scripts/ordem/regras.ts, que o navegador também lê). */
export const ORDENS_DE_LEITURA: readonly OrdemDeLeitura[] = ORDENS;
export { ORDEM_PADRAO };

/** O que as regras leem de uma obra: o que as de src/lib/obras.ts leem, mais as imagens do bloco. */
export interface ObraParaOrdem extends ObraComDados {
  data: ObraComDados["data"] & { order_images?: readonly string[] | undefined };
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
  /** O texto do link, já com o verbo e o título: "Assistir Luz & Sangue". Obra sem nada para abrir: "Em breve: Beira de Estrada". */
  rotulo: string;
  /** Para onde vai: o MESMO lugar do cartão da obra em Histórias (link externo, capítulo, página da obra) ou lugar nenhum ("Em breve"). */
  destino: { tipo: "link"; href: string; externo: boolean } | { tipo: "em-breve" };
  /**
   * A arte do lado: as imagens `order_images` do work.json (a normal e, se houver, a do mouse por cima) ou, sem elas, a capa da obra
   * (`ehCapa`: o CSS a encaixa na mesma caixa); sem capa, a logo; sem nada, null (a caixa fica vazia). Caminhos relativos a static/.
   */
  arte: { principal: string; hover: string | null; ehCapa: boolean } | null;
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
}

/** A arte de uma obra para o bloco: ver `LadoDaOrdem.arte`. */
export function arteDaObra(obra: ObraParaOrdem, lang: Lang): LadoDaOrdem["arte"] {
  const proprias = (obra.data.order_images ?? []).filter((a) => a.trim() !== "");
  const principal = proprias[0];
  if (principal) return { principal, hover: proprias[1] ?? null, ehCapa: false };
  const capa = capaDaObra(obra, lang) || logoDaObra(obra, lang);
  return capa ? { principal: capa, hover: null, ehCapa: true } : null;
}

/** O lado de uma obra: título, verbo, destino (o do cartão dela) e arte. */
export function ladoDaObra(obra: ObraParaOrdem, lang: Lang, capitulos: CapitulosDaObra, comRascunhos: boolean): LadoDaOrdem {
  const textos = TEXTOS_DA_ORDEM[lang];
  const titulo = tituloDaObra(obra, lang);
  const verbo = verboDaObra(obra);
  const botao = cartaoDaObra(obra, lang, capitulos, comRascunhos).botao;
  const destino: LadoDaOrdem["destino"] = botao.tipo === "link" ? { tipo: "link", href: botao.href, externo: botao.externo } : { tipo: "em-breve" };
  return {
    slug: obra.data._origem.slug,
    titulo,
    verbo,
    rotulo: destino.tipo === "link" ? `${textos.verbo[verbo]} ${titulo}` : textos.emBreve.replace("{titulo}", titulo),
    destino,
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
  const lado = (o: O | undefined): LadoDaOrdem | null => (o ? ladoDaObra(o, lang, capitulosDe(o), comRascunhos) : null);
  const lista = (ordem: OrdemDeLeitura): ListaDaOrdem => {
    const sequencia = sequenciaDaOrdem(universo, ordem, lang);
    const i = sequencia.findIndex((o) => o.data._origem.slug === atual.data._origem.slug);
    if (i < 0) return { anterior: null, proximo: null, foraDaOrdem: true };
    return { anterior: lado(sequencia[i - 1]), proximo: lado(sequencia[i + 1]), foraDaOrdem: false };
  };
  return {
    lang,
    verbo,
    titulo: textos.titulo[verbo],
    ordemInicial: ORDEM_PADRAO,
    opcoes: ORDENS_DE_LEITURA.map((valor) => ({ valor, rotulo: textos.ordem[valor] })),
    listas: { chrono: lista("chrono"), release: lista("release") },
    avisosDeForaDaOrdem: { chrono: textos.foraDaOrdem.chrono, release: textos.foraDaOrdem.release },
  };
}
