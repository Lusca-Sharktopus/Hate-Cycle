// Prova de que as migrações do Supabase (T15, supabase/migrations/) começam EXATAMENTE pelo banco que está no ar hoje.
//
// O banco do autor foi criado à mão com supabase-setup.sql (SQL Editor do Supabase). A primeira migração é esse arquivo,
// byte a byte, com um cabeçalho de comentários na frente explicando que, no projeto do ar, ela é só MARCADA como aplicada.
// (Validado também num Postgres local com o Supabase CLI: o esquema que a migração cria é idêntico ao do supabase-setup.sql;
// ver docs/aprendendo-astro/10-comentarios.md, seção "Como se prova".)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const PASTA = join(RAIZ, "supabase", "migrations");
const MARCA = "-- ───── daqui para baixo: cópia exata de supabase-setup.sql ─────\n";
const INICIAL = "20261016000000_inicial.sql";

describe("supabase/migrations/", () => {
  const arquivos = readdirSync(PASTA).sort();

  test("os nomes seguem o formato do Supabase CLI (<AAAAMMDDHHMMSS>_<nome>.sql) e a inicial é a primeira", () => {
    for (const a of arquivos) expect(a).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(arquivos[0]).toBe(INICIAL);
  });

  test("a migração inicial = cabeçalho de comentários + supabase-setup.sql byte a byte", () => {
    const migracao = readFileSync(join(PASTA, INICIAL), "utf8");
    const setup = readFileSync(join(RAIZ, "supabase-setup.sql"), "utf8");
    const i = migracao.indexOf(MARCA);
    expect(i).toBeGreaterThan(0);
    // antes da marca, só comentários (nada que o banco execute)
    for (const linha of migracao.slice(0, i).split("\n").filter(Boolean)) expect(linha).toMatch(/^--/);
    expect(migracao.slice(i + MARCA.length) === setup, "o texto depois da marca não é o supabase-setup.sql").toBe(true);
  });

  test("os cinco blocos estão lá (perfis, comentários, anti-spam, admin comentado, edição)", () => {
    const migracao = readFileSync(join(PASTA, INICIAL), "utf8");
    for (const trecho of [
      "create table public.profiles",
      "alter table public.profiles enable row level security;",
      "create trigger on_auth_user_created after insert on auth.users",
      "create table public.comments",
      "alter table public.comments enable row level security;",
      'create policy "quem tem conta pode comentar"',
      "create trigger comments_check before insert on public.comments",
      "-- update public.profiles set is_admin = true",
      "alter table public.comments add column if not exists edited_at timestamptz;",
      "create trigger comments_edit_check before update on public.comments",
    ])
      expect(migracao, trecho).toContain(trecho);
    // o bloco 4 (virar admin) continua COMENTADO: a migração não dá admin a ninguém
    expect(migracao).not.toMatch(/^update public\.profiles/m);
  });

  test("nenhuma chave, senha, e-mail real ou endereço de projeto nos arquivos de supabase/", () => {
    for (const a of arquivos) {
      const sql = readFileSync(join(PASTA, a), "utf8");
      expect(sql, a).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}|service_role|sb_secret_|sb_publishable_|\.supabase\.co\b/);
    }
    // sem config.toml de propósito (ver docs/comentarios-supabase.md): o CLI não precisa dele para link/repair/push
    expect(readdirSync(join(RAIZ, "supabase")).filter((a) => a !== ".temp" && a !== ".branches")).toEqual(["migrations"]);
  });
});

// Migração de 03/11/2026 (B25): o banco só aceita comentários em page_id no formato dos IDs de página do site. Uma pasta nova em content/
// com letra maiúscula, acento, "_" ou capítulo com 1 ou 4 dígitos teria TODOS os comentários daquela página recusados, sem aviso no build:
// este teste avisa antes. (Achado 3 da revisão de segurança de 03/11.)
describe("page_id dos comentários × a regra do banco", () => {
  const sql = readFileSync(join(PASTA, "20261103000000_endurecer_comentarios.sql"), "utf8");
  const m = /add constraint comments_page_id_formato\s+check \(page_id ~ '([^']+)'\);/.exec(sql);
  test("a regra está na migração", () => expect(m, "constraint comments_page_id_formato").not.toBeNull());
  const regra = new RegExp(m?.[1] ?? "$^");
  const pastas = (dir: string) => readdirSync(join(RAIZ, dir), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

  test("todo capítulo de content/works/ e todo post de content/news/ (e content/blog/, quando existir) cabe na regra", () => {
    const ids: string[] = [];
    for (const obra of pastas("content/works")) for (const cap of pastas(`content/works/${obra}`)) ids.push(`works/${obra}/${cap}`);
    for (const secao of ["news", "blog"]) {
      try {
        for (const post of pastas(`content/${secao}`)) ids.push(`${secao}/${post}`);
      } catch {
        /* seção ainda não existe */
      }
    }
    expect(ids.length).toBeGreaterThan(50);
    expect(ids.filter((id) => !regra.test(id)), "IDs que o banco recusaria").toEqual([]);
  });

  test("os IDs da baseline (os do site de hoje) cabem na regra", () => {
    const base = JSON.parse(readFileSync(join(RAIZ, "baseline", "comentarios.json"), "utf8")) as unknown;
    const ids = new Set<string>();
    const andar = (x: unknown): void => {
      if (typeof x === "string") {
        if (/^(works|news|blog)\//.test(x)) ids.add(x);
      } else if (Array.isArray(x)) x.forEach(andar);
      else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) (andar(k), andar(v));
    };
    andar(base);
    expect(ids.size).toBeGreaterThan(50);
    expect([...ids].filter((id) => !regra.test(id))).toEqual([]);
  });

  test("a regra recusa o que deve", () => {
    for (const ruim of ["works/Firestriker/01", "works/firestriker/1", "works/firestriker/0001", "news/orcs", "news/2023-08-18-Orcs", "lixo/2023-08-18-x", "works/obra_x/01", "works/ação/01"])
      expect(regra.test(ruim), ruim).toBe(false);
    for (const bom of ["works/firestriker/01", "works/all-in-a-nights-work/001", "news/2023-08-18-orcs", "blog/2026-11-03-primeiro-post"]) expect(regra.test(bom), bom).toBe(true);
  });
});
