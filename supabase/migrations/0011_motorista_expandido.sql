-- =====================================================================
-- GTPORTE - 0011_motorista_expandido.sql
-- Cadastro de motorista com os dados exigidos pela legislacao de
-- transporte escolar: dados pessoais, CNH, exames de aptidao, vinculo
-- profissional, cursos obrigatorios e contatos de emergencia.
--
-- Nota sobre status x situacao: o enum status_motorista
-- (em_rota | aguardando | folga | inativo) descreve a situacao
-- OPERACIONAL do dia e ja e consumido por badgeMotorista e pela logica
-- de rota. A situacao CADASTRAL pedida (ativo, inativo, ferias,
-- afastado) e outra coisa, entao vira uma coluna nova com enum proprio.
-- Os dois convivem sem colisao semantica.
-- Idempotente: pode ser reexecutada.
-- =====================================================================

do $enum$ begin
  create type situacao_motorista as enum ('ativo', 'inativo', 'ferias', 'afastado');
exception when duplicate_object then null; end $enum$;

do $enum$ begin
  create type vinculo_motorista as enum ('clt', 'terceirizado', 'autonomo', 'estatutario');
exception when duplicate_object then null; end $enum$;

do $enum$ begin
  create type resultado_exame as enum ('apto', 'apto_com_restricao', 'inapto', 'pendente');
exception when duplicate_object then null; end $enum$;

do $enum$ begin
  create type tipo_curso_motorista as enum (
    'mopp', 'transporte_coletivo', 'direcao_defensiva', 'primeiros_socorros', 'outro'
  );
exception when duplicate_object then null; end $enum$;

alter table public.motorista
  -- Dados pessoais
  add column if not exists cpf             text,
  add column if not exists rg              text,
  add column if not exists data_nascimento date,
  add column if not exists estado_civil    text,
  add column if not exists email           text,
  add column if not exists foto_path       text,
  add column if not exists logradouro      text,
  add column if not exists numero          text,
  add column if not exists complemento     text,
  add column if not exists bairro          text,
  add column if not exists cidade_id       uuid references public.cidade(id) on delete set null,
  add column if not exists uf              char(2) default 'SP',
  add column if not exists cep             text,
  -- CNH (numero, categoria e validade ja existiam)
  add column if not exists cnh_emissao       date,
  add column if not exists cnh_orgao_emissor text,
  add column if not exists cnh_ear           boolean not null default false,
  -- Exames e aptidao
  add column if not exists toxicologico_data      date,
  add column if not exists toxicologico_validade  date,
  add column if not exists toxicologico_resultado resultado_exame,
  add column if not exists aso_data      date,
  add column if not exists aso_validade  date,
  -- Dados profissionais e contratuais
  add column if not exists data_admissao       date,
  add column if not exists vinculo             vinculo_motorista,
  add column if not exists cargo               text,
  add column if not exists setor               text,
  add column if not exists matricula_interna   text,
  add column if not exists gestor_responsavel  text,
  -- Controle do sistema
  add column if not exists situacao    situacao_motorista not null default 'ativo',
  add column if not exists observacoes text;

-- categoria_cnh era char(1) e nao acomoda combinacoes como AD ou AE.
-- O if evita reexecutar o alter sem precisar engolir excecoes, o que
-- esconderia um erro real (por exemplo, uma view dependente da coluna).
do $alter$ begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'motorista'
       and column_name = 'categoria_cnh' and data_type <> 'text'
  ) then
    alter table public.motorista alter column categoria_cnh type text;
  end if;
end $alter$;

-- Unicidade so quando o campo estiver preenchido: os dois sao opcionais.
create unique index if not exists idx_motorista_cpf
  on public.motorista(cpf) where cpf is not null;
create unique index if not exists idx_motorista_matricula
  on public.motorista(matricula_interna) where matricula_interna is not null;
create index if not exists idx_motorista_situacao on public.motorista(situacao);

-- ---------------------------------------------------------------------
-- Cursos e treinamentos (opcionais, N por motorista)
-- ---------------------------------------------------------------------
create table if not exists public.motorista_curso (
  id           uuid primary key default gen_random_uuid(),
  motorista_id uuid not null references public.motorista(id) on delete cascade,
  tipo         tipo_curso_motorista not null,
  descricao    text,   -- obrigatorio na interface quando tipo = 'outro'
  instituicao  text,
  conclusao    date,
  validade     date,
  criado_em    timestamptz not null default now()
);
create index if not exists idx_motcurso on public.motorista_curso(motorista_id);

-- ---------------------------------------------------------------------
-- Contatos de emergencia (N por motorista)
-- ---------------------------------------------------------------------
create table if not exists public.motorista_contato_emergencia (
  id           uuid primary key default gen_random_uuid(),
  motorista_id uuid not null references public.motorista(id) on delete cascade,
  nome         text not null,
  parentesco   text,
  telefone     text not null,
  criado_em    timestamptz not null default now()
);
create index if not exists idx_motcontato on public.motorista_contato_emergencia(motorista_id);

-- ---------------------------------------------------------------------
-- RLS das tabelas filhas
-- ---------------------------------------------------------------------
alter table public.motorista_curso              enable row level security;
alter table public.motorista_contato_emergencia enable row level security;

drop policy if exists motcurso_select on public.motorista_curso;
create policy motcurso_select on public.motorista_curso
  for select using (
    public.eh_staff() or motorista_id = public.meu_motorista_id()
  );

drop policy if exists motcurso_write on public.motorista_curso;
create policy motcurso_write on public.motorista_curso
  for all using (public.eh_staff()) with check (public.eh_staff());

drop policy if exists motcontato_select on public.motorista_contato_emergencia;
create policy motcontato_select on public.motorista_contato_emergencia
  for select using (
    public.eh_staff() or motorista_id = public.meu_motorista_id()
  );

drop policy if exists motcontato_write on public.motorista_contato_emergencia;
create policy motcontato_write on public.motorista_contato_emergencia
  for all using (public.eh_staff()) with check (public.eh_staff());

-- ---------------------------------------------------------------------
-- Salvamento atomico das tres tabelas
-- Sem esta funcao seriam tres round-trips independentes: se o insert dos
-- cursos falhasse depois do update do motorista, o cadastro ficaria
-- salvo pela metade e sem os cursos que o usuario acabou de digitar.
--
-- Apenas nome e CNH sao obrigatorios - o restante do cadastro pode ser
-- completado depois, que e como o setor realmente trabalha.
-- ---------------------------------------------------------------------
create or replace function public.salvar_motorista(
  p_motorista_id uuid,
  p_dados        jsonb,
  p_cursos       jsonb default '[]'::jsonb,
  p_contatos     jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id   uuid;
  v_nome text;
  v_cnh  text;
begin
  if not public.eh_staff() then
    raise exception 'Perfil sem permissao para editar motoristas';
  end if;

  v_nome := trim(coalesce(p_dados->>'nome', ''));
  v_cnh  := trim(coalesce(p_dados->>'cnh', ''));

  if length(v_nome) < 3 then
    raise exception 'Informe o nome completo do motorista';
  end if;
  if length(v_cnh) < 9 then
    raise exception 'Informe o numero de registro da CNH';
  end if;

  if p_motorista_id is null then
    insert into public.motorista (nome, cnh) values (v_nome, v_cnh) returning id into v_id;
  else
    v_id := p_motorista_id;
  end if;

  update public.motorista m set
    nome            = v_nome,
    cnh             = v_cnh,
    telefone        = nullif(p_dados->>'telefone', ''),
    status          = coalesce((p_dados->>'status')::status_motorista, m.status),
    perfil_id       = nullif(p_dados->>'perfil_id', '')::uuid,
    cpf             = nullif(p_dados->>'cpf', ''),
    rg              = nullif(p_dados->>'rg', ''),
    data_nascimento = nullif(p_dados->>'data_nascimento', '')::date,
    estado_civil    = nullif(p_dados->>'estado_civil', ''),
    email           = nullif(p_dados->>'email', ''),
    foto_path       = coalesce(nullif(p_dados->>'foto_path', ''), m.foto_path),
    logradouro      = nullif(p_dados->>'logradouro', ''),
    numero          = nullif(p_dados->>'numero', ''),
    complemento     = nullif(p_dados->>'complemento', ''),
    bairro          = nullif(p_dados->>'bairro', ''),
    cidade_id       = nullif(p_dados->>'cidade_id', '')::uuid,
    uf              = nullif(p_dados->>'uf', ''),
    cep             = nullif(p_dados->>'cep', ''),
    categoria_cnh   = coalesce(nullif(p_dados->>'categoria_cnh', ''), m.categoria_cnh),
    validade_cnh    = nullif(p_dados->>'validade_cnh', '')::date,
    cnh_emissao     = nullif(p_dados->>'cnh_emissao', '')::date,
    cnh_orgao_emissor = nullif(p_dados->>'cnh_orgao_emissor', ''),
    cnh_ear         = coalesce((p_dados->>'cnh_ear')::boolean, false),
    toxicologico_data      = nullif(p_dados->>'toxicologico_data', '')::date,
    toxicologico_validade  = nullif(p_dados->>'toxicologico_validade', '')::date,
    toxicologico_resultado = nullif(p_dados->>'toxicologico_resultado', '')::resultado_exame,
    aso_data     = nullif(p_dados->>'aso_data', '')::date,
    aso_validade = nullif(p_dados->>'aso_validade', '')::date,
    data_admissao      = nullif(p_dados->>'data_admissao', '')::date,
    vinculo            = nullif(p_dados->>'vinculo', '')::vinculo_motorista,
    cargo              = nullif(p_dados->>'cargo', ''),
    setor              = nullif(p_dados->>'setor', ''),
    matricula_interna  = nullif(p_dados->>'matricula_interna', ''),
    gestor_responsavel = nullif(p_dados->>'gestor_responsavel', ''),
    situacao    = coalesce((p_dados->>'situacao')::situacao_motorista, m.situacao),
    observacoes = nullif(p_dados->>'observacoes', '')
  where m.id = v_id;

  -- Cursos e contatos sao substituidos por completo: a interface envia
  -- sempre a lista inteira, entao um diff incremental so traria
  -- complexidade sem ganho.
  delete from public.motorista_curso where motorista_id = v_id;
  insert into public.motorista_curso (motorista_id, tipo, descricao, instituicao, conclusao, validade)
  select v_id,
         (c->>'tipo')::tipo_curso_motorista,
         nullif(c->>'descricao', ''),
         nullif(c->>'instituicao', ''),
         nullif(c->>'conclusao', '')::date,
         nullif(c->>'validade', '')::date
    from jsonb_array_elements(coalesce(p_cursos, '[]'::jsonb)) c
   where coalesce(c->>'tipo', '') <> '';

  delete from public.motorista_contato_emergencia where motorista_id = v_id;
  insert into public.motorista_contato_emergencia (motorista_id, nome, parentesco, telefone)
  select v_id,
         c->>'nome',
         nullif(c->>'parentesco', ''),
         c->>'telefone'
    from jsonb_array_elements(coalesce(p_contatos, '[]'::jsonb)) c
   where coalesce(trim(c->>'nome'), '') <> ''
     and coalesce(trim(c->>'telefone'), '') <> '';

  perform public.registrar_log(
    case when p_motorista_id is null then 'criar_motorista' else 'editar_motorista' end,
    'motorista', v_id, jsonb_build_object('nome', v_nome)
  );

  return v_id;
end;
$fn$;

grant execute on function public.salvar_motorista(uuid, jsonb, jsonb, jsonb) to authenticated;
