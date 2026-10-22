// O que as páginas da T11 (home, Histórias, obra) e os atalhos {{stories}} / {{other-stories}} / {{emissaries}} desenham,
// montado a partir de `dadosDoIdioma()`: o "meio do caminho" entre as regras (src/lib) e os componentes (src/components).
//
// Função pura, sem HTML. Existe para duas coisas: (1) as páginas ficarem só com "pega os dados, desenha" e (2) o teste
// (tests/componentes.test.ts) montar EXATAMENTE os mesmos dados que as páginas, inclusive para conteúdo inventado.
// De onde vem no build.py: a home (linhas ~744–762), o SHORT (~695–703) e card_work/card_emissary.
import type { Lang } from "./config";
import { ATUALIZACOES_NA_HOME, rotuloDaAtualizacao, type Atualizacao } from "./atualizacoes";
import { formatarData } from "./datas";
import { cartaoDoEmissario, type CartaoDoEmissario, type EmissarioComDados } from "./emissarios";
import { aplicarAtalhos } from "./corpos";
import { HISTORIAS_NA_HOME } from "./home";
import { cartaoDaObra, dadosDoSeletor, type CapitulosDaObra, type CartaoDaObra, type DadosDoSeletor, type ObraComDados } from "./obras";

/** O que as funções daqui leem de `dadosDoIdioma()` (os campos de que precisam; o resultado completo serve). */
export interface DadosParaPaginas<O extends ObraComDados, E extends EmissarioComDados & { rendered?: { html?: string | undefined } | undefined }> {
  lang: Lang;
  universo: O[];
  outras: O[];
  destaques: O[];
  capitulosDe: (obra: O) => CapitulosDaObra;
  atualizacoes: Atualizacao[];
  universoExtra: readonly unknown[];
  sobre: { titulo: string; resumo: string; url: string } | null;
  emissarios: E[];
}

/** Um cartão de "Últimas atualizações" da home, pronto para desenhar. */
export interface AtualizacaoNaHome {
  url: string;
  /** Miniatura ou capa (relativa a static/); "" = sem imagem. */
  imagem: string;
  /** O selo: "Notícia", "Novo capítulo", "Novo episódio". */
  selo: string;
  /** A data como o visitante lê ("18 de ago. de 2026"). */
  data: string;
  titulo: string;
  texto: string;
}

export interface DadosDaHome {
  atualizacoes: AtualizacaoNaHome[];
  /** O carrossel: as 5 obras com atualização mais recente. */
  destaques: CartaoDaObra[];
  /** Tem Universo para explorar? (o botão "Explorar o universo"; some com `show_extras: false`.) */
  temUniverso: boolean;
  sobre: { titulo: string; resumo: string; url: string } | null;
}

/** A home de `lang`: ver build() linhas ~744–762. `comRascunhos` = prévia (aparece o "👁 Prévia" nos cartões sem botão). */
export function dadosDaHome<O extends ObraComDados, E extends EmissarioComDados & { rendered?: { html?: string | undefined } | undefined }>(
  dados: DadosParaPaginas<O, E>,
  comRascunhos: boolean,
): DadosDaHome {
  const lang = dados.lang;
  return {
    atualizacoes: dados.atualizacoes.slice(0, ATUALIZACOES_NA_HOME).map((a) => ({
      url: a.url,
      imagem: a.imagem,
      selo: rotuloDaAtualizacao(lang, a.tipo),
      data: formatarData(lang, a.data),
      titulo: a.titulo,
      texto: a.texto,
    })),
    destaques: dados.destaques.slice(0, HISTORIAS_NA_HOME).map((o) => cartaoDaObra(o, lang, dados.capitulosDe(o), comRascunhos)),
    temUniverso: dados.universoExtra.length > 0,
    sobre: dados.sobre,
  };
}

/** Os três atalhos do SHORT do build.py, como dados para os componentes. */
export interface DadosDosAtalhos {
  /** {{stories}}: os cartões do universo (na ordem de lançamento) e o seletor. */
  historias: { cartoes: CartaoDaObra[]; seletor: DadosDoSeletor };
  /** {{other-stories}}: os cartões das obras fora do universo (vazio = o atalho vira nada). */
  outras: CartaoDaObra[];
  /** {{emissaries}}: os cards dos emissários (vazio = o atalho vira nada). */
  emissarios: CartaoDoEmissario[];
}

/**
 * O SHORT[lang] do build(): os dados de cada atalho. `mostrarTextos` = config.json → emissaries.show_texts. O texto de cada
 * emissário é o `rendered.html` da entrada com os atalhos trocados por nada (no build.py, o SHORT ainda não existe quando
 * os cards dos emissários são montados).
 */
export function dadosDosAtalhos<O extends ObraComDados, E extends EmissarioComDados & { rendered?: { html?: string | undefined } | undefined }>(
  dados: DadosParaPaginas<O, E>,
  comRascunhos: boolean,
  mostrarTextos: boolean,
): DadosDosAtalhos {
  const lang = dados.lang;
  const cartao = (o: O) => cartaoDaObra(o, lang, dados.capitulosDe(o), comRascunhos);
  return {
    historias: { cartoes: dados.universo.map(cartao), seletor: dadosDoSeletor(lang, dados.universo) },
    outras: dados.outras.map(cartao),
    emissarios: dados.emissarios.map((e) => cartaoDoEmissario(e, aplicarAtalhos(e.rendered?.html ?? "", {}), mostrarTextos)),
  };
}
