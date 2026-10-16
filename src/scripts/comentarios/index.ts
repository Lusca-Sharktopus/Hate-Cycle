// Comentários (T15): o ponto de entrada do script dos comentários no navegador.
//
// Quem carrega: o <script> de src/components/CaixaDeComentarios.astro. O Astro empacota este arquivo (com o
// @supabase/supabase-js da versão fixa do package.json, nada de CDN) num arquivo /_astro/…js, e só as páginas que desenham
// a CaixaDeComentarios (as que têm <section class="hc-comments" data-page>) o recebem.
//
// A configuração vem do window.HC que a própria página traz, ANTES deste script (um <script> comum no HTML, montado por
// src/lib/comentarios.ts, o único arquivo que lê config.json → comments). A chave é a "anon": pública por desenho; quem
// protege os dados é o RLS do banco (supabase/migrations/).
import { createClient } from "@supabase/supabase-js";
import { iniciarComentarios, lerConfiguracao } from "./caixa";

declare global {
  interface Window {
    HC?: unknown;
  }
}

const cfg = lerConfiguracao(window.HC);
const raiz = document.querySelector<HTMLElement>(".hc-comments[data-page]");
if (cfg && raiz) iniciarComentarios(raiz, cfg, createClient(cfg.url, cfg.key));
