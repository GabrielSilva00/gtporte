-- =====================================================================
-- GTPORTE - 0014_correcoes_revisao.sql
-- Correcoes apontadas na revisao automatizada da branch de ajustes.
-- Sao tres falhas de controle de acesso e uma de auditoria, todas
-- introduzidas ou agravadas pelas migrations 0008 a 0012.
-- Idempotente: pode ser reexecutada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Dados pessoais do motorista expostos a qualquer autenticado
--
-- A policy motorista_select_autenticado (0002_rls.sql) foi escrita quando
-- a tabela tinha apenas nome, telefone, CNH e status: ela existia para o
-- estudante saber quem dirige a rota dele. A migration 0011 acrescentou
-- CPF, RG, data de nascimento, endereco residencial completo, e-mail
-- pessoal e matricula a essa mesma tabela, e a policy nao foi revista -
-- qualquer estudante logado passou a conseguir ler o CPF e o endereco de
-- toda a equipe.
--
-- A tabela passa a ser legivel apenas pelo staff e pelo proprio
-- motorista. O que o estudante precisa continua acessivel pela view
-- abaixo e pela RPC minha_rota(), que ja devolve nome e telefone.
-- ---------------------------------------------------------------------
drop policy if exists motorista_select_autenticado on public.motorista;
create policy motorista_select_autenticado on public.motorista
  for select using (
    public.eh_staff() or perfil_id = auth.uid()
  );

-- Dados de contato do motorista, sem nada sensivel: e o que as telas do
-- estudante realmente consomem.
drop view if exists public.vw_motorista_publico;
create view public.vw_motorista_publico
with (security_invoker = true) as
select m.id,
       m.nome,
       m.telefone,
       m.foto_path,
       m.status
from public.motorista m
where m.ativo;

grant select on public.vw_motorista_publico to authenticated;

-- ---------------------------------------------------------------------
-- 2. Motorista podia aprovar o proprio documento
--
-- docmot_insert (0010) validava so o motorista_id, nao o status. Como o
-- trigger trg_docmot_status recalcula motorista.status_documental na
-- hora, bastava inserir um documento com status 'aprovado' por chamada
-- direta ao PostgREST para se auto-aprovar, furando a RN07 que as quatro
-- RPCs de revisao protegem. A tela mandava 'pendente' por convencao, nao
-- por obrigacao.
-- ---------------------------------------------------------------------
drop policy if exists docmot_insert on public.documento_motorista;
create policy docmot_insert on public.documento_motorista
  for insert with check (
    public.eh_staff()
    or (motorista_id = public.meu_motorista_id() and status = 'pendente')
  );

-- Mesma falha existia no lado do estudante desde 0002_rls.sql.
drop policy if exists documento_insert on public.documento;
create policy documento_insert on public.documento
  for insert with check (
    public.eh_staff()
    or (estudante_id = public.meu_estudante_id() and status = 'pendente')
  );

-- ---------------------------------------------------------------------
-- 3. ocupacao_por_data contornava a RLS
--
-- A view vw_ocupacao_rota foi criada em 0005 explicitamente com
-- security_invoker = true, para que a RLS de alocacao_estudante valesse.
-- A RPC de 0008 faz o mesmo trabalho como security definer e sem checar
-- quem chama: desfazia aquela decisao e deixava qualquer autenticado
-- enumerar a ocupacao real de todas as rotas, em qualquer data.
--
-- O painel que consome a funcao e administrativo, entao restringir ao
-- staff nao tira funcionalidade de ninguem.
-- ---------------------------------------------------------------------
create or replace function public.ocupacao_por_data(p_data date default current_date)
returns table (
  rota_id           uuid,
  codigo            text,
  nome              text,
  capacidade_maxima smallint,
  ocupacao          int,
  percentual        int
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.eh_staff() then
    raise exception 'Perfil sem permissao para consultar a ocupacao das rotas';
  end if;

  return query
  select r.id,
         r.codigo,
         r.nome,
         v.capacidade_maxima,
         coalesce(oc.total, 0)::int,
         round(100.0 * coalesce(oc.total, 0) / nullif(v.capacidade_maxima, 0))::int
    from public.rota r
    join public.veiculo v on v.id = r.veiculo_id
    left join lateral (
      select case
               when p_data >= current_date then
                 count(*) filter (where a.ativa and a.situacao = 'alocado')
               else
                 count(*) filter (
                   where (coalesce(p.confirmou_ida, false) and not coalesce(p.cancelou_ida, false))
                      or (coalesce(p.confirmou_volta, false) and not coalesce(p.cancelou_volta, false))
                 )
             end as total
        from public.alocacao_estudante a
        left join public.presenca p on p.alocacao_id = a.id and p.data = p_data
       where a.rota_id = r.id
    ) oc on true
   where r.status <> 'inativa'
   order by r.codigo;
end;
$fn$;

grant execute on function public.ocupacao_por_data(date) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Cancelamento de solicitacao nao era registrado (RN12)
--
-- solicitar_ e decidir_ chamam registrar_log; cancelar_ nao chamava. O
-- cancelamento muda o status de um pedido que o motorista podia estar
-- avaliando, entao precisa aparecer no relatorio de auditoria.
-- ---------------------------------------------------------------------
create or replace function public.cancelar_solicitacao_volta(
  p_data         date default current_date,
  p_estudante_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_estudante uuid;
  v_alocacao  uuid;
  v_id        uuid;
begin
  if public.meu_tipo() = 'estudante' then
    v_estudante := public.meu_estudante_id();
  elsif public.eh_staff() then
    v_estudante := p_estudante_id;
  else
    raise exception 'Perfil sem permissao para cancelar a solicitacao';
  end if;

  select a.id into v_alocacao
    from public.alocacao_estudante a
   where a.estudante_id = v_estudante and a.ativa and a.situacao = 'alocado';

  if v_alocacao is null then
    return jsonb_build_object('mensagem', 'Nenhuma solicitacao a cancelar');
  end if;

  update public.solicitacao_volta
     set status = 'cancelada', decidido_por = auth.uid(), decidido_em = now()
   where alocacao_id = v_alocacao and data = p_data and status = 'pendente'
   returning id into v_id;

  if v_id is not null then
    perform public.registrar_log('cancelar_solicitacao_volta', 'solicitacao_volta',
                                 v_id, jsonb_build_object('data', p_data));
  end if;

  return jsonb_build_object('status', 'cancelada', 'mensagem', 'Solicitacao cancelada');
end;
$fn$;

grant execute on function public.cancelar_solicitacao_volta(date, uuid) to authenticated;
