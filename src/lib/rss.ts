// O XML do feed RSS, escrito à mão como o build.py escreve (linhas ~957–966): uma linha só, sem enfeites, para sair IDÊNTICO.
// Os itens (quais, em que ordem, com que data) vêm de itensDoRss() em src/lib/atualizacoes.ts (T10); aqui só vira texto.
//
// Por que não @astrojs/rss? Ele escreveria outro XML (`<?xml …?>` + quebras de linha, `<atom:link>`, `isPermaLink`, `<content:encoded>`
// opcional, outra ordem e outro escape), e o aceite da T14 é "o mesmo feed de hoje, item por item". O RSS do site é simples (título,
// link, guid, data, descrição) e uma função pura de 15 linhas é mais fácil de provar do que uma biblioteca de 1 400 linhas.
import type { Lang } from "./config";
import { esc } from "./markdown";
import type { ItemDoRss } from "./atualizacoes";

export interface DadosDoFeed {
  nomeDoSite: string;
  /** config.json → site_url (com ou sem "/" no fim: o Python tira). */
  enderecoDoSite: string;
  lang: Lang;
  /** A frase de apresentação do site (ui.hero_sub) no idioma. */
  descricao: string;
  itens: readonly ItemDoRss[];
}

export function feedRss(d: DadosDoFeed): string {
  const site = d.enderecoDoSite.replace(/\/+$/, "");
  const itens = d.itens
    .map((i) => `<item><title>${esc(i.titulo)}</title><link>${site}${i.url}</link><guid>${site}${i.url}</guid><pubDate>${i.data}</pubDate><description>${esc(i.descricao)}</description></item>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(d.nomeDoSite)}</title><link>${site}/${d.lang}/</link><description>${esc(d.descricao)}</description><language>${d.lang}</language>${itens}</channel></rss>`;
}
