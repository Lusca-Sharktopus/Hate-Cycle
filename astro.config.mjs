// Configuração do Astro para o site Hᴀᴛᴇ Cʏᴄʟᴇ (T05: só o esqueleto).
// Explicação linha a linha: docs/aprendendo-astro/01-anatomia.md
// Referência oficial: https://docs.astro.build/en/reference/configuration-reference/
import { defineConfig } from "astro/config";

// Prévia (pnpm dev / pnpm preview): o servidor de prévia do Astro não acha arquivos de static/ cujo endereço
// tenha "&" codificado como %26 (ex.: covers/PT/Capa%20Luz%20%26%20Sangue.png) e responde 404. O site gerado
// está certo (igual ao do build.py) e funciona no GitHub Pages; só a prévia falhava. Este ajuste troca %26 por &
// no caminho pedido, antes de a prévia procurar o arquivo. Não muda nada no HTML nem no site publicado.
function eComercialNaPrevia() {
  /** @param {import("node:http").IncomingMessage} req @param {unknown} _res @param {() => void} next */
  const corrigir = (req, _res, next) => {
    if (req.url && /%26/i.test(req.url)) {
      const i = req.url.indexOf("?");
      const caminho = i === -1 ? req.url : req.url.slice(0, i);
      const resto = i === -1 ? "" : req.url.slice(i);
      req.url = caminho.replace(/%26/gi, "&") + resto;
    }
    next();
  };
  return {
    name: "hc-e-comercial-na-previa",
    /** @param {{ middlewares: { use: Function } }} server */
    configureServer(server) { server.middlewares.use(corrigir); },
    /** @param {{ middlewares: { use: Function } }} server */
    configurePreviewServer(server) { server.middlewares.use(corrigir); },
  };
}

export default defineConfig({
  // Endereço final do site. O site fica na RAIZ do domínio (o repositório tem CNAME = hatecycle.com),
  // por isso NÃO existe `base`: os endereços começam direto em /en/ e /pt/.
  // (No build.py, o equivalente de `base` é BASE = config.json → base_url; ver o bug B1 no BACKLOG.)
  site: "https://hatecycle.com",

  vite: {
    plugins: [eComercialNaPrevia()],
    build: {
      // O Vite embute arquivos menores que 4 KB dentro do CSS (em base64). Os recortes de fonte das runas têm de 0,4 a 1,3 KB: embutidos,
      // virariam ~20 KB de CSS que TODA página baixa antes de aparecer (o CSS bloqueia a pintura), em vez de 1–2 arquivos de 1 KB só
      // nas páginas cujas runas os usam. Então fonte nunca é embutida; o resto segue a regra normal do Vite (função devolve undefined).
      /** @param {string} arquivo */
      assetsInlineLimit: (arquivo) => (/\.woff2?$/i.test(arquivo) ? false : undefined),
    },
  },

  // Pastas. `static/` é a mesma pasta que o build.py copia para public/ (provisório até a virada, T20).
  // O site Astro sai em dist/, para não se misturar com o public/ do gerador Python.
  publicDir: "./static",
  // HC_OUT_DIR: só para os testes (tests/paginas.test.ts constrói o site numa pasta temporária, sem mexer no dist/ de quem trabalha).
  outDir: process.env["HC_OUT_DIR"] ?? "./dist",

  // Endereços iguais aos de hoje: /pt/news/x/ (com barra no fim) → arquivo pt/news/x/index.html.
  trailingSlash: "always",
  build: {
    format: "directory",
  },

  // Espaços entre elementos: o Astro 7 passou a usar 'jsx' por padrão, que APAGA o espaço entre
  // "<span class="hc">Hate Cycle</span> <a>…</a>" quando há quebra de linha no meio.
  // `false` deixa o HTML exatamente com os espaços escritos, como o build.py faz hoje.
  compressHTML: false,

  // Idiomas: NÃO há bloco `i18n` aqui (T14). Os dois idiomas têm prefixo (/en/… e /pt/…) por causa da pasta `src/pages/[lang]/`,
  // cujos valores vêm de config.json → languages (src/lib/config.ts → langs). O bloco `i18n` do Astro existia desde a T05 mas nada
  // do site usa os atalhos dele (astro:i18n, Astro.currentLocale), e a regra automática dele ("endereço sem /en/ ou /pt/ = HTTP 404")
  // fazia a prévia (`pnpm dev`) responder 404 em endereços sem idioma que existem, como /dev/markdown/ (embora mostrasse a página).
  // O site gerado (dist/) é idêntico com ou sem o bloco; a raiz "/" é uma página à mão (src/pages/index.astro).
});
