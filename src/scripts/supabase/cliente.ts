// UMA conexão com o Supabase por página, para a caixa de comentários e o marca-página (03/11/2026).
//
// Os dois scripts são empacotados separadamente pelo Astro; se cada um criasse o seu cliente, a página teria duas sessões cuidando do
// mesmo login (o supabase-js avisa: "Multiple GoTrueClient instances"). O primeiro a pedir cria; o segundo recebe o mesmo.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CHAVE = "__hcSupabase";

export function clienteDoSupabase(url: string, chave: string): SupabaseClient {
  const g = globalThis as unknown as Record<string, SupabaseClient | undefined>;
  const ja = g[CHAVE];
  if (ja) return ja;
  const novo = createClient(url, chave);
  g[CHAVE] = novo;
  return novo;
}
