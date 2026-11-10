// UMA conexão com o Supabase por página, para a caixa de comentários e o marca-página (03/11/2026).
//
// Os dois scripts são empacotados separadamente pelo Astro; se cada um criasse o seu cliente, a página teria duas sessões cuidando do
// mesmo login (o supabase-js avisa: "Multiple GoTrueClient instances"). O primeiro a pedir cria; o segundo recebe o mesmo.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CHAVE = "__hcSupabase";
/** O aviso "alguém entrou" (no document). O ../conta/index.ts ouve pelo mesmo nome, escrito lá (ele não importa este arquivo). */
export const EVENTO_DE_ENTRADA = "hc-conta-entrou";

export function clienteDoSupabase(url: string, chave: string): SupabaseClient {
  const g = globalThis as unknown as Record<string, SupabaseClient | undefined>;
  const ja = g[CHAVE];
  if (ja) return ja;
  const novo = createClient(url, chave);
  g[CHAVE] = novo;
  // 10/11: alguém entrou nesta página (pela caixa de comentários, pelos favoritos…): avisa o botão da conta do cabeçalho
  // (src/scripts/conta/index.ts), que só então baixa a parte pesada, mostra a foto e, se a conta acabou de nascer, abre o perfil
  novo.auth.onAuthStateChange((evento, sessao) => {
    if (evento === "SIGNED_IN" && sessao) document.dispatchEvent(new CustomEvent(EVENTO_DE_ENTRADA));
  });
  return novo;
}
