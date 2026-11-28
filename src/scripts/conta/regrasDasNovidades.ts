// As regras das novidades e das notificações (28/11/2026, pedido do autor; só no site novo). Funções puras, SEM imports: o mesmo
// arquivo vai para o navegador (o sino da janela da conta e a bolinha do botão da conta, ./novidades.ts) e, COPIADO byte a byte, para a
// função do Supabase que manda as notificações (supabase/functions/avisar-novidades/regras.ts; tests/novidades.test.ts confere que as
// duas cópias são iguais).
//
// O que é uma "novidade": cada notícia publicada (e, quando a seção existir, cada post do Blog). A lista sai no build em
// /<idioma>/novidades.json (src/pages/[lang]/novidades.json.ts): as mais recentes primeiro, com o ID da conversa de comentários
// (news/<pasta>, igual nos dois idiomas), o título, o link e o resumo. A HORA em que cada uma apareceu no site é anotada pela função do
// Supabase na tabela public.site_updates (a notícia só tem dia, não hora): é ela que diz o que a pessoa ainda não viu.

/** Uma novidade, como sai no novidades.json. */
export interface Novidade {
  /** news/<pasta> ou blog/<pasta>: o mesmo ID dos comentários, igual nos dois idiomas. */
  id: string;
  titulo: string;
  /** /pt/news/<pasta>/ ou /en/news/<pasta>/ */
  url: string;
  /** AAAA-MM-DD (o `date:` da notícia). */
  data: string;
  resumo: string;
}

/** O arquivo inteiro: `versao` = o commit que gerou o site (GITHUB_SHA no deploy; "" na prévia). */
export interface ArquivoDeNovidades {
  versao: string;
  itens: Novidade[];
}

/** Quantas novidades o arquivo traz (as mais recentes) e quantas o sino mostra. */
export const NOVIDADES_NO_ARQUIVO = 30;
export const NOVIDADES_NO_SINO = 12;

const ID = /^(news|blog)\/[a-z0-9]+(-[a-z0-9]+)*$/;
const URL_DO_SITE = /^\/(pt|en)\/(news|blog)\/[a-z0-9]+(-[a-z0-9]+)*\/$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function texto(valor: unknown, limite: number): string {
  return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim().slice(0, limite) : "";
}

/** Lê o novidades.json com desconfiança: só passa o que tem a forma certa (o resto é descartado em silêncio). */
export function lerNovidades(json: unknown): ArquivoDeNovidades {
  const o = (json && typeof json === "object" ? json : {}) as { versao?: unknown; itens?: unknown };
  const itens: Novidade[] = [];
  const vistos = new Set<string>();
  for (const bruto of Array.isArray(o.itens) ? o.itens : []) {
    const i = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
    const id = typeof i["id"] === "string" ? i["id"] : "";
    const url = typeof i["url"] === "string" ? i["url"] : "";
    const titulo = texto(i["titulo"], 200);
    if (!ID.test(id) || id.length > 200 || !URL_DO_SITE.test(url) || !titulo || vistos.has(id)) continue;
    vistos.add(id);
    itens.push({ id, titulo, url, data: DATA.test(String(i["data"])) ? String(i["data"]) : "", resumo: texto(i["resumo"], 300) });
    if (itens.length >= NOVIDADES_NO_ARQUIVO) break;
  }
  return { versao: typeof o.versao === "string" && /^[0-9a-f]{0,40}$/.test(o.versao) ? o.versao : "", itens };
}

/**
 * Quais novidades a pessoa ainda não viu: as que a função do Supabase anotou (site_updates) DEPOIS da última vez que a pessoa abriu o
 * sino. Uma novidade que a função ainda não anotou não conta (vai contar quando a notificação sair, que é quando ela "aparece").
 */
export function idsNaoVistos(itens: readonly Novidade[], anotadas: ReadonlyMap<string, string>, vistoEm: string | null): Set<string> {
  const saida = new Set<string>();
  const limite = vistoEm ? Date.parse(vistoEm) : NaN;
  if (Number.isNaN(limite)) return saida;
  for (const i of itens) {
    const quando = Date.parse(anotadas.get(i.id) ?? "");
    if (!Number.isNaN(quando) && quando > limite) saida.add(i.id);
  }
  return saida;
}

// ───────────── as notificações do navegador (Web Push) ─────────────

/**
 * A chave PÚBLICA do site para as notificações (VAPID). Pública por desenho: vai para o navegador de todo visitante. A chave privada que
 * faz par com ela fica SÓ nos segredos da função do Supabase (VAPID_PRIVATE_KEY), nunca no código. Trocar o par = todas as inscrições
 * antigas param de funcionar (cada pessoa liga de novo).
 */
export const CHAVE_PUBLICA_DAS_NOTIFICACOES = "BFG62ZBIUBJadWHvCc274mKQsH4mMg3cUlwsa1OGn0fLBFNT1YrDCpk1RFINAIxPTmHW9WGm8J5i-LC46N6ujZk";

/**
 * Os serviços de notificação dos navegadores. O endereço de cada inscrição é do navegador da pessoa (Chrome/Edge/Opera → Google ou
 * Microsoft, Firefox → Mozilla, Safari → Apple); a função do Supabase só manda para esses serviços, para ninguém usá-la para mandar
 * pedidos a um endereço qualquer. O banco confere a mesma lista (migração 20261128000000_notificacoes.sql).
 */
const SERVICOS_DE_NOTIFICACAO = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\/[!-~]+$/;

export function enderecoDeNotificacaoPermitido(endereco: unknown): endereco is string {
  return typeof endereco === "string" && endereco.length <= 1000 && SERVICOS_DE_NOTIFICACAO.test(endereco);
}

/** As duas chaves de uma inscrição, como o navegador dá (base64url): p256dh = 65 bytes, auth = 16 bytes. */
export function chavesDaInscricaoValidas(p256dh: unknown, auth: unknown): boolean {
  return typeof p256dh === "string" && /^[A-Za-z0-9_-]{86,88}={0,2}$/.test(p256dh) && typeof auth === "string" && /^[A-Za-z0-9_-]{21,24}={0,2}$/.test(auth);
}

/** base64url → bytes (a chave pública, para pushManager.subscribe). */
export function bytesDaChave(base64url: string): Uint8Array {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4);
  const bin = atob(b64);
  const saida = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) saida[i] = bin.charCodeAt(i);
  return saida;
}

/** O que vai dentro de cada notificação (o service worker /sw.js lê estes campos; curtos de propósito: o limite é de ~4 KB). */
export interface ConteudoDaNotificacao {
  titulo: string;
  corpo: string;
  url: string;
  id: string;
}

/**
 * A notificação de uma novidade para uma pessoa: no idioma em que ela ligou as notificações; se a novidade não existe nesse idioma
 * (notícia escrita só em inglês, por exemplo), vai a versão do outro idioma, para ninguém perder nada.
 */
export function notificacaoPara(lang: string, porIdioma: Readonly<Record<string, Novidade | undefined>>, semResumo: Readonly<Record<string, string>>): ConteudoDaNotificacao | null {
  const outro = lang === "pt" ? "en" : "pt";
  const n = porIdioma[lang] ?? porIdioma[outro];
  if (!n) return null;
  const idiomaDoTexto = porIdioma[lang] ? lang : outro;
  return { titulo: n.titulo, corpo: n.resumo || semResumo[idiomaDoTexto] || "", url: n.url, id: n.id };
}

/** Novidade velha não vira notificação (ex.: uma notícia antiga que saiu do rascunho): só as dos últimos 7 dias. */
export function novaDemaisParaAvisar(data: string, agora: number): boolean {
  if (!DATA.test(data)) return true;
  const dia = Date.parse(`${data}T23:59:59-03:00`);
  return !Number.isNaN(dia) && agora - dia <= 7 * 24 * 60 * 60 * 1000;
}

/** A hora "de mentira" das novidades que já estavam no site quando as notificações nasceram: meio-dia (Brasília) do dia da notícia. */
export function horaDeAntes(data: string): string {
  return DATA.test(data) ? `${data}T12:00:00-03:00` : "2020-01-01T12:00:00-03:00";
}
