// @vitest-environment happy-dom
//
// O script do leitor página a página (src/scripts/folheador/) num DOM simulado (happy-dom): o HTML que o servidor entrega (as 8 páginas,
// as setas no estado da página 1, as runas) ganha vida: uma página por vez, a do endereço (#p5), a runa certa brilhando (aria-current),
// as setas trocando de destino (e sumindo no fim do capítulo mais recente), o "voltar" do navegador (hashchange), o teclado, as páginas
// vizinhas baixando já, e a volta do login (#access_token=…) ignorada. Também varre o código: nada de innerHTML; só importa ./regras.
// As regras e o HTML do componente estão em tests/folheador.test.ts.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { iniciarFolheador } from "../src/scripts/folheador/bloco";

const PASTA = join(process.cwd(), "src/scripts/folheador");
const RUNAS = ["ᚣ", "弓", "♐︎", "ᚸ", "エ", "ꑭ", "⼒", "Ⱝ"];

/** O HTML do Folheador.astro (a mesma forma; tests/folheador.test.ts confere a do componente de verdade). */
function htmlDoFolheador(opcoes: { anterior?: string; proximo?: string } = {}): string {
  const prev = opcoes.anterior
    ? `<a class="side-btn prev fl-seta" href="${opcoes.anterior}" title="Capítulo anterior: Capítulo 1" aria-label="Capítulo anterior: Capítulo 1" data-rotulo-pagina="Página anterior" data-capitulo="${opcoes.anterior}" data-rotulo-capitulo="Capítulo anterior: Capítulo 1"></a>`
    : `<a class="side-btn prev fl-seta ghost" aria-hidden="true" data-rotulo-pagina="Página anterior"></a>`;
  const prox = `<a class="side-btn next fl-seta" href="#p2" title="Próxima página" aria-label="Próxima página" data-rotulo-pagina="Próxima página"${opcoes.proximo ? ` data-capitulo="${opcoes.proximo}" data-rotulo-capitulo="Próximo capítulo: Capítulo 3"` : ""}></a>`;
  const imgs = RUNAS.map((_r, i) => `<img src="/p/${i + 1}.png" alt="Capítulo 2 ${i + 1}" loading="lazy">`).join("");
  const runas = RUNAS.map((r, i) => `<a class="fl-runa" href="#p${i + 1}" title="Página ${i + 1} de 8" aria-label="Página ${i + 1} de 8"${i === 0 ? ' aria-current="page"' : ""}><span aria-hidden="true">${r}</span></a>`).join("");
  return `<div class="folheador" data-folheador data-total="8"><div class="fl-palco">${prev}<div class="comic">${imgs}</div>${prox}</div><nav class="fl-runas" aria-label="Páginas do capítulo">${runas}</nav><p class="sr-only" data-fl-status aria-live="polite"></p><noscript></noscript></div><textarea id="comentario"></textarea>`;
}

function montar(hash = "", opcoes: { anterior?: string; proximo?: string } = {}) {
  window.location.hash = hash;
  document.body.innerHTML = htmlDoFolheador(opcoes); // (só o teste monta HTML fixo; o código do site não)
  const el = document.querySelector<HTMLElement>("[data-folheador]")!;
  // o happy-dom não desenha: o leitor "está na tela"
  el.getBoundingClientRect = () => ({ top: 10, bottom: 600, left: 0, right: 800, width: 800, height: 590, x: 0, y: 10, toJSON: () => ({}) }) as DOMRect;
  const f = iniciarFolheador(el, window)!;
  const imgs = [...el.querySelectorAll<HTMLImageElement>(".comic > img")];
  const runas = [...el.querySelectorAll<HTMLAnchorElement>(".fl-runa")];
  const prev = el.querySelector<HTMLAnchorElement>(".fl-seta.prev")!;
  const next = el.querySelector<HTMLAnchorElement>(".fl-seta.next")!;
  const visiveis = () => imgs.map((img, i) => (img.hidden ? 0 : i + 1)).filter(Boolean);
  const brilhando = () => runas.map((r, i) => (r.getAttribute("aria-current") === "page" ? i + 1 : 0)).filter(Boolean);
  const aviso = () => el.querySelector("[data-fl-status]")?.textContent ?? "";
  return { el, f, imgs, runas, prev, next, visiveis, brilhando, aviso };
}
const irPara = async (hash: string) => {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  await new Promise((r) => setTimeout(r, 0));
};
const tecla = (key: string, extra: KeyboardEventInit = {}, alvo: EventTarget = document.body) => {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
  alvo.dispatchEvent(e);
  return e;
};

beforeEach(() => {
  document.body.innerHTML = "";
  window.location.hash = "";
});

describe("o leitor ganha vida", () => {
  test("sem fragmento: só a página 1 aparece, a runa 1 brilha, as vizinhas já baixam; nada é anunciado na chegada", () => {
    const { el, visiveis, brilhando, imgs, aviso, f } = montar();
    expect(visiveis()).toEqual([1]);
    expect(brilhando()).toEqual([1]);
    expect(imgs.map((i) => i.getAttribute("loading"))).toEqual(["eager", "eager", "lazy", "lazy", "lazy", "lazy", "lazy", "lazy"]);
    expect(el.dataset["ligado"]).toBe("");
    expect(el.dataset["pagina"]).toBe("1");
    expect(f.atual()).toBe(1);
    expect(aviso()).toBe("");
  });

  test("link direto para #p5: abre na página 5, runa 5 brilhando, setas para a 4 e a 6", () => {
    const { visiveis, brilhando, prev, next, imgs } = montar("#p5");
    expect(visiveis()).toEqual([5]);
    expect(brilhando()).toEqual([5]);
    expect([prev.getAttribute("href"), prev.getAttribute("aria-label"), next.getAttribute("href"), next.getAttribute("title")]).toEqual(["#p4", "Página anterior", "#p6", "Próxima página"]);
    expect(imgs.map((i) => i.getAttribute("loading")).filter((l) => l === "eager")).toHaveLength(3);
  });

  test("clicar numa runa (= o endereço muda para #p3) mostra a página 3 e anuncia \"Página 3 de 8\"; o voltar do navegador volta", async () => {
    const m = montar();
    await irPara("#p3");
    expect(m.visiveis()).toEqual([3]);
    expect(m.brilhando()).toEqual([3]);
    expect(m.aviso()).toBe("Página 3 de 8");
    await irPara("#p7");
    expect(m.visiveis()).toEqual([7]);
    // "voltar" até o endereço sem fragmento = página 1
    await irPara("");
    expect(m.visiveis()).toEqual([1]);
  });

  test("a volta do login (#access_token=…) e fragmentos que não são página não mexem em nada", async () => {
    const m = montar("#p4");
    await irPara("#access_token=abc&type=recovery");
    expect(m.visiveis()).toEqual([4]);
    await irPara("#p9");
    expect(m.visiveis()).toEqual([4]);
    const outro = montar("#access_token=abc");
    expect(outro.visiveis()).toEqual([1]);
  });

  test("primeiro capítulo e o mais recente: na página 1 a seta da esquerda some; na 8 a da direita some (e o foco vai para a runa)", async () => {
    const m = montar("#p7");
    expect(m.prev.classList.contains("ghost")).toBe(false);
    m.next.focus();
    await irPara("#p8");
    expect(m.next.hasAttribute("href")).toBe(false);
    expect(m.next.classList.contains("ghost")).toBe(true);
    expect(m.next.getAttribute("aria-hidden")).toBe("true");
    expect(m.next.hasAttribute("aria-label")).toBe(false);
    expect(document.activeElement).toBe(m.runas[7]);
    await irPara("#p1");
    expect(m.prev.classList.contains("ghost")).toBe(true);
    expect(m.prev.hasAttribute("href")).toBe(false);
  });

  test("capítulo do meio: na página 1 a seta da esquerda leva à 8ª do anterior; na 8 a da direita, à 1ª do próximo", async () => {
    const m = montar("", { anterior: "/pt/works/roadside/01/#p8", proximo: "/pt/works/roadside/03/#p1" });
    expect([m.prev.getAttribute("href"), m.prev.getAttribute("aria-label")]).toEqual(["/pt/works/roadside/01/#p8", "Capítulo anterior: Capítulo 1"]);
    await irPara("#p8");
    expect([m.next.getAttribute("href"), m.next.getAttribute("title")]).toEqual(["/pt/works/roadside/03/#p1", "Próximo capítulo: Capítulo 3"]);
    expect(m.next.classList.contains("ghost")).toBe(false);
  });

  test("teclado: → e ← viram a página (como as setas); com modificador ou digitando nos comentários, não", async () => {
    const m = montar("#p2");
    const e = tecla("ArrowRight");
    expect(e.defaultPrevented).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(window.location.hash).toBe("#p3");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(m.visiveis()).toEqual([3]);
    tecla("ArrowLeft");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(m.visiveis()).toEqual([2]);
    expect(tecla("ArrowRight", { altKey: true }).defaultPrevented).toBe(false);
    expect(tecla("ArrowRight", {}, document.getElementById("comentario")!).defaultPrevented).toBe(false);
    expect(window.location.hash).toBe("#p2");
  });

  test("teclado no fim do capítulo mais recente: → não faz nada (a seta sumiu)", () => {
    montar("#p8");
    expect(tecla("ArrowRight").defaultPrevented).toBe(false);
    expect(window.location.hash).toBe("#p8");
  });

  test("teclado com o leitor fora da tela (lendo os comentários): as setas são do navegador", () => {
    const m = montar("#p2");
    m.el.getBoundingClientRect = () => ({ top: -2000, bottom: -10 }) as DOMRect;
    expect(tecla("ArrowRight").defaultPrevented).toBe(false);
  });

  test("HTML incompleto: o script não liga (e não quebra a página)", () => {
    document.body.innerHTML = '<div data-folheador><div class="comic"><img src="/a.png"></div></div>';
    expect(iniciarFolheador(document.querySelector<HTMLElement>("[data-folheador]")!, window)).toBeNull();
  });
});

describe("o código do script", () => {
  const arquivos = readdirSync(PASTA).filter((n) => n.endsWith(".ts"));
  test.each(arquivos)("%s: nada de innerHTML/outerHTML/insertAdjacentHTML/document.write/eval", (nome) => {
    const codigo = readFileSync(join(PASTA, nome), "utf8").replace(/\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
  });
  test.each(arquivos)("%s: só importa os arquivos da própria pasta (nada de src/lib nem config.json)", (nome) => {
    const codigo = readFileSync(join(PASTA, nome), "utf8");
    const imports = [...codigo.matchAll(/^\s*import\s[^;]*?from\s+"([^"]+)"|^\s*import\s+"([^"]+)"/gm)].map((m) => m[1] ?? m[2]);
    for (const i of imports) expect(i, nome).toMatch(/^\.\/(regras|bloco)$/);
    if (nome === "regras.ts") expect(imports).toEqual([]);
  });
});
