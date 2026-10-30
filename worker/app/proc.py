"""The only place the worker starts external programs.

- args is always a list; shell=False, so nothing is ever interpreted by a shell.
- Every call has a hard timeout; on expiry the whole process group is killed.
- stdout/stderr go to files, so a chatty tool can't fill the worker's RAM.
"""

import json
import logging
import os
import signal
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .config import get_settings

log = logging.getLogger(__name__)


class ToolError(RuntimeError):
    pass


@dataclass
class ToolResult:
    returncode: int
    stderr_tail: str
    timed_out: bool


def run_tool(args: list[str], timeout: int, workdir: Path, name: str) -> ToolResult:
    if not args or not all(isinstance(a, str) for a in args):
        raise ToolError("args must be a non-empty list of strings")
    if not os.access(args[0], os.X_OK):
        raise ToolError(f"{args[0]} is not executable")

    stdout_path = workdir / f"{name}.stdout.log"
    stderr_path = workdir / f"{name}.stderr.log"
    log.info("run %s (timeout %ss): %s", name, timeout, args)

    with open(stdout_path, "wb") as out, open(stderr_path, "wb") as err:
        proc = subprocess.Popen(
            args,
            stdin=subprocess.DEVNULL,
            stdout=out,
            stderr=err,
            cwd=workdir,
            env=get_settings().tool_env(),
            shell=False,
            start_new_session=True,  # own process group, so we can kill children too
        )
        timed_out = False
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            log.warning("%s timed out after %ss, killing", name, timeout)
            try:
                os.killpg(proc.pid, signal.SIGTERM)
                proc.wait(timeout=10)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                proc.wait()

    with open(stderr_path, "rb") as f:
        f.seek(max(0, stderr_path.stat().st_size - 2000))
        tail = f.read().decode("utf-8", "replace")
    return ToolResult(returncode=proc.returncode, stderr_tail=tail, timed_out=timed_out)


def write_list(path: Path, items: list[str]) -> Path:
    """Write one validated item per line, for tools that take -l <file>."""
    path.write_text("".join(f"{item}\n" for item in items), encoding="ascii")
    return path


def read_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    if not path.exists():
        return rows
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict):
                rows.append(obj)
    return rows
