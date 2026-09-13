-- ---------------------------------------------------------------------
-- Cadastro do estudante mais flexivel
--
-- O cadastro pelo app passa a exigir menos de uma vez so: a grade
-- horaria vira opcional e basta um documento para concluir. Em troca,
-- o acesso fica parcial ate a secretaria aprovar a documentacao.
--
-- Acrescenta tambem o periodo letivo (ano/semestre), que o formulario
-- de dados academicos pede.
-- ---------------------------------------------------------------------

alter table public.estudante
  add column if not exists ano_semestre text;

-- Formato AAAA/S, com S em 1 ou 2. Nulo continua valendo: o campo nao e
-- obrigatorio e os cadastros antigos nao tem essa informacao.
do $$
begin
  alter table public.estudante
    add constraint estudante_ano_semestre_formato
    check (ano_semestre is null or ano_semestre ~ '^[0-9]{4}/[12]$');
exception when duplicate_object then null;
end;
$$;

comment on column public.estudante.ano_semestre is
  'Periodo letivo em que o estudante esta, no formato AAAA/S (ex.: 2026/1).';

-- ---------------------------------------------------------------------
-- Situacao do acesso
--
-- O app precisa saber, numa chamada so, o que liberar para o estudante.
-- Enquanto a documentacao nao e aprovada e nao existe alocacao ativa,
-- as telas que dependem de rota ficam bloqueadas.
-- ---------------------------------------------------------------------
create or replace function public.minha_situacao_acesso()
returns table (
  tem_cadastro       boolean,
  status_documental  status_documental,
  documentos_enviados integer,
  tem_rota           boolean,
  acesso_liberado    boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with eu as (
    select public.meu_estudante_id() as id
  ),
  est as (
    select e.id, e.status_documental
      from public.estudante e
      join eu on eu.id = e.id
  )
  select
    (select id is not null from eu)                                    as tem_cadastro,
    (select status_documental from est)                               as status_documental,
    (select count(*)::int from public.documento d
      where d.estudante_id = (select id from eu))                     as documentos_enviados,
    exists (
      select 1 from public.alocacao_estudante a
       where a.estudante_id = (select id from eu)
         and a.ativa
         and a.rota_id is not null
    )                                                                  as tem_rota,
    coalesce((select status_documental from est) = 'aprovado', false)  as acesso_liberado;
$$;

revoke all on function public.minha_situacao_acesso() from public;
grant execute on function public.minha_situacao_acesso() to authenticated;

-- ---------------------------------------------------------------------
-- O periodo letivo muda todo semestre: entra na lista de campos que o
-- estudante pode pedir para alterar (fila da secretaria, migration 0016).
-- ---------------------------------------------------------------------
create or replace function public.campo_cadastral_editavel(p_campo text)
returns boolean
language sql
immutable
as $$
  select p_campo in (
    'nome', 'telefone', 'email', 'curso', 'endereco',
    'data_nascimento', 'universidade_id', 'cidade_id', 'perfil_uso',
    'ano_semestre'
  );
$$;
