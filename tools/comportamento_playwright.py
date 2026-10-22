#!/usr/bin/env python3
"""T18 — Comportamentos do site no navegador, Astro × Python: o que os outros roteiros (seletor, notícias, comentários, ordem) não cobrem.

Uso (a ferramenta sobe os próprios servidores, que imitam o GitHub Pages: arquivo que não existe → /404.html com código 404;
pasta sem barra → redireciona para a barra). Rode sob `timeout`:
  timeout 900 python3 tools/comportamento_playwright.py --python <site Python publicado> --astro <site Astro publicado> \\
      [--previa-python <site Python com rascunhos> --previa-astro <site Astro com rascunhos>] [--fotos <pasta fora do projeto>]
(Os sites: veja o topo de tools/paridade_t18.py; `python3 tools/paridade_t18.py --gerar --pasta <dir>` deixa os seis prontos.)

O que confere, nos dois sites, com o MESMO roteiro, e compara o resultado:
  1. tela de abertura: na 1ª visita a classe `intro` entra no <html>, o vídeo /intro/logo.webm é criado, a tela some sozinha
     (depois do tempo mínimo) e o sessionStorage guarda `hc-intro`; na 2ª página da visita ela não aparece; com "reduzir
     movimento" não aparece; com ?intro aparece de novo;
  2. carrossel da home (1100 e 390 px): o trilho e as duas setas são criados, cada clique na seta anda o mesmo tanto, as setas
     somem/aparecem nas pontas do mesmo jeito; teclado (Tab até a seta + Enter). DESDE A T17j (pedido do autor, 21/10/2026) a home do
     Astro é diferente de propósito (até 4 histórias; a seta da direita é o link "Ver todas as histórias", com o rótulo no mouse/foco;
     no celular o link fica abaixo, sempre à vista): o roteiro roda nos dois lados e o resultado vai para o --json, mas NÃO é comparado;
     quem prova a home nova é tools/home_playwright.py;
  3. carta que vira (Ossos do Ofício 01, só na prévia: a obra está em rascunho): tabindex/role/aria-pressed, clique, Enter e espaço;
  4. links de idioma: em várias páginas, o menu de idioma abre, o link leva à mesma página no outro idioma (que existe) e clicar
     fora fecha o menu;
  5. cabeçalho no celular (390 px): todos os itens do menu visíveis, sem rolagem horizontal, o menu de idioma cabe na tela;
  6. a 404: um endereço que não existe mostra a página 404 (código 404) com os links de volta;
  7. os endereços do site antigo (config.json → redirects): cada um termina no mesmo lugar nos dois sites;
  8. a raiz /: com o navegador em português vai para /pt/, em inglês /en/, em francês /en/ (padrão), e localStorage `lang` vence.
Erros de JavaScript na página contam como falha. Nada sai para a internet (tudo que não é o servidor local é bloqueado).
Sai com 0 se tudo for igual e certo nos dois, 1 se não.
"""
import argparse, functools, http.server, json, os, socketserver, sys, threading
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
RAIZ = Path(__file__).resolve().parent.parent
FALHAS: list[str] = []
OKS: list[str] = []


def servidor(pasta: str, porta: int):
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=pasta, **k)

        def log_message(self, *a):
            pass

        def send_error(self, code, message=None, explain=None):
            if code == 404 and os.path.isfile(os.path.join(pasta, "404.html")):   # como o GitHub Pages
                dados = open(os.path.join(pasta, "404.html"), "rb").read()
                self.send_response(404)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(dados)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(dados)
                return
            super().send_error(code, message, explain)

    class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
        allow_reuse_address = True

        def handle_error(self, request, client_address):   # o navegador fechou a conexão no meio (troca de página): não é erro do site
            pass

    s = S(("127.0.0.1", porta), H)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


def contexto(br, base, largura=1100, pular_abertura=True, **kw):
    ctx = br.new_context(viewport={"width": largura, "height": 900}, **kw)
    ctx.route(lambda u: not u.startswith(base) and not u.startswith("data:") and not u.startswith("blob:"), lambda r: r.abort())
    if pular_abertura:
        ctx.add_init_script("try{sessionStorage.setItem('hc-intro','1')}catch(e){}")
    return ctx


def pagina(ctx, erros):
    pg = ctx.new_page()
    pg.set_default_timeout(30000)
    pg.on("pageerror", lambda e: erros.append(str(e)))
    return pg


# ───────────── 1. abertura ─────────────
ESTADO_ABERTURA = """() => { const i = document.getElementById('intro'); const v = i && i.querySelector('video');
  let s = null; try { s = sessionStorage.getItem('hc-intro'); } catch (e) {}
  return { classe: document.documentElement.classList.contains('intro'), video: v ? v.getAttribute('src') || v.src : null,
           visivel: !!i && getComputedStyle(i).display !== 'none' && getComputedStyle(i).visibility !== 'hidden' && parseFloat(getComputedStyle(i).opacity) > 0.01,
           sessao: s }; }"""


def abertura(br, base, erros):
    r = {}
    ctx = contexto(br, base, pular_abertura=False, reduced_motion="no-preference")
    pg = pagina(ctx, erros)
    pg.goto(base + "/pt/", wait_until="domcontentloaded")
    r["logo_no_inicio"] = pg.evaluate(ESTADO_ABERTURA)
    r["logo_no_inicio"]["video"] = (r["logo_no_inicio"]["video"] or "").replace(base, "")
    # some sozinha: espera até 15 s pela classe sair
    t = pg.evaluate("""() => new Promise(ok => { const t0 = performance.now(); const f = () => {
        if (!document.documentElement.classList.contains('intro')) ok(Math.round((performance.now() - t0) / 500) * 500); else if (performance.now() - t0 > 15000) ok(-1); else setTimeout(f, 50); }; f(); })""")
    r["some_sozinha"] = t >= 0
    pg.wait_for_timeout(1500)
    r["depois"] = pg.evaluate(ESTADO_ABERTURA)
    r["depois"]["video"] = None
    pg.goto(base + "/pt/works/", wait_until="load")
    r["segunda_pagina"] = pg.evaluate("document.documentElement.classList.contains('intro')")
    pg.goto(base + "/pt/works/?intro", wait_until="domcontentloaded")
    r["com_?intro"] = pg.evaluate("document.documentElement.classList.contains('intro')")
    ctx.close()
    ctx = contexto(br, base, pular_abertura=False, reduced_motion="reduce")
    pg = pagina(ctx, erros)
    pg.goto(base + "/pt/", wait_until="domcontentloaded")
    r["reduzir_movimento"] = pg.evaluate("document.documentElement.classList.contains('intro')")
    ctx.close()
    certo = r["logo_no_inicio"]["classe"] and r["logo_no_inicio"]["video"] == "/intro/logo.webm" and r["some_sozinha"] and not r["depois"]["classe"] \
        and r["depois"]["sessao"] == "1" and not r["segunda_pagina"] and r["com_?intro"] and not r["reduzir_movimento"]
    return r, certo


# ───────────── 2. carrossel ─────────────
ESTADO_CARROSSEL = """() => [...document.querySelectorAll('.rail')].map(r => { const w = r.querySelector('.works');
  return { classes: r.className, botoes: [...r.querySelectorAll('button')].map(b => ({ classe: b.className, rotulo: b.getAttribute('aria-label'),
           oculto: b.hidden || getComputedStyle(b).display === 'none' || getComputedStyle(b).visibility === 'hidden' || parseFloat(getComputedStyle(b).opacity) < 0.05,
           desligado: b.disabled })),
           rolagem: Math.round(w.scrollLeft), largura: w.scrollWidth > w.clientWidth, fl: getComputedStyle(w).getPropertyValue('--fl').trim(), fr: getComputedStyle(w).getPropertyValue('--fr').trim() }; })"""


def carrossel(br, base, largura, erros):
    ctx = contexto(br, base, largura, reduced_motion="reduce")
    pg = pagina(ctx, erros)
    pg.goto(base + "/pt/", wait_until="load")
    pg.wait_for_timeout(400)
    fotos = [("inicial", pg.evaluate(ESTADO_CARROSSEL))]
    if pg.query_selector(".rail-home"):  # T17j: a home nova do Astro (não comparada aqui; tools/home_playwright.py)
        ctx.close()
        return fotos, True
    if not fotos[0][1]:
        ctx.close()
        return fotos, False
    # a seta da direita anda um cartão por clique; no fim ela vira link para Histórias (data-more-url) — só clica enquanto não é link
    def seta(qual):
        b = pg.query_selector(f".rail >> nth=0 >> .rail-{qual}")
        if b and b.is_visible() and "is-link" not in (b.get_attribute("class") or ""):
            b.click()
            pg.wait_for_timeout(700)
            return True
        return False
    for i in range(8):
        if not seta("next"):
            break
        fotos.append((f"seta direita {i + 1}", pg.evaluate(ESTADO_CARROSSEL)))
    for i in range(8):
        if not seta("prev"):
            break
        fotos.append((f"seta esquerda {i + 1}", pg.evaluate(ESTADO_CARROSSEL)))
    # teclado: foca a seta da direita e aperta Enter (só se ela ainda anda; em 1100 px os 3 cartões cabem e ela já nasce link)
    if "is-link" not in (pg.get_attribute(".rail >> nth=0 >> .rail-next", "class") or ""):
        pg.focus(".rail >> nth=0 >> .rail-next")
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(700)
        fotos.append(("teclado: Enter na seta", pg.evaluate(ESTADO_CARROSSEL)))
    # até o fim: a seta vira link e leva à página de Histórias
    for _ in range(10):
        if not seta("next"):
            break
    b = pg.query_selector(".rail >> nth=0 >> .rail-next")
    classe = b.get_attribute("class") or ""
    fotos.append(("no fim, a seta", {"classe": classe, "rotulo": b.get_attribute("aria-label"), "estado": pg.evaluate(ESTADO_CARROSSEL)}))
    if "is-link" in classe:
        with pg.expect_navigation():
            b.click()
        fotos.append(("clique no link do fim", pg.url.replace(base, "")))
        sel = fotos[-1][1] == "/pt/works/"
    else:
        # B31 (já acontece no site atual, nos dois geradores): no celular o scroll-snap para o último cartão ~47 px antes do fim da
        # rolagem, e a seta da direita nunca vira o link "ver todas" (fica parada, sem fazer nada). Registrado para o autor.
        b.click()
        pg.wait_for_timeout(700)
        fotos.append(("clique na seta do fim (não faz nada: B31)", pg.url.replace(base, "")))
        sel = largura < 1100
    andou = any(isinstance(f, list) and f and f[0]["rolagem"] > 0 for _, f in fotos)
    ctx.close()
    return fotos, (andou or largura >= 1100) and sel


# ───────────── 3. carta ─────────────
ESTADO_CARTA = """() => [...document.querySelectorAll('.flip-card')].map(c => ({ tab: c.getAttribute('tabindex'), role: c.getAttribute('role'),
   pressed: c.getAttribute('aria-pressed'), virada: c.classList.contains('flipped') }))"""


def carta(br, base, erros):
    ctx = contexto(br, base, reduced_motion="reduce")
    pg = pagina(ctx, erros)
    r = pg.goto(base + "/en/works/all-in-a-nights-work/01/", wait_until="load")
    if not r or r.status != 200:
        ctx.close()
        return [("página", f"status {r.status if r else '?'}")], False
    fotos = [("inicial", pg.evaluate(ESTADO_CARTA))]
    pg.click(".flip-card")
    fotos.append(("clique", pg.evaluate(ESTADO_CARTA)))
    pg.click(".flip-card")
    fotos.append(("clique de novo", pg.evaluate(ESTADO_CARTA)))
    pg.focus(".flip-card")
    pg.keyboard.press("Enter")
    fotos.append(("Enter", pg.evaluate(ESTADO_CARTA)))
    pg.keyboard.press(" ")
    fotos.append(("espaço", pg.evaluate(ESTADO_CARTA)))
    pos = pg.evaluate("scrollY")
    certo = bool(fotos[0][1]) and fotos[1][1][0]["virada"] and not fotos[2][1][0]["virada"] and fotos[3][1][0]["virada"] and not fotos[4][1][0]["virada"]
    fotos.append(("a página não rolou com o espaço", pos == pg.evaluate("scrollY")))
    ctx.close()
    return fotos, certo


# ───────────── 4 e 5. idioma e cabeçalho ─────────────
PAGINAS_IDIOMA = ["/pt/", "/en/works/", "/pt/works/light-and-blood/", "/en/works/light-and-blood/02/", "/pt/works/firestriker/01/",
                  "/pt/news/", "/en/news/2025-04-18-saiu-pederneira/", "/pt/about/", "/en/support/", "/404.html"]


def idioma(br, base, largura, erros):
    ctx = contexto(br, base, largura, reduced_motion="reduce")
    pg = pagina(ctx, erros)
    saida = []
    for c in PAGINAS_IDIOMA:
        pg.goto(base + c, wait_until="load")
        cab = pg.evaluate("""() => { const h = document.querySelector('.site-header'); const nav = h.querySelector('.main-nav');
          const itens = [...nav.querySelectorAll(':scope > a, :scope > details > summary')].map(a => { const r = a.getBoundingClientRect();
            return { texto: a.textContent.trim(), visivel: r.width > 0 && r.height > 0 && r.right <= innerWidth + 0.5 && r.left >= -0.5 }; });
          return { itens, rolagemLateral: document.documentElement.scrollWidth > innerWidth, alturaDoCabecalho: Math.round(h.getBoundingClientRect().height) }; }""")
        pg.click(".lang-dd > summary")
        pg.wait_for_timeout(150)
        menu = pg.evaluate("""() => { const d = document.querySelector('.lang-dd'); const m = d.querySelector('.dd-menu'); const r = m.getBoundingClientRect();
          return { aberto: d.open, cabe: r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.width > 0, links: [...m.querySelectorAll('a')].map(a => a.getAttribute('href')) }; }""")
        pg.mouse.click(5, 880)
        pg.wait_for_timeout(150)
        fechou = not pg.evaluate("document.querySelector('.lang-dd').open")
        destino = None
        if menu["links"]:
            pg.click(".lang-dd > summary")
            with pg.expect_navigation():
                pg.click(".lang-dd .dd-menu a >> nth=0")
            destino = {"url": pg.url.replace(base, ""), "lang": pg.evaluate("document.documentElement.lang"), "titulo": pg.title()}
        saida.append({"pagina": c, "cabecalho": cab, "menu": menu, "fecha_ao_clicar_fora": fechou, "destino": destino})
    ctx.close()
    # B32 (já acontece no site atual, nos dois geradores): na 404, a 390 px, o menu tem só 2 itens e o seletor de idioma fica na
    # ponta direita; o menu aberto ("Português") passa ~75 px da borda da tela e aparece cortado. Registrado para o autor.
    for s_ in saida:
        if largura < 1100 and s_["pagina"] == "/404.html" and not s_["menu"]["cabe"]:
            s_["menu"]["cabe"] = "não (B32, já existe no site atual)"
    certo = all(s["menu"]["aberto"] and s["menu"]["cabe"] and s["fecha_ao_clicar_fora"] and not s["cabecalho"]["rolagemLateral"]
                and all(i["visivel"] for i in s["cabecalho"]["itens"]) and (s["destino"] is None or s["destino"]["url"] == s["menu"]["links"][0])
                for s in saida)
    return saida, certo


# ───────────── 6, 7, 8. 404, site antigo, raiz ─────────────
def enderecos(br, base, erros):
    saida = {}
    ctx = contexto(br, base, reduced_motion="reduce")
    pg = pagina(ctx, erros)
    for c in ["/pt/nao-existe/", "/en/works/nao-existe/", "/imagem-que-nao-existe.png"]:
        r = pg.goto(base + c, wait_until="load")
        saida[f"404 {c}"] = {"status": r.status, "titulo": pg.title(), "h1": pg.evaluate("(document.querySelector('h1')||{}).textContent||''").strip(),
                             "links": pg.evaluate("[...document.querySelectorAll('main a')].map(a => a.getAttribute('href'))")}
    redirects = json.loads((RAIZ / "config.json").read_text("utf-8"))["redirects"]
    for antigo in sorted(redirects):
        r = pg.goto(base + "/" + antigo, wait_until="load")
        pg.wait_for_timeout(300)
        saida[f"site antigo /{antigo}"] = {"status_final": r.status if r else None, "fim": pg.url.replace(base, ""), "lang": pg.evaluate("document.documentElement.lang")}
    ctx.close()
    for nome, kw, guardado in [("navegador pt-BR", {"locale": "pt-BR"}, None), ("navegador en-US", {"locale": "en-US"}, None),
                               ("navegador fr-FR", {"locale": "fr-FR"}, None), ("pt-BR com localStorage lang=en", {"locale": "pt-BR"}, "en")]:
        ctx = contexto(br, base, reduced_motion="reduce", **kw)
        if guardado:
            ctx.add_init_script(f"try{{localStorage.setItem('lang','{guardado}')}}catch(e){{}}")
        pg = pagina(ctx, erros)
        pg.goto(base + "/", wait_until="load")
        pg.wait_for_timeout(400)
        saida[f"raiz, {nome}"] = pg.url.replace(base, "")
        ctx.close()
    certo = all(v["status"] == 404 and v["links"] for k, v in saida.items() if k.startswith("404")) \
        and saida["raiz, navegador pt-BR"] == "/pt/" and saida["raiz, navegador en-US"] == "/en/" and saida["raiz, navegador fr-FR"] == "/en/" \
        and saida["raiz, pt-BR com localStorage lang=en"] == "/en/" \
        and all(v["fim"] == redirects[k.split("/", 1)[1]] or (redirects[k.split("/", 1)[1]] == "/" and v["fim"] in ("/en/", "/pt/"))
                for k, v in saida.items() if k.startswith("site antigo"))
    return saida, certo


def comparar(nome, py, astro, certo_py, certo_astro):
    if py != astro:
        FALHAS.append(f"{nome}: Python × Astro diferentes\n    Python: {json.dumps(py, ensure_ascii=False)[:1500]}\n    Astro:  {json.dumps(astro, ensure_ascii=False)[:1500]}")
    elif not (certo_py and certo_astro):
        FALHAS.append(f"{nome}: iguais, mas não fazem o que devem: {json.dumps(astro, ensure_ascii=False)[:1500]}")
    else:
        OKS.append(nome)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--python", required=True)
    ap.add_argument("--astro", required=True)
    ap.add_argument("--previa-python")
    ap.add_argument("--previa-astro")
    ap.add_argument("--json")
    a = ap.parse_args()
    sites = {"python": servidor(os.path.abspath(a.python), 8831), "astro": servidor(os.path.abspath(a.astro), 8832)}
    if a.previa_python and a.previa_astro:
        sites["previa-python"] = servidor(os.path.abspath(a.previa_python), 8833)
        sites["previa-astro"] = servidor(os.path.abspath(a.previa_astro), 8834)
    base = {k: f"http://127.0.0.1:{s.server_address[1]}" for k, s in sites.items()}
    tudo = {}
    with sync_playwright() as p:
        br = p.chromium.launch()
        erros = {k: [] for k in base}
        for lado in ("python", "astro"):
            tudo.setdefault(lado, {})["abertura"] = abertura(br, base[lado], erros[lado])
            for w in (1100, 390):
                tudo[lado][f"carrossel {w}"] = carrossel(br, base[lado], w, erros[lado])
                tudo[lado][f"idioma e cabeçalho {w}"] = idioma(br, base[lado], w, erros[lado])
            tudo[lado]["404, site antigo e raiz"] = enderecos(br, base[lado], erros[lado])
        for teste in tudo["python"]:
            if teste.startswith("carrossel "):  # T17j: diferença decidida (ver o topo); tools/home_playwright.py prova a home nova
                OKS.append(f"{teste}: não comparado (T17j, home nova; ver tools/home_playwright.py)")
                continue
            comparar(teste, tudo["python"][teste][0], tudo["astro"][teste][0], tudo["python"][teste][1], tudo["astro"][teste][1])
        if "previa-python" in base:
            cp = carta(br, base["previa-python"], erros["previa-python"])
            ca = carta(br, base["previa-astro"], erros["previa-astro"])
            comparar("carta que vira (prévia)", cp[0], ca[0], cp[1], ca[1])
            tudo["carta"] = {"python": cp, "astro": ca}
        for k, v in erros.items():
            if v:
                FALHAS.append(f"erros de JavaScript em {k}: {v[:5]}")
        br.close()
    for s in sites.values():
        s.shutdown()
    for o in OKS:
        print(f"  ok    {o}")
    for f in FALHAS:
        print(f"  FALHA {f}")
    if a.json:
        Path(a.json).write_text(json.dumps(tudo, ensure_ascii=False, indent=1, default=str))
    print("Tudo certo." if not FALHAS else f"{len(FALHAS)} falha(s).")
    return 1 if FALHAS else 0


if __name__ == "__main__":
    sys.exit(main())
