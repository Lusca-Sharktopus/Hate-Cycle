// Posts incorporados só com clique (T17g): o ponto de entrada do script no navegador.
// Quem carrega: o <script> de src/components/EmbedsComClique.astro (o Astro o empacota num arquivo /_astro/…js, só nas páginas que
// têm pelo menos um quadro). Não importa nada que leia o config.json.
import { iniciarEmbeds } from "./bloco";

iniciarEmbeds(document, { janela: window });
