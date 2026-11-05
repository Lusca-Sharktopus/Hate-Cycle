// O rodapé novo (pedido do autor de 02/11/2026): "© 2023 - ano por Lusca Sharktopus • Política de Privacidade • Email de contato: …", com a
// política numa janela (<dialog class="politica">). Prova a exceção de paridade rodapeComoNoPython() (só aceita a forma exata) e confere o
// rodapé de todas as páginas do site construído (dist/).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { rodapeComoNoPython } from "./ajudantes/html";
import { EMAIL_DE_CONTATO, TEXTOS_DO_RODAPE } from "../src/lib/textosDoRodape";

const cid = ' data-astro-cid-abc123';
const linha = (lang: "pt" | "en", comPolitica = true, ano = "2026") => {
  const t = TEXTOS_DO_RODAPE[lang];
  const sep = `<span class="sep" aria-hidden="true"${cid}>•</span>`;
  const pol = comPolitica ? ` ${sep} <a href="/${lang}/privacy/" data-politica${cid}>${t.politica}</a>` : "";
  return `<p class="rodape-linha"${cid}>&copy; 2023 - ${ano} ${t.por} Lusca Sharktopus${pol} ${sep} <span class="contato"${cid}>${t.email}: <a href="mailto:${EMAIL_DE_CONTATO}"${cid}>${EMAIL_DE_CONTATO}</a></span></p>`;
};
const janela = `\n  <dialog class="politica" aria-labelledby="politica-titulo"${cid}><h2>Política</h2><p>texto <a href="#">link</a></p></dialog>`;

describe("rodapeComoNoPython: só a forma exata vira a linha do Python", () => {
  test("português e inglês, com a janela", () => {
    expect(rodapeComoNoPython(`<footer>${linha("pt")}${janela}</footer>`, "pt", "Feed RSS")).toEqual({
      html: '<footer><p>&copy; 2023 - 2026 by Lusca Sharktopus <a href="/pt/feed.xml">Feed RSS</a></p></footer>',
      linhas: 1,
      janelas: 1,
    });
    expect(rodapeComoNoPython(`<footer>${linha("en", true, "2027")}</footer>`, "en", "RSS feed")).toEqual({
      html: '<footer><p>&copy; 2023 - 2027 by Lusca Sharktopus <a href="/en/feed.xml">RSS feed</a></p></footer>',
      linhas: 1,
      janelas: 0,
    });
    // sem a página da política (rascunho), a linha não tem o link
    expect(rodapeComoNoPython(linha("pt", false), "pt", "Feed RSS").linhas).toBe(1);
  });
  test("forma diferente não é trocada", () => {
    expect(rodapeComoNoPython(linha("en"), "pt", "Feed RSS").linhas).toBe(0); // idioma errado
    expect(rodapeComoNoPython(linha("pt").replace(EMAIL_DE_CONTATO, "outro@exemplo.com"), "pt", "x").linhas).toBe(0); // outro e-mail
    expect(rodapeComoNoPython(linha("pt").replace("/pt/privacy/", "/pt/outra/"), "pt", "x").linhas).toBe(0); // outro link
    expect(rodapeComoNoPython(linha("pt").replace("Lusca Sharktopus", "Fulano"), "pt", "x").linhas).toBe(0); // outro autor
    expect(rodapeComoNoPython('<p>&copy; 2023 - 2026 by Lusca Sharktopus <a href="/pt/feed.xml">Feed RSS</a></p>', "pt", "x").linhas).toBe(0);
  });
});

const dist = join(process.cwd(), process.env.HC_DIST ?? "dist");
const paginas = (pasta: string): string[] =>
  readdirSync(pasta).flatMap((n) => {
    const c = join(pasta, n);
    return statSync(c).isDirectory() ? paginas(c) : n.endsWith(".html") ? [c] : [];
  });

describe.runIf(existsSync(join(dist, "pt", "index.html")))("rodapé do site construído", () => {
  test("toda página com <footer> tem a linha nova, o link /<idioma>/privacy/ e uma janela com a política do idioma", () => {
    let vistas = 0;
    for (const arq of paginas(dist)) {
      const html = readFileSync(arq, "utf8");
      if (!html.includes('<footer class="site-footer"')) continue;
      vistas += 1;
      const lang = /<html lang="pt/.test(html) ? "pt" : "en";
      const r = rodapeComoNoPython(html, lang, "x");
      expect([r.linhas, r.janelas], arq).toEqual([1, 1]);
      expect(html, arq).toContain(`<a href="/${lang}/privacy/" data-politica`);
      expect(html, arq).toMatch(new RegExp(`<h2 id="politica-titulo"[^>]*>${lang === "pt" ? "Política de Privacidade" : "Privacy Policy"}</h2>`));
      expect(html, arq).toContain(`mailto:${EMAIL_DE_CONTATO}`);
      expect(html, arq).not.toContain("Hᴀᴛᴇ Cʏᴄʟᴇ é um site pessoal"); // o versalete também vale dentro da janela
    }
    expect(vistas).toBeGreaterThan(150);
  });
  test("a página da política existe nos dois idiomas", () => {
    for (const lang of ["pt", "en"]) expect(existsSync(join(dist, lang, "privacy", "index.html")), lang).toBe(true);
  });
});
