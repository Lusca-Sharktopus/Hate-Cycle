#!/usr/bin/env node
// Depois de cada publicação, avisa a função do Supabase que manda as notificações das novidades (28/11/2026, pedido do autor).
// Roda no passo "Avisar" do deploy (.github/workflows/deploy.yml), sem segredo nenhum: usa a URL e a chave anon PÚBLICAS do
// config.json (as mesmas que vão em toda página do site). Quem decide o que é novidade é a função, lendo o site no ar
// (supabase/functions/avisar-novidades/); chamar mais de uma vez não manda nada duas vezes.
//
//   node tools/avisar_novidades.mjs --versao <commit>
//
// --versao: o commit que acabou de ser publicado (GITHUB_SHA). A função responde 409 enquanto o site no ar ainda mostra a versão
// anterior (o GitHub Pages leva um pouco para trocar); aqui se tenta de novo a cada 20 s, por até 8 minutos.
// A função ainda não existe no Supabase (404) ou sem o segredo da chave (500 com essa mensagem) = aviso no log, e o deploy continua verde:
// o site já está no ar e nada se perde (a função anota tudo na primeira vez que rodar).
import { readFileSync } from "node:fs";

const i = process.argv.indexOf("--versao");
const versao = i > 0 ? process.argv[i + 1] ?? "" : "";
if (!/^[0-9a-f]{40}$/.test(versao)) {
  console.error("uso: node tools/avisar_novidades.mjs --versao <commit de 40 caracteres>");
  process.exit(2);
}

const comentarios = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8")).comments ?? {};
// a mesma limpeza do build.py: sem / no fim e sem /rest/v1… ou /auth/v1… colados por engano
const url = String(comentarios.supabase_url ?? "").trim().replace(/\/(rest|auth)\/v1.*$/, "").replace(/\/+$/, "");
const chave = String(comentarios.supabase_anon_key ?? "").trim();
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !chave) {
  console.log("::warning::config.json sem as chaves do Supabase: nenhuma notificação enviada.");
  process.exit(0);
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const limite = Date.now() + 8 * 60 * 1000;
for (let tentativa = 1; ; tentativa++) {
  let r;
  try {
    r = await fetch(`${url}/functions/v1/avisar-novidades`, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, apikey: chave, "Content-Type": "application/json" },
      body: JSON.stringify({ versao }),
    });
  } catch (e) {
    r = null;
    console.log(`tentativa ${tentativa}: sem resposta (${e?.message ?? e})`);
  }
  const texto = r ? await r.text() : "";
  if (r && r.ok) {
    console.log(`notificações: ${texto}`);
    process.exit(0);
  }
  if (r && r.status === 404) {
    console.log("::warning::A função avisar-novidades ainda não existe no Supabase: nenhuma notificação enviada (docs/comentarios-supabase.md, seção 7).");
    process.exit(0);
  }
  if (r && r.status === 500 && texto.includes("VAPID_PRIVATE_KEY")) {
    console.log("::warning::A função avisar-novidades está sem o segredo VAPID_PRIVATE_KEY: nenhuma notificação enviada (docs/comentarios-supabase.md, seção 7).");
    process.exit(0);
  }
  if (r) console.log(`tentativa ${tentativa}: ${r.status} ${texto.slice(0, 300)}`);
  if (Date.now() > limite) {
    console.log("::warning::O site no ar não mostrou a versão nova a tempo; as notificações saem na próxima publicação.");
    process.exit(0);
  }
  await espera(20000);
}
