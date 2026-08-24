-- =====================================================================
-- GTPORTE - 0009_organizacao.sql
-- Cadastro institucional do orgao/empresa que opera o transporte.
--
-- Por que uma tabela com colunas tipadas e nao mais chaves em
-- configuracao_sistema: sao cerca de 70 campos, e as vigencias
-- (contrato, apolice, alvara, vistoria) e os valores contratados
-- precisam de date e numeric para o sistema conseguir alertar
-- vencimentos. Alem disso "universidades atendidas" e uma lista de
-- chaves estrangeiras, que em chave/valor viraria um CSV de uuid sem
-- integridade referencial.
--
-- configuracao_sistema permanece intacta para o que ela faz bem:
-- parametros de comportamento do software (site_nome, alerta_*,
-- rn05_antecedencia_horas).
-- Idempotente: pode ser reexecutada.
-- =====================================================================

create table if not exists public.organizacao (
  id        uuid primary key default gen_random_uuid(),
  singleton boolean not null default true,

  -- 1. Dados juridicos e fiscais
  razao_social           text,
  nome_fantasia          text,
  cnpj                   text,
  inscricao_estadual     text,
  inscricao_municipal    text,
  cnae                   text,
  regime_tributario      text,
  unidade_gestora        text,
  vinculo_administrativo text,

  -- 2. Tipo de organizacao
  -- prefeitura | secretaria_educacao | empresa_terceirizada | cooperativa | instituicao_privada
  tipo_organizacao text,

  -- 3. Endereco, contato e gestor de transporte
  logradouro      text,
  numero          text,
  complemento     text,
  bairro          text,
  cidade_id       uuid references public.cidade(id) on delete set null,
  uf              char(2) default 'SP',
  cep             text,
  telefone        text,
  email           text,
  site            text,
  gestor_nome     text,
  gestor_cargo    text,
  gestor_telefone text,
  gestor_email    text,

  -- 4. Contrato (quando o servico e terceirizado)
  contrato_numero           text,
  contrato_licitacao        text,
  contrato_modalidade       text,   -- pregao | dispensa | chamada_publica | inexigibilidade
  contrato_inicio           date,
  contrato_fim              date,
  contrato_valor            numeric(14,2),
  contrato_sla              text,
  contrato_orgao            text,
  contrato_fiscal_nome      text,
  contrato_fiscal_matricula text,

  -- 5. Abrangencia geografica
  zona_atuacao          text,   -- urbana | rural | ambas
  abrangencia_descricao text,
  distritos_atendidos   text,

  -- 6. Licencas e autorizacoes
  detran_registro       text,
  detran_validade       date,
  alvara_numero         text,
  alvara_validade       date,
  autorizacao_municipal text,
  vistoria_ultima       date,
  vistoria_proxima      date,

  -- 7. Responsaveis legais e tecnicos
  responsavel_legal_nome       text,
  responsavel_legal_cpf        text,
  responsavel_legal_email      text,
  responsavel_tecnico_nome     text,
  responsavel_tecnico_registro text,
  responsavel_tecnico_email    text,
  coordenador_nome             text,
  coordenador_email            text,

  -- 8. Seguros obrigatorios
  seguradora              text,
  apolice_numero          text,
  apolice_inicio          date,
  apolice_fim             date,
  apolice_valor_cobertura numeric(14,2),
  app_numero              text,
  app_valor               numeric(14,2),

  -- 9. Parametros operacionais
  turnos                   jsonb not null default '[]'::jsonb,
  tempo_maximo_veiculo_min int,
  monitor_obrigatorio      boolean not null default false,
  periodo_letivo_inicio    date,
  periodo_letivo_fim       date,

  -- 10. Canais de comunicacao
  canal_ouvidoria     text,
  canal_sac           text,
  canal_email         text,
  canal_whatsapp      text,
  horario_atendimento text,
  aplicativo_pais     text,

  -- 11. Fiscalizacao
  orgao_fiscalizador       text,
  fiscalizacao_frequencia  text,
  fiscalizacao_ultima      date,
  fiscalizacao_observacoes text,

  -- 12. Identidade visual
  logo_path      text,
  cor_primaria   text,
  cor_secundaria text,

  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.perfil(id) on delete set null
);

-- Garante uma unica organizacao: o indice parcial so aceita uma linha
-- com singleton verdadeiro.
create unique index if not exists idx_organizacao_singleton
  on public.organizacao((singleton)) where singleton;

insert into public.organizacao (razao_social, nome_fantasia, tipo_organizacao, uf)
select 'Prefeitura Municipal de Aracatuba', 'Setor de Transporte Academico', 'prefeitura', 'SP'
 where not exists (select 1 from public.organizacao);

-- Escolas / universidades atendidas
create table if not exists public.organizacao_universidade (
  organizacao_id  uuid not null references public.organizacao(id) on delete cascade,
  universidade_id uuid not null references public.universidade(id) on delete cascade,
  convenio        text,
  vigencia_inicio date,
  vigencia_fim    date,
  criado_em       timestamptz not null default now(),
  primary key (organizacao_id, universidade_id)
);

-- Municipios / zonas cobertas
create table if not exists public.organizacao_abrangencia (
  organizacao_id uuid not null references public.organizacao(id) on delete cascade,
  cidade_id      uuid not null references public.cidade(id) on delete cascade,
  observacao     text,
  criado_em      timestamptz not null default now(),
  primary key (organizacao_id, cidade_id)
);

-- ---------------------------------------------------------------------
-- RLS
-- Leitura liberada a qualquer autenticado: o estudante e o motorista
-- precisam do contato institucional e do logotipo. Escrita e do admin.
-- ---------------------------------------------------------------------
alter table public.organizacao              enable row level security;
alter table public.organizacao_universidade enable row level security;
alter table public.organizacao_abrangencia  enable row level security;

drop policy if exists organizacao_select on public.organizacao;
create policy organizacao_select on public.organizacao
  for select using (auth.uid() is not null);

drop policy if exists organizacao_write on public.organizacao;
create policy organizacao_write on public.organizacao
  for all using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists organizacao_uni_select on public.organizacao_universidade;
create policy organizacao_uni_select on public.organizacao_universidade
  for select using (auth.uid() is not null);

drop policy if exists organizacao_uni_write on public.organizacao_universidade;
create policy organizacao_uni_write on public.organizacao_universidade
  for all using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists organizacao_abr_select on public.organizacao_abrangencia;
create policy organizacao_abr_select on public.organizacao_abrangencia
  for select using (auth.uid() is not null);

drop policy if exists organizacao_abr_write on public.organizacao_abrangencia;
create policy organizacao_abr_write on public.organizacao_abrangencia
  for all using (public.eh_admin()) with check (public.eh_admin());

-- Marca quem alterou e quando, sem depender do front lembrar de mandar.
create or replace function public.tg_organizacao_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  new.atualizado_em  := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$fn$;

drop trigger if exists trg_organizacao_auditoria on public.organizacao;
create trigger trg_organizacao_auditoria
  before update on public.organizacao
  for each row execute function public.tg_organizacao_auditoria();

-- ---------------------------------------------------------------------
-- Bucket publico para o logotipo
-- O logo aparece na tela de login, antes da autenticacao, entao uma
-- signed URL de bucket privado nao serve. E o unico arquivo publico do
-- sistema; documentos pessoais seguem no bucket privado.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('institucional', 'institucional', true)
on conflict (id) do nothing;

drop policy if exists institucional_select on storage.objects;
create policy institucional_select on storage.objects
  for select using (bucket_id = 'institucional');

drop policy if exists institucional_insert on storage.objects;
create policy institucional_insert on storage.objects
  for insert with check (bucket_id = 'institucional' and public.eh_admin());

drop policy if exists institucional_update on storage.objects;
create policy institucional_update on storage.objects
  for update using (bucket_id = 'institucional' and public.eh_admin());

drop policy if exists institucional_delete on storage.objects;
create policy institucional_delete on storage.objects
  for delete using (bucket_id = 'institucional' and public.eh_admin());
