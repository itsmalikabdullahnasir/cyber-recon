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
import time
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
    inactive: bool = False  # killed by the no-output watchdog


def _kill(proc: subprocess.Popen) -> None:
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=10)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        proc.wait()


def run_tool(args: list[str], timeout: int, workdir: Path, name: str, inactivity_timeout: int | None = None) -> ToolResult:
    if not args or not all(isinstance(a, str) for a in args):
        raise ToolError("args must be a non-empty list of strings")
    if not os.access(args[0], os.X_OK):
        raise ToolError(f"{args[0]} is not executable")

    stdout_path = workdir / f"{name}.stdout.log"
    stderr_path = workdir / f"{name}.stderr.log"
    log.info("run %s (timeout %ss, inactivity %ss): %s", name, timeout, inactivity_timeout, args)

    timed_out = inactive = False
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
        start = time.monotonic()
        last_size, last_change = -1, start
        while True:
            try:
                proc.wait(timeout=3)
                break  # finished on its own
            except subprocess.TimeoutExpired:
                now = time.monotonic()
                if now - start >= timeout:
                    timed_out = True
                    log.warning("%s hit hard timeout %ss, killing", name, timeout)
                    _kill(proc)
                    break
                if inactivity_timeout:
                    size = _outsize(stdout_path) + _outsize(stderr_path)
                    if size != last_size:
                        last_size, last_change = size, now
                    elif now - last_change >= inactivity_timeout:
                        inactive = True
                        log.warning("%s produced no output for %ss, skipping (likely WAF/Cloudflare)", name, inactivity_timeout)
                        _kill(proc)
                        break

    with open(stderr_path, "rb") as f:
        f.seek(max(0, stderr_path.stat().st_size - 2000))
        tail = f.read().decode("utf-8", "replace")
    return ToolResult(returncode=proc.returncode, stderr_tail=tail, timed_out=timed_out, inactive=inactive)


def _outsize(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0


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
