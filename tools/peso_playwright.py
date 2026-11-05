#!/usr/bin/env python3
"""Mede o PESO TRANSFERIDO das páginas de um site gerado (T17), do jeito que o navegador do visitante o veria.

Uso (a ferramenta mesma sobe o servidor; rode sempre sob `timeout`):
  timeout 600 python3 tools/peso_playwright.py --dist dist --porta 8795 --saida <pasta fora do projeto>/peso-depois.json
  timeout 600 python3 tools/peso_playwright.py --dist <cópia do dist antigo> --porta 8796 --saida .../peso-antes.json

O que ela faz, por página e por perfil (computador 1100 px com tela comum; celular 390 px com tela 2x):
  - abre a página num Chromium do Playwright, com o cache vazio (contexto novo: a mesma imagem pedida duas vezes na página vem da memória, como no navegador de verdade) e SEM pular a tela de abertura ("primeira visita"),
    ou pulando-a ("visita seguinte", sessionStorage hc-intro — o padrão do site: a abertura aparece uma vez por visita);
  - mede os bytes que VIAJARAM (Network.loadingFinished.encodedDataLength do protocolo do Chrome: cabeçalhos + corpo, já
    comprimido), somados por tipo: HTML, CSS, JS, imagens, fontes, vídeo, outros;
  - em duas fotos: "dobra" (logo que a página termina de carregar, sem rolar) e "inteira" (depois de rolar até o fim,
    que dispara as imagens com loading="lazy").
O servidor comprime com gzip o que é texto (HTML, CSS, JS, SVG, JSON, XML), como a hospedagem faz, e não comprime imagem,
fonte nem vídeo (já vão comprimidos). Nada sai para a internet: o Google Fonts e o jsDelivr são BLOQUEADOS de propósito
(o sandbox não os alcança); as fontes que o site antigo pediria a eles aparecem numa lista à parte, "bloqueados".
"""
import argparse, gzip, http.server, json, os, socketserver, sys, threading, urllib.parse
from playwright.sync_api import sync_playwright

TEXTOS = (".html", ".css", ".js", ".mjs", ".svg", ".json", ".xml", ".txt")
TIPOS = {
    "html": (".html",), "css": (".css",), "js": (".js", ".mjs"),
    "imagens": (".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".svg", ".ico"),
    "fontes": (".woff2", ".woff", ".ttf", ".otf"), "video": (".webm", ".mp4"),
}
PERFIS = {
    "computador": {"viewport": {"width": 1100, "height": 800}, "dpr": 1},
    "celular": {"viewport": {"width": 390, "height": 844}, "dpr": 2},
}


def servidor(pasta: str, porta: int):
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=pasta, **k)

        def log_message(self, *a):
            pass

        def send_head(self):  # gzip só para texto
            caminho = self.translate_path(self.path)
            if os.path.isdir(caminho):
                caminho = os.path.join(caminho, "index.html")
            if not os.path.isfile(caminho) or not caminho.lower().endswith(TEXTOS) or "gzip" not in self.headers.get("Accept-Encoding", ""):
                return super().send_head()
            dados = gzip.compress(open(caminho, "rb").read(), 6)
            self.send_response(200)
            self.send_header("Content-Type", self.guess_type(caminho))
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(len(dados)))
            self.end_headers()
            import io
            return io.BytesIO(dados)

    class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
        allow_reuse_address = True

    s = S(("127.0.0.1", porta), H)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


def tipo_de(url: str) -> str:
    caminho = urllib.parse.urlparse(url).path.lower()
    for nome, exts in TIPOS.items():
        if caminho.endswith(exts):
            return nome
    if caminho.endswith("/") or "." not in caminho.rsplit("/", 1)[-1]:
        return "html"
    return "outros"


def medir(browser, base: str, caminho: str, perfil: dict, com_abertura: bool) -> dict:
    ctx = browser.new_context(viewport=perfil["viewport"], device_scale_factor=perfil["dpr"], bypass_csp=False)
    pg = ctx.new_page()
    pg.set_default_timeout(60000)
    if not com_abertura:
        pg.add_init_script("try{sessionStorage.setItem('hc-intro','1')}catch(e){}")
    bloqueados: list[str] = []

    def bloquear(r):
        bloqueados.append(r.request.url)
        r.abort()

    pg.route("**/fonts.googleapis.com/**", bloquear)
    pg.route("**/fonts.gstatic.com/**", bloquear)
    pg.route("**/cdn.jsdelivr.net/**", bloquear)
    # só o que vem do próprio site conta; outros domínios (YouTube, Instagram…) também ficam de fora, sem rede
    pg.route(lambda u: not u.startswith(base) and not u.startswith("data:") and not u.startswith("blob:"), lambda r: (bloqueados.append(r.request.url), r.abort()))
    cdp = ctx.new_cdp_session(pg)
    cdp.send("Network.enable")
    pedidos: dict[str, dict] = {}
    cdp.on("Network.requestWillBeSent", lambda e: pedidos.setdefault(e["requestId"], {"url": e["request"]["url"], "bytes": 0, "ok": False}))
    cdp.on("Network.loadingFinished", lambda e: pedidos.get(e["requestId"], {}).update({"bytes": e["encodedDataLength"], "ok": True}))

    def foto() -> dict:
        por_tipo: dict[str, int] = {}
        quantos: dict[str, int] = {}
        arquivos = []
        for p in pedidos.values():
            if not p["ok"] or not p["url"].startswith(base):
                continue
            t = tipo_de(p["url"])
            por_tipo[t] = por_tipo.get(t, 0) + p["bytes"]
            quantos[t] = quantos.get(t, 0) + 1
            arquivos.append((p["bytes"], urllib.parse.unquote(p["url"][len(base):])))
        arquivos.sort(reverse=True)
        return {"total": sum(por_tipo.values()), "por_tipo": por_tipo, "pedidos": sum(quantos.values()), "quantos": quantos, "maiores": arquivos[:8]}

    pg.goto(base + caminho, wait_until="load")
    pg.wait_for_timeout(1500)
    if com_abertura:
        pg.wait_for_timeout(2500)  # o vídeo da abertura
    pg.wait_for_load_state("networkidle")
    dobra = foto()
    altura = pg.evaluate("document.documentElement.scrollHeight")
    y = 0
    while y < altura:
        y += perfil["viewport"]["height"] // 2
        pg.evaluate(f"window.scrollTo(0,{y})")
        pg.wait_for_timeout(120)
        altura = pg.evaluate("document.documentElement.scrollHeight")
    pg.wait_for_timeout(1200)
    pg.wait_for_load_state("networkidle")
    inteira = foto()
    ctx.close()
    return {"dobra": dobra, "inteira": inteira, "bloqueados": sorted(set(bloqueados))}


PAGINAS = [
    "/pt/", "/pt/works/", "/pt/works/light-and-blood/", "/en/works/all-in-a-nights-work/01/", "/pt/works/firestriker/01/",
    "/pt/works/light-and-blood/01/", "/pt/news/", "/pt/news/2025-12-14-nova-arte-oficial/", "/pt/news/2024-06-13-primeiro-video-hdvr/",
    "/pt/news/2025-04-18-saiu-pederneira/", "/pt/about/",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", required=True)
    ap.add_argument("--porta", type=int, default=8795)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--paginas", nargs="*", default=PAGINAS)
    ap.add_argument("--perfis", nargs="*", default=list(PERFIS))
    a = ap.parse_args()
    s = servidor(os.path.abspath(a.dist), a.porta)
    base = f"http://127.0.0.1:{a.porta}"
    res: dict = {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        for perfil in a.perfis:
            for caminho in a.paginas:
                for abertura in (False, True):
                    # a primeira visita só importa na home (é onde a abertura aparece primeiro) e numa página de capítulo
                    if abertura and caminho not in ("/pt/", "/en/works/all-in-a-nights-work/01/"):
                        continue
                    chave = f"{perfil}|{caminho}|{'primeira-visita' if abertura else 'visita-seguinte'}"
                    try:
                        res[chave] = medir(b, base, caminho, PERFIS[perfil], abertura)
                    except Exception as e:  # noqa: BLE001
                        res[chave] = {"erro": str(e)[:300]}
                    r = res[chave]
                    if "erro" in r:
                        print(chave, "ERRO", r["erro"], file=sys.stderr)
                    else:
                        print(f"{chave:90s} dobra {r['dobra']['total']/1024:8.0f} KB  inteira {r['inteira']['total']/1024:8.0f} KB", flush=True)
        b.close()
    s.shutdown()
    with open(a.saida, "w", encoding="utf8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
