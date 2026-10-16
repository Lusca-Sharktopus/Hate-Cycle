#!/usr/bin/env python3
"""T11/T12 — Referência das PÁGINAS do site, tirada do gerador Python, para os testes de paridade do Astro.

Uso (na raiz do repositório):
  python3 tools/paginas_ref.py            # regrava tests/fixtures/paginas-<grupo>-python.json e componentes-python.json

O que grava (tudo saído do build.py de verdade, com BASE = "" como no Astro):
  1. tests/fixtures/paginas-t11-python.json — o HTML COMPLETO de cada página do grupo "t11" (home, Histórias, página de
     obra, em en e pt) do site de verdade, sem rascunhos. O tests/paginas.test.ts gera o site Astro (pnpm build) e compara,
     página a página, o <head>, o <main> (e o cabeçalho, o rodapé, as runas e a classe do <body>) com estes arquivos.
  2. tests/fixtures/componentes-python.json — o <main> final (depois do shell(): versalete e data-prev/data-next) das mesmas
     páginas e os três atalhos do SHORT ({{stories}}, {{other-stories}}, {{emissaries}}), para o conteúdo de verdade (com e
     sem rascunhos) e para os cenários inventados de tools/regras_ref.py (obra fora do universo, externa, sem capa, emissário
     com texto e sem foto, "Em breve"…). O tests/componentes.test.ts desenha os componentes do Astro com os mesmos dados e compara.

  3. tests/fixtures/paginas-t12-python.json (T12, leitor de capítulos) — além das páginas reais do grupo (como o item 1),
     "ambientes": os capítulos dos sites INVENTADOS (os cenários de tools/regras_ref.py e os do leitor, abaixo: quadrinhos
     com pages/pages_glob, vídeo, prosa com fonte e divisor, oneshot com e sem logo, obra externa e escondida, rascunho,
     unlisted, comments: false, comentários sem chaves ou com chaves "sujas"), cada um em build e em prévia. De cada página:
     os argumentos que o build() passou ao shell() (título, links de idioma, classe do <body>, descrição, imagem, noindex)
     e o <main> final. O tests/leitor.test.ts recria cada site numa pasta temporária e compara.

  4. tests/fixtures/paginas-t13-python.json (T13, notícias) — as 2 listas e as 166 notícias do site de verdade (HTML completo,
     como o item 1) e "ambientes": as notícias e as listas dos sites INVENTADOS (os cenários de tools/regras_ref.py e os de
     notícias, abaixo: design comum, com backdrop só no topo/só no pé/nos dois, colagem com e sem papel, figurinhas sem posição,
     posts alternados A | B, Short vertical, tags vazias ou com HTML, "Veja também" que não existe no idioma ou é rascunho,
     notícia só em um idioma, sem título/data/resumo, rascunho, comments: false, comentários sem chaves ou com chaves "sujas"),
     cada um em build e em prévia. O tests/noticias.test.ts recria cada site numa pasta temporária e compara.

A próxima tarefa de páginas (T14) acrescenta o seu grupo em GRUPOS (um padrão de endereços) e roda este script de novo.

Chaves do Supabase: as capturas usam as chaves de mentira de regras_ref.py; nas páginas reais gravadas, os valores de
mentira são trocados por marcadores (MARCADORES, abaixo) — o teste troca as chaves de verdade do dist/ pelos mesmos
marcadores antes de comparar, sem nunca gravá-las.

Atenção: a referência é uma FOTO do conteúdo e do config.json. Mudou algo em content/ ou no config.json? Rode este script
de novo (junto com regras_ref.py) antes de `pnpm test`.

Só biblioteca padrão. Não cria public/ nem __pycache__. As chaves do Supabase do autor não são lidas nem gravadas (o config
usado nas capturas leva chaves de mentira, como em regras_ref.py).
"""
import contextlib, hashlib, io, json, re, shutil, sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.dont_write_bytecode = True                      # não deixar __pycache__ no projeto
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))
import build  # noqa: E402
import regras_ref as rr  # noqa: E402  (cenários inventados e o "ambiente" que aponta o build.py para outro content/)

# Cada tarefa de páginas acrescenta o seu grupo: nome → padrão dos endereços (url do page()).
GRUPOS = {
    "t11": re.compile(r"^/(en|pt)/(works/([^/]+/)?)?$"),     # home, Histórias, página de obra (NÃO os capítulos, que têm 4 níveis)
    "t12": re.compile(r"^/(en|pt)/works/[^/]+/[^/]+/$"),     # capítulos (o leitor)
    "t13": re.compile(r"^/(en|pt)/news/([^/]+/)?$"),         # as duas listas de notícias e cada notícia
    # páginas avulsas (Sobre, Apoio…), Universo e Personagens (listas e itens, só com show_extras) e a 404
    "t14": re.compile(r"^(/(en|pt)/(?!works/|news/)[^/]+/([^/]+/)?|/404\.html)$"),
}
ESCOPO = re.compile("|".join(p.pattern for p in GRUPOS.values()))
FIXTURES = ROOT / "tests" / "fixtures"
SAIDA_COMPONENTES = FIXTURES / "componentes-python.json"
# as chaves de mentira de regras_ref.py, como aparecem no window.HC, → marcadores (o teste faz o mesmo com as de verdade)
MARCADORES = {f'"url": {json.dumps(rr.CHAVES_DE_MENTIRA["supabase_url"])}': '"url": "__SUPABASE_URL__"',
              f'"key": {json.dumps(rr.CHAVES_DE_MENTIRA["supabase_anon_key"])}': '"key": "__SUPABASE_ANON_KEY__"'}


@contextlib.contextmanager
def pasta_static(pasta):
    """Aponta o STATIC do build.py para outra pasta (os quadrinhos de mentira dos cenários do leitor), e volta."""
    salvo = build.STATIC
    if pasta is not None:
        build.STATIC = Path(pasta)
    try:
        yield
    finally:
        build.STATIC = salvo


# o que a T14 compara BYTE A BYTE (não pela estrutura): a raiz, as páginas do site antigo (`/PT.html`…) e os feeds RSS
EXATOS = re.compile(r"^(/|/(?!404\.html$)[^/]+\.html|/(en|pt)/feed\.xml)$")


def capturar(raiz, cfg_extra, rascunhos, static=None, escopo=None, exatos=None):
    """Roda o build() de verdade sobre a pasta content/ `raiz`. Devolve ({url: HTML completo}, {idioma: SHORT},
    {url: argumentos do shell()}) só das páginas do ESCOPO (ou de `escopo`, uma expressão regular). Nada é gravado em disco
    (write() só anota; static/ não é copiado). Se `exatos` for um dict, ele recebe {url: conteúdo} da raiz, das páginas do site
    antigo e dos feeds (EXATOS)."""
    paginas, shells = {}, {}
    escopo = escopo or ESCOPO

    def anota(url, conteudo):
        if escopo.match(url):
            paginas[url] = conteudo
        if exatos is not None and EXATOS.match(url):
            exatos[url] = conteudo

    with rr.ambiente(raiz, cfg_extra, rascunhos), pasta_static(static):
        shell_de_verdade = build.shell

        def anota_shell(lang, title, main, alt=None, cls="", desc="", image="", has=None, noindex=False, seed=""):
            # a 404 não passa semente (o shell() usa o título "404") nem tem endereço no page(): a chave dela é o próprio endereço
            chave = seed or ("/404.html" if title == "404" else title)
            shells[chave] = {"titulo": title, "alt": {k: v for k, v in (alt or {}).items() if k != "_self" and v},
                             "cls": cls, "desc": desc, "imagem": image, "noindex": noindex}
            return shell_de_verdade(lang, title, main, alt, cls, desc, image, has, noindex, seed)

        build.write, build.shell, build.clean_out, build.OUT = anota, anota_shell, (lambda: None), Path("/nao-usado")
        shutil.copytree = lambda *a, **k: None
        with contextlib.redirect_stdout(io.StringIO()):
            build.build()
        short = {l: dict(build.SHORT[l]) for l in build.LANGS}
    return paginas, short, {u: a for u, a in shells.items() if escopo.match(u)}


def com_marcadores(html):
    for de, para in MARCADORES.items():
        html = html.replace(de, para)
    return html


# ═════════════════════════════ T12: sites inventados para o leitor ═════════════════════════════

def cenario_leitor():
    """Capítulos que o conteúdo de hoje não tem: quadrinhos (pages + pages_glob, ordem natural, pastas, ocultos, **),
    vídeo com e sem setas, prosa com fonte/divisor/logo e efeitos (sonho, carta, Giuseppe), oneshot com e sem logo,
    obra externa, escondida, só-pt, rascunho, unlisted, comments: false, títulos com & e < >, texto só com espaços."""
    md, wj, a = rr.md, rr.wj, {}
    def cap(obra, pasta, en=None, pt=None, corpo_en="", corpo_pt=None):
        if en is not None: a[f"works/{obra}/{pasta}/en.md"] = md(en, corpo_en)
        if pt is not None: a[f"works/{obra}/{pasta}/pt.md"] = md(pt, corpo_en if corpo_pt is None else corpo_pt)
    # ── quadrinho em capítulos, com logo (a 1ª folha fica escura; a logo é invertida) ──
    a["works/hq/work.json"] = wj(kind="comic", title={"en": "Comic Hᴀᴛᴇ Cʏᴄʟᴇ", "pt": "HQ Hᴀᴛᴇ Cʏᴄʟᴇ"}, logo={"en": "logos/hq en.png", "pt": "logos/hq.png"},
                                  cover="covers/hq.png", order={"release": 1}, media="webcomic")
    cap("hq", "01", dict(date="2026-01-01", title="Start & <end>", pages_glob="comics/hq/01/*.png"), dict(date="2026-01-01", pages_glob="comics/hq/01/*"),
        corpo_en="Author note with **bold** and Hᴀᴛᴇ Cʏᴄʟᴇ.\n\n---\n\nSecond part /ˈwɪθ/.", corpo_pt="Nota do autor.")
    cap("hq", "02", dict(date="2026-01-08", pages=["comics/hq/02/04.png", "https://exemplo.com/p.png"], pages_glob="comics/hq/02/[0-9].png"),
        dict(date="2026-01-08", pages=["comics/hq/02/04.png"]), corpo_en="   \n  ")
    cap("hq", "03", dict(date="2026-01-15", draft=True, pages_glob="comics/hq/**/*.png", comments=False), dict(date="2026-01-15", draft=True, pages_glob="comics/hq/0?/1*.png"))
    cap("hq", "04", dict(unlisted=True, title="Bonus", pages_glob="comics/hq/0[!1]/*"), dict(unlisted=True, title="Bônus", pages_glob="comics/hq/01/"))
    cap("hq", "05", dict(chapter="Extra", date="2026-02-01", pages_glob="comics/nao-existe/*.png"), dict(chapter="Extra", date="2026-02-01", pages_glob="comics/hq/01/?.png"), corpo_en="Last words.")
    # ── quadrinho de capítulo único, sem logo ──
    a["works/hq-unica/work.json"] = wj(kind="comic", oneshot=True, title="HQ Única", order={"release": 2})
    cap("hq-unica", "01", dict(date="2026-03-01", pages_glob="comics/u/**"), dict(date="2026-03-01", pages_glob="comics/u/*/*.png"), corpo_en="Nota.")
    # ── prosa com fonte de leitura, divisor e logo; efeitos do texto ──
    a["works/prosa/work.json"] = wj(kind="prose", reading_font="times", divider="other images/div.png", title={"en": "Prose Hᴀᴛᴇ Cʏᴄʟᴇ", "pt": "Prosa"},
                                     logo={"en": "logos/prosa.png"}, cover={"en": "covers/prosa en.png", "pt": "covers/prosa.png"}, order={"release": 3})
    efeitos = ("First paragraph, Hᴀᴛᴇ Cʏᴄʟᴇ.\nSecond line of the *same* paragraph.\n\n---\n\n"
               '<div class="s1 indent">Awake.</div>\n\n<div class="s1 mid gap">He closes his eyes<span class="ps"> and dreams…</span></div>\n\n'
               '<div class="s1 ps">The dream, Hᴀᴛᴇ Cʏᴄʟᴇ /ˈwɪθ/.</div>\n\n<img class="jusep" src="@/other images/Giuseppe.png" alt="Giuseppe">\n\n'
               '<div class="s1">Giuseppe opened his eyes.</div>\n\n'
               '<div class="flip-card"><div class="flip-card-inner"><div class="flip-card-front"><img src="/other images/letter-front.png" alt="letter"></div>'
               '<div class="flip-card-back"><img src="/other images/letter-back.png" alt="letter"></div></div></div>\n\n'
               '<div class="strip"><img src="@/other images/x.png" alt="x"><div class="strip-row"><img src="@/other images/y.png" alt="y"><p>Text</p></div></div>\n\n'
               "Fade: <span style=\"opacity:1.0\">a</span><span style=\"opacity:0.5\">b</span>\n\n![A figure](other images/fig.png)\n\nSee [[works/hq]] and [[works/nao-existe|nothing]].")
    cap("prosa", "01", dict(date="2026-04-01", title="One"), dict(date="2026-04-01", title="Um"), corpo_en=efeitos, corpo_pt="Texto em português.\n\n***\n\nFim.")
    cap("prosa", "02", dict(date="2026-04-02", chapter="2A", summary='"Quotes" & <tags>'), dict(date="2026-04-02", chapter="2A"), corpo_en="Two.")
    cap("prosa", "03", None, dict(date="2026-04-03", title="Só em português"), corpo_en="Três.")
    cap("prosa", "04", dict(date="2026-04-04", comments=False), dict(date="2026-04-04", comments=False), corpo_en="Sem comentários.")
    cap("prosa", "05", dict(date="2026-04-05", youtube="J2j6xoIz0LE"), dict(date="2026-04-05", youtube="J2j6xoIz0LE"), corpo_en="Prose work, video chapter.")
    # ── prosa de capítulo único, sem fonte, sem divisor, sem logo; posts incorporados com alternância ──
    a["works/conto/work.json"] = wj(kind="prose", oneshot=True, title={"en": "Short", "pt": "Conto"}, order={"release": 4})
    cap("conto", "01", dict(date="2026-05-01", summary="Resumo"), dict(date="2026-05-01"),
        corpo_en="Text.\n\n---\n\n{{embed:https://x.com/a/status/1 | https://www.instagram.com/p/abc/}}\n\nEnd.")
    # ── vídeo em episódios ──
    a["works/serie/work.json"] = wj(kind="video", title={"en": "Series", "pt": "Série"}, logo="logos/serie.png", cover="covers/serie.png", order={"release": 5})
    cap("serie", "01", dict(date="2026-06-01", youtube="AAAAAAAAAAA"), dict(date="2026-06-01", youtube="AAAAAAAAAAA"), corpo_en="Episode note with a [link](https://exemplo.com).")
    cap("serie", "02", dict(date="2026-06-08", youtube="BBBBBBBBBBB", title="The <second>"), dict(date="2026-06-08", youtube="BBBBBBBBBBB"))
    cap("serie", "03", dict(date="2026-06-15"), dict(date="2026-06-15"))
    cap("serie", "04", dict(date="2026-06-22", youtube="DDDDDDDDDDD", unlisted=True), dict(date="2026-06-22", youtube="DDDDDDDDDDD", unlisted=True))
    cap("serie", "05", dict(date="2026-06-29", youtube="EEEEEEEEEEE", draft=True), dict(date="2026-06-29", youtube="EEEEEEEEEEE", draft=True))
    # ── filme (kind "film", tratado como prosa, mas com youtube → vídeo) de capítulo único com logo: <h1> só para leitor de tela ──
    a["works/filme/work.json"] = wj(kind="film", oneshot=True, title="Filme", logo={"en": "logos/filme.png", "pt": "logos/filme.png"}, order={"release": 6})
    cap("filme", "01", dict(youtube="FFFFFFFFFFF", date="2026-07-01"), dict(youtube="FFFFFFFFFFF", date="2026-07-01"), corpo_en="Credits.")
    # ── obra com link para fora (o capítulo existe; o "voltar" aponta para a página da obra, que não existe) ──
    a["works/externa/work.json"] = wj(kind="prose", title="Externa", external="https://exemplo.com/x", logo="logos/externa.png", order={"release": 7})
    cap("externa", "01", dict(date="2026-08-01"), dict(date="2026-08-01"), corpo_en="Externa.")
    # ── obra escondida (listed: false) e obra só em português (langs) ──
    a["works/escondida/work.json"] = wj(kind="prose", listed=False, title="Escondida", order={"release": 8})
    cap("escondida", "01", dict(date="2026-09-01"), dict(date="2026-09-01"), corpo_en="Um.")
    cap("escondida", "02", dict(date="2026-09-02"), dict(date="2026-09-02"), corpo_en="Dois.")
    a["works/so-pt/work.json"] = wj(kind="prose", langs=["pt"], title="Só PT", order={"release": 9})
    cap("so-pt", "01", dict(date="2026-10-01"), dict(date="2026-10-01"), corpo_en="Texto.")
    # ── revisão da T12: "<" e ">" junto com versalete em textos que vão para ATRIBUTOS (alt da HQ, alt da logo, title e
    #    aria-label das setas do vídeo, title do iframe); o Python escapa os atributos, então o versalete nunca entra neles ──
    a["works/setas/work.json"] = wj(kind="comic", title="Setas -> Hᴀᴛᴇ <- B", logo="logos/setas.png", order={"release": 10})
    cap("setas", "01", dict(date="2026-11-01", title="A -> Hᴀᴛᴇ <- B", pages_glob="comics/hq/02/*.png"), dict(date="2026-11-01", title="A -> Hᴀᴛᴇ <- B", pages_glob="comics/hq/02/*.png"),
        corpo_en="Nota -> Hᴀᴛᴇ <- fim.")
    # ordem natural com algarismos NÃO ASCII (p１) e números maiores que o JavaScript guarda num Number (mais de 15 algarismos)
    cap("setas", "02", dict(date="2026-11-08", pages_glob="comics/hq/06/*.png"), dict(date="2026-11-08", pages_glob="comics/hq/06/*.png"))
    a["works/setas-video/work.json"] = wj(kind="video", title={"en": "Video -> Hᴀᴛᴇ <- B", "pt": "Vídeo > Hᴀᴛᴇ"}, logo="logos/setas.png", order={"release": 11})
    cap("setas-video", "01", dict(date="2026-12-01", youtube="GGGGGGGGGGG", title="A -> Hᴀᴛᴇ <- B"), dict(date="2026-12-01", youtube="GGGGGGGGGGG", title="A -> Hᴀᴛᴇ <- B"))
    cap("setas-video", "02", dict(date="2026-12-08", youtube="HHHHHHHHHHH", title='Aspas "Hᴀᴛᴇ" & <b>'), dict(date="2026-12-08", youtube="HHHHHHHHHHH", title='Aspas "Hᴀᴛᴇ" & <b>'),
        corpo_en='<div title="raw -> Hᴀᴛᴇ <- html">Raw attr</div>')
    # um <script type="module"> escrito pelo AUTOR no texto: o Python o deixa no lugar (e aplica o versalete dentro dele também)
    cap("setas-video", "03", dict(date="2026-12-15", youtube="IIIIIIIIIII"), dict(date="2026-12-15", youtube="IIIIIIIIIII"),
        corpo_en="Antes.\n\n<script type=\"module\">console.log('Hᴀᴛᴇ > 1 < 2', \"a > Hᴀᴛᴇ <\")</script>\n\nDepois.")
    return a


# ═════════════════════════════ T13: sites inventados para as notícias ═════════════════════════════

def cenario_noticias():
    """Notícias que o conteúdo de hoje não tem: design comum sem nada (sem título, data, resumo, imagem, etiquetas) e completo;
    backdrop só no topo, só no pé e nos dois; colagem com e sem papel, com figurinhas sem posição, com decimais e negativos,
    e com backdrop junto (a colagem vence); posts alternados (A | B e A | B | C), post de arquivo e Short vertical; etiquetas
    vazias, com HTML e com versalete; "Veja também" que não existe naquele idioma ou é rascunho; só em um idioma; rascunho
    (comum e colagem); comments: false; título/resumo com & < > e aspas; mesma data; mais de 10 (a lista tem 2 páginas)."""
    md, wj, a = rr.md, rr.wj, {}
    def n(pasta, en=None, pt=None, corpo_en="", corpo_pt=None):
        if en is not None: a[f"news/{pasta}/en.md"] = md(en, corpo_en)
        if pt is not None: a[f"news/{pasta}/pt.md"] = md(pt, corpo_en if corpo_pt is None else corpo_pt)
    a["works/obra/work.json"] = wj(kind="prose", oneshot=True, title={"en": "Work", "pt": "Obra"}, cover="covers/obra.png", order={"release": 1})
    for l in ("en", "pt"):
        a[f"works/obra/01/{l}.md"] = md(dict(date="2026-01-01"), "Cap.")
        a[f"universe/magia/{l}.md"] = md(dict(title="Magia" if l == "pt" else "Magic", category="Magia"), "Texto.")
    a["embeds/post-x.html"] = ('<blockquote class="twitter-tweet"><a href="https://x.com/a/status/9"></a></blockquote>\n'
                               '<script async src="https://platform.x.com/widgets.js" charset="utf-8"></script>\n')
    # ── completa, design comum ──
    n("2026-02-01-completa", dict(title="Complete Hᴀᴛᴇ Cʏᴄʟᴇ news", date="2026-02-01", summary='Summary with & ampersand, <tags> and "quotes" for Hᴀᴛᴇ Cʏᴄʟᴇ', thumb="news/thumb.png", image="news/lead image.png",
                                   tags=["New Work", "Hᴀᴛᴇ Cʏᴄʟᴇ", '<b> & "q" end'], related=["works/obra", "universe/magia", "news/2026-02-03-so-en", "news/2026-02-04-so-pt", "news/2026-02-20-rascunho", "news/2026-02-02-minima"]),
      dict(title="Notícia completa de Hᴀᴛᴇ Cʏᴄʟᴇ", date="2026-02-01", summary='Resumo com & e <tags> e "aspas"', thumb="news/thumb.png", image="news/lead image.png",
           tags=["Nova Obra", "Hᴀᴛᴇ Cʏᴄʟᴇ"], related=["works/obra", "universe/magia", "news/2026-02-03-so-en", "news/2026-02-04-so-pt", "news/2026-02-20-rascunho", "news/2026-02-02-minima"]),
      corpo_en="First paragraph with **bold**, _italic_ and a /ˈwɪθ/ transcription.\n\nSee [[works/obra]] and [[universe/magia|the magic]] and [a link](https://exemplo.com).\n\n![A figure](news/fig.png)\n\n> A quote.\n\n---\n\nAfter the divider, Hᴀᴛᴇ Cʏᴄʟᴇ.",
      corpo_pt="Primeiro parágrafo com **negrito**, _itálico_ e a transcrição /ˈwɪθ/.\n\nVeja [[works/obra]] e [[universe/magia|a magia]] e [um link](https://exemplo.com).\n\n![Uma figura](news/fig.png)\n\n> Uma citação.\n\n---\n\nDepois do divisor, Hᴀᴛᴇ Cʏᴄʟᴇ.")
    # ── mínima: sem título, data, resumo, etiquetas, imagem ──
    n("2026-02-02-minima", dict(), dict(), corpo_en="x")
    n("2026-02-02-minima-vazia", dict(title="Empty body", date="2026-02-02", tags=[]), dict(title="Corpo vazio", date="2026-02-02", tags=[]), corpo_en="")
    # ── só em um idioma ──
    n("2026-02-03-so-en", dict(title="Only English", date="2026-02-03", image="news/so-en.png"), None, corpo_en="English only.")
    n("2026-02-04-so-pt", None, dict(title="Só português", date="2026-02-04", summary="Resumo só PT"), corpo_en="Só em português.")
    # ── sem comentários ──
    n("2026-02-05-sem-comentarios", dict(title="No comments", date="2026-02-05", comments=False), dict(title="Sem comentários", date="2026-02-05", comments=False), corpo_en="Comments off.")
    # ── colagem ──
    n("2026-02-06-colagem", dict(title="Collage", date="2026-02-06", image="news/ignorada.png", backdrop_top="news/ignorado.jpg", overlay="news/papel 1.jpg",
                                  stickers=["news/stickers/a.png | l3 t2 w26 a-4", "news/stickers/b b.png | r4 t1 w17 a8", "news/stickers/c.png | l3 b3 w21 a-5.5", "news/stickers/d.png | l38 b2 w15.5 a4"], tags=["Collage"]),
      dict(title="Colagem", date="2026-02-06", overlay="news/papel 1.jpg", stickers=["news/stickers/a.png | l3 t2 w26 a-4"]),
      corpo_en="Collage text.\n\n{{embed:https://www.youtube.com/shorts/ABCDEFGHIJK}}", corpo_pt="Texto da colagem.")
    n("2026-02-07-colagem-sem-papel", dict(title="Collage without paper", date="2026-02-07", stickers=["news/stickers/solta.png", "news/stickers/com espaco.png|l1 a0", "  news/stickers/espacos.png  |   t5    w10   "]),
      dict(title="Colagem sem papel", date="2026-02-07", stickers=["news/stickers/solta.png"], overlay=""), corpo_en="No paper.")
    # ── backdrop ──
    n("2026-02-08-fundo-topo", dict(title="Top only", date="2026-02-08", backdrop_top="news/topo.jpg", tags=["Fundo"]), dict(title="Só topo", date="2026-02-08", backdrop_top="news/topo.jpg"), corpo_en="Top backdrop.")
    n("2026-02-09-fundo-pe", dict(title="Bottom only", date="2026-02-09", backdrop_bottom="news/pe.jpg", image="news/ignorada.png"), dict(title="Só pé", date="2026-02-09", backdrop_bottom="news/pe.jpg"), corpo_en="Bottom backdrop.")
    n("2026-02-10-fundo-ambos", dict(title="Both", date="2026-02-10", backdrop_top="news/o topo.jpg", backdrop_bottom="news/o topo.jpg", tags=["A", "B"]), dict(title="Ambos", date="2026-02-10", backdrop_top="news/o topo.jpg", backdrop_bottom="news/pe.jpg"), corpo_en="Both backdrops.")
    # ── posts incorporados ──
    n("2026-02-11-embeds", dict(title="Embeds", date="2026-02-11"), dict(title="Incorporados", date="2026-02-11"),
      corpo_en=("One: {{embed:https://x.com/a/status/1}}\n\n{{embed:https://x.com/a/status/1 | https://www.instagram.com/p/abc/}}\n\n"
                "{{embed:post-x | https://www.tiktok.com/@u/video/123 | https://www.youtube.com/watch?v=ABCDEFGHIJK}}\n\n{{embed:post-x}}\n\n"
                "{{embed:https://www.youtube.com/shorts/ABCDEFGHIJK}}\n\n{{embed:https://www.reddit.com/r/a/comments/b/c_d}}\n\n{{embed:nao-existe}}\n\n"
                '<div class="flip-card"><div class="flip-card-inner">x</div></div>'))
    n("2026-02-12-aspas-e-simbolos", dict(title="Q&A <live> & “x” a>b", date="2026-02-12", summary="Resumo <b>x</b> & y > z", tags=["a&b", "c<d"]),
      dict(title="Q&A <live> & “x” a>b", date="2026-02-12", summary="Resumo <b>x</b> & y > z", tags=["a&b", "c<d"]), corpo_en="1 < 2 and 3 > 2 & more.")
    n("2026-02-12-mesma-data", dict(title="Same date", date="2026-02-12"), dict(title="Mesma data", date="2026-02-12"), corpo_en="Same date.")
    # ── rascunhos ──
    n("2026-02-20-rascunho", dict(title="Draft", date="2026-02-20", draft=True, related=["works/obra"]), dict(title="Rascunho", date="2026-02-20", draft=True), corpo_en="Draft.")
    n("2026-02-21-rascunho-colagem", dict(title="Draft collage", date="2026-02-21", draft=True, stickers=["news/stickers/a.png | l1 t1"]), dict(title="Colagem rascunho", date="2026-02-21", draft=True, stickers=["news/stickers/a.png | l1 t1"]), corpo_en="Draft collage.")
    # ── enchimento: passa de 10 (a lista tem 2 páginas) ──
    for k in range(1, 12):
        n(f"2025-12-{k:02d}-enchimento", dict(title=f"Filler {k}", date=f"2025-12-{k:02d}"), dict(title=f"Enchimento {k}", date=f"2025-12-{k:02d}"), corpo_en=f"Filler text number {k}.")
    return a


def cenario_noticias_so_pt():
    """Idioma sem notícias: no build o inglês só tem um rascunho (sem lista nem link "News" no menu); na prévia, tem 1."""
    md, a = rr.md, {}
    a["news/2026-03-01-so-pt/pt.md"] = md(dict(title="Só português", date="2026-03-01"), "Texto.")
    a["news/2026-03-02-rascunho-en/en.md"] = md(dict(title="Only a draft", date="2026-03-02", draft=True), "Draft.")
    a["news/2026-03-02-rascunho-en/pt.md"] = md(dict(title="Só um rascunho", date="2026-03-02", draft=True), "Rascunho.")
    return a


# os arquivos de static/ que os quadrinhos inventados usam (vazios: só o nome importa) — sem empates de nome entre pastas,
# porque nesse caso a ordem do Python depende do sistema de arquivos (ver src/lib/quadrinhos.ts)
ESTATICOS_DO_LEITOR = ["comics/hq/01/1.png", "comics/hq/01/2.png", "comics/hq/01/10.png", "comics/hq/01/.oculta.png", "comics/hq/01/A.PNG",
                       "comics/hq/01/b 3.png", "comics/hq/01/extra/9.png", "comics/hq/02/04.png", "comics/hq/02/5.png", "comics/hq/02/12.png",
                       "comics/u/x/7.png", "comics/u/y/8.png",
                       "comics/hq/06/p\uff11.png", "comics/hq/06/p2.png", "comics/hq/06/p10.png", "comics/hq/06/p\u0663.png",
                       "comics/hq/06/n12345678901234567891.png", "comics/hq/06/n12345678901234567890.png",
                       "comics/hq/06/n9007199254740993.png", "comics/hq/06/n9007199254740992.png"]


def ui_dos_comentarios(cfg_ui, mexer):
    """Uma cópia do config.json → ui com só os textos c_* mexidos (os outros textos são os do site, que o Astro lê do config.json)."""
    import copy
    ui = copy.deepcopy(cfg_ui)
    mexer(ui)
    return ui


def mexer_textos(ui):
    ui["pt"]["c_title"] = ""                                  # vazio → o build.py usa o do inglês (T())
    ui["pt"].pop("c_login", None)                             # falta no pt → fica o do inglês
    ui["pt"]["c_so_pt"] = "Só em português"                   # chave só no pt → entra depois das do inglês
    ui["en"].pop("c_google", None)                            # falta no inglês → o padrão (COMMENT_UI_DEFAULTS) entra no fim
    ui["en"]["c_none"] = 'Nothing yet </script> "quoted" \\ \t tab'   # "</" vira "<\/" (não fecha o <script>)


def mexer_aviso(ui):
    ui["pt"]["c_not_configured"] = ""                         # vazio → o aviso sai em inglês


def ambientes_do_leitor():
    """(nome, arquivos, config extra, estáticos) dos sites inventados do leitor."""
    ui = build.CFG["ui"]
    arquivos = cenario_leitor()
    return [
        ("leitor", arquivos, {"comments": {"supabase_url": "  https://exemplo.supabase.co/rest/v1/  ", "supabase_anon_key": "  chave-de-mentira \n"},
                              "ui": ui_dos_comentarios(ui, mexer_textos)}),
        ("leitor-sem-chaves", arquivos, {"comments": {}}),
        ("leitor-so-url", arquivos, {"comments": {"supabase_url": "https://exemplo.supabase.co", "supabase_anon_key": ""}, "ui": ui_dos_comentarios(ui, mexer_aviso)}),
    ]


def main_final(html):
    """O miolo do <main> como o shell() o escreveu (já com versalete e data-prev/data-next)."""
    m = re.search(r'<main id="main"[^>]*>\n(.*)\n</main>', html, re.S)
    assert m, html[:300]
    return m.group(1)


def sha(arquivos):
    return hashlib.sha1(json.dumps(arquivos, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def capitulos_do_ambiente(paginas, shells):
    """Do que o build() escreveu: os capítulos (grupo t12), com os argumentos do shell() e o <main> final."""
    t12 = GRUPOS["t12"]
    return {u: {"shell": shells[u], "main": main_final(h)} for u, h in sorted(paginas.items()) if t12.match(u)}


def noticias_do_ambiente(paginas, shells):
    """Do que o build() escreveu: as listas e as notícias (grupo t13), com os argumentos do shell() e o <main> final."""
    t13 = GRUPOS["t13"]
    return {u: {"shell": shells[u], "main": main_final(h)} for u, h in sorted(paginas.items()) if t13.match(u)}


def ambientes_de_noticias():
    """(nome, arquivos, config extra) dos sites inventados das notícias: o mesmo conteúdo com os três arranjos de comentários
    do leitor (chaves "sujas" e textos mexidos, sem chaves, só a URL) e um site em que um idioma só tem rascunho."""
    com_chaves, sem_chaves, so_url = (cfg for _n, _a, cfg in ambientes_do_leitor())
    a, b = cenario_noticias(), cenario_noticias_so_pt()
    return [("noticias", a, com_chaves), ("noticias-sem-chaves", a, sem_chaves), ("noticias-so-url", a, so_url), ("noticias-so-pt", b, com_chaves)]


def config_do_ambiente(cfg):
    """O que o teste precisa saber do config de um ambiente (o build.py junta o config.json com o cfg_extra, como em rr.ambiente)."""
    efetivo = dict(build.CFG, comments=dict(rr.CHAVES_DE_MENTIRA))
    efetivo.update(cfg)
    return {"show_extras": efetivo.get("show_extras", True), "comments": efetivo.get("comments", {}),
            "ui_c": {l: {k: v for k, v in efetivo["ui"].get(l, {}).items() if k.startswith("c_")} for l in efetivo["ui"]}}


# ═════════════════════════════ T14: páginas avulsas, extras, 404, raiz, redirects e feeds ═════════════════════════════

def cenario_paginas():
    """O cenário 'variado' de tools/regras_ref.py (todas as obras, notícias, emissários, Universo, Personagens e páginas) mais o que
    as páginas da T14 desenham e o 'variado' não tem: Sobre larga com o texto do Projeto na frente, {{emissaries}} / {{stories}} /
    {{other-stories}} dentro de páginas, carta que vira e posts alternados num texto de página, página sem título e sem resumo,
    página só em um idioma, Apoio em rascunho; verbete com figura (nome com espaço), 'Veja também' (existente, inexistente,
    rascunho, de outra seção) e rascunho; ficha com retrato, papel com & e <, 'Aparece em' com obra externa / de capítulo único /
    com página / sem capítulo / escondida / só em um idioma, e personagem só em um idioma."""
    a = dict(rr.cenario_variado())
    item = rr.item
    cartas = '<div class="flip-card"><div class="flip-card-inner"><div class="flip-card-front">x</div></div></div>'
    a.update(item("pages", "about",
                  dict(title="About the author", layout="wide", summary='About & "us" <b>x</b>'), dict(title="Sobre o autor", layout="wide", summary='Sobre & "nós" <b>x</b>'),
                  corpo_en=('## About the author\n\n<img class="autor-foto" src="/other images/foto.png" alt="Me">\n\nHello **world**, see [[works/a-oneshot]], [[universe/magia]] and [[characters/harry]]; '
                            "Hᴀᴛᴇ Cʏᴄʟᴇ /ˈwɪθ/.\n\n{{emissaries}}\n\n## Contact\n\nWrite to [me](mailto:a@b.c).\n\n" + cartas),
                  corpo_pt=('## Sobre o autor\n\n<img class="autor-foto" src="/other images/foto.png" alt="Eu">\n\nOlá **mundo**, veja [[works/a-oneshot]], [[universe/magia]] e [[characters/harry]]; '
                            "Hᴀᴛᴇ Cʏᴄʟᴇ.\n\n{{emissaries}}\n\n## Contato\n\nEscreva [para mim](mailto:a@b.c).")))
    a.update(item("pages", "project",
                  dict(title="The project", route=False, layout="wide", summary="Project summary"), dict(title="O projeto", route=False, layout="wide", summary="Resumo do projeto"),
                  corpo_en='## About the project\n\n<img class="apollo-gif" src="/other images/Apollo Site.gif" alt="">\n\n<img class="anfibio-gif" src="/other images/Anfibio Site.gif" alt="">\n\nThe project text.\n\n{{other-stories}}',
                  corpo_pt='## Sobre o projeto\n\n<img class="apollo-gif" src="/other images/Apollo Site.gif" alt="">\n\nO texto do projeto.\n\n{{other-stories}}'))
    a.update(item("pages", "support", dict(title="Support", draft=True, summary="Help us"), dict(title="Apoio", draft=True), corpo_en="Draft support page.", corpo_pt="Página de apoio em rascunho."))
    a.update(item("pages", "atalhos", dict(title="Shortcuts", layout="wide"), dict(title="Atalhos", layout="wide"),
                  corpo_en="Before.\n\n{{stories}}\n\n{{other-stories}}\n\n{{emissaries}}\n\n{{nada}}\n\nAfter.", corpo_pt="Antes.\n\n{{stories}}\n\n{{emissaries}}\n\nDepois."))
    a.update(item("pages", "regras", dict(), dict(),   # sem título e sem resumo: vale o nome da pasta e a frase padrão do site
                  corpo_en="Plain page.\n\n{{embed:https://x.com/a/status/1 | https://www.instagram.com/p/abc/}}", corpo_pt="Página simples."))
    a.update(item("pages", "so-en", dict(title="Only English page", summary="Only EN"), None, corpo_en="English only."))
    a.update(item("pages", "so-pt", None, dict(title="Só português", menu="extras"), corpo_pt="Só em português."))
    # ── Universo ──
    a.update(item("universe", "magia", dict(title="Magic", category="Magia", order=2, summary='S & "q" <b>', image="universe/arte com espaço.png", related=["works/a-oneshot", "characters/harry", "universe/runas", "universe/rascunho", "pages/about", "news/2025-12-30-alfa", "universe/so-pt"]),
                  dict(title="Magia", category="Magia", order=2, summary="S", image="universe/arte com espaço.png", related=["universe/runas"]), corpo_en="Magic text, Hᴀᴛᴇ Cʏᴄʟᴇ.", corpo_pt="Texto da magia."))
    a.update(item("universe", "rascunho", dict(title="Draft entry", category="Magia", draft=True), dict(title="Verbete rascunho", category="Magia", draft=True), corpo_en="Draft.", corpo_pt="Rascunho."))
    a.update(item("universe", "so-pt", None, dict(title="Só em português", category="Bestas", summary="Resumo"), corpo_pt="Só PT."))
    # ── Personagens ──
    a.update(item("characters", "harry", dict(title="Harry", role="Assistant & <friend>", order=2, summary="Sum", image="characters/harry retrato.png",
                                                 appears_in=["b-serial", "a-oneshot", "k-escondida", "i-externa", "m-sem-ordem", "c-video", "t-sem-nada", "l-so-pt", "j-externa-com-cap"],
                                                 related=["works/a-oneshot", "universe/magia", "characters/olivia", "characters/rascunho"]),
                  dict(title="Harry", role="Assistente", order=2, appears_in=["b-serial", "a-oneshot", "i-externa"], related=["universe/magia"]), corpo_en="Harry text.\n\n" + cartas, corpo_pt="Texto do Harry."))
    a.update(item("characters", "rascunho", dict(title="Draft", role="X", draft=True, appears_in=["a-oneshot"]), dict(title="Rascunho", role="X", draft=True), corpo_en="Draft.", corpo_pt="Rascunho."))
    a.update(item("characters", "so-en", dict(title="Only English", role="R", image="characters/so en.png"), None, corpo_en="English only."))
    return a


REDIRECTS_INVENTADOS = {"a.html": "/en/x/", "index.html": "/", "b.html": "/", "c.html": "/pt/?q=1&r=2", "PT.html": "/pt/"}


def ambientes_t14():
    """(nome, arquivos ou None = o content/ de verdade, config extra) dos ambientes da T14. Cada um roda em build e em prévia."""
    return [
        ("real", None, {}),
        ("real-extras", None, {"show_extras": True}),
        ("paginas", cenario_paginas(), {"show_extras": True}),
        ("paginas-sem-extras", cenario_paginas(), {"show_extras": False}),
        ("redirects", rr.cenario_enxuto(), {"show_extras": False, "redirects": REDIRECTS_INVENTADOS}),
    ] + [(nome, criar(), cfg) for nome, criar, cfg in rr.CENARIOS]


def pagina_do_ambiente(paginas, shells):
    """Do que o build() escreveu: as páginas do grupo t14, com os argumentos do shell() e o <main> final."""
    t14 = GRUPOS["t14"]
    return {u: {"shell": shells[u], "main": main_final(h)} for u, h in sorted(paginas.items()) if t14.match(u)}


def partes_da_pagina(html):
    """O cabeçalho e o <main> de uma página, como o build.py os escreveu (para comparar o site INTEIRO sem guardar tudo)."""
    cab = re.search(r'<header class="site-header">.*?</header>', html, re.S)
    assert cab, html[:200]
    return {"header": cab.group(0), "main": main_final(html)}


def construcao_do_site_inteiro():
    """O site de verdade inteiro, COM rascunhos e COM show_extras ligado (o que `NODE_ENV=development HC_SHOW_EXTRAS=1 pnpm build`
    constrói): o menu "Extras" e o link Apoio em TODAS as páginas, o botão "Explorar o universo" da home, os [[links]] que passam a
    existir… Páginas do grupo t14: HTML completo. Das outras: só o cabeçalho e o <main>."""
    t14 = GRUPOS["t14"]
    todas, _short, _shells = capturar(build.CONTENT, {"show_extras": True}, True, escopo=re.compile(r"^/(en|pt)/([^.]*/)?$"))
    return {
        "paginas": {u: com_marcadores(h) for u, h in sorted(todas.items()) if t14.match(u)},
        "partes": {u: {k: com_marcadores(v) for k, v in partes_da_pagina(h).items()} for u, h in sorted(todas.items()) if not t14.match(u) and u.endswith("/")},
    }



def main():
    import tempfile
    ambientes, leitor, noticias = [], [], []
    paginas_reais = None
    t11 = GRUPOS["t11"]
    for nome, raiz, cfg, arquivos in [("real", build.CONTENT, {}, None)] + [
            (n, None, c, f()) for n, f, c in rr.CENARIOS]:
        for rascunhos in (False, True):
            if arquivos is None:
                paginas, short, shells = capturar(raiz, cfg, rascunhos)
                if not rascunhos:
                    paginas_reais = paginas
            else:
                with tempfile.TemporaryDirectory(prefix="hc-paginas-") as tmp:
                    rr.gravar(tmp, arquivos)
                    paginas, short, shells = capturar(tmp, cfg, rascunhos)
            ambientes.append({"nome": nome, "rascunhos": rascunhos, "arquivos_sha1": sha(arquivos) if arquivos is not None else None,
                              "short": short, "mains": {u: main_final(h) for u, h in sorted(paginas.items()) if t11.match(u)}})
            leitor.append({"nome": nome, "rascunhos": rascunhos, "arquivos_sha1": sha(arquivos) if arquivos is not None else None,
                           "config": config_do_ambiente(cfg), "capitulos": capitulos_do_ambiente(paginas, shells)})
            if arquivos is not None:     # o site de verdade já tem as páginas inteiras no grupo t13 (e não tem rascunhos)
                noticias.append({"nome": nome, "rascunhos": rascunhos, "arquivos_sha1": sha(arquivos),
                                 "config": config_do_ambiente(cfg), "noticias": noticias_do_ambiente(paginas, shells)})
    # os sites inventados do leitor: content/ e static/ de mentira (static/ com uma cópia do comments.js de verdade, para o carimbo ?v=)
    for nome, arquivos, cfg in ambientes_do_leitor():
        for rascunhos in (False, True):
            with tempfile.TemporaryDirectory(prefix="hc-leitor-") as tmp, tempfile.TemporaryDirectory(prefix="hc-leitor-static-") as st:
                rr.gravar(tmp, arquivos)
                for rel in ESTATICOS_DO_LEITOR:
                    (Path(st) / rel).parent.mkdir(parents=True, exist_ok=True)
                    (Path(st) / rel).write_bytes(b"")
                shutil.copyfile(build.STATIC / "comments.js", Path(st) / "comments.js")
                paginas, _short, shells = capturar(tmp, cfg, rascunhos, static=st)
            leitor.append({"nome": nome, "rascunhos": rascunhos, "arquivos_sha1": sha(arquivos), "config": config_do_ambiente(cfg),
                           "capitulos": capitulos_do_ambiente(paginas, shells)})
    # os sites inventados das notícias (content/ de mentira; as notícias não leem static/, então não precisa de uma pasta static/)
    for nome, arquivos, cfg in ambientes_de_noticias():
        for rascunhos in (False, True):
            with tempfile.TemporaryDirectory(prefix="hc-noticias-") as tmp:
                rr.gravar(tmp, arquivos)
                paginas, _short, shells = capturar(tmp, cfg, rascunhos)
            noticias.append({"nome": nome, "rascunhos": rascunhos, "arquivos_sha1": sha(arquivos), "config": config_do_ambiente(cfg),
                             "noticias": noticias_do_ambiente(paginas, shells)})
    # os ambientes da T14 (content/ de verdade, o de verdade com Extras ligado e os inventados): páginas, raiz/redirects/feeds exatos
    t14_ambientes, exatos_reais = [], None
    for nome, arquivos, cfg in ambientes_t14():
        for rascunhos in (False, True):
            exatos = {}
            if arquivos is None:
                paginas, _short, shells = capturar(build.CONTENT, cfg, rascunhos, exatos=exatos)
            else:
                with tempfile.TemporaryDirectory(prefix="hc-t14-") as tmp:
                    rr.gravar(tmp, arquivos)
                    paginas, _short, shells = capturar(tmp, cfg, rascunhos, exatos=exatos)
            for url, conteudo in exatos.items():
                if url.endswith(".xml"):
                    ET.fromstring(conteudo.encode("utf-8"))        # o feed é XML bem formado (levanta erro se não for)
            if nome == "real" and not rascunhos:
                exatos_reais = dict(exatos)
            efetivo = dict(build.CFG)
            efetivo.update(cfg)
            config = dict(config_do_ambiente(cfg), redirects=efetivo["redirects"], site_url=efetivo.get("site_url", ""),
                          emissaries_hide=efetivo.get("emissaries", {}).get("hide", []), emissaries_show_texts=efetivo.get("emissaries", {}).get("show_texts", False))
            t14_ambientes.append({"nome": nome, "rascunhos": rascunhos, "arquivos_sha1": sha(arquivos) if arquivos is not None else None,
                                  "config": config,
                                  "paginas": pagina_do_ambiente(paginas, shells), "exatos": exatos})
    construcao = construcao_do_site_inteiro()
    leia = ("Gerado por tools/paginas_ref.py a partir do build.py. Não edite à mão: rode `python3 tools/paginas_ref.py` de novo. "
            "Usado por tests/paginas.test.ts, tests/componentes.test.ts, tests/leitor.test.ts e tests/noticias.test.ts.")
    FIXTURES.mkdir(parents=True, exist_ok=True)
    resumo = []
    for grupo, padrao in GRUPOS.items():
        com_chaves = grupo in ("t12", "t13", "t14")      # os grupos cujas páginas têm comentários (window.HC com as chaves de mentira); no t14 só a construção inteira
        doGrupo = {u: (com_marcadores(h) if com_chaves else h) for u, h in sorted(paginas_reais.items()) if padrao.match(u)}
        dados = {"_leia": leia, "python": sys.version.split()[0], "grupo": grupo, "escopo": padrao.pattern, "paginas": doGrupo}
        if com_chaves:
            assert all("chave-de-mentira" not in h and "exemplo.supabase.co" not in h for h in doGrupo.values()), "sobrou chave de mentira"
            dados["marcadores"] = {"url": "__SUPABASE_URL__", "key": "__SUPABASE_ANON_KEY__"}
        if grupo == "t14":
            dados["arquivos_das_paginas"] = cenario_paginas()
            dados["arquivos_do_redirect"] = rr.cenario_enxuto()
            dados["ambientes"] = t14_ambientes
            dados["exatos"] = exatos_reais
            dados["construcao_com_rascunhos_e_extras"] = construcao
        if grupo == "t13":
            dados["arquivos_das_noticias"] = {"noticias": cenario_noticias(), "noticias-so-pt": cenario_noticias_so_pt()}
            dados["ambientes"] = noticias
        if grupo == "t12":
            dados["arquivos_do_leitor"] = cenario_leitor()
            dados["estaticos_do_leitor"] = ESTATICOS_DO_LEITOR
            dados["ambientes"] = leitor
        saida = FIXTURES / f"paginas-{grupo}-python.json"
        saida.write_text(json.dumps(dados, ensure_ascii=False, indent=1) + "\n", "utf-8")
        resumo.append(f"{len(doGrupo)} páginas do grupo {grupo} → {saida.relative_to(ROOT)}")
    SAIDA_COMPONENTES.write_text(json.dumps({"_leia": leia, "python": sys.version.split()[0], "ambientes": ambientes}, ensure_ascii=False, indent=1) + "\n", "utf-8")
    n = sum(len(a["mains"]) for a in ambientes)
    caps = sum(len(a["capitulos"]) for a in leitor)
    noti = sum(len(a["noticias"]) for a in noticias)
    print("✔ " + "; ".join(resumo) + f"; {len(ambientes)} ambientes, {n} <main> → {SAIDA_COMPONENTES.relative_to(ROOT)}; "
          f"leitor: {len(leitor)} ambientes, {caps} capítulos → tests/fixtures/paginas-t12-python.json; "
          f"notícias: {len(noticias)} ambientes, {noti} páginas → tests/fixtures/paginas-t13-python.json; "
          f"T14: {len(t14_ambientes)} ambientes, {sum(len(a['paginas']) for a in t14_ambientes)} páginas → tests/fixtures/paginas-t14-python.json")


if __name__ == "__main__":
    main()
