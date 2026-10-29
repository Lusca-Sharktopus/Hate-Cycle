// "Estou lendo em ordem…" (T17c): o ponto de entrada do script no navegador.
// Quem carrega: o <script> de src/components/ProximaHistoria.astro (o Astro o empacota num arquivo /_astro/…js, só nas páginas que
// desenham o bloco, ou seja, nos capítulos). Não importa nada que leia o config.json.
import { iniciarBlocos } from "./bloco";

iniciarBlocos();
