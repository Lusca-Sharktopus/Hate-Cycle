// A janela da conta (03/11/2026, só no site novo; pedido do autor: "uma janela que aparece na tela e escurece a página atrás quando o
// usuário clica no próprio nome"). Abre pelo nome em "Conectado como <nome>" da caixa de comentários (caixa.ts).
//
// O que tem: o nome que aparece nos comentários (trocar), o e-mail da conta (só para a pessoa ver qual conta é) e "Apagar conta", com uma
// segunda confirmação que explica o que some. As duas ações chamam funções do banco (migração 20261103040000_conta.sql) que só agem
// sobre QUEM CHAMA: change_my_name(novo) e delete_my_account().
//
// Mesmo cuidado da caixa: todo elemento por el() de ./dom.ts (nome e e-mail entram só como texto). Os textos são do site (não do
// config.json do autor, que o Python também lê): TEXTOS_DA_CONTA, em pt e en.
import type { SupabaseClient } from "@supabase/supabase-js";
import { el } from "./dom";

export const TEXTOS_DA_CONTA = {
  pt: {
    titulo: "Sua conta",
    abrir: "Abrir a janela da sua conta",
    nome: "Nome que aparece nos comentários",
    salvar: "Salvar nome",
    salvo: "Nome salvo.",
    email: "Conta",
    tamanho: "O nome precisa ter de 2 a 30 caracteres.",
    invalido: "Esse nome tem caracteres que não podem ser usados.",
    apagar: "Apagar conta",
    aviso:
      "Isso apaga a sua conta, o seu nome e os seus marca-páginas. Os seus comentários somem; os que têm respostas de outras pessoas ficam como “[comentário apagado]”. Não dá para desfazer.",
    confirmar: "Apagar minha conta de vez",
    cancelar: "Cancelar",
    apagada: "Sua conta foi apagada.",
    fechar: "Fechar",
    erro: "Algo deu errado. Tente de novo.",
  },
  en: {
    titulo: "Your account",
    abrir: "Open your account window",
    nome: "Name shown on your comments",
    salvar: "Save name",
    salvo: "Name saved.",
    email: "Account",
    tamanho: "Your name must be 2 to 30 characters long.",
    invalido: "This name has characters that can't be used.",
    apagar: "Delete account",
    aviso:
      "This deletes your account, your name and your bookmarks. Your comments disappear; the ones other people replied to stay as “[comment deleted]”. This can't be undone.",
    confirmar: "Delete my account for good",
    cancelar: "Cancel",
    apagada: "Your account was deleted.",
    fechar: "Close",
    erro: "Something went wrong. Please try again.",
  },
} as const;
export type TextosDaConta = (typeof TEXTOS_DA_CONTA)["pt"] | (typeof TEXTOS_DA_CONTA)["en"];

export function textosDaConta(lang: string): TextosDaConta {
  return lang.toLowerCase().startsWith("pt") ? TEXTOS_DA_CONTA.pt : TEXTOS_DA_CONTA.en;
}

/** O nome como o banco vai guardar (mesma limpeza de change_my_name): sem espaços nas pontas, espaços repetidos viram um. */
export function nomeLimpo(valor: string): string {
  return valor.trim().replace(/\s+/g, " ");
}

/** Conferência antes de enviar (o banco confere de novo): null = pode enviar; senão, a mensagem. */
export function problemaNoNome(valor: string, T: TextosDaConta): string | null {
  const n = nomeLimpo(valor);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(n)) return T.invalido;
  if ([...n].length < 2 || [...n].length > 30) return T.tamanho;
  return null;
}

/** A mensagem de um erro do banco, nos textos da janela. */
export function mensagemDaConta(erro: { message?: unknown } | null | undefined, T: TextosDaConta): string {
  const m = erro && typeof erro.message === "string" ? erro.message.toLowerCase() : "";
  if (m.includes("name length")) return T.tamanho;
  if (m.includes("invalid name")) return T.invalido;
  return T.erro;
}

export interface OpcoesDaConta {
  sb: SupabaseClient;
  lang: string;
  nome: string;
  email: string | undefined;
  /** O nome mudou (a caixa relê o perfil e a lista). */
  aoMudarNome: () => void;
  /** A conta foi apagada (a caixa volta ao estado deslogado e mostra o aviso). */
  aoApagar: (aviso: string) => void;
}

/** Abre a janela (uma de cada vez). Devolve a função que fecha. */
export function abrirJanelaDaConta(o: OpcoesDaConta): () => void {
  document.querySelector(".c-modal.c-conta")?.remove();
  const T = textosDaConta(o.lang);
  const focoAntes = document.activeElement;
  const janela = el("div", { attrs: { class: "c-modal c-conta", role: "dialog", "aria-modal": "true", "aria-labelledby": "c-conta-titulo" } });
  const caixa = el("div", { attrs: { class: "c-dialog" } });
  let ocupado = false;

  function fechar(): void {
    janela.remove();
    document.documentElement.classList.remove("c-modal-open");
    if (focoAntes instanceof HTMLElement && focoAntes.isConnected) focoAntes.focus({ preventScroll: true });
  }

  const msg = el("p", { attrs: { class: "c-msg", role: "status" } });
  msg.hidden = true;
  function avisar(texto: string, ok = false): void {
    msg.textContent = texto;
    msg.className = "c-msg" + (ok ? " ok" : "");
    msg.hidden = false;
  }

  // ── nome ──
  const campoDoNome = el("input", {
    attrs: { type: "text", name: "display_name", id: "c-conta-nome", maxlength: "30", minlength: "2", autocomplete: "nickname", required: "required" },
  });
  campoDoNome.value = o.nome;
  const formDoNome = el("form", { attrs: { class: "c-conta-nome" } }, [
    el("label", { attrs: { for: "c-conta-nome" }, texto: T.nome }),
    campoDoNome,
    el("button", { attrs: { type: "submit", class: "button" }, texto: T.salvar }),
  ]);
  formDoNome.addEventListener("submit", (e) => {
    e.preventDefault();
    if (ocupado) return;
    const problema = problemaNoNome(campoDoNome.value, T);
    if (problema) {
      avisar(problema);
      campoDoNome.focus();
      return;
    }
    ocupado = true;
    void o.sb.rpc("change_my_name", { novo: nomeLimpo(campoDoNome.value) }).then((r) => {
      ocupado = false;
      if (r.error) {
        avisar(mensagemDaConta(r.error, T));
        return;
      }
      if (typeof r.data === "string") campoDoNome.value = r.data;
      avisar(T.salvo, true);
      o.aoMudarNome();
    });
  });

  // ── apagar ──
  const zona = el("div", { attrs: { class: "c-conta-perigo" } });
  function zonaFechada(): void {
    zona.textContent = "";
    zona.appendChild(el("button", { attrs: { type: "button", class: "c-link c-conta-apagar" }, texto: T.apagar, ao: { click: zonaAberta } }));
  }
  function zonaAberta(): void {
    zona.textContent = "";
    const confirmar = el("button", {
      attrs: { type: "button", class: "button c-conta-confirmar" },
      texto: T.confirmar,
      ao: {
        click: () => {
          if (ocupado) return;
          ocupado = true;
          void o.sb.rpc("delete_my_account").then((r) => {
            ocupado = false;
            if (r.error) {
              avisar(mensagemDaConta(r.error, T));
              return;
            }
            // a conta (e as sessões dela) já não existem no servidor: só limpa a sessão deste navegador
            void o.sb.auth.signOut({ scope: "local" }).finally(() => {
              fechar();
              o.aoApagar(T.apagada);
            });
          });
        },
      },
    });
    zona.append(
      el("p", { attrs: { class: "c-conta-aviso" }, texto: T.aviso }),
      el("div", { attrs: { class: "c-row" } }, [
        confirmar,
        el("button", {
          attrs: { type: "button", class: "c-link" },
          texto: T.cancelar,
          ao: {
            click: () => {
              zonaFechada();
              zona.querySelector<HTMLButtonElement>(".c-conta-apagar")?.focus();
            },
          },
        }),
      ]),
    );
    confirmar.focus();
  }
  zonaFechada();

  caixa.append(
    el("button", { attrs: { type: "button", class: "c-x", "aria-label": T.fechar }, texto: "×", ao: { click: fechar } }),
    el("h3", { attrs: { id: "c-conta-titulo" }, texto: T.titulo }),
    formDoNome,
    msg,
    zona,
  );
  if (o.email) {
    const linhaDoEmail = el("p", { attrs: { class: "c-conta-email" } }, [el("span", { texto: `${T.email}: ` }), el("strong", { texto: o.email })]);
    caixa.querySelector("h3")?.after(linhaDoEmail);
  }
  janela.appendChild(caixa);

  // fecha: ×, Esc, clique fora; Tab fica preso dentro (como a janela de login)
  janela.addEventListener("mousedown", (e) => {
    if (e.target === janela) fechar();
  });
  janela.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      fechar();
      return;
    }
    if (e.key !== "Tab") return;
    const focaveis = [...janela.querySelectorAll<HTMLElement>("button, input")].filter((x) => !x.hidden);
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (!primeiro || !ultimo) return;
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  });
  document.body.appendChild(janela);
  document.documentElement.classList.add("c-modal-open");
  campoDoNome.focus();
  return fechar;
}
