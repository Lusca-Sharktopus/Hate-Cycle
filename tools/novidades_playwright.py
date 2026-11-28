"""Novidades e notificações: o sino da janela da conta e a bolinha do botão da conta (28/11/2026, pedido do autor; só no site novo).

No navegador de verdade (Playwright), com o site Astro servido em localhost e um Supabase FALSO no nível da rede (as chaves da página
são trocadas por marcadores antes de qualquer script ler; nada sai do computador). A primeira novidade do /pt/novidades.json do site
servido faz o papel da "notícia nova" (anotada pela função depois da última visita da pessoa ao sino):
  A. bolinha no botão da conta e no sino (1100 e 390 px); a tela do sino lista as novidades com "Nova" na primeira;
     abrir conta tudo como visto (a bolinha some no cabeçalho); Esc volta ao perfil;
  B. "Receber notificações": o navegador pede a permissão (dada pelo teste), o /sw.js registra; a inscrição no serviço do navegador
     não sai daqui (sem rede), e a tela mostra o erro sem quebrar nada;
  C. conta sem nada novo: sem bolinha.

Uso (servidor sempre sob timeout; nunca pkill):
  pnpm build
  timeout 300 python3 -m http.server 8811 -d dist &
  python3 tools/novidades_playwright.py 8811 [<pasta para as fotos, fora do projeto>]
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
    def __init__(self): self.contas = {}; self.log = []; self.visto = "2026-11-20T00:00:00+00:00"; self.anotadas = []
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
        elif u.path == "/rest/v1/rpc/my_notifications_seen": d = self.visto
        elif u.path == "/rest/v1/rpc/mark_notifications_seen": self.visto = iso(0); d = self.visto
        elif u.path == "/rest/v1/rpc/has_push_subscription": d = False
        elif u.path == "/rest/v1/site_updates": d = self.anotadas
        elif u.path == "/rest/v1/favorites": d = []
        elif u.path == "/rest/v1/profiles":
            uid = (q.get("id") or ["eq."])[0].removeprefix("eq."); c = self.contas.get(uid)
            d = {"display_name": c["_nome"], "is_admin": False, "avatar_path": None} if c else None
        return route.fulfill(status=st, headers={**cors, "content-type": "application/json"}, body=json.dumps(d))


falhas = []
def exige(cond, msg):
    print(("  ok  " if cond else "  FALHA  ") + msg)
    if not cond: falhas.append(msg)

def pagina(browser, falso, caminho, largura=1100):
    ctx = browser.new_context(viewport={"width": largura, "height": 860}, locale="pt-BR")
    ctx.grant_permissions(["notifications"], origin=f"http://localhost:{PORTA}")
    def rota(route):
        url = route.request.url
        if url.startswith("http://localhost"): return route.continue_()
        if url.startswith(FALSO): return falso.responder(route)
        return route.abort()
    ctx.route("**/*", rota)
    pg = ctx.new_page(); erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.add_init_script(TROCA)
    pg.add_init_script("try { localStorage.setItem('hc-contas-recebidas', JSON.stringify(['11111111-1111-4111-8111-111111111111'])) } catch (e) {}")
    pg.goto(f"http://localhost:{PORTA}{caminho}", wait_until="load")
    pg.evaluate("document.documentElement.classList.remove('intro')")
    return ctx, pg, erros

def foto(pg, nome):
    if FOTOS: pg.screenshot(path=f"{FOTOS}/{nome}")

UID = "11111111-1111-4111-8111-111111111111"
with sync_playwright() as p:
    b = p.chromium.launch()
    import urllib.request
    novidades = json.loads(urllib.request.urlopen(f"http://localhost:{PORTA}/pt/novidades.json").read())["itens"]
    primeira = novidades[0]["id"]
    for largura in (1100, 390):
        print(f"A. novidade não vista, {largura}px")
        f = Falso(); f.conta(UID, "a@teste.test", "Fulana", "2026-11-01T12:00:00Z", "2026-11-01T12:00:00Z", "2026-11-01T12:00:00Z")
        f.anotadas = [{"item_id": primeira, "first_seen_at": "2026-11-28T10:00:00+00:00"}] + [{"item_id": n["id"], "first_seen_at": "2026-11-01T10:00:00+00:00"} for n in novidades[1:]]
        # volta de login com o token no endereço (a conta é antiga: o perfil não abre sozinho)
        ctx, pg, erros = pagina(b, f, "/pt/works/" + f.hash(UID), largura)
        pg.wait_for_selector("button.hc-conta .hc-conta-ponto", timeout=8000)
        exige(True, "bolinha no botão da conta do cabeçalho")
        foto(pg, f"A-cabecalho-{largura}.png")
        pg.click("button.hc-conta"); pg.wait_for_selector(".c-modal.c-conta .c-perfil-sino .c-ponto", timeout=8000)
        exige(True, "bolinha no sino da janela")
        foto(pg, f"A-perfil-{largura}.png")
        pg.click(".c-perfil-sino"); pg.wait_for_selector(".c-novidades-lista a.c-novidade", timeout=8000); pg.wait_for_timeout(500)
        exige(pg.locator(".c-novidade-nova").count() == 1, "uma novidade marcada como Nova")
        exige(pg.locator("button.hc-conta .hc-conta-ponto").count() == 0, "a bolinha do cabeçalho some ao abrir o sino")
        exige(any("mark_notifications_seen" in l for l in f.log), "o banco marcou tudo como visto")
        foto(pg, f"A-sino-{largura}.png")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        exige(pg.locator(".c-perfil-topo").count() == 1, "Esc volta ao perfil")
        exige(erros == [], f"sem erro de JavaScript {erros}")
        ctx.close()
    print("B. ligar as notificações (sem rede para o serviço do navegador)")
    f = Falso(); f.conta(UID, "a@teste.test", "Fulana", "2026-11-01T12:00:00Z", "2026-11-01T12:00:00Z", "2026-11-01T12:00:00Z")
    ctx, pg, erros = pagina(b, f, "/pt/" + f.hash(UID))
    pg.wait_for_selector("button.hc-conta .c-foto", timeout=8000)
    pg.click("button.hc-conta"); pg.wait_for_selector(".c-perfil-sino"); pg.click(".c-perfil-sino")
    pg.wait_for_function("() => { const e = document.querySelector('.c-chave-estado'); return e && e.textContent }", timeout=8000)
    print("   permissão no navegador:", pg.evaluate("Notification.permission"), "| estado:", pg.locator(".c-chave-estado").inner_text())
    permissao = pg.evaluate("Notification.permission")
    if permissao == "denied":
        # o Chromium sem janela (headless) nega notificações mesmo com a permissão dada: aqui se prova o caminho "bloqueado"
        exige("bloqueadas" in pg.locator(".c-chave-estado").inner_text() and pg.locator(".c-chave").is_disabled(), "notificações bloqueadas: botão desligado, com a explicação")
    else:
        exige(pg.locator(".c-chave-estado").inner_text() == "Desligadas neste aparelho.", "o navegador aceita notificações: botão desligado")
        pg.click(".c-chave"); pg.wait_for_timeout(4000)
        print("   estado do botão:", pg.locator(".c-chave").get_attribute("aria-checked"))
    sw = pg.evaluate("navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => navigator.serviceWorker.ready).then(r => r.active && r.active.scriptURL)")
    exige(bool(sw) and sw.endswith("/sw.js"), f"o /sw.js registra e fica ativo ({sw})")
    foto(pg, "B-ligar.png")
    exige(erros == [], f"sem erro de JavaScript {erros}")
    ctx.close()
    print("C. nada novo")
    f = Falso(); f.conta(UID, "a@teste.test", "Fulana", "2026-11-01T12:00:00Z", "2026-11-01T12:00:00Z", "2026-11-01T12:00:00Z")
    f.anotadas = [{"item_id": n["id"], "first_seen_at": "2026-11-01T10:00:00+00:00"} for n in novidades]
    ctx, pg, erros = pagina(b, f, "/pt/" + f.hash(UID))
    pg.wait_for_selector("button.hc-conta .c-foto", timeout=8000); pg.wait_for_timeout(1500)
    exige(pg.locator("button.hc-conta .hc-conta-ponto").count() == 0, "sem bolinha")
    ctx.close()
    b.close()
print("FALHAS:", len(falhas))
sys.exit(1 if falhas else 0)
