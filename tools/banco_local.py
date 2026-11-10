#!/usr/bin/env python3
"""Prova as migrações do banco dos comentários num Postgres LOCAL, sem rede e sem o Supabase de verdade.

Sobe um Postgres temporário (pasta temporária, só socket, nada na porta de rede), cria uma imitação mínima do Supabase
(papéis anon/authenticated/service_role, esquema auth com auth.users e auth.uid() lendo request.jwt.claim.sub, as permissões
padrão que o Supabase dá em public), aplica TODAS as migrações de supabase/migrations/ em ordem (a última duas vezes, para provar
que é idempotente) e roda os casos abaixo como os papéis do site. Cada caso diz o que se espera; no fim, um resumo.

Uso:  python3 tools/banco_local.py            (precisa de Postgres 16 instalado: initdb/pg_ctl/psql; roda como root ou como o
                                               usuário postgres — como root, os comandos do servidor rodam como "postgres")
Fora do `pnpm test` de propósito (precisa do Postgres). Origem: B25 / pedido do autor de 02/11/2026 (opção b).
"""
from __future__ import annotations

import glob
import os
import shutil
import subprocess
import sys
import tempfile
import time

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRACOES = sorted(glob.glob(os.path.join(RAIZ, "supabase", "migrations", "*.sql")))
BIN = next((p for p in sorted(glob.glob("/usr/lib/postgresql/*/bin"), reverse=True)), "")
COMO_POSTGRES = ["runuser", "-u", "postgres", "--"] if os.geteuid() == 0 else []

# papéis (valem para o servidor inteiro; criados uma vez) e o resto da imitação (por banco)
PAPEIS = "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;"
IMITACAO = r"""
create extension if not exists pgcrypto;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
-- o Storage (só o que a migração das fotos usa, 09/11/2026): baldes, arquivos (com RLS ligado, como no Supabase) e storage.foldername()
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid default auth.uid(),
  created_at timestamptz default now(), unique (bucket_id, name));
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated;
grant all on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
grant execute on function storage.foldername(text) to anon, authenticated;
"""

A, B, C, D = (f"00000000-0000-0000-0000-00000000000{i}" for i in "abcd")
NOTICIA = "news/2023-08-18-orcs"
CAPITULO = "works/firestriker/01"


def main() -> int:
    if not BIN:
        print("✗ Postgres não encontrado (/usr/lib/postgresql/*/bin)")
        return 2
    pasta = tempfile.mkdtemp(prefix="hc-banco-")
    dados, sock = os.path.join(pasta, "dados"), os.path.join(pasta, "sock")
    os.makedirs(sock)
    if COMO_POSTGRES:
        shutil.chown(pasta, "postgres")
        shutil.chown(sock, "postgres")
    run = lambda *a, **k: subprocess.run(COMO_POSTGRES + list(a), capture_output=True, text=True, **k)
    r = run(f"{BIN}/initdb", "-D", dados, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C.UTF-8")
    if r.returncode:
        print(r.stderr)
        return 2
    r = run(f"{BIN}/pg_ctl", "-D", dados, "-l", os.path.join(pasta, "log"), "-w", "-o", f"-c listen_addresses='' -k {sock} -p 55432", "start")
    if r.returncode:
        print(r.stderr, open(os.path.join(pasta, "log")).read())
        return 2
    try:
        ok, _, err = psql(run, sock, PAPEIS, None, None)
        if not ok:
            print("✗ papéis do Supabase:", err)
            return 1
        antigo = banco_antigo(lambda sql, papel=None, sub=None, db="antigo": psql(run, sock, sql, papel, sub, db))
        return casos(lambda sql, papel=None, sub=None: psql(run, sock, sql, papel, sub), lambda pedidos: juntos(sock, pedidos)) or antigo
    finally:
        run(f"{BIN}/pg_ctl", "-D", dados, "-m", "immediate", "stop")
        shutil.rmtree(pasta, ignore_errors=True)


def psql(run, sock, sql: str, papel: str | None, sub: str | None, db: str = "postgres"):
    """Roda `sql` (como o papel e o usuário do site, se dados) numa transação; devolve (ok, saída, erro)."""
    pre = ""
    if papel:
        pre = f"set local role {papel};\n"
        if sub:
            pre += f"set local request.jwt.claim.sub = '{sub}';\n"
    r = run(f"{BIN}/psql", "-h", sock, "-p", "55432", "-U", "postgres", "-d", db, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1",
            "-c", sql if sql.lower().startswith("create database") else "begin;\n" + pre + sql.rstrip().rstrip(";") + ";\ncommit;")
    return r.returncode == 0, r.stdout.strip(), r.stderr.strip()


def juntos(sock, pedidos):
    """Roda vários (sql, papel, sub) AO MESMO TEMPO, cada um na sua conexão e transação; devolve [(ok, erro)]."""
    procs = []
    for sql, papel, sub in pedidos:
        pre = f"set local role {papel};\nset local request.jwt.claim.sub = '{sub}';\n"
        procs.append(subprocess.Popen(COMO_POSTGRES + [f"{BIN}/psql", "-h", sock, "-p", "55432", "-U", "postgres", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1",
                                                       "-c", "begin;\n" + pre + sql + ";\nselect pg_sleep(0.5);\ncommit;"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True))
    return [(p.wait() == 0, p.stderr.read().strip()) for p in procs]


def banco_antigo(q) -> int:
    """Projeto criado com um setup ANTIGO, sem o bloco 5 (editar comentários) — como o do autor (03/11/2026: "trigger comments_edit_check
    does not exist"). A migração nova tem de rodar nele e deixar tudo como num projeto completo."""
    q("create database antigo", db="postgres")
    inicial = open(MIGRACOES[0], encoding="utf8").read()
    sem_bloco5 = inicial[: inicial.index("-- 5) EDITAR COMENTÁRIOS")]
    passos = [("imitação do Supabase", IMITACAO), ("setup antigo (sem o bloco 5)", sem_bloco5)] + [(os.path.basename(m), open(m, encoding="utf8").read()) for m in MIGRACOES[1:]]
    for nome, sql in passos:
        ok, _, err = q(sql)
        if not ok:
            print(f"✗ banco antigo: {nome} ({err})")
            return 1
    ok, saida, err = q("select (select count(*) from pg_trigger where tgname in ('comments_check','comments_edit_check','comments_soft_delete','comments_cleanup') and not tgisinternal)"
                       " || '|' || (select count(*) from pg_policies where policyname = 'editar o proprio comentario')"
                       " || '|' || (select count(*) from information_schema.columns where table_name = 'comments' and column_name in ('edited_at','deleted_at'))")
    certo = ok and saida == "4|1|2"
    print(("✔ " if certo else "✗ ") + "banco antigo (sem o bloco 5): a migração roda e cria gatilhos, policy de edição e colunas" + ("" if certo else f" (veio {saida or err!r})"))
    return 0 if certo else 1


def casos(q, paralelo=None) -> int:
    resultados: list[tuple[bool, str]] = []

    def caso(nome: str, sql: str, *, papel=None, sub=None, erro: str | None = None, depois: str | None = None, espera: str | None = None):
        ok, saida, err = q(sql, papel, sub)
        if erro is not None:
            passou = (not ok) and erro in err
            detalhe = "" if passou else f"(esperava erro com '{erro}'; veio {'sucesso' if ok else err!r})"
        else:
            passou = ok
            detalhe = "" if ok else f"(erro inesperado: {err})"
        if passou and depois is not None:
            ok2, saida2, err2 = q(depois)
            passou = ok2 and saida2 == espera
            if not passou:
                detalhe = f"(conferência: esperava {espera!r}, veio {saida2 if ok2 else err2!r})"
        resultados.append((passou, nome))
        print(("✔ " if passou else "✗ ") + nome + (" " + detalhe if detalhe else ""))

    # ── migrações: todas em ordem; a última de novo (idempotente) ──
    ok, _, err = q(IMITACAO)
    if not ok:
        print("✗ imitação do Supabase:", err)
        return 1
    for m in MIGRACOES + MIGRACOES[-1:]:
        ok, _, err = q(open(m, encoding="utf8").read())
        resultados.append((ok, f"migração {os.path.basename(m)}"))
        print(("✔ " if ok else "✗ ") + f"aplica {os.path.basename(m)}" + ("" if ok else f" ({err})"))
        if not ok:
            return 1

    def envelhecer():
        q("set local session_replication_role = replica; "
          "update public.comments set created_at = created_at - interval '1 minute', edited_at = edited_at - interval '1 minute'")

    # ── contas: A (admin), B, C, D ──
    q("insert into auth.users (id, email, raw_user_meta_data) values "
      f"('{A}','a@x','{{\"display_name\":\"Admin\"}}'),('{B}','b@x','{{\"display_name\":\"Bia\"}}'),"
      f"('{C}','c@x','{{\"full_name\":\"Caio\"}}'),('{D}','d@x','{{}}');"
      f"update public.profiles set is_admin = true where id = '{A}';")
    caso("perfis criados pelo gatilho (nome dos metadados ou user-xxxxxx)", "select 1",
         depois="select string_agg(display_name, ',' order by id) from public.profiles", espera="Admin,Bia,Caio,user-000000")

    ins = lambda corpo, page=NOTICIA, pai="null", extra="": (
        f"insert into public.comments (page_id, body, parent_id{', ' + extra.split('=')[0] if extra else ''}) "
        f"values ('{page}', '{corpo}', {pai}{', ' + extra.split('=', 1)[1] if extra else ''})")

    # 1) data falsa ignorada; limite de 10 s
    caso("data inventada ao criar é trocada pela do servidor", ins("primeiro", extra="created_at='2020-01-01'"), papel="authenticated", sub=B,
         depois="select extract(year from created_at) = extract(year from now()) from public.comments where body = 'primeiro'", espera="t")
    caso("(editado) falso ao criar é ignorado", "select 1", depois="select edited_at is null from public.comments where body = 'primeiro'", espera="t")
    caso("segundo comentário em menos de 10 s é recusado", ins("segundo"), papel="authenticated", sub=B, erro="rate limit")
    caso("…mesmo dizendo que o primeiro é antigo (data falsa não burla mais)", ins("segundo", extra="created_at='2000-01-01'"), papel="authenticated", sub=B, erro="rate limit")
    # 2) formato e conteúdo
    caso("page_id fora do formato é recusado", ins("x", page="qualquer/coisa"), papel="authenticated", sub=C, erro="comments_page_id_formato")
    caso("page_id de capítulo é aceito", ins("no capítulo", page=CAPITULO), papel="authenticated", sub=C)
    envelhecer()
    caso("page_id de post do blog é aceito", ins("no blog", page="blog/2026-11-03-primeiro-post"), papel="authenticated", sub=C)
    q("set local session_replication_role = replica; delete from public.comments where body = 'no blog'")
    envelhecer()
    caso("corpo só com espaços e quebras de linha é recusado", ins("   \\n  ".replace("\\n", "\n")), papel="authenticated", sub=C, erro="check")
    caso("visitante sem conta não comenta", ins("anônimo"), papel="anon", erro="permission denied")
    envelhecer()
    caso("ninguém comenta em nome de outra pessoa", ins("falso", extra=f"user_id='{B}'"), papel="authenticated", sub=C, erro="not allowed")
    # 3) respostas
    caso("resposta de outra pessoa", ins("resposta da Caio", pai=f"(select id from public.comments where body = 'primeiro')"), papel="authenticated", sub=C)
    # 4) edição
    caso("editar o próprio comentário marca (editado)", "update public.comments set body = 'primeiro (corrigido)' where body = 'primeiro'", papel="authenticated", sub=B,
         depois="select edited_at is not null from public.comments where body = 'primeiro (corrigido)'", espera="t")
    caso("segunda edição em menos de 10 s é recusada", "update public.comments set body = 'de novo' where body = 'primeiro (corrigido)'", papel="authenticated", sub=B, erro="rate limit")
    envelhecer()
    caso("edição não muda página, dono nem data (o banco devolve os valores antigos)",
         f"update public.comments set body = 'primeiro (corrigido 2)', page_id = '{CAPITULO}', created_at = '2001-01-01', user_id = '{C}' where body = 'primeiro (corrigido)'",
         papel="authenticated", sub=B,
         depois=f"select page_id || '|' || (user_id = '{B}') || '|' || (extract(year from created_at) > 2001) from public.comments where body = 'primeiro (corrigido 2)'",
         espera=f"{NOTICIA}|true|true")
    q("set local session_replication_role = replica; update public.comments set body = 'primeiro (corrigido)' where body = 'primeiro (corrigido 2)'")
    caso("…e trocar só a página continua sem efeito", f"update public.comments set page_id = '{CAPITULO}' where body = 'primeiro (corrigido)'", papel="authenticated", sub=B,
         depois="select page_id from public.comments where body = 'primeiro (corrigido)'", espera=NOTICIA)
    caso("editar comentário de outra pessoa não muda nada", "update public.comments set body = 'invadido' where body = 'resposta da Caio'", papel="authenticated", sub=B,
         depois="select count(*) from public.comments where body = 'invadido'", espera="0")
    # 5) apagar com respostas → "[comentário apagado]"
    caso("apagar comentário que tem resposta: vira [apagado], sem dono, e a resposta fica",
         "delete from public.comments where body = 'primeiro (corrigido)'", papel="authenticated", sub=B,
         depois="select p.body || '|' || coalesce(p.user_id::text, 'sem dono') || '|' || (p.deleted_at is not null) || '|' || "
                "(select count(*) from public.comments r where r.parent_id = p.id) from public.comments p where p.parent_id is null and p.page_id = 'news/2023-08-18-orcs'",
         espera="[apagado]|sem dono|true|1")
    caso("ninguém responde a comentário apagado", ins("resposta tardia", pai="(select id from public.comments where body = '[apagado]')"), papel="authenticated", sub=A, erro="invalid parent")
    caso("comentário apagado não pode ser editado nem por quem o escreveu", "update public.comments set body = 'voltei' where body = '[apagado]'", papel="authenticated", sub=B,
         depois="select count(*) from public.comments where body = 'voltei'", espera="0")
    caso("comentário apagado não pode ser 'desapagado' (nem pelo banco)", "update public.comments set deleted_at = null, body = 'voltei' where body = '[apagado]'",
         erro="deleted comment cannot be edited")
    caso("quem não é dono nem admin não apaga (nada muda)", "delete from public.comments where body = 'resposta da Caio'", papel="authenticated", sub=B,
         depois="select count(*) from public.comments where body = 'resposta da Caio'", espera="1")
    caso("apagada a última resposta, o comentário apagado some junto", "delete from public.comments where body = 'resposta da Caio'", papel="authenticated", sub=C,
         depois=f"select count(*) from public.comments where page_id = '{NOTICIA}'", espera="0")
    # 6) apagar sem resposta → some; admin apaga de qualquer um
    caso("apagar comentário sem resposta apaga de vez", "delete from public.comments where body = 'no capítulo'", papel="authenticated", sub=C,
         depois="select count(*) from public.comments where body = 'no capítulo'", espera="0")
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{C}'; " + ins("raiz da Caio") + ";")
    envelhecer()
    caso("admin apaga comentário de qualquer pessoa", "delete from public.comments where body = 'raiz da Caio'", papel="authenticated", sub=A,
         depois="select count(*) from public.comments where body = 'raiz da Caio'", espera="0")
    # 7) conta apagada
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{C}'; " + ins("raiz da Caio 2") + ";")
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{D}'; " + ins("raiz do D com resposta") + ";")
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{C}'; " + ins("resposta da Caio ao D", pai="(select id from public.comments where body = 'raiz do D com resposta')") + ";")
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{D}'; " + ins("raiz do D sem resposta", page=CAPITULO) + ";")
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{D}'; " + ins("resposta do D", pai="(select id from public.comments where body = 'raiz da Caio 2')") + ";")
    caso("conta apagada: o que tem resposta de outra pessoa vira [apagado]; o resto dela some; o resto das outras fica",
         f"delete from auth.users where id = '{D}'",
         depois="select string_agg(body || ':' || coalesce((select display_name from public.profiles p where p.id = c.user_id), '-'), ',' order by c.id) from public.comments c",
         espera="raiz da Caio 2:Caio,[apagado]:-,resposta da Caio ao D:Caio")
    # 8) permissões
    caso("ninguém vira admin pelo site", f"update public.profiles set is_admin = true where id = '{B}'", papel="authenticated", sub=B, erro="permission denied")
    caso("ninguém troca o próprio nome pelo site (por enquanto)", f"update public.profiles set display_name = 'Outro' where id = '{B}'", papel="authenticated", sub=B, erro="permission denied")
    caso("ninguém esvazia a tabela", "truncate public.comments", papel="authenticated", sub=B, erro="permission denied")
    caso("visitante lê comentários e nomes", "select count(*) from public.comments; select count(*) from public.profiles;", papel="anon")
    caso("funções internas não podem ser chamadas pelo site", "select public.soft_delete_comment()", papel="authenticated", sub=B, erro="permission denied")
    caso("as funções têm search_path fixo", "select 1",
         depois="select count(*) from pg_proc where proname in ('check_new_comment','check_edit_comment','soft_delete_comment','cleanup_deleted_parent','before_delete_profile','handle_new_user','check_bookmark','change_my_name','delete_my_account','check_favorite','limpar_nome') "
                "and proconfig is not null and 'search_path=\"\"' = any(proconfig)",
         espera="11")

    # 9) marca-páginas (migração 20261103020000)
    mp = lambda pag, par, fr="0.5", extra="": f"insert into public.bookmarks (page_id, paragrafo, fracao{', user_id' if extra else ''}) values ('{pag}', {par}, {fr}{', ' + extra if extra else ''})"
    caso("marca-página: quem tem conta guarda o seu", mp("works/firestriker/01", 12), papel="authenticated", sub=B,
         depois=f"select paragrafo || ':' || fracao from public.bookmarks where user_id = '{B}'", espera="12:0.5")
    caso("marca-página: guardar de novo no mesmo capítulo atualiza (upsert)",
         "insert into public.bookmarks (page_id, paragrafo, fracao) values ('works/firestriker/01', 30, 0.25) "
         "on conflict (user_id, page_id) do update set paragrafo = excluded.paragrafo, fracao = excluded.fracao", papel="authenticated", sub=B,
         depois=f"select paragrafo || ':' || fracao from public.bookmarks where user_id = '{B}'", espera="30:0.25")
    ok_, saida_, _ = q("select count(*) from public.bookmarks", "authenticated", C)
    resultados.append((ok_ and saida_ == "0", "marca-página: a Caio não vê o da Bia"))
    print(("✔ " if ok_ and saida_ == "0" else "✗ ") + "marca-página: a Caio não vê o da Bia")
    ok_, saida_, _ = q("select count(*) from public.bookmarks", "anon")
    resultados.append((not ok_, "marca-página: visitante sem conta não lê a tabela"))
    print(("✔ " if not ok_ else "✗ ") + "marca-página: visitante sem conta não lê a tabela")
    # o gatilho recusa antes do RLS ("not allowed"; revisão de 03/11), também quando a linha da outra pessoa já existe (upsert)
    caso("marca-página: ninguém grava em nome de outra pessoa", mp("works/firestriker/01", 1, extra=f"'{B}'"), papel="authenticated", sub=C, erro="not allowed")
    caso("marca-página: nem por upsert sobre o da outra pessoa",
         mp("works/firestriker/01", 1, extra=f"'{B}'") + " on conflict (user_id, page_id) do update set paragrafo = excluded.paragrafo",
         papel="authenticated", sub=C, erro="not allowed")
    caso("marca-página: ninguém muda o de outra pessoa", "update public.bookmarks set paragrafo = 0", papel="authenticated", sub=C,
         depois=f"select paragrafo from public.bookmarks where user_id = '{B}'", espera="30")
    caso("marca-página: ninguém apaga o de outra pessoa", "delete from public.bookmarks", papel="authenticated", sub=C,
         depois="select count(*) from public.bookmarks", espera="1")
    caso("marca-página: só em capítulo (page_id de capítulo)", mp("news/2023-08-18-orcs", 1), papel="authenticated", sub=C, erro="check")
    caso("marca-página: fração fora de 0–1 é recusada", mp("works/firestriker/01", 1, "1.5"), papel="authenticated", sub=C, erro="check")
    caso("marca-página: trocar de capítulo ou de dono não pega", f"update public.bookmarks set page_id = 'works/light-and-blood/01', user_id = '{C}'", papel="authenticated", sub=B,
         depois=f"select page_id || '|' || (user_id = '{B}') from public.bookmarks", espera="works/firestriker/01|true")
    caso("marca-página: apagar o próprio", "delete from public.bookmarks where page_id = 'works/firestriker/01'", papel="authenticated", sub=B,
         depois="select count(*) from public.bookmarks", espera="0")
    # revisão de 03/11: capítulo com nome gigante; limite de 1000 (com 1000, mover um que já existe pelo upsert do site continua valendo);
    # pedidos simultâneos não passam do limite
    caso("marca-página: capítulo com mais de 120 caracteres é recusado", mp("works/" + "a" * 200 + "/01", 1), papel="authenticated", sub=B, erro="check")
    q(f"insert into public.bookmarks (user_id, page_id, paragrafo) select '{B}', 'works/o' || g || '/01', 1 from generate_series(1, 1000) g")
    caso("marca-página: com 1000, o upsert de um capítulo que já tem continua valendo",
         "insert into public.bookmarks (page_id, paragrafo, fracao) values ('works/o5/01', 7, 0.1) "
         "on conflict (user_id, page_id) do update set paragrafo = excluded.paragrafo, fracao = excluded.fracao", papel="authenticated", sub=B,
         depois=f"select paragrafo from public.bookmarks where user_id = '{B}' and page_id = 'works/o5/01'", espera="7")
    caso("marca-página: com 1000, um capítulo novo é recusado", mp("works/novo/01", 1), papel="authenticated", sub=B, erro="too many bookmarks")
    q(f"delete from public.bookmarks where user_id = '{B}'")
    if paralelo:
        lotes = [(f"insert into public.bookmarks (page_id, paragrafo) select 'works/l{k}-' || g || '/01', 1 from generate_series(1, 1000) g", "authenticated", C) for k in range(3)]
        res = paralelo(lotes)
        ok_, saida_, _ = q(f"select count(*) from public.bookmarks where user_id = '{C}'")
        certo = ok_ and saida_ == "1000" and sum(1 for o, _ in res if o) == 1 and all("too many bookmarks" in e for o, e in res if not o)
        resultados.append((certo, "marca-página: 3 lotes de 1000 ao mesmo tempo param em 1000"))
        print(("✔ " if certo else "✗ ") + f"marca-página: 3 lotes de 1000 ao mesmo tempo param em 1000 (ficaram {saida_})")
        q(f"delete from public.bookmarks where user_id = '{C}'")
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{C}'; " + mp("works/firestriker/01", 3) + ";")
    caso("marca-página: some junto com a conta", f"delete from auth.users where id = '{C}'", depois="select count(*) from public.bookmarks", espera="0")

    # 9b) histórias favoritas (migração 20261103060000)
    fav = lambda obra, extra="": f"insert into public.favorites (work_id{', user_id' if extra else ''}) values ('{obra}'{', ' + extra if extra else ''})"
    caso("favoritos: quem tem conta favorita uma obra", fav("firestriker"), papel="authenticated", sub=B,
         depois=f"select string_agg(work_id, ',') from public.favorites where user_id = '{B}'", espera="firestriker")
    caso("favoritos: favoritar de novo a mesma obra não duplica (on conflict do nothing)", fav("firestriker") + " on conflict do nothing", papel="authenticated", sub=B,
         depois=f"select count(*) from public.favorites where user_id = '{B}'", espera="1")
    ok_, saida_, _ = q("select count(*) from public.favorites", "authenticated", A)
    resultados.append((ok_ and saida_ == "0", "favoritos: o Admin não vê os da Bia"))
    print(("✔ " if ok_ and saida_ == "0" else "✗ ") + "favoritos: o Admin não vê os da Bia")
    ok_, saida_, _ = q("select count(*) from public.favorites", "anon")
    resultados.append((not ok_, "favoritos: visitante sem conta não lê a tabela"))
    print(("✔ " if not ok_ else "✗ ") + "favoritos: visitante sem conta não lê a tabela")
    caso("favoritos: visitante sem conta não favorita", fav("hdvr"), papel="anon", erro="permission denied")
    caso("favoritos: ninguém favorita em nome de outra pessoa", fav("hdvr", f"'{B}'"), papel="authenticated", sub=A, erro="not allowed")
    caso("favoritos: ninguém apaga o de outra pessoa", "delete from public.favorites", papel="authenticated", sub=A,
         depois=f"select count(*) from public.favorites where user_id = '{B}'", espera="1")
    caso("favoritos: ninguém muda um favorito (só entra ou sai)", "update public.favorites set work_id = 'hdvr'", papel="authenticated", sub=B, erro="permission denied")
    caso("favoritos: obra com nome fora do formato é recusada", fav("../x"), papel="authenticated", sub=B, erro="check")
    caso("favoritos: obra com nome gigante é recusada", fav("a" * 81), papel="authenticated", sub=B, erro="check")
    caso("favoritos: tirar o próprio favorito", "delete from public.favorites where work_id = 'firestriker'", papel="authenticated", sub=B,
         depois=f"select count(*) from public.favorites where user_id = '{B}'", espera="0")
    q(f"insert into public.favorites (user_id, work_id) select '{B}', 'obra-' || g from generate_series(1, 300) g")
    caso("favoritos: com 300, uma obra nova é recusada", fav("mais-uma"), papel="authenticated", sub=B, erro="too many favorites")
    caso("favoritos: com 300, favoritar de novo uma que já tem não quebra", fav("obra-5") + " on conflict do nothing", papel="authenticated", sub=B,
         depois=f"select count(*) from public.favorites where user_id = '{B}'", espera="300")
    q(f"delete from public.favorites where user_id = '{B}'")
    if paralelo:
        lotes = [(f"insert into public.favorites (work_id) select 'l{k}-' || g from generate_series(1, 300) g", "authenticated", B) for k in range(3)]
        res = paralelo(lotes)
        ok_, saida_, _ = q(f"select count(*) from public.favorites where user_id = '{B}'")
        certo = ok_ and saida_ == "300" and sum(1 for o, _ in res if o) == 1
        resultados.append((certo, "favoritos: 3 lotes de 300 ao mesmo tempo param em 300"))
        print(("✔ " if certo else "✗ ") + f"favoritos: 3 lotes de 300 ao mesmo tempo param em 300 (ficaram {saida_})")
        q(f"delete from public.favorites where user_id = '{B}'")

    # 9c) fotos de perfil (migração 20261110000000, 09/11/2026)
    arq = lambda nome: f"insert into storage.objects (bucket_id, name) values ('avatars', '{nome}')"
    caso("foto: o balde existe, público, só WebP/JPEG de até 200 KB", "select 1",
         depois="select public || '|' || file_size_limit || '|' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'avatars'",
         espera="true|204800|image/webp,image/jpeg")
    caso("foto: quem tem conta sobe na própria pasta", arq(f"{B}/abcdefghijkl0001.webp"), papel="authenticated", sub=B)
    caso("foto: subir na pasta de outra pessoa é recusado", arq(f"{A}/abcdefghijkl0002.webp"), papel="authenticated", sub=B, erro="row-level security")
    caso("foto: nome fora do formato é recusado (svg, sem pasta, pasta dentro de pasta)", arq(f"{B}/abcdefghijkl0003.svg"), papel="authenticated", sub=B, erro="row-level security")
    caso("foto: arquivo solto, sem pasta, é recusado", arq("abcdefghijkl0004.webp"), papel="authenticated", sub=B, erro="row-level security")
    caso("foto: subpasta é recusada", arq(f"{B}/x/abcdefghijkl0005.webp"), papel="authenticated", sub=B, erro="row-level security")
    caso("foto: visitante sem conta não sobe nada", arq(f"{B}/abcdefghijkl0006.webp"), papel="anon", erro="row-level security")
    caso("foto: JPEG (o Safari) também vale", arq(f"{B}/abcdefghijkl0007.jpg"), papel="authenticated", sub=B)
    caso("foto: com 3 arquivos na pasta (subiu e não trocou), o quarto é recusado", arq(f"{B}/abcdefghijkl0008.webp") + "; " + arq(f"{B}/abcdefghijkl0009.webp"),
         papel="authenticated", sub=B, erro="row-level security")
    caso("foto: pôr no perfil um arquivo que está na pasta", f"select public.set_my_avatar('{B}/abcdefghijkl0001.webp')", papel="authenticated", sub=B,
         depois=f"select avatar_path from public.profiles where id = '{B}'", espera=f"{B}/abcdefghijkl0001.webp")
    caso("foto: trocar devolve o caminho antigo (o navegador apaga o velho)", f"select public.set_my_avatar('{B}/abcdefghijkl0007.jpg')", papel="authenticated", sub=B,
         depois=f"select avatar_path from public.profiles where id = '{B}'", espera=f"{B}/abcdefghijkl0007.jpg")
    ok_, saida_, _ = q(f"select public.set_my_avatar('{B}/abcdefghijkl0001.webp')", "authenticated", B)
    certo = ok_ and saida_ == f"{B}/abcdefghijkl0007.jpg"
    resultados.append((certo, "foto: set_my_avatar devolve o caminho anterior"))
    print(("✔ " if certo else "✗ ") + "foto: set_my_avatar devolve o caminho anterior" + ("" if certo else f" (veio {saida_!r})"))
    caso("foto: arquivo que não existe no balde é recusado", f"select public.set_my_avatar('{B}/zzzzzzzzzzzz0000.webp')", papel="authenticated", sub=B, erro="avatar not found")
    caso("foto: arquivo de outra pessoa é recusado", f"select public.set_my_avatar('{A}/abcdefghijkl0002.webp')", papel="authenticated", sub=B, erro="invalid avatar")
    caso("foto: caminho estranho é recusado", "select public.set_my_avatar('javascript:alert(1)')", papel="authenticated", sub=B, erro="invalid avatar")
    caso("foto: visitante sem conta não chama set_my_avatar", "select public.set_my_avatar(null)", papel="anon", erro="permission denied")
    caso("foto: ninguém escreve o caminho direto na tabela", f"update public.profiles set avatar_path = '{B}/abcdefghijkl0001.webp'", papel="authenticated", sub=B, erro="permission denied")
    caso("foto: nem o banco aceita, no perfil, caminho de outra pasta", f"update public.profiles set avatar_path = '{A}/abcdefghijkl0002.webp' where id = '{B}'", erro="check")
    caso("foto: a pessoa não vê a pasta de outra", "select count(*) from storage.objects", papel="authenticated", sub=A, depois="select 1", espera="1")
    ok_, saida_, _ = q("select count(*) from storage.objects", "authenticated", A)
    certo = ok_ and saida_ == "0"
    resultados.append((certo, "foto: listar o balde só mostra a própria pasta"))
    print(("✔ " if certo else "✗ ") + "foto: listar o balde só mostra a própria pasta" + ("" if certo else f" (veio {saida_!r})"))
    caso("foto: ninguém apaga o arquivo de outra pessoa", "delete from storage.objects", papel="authenticated", sub=A, depois="select count(*) from storage.objects", espera="2")
    caso("foto: apagar o próprio arquivo velho", f"delete from storage.objects where name = '{B}/abcdefghijkl0007.jpg'", papel="authenticated", sub=B,
         depois="select count(*) from storage.objects", espera="1")
    caso("foto: tirar a foto (null) volta para a runa", "select public.set_my_avatar(null)", papel="authenticated", sub=B,
         depois=f"select coalesce(avatar_path, 'runa') from public.profiles where id = '{B}'", espera="runa")
    q("delete from storage.objects")

    # 9d) imagens nos comentários (migração 20261110120000, 10/11/2026); A é o admin, B e C são contas comuns
    img = lambda nome: f"insert into storage.objects (bucket_id, name) values ('comment-images', '{nome}')"
    caso("imagem: o balde existe, público, só WebP/JPEG/GIF de até 2 MB", "select 1",
         depois="select public || '|' || file_size_limit || '|' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'comment-images'",
         espera="true|2097152|image/webp,image/jpeg,image/gif")
    caso("imagem: quem tem conta sobe na própria pasta (webp, jpg, gif)", img(f"{B}/abcdefghijkl0001.webp") + "; " + img(f"{B}/abcdefghijkl0002.jpg") + "; " + img(f"{B}/abcdefghijkl0003.gif"),
         papel="authenticated", sub=B)
    caso("imagem: na pasta de outra pessoa é recusado", img(f"{C}/abcdefghijkl0004.webp"), papel="authenticated", sub=B, erro="row-level security")
    caso("imagem: svg é recusado", img(f"{B}/abcdefghijkl0005.svg"), papel="authenticated", sub=B, erro="row-level security")
    caso("imagem: subpasta é recusada", img(f"{B}/x/abcdefghijkl0006.webp"), papel="authenticated", sub=B, erro="row-level security")
    caso("imagem: visitante sem conta não sobe nada", img(f"{B}/abcdefghijkl0007.webp"), papel="anon", erro="row-level security")
    caso("imagem: visitante sem conta não conta arquivos", "select public.minhas_imagens()", papel="anon", erro="permission denied")
    caso("imagem: minhas_imagens só conta a pasta de quem chama", "select 1", depois="select 1", espera="1")
    ok_, saida_, _ = q("select public.minhas_imagens()", "authenticated", C)
    certo = ok_ and saida_ == "0"
    resultados.append((certo, "imagem: minhas_imagens de C (sem arquivos) é 0, mesmo com os de B no balde"))
    print(("✔ " if certo else "✗ ") + "imagem: minhas_imagens de C é 0" + ("" if certo else f" (veio {saida_!r})"))
    caso("imagem: 30 por dia; a 31ª é recusada", "; ".join(img(f"{C}/abcdefghij{n:06d}.webp") for n in range(30)), papel="authenticated", sub=C,
         depois=f"select count(*) from storage.objects where name like '{C}/%'", espera="30")
    caso("imagem: a 31ª do dia é recusada", img(f"{C}/abcdefghijzzzzzz.webp"), papel="authenticated", sub=C, erro="row-level security")
    caso("imagem: C não vê a pasta de B", "select 1", depois="select 1", espera="1")
    ok_, saida_, _ = q(f"select count(*) from storage.objects where bucket_id = 'comment-images' and name like '{B}/%'", "authenticated", C)
    certo = ok_ and saida_ == "0"
    resultados.append((certo, "imagem: listar o balde só mostra a própria pasta"))
    print(("✔ " if certo else "✗ ") + "imagem: listar o balde só mostra a própria pasta" + ("" if certo else f" (veio {saida_!r})"))
    caso("imagem: C não apaga arquivo de B", f"delete from storage.objects where name like '{B}/%'", papel="authenticated", sub=C,
         depois=f"select count(*) from storage.objects where name like '{B}/%'", espera="3")
    caso("imagem: B apaga o próprio", f"delete from storage.objects where name = '{B}/abcdefghijkl0001.webp'", papel="authenticated", sub=B,
         depois=f"select count(*) from storage.objects where name like '{B}/%'", espera="2")
    caso("imagem: o admin apaga o de qualquer um (moderação)", f"delete from storage.objects where bucket_id = 'comment-images' and name = '{B}/abcdefghijkl0002.jpg'", papel="authenticated", sub=A,
         depois=f"select count(*) from storage.objects where name like '{B}/%'", espera="1")
    caso("imagem: ninguém troca um arquivo (sem update)", f"update storage.objects set name = '{B}/zzzzzzzzzzzz.webp' where bucket_id = 'comment-images'", papel="authenticated", sub=B,
         depois=f"select count(*) from storage.objects where name = '{B}/zzzzzzzzzzzz.webp'", espera="0")
    caso("imagem: o admin não sobe na pasta dos outros", img(f"{B}/abcdefghijkl0099.webp"), papel="authenticated", sub=A, erro="row-level security")
    caso("imagem: as policies das fotos de perfil continuam só para o balde avatars", f"insert into storage.objects (bucket_id, name) values ('avatars', '{B}/abcdefghijkl0010.gif')",
         papel="authenticated", sub=B, erro="row-level security")
    q("delete from storage.objects")

    # 10) a janela da conta (migração 20261103040000): trocar o próprio nome, apagar a própria conta
    caso("conta: trocar o próprio nome (limpa espaços)", "select public.change_my_name('  Bia   Nova  ')", papel="authenticated", sub=B,
         depois=f"select display_name from public.profiles where id = '{B}'", espera="Bia Nova")
    caso("conta: nome com 1 caractere é recusado", "select public.change_my_name(' x ')", papel="authenticated", sub=B, erro="name length")
    caso("conta: nome com mais de 30 é recusado", "select public.change_my_name(repeat('a', 31))", papel="authenticated", sub=B, erro="name length")
    caso("conta: nome com caractere de controle é recusado", "select public.change_my_name('Bia' || chr(7) || 'x')", papel="authenticated", sub=B, erro="invalid name")
    caso("conta: visitante sem conta não troca nome", "select public.change_my_name('Fulano')", papel="anon", erro="permission denied")
    caso("conta: ninguém troca o nome direto na tabela (nem vira admin)", "update public.profiles set display_name = 'Hacker', is_admin = true", papel="authenticated", sub=B,
         erro="permission denied")
    caso("conta: trocar o nome não mexe no de outra pessoa", "select 1",
         depois=f"select display_name from public.profiles where id = '{A}'", espera="Admin")
    # revisão de 03/11: uma troca por hora; invisíveis e direção do texto; nome do autor reservado; mesma regra no cadastro
    caso("conta: segunda troca na mesma hora é recusada", "select public.change_my_name('Outra')", papel="authenticated", sub=B, erro="rate limit",
         depois=f"select display_name from public.profiles where id = '{B}'", espera="Bia Nova")
    caso("conta: salvar o mesmo nome de novo não gasta a troca", "select public.change_my_name(' Bia  Nova ')", papel="authenticated", sub=B,
         depois=f"select display_name from public.profiles where id = '{B}'", espera="Bia Nova")
    libera = lambda uid: q(f"update public.profiles set name_changed_at = now() - interval '2 hours' where id = '{uid}'")
    for nome_, ataque in (("espaço de largura zero", "E'Bi\\u200Ba'"), ("RLO (inverte a data)", "E'\\u202Eaib'"), ("dois espaços sem quebra", "E'\\u00A0\\u00A0'"),
                          ("preenchimento Hangul", "E'\\u3164\\u3164'"), ("BOM", "E'B\\uFEFFia'")):
        libera(B)
        caso(f"conta: nome com {nome_} é recusado", f"select public.change_my_name({ataque})", papel="authenticated", sub=B, erro="name")
    libera(B)
    caso("conta: nome do autor é reservado (Lúsca, LUSCA_sharktopus…)", "select public.change_my_name('L\u00FAsca Sharktopus')", papel="authenticated", sub=B, erro="name taken")
    caso("conta: emoji e outros alfabetos valem", "select public.change_my_name('Jos\u00E9 \u5C71\u7530 \U0001F468\u200D\U0001F469\u200D\U0001F467')", papel="authenticated", sub=B,
         depois=f"select display_name like 'José 山田 %' from public.profiles where id = '{B}'", espera="t")
    caso("conta: o admin pode usar o nome do autor", "select public.change_my_name('Lusca Sharktopus')", papel="authenticated", sub=A,
         depois=f"select display_name from public.profiles where id = '{A}'", espera="Lusca Sharktopus")
    F = "00000000-0000-0000-0000-00000000000f"
    caso("conta: cadastro com nome que não passa (RLO, ou o do autor) vira user-xxxxxx",
         f"insert into auth.users (id, email, raw_user_meta_data) values ('{F}', 'f@x', jsonb_build_object('full_name', 'Lusca Sharktopus'))",
         depois=f"select display_name from public.profiles where id = '{F}'", espera="user-000000")
    q(f"delete from auth.users where id = '{F}'")
    E = "00000000-0000-0000-0000-00000000000e"
    q(f"insert into auth.users (id, email, raw_user_meta_data) values ('{E}', 'e@x', '{{\"display_name\":\"Eva\"}}')")
    pagina_e = "works/firestriker/01"
    # Eva: um comentário com resposta da Bia, um sem resposta e uma resposta dela a um comentário da Bia; um marca-página
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{E}'; " + ins("da Eva com resposta", pagina_e))
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{B}'; " +
      ins("resposta da Bia", pagina_e, f"(select id from public.comments where body = 'da Eva com resposta')"))
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{E}'; " + ins("da Eva sem resposta", pagina_e))
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{B}'; " + ins("raiz da Bia", pagina_e))
    envelhecer()
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{E}'; " +
      ins("resposta da Eva", pagina_e, f"(select id from public.comments where body = 'raiz da Bia')"))
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{E}'; " + mp("works/firestriker/01", 5))
    q(f"set local role authenticated; set local request.jwt.claim.sub = '{E}'; " + fav("firestriker"))
    caso("conta: visitante sem conta não apaga conta nenhuma", "select public.delete_my_account()", papel="anon", erro="permission denied",
         depois="select count(*) from auth.users", espera="3")
    caso("conta: apagar a própria conta leva o usuário, o perfil e os marca-páginas", "select public.delete_my_account()", papel="authenticated", sub=E,
         depois=f"select (select count(*) from auth.users where id = '{E}') || '|' || (select count(*) from public.profiles where id = '{E}') || '|' || "
                f"(select count(*) from public.bookmarks where user_id = '{E}') || '|' || (select count(*) from public.favorites where user_id = '{E}') || '|' || (select count(*) from auth.users)",
         espera="0|0|0|0|2")
    caso("conta: comentários da conta apagada (com resposta vira [apagado]; o resto some; os da Bia ficam)", "select 1",
         depois=f"select string_agg(case when deleted_at is null then body else '[apagado]' end, ',' order by id) from public.comments where page_id = '{pagina_e}'",
         espera="[apagado],resposta da Bia,raiz da Bia")

    falhas = [n for ok, n in resultados if not ok]
    print(f"\n{len(resultados) - len(falhas)}/{len(resultados)} casos certos" + (f"; FALHARAM: {falhas}" if falhas else ""))
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
