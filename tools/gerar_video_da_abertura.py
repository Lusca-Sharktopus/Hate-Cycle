#!/usr/bin/env python3
"""Gera a versão 720p do vídeo da tela de abertura (T17e), servida pelo site Astro no lugar do original.

O que é: o vídeo da abertura (config.json → intro.video, hoje static/intro/logo.webm, VP9 1920x1080 com transparência, 1,1 MB) é a
primeira coisa que um visitante novo baixa. O Astro passa a servir uma versão de 1280x720 (~0,5 MB), com a MESMA duração, os MESMOS
151 quadros nos MESMOS instantes e a MESMA transparência. O original continua intacto em static/ (e publicado no mesmo endereço).

Este script é de DESENVOLVIMENTO (como tools/gerar_fontes_das_runas.py): o build do site e o GitHub Actions NÃO o rodam e não precisam
de ffmpeg. Quem o roda é você (ou a Claude) quando trocar o vídeo da abertura. Ele grava no projeto:
  src/assets/intro/logo-720p.webm   o vídeo leve
  src/assets/intro/logo-720p.json   a "ficha": o SHA-256 do original de que ele saiu, o do vídeo leve, tamanho, quadros, duração
O site só usa o vídeo leve se o SHA-256 do original de hoje for o da ficha (src/lib/videoDaAbertura.ts); se você trocar o vídeo e esquecer
de rodar este script, o build avisa e publica o ORIGINAL (nunca um vídeo velho), e `pnpm test` falha até você refazer.

Como rodar (precisa do ffmpeg com libvpx-vp9, que também DECODIFICA o canal de transparência; o decodificador "nativo" do ffmpeg não o lê):
  python3 tools/gerar_video_da_abertura.py              # refaz o vídeo leve e a ficha
  python3 tools/gerar_video_da_abertura.py --conferir   # só confere se a ficha ainda é a do vídeo de hoje (não precisa de ffmpeg)

Escolhas (medidas em 151 quadros; PSNR sobre o fundo roxo da abertura, contra o original reduzido a 1280x720):
  - 1280x720, filtro lanczos; o vídeo aparece com no máximo 1100 px CSS de largura (style.css: min(94vw, 1100px)), então 1280 px
    cobrem tela comum (1x) com folga; em tela retina (2x) o original (1920) já era ampliado 1,15x e o leve é ampliado 1,7x: as bordas
    macias do brilho ficam iguais e os traços finos do desenho em linha ficam só um pouco mais macios (imagens lado a lado na lição 11).
  - VP9 com transparência (yuva420p), CRF 34, sem "alt-ref" (exigência do VP9 com alfa), mesmos tempos de quadro (nada de recalcular fps).
"""
import argparse, hashlib, json, os, re, shutil, subprocess, sys, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA = os.path.join(RAIZ, "src", "assets", "intro")
VIDEO = os.path.join(PASTA, "logo-720p.webm")
FICHA = os.path.join(PASTA, "logo-720p.json")
LARGURA, ALTURA, CRF = 1280, 720, 34


def sha256(caminho: str) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def video_do_config() -> str:
    """O caminho do vídeo da abertura em config.json (só LÊ o arquivo; nunca o altera nem mostra as chaves dele)."""
    with open(os.path.join(RAIZ, "config.json"), encoding="utf8") as f:
        return json.load(f)["intro"]["video"]


def rodar(cmd: list[str]) -> str:
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"falhou: {' '.join(cmd)}\n{r.stderr[-1500:]}")
    return r.stdout


def sondar(caminho: str) -> dict:
    """Quadros, duração (do contêiner), tamanho, fps e alfa de um .webm, pelo ffprobe."""
    j = json.loads(rodar(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height,r_frame_rate,nb_read_frames:stream_tags=ALPHA_MODE:format=duration", "-of", "json", caminho]))
    s = j["streams"][0]
    return {
        "largura": s["width"], "altura": s["height"], "fps": s["r_frame_rate"], "quadros": int(s["nb_read_frames"]),
        "duracao_s": float(j["format"]["duration"]), "alfa": s.get("tags", {}).get("ALPHA_MODE") == "1",
    }


def conferir() -> int:
    origem = video_do_config()
    original = os.path.join(RAIZ, "static", origem)
    if not os.path.isfile(FICHA) or not os.path.isfile(VIDEO):
        print("ainda não existe o vídeo leve: rode `python3 tools/gerar_video_da_abertura.py`")
        return 1
    ficha = json.load(open(FICHA, encoding="utf8"))
    if ficha["origem"] != origem or ficha["sha256_do_original"] != sha256(original):
        print(f"o vídeo da abertura ({origem}) mudou desde que o leve foi feito: rode `python3 tools/gerar_video_da_abertura.py`")
        return 1
    if ficha["sha256_do_derivado"] != sha256(VIDEO):
        print("src/assets/intro/logo-720p.webm não é o da ficha: rode `python3 tools/gerar_video_da_abertura.py`")
        return 1
    print(f"confere: {origem} → logo-720p.webm ({os.path.getsize(VIDEO) / 1024:.0f} KB)")
    return 0


def gerar() -> int:
    for ferramenta in ("ffmpeg", "ffprobe"):
        if not shutil.which(ferramenta):
            sys.exit(f"{ferramenta} não está instalado (é só para gerar o vídeo; o build do site não precisa dele)")
    enc = rodar(["ffmpeg", "-hide_banner", "-encoders"]) + rodar(["ffmpeg", "-hide_banner", "-decoders"])
    if "libvpx-vp9" not in enc:
        sys.exit("este ffmpeg não tem o libvpx-vp9 (precisa dele para ler e escrever a transparência)")
    origem = video_do_config()
    original = os.path.join(RAIZ, "static", origem)
    if not os.path.isfile(original):
        sys.exit(f"não achei {original}")
    antes = sondar(original)
    if not antes["alfa"]:
        print("aviso: o original não declara transparência (ALPHA_MODE); o leve sai sem ela")
    os.makedirs(PASTA, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        saida = os.path.join(tmp, "logo-720p.webm")
        # `-c:v libvpx-vp9` ANTES do -i: o decodificador do libvpx devolve o canal de transparência (o nativo do ffmpeg o descarta).
        # passthrough: cada quadro leva o mesmo instante do original (sem duplicar nem descartar quadros).
        rodar(["ffmpeg", "-v", "error", "-y", "-c:v", "libvpx-vp9", "-i", original,
               "-vf", f"scale={LARGURA}:{ALTURA}:flags=lanczos", "-c:v", "libvpx-vp9",
               "-pix_fmt", "yuva420p" if antes["alfa"] else "yuv420p", "-auto-alt-ref", "0",
               "-b:v", "0", "-crf", str(CRF), "-row-mt", "1", "-cpu-used", "0", "-deadline", "good",
               "-an", "-fps_mode", "passthrough", saida])
        depois = sondar(saida)
        # o que NÃO pode mudar
        if depois["quadros"] != antes["quadros"] or depois["fps"] != antes["fps"] or abs(depois["duracao_s"] - antes["duracao_s"]) > 0.05 or depois["alfa"] != antes["alfa"]:
            sys.exit(f"o vídeo leve não bate com o original: {antes} × {depois}")
        shutil.copyfile(saida, VIDEO)
    ficha = {
        "origem": origem,
        "sha256_do_original": sha256(original),
        "sha256_do_derivado": sha256(VIDEO),
        "largura": depois["largura"], "altura": depois["altura"],
        "largura_do_original": antes["largura"], "altura_do_original": antes["altura"],
        "quadros": depois["quadros"], "fps": depois["fps"], "duracao_s": depois["duracao_s"], "alfa": depois["alfa"],
        "codec": "vp9", "crf": CRF,
        "bytes_do_original": os.path.getsize(original), "bytes_do_derivado": os.path.getsize(VIDEO),
        "gerado_com": re.sub(r"\s+Copyright.*", "", rodar(["ffmpeg", "-version"]).splitlines()[0]),
    }
    with open(FICHA, "w", encoding="utf8") as f:
        json.dump(ficha, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{origem}: {ficha['bytes_do_original'] / 1024:.0f} KB {antes['largura']}x{antes['altura']} → "
          f"logo-720p.webm: {ficha['bytes_do_derivado'] / 1024:.0f} KB {depois['largura']}x{depois['altura']}; "
          f"{depois['quadros']} quadros, {depois['duracao_s']:.3f} s, transparência {'sim' if depois['alfa'] else 'não'}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--conferir", action="store_true", help="só confere se a ficha é a do vídeo de hoje")
    a = ap.parse_args()
    sys.exit(conferir() if a.conferir else gerar())
