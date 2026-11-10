// O botão da conta no cabeçalho, a parte pesada (10/11/2026): a conexão com o Supabase (a MESMA da caixa de comentários e dos
// favoritos, ../supabase/cliente.ts), a foto no botão e as duas janelas (../comentarios/conta.ts e ../login/janela.ts).
// Carregado por ./index.ts só quando precisa.
//
// Convivência com a caixa de comentários e os favoritos: as três partes ouvem o mesmo login (onAuthStateChange) e avisam umas às
// outras quando o nome, a foto ou a conta mudam (evento "hc-conta-mudou" no document). O que vem pelo endereço depois de um login
// (erro do Google, link de nova senha) fica com a caixa de comentários ou com os favoritos quando a página tem um deles; o botão só
// cuida disso nas páginas que não têm nenhum dos dois.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConfiguracaoDosComentarios } from "../comentarios/caixa";
import { abrirJanelaDaConta, textosDaConta } from "../comentarios/conta";
import { circuloDaFoto } from "../comentarios/foto";
import { faltaColuna, type Perfil } from "../comentarios/regras";
import { erroDoRetornoDoLogin, janelaDeLogin, textosDoLogin, type EstadoDoLogin } from "../login/janela";
import { clienteDoSupabase } from "../supabase/cliente";

export const EVENTO_DA_CONTA = "hc-conta-mudou";

/** A página tem quem cuide do que vem pelo endereço depois de um login (a caixa de comentários ou os favoritos)? */
function outroCuidaDoLogin(): boolean {
  return Boolean(document.querySelector(".hc-comments[data-page]")) || "HC_FAV" in window;
}

export function ligarPainel(botao: HTMLButtonElement, cfg: ConfiguracaoDosComentarios): { clicar(): void } {
  const sozinho = !outroCuidaDoLogin();
  // o erro do login é lido ANTES de criar a conexão (o supabase-js limpa o endereço)
  const erroDoLogin = sozinho ? erroDoRetornoDoLogin(location.hash, location.search, cfg.lang) : null;
  const sb: SupabaseClient = clienteDoSupabase(cfg.url, cfg.key);
  const silhueta = botao.querySelector(".hc-conta-silhueta");
  const rotuloDeFora = botao.getAttribute("aria-label") ?? "";
  const rotuloDeDentro = textosDaConta(cfg.lang).abrir;

  let quem: { id: string; email?: string | undefined } | null = null;
  let perfil: Perfil | null = null;

  function desenhar(): void {
    botao.querySelector(".c-foto")?.remove();
    if (quem) {
      if (silhueta instanceof HTMLElement) silhueta.hidden = true;
      botao.appendChild(circuloDaFoto(cfg.url, quem.id, perfil && perfil.avatar_path, "hc-conta-foto"));
      botao.setAttribute("aria-label", rotuloDeDentro);
      botao.title = rotuloDeDentro;
      botao.classList.add("hc-conta-dentro");
    } else {
      if (silhueta instanceof HTMLElement) silhueta.hidden = false;
      botao.setAttribute("aria-label", rotuloDeFora);
      botao.title = rotuloDeFora;
      botao.classList.remove("hc-conta-dentro");
    }
  }

  async function lerPerfil(): Promise<void> {
    if (!quem) {
      perfil = null;
      desenhar();
      return;
    }
    const eu = quem.id;
    let r = await sb.from("profiles").select("display_name, is_admin, avatar_path").eq("id", eu).single();
    if (faltaColuna(r.error)) r = (await sb.from("profiles").select("display_name, is_admin").eq("id", eu).single()) as typeof r;
    if (!quem || quem.id !== eu) return; // saiu ou trocou de conta no meio do caminho
    perfil = r.error ? null : (r.data as Perfil);
    desenhar();
  }

  const estado: EstadoDoLogin = { modo: "login", trocandoSenha: false, erro: erroDoLogin, aviso: null };
  const login = janelaDeLogin({
    sb,
    T: cfg.ui,
    lang: cfg.lang,
    titulo: textosDoLogin(cfg.lang).titulo,
    estado,
    depoisDaSenhaNova: () => (quem ? login.fechar() : login.redesenhar()),
  });

  sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === "PASSWORD_RECOVERY" && sozinho) {
      estado.trocandoSenha = true;
      login.abrir();
    }
    const proximo = sessao?.user ?? null;
    if ((proximo ? proximo.id : null) === (quem ? quem.id : null)) return;
    quem = proximo ? { id: proximo.id, email: proximo.email } : null;
    // entrou pela janela do botão: ela fecha sozinha (menos no meio da troca de senha)
    if (quem && login.aberta() && !estado.trocandoSenha) login.fechar();
    void lerPerfil();
  });
  const pronto = sb.auth.getSession().then((r) => {
    const s = r.data && r.data.session;
    if (s && !quem) quem = { id: s.user.id, email: s.user.email };
    return lerPerfil();
  });
  if (erroDoLogin) login.abrir();
  // a caixa de comentários (ou outra janela da conta) mudou o nome/a foto: relê
  document.addEventListener(EVENTO_DA_CONTA, () => void lerPerfil());

  const avisar = () => document.dispatchEvent(new CustomEvent(EVENTO_DA_CONTA));

  return {
    clicar(): void {
      void pronto.then(() => {
        if (!quem) {
          login.abrir();
          return;
        }
        const eu = quem;
        abrirJanelaDaConta({
          sb,
          lang: cfg.lang,
          id: eu.id,
          base: cfg.url,
          nome: (perfil && perfil.display_name) || "",
          foto: perfil && perfil.avatar_path,
          admin: Boolean(perfil && perfil.is_admin),
          aoMudar: () => {
            void lerPerfil();
            avisar();
          },
          aoApagar: () => {
            quem = null;
            perfil = null;
            desenhar();
            avisar();
          },
        });
      });
    },
  };
}
