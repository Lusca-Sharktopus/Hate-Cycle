#!/usr/bin/env python3
"""Confere, num Chromium de verdade, que cada GIF animado e o WebP animado que o site serve no lugar dele tocam IGUAL (T17e).

Uso (rode sob `timeout`; a ferramenta sobe o servidor sozinha):
  pnpm build                      # dist/ com src/pages/animadas/ (as versões /animadas/<nome>.webp)
  timeout 300 python3 tools/animadas_playwright.py --dist dist --porta 8797

Para cada GIF animado de static/ que tem versão em dist/animadas/, abre o GIF e o WebP, cada um sozinho numa página mínima (1000x620 px),
grava a tela com o screencast do Chrome (CDP) por ~9 s (várias voltas) e anota QUANDO a tela muda e COMO ela ficou (um resumo SHA-1 de cada
quadro de tela). Depois compara:
  - o número de quadros diferentes que cada um mostra, e a ordem deles (a mesma sequência de resumos de pixels nos dois);
  - o tempo que cada quadro fica na tela (diferença máxima aceita: 60 ms; o screencast tem alguma folga de tempo);
  - o desenho em si (o resumo de pixels do quadro k do GIF é igual ao do quadro k do WebP: o que o visitante vê é o mesmo desenho).
O que não dá para ler no navegador (número de repetições) está em tests/animadas.test.ts (o cabeçalho do WebP). Nada sai para a internet.
"""
import argparse, hashlib, http.server, json, os, socketserver, sys, threading, unicodedata, re, urllib.parse
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAGINA = """<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><img id="i" src="%s">"""


def observar(ctx, pg, base: str, url: str, ms: int) -> dict:
    """Abre a imagem sozinha numa página e anota, quadro de tela a quadro de tela (CDP Page.startScreencast, com a hora de cada um),
    QUANDO a tela mudou e um resumo (SHA-1) de COMO ficou. O screencast só manda quadro quando algo mudou na tela."""
    pg.route(base + "/__teste__", lambda r: r.fulfill(status=200, content_type="text/html", body=PAGINA % url))
    cdp = ctx.new_cdp_session(pg)
    frames: list[tuple[float, str]] = []

    def quadro(e):
        frames.append((e["metadata"]["timestamp"], hashlib.sha1(e["data"].encode()).hexdigest()[:10]))
        cdp.send("Page.screencastFrameAck", {"sessionId": e["sessionId"]})

    cdp.on("Page.screencastFrame", quadro)
    pg.goto(base + "/__teste__", wait_until="load")
    pg.evaluate("document.getElementById('i').decode()")
    natural = pg.evaluate("[document.getElementById('i').naturalWidth, document.getElementById('i').naturalHeight]")
    cdp.send("Page.startScreencast", {"format": "png", "everyNthFrame": 1})
    pg.wait_for_timeout(ms)
    cdp.send("Page.stopScreencast")
    pg.unroute(base + "/__teste__")
    cdp.detach()
    mudancas: list[list] = []
    t0 = frames[0][0] if frames else 0
    for t, h in frames:
        if not mudancas or mudancas[-1][1] != h:
            mudancas.append([round((t - t0) * 1000), h])
    return {"natural": natural, "mudancas": mudancas}


def apelido(arquivo: str) -> str:
    base = os.path.basename(arquivo).rsplit(".", 1)[0]
    s = unicodedata.normalize("NFD", base)
    s = re.sub(r"[̀-ͯ]", "", s).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "animada"


def servidor(pasta: str, porta: int):
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=pasta, **k)

        def log_message(self, *a):
            pass

    class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
        daemon_threads = True
        allow_reuse_address = True

    s = S(("127.0.0.1", porta), H)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


def quadros(mudancas: list, ms_total: float) -> tuple[list[str], list[int]]:
    """Uma volta completa: a sequência de resumos a partir da 1ª mudança e quanto cada um ficou (o último, que pode estar cortado, não conta)."""
    seq = [r for _, r in mudancas]
    dur = [mudancas[i + 1][0] - mudancas[i][0] for i in range(len(mudancas) - 1)]
    return seq, dur


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", required=True)
    ap.add_argument("--porta", type=int, default=8797)
    ap.add_argument("--ms", type=int, default=9000, help="quanto tempo observar cada imagem (padrão 9 s: várias voltas)")
    a = ap.parse_args()
    dist = os.path.abspath(a.dist)
    pasta_animadas = os.path.join(dist, "animadas")
    if not os.path.isdir(pasta_animadas):
        sys.exit("não há dist/animadas: rode `pnpm build` antes")
    gifs = []
    for raiz, _, arquivos in os.walk(os.path.join(RAIZ, "static")):
        for f in arquivos:
            if f.lower().endswith(".gif"):
                gifs.append(os.path.relpath(os.path.join(raiz, f), os.path.join(RAIZ, "static")).replace(os.sep, "/"))
    pares = []
    for g in sorted(gifs):
        webps = [w for w in os.listdir(pasta_animadas) if re.fullmatch(re.escape(apelido(g)) + r"-[0-9a-f]{8}\.webp", w)]
        if webps:
            pares.append((g, "animadas/" + webps[0]))
    if not pares:
        sys.exit("nenhum GIF animado com versão em dist/animadas")
    s = servidor(dist, a.porta)
    base = f"http://127.0.0.1:{a.porta}"
    # a página mínima fica numa pasta do dist só para ter a mesma origem; é servida por rota do Playwright, nada é gravado em disco
    ok_geral = True
    with sync_playwright() as p:
        b = p.chromium.launch()
        for gif, webp in pares:
            res = {}
            for nome, url in (("gif", gif), ("webp", webp)):
                ctx = b.new_context(viewport={"width": 1000, "height": 620})
                res[nome] = observar(ctx, ctx.new_page(), base, "/" + urllib.parse.quote(url), a.ms)
                ctx.close()
            sg, dg = quadros(res["gif"]["mudancas"], a.ms)
            sw, dw = quadros(res["webp"]["mudancas"], a.ms)
            # quadros diferentes (na ordem da 1ª volta)
            def unicos(seq):
                out = []
                for r in seq:
                    if r not in out:
                        out.append(r)
                return out
            ug, uw = unicos(sg), unicos(sw)
            mesmo_tamanho = res["gif"]["natural"] == res["webp"]["natural"]
            # a sequência do WebP, em resumos do GIF: cada resumo do WebP tem de ser o do quadro correspondente do GIF
            mapa = {r: i for i, r in enumerate(ug)}
            mesmo_desenho = ug == uw
            # tempos: ignora a 1ª entrada (a imagem pode já estar no meio de um quadro quando começa a medir) e a última (cortada)
            n = min(len(dg), len(dw))
            dif = max((abs(x - y) for x, y in zip(dg[1:n - 1], dw[1:n - 1])), default=0)
            ok = mesmo_tamanho and mesmo_desenho and len(ug) == len(uw) and dif <= 60 and len(sg) > len(ug)
            ok_geral &= ok
            print(f"{'ok ' if ok else 'ERRO'} {gif}: {res['gif']['natural']} px; quadros diferentes GIF {len(ug)} × WebP {len(uw)}; "
                  f"mesmos desenhos {mesmo_desenho}; voltas vistas {len(sg) / max(len(ug), 1):.1f} × {len(sw) / max(len(uw), 1):.1f}; "
                  f"maior diferença de tempo por quadro {dif} ms")
            print(f"     tempos do GIF  {dg[:len(ug) + 2]}\n     tempos do WebP {dw[:len(uw) + 2]}")
        b.close()
    s.shutdown()
    sys.exit(0 if ok_geral else 1)


if __name__ == "__main__":
    main()
