// O RODAPÉ NOVO (pedido do autor de 02/11/2026): "© 2023 - 2026 por Lusca Sharktopus • Política de Privacidade • Email de contato:
// lucas.blito@gmail.com", com "Política de Privacidade" e o e-mail sublinhados (links) e a política abrindo numa janela que escurece o resto
// da tela. O link do feed RSS saiu da linha (o <link rel="alternate"> do <head> continua: leitores de RSS acham o feed sozinhos).
//
// Os textos moram aqui, e não no config.json → ui (que é do AUTOR): só o Astro tem o rodapé novo; o build.py, congelado, segue com o
// rodapé antigo (exceção estreita de paridade rodapeComoNoPython() em tests/ajudantes/html.ts). A política em si é uma página avulsa
// comum: content/pages/privacy/{en,pt}.md (endereço /<idioma>/privacy/, que é também o link que vai para o Google).
import type { Lang } from "./config";

/** A pasta da página da política em content/pages/ (o endereço é /<idioma>/privacy/). */
export const PASTA_DA_POLITICA = "privacy";

/** O e-mail de contato do rodapé (o mesmo da página Sobre). */
export const EMAIL_DE_CONTATO = "lucas.blito@gmail.com";

export interface TextosDoRodape {
  /** "por" / "by", entre o ano e o nome do autor. */
  por: string;
  politica: string;
  email: string;
  /** Rótulo (leitor de tela e dica do mouse) do botão que fecha a janela da política. */
  fechar: string;
}

export const TEXTOS_DO_RODAPE: Readonly<Record<Lang, TextosDoRodape>> = {
  pt: { por: "por", politica: "Política de Privacidade", email: "Email de contato", fechar: "Fechar" },
  en: { por: "by", politica: "Privacy Policy", email: "Contact email", fechar: "Close" },
};
