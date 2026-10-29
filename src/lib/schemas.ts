// Schemas das coleções: quais campos cada tipo de conteúdo aceita, de que tipo, e as mensagens de erro.
//
// Fonte dos campos: a skill hc-conteudo (.claude/skills/hc-conteudo/SKILL.md), as regras de conteúdo
// (.claude/rules/conteudo.md) e — a palavra final — o que o build.py realmente lê (fm.get(...) / meta.get(...)).
// Explicação com exemplos: docs/aprendendo-astro/04-colecoes.md.
//
// Regras gerais (decisões da T08):
//  - CAMPO DESCONHECIDO = ERRO. O build.py ignora em silêncio um campo que não conhece, então um erro de
//    digitação ("dat:" no lugar de "date:", "unlsited: true") passava despercebido e o site saía errado.
//    Aqui ele pára o build e a mensagem lista os campos aceitos. Campo novo de propósito = acrescentar aqui.
//  - Os valores ficam como o Python os lê (front matter pelo parser mínimo: datas e números são TEXTO).
//    Única normalização: lista vazia escrita como "tags:" (texto vazio) vira [] — o build.py trata os dois
//    do mesmo jeito (`fm.get("tags", []) or []`).
//  - Referências (related, appears_in) são conferidas: apontar para algo que não existe = erro.
//  - Mensagens em português, sempre com o valor que veio. O Astro acrescenta a coleção, o item e o arquivo.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "astro/zod";
import { ESCALA_MAXIMA, ESCALA_MINIMA } from "./artesDaOrdem";
import { dominiosDoSite, langs, type Lang } from "./config";

// ───────────── valores permitidos ─────────────

/** Tipos de obra (work.json → kind). "film" é usado por the-pendulum; o build.py o trata como "prose". */
export const TIPOS_DE_OBRA = ["prose", "comic", "video", "film"] as const;

/** Tipos de mídia (work.json → media): as chaves de MEDIA_LABELS no build.py (os rótulos vêm na T10). */
export const MIDIAS = ["short-story", "webcomic", "live-ttrpg", "short-film", "animated-show", "videogame", "misc"] as const;

/** Seções que um `related:` pode citar (as chaves do INDEX do build.py: "seção/pasta"). */
export const SECOES_REFERENCIAVEIS = ["news", "universe", "characters", "pages", "emissaries", "works"] as const;

// ───────────── referências ─────────────

/** O que existe em content/, para conferir referências. Ver indiceDoDisco() em src/lib/leitor.ts. */
export interface Indice {
  /** "characters/harry", "works/firestriker"…: true se o item existe em algum idioma (rascunho também conta). */
  existe(ref: string): boolean;
}

/** Explica o que há de errado com uma referência "seção/pasta"; undefined = está certa. */
export function problemaDaReferencia(ref: string, indice: Indice): string | undefined {
  const m = /^([^/]+)\/([^/]+)$/.exec(ref);
  const secao = m?.[1] ?? "";
  if (!m || !(SECOES_REFERENCIAVEIS as readonly string[]).includes(secao)) {
    return `"${ref}" não está no formato seção/pasta (ex.: characters/harry). Seções: ${SECOES_REFERENCIAVEIS.join(", ")}.`;
  }
  if (!indice.existe(ref)) {
    const onde = secao === "works" ? `content/${ref}/work.json` : `content/${ref}/ com en.md ou pt.md`;
    return `"${ref}" não existe (não há ${onde}). Erro de digitação ou item apagado/renomeado?`;
  }
  return undefined;
}

// ───────────── peças ─────────────

/** O valor que veio, escrito para a mensagem de erro. */
function descrever(v: unknown): string {
  if (v === undefined) return "nada";
  if (typeof v === "string") return v === "" ? "um texto vazio" : `"${v}"`;
  if (Array.isArray(v)) return `a lista ${JSON.stringify(v)}`;
  return JSON.stringify(v) ?? String(v);
}

const texto = () => z.string({ error: (i) => `tem de ser um texto, mas veio ${descrever(i.input)}.` });

const simNao = () =>
  z.boolean({ error: (i) => `tem de ser true ou false, sem aspas, mas veio ${descrever(i.input)}.` });

/** "AAAA-MM-DD" com mês e dia que existem, ou vazio (o build.py trata data vazia como "sem data"). */
export function dataValida(v: string): boolean {
  if (v === "") return true;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(a, me - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === me - 1 && dt.getUTCDate() === d;
}

const data = () =>
  texto().refine(dataValida, {
    error: (i) => `${descrever(i.input)} não é uma data válida: use AAAA-MM-DD, com mês e dia que existam (ex.: 2024-08-18).`,
  });

/** Lista de textos. Escrita como [a, b] ou com uma linha "  - item" por item; "tags:" vazio = lista vazia. */
const listaDeTextos = () =>
  z
    .union([z.literal(""), z.array(z.string())], {
      error: (i) => {
        if (Array.isArray(i.input)) {
          const n = i.input.findIndex((x) => typeof x !== "string");
          return `tem de ser uma lista de textos, mas o item ${n + 1} é ${descrever(i.input[n])}.`;
        }
        return `tem de ser uma lista (ex.: [a, b], ou uma linha "  - item" para cada item), mas veio ${descrever(i.input)}.`;
      },
    })
    .transform((v): string[] => (v === "" ? [] : v));

/** order_images do work.json: a imagem normal e, se houver, a do mouse por cima (no máximo duas). */
const listaOrdemDeImagens = () =>
  listaDeTextos().superRefine((lista, ctx) => {
    if (lista.length > 2) ctx.addIssue({ code: "custom", input: lista, message: `tem de ter no máximo 2 imagens (a normal e a do mouse por cima), mas veio a lista ${JSON.stringify(lista)}.` });
    lista.forEach((arquivo, n) => {
      if (arquivo.trim() === "") ctx.addIssue({ code: "custom", path: [n], input: arquivo, message: `a imagem ${n + 1} está vazia: escreva o caminho dentro de static/ (ex.: ordem/Minha Obra-ordem-1.png).` });
    });
  });

/**
 * order_art do work.json (T17h): a arte do bloco "estou lendo em ordem…" em CAMADAS animadas (ver src/lib/artesDaOrdem.ts e o
 * guia do autor). `size` = [largura, altura] da tela de montagem; `layers` = as camadas, de trás para a frente, cada uma com a
 * posição inicial e, em `hover`, só o que muda com o mouse por cima; `bleed` (T17l) = as camadas podem sair da moldura até a borda da
 * caixa; `escala` (T17o) = o tamanho de todas as camadas juntas (1 = como está escrito). Campo desconhecido, em qualquer nível, é erro.
 */
const numeroDaArte = (oQue: string) => z.number({ error: (i) => `${oQue} tem de ser um número, sem aspas, mas veio ${descrever(i.input)}.` });
const estritoDaArte = <S extends z.ZodRawShape>(onde: string, campos: S) =>
  z.strictObject(campos, {
    error: (i) => {
      const { code, keys } = i as { code: string; keys?: string[] };
      return code === "unrecognized_keys"
        ? `campo desconhecido (${(keys ?? []).map((k) => `"${k}"`).join(", ")}). Campos aceitos em ${onde}: ${Object.keys(campos).join(", ")}.`
        : `tem de ser um objeto { ${Object.keys(campos).join(", ")} }, mas veio ${descrever(i.input)}.`;
    },
  });
const camposQueMudam = () => ({
  x: numeroDaArte("x (centro, em % da largura da tela)").optional(),
  y: numeroDaArte("y (centro, em % da altura da tela)").optional(),
  width: numeroDaArte("width (largura, em % da largura da tela)").positive({ error: "width tem de ser maior que zero." }).optional(),
  rotate: numeroDaArte("rotate (graus; positivo gira para a direita)").optional(),
  opacity: numeroDaArte("opacity (de 0 a 1)").min(0, { error: "opacity tem de ficar entre 0 e 1." }).max(1, { error: "opacity tem de ficar entre 0 e 1." }).optional(),
});
const arteEmCamadas = () =>
  estritoDaArte("order_art", {
    size: z
      .tuple([numeroDaArte("size[0] (largura)").positive({ error: "size tem de ter números maiores que zero." }), numeroDaArte("size[1] (altura)").positive({ error: "size tem de ter números maiores que zero." })], {
        error: (i) => `size tem de ser [largura, altura] da tela de montagem, em pixels (ex.: [2087, 1752]), mas veio ${descrever(i.input)}.`,
      }),
    layers: z
      .array(
        estritoDaArte("cada camada de order_art.layers", {
          image: texto().refine((v) => v.trim() !== "", { error: "image está vazia: escreva o caminho dentro de static/ (ex.: ordem/Ellie Site Cronologia.png)." }),
          ...camposQueMudam(),
          x: numeroDaArte("x (centro, em % da largura da tela)"),
          y: numeroDaArte("y (centro, em % da altura da tela)"),
          width: numeroDaArte("width (largura, em % da largura da tela)").positive({ error: "width tem de ser maior que zero." }),
          hover: estritoDaArte("hover", camposQueMudam()).optional(),
          // (28/10, pedido do autor) só esta camada some num degradê na borda da moldura no celular (as asas do Giuseppe)
          fade: z.boolean({ error: (i) => `fade tem de ser true ou false, sem aspas (true = no celular esta camada some num degradê na borda do quadrado da arte), mas veio ${descrever(i.input)}.` }).optional(),
        }),
        { error: (i) => `layers tem de ser uma lista de camadas (de trás para a frente), mas veio ${descrever(i.input)}.` },
      )
      .min(1, { error: "layers precisa de pelo menos uma camada." })
      .max(8, { error: "layers aceita no máximo 8 camadas." }),
    bleed: z.boolean({ error: (i) => `bleed tem de ser true ou false, sem aspas (true = as camadas podem sair da moldura até a borda da caixa), mas veio ${descrever(i.input)}.` }).optional(),
    // T17o: o tamanho de TODAS as camadas juntas (1 = como está escrito; 1.2 = 20% maior). A conta está em src/lib/artesDaOrdem.ts.
    escala: numeroDaArte("escala (o tamanho de todas as camadas juntas, com ponto: 1.2 = 20% maior; 1 = como está)")
      .min(ESCALA_MINIMA, { error: (i) => `escala tem de ficar entre ${ESCALA_MINIMA} e ${ESCALA_MAXIMA} (1 = o tamanho de hoje; use ponto, como em 1.2), mas veio ${descrever(i.input)}.` })
      .max(ESCALA_MAXIMA, { error: (i) => `escala tem de ficar entre ${ESCALA_MINIMA} e ${ESCALA_MAXIMA} (1 = o tamanho de hoje; use ponto, como em 1.2), mas veio ${descrever(i.input)}.` })
      .optional(),
  });

/**
 * page_runes do work.json (T17d): liga o LEITOR PÁGINA A PÁGINA dos quadrinhos (só no Astro). Uma runa por página do capítulo, na ordem
 * (Beira de Estrada: as Oito Runas d'A Força). Cada item é um símbolo (pode levar o seletor de texto U+FE0E, como "♐︎"), sem espaços.
 * Que cada capítulo tenha exatamente esse número de páginas é conferido no build (src/lib/folheador.ts).
 */
const runasDasPaginas = () =>
  z
    .array(texto(), { error: (i) => `tem de ser uma lista de runas, uma por página (ex.: ["ᚣ", "弓", "♐︎"]), mas veio ${descrever(i.input)}.` })
    .min(1, { error: "page_runes precisa de pelo menos uma runa (uma por página do capítulo)." })
    .max(60, { error: "page_runes aceita no máximo 60 runas." })
    .superRefine((lista, ctx) => {
      lista.forEach((runa, n) => {
        if (runa.trim() === "" || /\s/.test(runa)) ctx.addIssue({ code: "custom", path: [n], input: runa, message: `a runa ${n + 1} (${descrever(runa)}) tem de ser um símbolo só, sem espaços.` });
      });
    });

/** Endereço https:// (ou vazio = "ainda não tem"). */
const enderecoHttps = (oQue: string) =>
  texto().refine((v) => v === "" || /^https:\/\/[^\s"'<>]+$/.test(v), { error: (i) => `${oQue} tem de ser um endereço completo que começa com https:// (ou "" enquanto não existe), mas veio ${descrever(i.input)}.` });

/**
 * (T17m, achado da revisão final) Os domínios do PRÓPRIO site: os do config.json (site_url, base_url) e o do static/CNAME. Uma demo de
 * jogo roda num <iframe> com `allow-scripts allow-same-origin` (src/lib/jogo.ts): hospedada no próprio site (ou num subdomínio dele),
 * ela não ficaria isolada e alcançaria a sessão dos comentários. Por isso o schema recusa esses endereços.
 */
export const DOMINIOS_DO_PROPRIO_SITE: readonly string[] = (() => {
  const d = new Set(dominiosDoSite);
  try {
    for (const linha of readFileSync(join(process.cwd(), "static", "CNAME"), "utf8").split(/\s+/)) {
      const h = linha.trim().toLowerCase().replace(/\.$/, "");
      if (h) d.add(h);
    }
  } catch {
    // sem static/CNAME (um site inventado de teste): valem os do config.json
  }
  return [...d];
})();

/** O domínio do próprio site que o endereço usa (ele ou um subdomínio dele), ou null. */
export function dominioDoProprioSite(endereco: string, dominios: readonly string[] = DOMINIOS_DO_PROPRIO_SITE): string | null {
  let host: string;
  try {
    host = new URL(endereco).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
  return dominios.find((d) => host === d || host.endsWith(`.${d}`)) ?? null;
}

/** O endereço da demo: https:// (ou vazio), e de FORA do próprio site. */
const enderecoDaDemo = () =>
  enderecoHttps("demo (o endereço da demo do jogo)").refine((v) => v === "" || dominioDoProprioSite(v) === null, {
    error: (i) =>
      `demo não pode ser um endereço do próprio site (${dominioDoProprioSite(String(i.input))}): a demo roda numa janela que pode rodar programas e guardar dados, e no próprio site ela não ficaria isolada (alcançaria a sessão dos comentários de quem está lendo). Publique a demo em outro lugar (por exemplo, no itch.io) e cole aqui o endereço de lá; veio ${descrever(i.input)}.`,
  });

/**
 * game do work.json (T17d): a página de um JOGO (só no Astro): a janela da demo e o botão "Wishlist on Steam". `demo` = o endereço da
 * demo para jogar no navegador (itch.io, por exemplo); `steam` = a página do jogo na Steam. Vazio = ainda não existe (a janela fica
 * escura, com "Demo em breve"; o botão aparece sem link, com "Link em breve"). Ver src/lib/jogo.ts.
 */
const paginaDeJogo = () =>
  estritoDaArte("game", {
    demo: enderecoDaDemo().optional(),
    steam: enderecoHttps("steam (a página do jogo na Steam)").optional(),
  });

/** Lista de referências "seção/pasta" (related). */
const referencias = (indice: Indice) =>
  listaDeTextos().superRefine((lista, ctx) => {
    lista.forEach((ref, n) => {
      const problema = problemaDaReferencia(ref, indice);
      if (problema) ctx.addIssue({ code: "custom", path: [n], message: problema, input: ref });
    });
  });

/** Lista de obras (appears_in: [firestriker]): pastas de content/works/ com work.json. */
const obrasCitadas = (indice: Indice) =>
  listaDeTextos().superRefine((lista, ctx) => {
    lista.forEach((obra, n) => {
      if (!indice.existe(`works/${obra}`)) {
        ctx.addIssue({ code: "custom", path: [n], input: obra, message: `"${obra}" não é uma obra: não existe content/works/${obra}/work.json.` });
      }
    });
  });

const umDe = <const T extends readonly [string, ...string[]]>(valores: T, oQue: string) =>
  z.enum(valores, { error: (i) => `${descrever(i.input)} não é ${oQue} conhecido. Use um destes: ${valores.join(", ")}.` });

/** ID de vídeo do YouTube (o que vem depois de "v=" no link): 11 letras, números, "-" ou "_". */
const idDoYoutube = () =>
  texto().refine((v) => v === "" || /^[\w-]{11}$/.test(v), {
    error: (i) => `${descrever(i.input)} não parece um ID de vídeo do YouTube: são 11 caracteres, o que vem depois de "v=" no link (ex.: J2j6xoIz0LE).`,
  });

/** Uma posição de figurinha: l, r, t, b (lados), w (largura) ou a (giro) + número. Igual ao build.py. */
const RE_POSICAO = /^(l|r|t|b|w|a)(-?[\d.]+)$/;

/** stickers: uma linha por figurinha, "arquivo | l3 t2 w26 a-4". */
const figurinhas = () =>
  listaDeTextos().superRefine((linhas, ctx) => {
    linhas.forEach((linha, n) => {
      const barra = linha.indexOf("|");
      const arquivo = (barra < 0 ? linha : linha.slice(0, barra)).trim();
      const posicoes = barra < 0 ? [] : linha.slice(barra + 1).trim().split(/\s+/).filter(Boolean);
      const ruim = posicoes.find((p) => !RE_POSICAO.test(p));
      if (!arquivo) {
        ctx.addIssue({ code: "custom", path: [n], input: linha, message: `a figurinha ${n + 1} não diz o arquivo (formato: "arquivo.png | l3 t2 w26 a-4").` });
      } else if (ruim !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [n],
          input: linha,
          message: `a figurinha ${n + 1} tem "${ruim}", que não é uma posição: use l, r, t, b, w ou a seguido de um número (ex.: l3 t2 w26 a-4).`,
        });
      }
    });
  });

/**
 * Valor traduzível do work.json: "texto" (igual nos dois idiomas) ou {"en": "…", "pt": "…"}.
 * (T10: é um `partialRecord`, e não um objeto com campos fixos, de propósito: o Zod devolve os campos de um objeto na
 * ORDEM DO SCHEMA, e o tr() do Python, quando o idioma pedido e o inglês estão vazios, usa o PRIMEIRO valor do arquivo —
 * `{"pt": "Só PT", "en": ""}` tem de continuar começando por "pt". O record guarda a ordem em que o autor escreveu.)
 */
const traduzivel = () =>
  z.union(
    [
      z.string(),
      z.partialRecord(z.enum(langs as [Lang, ...Lang[]]), texto(), {
        // chave que não é idioma (o Zod avisa como "unrecognized_keys"; o tipo dele não lista esse código, por isso o `as`)
        error: (i) => {
          const { code, keys } = i as { code: string; keys?: string[] };
          return code === "unrecognized_keys" ? `tem de ser um texto ou {"en": "…", "pt": "…"}: só as chaves en e pt (veio ${(keys ?? []).map((k) => `"${k}"`).join(", ")}).` : undefined;
        },
      }),
    ],
    { error: (i) => `tem de ser um texto ou {"en": "…", "pt": "…"}, mas veio ${descrever(i.input)}.` },
  );

/**
 * Objeto com os campos dados, em que QUALQUER outro campo é erro (com a lista dos aceitos).
 * (O tipo devolvido é o do objeto simples: como campos a mais nunca passam, ele é exato.)
 */
function objeto<S extends z.ZodRawShape>(onde: string, campos: S) {
  const base = z.object(campos);
  const aceitos = Object.keys(campos).filter((k) => !k.startsWith("_"));
  const desconhecido = z.custom<unknown>(() => false, {
    error: () => `campo desconhecido (erro de digitação?). Campos aceitos em ${onde}: ${aceitos.join(", ")}.`,
  });
  return base.catchall(desconhecido) as unknown as typeof base;
}

// ───────────── de onde o item veio (preenchido pelo carregador, não pelo autor) ─────────────

const idioma = z.enum(langs as [Lang, ...Lang[]]);

/** Itens de content/<seção>/<pasta>/<idioma>.md: a pasta (que é o "slug" do endereço) e o idioma. */
const origemDoItem = z.object({ slug: z.string(), lang: idioma });

/** Capítulos: obra, pasta do capítulo, idioma e a posição da pasta entre as da obra (1, 2, 3…, como o `i` do load_works). */
const origemDoCapitulo = z.object({ obra: z.string(), capitulo: z.string(), lang: idioma, posicao: z.number() });

// ───────────── as coleções ─────────────

/** Campos que todo .md aceita ("Comuns" na skill hc-conteudo). */
const comuns = (indice: Indice) => ({
  title: texto().optional(),
  date: data().optional(),
  summary: texto().optional(),
  image: texto().optional(),
  tags: listaDeTextos().optional(),
  related: referencias(indice).optional(),
  /** Só aparece na prévia (pnpm dev / python build.py serve). */
  draft: simNao().optional(),
  /** false = sem comentários. */
  comments: simNao().optional(),
});

/** Monta os schemas. `indice` diz o que existe em content/ (para conferir referências). */
export function criarSchemas(indice: Indice) {
  return {
    news: objeto("notícias", {
      ...comuns(indice),
      thumb: texto().optional(),
      backdrop_top: texto().optional(),
      backdrop_bottom: texto().optional(),
      stickers: figurinhas().optional(),
      overlay: texto().optional(),
      _origem: origemDoItem,
    }),

    pages: objeto("páginas", {
      ...comuns(indice),
      layout: umDe(["wide"], "um layout").optional(),
      menu: umDe(["extras"], "um menu").optional(),
      /** false = não gera página própria (ex.: content/pages/project, usado dentro de "Sobre"). */
      route: simNao().optional(),
      _origem: origemDoItem,
    }),

    emissaries: objeto("emissários", {
      ...comuns(indice),
      role: texto().optional(),
      order: texto().optional(),
      instagram: texto().optional(),
      tiktok: texto().optional(),
      youtube: texto().optional(),
      x: texto().optional(),
      bluesky: texto().optional(),
      website: texto().optional(),
      email: texto().optional(),
      _origem: origemDoItem,
    }),

    characters: objeto("personagens", {
      ...comuns(indice),
      role: texto().optional(),
      appears_in: obrasCitadas(indice).optional(),
      order: texto().optional(),
      _origem: origemDoItem,
    }),

    universe: objeto("universo", {
      ...comuns(indice),
      category: texto().optional(),
      order: texto().optional(),
      _origem: origemDoItem,
    }),

    chapters: objeto("capítulos", {
      ...comuns(indice),
      /** true = página existe, mas fica fora das listas (noindex). */
      unlisted: simNao().optional(),
      /** Número exibido, se diferente da ordem das pastas. */
      chapter: texto().optional(),
      youtube: idDoYoutube().optional(),
      pages: listaDeTextos().optional(),
      pages_glob: texto().optional(),
      _origem: origemDoCapitulo,
    }),

    works: objeto("work.json", {
      kind: umDe(TIPOS_DE_OBRA, "um tipo de obra (kind)").optional(),
      /** true = Histórias Hᴀᴛᴇ Cʏᴄʟᴇ; false = "Outras histórias". Padrão: true. */
      universe: simNao().optional(),
      oneshot: simNao().optional(),
      /** false esconde a obra inteira (das listas; as páginas dos capítulos existem). Padrão: true. */
      listed: simNao().optional(),
      /** true = obra INTEIRA em rascunho: some de tudo no site publicado (cartões, Histórias, home, atualizações, sitemap, feed, capítulos)
       *  e só aparece na prévia (`pnpm dev`), como um capítulo ou notícia `draft: true`. Tira a linha para publicar. */
      draft: simNao().optional(),
      /** Imagens do bloco "estou lendo em ordem…" (T17c): [normal] ou [normal, com o mouse por cima], caminhos em static/. Sem elas, o bloco usa a capa. */
      order_images: listaOrdemDeImagens().optional(),
      /** Arte do mesmo bloco em CAMADAS animadas (T17h): vale no lugar de `order_images` (se houver os dois, a arte em camadas ganha). Ver src/lib/artesDaOrdem.ts. */
      order_art: arteEmCamadas().optional(),
      /** Leitor página a página dos quadrinhos (T17d, só no Astro): uma runa por página, na ordem. Ver src/lib/folheador.ts. */
      page_runes: runasDasPaginas().optional(),
      /** Página de jogo (T17d, só no Astro): janela da demo e botão da Steam. Ver src/lib/jogo.ts. */
      game: paginaDeJogo().optional(),
      langs: z.array(idioma, { error: (i) => `tem de ser uma lista de idiomas (${langs.join(", ")}), mas veio ${descrever(i.input)}.` }).optional(),
      title: traduzivel().optional(),
      /** (28/10, só no Astro) um aviso curto sob o título de TODO capítulo da obra, no idioma que tiver (ex.: {"en": "Turn Close Captions on!"}).
       *  Só aparece no idioma escrito: sem "pt", a página em português fica sem aviso. */
      chapter_note: traduzivel().optional(),
      blurb: traduzivel().optional(),
      cover: traduzivel().optional(),
      logo: traduzivel().optional(),
      cta: traduzivel().optional(),
      external: traduzivel().optional(),
      divider: texto().optional(),
      order: z
        .strictObject(
          {
            release: z.number({ error: (i) => `tem de ser um número, sem aspas, mas veio ${descrever(i.input)}.` }).optional(),
            chrono: z.union([z.number(), z.literal(false)], { error: (i) => `tem de ser um número ou false, mas veio ${descrever(i.input)}.` }).optional(),
          },
          { error: (i) => (i.code === "unrecognized_keys" ? `só aceita "release" e "chrono".` : `tem de ser {"release": n, "chrono": n}, mas veio ${descrever(i.input)}.`) },
        )
        .optional(),
      reading_font: umDe(["times"], "uma fonte de leitura").optional(),
      media: umDe(MIDIAS, "um tipo de mídia (media)").optional(),
      updated: data().optional(),
      _origem: z.object({ slug: z.string() }),
    }),
  };
}

export type Schemas = ReturnType<typeof criarSchemas>;
/** Os nomes das coleções. */
export type Colecao = keyof Schemas;
