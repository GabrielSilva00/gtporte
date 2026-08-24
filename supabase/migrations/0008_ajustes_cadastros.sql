-- =====================================================================
-- GTPORTE - 0008_ajustes_cadastros.sql
-- Ajustes pontuais de cadastro pedidos na validacao:
--   1. foto do estudante
--   2. endereco da universidade
--   3. ocupacao por data (painel "Ocupacao do dia")
-- Idempotente: pode ser reexecutada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Foto do estudante
-- O arquivo vai para o mesmo bucket privado 'documentos', no caminho
-- {estudante_id}/foto-{timestamp}.{ext}. Como a primeira pasta continua
-- sendo o id do estudante, as policies de 0002_rls.sql ja cobrem o caso
-- e nada precisa mudar no storage.
-- ---------------------------------------------------------------------
alter table public.estudante
  add column if not exists foto_path text;

-- ---------------------------------------------------------------------
-- 2. Endereco da universidade
-- ---------------------------------------------------------------------
alter table public.universidade
  add column if not exists logradouro  text,
  add column if not exists numero      text,
  add column if not exists complemento text,
  add column if not exists bairro      text,
  add column if not exists cep         text;

-- ---------------------------------------------------------------------
-- 3. Ocupacao por data
-- vw_ocupacao_rota conta alocacoes ativas, ou seja, e sempre "ao vivo" e
-- nao sabe responder por um dia passado. Para o painel poder comparar
-- hoje com o dia anterior, a ocupacao de uma data vem das presencas
-- efetivamente confirmadas naquela data.
--
-- Regra: para a data corrente, mantem-se o numero de alocados (e o que o
-- painel sempre mostrou); para datas passadas, conta-se quem confirmou
-- ida ou volta e nao cancelou.
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
language sql
stable
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.ocupacao_por_data(date) to authenticated;
