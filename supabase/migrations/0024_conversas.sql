-- ---------------------------------------------------------------------
-- Conversas: atendimento direto e grupo da rota
--
-- A tabela `mensagem` atende bem o caso "recado com assunto e prazo",
-- mas nao o de conversa: nao ha fio condutor, nao ha grupo, e cada
-- mensagem carrega assunto proprio. Este arquivo acrescenta a estrutura
-- de conversa por cima, sem mexer no que ja existe.
--
-- Dois tipos:
--   . direta   — estudante com a secretaria ou com o motorista da rota.
--                Comeca atendida pelo chatbot; quando ele nao resolve,
--                a conversa e escalada para uma pessoa.
--   . grupo    — motorista e todos os estudantes alocados numa rota.
--                O aluno participa de um grupo por rota em que viaja.
-- ---------------------------------------------------------------------

do $$
begin
  create type conversa_tipo as enum ('direta', 'grupo');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type conversa_destino as enum ('secretaria', 'motorista');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type conversa_situacao as enum ('bot', 'humano', 'encerrada');
exception when duplicate_object then null;
end;
$$;


create table if not exists public.conversa (
  id           uuid primary key default gen_random_uuid(),
  tipo         conversa_tipo not null,
  -- grupo: a rota dona da conversa. direta com motorista: a rota usada
  -- para descobrir com quem o aluno fala.
  rota_id      uuid references public.rota(id) on delete cascade,
  -- direta: quem abriu e para quem
  estudante_id uuid references public.estudante(id) on delete cascade,
  destino      conversa_destino,
  situacao     conversa_situacao not null default 'bot',
  assunto      text,
  criado_em    timestamptz not null default now(),
  ultima_em    timestamptz not null default now(),
  constraint conversa_grupo_tem_rota
    check (tipo <> 'grupo' or rota_id is not null),
  constraint conversa_direta_tem_estudante
    check (tipo <> 'direta' or (estudante_id is not null and destino is not null))
);

-- Um grupo por rota; uma conversa direta por estudante e destino.
create unique index if not exists uq_conversa_grupo
  on public.conversa (rota_id) where tipo = 'grupo';
create unique index if not exists uq_conversa_direta
  on public.conversa (estudante_id, destino, coalesce(rota_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where tipo = 'direta';

create index if not exists idx_conversa_recente on public.conversa (ultima_em desc);


create table if not exists public.conversa_mensagem (
  id         uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversa(id) on delete cascade,
  -- nulo quando quem falou foi o chatbot
  autor_id   uuid references public.perfil(id) on delete set null,
  eh_bot     boolean not null default false,
  corpo      text not null check (length(trim(corpo)) > 0),
  criado_em  timestamptz not null default now()
);

create index if not exists idx_conversa_mensagem
  on public.conversa_mensagem (conversa_id, criado_em);

-- Mantem a conversa no topo da lista sem o app precisar lembrar disso.
create or replace function public.tg_conversa_toca()
returns trigger
language plpgsql
as $$
begin
  update public.conversa set ultima_em = now() where id = new.conversa_id;
  return new;
end;
$$;

drop trigger if exists conversa_toca on public.conversa_mensagem;
create trigger conversa_toca
  after insert on public.conversa_mensagem
  for each row execute function public.tg_conversa_toca();


-- =====================================================================
-- Quem participa do que
-- =====================================================================

/** O usuario logado participa desta conversa? */
create or replace function public.participa_da_conversa(p_conversa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.conversa c
     where c.id = p_conversa_id
       and (
         public.eh_staff()
         -- dono da conversa direta
         or c.estudante_id = public.meu_estudante_id()
         -- motorista da rota (grupo ou direta enderecada a ele)
         or exists (
              select 1 from public.rota r
               where r.id = c.rota_id and r.motorista_id = public.meu_motorista_id()
            )
         -- estudante alocado na rota do grupo, em qualquer dia
         or (c.tipo = 'grupo' and exists (
              select 1 from public.alocacao_estudante a
               where a.rota_id = c.rota_id and a.ativa
                 and a.estudante_id = public.meu_estudante_id()
            ))
       )
  );
$$;

revoke all on function public.participa_da_conversa(uuid) from public;
grant execute on function public.participa_da_conversa(uuid) to authenticated;


alter table public.conversa enable row level security;
alter table public.conversa_mensagem enable row level security;

drop policy if exists conversa_select on public.conversa;
create policy conversa_select on public.conversa
  for select using (public.participa_da_conversa(id));

drop policy if exists conversa_staff on public.conversa;
create policy conversa_staff on public.conversa
  for all using (public.eh_staff()) with check (public.eh_staff());

drop policy if exists conversa_msg_select on public.conversa_mensagem;
create policy conversa_msg_select on public.conversa_mensagem
  for select using (public.participa_da_conversa(conversa_id));

drop policy if exists conversa_msg_insert on public.conversa_mensagem;
create policy conversa_msg_insert on public.conversa_mensagem
  for insert with check (
    public.participa_da_conversa(conversa_id)
    and (autor_id = auth.uid() or autor_id is null)
  );


-- =====================================================================
-- Abertura e envio
-- =====================================================================

/**
 * Garante o grupo de cada rota em que o estudante viaja e devolve as
 * conversas dele: os grupos e as diretas ja abertas.
 */
create or replace function public.minhas_conversas()
returns table (
  id          uuid,
  tipo        conversa_tipo,
  destino     conversa_destino,
  situacao    conversa_situacao,
  titulo      text,
  subtitulo   text,
  rota_id     uuid,
  ultima_em   timestamptz,
  ultima_msg  text,
  participantes int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_estudante uuid := public.meu_estudante_id();
begin
  if v_estudante is null then
    return;
  end if;

  return query
  select c.id,
         c.tipo,
         c.destino,
         c.situacao,
         case
           when c.tipo = 'grupo' then coalesce(r.codigo || ' — ' || r.nome, 'Grupo da rota')
           when c.destino = 'secretaria' then 'Secretaria'
           else coalesce(m.nome, 'Motorista')
         end,
         case
           when c.tipo = 'grupo' then coalesce(m.nome, 'Motorista') || ' e os estudantes da rota'
           when c.destino = 'secretaria' then 'Setor de transporte'
           else coalesce(r.codigo, '')
         end,
         c.rota_id,
         c.ultima_em,
         (select cm.corpo from public.conversa_mensagem cm
           where cm.conversa_id = c.id order by cm.criado_em desc limit 1),
         case when c.tipo = 'grupo' then (
           select count(distinct a.estudante_id)::int + 1
             from public.alocacao_estudante a
            where a.rota_id = c.rota_id and a.ativa and a.situacao = 'alocado'
         ) else 2 end
    from public.conversa c
    left join public.rota r      on r.id = c.rota_id
    left join public.motorista m on m.id = r.motorista_id
   where (c.tipo = 'direta' and c.estudante_id = v_estudante)
      or (c.tipo = 'grupo' and exists (
            select 1 from public.alocacao_estudante a
             where a.rota_id = c.rota_id and a.ativa and a.estudante_id = v_estudante
          ))
   order by c.ultima_em desc;
end;
$$;

revoke all on function public.minhas_conversas() from public;
grant execute on function public.minhas_conversas() to authenticated;


/** Cria os grupos das rotas do estudante que ainda nao existem. */
create or replace function public.garantir_grupos_das_rotas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estudante uuid := public.meu_estudante_id();
  v_criados int := 0;
begin
  if v_estudante is null then
    return 0;
  end if;

  insert into public.conversa (tipo, rota_id)
  select distinct 'grupo'::conversa_tipo, a.rota_id
    from public.alocacao_estudante a
   where a.estudante_id = v_estudante and a.ativa and a.rota_id is not null
  on conflict do nothing;

  get diagnostics v_criados = row_count;
  return v_criados;
end;
$$;

revoke all on function public.garantir_grupos_das_rotas() from public;
grant execute on function public.garantir_grupos_das_rotas() to authenticated;


/**
 * Abre (ou reaproveita) a conversa direta com a secretaria ou com o
 * motorista da rota do dia, e devolve o id.
 */
create or replace function public.abrir_conversa_direta(
  p_destino conversa_destino,
  p_assunto text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estudante uuid := public.meu_estudante_id();
  v_rota uuid;
  v_id   uuid;
begin
  if v_estudante is null then
    raise exception 'Cadastro de estudante nao encontrado.';
  end if;

  if p_destino = 'motorista' then
    select a.rota_id into v_rota
      from public.alocacao_estudante a
     where a.estudante_id = v_estudante and a.ativa and a.situacao = 'alocado'
       and (a.dia_semana = extract(dow from current_date)::smallint or a.dia_semana is null)
     order by a.dia_semana nulls last
     limit 1;

    if v_rota is null then
      raise exception 'Voce nao esta alocado em uma rota hoje.';
    end if;
  end if;

  select c.id into v_id
    from public.conversa c
   where c.tipo = 'direta' and c.estudante_id = v_estudante
     and c.destino = p_destino
     and c.rota_id is not distinct from v_rota;

  if v_id is null then
    insert into public.conversa (tipo, estudante_id, destino, rota_id, assunto, situacao)
         values ('direta', v_estudante, p_destino, v_rota, p_assunto, 'bot')
      returning id into v_id;

    -- Primeira fala e do bot: o atendimento comeca automatizado e so
    -- vira humano quando o assunto exigir (situacao = 'humano').
    insert into public.conversa_mensagem (conversa_id, eh_bot, corpo)
    values (v_id, true,
      case when p_destino = 'secretaria'
        then 'Olá! Sou o assistente do GTPORTE. Me conte o que você precisa: documentos, rota, horários ou outro assunto. Se eu não resolver, encaminho para a secretaria.'
        else 'Olá! Sou o assistente do GTPORTE. Posso ajudar com atraso, ponto de embarque e presença. Se precisar falar direto com o motorista, é só dizer.'
      end);
  end if;

  return v_id;
end;
$$;

revoke all on function public.abrir_conversa_direta(conversa_destino, text) from public;
grant execute on function public.abrir_conversa_direta(conversa_destino, text) to authenticated;


/** Escala a conversa para atendimento humano. */
create or replace function public.escalar_conversa(p_conversa_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.participa_da_conversa(p_conversa_id) then
    raise exception 'Sem acesso a esta conversa.';
  end if;

  update public.conversa set situacao = 'humano' where id = p_conversa_id and situacao = 'bot';

  insert into public.conversa_mensagem (conversa_id, eh_bot, corpo)
  select p_conversa_id, true,
         'Encaminhei seu atendimento. Em breve alguém responde por aqui.'
   where exists (select 1 from public.conversa where id = p_conversa_id and situacao = 'humano');
end;
$$;

revoke all on function public.escalar_conversa(uuid) from public;
grant execute on function public.escalar_conversa(uuid) to authenticated;
