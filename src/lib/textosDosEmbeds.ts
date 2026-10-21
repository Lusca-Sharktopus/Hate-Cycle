// Os textos dos posts incorporados com clique (T17g, B27): o botão "Mostrar post do X", o aviso, o link para o original e as
// mensagens de carregamento. Ficam AQUI e não no config.json (que é do autor e leva as chaves do Supabase): mudar uma frase é
// mudar este arquivo. São os dois idiomas do site; o idioma é o da página.
//
// O build escreve os textos que o navegador precisa como atributos `data-t-*` do quadro (src/lib/embedsComClique.ts); o script
// (src/scripts/embeds/) só os lê, com textContent. Nada é montado como HTML.
import type { Lang } from "./config";

export interface TextosDoEmbed {
  /** O botão: "Mostrar post do X". */
  botao: string;
  /** Aviso acima do botão (aparece só com JavaScript, junto do botão). */
  aviso: string;
  /** O link para o post original (sempre visível, com ou sem JavaScript). */
  original: string;
  /** Texto de status enquanto o post carrega. */
  carregando: string;
  /** Texto de status quando o post terminou de carregar. */
  pronto: string;
  /** Texto de status quando o post não carregou. */
  erro: string;
  /** Título do <iframe> (o nome que o leitor de tela lê). */
  titulo: string;
}

type Montar = (rotulo: string) => TextosDoEmbed;

const POR_IDIOMA: Readonly<Record<Lang, Montar>> = {
  pt: (r) => ({
    botao: `Mostrar post do ${r}`,
    aviso: `Este post é do ${r} e só é carregado quando você clica.`,
    original: `Abrir o post original no ${r} ↗`,
    carregando: "Carregando o post…",
    pronto: "Post carregado.",
    erro: "O post não carregou aqui. Use o link para abrir o original.",
    titulo: `Post do ${r}`,
  }),
  en: (r) => ({
    botao: `Show ${r} post`,
    aviso: `This post is from ${r} and only loads when you click.`,
    original: `Open the original post on ${r} ↗`,
    carregando: "Loading the post…",
    pronto: "Post loaded.",
    erro: "The post did not load here. Use the link to open the original.",
    titulo: `${r} post`,
  }),
};

/** Os textos do idioma para o serviço de nome `rotulo` ("X", "Reddit", "Instagram"). */
export function textosDoEmbed(lang: Lang, rotulo: string): TextosDoEmbed {
  return POR_IDIOMA[lang](rotulo);
}
