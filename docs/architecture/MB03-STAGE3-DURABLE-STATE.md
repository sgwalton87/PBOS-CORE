# MB-03 Stage 3 durable disposable state decision

`GenesisStateRepository` and `JsonStateStore` remain filesystem-backed and are not durable across Cloud Run replacement. Neon already persists leases, one-use approval nonces, and encrypted mission checkpoints, but it did not persist the disposable Genesis event stream.

Stage 3 adds an isolated `mb03_disposable_namespace` and append-only `mb03_disposable_event` pair in the existing `pbos_runner` schema. Namespace initialization pins the reviewed source-state digest and disposable authority UUID. Event append is serialized by a row lock, allocates the next sequence atomically, rejects sequence conflicts, and enforces unique event IDs. The adapter never exposes canonical Genesis writes and does not alter the read-only observer.

The SQL file is a reviewed migration artifact only. Applying it to staging requires the existing Neon migration approval. Tests use a SQL boundary fake to prove input validation and exact fence/sequence parameters; they do not claim live Neon durability.
