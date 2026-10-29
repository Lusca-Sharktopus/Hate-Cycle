// O leitor página a página dos quadrinhos (T17d): o ponto de entrada do script no navegador.
// Quem carrega: o <script> de src/components/Folheador.astro (o Astro o empacota num arquivo /_astro/…js, só nas páginas de capítulo
// de obra com `page_runes`). Não importa nada que leia o config.json.
import { iniciarFolheadores } from "./bloco";

iniciarFolheadores();
