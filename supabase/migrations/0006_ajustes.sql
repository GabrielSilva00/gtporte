-- =====================================================================
-- GTPORTE - 0006_ajustes.sql
-- Ajustes solicitados apos a primeira rodada de uso:
--   1. cobertura completa dos municipios da regiao de Aracatuba
--   2. uma rota pode atender mais de uma universidade
--   3. prontuario sequencial substitui o RA, e o estudante nao o altera
--   4. estudante so cai em "rejeitado" quando todos os documentos forem
--      rejeitados; aprovacao pode ser cancelada, voltando para pendente
--   5. distribuicao automatica considerando as universidades da rota
-- Idempotente: pode ser reexecutada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cidades
-- Grafia acentuada, inclusive nas linhas que ja existiam - o seed inicial
-- gravou sem acento e as duas formas conviveriam como cidades distintas.
-- ---------------------------------------------------------------------
update public.cidade set nome = 'Araçatuba' where nome = 'Aracatuba';
update public.cidade set nome = 'Penápolis' where nome = 'Penapolis';
update public.cidade set nome = 'São Carlos' where nome = 'Sao Carlos';

update public.universidade set nome = 'FATEC Araçatuba'  where nome = 'FATEC Aracatuba';
update public.universidade set nome = 'UNESP Araçatuba'  where nome = 'UNESP Aracatuba';
update public.universidade set nome = 'UNIP Araçatuba'   where nome = 'UNIP Aracatuba';
update public.universidade set nome = 'UFSCar São Carlos' where nome = 'UFSCar Sao Carlos';

-- Municipios da Regiao Administrativa de Aracatuba
insert into public.cidade (nome, uf) values
  ('Alto Alegre', 'SP'), ('Andradina', 'SP'), ('Auriflama', 'SP'),
  ('Avanhandava', 'SP'), ('Barbosa', 'SP'), ('Bento de Abreu', 'SP'),
  ('Bilac', 'SP'), ('Braúna', 'SP'), ('Brejo Alegre', 'SP'),
  ('Castilho', 'SP'), ('Clementina', 'SP'), ('Gabriel Monteiro', 'SP'),
  ('Gastão Vidigal', 'SP'), ('General Salgado', 'SP'), ('Glicério', 'SP'),
  ('Guaraçaí', 'SP'), ('Guzolândia', 'SP'), ('Itapura', 'SP'),
  ('Lavínia', 'SP'), ('Lourdes', 'SP'), ('Luiziânia', 'SP'),
  ('Mirandópolis', 'SP'), ('Murutinga do Sul', 'SP'), ('Nova Castilho', 'SP'),
  ('Nova Independência', 'SP'), ('Nova Luzitânia', 'SP'), ('Pereira Barreto', 'SP'),
  ('Piacatu', 'SP'), ('Rubiácea', 'SP'), ('Santo Antônio do Aracanguá', 'SP'),
  ('São João de Iracema', 'SP'), ('Sud Mennucci', 'SP'), ('Suzanápolis', 'SP'),
  ('Turiúba', 'SP'), ('Valparaíso', 'SP'), ('Zacarias', 'SP')
on conflict (nome, uf) do nothing;

-- ---------------------------------------------------------------------
-- 2. Rota atende varias universidades
-- A coluna rota.universidade_id vira a tabela de juncao rota_universidade.
-- Rota sem nenhuma universidade vinculada continua significando "atende
-- qualquer uma", como o campo nulo significava antes.
-- ---------------------------------------------------------------------
create table if not exists public.rota_universidade (
  rota_id         uuid not null references public.rota(id) on delete cascade,
  universidade_id uuid not null references public.universidade(id) on delete restrict,
  criado_em       timestamptz not null default now(),
  primary key (rota_id, universidade_id)
);

create index if not exists idx_rota_univ_universidade
  on public.rota_universidade(universidade_id);

-- Migra o vinculo que existia na coluna
insert into public.rota_universidade (rota_id, universidade_id)
select r.id, r.universidade_id
  from public.rota r
 where r.universidade_id is not null
   and exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'rota'
                  and column_name = 'universidade_id')
on conflict do nothing;

-- O trigger de log lista as colunas de negocio uma a uma; precisa ser
-- recriado sem universidade_id antes de a coluna sair.
drop trigger if exists trg_log_rota_update on public.rota;
create trigger trg_log_rota_update after update on public.rota
  for each row when (
    (old.codigo, old.nome, old.cidade_origem_id, old.cidade_destino_id,
     old.veiculo_id, old.motorista_id, old.horario_partida, old.horario_retorno,
     old.descricao, old.status)
    is distinct from
    (new.codigo, new.nome, new.cidade_origem_id, new.cidade_destino_id,
     new.veiculo_id, new.motorista_id, new.horario_partida, new.horario_retorno,
     new.descricao, new.status)
  )
  execute function public.trg_log_generico();

drop index if exists public.idx_rota_universidade;
alter table public.rota drop column if exists universidade_id;

alter table public.rota_universidade enable row level security;

drop policy if exists rota_univ_select_todos on public.rota_universidade;
create policy rota_univ_select_todos on public.rota_universidade
  for select using (auth.uid() is not null);

-- RN06 continua valendo: so admin mexe no cadastro de rotas
drop policy if exists rota_univ_write_admin on public.rota_universidade;
create policy rota_univ_write_admin on public.rota_universidade
  for all using (public.eh_admin()) with check (public.eh_admin());

-- ---------------------------------------------------------------------
-- 3. Prontuario
-- Identificador academico gerado pelo sistema, a partir de 218926.
-- Substitui o RA, que era digitado no cadastro.
-- ---------------------------------------------------------------------
create sequence if not exists public.seq_prontuario start with 218926;

alter table public.estudante add column if not exists prontuario text;

-- Numera quem ja estava cadastrado, na ordem de criacao
do $$
declare
  r record;
begin
  for r in select id from public.estudante where prontuario is null order by criado_em
  loop
    update public.estudante
       set prontuario = nextval('public.seq_prontuario')::text
     where id = r.id;
  end loop;
end;
$$;

alter table public.estudante
  alter column prontuario set default nextval('public.seq_prontuario')::text;
alter table public.estudante alter column prontuario set not null;

do $$
begin
  alter table public.estudante add constraint estudante_prontuario_key unique (prontuario);
exception when duplicate_table or duplicate_object then null;
end;
$$;

create index if not exists idx_estudante_prontuario on public.estudante(prontuario);

-- O prontuario identifica o estudante: nem ele nem o operador reescrevem.
create or replace function public.trg_prontuario_imutavel()
returns trigger
language plpgsql
as $$
begin
  if new.prontuario is distinct from old.prontuario then
    raise exception 'O prontuario e gerado pelo sistema e nao pode ser alterado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_estudante_prontuario on public.estudante;
create trigger trg_estudante_prontuario before update on public.estudante
  for each row execute function public.trg_prontuario_imutavel();

-- ---------------------------------------------------------------------
-- 4. Status documental
-- Antes bastava um documento rejeitado para o estudante inteiro constar
-- como rejeitado. Agora ele so sai da fila de pendentes quando todos os
-- documentos forem rejeitados; um unico rejeitado ainda e pendencia.
-- ---------------------------------------------------------------------
create or replace function public.recalcular_status_documental(p_estudante_id uuid)
returns status_documental
language plpgsql
security definer
set search_path = public
as $$
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
  from public.documento
  where estudante_id = p_estudante_id;

  if v_aprovados >= 4 then
    v_novo := 'aprovado';
  elsif v_total >= 4 and v_rejeitados = v_total then
    v_novo := 'rejeitado';
  else
    v_novo := 'pendente';
  end if;

  update public.estudante set status_documental = v_novo where id = p_estudante_id;
  return v_novo;
end;
$$;

-- Cancelar aprovacao: o documento volta para pendente e entra de novo na
-- fila de validacao. Unica alteracao permitida sobre um documento aprovado.
create or replace function public.cancelar_aprovacao_documento(p_documento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estudante uuid;
  v_status    status_documental;
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores podem cancelar a aprovacao de documentos';
  end if;

  update public.documento
     set status = 'pendente',
         observacao = null,
         revisado_por = auth.uid(),
         revisado_em = now()
   where id = p_documento_id
     and status = 'aprovado'
  returning estudante_id into v_estudante;

  if v_estudante is null then
    raise exception 'Documento nao encontrado ou nao esta aprovado';
  end if;

  v_status := public.recalcular_status_documental(v_estudante);
  return jsonb_build_object('estudante_id', v_estudante, 'status_documental', v_status);
end;
$$;

grant execute on function public.cancelar_aprovacao_documento(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Distribuicao automatica
-- Le as universidades atendidas na tabela de juncao. Rota sem vinculo
-- nenhum atende qualquer universidade. Continua exigindo que a rota parta
-- antes do inicio das aulas e retorne depois do termino (considerando a
-- aula mais cedo e a mais tarde da semana do estudante).
-- ---------------------------------------------------------------------
create or replace function public.executar_distribuicao(p_rota_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r_est        record;
  v_rota       uuid;
  v_alocados   int := 0;
  v_espera     int := 0;
  v_sem_rota   int := 0;
  v_mensagens  jsonb := '[]'::jsonb;
  v_inicio     timestamptz := clock_timestamp();
  v_lotadas    text[] := '{}';
begin
  if not public.eh_staff() then
    raise exception 'Apenas administradores e operadores podem executar a distribuicao';
  end if;

  drop table if exists _cap;
  create temp table _cap on commit drop as
  select r.id            as rota_id,
         r.codigo,
         r.nome,
         r.horario_partida,
         r.horario_retorno,
         r.cidade_destino_id,
         v.capacidade_maxima
           - coalesce((select count(*)
                         from public.alocacao_estudante a
                        where a.rota_id = r.id and a.ativa
                          and a.origem = 'manual' and a.situacao = 'alocado'), 0)
           as vagas,
         v.capacidade_maxima
  from public.rota r
  join public.veiculo v on v.id = r.veiculo_id
  where r.status in ('ativa', 'lotada')
    and (p_rota_ids is null or r.id = any(p_rota_ids));

  update public.alocacao_estudante
     set ativa = false, encerrado_em = now()
   where ativa
     and origem = 'automatica'
     and (p_rota_ids is null or rota_id is null or rota_id = any(p_rota_ids));

  for r_est in
    select e.id,
           e.nome,
           e.universidade_id,
           e.cidade_id,
           min(g.hora_inicio) as inicio_aula,
           max(g.hora_fim)    as fim_aula
      from public.estudante e
      join public.grade_horaria g on g.estudante_id = e.id
     where e.ativo
       and e.status_documental = 'aprovado'
       and not exists (
             select 1 from public.alocacao_estudante a
              where a.estudante_id = e.id and a.ativa and a.origem = 'manual'
           )
     group by e.id, e.nome, e.universidade_id, e.cidade_id
     order by min(e.criado_em)
  loop
    -- Rota compativel com vaga, priorizando a de partida mais proxima do
    -- inicio das aulas (menor tempo de espera do estudante).
    select c.rota_id into v_rota
      from _cap c
     where c.vagas > 0
       and c.horario_partida <= r_est.inicio_aula
       and c.horario_retorno >= r_est.fim_aula
       and public.rota_atende_universidade(c.rota_id, r_est.universidade_id)
     order by c.horario_partida desc
     limit 1;

    if v_rota is not null then
      insert into public.alocacao_estudante (estudante_id, rota_id, situacao, origem, ativa)
      values (r_est.id, v_rota, 'alocado', 'automatica', true);
      update _cap set vagas = vagas - 1 where rota_id = v_rota;
      v_alocados := v_alocados + 1;

      if (select vagas from _cap where rota_id = v_rota) = 0 then
        select array_append(v_lotadas, codigo) into v_lotadas from _cap where rota_id = v_rota;
      end if;
    else
      -- Rota compativel existe, mas sem vaga -> fila de espera.
      if exists (
        select 1 from _cap c
         where c.horario_partida <= r_est.inicio_aula
           and c.horario_retorno >= r_est.fim_aula
           and public.rota_atende_universidade(c.rota_id, r_est.universidade_id)
      ) then
        insert into public.alocacao_estudante (estudante_id, rota_id, situacao, origem, ativa, motivo)
        values (r_est.id, null, 'fila_espera', 'automatica', true, 'Veiculo excedeu capacidade');
        v_espera := v_espera + 1;
      else
        insert into public.alocacao_estudante (estudante_id, rota_id, situacao, origem, ativa, motivo)
        values (r_est.id, null, 'sem_rota', 'automatica', true, 'Aluno sem rota compativel');
        v_sem_rota := v_sem_rota + 1;
      end if;
    end if;

    v_rota := null;
  end loop;

  update public.rota r
     set status = case
                    when public.ocupacao_rota(r.id) >= v.capacidade_maxima then 'lotada'::status_rota
                    else 'ativa'::status_rota
                  end
    from public.veiculo v
   where v.id = r.veiculo_id
     and r.status in ('ativa', 'lotada')
     and (p_rota_ids is null or r.id = any(p_rota_ids))
     and r.status is distinct from case
                    when public.ocupacao_rota(r.id) >= v.capacidade_maxima then 'lotada'::status_rota
                    else 'ativa'::status_rota
                  end;

  if array_length(v_lotadas, 1) > 0 then
    v_mensagens := v_mensagens || to_jsonb('Rotas que atingiram a capacidade: ' ||
                                           array_to_string(v_lotadas, ', '));
  end if;
  if v_espera > 0 then
    v_mensagens := v_mensagens || to_jsonb(v_espera || ' estudante(s) em fila de espera.');
  end if;
  if v_sem_rota > 0 then
    v_mensagens := v_mensagens || to_jsonb(v_sem_rota || ' estudante(s) sem rota compativel.');
  end if;

  perform public.registrar_log('distribuicao_automatica', 'alocacao_estudante', null,
    jsonb_build_object('alocados', v_alocados, 'fila_espera', v_espera, 'sem_rota', v_sem_rota));

  return jsonb_build_object(
    'alocados', v_alocados,
    'fila_espera', v_espera,
    'sem_rota', v_sem_rota,
    'duracao_ms', round(extract(epoch from (clock_timestamp() - v_inicio)) * 1000)::int,
    'mensagens', v_mensagens
  );
end;
$$;

-- Uma rota sem vinculo atende qualquer universidade; com vinculos, apenas
-- as listadas. Isolado numa funcao porque a regra aparece em varios pontos.
create or replace function public.rota_atende_universidade(p_rota_id uuid, p_universidade_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.rota_universidade where rota_id = p_rota_id)
      or exists (select 1 from public.rota_universidade
                  where rota_id = p_rota_id and universidade_id = p_universidade_id);
$$;

grant execute on function public.rota_atende_universidade(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Saida do RA
-- O schema base ja nasce com prontuario; aqui apenas cai a coluna antiga
-- nos bancos criados antes desta migration.
-- ---------------------------------------------------------------------
drop index if exists public.idx_estudante_ra;
alter table public.estudante drop column if exists ra;

