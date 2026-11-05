#!/usr/bin/env python3
"""T18 — Verificador de LINKS de um site gerado (dist/ do Astro, public/ do Python ou qualquer pasta), sem acessar a internet.

Uso (na raiz do repositório):
  python3 tools/links.py dist                          # o site Astro publicado (depois de `pnpm build`)
  python3 tools/links.py <pasta> --site https://hatecycle.com [--com-dev] [--json <arquivo>] [--ignorar /custom.css]

O que lê, em toda página .html (a pasta /dev/ da prévia do Astro fica de fora, a não ser com --com-dev):
  - href (<a>, <link>, <area>), src (<img>, <script>, <iframe>, <source>, <video>, <audio>, <embed>, <track>), srcset (<img>, <source>),
    poster, <form action>, <object data>, url(...) em atributos style e em <style>, <meta> og:image/og:url/twitter:image e o
    "url=" do <meta http-equiv="refresh">, e endereços "/…" entre aspas dentro de <script> (ex.: o vídeo da abertura);
  - em todo .css: url(...) e @import (relativos ao arquivo CSS); em todo .js de /_astro/: import "./x.js" e "/_astro/…" entre aspas;
  - em sitemap.xml e */feed.xml: <loc>, <link> e <guid>.
Interno = começa com "/" (não "//"), é relativo, ou começa com o endereço do site (--site, padrão https://hatecycle.com). Cada
interno vira um arquivo (decodificando %20, %26, acentos… como o servidor faz): "/x/" → x/index.html, "/x" → x ou x/index.html
(o GitHub Pages redireciona /x para /x/). "?…" é ignorado; "#id" é conferido na página de destino (tem de existir um id ou um
<a name> igual). Externo = qualquer outro http(s) ou "//…": não é acessado, só contado por domínio.
Também lista os arquivos do site que NENHUM link alcança (só informativo: ex.: imagens que só o CSS de outra página usa).
Sai com 0 se nenhum link interno estiver quebrado (fora os de --ignorar), 1 se houver.
"""
import argparse, json, re, sys
from collections import Counter, defaultdict
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

sys.dont_write_bytecode = True

ATRIBUTOS_URL = {"href", "src", "poster", "action", "data", "cite", "formaction", "background"}
RE_CSS_URL = re.compile(r"""url\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+(['"])([^'"]+)\3""")
RE_JS_LITERAL = re.compile(r"""["'`](/(?!/)[^"'`\s<>]+\.(?:png|jpe?g|gif|webp|avif|svg|webm|mp4|woff2?|css|js|json|xml|html|ico|txt))["'`]""")
RE_JS_IMPORT = re.compile(r"""(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}/[^"']+\.js)["']""")


class Pagina(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.urls: list[tuple[str, str]] = []   # (onde, url)
        self.ids: set[str] = set()
        self._em = None
        self._buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for k in ("id",):
            if a.get(k):
                self.ids.add(a[k])
        if tag == "a" and a.get("name"):
            self.ids.add(a["name"])
        for k, v in attrs:
            if v is None:
                continue
            if k in ATRIBUTOS_URL and not (tag == "meta"):
                self.urls.append((f"<{tag} {k}>", v.strip()))
            elif k == "srcset":
                for cand in re.split(r",\s+", v.strip()):
                    if cand.strip():
                        self.urls.append((f"<{tag} srcset>", cand.strip().split()[0]))
            elif k == "style":
                for m in RE_CSS_URL.finditer(v):
                    self.urls.append((f"<{tag} style>", (m.group(2) or m.group(4)).strip()))
        if tag == "meta":
            prop = (a.get("property") or a.get("name") or "").lower()
            if prop in ("og:image", "og:url", "twitter:image", "og:video") and a.get("content"):
                self.urls.append((f"<meta {prop}>", a["content"].strip()))
            if (a.get("http-equiv") or "").lower() == "refresh":
                m = re.search(r"url=(.+)$", a.get("content") or "", re.I)
                if m:
                    self.urls.append(("<meta refresh>", m.group(1).strip()))
        if tag in ("style", "script"):
            self._em, self._buf = tag, []

    def handle_endtag(self, tag):
        if tag == self._em:
            texto = "".join(self._buf)
            if tag == "style":
                for m in RE_CSS_URL.finditer(texto):
                    self.urls.append(("<style>", (m.group(2) or m.group(4)).strip()))
            else:
                for m in RE_JS_LITERAL.finditer(texto):
                    self.urls.append(("<script> (texto)", m.group(1)))
            self._em = None

    def handle_data(self, d):
        if self._em:
            self._buf.append(d)


def url_da_pagina(rel: str) -> str:
    if rel == "index.html":
        return "/"
    return "/" + rel[: -len("index.html")] if rel.endswith("/index.html") else "/" + rel


def main():
    ap = argparse.ArgumentParser(description="Verifica os links internos de um site gerado (sem internet).")
    ap.add_argument("pasta")
    ap.add_argument("--site", default="https://hatecycle.com")
    ap.add_argument("--com-dev", action="store_true", help="inclui a pasta /dev/ da prévia do Astro")
    ap.add_argument("--ignorar", action="append", default=[], help="endereço interno que pode faltar (ex.: /custom.css, que é do autor e não é versionado)")
    ap.add_argument("--json")
    ap.add_argument("--mostrar", type=int, default=60)
    a = ap.parse_args()
    raiz = Path(a.pasta).resolve()
    site = a.site.rstrip("/")
    todos = {p.relative_to(raiz).as_posix() for p in raiz.rglob("*") if p.is_file()}
    if not a.com_dev:
        todos = {f for f in todos if not f.startswith("dev/")}

    ids_por_arquivo: dict[str, set[str]] = {}
    referencias: list[tuple[str, str, str]] = []   # (arquivo de origem, onde, url)
    for f in sorted(todos):
        caminho = raiz / f
        if f.endswith(".html"):
            p = Pagina()
            p.feed(caminho.read_text("utf-8", errors="replace"))
            p.close()
            ids_por_arquivo[f] = p.ids
            referencias += [(f, onde, u) for onde, u in p.urls]
        elif f.endswith(".css"):
            for m in RE_CSS_URL.finditer(caminho.read_text("utf-8", errors="replace")):
                referencias.append((f, "css url()", (m.group(2) or m.group(4)).strip()))
        elif f.endswith(".js") and f.startswith("_astro/"):
            t = caminho.read_text("utf-8", errors="replace")
            referencias += [(f, "js import", m.group(1)) for m in RE_JS_IMPORT.finditer(t)]
            referencias += [(f, "js texto", m.group(1)) for m in RE_JS_LITERAL.finditer(t)]
        elif f == "sitemap.xml" or f.endswith("feed.xml"):
            for m in re.finditer(r"<(loc|link|guid)>([^<]+)</\1>", caminho.read_text("utf-8")):
                referencias.append((f, f"xml <{m.group(1)}>", m.group(2).strip()))

    quebrados: dict[str, list[str]] = defaultdict(list)
    ancoras_quebradas: dict[str, list[str]] = defaultdict(list)
    externos: Counter = Counter()
    alcancados: set[str] = set()
    internos = 0
    for origem, onde, u in referencias:
        if not u or u.startswith(("mailto:", "tel:", "javascript:", "data:", "blob:", "about:")):
            continue
        if u.startswith(site + "/") or u == site:
            u = u[len(site):] or "/"
        if u.startswith("//") or re.match(r"^[a-z][a-z0-9+.-]*:", u, re.I):
            externos[urlsplit(u if not u.startswith("//") else "https:" + u).netloc.lower()] += 1
            continue
        internos += 1
        partes = urlsplit(u)
        if partes.path == "":       # só "#id" (ou "?x"): a própria página
            alvo = origem
        else:
            base = "/" + origem.rsplit("/", 1)[0] + "/" if "/" in origem else "/"
            caminho = partes.path if partes.path.startswith("/") else base + partes.path
            # resolve ./ e ../
            seg: list[str] = []
            for s in caminho.split("/"):
                if s == "..":
                    seg and seg.pop()
                elif s not in (".",):
                    seg.append(s)
            caminho = "/".join(seg)
            rel = unquote(caminho, encoding="utf-8", errors="strict").lstrip("/")
            if rel == "" or rel.endswith("/"):
                alvo = rel + "index.html"
            elif rel in todos:
                alvo = rel
            elif rel + "/index.html" in todos:
                alvo = rel + "/index.html"
            else:
                alvo = rel
        if alvo not in todos:
            chave = "/" + alvo.removesuffix("index.html") if alvo.endswith("index.html") else "/" + alvo
            if chave not in a.ignorar and partes.path not in a.ignorar:
                quebrados[u].append(f"{url_da_pagina(origem) if origem.endswith('.html') else '/' + origem} ({onde})")
            continue
        alcancados.add(alvo)
        if partes.fragment and alvo.endswith(".html"):
            frag = unquote(partes.fragment)
            if frag not in ids_por_arquivo.get(alvo, set()) and frag not in ("top", ""):
                ancoras_quebradas[u].append(f"{url_da_pagina(origem) if origem.endswith('.html') else '/' + origem} ({onde})")

    nao_alcancados = sorted(f for f in todos - alcancados if not f.endswith(".html"))
    paginas = sum(1 for f in todos if f.endswith(".html"))
    print(f"site: {raiz}")
    print(f"páginas HTML: {paginas}; arquivos: {len(todos)}")
    print(f"referências lidas: {len(referencias)}; internas conferidas: {internos}; externas: {sum(externos.values())} (não acessadas)")
    print(f"internos QUEBRADOS: {len(quebrados)} endereços diferentes; âncoras (#id) que não existem: {len(ancoras_quebradas)}")
    for u, onde in sorted(quebrados.items())[: a.mostrar]:
        print(f"  ✗ {u}   ← {len(onde)}×, ex.: {', '.join(sorted(set(onde))[:3])}")
    for u, onde in sorted(ancoras_quebradas.items())[: a.mostrar]:
        print(f"  # {u}   ← {len(onde)}×, ex.: {', '.join(sorted(set(onde))[:3])}")
    if a.ignorar:
        print(f"ignorados de propósito: {', '.join(a.ignorar)}")
    print("externos por domínio:")
    for d, n in externos.most_common():
        print(f"  {n:6d}  {d}")
    print(f"arquivos não-HTML que nenhum link alcança: {len(nao_alcancados)}" + (f" (ex.: {nao_alcancados[:8]})" if nao_alcancados else ""))
    if a.json:
        Path(a.json).write_text(json.dumps({"paginas": paginas, "arquivos": len(todos), "referencias": len(referencias), "internos": internos,
                                            "quebrados": quebrados, "ancoras_quebradas": ancoras_quebradas, "externos": dict(externos.most_common()),
                                            "nao_alcancados": nao_alcancados}, indent=2, ensure_ascii=False))
    return 1 if (quebrados or ancoras_quebradas) else 0


if __name__ == "__main__":
    sys.exit(main())
