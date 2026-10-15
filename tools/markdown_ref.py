#!/usr/bin/env python3
"""T09 — Referência do Markdown do site, tirada do make_md() do build.py, para os testes do Astro.

Uso (na raiz do repositório):
  python3 tools/markdown_ref.py                     # regrava tests/fixtures/markdown-python.json
  python3 tools/markdown_ref.py --ver content/news/2023-08-18-orcs/pt.md [--previa] [--versalete]
                                                    # só imprime o HTML que o make_md() dá para um arquivo

O que grava (tudo saído das funções de verdade do build.py, importado SEM gerar o site, com BASE = "" como
no Astro, e com os atalhos {{stories}}/{{emissaries}}/{{other-stories}} trocados pelos MESMOS marcadores
que o Astro usa — ver ATALHOS abaixo e src/lib/corpos.ts):
  1. "indice": o INDEX dos [[links]] (seção/pasta → título, endereço) por idioma, no build (DRAFTS = False)
     e na prévia (DRAFTS = True), capturado de um build() de verdade.
  2. "corpos": para CADA .md de content/, o make_md(idioma, divisor)(corpo) no contexto em que o build.py
     o renderiza (capítulos com o `divider` do work.json; o resto sem divisor), sem e com a etapa de versalete
     do shell() — no build e na prévia (a prévia só é gravada quando dá diferente).
  3. "chamadas": TODAS as chamadas ao make_md() feitas por um build() de verdade (build e prévia), com
     a escrita de arquivos trocada por funções que não fazem nada. Prova que os contextos de "corpos" são os
     do build(), e grava as composições (a página Sobre = Projeto + Sobre).
  4. Casos inventados, com um índice e uma pasta de embeds inventados (gravados aqui e recriados pelo teste):
     "casos" (escritos à mão, um ou mais por ramo e por expressão regular), "aleatorios" (sorteados com
     semente fixa a partir de pedaços "perigosos"), "url_embed", "embed_html" e "versalete" (smallcaps()
     direto, e o "entre tags" do shell()).
O teste (tests/markdown.test.ts, `pnpm test`) compara, texto a texto, src/lib/markdown.ts e src/lib/corpos.ts
com o que está gravado aqui. Por que um arquivo e não chamar o Python na hora do teste: depois da virada
(T20) o build.py sai da branch principal (mesmo motivo de runas_ref.py e frontmatter_ref.py).

Atenção: a referência é uma FOTO do conteúdo. Mudou algo em content/ (texto, embed, work.json)?
Rode este script de novo antes do `pnpm test` (junto com tools/frontmatter_ref.py).

Só biblioteca padrão. Não cria public/ nem __pycache__.
"""
import argparse, contextlib, hashlib, io, json, random, re, shutil, sys, tempfile
from pathlib import Path

sys.dont_write_bytecode = True                      # não deixar __pycache__ no projeto
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build  # noqa: E402  (só importar não gera nada: o build() roda apenas em `python build.py`)

SAIDA = ROOT / "tests" / "fixtures" / "markdown-python.json"
CONTENT = build.CONTENT
# O site Astro fica na raiz do domínio, sem `base` (astro.config.mjs): todos os endereços aqui saem sem o
# base_url do config.json (que hoje, aliás, está com o bug B1 do BACKLOG). É o mesmo que `python build.py serve` faz.
build.BASE = ""

# Os marcadores que o Astro põe no lugar dos atalhos (src/lib/corpos.ts → MARCADORES_DE_ATALHO).
# O teste confere que são os mesmos dos dois lados.
ATALHOS = {
    "stories": "<!--hc:atalho:stories-->",
    "emissaries": "<!--hc:atalho:emissaries-->",
    "other-stories": "<!--hc:atalho:other-stories-->",
}

# ───────── o "versalete do shell()" ─────────

def versalete_entre_tags(html):
    """O que o shell() faz com o <main> (re.sub(r">([^<>]+)<", … smallcaps …)), com o HTML do make_md
    dentro de um elemento, como fica na página: <div class="prose">…</div>. As pontas são tiradas depois."""
    return re.sub(r">([^<>]+)<", lambda m: ">" + build.smallcaps(m.group(1)) + "<", ">" + html + "<")[1:-1]


def main_pelo_shell(html, lang):
    """O mesmo, mas passando pelo shell() DE VERDADE (página inteira) e recortando o <main>. Só para conferir
    versalete_entre_tags() (as duas têm de dar igual; o shell() ainda mexe em class="works", que o Markdown não usa)."""
    has = {l: {"about": False, "news": False, "extras": [], "support": False} for l in build.LANGS}
    pagina = build.shell(lang, "x", "<div>" + html + "</div>", has=has, seed="x")
    inicio = '<main id="main" class="sheet">\n'
    i = pagina.index(inicio) + len(inicio)
    j = pagina.rindex("\n</main>")
    main = pagina[i:j]
    assert main.startswith("<div>") and main.endswith("</div>"), main[:80]
    return main[5:-6]


def render(texto, lang, divisor, indice, atalhos=ATALHOS):
    """make_md(lang, divisor)(texto) com o INDEX e o SHORT dados (o make_md lê as variáveis globais na hora)."""
    salvo = (dict(build.INDEX), dict(build.SHORT), build.BASE)
    build.INDEX.clear()
    build.INDEX.update({(l, k): tuple(v) for l, d in indice.items() for k, v in d.items()})
    build.SHORT.clear()
    build.SHORT.update({l: dict(atalhos) for l in build.LANGS})
    build.BASE = ""
    try:
        html = build.make_md(lang, divisor)(texto)
    finally:
        build.INDEX.clear(); build.INDEX.update(salvo[0])
        build.SHORT.clear(); build.SHORT.update(salvo[1])
        build.BASE = salvo[2]
    return {"html": html, "versalete": versalete_entre_tags(html)}


def nos_dois_modos(texto, lang, divisor, indices):
    """Renderiza no build e na prévia; a prévia só é gravada quando dá diferente."""
    b = render(texto, lang, divisor, indices["build"])
    p = render(texto, lang, divisor, indices["previa"])
    return {"build": b, "previa": None if p == b else p}


# ───────── build() de verdade: o INDEX e as chamadas ao make_md ─────────

def build_de_verdade(drafts):
    """Roda o build() (nada é escrito em disco) e devolve o INDEX final e todas as chamadas ao make_md()."""
    chamadas = []
    original_make_md = build.make_md

    def make_md_gravando(lang, divider=None):
        render_original = original_make_md(lang, divider)

        def render_gravando(text):
            salvo = build.SHORT.get(lang)
            # Os cards de verdade dão lugar aos marcadores do Astro. Atenção (revisão da T09): no build.py, o texto dos
            # EMISSÁRIOS é convertido enquanto SHORT[lang] ainda está sendo montado, então lá um {{atalho}} sumiria (""),
            # enquanto no Astro fica o marcador. Nenhum emissário usa atalho hoje; se um dia usar, decidir o comportamento.
            build.SHORT[lang] = dict(ATALHOS)
            try:
                html = render_original(text)
            finally:
                if salvo is None:
                    build.SHORT.pop(lang, None)
                else:
                    build.SHORT[lang] = salvo
            chamadas.append({"lang": lang, "divisor": divider, "texto": text, "html": html})
            return html
        return render_gravando

    orig = (build.write, build.shell, build.clean_out, build.OUT, build.BASE, shutil.copytree, build.make_md, build.DRAFTS, dict(build.SHORT))
    with tempfile.TemporaryDirectory(prefix="hc-build-") as tmp:
        build.write = lambda url, content: None
        build.shell = lambda *a, **k: ""
        build.clean_out = lambda: None
        build.OUT, build.BASE, build.DRAFTS = Path(tmp) / "public", "", drafts
        shutil.copytree = lambda *a, **k: None          # não copiar static/ (135 MB) para lugar nenhum
        build.make_md = make_md_gravando
        try:
            build.INDEX.clear()
            with contextlib.redirect_stdout(io.StringIO()):   # cala o "✔ site gerado em…" (aqui nada é gerado)
                build.build()
            indice = {l: {} for l in build.LANGS}
            for (l, k), v in sorted(build.INDEX.items()):
                indice[l][k] = list(v)
        finally:
            (build.write, build.shell, build.clean_out, build.OUT, build.BASE, shutil.copytree, build.make_md, build.DRAFTS) = orig[:8]
            build.SHORT.clear(); build.SHORT.update(orig[8])
            build.INDEX.clear()
    return indice, chamadas


# ───────── os corpos de content/ ─────────

def rel(p):
    return p.relative_to(CONTENT).as_posix()


def contexto_do_arquivo(p):
    """Idioma e divisor com que o build.py renderiza o arquivo: capítulos levam o `divider` da obra (work.json)."""
    partes = p.relative_to(CONTENT).parts
    lang = p.stem
    if partes[0] == "works" and len(partes) == 4:
        meta = json.loads((CONTENT / "works" / partes[1] / "work.json").read_text("utf-8"))
        return lang, meta.get("divider")
    return lang, None


def sha1(texto):
    return hashlib.sha1(texto.encode("utf-8")).hexdigest()


def corpos_de_content(indices):
    out = {}
    for p in sorted(CONTENT.rglob("*.md")):
        fm, body = build.parse(p)
        lang, divisor = contexto_do_arquivo(p)
        out[rel(p)] = {"lang": lang, "divisor": divisor, "sha1": sha1(body), **nos_dois_modos(body, lang, divisor, indices)}
        if not out[rel(p)]["build"]["html"].count('class="works"'):   # confere o versalete contra o shell() de verdade
            assert main_pelo_shell(out[rel(p)]["build"]["html"], lang) == out[rel(p)]["build"]["versalete"], rel(p)
    return out


def identificar_chamadas(chamadas, corpos, modo):
    """Diz de que arquivo(s) veio o texto de cada chamada do build() e confere com "corpos"."""
    corpo = {r: build.parse(CONTENT / r)[1] for r in corpos}
    out = []
    for c in chamadas:
        candidatos = sorted(r for r, b in corpo.items() if b == c["texto"] and corpos[r]["lang"] == c["lang"] and corpos[r]["divisor"] == c["divisor"])
        if candidatos:
            esperado = corpos[candidatos[0]]["previa" if modo == "previa" and corpos[candidatos[0]]["previa"] else "build"]["html"]
            if c["html"] != esperado:
                raise SystemExit(f"✘ a chamada do build() para {candidatos} deu um HTML diferente do de 'corpos' (contexto errado?)")
            out.append({"lang": c["lang"], "divisor": c["divisor"], "partes": candidatos, "composicao": False})
            continue
        # a página Sobre: corpo do Projeto + "\n\n" + corpo do Sobre (build.py, linha ~920)
        sobre, projeto = f"pages/about/{c['lang']}.md", f"pages/project/{c['lang']}.md"
        if sobre in corpo and projeto in corpo and c["texto"] == corpo[projeto] + "\n\n" + corpo[sobre]:
            out.append({"lang": c["lang"], "divisor": c["divisor"], "partes": [projeto, sobre], "composicao": True,
                        "html": c["html"], "versalete": versalete_entre_tags(c["html"])})
            continue
        raise SystemExit(f"✘ chamada do build() que não vem de nenhum arquivo conhecido: {c['texto'][:120]!r}")
    return out


# ───────── casos inventados ─────────

DIVISOR = "other images/AIANW Scene Divider.png"

# Índice inventado (independe do conteúdo de verdade). "pages/rascunho" só existe na prévia (= rascunho).
INDICE_INVENTADO_BUILD = {
    "pt": {
        "news/noticia": ["Notícia *com* estrela", "/pt/news/noticia/"],
        "works/obra": ["Hᴀᴛᴇ Cʏᴄʟᴇ: a obra", "/pt/works/obra/01/"],
        "pages/sobre": ["Sobre & <i>companhia</i>", "/pt/sobre/"],
        "characters/x": ["[colchetes](link) **forte**", "/pt/characters/x/"],
    },
    "en": {
        "news/noticia": ["News *with* star", "/en/news/noticia/"],
        "works/obra": ["Hᴀᴛᴇ Cʏᴄʟᴇ: the work", "/en/works/obra/"],
    },
}
INDICE_INVENTADO_PREVIA = json.loads(json.dumps(INDICE_INVENTADO_BUILD))
INDICE_INVENTADO_PREVIA["pt"]["pages/rascunho"] = ["Rascunho", "/pt/rascunho/"]
INDICE_INVENTADO_PREVIA["en"]["pages/rascunho"] = ["Draft", "/en/rascunho/"]
INDICES_INVENTADOS = {"build": INDICE_INVENTADO_BUILD, "previa": INDICE_INVENTADO_PREVIA}

# Pasta content/ inventada para os {{embed:nome}} (caminho relativo a ela → texto exato do arquivo; "\ufeff" = BOM).
EMBEDS_INVENTADOS = {
    "embeds/post-x.html": "\ufeff  <blockquote class=\"twitter-tweet\"><a href=\"https://x.com/a/status/1\"></a></blockquote>\r\n<script async src=\"https://platform.x.com/widgets.js\" charset=\"utf-8\"></script>\r\n\n",
    "embeds/post-insta.html": "<blockquote class=\"instagram-media\" data-instgrm-permalink=\"https://www.instagram.com/p/abc/\"></blockquote>\r<script async src=\"//www.instagram.com/embed.js\"></script>",
    "embeds/post-reddit.html": "<blockquote class=\"reddit-embed-bq\"><a href=\"https://www.reddit.com/r/x/\">Hᴀᴛᴇ Cʏᴄʟᴇ no Reddit</a></blockquote>\n",
    "embeds/post-tiktok.html": "<blockquote class=\"tiktok-embed\" cite=\"https://www.tiktok.com/@a/video/1\"></blockquote>",
    "embeds/post-youtube.html": "<iframe src=\"https://www.youtube.com/embed/abcdefghijk\"></iframe>",
    "embeds/post-generico.html": "<div class=\"bsky\">Post sem tipo conhecido — Sᴇɴʜᴏʀ /ʃa/</div>",
    "embeds/vazio.html": "  \n\t\n",
    "embeds/sub/dentro.html": "<p>arquivo numa subpasta</p>",
    "embeds/com espaço.html": "<p>nome com espaço</p>",
    "embeds/acentuação.html": "<p>nome com acento</p>",
    "embeds/x.html.html": "<p>nome terminado em .html</p>",
    "fora.html": "<p>fora da pasta embeds (../fora)</p>",
}


@contextlib.contextmanager
def conteudo_inventado():
    """Cria a pasta content/ inventada num diretório temporário e aponta o build.CONTENT para ela."""
    with tempfile.TemporaryDirectory(prefix="hc-embeds-") as tmp:
        for caminho, texto in EMBEDS_INVENTADOS.items():
            p = Path(tmp) / caminho
            p.parent.mkdir(parents=True, exist_ok=True)
            with open(p, "w", encoding="utf-8", newline="") as f:      # newline="": grava \r e \r\n como estão
                f.write(texto)
        salvo = build.CONTENT
        build.CONTENT = Path(tmp)
        try:
            yield
        finally:
            build.CONTENT = salvo


# Casos escritos à mão: (nome, texto, idioma, divisor). Um ou mais por ramo de render() e por expressão regular.
CASOS = [
    # parágrafos e quebras (soft)
    ("paragrafo-simples", "Um parágrafo.", "pt", None),
    ("quebra-simples-vira-espaco", "linha um\nlinha dois", "pt", None),
    ("dois-espacos-viram-br", "linha um  \nlinha dois", "pt", None),
    ("barra-vira-br", "linha um\\\nlinha dois", "pt", None),
    ("espaco-e-barra-misturados", "a \\ \nb\\  \nc \\", "pt", None),
    ("br-na-ultima-linha-nao-conta", "a  ", "pt", None),
    ("barra-na-ultima-linha", "a\\", "pt", None),
    ("tres-espacos-e-tab", "a   \nb\t\nc", "pt", None),
    ("varios-paragrafos", "Um.\n\nDois.\n\n\n\nTrês.", "pt", None),
    ("linha-em-branco-com-espacos", "Um.\n   \t \nDois.", "pt", None),
    ("espacos-nas-pontas", "\n\n   Texto com espaços   \n\n", "pt", None),
    ("barra-no-meio", "a\\b c\\\\d", "pt", None),
    # ênfase
    ("italico-e-negrito", "*itálico* e **negrito**", "pt", None),
    ("enfase-colada-em-pontuacao", "*a*. (*b*) \"*c*\" “*d*” *e*, *f*! ¿*g*?", "pt", None),
    ("enfase-colada-em-letra", "a*b*c *d*e f*g* 1*2*3 _*h*_", "pt", None),
    ("enfase-com-espaco-dentro", "* a* *b * * c * *d*", "pt", None),
    ("negrito-dentro-de-italico", "*a **b** c*", "pt", None),
    ("italico-dentro-de-negrito", "**a *b* c**", "pt", None),
    ("tres-asteriscos", "***a*** e ***b** c*", "pt", None),
    ("asteriscos-desencontrados", "**a* *b** ***c **d", "pt", None),
    ("negrito-atravessa-linha", "**a\nb**", "pt", None),
    ("negrito-atravessa-br", "**a  \nb**", "pt", None),
    ("enfase-com-acento-e-astral", "é*a*é 𝓶*b*𝓶 😀*c*😀 *𝓶𝓪𝓰𝓲𝓬* *😀*", "pt", None),
    ("enfase-com-nbsp", "* a*  *b * *c*", "pt", None),
    ("sublinhado-nao-e-enfase", "_a_ __b__ ___c___", "pt", None),
    # links e imagens
    ("link-simples", "[texto](https://exemplo.com/a?b=1&c=2)", "pt", None),
    ("link-do-site", "[a](/pt/works/x y/) [b](pt/x y) [c](#ancora) [d](mailto:a@b.c) [e](data:x)", "pt", None),
    ("link-com-parenteses", "[a](https://x.com/a_(b)) [c (d)](e) [f](g) (h)", "pt", None),
    ("link-com-titulo", "[a](b \"título\")", "pt", None),
    ("links-colados", "[a](b)[c](d) [[news/noticia]][[works/obra]]", "pt", None),
    ("colchetes-soltos", "[a] (b) [c]] (d) [e]((f)) [](g) [h]()", "pt", None),
    ("imagem-sozinha-vira-figure", "![Legenda & “aspas”](other images/a b.png)", "pt", None),
    ("imagem-alt-vazio", "![](x.png)", "pt", None),
    ("imagem-alt-vazio-no-texto", "texto ![](a b.png) e ![c](https://x.com/d.png)", "pt", None),
    ("duas-imagens-no-bloco", "![a](b.png)\n![c](d.png)", "pt", None),
    ("imagem-com-colchete-no-alt", "![a [b] c](d.png) ![a] (b.png)", "pt", None),
    ("imagem-com-parentese", "![a](b (c).png)", "pt", None),
    ("imagem-dentro-de-link", "[![a](b.png)](c)", "pt", None),
    ("caminho-com-acento-e-simbolos", "![x](pasta/ação & cia/100%.png) [y](a'b!c(d)*e~f.png)", "pt", None),
    # [[links]]
    ("wiki-encontrado", "[[news/noticia]] e [[works/obra]]", "pt", None),
    ("wiki-com-rotulo", "[[news/noticia|Rótulo *em* itálico]]", "pt", None),
    ("wiki-rotulo-vazio", "[[news/noticia|]]", "pt", None),
    ("wiki-duas-barras", "[[news/noticia|a|b]]", "pt", None),
    ("wiki-com-espacos", "[[ news/noticia ]] [[ news/noticia | r ]]", "pt", None),
    ("wiki-inexistente", "[[news/nao-existe]] [[news/nao-existe|Rótulo]] [[sem-barra]] [[a/b/c]]", "pt", None),
    ("wiki-rascunho", "[[pages/rascunho]] [[pages/rascunho|aqui]]", "pt", None),
    ("wiki-outro-idioma", "[[pages/sobre]] [[characters/x]]", "en", None),
    ("wiki-titulo-com-markdown", "[[characters/x]] [[pages/sobre]]", "pt", None),
    ("wiki-atravessa-br", "[[news/noticia|a  \nb]]", "pt", None),
    # títulos
    ("titulos-1-a-4", "# Um\n\n## Dois\n\n### Três\n\n#### Quatro", "pt", None),
    ("titulo-5-nao-e-titulo", "##### Cinco", "pt", None),
    ("titulo-sem-espaco", "#Um", "pt", None),
    ("titulo-com-enfase-e-link", "## *Um* [[news/noticia]] **dois**", "pt", None),
    ("titulo-com-quebra", "#\nDepois da quebra", "pt", None),
    ("titulo-duas-linhas", "# Um\nDois", "pt", None),
    ("titulo-vazio", "#   ", "pt", None),
    ("titulo-tab", "##\tTab", "pt", None),
    # divisor de cena
    ("divisor-com-imagem", "Cena 1.\n\n---\n\nCena 2.", "pt", DIVISOR),
    ("divisor-sem-obra", "Cena 1.\n\n---\n\nCena 2.", "pt", None),
    ("divisor-vazio-no-work-json", "a\n\n---\n\nb", "pt", ""),
    ("divisor-com-link-externo", "---", "pt", "https://exemplo.com/d.png"),
    ("divisor-com-simbolos", "***", "pt", "a&b (1)/ç.png"),
    ("divisores-variantes", "***\n\n___\n\n----------\n\n- - -\n\n* * *\n\n--\n\n-*-", "pt", DIVISOR),
    ("divisor-colado-no-texto", "a\n---\nb", "pt", DIVISOR),
    # HTML cru
    ("html-cru-com-arroba", "<div class=\"s1\"><img src=\"@/other images/a b.png\" alt=\"x\"></div>", "pt", None),
    ("html-cru-arroba-href-e-varios", "<figure><a href=\"@/pasta/x y.pdf\">x</a><img src=\"@/a.png\" data-src=\"@/b.png\" xsrc=\"@/c.png\"></figure>", "pt", None),
    ("html-cru-arroba-vazio-e-url", "<img src=\"@/\"><img src=\"@/https://x.com/a.png\"><img src='@/aspas-simples.png'>", "pt", None),
    ("html-cru-arroba-colado-em-letra", "<img ésrc=\"@/a.png\" src=\"@/b.png\">", "pt", None),
    ("html-cru-nao-processa-markdown", "<div>*não* **muda** [[news/noticia]] Hᴀᴛᴇ Cʏᴄʟᴇ</div>", "pt", None),
    ("html-cru-varias-linhas", "<div>\n  linha\n\n  depois do branco</div>", "pt", None),
    ("html-cru-todas-as-tags", "<figure></figure>\n\n<iframe></iframe>\n\n<section></section>\n\n<table></table>\n\n<details></details>\n\n<ul><li>a</li></ul>\n\n<ol></ol>\n\n<blockquote></blockquote>\n\n<hr>\n\n<img src=\"a.png\">\n\n<video></video>\n\n<audio></audio>\n\n<script>var a = 1 < 2;</script>", "pt", None),
    ("html-que-nao-e-cru", "<span>a</span>\n\n<p>b</p>\n\n<DIV>c</DIV>\n\n<divx>d</divx>\n\n<!-- e -->\n\n <div>f</div>\n\n<b>*g*</b>\n\n<a href=\"@/h.png\">h</a>", "pt", None),
    ("html-cru-tag-colada-em-letra", "<divé>a</divé>\n\n<img_>b", "pt", None),
    ("html-cru-texto-depois", "<div>a</div> e Hᴀᴛᴇ depois", "pt", None),
    ("html-inline-no-paragrafo", "Texto <b> mim </b> e <span style=\"opacity:1.0\">x</span> <img src=\"@/a.png\">", "pt", None),
    # listas
    ("lista-traco", "- um\n- dois", "pt", None),
    ("lista-asterisco-e-traco", "* um\n- dois\n  * três\n\t- quatro", "pt", None),
    ("lista-com-enfase", "- *um*\n- **dois** [[news/noticia]]", "pt", None),
    ("lista-quebrada", "- um\ndois", "pt", None),
    ("lista-sem-espaco", "-um\n- dois", "pt", None),
    ("lista-traco-sozinho", "-", "pt", None),
    ("lista-numerada-nao-e-lista", "1. um\n2. dois", "pt", None),
    ("lista-asterisco-negrito", "** a\n** b", "pt", None),
    ("lista-com-espacos-no-fim", "- a  \n- b\\", "pt", None),
    # citações
    ("citacao-varias-linhas", "> um\n> dois\n>três", "pt", None),
    ("citacao-aninhada", ">> a\n> > b\n>>> c", "pt", None),
    ("citacao-com-br", "> a  \n> b", "pt", None),
    ("citacao-quebrada", "> a\nb", "pt", None),
    ("citacao-com-espacos-antes", " > a", "pt", None),
    # atalhos
    ("atalhos-conhecidos", "{{stories}}\n\n{{emissaries}}\n\n{{other-stories}}", "pt", None),
    ("atalho-desconhecido", "{{xyz}}\n\ntexto depois", "pt", None),
    ("atalho-de-prototipo", "{{constructor}}\n\n{{__proto__}}\n\n{{toString}}", "pt", None),
    ("atalho-com-espacos", "{{ emissaries }}", "pt", None),
    ("atalho-com-texto", "{{emissaries}} e texto", "pt", None),
    ("atalho-no-meio-do-texto", "a {{stories}} b", "pt", None),
    ("atalho-unicode", "{{histórias}}", "pt", None),
    # embeds
    ("embed-link-x", "{{embed:https://x.com/KingOfAllOceans/status/1751455896746459327}}", "pt", None),
    ("embed-dois-links", "{{embed:https://x.com/a/status/1 | https://www.instagram.com/p/abc/}}", "pt", None),
    ("embed-tres", "{{embed:https://www.tiktok.com/@a.b/video/123 | https://www.youtube.com/shorts/abcdefghijk | https://youtu.be/abcdefghijk}}", "pt", None),
    ("embed-arquivo", "{{embed:post-x}}", "pt", None),
    ("embed-arquivo-e-link", "{{embed:post-reddit | https://www.instagram.com/lusca_desenhos/p/DSlmqVaEVQf/}}", "pt", None),
    ("embed-inexistente", "{{embed:nao-existe}}", "pt", None),
    ("embed-inexistente-e-um-bom", "{{embed:nao-existe | post-insta}}", "pt", None),
    ("embed-vazio", "{{embed:vazio}}", "pt", None),
    ("embed-subpasta-e-fora", "{{embed:sub/dentro}}\n\n{{embed:../fora}}", "pt", None),
    ("embed-nome-com-espaco-e-acento", "{{embed:com espaço}}\n\n{{embed:acentuação}}\n\n{{embed:x.html}}", "pt", None),
    ("embed-com-espacos-em-volta", "{{embed: post-x }}\n\n{{embed:  https://x.com/a/status/1  }}", "pt", None),
    ("embed-em-varias-linhas", "{{embed:https://x.com/a/status/1 |\nhttps://www.instagram.com/p/abc/}}", "pt", None),
    ("embed-link-desconhecido", "{{embed:https://exemplo.com/post}}", "pt", None),
    ("embed-link-com-amp", "{{embed:https://www.youtube.com/watch?feature=x&amp;v=abcdefghijk}}", "pt", None),
    ("embed-generico-sem-icone", "{{embed:post-generico | post-tiktok | post-youtube}}", "pt", None),
    ("embed-barras-vazias", "{{embed: | post-x | }}", "pt", None),
    ("embed-dois-no-mesmo-bloco", "{{embed:a}} {{embed:b}}", "pt", None),
    ("embed-e-texto", "{{embed:post-x}}\ntexto colado", "pt", None),
    ("embed-sem-nome", "{{embed:}}", "pt", None),
    # texto com < & > crus, Unicode
    ("menor-e-comercial-crus", "a < b & c > d &amp; e", "pt", None),
    ("unicode-astral", "𝓶𝓪𝓰𝓲𝓬 ✨ 😀 𐤉 🜁 — “aspas”", "pt", None),
    ("espacos-unicode", "a\u00a0b\u3000c\u2028d\u0085e\u001cf\ufeffg", "pt", None),
    ("cr-solto", "a\rb\r\n\r\nc", "pt", None),
    # versalete e IPA (aparecem no "versalete" de cada caso)
    ("versalete-marca", "Hᴀᴛᴇ Cʏᴄʟᴇ, o universo de Hᴀᴛᴇ Cʏᴄʟᴇ’s.", "pt", None),
    ("versalete-senhor", "Sᴇɴʜᴏʀ, oSᴇɴʜᴏʀ, ᴇɴʜᴏʀ, Lᴏʀᴅ ʏᴏᴜ", "pt", None),
    ("versalete-y-z", "ʏ ᴢ xʏz ʏᴢ", "pt", None),
    ("versalete-acentos-e-sinais", "Éᴀ ÿᴀ ×ᴀ ÷ᴀ Øᴀ", "pt", None),
    ("versalete-colado", "HᴀᴛᴇCʏᴄʟᴇ aHᴀᴛᴇ", "pt", None),
    ("versalete-com-quebra", "Hᴀᴛᴇ\nCʏᴄʟᴇ e Hᴀᴛᴇ  \nCʏᴄʟᴇ", "pt", None),
    ("versalete-em-enfase-e-link", "*Hᴀᴛᴇ Cʏᴄʟᴇ* [[works/obra]] [Hᴀᴛᴇ](https://x.com)", "pt", None),
    ("ipa-de-verdade", "qomandilla /qo.ma.'ⁿdi.ʎa/ e /ɦaʊ̯.ˈʔu.ᵐbʷa/", "pt", None),
    ("ipa-so-com-versalete-nao-conta", "/ʀɪ.ʏ/ e /ʀᴀ/", "pt", None),
    ("ipa-com-versalete-dentro", "/ʀɪˈ/ e Hᴀᴛᴇ /ʏɛs/ Cʏᴄʟᴇ", "pt", None),
    ("ipa-limites", "/ʃ/ /a/ /ʃa/ /" + "ʃ" * 40 + "/ /" + "ʃ" * 41 + "/ / ʃa/ /ʃ a/", "pt", None),
    ("ipa-barras-seguidas", "/abc/ʃə/ e /ʃə//ʃə/ e a/ʃə/b", "pt", None),
    ("ipa-com-sinais", "/<ʃə>/ /ʃə&amp;/ /ʃ\"ə/", "pt", None),
]

# Pedaços para os casos sorteados: sintaxe do site, armadilhas de expressão regular e caracteres "difíceis".
PEDACOS = [
    "a", "b", "texto", "é", "ç", "x", "1", "_", "𝓶", "😀", "Hᴀᴛᴇ", "Cʏᴄʟᴇ", "Sᴇɴʜᴏʀ", "ʏ", "ᴢ", "ʀɪ", "ᴀ",
    " ", " ", " ", "  ", "\t", "\n", "\n", "\n", "\n\n", "\n  \n", "\u00a0", "\u0085", "\u001c", "\u2028", "\ufeff", "\u3000", "\r",
    "*", "*", "**", "***", "_", "__", "\\", "\\\n", "  \n", "#", "## ", "# ", "##### ", "- ", "* ", "> ", ">", "---", "***", "___",
    "[", "]", "(", ")", "!", "|", "/", "/", "<", ">", "&", "\"", "'", ".", ",", ":", "-", "~", "%",
    "[[news/noticia]]", "[[pages/rascunho]]", "[[news/nao-existe|r]]", "[[works/obra|", "]]", "[[",
    "![a](b c.png)", "![](x.png)", "[t](/pt/x)", "[t](https://x.com/a_(b))", "[t](pasta/ç.png)",
    "{{", "}}", "{{emissaries}}", "{{stories}}", "{{xyz}}", "{{embed:post-x}}", "{{embed:", "embed:",
    "{{embed:https://x.com/a/status/1 | post-insta}}", "https://x.com/a/status/1", "https://youtu.be/abcdefghijk",
    "<div>", "</div>", "<img src=\"@/a b.png\">", "<span>", "</span>", "<!-- c -->", "<p>", "src=\"@/x.png\"",
    "/ʃə/", "/ɦa.ʊ/", "/ʀɪ/", "ˈ", "ⁿ", "ǃ", "́",
]


def casos_aleatorios(n):
    rnd = random.Random(20261015)
    out = []
    for i in range(n):
        texto = "".join(rnd.choice(PEDACOS) for _ in range(rnd.randint(1, 40)))
        lang = rnd.choice(build.LANGS)
        divisor = rnd.choice([None, None, DIVISOR, "", "a&b (1).png"])
        out.append((f"aleatorio-{i + 1}", texto, lang, divisor))
    return out


# Sorteio por BLOCOS: os pedaços soltos quase nunca formam um bloco inteiro (lista, citação, embed, atalho…);
# aqui cada bloco sai de um molde, com pedaços sorteados no lugar de §a/§b/§c (texto), §e/§f (embed) e §t (atalho).
MOLDES_DE_BLOCO = [
    "§a", "§a\n§b", "- §a\n- §b", "* §a\n  - §b\n\t* §c", "-§a\n- §b", "> §a\n> §b", ">§a\n>> §b", "> §a\n§b",
    "# §a", "## §a", "#### §a", "##### §a", "#§a", "#\n§a", "![§a](§b)", "![§a](§b)\n§c", "<div>§a</div>§b",
    "<img src=\"@/§a\">", "<figure>§a\n§b</figure>", "<span>§a</span>", "{{embed:§e}}", "{{embed:§e | §f}}",
    "{{embed:§e|§f|§e}}", "{{§t}}", "{{ §t }}", "---", "***", "___", "- - -", "§a  \n§b\\\n§c", "§a\n---\n§b",
]
EMBEDS_SORTEAVEIS = ["post-x", "post-insta", "post-generico", "post-reddit", "vazio", "nao-existe", "sub/dentro", "com espaço",
                     "https://x.com/a/status/1", "https://youtu.be/abcdefghijk", "https://www.instagram.com/p/abc/",
                     "https://www.tiktok.com/@a/video/1", "https://www.reddit.com/r/x/comments/a/b_c", "https://exemplo.com/", ""]
ATALHOS_SORTEAVEIS = ["stories", "emissaries", "other-stories", "xyz", "embed:post-x", "embed:nao-existe", "constructor", "histórias"]
SEPARADORES = ["\n\n", "\n\n", "\n \n", "\n\n\n", "\n", "\n\t\u00a0\n"]


def casos_em_blocos(n):
    rnd = random.Random(1510)
    soltos = [p for p in PEDACOS if not any(q in p for q in ("\n", "\r", "\u2028"))]

    def trecho():
        return "".join(rnd.choice(soltos) for _ in range(rnd.randint(1, 8)))
    geradores = {"§a": trecho, "§b": trecho, "§c": trecho, "§e": lambda: rnd.choice(EMBEDS_SORTEAVEIS),
                 "§f": lambda: rnd.choice(EMBEDS_SORTEAVEIS), "§t": lambda: rnd.choice(ATALHOS_SORTEAVEIS)}
    out = []
    for i in range(n):
        blocos = []
        for _ in range(rnd.randint(1, 6)):
            b = rnd.choice(MOLDES_DE_BLOCO)
            for marca, gerar in geradores.items():
                while marca in b:
                    b = b.replace(marca, gerar(), 1)
            blocos.append(b)
        texto = blocos[0]
        for b in blocos[1:]:
            texto += rnd.choice(SEPARADORES) + b
        out.append((f"blocos-{i + 1}", texto, rnd.choice(build.LANGS), rnd.choice([None, DIVISOR, ""])))
    return out


URLS = [
    "https://x.com/KingOfAllOceans/status/1751455896746459327",
    "https://twitter.com/user_1/status/123?s=20",
    "http://www.x.com/a/status/1/photo/1",
    "https://x.com/ação/status/1",
    "https://x.com/a/status/١٢٣",
    "https://x.com//status/1",
    "https://x.com/a/status/",
    "https://www.instagram.com/p/DSPDQOMjcmI/",
    "https://www.instagram.com/lusca_desenhos/p/DSlmqVaEVQf/",
    "https://instagram.com/reel/abc-_1/?igsh=xyz",
    "https://www.instagram.com/tv/abc",
    "https://www.instagram.com/a.b/reel/x/",
    "https://www.instagram.com/stories/x/1/",
    "https://www.tiktok.com/@lusca_sharktopus/video/7493222444245863685",
    "https://tiktok.com/@a.b/video/1?lang=pt",
    "https://www.tiktok.com/@a/photo/1",
    "https://www.youtube.com/watch?v=jKd-CLUk28g",
    "https://youtube.com/watch?feature=share&v=abcdefghijk&t=1",
    "https://www.youtube.com/watch?v=curto",
    "https://www.youtube.com/shorts/abcdefghijk",
    "https://www.youtube.com/embed/abcdefghijk?start=3",
    "https://youtu.be/abcdefghijk",
    "https://youtu.be/abcdefghij",
    "https://www.youtube.com/watch?v=abc#v=abcdefghijk",
    "https://www.youtube.com/watch?a=1&amp;v=abcdefghijk",
    "https://www.reddit.com/r/SpeculativeEvolution/comments/1plyh2f/day_13_of_drawing/",
    "https://reddit.com/r/x/comments/a/b_c_d",
    "https://www.reddit.com/r/x/comments/a/",
    "  https://x.com/a/status/1  ",
    "\u00a0https://x.com/a/status/1\u0085",
    "HTTPS://X.COM/a/status/1",
    "https://exemplo.com/",
    "",
]

ESPECS_DE_EMBED = [
    "post-x", "post-x | post-insta", "https://x.com/a/status/1 | https://www.instagram.com/p/abc/ | https://youtu.be/abcdefghijk",
    "nao-existe", "nao-existe | post-x", "vazio", "sub/dentro", "../fora", "com espaço", "acentuação", "x.html",
    "post-generico | post-reddit", "https://x.com/a/status/1&amp;b=2&c=3", "https://www.tiktok.com/@a/video/1 | https://www.youtube.com/shorts/abcdefghijk",
    " | ", "|post-x|", "post-x\n|\npost-insta", "https://exemplo.com/ | post-x", "post-tiktok | post-youtube | post-reddit | post-insta | post-x",
    "https://www.reddit.com/r/x/comments/a/b_c | post-generico", "", "  post-x  ",
]

TEXTOS_DE_VERSALETE = [
    "Hᴀᴛᴇ Cʏᴄʟᴇ", "Sᴇɴʜᴏʀ", "o L<span class=\"sc\">ᴏʀᴅ</span>", "/ɦaʊ̯.ˈʔu.ᵐbʷa/", "/ʀɪ/", "a /ʃə/ b /ʀɪ/ c",
    "Hᴀᴛᴇ\tCʏᴄʟᴇ\nHᴀᴛᴇ\u00a0Cʏᴄʟᴇ\u0085Hᴀᴛᴇ\ufeffCʏᴄʟᴇ", "<p>Hᴀᴛᴇ</p> Cʏᴄʟᴇ <b>x</b>", "a > Hᴀᴛᴇ < b", ">Hᴀᴛᴇ<", "Hᴀᴛᴇ>",
    "<a title=\"Hᴀᴛᴇ\">Cʏᴄʟᴇ</a>", "/ʃ<b>/</b>", "", "ʏ", "ᴢᴢᴢ", "Zᴢ", "ÀᴀÁᴀ", "𝓶ᴀ", "ᴀ𝓶",
]


def casos_de_versalete(n):
    rnd = random.Random(1015)
    letras = ["ᴀ", "ʏ", "ᴢ", "ʀ", "ɪ", "H", "a", "É", "×", "ʃ", "ə", "ˈ", "ⁿ", "ǃ", "́", "/", "/", "/", " ", "\t", "\n",
              "\u00a0", "\u0085", "\ufeff", "<", ">", "<b>", "</b>", "&", "𝓶", "😀", ".", "'"]
    out = list(TEXTOS_DE_VERSALETE)
    while len(out) < n:
        out.append("".join(rnd.choice(letras) for _ in range(rnd.randint(1, 30))))
    return [{"texto": t, "versalete": build.smallcaps(t),
             "entre_tags": re.sub(r">([^<>]+)<", lambda m: ">" + build.smallcaps(m.group(1)) + "<", t)} for t in out]


def classes_do_python():
    """\\w, \\s e \\d das expressões regulares do Python (texto Unicode), como faixas [início, fim] de pontos de
    código, e os pontos de código que o Unicode do Python ainda não tem (categoria Cn). O teste confere que as
    classes do porte (src/lib/markdown.ts) são iguais em todo caractere que o Python conhece."""
    import unicodedata

    def faixas(pred):
        out, inicio = [], None
        for cp in range(0x110000):
            ok = not (0xD800 <= cp <= 0xDFFF) and pred(chr(cp))
            if ok and inicio is None:
                inicio = cp
            if not ok and inicio is not None:
                out.append([inicio, cp - 1]); inicio = None
        if inicio is not None:
            out.append([inicio, 0x10FFFF])
        return out
    w, s, d = re.compile(r"\w"), re.compile(r"\s"), re.compile(r"\d")
    return {"unicode": unicodedata.unidata_version,
            "w": faixas(lambda c: w.match(c) is not None), "s": faixas(lambda c: s.match(c) is not None),
            "d": faixas(lambda c: d.match(c) is not None), "sem_categoria": faixas(lambda c: unicodedata.category(c) == "Cn")}


def renderizar_casos(lista):
    return [{"nome": nome, "texto": texto, "lang": lang, "divisor": divisor, **nos_dois_modos(texto, lang, divisor, INDICES_INVENTADOS)}
            for nome, texto, lang, divisor in lista]


# ───────── principal ─────────

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--ver", help="só imprime o HTML do make_md() para ARQUIVO (content/…/xx.md) e sai")
    ap.add_argument("--previa", action="store_true", help="com --ver: usa o índice da prévia (com rascunhos)")
    ap.add_argument("--versalete", action="store_true", help="com --ver: mostra já com o versalete do shell()")
    a = ap.parse_args()

    indice_build, chamadas_build = build_de_verdade(False)
    indice_previa, chamadas_previa = build_de_verdade(True)
    indices = {"build": indice_build, "previa": indice_previa}

    corpos = corpos_de_content(indices)
    chamadas = {"build": identificar_chamadas(chamadas_build, corpos, "build"),
                "previa": identificar_chamadas(chamadas_previa, corpos, "previa")}

    if a.ver:
        p = Path(a.ver).resolve()
        if not p.is_file() or CONTENT not in p.parents or p.suffix != ".md":
            raise SystemExit(f"✘ {a.ver}: tem de ser um arquivo .md dentro de content/ (ex.: content/news/2023-08-18-orcs/pt.md)")
        modo = "previa" if a.previa else "build"
        # a página Sobre é renderizada com o texto do Projeto na frente (como o build() faz e o Astro guarda)
        comp = next((c for c in chamadas[modo] if c["composicao"] and c["partes"][-1] == rel(p)), None)
        if comp:
            print(f"(página montada pelo build(): {' + '.join(comp['partes'])})", file=sys.stderr)
            r = comp
        else:
            fm, body = build.parse(p)
            lang, divisor = contexto_do_arquivo(p)
            r = render(body, lang, divisor, indices[modo])
        print(r["versalete" if a.versalete else "html"])
        return
    with conteudo_inventado():
        casos = renderizar_casos(CASOS)
        aleatorios = renderizar_casos(casos_aleatorios(600) + casos_em_blocos(400))
        embeds = [{"spec": s, "html": build.embed_html(s)} for s in ESPECS_DE_EMBED]
    urls = [{"url": u, "html": build.url_embed(u)} for u in URLS]
    versalete = casos_de_versalete(400)
    nomes = [c["nome"] for c in casos]
    assert len(nomes) == len(set(nomes)), "nomes de casos repetidos"

    dados = {
        "_leia": "Gerado por tools/markdown_ref.py a partir do build.py (make_md, smallcaps, url_embed, embed_html, build). "
                 "Não edite à mão: rode `python3 tools/markdown_ref.py` de novo. Usado por tests/markdown.test.ts. "
                 "Em cada caso, 'previa' é null quando dá igual ao 'build'. Em 'chamadas', 'partes' são os arquivos cujo corpo "
                 "foi o texto da chamada (o HTML é o de 'corpos'); nas composições (página Sobre), o HTML vem junto.",
        "python": sys.version.split()[0],
        "classes": classes_do_python(),
        "atalhos": ATALHOS,
        "show_extras": build.CFG.get("show_extras", True),
        "indice": indices,
        "embeds_de_content": {p.name: sha1(p.read_text("utf-8-sig")) for p in sorted((CONTENT / "embeds").glob("*.html"))},
        "corpos": corpos,
        "chamadas": chamadas,
        "inventado": {"indice": INDICES_INVENTADOS, "arquivos": EMBEDS_INVENTADOS},
        "casos": casos,
        "aleatorios": aleatorios,
        "url_embed": urls,
        "embed_html": embeds,
        "versalete": versalete,
    }
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps(dados, ensure_ascii=False, indent=1) + "\n", "utf-8")
    compostas = sum(1 for m in chamadas.values() for c in m if c["composicao"])
    print(f"✔ {len(corpos)} corpos de content/, {len(chamadas['build'])}/{len(chamadas['previa'])} chamadas do build() "
          f"(build/prévia; {compostas} composições), {len(casos)} casos à mão, {len(aleatorios)} sorteados, "
          f"{len(urls)} links de embed, {len(embeds)} {{{{embed:…}}}}, {len(versalete)} de versalete → {SAIDA.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
