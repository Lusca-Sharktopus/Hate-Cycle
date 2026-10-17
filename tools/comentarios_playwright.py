#!/usr/bin/env python3
"""Teste da caixa de COMENTÁRIOS no navegador, Astro × Python, com um Supabase FALSO (T15).

O site Python usa o static/comments.js + o supabase-js do jsDelivr; o Astro, o script empacotado de
src/scripts/comentarios/ (com o @supabase/supabase-js de versão fixa). Os dois rodam o MESMO roteiro contra o MESMO
Supabase de mentira, e depois de cada passo o teste compara:
  - a caixa inteira (.hc-comments) e a janela de login (.c-modal): tags, atributos, texto, `hidden`, o que está escrito
    em cada campo; quem está com o foco; se a página está travada (c-modal-open);
  - os pedidos feitos ao Supabase (método, caminho, parâmetros, corpo) — o mesmo banco recebe exatamente o mesmo;
  - a caixa de confirmação de "Apagar" (texto) e para onde o botão do Google leva.
Além de "iguais", cada passo confere o que DEVE acontecer (ex.: depois de publicar, o comentário aparece; Shift+Enter não
envia), para o teste não passar com os dois sites quebrados do mesmo jeito.

O Supabase falso responde no nível da REDE (as rotas do Playwright), como o de verdade: /auth/v1/… (entrar, criar conta,
esqueci a senha, sair, nova senha, Google) e /rest/v1/… (comments e profiles, com as regras do banco: só quem entrou
comenta, um nível de resposta, editar só o próprio, apagar o próprio ou admin). Nada sai da máquina: tudo que não é
localhost nem o Supabase falso é bloqueado. O window.HC da página é trocado, antes de a página rodar, por um endereço e
uma chave de MENTIRA (https://supabase-falso.test e __CHAVE_FALSA__): as chaves do config.json nunca são usadas.
No site Python, o pedido do supabase-js ao jsDelivr é respondido com o arquivo da MESMA versão instalada em node_modules/
(dist/umd/supabase.js), para os dois sites usarem a mesma biblioteca.

Comportamentos cobertos (o roteiro): carregar ("Carregando…" → lista), conversa com respostas, lista vazia ("Ainda não
há comentários"), erro ao carregar, banco sem a coluna edited_at (o recuo), estado deslogado (focar a barra ou clicar
Publicar abre a janela), janela de login (Esc, clique fora, X, Tab preso dentro dela, foco que volta, abas
Entrar/Criar conta), criar conta (aviso de confirmar o e-mail; e-mail repetido = erro), esqueci a senha (sem e-mail
foca o campo; com e-mail, aviso), senha errada, e-mail não confirmado, Google (para onde vai), entrar, "Conectado como",
recarregar a página e continuar conectado, comentar (Enter envia, Shift+Enter quebra linha, só espaços não envia),
responder (abre/fecha, Cancelar, Enter/Shift+Enter), editar (Esc cancela, texto igual não envia, "(editado)" com a data no
title), apagar (cancelar e confirmar), selo ✦ do admin e admin apagando o comentário de outra pessoa, erro do servidor
(limite de 10 s → "Calma!", erro qualquer → "Algo deu errado (…)"), sair, troca de senha pelo link do e-mail (a janela
não fecha com Esc), datas no formato do idioma (pt e en) e INJEÇÃO DE HTML: comentário e nome de usuário com
<img onerror>, <script> e <svg onload> (vindos do banco, publicados pela barra, numa resposta, numa edição e no cadastro)
aparecem como texto e não rodam nada.

Como usar (cada servidor sob timeout; nunca pkill):
  python3 -c "import build as b; from pathlib import Path; b.BASE=''; b.OUT=Path('<pasta do site Python>'); b.build()"
  timeout 900 python3 -m http.server 8791 -d <pasta do site Python> &
  pnpm build && timeout 900 python3 -m http.server 8792 -d dist &
  python3 tools/comentarios_playwright.py --python 8791 --astro 8792 [--fotos <pasta no scratchpad>]

--fotos tira as capturas da caixa (deslogado, conectado com comentários e respostas, janela aberta) de uma notícia e de um
capítulo, a 1100 px e 390 px, nos dois sites, e uma imagem lado a lado (Python | Astro) de cada.
Sai com código 0 se tudo for idêntico e certo, 1 se houver qualquer diferença ou falha (e imprime qual).
Só a biblioteca Playwright do Python (já instalada no sandbox; não rode `playwright install`).
"""
import argparse
import base64
import copy
import json
import pathlib
import re
import sys
import time
import urllib.parse

from playwright.sync_api import sync_playwright

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SUPABASE_JS_UMD = RAIZ / "node_modules" / "@supabase" / "supabase-js" / "dist" / "umd" / "supabase.js"
CDN_DO_PYTHON = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
FALSO = "https://supabase-falso.test"
CHAVE_FALSA = "__CHAVE_FALSA__"

NOTICIA = "/pt/news/2023-08-18-orcs/"
CAPITULO = "/pt/works/firestriker/01/"
NOTICIA_EN = "/en/news/2023-08-18-orcs/"

# Ataques de injeção de HTML: se algum virar HTML, window.__xss deixa de ser null (ou aparece um <img>/<svg>/<script>).
ATAQUE_COMENTARIO = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'
ATAQUE_NOME = '<img src=y onerror=window.__xss=3>'
ATAQUE_BARRA = '<svg onload="window.__xss=5"></svg><b>negrito?</b>'
ATAQUE_RESPOSTA = '"><img src=z onerror=window.__xss=6>'
ATAQUE_EDICAO = '<iframe srcdoc="<script>parent.__xss=7</script>"></iframe>'
ATAQUE_CADASTRO = '<img src=w onerror=__xss=8>'   # cabe nos 30 caracteres do campo de nome

# Troca o window.HC da página (URL e chave do config.json) pelos de mentira ANTES de qualquer script da página ler.
TROCA_O_HC = """(() => {
  try { sessionStorage.setItem('hc-intro', '1'); } catch (e) {}
  let hc;
  Object.defineProperty(window, 'HC', { configurable: true, get() { return hc; },
    set(v) { if (v && typeof v === 'object') { v.url = %s; v.key = %s; } hc = v; } });
})();""" % (json.dumps(FALSO), json.dumps(CHAVE_FALSA))

# O retrato da caixa depois de cada passo (roda no navegador).
RETRATO = """() => {
  const ser = (n) => {
    if (!n) return null;
    if (n.nodeType === 3) return n.data;
    if (n.nodeType !== 1) return null;
    const a = {}; for (const x of Array.from(n.attributes).sort((p, q) => p.name < q.name ? -1 : 1)) a[x.name] = x.value;
    const o = { t: n.tagName.toLowerCase(), a };
    if (n.hidden) o.hidden = true;
    if (n.tagName === 'TEXTAREA' || n.tagName === 'INPUT') o.v = n.value;
    o.c = Array.from(n.childNodes).map(ser).filter((x) => x !== null && x !== '');
    return o;
  };
  const j = document.querySelectorAll('.c-modal');
  const f = document.activeElement;
  return {
    caixa: ser(document.querySelector('.hc-comments')),
    janela: j.length ? ser(j[0]) : null,
    janelas: j.length,
    travada: document.documentElement.classList.contains('c-modal-open'),
    foco: f && f !== document.body ? `${f.tagName.toLowerCase()}.${f.className}[${f.getAttribute('name') || ''}]${(f.textContent || '').slice(0, 40)}` : null,
    xss: window.__xss === undefined ? null : window.__xss,
    elementosPerigosos: document.querySelectorAll('.hc-comments img, .hc-comments svg, .hc-comments iframe, .hc-comments b, .hc-comments script, .c-modal img').length,
  };
}"""


def b64url(dados):
    return base64.urlsafe_b64encode(json.dumps(dados).encode()).rstrip(b"=").decode()


class SupabaseFalso:
    """Um Supabase de mentira: Auth (GoTrue) e banco (PostgREST) com as mesmas regras do supabase-setup.sql."""

    def __init__(self, pagina_id, comentarios=True):
        self.pagina = pagina_id
        self.relogio = 0
        self.log = []
        self.falhar_insert = None   # None | "rate" | "geral"
        self.falhar_lista = False
        self.sem_edited_at = False
        self.contas = {
            "eu@exemplo.test": {"id": "u-eu", "senha": "senha-certa", "nome": "Eu Mesma", "admin": False, "confirmada": True},
            "admin@exemplo.test": {"id": "u-admin", "senha": "senha-do-admin", "nome": "Lusca (admin)", "admin": True, "confirmada": True},
            "leitora@exemplo.test": {"id": "u-leitora", "senha": "x", "nome": "leitora", "admin": False, "confirmada": True},
            "ataque@exemplo.test": {"id": "u-ataque", "senha": "x", "nome": ATAQUE_NOME, "admin": False, "confirmada": True},
        }
        self.proximo_id = 1
        self.linhas = []
        if comentarios:
            self._semear("u-leitora", "Primeiro comentário.\nCom duas linhas.", None, "2026-10-01T12:00:00+00:00")
            self._semear("u-admin", "Resposta do admin, editada.", 1, "2026-10-01T13:30:00+00:00", editado="2026-10-02T09:15:00+00:00")
            self._semear("u-ataque", ATAQUE_COMENTARIO, None, "2026-10-03T08:00:00+00:00")
            self._semear("u-eu", "Um comentário meu.", None, "2026-10-04T20:45:00+00:00")
            self._semear("u-leitora", "Resposta da leitora ao comentário do ataque.", 3, "2026-10-05T10:00:00+00:00")
            self.linhas.append({"id": 99, "page_id": "outra/pagina", "user_id": "u-leitora", "parent_id": None, "body": "de outra página", "created_at": "2026-10-01T00:00:00+00:00", "edited_at": None})

    # ── dados ──
    def _semear(self, quem, corpo, pai, quando, editado=None):
        self.linhas.append({"id": self.proximo_id, "page_id": self.pagina, "user_id": quem, "parent_id": pai, "body": corpo, "created_at": quando, "edited_at": editado})
        self.proximo_id += 1

    def agora(self):
        """Um relógio que anda 1 minuto por escrita: as datas saem iguais nos dois sites."""
        self.relogio += 1
        return f"2026-10-10T12:{self.relogio:02d}:00+00:00"

    def conta_por_id(self, uid):
        return next((c for c in self.contas.values() if c["id"] == uid), None)

    def usuario(self, email):
        c = self.contas[email]
        return {"id": c["id"], "aud": "authenticated", "role": "authenticated", "email": email, "email_confirmed_at": "2026-09-01T00:00:00Z" if c["confirmada"] else None,
                "phone": "", "app_metadata": {"provider": "email", "providers": ["email"]}, "user_metadata": {"display_name": c["nome"]}, "identities": [],
                "created_at": "2026-09-01T00:00:00Z", "updated_at": "2026-09-01T00:00:00Z", "is_anonymous": False}

    def sessao(self, email):
        uid = self.contas[email]["id"]
        exp = int(time.time()) + 3600
        token = f"{b64url({'alg': 'HS256', 'typ': 'JWT'})}.{b64url({'sub': uid, 'email': email, 'role': 'authenticated', 'aud': 'authenticated', 'exp': exp})}.assinatura-falsa"
        return {"access_token": token, "token_type": "bearer", "expires_in": 3600, "expires_at": exp, "refresh_token": f"r-{uid}", "user": self.usuario(email)}

    def quem_pede(self, req):
        """O id de quem está conectado (pelo token do cabeçalho Authorization), ou None (só a chave anon)."""
        auth = req.headers.get("authorization", "")
        partes = auth.removeprefix("Bearer ").split(".")
        if len(partes) != 3:
            return None
        try:
            return json.loads(base64.urlsafe_b64decode(partes[1] + "==")).get("sub")
        except ValueError:
            return None

    def com_perfil(self, linha, colunas):
        conta = self.conta_por_id(linha["user_id"])
        saida = {k: linha[k] for k in ["id", "body", "created_at", "edited_at", "user_id", "parent_id"] if k in colunas}
        saida["profiles"] = {"display_name": conta["nome"], "is_admin": conta["admin"]} if conta else None
        return saida

    # ── a rota ──
    def responder(self, route):
        req = route.request
        u = urllib.parse.urlsplit(req.url)
        q = urllib.parse.parse_qs(u.query, keep_blank_values=True)
        cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
                "access-control-expose-headers": "content-range, x-supabase-api-version"}
        if req.method == "OPTIONS":
            return route.fulfill(status=204, headers=cors)
        corpo = None
        if req.post_data:
            try:
                corpo = json.loads(req.post_data)
            except ValueError:
                corpo = req.post_data
        if isinstance(corpo, dict):
            corpo = {k: v for k, v in corpo.items() if k != "gotrue_meta_security" and k != "code_challenge" and k != "code_challenge_method"}
        # a porta do servidor local (8791 × 8792) aparece nos endereços de volta: troca por PORTA para comparar os dois sites
        self.log.append(json.loads(re.sub(r"localhost:\d+", "localhost:PORTA", json.dumps({"metodo": req.method, "caminho": u.path, "q": {k: v for k, v in sorted(q.items())}, "corpo": corpo,
                                                                                         "unico": "vnd.pgrst.object" in req.headers.get("accept", "")}))))
        status, dados = self.tratar(req, u.path, q, corpo)
        texto = "" if dados is None else json.dumps(dados)
        return route.fulfill(status=status, headers={**cors, "content-type": "application/json"}, body=texto)

    def tratar(self, req, caminho, q, corpo):
        um = lambda k: (q.get(k) or [""])[0]
        # ─ Auth ─
        if caminho == "/auth/v1/token" and um("grant_type") == "password":
            c = self.contas.get(corpo.get("email", ""))
            if not c or c["senha"] != corpo.get("password"):
                return 400, {"code": 400, "error_code": "invalid_credentials", "msg": "Invalid login credentials"}
            if not c["confirmada"]:
                return 400, {"code": 400, "error_code": "email_not_confirmed", "msg": "Email not confirmed"}
            return 200, self.sessao(corpo["email"])
        if caminho == "/auth/v1/token" and um("grant_type") == "refresh_token":
            uid = corpo.get("refresh_token", "").removeprefix("r-")
            email = next(e for e, c in self.contas.items() if c["id"] == uid)
            return 200, self.sessao(email)
        if caminho == "/auth/v1/signup":
            email = corpo.get("email", "")
            if email in self.contas:
                return 422, {"code": 422, "error_code": "user_already_exists", "msg": "User already registered"}
            nome = ((corpo.get("data") or {}).get("display_name") or "").strip()[:30] or "user-novo00"
            self.contas[email] = {"id": f"u-{len(self.contas)}", "senha": corpo.get("password"), "nome": nome, "admin": False, "confirmada": False}
            return 200, self.usuario(email)
        if caminho == "/auth/v1/recover":
            return 200, {}
        if caminho == "/auth/v1/logout":
            return 204, None
        if caminho == "/auth/v1/user":
            uid = self.quem_pede(req)
            email = next((e for e, c in self.contas.items() if c["id"] == uid), None)
            if not email:
                return 401, {"code": 401, "error_code": "bad_jwt", "msg": "invalid JWT"}
            if req.method == "PUT" and corpo and corpo.get("password"):
                self.contas[email]["senha"] = corpo["password"]
            return 200, self.usuario(email)
        # ─ banco ─
        if caminho == "/rest/v1/profiles" and req.method == "GET":
            uid = um("id").removeprefix("eq.")
            c = self.conta_por_id(uid)
            if not c:
                return 406, {"code": "PGRST116", "message": "JSON object requested, multiple (or no) rows returned"}
            return 200, {"display_name": c["nome"], "is_admin": c["admin"]}
        if caminho == "/rest/v1/comments":
            quem = self.quem_pede(req)
            conta = self.conta_por_id(quem) if quem else None
            if req.method == "GET":
                if self.falhar_lista:
                    return 500, {"code": "XX000", "message": "falha simulada ao ler"}
                colunas = um("select")
                if self.sem_edited_at and "edited_at" in colunas:
                    return 400, {"code": "42703", "details": None, "hint": None, "message": "column comments.edited_at does not exist"}
                pagina = um("page_id").removeprefix("eq.")
                linhas = sorted([l for l in self.linhas if l["page_id"] == pagina], key=lambda l: l["created_at"])
                return 200, [self.com_perfil(l, colunas) for l in linhas]
            if req.method == "POST":
                if not conta:
                    return 401, {"code": "42501", "message": 'new row violates row-level security policy for table "comments"'}
                if self.falhar_insert == "rate":
                    return 400, {"code": "P0001", "details": None, "hint": None, "message": "rate limit: wait a few seconds"}
                if self.falhar_insert == "geral":
                    return 500, {"code": "XX000", "message": "falha simulada do servidor"}
                pai = corpo.get("parent_id")
                if pai is not None and not any(l["id"] == pai and l["page_id"] == corpo["page_id"] and l["parent_id"] is None for l in self.linhas):
                    return 400, {"code": "P0001", "message": "invalid parent comment"}
                self.linhas.append({"id": self.proximo_id, "page_id": corpo["page_id"], "user_id": quem, "parent_id": pai, "body": corpo["body"], "created_at": self.agora(), "edited_at": None})
                self.proximo_id += 1
                return 201, None
            alvo_id = int(um("id").removeprefix("eq.") or 0)
            alvo = next((l for l in self.linhas if l["id"] == alvo_id), None)
            if req.method == "PATCH":
                if alvo and conta and alvo["user_id"] == quem and corpo.get("body") != alvo["body"]:
                    alvo["body"] = corpo["body"]
                    alvo["edited_at"] = self.agora()
                return 204, None
            if req.method == "DELETE":
                if alvo and conta and (alvo["user_id"] == quem or conta["admin"]):
                    self.linhas = [l for l in self.linhas if l["id"] != alvo_id and l["parent_id"] != alvo_id]
                return 204, None
        return 404, {"message": f"rota desconhecida no Supabase falso: {req.method} {caminho}"}


class Execucao:
    """Um roteiro num site: a página, o Supabase falso e o que foi visto em cada passo."""

    def __init__(self, browser, porta, caminho, falso, largura=1100, hash_=""):
        self.porta, self.caminho, self.falso = porta, caminho, falso
        self.passos, self.falhas, self.erros_js, self.bloqueados, self.de_fora = [], [], [], [], []
        self.dialogos, self.resposta_do_dialogo = [], True
        self.visto = 0   # quantos pedidos ao Supabase falso já foram atribuídos a um passo (o 1º passo leva os da abertura)
        self.ctx = browser.new_context(viewport={"width": largura, "height": 900}, reduced_motion="reduce", locale="pt-BR", timezone_id="America/Sao_Paulo")
        self.pg = self.ctx.new_page()
        self.pg.on("pageerror", lambda e: self.erros_js.append(str(e)))
        self.pg.on("dialog", self._dialogo)
        self.ctx.route("**/*", self._rota)
        self.pg.add_init_script(TROCA_O_HC)
        self.pg.goto(f"http://localhost:{porta}{caminho}{hash_}", wait_until="load")
        self.pg.evaluate("document.documentElement.classList.remove('intro')")
        self.calma()

    def _dialogo(self, d):
        self.dialogos.append(d.message)
        d.accept() if self.resposta_do_dialogo else d.dismiss()

    def _rota(self, route):
        url = route.request.url
        if url.startswith("http://localhost"):
            return route.continue_()
        if url.startswith(FALSO):
            if "/auth/v1/authorize" in url:   # o Google: navegação para fora
                self.de_fora.append(url)
                return route.fulfill(status=200, content_type="text/html", body="<!doctype html><title>Google falso</title><p>Google falso</p>")
            return self.falso.responder(route)
        if url == CDN_DO_PYTHON:
            self.de_fora.append(url)
            return route.fulfill(status=200, content_type="application/javascript", body=SUPABASE_JS_UMD.read_text(encoding="utf-8"))
        self.bloqueados.append(url)
        return route.abort()

    def calma(self, minimo=150):
        """Espera os pedidos ao Supabase falso pararem (nenhum novo por 250 ms)."""
        self.pg.wait_for_timeout(minimo)
        antes, parado = len(self.falso.log), 0
        for _ in range(60):
            self.pg.wait_for_timeout(50)
            if len(self.falso.log) == antes:
                parado += 50
                if parado >= 250:
                    return
            else:
                antes, parado = len(self.falso.log), 0

    def retrato(self):
        return self.pg.evaluate(RETRATO)

    def passo(self, nome, acao=None, *, confira=None):
        """Faz a ação, espera, e guarda o retrato e os pedidos novos. `confira(retrato, pedidos)` devolve '' ou o problema."""
        inicio = self.visto
        if acao:
            acao()
        self.calma()
        r = self.retrato()
        pedidos = copy.deepcopy(self.falso.log[inicio:])
        self.visto = len(self.falso.log)
        self.passos.append((nome, r, pedidos))
        if confira:
            problema = confira(r, pedidos)
            if problema:
                self.falhas.append(f"[{nome}] {problema}")
        if r["xss"] is not None or r["elementosPerigosos"]:
            self.falhas.append(f"[{nome}] INJEÇÃO DE HTML: window.__xss={r['xss']}, elementos perigosos={r['elementosPerigosos']}")
        return r

    def fechar(self):
        self.ctx.close()


# ───────────── ajudantes para conferir ─────────────

def textos(no):
    """Todo o texto de um retrato, em ordem."""
    if no is None:
        return ""
    if isinstance(no, str):
        return no
    return "".join(textos(c) for c in no["c"])


def achar(no, quando):
    """Os nós do retrato que satisfazem `quando`."""
    if not isinstance(no, dict):
        return []
    achados = [no] if quando(no) else []
    for c in no["c"]:
        achados += achar(c, quando)
    return achados


def classe(nome):
    return lambda n: nome in n["a"].get("class", "").split()


def itens(r):
    return achar(r["caixa"], classe("c-item"))


def nomes_de_pedidos(pedidos):
    return [f"{p['metodo']} {p['caminho']}" for p in pedidos]


def exige(condicao, mensagem):
    return "" if condicao else mensagem


# ───────────── o roteiro ─────────────

def roteiro_principal(e, ui):
    """Deslogado → janela de login → cadastro → entrar → comentar, responder, editar, apagar, erros, sair."""
    pg = e.pg
    e.passo("abre a página (deslogado)", confira=lambda r, p: exige(len(itens(r)) == 5 and r["janelas"] == 0 and ATAQUE_COMENTARIO in textos(r["caixa"]) and ATAQUE_NOME in textos(r["caixa"])
                                                         and not achar(r["caixa"], lambda n: n["t"] == "button" and textos(n) in (ui["c_reply"], ui["c_edit"], ui["c_delete"]))
                                                         and achar(r["caixa"], classe("c-who"))[0].get("hidden") is True
                                                         and "GET /rest/v1/comments" in nomes_de_pedidos(p), "lista deslogada errada"))
    e.passo("clica na barra deslogado → abre a janela", lambda: pg.click(".c-bar textarea"),
            confira=lambda r, p: exige(r["janelas"] == 1 and r["travada"] and r["foco"] and r["foco"].startswith("input.[email]"), "a janela não abriu com o foco no e-mail"))
    e.passo("Tab no último elemento volta ao primeiro (X)", lambda: (pg.focus(".c-modal form .c-link"), pg.keyboard.press("Tab")),
            confira=lambda r, p: exige(r["foco"] and r["foco"].startswith("button.c-x"), "o Tab escapou da janela"))
    e.passo("Shift+Tab no primeiro vai ao último", lambda: pg.keyboard.press("Shift+Tab"),
            confira=lambda r, p: exige(r["foco"] and r["foco"].startswith("button.c-link"), "o Shift+Tab escapou da janela"))
    e.passo("Esc fecha a janela", lambda: pg.keyboard.press("Escape"),
            confira=lambda r, p: exige(r["janelas"] == 0 and not r["travada"], "Esc não fechou"))
    e.passo("clica em Publicar deslogado → abre a janela", lambda: pg.click(".c-bar button[type=submit]"),
            confira=lambda r, p: exige(r["janelas"] == 1 and not p, "Publicar deslogado não abriu a janela (ou enviou algo)"))
    e.passo("clique fora da caixa fecha a janela", lambda: pg.mouse.click(5, 5),
            confira=lambda r, p: exige(r["janelas"] == 0, "clique fora não fechou"))
    e.passo("abre de novo e fecha no X", lambda: (pg.click(".c-bar textarea"), pg.click(".c-modal .c-x")),
            confira=lambda r, p: exige(r["janelas"] == 0, "o X não fechou"))
    e.passo("abre e vai para a aba Criar conta", lambda: (pg.click(".c-bar textarea"), pg.click(f".c-modal .c-tabs button:text-is({json.dumps(ui['c_signup'])})")),
            confira=lambda r, p: exige(len(achar(r["janela"], lambda n: n["t"] == "input")) == 3 and achar(r["janela"], lambda n: n["a"].get("aria-pressed") == "true" and textos(n) == ui["c_signup"]), "aba de cadastro errada"))

    def cadastrar(nome, email):
        pg.fill(".c-modal input[name=username]", nome)
        pg.fill(".c-modal input[name=email]", email)
        pg.fill(".c-modal input[name=password]", "senha-nova-123")
        pg.click(".c-modal button[type=submit]")
    e.passo("cria conta com nome que tem HTML → aviso de confirmar o e-mail, volta para Entrar", lambda: cadastrar(ATAQUE_CADASTRO, "nova@exemplo.test"),
            confira=lambda r, p: exige(ui["c_check_email"] in textos(r["janela"]) and nomes_de_pedidos(p) == ["POST /auth/v1/signup"] and p[0]["corpo"]["data"] == {"display_name": ATAQUE_CADASTRO}
                                       and len(achar(r["janela"], lambda n: n["t"] == "input")) == 2, "cadastro errado"))
    e.passo("cria conta com e-mail que já existe → erro", lambda: (pg.click(f".c-modal .c-tabs button:text-is({json.dumps(ui['c_signup'])})"), cadastrar("Outra", "eu@exemplo.test")),
            confira=lambda r, p: exige(ui["c_err_generic"] in textos(r["janela"]) and "User already registered" in textos(r["janela"]), "erro de cadastro errado"))
    e.passo("entra com a conta ainda não confirmada → e-mail não confirmado", lambda: (pg.click(f".c-modal .c-tabs button:text-is({json.dumps(ui['c_login'])})"),
                                                                                 pg.fill(".c-modal input[name=email]", "nova@exemplo.test"), pg.fill(".c-modal input[name=password]", "senha-nova-123"),
                                                                                 pg.press(".c-modal input[name=password]", "Enter")),
            confira=lambda r, p: exige(ui["c_err_login"] in textos(r["janela"]), "e-mail não confirmado sem a mensagem"))
    e.passo("esqueci a senha sem e-mail → foca o campo de e-mail", lambda: (pg.fill(".c-modal input[name=email]", ""), pg.click(f".c-modal .c-link:text-is({json.dumps(ui['c_forgot'])})")),
            confira=lambda r, p: exige(not p and r["foco"] and r["foco"].startswith("input.[email]"), "esqueci a senha sem e-mail errado"))
    e.passo("esqueci a senha com e-mail → aviso", lambda: (pg.fill(".c-modal input[name=email]", "eu@exemplo.test"), pg.click(f".c-modal .c-link:text-is({json.dumps(ui['c_forgot'])})")),
            confira=lambda r, p: exige(ui["c_reset_sent"] in textos(r["janela"]) and nomes_de_pedidos(p) == ["POST /auth/v1/recover"], "esqueci a senha errado"))
    e.passo("senha errada → mensagem", lambda: (pg.fill(".c-modal input[name=email]", "eu@exemplo.test"), pg.fill(".c-modal input[name=password]", "errada"), pg.click(".c-modal button[type=submit]")),
            confira=lambda r, p: exige(ui["c_err_login"] in textos(r["janela"]) and r["janelas"] == 1, "senha errada sem mensagem"))
    e.passo("entra → a janela fecha, 'Conectado como Eu Mesma', botões de responder/editar/apagar", lambda: (pg.fill(".c-modal input[name=email]", "eu@exemplo.test"), pg.fill(".c-modal input[name=password]", "senha-certa"),
                                                                                                            pg.click(".c-modal button[type=submit]")),
            confira=lambda r, p: exige(r["janelas"] == 0 and not r["travada"] and f"{ui['c_hello']} Eu Mesma" in textos(r["caixa"])
                                       and len(achar(r["caixa"], lambda n: n["t"] == "button" and textos(n) == ui["c_reply"])) == 3
                                       and len(achar(r["caixa"], lambda n: n["t"] == "button" and textos(n) == ui["c_edit"])) == 1
                                       and len(achar(r["caixa"], lambda n: n["t"] == "button" and textos(n) == ui["c_delete"])) == 1, "depois de entrar a caixa está errada"))
    e.passo("recarrega a página → continua conectado", lambda: (pg.reload(wait_until="load"), pg.evaluate("document.documentElement.classList.remove('intro')")),
            confira=lambda r, p: exige(f"{ui['c_hello']} Eu Mesma" in textos(r["caixa"]), "perdeu a sessão ao recarregar"))
    e.passo("Shift+Enter na barra quebra linha e não envia", lambda: (pg.click(".c-bar textarea"), pg.keyboard.type("Olá"), pg.keyboard.press("Shift+Enter"), pg.keyboard.type("segunda linha")),
            confira=lambda r, p: exige(not p and achar(r["caixa"], lambda n: n["t"] == "textarea")[0]["v"] == "Olá\nsegunda linha", "Shift+Enter enviou ou não quebrou a linha"))
    e.passo("Enter envia → o comentário aparece no fim e a barra limpa", lambda: pg.keyboard.press("Enter"),
            confira=lambda r, p: exige(p[:1] and p[0]["metodo"] == "POST" and p[0]["corpo"] == {"page_id": e.falso.pagina, "body": "Olá\nsegunda linha"} and textos(itens(r)[-1]).find("Olá\nsegunda linha") >= 0
                                       and achar(r["caixa"], lambda n: n["t"] == "textarea")[0]["v"] == "", "comentar com Enter falhou"))
    e.passo("só espaços + Enter não envia", lambda: (pg.click(".c-bar textarea"), pg.keyboard.type("   "), pg.keyboard.press("Shift+Enter"), pg.keyboard.press("Enter")),
            confira=lambda r, p: exige(not p, "enviou um comentário vazio"))
    e.passo("comentário com HTML pela barra aparece como texto", lambda: (pg.fill(".c-bar textarea", ATAQUE_BARRA), pg.press(".c-bar textarea", "Enter")),
            confira=lambda r, p: exige(ATAQUE_BARRA in textos(itens(r)[-1]), "o HTML publicado não apareceu como texto"))
    responder = lambda: pg.click(f".c-item >> nth=0 >> .c-actions >> button:text-is({json.dumps(ui['c_reply'])}) >> nth=0")
    e.passo("Responder abre o formulário de resposta", responder,
            confira=lambda r, p: exige(len(achar(r["caixa"], classe("c-reply-form"))) == 1, "o formulário de resposta não abriu"))
    e.passo("Responder de novo fecha", responder, confira=lambda r, p: exige(not achar(r["caixa"], classe("c-reply-form")), "não fechou"))
    e.passo("Responder e Cancelar", lambda: (responder(), pg.click(f".c-reply-form button:text-is({json.dumps(ui['c_cancel'])})")),
            confira=lambda r, p: exige(not achar(r["caixa"], classe("c-reply-form")), "Cancelar não fechou"))
    e.passo("resposta com Shift+Enter e Enter (e HTML) vai embaixo do comentário", lambda: (responder(), pg.click(".c-reply-form textarea"), pg.keyboard.type("resposta"), pg.keyboard.press("Shift+Enter"),
                                                                                         pg.keyboard.type(ATAQUE_RESPOSTA), pg.keyboard.press("Enter")),
            confira=lambda r, p: exige(p[:1] and p[0]["corpo"] == {"page_id": e.falso.pagina, "body": f"resposta\n{ATAQUE_RESPOSTA}", "parent_id": 1}
                                       and f"resposta\n{ATAQUE_RESPOSTA}" in textos(achar(itens(r)[0], classe("c-replies"))[0]) and not achar(r["caixa"], classe("c-reply-form")), "responder falhou"))
    meu = '.c-item:has(.c-body:text("Um comentário meu."))'   # o comentário semeado da pessoa que entra (sem respostas)
    editar = lambda: pg.click(f"{meu} >> .c-actions button:text-is({json.dumps(ui['c_edit'])})")
    e.passo("Editar abre o texto atual com o cursor no fim", editar,
            confira=lambda r, p: exige(achar(r["caixa"], classe("c-edit-form")) and achar(achar(r["caixa"], classe("c-edit-form"))[0], lambda n: n["t"] == "textarea")[0]["v"] == "Um comentário meu."
                                       and r["foco"] and r["foco"].startswith("textarea"), "Editar não abriu certo"))
    e.passo("Esc cancela a edição", lambda: pg.keyboard.press("Escape"), confira=lambda r, p: exige(not achar(r["caixa"], classe("c-edit-form")) and not p, "Esc não cancelou"))
    e.passo("Editar e Enter sem mudar nada fecha sem enviar", lambda: (editar(), pg.keyboard.press("Enter")), confira=lambda r, p: exige(not p and not achar(r["caixa"], classe("c-edit-form")), "enviou edição sem mudança"))
    e.passo("Editar com HTML, Shift+Enter e Enter → '(editado)' com a data no title", lambda: (editar(), pg.keyboard.press("Shift+Enter"), pg.keyboard.type(ATAQUE_EDICAO), pg.keyboard.press("Enter")),
            confira=lambda r, p: exige(p[:1] and p[0]["metodo"] == "PATCH" and p[0]["corpo"] == {"body": f"Um comentário meu.\n{ATAQUE_EDICAO}"}
                                       and len(achar(r["caixa"], classe("c-edited"))) == 2 and all(n["a"].get("title") for n in achar(r["caixa"], classe("c-edited"))), "editar falhou"))
    def apagar(aceitar):
        e.resposta_do_dialogo = aceitar
        pg.click(f"{meu} >> .c-actions button:text-is({json.dumps(ui['c_delete'])})")
    antes = []
    e.passo("Apagar e cancelar a confirmação → nada muda", lambda: (antes.append(len(e.dialogos)), apagar(False)),
            confira=lambda r, p: exige(not p and e.dialogos[-1:] == [ui["c_confirm_delete"]], "cancelar apagou ou não perguntou"))
    e.passo("Apagar e confirmar → some", lambda: apagar(True),
            confira=lambda r, p: exige([x["metodo"] for x in p][:1] == ["DELETE"] and "Um comentário meu." not in textos(r["caixa"]), "apagar falhou"))
    e.falso.falhar_insert = "rate"
    e.passo("servidor recusa (limite de 10 s) → 'Calma!' acima da barra", lambda: (pg.fill(".c-bar textarea", "rápido demais"), pg.press(".c-bar textarea", "Enter")),
            confira=lambda r, p: exige(achar(r["caixa"], classe("c-msg")) and ui["c_err_rate"] in textos(r["caixa"]), "sem a mensagem de limite"))
    e.falso.falhar_insert = "geral"
    e.passo("erro qualquer do servidor → 'Algo deu errado (…)'", lambda: pg.press(".c-bar textarea", "Enter"),
            confira=lambda r, p: exige(f"{ui['c_err_generic']} (falha simulada do servidor)" in textos(r["caixa"]), "sem a mensagem de erro geral"))
    e.falso.falhar_insert = None
    e.passo("Sair → volta ao estado deslogado", lambda: pg.click(f".c-who button:text-is({json.dumps(ui['c_logout'])})"),
            confira=lambda r, p: exige("POST /auth/v1/logout" in nomes_de_pedidos(p) and achar(r["caixa"], classe("c-who"))[0].get("hidden") is True
                                       and not achar(r["caixa"], lambda n: n["t"] == "button" and textos(n) == ui["c_reply"]), "sair falhou"))


def roteiro_admin(e, ui):
    pg = e.pg
    e.passo("abre", confira=lambda r, p: exige(len(achar(r["caixa"], classe("c-badge"))) == 1 and textos(achar(r["caixa"], classe("c-badge"))[0]) == "✦", "sem o selo ✦ do admin"))
    e.passo("admin entra → Apagar em todos os comentários, Editar só no próprio", lambda: (pg.click(".c-bar textarea"), pg.fill(".c-modal input[name=email]", "admin@exemplo.test"),
                                                                                          pg.fill(".c-modal input[name=password]", "senha-do-admin"), pg.press(".c-modal input[name=password]", "Enter")),
            confira=lambda r, p: exige(len(achar(r["caixa"], lambda n: n["t"] == "button" and textos(n) == ui["c_delete"])) == 5
                                       and len(achar(r["caixa"], lambda n: n["t"] == "button" and textos(n) == ui["c_edit"])) == 1, "botões do admin errados"))
    e.passo("admin apaga o comentário do ataque (e a resposta vai junto)", lambda: pg.click(f".c-item >> nth=2 >> .c-actions >> button:text-is({json.dumps(ui['c_delete'])}) >> nth=0"),
            confira=lambda r, p: exige(ATAQUE_COMENTARIO not in textos(r["caixa"]) and len(itens(r)) == 3, "o admin não apagou"))


def roteiro_nome_com_html(e, ui):
    """Cria conta com HTML no nome, confirma (no Supabase falso), entra e comenta: o nome aparece como texto em todo lugar."""
    pg = e.pg
    e.passo("abre")
    e.passo("cria conta com HTML no nome", lambda: (pg.click(".c-bar textarea"), pg.click(f".c-modal .c-tabs button:text-is({json.dumps(ui['c_signup'])})"),
                                                   pg.fill(".c-modal input[name=username]", ATAQUE_CADASTRO), pg.fill(".c-modal input[name=email]", "nova@exemplo.test"),
                                                   pg.fill(".c-modal input[name=password]", "senha-nova-123"), pg.click(".c-modal button[type=submit]")),
            confira=lambda r, p: exige(ui["c_check_email"] in textos(r["janela"]), "cadastro falhou"))
    e.falso.contas["nova@exemplo.test"]["confirmada"] = True   # "clicou no link do e-mail"
    e.passo("entra com a conta nova → 'Conectado como <img…>' como texto", lambda: (pg.fill(".c-modal input[name=email]", "nova@exemplo.test"), pg.fill(".c-modal input[name=password]", "senha-nova-123"),
                                                                                  pg.press(".c-modal input[name=password]", "Enter")),
            confira=lambda r, p: exige(f"{ui['c_hello']} {ATAQUE_CADASTRO}" in textos(r["caixa"]), "o nome com HTML não apareceu como texto"))
    e.passo("comenta → o nome com HTML aparece como texto no comentário", lambda: (pg.fill(".c-bar textarea", "oi"), pg.press(".c-bar textarea", "Enter")),
            confira=lambda r, p: exige(textos(achar(itens(r)[-1], lambda n: n["t"] == "strong")[0]) == ATAQUE_CADASTRO, "o nome no comentário não é o texto do cadastro"))


def roteiro_vazio(e, ui):
    e.passo("página sem comentários", confira=lambda r, p: exige(textos(achar(r["caixa"], classe("c-note"))[0]) == ui["c_none"], "sem 'Ainda não há comentários'"))


def roteiro_sem_edited_at(e, ui):
    e.passo("banco sem a coluna edited_at → refaz a consulta sem ela e mostra a lista",
            confira=lambda r, p: exige(len(itens(r)) == 5 and not achar(r["caixa"], classe("c-edited")) and [x["q"]["select"][0] for x in p if x["caminho"] == "/rest/v1/comments"][-2:] ==
                                       ["id,body,created_at,edited_at,user_id,parent_id,profiles(display_name,is_admin)", "id,body,created_at,user_id,parent_id,profiles(display_name,is_admin)"], "o recuo sem edited_at falhou"))


def roteiro_lista_com_erro(e, ui):
    e.passo("erro ao carregar a lista → mensagem no lugar da lista", confira=lambda r, p: exige(f"{ui['c_err_generic']} (falha simulada ao ler)" in textos(r["caixa"]), "sem a mensagem de erro da lista"))


def roteiro_google(e, ui):
    e.passo("Google → vai para o /authorize com provider=google e a volta para esta página (sem #)",
            lambda: (e.pg.click(".c-bar textarea"), e.pg.click(".c-modal .c-google"), e.pg.wait_for_url("**/auth/v1/authorize**")),
            confira=lambda r, p: "")
    url = urllib.parse.urlsplit(e.de_fora[-1]) if e.de_fora else None
    q = urllib.parse.parse_qs(url.query) if url else {}
    volta = [x.replace(f"localhost:{e.porta}", "localhost:PORTA") for x in q.get("redirect_to", [])]
    e.passos.append(("endereço do Google", {"caminho": url.path if url else None, "provider": q.get("provider"), "redirect_to": volta}, []))
    if not url or q.get("provider") != ["google"] or q.get("redirect_to") != [f"http://localhost:{e.porta}{e.caminho}"]:
        e.falhas.append(f"[Google] endereço errado: {e.de_fora[-1:]}")


def roteiro_nova_senha(e, ui):
    pg = e.pg
    e.passo("chega pelo link de nova senha → janela com a nova senha, sem X", confira=lambda r, p: exige(r["janelas"] == 1 and not achar(r["janela"], classe("c-x"))
                                                                                                     and achar(r["janela"], lambda n: n["t"] == "input" and n["a"].get("autocomplete") == "new-password"), "a janela de nova senha não abriu"))
    e.passo("Esc NÃO fecha a janela de nova senha", lambda: pg.keyboard.press("Escape"), confira=lambda r, p: exige(r["janelas"] == 1, "Esc fechou a troca de senha"))
    e.passo("salva a nova senha → aviso de senha trocada e conectado", lambda: (pg.fill(".c-modal input[name=password]", "nova-senha-1"), pg.click(".c-modal button[type=submit]")),
            confira=lambda r, p: exige(r["janelas"] == 0 and ui["c_password_changed"] in textos(r["caixa"]) and f"{ui['c_hello']} Eu Mesma" in textos(r["caixa"])
                                       and any(x["metodo"] == "PUT" and x["caminho"] == "/auth/v1/user" and x["corpo"].get("password") == "nova-senha-1" for x in p), "troca de senha falhou"))


ROTEIROS = [
    # (nome, página, roteiro, como montar o Supabase falso, hash da página)
    ("principal (notícia, pt)", NOTICIA, roteiro_principal, lambda pid: SupabaseFalso(pid), ""),
    ("principal (capítulo, pt)", CAPITULO, roteiro_principal, lambda pid: SupabaseFalso(pid), ""),
    ("principal (notícia, en)", NOTICIA_EN, roteiro_principal, lambda pid: SupabaseFalso(pid), ""),
    ("admin", NOTICIA, roteiro_admin, lambda pid: SupabaseFalso(pid), ""),
    ("nome com HTML", CAPITULO, roteiro_nome_com_html, lambda pid: SupabaseFalso(pid), ""),
    ("sem comentários", CAPITULO, roteiro_vazio, lambda pid: SupabaseFalso(pid, comentarios=False), ""),
    ("banco sem edited_at", NOTICIA, roteiro_sem_edited_at, lambda pid: setattr(f := SupabaseFalso(pid), "sem_edited_at", True) or f, ""),
    ("erro ao carregar", NOTICIA, roteiro_lista_com_erro, lambda pid: setattr(f := SupabaseFalso(pid), "falhar_lista", True) or f, ""),
    ("Google", NOTICIA, roteiro_google, lambda pid: SupabaseFalso(pid), ""),
    ("nova senha", NOTICIA, roteiro_nova_senha, lambda pid: SupabaseFalso(pid), "RECOVERY"),
]


def id_da_pagina(browser, porta, caminho):
    ctx = browser.new_context()
    ctx.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://localhost") else r.abort())
    pg = ctx.new_page()
    pg.add_init_script(TROCA_O_HC)   # nem aqui as chaves do config.json chegam a ser usadas
    pg.goto(f"http://localhost:{porta}{caminho}", wait_until="domcontentloaded")
    pid, ui = pg.evaluate("[document.querySelector('.hc-comments[data-page]')?.dataset.page, window.HC && window.HC.ui]")
    ctx.close()
    return pid, ui


def hash_de_recuperacao(falso):
    s = falso.sessao("eu@exemplo.test")
    return "#" + urllib.parse.urlencode({"access_token": s["access_token"], "expires_at": s["expires_at"], "expires_in": 3600, "refresh_token": s["refresh_token"], "token_type": "bearer", "type": "recovery"})


def rodar(browser, porta, nome, caminho, roteiro, montar, hash_, ui):
    pid, _ = id_da_pagina(browser, porta, caminho)
    falso = montar(pid)
    e = Execucao(browser, porta, caminho, falso, hash_=hash_de_recuperacao(falso) if hash_ == "RECOVERY" else "")
    roteiro(e, ui)
    e.fechar()
    return e, pid


def fotos(browser, portas, pasta):
    """Capturas da caixa nos dois sites (deslogado, conectado, janela aberta), 1100 e 390 px, e as imagens lado a lado."""
    from PIL import Image
    pasta.mkdir(parents=True, exist_ok=True)
    feitas = []
    for caminho, rotulo in [(NOTICIA, "noticia"), (CAPITULO, "capitulo")]:
        for largura in (1100, 390):
            imgs = {}
            for site, porta in portas.items():
                pid, _ = id_da_pagina(browser, porta, caminho)
                e = Execucao(browser, porta, caminho, SupabaseFalso(pid), largura=largura)
                pg = e.pg
                def recorte(nome):
                    caixa = pg.query_selector(".reader-box:has(.hc-comments)") or pg.query_selector(".hc-comments")
                    caixa.scroll_into_view_if_needed()
                    pg.wait_for_timeout(200)
                    arq = pasta / f"{rotulo}-{largura}-{nome}-{site}.png"
                    caixa.screenshot(path=str(arq))
                    imgs.setdefault(nome, {})[site] = arq
                recorte("deslogado")
                pg.click(".c-bar textarea")
                pg.wait_for_timeout(200)
                arq = pasta / f"{rotulo}-{largura}-janela-{site}.png"
                pg.screenshot(path=str(arq))
                imgs.setdefault("janela", {})[site] = arq
                pg.fill(".c-modal input[name=email]", "eu@exemplo.test")
                pg.fill(".c-modal input[name=password]", "senha-certa")
                pg.press(".c-modal input[name=password]", "Enter")
                e.calma()
                pg.click(f".c-item >> nth=0 >> .c-actions >> button.c-link >> nth=0")   # abre uma resposta, para a foto mostrar o formulário
                e.calma()
                recorte("conectado")
                e.fechar()
            for nome, par in imgs.items():
                a, b = Image.open(par["python"]), Image.open(par["astro"])
                lado = Image.new("RGB", (a.width + b.width + 20, max(a.height, b.height)), "white")
                lado.paste(a, (0, 0))
                lado.paste(b, (a.width + 20, 0))
                saida = pasta / f"lado-a-lado-{rotulo}-{largura}-{nome}.png"
                lado.save(saida)
                igual = a.size == b.size and a.convert("RGB").tobytes() == b.convert("RGB").tobytes()
                feitas.append(f"{saida} ({'idênticas pixel a pixel' if igual else 'DIFERENTES'})")
    return feitas


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--python", type=int, default=8791, help="porta do site gerado pelo Python")
    ap.add_argument("--astro", type=int, default=8792, help="porta do site Astro (dist/)")
    ap.add_argument("--fotos", type=pathlib.Path, help="pasta para as capturas (fora do projeto)")
    ap.add_argument("--detalhes", action="store_true", help="imprime cada passo")
    a = ap.parse_args()
    if not SUPABASE_JS_UMD.exists():
        sys.exit(f"falta {SUPABASE_JS_UMD} (rode pnpm install)")

    problemas, total_passos = [], 0
    portas = {"python": a.python, "astro": a.astro}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for nome, caminho, roteiro, montar, hash_ in ROTEIROS:
            _, ui_py = id_da_pagina(browser, a.python, caminho)
            _, ui_as = id_da_pagina(browser, a.astro, caminho)
            if ui_py != ui_as:
                problemas.append(f"{nome}: os textos do window.HC.ui são diferentes nos dois sites")
            ui = {**{"c_edit": "Edit", "c_edited": "edited"}, **(ui_py or {})}
            exec_py, pid_py = rodar(browser, a.python, nome, caminho, roteiro, montar, hash_, ui)
            exec_as, pid_as = rodar(browser, a.astro, nome, caminho, roteiro, montar, hash_, ui)
            if pid_py != pid_as or not pid_py:
                problemas.append(f"{nome}: data-page diferente: {pid_py!r} × {pid_as!r}")
            for site, ex in (("python", exec_py), ("astro", exec_as)):
                problemas += [f"{nome} · {site} {f}" for f in ex.falhas]
                if ex.erros_js:
                    problemas.append(f"{nome} · {site}: erro de JavaScript: {ex.erros_js}")
                if [u for u in ex.bloqueados if "supabase" in u or "comments.js" in u]:
                    problemas.append(f"{nome} · {site}: pedidos inesperados bloqueados: {ex.bloqueados}")
            # o Astro não busca nada do CDN nem o /comments.js; o Python busca o supabase-js do CDN
            if any(CDN_DO_PYTHON in u for u in exec_as.de_fora):
                problemas.append(f"{nome}: o Astro pediu o supabase-js do CDN")
            if not any(CDN_DO_PYTHON in u for u in exec_py.de_fora):
                problemas.append(f"{nome}: o Python não pediu o supabase-js do CDN (o teste não está comparando o site de hoje)")
            if len(exec_py.passos) != len(exec_as.passos):
                problemas.append(f"{nome}: roteiros de tamanhos diferentes ({len(exec_py.passos)} × {len(exec_as.passos)})")
                continue
            for (passo, rp, pp), (_, ra, pa) in zip(exec_py.passos, exec_as.passos):
                total_passos += 1
                if a.detalhes:
                    print(f"{nome} [{passo}] pedidos: {nomes_de_pedidos(pp) if isinstance(pp, list) else pp}")
                if rp != ra:
                    problemas.append(f"{nome} [{passo}] a caixa é diferente:\n    python: {json.dumps(rp, ensure_ascii=False)[:1500]}\n    astro : {json.dumps(ra, ensure_ascii=False)[:1500]}")
                if pp != pa:
                    problemas.append(f"{nome} [{passo}] pedidos ao Supabase diferentes:\n    python: {json.dumps(pp, ensure_ascii=False)[:1500]}\n    astro : {json.dumps(pa, ensure_ascii=False)[:1500]}")
            if exec_py.dialogos != exec_as.dialogos:
                problemas.append(f"{nome}: confirmações diferentes: {exec_py.dialogos} × {exec_as.dialogos}")
        feitas = fotos(browser, portas, a.fotos) if a.fotos else []
        browser.close()

    for f in feitas:
        print("foto:", f)
    if problemas:
        print("PROBLEMAS ENCONTRADOS:")
        print("\n".join(problemas))
        return 1
    print(f"OK: {len(ROTEIROS)} roteiros, {total_passos} passos; a caixa, os pedidos ao Supabase e as confirmações são idênticos no Astro e no Python, "
          f"e nenhuma injeção de HTML rodou em nenhum dos dois.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
