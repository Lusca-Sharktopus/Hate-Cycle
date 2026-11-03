// Histórias favoritas (03/11/2026, só no site novo): as regras, sem DOM e sem imports (testadas em tests/favoritos.test.ts).
//
// Pedido do autor (03/11, zip "for claude": "gif discord 1/2.png" e "fav.png"):
//   - ao passar o mouse na capa de uma história, aparece uma estrelinha no canto de cima (como os GIFs favoritados do Discord);
//   - no topo da página Histórias, um botão com estrela mostra só as favoritas;
//   - sem conta, os dois abrem uma janela (a página escurece atrás) dizendo que o recurso exige login.
//   - (03/11, segundo pedido) a caixinha DESLIZA para baixo, saindo de trás da borda em cima da capa, e não começa como estrela: passa
//     rápido por runas sorteadas da lista da obra (`star_runes` no work.json), para numa runa final e só então vira a estrela.
// Decisões de quem fez (dá para mudar): a estrela de uma história JÁ favoritada fica sempre à vista (cheia, sem as runas); em tela de
// toque (sem mouse) as estrelas ficam sempre à vista; com "reduzir movimento" no sistema, nada desliza nem gira; o filtro não é
// lembrado entre visitas.

/** O que a página traz em window.HC_FAV (src/lib/comentarios.ts → configuracaoDosFavoritos): conexão, idioma e as obras dos cartões. */
export interface ConfiguracaoDosFavoritos {
  url: string;
  key: string;
  lang: string;
  /** título do cartão (data-title) → identificador da obra (a pasta em content/works/, igual nos dois idiomas). */
  obras: Readonly<Record<string, string>>;
  /** obra → as runas que a estrela sorteia e a runa final (src/lib/runasDaEstrela.ts). */
  runas: Readonly<Record<string, RunasDaObra>>;
}

export interface RunasDaObra {
  lista: readonly string[];
  /** a(s) runa(s) final(is), em ordem, logo antes da estrela (Luz & Sangue: ✝ e o sangue). */
  finais: readonly string[];
}

/** Uma runa: um símbolo curto, sem espaços nem caracteres de HTML (a mesma regra do schema do work.json). */
const UMA_RUNA = /^[^\s<>&"']{1,4}$/u;
function runasValidas(x: unknown): RunasDaObra | null {
  if (!x || typeof x !== "object") return null;
  const { lista, finais } = x as Record<string, unknown>;
  if (!Array.isArray(lista) || !Array.isArray(finais)) return null;
  const boas = lista.filter((r): r is string => typeof r === "string" && UMA_RUNA.test(r)).slice(0, 60);
  const fins = finais.filter((r): r is string => typeof r === "string" && UMA_RUNA.test(r)).slice(0, 3);
  return boas.length && fins.length === finais.length && fins.length ? { lista: boas, finais: fins } : null;
}

/** Quantas runas sorteadas passam antes da(s) final(is), e quanto tempo cada uma fica (ms). */
export const RUNAS_SORTEADAS = 5;
export const TEMPO_DE_CADA_RUNA = 55;
export const TEMPO_DA_RUNA_FINAL = 150;

/**
 * A seqüência da animação: `quantas` runas sorteadas da lista (nunca a mesma duas vezes seguidas, quando a lista tem mais de uma) e,
 * por último, a(s) runa(s) final(is). `sorteio` devolve um número em [0, 1) (Math.random no navegador; fixo no teste).
 */
export function sequenciaDeRunas(r: RunasDaObra, quantas = RUNAS_SORTEADAS, sorteio: () => number = Math.random): string[] {
  const saida: string[] = [];
  for (let i = 0; i < quantas; i++) {
    let runa = r.lista[Math.min(r.lista.length - 1, Math.floor(sorteio() * r.lista.length))] as string;
    if (r.lista.length > 1 && runa === saida[saida.length - 1]) runa = r.lista[(r.lista.indexOf(runa) + 1) % r.lista.length] as string;
    saida.push(runa);
  }
  saida.push(...r.finais);
  return saida;
}

/** Quando cada runa da seqüência entra (ms desde o começo) e quando a estrela volta: as sorteadas a cada TEMPO_DE_CADA_RUNA, as finais a
 *  cada TEMPO_DA_RUNA_FINAL. */
export function horariosDaSequencia(sorteadas: number, finais: number): { entradas: number[]; estrela: number } {
  const entradas: number[] = [];
  let t = 0;
  for (let i = 0; i < sorteadas; i++) (entradas.push(t), (t += TEMPO_DE_CADA_RUNA));
  for (let i = 0; i < finais; i++) (entradas.push(t), (t += TEMPO_DA_RUNA_FINAL));
  return { entradas, estrela: t };
}

/** O identificador de uma obra como o banco aceita (check de public.favorites). */
export const FORMATO_DA_OBRA = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export function obraValida(id: unknown): id is string {
  return typeof id === "string" && id.length <= 80 && FORMATO_DA_OBRA.test(id);
}

/** Lê o window.HC_FAV; faltou algo essencial = null (nada de estrelas na página). */
export function lerConfiguracaoDosFavoritos(x: unknown): ConfiguracaoDosFavoritos | null {
  if (!x || typeof x !== "object") return null;
  const { url, key, lang, obras, runas } = x as Record<string, unknown>;
  if (typeof url !== "string" || !url || typeof key !== "string" || !key) return null;
  if (!obras || typeof obras !== "object" || Array.isArray(obras)) return null;
  // sem protótipo: um título ou pasta chamado "constructor" não cai em propriedade herdada (revisão de 03/11)
  const limpas: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [titulo, id] of Object.entries(obras as Record<string, unknown>)) if (obraValida(id)) limpas[titulo] = id;
  const runasLimpas: Record<string, RunasDaObra> = Object.create(null) as Record<string, RunasDaObra>;
  if (runas && typeof runas === "object" && !Array.isArray(runas)) {
    for (const [obra, rr] of Object.entries(runas as Record<string, unknown>)) {
      const boa = runasValidas(rr);
      if (obraValida(obra) && boa) runasLimpas[obra] = boa;
    }
  }
  return { url, key, lang: typeof lang === "string" ? lang : "en", obras: limpas, runas: runasLimpas };
}

/** Os favoritos que vieram do banco: só os identificadores no formato certo. */
export function favoritosDoBanco(linhas: unknown): Set<string> {
  const saida = new Set<string>();
  if (!Array.isArray(linhas)) return saida;
  for (const l of linhas) {
    const id = l && typeof l === "object" ? (l as { work_id?: unknown }).work_id : undefined;
    if (obraValida(id)) saida.add(id);
  }
  return saida;
}

/** Com o filtro ligado, o cartão sai se a obra não é favorita (cartão sem obra conhecida também sai). */
export function cartaoFora(obra: string | undefined, filtroLigado: boolean, favoritos: ReadonlySet<string>): boolean {
  return filtroLigado && !(obra !== undefined && favoritos.has(obra));
}

export const TEXTOS_DOS_FAVORITOS = {
  pt: {
    favoritar: (titulo: string) => `Favoritar ${titulo}`,
    desfavoritar: (titulo: string) => `Tirar ${titulo} dos favoritos`,
    filtroLigar: "Mostrar só as histórias favoritas",
    filtroDesligar: "Mostrar todas as histórias",
    vazio: "Você ainda não tem histórias favoritas. Clique na estrela no canto de uma capa para favoritar.",
    nenhumaAqui: "Nenhuma das suas favoritas aparece com essa busca ou esse tipo.",
    erro: "Não deu para salvar o favorito. Tente de novo.",
    janelaTitulo: "Favoritos",
    janelaTexto:
      "Favoritar histórias exige uma conta. Entre na sua conta pela caixa de comentários, no fim de qualquer capítulo ou notícia, e volte aqui para marcar as suas favoritas.",
    entendi: "Entendi",
    fechar: "Fechar",
  },
  en: {
    favoritar: (titulo: string) => `Add ${titulo} to favorites`,
    desfavoritar: (titulo: string) => `Remove ${titulo} from favorites`,
    filtroLigar: "Show only favorite stories",
    filtroDesligar: "Show all stories",
    vazio: "You don't have any favorite stories yet. Click the star in the corner of a cover to add one.",
    nenhumaAqui: "None of your favorites match this search or type.",
    erro: "Couldn't save the favorite. Please try again.",
    janelaTitulo: "Favorites",
    janelaTexto:
      "Favoriting stories requires an account. Log in through the comment box at the end of any chapter or news post, then come back here to mark your favorites.",
    entendi: "Got it",
    fechar: "Close",
  },
} as const;
export type TextosDosFavoritos = (typeof TEXTOS_DOS_FAVORITOS)["pt"] | (typeof TEXTOS_DOS_FAVORITOS)["en"];

export function textosDosFavoritos(lang: string): TextosDosFavoritos {
  return lang.toLowerCase().startsWith("pt") ? TEXTOS_DOS_FAVORITOS.pt : TEXTOS_DOS_FAVORITOS.en;
}
