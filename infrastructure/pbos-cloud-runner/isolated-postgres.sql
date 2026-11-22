-- PBOS isolated cloud state and lease store. Apply ONLY to a dedicated non-production
-- PostgreSQL database after explicit selection. Never apply to Playbook OS production.
BEGIN;
CREATE SCHEMA IF NOT EXISTS pbos_runner;
REVOKE ALL ON SCHEMA pbos_runner FROM PUBLIC;
CREATE TABLE IF NOT EXISTS pbos_runner.canonical_state (
  state_key text PRIMARY KEY CHECK (state_key = 'genesis'),
  state_ciphertext bytea NOT NULL,
  plaintext_sha256 char(64) NOT NULL CHECK (plaintext_sha256 ~ '^[0-9a-f]{64}$'),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pbos_runner.execution_lease (
  resource text PRIMARY KEY,
  owner_id uuid NOT NULL,
  fencing_token bigint NOT NULL DEFAULT 1 CHECK (fencing_token > 0),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pbos_runner.mission_checkpoint (
  mission_id text PRIMARY KEY,
  repository text NOT NULL,
  lease_resource text NOT NULL,
  owner_id uuid NOT NULL,
  fencing_token bigint NOT NULL,
  state_version bigint NOT NULL,
  checkpoint_ciphertext bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON ALL TABLES IN SCHEMA pbos_runner FROM PUBLIC, anon, authenticated;
-- Dedicated runner DB role must be provisioned separately with minimum grants.
COMMIT;

-- Transactionally acquire or renew the single-writer lease. A stale owner may
-- never reuse a fencing token after a takeover. Call with a short TTL.
CREATE OR REPLACE FUNCTION pbos_runner.acquire_lease(
  p_resource text, p_owner uuid, p_ttl_seconds integer
) RETURNS TABLE(fencing_token bigint, expires_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pbos_runner AS $$
DECLARE current_lease pbos_runner.execution_lease%ROWTYPE;
BEGIN
  IF p_resource IS NULL OR length(p_resource) < 1 OR p_owner IS NULL
    OR p_ttl_seconds NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'invalid lease request';
  END IF;
  INSERT INTO pbos_runner.execution_lease(resource, owner_id, fencing_token, expires_at)
  VALUES (p_resource, p_owner, 1, clock_timestamp() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (resource) DO NOTHING;
  SELECT * INTO current_lease FROM pbos_runner.execution_lease WHERE resource = p_resource FOR UPDATE;
  IF current_lease.owner_id <> p_owner AND current_lease.expires_at > clock_timestamp() THEN
    RETURN;
  END IF;
  IF current_lease.owner_id <> p_owner THEN
    current_lease.fencing_token := current_lease.fencing_token + 1;
  END IF;
  UPDATE pbos_runner.execution_lease l
     SET owner_id = p_owner, fencing_token = current_lease.fencing_token,
         expires_at = clock_timestamp() + make_interval(secs => p_ttl_seconds),
         updated_at = clock_timestamp()
   WHERE l.resource = p_resource
   RETURNING l.fencing_token, l.expires_at INTO fencing_token, expires_at;
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION pbos_runner.acquire_lease(text,uuid,integer) FROM PUBLIC, anon, authenticated;

-- Every state mutation must validate the live lease and increment the state
-- version under the SAME transaction/row lock. Ciphertext is encrypted by the
-- runner before it reaches the database; no plaintext Genesis state is stored.
CREATE OR REPLACE FUNCTION pbos_runner.commit_state(
  p_resource text, p_owner uuid, p_token bigint, p_expected_version bigint,
  p_ciphertext bytea, p_plaintext_sha256 char(64)
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pbos_runner AS $$
DECLARE current_lease pbos_runner.execution_lease%ROWTYPE;
DECLARE next_version bigint;
BEGIN
  SELECT * INTO current_lease FROM pbos_runner.execution_lease
   WHERE resource = p_resource FOR UPDATE;
  IF NOT FOUND OR current_lease.owner_id <> p_owner
    OR current_lease.fencing_token <> p_token
    OR current_lease.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'stale or missing fenced lease';
  END IF;
  UPDATE pbos_runner.canonical_state s
     SET state_ciphertext = p_ciphertext, plaintext_sha256 = p_plaintext_sha256,
         version = s.version + 1, updated_at = clock_timestamp()
   WHERE s.state_key = 'genesis' AND s.version = p_expected_version
   RETURNING s.version INTO next_version;
  IF next_version IS NULL THEN RAISE EXCEPTION 'canonical state version mismatch or absent'; END IF;
  RETURN next_version;
END $$;
REVOKE ALL ON FUNCTION pbos_runner.commit_state(text,uuid,bigint,bigint,bytea,char) FROM PUBLIC, anon, authenticated;
