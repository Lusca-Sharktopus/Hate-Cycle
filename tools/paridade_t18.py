#!/usr/bin/env python3
"""T18 — Paridade do site Astro com o site Python e com a "foto" do site atual (baseline/), arquivo por arquivo.

Uso (na raiz do repositório; não mexe em public/, dist/ nem baseline/):
  python3 tools/paridade_t18.py --gerar                 # gera os 6 sites numa pasta temporária e compara tudo
  python3 tools/paridade_t18.py --gerar --pasta <dir>   # idem, guardando os sites em <dir> (fora do projeto) para olhar depois
  python3 tools/paridade_t18.py --pasta <dir>           # só compara (os sites já gerados em <dir>)
  python3 tools/paridade_t18.py ... --json <arquivo>    # grava o resultado completo em JSON

Os 6 sites (em <dir>/<nome>; o Astro é construído com HC_OUT_DIR, então o dist/ de quem trabalha não é tocado):
  py-publicado      build.py, BASE = "" (o site de hoje, sem rascunhos)        × astro-publicado  `pnpm build`
  py-previa         build.py, BASE = "", DRAFTS = True                          × astro-previa     `NODE_ENV=development pnpm build`
  py-extras         idem + show_extras = True (o que o autor verá se ligar)    × astro-extras     `... HC_SHOW_EXTRAS=1 pnpm build`
  (a pasta /dev/ da prévia do Astro — a ferramenta /dev/markdown/ — fica de fora: nunca vai para o site publicado.)

O que confere, em cada par:
  1. ARQUIVOS: a lista inteira dos dois lados. Páginas HTML iguais (e, no publicado, iguais às de baseline/urls.json); todo arquivo
     de static/ (menos o custom.css, que é do autor) presente nos dois com o MESMO conteúdo do static/ (e, no publicado, o mesmo
     hash de baseline/estaticos.json); o que só o Python tem; o que só o Astro tem, agrupado por motivo (pacotes de CSS/JS,
     fontes, versões leves das imagens, silhuetas, ícones, sitemap…). Arquivo que não cai em grupo nenhum é diferença.
  2. BYTE A BYTE: a raiz (/), as páginas do site antigo (config.json → redirects), os dois feed.xml e o CNAME.
  3. HTML INTEIRO de cada página (tools/paridade_html.mjs, com parse5): <head>, <body>, cabeçalho, rodapé, scripts, com as
     diferenças decididas tiradas uma a uma e contadas.
  4. Com a régua da baseline (tools/baseline.py → Lido): título, descrição, lang, canonical, hreflang, og:*, RSS, meta refresh e o
     TEXTO visível de cada página; IDs de comentários (data-page) de cada página. No publicado, cada lado é comparado com
     baseline/ (o Python de hoje tem de bater com a foto — senão a foto está velha); nas prévias, Astro × Python.
     O texto do bloco "estou lendo em ordem…" (T17c) e o do link "Ver todas as histórias" da home (T17j), que só existem no Astro,
     saem antes de ler; o resumo cortado da lista de Notícias volta à forma do Python, e a home do Python fica com os 4 primeiros
     cartões, como a do Astro (T17j; as mesmas regras de tests/ajudantes/html.ts).
Sai com 0 se tudo bater (ou só sobrar o que foi decidido), 1 se houver diferença. Só biblioteca padrão + Node (para o passo 3).
"""
import argparse, hashlib, json, os, re, shutil, subprocess, sys, tempfile
from collections import Counter, defaultdict
from pathlib import Path

sys.dont_write_bytecode = True
RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "tools"))
import baseline as BL  # noqa: E402  (só as funções de leitura; nada é gravado em baseline/)

STATIC = RAIZ / "static"
IGNORAR_ESTATICOS = {"custom.css"}
MODOS = {
    "publicado": {"py": "BASE=''", "astro": {"NODE_ENV": "production"}},
    "previa": {"py": "BASE=''; b.DRAFTS=True", "astro": {"NODE_ENV": "development"}},
    "extras": {"py": "BASE=''; b.DRAFTS=True; b.CFG['show_extras']=True", "astro": {"NODE_ENV": "development", "HC_SHOW_EXTRAS": "1"}},
}

# Arquivos que só o Astro publica, e por quê (decisões documentadas). Cada arquivo a mais tem de cair em exatamente um grupo.
SO_NO_ASTRO = [
    ("T06/T11/T15: CSS e JS empacotados pelo Astro (/_astro/*.css, *.js)", re.compile(r"^_astro/[^/]+\.(css|js)$")),
    ("T17: fontes servidas pelo próprio site (@fontsource e recortes das runas, /_astro/*.woff2)", re.compile(r"^_astro/[^/]+\.woff2$")),
    ("T17: versões leves WebP das imagens de static/ (srcset)", re.compile(r"^.+_[A-Za-z0-9-]{4,10}\.webp$")),
    ("T17: ícone em 32 e 192 px (logos/favicon_<hash>.png)", re.compile(r"^logos/favicon_[A-Za-z0-9-]+\.png$")),
    ("T17: fundo da abertura em JPEG (intro/fundo_<hash>.jpeg)", re.compile(r"^intro/fundo_[A-Za-z0-9-]+\.jpeg$")),
    ("T17: silhuetas para o shape-outside (silhuetas/*.png)", re.compile(r"^silhuetas/[^/]+\.png$")),
    ("T17e: vídeo da abertura em 720p (/_astro/logo-720p.<hash>.webm; o original continua em intro/logo.webm)", re.compile(r"^_astro/logo-720p\.[A-Za-z0-9_-]+\.webm$")),
    ("T17e: GIFs animados em WebP animado sem perda (animadas/<nome>-<carimbo>.webp; o GIF continua publicado)", re.compile(r"^animadas/[a-z0-9-]+-[0-9a-f]{8}\.webp$")),
    ("T14: sitemap.xml", re.compile(r"^sitemap\.xml$")),
]


def sha(p: Path) -> str:
    return hashlib.sha1(p.read_bytes()).hexdigest()[:16]


def arquivos(pasta: Path) -> set[str]:
    return {p.relative_to(pasta).as_posix() for p in pasta.rglob("*") if p.is_file() and not p.relative_to(pasta).as_posix().startswith("dev/")}


# ───────────── gerar ─────────────
def gerar(pasta: Path, modos):
    pasta.mkdir(parents=True, exist_ok=True)
    for m in modos:
        py, astro = pasta / f"py-{m}", pasta / f"astro-{m}"
        shutil.rmtree(py, ignore_errors=True)
        shutil.rmtree(astro, ignore_errors=True)
        codigo = f"import build as b; from pathlib import Path; b.{MODOS[m]['py']}; b.OUT=Path({str(py)!r}); b.build()"
        r = subprocess.run([sys.executable, "-B", "-c", codigo], cwd=RAIZ, capture_output=True, text=True)
        if r.returncode:
            sys.exit(f"build.py falhou ({m}):\n{r.stdout}\n{r.stderr}")
        print(f"  {py.name}: {r.stdout.strip().splitlines()[-1]}")
        env = {k: v for k, v in os.environ.items() if not k.startswith("VITEST") and k != "HC_SHOW_EXTRAS"}
        env.update(MODOS[m]["astro"], HC_OUT_DIR=str(astro))
        r = subprocess.run(["node", str(RAIZ / "node_modules/astro/bin/astro.mjs"), "build"], cwd=RAIZ, env=env, capture_output=True, text=True)
        if r.returncode:
            sys.exit(f"astro build falhou ({m}):\n{r.stdout[-3000:]}\n{r.stderr[-3000:]}")
        n = re.search(r"(\d+) page\(s\) built", r.stdout)
        print(f"  {astro.name}: {n.group(0) if n else '?'}")


# ───────────── leitura com a régua da baseline ─────────────
RE_ABRE_ORDEM = re.compile(r"<section\b[^>]*\bdata-story-order\b[^>]*>")


def sem_bloco_de_ordem(html: str) -> tuple[str, int]:
    """Tira cada <section data-story-order>…</section> (com as <section> de dentro, se houver). Mesma regra de semBlocoDeOrdem()."""
    n = 0
    while (m := RE_ABRE_ORDEM.search(html)):
        prof, pos = 1, m.end()
        for t in re.finditer(r"<section\b|</section\s*>", html[pos:]):
            prof += 1 if t.group(0).startswith("<section") else -1
            if prof == 0:
                html = html[: m.start()] + html[pos + t.end():]
                break
        else:
            raise SystemExit("bloco de ordem sem </section>")
        n += 1
    return html, n


# T17j: o que a home e a lista de Notícias do Astro mostram de diferente, decidido (as mesmas regras de tests/ajudantes/html.ts →
# homeComoNoPython, soQuatroHistoriasNaHome, resumoCortadoComoNoPython; aqui só para a leitura do TEXTO).
RE_LINK_DA_HOME = re.compile(r'<a class="rail-btn rail-next rail-more"[^>]*>.*?</a>', re.S)
RE_RESUMO_CORTADO = re.compile(r'<span class="news-fade">([^<]*)</span> (<a class="more" href="[^"]*">)…')
RE_CARTAO = re.compile(r'<article class="work-card[ "].*?</article>', re.S)


def astro_como_no_python(html: str) -> tuple[str, int]:
    """Tira o link "Ver todas as histórias" da home e desfaz o degradê do resumo cortado (T17j). Devolve o HTML e quantas trocas."""
    html, a = RE_LINK_DA_HOME.subn("", html)
    html, b = RE_RESUMO_CORTADO.subn(r"\1… \2", html)
    return html, a + b


def python_como_no_astro(html: str) -> tuple[str, int]:
    """Na home (a página com o carrossel data-more-url), só os 4 primeiros cartões (T17j)."""
    if 'data-more-url="' not in html:
        return html, 0
    cartoes = list(RE_CARTAO.finditer(html, html.index('data-more-url="')))
    for m in reversed(cartoes[4:]):
        html = html[: m.start()] + html[m.end():]
    return html, max(0, len(cartoes) - 4)


def ler_site(pasta: Path, tirar_ordem: bool):
    """`tirar_ordem` = é o site do Astro (tira o que só ele tem); senão, o do Python (só a regra da home com 4 histórias)."""
    paginas, comentarios, textos, ordem, trocas = {}, {}, {}, 0, 0
    for f in sorted(pasta.rglob("*.html")):
        rel = f.relative_to(pasta).as_posix()
        if rel.startswith("dev/") or (STATIC / rel).is_file():
            continue
        url = BL.url_de(rel)
        html = f.read_text("utf-8")
        if tirar_ordem:
            html, n = sem_bloco_de_ordem(html)
            ordem += n
            html, q = astro_como_no_python(html)
            trocas += q
        else:
            html, q = python_como_no_astro(html)
            trocas += q
        L = BL.ler(html)
        paginas[url] = {"title": L.title, "description": L.description, "lang": L.lang, "canonical": L.canonical,
                        "hreflang": dict(sorted(L.hreflang.items())), "og": dict(sorted(L.og.items())),
                        "alternates": sorted(L.alternates, key=lambda x: (x["type"], x["href"])), "meta_refresh": L.refresh}
        if L.data_pages:
            comentarios[url] = L.data_pages
        textos[url] = L.texto()
    return {"paginas": paginas, "comentarios": comentarios, "textos": textos, "blocos_de_ordem": ordem, "trocas_t17j": trocas}


def baseline():
    b = RAIZ / "baseline"
    textos = {}
    for f in (b / "texto").glob("*.txt"):
        t = f.read_text("utf-8")
        url, _, corpo = t.partition("\n\n")
        textos[url.removeprefix("URL: ")] = corpo.rstrip("\n")
    return {"urls": json.loads((b / "urls.json").read_text()), "comentarios": json.loads((b / "comentarios.json").read_text()),
            "paginas": json.loads((b / "paginas.json").read_text()), "feeds": json.loads((b / "feeds.json").read_text()),
            "estaticos": json.loads((b / "estaticos.json").read_text()), "textos": textos}


# ───────────── comparação ─────────────
class Relatorio:
    def __init__(self):
        self.diferencas: list[str] = []
        self.info: list[str] = []
        self.dados: dict = {}

    def dif(self, s):
        self.diferencas.append(s)

    def ok(self, s):
        self.info.append(s)


def comparar_leituras(R: Relatorio, nome: str, a: dict, b: dict, rotulo_a: str, rotulo_b: str):
    """Compara duas leituras (paginas/comentarios/textos), página a página."""
    for parte in ("paginas", "comentarios", "textos"):
        x, y = a[parte], b[parte]
        so_a, so_b = sorted(set(x) - set(y)), sorted(set(y) - set(x))
        if so_a:
            R.dif(f"[{nome}] {parte}: só em {rotulo_a}: {so_a[:10]}{' …' if len(so_a) > 10 else ''}")
        if so_b:
            R.dif(f"[{nome}] {parte}: só em {rotulo_b}: {so_b[:10]}{' …' if len(so_b) > 10 else ''}")
        dif = [u for u in sorted(set(x) & set(y)) if x[u] != y[u]]
        for u in dif[:15]:
            if parte == "textos":
                la, lb = x[u].split("\n"), y[u].split("\n")
                i = next((i for i, (p, q) in enumerate(zip(la, lb)) if p != q), min(len(la), len(lb)))
                R.dif(f"[{nome}] texto de {u}: linha {i + 1}: {rotulo_a} {la[i:i + 1]} × {rotulo_b} {lb[i:i + 1]}")
            else:
                campos = [k for k in set(x[u]) | set(y[u]) if (x[u].get(k) if isinstance(x[u], dict) else x[u]) != (y[u].get(k) if isinstance(y[u], dict) else y[u])] if isinstance(x[u], dict) else ["ids"]
                R.dif(f"[{nome}] {parte} de {u} difere em {sorted(campos)}: {rotulo_a} {json.dumps(x[u] if not isinstance(x[u], dict) else {k: x[u].get(k) for k in campos}, ensure_ascii=False)[:300]} × {rotulo_b} {json.dumps(y[u] if not isinstance(y[u], dict) else {k: y[u].get(k) for k in campos}, ensure_ascii=False)[:300]}")
        if len(dif) > 15:
            R.dif(f"[{nome}] {parte}: … e mais {len(dif) - 15} páginas")
        if not (so_a or so_b or dif):
            R.ok(f"[{nome}] {parte}: {len(x)} páginas iguais ({rotulo_a} = {rotulo_b})")


def comparar_par(R: Relatorio, modo: str, py: Path, astro: Path, BLD):
    nome = modo
    fp, fa = arquivos(py), arquivos(astro)
    estaticos = {p.relative_to(STATIC).as_posix() for p in STATIC.rglob("*") if p.is_file()} - IGNORAR_ESTATICOS
    dados = R.dados.setdefault(modo, {})

    # 1. arquivos
    html_p, html_a = {f for f in fp if f.endswith(".html")}, {f for f in fa if f.endswith(".html")}
    dados["arquivos"] = {"python": len(fp), "astro": len(fa), "html_python": len(html_p), "html_astro": len(html_a), "static": len(estaticos)}
    if html_p != html_a:
        R.dif(f"[{nome}] páginas HTML: só no Python {sorted(html_p - html_a)}, só no Astro {sorted(html_a - html_p)}")
    else:
        R.ok(f"[{nome}] páginas HTML: as mesmas {len(html_p)} nos dois")
    if modo == "publicado":
        # as páginas .html prontas de static/ (B35: produtos.html, night.html…) não são páginas geradas:
        # a baseline as conta em outros_de_static_relevantes (conferidas logo abaixo)
        de_static = {f[1:] for f in BLD["urls"]["outros_de_static_relevantes"] if f.endswith(".html")}
        urls = sorted(BL.url_de(f) for f in html_a if f not in de_static)
        if urls != sorted(BLD["urls"]["html"]):
            R.dif(f"[{nome}] páginas do Astro × baseline/urls.json: só no Astro {sorted(set(urls) - set(BLD['urls']['html']))}, só na baseline {sorted(set(BLD['urls']['html']) - set(urls))}")
        else:
            R.ok(f"[{nome}] páginas do Astro = baseline/urls.json ({len(urls)})")
        for f in BLD["urls"]["outros_gerados"] + BLD["urls"]["outros_de_static_relevantes"]:
            if f[1:] not in fa:
                R.dif(f"[{nome}] {f} (baseline) não está no Astro")
    # static/
    faltam_p = sorted(estaticos - fp)
    faltam_a = sorted(estaticos - fa)
    dif_p = sorted(f for f in estaticos & fp if sha(py / f) != sha(STATIC / f))
    dif_a = sorted(f for f in estaticos & fa if sha(astro / f) != sha(STATIC / f))
    for rot, lista in (("faltam no Python", faltam_p), ("faltam no Astro", faltam_a), ("diferentes do static/ no Python", dif_p), ("diferentes do static/ no Astro", dif_a)):
        if lista:
            R.dif(f"[{nome}] arquivos de static/ {rot}: {lista[:10]}")
    if not (faltam_p or faltam_a or dif_p or dif_a):
        R.ok(f"[{nome}] os {len(estaticos)} arquivos de static/ (menos custom.css) estão nos dois, iguais ao static/ byte a byte")
    if modo == "publicado":
        ref = BLD["estaticos"]["arquivos"]
        atuais = {f: sha(STATIC / f) for f in estaticos}
        novos, sumiram = sorted(set(atuais) - set(ref)), sorted(set(ref) - set(atuais))
        mudaram = sorted(f for f in set(atuais) & set(ref) if atuais[f] != ref[f])
        dados["estaticos_x_baseline"] = {"novos": novos, "sumiram": sumiram, "mudaram": mudaram}
        if novos or sumiram or mudaram:
            R.dif(f"[{nome}] static/ × baseline/estaticos.json: novos {novos}, sumiram {sumiram}, mudaram {mudaram}")
        else:
            R.ok(f"[{nome}] static/ = baseline/estaticos.json ({len(ref)} arquivos, mesmos hashes)")
    # o que só um lado tem
    so_p = sorted(fp - fa - estaticos)
    if so_p:
        R.dif(f"[{nome}] arquivos que só o Python publica: {so_p[:20]}")
    grupos, sem_grupo = defaultdict(list), []
    for f in sorted(fa - fp):
        g = [n for n, r in SO_NO_ASTRO if r.match(f)]
        (grupos[g[0]].append(f) if len(g) == 1 else sem_grupo.append(f))
    dados["so_no_astro"] = {g: len(v) for g, v in grupos.items()}
    for g, v in grupos.items():
        R.ok(f"[{nome}] só no Astro, {g}: {len(v)} arquivos")
    if sem_grupo:
        R.dif(f"[{nome}] arquivos que só o Astro publica, sem decisão: {sem_grupo[:20]}")
    # as versões leves: cada .webp é de uma imagem que existe em static/ (mesmo nome, mesma pasta)
    # (o Astro troca alguns caracteres do nome no arquivo gerado, ex.: "Light & Blood" → "Light _ Blood"; compara-se só letras e algarismos)
    limpo = lambda s: re.sub(r"[\W_]", "", s)
    origens = {limpo(re.sub(r"\.[^./]+$", "", f)) for f in estaticos}
    orfas = [f for f in grupos.get(SO_NO_ASTRO[2][0], []) if limpo(re.sub(r"_[A-Za-z0-9-]{4,10}\.webp$", "", f)) not in origens]
    if orfas:
        R.dif(f"[{nome}] versões leves sem a imagem original em static/: {orfas[:10]}")

    # 2. byte a byte
    exatos = ["index.html", "CNAME", "en/feed.xml", "pt/feed.xml"] + [u[1:] for u in BLD["urls"]["redirects_site_antigo"]]
    iguais = [f for f in exatos if (py / f).is_file() and (astro / f).is_file() and (py / f).read_bytes() == (astro / f).read_bytes()]
    if len(iguais) != len(exatos):
        R.dif(f"[{nome}] diferentes byte a byte: {sorted(set(exatos) - set(iguais))}")
    else:
        R.ok(f"[{nome}] iguais byte a byte: {len(iguais)} arquivos (raiz, CNAME, 2 feeds, {len(exatos) - 4} páginas do site antigo)")
    dados["byte_a_byte"] = len(iguais)
    if modo == "publicado":
        for f in ("en/feed.xml", "pt/feed.xml"):
            if BL.feed_info(astro / f) != BLD["feeds"]["/" + f]:
                R.dif(f"[{nome}] /{f}: itens diferentes dos de baseline/feeds.json")
        R.ok(f"[{nome}] feeds: itens = baseline/feeds.json") if all(BL.feed_info(astro / f) == BLD["feeds"]["/" + f] for f in ("en/feed.xml", "pt/feed.xml")) else None

    # 3. HTML inteiro (Node + parse5)
    saida = Path(tempfile.mkdtemp(prefix="hc-t18-")) / "html.json"
    r = subprocess.run(["node", str(RAIZ / "tools/paridade_html.mjs"), "--python", str(py), "--astro", str(astro), "--json", str(saida)], cwd=RAIZ, capture_output=True, text=True)
    res = json.loads(saida.read_text())
    shutil.rmtree(saida.parent, ignore_errors=True)
    dados["html"] = {k: res[k] for k in ("paginas", "identicasSemRegra", "iguaisDepoisDasRegras", "regras", "hcIguais")} | {"diferentes": [d["url"] for d in res["diferentes"]], "falhas": res["falhas"]}
    dados["comportamentos"] = res["comportamentos"]
    if r.returncode or res["diferentes"] or res["falhas"]:
        R.dif(f"[{nome}] HTML inteiro: {len(res['diferentes'])} páginas diferentes, {len(res['falhas'])} falhas (rode tools/paridade_html.mjs para ver)\n{r.stdout[-4000:]}")
    else:
        R.ok(f"[{nome}] HTML inteiro: {res['paginas']} páginas iguais ({res['identicasSemRegra']} byte a byte; as outras depois das diferenças decididas)")

    # 4. régua da baseline
    lp, la = ler_site(py, False), ler_site(astro, True)
    dados["blocos_de_ordem_tirados"] = la["blocos_de_ordem"]
    dados["trocas_t17j"] = {"astro": la["trocas_t17j"], "python": lp["trocas_t17j"]}
    dados["ids"] = {"astro_paginas": len(la["comentarios"]), "astro_ids_unicos": len({i for v in la["comentarios"].values() for i in v}),
                    "python_paginas": len(lp["comentarios"]), "python_ids_unicos": len({i for v in lp["comentarios"].values() for i in v})}
    comparar_leituras(R, nome, lp, la, "Python", "Astro")
    if modo == "publicado":
        foto = {"paginas": BLD["paginas"], "comentarios": BLD["comentarios"]["por_pagina"], "textos": BLD["textos"]}
        comparar_leituras(R, nome + " × baseline", foto, la, "baseline", "Astro")
        comparar_leituras(R, nome + " × baseline", foto, lp, "baseline", "Python")
        ids = sorted({i for v in la["comentarios"].values() for i in v})
        if ids != BLD["comentarios"]["ids_unicos"]:
            R.dif(f"[{nome}] IDs únicos do Astro ({len(ids)}) ≠ baseline ({len(BLD['comentarios']['ids_unicos'])})")
        else:
            R.ok(f"[{nome}] IDs de comentários: {len(ids)} únicos em {len(la['comentarios'])} páginas = baseline/comentarios.json")
        bilingue = [i for i in ids if re.search(r"^(en|pt)/|/(en|pt)$", i)]
        if bilingue:
            R.dif(f"[{nome}] IDs com idioma dentro (a conversa deixaria de ser compartilhada): {bilingue}")


def main():
    ap = argparse.ArgumentParser(description="T18: paridade Astro × Python × baseline, arquivo por arquivo.")
    ap.add_argument("--gerar", action="store_true", help="gera os sites antes de comparar")
    ap.add_argument("--pasta", help="onde ficam (ou ficarão) os sites; padrão: uma pasta temporária apagada no fim")
    ap.add_argument("--modos", default="publicado,previa,extras")
    ap.add_argument("--json", help="grava o resultado completo")
    a = ap.parse_args()
    modos = a.modos.split(",")
    temporaria = None
    if a.pasta:
        pasta = Path(a.pasta).resolve()
    else:
        if not a.gerar:
            sys.exit("sem --pasta, use --gerar")
        temporaria = pasta = Path(tempfile.mkdtemp(prefix="hc-t18-sites-"))
    if pasta == RAIZ or RAIZ in pasta.parents:
        sys.exit("a pasta dos sites tem de ficar FORA do projeto")
    try:
        if a.gerar:
            print("gerando os sites…")
            gerar(pasta, modos)
        BLD = baseline()
        R = Relatorio()
        for m in modos:
            comparar_par(R, m, pasta / f"py-{m}", pasta / f"astro-{m}", BLD)
        print("\n── iguais / decididos ──")
        for s in R.info:
            print("  " + s)
        print(f"\n── DIFERENÇAS ({len(R.diferencas)}) ──")
        for s in R.diferencas:
            print("  " + s)
        if a.json:
            Path(a.json).write_text(json.dumps({"diferencas": R.diferencas, "iguais": R.info, "dados": R.dados}, indent=2, ensure_ascii=False))
        return 1 if R.diferencas else 0
    finally:
        if temporaria:
            shutil.rmtree(temporaria, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
