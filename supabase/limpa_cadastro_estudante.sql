-- =====================================================================
-- GTPORTE — inspecionar e remover cadastros de estudante travados
--
-- NAO E UMA MIGRATION. Ferramenta de desenvolvimento.
--
-- Use quando o cadastro pelo app falhar com:
--   duplicate key value violates unique constraint "estudante_cpf_key"
--   duplicate key value violates unique constraint "estudante_perfil_id_key"
--
-- Isso quer dizer que o CPF (ou a conta) ja tem cadastro — normalmente
-- restos de uma tentativa que criou o estudante e parou no meio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. VER o que existe. Rode primeiro e olhe o resultado.
-- ---------------------------------------------------------------------
select e.id,
       e.nome,
       e.cpf,
       e.prontuario,
       e.email,
       e.status_documental,
       e.criado_em,
       p.email                                        as email_da_conta,
       (select count(*) from public.documento d
         where d.estudante_id = e.id)                 as documentos,
       (select count(*) from public.grade_horaria g
         where g.estudante_id = e.id)                 as dias_de_aula,
       exists (select 1 from public.alocacao_estudante a
                where a.estudante_id = e.id and a.ativa) as tem_alocacao
  from public.estudante e
  left join public.perfil p on p.id = e.perfil_id
 order by e.criado_em desc
 limit 20;

-- ---------------------------------------------------------------------
-- 2. REMOVER um cadastro especifico.
--
-- Escolha UMA das linhas abaixo, troque o valor e descomente.
-- O delete leva junto documentos, grade e alocacoes (on delete cascade).
-- A CONTA DE ACESSO permanece: so o cadastro de estudante e apagado,
-- entao da para refazer o cadastro pelo app com a mesma conta.
-- ---------------------------------------------------------------------

-- Por CPF:
-- delete from public.estudante where cpf = '000.000.000-00';

-- Pelo e-mail da conta:
-- delete from public.estudante
--  where perfil_id = (select id from public.perfil where email = 'seu@email.com');

-- ---------------------------------------------------------------------
-- 3. Limpeza mais ampla: cadastros sem nenhum documento e sem alocacao,
--    criados ha mais de uma hora. Sao tentativas abandonadas.
--    Confira com o select antes de descomentar o delete.
-- ---------------------------------------------------------------------
-- select id, nome, cpf, criado_em from public.estudante e
--  where not exists (select 1 from public.documento d where d.estudante_id = e.id)
--    and not exists (select 1 from public.alocacao_estudante a where a.estudante_id = e.id)
--    and e.criado_em < now() - interval '1 hour';

-- delete from public.estudante e
--  where not exists (select 1 from public.documento d where d.estudante_id = e.id)
--    and not exists (select 1 from public.alocacao_estudante a where a.estudante_id = e.id)
--    and e.criado_em < now() - interval '1 hour';
