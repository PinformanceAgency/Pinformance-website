-- Store the scopes Pinterest actually grants so we can diagnose ads:read issues
alter table organizations add column if not exists pinterest_token_scopes text;
