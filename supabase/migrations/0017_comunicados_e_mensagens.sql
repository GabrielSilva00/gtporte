-- ---------------------------------------------------------------------
-- Fase 3: comunicados da secretaria + mensagens enderecadas
--
-- 1) comunicado: canal da administracao para os alunos. Ate aqui so havia
--    aviso_rota, escrito pelo motorista e preso a uma rota, entao aluno
--    sem alocacao nao recebia nada.
--
-- 2) mensagem ganha destinatario explicito (secretaria ou motorista),
--    motivo e prazo: fica aberta por 24h e depois encerra. A mensagem
--    continua visivel para o aluno, so nao aceita mais resposta.
-- ---------------------------------------------------------------------

-- =====================================================================
-- 1. COMUNICADOS
-- =====================================================================
do $$
begin
  create type comunicado_alcance as enum ('todos', 'rota', 'universidade');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type comunicado_prioridade as enum ('normal', 'importante', 'urgente');
exception when duplicate_object then null;
end;
$$;

create table if not exists public.comunicado (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null check (length(trim(titulo)) > 0),
  corpo           text not null check (length(trim(corpo)) > 0),
  alcance         comunicado_alcance not null default 'todos',
  rota_id         uuid references public.rota(id) on delete cascade,
  universidade_id uuid references public.universidade(id) on delete cascade,
  prioridade      comunicado_prioridade not null default 'normal',
  publicado_em    timestamptz not null default now(),
  expira_em       timestamptz,
  ativo           boolean not null default true,
  autor_id        uuid references public.perfil(id) on delete set null,
  criado_em       timestamptz not null default now(),
  -- O alvo precisa existir quando o alcance nao e 'todos'.
  constraint comunicado_alvo_rota check (alcance <> 'rota' or rota_id is not null),
  constraint comunicado_alvo_uni  check (alcance <> 'universidade' or universidade_id is not null)
);

create index if not exists comunicado_vigentes
  on public.comunicado (ativo, publicado_em desc);

alter table public.comunicado enable row level security;

drop policy if exists comunicado_staff on public.comunicado;
create policy comunicado_staff on public.comunicado
  for all using (public.eh_staff()) with check (public.eh_staff());

-- Leitura liberada a autenticado; o recorte por alcance fica em
-- meus_comunicados(), que e o que o app consome.
drop policy if exists comunicado_select on public.comunicado;
create policy comunicado_select on public.comunicado
  for select using (auth.uid() is not null);

/**
 * Comunicados que alcancam o estudante logado: os de alcance 'todos',
 * os da rota em que ele esta alocado e os da universidade dele.
 */
create or replace function public.meus_comunicados()
returns setof public.comunicado
language sql
stable
security definer
set search_path = public
as $$
  select c.*
    from public.comunicado c
   where c.ativo
     and (c.expira_em is null or c.expira_em > now())
     and c.publicado_em <= now()
     and (
       c.alcance = 'todos'
       or (c.alcance = 'rota' and c.rota_id in (
             select a.rota_id
               from public.alocacao_estudante a
              where a.estudante_id = public.meu_estudante_id()
                and a.ativa
           ))
       or (c.alcance = 'universidade' and c.universidade_id = (
             select e.universidade_id
               from public.estudante e
              where e.id = public.meu_estudante_id()
           ))
     )
   order by
     case c.prioridade when 'urgente' then 0 when 'importante' then 1 else 2 end,
     c.publicado_em desc;
$$;

revoke all on function public.meus_comunicados() from public;
grant execute on function public.meus_comunicados() to authenticated;

-- =====================================================================
-- 2. MENSAGENS: motivo, prazo de 24h e remetente automatico
-- =====================================================================
do $$
begin
  create type mensagem_motivo as enum (
    'atraso', 'ausencia', 'troca_rota', 'horario', 'documentacao',
    'veiculo', 'comportamento', 'outro'
  );
exception when duplicate_object then null;
end;
$$;

alter table public.mensagem add column if not exists motivo    mensagem_motivo;
alter table public.mensagem add column if not exists expira_em timestamptz;

-- Mensagens antigas ganham prazo a partir da data em que foram criadas.
update public.mensagem
   set expira_em = criado_em + interval '24 hours'
 where expira_em is null;

alter table public.mensagem
  alter column expira_em set default (now() + interval '24 hours');

-- O app do estudante nao tem por que mandar o proprio id; sem isso o
-- insert batia na policy mensagem_insert (remetente_id = auth.uid()).
create or replace function public.tg_mensagem_remetente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.remetente_id is null then
    new.remetente_id := auth.uid();
  end if;
  if new.expira_em is null then
    new.expira_em := now() + interval '24 hours';
  end if;
  return new;
end;
$$;

drop trigger if exists mensagem_remetente on public.mensagem;
create trigger mensagem_remetente
  before insert on public.mensagem
  for each row execute function public.tg_mensagem_remetente();

/**
 * Fecha o que passou das 24h. A mensagem continua visivel para quem a
 * enviou; encerrada significa apenas que nao aceita mais resposta.
 * Chamada pelos paineis ao carregar a lista.
 */
create or replace function public.encerrar_mensagens_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  update public.mensagem
     set status = 'encerrada'
   where status <> 'encerrada'
     and expira_em is not null
     and expira_em <= now();
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke all on function public.encerrar_mensagens_vencidas() from public;
grant execute on function public.encerrar_mensagens_vencidas() to authenticated;

/**
 * Para quem o estudante pode escrever: a secretaria (destinatario nulo,
 * que a policy de staff ja enxerga) e o motorista da rota em que ele
 * esta alocado.
 */
create or replace function public.destinatarios_mensagem()
returns table (id uuid, nome text, papel text)
language sql
stable
security definer
set search_path = public
as $$
  select null::uuid as id, 'Secretaria'::text as nome, 'secretaria'::text as papel
  union all
  select m.perfil_id, m.nome, 'motorista'::text
    from public.alocacao_estudante a
    join public.rota r     on r.id = a.rota_id
    join public.motorista m on m.id = r.motorista_id
   where a.estudante_id = public.meu_estudante_id()
     and a.ativa
     and m.perfil_id is not null;
$$;

revoke all on function public.destinatarios_mensagem() from public;
grant execute on function public.destinatarios_mensagem() to authenticated;

-- ---------------------------------------------------------------------
-- Pagina de comunicados no painel administrativo.
-- Espelha src/lib/paginas.ts (chave 'comunicados').
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
    'solicitacoes', 'mensagens', 'comunicados', 'configuracoes'
  ];
$$;

insert into public.permissao_pagina (perfil_id, pagina)
select pp.perfil_id, 'comunicados'
  from public.permissao_pagina pp
 where pp.pagina = 'mensagens'
on conflict do nothing;
