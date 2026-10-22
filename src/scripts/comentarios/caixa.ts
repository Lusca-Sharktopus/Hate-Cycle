// Comentários (T15): a caixa de comentários inteira, no navegador. Porte do static/comments.js (que continua existindo para
// o site Python até a virada, T20) para TypeScript, com o MESMO comportamento, o MESMO HTML (classes, atributos, textos) e
// os MESMOS pedidos ao Supabase. As regras (o que mostrar, quando enviar, que mensagem de erro) estão em ./regras.ts; todo
// elemento é criado por el() de ./dom.ts (texto do visitante só como texto, nunca como HTML).
//
// Quem chama: ./index.ts (o <script> de src/components/CaixaDeComentarios.astro), com o cliente do Supabase já criado.
// A prova: tests/comentarios.test.ts (regras) e tools/comentarios_playwright.py (no navegador, Python × Astro, com um
// Supabase falso).
//
// O que a caixa faz (o mesmo que o comments.js; o número é a linha de lá):
//   - barra fixa "Escreva um comentário…" + botão Publicar; Enter envia, Shift+Enter quebra linha; cresce até 220 px (64–82);
//   - deslogado: focar a barra ou clicar Publicar abre a janela de login (71, 75);
//   - janela de login (84–145): Google, "ou", abas Entrar/Criar conta, X para fechar, Esc e clique fora fecham, Tab fica
//     preso dentro dela, o foco volta para onde estava; na troca de senha (link do e-mail) ela não fecha;
//   - entrar (147–162), esqueci a senha (151–154), criar conta com nome de usuário (164–179), nova senha (116–127);
//   - linha "Conectado como <nome>" + Sair (49–55);
//   - lista: "Carregando…", "Ainda não há comentários", comentários na ordem do banco com as respostas embaixo (200–216);
//   - cada comentário (241–275): ✦ para admin, nome, "(editado)" com a data no title, data/hora no formato do idioma, texto;
//     Responder (só em comentário raiz, só conectado), Editar (só o próprio), Apagar (o próprio ou admin, com confirmação);
//   - responder (181–197) e editar (218–239: Esc cancela, texto igual não envia, cursor no fim);
//   - mensagens de erro e de aviso (22–28, 59–60, 142–143);
//   - sessão: entra/sai sem recarregar a página (277–296).
import type { SupabaseClient } from "@supabase/supabase-js";
import { el } from "./dom";
import {
  COLUNAS,
  COLUNAS_COM_EDICAO,
  alturaDoCampo,
  dataDaEdicao,
  dataDoComentario,
  enderecoDeVolta,
  enterEnvia,
  mensagemDeErro,
  montarArvore,
  nomeDeQuemEntrou,
  nomeDoAutor,
  podeApagar,
  podeEditar,
  podeResponder,
  texto,
  textoParaEnviar,
  textosComPadrao,
  type Comentario,
  type Perfil,
  type QuemEntrou,
  type TextosDaCaixa,
} from "./regras";

/** O window.HC que a página traz (src/lib/comentarios.ts monta): endereço do projeto, chave anon, idioma e textos. */
export interface ConfiguracaoDosComentarios {
  url: string;
  key: string;
  lang: string;
  ui: TextosDaCaixa;
}

/** Lê o window.HC; se faltar algo essencial, null (a caixa não aparece, como no comments.js). */
export function lerConfiguracao(hc: unknown): ConfiguracaoDosComentarios | null {
  if (hc === null || typeof hc !== "object") return null;
  const { url, key, lang, ui } = hc as Record<string, unknown>;
  if (typeof url !== "string" || url === "" || typeof key !== "string" || key === "") return null;
  return { url, key, lang: typeof lang === "string" ? lang : "en", ui: textosComPadrao(ui) };
}

type Erro = { message?: unknown } | null | undefined;

/** Monta a caixa dentro de `raiz` (a <section class="hc-comments" data-page>) e liga tudo ao Supabase. */
export function iniciarComentarios(raiz: HTMLElement, cfg: ConfiguracaoDosComentarios, sb: SupabaseClient): void {
  const app = raiz.querySelector<HTMLElement>(".c-app");
  const pagina = raiz.dataset["page"];
  if (!app || !pagina) return;
  const T = cfg.ui;
  const t = (chave: string) => texto(T, chave);

  let quem: QuemEntrou | null = null;
  let perfil: Perfil | null = null;
  let modo: "login" | "signup" = "login";
  let trocandoSenha = false; // "recovery": a pessoa chegou pelo link de nova senha do e-mail
  let aviso: string | null = null; // "notice" (verde)
  let erro: string | null = null; // "flash" (amarelo)

  const caixaDeLogin = el("div");
  const lista = el("div");
  app.appendChild(caixaDeLogin);
  app.appendChild(lista);

  function mensagem(textoDaMensagem: string | null, ok = false): HTMLParagraphElement | null {
    return textoDaMensagem ? el("p", { attrs: { class: "c-msg" + (ok ? " ok" : ""), role: "status" }, texto: textoDaMensagem }) : null;
  }
  function campo(type: string, name: string, ph: string, extra: Record<string, string> = {}): HTMLInputElement {
    return el("input", { attrs: { type, name, placeholder: ph, "aria-label": ph, required: "required", ...extra } });
  }
  function botaoDeEnviar(rotulo: string): HTMLButtonElement {
    return el("button", { attrs: { type: "submit", class: "button" }, texto: rotulo });
  }
  /** Enter envia, Shift+Enter quebra linha. */
  function enterEnviaNo(campoDeTexto: HTMLTextAreaElement, form: HTMLFormElement): void {
    campoDeTexto.addEventListener("keydown", (e) => {
      if (!enterEnvia(e)) return;
      e.preventDefault();
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { cancelable: true }));
    });
  }
  function falhou(e: Erro): void {
    erro = mensagemDeErro(e, T);
    desenharLogin();
  }

  // ───────────── barra de comentário (fixa) + janela de login ─────────────

  let barra: HTMLFormElement | null = null;
  let linhaDeQuem: HTMLDivElement | null = null;
  let janela: HTMLDivElement | null = null;
  let focoAntes: Element | null = null;

  /** renderAuth(): a linha "Conectado como…", a janela de login e as mensagens. */
  function desenharLogin(): void {
    const b = barra ?? montarBarra();
    const linha = linhaDeQuem as HTMLDivElement;
    linha.textContent = "";
    if (quem) {
      linha.appendChild(el("span", { texto: `${t("c_hello")} ${nomeDeQuemEntrou(quem, perfil)}` }));
      linha.appendChild(
        el("button", {
          attrs: { type: "button", class: "c-link" },
          texto: t("c_logout"),
          ao: {
            click: () => {
              void sb.auth.signOut().then(() => {
                quem = null;
                perfil = null;
                void atualizar();
              });
            },
          },
        }),
      );
    }
    linha.hidden = !quem;
    if (quem && janela) fecharJanela();
    if (trocandoSenha) abrirJanela();
    else if (janela) preencherJanela();
    const mensagens = [mensagem(erro), mensagem(aviso, true)].filter((m): m is HTMLParagraphElement => m !== null);
    // como no comments.js: sem janela aberta, a mensagem vai logo acima da barra
    if (!janela || !janela.isConnected) for (const m of mensagens) linha.parentNode?.insertBefore(m, b);
    if (quem) erro = aviso = null;
  }

  function montarBarra(): HTMLFormElement {
    linhaDeQuem = el("div", { attrs: { class: "c-who" } });
    const b = el("form", { attrs: { class: "c-bar" } });
    const campoDeTexto = el("textarea", { attrs: { name: "body", rows: "1", maxlength: "2000", placeholder: t("c_write"), "aria-label": t("c_write") } });
    barra = b;
    b.appendChild(campoDeTexto);
    b.appendChild(el("button", { attrs: { type: "submit", class: "button" }, texto: t("c_post") }));
    enterEnviaNo(campoDeTexto, b);
    campoDeTexto.addEventListener("focus", () => {
      if (!quem) {
        campoDeTexto.blur();
        abrirJanela();
      }
    });
    campoDeTexto.addEventListener("input", () => {
      campoDeTexto.style.height = "auto";
      campoDeTexto.style.height = alturaDoCampo(campoDeTexto.scrollHeight);
    });
    b.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!quem) {
        abrirJanela();
        return;
      }
      const corpo = textoParaEnviar(campoDeTexto.value);
      if (corpo === null) return;
      void sb
        .from("comments")
        .insert({ page_id: pagina, body: corpo })
        .then((r) => {
          if (r.error) falhou(r.error);
          else {
            campoDeTexto.value = "";
            campoDeTexto.style.height = "";
            void carregarComentarios();
          }
        });
    });
    caixaDeLogin.before(linhaDeQuem, b);
    return b;
  }

  function abrirJanela(): void {
    if (janela && janela.isConnected) {
      preencherJanela();
      return;
    }
    focoAntes = document.activeElement;
    const j = el("div", { attrs: { class: "c-modal", role: "dialog", "aria-modal": "true", "aria-label": t("c_login_title") } });
    janela = j;
    j.addEventListener("mousedown", (e) => {
      if (e.target === j && !trocandoSenha) fecharJanela();
    });
    j.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !trocandoSenha) {
        fecharJanela();
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
    preencherJanela();
    j.querySelector("input")?.focus();
  }

  function fecharJanela(): void {
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

  function preencherJanela(): void {
    const j = janela;
    if (!j) return;
    j.textContent = "";
    const caixa = el("div", { attrs: { class: "c-dialog" } });
    if (!trocandoSenha) caixa.appendChild(el("button", { attrs: { type: "button", class: "c-x", "aria-label": t("c_close") }, texto: "×", ao: { click: fecharJanela } }));
    if (trocandoSenha) {
      const f = el("form");
      const senha = campo("password", "password", t("c_new_password"), { minlength: "6", autocomplete: "new-password" });
      f.appendChild(senha);
      f.appendChild(botaoDeEnviar(t("c_save_password")));
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        void sb.auth.updateUser({ password: senha.value }).then((r) => {
          if (r.error) erro = mensagemDeErro(r.error, T);
          else {
            trocandoSenha = false;
            aviso = t("c_password_changed");
          }
          void atualizar();
        });
      });
      caixa.appendChild(f);
    } else {
      caixa.appendChild(el("h3", { texto: t("c_login_to") }));
      caixa.appendChild(
        el(
          "button",
          {
            attrs: { type: "button", class: "c-google" },
            ao: {
              click: () => {
                void sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: enderecoDeVolta(location.href) } }).then((r) => {
                  if (r && r.error) {
                    erro = mensagemDeErro(r.error, T);
                    preencherJanela();
                  }
                });
              },
            },
          },
          [el("span", { attrs: { class: "c-g" }, texto: "G" }), el("span", { texto: t("c_google") })],
        ),
      );
      caixa.appendChild(el("div", { attrs: { class: "c-or" }, texto: t("c_or") }));
      caixa.appendChild(
        el("div", { attrs: { class: "c-tabs" } }, [
          el("button", { attrs: { type: "button", "aria-pressed": String(modo === "login") }, texto: t("c_login"), ao: { click: () => ((modo = "login"), preencherJanela()) } }),
          el("button", { attrs: { type: "button", "aria-pressed": String(modo === "signup") }, texto: t("c_signup"), ao: { click: () => ((modo = "signup"), preencherJanela()) } }),
        ]),
      );
      caixa.appendChild(modo === "login" ? formularioDeEntrar() : formularioDeCadastro());
    }
    for (const m of [mensagem(erro), mensagem(aviso, true)]) if (m) caixa.appendChild(m);
    erro = aviso = null;
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
            aviso = t("c_reset_sent");
            preencherJanela();
          });
        },
      },
    });
    for (const n of [email, senha, botaoDeEnviar(t("c_login")), esqueci]) f.appendChild(n);
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      void sb.auth.signInWithPassword({ email: email.value, password: senha.value }).then((r) => {
        if (r.error) {
          erro = mensagemDeErro(r.error, T);
          preencherJanela();
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
          if (r.error) erro = mensagemDeErro(r.error, T);
          else {
            aviso = t("c_check_email");
            modo = "login";
          }
          preencherJanela();
        });
    });
    return f;
  }

  /** O formulário de resposta (parentId) — o comments.js também o usa para comentário novo, que hoje só a barra faz. */
  function formularioDeResposta(parentId: Comentario["id"] | null, aoTerminar?: () => void): HTMLFormElement {
    const f = el("form", { attrs: { class: "c-reply-form" } });
    const campoDeTexto = el("textarea", { attrs: { name: "body", maxlength: "2000", required: "required", placeholder: t("c_write"), "aria-label": t("c_write") } });
    const linha = el("div", { attrs: { class: "c-row" } }, [botaoDeEnviar(parentId ? t("c_reply") : t("c_post"))]);
    if (parentId) linha.appendChild(el("button", { attrs: { type: "button", class: "c-link" }, texto: t("c_cancel"), ...(aoTerminar ? { ao: { click: aoTerminar } } : {}) }));
    f.appendChild(campoDeTexto);
    f.appendChild(linha);
    enterEnviaNo(campoDeTexto, f);
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const corpo = textoParaEnviar(campoDeTexto.value);
      if (corpo === null) return;
      const nova: { page_id: string; body: string; parent_id?: Comentario["id"] } = { page_id: pagina as string, body: corpo };
      if (parentId) nova.parent_id = parentId;
      void sb
        .from("comments")
        .insert(nova)
        .then((r) => {
          if (r.error) falhou(r.error);
          else {
            void carregarComentarios();
            if (aoTerminar) aoTerminar();
            else campoDeTexto.value = "";
          }
        });
    });
    return f;
  }

  // ───────────── lista de comentários ─────────────

  function carregarComentarios(): Promise<void> {
    lista.textContent = t("c_loading");
    const consulta = (colunas: string) => sb.from("comments").select(colunas).eq("page_id", pagina as string).order("created_at", { ascending: true });
    return Promise.resolve(consulta(COLUNAS_COM_EDICAO))
      .then((r) => (r.error ? consulta(COLUNAS) : r)) // coluna edited_at ainda não existe: segue sem ela
      .then((r) => {
        lista.textContent = "";
        if (r.error) {
          const m = mensagem(mensagemDeErro(r.error, T));
          if (m) lista.appendChild(m);
          return;
        }
        const linhas = (r.data ?? []) as unknown as Comentario[];
        if (!linhas.length) {
          lista.appendChild(el("p", { attrs: { class: "c-note" }, texto: t("c_none") }));
          return;
        }
        for (const { comentario, respostas } of montarArvore(linhas)) lista.appendChild(item(comentario, respostas, true));
      });
  }

  function comecarEdicao(c: Comentario, bloco: HTMLElement): void {
    const corpo = bloco.querySelector<HTMLElement>(":scope > .c-body");
    const acoes = bloco.querySelector<HTMLElement>(":scope > .c-actions");
    if (!corpo || !acoes || bloco.querySelector(":scope > .c-edit-form")) return;
    const f = el("form", { attrs: { class: "c-reply-form c-edit-form" } });
    const campoDeTexto = el("textarea", { attrs: { maxlength: "2000", required: "required", "aria-label": t("c_edit") } });
    campoDeTexto.value = c.body;
    const fechar = () => {
      f.remove();
      corpo.hidden = false;
      acoes.hidden = false;
    };
    f.appendChild(campoDeTexto);
    f.appendChild(el("div", { attrs: { class: "c-row" } }, [botaoDeEnviar(t("c_save")), el("button", { attrs: { type: "button", class: "c-link" }, texto: t("c_cancel"), ao: { click: fechar } })]));
    enterEnviaNo(campoDeTexto, f);
    campoDeTexto.addEventListener("keydown", (e) => {
      if (e.key === "Escape") fechar();
    });
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const novo = textoParaEnviar(campoDeTexto.value);
      if (novo === null) return;
      if (novo === c.body) {
        fechar();
        return;
      }
      void sb
        .from("comments")
        .update({ body: novo })
        .eq("id", c.id)
        .then((r) => {
          if (r.error) falhou(r.error);
          else void carregarComentarios();
        });
    });
    corpo.hidden = true;
    acoes.hidden = true;
    bloco.insertBefore(f, acoes);
    campoDeTexto.focus();
    campoDeTexto.setSelectionRange(campoDeTexto.value.length, campoDeTexto.value.length);
  }

  function item(c: Comentario, respostas: readonly Comentario[], raizDaConversa: boolean): HTMLDivElement {
    const autor = c.profiles ?? {};
    const cabeca = el("div", { attrs: { class: "c-head" } }, [
      autor.is_admin ? el("span", { attrs: { class: "c-badge" }, texto: "✦" }) : null,
      el("strong", { texto: nomeDoAutor(c) }),
      c.edited_at ? el("span", { attrs: { class: "c-edited", title: dataDaEdicao(c.edited_at, cfg.lang) }, texto: `(${t("c_edited")})` }) : null,
      el("time", { attrs: { datetime: String(c.created_at) }, texto: dataDoComentario(c.created_at, cfg.lang) }),
    ]);
    const acoes = el("div", { attrs: { class: "c-actions" } });
    const bloco = el("div", { attrs: { class: "c-item" } }, [cabeca, el("div", { attrs: { class: "c-body" }, texto: c.body }), acoes]);
    if (podeResponder(quem, raizDaConversa)) {
      acoes.appendChild(
        el("button", {
          attrs: { type: "button", class: "c-link" },
          texto: t("c_reply"),
          ao: {
            click: () => {
              const aberto = bloco.querySelector(":scope > .c-reply-form");
              if (aberto) {
                aberto.remove();
                return;
              }
              const fechar = () => bloco.querySelector(":scope > .c-reply-form")?.remove();
              bloco.insertBefore(formularioDeResposta(c.id, fechar), acoes.nextSibling);
            },
          },
        }),
      );
    }
    if (podeEditar(quem, c)) {
      acoes.appendChild(el("button", { attrs: { type: "button", class: "c-link" }, texto: t("c_edit"), ao: { click: () => comecarEdicao(c, bloco) } }));
    }
    if (podeApagar(quem, perfil, c)) {
      acoes.appendChild(
        el("button", {
          attrs: { type: "button", class: "c-link" },
          texto: t("c_delete"),
          ao: {
            click: () => {
              if (!window.confirm(t("c_confirm_delete"))) return;
              void sb
                .from("comments")
                .delete()
                .eq("id", c.id)
                .then((r) => {
                  if (r.error) falhou(r.error);
                  else void carregarComentarios();
                });
            },
          },
        }),
      );
    }
    if (respostas.length) {
      const caixaDeRespostas = el("div", { attrs: { class: "c-replies" } });
      for (const r of respostas) caixaDeRespostas.appendChild(item(r, [], false));
      bloco.appendChild(caixaDeRespostas);
    }
    return bloco;
  }

  // ───────────── sessão ─────────────

  /** refresh(): relê o perfil de quem entrou, redesenha a linha de login e recarrega a lista. */
  function atualizar(): Promise<void> {
    const antes = quem
      ? Promise.resolve(sb.from("profiles").select("display_name, is_admin").eq("id", quem.id).single()).then((r) => {
          perfil = (r.data as Perfil | null) || null;
        })
      : Promise.resolve();
    return antes.then(() => {
      desenharLogin();
      return carregarComentarios();
    });
  }

  sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === "PASSWORD_RECOVERY") trocandoSenha = true;
    const proximo = sessao?.user ?? null;
    // evita redesenhar à toa: mesma pessoa de antes (ou ninguém de novo)
    if ((proximo ? proximo.id : null) === (quem ? quem.id : null) && evento !== "PASSWORD_RECOVERY") return;
    quem = proximo ? { id: proximo.id, email: proximo.email } : null;
    if (!proximo) perfil = null;
    void atualizar();
  });
  void sb.auth.getSession().then((r) => {
    const s = r.data && r.data.session;
    if (s && !quem) quem = { id: s.user.id, email: s.user.email };
    void atualizar();
  });
}
