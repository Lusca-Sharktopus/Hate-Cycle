// Configuração do Astro para o site Hᴀᴛᴇ Cʏᴄʟᴇ (T05: só o esqueleto).
// Explicação linha a linha: docs/aprendendo-astro/01-anatomia.md
// Referência oficial: https://docs.astro.build/en/reference/configuration-reference/
import { defineConfig } from "astro/config";

export default defineConfig({
  // Endereço final do site. O site fica na RAIZ do domínio (o repositório tem CNAME = hatecycle.com),
  // por isso NÃO existe `base`: os endereços começam direto em /en/ e /pt/.
  // (No build.py, o equivalente de `base` é BASE = config.json → base_url; ver o bug B1 no BACKLOG.)
  site: "https://hatecycle.com",

  // Pastas. `static/` é a mesma pasta que o build.py copia para public/ (provisório até a virada, T20).
  // O site Astro sai em dist/, para não se misturar com o public/ do gerador Python.
  publicDir: "./static",
  outDir: "./dist",

  // Endereços iguais aos de hoje: /pt/news/x/ (com barra no fim) → arquivo pt/news/x/index.html.
  trailingSlash: "always",
  build: {
    format: "directory",
  },

  // Espaços entre elementos: o Astro 7 passou a usar 'jsx' por padrão, que APAGA o espaço entre
  // "<span class="hc">Hate Cycle</span> <a>…</a>" quando há quebra de linha no meio.
  // `false` deixa o HTML exatamente com os espaços escritos, como o build.py faz hoje.
  compressHTML: false,

  // Dois idiomas, os dois com prefixo (/en/… e /pt/…), como no site atual.
  i18n: {
    locales: ["en", "pt"], // mesma ordem e mesmas chaves de config.json → languages
    defaultLocale: "en", // a raiz "/" de hoje cai em /en/ quando não reconhece o idioma do navegador
    routing: {
      prefixDefaultLocale: true, // /en/ também leva prefixo (sem isso, o inglês ficaria em /)
      redirectToDefaultLocale: false, // a página raiz "/" é feita à mão na T14 (já é o padrão; fica explícito)
    },
  },
});
