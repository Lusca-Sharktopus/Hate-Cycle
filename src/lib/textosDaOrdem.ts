// Os TEXTOS do bloco "estou lendo em ordem…" (T17c) que ficam no fim de cada capítulo.
//
// Moram aqui e NÃO no config.json: o config.json é do autor (chaves do Supabase, textos da interface) e o Claude não o edita.
// Para mudar uma frase deste bloco, mude aqui — é o único lugar. Cada idioma tem de ter todas as chaves (o TypeScript avisa).
//
// ⚠ Os textos em inglês são PROPOSTA (o autor ainda precisa aprovar); os em português seguem o desenho dele
//   ("estou lendo em ordem" + "Cronológica ▼", "Assistir Luz & Sangue ←", "Ler Beira de Estrada →").
// A seta ▼ e as setas ← → são desenhadas pelo CSS/SVG, não ficam nos textos.
import type { Ordem } from "../scripts/ordem/regras";
import type { Lang } from "./config";

/** O verbo do bloco: pelo TIPO da obra (ler = prosa e quadrinho; assistir = vídeo, curta, animação e RPG ao vivo; jogar = jogo). */
export type Verbo = "read" | "watch" | "play";

/** As duas ordens que o visitante escolhe (`order.chrono` e `order.release` do work.json). */
export type OrdemDeLeitura = Ordem;

export interface TextosDaOrdem {
  /** A frase de cima, conforme o tipo da obra ATUAL (a que o visitante está lendo agora). */
  titulo: Record<Verbo, string>;
  /** O nome de cada ordem no seletor (o "Cronológica ▼" do desenho). */
  ordem: Record<OrdemDeLeitura, string>;
  /** O verbo de cada lado, conforme o tipo da obra de DESTINO ("Assistir Luz & Sangue"). */
  verbo: Record<Verbo, string>;
  /** A obra atual existe no site, mas fora da ordem escolhida (`"chrono": false` no work.json: ex. Alô? Residência dos Di Vario na cronológica). */
  foraDaOrdem: Record<OrdemDeLeitura, string>;
}

export const TEXTOS_DA_ORDEM: Readonly<Record<Lang, TextosDaOrdem>> = {
  pt: {
    titulo: { read: "estou lendo em ordem", watch: "estou assistindo em ordem", play: "estou jogando em ordem" },
    ordem: { chrono: "Cronológica", release: "Lançamento" },
    verbo: { read: "Ler", watch: "Assistir", play: "Jogar" },
    foraDaOrdem: {
      chrono: "Esta história fica fora da ordem cronológica.",
      release: "Esta história fica fora da ordem de lançamento.",
    },
  },
  en: {
    titulo: { read: "I’m reading in", watch: "I’m watching in", play: "I’m playing in" },
    ordem: { chrono: "Chronological order", release: "Release order" },
    verbo: { read: "Read", watch: "Watch", play: "Play" },
    foraDaOrdem: {
      chrono: "This story sits outside the chronological order.",
      release: "This story sits outside the release order.",
    },
  },
};
