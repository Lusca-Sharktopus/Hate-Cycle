// @vitest-environment happy-dom
//
// O script do bloco "estou lendo em ordem…" (src/scripts/ordem/) num DOM simulado (happy-dom): o HTML que o servidor entrega
// (as duas ordens, a outra `hidden`, o seletor `disabled`) ganha vida: ordem padrão, ordem lembrada, valor estranho guardado,
// troca pelo seletor, escolha guardada, armazenamento que falha (janela privada). Também varre o código procurando as palavras
// proibidas (nada de HTML montado a partir de dados) e os imports (só ./regras e ./bloco; nada de src/lib nem config.json).
// As regras de quem vem antes/depois e o desenho do componente estão em tests/ordem.test.ts.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { iniciarBloco, iniciarBlocos } from "../src/scripts/ordem/bloco";
import { CHAVE_DA_ORDEM, ORDEM_PADRAO, armazenamentoDoNavegador, guardarOrdem, lerOrdemGuardada, ordemValida, type Armazenamento } from "../src/scripts/ordem/regras";

// (em happy-dom o import.meta.url não é file://; o vitest roda sempre na raiz do projeto)
const PASTA = join(process.cwd(), "src/scripts/ordem");

const BLOCO = `<section class="reader-box paper story-order" data-story-order data-ordem="chrono">
<div class="so-top"><p class="so-title" id="t">estou lendo em ordem</p><div class="so-pick"><span class="so-valor" aria-hidden="true">Cronológica</span><select class="so-select" aria-labelledby="t" disabled><option value="chrono" selected>Cronológica</option><option value="release">Lançamento</option></select></div></div>
<div class="so-order" data-ordem="chrono"><a class="so-side prev" href="/a/">A</a></div>
<div class="so-order" data-ordem="release" hidden><a class="so-side next" href="/b/">B</a></div></section>`;

class Falso implements Armazenamento {
  dados = new Map<string, string>();
  getItem(c: string) {
    return this.dados.get(c) ?? null;
  }
  setItem(c: string, v: string) {
    this.dados.set(c, v);
  }
}
const quebrado: Armazenamento = {
  getItem() {
    throw new Error("sem acesso");
  },
  setItem() {
    throw new Error("cheio");
  },
};

function montar() {
  document.body.innerHTML = BLOCO; // (só o teste monta HTML fixo; o código do site não)
  const bloco = document.querySelector<HTMLElement>("[data-story-order]")!;
  const seletor = bloco.querySelector<HTMLSelectElement>("select")!;
  const lista = (o: string) => bloco.querySelector<HTMLElement>(`.so-order[data-ordem="${o}"]`)!;
  const nome = bloco.querySelector<HTMLElement>(".so-valor")!;
  const trocar = (valor: string) => {
    seletor.value = valor;
    seletor.dispatchEvent(new Event("change", { bubbles: true }));
  };
  return { bloco, seletor, lista, nome, trocar };
}
beforeEach(() => {
  document.body.innerHTML = "";
});

describe("o bloco ganha vida", () => {
  test("sem nada guardado: Cronológica, seletor ligado, a outra lista escondida", () => {
    const { bloco, seletor, lista, nome } = montar();
    expect(seletor.disabled).toBe(true); // antes do script
    expect(iniciarBloco(bloco, new Falso())).toBe("chrono");
    expect(seletor.disabled).toBe(false);
    expect(lista("chrono").hidden).toBe(false);
    expect(lista("release").hidden).toBe(true);
    expect(nome.textContent).toBe("Cronológica");
    expect(bloco.dataset["ordem"]).toBe("chrono");
  });

  test("com Lançamento guardado: abre em Lançamento", () => {
    const { bloco, seletor, lista, nome } = montar();
    const mem = new Falso();
    mem.setItem(CHAVE_DA_ORDEM, "release");
    expect(iniciarBloco(bloco, mem)).toBe("release");
    expect(seletor.value).toBe("release");
    expect(lista("chrono").hidden).toBe(true);
    expect(lista("release").hidden).toBe(false);
    expect(nome.textContent).toBe("Lançamento");
  });

  test.each(["", "outra", "<b>x</b>", "CHRONO"])("valor estranho guardado (%j) é ignorado: abre na padrão", (v) => {
    const { bloco, lista } = montar();
    const mem = new Falso();
    mem.setItem(CHAVE_DA_ORDEM, v);
    expect(iniciarBloco(bloco, mem)).toBe(ORDEM_PADRAO);
    expect(lista("chrono").hidden).toBe(false);
  });

  test("trocar no seletor mostra a outra lista, troca o nome e GUARDA a escolha; a próxima página abre nela", () => {
    const { bloco, lista, nome, trocar } = montar();
    const mem = new Falso();
    iniciarBloco(bloco, mem);
    trocar("release");
    expect(lista("chrono").hidden).toBe(true);
    expect(lista("release").hidden).toBe(false);
    expect(nome.textContent).toBe("Lançamento");
    expect(mem.getItem(CHAVE_DA_ORDEM)).toBe("release");
    // "outra página"
    const outra = montar();
    expect(iniciarBloco(outra.bloco, mem)).toBe("release");
    outra.trocar("chrono");
    expect(mem.getItem(CHAVE_DA_ORDEM)).toBe("chrono");
  });

  test("um valor inventado no evento de troca não faz nada", () => {
    const { bloco, lista, seletor } = montar();
    const mem = new Falso();
    iniciarBloco(bloco, mem);
    seletor.dispatchEvent(new Event("change")); // valor continua "chrono"
    expect(lista("chrono").hidden).toBe(false);
    expect(mem.getItem(CHAVE_DA_ORDEM)).toBe("chrono");
  });

  test("armazenamento que falha (janela privada): funciona do mesmo jeito, só não lembra", () => {
    const { bloco, lista, trocar, seletor } = montar();
    expect(iniciarBloco(bloco, quebrado)).toBe("chrono");
    expect(() => trocar("release")).not.toThrow();
    expect(lista("release").hidden).toBe(false);
    expect(seletor.disabled).toBe(false);
  });

  test("sem armazenamento nenhum (null): idem", () => {
    const { bloco, lista, trocar } = montar();
    expect(iniciarBloco(bloco, null)).toBe("chrono");
    trocar("release");
    expect(lista("release").hidden).toBe(false);
  });

  test("bloco incompleto (sem seletor) é deixado como veio", () => {
    document.body.innerHTML = '<section data-story-order><div class="so-order" data-ordem="chrono"></div></section>';
    expect(iniciarBloco(document.querySelector<HTMLElement>("[data-story-order]")!, new Falso())).toBeNull();
  });

  test("iniciarBlocos() liga todos os blocos da página usando o localStorage do navegador; o texto dos nós continua o mesmo (nada de HTML novo)", () => {
    const { bloco, lista } = montar();
    const antes = bloco.querySelectorAll("*").length;
    localStorage.setItem(CHAVE_DA_ORDEM, "release");
    try {
      iniciarBlocos();
      expect(lista("release").hidden).toBe(false);
      expect(bloco.querySelectorAll("*").length).toBe(antes);
    } finally {
      localStorage.removeItem(CHAVE_DA_ORDEM);
    }
  });
});

describe("as regras do armazenamento", () => {
  test("ordemValida", () => {
    expect(ordemValida("chrono")).toBe(true);
    expect(ordemValida("release")).toBe(true);
    for (const v of [undefined, null, 1, "", "Chrono", {}]) expect(ordemValida(v)).toBe(false);
  });
  test("lerOrdemGuardada / guardarOrdem nunca lançam erro", () => {
    expect(lerOrdemGuardada(quebrado)).toBeNull();
    expect(lerOrdemGuardada(null)).toBeNull();
    expect(lerOrdemGuardada(undefined)).toBeNull();
    expect(guardarOrdem(quebrado, "chrono")).toBe(false);
    expect(guardarOrdem(null, "chrono")).toBe(false);
    const mem = new Falso();
    expect(guardarOrdem(mem, "release")).toBe(true);
    expect(lerOrdemGuardada(mem)).toBe("release");
  });
  test("armazenamentoDoNavegador devolve null se o acesso ao localStorage lançar erro", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("bloqueado");
      },
    });
    try {
      expect(armazenamentoDoNavegador()).toBeNull();
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});

describe("o código do navegador", () => {
  const arquivos = readdirSync(PASTA).filter((a) => a.endsWith(".ts")).sort();
  const codigo = (a: string) => readFileSync(join(PASTA, a), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  test("a pasta tem os três arquivos esperados", () => {
    expect(arquivos).toEqual(["bloco.ts", "index.ts", "regras.ts"]);
  });
  test.each(arquivos)("%s não usa innerHTML, outerHTML, insertAdjacentHTML, document.write, DOMParser, createContextualFragment, eval nem new Function", (a) => {
    expect(codigo(a)).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment|\beval\s*\(|new\s+Function\b/);
  });
  test("só importam ./regras e ./bloco (nada de src/lib nem do config.json, nem de pacotes)", () => {
    for (const a of arquivos) {
      const imports = [...codigo(a).matchAll(/\bimport\b[^"']*["']([^"']+)["']/g)].map((m) => m[1]);
      for (const i of imports) expect(i, a).toMatch(/^\.\/(regras|bloco)$/);
    }
    expect(codigo("regras.ts")).not.toMatch(/\bimport\b/);
  });
  test("o texto do nome da ordem entra só por textContent", () => {
    expect(codigo("bloco.ts")).toMatch(/nome\.textContent\s*=/);
  });
});

// ───────────── T17i: os links e os lugares guardados no DOM ─────────────
// O bloco como o servidor o entrega desde a T17i (o mesmo HTML do ProximaHistoria.astro, em miniatura; o HTML de verdade, desenhado pelo
// componente, passa pelo mesmo teste num DOM simulado no fim de tests/ordem.test.ts): ao trocar de ordem, os links à vista levam ao ÚLTIMO
// capítulo da anterior e ao PRIMEIRO da seguinte; o lado que não existe é um lugar guardado, sem link, invisível para leitores de tela.
const BLOCO_T17I = `<section class="reader-box paper story-order" data-story-order data-ordem="chrono" style="--so-em:40;--so-em-1:20">
<div class="so-top"><p class="so-title" id="t">estou lendo em ordem</p><div class="so-pick"><span class="so-valor" aria-hidden="true">Cronológica</span><select class="so-select" aria-labelledby="t" disabled><option value="chrono" selected>Cronológica</option><option value="release">Lançamento</option></select></div></div>
<div class="so-order" data-ordem="chrono"><a class="so-side prev" href="/pt/works/light-and-blood/02/"><span class="so-art"></span><span class="so-label">Assistir Luz &amp; Sangue</span></a><span class="so-lugar next" aria-hidden="true"><span class="so-art"></span><span class="so-label">&nbsp;</span></span></div>
<div class="so-order" data-ordem="release" hidden><a class="so-side prev" href="https://www.youtube.com/@ResidenciaDosDiVario" target="_blank" rel="noopener noreferrer"><span class="so-art"></span><span class="so-label">Assistir Alô?</span></a><a class="so-side next" href="/pt/works/light-and-blood/01/"><span class="so-art"></span><span class="so-label">Assistir Luz &amp; Sangue</span></a></div></section>`;

/** Os links que o visitante vê (das listas sem `hidden`): "prev /…", "next /…". */
function linksVisiveis(bloco: Element): string[] {
  return [...bloco.querySelectorAll<HTMLElement>(".so-order")]
    .filter((l) => !l.hidden)
    .flatMap((l) => [...l.querySelectorAll<HTMLAnchorElement>("a.so-side")].map((a) => `${a.classList.contains("prev") ? "prev" : "next"} ${a.getAttribute("href")}`));
}

describe("T17i: trocar de ordem mostra os links certos; o lado que falta é um lugar guardado", () => {
  test("Cronológica → o último capítulo da anterior; Lançamento → o link externo e o primeiro capítulo da seguinte; e de volta", () => {
    document.body.innerHTML = BLOCO_T17I; // (só o teste monta HTML fixo; o código do site não)
    const bloco = document.querySelector<HTMLElement>("[data-story-order]")!;
    const seletor = bloco.querySelector<HTMLSelectElement>("select")!;
    const trocar = (v: string) => {
      seletor.value = v;
      seletor.dispatchEvent(new Event("change", { bubbles: true }));
    };
    iniciarBloco(bloco, new Falso());
    expect(linksVisiveis(bloco)).toEqual(["prev /pt/works/light-and-blood/02/"]);
    trocar("release");
    expect(linksVisiveis(bloco)).toEqual(["prev https://www.youtube.com/@ResidenciaDosDiVario", "next /pt/works/light-and-blood/01/"]);
    trocar("chrono");
    expect(linksVisiveis(bloco)).toEqual(["prev /pt/works/light-and-blood/02/"]);
    // o script não mexe nos números da caixa nem nos lugares guardados
    expect(bloco.getAttribute("style")).toBe("--so-em:40;--so-em-1:20");
    const lugar = bloco.querySelector<HTMLElement>(".so-lugar.next")!;
    expect(lugar.getAttribute("aria-hidden")).toBe("true");
    expect(lugar.querySelector("a, [tabindex], img")).toBeNull();
  });
});
