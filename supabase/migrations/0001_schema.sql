-- =====================================================================
-- GTPORTE - 0001_schema.sql
-- Modelagem de dados conforme RT-TDS-2026-008 v0.3, capitulo 4
-- 15 entidades: perfil, cidade, universidade, estudante, motorista,
-- veiculo, rota, documento, grade_horaria, alocacao_estudante,
-- presenca, feedback, localizacao_rota, log_administrativo,
-- configuracao_sistema
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------
do $$ begin
  create type tipo_perfil as enum ('admin', 'operador', 'motorista', 'estudante');
exception when duplicate_object then null; end $$;

do $$ begin
  create type perfil_uso as enum ('ida_volta', 'somente_ida', 'somente_volta');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_documental as enum ('pendente', 'aprovado', 'rejeitado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_documento as enum ('rg', 'cpf', 'matricula', 'residencia');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_motorista as enum ('em_rota', 'aguardando', 'folga', 'inativo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_veiculo as enum ('em_rota', 'disponivel', 'manutencao');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_rota as enum ('ativa', 'lotada', 'revisao', 'inativa');
exception when duplicate_object then null; end $$;

do $$ begin
  create type situacao_alocacao as enum ('alocado', 'fila_espera', 'sem_rota');
exception when duplicate_object then null; end $$;

do $$ begin
  create type origem_alocacao as enum ('automatica', 'manual');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Funcao utilitaria de atualizacao de timestamp
-- ---------------------------------------------------------------------
create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- perfil  (classe Usuario da doc 3.2 - base de autenticacao, RF20/RF21)
-- 1-1 com auth.users do Supabase
-- ---------------------------------------------------------------------
create table if not exists public.perfil (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text not null,
  email         text not null unique,
  telefone      text,
  tipo          tipo_perfil not null default 'estudante',
  ativo         boolean not null default true,
  ultimo_acesso timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_perfil_tipo on public.perfil(tipo);

drop trigger if exists trg_perfil_atualizado on public.perfil;
create trigger trg_perfil_atualizado before update on public.perfil
  for each row execute function public.set_atualizado_em();

-- ---------------------------------------------------------------------
-- cidade  (RF07)
-- ---------------------------------------------------------------------
create table if not exists public.cidade (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  uf        char(2) not null default 'SP',
  criado_em timestamptz not null default now(),
  unique (nome, uf)
);

-- ---------------------------------------------------------------------
-- universidade  (RF06)
-- ---------------------------------------------------------------------
create table if not exists public.universidade (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null unique,
  cidade_id uuid not null references public.cidade(id) on delete restrict,
  cor       text not null default '#1F3A2E',
  ativa     boolean not null default true,
  criado_em timestamptz not null default now()
);

create index if not exists idx_universidade_cidade on public.universidade(cidade_id);

-- ---------------------------------------------------------------------
-- estudante  (RF01)
-- RN13: vinculo obrigatorio a uma universidade valida
-- ---------------------------------------------------------------------
create table if not exists public.estudante (
  id                uuid primary key default gen_random_uuid(),
  perfil_id         uuid unique references public.perfil(id) on delete set null,
  nome              text not null,
  ra                text not null unique,
  cpf               text not null unique,
  data_nascimento   date,
  telefone          text,
  email             text,
  curso             text,
  endereco          text,
  universidade_id   uuid not null references public.universidade(id) on delete restrict,
  cidade_id         uuid not null references public.cidade(id) on delete restrict,
  perfil_uso        perfil_uso not null default 'ida_volta',
  status_documental status_documental not null default 'pendente',
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create index if not exists idx_estudante_universidade on public.estudante(universidade_id);
create index if not exists idx_estudante_cidade on public.estudante(cidade_id);
create index if not exists idx_estudante_status on public.estudante(status_documental);
create index if not exists idx_estudante_ra on public.estudante(ra);

drop trigger if exists trg_estudante_atualizado on public.estudante;
create trigger trg_estudante_atualizado before update on public.estudante
  for each row execute function public.set_atualizado_em();

-- ---------------------------------------------------------------------
-- motorista  (RF04)
-- ---------------------------------------------------------------------
create table if not exists public.motorista (
  id            uuid primary key default gen_random_uuid(),
  perfil_id     uuid unique references public.perfil(id) on delete set null,
  nome          text not null,
  cnh           text not null unique,
  categoria_cnh char(1) not null default 'D',
  validade_cnh  date,
  telefone      text,
  status        status_motorista not null default 'aguardando',
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists trg_motorista_atualizado on public.motorista;
create trigger trg_motorista_atualizado before update on public.motorista
  for each row execute function public.set_atualizado_em();

-- ---------------------------------------------------------------------
-- veiculo  (RF05)
-- RN03: capacidade_maxima e o limitador fisico da distribuicao
-- ---------------------------------------------------------------------
create table if not exists public.veiculo (
  id                uuid primary key default gen_random_uuid(),
  placa             text not null unique,
  modelo            text not null,
  ano               smallint,
  capacidade_maxima smallint not null check (capacidade_maxima > 0),
  status            status_veiculo not null default 'disponivel',
  observacao        text,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

drop trigger if exists trg_veiculo_atualizado on public.veiculo;
create trigger trg_veiculo_atualizado before update on public.veiculo
  for each row execute function public.set_atualizado_em();

-- ---------------------------------------------------------------------
-- rota  (RF08)
-- RN14: cada rota deve possuir ao menos um motorista responsavel
-- ---------------------------------------------------------------------
create table if not exists public.rota (
  id                uuid primary key default gen_random_uuid(),
  codigo            text not null unique,
  nome              text not null,
  cidade_origem_id  uuid not null references public.cidade(id) on delete restrict,
  cidade_destino_id uuid not null references public.cidade(id) on delete restrict,
  universidade_id   uuid references public.universidade(id) on delete set null,
  veiculo_id        uuid not null references public.veiculo(id) on delete restrict,
  motorista_id      uuid not null references public.motorista(id) on delete restrict,
  horario_partida   time not null,
  horario_retorno   time not null,
  descricao         text,
  status            status_rota not null default 'ativa',
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create index if not exists idx_rota_veiculo on public.rota(veiculo_id);
create index if not exists idx_rota_motorista on public.rota(motorista_id);
create index if not exists idx_rota_universidade on public.rota(universidade_id);
create index if not exists idx_rota_status on public.rota(status);

drop trigger if exists trg_rota_atualizado on public.rota;
create trigger trg_rota_atualizado before update on public.rota
  for each row execute function public.set_atualizado_em();

-- ---------------------------------------------------------------------
-- documento  (RF02 / RF03)
-- RN07: apenas administradores aprovam (garantido pelo RLS em 0002)
-- ---------------------------------------------------------------------
create table if not exists public.documento (
  id            uuid primary key default gen_random_uuid(),
  estudante_id  uuid not null references public.estudante(id) on delete cascade,
  tipo          tipo_documento not null,
  nome_arquivo  text not null,
  storage_path  text not null,
  status        status_documental not null default 'pendente',
  observacao    text,
  revisado_por  uuid references public.perfil(id) on delete set null,
  revisado_em   timestamptz,
  criado_em     timestamptz not null default now(),
  unique (estudante_id, tipo)
);

create index if not exists idx_documento_estudante on public.documento(estudante_id);
create index if not exists idx_documento_status on public.documento(status);

-- ---------------------------------------------------------------------
-- grade_horaria  (insumo do motor de distribuicao - RN02)
-- dia_semana: 0 = domingo ... 6 = sabado
-- ---------------------------------------------------------------------
create table if not exists public.grade_horaria (
  id           uuid primary key default gen_random_uuid(),
  estudante_id uuid not null references public.estudante(id) on delete cascade,
  dia_semana   smallint not null check (dia_semana between 0 and 6),
  hora_inicio  time not null,
  hora_fim     time not null,
  criado_em    timestamptz not null default now(),
  check (hora_fim > hora_inicio),
  unique (estudante_id, dia_semana, hora_inicio)
);

create index if not exists idx_grade_estudante on public.grade_horaria(estudante_id);

-- ---------------------------------------------------------------------
-- alocacao_estudante  (RF09 / RF10)
-- Um estudante pode ter varias alocacoes ao longo do tempo (historico),
-- mas apenas uma ativa por vez - garantido pelo indice unico parcial.
-- ---------------------------------------------------------------------
create table if not exists public.alocacao_estudante (
  id            uuid primary key default gen_random_uuid(),
  estudante_id  uuid not null references public.estudante(id) on delete cascade,
  rota_id       uuid references public.rota(id) on delete restrict,
  situacao      situacao_alocacao not null default 'alocado',
  origem        origem_alocacao not null default 'automatica',
  ativa         boolean not null default true,
  motivo        text,
  criado_em     timestamptz not null default now(),
  encerrado_em  timestamptz
);

create unique index if not exists uq_alocacao_ativa
  on public.alocacao_estudante(estudante_id) where ativa;
create index if not exists idx_alocacao_rota on public.alocacao_estudante(rota_id) where ativa;
create index if not exists idx_alocacao_situacao on public.alocacao_estudante(situacao);

-- ---------------------------------------------------------------------
-- presenca  (RF13 / RF14)
-- RN04: ida e volta registradas de forma independente
-- ---------------------------------------------------------------------
create table if not exists public.presenca (
  id             uuid primary key default gen_random_uuid(),
  alocacao_id    uuid not null references public.alocacao_estudante(id) on delete cascade,
  data           date not null default current_date,
  confirmou_ida  boolean not null default false,
  hora_ida       timestamptz,
  confirmou_volta boolean not null default false,
  hora_volta     timestamptz,
  criado_em      timestamptz not null default now(),
  unique (alocacao_id, data)
);

create index if not exists idx_presenca_data on public.presenca(data, alocacao_id);

-- ---------------------------------------------------------------------
-- feedback  (RF23)
-- ---------------------------------------------------------------------
create table if not exists public.feedback (
  id           uuid primary key default gen_random_uuid(),
  estudante_id uuid not null references public.estudante(id) on delete cascade,
  rota_id      uuid references public.rota(id) on delete set null,
  nota         smallint not null check (nota between 1 and 5),
  comentario   text,
  criado_em    timestamptz not null default now()
);

create index if not exists idx_feedback_rota on public.feedback(rota_id);

-- ---------------------------------------------------------------------
-- localizacao_rota  (RF15 - acompanhamento em tempo real)
-- ---------------------------------------------------------------------
create table if not exists public.localizacao_rota (
  id            uuid primary key default gen_random_uuid(),
  rota_id       uuid not null references public.rota(id) on delete cascade,
  latitude      double precision not null,
  longitude     double precision not null,
  registrado_em timestamptz not null default now()
);

create index if not exists idx_localizacao_rota on public.localizacao_rota(rota_id, registrado_em desc);

-- ---------------------------------------------------------------------
-- log_administrativo  (RN12)
-- ---------------------------------------------------------------------
create table if not exists public.log_administrativo (
  id          uuid primary key default gen_random_uuid(),
  perfil_id   uuid references public.perfil(id) on delete set null,
  acao        text not null,
  entidade    text not null,
  entidade_id uuid,
  detalhe     jsonb,
  criado_em   timestamptz not null default now()
);

create index if not exists idx_log_criado on public.log_administrativo(criado_em desc);
create index if not exists idx_log_entidade on public.log_administrativo(entidade, entidade_id);

-- ---------------------------------------------------------------------
-- configuracao_sistema
-- RN05: antecedencia minima para confirmar a volta sem ter confirmado a ida
-- ---------------------------------------------------------------------
create table if not exists public.configuracao_sistema (
  chave         text primary key,
  valor         text not null,
  descricao     text,
  atualizado_em timestamptz not null default now()
);

insert into public.configuracao_sistema (chave, valor, descricao) values
  ('rn05_antecedencia_horas', '2', 'RN05: antecedencia minima (horas) para confirmar a volta sem confirmacao de ida'),
  ('rn03_tolerancia_lotacao', '0', 'RN03: assentos de tolerancia acima da capacidade maxima (0 = sem tolerancia)')
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------
-- Sincronizacao auth.users -> perfil
-- Cria o perfil automaticamente quando um usuario e criado no Supabase Auth.
-- O tipo vem de raw_user_meta_data->>'tipo' (default: estudante).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfil (id, nome, email, telefone, tipo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'telefone',
    coalesce((new.raw_user_meta_data->>'tipo')::tipo_perfil, 'estudante')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
