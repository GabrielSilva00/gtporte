-- =====================================================================
-- GTPORTE - 0010_documento_motorista.sql
-- O motorista tambem envia documentos para aprovacao.
--
-- Por que uma tabela irma e nao generalizar 'documento' com
-- titular_tipo/titular_id: os tipos de documento sao disjuntos
-- ('matricula' nao existe para motorista, 'cnh_frente' nao existe para
-- estudante). Um enum unico misturando os dois seria modelagem pior, e
-- generalizar custaria a chave estrangeira real, o unique
-- (estudante_id, tipo), o trigger de status_documental, as quatro RPCs
-- de aprovacao e a migracao dos dados ja existentes.
--
-- ATENCAO: este arquivo recria as quatro policies de storage.objects do
-- bucket 'documentos', que tambem sao criadas em 0002_rls.sql.
-- Reexecutar 0002 DEPOIS deste arquivo revoga o acesso do motorista aos
-- proprios arquivos. A partir daqui, 0010 e a fonte da verdade delas.
-- Idempotente: pode ser reexecutada.
-- =====================================================================

do $enum$ begin
  create type tipo_documento_motorista as enum (
    'cnh_frente', 'cnh_verso', 'residencia', 'toxicologico',
    'aso', 'certificado', 'contrato', 'outro'
  );
exception when duplicate_object then null; end $enum$;

create table if not exists public.documento_motorista (
  id           uuid primary key default gen_random_uuid(),
  motorista_id uuid not null references public.motorista(id) on delete cascade,
  tipo         tipo_documento_motorista not null,
  nome_arquivo text not null,
  storage_path text not null,
  validade     date,   -- toxicologico, ASO e certificados vencem
  status       status_documental not null default 'pendente',
  observacao   text,
  revisado_por uuid references public.perfil(id) on delete set null,
  revisado_em  timestamptz,
  criado_em    timestamptz not null default now()
);

-- Certificados de curso e "outro" podem se repetir; os demais tipos sao
-- slot unico por motorista, como acontece com o estudante.
create unique index if not exists idx_docmot_unico
  on public.documento_motorista(motorista_id, tipo)
  where tipo not in ('certificado', 'outro');

create index if not exists idx_docmot_motorista on public.documento_motorista(motorista_id);
create index if not exists idx_docmot_status    on public.documento_motorista(status);

alter table public.motorista
  add column if not exists status_documental status_documental not null default 'pendente';

-- ---------------------------------------------------------------------
-- Status documental do motorista
-- Mesma regra do estudante (0006_ajustes.sql): um unico documento
-- rejeitado ainda e pendencia; so consta rejeitado quando todos forem.
-- Sao 4 os documentos considerados obrigatorios: CNH frente, CNH verso,
-- comprovante de residencia e exame toxicologico.
-- ---------------------------------------------------------------------
create or replace function public.recalcular_status_documental_motorista(p_motorista_id uuid)
returns status_documental
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_total      int;
  v_aprovados  int;
  v_rejeitados int;
  v_novo       status_documental;
begin
  select count(*),
         count(*) filter (where status = 'aprovado'),
         count(*) filter (where status = 'rejeitado')
    into v_total, v_aprovados, v_rejeitados
    from public.documento_motorista
   where motorista_id = p_motorista_id
     and tipo in ('cnh_frente', 'cnh_verso', 'residencia', 'toxicologico');

  if v_aprovados >= 4 then
    v_novo := 'aprovado';
  elsif v_total >= 4 and v_rejeitados = v_total then
    v_novo := 'rejeitado';
  else
    v_novo := 'pendente';
  end if;

  update public.motorista set status_documental = v_novo where id = p_motorista_id;
  return v_novo;
end;
$fn$;

create or replace function public.tg_documento_motorista_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.recalcular_status_documental_motorista(
    coalesce(new.motorista_id, old.motorista_id)
  );
  return null;
end;
$fn$;

drop trigger if exists trg_docmot_status on public.documento_motorista;
create trigger trg_docmot_status
  after insert or update or delete on public.documento_motorista
  for each row execute function public.tg_documento_motorista_status();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.documento_motorista enable row level security;

drop policy if exists docmot_select on public.documento_motorista;
create policy docmot_select on public.documento_motorista
  for select using (
    public.eh_staff() or motorista_id = public.meu_motorista_id()
  );

drop policy if exists docmot_insert on public.documento_motorista;
create policy docmot_insert on public.documento_motorista
  for insert with check (
    public.eh_staff() or motorista_id = public.meu_motorista_id()
  );

-- RN07: aprovar ou rejeitar e exclusivo do administrador
drop policy if exists docmot_update on public.documento_motorista;
create policy docmot_update on public.documento_motorista
  for update using (public.eh_admin());

drop policy if exists docmot_delete on public.documento_motorista;
create policy docmot_delete on public.documento_motorista
  for delete using (
    public.eh_admin()
    or (motorista_id = public.meu_motorista_id() and status <> 'aprovado')
  );

-- ---------------------------------------------------------------------
-- RPCs de revisao, espelhando as do estudante
-- ---------------------------------------------------------------------
create or replace function public.aprovar_documento_motorista(p_documento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_motorista uuid;
  v_status    status_documental;
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores podem aprovar documentos';
  end if;

  update public.documento_motorista
     set status = 'aprovado', observacao = null,
         revisado_por = auth.uid(), revisado_em = now()
   where id = p_documento_id
   returning motorista_id into v_motorista;

  if v_motorista is null then
    raise exception 'Documento nao encontrado';
  end if;

  v_status := public.recalcular_status_documental_motorista(v_motorista);
  perform public.registrar_log('aprovar_documento_motorista', 'documento_motorista',
                               p_documento_id, jsonb_build_object('motorista_id', v_motorista));
  return jsonb_build_object('status_documental', v_status);
end;
$fn$;

create or replace function public.rejeitar_documento_motorista(
  p_documento_id uuid,
  p_observacao   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_motorista uuid;
  v_status    status_documental;
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores podem rejeitar documentos';
  end if;

  if coalesce(trim(p_observacao), '') = '' then
    raise exception 'Informe o motivo da rejeicao';
  end if;

  update public.documento_motorista
     set status = 'rejeitado', observacao = p_observacao,
         revisado_por = auth.uid(), revisado_em = now()
   where id = p_documento_id
   returning motorista_id into v_motorista;

  if v_motorista is null then
    raise exception 'Documento nao encontrado';
  end if;

  v_status := public.recalcular_status_documental_motorista(v_motorista);
  perform public.registrar_log('rejeitar_documento_motorista', 'documento_motorista',
                               p_documento_id, jsonb_build_object('motivo', p_observacao));
  return jsonb_build_object('status_documental', v_status);
end;
$fn$;

create or replace function public.cancelar_aprovacao_documento_motorista(p_documento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_motorista uuid;
  v_status    status_documental;
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores podem cancelar a aprovacao de documentos';
  end if;

  update public.documento_motorista
     set status = 'pendente', observacao = null,
         revisado_por = auth.uid(), revisado_em = now()
   where id = p_documento_id and status = 'aprovado'
   returning motorista_id into v_motorista;

  if v_motorista is null then
    raise exception 'Documento nao encontrado ou nao estava aprovado';
  end if;

  v_status := public.recalcular_status_documental_motorista(v_motorista);
  perform public.registrar_log('cancelar_aprovacao_documento_motorista',
                               'documento_motorista', p_documento_id, null);
  return jsonb_build_object('status_documental', v_status);
end;
$fn$;

create or replace function public.revisar_documentos_motorista(
  p_motorista_id uuid,
  p_status       status_documental,
  p_observacao   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_status status_documental;
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores podem revisar documentos';
  end if;

  if p_status = 'rejeitado' and coalesce(trim(p_observacao), '') = '' then
    raise exception 'Informe o motivo da rejeicao';
  end if;

  update public.documento_motorista
     set status = p_status,
         observacao = case when p_status = 'rejeitado' then p_observacao else null end,
         revisado_por = auth.uid(), revisado_em = now()
   where motorista_id = p_motorista_id and status = 'pendente';

  v_status := public.recalcular_status_documental_motorista(p_motorista_id);
  perform public.registrar_log('revisar_documentos_motorista', 'motorista',
                               p_motorista_id, jsonb_build_object('status', p_status));
  return jsonb_build_object('status_documental', v_status);
end;
$fn$;

grant execute on function public.recalcular_status_documental_motorista(uuid) to authenticated;
grant execute on function public.aprovar_documento_motorista(uuid) to authenticated;
grant execute on function public.rejeitar_documento_motorista(uuid, text) to authenticated;
grant execute on function public.cancelar_aprovacao_documento_motorista(uuid) to authenticated;
grant execute on function public.revisar_documentos_motorista(uuid, status_documental, text) to authenticated;

-- ---------------------------------------------------------------------
-- STORAGE
-- Mesmo bucket privado 'documentos', com um prefixo novo:
--   motorista/{motorista_id}/{tipo}-{timestamp}.{ext}
-- O caminho do estudante comeca com o uuid dele, entao a primeira pasta
-- nunca e a string literal 'motorista' - os dois espacos ficam isolados
-- sem ambiguidade e um bucket novo seria configuracao duplicada.
-- ---------------------------------------------------------------------
drop policy if exists documentos_select on storage.objects;
create policy documentos_select on storage.objects
  for select using (
    bucket_id = 'documentos'
    and (
      public.eh_staff()
      or (storage.foldername(name))[1] = public.meu_estudante_id()::text
      or ((storage.foldername(name))[1] = 'motorista'
          and (storage.foldername(name))[2] = public.meu_motorista_id()::text)
    )
  );

drop policy if exists documentos_insert on storage.objects;
create policy documentos_insert on storage.objects
  for insert with check (
    bucket_id = 'documentos'
    and (
      public.eh_staff()
      or (storage.foldername(name))[1] = public.meu_estudante_id()::text
      or ((storage.foldername(name))[1] = 'motorista'
          and (storage.foldername(name))[2] = public.meu_motorista_id()::text)
    )
  );

-- Update segue restrito ao staff, como em 0002: os caminhos carregam
-- timestamp, entao reenviar um documento e sempre um objeto novo.
drop policy if exists documentos_update on storage.objects;
create policy documentos_update on storage.objects
  for update using (bucket_id = 'documentos' and public.eh_staff());

drop policy if exists documentos_delete on storage.objects;
create policy documentos_delete on storage.objects
  for delete using (
    bucket_id = 'documentos'
    and (
      public.eh_admin()
      or (storage.foldername(name))[1] = public.meu_estudante_id()::text
      or ((storage.foldername(name))[1] = 'motorista'
          and (storage.foldername(name))[2] = public.meu_motorista_id()::text)
    )
  );
