// "Últimas atualizações" da home e o RSS: quais itens entram, em que ordem, e a fusão de notícia + capítulo.
//
// Função pura, sem HTML. Recebe as notícias (já ordenadas, `ordenarNoticias`) e, de cada obra, seus capítulos listados.
// Prova: tests/regras.test.ts (referência: tools/regras_ref.py, que roda o build() de verdade e guarda a lista pronta).
//
// De onde vem cada regra no build.py (função build(), linhas ~705–734 e ~923–933):
//   1. uma notícia vira item (data, título, texto = resumo ou resumo automático, miniatura, obras citadas em [[works/…]]);
//   2. cada capítulo COM DATA de cada obra vira item ("Obra — Capítulo", ou só "Obra" nas de capítulo único);
//      obra só com link externo e sem capítulos não entra;
//   3. FUSÃO: a notícia que cita a obra de um capítulo com até 3 dias de diferença (para mais ou para menos) some
//      da lista, e o capítulo, se estiver sem resumo, fica com o resumo dela (a notícia continua na página Notícias);
//   4. ordem: data mais nova primeiro; empate: a ordem de entrada (notícias primeiro, depois as obras por pasta);
//   5. a home mostra os 4 primeiros; o RSS, os 30 primeiros que tenham data válida.
import { t, type Lang } from "./config";
import { dataParaRss, datasProximas } from "./datas";
import { CLASSES_DO_PYTHON } from "./markdown";
import { capaDaObra, tituloDaObra, urlDoCapitulo, type CapituloComDados, type ObraComDados } from "./obras";
import { tituloDoCapitulo } from "./capitulos";
import { urlDaNoticia, tituloDaNoticia, type NoticiaComDados } from "./noticias";
import { compararComoPython } from "./ordem";
import { resumoDaNoticia } from "./resumos";

/** Quantas atualizações a home mostra. */
export const ATUALIZACOES_NA_HOME = 4;
/** Quantos itens o RSS leva (antes de pular os de data inválida). */
export const ITENS_NO_RSS = 30;

/** O "selo" do cartão: notícia, novo capítulo ou novo episódio (as chaves de config.json → ui). */
export type TipoDeAtualizacao = "tag_news" | "tag_chapter" | "tag_chapter_ep";

export interface Atualizacao {
  /** Data como está escrita (AAAA-MM-DD; "" se a notícia não tem data). */
  data: string;
  url: string;
  titulo: string;
  tipo: TipoDeAtualizacao;
  texto: string;
  /** Miniatura (notícia) ou capa da obra (capítulo), relativa a static/; "" = sem imagem. */
  imagem: string;
  /** Só capítulos: a pasta da obra. */
  obra?: string;
}

/** Uma obra e os capítulos listados dela no idioma. */
export interface ObraComCapitulos {
  obra: ObraComDados;
  listados: readonly CapituloComDados[];
}

/** Os selos, escritos no idioma (config.json → ui). */
export function rotuloDaAtualizacao(lang: Lang, tipo: TipoDeAtualizacao): string {
  return t(lang, tipo);
}

/**
 * `w["meta"].get("external")` do Python é "verdadeiro" para QUALQUER link escrito — em qualquer idioma: {"pt": "…"} conta
 * mesmo para a página em inglês. Só texto vazio, ausente ou {} é "falso". (Diferente de `linkExterno`, que olha um idioma só.)
 */
export function declaraLinkExterno(obra: ObraComDados): boolean {
  const e = obra.data.external;
  return typeof e === "string" ? e !== "" : e !== undefined && Object.keys(e).length > 0;
}

/** re.findall(r"\[\[works/([\w-]+)", corpo): as obras que a notícia cita com [[works/pasta]] (\w do Python é Unicode). */
export function obrasCitadasNaNoticia(corpo: string): string[] {
  const re = new RegExp(`\\[\\[works/([${CLASSES_DO_PYTHON.w}-]+)`, "gu");
  return Array.from(corpo.matchAll(re), (m) => m[1] ?? "");
}

/**
 * A lista de atualizações da home, completa (a home mostra só `ATUALIZACOES_NA_HOME`): ver as regras no alto do arquivo.
 * `noticias` na ordem de `ordenarNoticias`; `obras` na ordem das pastas (`obrasPorPasta`).
 */
export function atualizacoes(lang: Lang, noticias: readonly NoticiaComDados[], obras: readonly ObraComCapitulos[]): Atualizacao[] {
  const deNoticias = noticias.map((n) => ({
    item: {
      data: n.data.date ?? "",
      url: urlDaNoticia(n),
      titulo: tituloDaNoticia(n),
      tipo: "tag_news" as TipoDeAtualizacao,
      texto: resumoDaNoticia(n.data.summary, n.body ?? ""),
      imagem: n.data.thumb || n.data.image || "",
    } satisfies Atualizacao,
    cita: obrasCitadasNaNoticia(n.body ?? ""),
  }));

  const deCapitulos: Atualizacao[] = [];
  for (const { obra, listados } of obras) {
    if (declaraLinkExterno(obra) && listados.length === 0) continue;
    for (const c of listados) {
      if (!c.data.date) continue;
      deCapitulos.push({
        data: c.data.date,
        url: urlDoCapitulo(c),
        titulo: obra.data.oneshot ? tituloDaObra(obra, lang) : `${tituloDaObra(obra, lang)} — ${tituloDoCapitulo(c, obra)}`,
        tipo: obra.data.kind === "video" ? "tag_chapter_ep" : "tag_chapter",
        texto: c.data.summary ?? "",
        imagem: capaDaObra(obra, lang),
        obra: obra.data._origem.slug,
      });
    }
  }

  // Fusão: cada notícia que tem "gêmeos" (capítulos das obras que ela cita, a até 3 dias) é descartada e empresta o
  // resumo aos gêmeos que estiverem sem. As notícias são vistas da mais nova para a mais antiga, como no Python.
  const mantidas: Atualizacao[] = [];
  for (const { item, cita } of deNoticias) {
    const gemeos = deCapitulos.filter((c) => c.obra !== undefined && cita.includes(c.obra) && datasProximas(c.data, item.data));
    if (gemeos.length > 0) {
      for (const c of gemeos) c.texto = c.texto || item.texto;
      continue;
    }
    mantidas.push(item);
  }
  // ordem de entrada: notícias mantidas, depois capítulos; depois a data (mais nova primeiro, desempate estável)
  return [...mantidas, ...deCapitulos].sort((a, b) => compararComoPython(b.data, a.data));
}

/** Um item do RSS (só os dados; o XML e o endereço completo são do endpoint, T14). */
export interface ItemDoRss {
  titulo: string;
  /** Endereço a partir da raiz do site (ex.: "/pt/news/x/"); o RSS põe `siteUrl` na frente. */
  url: string;
  /** `pubDate` no formato de e-mail. */
  data: string;
  descricao: string;
}

/** Os itens do RSS: os 30 primeiros da lista de atualizações, menos os de data inexistente (que o Python pula depois de cortar). */
export function itensDoRss(lista: readonly Atualizacao[]): ItemDoRss[] {
  return lista.slice(0, ITENS_NO_RSS).flatMap((a) => {
    const data = dataParaRss(a.data);
    return data === undefined ? [] : [{ titulo: a.titulo, url: a.url, data, descricao: a.texto }];
  });
}
