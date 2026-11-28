// As novidades e as notificações no navegador (28/11/2026, pedido do autor; só no site novo). Usado pela janela da conta (o sino ao lado
// da lixeira, src/scripts/comentarios/conta.ts) e pelo botão da conta do cabeçalho (a bolinha, ./painel.ts). Regras puras e formato dos
// dados: ./regrasDasNovidades.ts. Banco: supabase/migrations/20261128000000_notificacoes.sql.
//
//   carregarNovidades()  as novidades do idioma (/<idioma>/novidades.json) + quais a pessoa ainda não viu (site_updates × a última vez
//                        que ela abriu o sino, my_notifications_seen)
//   marcarVistas()       abriu o sino: tudo conta como visto (mark_notifications_seen) e a bolinha some em toda parte (EVENTO_VISTAS)
//   estadoDoAparelho(), ligarNotificacoes(), desligarNotificacoes()   o botão "receber notificações neste aparelho"
import type { SupabaseClient } from "@supabase/supabase-js";
import { bytesDaChave, CHAVE_PUBLICA_DAS_NOTIFICACOES, chavesDaInscricaoValidas, enderecoDeNotificacaoPermitido, idsNaoVistos, lerNovidades, type Novidade } from "./regrasDasNovidades";

/** Avisado no document quando a pessoa abre o sino (a bolinha do botão do cabeçalho some). */
export const EVENTO_VISTAS = "hc-novidades-vistas";

export interface Novidades {
  itens: Novidade[];
  naoVistas: Set<string>;
}

export async function carregarNovidades(sb: SupabaseClient, lang: string): Promise<Novidades> {
  const idioma = lang.toLowerCase().startsWith("pt") ? "pt" : "en";
  const resposta = await fetch(`/${idioma}/novidades.json`, { credentials: "same-origin", cache: "no-cache" });
  const { itens } = lerNovidades(resposta.ok ? await resposta.json() : {});
  if (!itens.length) return { itens, naoVistas: new Set() };
  const [visto, anotadas] = await Promise.all([
    sb.rpc("my_notifications_seen"),
    sb.from("site_updates").select("item_id, first_seen_at").in("item_id", itens.map((i) => i.id)),
  ]);
  const mapa = new Map<string, string>();
  if (!anotadas.error && Array.isArray(anotadas.data)) {
    for (const a of anotadas.data as { item_id?: unknown; first_seen_at?: unknown }[]) {
      if (typeof a.item_id === "string" && typeof a.first_seen_at === "string") mapa.set(a.item_id, a.first_seen_at);
    }
  }
  const vistoEm = !visto.error && typeof visto.data === "string" ? visto.data : null;
  return { itens, naoVistas: idsNaoVistos(itens, mapa, vistoEm) };
}

export async function marcarVistas(sb: SupabaseClient): Promise<void> {
  const r = await sb.rpc("mark_notifications_seen");
  if (!r.error) document.dispatchEvent(new CustomEvent(EVENTO_VISTAS));
}

// ───────────── as notificações deste aparelho ─────────────

/**
 * "sem-suporte": o navegador não recebe notificações de sites (ou, no iPhone/iPad, só recebe com o site na Tela de Início).
 * "bloqueado": a pessoa (ou o navegador) bloqueou as notificações deste site; só se desfaz nas configurações do navegador.
 * "ligado" / "desligado": o botão.
 */
export type EstadoDoAparelho = "sem-suporte" | "iphone" | "bloqueado" | "ligado" | "desligado";

function ehIphoneForaDaTelaDeInicio(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const naTelaDeInicio = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !naTelaDeInicio;
}

function temSuporte(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
}

async function inscricaoAtual(): Promise<PushSubscription | null> {
  const registro = await navigator.serviceWorker.getRegistration("/");
  return registro ? registro.pushManager.getSubscription() : null;
}

export async function estadoDoAparelho(sb: SupabaseClient): Promise<EstadoDoAparelho> {
  if (!temSuporte()) return ehIphoneForaDaTelaDeInicio() ? "iphone" : "sem-suporte";
  if (Notification.permission === "denied") return "bloqueado";
  if (Notification.permission !== "granted") return "desligado";
  try {
    const inscricao = await inscricaoAtual();
    if (!inscricao) return "desligado";
    // o navegador está inscrito; mas é desta conta? (o mesmo navegador pode ter sido de outra conta antes)
    const r = await sb.rpc("has_push_subscription", { endereco: inscricao.endpoint });
    return !r.error && r.data === true ? "ligado" : "desligado";
  } catch {
    return "desligado";
  }
}

/** Liga neste aparelho: pede a permissão do navegador, inscreve e guarda no banco. Devolve o estado final. */
export async function ligarNotificacoes(sb: SupabaseClient, lang: string): Promise<EstadoDoAparelho> {
  if (!temSuporte()) return ehIphoneForaDaTelaDeInicio() ? "iphone" : "sem-suporte";
  const permissao = await Notification.requestPermission();
  if (permissao === "denied") return "bloqueado";
  if (permissao !== "granted") return "desligado";
  const registro = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  let inscricao = await registro.pushManager.getSubscription();
  if (!inscricao) {
    inscricao = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDaChave(CHAVE_PUBLICA_DAS_NOTIFICACOES) as BufferSource });
  }
  const json = inscricao.toJSON();
  const p256dh = json.keys?.["p256dh"];
  const auth = json.keys?.["auth"];
  if (!enderecoDeNotificacaoPermitido(inscricao.endpoint) || !chavesDaInscricaoValidas(p256dh, auth)) {
    await inscricao.unsubscribe().catch(() => undefined);
    return "sem-suporte";
  }
  const idioma = lang.toLowerCase().startsWith("pt") ? "pt" : "en";
  const r = await sb.rpc("save_push_subscription", { endereco: inscricao.endpoint, chave_p256dh: p256dh, chave_auth: auth, idioma });
  if (r.error) throw r.error;
  return "ligado";
}

/** Desliga neste aparelho: tira do banco e cancela a inscrição do navegador. */
export async function desligarNotificacoes(sb: SupabaseClient): Promise<EstadoDoAparelho> {
  const inscricao = temSuporte() ? await inscricaoAtual().catch(() => null) : null;
  if (inscricao) {
    const r = await sb.rpc("remove_push_subscription", { endereco: inscricao.endpoint });
    if (r.error) throw r.error;
    await inscricao.unsubscribe().catch(() => undefined);
  }
  return "desligado";
}
