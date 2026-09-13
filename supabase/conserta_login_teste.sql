-- =====================================================================
-- Conserta contas de auth.users criadas com colunas de token nulas
--
-- Sintoma: o login devolve 500 "Database error querying schema" em vez
-- de aceitar ou recusar a senha. O GoTrue le essas colunas como texto
-- simples e nao aceita NULL, entao falha antes de conferir a senha.
--
-- Causa: versoes anteriores de seed_estudante_teste.sql inseriam em
-- auth.users sem preencher esses campos.
--
-- Rode no SQL Editor. Afeta apenas linhas realmente afetadas.
-- =====================================================================

update auth.users
   set confirmation_token         = coalesce(confirmation_token, ''),
       recovery_token             = coalesce(recovery_token, ''),
       email_change               = coalesce(email_change, ''),
       email_change_token_new     = coalesce(email_change_token_new, ''),
       email_change_token_current = coalesce(email_change_token_current, ''),
       phone_change               = coalesce(phone_change, ''),
       phone_change_token         = coalesce(phone_change_token, ''),
       reauthentication_token     = coalesce(reauthentication_token, '')
 where confirmation_token is null
    or recovery_token is null
    or email_change is null
    or email_change_token_new is null
    or email_change_token_current is null
    or phone_change is null
    or phone_change_token is null
    or reauthentication_token is null;

-- Opcional: redefinir a senha da conta de teste de uma vez.
-- Troque o valor antes de descomentar.
--
-- update auth.users
--    set encrypted_password = crypt('SUA_SENHA_AQUI', gen_salt('bf')),
--        email_confirmed_at = coalesce(email_confirmed_at, now()),
--        updated_at = now()
--  where email = 'estudante.teste@gtporte.local';

-- Conferencia: deve retornar 0 linhas depois do update acima.
select count(*) as ainda_quebradas
  from auth.users
 where confirmation_token is null
    or recovery_token is null
    or email_change is null
    or email_change_token_new is null
    or email_change_token_current is null
    or phone_change is null
    or phone_change_token is null
    or reauthentication_token is null;
