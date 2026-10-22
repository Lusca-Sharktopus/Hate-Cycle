// Posts incorporados em moldura isolada (T17j): o ponto de entrada do script no navegador.
// Quem carrega: o <script> de src/components/PostsIncorporados.astro (o Astro o empacota num arquivo /_astro/…js, só nas páginas que
// têm pelo menos um post do X, do Reddit ou do Instagram). Não importa nada que leia o config.json.
import { iniciarPosts } from "./bloco";

iniciarPosts(document, { janela: window });
