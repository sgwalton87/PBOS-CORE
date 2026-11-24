-- MB-03 Stage 3: durable disposable Genesis execution state.
-- This namespace is not canonical Genesis and cannot be used for observation.
-- Apply only to the isolated PBOS runner database after independent review.

CREATE TABLE IF NOT EXISTS pbos_runner.mb03_disposable_namespace (
  namespace text PRIMARY KEY,
  source_state_pin text NOT NULL CHECK (source_state_pin ~ '^[a-f0-9]{64}$'),
  authority_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  state_version bigint NOT NULL DEFAULT 0 CHECK (state_version >= 0)
);
REVOKE ALL ON pbos_runner.mb03_disposable_namespace FROM PUBLIC;

CREATE TABLE IF NOT EXISTS pbos_runner.mb03_disposable_event (
  namespace text NOT NULL REFERENCES pbos_runner.mb03_disposable_namespace(namespace),
  sequence bigint NOT NULL CHECK (sequence > 0),
  event_id uuid NOT NULL,
  event_type text NOT NULL CHECK (length(trim(event_type)) > 0),
  mission_id text,
  actor_id text NOT NULL CHECK (length(trim(actor_id)) > 0),
  payload jsonb NOT NULL,
  fencing_token bigint NOT NULL CHECK (fencing_token > 0),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (namespace, sequence),
  UNIQUE (namespace, event_id)
);
REVOKE ALL ON pbos_runner.mb03_disposable_event FROM PUBLIC;

CREATE OR REPLACE FUNCTION pbos_runner.initialize_mb03_disposable_namespace(
  p_namespace text, p_source_state_pin text, p_authority_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pbos_runner' AS $$
BEGIN
  IF p_namespace IS NULL OR p_namespace !~ '^[A-Za-z0-9._-]+$'
     OR p_source_state_pin IS NULL OR p_source_state_pin !~ '^[a-f0-9]{64}$'
     OR p_authority_id IS NULL THEN
    RAISE EXCEPTION 'invalid disposable namespace';
  END IF;
  INSERT INTO pbos_runner.mb03_disposable_namespace(namespace, source_state_pin, authority_id)
  VALUES (p_namespace, p_source_state_pin, p_authority_id)
  ON CONFLICT (namespace) DO UPDATE SET state_version = pbos_runner.mb03_disposable_namespace.state_version
  WHERE pbos_runner.mb03_disposable_namespace.source_state_pin = EXCLUDED.source_state_pin
    AND pbos_runner.mb03_disposable_namespace.authority_id = EXCLUDED.authority_id;
  IF NOT EXISTS (
    SELECT 1 FROM pbos_runner.mb03_disposable_namespace
    WHERE namespace = p_namespace AND source_state_pin = p_source_state_pin AND authority_id = p_authority_id
  ) THEN RAISE EXCEPTION 'disposable namespace lineage conflict'; END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION pbos_runner.append_mb03_disposable_event(
  p_namespace text, p_event_id uuid, p_event_type text, p_mission_id text,
 p_actor_id text, p_payload jsonb, p_lease_resource text,
 p_fencing_token bigint, p_expected_sequence bigint
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'pbos_runner' AS $$
DECLARE next_sequence bigint;
BEGIN
  IF p_namespace IS NULL OR p_event_id IS NULL OR p_event_type IS NULL
     OR p_actor_id IS NULL OR p_payload IS NULL OR p_fencing_token IS NULL
     OR p_lease_resource IS NULL OR length(trim(p_lease_resource)) = 0
     OR p_expected_sequence IS NULL OR p_expected_sequence < 0 THEN
    RAISE EXCEPTION 'invalid disposable event';
  END IF;
  SELECT state_version + 1 INTO next_sequence
  FROM pbos_runner.mb03_disposable_namespace
  WHERE namespace = p_namespace FOR UPDATE;
  IF next_sequence IS NULL OR next_sequence <> p_expected_sequence + 1 THEN
    RAISE EXCEPTION 'disposable event sequence conflict';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pbos_runner.execution_lease
    WHERE resource = p_lease_resource AND fencing_token = p_fencing_token
      AND expires_at > clock_timestamp()
  ) THEN RAISE EXCEPTION 'stale or missing disposable fence'; END IF;
  INSERT INTO pbos_runner.mb03_disposable_event
    (namespace, sequence, event_id, event_type, mission_id, actor_id, payload, fencing_token)
  VALUES (p_namespace, next_sequence, p_event_id, p_event_type, p_mission_id, p_actor_id, p_payload, p_fencing_token);
  UPDATE pbos_runner.mb03_disposable_namespace SET state_version = next_sequence
  WHERE namespace = p_namespace;
  RETURN next_sequence;
END $$;

REVOKE ALL ON FUNCTION pbos_runner.initialize_mb03_disposable_namespace(text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION pbos_runner.append_mb03_disposable_event(text,uuid,text,text,text,jsonb,text,bigint,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION pbos_runner.append_mb03_disposable_event(text,uuid,text,text,text,jsonb,bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pbos_runner.initialize_mb03_disposable_namespace(text,text,uuid) TO pbos_mb03_staging_executor;
GRANT EXECUTE ON FUNCTION pbos_runner.append_mb03_disposable_event(text,uuid,text,text,text,jsonb,text,bigint,bigint) TO pbos_mb03_staging_executor;
