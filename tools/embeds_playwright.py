#!/usr/bin/env python3
"""Posts incorporados EM MOLDURA ISOLADA (T17j, B27), no navegador: o que o visitante e o servidor de terceiros "veem".

Sem internet no sandbox, os três serviços são FALSOS: o Playwright responde, em nome de platform.twitter.com, embed.reddit.com e
www.instagram.com, com uma página de mentira (o "widget falso") que (1) tenta, de dentro da moldura, ler e escrever o localStorage da
página, ler o documento do topo, o cookie e navegar o topo; (2) guarda o resultado em window.__sondagem; e (3) manda para a página as
MESMAS mensagens que o serviço de verdade manda (formatos vistos com os serviços reais em 21/10/2026):
  X          initialized e depois twttr.private.resize (JSON em texto, com o id = embedId da moldura);
  Reddit     {"type":"resize.embed","data":0} (como sem layout) e depois a altura;
  Instagram  LOADING, MEASURE com a altura e MOUNTED com estilos "hostis" (que não podem ser aplicados).
Tudo o mais fora de localhost é bloqueado e registrado.

O que o roteiro prova, numa notícia com X, uma com Reddit e a do Instagram (e a alternância .embed-alt), em /pt/ e /en/, a 1100 e 390 px:
  1. SEM CLIQUE: a moldura aparece sozinha; nenhum <script src> de outro site na página; nenhum widgets.js/embed.js pedido; os pedidos de
     terceiros vão só ao serviço do post.
  2. A moldura tem os MESMOS atributos, estilos e estrutura que o script oficial cria (X: div.twitter-tweet.twitter-tweet-rendered no
     .embed, com o iframe; Reddit e Instagram: o iframe direto no .embed), mais o sandbox; o blockquote sai; nunca srcdoc.
  3. A altura é a que o widget falso mandou (e o 0 do Reddit não encolheu nada); mensagens de outro iframe e da própria página não mudam
     nada; os estilos "hostis" do MOUNTED do Instagram não entram.
  4. De dentro do widget falso: ler/escrever o localStorage da página, ler o documento do topo e o cookie dão SecurityError; navegar o
     topo não funciona; a página continua no mesmo endereço e o localStorage dela intacto.
  5. .embed-alt: o painel ligado ganha a moldura; o painel escondido só ganha quando aparece, já com a altura certa.
  6. Sem JavaScript: só o blockquote do autor (como antes), sem moldura.
  7. Serviço que não responde (bloqueado): depois de 30 s o blockquote volta (só com --lento, leva ~35 s).
  8. Capturas (--fotos <pasta>): cada post a 1100 e 390 px.

Como usar (o servidor do dist/ é levantado pelo próprio script, em uma thread, na porta livre que o sistema der):
  pnpm build
  python3 tools/embeds_playwright.py [--dist dist] [--fotos <pasta fora do projeto>] [--lento]

Sai com código 0 se tudo passar, 1 se houver qualquer falha (e imprime qual). Só a biblioteca Playwright do Python (já instalada).
"""
import argparse
import functools
import http.server
import os
import re
import sys
import threading
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

# ───────────────────────── o que existe no site e quais são os "serviços" falsos ─────────────────────────

NOTICIAS = {
    "reddit": "2024-02-23-avialuna-aeternogyrinians",
    "x": "2024-04-29-hygranocianos",
    "instagram": "2025-04-14-speedpaint-pederneira",  # Instagram | TikTok | YouTube (o Instagram no primeiro painel)
    "alt": "2023-08-19-conheca-os-talassimbiontes",  # Reddit | Instagram
}
HOSTS_DA_MOLDURA = {"reddit": "embed.reddit.com", "x": "platform.twitter.com", "instagram": "www.instagram.com"}
ALTURA_FALSA = {"reddit": 833, "x": 431, "instagram": 917}

SANDBOX = {"x": "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox", "instagram": "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox", "reddit": "allow-scripts allow-same-origin allow-popups"}
ESTILO_FINAL = {
    "caixa-x": "display: flex; max-width: 550px; width: 100%; margin-top: 10px; margin-bottom: 10px;",
    "x": "position: static; visibility: visible; width: 550px; height: {h}px; display: block; flex-grow: 1;",
    "reddit": "border: none; max-width: 100%; border-radius: 8px; display: block; margin: 0px auto;",
    "instagram": "background: white; max-width: 540px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px 0px 12px; min-width: 326px; padding: 0px;",
}
ORDEM_DOS_ATRIBUTOS = {
    "x": ["id", "scrolling", "frameborder", "allowtransparency", "allowfullscreen", "class", "title", "src", "data-tweet-id", "sandbox", "style"],
    "reddit": ["height", "src", "width", "scrolling", "allowfullscreen", "sandbox", "allow", "title", "style"],
    "instagram": ["class", "id", "src", "allowtransparency", "allowfullscreen", "frameborder", "height", "data-instgrm-payload-id", "scrolling", "sandbox", "title", "style"],
}

# Qualquer pedido a um destes é "terceiro de rede social".
TERCEIROS = re.compile(r"(^|\.)(reddit\.com|redd\.it|redditstatic\.com|redditmedia\.com|twitter\.com|x\.com|twimg\.com|instagram\.com|cdninstagram\.com|fbcdn\.net|facebook\.com)$")
SCRIPTS_PROIBIDOS = re.compile(r"/(widgets|embed)\.js(\?|$)")

PAGINA_DO_WIDGET = """<!doctype html><html><head><meta charset="utf-8"><title>widget falso</title></head>
<body style="margin:0;background:#fff;color:#111;font:16px sans-serif">
<div style="box-sizing:border-box;height:__ALTURA__px;border:3px solid #7a3;background:#efe;padding:16px">
<b>WIDGET FALSO __SERVICO__</b><br>(a página de incorporação de mentira do Playwright)<br><span id="params"></span></div>
<script>
const S = {};
const t = (nome, f) => { try { S[nome] = f(); } catch (e) { S[nome] = 'ERRO:' + e.name; } };
t('origem', () => location.origin);
t('lerLocalStorageDaPagina', () => String(parent.localStorage.getItem('sb-sessao-falsa')));
t('escreverLocalStorageDaPagina', () => { parent.localStorage.setItem('invadido', '1'); return 'escreveu'; });
t('lerDocumentoDoTopo', () => top.document.title);
t('lerCookieDaPagina', () => parent.document.cookie);
t('proprioLocalStorage', () => { localStorage.setItem('meu', '1'); return localStorage.getItem('meu'); });
t('navegarOTopo', () => { top.location.href = 'https://evil.test/'; return 'tentou'; });
window.__sondagem = S;
document.getElementById('params').textContent = location.search.slice(0, 120);
const servico = '__SERVICO__';
const H = __ALTURA__;
const id = new URLSearchParams(location.search).get('embedId');
const manda = (m, ms) => setTimeout(() => parent.postMessage(m, '*'), ms);
if (servico === 'x') {
  manda(JSON.stringify({ 'twttr.embed': { jsonrpc: '2.0', method: 'twttr.private.initialized', id, params: [{ iframe_version: 'falso', data: { tweet_id: '1' } }] } }), 50);
  manda(JSON.stringify({ 'twttr.embed': { jsonrpc: '2.0', method: 'twttr.private.resize', id, params: [{ width: 550, height: H, data: { tweet_id: '1' } }] } }), 250);
} else if (servico === 'reddit') {
  manda(JSON.stringify({ type: 'resize.embed', data: 0 }), 50);
  manda(JSON.stringify({ type: 'resize.embed', data: H }), 250);
} else {
  manda(JSON.stringify({ details: {}, type: 'LOADING' }), 50);
  manda(JSON.stringify({ details: { height: H }, type: 'MEASURE' }), 200);
  manda(JSON.stringify({ details: { styles: [['boxShadow', '0 0 40px red'], ['border', '9px solid red'], ['margin', '0px 0px 12px']] }, type: 'MOUNTED' }), 300);
}
</script></body></html>"""


def servico_do_host(host):
    return next((s for s, h in HOSTS_DA_MOLDURA.items() if h == host), None)


# ───────────────────────── servidor do dist/ ─────────────────────────


class Quieto(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def servir(pasta):
    servidor = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quieto, directory=pasta))
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    return servidor


# ───────────────────────── resultado ─────────────────────────

FALHAS = []
PASSOS = []


def confere(ok, o_que, detalhe=""):
    PASSOS.append(o_que)
    if not ok:
        FALHAS.append(f"{o_que}{(' — ' + str(detalhe)) if detalhe != '' else ''}")


# ───────────────────────── um visitante ─────────────────────────


class Visitante:
    """Uma aba com os três serviços falsos (ou bloqueados), o registro de pedidos e de erros."""

    def __init__(self, browser, porta, largura, js=True, altura=900, servicos_mudos=False):
        self.porta = porta
        self.mudos = servicos_mudos
        self.ctx = browser.new_context(viewport={"width": largura, "height": altura}, reduced_motion="reduce", java_script_enabled=js)
        self.pg = self.ctx.new_page()
        self.pedidos = []
        self.bloqueados = []
        self.erros = []
        self.pg.on("pageerror", lambda e: self.erros.append(str(e)))
        self.pg.on("request", lambda r: self.pedidos.append(r.url))
        self.pg.route("**/*", self._rota)
        self.pg.add_init_script("try{sessionStorage.setItem('hc-intro','1')}catch(e){}")

    def _rota(self, rota):
        u = urlparse(rota.request.url)
        if u.hostname in ("127.0.0.1", "localhost"):
            rota.continue_()
            return
        servico = servico_do_host(u.hostname)
        if servico and not self.mudos and u.scheme == "https" and not SCRIPTS_PROIBIDOS.search(rota.request.url):
            corpo = PAGINA_DO_WIDGET.replace("__SERVICO__", servico).replace("__ALTURA__", str(ALTURA_FALSA[servico]))
            rota.fulfill(status=200, content_type="text/html; charset=utf-8", body=corpo)
            return
        self.bloqueados.append(rota.request.url)
        rota.abort()

    def abrir(self, caminho):
        self.pg.goto(f"http://127.0.0.1:{self.porta}{caminho}", wait_until="load")
        self.pg.wait_for_timeout(300)

    def hosts_de_terceiros(self):
        return sorted({urlparse(u).hostname for u in self.pedidos if TERCEIROS.search(urlparse(u).hostname or "")})

    def fechar(self):
        self.ctx.close()


def sem_rolagem_lateral(pg):
    return pg.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1")


def foto(pg, pasta, nome, seletor):
    if not pasta:
        return
    os.makedirs(pasta, exist_ok=True)
    pg.evaluate("(s) => { const e = document.querySelector(s); if (e) { window.scrollBy(0, e.getBoundingClientRect().top - 90); } }", seletor)
    pg.wait_for_timeout(250)
    pg.screenshot(path=os.path.join(pasta, nome + ".png"))


DESCREVER = """(host) => {
  const f = [...document.querySelectorAll('iframe')].find(i => new URL(i.src).hostname === host);
  if (!f) return null;
  const r = f.getBoundingClientRect();
  return {
    nomes: f.getAttributeNames(), attrs: Object.fromEntries(f.getAttributeNames().map(n => [n, f.getAttribute(n)])),
    pai: f.parentElement.className, paiEstilo: f.parentElement.getAttribute('style'), avo: f.parentElement.parentElement.className,
    blockquotes: f.closest('.embed').querySelectorAll('blockquote').length, altura: r.height, largura: r.width,
    larguraDoEmbed: f.closest('.embed').getBoundingClientRect().width, visivel: getComputedStyle(f).visibility,
  };
}"""


# ───────────────────────── os roteiros ─────────────────────────


def conferir_moldura(pg, servico, etiqueta):
    host = HOSTS_DA_MOLDURA[servico]
    d = pg.evaluate(DESCREVER, host)
    confere(d is not None, f"{etiqueta}: a moldura do {servico} existe")
    if d is None:
        return
    h = ALTURA_FALSA[servico]
    a = d["attrs"]
    confere(d["nomes"] == ORDEM_DOS_ATRIBUTOS[servico], f"{etiqueta}: atributos (e a ordem) do script oficial + sandbox", d["nomes"])
    confere(a.get("sandbox") == SANDBOX[servico], f"{etiqueta}: sandbox", a.get("sandbox"))
    confere("srcdoc" not in a, f"{etiqueta}: sem srcdoc")
    src = urlparse(a["src"])
    confere(src.scheme == "https" and src.hostname == host, f"{etiqueta}: endereço https do serviço", a["src"])
    q = {k: v[0] for k, v in parse_qs(src.query).items()}
    confere(d["blockquotes"] == 0, f"{etiqueta}: o blockquote saiu (como o script oficial faz)", d["blockquotes"])
    if servico == "x":
        confere(d["pai"] == "twitter-tweet twitter-tweet-rendered" and d["avo"] == "embed", f"{etiqueta}: estrutura .embed > div.twitter-tweet.twitter-tweet-rendered > iframe", (d["pai"], d["avo"]))
        confere(d["paiEstilo"] == ESTILO_FINAL["caixa-x"], f"{etiqueta}: estilo da caixa do X", d["paiEstilo"])
        confere(a["style"] == ESTILO_FINAL["x"].format(h=h), f"{etiqueta}: estilo do iframe do X (com a altura do widget)", a["style"])
        confere(a["id"] == "twitter-widget-0" and q.get("embedId") == "twitter-widget-0", f"{etiqueta}: id e embedId", (a["id"], q.get("embedId")))
        confere(q.get("lang") in ("pt", "en") and q.get("theme") == "light" and q.get("width") == "550px" and q.get("hideCard") == "false" and q.get("hideThread") == "false" and q.get("dnt") == "true", f"{etiqueta}: parâmetros do X", q)
        confere(a["title"] in ("Post do X", "X Post"), f"{etiqueta}: título", a["title"])
    else:
        confere(d["pai"] == "embed", f"{etiqueta}: o iframe está direto no .embed (no lugar do blockquote)", d["pai"])
        confere(a["style"] == ESTILO_FINAL[servico], f"{etiqueta}: estilo do iframe (o do script oficial; nada vindo de mensagem)", a["style"])
        confere(a["height"] == str(h), f"{etiqueta}: atributo height = a altura do widget ({h}); o 0 não encolheu", a["height"])
    confere("access_token" not in a["src"] and "#" not in a["src"], f"{etiqueta}: o endereço não leva a âncora da página")
    # (o site usa box-sizing: border-box, então a borda de 1 px do Instagram fica dentro da altura, como com o script oficial)
    confere(abs(d["altura"] - h) < 1.5, f"{etiqueta}: altura na tela {h}", d["altura"])
    # o Instagram tem min-width: 326px no estilo oficial (o blockquote do código também): no celular passa 7 px do .embed, que rola por
    # dentro (overflow-x: auto), exatamente como antes; a página não ganha rolagem lateral (conferido abaixo)
    limite = max(d["larguraDoEmbed"], 326) if servico == "instagram" else d["larguraDoEmbed"]
    confere(d["largura"] <= limite + 0.5, f"{etiqueta}: a moldura cabe no .embed", (d["largura"], d["larguraDoEmbed"]))
    confere(d["visivel"] == "visible", f"{etiqueta}: a moldura está visível", d["visivel"])


def roteiro_um_post(browser, porta, servico, lang, largura, fotos):
    slug = NOTICIAS[servico]
    etiqueta = f"{servico}/{lang}/{largura}"
    v = Visitante(browser, porta, largura)
    pg = v.pg
    pg.add_init_script("try{localStorage.setItem('sb-sessao-falsa','SEGREDO-DA-SESSAO')}catch(e){}")
    v.abrir(f"/{lang}/news/{slug}/")
    endereco = pg.url
    host = HOSTS_DA_MOLDURA[servico]

    # 1. sem clique, a moldura aparece; nada de script de terceiros
    try:
        pg.wait_for_function("(host) => [...document.querySelectorAll('iframe')].some(i => new URL(i.src).hostname === host && getComputedStyle(i).visibility === 'visible')", arg=host, timeout=5000)
    except Exception as e:  # noqa: BLE001
        confere(False, f"{etiqueta}: a moldura apareceu sozinha (sem clique)", e)
    pg.wait_for_timeout(500)
    scripts_externos = pg.evaluate("Array.from(document.scripts).map(s => s.src).filter(s => s && new URL(s).origin !== location.origin)")
    confere(scripts_externos == [], f"{etiqueta}: nenhum <script src> de outro site na página", scripts_externos)
    confere(not any(SCRIPTS_PROIBIDOS.search(u) and TERCEIROS.search(urlparse(u).hostname or "") for u in v.pedidos), f"{etiqueta}: nenhum widgets.js/embed.js foi pedido")
    confere(v.hosts_de_terceiros() == [host], f"{etiqueta}: pedidos de terceiros só ao serviço do post ({host})", v.hosts_de_terceiros())
    conferir_moldura(pg, servico, etiqueta)
    confere(sem_rolagem_lateral(pg), f"{etiqueta}: sem rolagem lateral")
    foto(pg, fotos, f"{servico}-{lang}-{largura}", ".embed")

    # 2. o isolamento, visto de dentro do widget falso
    quadro = next((fr for fr in pg.frames if urlparse(fr.url).hostname == host), None)
    confere(quadro is not None, f"{etiqueta}: o Playwright achou a janela do widget falso")
    if quadro is not None:
        s = quadro.evaluate("window.__sondagem")
        confere(s["origem"] == f"https://{host}", f"{etiqueta}: o widget roda na origem DELE", s["origem"])
        for chave in ("lerLocalStorageDaPagina", "escreverLocalStorageDaPagina", "lerDocumentoDoTopo", "lerCookieDaPagina"):
            confere(str(s[chave]).startswith("ERRO:SecurityError"), f"{etiqueta}: widget × {chave} → SecurityError", s[chave])
        confere(s["proprioLocalStorage"] == "1", f"{etiqueta}: o widget usa o localStorage DELE normalmente", s["proprioLocalStorage"])
    pg.wait_for_timeout(200)
    confere(pg.url == endereco, f"{etiqueta}: o widget não conseguiu navegar a página", pg.url)
    confere(pg.evaluate("localStorage.getItem('sb-sessao-falsa')") == "SEGREDO-DA-SESSAO" and pg.evaluate("localStorage.getItem('invadido')") is None, f"{etiqueta}: o localStorage da página está intacto")

    # 3. mensagens falsas de outra janela são ignoradas
    antes = pg.evaluate(DESCREVER, host)
    pg.evaluate(
        """() => {
      const i = document.createElement('iframe'); i.setAttribute('sandbox', 'allow-scripts'); i.hidden = true;
      i.srcdoc = '<script>for (const m of [JSON.stringify({type:"resize.embed",data:2999}),JSON.stringify({type:"MEASURE",details:{height:2999}}),JSON.stringify({"twttr.embed":{method:"twttr.private.resize",id:"twitter-widget-0",params:[{height:2999}]}})]) parent.postMessage(m, "*")<\\/script>';
      document.body.append(i);
      window.postMessage(JSON.stringify({type: 'resize.embed', data: 2999}), '*');
      window.postMessage(JSON.stringify({type: 'MEASURE', details: {height: 2999}}), '*');
      window.postMessage(JSON.stringify({'twttr.embed': {method: 'twttr.private.resize', id: 'twitter-widget-0', params: [{height: 2999}]}}), '*');
    }"""
    )
    pg.wait_for_timeout(500)
    depois = pg.evaluate(DESCREVER, host)
    confere(antes and depois and antes["altura"] == depois["altura"] and antes["attrs"] == depois["attrs"], f"{etiqueta}: mensagens de outro iframe e da própria página não mudam nada", (antes and antes["altura"], depois and depois["altura"]))
    confere(v.erros == [], f"{etiqueta}: nenhum erro de JavaScript na página", v.erros[:2])
    v.fechar()


def roteiro_alternancia(browser, porta, lang, largura, fotos):
    etiqueta = f"alt/{lang}/{largura}"
    v = Visitante(browser, porta, largura)
    v.abrir(f"/{lang}/news/{NOTICIAS['alt']}/")
    pg = v.pg
    pg.wait_for_timeout(600)
    servicos = pg.locator(".embed-alt .embed-panel").evaluate_all("ps => ps.map(p => p.querySelector('.reddit-embed-bq, .instagram-media, .twitter-tweet, iframe[src*=\"reddit\"], iframe[src*=\"instagram\"], iframe[src*=\"twitter\"]')).map(e => !e ? '' : /reddit/.test(e.className + (e.src || '')) ? 'reddit' : /instagram/.test(e.className + (e.src || '')) ? 'instagram' : 'x')")
    confere(servicos[:2] == ["reddit", "instagram"], f"{etiqueta}: a alternância é Reddit | Instagram", servicos)
    confere(v.hosts_de_terceiros() == ["embed.reddit.com"], f"{etiqueta}: só o painel ligado (Reddit) pediu algo", v.hosts_de_terceiros())
    conferir_moldura(pg, "reddit", f"{etiqueta} painel 1")
    confere(pg.locator("iframe[src*='instagram.com']").count() == 0, f"{etiqueta}: o painel escondido (Instagram) ainda não tem moldura")
    foto(pg, fotos, f"alt-{lang}-{largura}-1", ".embed-alt")
    pg.locator(".embed-alt .embed-btn").nth(1).click()
    try:
        pg.wait_for_function("() => { const f = document.querySelector('iframe[src*=\"instagram.com\"]'); return f && f.getAttribute('height') === '917'; }", timeout=5000)
    except Exception as e:  # noqa: BLE001
        confere(False, f"{etiqueta}: ao aparecer, o painel 2 ganhou a moldura com a altura certa", e)
    pg.wait_for_timeout(300)
    conferir_moldura(pg, "instagram", f"{etiqueta} painel 2")
    foto(pg, fotos, f"alt-{lang}-{largura}-2", ".embed-alt")
    pg.locator(".embed-alt .embed-btn").nth(0).click()
    pg.wait_for_timeout(300)
    d = pg.evaluate(DESCREVER, "embed.reddit.com")
    confere(d and abs(d["altura"] - ALTURA_FALSA["reddit"]) < 1.5, f"{etiqueta}: de volta ao painel 1, o Reddit continua do tamanho certo", d and d["altura"])
    confere(pg.locator("iframe[src*='reddit.com'], iframe[src*='instagram.com']").count() == 2, f"{etiqueta}: uma moldura por post, sem repetir")
    confere(sem_rolagem_lateral(pg), f"{etiqueta}: sem rolagem lateral")
    confere(v.erros == [], f"{etiqueta}: nenhum erro de JavaScript", v.erros[:2])
    v.fechar()


def roteiro_sem_javascript(browser, porta, fotos):
    for servico in ("reddit", "x", "instagram"):
        etiqueta = f"sem-js/{servico}"
        v = Visitante(browser, porta, 1100, js=False)
        v.abrir(f"/pt/news/{NOTICIAS[servico]}/")
        pg = v.pg
        confere(pg.locator(".embed blockquote").first.is_visible(), f"{etiqueta}: o blockquote do autor aparece (como antes)")
        confere(pg.locator("iframe[src*='reddit.com'], iframe[src*='twitter.com'], iframe[src*='instagram.com']").count() == 0, f"{etiqueta}: nenhuma moldura")
        confere(v.hosts_de_terceiros() == [], f"{etiqueta}: zero pedidos a terceiros", v.hosts_de_terceiros())
        if servico == "x":
            foto(pg, fotos, "sem-js-x-1100", ".embed")
        v.fechar()


def roteiro_servico_mudo(browser, porta, fotos):
    """O serviço não responde (bloqueado): a moldura sai e o blockquote volta depois de 30 s."""
    for servico in ("reddit", "x"):
        etiqueta = f"mudo/{servico}"
        v = Visitante(browser, porta, 1100, servicos_mudos=True)
        v.abrir(f"/pt/news/{NOTICIAS[servico]}/")
        pg = v.pg
        if servico == "reddit":
            confere(pg.locator(".embed iframe[src*='reddit.com']").count() == 1, f"{etiqueta}: o iframe toma o lugar do blockquote logo de saída (como o oficial)")
        else:
            confere(pg.locator(".embed blockquote.twitter-tweet").first.is_visible(), f"{etiqueta}: o blockquote do X fica à vista enquanto espera")
        pg.wait_for_timeout(31_500)
        confere(pg.locator(".embed blockquote").first.is_visible(), f"{etiqueta}: depois de 30 s sem resposta, o blockquote do autor está à vista")
        confere(pg.locator("iframe[src*='reddit.com'], iframe[src*='twitter.com']").count() == 0, f"{etiqueta}: a moldura saiu")
        foto(pg, fotos, f"mudo-{servico}-1100", ".embed")
        v.fechar()


def principal():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dist", default="dist", help="pasta do site Astro construído (padrão: dist)")
    ap.add_argument("--fotos", default="", help="pasta onde salvar as capturas (fora do projeto)")
    ap.add_argument("--lento", action="store_true", help="inclui o serviço que não responde (espera 30 s duas vezes)")
    args = ap.parse_args()
    pasta = os.path.abspath(args.dist)
    if not os.path.isfile(os.path.join(pasta, "pt", "news", NOTICIAS["reddit"], "index.html")):
        print(f"não achei o site em {pasta}: rode `pnpm build` antes", file=sys.stderr)
        return 2
    servidor = servir(pasta)
    porta = servidor.server_address[1]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            for lang in ("pt", "en"):
                for largura in (1100, 390):
                    for servico in ("reddit", "x", "instagram"):
                        roteiro_um_post(browser, porta, servico, lang, largura, args.fotos)
                    roteiro_alternancia(browser, porta, lang, largura, args.fotos)
            roteiro_sem_javascript(browser, porta, args.fotos)
            if args.lento:
                roteiro_servico_mudo(browser, porta, args.fotos)
        finally:
            browser.close()
    servidor.shutdown()
    print(f"{len(PASSOS)} conferências, {len(FALHAS)} falha(s)")
    for f in FALHAS:
        print("FALHOU:", f)
    return 1 if FALHAS else 0


if __name__ == "__main__":
    sys.exit(principal())
