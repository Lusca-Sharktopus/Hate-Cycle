// "Feed de Notícias" → "Blog" (T17n, pedido do autor de 27/10/2026: "Mude o 'Feed de Notícias' para 'Blog', e comece a tratar as notícias
// mais como posts de um blog"; confirmado: "não precisa mudar nada de estrutural, apenas o que será visível ao usuário").
//
// Os textos da interface moram no config.json → ui, que é do AUTOR (o Claude não o edita). Por isso a troca é feita AQUI, só no Astro:
// estas chaves passam por cima das de mesmo nome do config.json, dentro de t() (src/lib/config.ts). O config.json continua com os textos
// antigos ("News Feed", "Notícias"…), que o gerador Python (congelado até a virada) segue usando.
//
// O que muda é só o que o visitante LÊ: o menu, a aba e o título da lista, a busca, o "nenhum resultado", o botão do meio no fim de cada post
// e a etiqueta dos cartões de "Últimas atualizações" na home. NÃO mudam: os endereços (/pt/news/…, /en/news/…), as pastas de content/news/,
// os IDs das conversas de comentários (news/<slug>), os nomes de arquivos e o código.
//
// Para trocar um texto: mude a linha aqui (é o único lugar). Para devolver uma chave ao texto do config.json, apague a linha dela nos dois
// idiomas e tire o nome da chave de CHAVES_DO_BLOG. Prova: tests/blog.test.ts (e a exceção de paridade blogComoNoPython() em
// tests/ajudantes/html.ts, que só aceita essas palavras, nesses lugares).
import type { Lang, UiKey } from "./config";

/** As chaves de config.json → ui que o Astro troca (todas as que chamam a seção de "Notícias"/"News"). */
export const CHAVES_DO_BLOG = ["news", "tag_news", "all_news", "news_search_ph", "news_none"] as const satisfies readonly UiKey[];

export type ChaveDoBlog = (typeof CHAVES_DO_BLOG)[number];

/** Os textos novos, por idioma. Cada idioma tem de ter todas as chaves (o TypeScript avisa). */
export const TEXTOS_DO_BLOG: Readonly<Record<Lang, Readonly<Record<ChaveDoBlog, string>>>> = {
  en: {
    news: "Blog", // menu, aba e título da lista (era "News Feed")
    tag_news: "Blog post", // etiqueta do cartão em "Latest updates" (era "News")
    all_news: "All posts", // botão do meio no fim de cada post (era "All news")
    news_search_ph: "Search the blog…", // caixa de busca da lista (era "Search news…")
    news_none: "No posts found.", // busca sem resultado (era "No news found.")
  },
  pt: {
    news: "Blog", // era "Notícias"
    tag_news: "Post do blog", // era "Notícia"
    all_news: "Todos os posts", // era "Todas as notícias"
    news_search_ph: "Buscar no blog…", // era "Buscar notícias…"
    news_none: "Nenhum post encontrado.", // era "Nenhuma notícia encontrada."
  },
};

/** A chave é uma das que o blog troca? */
export function ehChaveDoBlog(chave: string): chave is ChaveDoBlog {
  return (CHAVES_DO_BLOG as readonly string[]).includes(chave);
}
