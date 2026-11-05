// A janela de login (05/11/2026, design do autor "login design.png"; só no site novo). Antes ela morava dentro da caixa de comentários
// (src/scripts/comentarios/caixa.ts, porte do comments.js, linhas 84–145); agora é um módulo próprio, para a MESMA janela abrir também
// pelo aviso dos favoritos (src/scripts/favoritos/), na página de Histórias, que não tem caixa de comentários.
//
// O que ela tem (de cima para baixo): o título, os três botões de entrar com Google, Twitter (X) e Discord (cada um com o círculo mágico
// de ./circulo.ts), a divisória "ou" do autor, as abas Entrar / Criar conta e o formulário da aba. X, Esc e clique fora fecham (menos na
// troca de senha, quando a pessoa chegou pelo link do e-mail); Tab fica preso dentro dela; ao fechar, o foco volta para onde estava.
// O comportamento dos formulários é o mesmo do comments.js (entrar, esqueci a senha, criar conta com nome de usuário, nova senha).
//
// Segurança: elementos só por el() (src/scripts/comentarios/dom.ts) e os ícones por icone() (só valores fixos deste arquivo); texto só
// como texto. Os textos vêm do window.HC.ui (config.json do autor), menos os dos três botões e o título sem "para comentar"
// (TEXTOS_DO_LOGIN, aqui, nunca no config.json).
import type { Provider, SupabaseClient } from "@supabase/supabase-js";
import { animarEntrada, el } from "../comentarios/dom";
import { enderecoDeVolta, mensagemDeErro, texto, type TextosDaCaixa } from "../comentarios/regras";
import { ligarCirculo } from "./circulo";

export const TEXTOS_DO_LOGIN = {
  pt: { google: "continuar com Google", twitter: "continuar com Twitter", discord: "continuar com Discord", titulo: "Entre ou crie uma conta", falhou: "O login não deu certo. O servidor respondeu:" },
  en: { google: "continue with Google", twitter: "continue with Twitter", discord: "continue with Discord", titulo: "Log in or create an account", falhou: "The login didn't work. The server said:" },
} as const;

/**
 * (05/11/2026, depois da virada) Quando o login com Google/Twitter/Discord falha, o Supabase devolve a pessoa à página com o erro no
 * endereço (#error=…&error_description=… ou ?error=…) e o supabase-js não mostra nada: a pessoa só via a janela de login de novo.
 * Esta função lê esse erro (antes de o supabase-js limpar o endereço) e devolve a frase para a caixa mostrar. O texto vem do endereço,
 * que qualquer um pode montar num link: só letras, números e pontuação simples, até 160 caracteres, e sempre depois da frase fixa
 * `falhou`. Função pura (o teste usa).
 */
export function erroDoRetornoDoLogin(hash: string, search: string, lang: string): string | null {
  for (const parte of [hash.replace(/^#/, ""), search.replace(/^\?/, "")]) {
    if (!parte) continue;
    let p: URLSearchParams;
    try {
      p = new URLSearchParams(parte);
    } catch {
      continue;
    }
    if (!p.has("error") && !p.has("error_description")) continue;
    const bruto = p.get("error_description") || p.get("error_code") || p.get("error") || "";
    const limpo = bruto.replace(/[^A-Za-z0-9À-ÿ .,:;()'_-]/g, "").replace(/\s+/g, " ").trim().slice(0, 160);
    return `${textosDoLogin(lang).falhou} ${limpo || "?"}`;
  }
  return null;
}
export type TextosDoLogin = (typeof TEXTOS_DO_LOGIN)["pt"] | (typeof TEXTOS_DO_LOGIN)["en"];
export function textosDoLogin(lang: string): TextosDoLogin {
  return lang.toLowerCase().startsWith("pt") ? TEXTOS_DO_LOGIN.pt : TEXTOS_DO_LOGIN.en;
}

/** O que a janela lembra entre um desenho e outro (a caixa de comentários lê e escreve o mesmo estado). */
export interface EstadoDoLogin {
  modo: "login" | "signup";
  /** "recovery": a pessoa chegou pelo link de nova senha do e-mail. */
  trocandoSenha: boolean;
  /** A mensagem amarela (erro) e a verde (aviso), mostradas uma vez. */
  erro: string | null;
  aviso: string | null;
}

export interface OpcoesDoLogin {
  sb: SupabaseClient;
  /** Os textos c_* (window.HC.ui com os padrões). */
  T: TextosDaCaixa;
  lang: string;
  estado: EstadoDoLogin;
  /** O título da janela (na caixa de comentários, o c_login_to do config.json). */
  titulo: string;
  /** Depois de salvar a senha nova (a caixa de comentários redesenha tudo; os favoritos, só a janela). */
  depoisDaSenhaNova: () => void;
}

export interface JanelaDeLogin {
  abrir(): void;
  fechar(): void;
  /** Redesenha a janela aberta (mensagens, aba). */
  redesenhar(): void;
  aberta(): boolean;
}

// ── os ícones (SVG com valores fixos deste arquivo) ──
const SVG = "http://www.w3.org/2000/svg";
const G_AZUL = "M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z";
const G_VERDE = "M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z";
const G_AMARELO = "M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z";
const G_VERMELHO = "M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z";
const X =
  "M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.18h1.7L7.4 4.73H5.58l11.09 14.45Z";
const DISCORD =
  "M20.32 4.37A19.8 19.8 0 0 0 15.39 2.84a13.8 13.8 0 0 0-.63 1.29 18.4 18.4 0 0 0-5.52 0 12.6 12.6 0 0 0-.64-1.29 19.7 19.7 0 0 0-4.93 1.53C.53 9.05-.32 13.6.1 18.09a19.9 19.9 0 0 0 6.04 3.05c.49-.66.92-1.36 1.29-2.1a12.9 12.9 0 0 1-2.03-.97l.5-.39a14.2 14.2 0 0 0 12.2 0l.5.39c-.65.38-1.33.71-2.04.97.37.74.8 1.44 1.29 2.1a19.8 19.8 0 0 0 6.05-3.05c.5-5.18-.84-9.7-3.58-13.72ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.09 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42s.95-2.42 2.15-2.42c1.21 0 2.18 1.09 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z";

type Provedor = "google" | "twitter" | "discord";
const PROVEDORES: readonly { nome: Provedor; supabase: Provider; partes: readonly (readonly [string, string])[] }[] = [
  { nome: "google", supabase: "google", partes: [[G_AZUL, "#4285f4"], [G_VERDE, "#34a853"], [G_AMARELO, "#fbbc05"], [G_VERMELHO, "#ea4335"]] },
  // o Twitter entra pelo "X / Twitter (OAuth 2.0)" do Supabase (o "twitter" de lá é o antigo, OAuth 1.0a)
  { nome: "twitter", supabase: "x", partes: [[X, "#111"]] },
  { nome: "discord", supabase: "discord", partes: [[DISCORD, "#5865f2"]] },
];

function no<K extends keyof SVGElementTagNameMap>(tag: K, atributos: Readonly<Record<string, string>>): SVGElementTagNameMap[K] {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(atributos)) n.setAttribute(k, v);
  return n;
}

/** Os dois ícones de um botão: o de sempre (cores da marca) e o do mouse em cima (degradê #2ee0b0 → #00e9fd, com brilho no CSS). */
function icones(p: (typeof PROVEDORES)[number]): SVGSVGElement[] {
  const normal = no("svg", { class: "c-ic c-ic-normal", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" });
  for (const [d, cor] of p.partes) normal.appendChild(no("path", { d, fill: cor }));
  const id = `c-degrade-${p.nome}`;
  const brilho = no("svg", { class: "c-ic c-ic-brilho", viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" });
  const defs = no("defs", {});
  const degrade = no("linearGradient", { id, x1: "0", y1: "0", x2: "0", y2: "1" });
  degrade.append(no("stop", { offset: "0", "stop-color": "#2ee0b0" }), no("stop", { offset: "1", "stop-color": "#00e9fd" }));
  defs.appendChild(degrade);
  brilho.appendChild(defs);
  for (const [d] of p.partes) brilho.appendChild(no("path", { d, fill: `url(#${id})` }));
  return [normal, brilho];
}

/** Monta a janela de login. Ela só aparece com abrir(). */
export function janelaDeLogin(o: OpcoesDoLogin): JanelaDeLogin {
  const { sb, T, estado } = o;
  const t = (chave: string) => texto(T, chave);
  const L = textosDoLogin(o.lang);
  let janela: HTMLDivElement | null = null;
  let focoAntes: Element | null = null;

  function mensagem(textoDaMensagem: string | null, ok = false): HTMLParagraphElement | null {
    return textoDaMensagem ? el("p", { attrs: { class: "c-msg" + (ok ? " ok" : ""), role: "status" }, texto: textoDaMensagem }) : null;
  }
  function campo(type: string, name: string, ph: string, extra: Record<string, string> = {}): HTMLInputElement {
    return el("input", { attrs: { type, name, placeholder: ph, "aria-label": ph, required: "required", ...extra } });
  }
  function botaoDeEnviar(rotulo: string): HTMLButtonElement {
    return el("button", { attrs: { type: "submit", class: "button" }, texto: rotulo });
  }

  function abrir(): void {
    if (janela && janela.isConnected) {
      redesenhar();
      return;
    }
    focoAntes = document.activeElement;
    const j = el("div", { attrs: { class: "c-modal", role: "dialog", "aria-modal": "true", "aria-label": t("c_login_title") } });
    janela = j;
    j.addEventListener("mousedown", (e) => {
      if (e.target === j && !estado.trocandoSenha) fechar();
    });
    j.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !estado.trocandoSenha) {
        fechar();
        return;
      }
      if (e.key !== "Tab") return;
      const focaveis = j.querySelectorAll<HTMLElement>("button, input, a[href]");
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
    document.body.appendChild(j);
    document.documentElement.classList.add("c-modal-open");
    redesenhar();
    animarEntrada(j, j.firstElementChild);
    j.querySelector("input")?.focus();
  }

  function fechar(): void {
    janela?.remove();
    janela = null;
    document.documentElement.classList.remove("c-modal-open");
    if (focoAntes instanceof HTMLElement || focoAntes instanceof SVGElement) {
      try {
        focoAntes.focus({ preventScroll: true });
      } catch {
        /* o elemento pode ter saído da página */
      }
    }
  }

  function provedores(): HTMLDivElement {
    const lista = el("div", { attrs: { class: "c-provedores" } });
    for (const p of PROVEDORES) {
      const b = el(
        "button",
        {
          attrs: { type: "button", class: `c-prov c-${p.nome}` },
          ao: {
            click: () => {
              void sb.auth.signInWithOAuth({ provider: p.supabase, options: { redirectTo: enderecoDeVolta(location.href) } }).then((r) => {
                if (r && r.error) {
                  estado.erro = mensagemDeErro(r.error, T);
                  redesenhar();
                }
              });
            },
          },
        },
        [el("span", { texto: L[p.nome] })],
      );
      b.prepend(...icones(p));
      ligarCirculo(b);
      lista.appendChild(b);
    }
    return lista;
  }

  function redesenhar(): void {
    const j = janela;
    if (!j) return;
    j.textContent = "";
    const caixa = el("div", { attrs: { class: "c-dialog c-login" } });
    if (!estado.trocandoSenha) caixa.appendChild(el("button", { attrs: { type: "button", class: "c-x", "aria-label": t("c_close") }, texto: "×", ao: { click: fechar } }));
    if (estado.trocandoSenha) {
      const f = el("form");
      const senha = campo("password", "password", t("c_new_password"), { minlength: "6", autocomplete: "new-password" });
      f.appendChild(senha);
      f.appendChild(botaoDeEnviar(t("c_save_password")));
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        void sb.auth.updateUser({ password: senha.value }).then((r) => {
          if (r.error) estado.erro = mensagemDeErro(r.error, T);
          else {
            estado.trocandoSenha = false;
            estado.aviso = t("c_password_changed");
          }
          o.depoisDaSenhaNova();
        });
      });
      caixa.appendChild(f);
    } else {
      caixa.appendChild(el("h3", { texto: o.titulo }));
      caixa.appendChild(provedores());
      caixa.appendChild(el("div", { attrs: { class: "c-ou" } }, [el("span", { texto: t("c_or") })]));
      caixa.appendChild(
        el("div", { attrs: { class: "c-tabs" } }, [
          el("button", { attrs: { type: "button", "aria-pressed": String(estado.modo === "login") }, texto: t("c_login"), ao: { click: () => ((estado.modo = "login"), redesenhar()) } }),
          el("button", { attrs: { type: "button", "aria-pressed": String(estado.modo === "signup") }, texto: t("c_signup"), ao: { click: () => ((estado.modo = "signup"), redesenhar()) } }),
        ]),
      );
      caixa.appendChild(estado.modo === "login" ? formularioDeEntrar() : formularioDeCadastro());
    }
    for (const m of [mensagem(estado.erro), mensagem(estado.aviso, true)]) if (m) caixa.appendChild(m);
    estado.erro = estado.aviso = null;
    j.appendChild(caixa);
  }

  function formularioDeEntrar(): HTMLFormElement {
    const f = el("form");
    const email = campo("email", "email", t("c_email"), { autocomplete: "email" });
    const senha = campo("password", "password", t("c_password"), { autocomplete: "current-password" });
    const esqueci = el("button", {
      attrs: { type: "button", class: "c-link" },
      texto: t("c_forgot"),
      ao: {
        click: () => {
          if (!email.value) {
            email.focus();
            return;
          }
          // como no comments.js: o aviso aparece mesmo se o Supabase recusar (não diz se o e-mail tem conta)
          void sb.auth.resetPasswordForEmail(email.value, { redirectTo: enderecoDeVolta(location.href) }).then(() => {
            estado.aviso = t("c_reset_sent");
            redesenhar();
          });
        },
      },
    });
    for (const n of [email, senha, botaoDeEnviar(t("c_login")), esqueci]) f.appendChild(n);
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      void sb.auth.signInWithPassword({ email: email.value, password: senha.value }).then((r) => {
        if (r.error) {
          estado.erro = mensagemDeErro(r.error, T);
          redesenhar();
        }
      });
    });
    return f;
  }

  function formularioDeCadastro(): HTMLFormElement {
    const f = el("form");
    const nome = campo("text", "username", t("c_username"), { minlength: "2", maxlength: "30", autocomplete: "nickname" });
    const email = campo("email", "email", t("c_email"), { autocomplete: "email" });
    const senha = campo("password", "password", `${t("c_password")} (min. 6)`, { minlength: "6", autocomplete: "new-password" });
    for (const n of [nome, email, senha, botaoDeEnviar(t("c_signup"))]) f.appendChild(n);
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      void sb.auth
        .signUp({ email: email.value, password: senha.value, options: { data: { display_name: nome.value.trim() }, emailRedirectTo: enderecoDeVolta(location.href) } })
        .then((r) => {
          if (r.error) estado.erro = mensagemDeErro(r.error, T);
          else {
            estado.aviso = t("c_check_email");
            estado.modo = "login";
          }
          redesenhar();
        });
    });
    return f;
  }

  return { abrir, fechar, redesenhar, aberta: () => janela !== null && janela.isConnected };
}
