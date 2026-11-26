import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


DIRECTORY = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("readiness", DIRECTORY / "verify-existing-readiness.py")
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class TestExistingReadiness(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.path = Path(temp.name) / "job.yaml"
        spec = {"serviceAccountName": "fixture-account", "containers": [{
            "image": "fixture-pinned-image", "command": ["fixture-launcher"], "args": ["--verify-bindings"],
            "env": [{"name": "PBOS_MISSION_EXECUTION_APPROVED", "value": "false"},
                    {"name": "PBOS_PLAYBOOK_SOURCE_SHA", "value": r.SOURCE}]}]}
        self.path.write_text(json.dumps({"metadata": {"name": r.JOB},
                                         "spec": {"template": {"spec": {"template": {"spec": spec}}}}}))
        self.enter_context_patch = patch.object(r, "MANIFEST_SHA", r.hashlib.sha256(self.path.read_bytes()).hexdigest())
        self.enter_context_patch.start()
        self.addCleanup(self.enter_context_patch.stop)
        self.manifest = r.load_manifest(self.path)
        self.old = {"metadata": {"generation": 1, "uid": r.UID, "namespace": "211508256780", "resourceVersion": "rv1"},
                    "status": {"observedGeneration": 1, "executionCount": 1, "latestCreatedExecution": {"name": r.PREVIOUS}}}
        self.ready = {"uid": r.UID, "generation": "2", "observedGeneration": "2", "etag": "etag2",
                      "terminalCondition": {"state": "CONDITION_SUCCEEDED"}, "executionCount": 1,
                      "latestCreatedExecution": {"name": r.PREVIOUS}, "template": {"taskCount": 1, "template": {
                          "maxRetries": 0, "serviceAccount": spec["serviceAccountName"], "containers": spec["containers"]}}}
        self.operation = {"name": r.LOCATION + "/operations/fixture"}
        self.request = Mock(side_effect=[self.old, {}, self.ready, self.operation])

    def start(self):
        return r.update_and_start(self.manifest, self.request, lambda _: None)

    def test_exact_manifest_conditional_update_then_one_etag_bound_start(self):
        self.assertEqual(self.start(), self.operation)
        calls = [c.args for c in self.request.call_args_list]
        self.assertEqual([(c[0], c[1]) for c in calls],
                         [("GET", r.V1), ("PUT", r.V1), ("GET", r.V2), ("POST", r.V2 + ":run")])
        self.assertEqual(calls[1][2]["metadata"]["resourceVersion"], "rv1")
        self.assertEqual(calls[-1][2], {"etag": "etag2"})

    def test_tampered_manifest_rejected(self):
        self.path.write_bytes(self.path.read_bytes() + b" ")
        with self.assertRaisesRegex(ValueError, "digest mismatch"):
            r.load_manifest(self.path)

    def test_updated_generation_cannot_be_replayed(self):
        self.old["metadata"]["generation"] = 2
        with self.assertRaisesRegex(ValueError, "has moved"):
            self.start()
        self.assertEqual(self.request.call_count, 1)

    def test_concurrent_execution_blocks_launch(self):
        self.ready["executionCount"] = 2
        with self.assertRaisesRegex(ValueError, "read-back mismatch"):
            self.start()
        self.assertEqual(self.request.call_count, 3)

    def test_task_retry_drift_blocks_launch(self):
        self.ready["template"]["template"]["maxRetries"] = 1
        with self.assertRaisesRegex(ValueError, "read-back mismatch"):
            self.start()
        self.assertEqual(self.request.call_count, 3)

    def test_lost_launch_response_not_retried(self):
        self.request.side_effect = [self.old, {}, self.ready, TimeoutError()]
        with self.assertRaises(TimeoutError):
            self.start()
        self.assertEqual(self.request.call_count, 4)

    def test_operation_readback_and_receipt_are_tied_to_exact_execution(self):
        execution = r.JOB + "-abcde"
        response = {"name": r.LOCATION + "/jobs/" + r.JOB + "/executions/" + execution, "succeededCount": 1}
        get = Mock(return_value={**self.operation, "done": True, "response": response})
        self.assertEqual(r.verify_execution(self.operation, get, lambda _: None), execution)
        get.assert_called_once_with("GET", "/v2/" + self.operation["name"])
        receipt = dict(schema="pbos.mb03.protected-bindings.v1", status="READY_FOR_SEPARATE_SIGNED_APPROVAL",
                       sourceSha=r.SOURCE, journalProtectionVerified=True, missionExecutionAuthorized=False)
        with patch.object(r.subprocess, "check_output", return_value=json.dumps([{"jsonPayload": receipt}])) as logs:
            self.assertTrue(r.read_receipt(execution)["journalProtectionVerified"])
            self.assertIn(f'execution_name"="{execution}"', logs.call_args.args[0][3])
        receipt["missionExecutionAuthorized"] = True
        with patch.object(r.subprocess, "check_output", return_value=json.dumps([{"textPayload": json.dumps(receipt)}])), \
             patch.object(r.time, "sleep"), self.assertRaisesRegex(RuntimeError, "receipt unavailable"):
            r.read_receipt(execution)
