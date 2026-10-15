// As regras das OBRAS: título, capa, botão, em que ordem aparecem, o que o seletor de Histórias oferece.
//
// Tudo aqui é função pura: recebe obras e capítulos já carregados (as entradas das coleções `works` e `chapters`,
// ou qualquer objeto com os mesmos campos) e devolve DADOS — nunca HTML. Desenhar é com as páginas (T11).
// A prova de que cada função faz o mesmo que o Python está em tests/regras.test.ts (referência: tools/regras_ref.py).
//
// De onde vem cada regra no build.py:
//   tituloDaObra/capaDaObra/logoDaObra → wtitle/wcover/wlogo     linhas ~235–237
//   linkDaObra                          → wlink                   linha ~240
//   rotuloDoBotao                       → wcta                    linha ~251
//   cartaoDaObra                        → card_work               linha ~456 (só os dados que ele usa)
//   separarObras                        → build()                 linhas ~691–693 (listadas, universo × outras, ordem de lançamento)
//   destaquesDaHome                     → build()                 linhas ~736–741 (as 5 obras do carrossel da home)
//   dadosDoSeletor                      → sorter_html             linha ~504 (opções do seletor; MEDIA_LABELS/MEDIA_UI)
//   organizarCartoes                    → static/site.js          bloco 1 (as três ordens, a busca e o filtro de mídia)
import { t, tList, tr, type Lang, type Translatable } from "./config";
import { compararComoPython } from "./ordem";
import { obraListada, type ObraVisivel } from "./visibilidade";

// ───────────── formatos mínimos ─────────────

/** O que as regras leem de uma obra (work.json já validado). As entradas da coleção `works` têm isto e mais. */
export interface ObraComDados extends ObraVisivel {
  data: ObraVisivel["data"] & {
    kind?: string | undefined;
    universe?: boolean | undefined;
    title?: Translatable | undefined;
    blurb?: Translatable | undefined;
    cover?: Translatable | undefined;
    logo?: Translatable | undefined;
    cta?: Translatable | undefined;
    order?: { release?: number | undefined; chrono?: number | false | undefined } | undefined;
    media?: string | undefined;
    updated?: string | undefined;
  };
}

/** O que as regras leem de um capítulo (front matter já validado + de onde veio). */
export interface CapituloComDados {
  data: {
    title?: string | undefined;
    date?: string | undefined;
    summary?: string | undefined;
    chapter?: string | undefined;
    draft?: boolean | undefined;
    unlisted?: boolean | undefined;
    _origem: { obra: string; capitulo: string; lang: Lang; posicao: number };
  };
}

/** Os capítulos de uma obra num idioma, separados como o load_works() separa. */
export interface CapitulosDaObra<C extends CapituloComDados = CapituloComDados> {
  listados: readonly C[];
  ocultos: readonly C[];
}

/** Endereço de um capítulo: /<idioma>/works/<obra>/<pasta do capítulo>/ (o `url` de load_works). */
export function urlDoCapitulo(c: CapituloComDados): string {
  const o = c.data._origem;
  return `/${o.lang}/works/${o.obra}/${o.capitulo}/`;
}

/** Endereço da página própria da obra: /<idioma>/works/<obra>/. */
export function urlDaObra(obra: ObraComDados, lang: Lang): string {
  return `/${lang}/works/${obra.data._origem.slug}/`;
}

// ───────────── título, capa, logo, resumo ─────────────

/** wtitle(): o título no idioma; sem título, o nome da pasta. */
export function tituloDaObra(obra: ObraComDados, lang: Lang): string {
  return tr(obra.data.title, lang, obra.data._origem.slug);
}

/** wcover(): a capa no idioma (caminho relativo a static/); "" = não tem. */
export function capaDaObra(obra: ObraComDados, lang: Lang): string {
  return tr(obra.data.cover, lang);
}

/** wlogo(): a logo no idioma; "" = não tem. */
export function logoDaObra(obra: ObraComDados, lang: Lang): string {
  return tr(obra.data.logo, lang);
}

/** `blurb` no idioma: o texto curto do cartão e da página da obra. */
export function resumoDaObra(obra: ObraComDados, lang: Lang): string {
  return tr(obra.data.blurb, lang);
}

// ───────────── o botão ─────────────

/** Para onde o botão da obra leva. `href: null` = ainda não há nada para ler/assistir (o cartão mostra "Em breve"). */
export interface LinkDaObra {
  href: string | null;
  /** true = link para fora do site (abre em outra aba, com rel="noopener noreferrer"). */
  externo: boolean;
}

/**
 * wlink(): link externo, se a obra tem um naquele idioma; senão, o capítulo (obra de capítulo único = `oneshot`) ou a
 * página da obra, desde que haja capítulos listados; senão, nada.
 */
export function linkDaObra(obra: ObraComDados, lang: Lang, capitulos: readonly CapituloComDados[]): LinkDaObra {
  const fora = tr(obra.data.external, lang);
  if (fora) return { href: fora, externo: true };
  const primeiro = capitulos[0];
  if (obra.data.oneshot && primeiro) return { href: urlDoCapitulo(primeiro), externo: false };
  if (primeiro) return { href: urlDaObra(obra, lang), externo: false };
  return { href: null, externo: false };
}

/** wcta(): o texto do botão — o `cta` do work.json ou "Leia aqui" ("Assista aqui" para obras em vídeo). */
export function rotuloDoBotao(obra: ObraComDados, lang: Lang): string {
  return tr(obra.data.cta, lang) || t(lang, obra.data.kind === "video" ? "watch" : "read");
}

// ───────────── o cartão de cada obra ─────────────

/** Valores de ordem de uma obra (`data-release` e `data-chrono` do cartão): número, ou "hide" se o work.json diz `false`. */
export type ValorDeOrdem = number | "hide";
export interface ValoresDeOrdem {
  release?: ValorDeOrdem;
  chrono?: ValorDeOrdem;
}

/** Os valores de ordem que a obra declara em `order` (campo ausente = a obra não participa daquela ordem). */
export function valoresDeOrdem(obra: ObraComDados): ValoresDeOrdem {
  const o = obra.data.order;
  const saida: ValoresDeOrdem = {};
  if (o && "chrono" in o && o.chrono !== undefined) saida.chrono = o.chrono === false ? "hide" : o.chrono;
  if (o && "release" in o && o.release !== undefined) saida.release = o.release;
  return saida;
}

/** O botão do cartão: um link (com texto) ou o aviso "Em breve". */
export type BotaoDoCartao =
  | { tipo: "link"; href: string; externo: boolean; rotulo: string }
  | { tipo: "em-breve"; rotulo: string };

/** Tudo o que o cartão de uma obra mostra e carrega (o card_work do build.py), sem HTML. */
export interface CartaoDaObra {
  slug: string;
  titulo: string;
  resumo: string;
  /** Capa; sem capa, a logo; "" = sem imagem (o cartão mostra um quadrado vazio). Caminho relativo a static/. */
  imagem: string;
  botao: BotaoDoCartao;
  /** Só na prévia: obra sem botão, mas com capítulo `unlisted` → "👁 Prévia" para o primeiro deles. */
  previa: { href: string; rotulo: string } | null;
  ordem: ValoresDeOrdem;
  midia: string | undefined;
}

/** card_work(): os dados do cartão de uma obra. `comRascunhos` = prévia (o `DRAFTS` do build.py). */
export function cartaoDaObra(obra: ObraComDados, lang: Lang, capitulos: CapitulosDaObra, comRascunhos: boolean): CartaoDaObra {
  const link = linkDaObra(obra, lang, capitulos.listados);
  const botao: BotaoDoCartao = link.href
    ? { tipo: "link", href: link.href, externo: link.externo, rotulo: rotuloDoBotao(obra, lang) }
    : { tipo: "em-breve", rotulo: t(lang, "soon") };
  const oculto = capitulos.ocultos[0];
  return {
    slug: obra.data._origem.slug,
    titulo: tituloDaObra(obra, lang),
    resumo: resumoDaObra(obra, lang),
    imagem: capaDaObra(obra, lang) || logoDaObra(obra, lang),
    botao,
    previa: !link.href && comRascunhos && oculto ? { href: urlDoCapitulo(oculto), rotulo: t(lang, "preview") } : null,
    ordem: valoresDeOrdem(obra),
    midia: obra.data.media || undefined,
  };
}

// ───────────── quais obras, em que ordem ─────────────

/** Obras na ordem das pastas (o `sorted(...)` de load_works): é dela que saem os desempates de todas as outras ordens. */
export function obrasPorPasta<T extends ObraComDados>(obras: readonly T[]): T[] {
  return [...obras].sort((a, b) => compararComoPython(a.data._origem.slug, b.data._origem.slug));
}

/** Obra sem `order.release` vai para o fim da ordem de lançamento. */
const LANCAMENTO_PADRAO = 999;

/**
 * As obras que as listas de um idioma mostram (`listed` e `langs`), separadas como o build():
 *  - `universo`: `universe: true` (o padrão), em ordem de lançamento (`order.release`; sem número, no fim; empate: ordem das pastas);
 *  - `outras`: `universe: false` ("Outras histórias"), na ordem das pastas.
 * (Hoje todas as obras são do universo, mas a regra continua valendo.)
 */
export function separarObras<T extends ObraComDados>(obras: readonly T[], lang: Lang, todosOsIdiomas: readonly Lang[]): { universo: T[]; outras: T[] } {
  const listadas = obrasPorPasta(obras).filter((o) => obraListada(o, lang, todosOsIdiomas));
  const universo = listadas
    .filter((o) => o.data.universe ?? true)
    .sort((a, b) => (a.data.order?.release ?? LANCAMENTO_PADRAO) - (b.data.order?.release ?? LANCAMENTO_PADRAO));
  const outras = listadas.filter((o) => !(o.data.universe ?? true));
  return { universo, outras };
}

/** Quantas obras o carrossel da home mostra. */
export const DESTAQUES_NA_HOME = 5;

/**
 * last_update(): a data mais recente da obra — o maior entre as datas dos capítulos listados e o `updated` do work.json.
 * "" = nenhuma. (As datas são comparadas como texto, AAAA-MM-DD, como o Python.)
 */
export function ultimaAtualizacaoDaObra(obra: ObraComDados, capitulos: readonly CapituloComDados[]): string {
  const datas = capitulos.flatMap((c) => (c.data.date ? [c.data.date] : []));
  if (obra.data.updated) datas.push(obra.data.updated);
  return datas.reduce((maior, d) => (compararComoPython(d, maior) > 0 ? d : maior), "");
}

/**
 * As obras do carrossel da home: as do universo com atualização mais recente primeiro; empate: quem já tem botão antes
 * de quem está "em breve"; novo empate: a de lançamento mais recente (`order.release` maior; sem número vale 0);
 * empate total: a ordem em que vieram (a de lançamento). Só as 5 primeiras.
 * `capitulosListados(obra)` devolve os capítulos listados da obra no idioma.
 */
export function destaquesDaHome<T extends ObraComDados>(
  universo: readonly T[],
  lang: Lang,
  capitulosListados: (obra: T) => readonly CapituloComDados[],
  limite = DESTAQUES_NA_HOME,
): T[] {
  const chave = (o: T) => {
    const caps = capitulosListados(o);
    return { quando: ultimaAtualizacaoDaObra(o, caps), temBotao: linkDaObra(o, lang, caps).href !== null, release: o.data.order?.release ?? 0 };
  };
  return universo
    .map((o) => ({ o, k: chave(o) }))
    .sort((a, b) => compararComoPython(b.k.quando, a.k.quando) || Number(b.k.temBotao) - Number(a.k.temBotao) || b.k.release - a.k.release)
    .slice(0, limite)
    .map((x) => x.o);
}

// ───────────── o seletor de Histórias ─────────────

/** As três ordens do seletor, na ordem em que aparecem no menu. */
export const MODOS_DE_ORDEM = ["release", "chrono", "alpha"] as const;
export type ModoDeOrdem = (typeof MODOS_DE_ORDEM)[number];

/** MEDIA_LABELS do build.py (linha ~498): o nome de cada tipo de mídia no filtro. Chaves = as de MIDIAS em schemas.ts. */
export const ROTULOS_DE_MIDIA: Readonly<Record<Lang, Readonly<Record<string, string>>>> = {
  en: { videogame: "Videogame", "live-ttrpg": "Live TTRPG", webcomic: "Webcomic", "short-story": "Short Story", "animated-show": "Animated Show", "short-film": "Short Film", misc: "Miscellaneous" },
  pt: { videogame: "Videogame", "live-ttrpg": "RPG ao Vivo", webcomic: "Webcomic", "short-story": "Conto", "animated-show": "Série Animada", "short-film": "Curta-metragem", misc: "Miscelânea" },
};

/** MEDIA_UI do build.py (linha ~502): o nome do filtro de mídia e o item que não filtra nada. */
export const TEXTOS_DO_FILTRO_DE_MIDIA: Readonly<Record<Lang, { rotulo: string; todos: string }>> = {
  en: { rotulo: "Media type", todos: "All types" },
  pt: { rotulo: "Tipo de mídia", todos: "Todos os tipos" },
};

/** O que o seletor de Histórias oferece num idioma (sorter_html do build.py, sem HTML). */
export interface DadosDoSeletor {
  /** As três ordens, com o texto de cada uma no menu. */
  ordens: { valor: ModoDeOrdem; rotulo: string }[];
  /** O texto do botão de inverter, por ordem: [crescente, decrescente] (ex.: ["Oldest first", "Newest first"]). */
  direcoes: Record<ModoDeOrdem, readonly string[]>;
  /** Os tipos de mídia das obras da grade, na ordem em que aparecem; vazio = o filtro nem existe. */
  midias: { valor: string; rotulo: string }[];
  filtroDeMidia: { rotulo: string; todos: string };
  placeholderDaBusca: string;
  rotuloDaOrdem: string;
}

/** sorter_html(): as opções do seletor para as obras da grade (`obrasDaGrade` = as do universo, já em ordem). */
export function dadosDoSeletor(lang: Lang, obrasDaGrade: readonly ObraComDados[]): DadosDoSeletor {
  const nomes = ROTULOS_DE_MIDIA[lang];
  const presentes: string[] = [];
  for (const o of obrasDaGrade) if (o.data.media && !presentes.includes(o.data.media)) presentes.push(o.data.media);
  return {
    ordens: MODOS_DE_ORDEM.map((valor) => ({ valor, rotulo: t(lang, `sort_${valor}`) })),
    direcoes: { release: tList(lang, "dir_release"), chrono: tList(lang, "dir_chrono"), alpha: tList(lang, "dir_alpha") },
    midias: presentes.map((valor) => ({ valor, rotulo: nomes[valor] ?? valor })),
    filtroDeMidia: TEXTOS_DO_FILTRO_DE_MIDIA[lang],
    placeholderDaBusca: t(lang, "search_ph"),
    rotuloDaOrdem: t(lang, "sort_by"),
  };
}

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
