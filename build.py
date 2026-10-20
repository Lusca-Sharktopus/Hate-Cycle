#!/usr/bin/env python3
"""
Gerador do site Hᴀᴛᴇ Cʏᴄʟᴇ  (só usa a biblioteca padrão do Python 3.8+)

  python build.py                      gera o site na pasta public/
  python build.py serve                gera (com rascunhos) e abre em http://localhost:8000
  python build.py new news meu-post    cria um novo post de notícia (en.md + pt.md)
  python build.py new chapter firestriker      próximo capítulo de uma obra
  python build.py new character nome   /  new universe nome  /  new page nome  /  new work nome
"""
import re, sys, json, shutil, html, datetime, functools, hashlib, http.server, socketserver
from pathlib import Path
from urllib.parse import quote
from email.utils import format_datetime

ROOT = Path(__file__).resolve().parent
CONTENT, STATIC, OUT = ROOT / "content", ROOT / "static", ROOT / "public"
CFG = json.loads((ROOT / "config.json").read_text("utf-8"))
LANGS = list(CFG["languages"])
BASE = CFG.get("base_url", "").rstrip("/")
DRAFTS = False
INDEX = {}  # (lang, "section/slug") -> (title, url)   usado pelos [[links]]
SHORT = {}  # lang -> {"nome": html}   usado pelos {{atalhos}} nos textos


# ───────────────────────── utilidades ─────────────────────────
def esc(s):
    return html.escape(str(s), quote=True)

def u(path):
    return BASE + path

def asset(p):
    if not p:
        return ""
    if re.match(r"^(https?:|data:|mailto:|#)", p):
        return p
    return BASE + "/" + quote(p.lstrip("/"), safe="/")

SC = dict(zip("ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡʏᴢ", "abcdefghijklmnopqrstuvwyz"))   # não existe "x" em versalete Unicode: ʏ = y, ᴢ = z
SC_RUN = re.compile(r"[A-Za-zÀ-ÿ]?[" + "".join(SC) + r"]+(?:\s[A-Za-zÀ-ÿ]?[" + "".join(SC) + r"]+)*")

IPA_CH = re.compile(r"[\u01c0-\u01c3\u0250-\u02ff\u0300-\u036f\u1d00-\u1dbf\u2070-\u209f]")   # IPA, clicks (ǃ ǁ), superscripts (ⁿ ᵏ), combining marks
IPA_RUN = re.compile(r"/[^/\s<>]{2,40}/")
def ipa_ok(seg):   # só conta como fonética se tiver alguma letra IPA que não seja do alfabeto de versalete (ʏ, ʀ, ɪ...)
    return any(IPA_CH.match(c) and c not in SC for c in seg)

def smallcaps(text):
    """texto -> versalete (Hᴀᴛᴇ Cʏᴄʟᴇ) fora das transcrições fonéticas; transcrições /…/ ganham <span class="ipa"> (Arial)"""
    out, pos = [], 0
    for m in IPA_RUN.finditer(text):
        if ipa_ok(m.group(0)):
            out.append(_smallcaps(text[pos:m.start()])); out.append('<span class="ipa">' + m.group(0) + '</span>'); pos = m.end()
    out.append(_smallcaps(text[pos:]))
    return "".join(out)

def _smallcaps(text):
    """Hᴀᴛᴇ Cʏᴄʟᴇ / Sᴇɴʜᴏʀ (letras Unicode que Oswald e Lexend não têm) -> <span class="hc">Hate Cycle</span> (versalete de verdade)"""
    return SC_RUN.sub(lambda m: '<span class="hc">' + "".join(SC.get(ch, ch) for ch in m.group(0)) + "</span>", text)

def ver(rel):
    """URL do arquivo de static/ com um carimbo (?v=...) que muda quando o arquivo muda: o navegador nunca usa CSS/JS velho"""
    try:
        return u(rel) + "?v=" + hashlib.sha1((STATIC / rel.lstrip("/")).read_bytes()).hexdigest()[:8]
    except OSError:
        return u(rel)

def T(lang, key):
    return CFG["ui"].get(lang, {}).get(key) or CFG["ui"]["en"].get(key, key)

def TK(lang, key, kind=None):
    """como T(), mas usa a versão "episódio" (chave + "_ep") quando a obra é em vídeo"""
    k = key + "_ep"
    if kind == "video" and (k in CFG["ui"].get(lang, {}) or k in CFG["ui"]["en"]):
        return T(lang, k)
    return T(lang, key)

def tr(v, lang, default=""):
    """valor traduzível: string ou {"en": ..., "pt": ...}"""
    if isinstance(v, dict):
        return v.get(lang) or v.get("en") or next(iter(v.values()), default)
    return v if v else default

def natural(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", str(s))]

def fmt_date(lang, d):
    try:
        y, m, dd = str(d).split("-")[:3]
        return T(lang, "date_fmt").format(y=y, m=T(lang, "months")[int(m) - 1], d=int(dd))
    except Exception:
        return str(d or "")

def scalar(v):
    v = v.strip()
    if v.startswith("[") and v.endswith("]"):
        return [x.strip().strip("\"'") for x in v[1:-1].split(",") if x.strip()]
    if len(v) > 1 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    return {"true": True, "false": False}.get(v.lower(), v)

def parse(path):
    raw = path.read_text("utf-8-sig").replace("\r\n", "\n")
    fm, body = {}, raw
    m = re.match(r"---\n(.*?)\n---\n?(.*)\Z", raw, re.S)
    if m:
        body, key = m.group(2), None
        for line in m.group(1).split("\n"):
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if re.match(r"\s+-(\s|$)", line) and key:
                if not isinstance(fm[key], list):
                    fm[key] = []
                fm[key].append(scalar(line.strip()[1:]))
            else:
                k, _, v = line.partition(":")
                key = k.strip()
                fm[key] = scalar(v) if v.strip() else ""
    return fm, body

def write(url, content):
    p = OUT / url.strip("/") / "index.html" if url.endswith("/") else OUT / url.strip("/")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, "utf-8")


# ───────────────────────── markdown mínimo ─────────────────────────
def make_md(lang, divider=None):
    def wiki(m):
        key, _, label = m.group(1).partition("|")
        hit = INDEX.get((lang, key.strip()))
        if not hit:
            return label or key.split("/")[-1]
        return f'<a href="{u(hit[1])}">{label or hit[0]}</a>'

    def inline(t):
        t = re.sub(r"\[\[([^\]]+)\]\]", wiki, t)
        t = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", lambda m: f'<img src="{asset(m.group(2))}" alt="{esc(m.group(1))}" loading="lazy">', t)
        t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", lambda m: f'<a href="{asset(m.group(2)) if not m.group(2).startswith("/") else u(m.group(2))}">{m.group(1)}</a>', t)
        t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
        t = re.sub(r"(?<![\w*])\*(?![\s*])(.+?)(?<![\s*])\*(?![\w*])", r"<em>\1</em>", t)
        return t

    def soft(s):  # quebra de linha simples vira espaço; "  " ou "\" no fim vira <br>
        lines = s.split("\n")
        out = ""
        for i, l in enumerate(lines):
            br = l.endswith("  ") or l.endswith("\\")
            out += l.rstrip(" \\") + ("<br>\n" if br and i < len(lines) - 1 else " ")
        return out.strip()

    def render(text):
        out = []
        for blk in re.split(r"\n\s*\n", text.strip()):
            s = blk.strip("\n")
            if not s.strip():
                continue
            st = s.strip()
            lines = st.split("\n")
            if (m := re.fullmatch(r"\{\{embed:(.+?)\}\}", st, re.S)) and not re.fullmatch(r"[\w-]+", m.group(1).strip()):
                out.append(embed_html(m.group(1)))
            elif (m := re.fullmatch(r"\{\{(embed:)?([\w-]+)\}\}", st)):
                if m.group(1):      # {{embed:nome}} -> conteúdo de content/embeds/nome.html (código de incorporação do Instagram, Reddit, X…)
                    f = CONTENT / "embeds" / f"{m.group(2)}.html"
                    out.append(embed_html(m.group(2)))
                else:
                    out.append(SHORT.get(lang, {}).get(m.group(2), ""))
            elif re.fullmatch(r"(-{3,}|\*{3,}|_{3,})", st):
                out.append(f'<img class="scene-divider" src="{asset(divider)}" alt="">' if divider else '<hr class="scene-divider">')
            elif (m := re.fullmatch(r"(#{1,4})\s+(.*)", st)):
                n = max(2, len(m.group(1)))
                out.append(f"<h{n}>{inline(m.group(2))}</h{n}>")
            elif re.fullmatch(r"!\[[^\]]*\]\([^)]+\)", st):
                out.append(f"<figure>{inline(st)}</figure>")
            elif re.match(r"<(div|figure|iframe|section|table|details|ul|ol|blockquote|hr|img|video|audio|script)\b", st):
                out.append(re.sub(r'\b(src|href)="@/([^"]*)"', lambda m: f'{m.group(1)}="{asset(m.group(2))}"', st))   # "@/pasta/arquivo.png" = arquivo de static/ com o caminho do site certo
            elif all(re.match(r"\s*[-*]\s+", l) for l in lines):
                out.append("<ul>" + "".join(f"<li>{inline(re.sub(r'^\s*[-*]\s+', '', l))}</li>" for l in lines) + "</ul>")
            elif all(l.startswith(">") for l in lines):
                out.append("<blockquote>" + inline(soft("\n".join(l.lstrip("> ") for l in lines))) + "</blockquote>")
            else:
                out.append(f"<p>{inline(soft(st))}</p>")
        return "\n".join(out)

    return render


# ───────────────────────── carregamento do conteúdo ─────────────────────────
def load_items(section):
    items = {l: [] for l in LANGS}
    d = CONTENT / section
    if not d.exists():
        return items
    for folder in sorted(p for p in d.iterdir() if p.is_dir()):
        for lang in LANGS:
            f = folder / f"{lang}.md"
            if not f.exists():
                continue
            fm, body = parse(f)
            if fm.get("draft") is True and not DRAFTS:
                continue
            url = f"/{lang}/{folder.name}/" if section == "pages" else f"/{lang}/{section}/{folder.name}/"
            items[lang].append(dict(section=section, slug=folder.name, lang=lang, fm=fm, body=body, url=url,
                                    title=fm.get("title") or folder.name, draft=fm.get("draft") is True))
            INDEX[(lang, f"{section}/{folder.name}")] = (fm.get("title") or folder.name, url)
    return items

def load_works():
    works = []
    d = CONTENT / "works"
    if not d.exists():
        return works
    for wd in sorted(p for p in d.iterdir() if p.is_dir() and (p / "work.json").exists()):
        meta = json.loads((wd / "work.json").read_text("utf-8"))
        if meta.get("draft") is True and not DRAFTS:   # obra inteira em rascunho: só aparece na prévia (serve)
            continue
        w = dict(slug=wd.name, meta=meta, chapters={l: [] for l in LANGS}, hidden={l: [] for l in LANGS})
        for i, cd in enumerate(sorted((p for p in wd.iterdir() if p.is_dir()), key=lambda p: natural(p.name)), 1):
            for lang in LANGS:
                f = cd / f"{lang}.md"
                if not f.exists():
                    continue
                fm, body = parse(f)
                if fm.get("draft") is True and not DRAFTS:
                    continue
                num = fm.get("chapter") or i
                title = fm.get("title") or (wtitle(w, lang) if meta.get("oneshot") else f"{TK(lang, 'chapter', meta.get('kind'))} {num}")
                (w["hidden"] if fm.get("unlisted") is True else w["chapters"])[lang].append(dict(work=w, slug=cd.name, lang=lang, fm=fm, body=body, num=num, title=title,
                                                url=f"/{lang}/works/{wd.name}/{cd.name}/", draft=fm.get("draft") is True))
        for lang in LANGS:  # obras de capítulo único apontam direto para o capítulo
            chs = w["chapters"][lang]
            if chs or tr(meta.get("external"), lang):
                INDEX[(lang, f"works/{wd.name}")] = (wtitle(w, lang), chs[0]["url"] if (meta.get("oneshot") and chs) else f"/{lang}/works/{wd.name}/")
        works.append(w)
    return works

def wtitle(w, l):    return tr(w["meta"].get("title"), l, w["slug"])
def wcover(w, l):    return tr(w["meta"].get("cover"), l)
def wlogo(w, l):     return tr(w["meta"].get("logo"), l)
def wlisted(w, l):   return w["meta"].get("listed", True) and l in w["meta"].get("langs", LANGS)

def wlink(w, l):
    ext = tr(w["meta"].get("external"), l)
    if ext:
        return ext, True
    ch = w["chapters"][l]
    if w["meta"].get("oneshot") and ch:
        return u(ch[0]["url"]), False
    if ch:
        return u(f"/{l}/works/{w['slug']}/"), False
    return None, False

def wcta(w, l):
    if tr(w["meta"].get("cta"), l):
        return tr(w["meta"]["cta"], l)
    return T(l, "watch" if w["meta"].get("kind") == "video" else "read")


# ───────────────────────── componentes HTML ─────────────────────────
# ───────── Impressão rúnica: runas no fundo, únicas por página (sorteio com semente = endereço da página) ─────────
RUNES = ("✝✡ᛁ⚴ᚻᛗᛋᛟᚩ҂ᛃ𐤉Т모ᗐᚣ♐ᚸエꑭⰝ🜁Γᚱᛏ🜂⬡🜄🜃Λᛖ⧮⧰ᛚ𐩹ᛮ𐱃Ⰱ𐊙𑢶⚼ПŁᔨᚫΥ🝂🝘🝃FΣ𐌄Κ𐰤⌗🝧Ѧᛤ⛉𐌇ᛄ𐌙᭻⛩ᚬ⎍ᛇᛒⵅᛞꮤ𐘇𐰭𐤎꓀土◇⧖ᚷ🜲ᛡ⊥‡")
RUNES_TEXT_PRES = set("✝✡♐⚴⚼⛉⛩⬡◇⌗")      # ganham o seletor de texto (U+FE0E) para não virarem emoji colorido
RUNE_FAMILIES_MAIN = ["Noto+Sans", "Noto+Sans+Symbols", "Noto+Sans+Symbols+2", "Noto+Sans+Math", "Noto+Sans+Runic", "Noto+Sans+Cherokee", "Noto+Sans+KR", "Noto+Sans+JP"]
RUNE_FAMILIES_EXTRA = ["Noto+Sans+Yi", "Noto+Sans+Phoenician", "Noto+Sans+Glagolitic", "Noto+Sans+Tifinagh", "Noto+Sans+Balinese", "Noto+Sans+Canadian+Aboriginal", "Noto+Sans+Old+Turkic",
                       "Noto+Sans+Old+Italic", "Noto+Sans+Lycian", "Noto+Sans+Linear+A", "Noto+Sans+Old+South+Arabian", "Noto+Sans+Warang+Citi"]

def rune_fonts_links():
    """Cada fonte vai num <link> próprio, restrita (text=) só aos símbolos usados: se uma fonte não existir no Google Fonts, só ela falha."""
    txt = quote("".join(dict.fromkeys(RUNES)))
    one = lambda fam: f'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family={fam}&text={txt}&display=swap">'
    return "".join(one(f) for f in RUNE_FAMILIES_MAIN + RUNE_FAMILIES_EXTRA)

def rune_imprint(seed, n=26):
    """Gera a 'impressão rúnica' da página: posição, tamanho, giro (±45°) e ritmo de brilho próprios, sempre os mesmos para a mesma página.
    Nenhuma runa encosta em outra: as posições são conferidas em telas largas (1,33 a 2,2) e em telas altas (0,45 a 0,75)."""
    import random, math
    rnd = random.Random(int(hashlib.sha256(str(seed).encode()).hexdigest()[:16], 16))
    glyphs = list(dict.fromkeys(RUNES)); rnd.shuffle(glyphs)
    LAND, PORT, GAP = (1.33, 2.2), (0.45, 0.75), .025      # proporções de tela conferidas e folga mínima (em "vmin")
    def xy(x, y, land, a):                                   # % da tela -> unidades de vmin
        return (x / 100 * a, y / 100) if land else (x / 100, y / 100 / a)
    def ok(x, y, rad, placed, land):
        for a in (LAND if land else PORT):
            px, py = xy(x, y, land, a)
            for (ox, oy, orad) in placed:
                qx, qy = xy(ox, oy, land, a)
                if math.hypot(px - qx, py - qy) < rad + orad + GAP: return False
        return True
    def pick(rad, placed, land):
        for _ in range(250):
            if land and rnd.random() < .4:                   # parte nas margens, que ficam visíveis ao lado da "folha"
                x = rnd.uniform(0, 8) if rnd.random() < .5 else rnd.uniform(92, 100)
            else:
                x = rnd.uniform(0, 100)
            y = rnd.uniform(0, 100)
            if ok(x, y, rad, placed, land): return (x, y)
        return None
    sizes = sorted((rnd.uniform(3, 15) for _ in range(n)), reverse=True)     # as grandes entram primeiro
    pl, pp, out = [], [], []
    for i, size in enumerate(sizes):
        for _ in range(12):
            rad = .55 * (size / 100 + .035)
            a_, b_ = pick(rad, pl, True), pick(rad, pp, False)
            if a_ and b_: break
            size *= .88                                       # não coube: encolhe um pouco e tenta de novo
        else:
            continue
        pl.append((*a_, rad)); pp.append((*b_, rad))
        g = glyphs[i % len(glyphs)]
        if g in RUNES_TEXT_PRES: g += "\ufe0e"
        lo, hi = rnd.uniform(.07, .15), rnd.uniform(.28, .5)
        out.append(f'<i style="--lx:{a_[0]:.1f}%;--ly:{a_[1]:.1f}%;--px:{b_[0]:.1f}%;--py:{b_[1]:.1f}%;--s:{size:.2f};--r:{rnd.uniform(-45, 45):.0f}deg;--lo:{lo:.2f};--hi:{hi:.2f};'
                   f'--d:{rnd.uniform(7, 19):.1f}s;animation-delay:{-rnd.uniform(0, 19):.1f}s">{esc(g)}</i>')
    rnd.shuffle(out)
    return '<div class="runes" aria-hidden="true">' + "".join(out) + "</div>"

# ───────────────────────── barra lateral (botões) ─────────────────────────
SIDEBAR_UI = {
    "en": {"project": "Follow the project", "author": "Follow the author", "partners": "Partner projects", "tip": "Tip Jar"},
    "pt": {"project": "Siga o projeto", "author": "Siga o autor", "partners": "Projetos parceiros", "tip": "Tip Jar"},
}
AUTHOR_SOCIALS = [
    ("Instagram", "https://www.instagram.com/lusca_sharktopus/", "social/instagram.png"),
    ("X (Twitter)", "https://x.com/KingOfAllOceans", "social/twitter.png"),
    ("TikTok", "https://www.tiktok.com/@lusca_sharktopus", "social/tiktok.png"),
]
SIDEBAR_ON = False  # True = mostra a barra lateral (e tira as redes sociais do rodapé)
SB = "sidebar/"      # imagens em static/sidebar/ (trocar um arquivo pelo definitivo, com o MESMO nome, basta)
KOFI_URL = ""        # sem link por enquanto; quando tiver, cole aqui
PARTNERS = [         # (arquivo sem .png, link) — "<arquivo> hover.png" é a versão do mouse por cima
    ("Adolas Podcast", "https://www.instagram.com/adolaspodcast/"),
    ("Corte do Submundo", "https://cortedosubmundo.com"),
    ("Lusca Sharktopus", "https://www.youtube.com/@LuscaSharktopus"),
    ("Safe Haven", "https://www.youtube.com/@safehavenoficial"),
    ("Two Ways", "https://fliptru.com.br/comic/two-ways-gtgk"),
]

def sidebar(lang):
    t = SIDEBAR_UI.get(lang, SIDEBAR_UI["en"])
    div = f'<img class="sb-div" src="{asset(SB + "divisor.png")}" alt="" aria-hidden="true">'
    icons = lambda items: "".join(f'<a href="{esc(url)}" target="_blank" rel="noopener" title="{esc(n)}"><img src="{asset(ic)}" alt="{esc(n)}"></a>' for n, url, ic in items)
    proj = [(s["name"], s["url"], s["icon"]) for s in CFG["socials"]]
    part = "".join(
        f'<a class="sb-img sb-hover" href="{esc(url)}" target="_blank" rel="noopener" title="{esc(n)}">'
        f'<img class="a" src="{asset(SB + n + ".png")}" alt="{esc(n)}"><img class="b" src="{asset(SB + n + " hover.png")}" alt="" aria-hidden="true" loading="lazy"></a>'
        for n, url in PARTNERS)
    kofi_in = f'<img src="{asset(SB + "kofi.png")}" alt=""><span>{esc(t["tip"])}</span>'
    kofi = (f'<a class="sb-tip" href="{esc(KOFI_URL)}" target="_blank" rel="noopener">{kofi_in}</a>' if KOFI_URL
            else f'<div class="sb-tip">{kofi_in}</div>')
    return (f'<aside class="sidebar" aria-label="{esc(t["project"])}">{div}'
            f'<h2 class="sb-h">{esc(t["project"])}</h2><div class="sb-icons">{icons(proj)}</div>'
            f'<h2 class="sb-h">{esc(t["author"])}</h2><div class="sb-icons">{icons(AUTHOR_SOCIALS)}</div>'
            f'<img class="sb-img" src="{asset(SB + "Discord Server.png")}" alt="Discord">{div}'
            f'<img class="sb-img" src="{asset(SB + "Catarse.png")}" alt="Catarse">{kofi}{div}'
            f'<h2 class="sb-h">{esc(t["partners"])}</h2>{part}</aside>')

def shell(lang, title, main, alt=None, cls="", desc="", image="", has=None, noindex=False, seed=""):
    alt = alt or {}
    # "Hᴀᴛᴇ Cʏᴄʟᴇ" (letras Unicode que Oswald/Lexend não têm) vira "Hate Cycle" em versalete de verdade (CSS .hc)
    main = re.sub(r">([^<>]+)<", lambda m: ">" + smallcaps(m.group(1)) + "<", main)
    main = main.replace('class="works"', f'class="works" data-prev="{esc(T(lang, "prev"))}" data-next="{esc(T(lang, "next"))}"')
    cur_url = alt.get("_self") or ""

    def link(href, label):
        cur = ' aria-current="page"' if cur_url == href else ""
        return f'<a href="{u(href)}"{cur}>{esc(label)}</a>'

    h = has[lang]
    nav = link(f"/{lang}/works/", T(lang, "works"))
    if h["about"]:
        nav += link(f"/{lang}/about/", T(lang, "about"))
    if h["news"]:
        nav += link(f"/{lang}/news/", T(lang, "news"))
    if h["extras"]:
        cur = " data-current" if any(cur_url == x for x, _ in h["extras"]) else ""
        nav += (f'<details class="dd"{cur}><summary>{esc(T(lang, "extras"))}</summary><div class="dd-menu">'
                + "".join(link(x, y) for x, y in h["extras"]) + "</div></details>")
    if h["support"]:
        nav += link(f"/{lang}/support/", T(lang, "support"))
    others = "".join(f'<a href="{u(alt.get(l) or f"/{l}/")}" hreflang="{l}" lang="{CFG["languages"][l]["html"]}">{esc(CFG["languages"][l]["name"])}</a>' for l in LANGS if l != lang)
    nav += (f'<details class="dd lang-dd"><summary>{esc(CFG["languages"][lang]["name"])}</summary>'
            f'<div class="dd-menu">{others}</div></details>') if others else ""
    hreflangs = "".join(f'<link rel="alternate" hreflang="{l}" href="{u(alt[l])}">' for l in LANGS if alt.get(l))
    ic = CFG.get("intro", {})
    intro_head = intro_body = ""
    if ic.get("enabled"):
        intro_head = ("<script>(function(){var d=document.documentElement;try{if((!sessionStorage.getItem('hc-intro')&&!matchMedia('(prefers-reduced-motion: reduce)').matches)"
                      f"||/[?&]intro/.test(location.search)){{d.classList.add('intro');setTimeout(function(){{d.classList.remove('intro')}},{int(ic.get('max_ms', 10000)) + 3000});}}}}catch(e){{}}}})()</script>\n")
        bg = f"background-image:url('{asset(ic.get('background', ''))}')" if ic.get("background") else ""
        intro_body = (f'<div class="intro-screen" id="intro" aria-hidden="true" data-min="{int(ic.get("min_ms", 4200))}" data-max="{int(ic.get("max_ms", 10000))}" style="{bg}"></div>\n'
                      "<script>(function(){if(!document.documentElement.classList.contains('intro'))return;var v=document.createElement('video');"
                      f"v.muted=true;v.autoplay=true;v.setAttribute('playsinline','');v.preload='auto';v.src={json.dumps(asset(ic.get('video', '')))};"
                      "document.getElementById('intro').appendChild(v);var p=v.play&&v.play();if(p&&p.catch)p.catch(function(){});})();</script>\n")
    site = CFG["site_name"]
    ttl = site if title == site else f"{title} | {site}"
    social = "".join(f'<a href="{esc(s["url"])}" target="_blank" rel="noopener" title="{esc(s["name"])}"><img src="{asset(s["icon"])}" alt="{esc(s["name"])}"></a>' for s in CFG["socials"])
    feed = f'<link rel="alternate" type="application/rss+xml" href="{u(f"/{lang}/feed.xml")}">' if CFG.get("site_url") else ""
    rss = f'<a href="{u(f"/{lang}/feed.xml")}">{esc(T(lang, "rss"))}</a>' if CFG.get("site_url") else ""
    og = f'<meta property="og:image" content="{esc(CFG.get("site_url", "") + asset(image))}">' if image else ""
    return f"""<!DOCTYPE html>
<html lang="{CFG['languages'][lang]['html']}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(ttl)}</title>
{'<meta name="robots" content="noindex, nofollow">' if noindex else ''}
<meta name="description" content="{esc(desc or T(lang, 'hero_sub'))}">
<meta property="og:title" content="{esc(ttl)}"><meta property="og:description" content="{esc(desc or T(lang, 'hero_sub'))}">{og}
{intro_head}<link rel="icon" href="{u('/logos/favicon.png')}" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lexend:wght@300..800&family=Oswald:wght@300..700&family=Vollkorn+SC:wght@400;600;700&family=Noto+Emoji:wght@300..700&family=PT+Serif:ital@0;1&family=Road+Rage&display=swap">
{rune_fonts_links()}
<link rel="stylesheet" href="{ver('/style.css')}">
<link rel="stylesheet" href="{ver('/custom.css')}">
{hreflangs}{feed}
</head>
<body class="{cls}">
{rune_imprint(seed or title)}
{intro_body}
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <a class="brand" href="{u(f'/{lang}/')}"><img src="{asset(CFG['logo'])}" alt="{esc(site)}"></a>
  <nav class="main-nav" aria-label="Main">{nav}</nav>
</header>
<div class="layout">
<main id="main"{"" if "reader" in cls else ' class="sheet"'}>
{main}
</main>
{sidebar(lang) if SIDEBAR_ON and "reader" not in cls else ""}
</div>
<footer class="site-footer">
  {"" if SIDEBAR_ON else f'<div class="social">{social}</div>'}
    <p>&copy; {2023} - {datetime.date.today().year} by {esc(CFG.get('author', CFG['site_name']))} {rss}</p>
</footer>
<script src="{ver('/site.js')}" defer></script>
<script>document.addEventListener('click',function(e){{document.querySelectorAll('details.dd[open]').forEach(function(d){{if(!d.contains(e.target))d.removeAttribute('open')}})}});</script>
</body>
</html>"""

def crack():
    return '<div class="crack" aria-hidden="true"></div>'

def excerpt(body, n=130):
    """primeiras palavras do texto da notícia, sem HTML/embeds/markdown"""
    t = re.sub(r"\{\{[^}]*\}\}", " ", body)
    t = re.sub(r"<(script|blockquote|iframe|div|figure|style)\b[\s\S]*?</\1>", " ", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\[\[[^\]|]+\|([^\]]+)\]\]", r"\1", t)
    t = re.sub(r"\[\[([^\]]+)\]\]", lambda m: m.group(1).split("/")[-1], t)
    t = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"[*_#>]+", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t if len(t) <= n else t[:n].rsplit(" ", 1)[0].rstrip(" ,;:.-") + "…"

def plain(body):
    return excerpt(body, 100000)

def card_work(w, l):
    href, external = wlink(w, l)
    cover = wcover(w, l) or wlogo(w, l)
    img = f'<img src="{asset(cover)}" alt="{esc(wtitle(w, l))}" loading="lazy">' if cover else '<div class="nocover"></div>'
    blurb = tr(w["meta"].get("blurb"), l)
    if href:
        tgt = ' target="_blank" rel="noopener noreferrer"' if external else ""
        btn = f'<a class="button" href="{esc(href)}"{tgt}>{esc(wcta(w, l))}</a>'
    else:
        btn = f'<span class="button disabled">{esc(T(l, "soon"))}</span>'
    o = w["meta"].get("order", {})
    data = f' data-title="{esc(wtitle(w, l))}"' + "".join(f' data-{k}="{"hide" if o[k] is False else o[k]}"' for k in ("chrono", "release") if k in o)
    if w["meta"].get("media"): data += f' data-media="{esc(w["meta"]["media"])}"'
    if not href and DRAFTS and w["hidden"][l]:
        btn += f'<a class="preview-link" href="{u(w["hidden"][l][0]["url"])}">👁 {esc(T(l, "preview"))}</a>'
    return f'<article class="work-card"{data}>{img}<h3>{esc(wtitle(w, l))}</h3><p>{esc(blurb)}</p>{btn}</article>'

ICONS = {
    "instagram": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none"/></svg>',
    "youtube": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
    "tiktok": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
    "x": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>',
    "bluesky": '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z"/></svg>',
    "website": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.2 3.2 3.2 14.8 0 18M12 3c-3.2 3.2-3.2 14.8 0 18"/></svg>',
    "email": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
}
NETWORKS = {"instagram": "Instagram", "tiktok": "TikTok", "youtube": "YouTube", "x": "X", "bluesky": "Bluesky", "website": "Website", "email": "E-mail"}

def card_emissary(e, lang):
    fm = e["fm"]
    img = (f'<img src="{asset(fm["image"])}" alt="{esc(e["title"])}" loading="lazy">' if fm.get("image")
           else f'<div class="emi-ph" aria-hidden="true">{esc(e["title"][:1].upper())}</div>')
    links = ""
    for key, label in NETWORKS.items():
        if fm.get(key):
            url = fm[key] if key != "email" or "@" not in fm[key] or fm[key].startswith("mailto:") else "mailto:" + fm[key]
            links += f'<a href="{esc(url)}" target="_blank" rel="noopener" aria-label="{esc(label)}" title="{esc(label)}">{ICONS[key]}</a>'
    text = make_md(lang)(e["body"]) if e["body"].strip() and CFG.get("emissaries", {}).get("show_texts", True) else ""
    return (f'<article class="emi-card"><div class="emi-photo">{img}</div><h3>{esc(e["title"])}</h3>'
            f'<p class="emi-role">{esc(fm.get("role", ""))}</p>{f"<div class=emi-text>{text}</div>" if text else ""}'
            f'{f"<div class=emi-links>{links}</div>" if links else ""}</article>')

MEDIA_LABELS = {
    "en": {"videogame": "Videogame", "live-ttrpg": "Live TTRPG", "webcomic": "Webcomic", "short-story": "Short Story", "animated-show": "Animated Show", "short-film": "Short Film", "misc": "Miscellaneous"},
    "pt": {"videogame": "Videogame", "live-ttrpg": "RPG ao Vivo", "webcomic": "Webcomic", "short-story": "Conto", "animated-show": "Série Animada", "short-film": "Curta-metragem", "misc": "Miscelânea"},
}
MEDIA_UI = {"en": ("Media type", "All types"), "pt": ("Tipo de mídia", "Todos os tipos")}

def sorter_html(lang, grid_id, works=None):
    opts = "".join(f'<option value="{k}">{esc(T(lang, "sort_" + k))}</option>' for k in ("release", "chrono", "alpha"))
    labels = {k: T(lang, "dir_" + k) for k in ("release", "chrono", "alpha")}
    present = []
    for w in (works or []):
        m = w["meta"].get("media")
        if m and m not in present: present.append(m)
    mf = ""
    if present:
        lab, allt = MEDIA_UI.get(lang, MEDIA_UI["en"])
        names = MEDIA_LABELS.get(lang, MEDIA_LABELS["en"])
        mf = (f'<label class="media-filter"><span class="sr-only">{esc(lab)}</span><select class="media-select" aria-label="{esc(lab)}"><option value="">{esc(allt)}</option>'
              + "".join(f'<option value="{esc(m)}">{esc(names.get(m, m))}</option>' for m in present) + '</select></label>')
    return (f'<div class="sorter" data-grid="{grid_id}" data-lang="{lang}" data-labels="{esc(json.dumps(labels, ensure_ascii=False))}">'
            f'<input type="search" class="story-search" placeholder="{esc(T(lang, "search_ph"))}" aria-label="{esc(T(lang, "search_ph"))}" autocomplete="off">'
            f'{mf}<label><span class="sr-only">{esc(T(lang, "sort_by"))}</span><select>{opts}</select></label>'
            f'<button type="button" class="sort-dir" data-dir="asc"><span class="up">↑</span><span class="down">↓</span></button></div>')

# ───────── Posts incorporados: {{embed:nome}} | {{embed:link}} | {{embed:A | B | C}} (botão para alternar) ─────────
EMBED_KINDS = [("twitter-tweet", "x", "X"), ("instagram-media", "instagram", "Instagram"), ("tiktok.com/player", "tiktok", "TikTok"), ("tiktok-embed", "tiktok", "TikTok"),
               ("youtube.com/embed", "youtube", "YouTube"), ("reddit-embed", "reddit", "Reddit")]
EMBED_ICONS = {"x": "social/twitter.png", "instagram": "social/instagram.png", "tiktok": "social/tiktok.png", "youtube": "social/youtube.png"}

def url_embed(url):
    """Monta o código de incorporação a partir de um link (X/Twitter, Instagram, TikTok, YouTube, Reddit)."""
    url = url.strip().replace("&amp;", "&")
    if m := re.match(r"https?://(?:www\.)?(?:x|twitter)\.com/(\w+)/status/(\d+)", url):
        return (f'<blockquote class="twitter-tweet"><a href="https://x.com/{m.group(1)}/status/{m.group(2)}"></a></blockquote>'
                '<script async src="https://platform.x.com/widgets.js" charset="utf-8"></script>')
    if m := re.match(r"https?://(?:www\.)?instagram\.com/(?:[\w.]+/)?(p|reel|tv)/([\w-]+)", url):
        link = f"https://www.instagram.com/{m.group(1)}/{m.group(2)}/"
        return (f'<blockquote class="instagram-media" data-instgrm-permalink="{link}" data-instgrm-version="14" style="background:#FFF; border:0; border-radius:3px; '
                'box-shadow:0 0 1px 0 rgba(0,0,0,0.5),0 1px 10px 0 rgba(0,0,0,0.15); margin:1px; max-width:540px; min-width:326px; padding:0; width:calc(100% - 2px);"></blockquote>'
                '<script async src="//www.instagram.com/embed.js"></script>')
    if m := re.match(r"https?://(?:www\.)?tiktok\.com/(@[\w.]+)/video/(\d+)", url):   # player oficial em iframe (o embed.js do TikTok costuma devolver "overload-protect triggered")
        return (f'<div class="short-embed tiktok-embed-frame"><iframe src="https://www.tiktok.com/player/v1/{m.group(2)}?music_info=1&description=1" title="TikTok" '
                'allow="fullscreen; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>')
    if m := re.match(r"https?://(?:www\.)?(?:youtube\.com/(?:watch\?(?:[^#]*&)?v=|shorts/|embed/)|youtu\.be/)([\w-]{11})", url):
        ifr = (f'<iframe src="https://www.youtube.com/embed/{m.group(1)}" title="YouTube" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; '
               'gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>')
        return f'<div class="short-embed">{ifr}</div>' if "/shorts/" in url else f'<div class="video-wrapper">{ifr}</div>'
    if m := re.match(r"https?://(?:www\.)?reddit\.com/(r/\w+/comments/\w+/\w+)", url):
        path = m.group(1)
        return (f'<blockquote class="reddit-embed-bq" style="height:500px" data-embed-height="566"><a href="https://www.reddit.com/{path}/">{path.split("/")[-1].replace("_", " ")}</a></blockquote>'
                '<script async src="https://embed.reddit.com/widgets.js" charset="UTF-8"></script>')
    return ""

def embed_html(spec):
    parts, links = [], []
    for p in (x.strip() for x in re.split(r"\s*\|\s*", spec)):
        h = url_embed(p) if re.match(r"https?://", p) else ((CONTENT / "embeds" / f"{p}.html").read_text("utf-8-sig").strip() if (CONTENT / "embeds" / f"{p}.html").exists() else "")
        if h:
            parts.append(h)
            links.append(p.replace("&", "&amp;") if re.match(r"https?://", p) else "")
    def opn(h, link):
        if not link:
            return ""
        label = next((l for s, k, l in EMBED_KINDS if s in h), "")
        return f'<p class="embed-open"><a href="{link}" target="_blank" rel="noopener">&#8599; {label or "Link"}</a></p>'
    parts_html = [f'<div class="embed">{h}</div>{opn(h, lk)}' for h, lk in zip(parts, links)]
    if not parts:
        return ""
    if len(parts) == 1:
        return parts_html[0]
    panels, btns = "", ""
    for i, h in enumerate(parts):
        kind, label = next(((k, l) for s, k, l in EMBED_KINDS if s in h), ("web", "Post"))
        icon = f'<img src="{asset(EMBED_ICONS[kind])}" alt="">' if kind in EMBED_ICONS else ""
        panels += f'<div class="embed-panel{" is-on" if i == 0 else ""}">{parts_html[i]}</div>'
        btns += (f'<button type="button" class="embed-btn{" is-on" if i == 0 else ""}" aria-pressed="{"true" if i == 0 else "false"}" title="{label}" aria-label="{label}">'
                 f'{icon}<span>{label}</span></button>')
    return f'<div class="embed-alt"><div class="embed-panels">{panels}</div><div class="embed-switch">{btns}</div></div>'

COMMENT_UI_DEFAULTS = {
    "en": {"c_google": "Continue with Google", "c_or": "or", "c_close": "Close", "c_login_title": "Log in to comment", "c_edit": "Edit", "c_save": "Save", "c_edited": "edited"},
    "pt": {"c_google": "Continuar com o Google", "c_or": "ou", "c_close": "Fechar", "c_login_title": "Entre para comentar", "c_edit": "Editar", "c_save": "Salvar", "c_edited": "editado"},
}


def comments(lang, ident, title, fm=None):
    """Comentários próprios (Supabase). `ident` é o mesmo nos dois idiomas, então a conversa é compartilhada."""
    cc = CFG.get("comments", {})
    if fm and fm.get("comments") is False:
        return ""
    if not (cc.get("supabase_url") and cc.get("supabase_anon_key")):
        return (f'<section class="hc-comments"><p class="c-note">{esc(T(lang, "c_not_configured"))}</p></section>' if DRAFTS else "")
    ui = {k: v for k, v in CFG["ui"]["en"].items() if k.startswith("c_")}
    ui.update({k: v for k, v in CFG["ui"].get(lang, {}).items() if k.startswith("c_")})
    for k, v in COMMENT_UI_DEFAULTS.get(lang, COMMENT_UI_DEFAULTS["en"]).items():
        ui.setdefault(k, v)
    sb_url = re.sub(r"/(rest|auth|storage|functions)/v1.*$|/+$", "", cc["supabase_url"].strip())   # tira "/" e "/rest/v1" que sobram ao copiar a URL
    conf = json.dumps({"url": sb_url, "key": cc["supabase_anon_key"].strip(), "lang": lang, "ui": ui}, ensure_ascii=False)
    return (f'<section class="hc-comments" data-page="{esc(ident)}"><h2>{esc(T(lang, "c_title"))}</h2><div class="c-app"></div></section>'
            f'<script>window.HC={conf.replace("</", "<\\/")};</script>'
            f'<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script src="{ver("/comments.js")}"></script>')

def draft_banner(lang, it):
    return f'<p class="draft-banner">{esc(T(lang, "draft"))}</p>' if it.get("draft") else ""

def arrow(direction):
    d = "M8 4.5v15l11.5-7.5z" if direction == "next" else "M16 4.5v15L4.5 12z"
    return f'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="{d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>'

# Pedido do autor (16/10/2026): títulos longos de anterior/próximo espremiam o botão "Todas as notícias".
# Limite de caracteres (code points do Python) nos títulos das laterais do pager; passou, corta no fim de palavra + "…".
PAGER_TITLE_MAX = 40
_PAGER_LOOSE = re.compile(r"[\s,;:.\-–—_/\\|&+=…·(\[{«“‘\"']+$")   # o que não fica pendurado antes das reticências (fecha-aspas, ! ? e ) ficam)

def clip_title(t, limit=PAGER_TITLE_MAX):
    """Título curto para o pager: cabe em `limit` caracteres contando as reticências; só corta se passar do limite."""
    if len(t) <= limit:
        return t
    cut = t[:limit - 1]
    if not t[limit - 1].isspace():            # o corte caiu no meio de uma palavra: descarta a palavra partida
        m = re.search(r"\s\S*$", cut)
        if m:
            cut = cut[:m.start()]
    cut = _PAGER_LOOSE.sub("", cut)
    return (cut or t[:limit - 1].rstrip()) + "…"

def pager(lang, prev, nxt, mid=None):
    def side(ch, d):
        full = ch["title"]
        short = clip_title(full)
        # título cortado: o completo vai no title (dica do mouse) e no aria-label (leitor de tela lê inteiro)
        extra = f' title="{esc(full)}" aria-label="{esc(T(lang, d))}: {esc(full)}"' if short != full else ""
        return short, extra
    if prev:
        s_, x_ = side(prev, "prev")
        a = (f'<a class="pg prev" rel="prev" href="{u(prev["url"])}"{x_}><span class="pg-btn">{arrow("prev")}</span>'
             f'<span class="pg-txt">{esc(T(lang, "prev"))}<small>{esc(s_)}</small></span></a>')
    else:
        a = "<span></span>"
    if nxt:
        s_, x_ = side(nxt, "next")
        b = (f'<a class="pg next" rel="next" href="{u(nxt["url"])}"{x_}><span class="pg-txt">{esc(T(lang, "next"))}'
             f'<small>{esc(s_)}</small></span><span class="pg-btn">{arrow("next")}</span></a>')
    else:
        b = "<span></span>"
    m = f'<a class="mid" href="{u(mid[0])}">{esc(mid[1])}</a>' if mid else ""
    return f'<nav class="pager" aria-label="Chapters">{a}{m}{b}</nav>'

def related_html(lang, fm):
    links = []
    for key in fm.get("related", []) or []:
        hit = INDEX.get((lang, key))
        if hit:
            links.append(f'<a href="{u(hit[1])}">{esc(hit[0])}</a>')
    return f'<p class="related"><strong>{esc(T(lang, "see_also"))}:</strong> {" ".join(links)}</p>' if links else ""


def clean_out():
    """Apaga a pasta public/. No Windows isso falha se algum arquivo estiver somente-leitura
    ou aberto em outro programa; então tentamos de novo e, no pior caso, apenas sobrescrevemos."""
    import os, stat, time

    def force(func, path, *_):
        try:
            os.chmod(path, stat.S_IWRITE)
            func(path)
        except OSError:
            pass

    kw = {"onexc": force} if sys.version_info >= (3, 12) else {"onerror": force}
    for _ in range(3):
        if not OUT.exists():
            return
        shutil.rmtree(OUT, **kw)
        if OUT.exists():
            time.sleep(0.5)
    if OUT.exists():
        print("⚠ Não consegui apagar a pasta public/ (algum programa está usando). Vou sobrescrever os arquivos.")


# ───────────────────────── build ─────────────────────────
def build():
    clean_out()
    OUT.mkdir(exist_ok=True)
    if STATIC.exists():
        shutil.copytree(STATIC, OUT, dirs_exist_ok=True, copy_function=shutil.copyfile)

    news, universe, chars, pages, emis = (load_items(s) for s in ("news", "universe", "characters", "pages", "emissaries"))
    works = load_works()
    if not CFG.get("show_extras", True):          # "Extras" retirado por enquanto: nem páginas nem links
        universe = {l: [] for l in LANGS}
        chars = {l: [] for l in LANGS}
        for k in [k for k in INDEX if k[1].startswith(("universe/", "characters/"))]:
            del INDEX[k]
    has = {}
    for l in LANGS:
        ex = []
        if universe[l]: ex.append((f"/{l}/universe/", T(l, "universe")))
        if chars[l]: ex.append((f"/{l}/characters/", T(l, "characters")))
        if CFG.get("show_extras", True):
            ex += [(p["url"], p["title"]) for p in pages[l] if p["fm"].get("menu") == "extras"]
        has[l] = {"news": bool(news[l]), "universe": bool(universe[l]), "characters": bool(chars[l]), "extras": ex,
                  "about": any(p["slug"] == "about" for p in pages[l]), "support": any(p["slug"] == "support" for p in pages[l])}
    for l in LANGS:
        news[l].sort(key=lambda i: str(i["fm"].get("date", "")), reverse=True)
        universe[l].sort(key=lambda i: (str(i["fm"].get("category", "")), natural(i["fm"].get("order", 99)), i["title"]))
        chars[l].sort(key=lambda i: (natural(i["fm"].get("order", 99)), i["title"]))
        emis[l].sort(key=lambda i: (natural(i["fm"].get("order", 99)), i["title"]))
        hide_emi = CFG.get("emissaries", {}).get("hide", [])          # config.json → "emissaries": {"hide": ["saf"]}
        emis[l] = [e for e in emis[l] if e["slug"] not in hide_emi]

    def alt_for(section, slug):  # links de idioma para uma página que pode existir só em alguns idiomas
        d = {"news": news, "universe": universe, "characters": chars, "pages": pages}[section]
        return {l: next((i["url"] for i in d[l] if i["slug"] == slug), None) for l in LANGS}

    def page(url, lang, title, main, alt=None, **kw):
        alt = dict(alt or {})
        alt["_self"] = url
        alt.setdefault(lang, url)
        write(url, shell(lang, title, main, alt, has=has, seed=url, **kw))

    for lang in LANGS:
        md = make_md(lang)
        home_alt = {l: f"/{l}/" for l in LANGS}
        listed = [w for w in works if wlisted(w, lang)]
        hate = sorted((w for w in listed if w["meta"].get("universe", True)), key=lambda w: w["meta"].get("order", {}).get("release", 999))
        other = [w for w in listed if not w["meta"].get("universe", True)]

        SHORT[lang] = {
            "stories": (f'<section class="stories-block"><h2>{esc(T(lang, "hate_stories"))}</h2><div class="stories-head"><p class="sub">{esc(T(lang, "hate_stories_sub"))}</p>'
                        f'{sorter_html(lang, "hate-grid", hate)}</div><div class="works grid" id="hate-grid">{"".join(card_work(w, lang) for w in hate)}</div>'
                        f'<p class="no-results" hidden>{esc(T(lang, "search_none"))}</p></section>'),
            "other-stories": (f'<section class="stories-block"><h2>{esc(T(lang, "other_stories"))}</h2><p class="sub">{esc(T(lang, "other_stories_sub"))}</p>'
                              f'<div class="works grid">{"".join(card_work(w, lang) for w in other)}</div></section>') if other else "",
            "emissaries": (f'<section class="emissaries"><h2>{esc(T(lang, "emissaries"))}</h2><p class="sub">{esc(T(lang, "emissaries_sub"))}</p>'
                           f'<div class="emi-grid">{"".join(card_emissary(e, lang) for e in emis[lang])}</div></section>') if emis[lang] else "",
        }

        # ── atualizações recentes (notícias + capítulos com data)
        feed_items = [dict(date=str(n["fm"].get("date", "")), url=n["url"], title=n["title"], kind="tag_news",
                           text=n["fm"].get("summary") or excerpt(n["body"]), image=n["fm"].get("thumb") or n["fm"].get("image", ""),
                           links=re.findall(r"\[\[works/([\w-]+)", n["body"])) for n in news[lang]]
        for w in works:
            if w["meta"].get("external") and not w["chapters"][lang]:
                continue
            for c in w["chapters"][lang]:
                if c["fm"].get("date"):
                    ttl = wtitle(w, lang) if w["meta"].get("oneshot") else f"{wtitle(w, lang)} — {c['title']}"
                    feed_items.append(dict(date=str(c["fm"]["date"]), url=c["url"], title=ttl, kind="tag_chapter_ep" if w["meta"].get("kind") == "video" else "tag_chapter",
                                           text=c["fm"].get("summary", ""), image=wcover(w, lang), work=w["slug"]))
        # evita redundância: a notícia que anuncia um capítulo/episódio já listado (mesma obra, até 3 dias de diferença) some desta lista;
        # o cartão do capítulo herda o resumo da notícia. (A notícia continua na página Notícias.)
        def _near(a, b):
            try:
                return abs((datetime.date.fromisoformat(a[:10]) - datetime.date.fromisoformat(b[:10])).days) <= 3
            except ValueError:
                return False
        chap_items = [i for i in feed_items if i.get("work")]
        merged = []
        for it in feed_items:
            twin = [c for c in chap_items if not it.get("work") and c["work"] in it.get("links", []) and _near(c["date"], it["date"])]
            if twin:
                for c in twin:
                    c["text"] = c["text"] or it["text"]
                continue
            merged.append(it)
        feed_items = merged
        feed_items.sort(key=lambda i: i["date"], reverse=True)

        def last_update(w):   # data do capítulo mais recente (ou "updated" no work.json)
            ds = [str(c["fm"]["date"]) for c in w["chapters"][lang] if c["fm"].get("date")]
            if w["meta"].get("updated"):
                ds.append(str(w["meta"]["updated"]))
            return max(ds) if ds else ""
        recent = sorted(hate, key=lambda w: (last_update(w), bool(wlink(w, lang)[0]), w["meta"].get("order", {}).get("release", 0)), reverse=True)[:5]

        # ── HOME
        latest = "".join(
            f'<a class="update" href="{u(i["url"])}">'
            + (f'<img src="{asset(i["image"])}" alt="" loading="lazy">' if i["image"] else "")
            + f'<span class="tag">{esc(T(lang, i["kind"]))}</span><time>{esc(fmt_date(lang, i["date"]))}</time>'
            f'<h3>{esc(i["title"])}</h3><p>{esc(i["text"])}</p></a>' for i in feed_items[:4])
        about = next((p for p in pages[lang] if p["slug"] == "project"), None)
        main = f"""
<section class="hero"><div class="wrap">
  <h1>{esc(T(lang, 'tagline'))}</h1>
  <p>{esc(T(lang, 'hero_sub'))}</p>
  <div class="hero-actions"><a class="button" href="{u(f'/{lang}/works/')}">{esc(T(lang, 'start'))}</a>
  {f'<a class="button ghost" href="{u(f"/{lang}/universe/")}">{esc(T(lang, "explore"))}</a>' if has[lang]['universe'] else ''}</div>
</div>{crack()}</section>
{f'<section class="wrap block"><h2>{esc(T(lang, "latest"))}</h2><div class="updates">{latest}</div></section>' if latest else ''}
<section class="wrap block"><h2>{esc(T(lang, 'hate_stories'))}</h2><p class="sub">{esc(T(lang, 'hate_stories_sub'))}</p>
<div class="works" data-more-url="{u(f'/{lang}/works/')}" data-more-label="{esc(T(lang, 'all_stories'))}">{''.join(card_work(w, lang) for w in recent)}</div></section>
{f'<section class="wrap block about-teaser"><h2>{esc(about["title"])}</h2><p>{esc(about["fm"].get("summary", ""))}</p><a class="button ghost" href="{u(f"/{lang}/about/")}">{esc(T(lang, "read_more"))}</a></section>' if about else ''}
"""
        page(f"/{lang}/", lang, CFG["site_name"], main, home_alt, cls="home")

        # ── HISTÓRIAS (índice): texto de content/pages/project + atalho {{stories}}
        main = f'<div class="wrap wide block page-project"><h1 class="sr-only">{esc(T(lang, "works"))}</h1><div class="prose">{SHORT[lang]['stories']}</div></div>'
        page(f"/{lang}/works/", lang, T(lang, "works"), main, {l: f"/{l}/works/" for l in LANGS})

        # ── OBRAS e CAPÍTULOS
        for w in works:
            chs = w["chapters"][lang]
            alt_w = {l: f"/{l}/works/{w['slug']}/" for l in LANGS if w["chapters"][l]}
            divider = w["meta"].get("divider")
            kind = w["meta"].get("kind", "prose")
            oneshot = w["meta"].get("oneshot")
            if chs and not oneshot and not tr(w["meta"].get("external"), lang):
                rows = "".join(
                    f'<li><a href="{u(c["url"])}"><span class="n">{esc(c["num"])}</span><span class="t">{esc(c["title"])}</span>'
                    f'<time>{esc(fmt_date(lang, c["fm"].get("date", "")))}</time></a></li>' for c in chs)
                cover = wcover(w, lang)
                main = f"""<div class="wrap block work-head">
{f'<img class="cover" src="{asset(cover)}" alt="">' if cover else ''}
<div><h1>{esc(wtitle(w, lang))}</h1><p>{esc(tr(w['meta'].get('blurb'), lang))}</p>
<div class="hero-actions"><a class="button" href="{u(chs[0]['url'])}">{esc(T(lang, 'first_chapter'))}</a>
<a class="button ghost" href="{u(chs[-1]['url'])}">{esc(TK(lang, 'last_chapter', kind))}</a></div></div></div>
<section class="wrap block"><h2>{esc(TK(lang, 'chapters', kind))}</h2><ol class="chapter-list">{rows}</ol></section>"""
                page(f"/{lang}/works/{w['slug']}/", lang, wtitle(w, lang), main, alt_w, desc=tr(w["meta"].get("blurb"), lang), image=cover)

            for i, (c, hid) in enumerate([(x, False) for x in chs] + [(x, True) for x in w["hidden"][lang]]):
                fm = c["fm"]
                prev, nxt = (chs[i - 1] if i else None), (chs[i + 1] if i + 1 < len(chs) else None)
                if oneshot or hid:
                    prev = nxt = None
                logo = wlogo(w, lang)
                head = (f'<img class="title-image" src="{asset(logo)}" alt="{esc(wtitle(w, lang))}">' if logo else "")
                head += f'<h1 class="{"sr-only" if oneshot and logo else "chapter-title"}">{esc(c["title"] if not oneshot else wtitle(w, lang))}</h1>'
                if not oneshot and logo:
                    head = f'<a href="{u(f"/{lang}/works/{w["slug"]}/")}">{head.split("<h1")[0]}</a><h1 class="chapter-title">{esc(c["title"])}</h1>'
                if fm.get("date") and not oneshot:
                    head += f'<p class="chapter-date"><time datetime="{esc(fm["date"])}">{esc(fmt_date(lang, fm["date"]))}</time></p>'
                mid = None if (oneshot or hid) else (f"/{lang}/works/{w['slug']}/", TK(lang, "back_work", kind))
                nav = pager(lang, prev, nxt, mid) if (prev or nxt or mid) else ""
                note = make_md(lang, divider)(c["body"]) if c["body"].strip() else ""
                if kind == "comic":
                    pics = list(fm.get("pages", []) or [])
                    if fm.get("pages_glob"):
                        pics += [str(p.relative_to(STATIC)) for p in sorted(STATIC.glob(fm["pages_glob"]), key=lambda p: natural(p.name))]
                    imgs = "".join(f'<img src="{asset(p)}" alt="{esc(c["title"])} {n}" loading="lazy">' for n, p in enumerate(pics, 1))
                    body = f'<div class="comic">{imgs}</div>'
                    body += f'<div class="author-note prose">{note}</div>' if note else ""
                    inner = f'<div class="reader-box">{draft_banner(lang, c)}{head}{nav}{body}{nav}</div>'
                elif fm.get("youtube") or kind == "video":
                    vid = fm.get("youtube", "")
                    player = f'<div class="video-wrapper"><iframe src="https://www.youtube.com/embed/{esc(vid)}" allowfullscreen title="{esc(c["title"])}"></iframe></div>'
                    def side(ch, d):
                        if not ch:
                            return f'<span class="side-btn {d} ghost"></span>'
                        lab = f'{T(lang, d)}: {ch["title"]}'
                        return f'<a class="side-btn {d}" rel="{d}" href="{u(ch["url"])}" title="{esc(lab)}" aria-label="{esc(lab)}">{arrow(d)}</a>'
                    body = f'<div class="player-row">{side(prev, "prev")}{player}{side(nxt, "next")}</div>' if (prev or nxt) else player
                    body += f'<div class="prose">{note}</div>' if note else ""
                    nav_below = pager(lang, None, None, mid) if mid else ""
                    inner = f'<div class="reader-box paper">{draft_banner(lang, c)}{head}{body}{nav_below}</div>'
                else:
                    inner = f'<div class="reader-box paper">{draft_banner(lang, c)}{head}<hr class="thin"><div class="prose story{" font-times" if w["meta"].get("reading_font") == "times" else ""}">{note}</div>{nav}</div>'
                inner += f'<div class="reader-box paper slim">{comments(lang, f"works/{w["slug"]}/{c["slug"]}", c["title"], fm)}</div>'
                alt_c = {l: next((x["url"] for x in w["chapters"][l] if x["slug"] == c["slug"]), None) for l in LANGS}
                page(c["url"], lang, wtitle(w, lang) if oneshot else f'{wtitle(w, lang)} — {c["title"]}',
                     inner, alt_c, cls=f"reader reader-{kind}", desc=fm.get("summary", ""), image=wcover(w, lang), noindex=hid)

        # ── NOTÍCIAS
        if news[lang]:
            rows = ""
            for k, n in enumerate(news[lang]):
                fm = n["fm"]
                thumb = fm.get("thumb") or fm.get("image")
                tags = "".join(f'<span class="tag">{esc(t)}</span>' for t in fm.get("tags", []) or [])
                text = fm.get("summary") or excerpt(n["body"])
                hay = " ".join([n["title"], " ".join(fm.get("tags", []) or []), fmt_date(lang, fm.get("date", "")), plain(n["body"])[:1500]])
                rows += (f'<article class="news-item"{" hidden" if k >= 10 else ""} data-search="{esc(hay)}"><time>{esc(fmt_date(lang, fm.get("date", "")))}</time>'
                         f'<h2>{esc(n["title"])}</h2><div class="news-body">'
                         + (f'<a class="news-thumb" href="{u(n["url"])}" tabindex="-1" aria-hidden="true"><img src="{asset(thumb)}" alt="" loading="lazy"></a>' if thumb else "")
                         + f'<div class="news-text">{f"<div class=chips>{tags}</div>" if tags else ""}<p>{esc(text)} <a class="more" href="{u(n["url"])}">{esc(T(lang, "more"))}</a></p></div></div></article>')
            tools = (f'<div class="news-tools"><input type="search" class="news-search" placeholder="{esc(T(lang, "news_search_ph"))}" aria-label="{esc(T(lang, "news_search_ph"))}" autocomplete="off"></div>')
            pag = (f'<nav class="pagination" aria-label="{esc(T(lang, "news"))}" data-prev="{esc(T(lang, "page_prev"))}" data-next="{esc(T(lang, "page_next"))}" data-per="10"></nav>')
            main = (f'<div class="wrap block news-wrap"><h1>{esc(T(lang, "news"))}</h1>{tools}<div class="news-list">{rows}</div>'
                    f'<p class="news-none" hidden>{esc(T(lang, "news_none"))}</p>{pag}'
                    '<noscript><style>.news-item[hidden]{display:block}</style></noscript></div>')
            page(f"/{lang}/news/", lang, T(lang, "news"), main, {l: f"/{l}/news/" for l in LANGS if news[l]})
            for i, n in enumerate(news[lang]):
                tags = "".join(f'<span class="tag">{esc(t)}</span>' for t in n["fm"].get("tags", []) or [])
                img = f'<figure class="lead"><img src="{asset(n["fm"]["image"])}" alt=""></figure>' if n["fm"].get("image") else ""
                prev, nxt = (news[lang][i + 1] if i + 1 < len(news[lang]) else None), (news[lang][i - 1] if i else None)
                bt, bb = n["fm"].get("backdrop_top"), n["fm"].get("backdrop_bottom")
                stk = n["fm"].get("stickers")
                # Pedido do autor (16/10/2026): comentários em caixa PRÓPRIA, separada da caixa da notícia, como nos capítulos
                # (reader-box paper slim). Sem comentários (comments: false / site sem chaves) não sobra caixa vazia.
                cm = comments(lang, f"news/{n['slug']}", n['title'], n['fm'])
                cbox = f'<div class="reader-box paper slim">{cm}</div>' if cm else ""
                if stk:   # notícia "colagem": figurinhas espalhadas pela folha + papel amassado por cima (stickers: "arquivo | l3 t2 w26 a-4"; overlay: imagem do papel)
                    sh = ""
                    for line in stk:
                        f_, _, spec = str(line).partition("|")
                        css = []
                        for tk in spec.split():
                            m_ = re.fullmatch(r"(l|r|t|b|w|a)(-?[\d.]+)", tk)
                            if m_:
                                k_, v_ = m_.groups()
                                css.append({"l": "left", "r": "right", "t": "top", "b": "bottom", "w": "width"}[k_] + f":{v_}%" if k_ != "a" else f"--a:{v_}deg")
                        sh += f'<img class="news-stk" src="{asset(f_.strip())}" alt="" style="{";".join(css)}" aria-hidden="true">'
                    ov = n["fm"].get("overlay")
                    paper = f'<div class="news-paper" style="background-image:url({asset(ov)})" aria-hidden="true"></div>' if ov else ""
                    main = f"""<div class="news-box"><article class="news-special news-collage">{draft_banner(lang, n)}<div class="news-hero">{sh}{paper}<div class="news-sp top"></div><div class="news-hero-in"><time>{esc(fmt_date(lang, n["fm"].get("date", "")))}</time><h1>{esc(n['title'])}</h1>{tags}
<div class="prose">{md(n['body'])}</div></div><div class="news-sp bottom"></div></div><div class="news-after">{related_html(lang, n['fm'])}{pager(lang, prev, nxt, (f"/{lang}/news/", T(lang, "all_news")))}</div></article></div>{cbox}"""
                elif bt or bb:   # notícia com design especial: imagens de fundo no topo e no pé da folha (backdrop_top / backdrop_bottom no cabeçalho)
                    bd = "".join(f'<div class="news-bd {pos}" style="background-image:url({asset(src)})" aria-hidden="true"></div>' for pos, src in (("top", bt), ("bottom", bb)) if src)
                    main = f"""<div class="news-box"><article class="news-special">{draft_banner(lang, n)}<div class="news-hero">{bd}<div class="news-sp top"></div><div class="news-hero-in"><time>{esc(fmt_date(lang, n["fm"].get("date", "")))}</time><h1>{esc(n['title'])}</h1>{tags}
<div class="prose">{md(n['body'])}</div></div><div class="news-sp bottom"></div></div><div class="news-after">{related_html(lang, n['fm'])}{pager(lang, prev, nxt, (f"/{lang}/news/", T(lang, "all_news")))}</div></article></div>{cbox}"""
                else:
                    main = f"""<div class="news-box"><article class="wrap narrow block">{draft_banner(lang, n)}<time>{esc(fmt_date(lang, n["fm"].get("date", "")))}</time><h1>{esc(n['title'])}</h1>{tags}{img}
<div class="prose">{md(n['body'])}</div>{related_html(lang, n['fm'])}{pager(lang, prev, nxt, (f"/{lang}/news/", T(lang, "all_news")))}</article></div>{cbox}"""
                page(n["url"], lang, n["title"], main, alt_for("news", n["slug"]), cls="news-page", desc=n["fm"].get("summary", ""), image=n["fm"].get("image", ""))

        # ── UNIVERSO
        if universe[lang]:
            groups = {}
            for it in universe[lang]:
                groups.setdefault(it["fm"].get("category") or "—", []).append(it)
            body = "".join(f'<section><h2>{esc(cat)}</h2><ul class="wiki-list">' + "".join(
                f'<li><a href="{u(i["url"])}"><strong>{esc(i["title"])}</strong><span>{esc(i["fm"].get("summary", ""))}</span></a></li>' for i in its)
                + "</ul></section>" for cat, its in groups.items())
            page(f"/{lang}/universe/", lang, T(lang, "universe"), f'<div class="wrap block"><h1>{esc(T(lang, "universe"))}</h1>{body}</div>', {l: f"/{l}/universe/" for l in LANGS if universe[l]})
            for it in universe[lang]:
                img = f'<figure class="lead"><img src="{asset(it["fm"]["image"])}" alt=""></figure>' if it["fm"].get("image") else ""
                main = f"""<article class="wrap narrow block">{draft_banner(lang, it)}<p class="crumb"><a href="{u(f'/{lang}/universe/')}">{esc(T(lang, 'universe'))}</a></p><h1>{esc(it['title'])}</h1>{img}
<div class="prose">{md(it['body'])}</div>{related_html(lang, it['fm'])}</article>"""
                page(it["url"], lang, it["title"], main, alt_for("universe", it["slug"]), desc=it["fm"].get("summary", ""), image=it["fm"].get("image", ""))

        # ── PERSONAGENS
        if chars[lang]:
            cards = "".join(
                f'<a class="char-card" href="{u(c["url"])}">' + (f'<img src="{asset(c["fm"]["image"])}" alt="" loading="lazy">' if c["fm"].get("image") else '<div class="nocover"></div>')
                + f'<strong>{esc(c["title"])}</strong><span>{esc(c["fm"].get("role", ""))}</span></a>' for c in chars[lang])
            page(f"/{lang}/characters/", lang, T(lang, "characters"), f'<div class="wrap block"><h1>{esc(T(lang, "characters"))}</h1><div class="chars">{cards}</div></div>', {l: f"/{l}/characters/" for l in LANGS if chars[l]})
            for c in chars[lang]:
                img = f'<img class="portrait" src="{asset(c["fm"]["image"])}" alt="{esc(c["title"])}">' if c["fm"].get("image") else ""
                appears = [w for s in (c["fm"].get("appears_in") or []) for w in works if w["slug"] == s]
                ap = (f'<p class="related"><strong>{esc(T(lang, "appears_in"))}:</strong> ' + " ".join(
                    f'<a href="{u(wlink(w, lang)[0] or "#") if not wlink(w, lang)[1] else esc(wlink(w, lang)[0])}">{esc(wtitle(w, lang))}</a>' for w in appears) + "</p>") if appears else ""
                main = f"""<article class="wrap block char-page">{draft_banner(lang, c)}{img}<div class="prose"><p class="crumb"><a href="{u(f'/{lang}/characters/')}">{esc(T(lang, 'characters'))}</a></p>
<h1>{esc(c['title'])}</h1><p class="role">{esc(c['fm'].get('role', ''))}</p>{md(c['body'])}{ap}{related_html(lang, c['fm'])}</div></article>"""
                page(c["url"], lang, c["title"], main, alt_for("characters", c["slug"]), desc=c["fm"].get("summary", ""), image=c["fm"].get("image", ""))

        # ── PÁGINAS AVULSAS (sobre, etc.) — 'Sobre' começa com o texto de content/pages/project
        def proj_body(lg):
            pj = next((q for q in pages[lg] if q["slug"] == "project"), None)
            return pj["body"] if pj else ""
        for p in pages[lang]:
            if p["fm"].get("route") is False:
                continue
            wide = p["fm"].get("layout") == "wide"
            main = f'<article class="wrap {"wide" if wide else "narrow"} block page-{p["slug"]}">{draft_banner(lang, p)}<h1{' class="sr-only"' if wide else ''}>{esc(p["title"])}</h1><div class="prose">{md((proj_body(lang) + chr(10)*2 if p["slug"] == "about" else "") + p["body"])}</div></article>'
            page(p["url"], lang, p["title"], main, alt_for("pages", p["slug"]), desc=p["fm"].get("summary", ""))

        # ── RSS
        if CFG.get("site_url"):
            site = CFG["site_url"].rstrip("/")
            its = ""
            for i in feed_items[:30]:
                try:
                    dt = format_datetime(datetime.datetime.strptime(i["date"][:10], "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc))
                except ValueError:
                    continue
                its += f'<item><title>{esc(i["title"])}</title><link>{site}{BASE}{i["url"]}</link><guid>{site}{BASE}{i["url"]}</guid><pubDate>{dt}</pubDate><description>{esc(i["text"])}</description></item>'
            write(f"/{lang}/feed.xml", f'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>{esc(CFG["site_name"])}</title><link>{site}{BASE}/{lang}/</link><description>{esc(T(lang, "hero_sub"))}</description><language>{lang}</language>{its}</channel></rss>')

    # ── raiz: escolhe o idioma; 404; redirecionamentos das URLs antigas
    first = LANGS[0]
    write("/", f"""<!DOCTYPE html><html><head><meta charset="UTF-8"><title>{esc(CFG['site_name'])}</title>
<meta http-equiv="refresh" content="0; url={u(f'/{first}/')}">
<script>var l=(localStorage.getItem('lang')||navigator.language||'').slice(0,2);var ok={json.dumps(LANGS)};
location.replace('{BASE}/'+(ok.indexOf(l)>-1?l:'{first}')+'/');</script></head>
<body><p>{' · '.join(f'<a href="{u(f"/{l}/")}">{esc(CFG["languages"][l]["name"])}</a>' for l in LANGS)}</p></body></html>""")
    for old, new in CFG.get("redirects", {}).items():
        if new == "/" or old == "index.html":
            continue
        write("/" + old, f'<!DOCTYPE html><meta charset="UTF-8"><link rel="canonical" href="{u(new)}"><meta http-equiv="refresh" content="0; url={u(new)}"><a href="{u(new)}">{u(new)}</a>')
    l0 = LANGS[0]
    write("/404.html", shell(l0, "404", f'<div class="wrap block"><h1>404</h1>' + "".join(f'<p lang="{l}">{esc(T(l, "not_found_sub"))} <a href="{u(f"/{l}/")}">{esc(T(l, "back_home"))}</a></p>' for l in LANGS) + "</div>",
                             {"_self": "/404.html"}, has={l: {"news": False, "universe": False, "characters": False, "extras": [], "about": False, "support": False} for l in LANGS}))
    print(f"✔ site gerado em {OUT}  ({sum(1 for _ in OUT.rglob('*.html'))} páginas)")


# ───────────────────────── scaffolding: `new` ─────────────────────────
TODAY = datetime.date.today().isoformat()
SKEL = {
    "news": "---\ntitle: {t}\ndate: " + TODAY + "\nsummary: Uma frase que aparece na listagem.\nimage:\ntags: []\n# draft: true   (tire o # para esconder do site publicado)\n---\n\nEscreva aqui.\n",
    "characters": "---\ntitle: {t}\nrole: Papel / espécie / ocupação\nsummary: Resumo curto\nimage:\nappears_in: []\nrelated: []\norder: 50\ndraft: true\n---\n\nEscreva aqui. Você pode linkar outras páginas assim: [[universe/outra-pagina]]\n",
    "universe": "---\ntitle: {t}\ncategory: Geral\nsummary: Resumo curto\nimage:\nrelated: []\norder: 50\ndraft: true\n---\n\nEscreva aqui.\n",
    "pages": "---\ntitle: {t}\nsummary:\n---\n\nEscreva aqui.\n",
    "prose": "---\ntitle:\ndate: " + TODAY + "\nsummary:\n---\n\nPrimeiro parágrafo.\n\nSegundo parágrafo.\n\n---\n\nNova cena (a linha acima vira o divisor de cenas).\n",
    "comic": "---\ntitle:\ndate: " + TODAY + "\nsummary:\npages_glob: comics/{w}/{c}/*.png\n---\n\nNota do autor (opcional).\n",
    "video": "---\ntitle:\ndate: " + TODAY + "\nyoutube: ID_DO_VIDEO\nsummary:\n---\n\nTexto opcional.\n",
}

def scaffold(args):
    kind, slug = args[0], args[1] if len(args) > 1 else None
    if not slug:
        sys.exit(__doc__)
    def put(folder, text, t=None, **k):
        folder.mkdir(parents=True, exist_ok=True)
        for l in LANGS:
            f = folder / f"{l}.md"
            if not f.exists():
                f.write_text(text.format(t=t or slug, **k), "utf-8")
                print("criado", f.relative_to(ROOT))
    if kind == "news":
        put(CONTENT / "news" / f"{TODAY}-{slug}", SKEL["news"])
    elif kind in ("character", "characters"):
        put(CONTENT / "characters" / slug, SKEL["characters"])
    elif kind == "universe":
        put(CONTENT / "universe" / slug, SKEL["universe"])
    elif kind == "page":
        put(CONTENT / "pages" / slug, SKEL["pages"])
    elif kind == "work":
        d = CONTENT / "works" / slug
        d.mkdir(parents=True, exist_ok=True)
        (d / "work.json").write_text(json.dumps({
            "kind": "prose", "universe": True, "oneshot": False,
            "title": {"en": slug, "pt": slug}, "blurb": {"en": "", "pt": ""},
            "cover": {"en": "covers/EN/", "pt": "covers/PT/"}, "logo": {"en": "", "pt": ""}}, indent=2, ensure_ascii=False), "utf-8")
        print("criado", (d / "work.json").relative_to(ROOT))
    elif kind == "chapter":
        d = CONTENT / "works" / slug
        if not (d / "work.json").exists():
            sys.exit(f"obra '{slug}' não existe (crie com: python build.py new work {slug})")
        n = len([p for p in d.iterdir() if p.is_dir()]) + 1
        k = json.loads((d / "work.json").read_text("utf-8")).get("kind", "prose")
        put(d / f"{n:02d}", SKEL[k], w=slug, c=f"{n:02d}")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    a = sys.argv[1:]
    if a and a[0] == "new":
        scaffold(a[1:])
    elif a and a[0] == "serve":
        DRAFTS, BASE = True, ""
        build()
        class NoCache(http.server.SimpleHTTPRequestHandler):
            def end_headers(self):                      # na prévia local, o navegador nunca guarda cópia antiga
                self.send_header("Cache-Control", "no-store")
                super().end_headers()
        handler = functools.partial(NoCache, directory=str(OUT))
        socketserver.TCPServer.allow_reuse_address = True
        with socketserver.TCPServer(("", 8000), handler) as srv:
            print("Prévia (com rascunhos) em http://localhost:8000  — Ctrl+C para sair")
            try:
                srv.serve_forever()
            except KeyboardInterrupt:
                pass
    else:
        build()
