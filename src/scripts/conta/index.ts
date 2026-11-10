// O botão da conta no cabeçalho (10/11/2026, pedido do autor; só no site novo): logo depois do seletor de idioma, em TODAS as páginas.
// Quem entrou vê a própria foto (ou a runa dela) e o clique abre a janela da conta; quem não entrou vê a silhueta e o clique abre a
// janela de login. Assim dá para chegar ao perfil mesmo numa página sem comentários.
//
// Este arquivo é pequeno de propósito: ele vai para toda página e NÃO traz o supabase-js. O resto (./painel.ts, com a conexão, a
// janela da conta e a de login) só é baixado quando precisa: a pessoa tem uma sessão guardada neste navegador, está voltando de um
// login (Google, Twitter, Discord, e-mail) ou clicou no botão.
//
// A configuração vem do window.HC_CONTA da página (src/lib/comentarios.ts → configuracaoDaConta, o único que lê as chaves).
// ⚠ Vai para o navegador: não importa nada de src/lib/.
import { textosComPadrao } from "../comentarios/regras";

declare global {
  interface Window {
    HC_CONTA?: unknown;
  }
}

/** O window.HC_CONTA lido como o window.HC da caixa (lerConfiguracao de ../comentarios/caixa.ts, sem trazer a caixa inteira). */
function lerConfiguracao(hc: unknown): { url: string; key: string; lang: string; ui: ReturnType<typeof textosComPadrao> } | null {
  if (hc === null || typeof hc !== "object") return null;
  const { url, key, lang, ui } = hc as Record<string, unknown>;
  if (typeof url !== "string" || url === "" || typeof key !== "string" || key === "") return null;
  return { url, key, lang: typeof lang === "string" ? lang : "en", ui: textosComPadrao(ui) };
}

const cfg = lerConfiguracao(window.HC_CONTA);
const botao = document.querySelector<HTMLButtonElement>("button.hc-conta");

/** A chave em que o supabase-js guarda a sessão neste navegador ("sb-<projeto>-auth-token"). */
export function chaveDaSessao(url: string): string {
  try {
    return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  } catch {
    return "";
  }
}

if (cfg && botao) {
  botao.hidden = false;
  let temSessao = false;
  try {
    temSessao = Boolean(localStorage.getItem(chaveDaSessao(cfg.url)));
  } catch {
    /* sem localStorage: decide no clique */
  }
  const voltandoDoLogin = /access_token=|error_description=|[?&]code=/.test(location.hash + location.search);
  let painel: Promise<{ clicar(): void }> | null = null;
  const carregar = () => (painel ??= import("./painel").then((m) => m.ligarPainel(botao, cfg)));
  if (temSessao || voltandoDoLogin) void carregar();
  botao.addEventListener("click", () => void carregar().then((p) => p.clicar()));
}
