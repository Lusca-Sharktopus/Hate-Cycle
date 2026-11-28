// Hᴀᴛᴇ Cʏᴄʟᴇ — a função que manda as notificações das novidades (28/11/2026, pedido do autor). Roda no Supabase (Edge Function, Deno),
// chamada pelo passo "Avisar" do deploy (.github/workflows/deploy.yml → tools/avisar_novidades.mjs) logo depois de cada publicação.
//
// O que faz, sempre do mesmo jeito (chamar de novo não manda nada duas vezes):
//   0. no máximo uma execução a cada 5 s (public.notification_runs): a chave anon que chama é pública;
//   1. lê as novidades que ESTÃO NO AR, em https://hatecycle.com/pt/novidades.json e /en/novidades.json (nunca o que vem no pedido:
//      quem chama não escolhe o que é anunciado). Os dois idiomas têm de mostrar a MESMA versão do site (a do pedido, quando vem);
//   2. anota em public.site_updates as que ainda não estavam lá, com a hora de agora (é essa hora que o sino usa para "ainda não vista").
//      Na primeira vez (tabela vazia) só anota tudo, como já enviado, com a hora de meio-dia do dia de cada notícia. Notícia de mais de
//      7 dias também entra como já enviada (nada de notificação de coisa velha);
//   3. para cada novidade ainda não enviada: RESERVA (send_lease, 2 minutos; outra chamada ao mesmo tempo pula), manda para os aparelhos
//      de public.push_subscriptions em ordem de endereço, anotando até onde foi (send_cursor) a cada lote, e fecha (sent_at) no fim.
//      Se o tempo da execução acabar, responde { pendente: true } e a próxima chamada continua de onde parou. Aparelho que o serviço do
//      navegador recusa de vez (400, 401, 403, 404, 410) ou cuja chave nem dá para usar sai da tabela.
//
// Segredos (Edge Functions → Secrets): VAPID_PRIVATE_KEY (a chave privada das notificações; a pública está em regras.ts).
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY o próprio Supabase põe. Guia do autor: docs/comentarios-supabase.md, seção 7.
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
/** Quanto tempo uma execução manda antes de devolver "pendente" (o Supabase corta bem depois disso). */
const TEMPO_DE_ENVIO_MS = 20_000;
const LOTE = 50;
/** Respostas do serviço do navegador que querem dizer "esta inscrição não serve mais". */
const RECUSA_DE_VEZ = new Set([400, 401, 403, 404, 410]);

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
  const inicio = Date.now();
  const privada = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!privada || !url || !servico) return resposta({ erro: "falta o segredo VAPID_PRIVATE_KEY" }, 500);
  let esperada = "";
  try {
    const corpo = await pedido.json();
    if (corpo && typeof corpo.versao === "string" && /^[0-9a-f]{40}$/.test(corpo.versao)) esperada = corpo.versao;
  } catch {
    /* sem corpo: vale o que estiver no ar, se os dois idiomas concordarem */
  }
  const sb = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } });

  // 0. no máximo uma execução a cada 5 s
  const agoraIso = new Date().toISOString();
  const vez = await sb.from("notification_runs").update({ last_run: agoraIso }).eq("id", 1).lt("last_run", new Date(Date.now() - 5000).toISOString()).select("id");
  if (vez.error) return resposta({ erro: vez.error.message }, 500);
  if (!vez.data?.length) return resposta({ devagar: true }, 429);

  // 1. o que está no ar (os dois idiomas da mesma versão do site)
  const [pt, en] = await Promise.all([novidadesNoAr("pt"), novidadesNoAr("en")]);
  if ((esperada && (pt.versao !== esperada || en.versao !== esperada)) || pt.versao !== en.versao) {
    return resposta({ esperando: true, no_ar: { pt: pt.versao, en: en.versao } }, 409);
  }
  const porId = new Map<string, Record<string, Novidade | undefined>>();
  for (const [lang, arquivo] of [["pt", pt], ["en", en]] as const) {
    for (const n of arquivo.itens) porId.set(n.id, { ...(porId.get(n.id) ?? {}), [lang]: n });
  }
  const dataDe = (id: string) => (porId.get(id)?.["pt"] ?? porId.get(id)?.["en"])?.data ?? "";
  const ids = [...porId.keys()];

  // 2. anotar
  const qualquer = await sb.from("site_updates").select("item_id").limit(1);
  if (qualquer.error) return resposta({ erro: qualquer.error.message }, 500);
  const primeiraVez = !qualquer.data?.length;
  const ja = ids.length ? await sb.from("site_updates").select("item_id").in("item_id", ids) : { data: [], error: null };
  if (ja.error) return resposta({ erro: ja.error.message }, 500);
  const anotadas = new Set((ja.data ?? []).map((r: { item_id: string }) => r.item_id));
  const faltam = ids.filter((id) => !anotadas.has(id));
  if (faltam.length) {
    const agora = Date.now();
    const linhas = faltam.map((id) =>
      primeiraVez
        ? { item_id: id, first_seen_at: horaDeAntes(dataDe(id)), sent_at: agoraIso }
        : { item_id: id, first_seen_at: agoraIso, sent_at: novaDemaisParaAvisar(dataDe(id), agora) ? null : agoraIso },
    );
    const r = await sb.from("site_updates").upsert(linhas, { onConflict: "item_id", ignoreDuplicates: true });
    if (r.error) return resposta({ erro: r.error.message }, 500);
  }
  if (primeiraVez) return resposta({ versao: pt.versao, primeira_vez: faltam.length, enviadas: 0 });

  // 3. mandar o que ainda não foi (só o que está no ar agora: uma notícia que saiu do site antes de ser avisada não é avisada)
  const pendentes = ids.length
    ? await sb.from("site_updates").select("item_id, send_cursor").in("item_id", ids).is("sent_at", null).order("first_seen_at")
    : { data: [], error: null };
  if (pendentes.error) return resposta({ erro: pendentes.error.message }, 500);
  webpush.setVapidDetails(CONTATO, CHAVE_PUBLICA_DAS_NOTIFICACOES, privada);
  let enviadas = 0;
  const removidas = new Set<string>();
  const avisadas: string[] = [];
  for (const p of (pendentes.data ?? []) as { item_id: string; send_cursor: string | null }[]) {
    // a reserva: só uma chamada manda cada novidade; uma que morreu no meio libera depois de 2 minutos
    const agora = new Date();
    const reserva = await sb
      .from("site_updates")
      .update({ send_lease: new Date(agora.getTime() + 120_000).toISOString() })
      .eq("item_id", p.item_id)
      .is("sent_at", null)
      .or(`send_lease.is.null,send_lease.lt.${agora.toISOString()}`)
      .select("send_cursor");
    if (reserva.error) return resposta({ erro: reserva.error.message }, 500);
    if (!reserva.data?.length) continue; // outra chamada está mandando esta
    let cursor: string = (reserva.data[0] as { send_cursor: string | null }).send_cursor ?? "";
    const porIdioma = porId.get(p.item_id) ?? {};
    for (;;) {
      if (Date.now() - inicio > TEMPO_DE_ENVIO_MS) {
        await sb.from("site_updates").update({ send_cursor: cursor, send_lease: null }).eq("item_id", p.item_id);
        if (removidas.size) await sb.from("push_subscriptions").delete().in("endpoint", [...removidas]);
        return resposta({ versao: pt.versao, pendente: true, enviadas, removidas: removidas.size });
      }
      let consulta = sb.from("push_subscriptions").select("endpoint, p256dh, auth, lang").order("endpoint").limit(LOTE);
      if (cursor) consulta = consulta.gt("endpoint", cursor);
      const lote = await consulta;
      if (lote.error) return resposta({ erro: lote.error.message }, 500);
      const inscricoes = (lote.data ?? []) as { endpoint: string; p256dh: string; auth: string; lang: string }[];
      if (!inscricoes.length) break;
      // de 10 em 10, para não abrir conexões demais de uma vez
      for (let i = 0; i < inscricoes.length; i += 10) {
        await Promise.all(
          inscricoes.slice(i, i + 10).map(async (s) => {
            if (!enderecoDeNotificacaoPermitido(s.endpoint) || !chavesDaInscricaoValidas(s.p256dh, s.auth)) {
              removidas.add(s.endpoint);
              return;
            }
            const conteudo = notificacaoPara(s.lang, porIdioma, SEM_RESUMO);
            if (!conteudo || removidas.has(s.endpoint)) return;
            try {
              await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(conteudo), { TTL: 60 * 60 * 24 * 3, urgency: "normal" });
              enviadas++;
            } catch (e) {
              const status = (e as { statusCode?: unknown }).statusCode;
              const codigo = (e as { code?: unknown }).code;
              // com status de recusa = o serviço não quer mais esta inscrição; sem status, um erro de rede (ECONNRESET, ETIMEDOUT, ENOTFOUND…)
              // fica para a próxima vez, e qualquer outro (sem código, ou ERR_… da criptografia) = a chave dela nem serve para cifrar
              const deRede = typeof codigo === "string" && /^E[A-Z_]+$/.test(codigo) && !codigo.startsWith("ERR_");
              if (typeof status === "number" ? RECUSA_DE_VEZ.has(status) : !deRede) removidas.add(s.endpoint);
            }
          }),
        );
      }
      cursor = inscricoes[inscricoes.length - 1]?.endpoint ?? cursor;
      const avanco = await sb
        .from("site_updates")
        .update({ send_cursor: cursor, send_lease: new Date(Date.now() + 120_000).toISOString() })
        .eq("item_id", p.item_id);
      if (avanco.error) return resposta({ erro: avanco.error.message }, 500);
      if (inscricoes.length < LOTE) break;
    }
    await sb.from("site_updates").update({ sent_at: new Date().toISOString(), send_lease: null }).eq("item_id", p.item_id);
    avisadas.push(p.item_id);
  }
  if (removidas.size) await sb.from("push_subscriptions").delete().in("endpoint", [...removidas]);
  return resposta({ versao: pt.versao, novas: faltam, avisadas, enviadas, removidas: removidas.size });
});
