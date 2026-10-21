// Os CANAIS DO YOUTUBE por idioma (T17h, pedido do autor de 21/10): o Hᴀᴛᴇ Cʏᴄʟᴇ agora tem um canal em inglês e um em português. As páginas em
// inglês apontam para o canal anglófono; as em português, para o brasileiro. Hoje isso vale para o ícone de YouTube do rodapé (que está em
// todas as páginas); qualquer lugar novo que precise do canal do Hᴀᴛᴇ Cʏᴄʟᴇ deve usar `canalDoYoutube(lang)`.
//
// Por que aqui e não no config.json: o config.json é do autor e o Claude não o edita; ele continua com o endereço antigo do canal
// (`https://www.youtube.com/@HateCycle`), que o gerador Python (até a virada) ainda usa. O Astro, na hora de desenhar o rodapé, troca o
// endereço do ícone de YouTube pelo do idioma da página (`redesDoRodape`). Para trocar um canal depois: mude a linha do idioma abaixo.
//
// O canal PESSOAL do autor (https://www.youtube.com/@LuscaSharktopus, usado na página Apoio) não passa por aqui: é um texto da página
// (content/pages/support/pt.md), igual nos dois geradores.
import { socialLinks, type Lang, type Social } from "./config";

/** O canal do Hᴀᴛᴇ Cʏᴄʟᴇ no YouTube de cada idioma. Cada idioma do site tem de ter o seu (o TypeScript avisa). */
export const CANAIS_DO_YOUTUBE: Readonly<Record<Lang, string>> = {
  en: "https://www.youtube.com/@HateCycleEn",
  pt: "https://www.youtube.com/@HateCycleBR",
};

/** O canal do Hᴀᴛᴇ Cʏᴄʟᴇ no YouTube para as páginas de um idioma. */
export function canalDoYoutube(lang: Lang): string {
  return CANAIS_DO_YOUTUBE[lang];
}

/** O endereço é de um canal ou página do YouTube? (a rede social "YouTube" do config.json: pelo domínio, não pelo nome que o autor deu) */
export function ehYoutube(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be";
  } catch {
    return false;
  }
}

/** As redes do rodapé de um idioma: as do config.json, só que o YouTube leva ao canal do idioma. A ordem, os nomes e os ícones não mudam. */
export function redesDoRodape(lang: Lang, redes: readonly Social[] = socialLinks): Social[] {
  return redes.map((r) => (ehYoutube(r.url) ? { ...r, url: canalDoYoutube(lang) } : r));
}
