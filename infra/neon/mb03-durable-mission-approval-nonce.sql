-- MB03 durable one-use signed approval nonces. Isolated runner schema only.
-- A nonce is consumed atomically before any mission executor is called.
-- Never silently delete expired rows: historical nonces must remain unusable.
CREATE TABLE IF NOT EXISTS pbos_runner.mission_approval_nonce (
  nonce uuid PRIMARY KEY,
  mission_id text NOT NULL,
  repository text NOT NULL,
  approval_expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT nonce_mission_nonempty CHECK (length(trim(mission_id)) > 0),
  CONSTRAINT nonce_repository_nonempty CHECK (length(trim(repository)) > 0)
);
REVOKE ALL ON pbos_runner.mission_approval_nonce FROM PUBLIC;
CREATE OR REPLACE FUNCTION pbos_runner.consume_mission_approval_nonce(
  p_nonce uuid, p_mission_id text, p_repository text, p_expires_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE inserted integer;
BEGIN
  IF p_nonce IS NULL OR p_mission_id IS NULL OR length(trim(p_mission_id)) = 0
    OR p_repository IS NULL OR length(trim(p_repository)) = 0
    OR p_expires_at IS NULL OR p_expires_at <= clock_timestamp()
    OR p_expires_at > clock_timestamp() + interval '15 minutes' THEN
    RETURN false;
  END IF;
  INSERT INTO pbos_runner.mission_approval_nonce(nonce,mission_id,repository,approval_expires_at)
  VALUES(p_nonce,p_mission_id,p_repository,p_expires_at)
  ON CONFLICT(nonce) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted = 1;
END $$;
