"""feroxbuster — content/directory discovery with a wordlist. Active tier."""

from pathlib import Path

from ..config import get_settings
from ..proc import ToolError, read_jsonl, run_tool

# Bundled fallback wordlist shipped with the worker (worker/wordlists/common.txt).
BUNDLED_WORDLIST = Path(__file__).resolve().parent.parent.parent / "wordlists" / "common.txt"


def resolve_wordlist() -> Path:
    s = get_settings()
    configured = Path(s.wordlist)
    if configured.exists():
        return configured
    if BUNDLED_WORDLIST.exists():
        return BUNDLED_WORDLIST
    raise ToolError(f"no wordlist found (tried {s.wordlist} and bundled {BUNDLED_WORDLIST})")


def run(url: str, workdir: Path, name: str) -> list[dict]:
    """Return [{path, url, status, length}] for interesting responses."""
    s = get_settings()
    wordlist = resolve_wordlist()
    out = workdir / f"ferox-{name}.jsonl"
    result = run_tool(
        [
            s.feroxbuster_bin,
            "-u", url,
            "-w", str(wordlist),
            "--json", "--output", str(out),
            "-t", str(s.ferox_threads),
            "--rate-limit", str(s.ferox_rate_limit),
            "-d", str(s.ferox_depth),
            "-s", *s.ferox_status.split(","),
            "--no-state", "--silent",
            "-k",  # don't fail on self-signed certs
            "--timeout", "10",
        ],
        timeout=s.feroxbuster_timeout, workdir=workdir, name=f"ferox-{name}",
    )
    if result.returncode != 0 and not out.exists():
        raise ToolError(f"feroxbuster failed: {result.stderr_tail[-300:]}")

    found: dict[str, dict] = {}
    for row in read_jsonl(out):
        if row.get("type") != "response":
            continue
        u = str(row.get("url", ""))
        try:
            path = "/" + u.split("://", 1)[1].split("/", 1)[1]
        except IndexError:
            path = u
        found[u] = {
            "path": path[:300],
            "url": u[:500],
            "status": row.get("status"),
            "length": row.get("content_length"),
        }
    results = sorted(found.values(), key=lambda r: (r["status"] or 999, r["path"]))
    return results[: s.ferox_max_results]
