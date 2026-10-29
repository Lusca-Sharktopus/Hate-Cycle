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
