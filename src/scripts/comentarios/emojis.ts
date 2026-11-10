// Os EMOJIS do seletor dos comentários (10/11/2026, pedido do autor: "comuns + runas do universo"). Emojis Unicode comuns, por grupo,
// desenhados pela fonte de emoji do próprio aparelho; a última aba são as runas do fundo do site (as mesmas da foto de perfil, ./foto.ts),
// que no comentário aparecem com as fontes das runas do site (EstiloDoEditor.astro).
//
// ⚠ Vai para o navegador: só importa ./foto.

import { RUNAS_DA_FOTO } from "./foto";

export interface GrupoDeEmojis {
  /** A chave do texto do nome do grupo (TEXTOS_DO_EDITOR). */
  id: "rostos" | "gestos" | "coracoes" | "animais" | "comida" | "coisas" | "simbolos" | "runas";
  /** O emoji do botão da aba. */
  icone: string;
  lista: readonly string[];
}

const separar = (s: string): string[] => s.split(" ").filter(Boolean);

export const GRUPOS_DE_EMOJIS: readonly GrupoDeEmojis[] = [
  {
    id: "rostos",
    icone: "😀",
    lista: separar(
      "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🫢 🤫 🤔 🫡 🤐 🤨 😐 😑 😶 🫥 😏 😒 🙄 😬 😮‍💨 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 😵‍💫 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 🫤 😟 🙁 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 👾 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾",
    ),
  },
  {
    id: "gestos",
    icone: "👍",
    lista: separar(
      "👋 🤚 🖐️ ✋ 🖖 🫱 🫲 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 🖕 👇 ☝️ 🫵 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🦵 🦶 👂 👃 🧠 🫀 🫁 🦷 🦴 👀 👁️ 👅 👄 🫦",
    ),
  },
  {
    id: "coracoes",
    icone: "❤️",
    lista: separar("❤️ 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🩶 🤍 🩷 💔 ❤️‍🔥 ❤️‍🩹 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 💋 💌 💯 💢 💥 💫 💦 💨 🕳️ 💬 🗯️ 💭 💤"),
  },
  {
    id: "animais",
    icone: "🦈",
    lista: separar(
      "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐦‍⬛ 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🕷️ 🕸️ 🦂 🐢 🐍 🦎 🐙 🦑 🦐 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🐘 🦛 🦏 🐪 🦒 🦘 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🐐 🦌 🐕 🐈 🐈‍⬛ 🐓 🦃 🦚 🦜 🦢 🕊️ 🐇 🦝 🦨 🦡 🦫 🦦 🐁 🐀 🐿️ 🦔 🐉 🐲 🌵 🎄 🌲 🌳 🌴 🍀 🍁 🍂 🍄 🌷 🌹 🥀 🌺 🌸 🌼 🌻 🌞 🌝 🌚 🌙 ⭐ 🌟 ✨ ⚡ 🔥 🌈 ☀️ ⛅ ☁️ 🌧️ ⛈️ ❄️ ☃️ 🌊 💧",
    ),
  },
  {
    id: "comida",
    icone: "🍕",
    lista: separar(
      "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🌶️ 🌽 🥕 🧄 🧅 🥔 🍞 🥐 🧀 🥚 🍳 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🍤 🍙 🍚 🍘 🍥 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🥜 🍯 🥛 ☕ 🍵 🧃 🥤 🧋 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾 🧊",
    ),
  },
  {
    id: "coisas",
    icone: "🎮",
    lista: separar(
      "⚽ 🏀 🏈 ⚾ 🎾 🏐 🎱 🏓 🥊 🥋 🎣 ⛸️ 🎿 🏆 🥇 🥈 🥉 🎖️ 🎗️ 🎟️ 🎫 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🕹️ 🧩 🃏 🀄 🎴 📚 📖 📝 ✏️ 🖋️ 🖊️ 🖌️ 🖍️ 📜 📃 📄 📰 🔖 📎 ✂️ 📌 📍 🔍 🔎 🔒 🔓 🔑 🗝️ 🔨 🪓 ⛏️ 🗡️ ⚔️ 🛡️ 🏹 🔮 🧿 🪄 🕯️ 💡 🔦 🏮 📷 📸 📹 🎥 📺 📻 📱 💻 ⌨️ 🖥️ 💾 💿 📼 ☎️ 📞 ⏰ ⌛ ⏳ 💰 💎 ⚖️ 🧲 🧪 🧬 🔭 🔬 💊 🩸 🩹 ⚰️ 🪦 🏺 🗿 🎁 🎈 🎉 🎊 🎀 🪅 🪩 🚗 🚕 🚌 🚓 🚑 🚒 🏍️ 🚲 ✈️ 🚀 🛸 🚂 ⛵ 🗺️ 🏰 🏯 🗼 🗽 ⛪ 🏠 🏚️ ⛺ 🌋 🗻 🏝️ 🌃 🌆 🌇 🌉 🎡 🎢 🎠",
    ),
  },
  {
    id: "simbolos",
    icone: "✅",
    lista: separar(
      "✅ ☑️ ✔️ ❌ ❎ ➕ ➖ ➗ ✖️ ♾️ ‼️ ⁉️ ❓ ❔ ❕ ❗ 〰️ ⚠️ 🚫 ⛔ 📛 🔞 ♻️ ⚜️ 🔱 ⭕ 🆗 🆒 🆕 🆓 🆙 🆘 🔝 🔜 🔚 🔙 ▶️ ⏸️ ⏹️ ⏺️ ⏭️ ⏮️ ⏩ ⏪ 🔀 🔁 🔂 ⬆️ ⬇️ ⬅️ ➡️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ 🔄 🎵 🎶 ™️ ©️ ®️ 🔴 🟠 🟡 🟢 🔵 🟣 🟤 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 🟫 ⬛ ⬜ 🔶 🔷 🔸 🔹 🔺 🔻 💠 🔘 🔳 🔲 🏁 🚩 🏴 🏳️ 🏳️‍🌈 🏳️‍⚧️ 🏴‍☠️ 🇧🇷 🇵🇹 🇺🇸 🇬🇧 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 ☯️ ☦️ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ ⛎ ⚛️ ☢️ ☣️ 🔅 🔆",
    ),
  },
  { id: "runas", icone: "🝪", lista: RUNAS_DA_FOTO },
];

/** Onde ficam os emojis usados por último (só neste navegador). */
export const CHAVE_DOS_RECENTES = "hc-emojis-recentes";
export const MAXIMO_DE_RECENTES = 24;

/** A lista de recentes depois de usar `emoji`: ele vai para o começo, sem repetir, até MAXIMO_DE_RECENTES. */
export function recentesDepoisDe(recentes: readonly string[], emoji: string): string[] {
  return [emoji, ...recentes.filter((e) => e !== emoji)].slice(0, MAXIMO_DE_RECENTES);
}

/** Os recentes guardados, conferidos (só textos curtos que existem nos grupos). */
export function recentesValidos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const todos = new Set(GRUPOS_DE_EMOJIS.flatMap((g) => g.lista));
  return valor.filter((e): e is string => typeof e === "string" && todos.has(e)).slice(0, MAXIMO_DE_RECENTES);
}
