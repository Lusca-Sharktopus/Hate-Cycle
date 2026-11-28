// Hᴀᴛᴇ Cʏᴄʟᴇ — a função que manda as notificações das novidades (28/11/2026, pedido do autor). Roda no Supabase (Edge Function, Deno),
// chamada pelo passo "Avisar" do deploy (.github/workflows/deploy.yml → tools/avisar_novidades.mjs) logo depois de cada publicação.
//
// O que faz, sempre do mesmo jeito (chamar duas vezes não manda nada duas vezes):
//   1. lê as novidades que ESTÃO NO AR, em https://hatecycle.com/pt/novidades.json e /en/novidades.json (nunca o que vem no pedido:
//      quem chama não escolhe o que é anunciado);
//   2. anota em public.site_updates as que ainda não estavam lá, com a hora de agora (é essa hora que o sino usa para "ainda não vista").
//      Na primeira vez (tabela vazia), só anota tudo, com a hora de meio-dia do dia de cada notícia, e não manda nada;
//   3. para cada novidade que ESTE pedido anotou (o banco garante que só um pedido anota cada uma) e que é dos últimos 7 dias, manda a
//      notificação a cada aparelho de public.push_subscriptions, no idioma em que a pessoa ligou (ou no outro, se a notícia só existe
//      nele). Aparelho que o serviço do navegador diz que não existe mais (404/410) sai da tabela.
//
// Segredos (Project Settings → Edge Functions → Secrets): VAPID_PRIVATE_KEY (a chave privada das notificações; a pública está em
// regras.ts). SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY o próprio Supabase põe. Guia do autor: docs/comentarios-supabase.md, seção 7.
// regras.ts é uma CÓPIA byte a byte de src/scripts/conta/regrasDasNovidades.ts (tests/novidades.test.ts confere).
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import webpush from "npm:web-push@3.6.7";
import {
  CHAVE_PUBLICA_DAS_NOTIFICACOES,
  chavesDaInscricaoValidas,
  enderecoDeNotificacaoPermitido,
  horaDeAntes,
  lerNovidades,
  notificacaoPara,
  novaDemaisParaAvisar,
  type Novidade,
} from "./regras.ts";

const SITE = "https://hatecycle.com";
const CONTATO = "mailto:lucas.blito@gmail.com";
const SEM_RESUMO: Record<string, string> = { pt: "Novidade em Hᴀᴛᴇ Cʏᴄʟᴇ", en: "New on Hᴀᴛᴇ Cʏᴄʟᴇ" };

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

async function novidadesNoAr(lang: "pt" | "en") {
  const r = await fetch(`${SITE}/${lang}/novidades.json?agora=${Date.now()}`, { headers: { "Cache-Control": "no-cache" } });
  if (!r.ok) throw new Error(`novidades.json (${lang}): ${r.status}`);
  return lerNovidades(await r.json());
}

Deno.serve(async (pedido) => {
  if (pedido.method !== "POST") return resposta({ erro: "use POST" }, 405);
  const privada = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!privada || !url || !servico) return resposta({ erro: "falta o segredo VAPID_PRIVATE_KEY" }, 500);
  let esperada = "";
  try {
    const corpo = await pedido.json();
    if (corpo && typeof corpo.versao === "string" && /^[0-9a-f]{40}$/.test(corpo.versao)) esperada = corpo.versao;
  } catch {
    /* sem corpo: vale o que estiver no ar */
  }

  // 1. o que está no ar
  const [pt, en] = await Promise.all([novidadesNoAr("pt"), novidadesNoAr("en")]);
  // o site no ar ainda é o de antes (o GitHub Pages leva um pouco para trocar): quem chamou tenta de novo daqui a pouco
  if (esperada && (pt.versao !== esperada || en.versao !== esperada)) return resposta({ esperando: true, no_ar: { pt: pt.versao, en: en.versao } }, 409);
  const porId = new Map<string, Record<string, Novidade | undefined>>();
  for (const [lang, arquivo] of [["pt", pt], ["en", en]] as const) {
    for (const n of arquivo.itens) porId.set(n.id, { ...(porId.get(n.id) ?? {}), [lang]: n });
  }

  // 2. anotar
  const sb = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } });
  const ja = await sb.from("site_updates").select("item_id").limit(5000);
  if (ja.error) return resposta({ erro: ja.error.message }, 500);
  const anotadas = new Set((ja.data ?? []).map((r: { item_id: string }) => r.item_id));
  const faltam = [...porId.keys()].filter((id) => !anotadas.has(id));
  if (!faltam.length) return resposta({ versao: pt.versao, novas: [], enviadas: 0 });
  const dataDe = (id: string) => (porId.get(id)?.["pt"] ?? porId.get(id)?.["en"])?.data ?? "";
  if (anotadas.size === 0) {
    const r = await sb.from("site_updates").upsert(faltam.map((id) => ({ item_id: id, first_seen_at: horaDeAntes(dataDe(id)) })), { onConflict: "item_id", ignoreDuplicates: true });
    if (r.error) return resposta({ erro: r.error.message }, 500);
    return resposta({ versao: pt.versao, primeira_vez: faltam.length, enviadas: 0 });
  }
  const inseridas = await sb.from("site_updates").upsert(faltam.map((id) => ({ item_id: id })), { onConflict: "item_id", ignoreDuplicates: true }).select("item_id");
  if (inseridas.error) return resposta({ erro: inseridas.error.message }, 500);
  const agora = Date.now();
  const minhas = (inseridas.data ?? []).map((r: { item_id: string }) => r.item_id).filter((id: string) => novaDemaisParaAvisar(dataDe(id), agora));
  if (!minhas.length) return resposta({ versao: pt.versao, novas: faltam, enviadas: 0 });

  // 3. mandar
  webpush.setVapidDetails(CONTATO, CHAVE_PUBLICA_DAS_NOTIFICACOES, privada);
  let enviadas = 0;
  const removidas = new Set<string>();
  for (let de = 0; ; de += 1000) {
    const pagina = await sb.from("push_subscriptions").select("endpoint, p256dh, auth, lang").order("endpoint").range(de, de + 999);
    if (pagina.error) return resposta({ erro: pagina.error.message }, 500);
    const inscricoes = (pagina.data ?? []) as { endpoint: string; p256dh: string; auth: string; lang: string }[];
    const tarefas: (() => Promise<void>)[] = [];
    for (const s of inscricoes) {
      if (!enderecoDeNotificacaoPermitido(s.endpoint) || !chavesDaInscricaoValidas(s.p256dh, s.auth)) continue;
      for (const id of minhas) {
        const conteudo = notificacaoPara(s.lang, porId.get(id) ?? {}, SEM_RESUMO);
        if (!conteudo) continue;
        tarefas.push(async () => {
          if (removidas.has(s.endpoint)) return;
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(conteudo), { TTL: 60 * 60 * 24 * 3, urgency: "normal" });
            enviadas++;
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) removidas.add(s.endpoint);
          }
        });
      }
    }
    // de 10 em 10, para não abrir conexões demais de uma vez
    for (let i = 0; i < tarefas.length; i += 10) await Promise.all(tarefas.slice(i, i + 10).map((t) => t()));
    if (inscricoes.length < 1000) break;
  }
  if (removidas.size) await sb.from("push_subscriptions").delete().in("endpoint", [...removidas]);
  return resposta({ versao: pt.versao, novas: faltam, avisadas: minhas, enviadas, removidas: removidas.size });
});
