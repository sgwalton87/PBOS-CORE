"""Apply the reviewed readiness manifest once, then verify its single Cloud Run receipt."""
import hashlib
import http.client
import json
import re
import subprocess
import sys
import time
from pathlib import Path


PROJECT = "pbos-genesis-staging"
REGION = "us-west1"
JOB = "pbos-mb03-playbook-readiness"
UID = "950acb8f-48ec-428d-ae67-087ed5b61a9d"
PREVIOUS = JOB + "-vlzxs"
MANIFEST_SHA = "7bac3a340408c11dcd89bf63883304e7981d8477a560bc0f3219bb4d5eefc7be"
SOURCE = "b2c2259d67f30ca068f32cd1889542991f294e42"
LOCATION = f"projects/{PROJECT}/locations/{REGION}"
LOCATION_PATTERN = rf"projects/(?:{PROJECT}|211508256780)/locations/{REGION}"
V1 = f"/apis/run.googleapis.com/v1/namespaces/{PROJECT}/jobs/{JOB}"
V2 = f"/v2/{LOCATION}/jobs/{JOB}"


def require(ok, message):
    if not ok:
        raise ValueError(message)


def load_manifest(path):
    content = Path(path).read_bytes()
    require(hashlib.sha256(content).hexdigest() == MANIFEST_SHA, "Manifest digest mismatch")
    parsed = subprocess.check_output(
        ["ruby", "-ryaml", "-rjson", "-e", "puts JSON.generate(YAML.safe_load(STDIN.read))"], input=content)
    return json.loads(parsed)


def cloud_request(method, path, body=None):
    token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
    host = REGION + "-run.googleapis.com"
    conn = http.client.HTTPSConnection(host, timeout=60)
    try:
        # One HTTP request. Never replay a PUT or POST on a timeout or lost response.
        conn.request(method, path, None if body is None else json.dumps(body),
                     {"Authorization": "Bearer " + token, "Content-Type": "application/json"})
        response = conn.getresponse()
        require(200 <= response.status < 300, f"Cloud Run {method} {path} HTTP {response.status}")
        return json.load(response)
    finally:
        conn.close()


def update_and_start(manifest, request, pause=time.sleep):
    job = request("GET", V1)
    meta, status = job["metadata"], job["status"]
    require(meta["uid"] == UID and int(meta["generation"]) == 1 and int(status["observedGeneration"]) == 1
            and int(status["executionCount"]) == 1 and status["latestCreatedExecution"]["name"] == PREVIOUS,
            "Readiness job has moved; reconcile existing execution")
    # Only transport metadata is added to the digest-verified document. Match the last live read.
    manifest["metadata"].update(namespace=meta["namespace"], resourceVersion=meta["resourceVersion"])
    request("PUT", V1, manifest)
    for _ in range(60):
        updated = request("GET", V2)
        require(updated["uid"] == UID and int(updated["generation"]) in (1, 2), "Unexpected readiness generation")
        if int(updated.get("observedGeneration", 0)) == 2 and int(updated["generation"]) == 2 and not updated.get("reconciling"):
            break
        pause(2)
    else:
        raise RuntimeError("Readiness update not observed; reconcile before continuing")
    template = updated["template"]
    task = template["template"]
    spec = manifest["spec"]["template"]["spec"]["template"]["spec"]
    container, = task["containers"]
    expected, = spec["containers"]
    env = {entry["name"]: entry.get("value") for entry in container["env"]}
    require(updated["terminalCondition"]["state"] == "CONDITION_SUCCEEDED"
            and updated["latestCreatedExecution"]["name"].split("/")[-1] == PREVIOUS
            and int(updated["executionCount"]) == 1 and int(template["taskCount"]) == 1
            and int(task["maxRetries"]) == 0 and task["serviceAccount"] == spec["serviceAccountName"]
            and all(container[k] == expected[k] for k in ("image", "command", "args"))
            and env["PBOS_MISSION_EXECUTION_APPROVED"] == "false" and env["PBOS_PLAYBOOK_SOURCE_SHA"] == SOURCE
            and updated.get("etag"), "Readiness read-back mismatch; execution blocked")
    return request("POST", V2 + ":run", {"etag": updated["etag"]})


def verify_execution(operation, request, pause=time.sleep):
    name = operation["name"]
    require(re.fullmatch(LOCATION_PATTERN + r"/operations/[A-Za-z0-9_-]+", name), "Unexpected operation name")
    print("Cloud Run operation:", name, flush=True)
    for _ in range(150):
        if operation.get("done"):
            break
        pause(5)
        operation = request("GET", "/v2/" + name)
    require(operation.get("done") and "error" not in operation, "Execution failed or incomplete; reconcile only")
    execution = operation["response"]
    full_name = execution["name"]
    require(re.fullmatch(LOCATION_PATTERN + re.escape("/jobs/" + JOB + "/executions/" + JOB) + r"-[a-z0-9]+", full_name)
            and int(execution.get("succeededCount", 0)) == 1, "Missing successful readiness execution")
    return full_name.split("/")[-1]


def read_receipt(execution):
    require(re.fullmatch(re.escape(JOB) + r"-[a-z0-9]+", execution), "Invalid readiness execution ID")
    query = (f'resource.type="cloud_run_job" AND resource.labels.job_name="{JOB}" '
             f'AND resource.labels.location="{REGION}" AND labels."run.googleapis.com/execution_name"="{execution}" '
             'AND log_id("run.googleapis.com/stdout")')
    for _ in range(12):
        entries = json.loads(subprocess.check_output(["gcloud", "logging", "read", query, "--project=" + PROJECT,
                                                      "--freshness=30d", "--limit=100", "--format=json"]))
        for entry in entries:
            record = entry.get("jsonPayload")
            if record is None:
                try:
                    record = json.loads(entry.get("textPayload", ""))
                except ValueError:
                    continue
            if (isinstance(record, dict) and record.get("schema") == "pbos.mb03.protected-bindings.v1"
                    and record.get("status") == "READY_FOR_SEPARATE_SIGNED_APPROVAL"
                    and record.get("sourceSha") == SOURCE and record.get("missionExecutionAuthorized") is False
                    and record.get("journalProtectionVerified") is True):
                return {key: record[key] for key in ("status", "sourceSha", "journalProtectionVerified", "missionExecutionAuthorized")}
        time.sleep(5)
    raise RuntimeError("Expected execution-specific readiness receipt unavailable")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--read-receipt":
        print(json.dumps(read_receipt(sys.argv[2])))
    elif len(sys.argv) == 2:
        operation = update_and_start(load_manifest(sys.argv[1]), cloud_request)
        execution = verify_execution(operation, cloud_request)
        print("Readiness execution:", execution, flush=True)
        print("Application receipt pending independent read-back for this execution.")
    else:
        sys.exit("Expected pinned manifest path or --read-receipt EXECUTION")
