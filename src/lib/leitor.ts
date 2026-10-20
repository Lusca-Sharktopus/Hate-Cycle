// Lê content/ NO LUGAR (sem copiar nada) e entrega cada arquivo como uma "entrada" de coleção do Astro.
//
// Substitui, no Astro, load_items() e load_works() do build.py (linhas ~189–233): mesmas pastas, mesmos
// arquivos, mesma ordem, e o front matter lido pelo MESMO parser mínimo (src/lib/frontmatter.ts).
// Aqui ninguém esconde rascunho nem nada: o carregador guarda TUDO, e quem decide o que aparece no site
// são as regras de src/lib/visibilidade.ts (usadas por src/lib/conteudo.ts).
//
// Este arquivo também tem o "carregador" (loader) que src/content.config.ts usa em cada coleção.
// Explicação: docs/aprendendo-astro/04-colecoes.md.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Loader } from "astro/loaders";
import { langs, showExtras } from "./config";
import { htmlDosCorpos, lerEmbedDoDisco } from "./corpos";
import { decodificar, parse, type FrontMatter } from "./frontmatter";
import { compararComoPython, compararNatural } from "./ordem";
import type { Colecao, Indice } from "./schemas";

/** As seções de content/ que são "uma pasta por item, com en.md e/ou pt.md dentro" (as do load_items). */
export const SECOES_DE_ITENS = ["news", "pages", "emissaries", "characters", "universe"] as const;
export type SecaoDeItens = (typeof SECOES_DE_ITENS)[number];

/** Uma entrada antes da validação: o que o carregador entrega ao schema. */
export interface EntradaBruta {
  /** ID na coleção: "2023-08-18-orcs/en", "firestriker/01/pt", "firestriker" (obra). */
  id: string;
  /** Campos do front matter (ou do work.json) + `_origem` (de onde veio). Ainda não validados. */
  data: Record<string, unknown>;
  /** Corpo em Markdown, cru. Obras (work.json) não têm. O HTML (T09) vai em `rendered`: ver o carregador, abaixo. */
  body?: string;
  /** Caminho completo do arquivo. */
  arquivo: string;
  /** Texto completo do arquivo (para o carimbo de mudança do Astro). */
  texto: string;
}

// ───────────── ordem das pastas, como o Python ─────────────
// compararComoPython() e compararNatural() moram em src/lib/ordem.ts desde a T09; continuam exportadas daqui.
export { compararComoPython, compararNatural };

/** Subpastas de `dir` (seguindo atalhos, como o is_dir() do Python), em ordem. */
function subpastas(dir: string, comparar = compararComoPython): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((nome) => {
      try {
        return statSync(join(dir, nome)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort(comparar);
}

function lerMd(arquivo: string): { fm: FrontMatter; body: string; texto: string } {
  const texto = decodificar(readFileSync(arquivo));
  return { ...parse(texto), texto };
}

/** Junta front matter e `_origem`. Um campo `_origem` escrito no arquivo seria apagado: melhor avisar. */
function comOrigem(fm: Record<string, unknown>, origem: Record<string, unknown>, arquivo: string): Record<string, unknown> {
  if (Object.hasOwn(fm, "_origem")) throw new Error(`${arquivo}: o campo "_origem" é reservado (o site o preenche sozinho). Use outro nome.`);
  return { ...fm, _origem: origem };
}

// ───────────── as três formas de conteúdo ─────────────

/** content/<seção>/<pasta>/<idioma>.md → uma entrada por arquivo (load_items, sem filtrar rascunhos). */
export function lerItens(raiz: string, secao: SecaoDeItens): EntradaBruta[] {
  const dir = join(raiz, secao);
  return subpastas(dir).flatMap((slug) =>
    langs.flatMap((lang) => {
      const arquivo = join(dir, slug, `${lang}.md`);
      if (!existsSync(arquivo)) return [];
      const { fm, body, texto } = lerMd(arquivo);
      return [{ id: `${slug}/${lang}`, data: comOrigem(fm, { slug, lang }, arquivo), body, arquivo, texto }];
    }),
  );
}

/** Pastas de content/works/ que têm work.json (as obras do load_works), em ordem. */
function pastasDeObras(raiz: string): string[] {
  const dir = join(raiz, "works");
  return subpastas(dir).filter((slug) => existsSync(join(dir, slug, "work.json")));
}

/** content/works/<obra>/work.json → uma entrada por obra. */
export function lerObras(raiz: string): EntradaBruta[] {
  return pastasDeObras(raiz).map((slug) => {
    const arquivo = join(raiz, "works", slug, "work.json");
    // read_text("utf-8") + json.loads: aqui o BOM NÃO é tirado (o Python também recusa um work.json com BOM).
    const texto = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(arquivo));
    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch (e) {
      throw new Error(`${arquivo} não é um JSON válido (vírgula sobrando ou faltando? aspas?): ${(e as Error).message}`);
    }
    if (typeof json !== "object" || json === null || Array.isArray(json)) {
      throw new Error(`${arquivo} tem de ser um objeto JSON: { "kind": …, "title": … }.`);
    }
    return { id: slug, data: comOrigem(json as Record<string, unknown>, { slug }, arquivo), arquivo, texto };
  });
}

/**
 * content/works/<obra>/<NN>/<idioma>.md → uma entrada por arquivo.
 * `posicao` é a ordem da pasta entre TODAS as subpastas da obra (1, 2, 3…), como o `i` do load_works():
 * é o número do capítulo quando o front matter não tem `chapter:`.
 */
export function lerCapitulos(raiz: string): EntradaBruta[] {
  return pastasDeObras(raiz).flatMap((obra) => {
    const dirObra = join(raiz, "works", obra);
    return subpastas(dirObra, compararNatural).flatMap((capitulo, i) =>
      langs.flatMap((lang) => {
        const arquivo = join(dirObra, capitulo, `${lang}.md`);
        if (!existsSync(arquivo)) return [];
        const { fm, body, texto } = lerMd(arquivo);
        const origem = { obra, capitulo, lang, posicao: i + 1 };
        return [{ id: `${obra}/${capitulo}/${lang}`, data: comOrigem(fm, origem, arquivo), body, arquivo, texto }];
      }),
    );
  });
}

/** Lê uma coleção inteira. */
export function lerColecao(raiz: string, colecao: Colecao): EntradaBruta[] {
  if (colecao === "works") return lerObras(raiz);
  if (colecao === "chapters") return lerCapitulos(raiz);
  return lerItens(raiz, colecao);
}

/**
 * Lê as sete coleções de uma vez (T09). Transformar o corpo de UMA entrada em HTML depende das outras:
 * os [[links]] usam títulos e rascunhos de todas as seções, o divisor vem do work.json, e a página Sobre
 * leva o texto da página Projeto.
 */
export function lerTudo(raiz: string): Record<Colecao, EntradaBruta[]> {
  return {
    news: lerItens(raiz, "news"),
    pages: lerItens(raiz, "pages"),
    emissaries: lerItens(raiz, "emissaries"),
    characters: lerItens(raiz, "characters"),
    universe: lerItens(raiz, "universe"),
    works: lerObras(raiz),
    chapters: lerCapitulos(raiz),
  };
}

// ───────────── referências ─────────────

/**
 * O que existe em content/, lido do disco NA HORA de cada consulta (na prévia, um item novo já vale).
 * "works/x" existe se há content/works/x/work.json; "news/x" (e as outras seções) se há en.md ou pt.md na pasta.
 */
export function indiceDoDisco(raiz: string): Indice {
  return {
    existe(ref) {
      const [secao, slug, ...resto] = ref.split("/");
      if (!secao || !slug || resto.length > 0) return false;
      if (secao === "works") return existsSync(join(raiz, "works", slug, "work.json"));
      return langs.some((lang) => existsSync(join(raiz, secao, slug, `${lang}.md`)));
    },
  };
}

// ───────────── imagens citadas que não existem em static/ (aviso, não erro) ─────────────

const CAMPOS_DE_IMAGEM = ["thumb", "image", "backdrop_top", "backdrop_bottom", "overlay", "cover", "logo", "divider"];

/** Arquivos de static/ citados pela entrada que não existem: [campo, caminho]. */
export function imagensQueFaltam(data: Record<string, unknown>, pastaStatic: string): [string, string][] {
  const citados: [string, string][] = [];
  for (const campo of CAMPOS_DE_IMAGEM) {
    const v = data[campo];
    if (typeof v === "string") citados.push([campo, v]);
    else if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [lang, x] of Object.entries(v)) if (typeof x === "string") citados.push([`${campo}.${lang}`, x]);
    }
  }
  const arteDaOrdem = data["order_images"]; // work.json (T17c): lista de 1 ou 2 caminhos
  if (Array.isArray(arteDaOrdem)) {
    arteDaOrdem.forEach((a, n) => typeof a === "string" && citados.push([`order_images.${n}`, a]));
  }
  const stickers = data["stickers"];
  if (Array.isArray(stickers)) {
    stickers.forEach((s, n) => typeof s === "string" && citados.push([`stickers.${n}`, (s.split("|")[0] ?? "").trim()]));
  }
  return citados.filter(([, p]) => p !== "" && !/^(https?:|data:|mailto:|#)/.test(p) && !existsSync(join(pastaStatic, p.replace(/^\/+/, ""))));
}

// ───────────── o carregador do Astro ─────────────

/** Texto do erro sem os ** (negrito) que o Astro põe nas mensagens: no registro eles apareceriam crus. */
function semNegrito(erro: unknown): string {
  return (erro instanceof Error ? erro.message : String(erro)).replace(/\*\*/g, "");
}

/**
 * Rascunhos no índice dos [[links]]: com eles na prévia (`pnpm dev`), sem eles no `pnpm build` — o DRAFTS do
 * build.py (o mesmo critério de COM_RASCUNHOS em src/lib/conteudo.ts, que não pode ser importado aqui).
 */
const COM_RASCUNHOS: boolean = import.meta.env.DEV;

/**
 * Carregador (loader) de uma coleção, no formato da Content Layer API do Astro:
 * um objeto { name, load } — load() lê os arquivos, valida cada um com o schema (parseData) e guarda no store.
 * Desde a T09 também transforma o corpo de cada entrada em HTML (src/lib/corpos.ts → src/lib/markdown.ts) e o
 * guarda em `rendered.html`: é o que `render(entrada)` / <Content /> devolvem nas páginas.
 * Na prévia (pnpm dev), recarrega a coleção quando algo muda em content/.
 */
export function carregador(colecao: Colecao): Loader {
  return {
    name: `hate-cycle-${colecao}`,
    load: async ({ store, parseData, generateDigest, logger, watcher, config }) => {
      const raizDoSite = fileURLToPath(config.root);
      const raiz = join(raizDoSite, "content");
      const pastaStatic = join(raizDoSite, "static");
      const relativo = (arquivo: string) => relative(raizDoSite, arquivo).split(sep).join("/");

      async function sincronizar() {
        // os work.json não têm corpo; as outras coleções precisam do content/ inteiro para virar HTML
        const tudo = colecao === "works" ? undefined : lerTudo(raiz);
        const entradas = tudo ? tudo[colecao] : lerColecao(raiz, colecao);
        const validas = [];
        const erros: { erro: unknown; arquivo: string }[] = [];
        for (const e of entradas) {
          try {
            validas.push({ ...e, data: await parseData({ id: e.id, data: e.data, filePath: e.arquivo }) });
          } catch (erro) {
            erros.push({ erro, arquivo: e.arquivo });
          }
        }
        // Mostra TODOS os arquivos com erro desta coleção (o Astro pararia no primeiro);
        // o primeiro sai como o erro do build, com o arquivo em "Location".
        if (erros.length > 0) {
          for (const { erro, arquivo } of erros.slice(1)) logger.error(`${relativo(arquivo)}:\n${semNegrito(erro)}`);
          throw erros[0]?.erro;
        }
        // O corpo de cada entrada → HTML, no contexto em que o build.py o renderiza (idioma, divisor, [[links]]…).
        const html =
          tudo && colecao !== "works"
            ? htmlDosCorpos(tudo, colecao, { comRascunhos: COM_RASCUNHOS, mostrarExtras: showExtras, lerEmbed: lerEmbedDoDisco(raiz) })
            : undefined;
        store.clear();
        for (const e of validas) {
          const h = html?.get(e.id);
          store.set({
            id: e.id,
            data: e.data,
            filePath: relativo(e.arquivo),
            // o HTML depende de outros arquivos (títulos dos [[links]], embeds…): entra no carimbo também
            digest: generateDigest(h === undefined ? e.texto : `${e.texto}\u0000${h}`),
            ...(e.body !== undefined ? { body: e.body } : {}),
            ...(h !== undefined ? { rendered: { html: h } } : {}),
          });
          for (const [campo, caminho] of imagensQueFaltam(e.data, pastaStatic)) {
            logger.warn(`${relativo(e.arquivo)}: ${campo} "${caminho}" não existe em static/.`);
          }
        }
      }

      await sincronizar();

      if (watcher) {
        // Os work.json só dependem de content/works/. As outras coleções dependem do content/ INTEIRO (desde a T09):
        // o título de uma notícia muda o [[link]] que aponta para ela; um embed novo, o {{embed:…}}; e assim por diante.
        const pasta = colecao === "works" ? join(raiz, "works") : raiz;
        watcher.add(pasta);
        // Criar uma pasta com um arquivo dentro gera vários avisos seguidos: espera 150 ms e relê uma vez só.
        let espera: ReturnType<typeof setTimeout> | undefined;
        watcher.on("all", (_evento, caminho) => {
          if (!caminho.startsWith(pasta + sep)) return;
          clearTimeout(espera);
          espera = setTimeout(() => sincronizar().catch((erro: unknown) => logger.error(semNegrito(erro))), 150);
        });
      }
    },
  };
}
