-- ---------------------------------------------------------------------
-- Periodo do curso: ano OU semestre, escolha do estudante
--
-- A coluna ano_semestre guardava "AAAA/S" (periodo letivo). Nao e o que
-- o cadastro precisa saber: cada curso conta o proprio andamento de um
-- jeito — Direito fala em "3o ano", ADS fala em "5o semestre". Forcar um
-- formato so obrigava o aluno a converter de cabeca.
--
-- Agora sao dois campos: o tipo de contagem e o numero.
-- ---------------------------------------------------------------------

do $$
begin
  create type periodo_tipo as enum ('ano', 'semestre');
exception when duplicate_object then null;
end;
$$;

alter table public.estudante add column if not exists periodo_tipo   periodo_tipo;
alter table public.estudante add column if not exists periodo_numero smallint;

-- Ano vai ate 6 (medicina); semestre ate 12. Nulo continua valendo:
-- o campo e opcional e os cadastros antigos nao tem a informacao.
do $$
begin
  alter table public.estudante
    add constraint estudante_periodo_coerente
    check (
      (periodo_tipo is null and periodo_numero is null)
      or (periodo_tipo = 'ano'      and periodo_numero between 1 and 6)
      or (periodo_tipo = 'semestre' and periodo_numero between 1 and 12)
    );
exception when duplicate_object then null;
end;
$$;

comment on column public.estudante.periodo_tipo is
  'Como o curso conta o andamento: por ano ou por semestre.';
comment on column public.estudante.periodo_numero is
  'Em que ano (1-6) ou semestre (1-12) o estudante esta.';

-- Aproveita o que ja foi preenchido no formato antigo: "2026/1" virava
-- periodo letivo, e o semestre era o digito depois da barra.
update public.estudante
   set periodo_tipo   = 'semestre',
       periodo_numero = nullif(split_part(ano_semestre, '/', 2), '')::smallint
 where ano_semestre is not null
   and periodo_tipo is null
   and split_part(ano_semestre, '/', 2) in ('1', '2');

-- ---------------------------------------------------------------------
-- Os dois campos entram na fila de alteracao cadastral: o aluno muda de
-- semestre todo periodo.
-- ---------------------------------------------------------------------
create or replace function public.campo_cadastral_editavel(p_campo text)
returns boolean
language sql
immutable
as $$
  select p_campo in (
    'nome', 'telefone', 'email', 'curso', 'endereco',
    'data_nascimento', 'universidade_id', 'cidade_id', 'perfil_uso',
    'ano_semestre', 'periodo_tipo', 'periodo_numero'
  );
$$;
