// Endereços de arquivos de static/ (o equivalente de asset() e ver() do build.py).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Caminho de um arquivo de static/ como endereço do site: "logos/Hate Cycle Glow.png" → "/logos/Hate%20Cycle%20Glow.png".
 * Como asset() do build.py, mas SEM o BASE (o site fica na raiz do domínio; ver astro.config.mjs).
 * Endereços completos (https:, data:, mailto:, #) passam como estão.
 */
export function assetUrl(path: string): string {
  if (!path) return "";
  if (/^(https?:|data:|mailto:|#)/.test(path)) return path;
  const encoded = path
    .replace(/^\/+/, "")
    .split("/")
    // mesma lista de caracteres que quote() do Python deixa passar: letras, números e _ . - ~
    .map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()))
    .join("/");
  return "/" + encoded;
}

/**
 * Endereço de um arquivo de static/ com carimbo "?v=<hash>" que muda quando o arquivo muda (como ver() do build.py):
 * o navegador nunca usa a versão velha. Serve para arquivos que o Astro NÃO empacota (os de static/, como o custom.css).
 * Se o arquivo não existe (ex.: custom.css, que é pessoal do autor), devolve o endereço sem carimbo.
 */
export function assetVersioned(path: string): string {
  const url = assetUrl(path);
  try {
    const bytes = readFileSync(join(process.cwd(), "static", path.replace(/^\/+/, "")));
    return url + "?v=" + createHash("sha1").update(bytes).digest("hex").slice(0, 8);
  } catch {
    return url;
  }
}
