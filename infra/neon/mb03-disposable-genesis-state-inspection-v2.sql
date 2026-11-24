-- MB-03 Stage 3 follow-up: least-privilege read-only namespace inspection.
-- Apply after mb03-disposable-genesis-state.sql. No table grants are added.

CREATE OR REPLACE FUNCTION pbos_runner.inspect_mb03_disposable_namespace(p_namespace text)
RETURNS TABLE(source_state_pin text, authority_id uuid)
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pbos_runner'
AS $$
  SELECT n.source_state_pin, n.authority_id
  FROM pbos_runner.mb03_disposable_namespace n
  WHERE n.namespace = p_namespace
$$;

REVOKE ALL ON FUNCTION pbos_runner.inspect_mb03_disposable_namespace(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pbos_runner.inspect_mb03_disposable_namespace(text) TO pbos_mb03_staging_executor;
