-- ---------------------------------------------------------------------
-- Alteracao cadastral com validacao da secretaria
--
-- Ate aqui o estudante alterava os proprios dados direto na tabela
-- (RF22, policy estudante_update_proprio). No app do estudante a regra
-- passa a ser outra: o que ele grava fica PENDENTE ate a secretaria
-- validar. O app mostra o campo em laranja com "Pendente" enquanto isso.
--
-- O valor so chega em public.estudante quando a alteracao e aprovada,
-- por isso a aplicacao acontece dentro de revisar_alteracao_cadastral(),
-- que roda como security definer.
-- ---------------------------------------------------------------------

do $$
begin
  create type alteracao_status as enum ('pendente', 'aprovada', 'recusada');
exception when duplicate_object then null;
end;
$$;

-- Campos que o estudante pode pedir para mudar. Fora desta lista nada
-- entra: prontuario, status_documental e ativo sao da secretaria.
create or replace function public.campo_cadastral_editavel(p_campo text)
returns boolean
language sql
immutable
as $$
  select p_campo in (
    'nome', 'telefone', 'email', 'curso', 'endereco',
    'data_nascimento', 'universidade_id', 'cidade_id', 'perfil_uso'
  );
$$;

create table if not exists public.alteracao_cadastral (
  id             uuid primary key default gen_random_uuid(),
  estudante_id   uuid not null references public.estudante(id) on delete cascade,
  campo          text not null check (public.campo_cadastral_editavel(campo)),
  valor_anterior text,
  valor_novo     text,
  status         alteracao_status not null default 'pendente',
  observacao     text,
  revisado_por   uuid references public.perfil(id) on delete set null,
  revisado_em    timestamptz,
  criado_em      timestamptz not null default now()
);

-- Um pendente por campo: reenviar o mesmo campo substitui o anterior.
create unique index if not exists alteracao_cadastral_pendente_unica
  on public.alteracao_cadastral (estudante_id, campo)
  where status = 'pendente';

create index if not exists alteracao_cadastral_fila
  on public.alteracao_cadastral (status, criado_em desc);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.alteracao_cadastral enable row level security;

drop policy if exists alteracao_staff on public.alteracao_cadastral;
create policy alteracao_staff on public.alteracao_cadastral
  for all using (public.eh_staff()) with check (public.eh_staff());

drop policy if exists alteracao_propria_select on public.alteracao_cadastral;
create policy alteracao_propria_select on public.alteracao_cadastral
  for select using (estudante_id = public.meu_estudante_id());

-- O estudante cria os proprios pedidos; quem decide e a secretaria, por
-- isso nao ha policy de update nem de delete para ele.
drop policy if exists alteracao_propria_insert on public.alteracao_cadastral;
create policy alteracao_propria_insert on public.alteracao_cadastral
  for insert with check (estudante_id = public.meu_estudante_id());

-- ---------------------------------------------------------------------
-- Envio: o app manda {"campo": "valor novo"} e a funcao registra apenas
-- o que realmente mudou em relacao ao cadastro atual.
-- ---------------------------------------------------------------------
create or replace function public.solicitar_alteracao_cadastral(p_campos jsonb)
returns setof public.alteracao_cadastral
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estudante_id uuid := public.meu_estudante_id();
  v_campo        text;
  v_novo         text;
  v_atual        text;
begin
  if v_estudante_id is null then
    raise exception 'Cadastro de estudante nao encontrado.';
  end if;

  for v_campo, v_novo in select key, value #>> '{}' from jsonb_each(p_campos) loop
    if not public.campo_cadastral_editavel(v_campo) then
      raise exception 'O campo % nao pode ser alterado por aqui.', v_campo;
    end if;

    execute format('select %I::text from public.estudante where id = $1', v_campo)
      into v_atual
      using v_estudante_id;

    -- Nada a fazer quando o valor enviado e igual ao que ja esta gravado.
    if v_atual is not distinct from v_novo then
      continue;
    end if;

    -- Reenvio do mesmo campo substitui o pedido pendente anterior.
    delete from public.alteracao_cadastral
      where estudante_id = v_estudante_id and campo = v_campo and status = 'pendente';

    insert into public.alteracao_cadastral (estudante_id, campo, valor_anterior, valor_novo)
      values (v_estudante_id, v_campo, v_atual, v_novo);
  end loop;

  return query
    select * from public.alteracao_cadastral
      where estudante_id = v_estudante_id and status = 'pendente'
      order by criado_em;
end;
$$;

revoke all on function public.solicitar_alteracao_cadastral(jsonb) from public;
grant execute on function public.solicitar_alteracao_cadastral(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Revisao pela secretaria. Aprovar aplica o valor no cadastro; o cast
-- usa o tipo real da coluna, entao uuid, date e enum entram certo.
-- ---------------------------------------------------------------------
create or replace function public.revisar_alteracao_cadastral(
  p_id         uuid,
  p_aprovar    boolean,
  p_observacao text default null
)
returns public.alteracao_cadastral
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linha public.alteracao_cadastral;
  v_tipo  text;
begin
  if not public.eh_staff() then
    raise exception 'Sem permissao para revisar alteracoes cadastrais.';
  end if;

  select * into v_linha from public.alteracao_cadastral where id = p_id for update;
  if not found then
    raise exception 'Alteracao nao encontrada.';
  end if;
  if v_linha.status <> 'pendente' then
    raise exception 'Esta alteracao ja foi revisada.';
  end if;

  if p_aprovar then
    select atttypid::regtype::text into v_tipo
      from pg_attribute
      where attrelid = 'public.estudante'::regclass
        and attname = v_linha.campo
        and attnum > 0;

    execute format('update public.estudante set %I = $1::%s, atualizado_em = now() where id = $2',
                   v_linha.campo, v_tipo)
      using v_linha.valor_novo, v_linha.estudante_id;
  end if;

  update public.alteracao_cadastral
     set status       = case when p_aprovar then 'aprovada' else 'recusada' end::alteracao_status,
         observacao   = p_observacao,
         revisado_por = auth.uid(),
         revisado_em  = now()
   where id = p_id
   returning * into v_linha;

  return v_linha;
end;
$$;

revoke all on function public.revisar_alteracao_cadastral(uuid, boolean, text) from public;
grant execute on function public.revisar_alteracao_cadastral(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- Nova pagina no painel administrativo: a fila de validacao.
-- Precisa espelhar src/lib/paginas.ts (chave 'alteracoes').
-- ---------------------------------------------------------------------
create or replace function public.paginas_do_sistema()
returns text[]
language sql
immutable
as $$
  select array[
    'dashboard', 'alocacao', 'presenca', 'rotas',
    'estudantes', 'veiculos', 'motoristas', 'universidades',
    'documentos', 'alteracoes', 'relatorios', 'funcionarios',
    'solicitacoes', 'mensagens', 'configuracoes'
  ];
$$;

-- Quem ja validava documentos passa a enxergar a fila de alteracoes:
-- sem isso o operador teria a pagina no menu e barrada na entrada.
insert into public.permissao_pagina (perfil_id, pagina)
select pp.perfil_id, 'alteracoes'
  from public.permissao_pagina pp
 where pp.pagina = 'documentos'
on conflict do nothing;
