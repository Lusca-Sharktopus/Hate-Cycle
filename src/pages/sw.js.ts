// /sw.js (28/11/2026, pedido do autor): o "service worker" das notificações. É o pedacinho do site que o navegador guarda quando a
// pessoa liga as notificações no sino da janela da conta (src/scripts/conta/novidades.ts) e que acorda sozinho, mesmo com o site
// fechado, quando a função do Supabase manda uma novidade (supabase/functions/avisar-novidades/). Só faz duas coisas:
//   - push: mostra a notificação (título, resumo, ícone do site); o conteúdo é o de regrasDasNovidades.ts → ConteudoDaNotificacao;
//   - clique: abre (ou traz para a frente) a página da novidade, e só se o link for deste site.
// Nada de cache nem de interceptar páginas: o site continua funcionando exatamente como antes para quem nunca ligou as notificações.
// Mora na raiz (/sw.js) porque um service worker só cuida do que está abaixo do endereço dele.
import type { APIRoute } from "astro";
import { icones } from "../lib/imagens";

export const GET: APIRoute = async () => {
  const icone = (await icones("logos/favicon.png", [192]))[0]?.href ?? "/logos/favicon.png";
  const codigo = `// Hᴀᴛᴇ Cʏᴄʟᴇ: notificações das novidades (gerado por src/pages/sw.js.ts)
"use strict";
const ICONE = ${JSON.stringify(icone)};
const NOME = "Hᴀᴛᴇ Cʏᴄʟᴇ";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = {}; }
  const titulo = typeof d.titulo === "string" && d.titulo ? d.titulo.slice(0, 200) : NOME;
  const corpo = typeof d.corpo === "string" ? d.corpo.slice(0, 300) : "";
  const url = typeof d.url === "string" && /^\\/(pt|en)\\/[a-z0-9/-]*$/.test(d.url) ? d.url : "/";
  const tag = typeof d.id === "string" ? d.id.slice(0, 200) : undefined;
  e.waitUntil(self.registration.showNotification(titulo, { body: corpo, icon: ICONE, badge: ICONE, tag, data: { url } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const alvo = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin);
  if (alvo.origin !== self.location.origin) return;
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of abertas) {
      if (new URL(c.url).pathname === alvo.pathname && "focus" in c) return c.focus();
    }
    return self.clients.openWindow(alvo.href);
  })());
});
`;
  return new Response(codigo, { headers: { "Content-Type": "text/javascript; charset=utf-8" } });
};
