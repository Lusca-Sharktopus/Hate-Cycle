#!/usr/bin/env python3
"""T03 — "Foto" do site atual (baseline) para a T18 (paridade da migração para Astro).

Uso (na raiz do repositório):
  python3 tools/baseline.py                  # tudo: arquivos de texto/JSON + screenshots
  python3 tools/baseline.py --sem-screens    # só os arquivos versionados (rápido, não precisa de navegador)
  python3 tools/baseline.py --so-screens     # só os screenshots (não mexe nos arquivos versionados)

O que faz: gera o site atual (build.py, sem base_url e sem rascunhos) numa pasta temporária
FORA do projeto (o public/ do repositório não é tocado), lê os HTMLs gerados e grava em baseline/:
  urls.json  comentarios.json  paginas.json  feeds.json  estaticos.json  texto/*.txt   (versionados)
  screens/{desktop,mobile}/*.png                                                     (fora do git)
Explicação completa: docs/baseline.md. Só biblioteca padrão + Playwright (screenshots).
"""
import argparse, contextlib, hashlib, io, json, re, shutil, sys, tempfile, threading
import xml.etree.ElementTree as ET
from functools import partial
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.dont_write_bytecode = True                      # não deixar __pycache__ no projeto
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "baseline"
sys.path.insert(0, str(ROOT))

# ───────────────────────── páginas-chave dos screenshots ─────────────────────────
# (nome do arquivo, endereço). "{l}" vira cada idioma (en e pt); a página só é fotografada nos
# idiomas em que existe (ex.: "Ossos do Ofício" cap. 01 só existe em inglês hoje). Endereços sem
# "{l}" valem uma vez só. Obras de um capítulo só (Ossos, Pederneira) e as de vídeo/filme (HDVR,
# O Pêndulo, Goblin…) NÃO têm página de obra: a página é o capítulo 01 ou nem existe (links externos);
# o HDVR é representado pelas notícias dele. Luz & Sangue é a única obra com página de obra.
PAGINAS_CHAVE = [
    ("home",                  "/{l}/"),
    ("historias",             "/{l}/works/"),
    ("obra-luz-e-sangue",     "/{l}/works/light-and-blood/"),
    ("ossos-do-oficio-01",    "/{l}/works/all-in-a-nights-work/01/"),
    ("pederneira-01",         "/{l}/works/firestriker/01/"),
    ("luz-e-sangue-02",       "/{l}/works/light-and-blood/02/"),
    ("lista-de-noticias",     "/{l}/news/"),
    ("noticia-comum",         "/{l}/news/2024-06-14-lucas-viciado-em-cafeina/"),        # texto + vídeo, sem enfeites
    ("noticia-colagem-hdvr",  "/{l}/news/2024-06-13-primeiro-video-hdvr/"),             # front matter "stickers" (HDVR)
    ("noticia-backdrop",      "/{l}/news/2025-04-18-saiu-pederneira/"),                 # backdrop_top / backdrop_bottom
    ("noticia-backdrop-luz",  "/{l}/news/2026-06-06-bem-vindos-luz-e-sangue/"),         # backdrop (Luz & Sangue)
    ("sobre",                 "/{l}/about/"),
    ("raiz",                  "/"),                                                      # escolhe o idioma
    ("404",                   "/404.html"),
]
LARGURAS = {"desktop": 1100, "mobile": 390}
ALTURA_MAX = 9000     # px; páginas mais altas (capítulos longos) são cortadas aqui para o PNG não ficar gigante

# arquivos de static/ que são do autor/local e não entram na lista de hashes (variam por máquina)
IGNORAR_ESTATICOS = {"custom.css"}
BLOCOS = {"p", "div", "section", "article", "aside", "header", "footer", "nav", "main", "h1", "h2", "h3", "h4", "h5", "h6",
          "ul", "ol", "li", "dl", "dt", "dd", "table", "tr", "td", "th", "blockquote", "figure", "figcaption", "pre", "hr", "br",
          "details", "summary", "form", "label", "button", "select", "option", "textarea", "address", "fieldset", "legend"}
IGNORAR_TAGS = {"script", "style", "noscript", "template", "head", "title", "svg"}


# ───────────────────────── leitura do HTML ─────────────────────────
class Lido(HTMLParser):
    """Extrai de um HTML: lang, title, metas, links e o texto visível de <main> (ou do <body> se não houver)."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lang = ""; self.title = ""; self.description = ""; self.canonical = ""
        self.hreflang = {}; self.og = {}; self.alternates = []; self.refresh = ""
        self.data_pages = []; self._in_title = False
        self._pilha = []; self._main = []; self._body = []; self._tem_main = False
        self._depth_main = None; self._in_body = False; self._skip = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html": self.lang = a.get("lang", "")
        elif tag == "title": self._in_title = True
        elif tag == "meta":
            n, p, c = a.get("name", ""), a.get("property", ""), a.get("content", "")
            if n == "description": self.description = c
            if p.startswith("og:"): self.og[p] = c
            if (a.get("http-equiv") or "").lower() == "refresh": self.refresh = c
        elif tag == "link":
            rel, href = (a.get("rel") or "").lower(), a.get("href", "")
            if rel == "canonical": self.canonical = href
            elif rel == "alternate" and a.get("hreflang"): self.hreflang[a["hreflang"]] = href
            elif rel == "alternate" and a.get("type"): self.alternates.append({"type": a["type"], "href": href})
        elif tag == "body": self._in_body = True
        if a.get("data-page") is not None: self.data_pages.append(a["data-page"])
        if tag == "main" and not self._tem_main:
            self._tem_main = True; self._depth_main = len(self._pilha)
        if tag in ("br", "hr", "img", "input", "meta", "link", "source", "wbr", "area", "col", "embed", "param", "track"):
            if tag == "img" and a.get("alt", "").strip() and not self._skip:
                self._emit("\n[img] " + a["alt"] + "\n")        # texto alternativo conta como texto (linha com prefixo [img])
            elif tag in BLOCOS:
                self._emit("\n")
            return
        self._pilha.append(tag)
        if tag in IGNORAR_TAGS: self._skip += 1
        if tag in BLOCOS: self._emit("\n")

    def handle_endtag(self, tag):
        if tag == "title": self._in_title = False
        if tag in self._pilha:                                   # fecha até a tag correspondente (HTML tolerante)
            while self._pilha:
                t = self._pilha.pop()
                if t in IGNORAR_TAGS: self._skip -= 1
                if t == tag: break
            if tag in BLOCOS: self._emit("\n")
            if tag == "main" and self._depth_main is not None and len(self._pilha) <= self._depth_main:
                self._depth_main = None

    def handle_data(self, d):
        if self._in_title: self.title += d
        if self._skip or not self._in_body: return
        self._emit(d)

    def _emit(self, s):
        self._body.append(s)
        if self._depth_main is not None: self._main.append(s)

    def texto(self):
        bruto = "".join(self._main if self._tem_main else self._body)
        linhas = (re.sub(r"\s+", " ", l).strip() for l in bruto.split("\n"))   # \s inclui espaço sem quebra (U+00A0)
        return "\n".join(l for l in linhas if l)


def ler(html):
    p = Lido(); p.feed(html); p.close(); return p


# ───────────────────────── geração do site ─────────────────────────
def gerar_site(destino: Path):
    import build as b
    b.BASE = ""; b.DRAFTS = False; b.OUT = destino
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        b.build()
    m = re.search(r"\((\d+) páginas\)", buf.getvalue())
    return b, int(m.group(1)) if m else None


def url_de(rel: str) -> str:
    """'pt/news/x/index.html' -> '/pt/news/x/' ; '404.html' -> '/404.html'."""
    if rel == "index.html": return "/"
    if rel.endswith("/index.html"): return "/" + rel[: -len("index.html")]
    return "/" + rel


def nome_plano(url: str) -> str:
    s = url.strip("/").replace("/", "__")
    return s or "_raiz"


def escrever_json(caminho: Path, dado):
    caminho.write_text(json.dumps(dado, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8", newline="\n")


def sha(path: Path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()[:16]


def feed_info(path: Path):
    r = ET.parse(path).getroot().find("channel")
    itens = [{"title": i.findtext("title") or "", "link": i.findtext("link") or "", "pubDate": i.findtext("pubDate") or ""} for i in r.findall("item")]
    return {"title": r.findtext("title") or "", "link": r.findtext("link") or "", "language": r.findtext("language") or "", "itens": itens}


def fotografar_arquivos(site: Path, b, contagem_build):
    htmls = sorted(site.rglob("*.html"))
    estaticos = {p.relative_to(b.STATIC).as_posix() for p in b.STATIC.rglob("*") if p.is_file()}
    paginas, comentarios, textos, redirects = {}, {}, {}, {}
    for f in htmls:
        rel = f.relative_to(site).as_posix()
        if rel in estaticos: continue                      # html vindo de static/ (não há hoje) não é página gerada
        url = url_de(rel)
        L = ler(f.read_text("utf-8"))
        if L.refresh and not L.title:                      # página de redirecionamento do site antigo
            redirects[url] = L.canonical
        paginas[url] = {"title": L.title, "description": L.description, "lang": L.lang, "canonical": L.canonical,
                        "hreflang": dict(sorted(L.hreflang.items())), "og": dict(sorted(L.og.items())),
                        "alternates": sorted(L.alternates, key=lambda x: (x["type"], x["href"])),
                        "meta_refresh": L.refresh}
        if L.data_pages: comentarios[url] = L.data_pages
        textos[url] = L.texto()
    urls_html = sorted(paginas)
    gerados_nao_html = sorted(p.relative_to(site).as_posix() for p in site.rglob("*")
                              if p.is_file() and p.suffix != ".html" and p.relative_to(site).as_posix() not in estaticos)
    # CNAME e favicon etc. vêm de static/; os "gerados" são feeds (e qualquer outro arquivo que o build crie)
    # CNAME e as páginas do site antigo que vivem em static/ (ex.: produtos.html, night.html: copiadas como estão,
    # pedido do autor em 20/10/2026) contam como URL: depois da virada têm de continuar respondendo.
    de_static_relevantes = sorted(x for x in estaticos if x == "CNAME" or (x.endswith(".html") and "/" not in x))
    ids = sorted({i for v in comentarios.values() for i in v})
    # o mesmo ID nas duas línguas = conversa compartilhada; ids por página devem ser únicos
    duplicados = {u: sorted({i for i in v if v.count(i) > 1}) for u, v in comentarios.items() if len(set(v)) != len(v)}
    feeds = {("/" + x): feed_info(site / x) for x in gerados_nao_html if x.endswith("feed.xml")}

    if OUT_DIR.exists():
        for old in ["urls.json", "comentarios.json", "paginas.json", "feeds.json", "estaticos.json"]:
            (OUT_DIR / old).unlink(missing_ok=True)
        shutil.rmtree(OUT_DIR / "texto", ignore_errors=True)
    (OUT_DIR / "texto").mkdir(parents=True, exist_ok=True)

    escrever_json(OUT_DIR / "urls.json", {
        "_leia": "html = toda página HTML gerada (URL relativa ao site); redirects_site_antigo = páginas HTML que só redirecionam (também estão em html); "
                 "outros_gerados = arquivos não-HTML que o build cria; outros_de_static_relevantes = arquivos de static/ que o site publica e contam como URL (CNAME e as páginas .html do site antigo guardadas na raiz de static/).",
        "total_html": len(urls_html),
        "html": urls_html,
        "redirects_site_antigo": dict(sorted(redirects.items())),
        "outros_gerados": ["/" + x for x in gerados_nao_html],
        "outros_de_static_relevantes": ["/" + x for x in de_static_relevantes],
    })
    escrever_json(OUT_DIR / "comentarios.json", {
        "_leia": "por_pagina = IDs data-page de cada página que tem comentários; ids_unicos = conjunto de IDs (invariante: a T18 exige igualdade exata). "
                 "O ID é igual nos dois idiomas (conversa compartilhada).",
        "total_ids_unicos": len(ids), "total_paginas_com_comentarios": len(comentarios),
        "ids_repetidos_na_mesma_pagina": duplicados,
        "ids_unicos": ids, "por_pagina": dict(sorted(comentarios.items())),
    })
    escrever_json(OUT_DIR / "paginas.json", dict(sorted(paginas.items())))
    escrever_json(OUT_DIR / "feeds.json", dict(sorted(feeds.items())))
    escrever_json(OUT_DIR / "estaticos.json", {
        "_leia": "arquivos de static/ publicados como estão: caminho -> início do SHA-1. (static/custom.css fica de fora: é pessoal do autor e varia por máquina.)",
        "total": len(estaticos - IGNORAR_ESTATICOS),
        "arquivos": {x: sha(b.STATIC / x) for x in sorted(estaticos - IGNORAR_ESTATICOS)},
    })
    for url, t in textos.items():
        (OUT_DIR / "texto" / (nome_plano(url) + ".txt")).write_text(f"URL: {url}\n\n{t}\n", encoding="utf-8", newline="\n")
    return {"html": len(urls_html), "ids": len(ids), "paginas_com_ids": len(comentarios), "duplicados": duplicados,
            "contagem_build": contagem_build, "redirects": len(redirects), "estaticos": len(estaticos - IGNORAR_ESTATICOS),
            "urls": set(urls_html)}


# ───────────────────────── screenshots ─────────────────────────
class Quieto(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def fotografar_telas(site: Path, urls_existentes):
    from playwright.sync_api import sync_playwright
    srv = ThreadingHTTPServer(("127.0.0.1", 0), partial(Quieto, directory=str(site)))   # porta 0 = porta livre
    th = threading.Thread(target=srv.serve_forever, daemon=True); th.start()
    porta = srv.server_address[1]
    alvos = []
    for nome, modelo in PAGINAS_CHAVE:
        for l in (["en", "pt"] if "{l}" in modelo else [None]):
            url = modelo.format(l=l) if l else modelo
            if url not in urls_existentes:
                print(f"  (pulado, página não existe: {url})"); continue
            alvos.append((f"{nome}-{l}" if l else nome, url))
    shutil.rmtree(OUT_DIR / "screens", ignore_errors=True)
    feitos = 0
    try:
        with sync_playwright() as p:
            nav = p.chromium.launch()
            try:
                for tipo, largura in LARGURAS.items():
                    (OUT_DIR / "screens" / tipo).mkdir(parents=True, exist_ok=True)
                    ctx = nav.new_context(viewport={"width": largura, "height": 900}, reduced_motion="reduce")
                    ctx.route("**/fonts.g*/**", lambda r: r.abort())
                    ctx.route("**/cdn.jsdelivr.net/**", lambda r: r.abort())
                    ctx.add_init_script("try{sessionStorage.setItem('hc-intro','1')}catch(e){}")
                    for nome, url in alvos:
                        pg = ctx.new_page()
                        pg.goto(f"http://127.0.0.1:{porta}{url}", wait_until="load")
                        pg.evaluate("document.documentElement.classList.remove('intro')")
                        # percorre a página para as imagens preguiçosas (loading=lazy) carregarem, depois volta ao topo
                        pg.evaluate("""async () => { const h = () => document.documentElement.scrollHeight;
                            for (let y = 0; y < Math.min(h(), %d); y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
                            window.scrollTo(0, 0); }""" % ALTURA_MAX)
                        with contextlib.suppress(Exception):
                            pg.wait_for_load_state("networkidle", timeout=4000)
                        pg.wait_for_timeout(500)
                        altura = pg.evaluate("document.documentElement.scrollHeight")
                        destino = str(OUT_DIR / "screens" / tipo / f"{nome}.png")
                        if altura > ALTURA_MAX:
                            pg.screenshot(path=destino, full_page=True, clip={"x": 0, "y": 0, "width": largura, "height": ALTURA_MAX})
                        else:
                            pg.screenshot(path=destino, full_page=True)
                        pg.close(); feitos += 1
                    ctx.close()
            finally:
                nav.close()
    finally:
        srv.shutdown(); srv.server_close(); th.join(timeout=5)
    return feitos


def main():
    ap = argparse.ArgumentParser(description="Foto do site atual (T03).")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--sem-screens", action="store_true", help="só os arquivos versionados; sem navegador")
    g.add_argument("--so-screens", action="store_true", help="só os screenshots; não mexe nos arquivos versionados")
    a = ap.parse_args()
    with tempfile.TemporaryDirectory(prefix="hc-baseline-") as tmp:
        site = Path(tmp) / "site"
        print("gerando o site atual (sem base_url, sem rascunhos) numa pasta temporária…")
        b, n_build = gerar_site(site)
        r = None
        if not a.so_screens:
            r = fotografar_arquivos(site, b, n_build)
        else:
            r = {"urls": {url_de(f.relative_to(site).as_posix()) for f in site.rglob("*.html")}}
        n_shots = None if a.sem_screens else fotografar_telas(site, r["urls"])
    print("\n── resumo ──")
    if not a.so_screens:
        print(f"páginas HTML:            {r['html']}  (o build informou {r['contagem_build']})")
        print(f"  das quais redirects:   {r['redirects']}")
        print(f"IDs de comentário:       {r['ids']} únicos, em {r['paginas_com_ids']} páginas")
        print(f"arquivos de static/:     {r['estaticos']} (hashes em estaticos.json)")
        if r["html"] != r["contagem_build"]:
            print("⚠ a contagem de páginas difere da que o build informou — investigue")
        if r["duplicados"]:
            print(f"⚠ IDs repetidos dentro da mesma página: {r['duplicados']}")
    if n_shots is not None:
        print(f"screenshots:             {n_shots}  (baseline/screens/, fora do git)")
    print(f"saída: {OUT_DIR}")


if __name__ == "__main__":
    main()
