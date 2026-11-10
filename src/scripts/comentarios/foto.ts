// A foto de perfil (09/11/2026, pedido do autor; design "Profile Design.png"): o círculo com a foto da pessoa, na janela da conta e ao
// lado do nome em cada comentário. Sem foto, o círculo mostra uma RUNA SORTEADA — sempre a mesma para a mesma pessoa (sai do id da
// conta), escolhida entre as runas do fundo do site (src/lib/runas.ts → RUNES; tests/comentarios.test.ts confere que esta lista é um
// pedaço daquela). O banco: migração 20261110000000_fotos_de_perfil.sql (public.profiles.avatar_path + o balde público "avatars").
//
// Segurança: a <img> é o ÚNICO elemento da caixa com `src`, e ele só recebe o endereço montado AQUI: o endereço do Supabase do
// config.json (o mesmo da conexão) + "/storage/v1/object/public/avatars/" + um caminho que passou por CAMINHO_DA_FOTO
// (<uuid>/<letras e números>.webp). Qualquer outra coisa no banco vira a runa.

/** As runas que podem cair para quem não tem foto (as do fundo do site, sem os ideogramas e sem as duas runas da fonte própria). */
export const RUNAS_DA_FOTO = Array.from(
  "✝ᛁ⚴ᚻᛗᛋᛟᚩ҂ᛃ𐤉ᗐᚣᚸꑭⰝ🜁Γᚱᛏ🜂⬡🜄🜃Λᛖ⧮⧰ᛚ𐩹ᛮ𐱃Ⰱ𐊙𑢶⚼ᔨᚫΥ🝂🝘🝃Σ𐌄Κ𐰤🝧Ѧᛤ⛉𐌇ᛄ𐌙᭻ᚬ⎍ᛇᛒⵅᛞꮤ𐘇𐰭𐤎꓀◇⧖ᚷ🜲ᛡ‡⋋⏃ᚳ𐰔ᛝᚹ𝈒𐙎𑀒𝆦ᛥ🜙⊹𐌌⋉𐌎🜍ᛠⰭ🝪𐘲ᚾ𖦐𐔙ᛈ",
);

/** O caminho de uma foto no balde: <id da conta>/<nome aleatório>.webp (a mesma regra do banco). */
export const CAMINHO_DA_FOTO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z0-9]{12,40}\.(webp|jpg)$/;

/** A runa de uma pessoa: um número que sai do id da conta (FNV-1a), sempre o mesmo. */
export function runaDaPessoa(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return RUNAS_DA_FOTO[h % RUNAS_DA_FOTO.length] as string;
}

/** O endereço público de uma foto, ou null se o caminho não tem a forma esperada. `base` = a URL do Supabase do config.json. */
export function enderecoDaFoto(base: string, caminho: unknown): string | null {
  if (typeof caminho !== "string" || !CAMINHO_DA_FOTO.test(caminho)) return null;
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) return null;
  return `${base}/storage/v1/object/public/avatars/${caminho}`;
}

/**
 * O círculo da foto: <span class="c-foto"> com a <img> (quem tem foto) ou com a runa (quem não tem). `classe` acrescenta o tamanho
 * (c-foto-grande na janela da conta). A runa vai como texto; o nome da pessoa vai no `alt`/`aria-label` pelo chamador, nunca aqui.
 */
export function circuloDaFoto(base: string, id: string, caminho: unknown, classe = ""): HTMLSpanElement {
  const circulo = document.createElement("span");
  circulo.className = "c-foto" + (classe ? ` ${classe}` : "");
  circulo.setAttribute("aria-hidden", "true");
  const endereco = enderecoDaFoto(base, caminho);
  if (endereco) {
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.loading = "lazy";
    img.width = 256;
    img.height = 256;
    img.src = endereco; // só o endereço montado acima
    // a foto sumiu do balde (apagada à mão no painel, por exemplo): volta para a runa
    img.addEventListener("error", () => {
      img.remove();
      circulo.classList.add("c-foto-runa");
      circulo.textContent = runaDaPessoa(id);
    });
    circulo.appendChild(img);
  } else {
    circulo.classList.add("c-foto-runa");
    circulo.textContent = runaDaPessoa(id);
  }
  return circulo;
}
