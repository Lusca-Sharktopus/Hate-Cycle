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
//     preso dentro dela, o foco volta para onde estava; na troca de senha (link do e-mail) ela não fecha. Desde 05/11/2026 ela mora em
//     ../login/janela.ts (design novo do autor: Google, Twitter e Discord com o círculo mágico; a mesma janela abre pelos favoritos);
//   - entrar (147–162), esqueci a senha (151–154), criar conta com nome de usuário (164–179), nova senha (116–127);
//   - linha "Conectado como <nome>" + Sair (49–55);
//   - lista: "Carregando…", "Ainda não há comentários", comentários na ordem do banco com as respostas embaixo (200–216);
//   - cada comentário (241–275): selo para admin (🜄 desde 05/11; ✦ no comments.js), nome, "(editado)" com a data no title, data/hora no formato do idioma, texto;
//     Responder (só em comentário raiz, só conectado), Editar (só o próprio), Apagar (o próprio ou admin, com confirmação);
//   - responder (181–197) e editar (218–239: Esc cancela, texto igual não envia, cursor no fim);
//   - mensagens de erro e de aviso (22–28, 59–60, 142–143);
//   - sessão: entra/sai sem recarregar a página (277–296).
// Só aqui (03/11/2026, sem par no comments.js): o nome em "Conectado como <nome>" é um botão que abre a janela da conta (./conta.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { abrirJanelaDaConta, textosDaConta } from "./conta";
import { circuloDaFoto } from "./foto";
import { janelaDeLogin } from "../login/janela";
import { el } from "./dom";
import { montarEditor, textosDaMidia, type Editor } from "./editor";
import { imagensDoComentario, separarMidias } from "./formato";
import { corpoDoComentario } from "./midia";
import {
  COLUNAS,
  COLUNAS_COM_EDICAO,
  COLUNAS_COMPLETAS,
  COLUNAS_COM_FOTO,
  comentarioApagado,
  faltaColuna,
  alturaDoCampo,
  dataDaEdicao,
  dataDoComentario,
  enterEnvia,
  mensagemDeErro,
  montarArvore,
  nomeDeQuemEntrou,
  nomeDoAutor,
  podeApagar,
  podeEditar,
  podeResponder,
  texto,
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
  /** 10/11/2026: a chave do KLIPY (config.json → comments.klipy_api_key); null = sem o botão de GIF. */
  klipy: string | null;
}

/** Lê o window.HC; se faltar algo essencial, null (a caixa não aparece, como no comments.js). */
export function lerConfiguracao(hc: unknown): ConfiguracaoDosComentarios | null {
  if (hc === null || typeof hc !== "object") return null;
  const { url, key, lang, ui, klipy } = hc as Record<string, unknown>;
  if (typeof url !== "string" || url === "" || typeof key !== "string" || key === "") return null;
  return { url, key, lang: typeof lang === "string" ? lang : "en", ui: textosComPadrao(ui), klipy: typeof klipy === "string" && /^[A-Za-z0-9_-]{8,200}$/.test(klipy) ? klipy : null };
}

type Erro = { message?: unknown } | null | undefined;

/** Monta a caixa dentro de `raiz` (a <section class="hc-comments" data-page>) e liga tudo ao Supabase. */
export function iniciarComentarios(raiz: HTMLElement, cfg: ConfiguracaoDosComentarios, sb: SupabaseClient, erroDoLogin: string | null = null): void {
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
  let erro: string | null = erroDoLogin; // "flash" (amarelo); 05/11: começa com o erro do login com Google/Twitter/Discord, se voltou um

  const caixaDeLogin = el("div");
  const lista = el("div");
  app.appendChild(caixaDeLogin);
  app.appendChild(lista);

  function mensagem(textoDaMensagem: string | null, ok = false): HTMLParagraphElement | null {
    return textoDaMensagem ? el("p", { attrs: { class: "c-msg" + (ok ? " ok" : ""), role: "status" }, texto: textoDaMensagem }) : null;
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
  /** 10/11/2026: a barra de ferramentas (estilos, emojis, GIFs, imagens) de um campo de texto (./editor.ts). */
  const textosDoCorpo = textosDaMidia(cfg.lang);
  function editorDo(campoDeTexto: HTMLTextAreaElement, midias?: ReturnType<typeof separarMidias>["midias"]): Editor {
    return montarEditor(campoDeTexto, {
      sb,
      base: cfg.url,
      lang: cfg.lang,
      klipy: cfg.klipy,
      quem: () => (quem ? quem.id : null),
      pedirLogin: () => abrirJanela(),
      avisar: (textoDoAviso) => {
        erro = textoDoAviso;
        desenharLogin();
      },
      ...(midias ? { midias } : {}),
    });
  }
  /** Apaga do balde as imagens que saíram de um comentário (apagado, ou tiradas na edição). Falha = o arquivo só fica lá. */
  function apagarImagens(caminhos: readonly string[]): void {
    if (caminhos.length) void Promise.resolve(sb.storage.from("comment-images").remove([...caminhos])).catch(() => undefined);
  }
  /** Envia um formulário com editor: sobe as imagens, grava, e desfaz o envio das imagens se o banco recusar. */
  function enviarComEditor(editor: Editor, gravar: (corpo: string) => PromiseLike<{ error: Erro }>, aoGravar: () => void, igual?: (corpo: string) => boolean): void {
    void editor.preparar().then((pronto) => {
      if (!pronto) return;
      if (igual && igual(pronto.corpo)) return; // texto igual: só fecha (quem fecha é o próprio `igual`), sem pedido ao banco
      void Promise.resolve(gravar(pronto.corpo)).then((r) => {
        if (r.error) {
          editor.desfazer(pronto.enviadas);
          falhou(r.error);
        } else {
          apagarImagens(editor.terminar());
          aoGravar();
        }
      });
    });
  }

  // ───────────── barra de comentário (fixa) + janela de login ─────────────

  let barra: HTMLFormElement | null = null;
  let linhaDeQuem: HTMLDivElement | null = null;
  // a janela de login mora em ../login/janela.ts (05/11/2026, design novo do autor) e lê e escreve as variáveis daqui
  const login = janelaDeLogin({
    sb,
    T,
    lang: cfg.lang,
    titulo: t("c_login_to"),
    estado: {
      get modo() {
        return modo;
      },
      set modo(v) {
        modo = v;
      },
      get trocandoSenha() {
        return trocandoSenha;
      },
      set trocandoSenha(v) {
        trocandoSenha = v;
      },
      get erro() {
        return erro;
      },
      set erro(v) {
        erro = v;
      },
      get aviso() {
        return aviso;
      },
      set aviso(v) {
        aviso = v;
      },
    },
    depoisDaSenhaNova: () => void atualizar(),
  });
  const abrirJanela = login.abrir;

  /** renderAuth(): a linha "Conectado como…", a janela de login e as mensagens. */
  function desenharLogin(): void {
    const b = barra ?? montarBarra();
    const linha = linhaDeQuem as HTMLDivElement;
    linha.textContent = "";
    if (quem) {
      // o nome abre a janela da conta (./conta.ts); o resto da linha é o mesmo do comments.js
      const eu = quem;
      const nome = nomeDeQuemEntrou(eu, perfil);
      linha.appendChild(
        el("span", { texto: `${t("c_hello")} ` }, [
          el("button", {
            attrs: { type: "button", class: "c-me", title: textosDaConta(cfg.lang).abrir, "aria-haspopup": "dialog" },
            texto: nome,
            ao: {
              click: () => {
                abrirJanelaDaConta({
                  sb,
                  lang: cfg.lang,
                  id: eu.id,
                  base: cfg.url,
                  nome: (perfil && perfil.display_name) || "",
                  foto: perfil && perfil.avatar_path,
                  admin: Boolean(perfil && perfil.is_admin),
                  // 10/11: o aviso chega à própria caixa (que redesenha, logo abaixo) e ao botão da conta no cabeçalho (src/scripts/conta/)
                  aoMudar: () => void document.dispatchEvent(new CustomEvent("hc-conta-mudou")),
                  aoApagar: (texto) => {
                    quem = null;
                    perfil = null;
                    aviso = texto;
                    void atualizar();
                  },
                });
              },
            },
          }),
        ]),
      );
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
    if (quem && login.aberta()) login.fechar();
    if (trocandoSenha) abrirJanela();
    else if (login.aberta()) login.redesenhar();
    const mensagens = [mensagem(erro), mensagem(aviso, true)].filter((m): m is HTMLParagraphElement => m !== null);
    // como no comments.js: sem janela aberta, a mensagem vai logo acima da barra
    if (!login.aberta()) for (const m of mensagens) linha.parentNode?.insertBefore(m, b);
    if (quem) erro = aviso = null;
  }

  function montarBarra(): HTMLFormElement {
    linhaDeQuem = el("div", { attrs: { class: "c-who" } });
    const b = el("form", { attrs: { class: "c-bar" } });
    const campoDeTexto = el("textarea", { attrs: { name: "body", rows: "1", maxlength: "2000", placeholder: t("c_write"), "aria-label": t("c_write") } });
    barra = b;
    b.appendChild(campoDeTexto);
    b.appendChild(el("button", { attrs: { type: "submit", class: "button" }, texto: t("c_post") }));
    const editor = editorDo(campoDeTexto);
    b.append(editor.barra, editor.bandeja);
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
      enviarComEditor(
        editor,
        (corpo) => sb.from("comments").insert({ page_id: pagina, body: corpo }),
        () => {
          campoDeTexto.value = "";
          campoDeTexto.style.height = "";
          void carregarComentarios();
        },
      );
    });
    caixaDeLogin.before(linhaDeQuem, b);
    return b;
  }

  /** O formulário de resposta (parentId) — o comments.js também o usa para comentário novo, que hoje só a barra faz. */
  function formularioDeResposta(parentId: Comentario["id"] | null, aoTerminar?: () => void): HTMLFormElement {
    const f = el("form", { attrs: { class: "c-reply-form" } });
    const campoDeTexto = el("textarea", { attrs: { name: "body", maxlength: "2000", placeholder: t("c_write"), "aria-label": t("c_write") } });
    const linha = el("div", { attrs: { class: "c-row" } }, [botaoDeEnviar(parentId ? t("c_reply") : t("c_post"))]);
    if (parentId) linha.appendChild(el("button", { attrs: { type: "button", class: "c-link" }, texto: t("c_cancel"), ...(aoTerminar ? { ao: { click: aoTerminar } } : {}) }));
    const editor = editorDo(campoDeTexto);
    f.appendChild(campoDeTexto);
    f.append(editor.barra, editor.bandeja);
    f.appendChild(linha);
    enterEnviaNo(campoDeTexto, f);
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      enviarComEditor(
        editor,
        (corpo) => {
          const nova: { page_id: string; body: string; parent_id?: Comentario["id"] } = { page_id: pagina as string, body: corpo };
          if (parentId) nova.parent_id = parentId;
          return sb.from("comments").insert(nova);
        },
        () => {
          void carregarComentarios();
          if (aoTerminar) aoTerminar();
          else campoDeTexto.value = "";
        },
      );
    });
    return f;
  }

  // ───────────── lista de comentários ─────────────

  function carregarComentarios(): Promise<void> {
    lista.textContent = t("c_loading");
    const consulta = (colunas: string) => sb.from("comments").select(colunas).eq("page_id", pagina as string).order("created_at", { ascending: true });
    return Promise.resolve(consulta(COLUNAS_COM_FOTO))
      .then((r) => (faltaColuna(r.error) ? consulta(COLUNAS_COMPLETAS) : r)) // 09/11: coluna avatar_path ainda não existe (migração das fotos)
      .then((r) => (faltaColuna(r.error) ? consulta(COLUNAS_COM_EDICAO) : r)) // coluna deleted_at ainda não existe (migração de 03/11 não rodada)
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
    const campoDeTexto = el("textarea", { attrs: { maxlength: "2000", "aria-label": t("c_edit") } });
    // 10/11/2026: os GIFs e imagens do comentário vão para a bandeja; o campo fica só com o texto
    const separado = separarMidias(c.body);
    campoDeTexto.value = separado.texto;
    const editor = editorDo(campoDeTexto, separado.midias);
    const fechar = () => {
      f.remove();
      corpo.hidden = false;
      acoes.hidden = false;
    };
    f.appendChild(campoDeTexto);
    f.append(editor.barra, editor.bandeja);
    f.appendChild(el("div", { attrs: { class: "c-row" } }, [botaoDeEnviar(t("c_save")), el("button", { attrs: { type: "button", class: "c-link" }, texto: t("c_cancel"), ao: { click: fechar } })]));
    enterEnviaNo(campoDeTexto, f);
    campoDeTexto.addEventListener("keydown", (e) => {
      if (e.key === "Escape") fechar();
    });
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      enviarComEditor(
        editor,
        (novo) => sb.from("comments").update({ body: novo }).eq("id", c.id),
        () => void carregarComentarios(),
        (novo) => {
          if (novo !== c.body) return false;
          fechar();
          return true;
        },
      );
    });
    corpo.hidden = true;
    acoes.hidden = true;
    bloco.insertBefore(f, acoes);
    campoDeTexto.focus();
    campoDeTexto.setSelectionRange(campoDeTexto.value.length, campoDeTexto.value.length);
  }

  function item(c: Comentario, respostas: readonly Comentario[], raizDaConversa: boolean): HTMLDivElement {
    if (comentarioApagado(c)) {
      // apagado tendo respostas: só a data, "[comentário apagado]" e as respostas; nenhum botão
      const apagado = el("div", { attrs: { class: "c-item" } }, [
        el("div", { attrs: { class: "c-head" } }, [el("time", { attrs: { datetime: String(c.created_at) }, texto: dataDoComentario(c.created_at, cfg.lang) })]),
        el("div", { attrs: { class: "c-body c-deleted" }, texto: t("c_deleted") }),
      ]);
      if (respostas.length) {
        const caixaDeRespostas = el("div", { attrs: { class: "c-replies" } });
        for (const r of respostas) caixaDeRespostas.appendChild(item(r, [], false));
        apagado.appendChild(caixaDeRespostas);
      }
      return apagado;
    }
    const autor = c.profiles ?? {};
    const cabeca = el("div", { attrs: { class: "c-head" } }, [
      // 05/11/2026 (pedido do autor): o selo da conta de ADM é 🜄 (no comments.js do site antigo continua ✦)
      // 09/11/2026 (pedido do autor): a foto de perfil (ou a runa de quem não tem foto), antes do nome (./foto.ts)
      c.user_id ? circuloDaFoto(cfg.url, c.user_id, autor.avatar_path) : null,
      autor.is_admin ? el("span", { attrs: { class: "c-badge" }, texto: "🜄" }) : null,
      el("strong", { texto: nomeDoAutor(c) }),
      c.edited_at ? el("span", { attrs: { class: "c-edited", title: dataDaEdicao(c.edited_at, cfg.lang) }, texto: `(${t("c_edited")})` }) : null,
      el("time", { attrs: { datetime: String(c.created_at) }, texto: dataDoComentario(c.created_at, cfg.lang) }),
    ]);
    const acoes = el("div", { attrs: { class: "c-actions" } });
    const bloco = el("div", { attrs: { class: "c-item" } }, [cabeca, corpoDoComentario(c.body, cfg.url, textosDoCorpo), acoes]);
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
                  else {
                    apagarImagens(imagensDoComentario(c.body)); // 10/11: as imagens enviadas saem do balde junto
                    void carregarComentarios();
                  }
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
      ? Promise.resolve(sb.from("profiles").select("display_name, is_admin, avatar_path").eq("id", quem.id).single())
          // 09/11: sem a migração das fotos, a coluna avatar_path não existe: relê sem ela
          .then((r) => (faltaColuna(r.error) ? sb.from("profiles").select("display_name, is_admin").eq("id", (quem as QuemEntrou).id).single() : r))
          .then((r) => {
            perfil = (r.data as Perfil | null) || null;
          })
      : Promise.resolve();
    return antes.then(() => {
      desenharLogin();
      return carregarComentarios();
    });
  }

  // 10/11: o nome ou a foto mudaram pela janela aberta no botão do cabeçalho (src/scripts/conta/): redesenha com o perfil novo
  document.addEventListener("hc-conta-mudou", () => void atualizar());
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
