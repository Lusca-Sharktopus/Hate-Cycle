// A PÁGINA DE UM JOGO (T17d, só no Astro; hoje Cat-Crow-Thing): a janela da demo e o botão "Wishlist on Steam", logo abaixo do título.
//
// Liga-se pelo campo `game` do work.json: { "demo": "https://…", "steam": "https://…" }. Vazio = ainda não existe:
//   - sem demo: a janela (proporção 16:9, escura) fica reservada, com "Demo em breve" no meio; nenhum <iframe>, nada de terceiros;
//   - com demo: a janela mostra a demo num <iframe> com `sandbox` (o jogo roda no endereço DELE, sem alcançar a sessão de quem comenta);
//   - sem link da Steam: o botão aparece (logo + texto do autor) sem ser link, apagado, com "Link em breve" ao lado: não parece quebrado,
//     não leva a lugar nenhum e o leitor de tela o anuncia como indisponível;
//   - com link: o botão é um link para a Steam, em outra aba.
// O texto do capítulo (o que vem depois do --- no .md) continua aparecendo, embaixo do botão.
// Prova: tests/folheador.test.ts (parte "jogo") e, no navegador, tools/folheador_playwright.py.
import type { Lang } from "./config";
import { TEXTOS_DO_JOGO } from "./textosDoJogo";

/** A logo da Steam (o arquivo que o autor mandou em 20/10, relativo a static/). */
export const LOGO_DA_STEAM = "social/logo steam.png";

/** O sandbox da demo: rodar o jogo (scripts, no endereço dele), tela cheia/cursor preso e abrir links em outra aba. Nada de mudar a página. */
export const SANDBOX_DA_DEMO = "allow-scripts allow-same-origin allow-pointer-lock allow-popups";

export interface JanelaDoJogo {
  /** O nome da janela para o leitor de tela ("Demo de Cat-Crow-Thing"); também é o title do <iframe>. */
  nome: string;
  /** O endereço da demo; null = ainda não existe (a janela fica vazia, com `emBreve`). */
  demo: string | null;
  emBreve: string;
  steam: {
    /** O link; null = ainda não existe (o botão aparece apagado, com `linkEmBreve`). */
    href: string | null;
    texto: string;
    linkEmBreve: string;
    logo: string;
  };
}

/** A janela do jogo de uma obra, ou null se ela não tem `game` no work.json. */
export function janelaDoJogo(game: { demo?: string | undefined; steam?: string | undefined } | undefined, tituloDaObra: string, lang: Lang): JanelaDoJogo | null {
  if (!game) return null;
  const t = TEXTOS_DO_JOGO[lang];
  return {
    nome: t.janela.replaceAll("{obra}", tituloDaObra),
    demo: game.demo ? game.demo : null,
    emBreve: t.demoEmBreve,
    steam: { href: game.steam ? game.steam : null, texto: t.botaoDaSteam, linkEmBreve: t.linkEmBreve, logo: LOGO_DA_STEAM },
  };
}
