// A janela da conta (03/11/2026; redesenhada em 09/11/2026 pelos designs do autor "Profile Design.png", "Profile Design Icon Hover.png",
// "Profile Design Delete Hover.png", "Upload Profile Pic design.png", "Icon Edit Design.png" e "Delete Account Design.png"; só no site
// novo). Abre pelo nome em "Conectado como <nome>" da caixa de comentários (caixa.ts) e escurece a página atrás.
//
// O que tem:
//   - a foto (círculo; com o mouse, escurece e mostra o lápis): abre a tela de enviar uma imagem e a do recorte (./recorte.ts); a foto
//     vai para o balde `avatars` do Supabase e o perfil aponta para ela (set_my_avatar). Sem foto, uma runa sorteada (./foto.ts);
//   - o nome, grande, com o lápis ao lado: vira campo de texto (Enter salva, Esc desiste) → change_my_name;
//   - "Meus Favoritos": as capas das obras favoritadas (tabela favorites + /<idioma>/obras.json), cada uma leva à história;
//   - a lixeira (fica vermelha com o mouse): a tela "Opa! Calma aí!", com a lixeira animada engolindo runas, "Deletar Conta" (vermelho
//     com o mouse) e "Sair" (volta à janela). Deletar apaga as fotos da pessoa no balde e chama delete_my_account().
// As funções do banco só agem sobre QUEM CHAMA (migrações 20261103040000_conta.sql e 20261110000000_fotos_de_perfil.sql).
//
// Mesmo cuidado da caixa: todo elemento por el() de ./dom.ts (nome e títulos só como texto). Os três endereços que a janela usa (foto,
// capa, link da história) são montados/conferidos aqui (enderecoDaFoto em ./foto.ts, capaSegura e linkSeguro abaixo) e entram pela
// PROPRIEDADE do elemento, nunca por el(). Os textos são do site (não do config.json do autor): TEXTOS_DA_CONTA, em pt e en.
import type { SupabaseClient } from "@supabase/supabase-js";
import { animarEntrada, el } from "./dom";
import { circuloDaFoto, RUNAS_DA_FOTO } from "./foto";
import { nomeAleatorio, telaDeEnvio, type TextosDoRecorte } from "./recorte";

export const TEXTOS_DA_CONTA = {
  pt: {
    titulo: "Sua conta",
    abrir: "Abrir a janela da sua conta",
    trocarFoto: "Trocar a foto de perfil",
    trocarNome: "Trocar o nome",
    nome: "Nome que aparece nos comentários",
    salvo: "Nome salvo.",
    fotoSalva: "Foto salva.",
    tamanho: "O nome precisa ter de 2 a 30 caracteres.",
    invalido: "Esse nome tem caracteres que não podem ser usados.",
    reservado: "Esse nome é reservado. Escolha outro.",
    espera: "Você já trocou de nome há pouco. Dá para trocar de novo daqui a uma hora.",
    favoritos: "Meus Favoritos",
    semFavoritos: "Você ainda não favoritou nenhuma história. Clique na estrela de uma capa, na página de Histórias.",
    apagar: "Apagar conta",
    calma: "Opa! Calma aí!",
    aviso: [
      ["Deletar sua conta é uma decisão ", ""],
      ["permanente", "b"],
      ["! Ao fazer isso, você deletará sua ", ""],
      ["lista de favoritos", "v"],
      [", seus ", ""],
      ["marca-páginas", "v"],
      [" e ", ""],
      ["todos", "vb"],
      [" os seus comentários", "v"],
      [" no site. Tem certeza de que quer prosseguir?", ""],
    ],
    confirmar: "Deletar Conta",
    sair: "Sair",
    apagada: "Sua conta foi apagada.",
    fechar: "Fechar",
    erro: "Algo deu errado. Tente de novo.",
    semFotos: "As fotos de perfil ainda não estão ligadas no banco do site.",
    recorte: {
      envio: "Escolher uma imagem",
      envioDica: "Clique ou arraste uma imagem para cá.",
      palco: "Arraste a imagem para escolher o que fica dentro do círculo",
      menor: "Afastar",
      maior: "Aproximar",
      zoom: "Tamanho da imagem",
      salvar: "Salvar foto",
      cancelar: "Cancelar",
      naoEImagem: "Esse arquivo não é uma imagem que o navegador consiga abrir.",
      grandeDemais: "Essa imagem é grande demais (máximo de 20 MB).",
      semFormato: "Seu navegador não conseguiu preparar a foto. Tente outro navegador.",
    },
  },
  en: {
    titulo: "Your account",
    abrir: "Open your account window",
    trocarFoto: "Change your profile picture",
    trocarNome: "Change your name",
    nome: "Name shown on your comments",
    salvo: "Name saved.",
    fotoSalva: "Picture saved.",
    tamanho: "Your name must be 2 to 30 characters long.",
    invalido: "This name has characters that can't be used.",
    reservado: "This name is reserved. Please choose another one.",
    espera: "You changed your name recently. You can change it again in an hour.",
    favoritos: "My Favorites",
    semFavoritos: "You haven't favorited any story yet. Click the star on a cover, on the Stories page.",
    apagar: "Delete account",
    calma: "Whoa! Hold on!",
    aviso: [
      ["Deleting your account is a ", ""],
      ["permanent", "b"],
      [" decision! By doing so, you'll delete your ", ""],
      ["favorites list", "v"],
      [", your ", ""],
      ["bookmarks", "v"],
      [" and ", ""],
      ["all", "vb"],
      [" of your comments", "v"],
      [" on the site. Are you sure you want to continue?", ""],
    ],
    confirmar: "Delete Account",
    sair: "Leave",
    apagada: "Your account was deleted.",
    fechar: "Close",
    erro: "Something went wrong. Please try again.",
    semFotos: "Profile pictures aren't set up in the site's database yet.",
    recorte: {
      envio: "Choose an image",
      envioDica: "Click or drag an image here.",
      palco: "Drag the image to choose what stays inside the circle",
      menor: "Zoom out",
      maior: "Zoom in",
      zoom: "Image size",
      salvar: "Save picture",
      cancelar: "Cancel",
      naoEImagem: "This file isn't an image the browser can open.",
      grandeDemais: "This image is too big (20 MB maximum).",
      semFormato: "Your browser couldn't prepare the picture. Please try another browser.",
    },
  },
} as const;
export type TextosDaConta = (typeof TEXTOS_DA_CONTA)["pt"] | (typeof TEXTOS_DA_CONTA)["en"];

export function textosDaConta(lang: string): TextosDaConta {
  return lang.toLowerCase().startsWith("pt") ? TEXTOS_DA_CONTA.pt : TEXTOS_DA_CONTA.en;
}

// A MESMA regra de public.limpar_nome() (migração 20261103040000_conta.sql; o banco confere de novo e é quem decide):
/** Todo espaço Unicode (inclusive o sem quebra) vira espaço comum. */
const ESPACOS = /[\s   -   　]+/gu;
/** O que não se vê ou embaralha a linha do comentário: controle, largura zero, direção do texto, preenchimentos, BOM, tags. */
// eslint-disable-next-line no-control-regex
const INVISIVEIS = /[\u0000-\u001F\u007F-\u009F­͏؜ᅟᅠ឴឵᠎​‌‎‏‪-‮⁠-⁤⁦-⁯⠀ㅤ﻿ﾠ￹-￻\u{E0000}-\u{E007F}]/u;
/** Não contam como "visíveis" no mínimo de 2 (o ZWJ e os seletores de variação dos emojis). */
const NAO_CONTAM = /[ ‍︀-️]/gu;

/** O nome como o banco vai guardar: espaços Unicode viram um espaço comum, sem espaços nas pontas. */
export function nomeLimpo(valor: string): string {
  return valor.normalize("NFC").replace(ESPACOS, " ").trim();
}

/** O nome do autor fica reservado para o admin (o banco confere; aqui só para avisar antes). */
export function nomeReservado(valor: string): boolean {
  const esqueleto = nomeLimpo(valor).normalize("NFKD").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return esqueleto.includes("lusca") || esqueleto.includes("sharktopus");
}

/** Conferência antes de enviar (o banco confere de novo): null = pode enviar; senão, a mensagem. O admin pula a do nome reservado. */
export function problemaNoNome(valor: string, T: TextosDaConta, admin = false): string | null {
  // antes de limpar: o \s do JavaScript inclui o U+FEFF (BOM), que o banco recusa
  if (INVISIVEIS.test(valor.normalize("NFC"))) return T.invalido;
  const n = nomeLimpo(valor);
  if ([...n.replace(NAO_CONTAM, "")].length < 2 || n.length > 30) return T.tamanho;
  if (!admin && nomeReservado(n)) return T.reservado;
  return null;
}

/** A mensagem de um erro do banco, nos textos da janela. */
export function mensagemDaConta(erro: { message?: unknown } | null | undefined, T: TextosDaConta): string {
  const m = erro && typeof erro.message === "string" ? erro.message.toLowerCase() : "";
  if (m.includes("name length")) return T.tamanho;
  if (m.includes("invalid name")) return T.invalido;
  if (m.includes("name taken")) return T.reservado;
  if (m.includes("rate limit")) return T.espera;
  if (m.includes("set_my_avatar") || m.includes("bucket not found")) return T.semFotos;
  return T.erro;
}

/** Uma obra de /<idioma>/obras.json (src/pages/[lang]/obras.json.ts). */
export interface ObraDoIndice {
  id: string;
  titulo: string;
  capa: string;
  link: string | null;
}

/** Capa: só um arquivo do próprio site (caminho que começa com uma barra só, sem ":" nem "\"), em formato de imagem. */
export function capaSegura(valor: unknown): string | null {
  return typeof valor === "string" && /^\/(?![/\\])[^:\\?#]*\.(webp|avif|png|jpe?g|gif)$/i.test(valor) ? valor : null;
}
/** Link da história: uma página do próprio site em /en/ ou /pt/, ou um endereço https (link externo do cartão, como o do YouTube). */
export function linkSeguro(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  if (/^\/(en|pt)\/[a-z0-9/._-]*$/.test(valor) && !valor.includes("//") && !valor.includes("..")) return valor;
  if (/^https:\/\/[a-z0-9.-]+(\/[^\s"'<>\\]*)?$/i.test(valor)) return valor;
  return null;
}
/** As obras favoritas, na ordem dos favoritos (mais antiga primeiro), só as que existem no índice deste idioma. */
export function obrasFavoritas(ids: readonly string[], indice: readonly ObraDoIndice[]): ObraDoIndice[] {
  const porId = new Map(indice.map((o) => [o.id, o]));
  const saida: ObraDoIndice[] = [];
  for (const id of ids) {
    const o = porId.get(id);
    if (o && !saida.includes(o)) saida.push(o);
  }
  return saida;
}

export interface OpcoesDaConta {
  sb: SupabaseClient;
  lang: string;
  /** O id da conta (pasta das fotos, runa sorteada). */
  id: string;
  /** A URL do Supabase (window.HC.url): base do endereço público das fotos. */
  base: string;
  nome: string;
  /** O caminho da foto no balde (profiles.avatar_path), se houver. */
  foto: string | null | undefined;
  /** Quem é admin pode usar o nome do autor (o banco confere de novo). */
  admin: boolean;
  /** O nome ou a foto mudaram (a caixa relê o perfil e a lista). */
  aoMudar: () => void;
  /** A conta foi apagada (a caixa volta ao estado deslogado e mostra o aviso). */
  aoApagar: (aviso: string) => void;
}

/** Abre a janela (uma de cada vez). Devolve a função que fecha. */
export function abrirJanelaDaConta(o: OpcoesDaConta): () => void {
  document.querySelector(".c-modal.c-conta")?.remove();
  const T = textosDaConta(o.lang);
  const lang = o.lang.toLowerCase().startsWith("pt") ? "pt" : "en";
  const focoAntes = document.activeElement;
  const janela = el("div", { attrs: { class: "c-modal c-conta", role: "dialog", "aria-modal": "true", "aria-labelledby": "c-conta-titulo" } });
  const caixa = el("div", { attrs: { class: "c-dialog c-perfil" } });
  let nome = o.nome;
  let foto = o.foto ?? null;
  let ocupado = false;
  /** "perfil" = a janela; as outras telas voltam a ela com Esc. */
  let tela: "perfil" | "outra" = "perfil";

  function fechar(): void {
    janela.remove();
    document.documentElement.classList.remove("c-modal-open");
    // a linha "Conectado como" pode ter sido redesenhada (nome novo): o foco vai ao botão do nome de agora. Nunca à barra de comentário:
    // sem conta, focar a barra abre a janela de login
    const destino =
      focoAntes instanceof HTMLElement && focoAntes.isConnected ? focoAntes : document.querySelector<HTMLElement>(".c-who:not([hidden]) .c-me");
    destino?.focus({ preventScroll: true });
  }

  const msg = el("p", { attrs: { class: "c-msg", role: "status" } });
  msg.hidden = true;
  function avisar(texto: string, ok = false): void {
    msg.textContent = texto;
    msg.className = "c-msg" + (ok ? " ok" : "");
    msg.hidden = false;
  }
  function calar(): void {
    msg.hidden = true;
  }

  const botaoX = () =>
    el("button", { attrs: { type: "button", class: "c-perfil-botao c-perfil-x", "aria-label": T.fechar, title: T.fechar }, ao: { click: fechar } });

  // ── a janela ──
  function desenharPerfil(foco?: "foto" | "nome" | "lixo"): void {
    tela = "perfil";
    caixa.textContent = "";
    caixa.className = "c-dialog c-perfil";
    const botaoDaFoto = el(
      "button",
      { attrs: { type: "button", class: "c-perfil-foto", "aria-label": T.trocarFoto, title: T.trocarFoto }, ao: { click: abrirEnvio } },
      [circuloDaFoto(o.base, o.id, foto, "c-foto-grande"), el("span", { attrs: { class: "c-perfil-lapis", "aria-hidden": "true" } })],
    );
    const lixo = el("button", {
      attrs: { type: "button", class: "c-perfil-botao c-perfil-lixo", "aria-label": T.apagar, title: T.apagar },
      ao: { click: desenharApagar },
    });
    const linhaDoNome = el("div", { attrs: { class: "c-perfil-nome" } });
    desenharNome(linhaDoNome);
    const favoritos = el("div", { attrs: { class: "c-perfil-favs", role: "list", "aria-labelledby": "c-perfil-favs-titulo", "aria-busy": "true" } });
    caixa.append(
      el("div", { attrs: { class: "c-perfil-acoes" } }, [lixo, botaoX()]),
      el("div", { attrs: { class: "c-perfil-topo" } }, [botaoDaFoto, linhaDoNome]),
      el("h4", { attrs: { class: "c-perfil-favs-titulo", id: "c-perfil-favs-titulo" }, texto: T.favoritos }),
      favoritos,
      msg,
    );
    void carregarFavoritos(favoritos);
    if (foco === "foto") botaoDaFoto.focus();
    else if (foco === "lixo") lixo.focus();
    else if (foco === "nome") linhaDoNome.querySelector<HTMLElement>("button")?.focus();
    else linhaDoNome.querySelector<HTMLElement>("button")?.focus();
  }

  function desenharNome(linha: HTMLElement): void {
    linha.textContent = "";
    linha.append(
      el("h3", { attrs: { id: "c-conta-titulo" }, texto: nome }),
      el("button", {
        attrs: { type: "button", class: "c-perfil-lapis-nome", "aria-label": T.trocarNome, title: T.trocarNome },
        ao: { click: () => editarNome(linha) },
      }),
    );
  }

  function editarNome(linha: HTMLElement): void {
    calar();
    const campo = el("input", {
      attrs: { type: "text", name: "display_name", id: "c-conta-nome", maxlength: "30", minlength: "2", autocomplete: "nickname", required: "required", "aria-label": T.nome },
    });
    campo.value = nome;
    const form = el("form", { attrs: { class: "c-perfil-nome-form" } }, [
      campo,
      el("button", { attrs: { type: "submit", class: "c-perfil-lapis-nome c-salvando", "aria-label": T.nome, title: T.nome } }),
    ]);
    const desistir = () => {
      desenharNome(linha);
      linha.querySelector<HTMLElement>("button")?.focus();
    };
    campo.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        desistir();
      }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (ocupado) return;
      if (nomeLimpo(campo.value) === nome) {
        desistir();
        return;
      }
      const problema = problemaNoNome(campo.value, T, o.admin);
      if (problema) {
        avisar(problema);
        campo.focus();
        return;
      }
      ocupado = true;
      void o.sb.rpc("change_my_name", { novo: nomeLimpo(campo.value) }).then((r) => {
        ocupado = false;
        if (r.error) {
          avisar(mensagemDaConta(r.error, T));
          campo.focus();
          return;
        }
        nome = typeof r.data === "string" ? r.data : nomeLimpo(campo.value);
        desistir();
        avisar(T.salvo, true);
        o.aoMudar();
      });
    });
    linha.textContent = "";
    linha.appendChild(form);
    campo.focus();
    campo.select();
  }

  async function carregarFavoritos(lugar: HTMLElement): Promise<void> {
    let ids: string[] = [];
    let indice: ObraDoIndice[] = [];
    try {
      const [fav, resposta] = await Promise.all([
        o.sb.from("favorites").select("work_id, created_at").eq("user_id", o.id).order("created_at", { ascending: true }),
        fetch(`/${lang}/obras.json`, { credentials: "same-origin" }),
      ]);
      if (!fav.error && Array.isArray(fav.data)) ids = (fav.data as { work_id?: unknown }[]).map((f) => String(f.work_id ?? ""));
      const json = resposta.ok ? ((await resposta.json()) as { obras?: unknown }) : {};
      if (Array.isArray(json.obras)) indice = json.obras as ObraDoIndice[];
    } catch {
      /* sem favoritos na tela: o resto da janela funciona */
    }
    if (!lugar.isConnected) return;
    lugar.removeAttribute("aria-busy");
    const obras = obrasFavoritas(ids, indice);
    if (!obras.length) {
      lugar.appendChild(el("p", { attrs: { class: "c-perfil-vazio" }, texto: T.semFavoritos }));
      return;
    }
    for (const obra of obras) {
      const capa = capaSegura(obra.capa);
      const link = linkSeguro(obra.link);
      let imagem: HTMLImageElement | null = null;
      if (capa) {
        imagem = document.createElement("img");
        imagem.alt = "";
        imagem.loading = "lazy";
        imagem.decoding = "async";
        imagem.src = capa; // só um arquivo do próprio site (capaSegura)
      }
      const conteudo = [imagem, el("span", { attrs: { class: "c-perfil-fav-nome" }, texto: String(obra.titulo ?? "") })];
      const item = link ? el("a", { attrs: { class: "c-perfil-fav", role: "listitem" } }, conteudo) : el("span", { attrs: { class: "c-perfil-fav", role: "listitem" } }, conteudo);
      if (link && item instanceof HTMLAnchorElement) {
        item.href = link; // só /en/…, /pt/… ou https (linkSeguro)
        if (link.startsWith("https:")) item.rel = "noopener";
      }
      lugar.appendChild(item);
    }
  }

  // ── a foto ──
  const textosDoRecorte: TextosDoRecorte = T.recorte;
  function abrirEnvio(): void {
    calar();
    tela = "outra";
    const voltar = () => desenharPerfil("foto");
    telaDeEnvio({
      T: textosDoRecorte,
      caixa,
      aoVoltar: voltar,
      avisar: (texto) => {
        // a tela de envio/recorte não tem lugar para a mensagem: volta à janela e mostra lá
        desenharPerfil("foto");
        avisar(texto);
      },
      aoSalvar: salvarFoto,
    });
    caixa.prepend(botaoX());
  }

  async function salvarFoto(blob: Blob, extensao: "webp" | "jpg"): Promise<void> {
    const caminho = `${o.id}/${nomeAleatorio()}.${extensao}`;
    const balde = o.sb.storage.from("avatars");
    const envio = await balde.upload(caminho, blob, { contentType: blob.type, upsert: false, cacheControl: "31536000" });
    if (envio.error) {
      desenharPerfil("foto");
      avisar(mensagemDaConta(envio.error, T));
      return;
    }
    const r = await o.sb.rpc("set_my_avatar", { caminho });
    if (r.error) {
      await balde.remove([caminho]);
      desenharPerfil("foto");
      avisar(mensagemDaConta(r.error, T));
      return;
    }
    const antigo = typeof r.data === "string" ? r.data : null;
    if (antigo && antigo !== caminho) await balde.remove([antigo]);
    foto = caminho;
    desenharPerfil("foto");
    avisar(T.fotoSalva, true);
    o.aoMudar();
  }

  // ── apagar ──
  function desenharApagar(): void {
    calar();
    tela = "outra";
    caixa.textContent = "";
    caixa.className = "c-dialog c-perfil c-apagar";
    // três runas diferentes caem na lixeira (sorteadas a cada vez que a tela abre)
    const runas: string[] = [];
    while (runas.length < 3) {
      const r = RUNAS_DA_FOTO[Math.floor(Math.random() * RUNAS_DA_FOTO.length)] as string;
      if (!runas.includes(r)) runas.push(r);
    }
    const texto = el("p", { attrs: { class: "c-apagar-texto" } });
    for (const [pedaco, jeito] of T.aviso) {
      if (!jeito) texto.appendChild(document.createTextNode(pedaco));
      else {
        const span = el(jeito.includes("b") && !jeito.includes("v") ? "strong" : "span", { texto: pedaco });
        if (jeito.includes("v")) span.className = jeito.includes("b") ? "c-verde c-forte" : "c-verde";
        texto.appendChild(span);
      }
    }
    const sair = el("button", { attrs: { type: "button", class: "button c-apagar-sair" }, texto: T.sair, ao: { click: () => desenharPerfil("lixo") } });
    const confirmar = el("button", {
      attrs: { type: "button", class: "button c-apagar-confirmar" },
      texto: T.confirmar,
      ao: { click: () => void apagarConta(confirmar) },
    });
    caixa.append(
      el("h3", { attrs: { id: "c-conta-titulo", class: "c-apagar-titulo" }, texto: T.calma }),
      el("div", { attrs: { class: "c-lixeira", "aria-hidden": "true" } }, [
        ...runas.map((r, i) => el("span", { attrs: { class: `c-lixeira-runa c-lixeira-runa-${i + 1}` }, texto: r })),
        el("span", { attrs: { class: "c-lixeira-tampa" } }),
        el("span", { attrs: { class: "c-lixeira-corpo" } }),
      ]),
      texto,
      msg,
      el("div", { attrs: { class: "c-apagar-botoes" } }, [confirmar, sair]),
    );
    sair.focus();
  }

  async function apagarConta(botao: HTMLButtonElement): Promise<void> {
    if (ocupado) return;
    ocupado = true;
    botao.disabled = true;
    // as fotos da pessoa saem do balde antes da conta (depois, ela já não teria permissão para apagá-las)
    try {
      const balde = o.sb.storage.from("avatars");
      const lista = await balde.list(o.id, { limit: 20 });
      const nomes = Array.isArray(lista.data) ? lista.data.map((f) => `${o.id}/${f.name}`) : [];
      if (foto && !nomes.includes(foto)) nomes.push(foto);
      if (nomes.length) await balde.remove(nomes);
    } catch {
      /* sem a migração das fotos: não há o que apagar */
    }
    // 10/11/2026: as imagens que a pessoa anexou aos comentários também (balde comment-images, migração 20261110120000)
    try {
      const balde = o.sb.storage.from("comment-images");
      const lista = await balde.list(o.id, { limit: 1000 });
      const nomes = Array.isArray(lista.data) ? lista.data.map((f) => `${o.id}/${f.name}`) : [];
      for (let i = 0; i < nomes.length; i += 100) await balde.remove(nomes.slice(i, i + 100));
    } catch {
      /* sem a migração das imagens: não há o que apagar */
    }
    const r = await o.sb.rpc("delete_my_account");
    ocupado = false;
    botao.disabled = false;
    if (r.error) {
      avisar(mensagemDaConta(r.error, T));
      return;
    }
    // a conta (e as sessões dela) já não existem no servidor: só limpa a sessão deste navegador
    await o.sb.auth.signOut({ scope: "local" }).catch(() => undefined);
    fechar();
    o.aoApagar(T.apagada);
  }

  janela.appendChild(caixa);
  desenharPerfil();

  // fecha: ×, Esc, clique fora; Esc numa tela de dentro volta à janela; Tab fica preso dentro (como a janela de login)
  janela.addEventListener("mousedown", (e) => {
    if (e.target === janela) fechar();
  });
  janela.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (tela === "perfil") fechar();
      else desenharPerfil();
      return;
    }
    if (e.key !== "Tab") return;
    const focaveis = [...janela.querySelectorAll<HTMLElement>("button, input:not(.c-envio-campo), a[href], [tabindex='0']")].filter(
      (x) => !x.hidden && !(x as HTMLButtonElement).disabled,
    );
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
  animarEntrada(janela, caixa);
  // o foco: desenharPerfil() focou antes de a janela estar na página; foca de novo
  caixa.querySelector<HTMLElement>(".c-perfil-lapis-nome")?.focus();
  return fechar;
}
