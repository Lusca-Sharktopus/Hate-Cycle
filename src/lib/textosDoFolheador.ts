// Os TEXTOS do leitor página a página dos quadrinhos (T17d): as setas e as runas que ficam embaixo da página.
//
// Moram aqui e NÃO no config.json: o config.json é do autor (chaves do Supabase, textos da interface) e o Claude não o edita.
// Para mudar uma frase do leitor, mude aqui — é o único lugar. Cada idioma tem de ter todas as chaves (o TypeScript avisa).
// ⚠ São PROPOSTA (o autor ainda precisa aprovar). Ninguém os vê na tela: são o que o leitor de tela fala e a dica do mouse.
import type { Lang } from "./config";

export interface TextosDoFolheador {
  /** A seta da esquerda, dentro do capítulo. */
  paginaAnterior: string;
  /** A seta da direita, dentro do capítulo. */
  proximaPagina: string;
  /** A seta da esquerda na 1ª página: "Capítulo anterior: Capítulo 1". */
  capituloAnterior: string;
  /** A seta da direita na última página: "Próximo capítulo: Capítulo 2". */
  proximoCapitulo: string;
  /** Cada runa: "Página 3 de 8" ({n} e {total} são trocados). */
  pagina: string;
  /** O nome da fileira de runas. */
  runas: string;
}

export const TEXTOS_DO_FOLHEADOR: Readonly<Record<Lang, TextosDoFolheador>> = {
  pt: {
    paginaAnterior: "Página anterior",
    proximaPagina: "Próxima página",
    capituloAnterior: "Capítulo anterior",
    proximoCapitulo: "Próximo capítulo",
    pagina: "Página {n} de {total}",
    runas: "Páginas do capítulo",
  },
  en: {
    paginaAnterior: "Previous page",
    proximaPagina: "Next page",
    capituloAnterior: "Previous chapter",
    proximoCapitulo: "Next chapter",
    pagina: "Page {n} of {total}",
    runas: "Chapter pages",
  },
};
