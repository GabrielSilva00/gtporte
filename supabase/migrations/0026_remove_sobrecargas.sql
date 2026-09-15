-- ---------------------------------------------------------------------
-- Remove as sobrecargas antigas que deixaram funcoes ambiguas
--
-- As migrations 0022 e 0023 recriaram tres funcoes acrescentando um
-- parametro. `create or replace function` so substitui quando a
-- assinatura e identica: com um parametro a mais, o Postgres criou uma
-- SEGUNDA funcao e manteve a antiga.
--
-- O PostgREST entao passou a receber chamadas que servem para as duas e
-- recusou todas:
--
--   PGRST203 Could not choose the best candidate function between:
--     public.minha_rota(), public.minha_rota(p_data => date)
--
-- Como o aplicativo chama minha_rota() sem argumento, a tela inicial, a
-- aba Rota, o mapa e o perfil quebraram juntos.
--
-- Aqui as versoes antigas sao removidas, ficando apenas a que tem o
-- parametro com valor padrao — que atende os dois jeitos de chamar.
-- ---------------------------------------------------------------------

-- Rota do estudante: a versao com data cobre a chamada sem argumento.
drop function if exists public.minha_rota();

-- Motorista responsavel: a versao com data resolve o dia correto.
drop function if exists public.motorista_da_alocacao(uuid);

-- Cancelamento: a versao com motivo padronizado aceita as chamadas antigas.
drop function if exists public.cancelar_presenca(uuid, text, text, date);

-- ---------------------------------------------------------------------
-- Conferencia: as tres devem aparecer uma unica vez cada.
-- ---------------------------------------------------------------------
select p.proname as funcao,
       count(*)  as versoes,
       string_agg(pg_get_function_identity_arguments(p.oid), ' | ') as assinaturas
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('minha_rota', 'motorista_da_alocacao', 'cancelar_presenca',
                     'confirmar_presenca')
 group by p.proname
 order by p.proname;
