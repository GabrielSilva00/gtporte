-- ---------------------------------------------------------------------
-- Reenvio e remocao de documentos pelo estudante + grade sujeita a
-- validacao da secretaria
--
-- Dois problemas de permissao vinham de 0002_rls.sql:
--
--  1. documento_update_admin permite UPDATE apenas ao administrador, mas
--     o aplicativo reenvia o documento com update/upsert. O reenvio
--     falhava calado para o estudante.
--  2. documento_delete exige status = 'pendente'. Documento REJEITADO
--     nao podia ser atualizado nem removido pelo proprio estudante,
--     entao nao havia como corrigir o que a secretaria recusou — que e
--     justamente o caso em que reenviar importa.
--
-- A saida nao e afrouxar as policies e sim passar pelas funcoes abaixo,
-- que rodam como security definer e garantem que o documento sempre
-- volte para a fila como 'pendente'.
-- ---------------------------------------------------------------------

create or replace function public.reenviar_documento(
  p_tipo          tipo_documento,
  p_nome_arquivo  text,
  p_storage_path  text
)
returns public.documento
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estudante_id uuid := public.meu_estudante_id();
  v_linha public.documento;
begin
  if v_estudante_id is null then
    raise exception 'Cadastro de estudante nao encontrado.';
  end if;

  -- Documento aprovado nao e substituido pelo estudante: a troca teria
  -- que passar por nova conferencia da secretaria de qualquer forma.
  if exists (
    select 1 from public.documento
     where estudante_id = v_estudante_id and tipo = p_tipo and status = 'aprovado'
  ) then
    raise exception 'Documento ja aprovado. Procure a secretaria para substitui-lo.';
  end if;

  insert into public.documento (estudante_id, tipo, nome_arquivo, storage_path, status)
       values (v_estudante_id, p_tipo, p_nome_arquivo, p_storage_path, 'pendente')
  on conflict (estudante_id, tipo) do update
     set nome_arquivo = excluded.nome_arquivo,
         storage_path = excluded.storage_path,
         status       = 'pendente',
         observacao   = null,
         revisado_por = null,
         revisado_em  = null,
         criado_em    = now()
  returning * into v_linha;

  return v_linha;
end;
$$;

revoke all on function public.reenviar_documento(tipo_documento, text, text) from public;
grant execute on function public.reenviar_documento(tipo_documento, text, text) to authenticated;


create or replace function public.remover_documento(p_tipo tipo_documento)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estudante_id uuid := public.meu_estudante_id();
  v_caminho text;
  v_status  status_documental;
begin
  if v_estudante_id is null then
    raise exception 'Cadastro de estudante nao encontrado.';
  end if;

  select storage_path, status into v_caminho, v_status
    from public.documento
   where estudante_id = v_estudante_id and tipo = p_tipo;

  if not found then
    raise exception 'Documento nao encontrado.';
  end if;
  if v_status = 'aprovado' then
    raise exception 'Documento ja aprovado nao pode ser removido.';
  end if;

  delete from public.documento
   where estudante_id = v_estudante_id and tipo = p_tipo;

  -- Devolve o caminho para o app apagar o arquivo no storage, onde a
  -- policy ja permite que o estudante remova o que esta na pasta dele.
  return v_caminho;
end;
$$;

revoke all on function public.remover_documento(tipo_documento) from public;
grant execute on function public.remover_documento(tipo_documento) to authenticated;


-- =====================================================================
-- Grade de aulas com validacao da secretaria
--
-- A grade define em que rota o estudante cabe (RN02). Ate aqui ele
-- reescrevia a propria grade direto, o que muda a alocacao sem ninguem
-- conferir. Passa a funcionar como os demais dados cadastrais: fica
-- pendente ate a secretaria validar.
-- =====================================================================
create table if not exists public.alteracao_grade (
  id           uuid primary key default gen_random_uuid(),
  estudante_id uuid not null references public.estudante(id) on delete cascade,
  -- [{dia_semana, hora_inicio, hora_fim}, ...] — a grade inteira proposta
  grade        jsonb not null,
  status       alteracao_status not null default 'pendente',
  observacao   text,
  revisado_por uuid references public.perfil(id) on delete set null,
  revisado_em  timestamptz,
  criado_em    timestamptz not null default now()
);

-- Um pedido pendente por estudante: reenviar substitui o anterior.
create unique index if not exists alteracao_grade_pendente_unica
  on public.alteracao_grade (estudante_id) where status = 'pendente';

create index if not exists alteracao_grade_fila
  on public.alteracao_grade (status, criado_em desc);

alter table public.alteracao_grade enable row level security;

drop policy if exists alteracao_grade_staff on public.alteracao_grade;
create policy alteracao_grade_staff on public.alteracao_grade
  for all using (public.eh_staff()) with check (public.eh_staff());

drop policy if exists alteracao_grade_propria_select on public.alteracao_grade;
create policy alteracao_grade_propria_select on public.alteracao_grade
  for select using (estudante_id = public.meu_estudante_id());

drop policy if exists alteracao_grade_propria_insert on public.alteracao_grade;
create policy alteracao_grade_propria_insert on public.alteracao_grade
  for insert with check (estudante_id = public.meu_estudante_id());


create or replace function public.solicitar_alteracao_grade(p_grade jsonb)
returns public.alteracao_grade
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estudante_id uuid := public.meu_estudante_id();
  v_linha public.alteracao_grade;
begin
  if v_estudante_id is null then
    raise exception 'Cadastro de estudante nao encontrado.';
  end if;
  if jsonb_typeof(p_grade) <> 'array' then
    raise exception 'Grade invalida.';
  end if;

  delete from public.alteracao_grade
   where estudante_id = v_estudante_id and status = 'pendente';

  insert into public.alteracao_grade (estudante_id, grade)
       values (v_estudante_id, p_grade)
  returning * into v_linha;

  return v_linha;
end;
$$;

revoke all on function public.solicitar_alteracao_grade(jsonb) from public;
grant execute on function public.solicitar_alteracao_grade(jsonb) to authenticated;


create or replace function public.revisar_alteracao_grade(
  p_id         uuid,
  p_aprovar    boolean,
  p_observacao text default null
)
returns public.alteracao_grade
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linha public.alteracao_grade;
begin
  if not public.eh_staff() then
    raise exception 'Sem permissao para revisar a grade.';
  end if;

  select * into v_linha from public.alteracao_grade where id = p_id for update;
  if not found then
    raise exception 'Solicitacao nao encontrada.';
  end if;
  if v_linha.status <> 'pendente' then
    raise exception 'Esta solicitacao ja foi revisada.';
  end if;

  if p_aprovar then
    -- A grade e reescrita por inteiro: dia que saiu da proposta deixa de existir.
    delete from public.grade_horaria where estudante_id = v_linha.estudante_id;

    insert into public.grade_horaria (estudante_id, dia_semana, hora_inicio, hora_fim)
    select v_linha.estudante_id,
           (item->>'dia_semana')::smallint,
           (item->>'hora_inicio')::time,
           (item->>'hora_fim')::time
      from jsonb_array_elements(v_linha.grade) as item;
  end if;

  update public.alteracao_grade
     set status       = case when p_aprovar then 'aprovada' else 'recusada' end::alteracao_status,
         observacao   = p_observacao,
         revisado_por = auth.uid(),
         revisado_em  = now()
   where id = p_id
   returning * into v_linha;

  return v_linha;
end;
$$;

revoke all on function public.revisar_alteracao_grade(uuid, boolean, text) from public;
grant execute on function public.revisar_alteracao_grade(uuid, boolean, text) to authenticated;
