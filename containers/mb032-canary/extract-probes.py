"""Copy the existing provider's two Python probes into a private test directory."""

import pathlib
import re
import sys

provider, destination = map(pathlib.Path, sys.argv[1:])
source = provider.read_text(encoding="utf-8")
for name in ("BOOTSTRAP", "COLLECT"):
    match = re.search(rf"^const {name} = String\.raw`([^`]+)`;$", source, re.MULTILINE)
    if match is None:
        raise SystemExit(f"Could not find the existing provider probe {name}.")
    program = match[1].lstrip("\n")
    compile(program, name, "exec")
    (destination / f"{name.lower()}.py").write_text(program, encoding="utf-8")
