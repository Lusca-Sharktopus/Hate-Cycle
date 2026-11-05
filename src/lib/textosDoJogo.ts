// Os TEXTOS da página de um jogo (T17d, Cat-Crow-Thing): a janela da demo e o botão da Steam.
//
// Moram aqui e NÃO no config.json: o config.json é do autor (chaves do Supabase, textos da interface) e o Claude não o edita.
// Para mudar uma frase, mude aqui — é o único lugar. Cada idioma tem de ter todas as chaves (o TypeScript avisa).
// O texto do botão é o do autor (pedido de 20/10): "Wishlist on Steam" / "Adicione à Wishlist". Os outros são PROPOSTA.
import type { Lang } from "./config";

export interface TextosDoJogo {
  /** O texto do botão (com a logo da Steam à esquerda). */
  botaoDaSteam: string;
  /** Ao lado do botão enquanto não há link (work.json → game.steam vazio). */
  linkEmBreve: string;
  /** Dentro da janela da demo enquanto ela não existe (work.json → game.demo vazio). */
  demoEmBreve: string;
  /** O nome da janela da demo para o leitor de tela: "Demo de Cat-Crow-Thing" ({obra} é trocado). */
  janela: string;
}

export const TEXTOS_DO_JOGO: Readonly<Record<Lang, TextosDoJogo>> = {
  pt: {
    botaoDaSteam: "Adicione à Wishlist",
    linkEmBreve: "Link em breve",
    demoEmBreve: "Demo em breve",
    janela: "Demo de {obra}",
  },
  en: {
    botaoDaSteam: "Wishlist on Steam",
    linkEmBreve: "Link coming soon",
    demoEmBreve: "Demo coming soon",
    janela: "{obra} demo",
  },
};
