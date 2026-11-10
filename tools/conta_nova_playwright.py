"""Conta recém-criada → o perfil abre sozinho (10/11/2026, pedido do autor; só no site novo).

No navegador de verdade (Playwright), com o site Astro servido em localhost e um Supabase FALSO no nível da rede (as chaves da página
são trocadas por marcadores antes de qualquer script ler; nada sai do computador):
  A. voltou do Google com a conta nova, na home (1100 e 390 px): o perfil abre; na página seguinte não abre de novo;
  B. clicou no link de confirmação do e-mail (cadastro de 2 h atrás), num capítulo: o perfil abre;
  C. criou a conta por e-mail na caixa de comentários (projeto sem confirmação de e-mail), sem recarregar: o login fecha, o perfil abre;
  D. conta antiga entra por e-mail e senha na caixa: nada abre, e o botão do cabeçalho ganha a foto sem recarregar;
  E. conta antiga volta do Google: nada abre.

Uso (servidor sempre sob timeout; nunca pkill):
  pnpm build
  timeout 300 python3 -m http.server 8811 -d dist &
  python3 tools/conta_nova_playwright.py 8811 [<pasta para as fotos, fora do projeto>]

As regras ficam em src/scripts/conta/boasVindas.ts (testes: tests/conta-dom.test.ts).
"""
import base64, json, sys, time, urllib.parse, datetime
from playwright.sync_api import sync_playwright

PORTA = int(sys.argv[1]); FOTOS = sys.argv[2] if len(sys.argv) > 2 else None
FALSO = "https://supabase-falso.test"
TROCA = """(() => {
  try { sessionStorage.setItem('hc-intro', '1'); } catch (e) {}
  for (const nome of ['HC', 'HC_CONTA', 'HC_FAV']) {
    let v0;
    Object.defineProperty(window, nome, { configurable: true, get() { return v0; },
      set(v) { if (v && typeof v === 'object') { v.url = %s; v.key = '__CHAVE_FALSA__'; } v0 = v; } });
  }
})();""" % json.dumps(FALSO)

def b64(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
def iso(seg): return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=seg)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

class Falso:
    def __init__(self): self.contas = {}; self.log = []
    def conta(self, uid, email, nome, criada, confirmada, login):
        self.contas[uid] = {"id": uid, "aud": "authenticated", "role": "authenticated", "email": email, "email_confirmed_at": confirmada, "confirmed_at": confirmada,
                            "last_sign_in_at": login, "created_at": criada, "updated_at": login, "phone": "", "app_metadata": {"provider": "email", "providers": ["email"]},
                            "user_metadata": {"display_name": nome}, "identities": [], "is_anonymous": False, "_nome": nome, "_senha": "senha-123"}
        return self.contas[uid]
    def usuario(self, uid): return {k: v for k, v in self.contas[uid].items() if not k.startswith("_")}
    def sessao(self, uid):
        exp = int(time.time()) + 3600
        tok = f"{b64({'alg':'HS256','typ':'JWT'})}.{b64({'sub':uid,'role':'authenticated','aud':'authenticated','exp':exp})}.falsa"
        return {"access_token": tok, "token_type": "bearer", "expires_in": 3600, "expires_at": exp, "refresh_token": f"r-{uid}", "user": self.usuario(uid)}
    def hash(self, uid, tipo=None):
        s = self.sessao(uid); d = {"access_token": s["access_token"], "expires_at": s["expires_at"], "expires_in": 3600, "refresh_token": s["refresh_token"], "token_type": "bearer"}
        if tipo: d["type"] = tipo
        return "#" + urllib.parse.urlencode(d)
    def quem(self, req):
        p = req.headers.get("authorization", "").removeprefix("Bearer ").split(".")
        try: return json.loads(base64.urlsafe_b64decode(p[1] + "==")).get("sub") if len(p) == 3 else None
        except Exception: return None
    def responder(self, route):
        req = route.request; u = urllib.parse.urlsplit(req.url); q = urllib.parse.parse_qs(u.query)
        cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS"}
        if req.method == "OPTIONS": return route.fulfill(status=204, headers=cors)
        corpo = json.loads(req.post_data) if req.post_data else {}
        self.log.append(f"{req.method} {u.path}")
        st, d = 200, []
        if u.path == "/auth/v1/user": st, d = 200, self.usuario(self.quem(req))
        elif u.path == "/auth/v1/signup":   # projeto SEM confirmação de e-mail: o cadastro já devolve a sessão
            c = self.conta("u-cadastro", corpo["email"], corpo["data"]["display_name"], iso(0), iso(0), iso(0)); d = self.sessao(c["id"])
        elif u.path == "/auth/v1/token":
            if q.get("grant_type") == ["password"]:
                c = next(c for c in self.contas.values() if c["email"] == corpo["email"]); c["last_sign_in_at"] = iso(0); d = self.sessao(c["id"])
            else: d = self.sessao(corpo["refresh_token"].removeprefix("r-"))
        elif u.path == "/rest/v1/profiles":
            uid = (q.get("id") or ["eq."])[0].removeprefix("eq."); c = self.contas.get(uid)
            d = {"display_name": c["_nome"], "is_admin": False, "avatar_path": None} if c else None
        return route.fulfill(status=st, headers={**cors, "content-type": "application/json"}, body=json.dumps(d))

falhas = []
def exige(cond, msg):
    print(("  ok  " if cond else "  FALHA  ") + msg)
    if not cond: falhas.append(msg)

def pagina(browser, falso, caminho, largura=1100, hash_=""):
    ctx = browser.new_context(viewport={"width": largura, "height": 800}, locale="pt-BR")
    def rota(route):
        url = route.request.url
        if url.startswith("http://localhost"): return route.continue_()
        if url.startswith(FALSO): return falso.responder(route)
        return route.abort()
    ctx.route("**/*", rota)
    pg = ctx.new_page(); erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.add_init_script(TROCA)
    pg.goto(f"http://localhost:{PORTA}{caminho}{hash_}", wait_until="load")
    pg.evaluate("document.documentElement.classList.remove('intro')")
    return ctx, pg, erros

def foto(pg, nome):
    if FOTOS: pg.screenshot(path=f"{FOTOS}/{nome}")

aberto = lambda pg: pg.locator(".c-modal.c-conta").count()

with sync_playwright() as p:
    b = p.chromium.launch()
    # A. voltou do Google com a conta nova, na home (sem caixa de comentários)
    for largura in (1100, 390):
        print(f"A. conta nova pelo Google, home, {largura}px")
        f = Falso(); f.conta("11111111-1111-4111-8111-111111111111", "nova@teste.test", "Fulana de Tal", iso(-3), iso(-3), iso(-2))
        ctx, pg, erros = pagina(b, f, "/pt/", largura, f.hash("11111111-1111-4111-8111-111111111111"))
        pg.wait_for_selector(".c-modal.c-conta", timeout=8000)
        pg.wait_for_timeout(600)
        exige(aberto(pg) == 1, "o perfil abriu sozinho")
        exige("Fulana de Tal" in pg.locator(".c-modal.c-conta").inner_text(), "com o nome da conta")
        exige(pg.locator("button.hc-conta .c-foto").count() == 1, "o botão do cabeçalho mostra a runa/foto")
        foto(pg, f"A-conta-nova-{largura}.png")
        pg.goto(f"http://localhost:{PORTA}/pt/works/", wait_until="load"); pg.wait_for_selector("button.hc-conta .c-foto"); pg.wait_for_timeout(1200)
        exige(aberto(pg) == 0, "na página seguinte NÃO abre de novo")
        pg.click("button.hc-conta"); pg.wait_for_selector(".c-modal.c-conta")
        exige(aberto(pg) == 1, "o clique no botão continua abrindo")
        exige(erros == [], f"sem erro de JavaScript {erros}")
        ctx.close()
    # B. link de confirmação do e-mail (cadastro há 2 h, clique agora), num capítulo com comentários
    print("B. link de confirmação do e-mail, capítulo")
    f = Falso(); f.conta("22222222-2222-4222-8222-222222222222", "email@teste.test", "Beltrano", iso(-7200), iso(-2), iso(-2))
    ctx, pg, erros = pagina(b, f, "/pt/works/firestriker/01/", 1100, f.hash("22222222-2222-4222-8222-222222222222", "signup"))
    pg.wait_for_selector(".c-modal.c-conta", timeout=8000); pg.wait_for_timeout(500)
    exige(aberto(pg) == 1 and pg.locator(".c-modal").count() == 1, "o perfil abriu (só ele)")
    exige("c-modal-open" in pg.evaluate("document.documentElement.className"), "a rolagem da página fica travada atrás")
    foto(pg, f"B-link-do-email.png")
    exige(erros == [], f"sem erro de JavaScript {erros}"); ctx.close()
    # C. cadastro por e-mail sem confirmação, pela caixa de comentários (sem recarregar a página)
    print("C. cadastro na caixa de comentários (projeto sem confirmação de e-mail)")
    f = Falso()
    ctx, pg, erros = pagina(b, f, "/pt/works/firestriker/01/")
    pg.wait_for_selector(".c-bar textarea"); pg.click(".c-bar textarea"); pg.wait_for_selector(".c-modal .c-tabs")
    pg.click(".c-modal .c-tabs button:nth-child(2)")
    pg.fill(".c-modal input[name=username]", "Ciclana"); pg.fill(".c-modal input[name=email]", "c@teste.test"); pg.fill(".c-modal input[name=password]", "senha-123")
    pg.click(".c-modal form button[type=submit]")
    pg.wait_for_selector(".c-modal.c-conta", timeout=8000); pg.wait_for_timeout(600)
    exige(aberto(pg) == 1 and pg.locator(".c-modal").count() == 1, "a janela de login fechou e o perfil abriu")
    exige("Ciclana" in pg.locator(".c-modal.c-conta").inner_text(), "com o nome escolhido no cadastro")
    exige("c-modal-open" in pg.evaluate("document.documentElement.className"), "a rolagem da página fica travada atrás")
    exige(pg.evaluate("document.activeElement && document.activeElement.closest('.c-modal.c-conta') !== null") or pg.evaluate("document.activeElement === document.body"), "o foco não fugiu para trás da janela")
    foto(pg, f"C-cadastro-na-caixa.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    exige(aberto(pg) == 0 and pg.locator(".c-modal").count() == 0, "Esc fecha; a janela de login NÃO reabre")
    exige(pg.locator(".c-who .c-me").inner_text() == "Ciclana", "a caixa mostra 'Conectado como Ciclana'")
    exige(erros == [], f"sem erro de JavaScript {erros}"); ctx.close()
    # D. conta antiga entrando com e-mail e senha pela caixa: nada abre; o botão do cabeçalho ganha a foto sem recarregar
    print("D. conta antiga entra pela caixa de comentários")
    f = Falso(); f.conta("33333333-3333-4333-8333-333333333333", "antiga@teste.test", "Veterana", "2026-11-05T12:00:00Z", "2026-11-05T12:00:00Z", "2026-11-06T12:00:00Z")
    ctx, pg, erros = pagina(b, f, "/pt/works/firestriker/01/")
    pg.wait_for_selector(".c-bar textarea"); pg.click(".c-bar textarea"); pg.wait_for_selector(".c-modal .c-tabs")
    pg.fill(".c-modal input[name=email]", "antiga@teste.test"); pg.fill(".c-modal input[name=password]", "senha-123"); pg.click(".c-modal form button[type=submit]")
    pg.wait_for_selector("button.hc-conta .c-foto", timeout=8000); pg.wait_for_timeout(1500)
    exige(pg.locator(".c-modal").count() == 0, "nenhuma janela abre")
    exige(pg.locator("button.hc-conta .c-foto").count() == 1, "o botão do cabeçalho ganhou a runa/foto sem recarregar")
    exige(erros == [], f"sem erro de JavaScript {erros}"); ctx.close()
    # E. conta antiga voltando do Google: nada abre
    print("E. conta antiga pelo Google")
    f = Falso(); f.conta("44444444-4444-4444-8444-444444444444", "g@teste.test", "Antiga", "2026-11-05T12:00:00Z", "2026-11-05T12:00:00Z", iso(-2))
    ctx, pg, erros = pagina(b, f, "/pt/", 1100, f.hash("44444444-4444-4444-8444-444444444444"))
    pg.wait_for_selector("button.hc-conta .c-foto", timeout=8000); pg.wait_for_timeout(1500)
    exige(pg.locator(".c-modal").count() == 0, "nenhuma janela abre")
    exige(erros == [], f"sem erro de JavaScript {erros}"); ctx.close()
    b.close()
print("FALHAS:", len(falhas))
sys.exit(1 if falhas else 0)
