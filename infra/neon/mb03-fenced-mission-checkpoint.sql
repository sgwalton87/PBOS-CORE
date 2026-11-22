-- MB03: transactional fenced, versioned encrypted mission checkpoint.
-- This is runtime evidence, NOT a replacement for the GitHub PPS Canon.
CREATE OR REPLACE FUNCTION pbos_runner.commit_mission_checkpoint(
 p_mission_id text, p_repository text, p_resource text, p_owner uuid,
 p_token bigint, p_expected_version bigint, p_ciphertext bytea
) RETURNS bigint LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'pbos_runner'
AS $$
DECLARE
 current_lease pbos_runner.execution_lease%ROWTYPE;
 next_version bigint;
BEGIN
 IF p_mission_id IS NULL OR length(trim(p_mission_id))=0
    OR p_repository IS NULL OR length(trim(p_repository))=0
    OR p_ciphertext IS NULL OR octet_length(p_ciphertext)=0
    OR p_expected_version < 0
    OR p_resource IS DISTINCT FROM ('pbos:mission:' || p_repository || ':' || p_mission_id) THEN
   RAISE EXCEPTION 'invalid checkpoint input';
 END IF;
 SELECT * INTO current_lease FROM pbos_runner.execution_lease
 WHERE resource=p_resource FOR UPDATE;
 IF NOT FOUND OR current_lease.owner_id<>p_owner
    OR current_lease.fencing_token<>p_token
    OR current_lease.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'stale or missing fenced lease';
 END IF;
 IF p_expected_version=0 THEN
   INSERT INTO pbos_runner.mission_checkpoint
    (mission_id,repository,lease_resource,owner_id,fencing_token,state_version,checkpoint_ciphertext,updated_at)
   VALUES (p_mission_id,p_repository,p_resource,p_owner,p_token,1,p_ciphertext,clock_timestamp())
   ON CONFLICT (mission_id) DO NOTHING
   RETURNING state_version INTO next_version;
 ELSE
   UPDATE pbos_runner.mission_checkpoint
   SET repository=p_repository,lease_resource=p_resource,owner_id=p_owner,
       fencing_token=p_token,state_version=state_version+1,
       checkpoint_ciphertext=p_ciphertext,updated_at=clock_timestamp()
   WHERE mission_id=p_mission_id AND repository=p_repository
     AND state_version=p_expected_version
   RETURNING state_version INTO next_version;
 END IF;
 IF next_version IS NULL THEN RAISE EXCEPTION 'checkpoint version conflict'; END IF;
 RETURN next_version;
END $$;
