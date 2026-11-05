// Os canais do YouTube por idioma (T17h, src/lib/canais.ts): o mapa por idioma, a troca no rodapé e a garantia de que o config.json
// (que é do autor, e o Claude não edita) não é a fonte desses endereços. A prova nas páginas construídas (todo rodapé, o Apoio) está em tests/paginas.test.ts (T17h).
import { describe, expect, test } from "vitest";
import { canalDoYoutube, CANAIS_DO_YOUTUBE, ehYoutube, redesDoRodape } from "../src/lib/canais";
import { langs, socialLinks, type Lang } from "../src/lib/config";

describe("o canal do YouTube de cada idioma", () => {
  test("inglês → @HateCycleEn, português → @HateCycleBR (os endereços do PDF do autor de 21/10)", () => {
    expect(canalDoYoutube("en")).toBe("https://www.youtube.com/@HateCycleEn");
    expect(canalDoYoutube("pt")).toBe("https://www.youtube.com/@HateCycleBR");
  });
  test("todo idioma do site tem o seu canal, e cada um é diferente", () => {
    expect(Object.keys(CANAIS_DO_YOUTUBE).sort()).toEqual([...langs].sort());
    expect(new Set(Object.values(CANAIS_DO_YOUTUBE)).size).toBe(langs.length);
  });
});

describe("redesDoRodape: só o YouTube muda", () => {
  const redes = [
    { name: "Instagram", url: "https://www.instagram.com/hate.cycle/", icon: "social/instagram.png" },
    { name: "YouTube", url: "https://www.youtube.com/@HateCycle", icon: "social/youtube.png" },
    { name: "TikTok", url: "https://www.tiktok.com/@hate.cycle", icon: "social/tiktok.png" },
  ];
  test("o YouTube leva ao canal do idioma; nome, ícone, ordem e as outras redes ficam como estão", () => {
    for (const lang of ["en", "pt"] as Lang[]) {
      const r = redesDoRodape(lang, redes);
      expect(r.map((x) => x.name)).toEqual(["Instagram", "YouTube", "TikTok"]);
      expect(r[1]).toEqual({ name: "YouTube", url: CANAIS_DO_YOUTUBE[lang], icon: "social/youtube.png" });
      expect(r[0]).toEqual(redes[0]);
      expect(r[2]).toEqual(redes[2]);
    }
  });
  test("não mexe na lista original (o config.json lido)", () => {
    redesDoRodape("pt", redes);
    expect(redes[1]?.url).toBe("https://www.youtube.com/@HateCycle");
  });
  test("o YouTube é achado pelo domínio, não pelo nome que o autor deu à rede", () => {
    expect(ehYoutube("https://www.youtube.com/@qualquer")).toBe(true);
    expect(ehYoutube("https://m.youtube.com/@x")).toBe(true);
    expect(ehYoutube("https://youtu.be/abc")).toBe(true);
    expect(ehYoutube("https://notyoutube.com/@x")).toBe(false);
    expect(ehYoutube("https://www.instagram.com/hate.cycle/")).toBe(false);
    expect(ehYoutube("isto não é um endereço")).toBe(false);
    const r = redesDoRodape("en", [{ name: "Canal", url: "https://www.youtube.com/@Outro", icon: "social/youtube.png" }]);
    expect(r[0]?.url).toBe(CANAIS_DO_YOUTUBE.en);
  });
  test("com as redes de verdade (config.json): exatamente uma rede é trocada, nas duas línguas", () => {
    for (const lang of langs) {
      const r = redesDoRodape(lang);
      expect(r).toHaveLength(socialLinks.length);
      const trocadas = r.filter((x, i) => x.url !== socialLinks[i]?.url);
      expect(trocadas.map((x) => x.name)).toEqual(["YouTube"]);
      expect(trocadas[0]?.url).toBe(CANAIS_DO_YOUTUBE[lang]);
    }
  });
});
