#!/usr/bin/env python3
"""Conferência do site no ar (T20): para cada endereço-chave, confere o status, o título e um pedaço de texto esperado.

Só biblioteca padrão do Python (3.12+). NÃO faz parte do `pnpm test`: é uma ferramenta para rodar na hora da virada
(segunda, 26/10) e depois de qualquer publicação, contra o site de verdade ou contra um servidor local.

Uso:
    python3 tools/conferir_no_ar.py https://hatecycle.com              # o site no ar
    python3 tools/conferir_no_ar.py https://hatecycle.com --espera 600 # repete até passar tudo (o cache do GitHub demora)
    python3 tools/conferir_no_ar.py --servir dist                      # sobe um servidor local que imita o GitHub Pages
    python3 tools/conferir_no_ar.py http://localhost:8790              # um servidor que você já subiu
    (sob timeout, como sempre:  timeout 120 python3 tools/conferir_no_ar.py --servir dist)

Saída: uma linha por conferência ("ok" ou "FALHOU", com o motivo) e o total. Código de saída 0 = tudo certo, 1 = algo falhou.

Atenção a duas coisas:
  - Contra `python3 -m http.server`, a conferência da página 404 do site (título "404 | …") só vale em https; localmente use
    `--servir`, que devolve a 404.html com status 404, como o GitHub Pages.
  - RASCUNHOS: a lista `RASCUNHOS` abaixo são obras com "draft": true, que NÃO podem estar no ar. Quando o autor publicar uma
    delas, tire-a da lista (senão a conferência acusa, com razão, que ela apareceu).
"""
from __future__ import annotations

import argparse
import html
import http.server
import mimetypes
import re
import socketserver
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

# Obras em rascunho (content/works/<pasta>/work.json com "draft": true): não existem no site publicado.
RASCUNHOS = ["all-in-a-nights-work", "roadside", "the-pendulum", "cat-crow-thing"]

MARCA = "Hᴀᴛᴇ Cʏᴄʟᴇ"  # versalete Unicode: o nome da marca nos <title>


@dataclass
class Conferencia:
    """Um endereço e o que se espera dele."""
    caminho: str
    status: int = 200
    tipo: str = ""                                  # pedaço esperado do Content-Type (ex.: "text/html")
    titulo: str | None = None                       # <title> exato (depois de desfazer &amp; etc.)
    textos: list[str] = field(default_factory=list)  # pedaços que têm de aparecer no corpo
    ausentes: list[str] = field(default_factory=list)  # pedaços que NÃO podem aparecer
    inicio_bytes: bytes | None = None               # primeiros bytes esperados (ex.: b"GIF8")
    so_em_https: bool = False                       # só vale no site de verdade (ex.: a 404.html do site)
    nome: str = ""


def conferencias() -> list[Conferencia]:
    html_ = "text/html"
    c: list[Conferencia] = [
        # Raiz e páginas principais
        Conferencia("/", tipo=html_, titulo=MARCA, textos=['url=/en/', "localStorage"], nome="raiz (escolhe o idioma)"),
        Conferencia("/pt/", tipo=html_, titulo=MARCA, textos=["Magia existe"], nome="home em português"),
        Conferencia("/en/", tipo=html_, titulo=MARCA, textos=["Magic exists"], nome="home em inglês"),
        Conferencia("/pt/works/", tipo=html_, titulo=f"Histórias | {MARCA}", nome="Histórias (pt)"),
        Conferencia("/en/works/", tipo=html_, titulo=f"Stories | {MARCA}", nome="Histórias (en)"),
        # Capítulos: o data-page é o ID da conversa de comentários (invariante 2: igual nos dois idiomas)
        Conferencia("/pt/works/firestriker/01/", tipo=html_, titulo=f"Pederneira | {MARCA}",
                    textos=['data-page="works/firestriker/01"', "window.HC"], nome="Pederneira (pt)"),
        Conferencia("/en/works/firestriker/01/", tipo=html_, titulo=f"Firestriker | {MARCA}",
                    textos=['data-page="works/firestriker/01"'], nome="Firestriker (en)"),
        Conferencia("/pt/works/light-and-blood/02/", tipo=html_, titulo=f"Luz & Sangue — Episódio 2 | {MARCA}",
                    textos=['data-page="works/light-and-blood/02"'], nome="Luz & Sangue 02 (pt)"),
        # Notícia, Sobre, Apoio
        Conferencia("/pt/news/", tipo=html_, titulo=f"Notícias | {MARCA}", nome="lista de notícias"),
        Conferencia("/pt/news/2025-04-18-saiu-pederneira/", tipo=html_,
                    titulo=f"Saiu Pederneira, o primeiro Conto do universo de {MARCA}! | {MARCA}",
                    textos=['data-page="news/2025-04-18-saiu-pederneira"'], nome="notícia (Saiu Pederneira)"),
        Conferencia("/pt/about/", tipo=html_, titulo=f"Sobre o autor | {MARCA}", nome="Sobre (pt)"),
        Conferencia("/pt/support/", tipo=html_, titulo=f"Apoio | {MARCA}", nome="Apoio (pt)"),
        Conferencia("/en/support/", tipo=html_, titulo=f"Support | {MARCA}", nome="Apoio (en)"),
        # Redirecionamentos do site antigo (invariante 3): páginas que mandam para o endereço novo
        Conferencia("/PT.html", tipo=html_, textos=['url=/pt/'], nome="site antigo: PT.html -> /pt/"),
        Conferencia("/ossos.html", tipo=html_, textos=['url=/pt/'], nome="site antigo: ossos.html -> /pt/"),
        Conferencia("/night.html", tipo=html_, textos=['url=/en/'], nome="site antigo: night.html -> /en/"),
        Conferencia("/pederneira.html", tipo=html_, textos=['url=/pt/works/firestriker/01/'], nome="site antigo: pederneira.html"),
        Conferencia("/produtos.html", tipo=html_, textos=["Produtos/Água.png"], nome="produtos.html (mantida igual)"),
        # Feeds
        Conferencia("/pt/feed.xml", tipo="xml", textos=["<rss", "https://hatecycle.com/pt/news/"], nome="RSS em português"),
        Conferencia("/en/feed.xml", tipo="xml", textos=["<rss", "https://hatecycle.com/en/news/"], nome="RSS em inglês"),
        Conferencia("/sitemap.xml", tipo="xml", textos=["<urlset", "https://hatecycle.com/pt/"], nome="sitemap"),
        # Arquivos com nome difícil (acento, espaço, &): o endereço tem de ser aceito byte a byte
        Conferencia("/other images/Anfíbio Site.gif", tipo="image/gif", inicio_bytes=b"GIF8", nome="imagem com acento no nome"),
        Conferencia("/covers/PT/Capa Luz & Sangue.png", tipo="image/png", inicio_bytes=b"\x89PNG", nome="imagem com & no nome"),
        Conferencia("/Produtos/Água.png", tipo="image/png", inicio_bytes=b"\x89PNG", nome="imagem de Produtos (acento)"),
        # Erro: um endereço que não existe tem de dar 404 (e, no site de verdade, a página 404 do Hᴀᴛᴇ Cʏᴄʟᴇ)
        Conferencia("/pt/esta-pagina-nao-existe/", status=404, textos=["404"], nome="endereço inexistente (404)"),
        Conferencia("/pt/esta-pagina-nao-existe/", status=404, tipo=html_, titulo=f"404 | {MARCA}", so_em_https=True,
                    nome="a 404 é a página do site"),
    ]
    # Rascunhos não podem estar no ar
    for obra in RASCUNHOS:
        for lang in ("pt", "en"):
            c.append(Conferencia(f"/{lang}/works/{obra}/", status=404, textos=["404"], nome=f"rascunho fora do ar: {lang}/{obra}"))
    c.append(Conferencia("/en/works/all-in-a-nights-work/01/", status=404, textos=["404"], nome="rascunho fora do ar: capítulo de Ossos"))
    # T17d: os capítulos provisórios das três obras novas (Beira de Estrada, O Pêndulo, Cat-Crow-Thing) também não podem estar no ar
    for caminho in ("/pt/works/roadside/01/", "/en/works/roadside/02/", "/pt/works/the-pendulum/01/", "/en/works/cat-crow-thing/01/"):
        c.append(Conferencia(caminho, status=404, textos=["404"], nome=f"rascunho fora do ar: {caminho}"))
    # Coisas que só existem na prévia ou no repositório e nunca podem ser servidas
    for p in ("/config.json", "/dev/markdown/", "/package.json", "/build.py"):
        c.append(Conferencia(p, status=404, textos=["404"], nome=f"não existe no site: {p}"))
    return c


# ---------------------------------------------------------------------------------------------------------------------
# Pedidos HTTP (sem seguir redirecionamentos: o status que o GitHub devolve é o que vale)

class _SemRedirecionar(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401
        return None


_ABRIR = urllib.request.build_opener(_SemRedirecionar)


@dataclass
class Resposta:
    status: int
    cabecalhos: dict[str, str]
    corpo: bytes
    erro: str = ""


def pedir(url: str, tempo: float = 30.0) -> Resposta:
    req = urllib.request.Request(url, headers={"User-Agent": "hc-conferir-no-ar/1.0", "Accept-Encoding": "identity"})
    try:
        with _ABRIR.open(req, timeout=tempo) as r:
            return Resposta(r.status, {k.lower(): v for k, v in r.headers.items()}, r.read(12_000_000))
    except urllib.error.HTTPError as e:
        corpo = b""
        try:
            corpo = e.read(2_000_000)
        except Exception:  # noqa: BLE001
            pass
        return Resposta(e.code, {k.lower(): v for k, v in e.headers.items()}, corpo)
    except Exception as e:  # noqa: BLE001  (DNS, TLS, tempo esgotado…)
        return Resposta(0, {}, b"", f"{type(e).__name__}: {e}")


def codificar(caminho: str) -> str:
    """Caminho legível -> caminho de URL (UTF-8, NFC, % nos espaços; & e acentos como o navegador manda)."""
    c = unicodedata.normalize("NFC", caminho)
    return urllib.parse.quote(c, safe="/&=+$,;:@")


# ---------------------------------------------------------------------------------------------------------------------

def titulo_de(texto: str) -> str | None:
    m = re.search(r"<title>(.*?)</title>", texto, re.S | re.I)
    return html.unescape(m.group(1)).strip() if m else None


def conferir(base: str, c: Conferencia, detalhar: bool) -> tuple[bool, str]:
    url = base + codificar(c.caminho)
    r = pedir(url)
    if r.erro:
        return False, f"sem resposta ({r.erro})"
    probs: list[str] = []
    if r.status != c.status:
        extra = f", para {r.cabecalhos['location']}" if "location" in r.cabecalhos else ""
        probs.append(f"status {r.status} (esperado {c.status}{extra})")
    ct = r.cabecalhos.get("content-type", "")
    if c.tipo and c.tipo not in ct.lower():
        probs.append(f"tipo '{ct}' (esperado '{c.tipo}')")
    texto = r.corpo.decode("utf-8", errors="replace")
    if c.titulo is not None:
        t = titulo_de(texto)
        if t != c.titulo:
            probs.append(f"título {t!r} (esperado {c.titulo!r})")
    for t in c.textos:
        if t not in texto:
            probs.append(f"falta o texto {t!r}")
    for t in c.ausentes:
        if t in texto:
            probs.append(f"não podia aparecer: {t!r}")
    if c.inicio_bytes is not None and not r.corpo.startswith(c.inicio_bytes):
        probs.append(f"não começa com {c.inicio_bytes!r} (não é o arquivo certo)")
    if probs:
        return False, "; ".join(probs)
    resumo = f"{r.status}"
    if c.titulo is not None:
        resumo += f", título {c.titulo!r}"
    elif c.inicio_bytes is not None:
        resumo += f", {len(r.corpo) // 1024} KB"
    if detalhar:
        resumo += f" [cache-control={r.cabecalhos.get('cache-control', '-')}, age={r.cabecalhos.get('age', '-')}, " \
                  f"server={r.cabecalhos.get('server', '-')}]"
    return True, resumo


def conferir_descobertos(base: str, detalhar: bool) -> list[tuple[bool, str, str]]:
    """Arquivos de /_astro/ têm nome com carimbo que muda a cada build: acha-os dentro das páginas e confere se existem."""
    saidas: list[tuple[bool, str, str]] = []

    def achar(pagina: str, padrao: str, nome: str, tipo: str, inicio: bytes | None = None) -> None:
        p = pedir(base + pagina)
        if p.status != 200:
            saidas.append((False, nome, f"não deu para ler {pagina} (status {p.status} {p.erro})"))
            return
        m = re.search(padrao, p.corpo.decode("utf-8", errors="replace"))
        if not m:
            saidas.append((False, nome, f"{pagina} não aponta para nenhum arquivo do tipo esperado"))
            return
        caminho = html.unescape(m.group(1))
        r = pedir(base + caminho)
        probs = []
        if r.status != 200:
            probs.append(f"status {r.status}")
        if tipo not in r.cabecalhos.get("content-type", "").lower():
            probs.append(f"tipo {r.cabecalhos.get('content-type', '-')!r} (esperado '{tipo}')")
        if not r.corpo:
            probs.append("arquivo vazio")
        if inicio is not None and not r.corpo.startswith(inicio):
            probs.append("conteúdo inesperado")
        if probs:
            saidas.append((False, nome, f"{caminho}: " + "; ".join(probs)))
        else:
            saidas.append((True, nome, f"{caminho} ({len(r.corpo) // 1024} KB)"))

    achar("/pt/", r'<link rel="stylesheet" href="(/_astro/[^"]+\.css)"', "arquivo /_astro/: CSS da home", "text/css")
    achar("/pt/", r'<link rel="preload" href="(/_astro/[^"]+\.woff2)"', "arquivo /_astro/: fonte da home", "woff2")
    achar("/pt/works/firestriker/01/", r'<script type="module" src="(/_astro/CaixaDeComentarios[^"]+\.js)"',
          "arquivo /_astro/: script dos comentários", "javascript")
    return saidas


# ---------------------------------------------------------------------------------------------------------------------
# Servidor local que imita o GitHub Pages (diretório -> index.html; ausente -> 404.html com status 404)

def servidor_pages(pasta: Path) -> tuple[socketserver.TCPServer, int]:
    raiz = pasta.resolve()

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):  # silêncio
            pass

        def _resolver(self) -> Path | None:
            caminho = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
            caminho = unicodedata.normalize("NFC", caminho)
            alvo = (raiz / caminho.lstrip("/")).resolve()
            if raiz not in alvo.parents and alvo != raiz:
                return None
            if alvo.is_dir():
                alvo = alvo / "index.html"
            return alvo if alvo.is_file() else None

        def do_GET(self):
            alvo = self._resolver()
            status = 200
            if alvo is None:
                alvo, status = raiz / "404.html", 404
            dados = alvo.read_bytes() if alvo.is_file() else b"404"
            tipo = mimetypes.guess_type(alvo.name)[0] or "application/octet-stream"
            if alvo.suffix == ".woff2":
                tipo = "font/woff2"
            if tipo.startswith("text/") or tipo.endswith("xml") or tipo.endswith("javascript"):
                tipo += "; charset=utf-8"
            self.send_response(status)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(dados)))
            self.end_headers()
            self.wfile.write(dados)

    srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


# ---------------------------------------------------------------------------------------------------------------------

def rodar(base: str, detalhar: bool) -> tuple[int, int]:
    https = base.startswith("https://")
    ok = falhas = 0
    for c in conferencias():
        if c.so_em_https and not https:
            continue
        passou, msg = conferir(base, c, detalhar)
        print(f"{'ok    ' if passou else 'FALHOU'}  {c.nome or c.caminho:<46} {c.caminho}  ->  {msg}")
        ok, falhas = ok + passou, falhas + (not passou)
    for passou, nome, msg in conferir_descobertos(base, detalhar):
        print(f"{'ok    ' if passou else 'FALHOU'}  {nome:<46} {msg}")
        ok, falhas = ok + passou, falhas + (not passou)
    return ok, falhas


def main() -> int:
    ap = argparse.ArgumentParser(description="Confere os endereços-chave do site Hᴀᴛᴇ Cʏᴄʟᴇ (status, título, texto).")
    ap.add_argument("base", nargs="?", help="endereço base, ex.: https://hatecycle.com ou http://localhost:8790")
    ap.add_argument("--servir", metavar="PASTA", help="sobe um servidor local que imita o GitHub Pages servindo PASTA (ex.: dist) e confere nele")
    ap.add_argument("--espera", type=int, default=0, metavar="SEGUNDOS",
                    help="se algo falhar, repete a cada 20 s até passar tudo ou até este tempo (o cache do GitHub Pages demora uns minutos)")
    ap.add_argument("-v", "--detalhes", action="store_true", help="mostra cache-control, age e server de cada resposta")
    a = ap.parse_args()

    srv = None
    if a.servir:
        pasta = Path(a.servir)
        if not (pasta / "404.html").is_file():
            print(f"{pasta}/404.html não existe: rode `pnpm build` antes.", file=sys.stderr)
            return 2
        srv, porta = servidor_pages(pasta)
        base = f"http://127.0.0.1:{porta}"
        print(f"servidor local imitando o GitHub Pages: {base} (pasta {pasta})")
    elif a.base:
        base = a.base.rstrip("/")
        if not re.match(r"^https?://", base):
            print("o endereço base precisa começar com http:// ou https://", file=sys.stderr)
            return 2
    else:
        ap.error("informe o endereço base ou use --servir PASTA")
        return 2

    inicio = time.time()
    try:
        while True:
            print(f"\n== {base}  ({time.strftime('%H:%M:%S')})")
            ok, falhas = rodar(base, a.detalhes)
            print(f"\n{ok} conferências ok, {falhas} falharam.")
            if falhas == 0:
                print("TUDO CERTO.")
                return 0
            if time.time() - inicio >= a.espera:
                print("HOUVE FALHAS (veja as linhas FALHOU acima).")
                return 1
            print(f"esperando 20 s para tentar de novo (até {a.espera} s no total)…")
            time.sleep(20)
    finally:
        if srv is not None:
            srv.shutdown()


if __name__ == "__main__":
    sys.exit(main())
