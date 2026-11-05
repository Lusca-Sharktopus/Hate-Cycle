#!/usr/bin/env python3
"""Screenshot de uma página do site gerado, pronto para comparar.

Uso:
  python3 shot.py /en/works/firestriker/ saida.png
  python3 shot.py /pt/ saida.png --width 390 --full
  python3 shot.py /en/works/all-in-a-nights-work/01/ saida.png --selector .story --offset 0 --height 2400
  python3 shot.py /en/news/x/ saida.png --supabase        # simula comentários com dois comentários de exemplo

Requer que `public/` esteja servido (ex.: `timeout 300 python3 -m http.server 8790 -d public &`).
Bloqueia o Google Fonts (o sandbox não alcança), pula a tela de abertura e, com --supabase,
injeta um window.supabase falso para a seção de comentários renderizar sem rede.
"""
import argparse, sys
from playwright.sync_api import sync_playwright

FAKE_SUPABASE = r"""
(() => {
  const rows = [
    {id: 1, page_id: 'x', parent_id: null, body: 'Primeiro comentário de teste.', created_at: new Date(Date.now()-864e5).toISOString(), edited_at: null, user_id: 'u1', profiles: {display_name: 'leitor', is_admin: false}},
    {id: 2, page_id: 'x', parent_id: 1, body: 'Resposta, editada.', created_at: new Date().toISOString(), edited_at: new Date().toISOString(), user_id: 'u2', profiles: {display_name: 'outra', is_admin: true}},
  ];
  const q = { select(){return q}, eq(){return q}, order(){return q}, limit(){return q}, single(){return Promise.resolve({data:null,error:null})},
              insert(){return Promise.resolve({error:null})}, update(){return q}, delete(){return q},
              then(r){ return Promise.resolve({data: rows, error: null}).then(r) } };
  window.supabase = { createClient: () => ({
    from: () => q,
    auth: { getSession: async () => ({data:{session:null}}), onAuthStateChange: () => ({data:{subscription:{unsubscribe(){}}}}),
            signInWithPassword: async () => ({error:null}), signUp: async () => ({error:null}), signInWithOAuth: async () => ({error:null}), signOut: async () => ({}) },
  }) };
})();
"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path"); ap.add_argument("out")
    ap.add_argument("--port", type=int, default=8790)
    ap.add_argument("--width", type=int, default=1100)
    ap.add_argument("--height", type=int, default=0, help="altura do recorte (0 = viewport ou página inteira com --full)")
    ap.add_argument("--full", action="store_true", help="página inteira")
    ap.add_argument("--selector", help="recorta a partir do topo deste elemento")
    ap.add_argument("--offset", type=int, default=-80, help="deslocamento vertical a partir do --selector")
    ap.add_argument("--supabase", action="store_true")
    a = ap.parse_args()
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": a.width, "height": 900})
        pg.route("**/fonts.g*/**", lambda r: r.abort())
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.abort())
        pg.add_init_script("try{sessionStorage.setItem('hc-intro','1')}catch(e){}")
        if a.supabase:
            pg.add_init_script(FAKE_SUPABASE)
        pg.goto(f"http://localhost:{a.port}{a.path}", wait_until="load")
        pg.evaluate("document.documentElement.classList.remove('intro')")
        pg.wait_for_timeout(700)
        if a.selector:
            el = pg.query_selector(a.selector)
            if not el:
                sys.exit(f"seletor não encontrado: {a.selector}")
            bb = el.bounding_box()
            h = a.height or 1600
            pg.screenshot(path=a.out, full_page=True, clip={"x": 0, "y": max(0, bb["y"] + a.offset), "width": a.width, "height": h})
        elif a.height:
            pg.screenshot(path=a.out, full_page=True, clip={"x": 0, "y": 0, "width": a.width, "height": a.height})
        else:
            pg.screenshot(path=a.out, full_page=a.full)
        b.close()
    print(a.out)

if __name__ == "__main__":
    main()
