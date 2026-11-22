-- MB-03: proposed fenced lease operations for the EXISTING pbos_runner.execution_lease.
-- Apply only to an isolated, reviewed runner environment. Never run against
-- canonical Genesis without verified recovery and signed mission admission.
-- These functions do not grant authority to run missions.
CREATE OR REPLACE FUNCTION pbos_runner.acquire_execution_lease(
  p_resource text, p_owner uuid, p_ttl_seconds integer
) RETURNS TABLE(acquired boolean, token bigint, deadline timestamptz)
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  IF p_resource IS NULL OR length(trim(p_resource)) = 0
     OR p_owner IS NULL OR p_ttl_seconds < 5 OR p_ttl_seconds > 300
     OR p_ttl_seconds IS NULL THEN
    RAISE EXCEPTION 'Invalid execution lease request';
  END IF;
  INSERT INTO pbos_runner.execution_lease
    (resource, owner_id, fencing_token, expires_at, updated_at)
  VALUES (p_resource, p_owner, 1, clock_timestamp() + make_interval(secs => p_ttl_seconds), clock_timestamp())
  ON CONFLICT (resource) DO UPDATE SET
    owner_id = EXCLUDED.owner_id,
    fencing_token = pbos_runner.execution_lease.fencing_token + 1,
    expires_at = clock_timestamp() + make_interval(secs => p_ttl_seconds),
    updated_at = clock_timestamp()
  WHERE pbos_runner.execution_lease.expires_at < clock_timestamp()
  RETURNING true, fencing_token, expires_at
  INTO acquired, token, deadline;
  IF NOT FOUND THEN
    acquired := false;
    token := NULL;
    deadline := NULL;
  END IF;
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION pbos_runner.renew_execution_lease(
  p_resource text, p_owner uuid, p_token bigint, p_ttl_seconds integer
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE changed integer;
BEGIN
  IF p_resource IS NULL OR p_owner IS NULL OR p_token IS NULL
     OR p_ttl_seconds IS NULL OR p_ttl_seconds < 5 OR p_ttl_seconds > 300 THEN
    RETURN false;
  END IF;
  UPDATE pbos_runner.execution_lease SET
    expires_at = clock_timestamp() + make_interval(secs => p_ttl_seconds),
    updated_at = clock_timestamp()
  WHERE resource = p_resource AND owner_id = p_owner
    AND fencing_token = p_token AND expires_at > clock_timestamp();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END $$;

CREATE OR REPLACE FUNCTION pbos_runner.release_execution_lease(
  p_resource text, p_owner uuid, p_token bigint
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE changed integer;
BEGIN
  -- Preserve the row and token so the next acquisition strictly increases the fence.
  UPDATE pbos_runner.execution_lease SET
    expires_at = clock_timestamp() - interval '1 millisecond',
    updated_at = clock_timestamp()
  WHERE resource = p_resource AND owner_id = p_owner
    AND fencing_token = p_token AND expires_at > clock_timestamp();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END $$;
