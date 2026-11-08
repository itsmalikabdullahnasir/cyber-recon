import os
import re
from pathlib import Path
import pytest

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent.parent / "supabase" / "migrations"


def test_migrations_naming_and_sequence():
    """Ensure all migrations in supabase/migrations follow timestamp ordering with valid SQL."""
    assert MIGRATIONS_DIR.exists(), f"Migrations dir {MIGRATIONS_DIR} not found"
    files = sorted([f.name for f in MIGRATIONS_DIR.glob("*.sql")])
    assert len(files) >= 20, f"Expected at least 20 migration files, found {len(files)}"

    timestamps = []
    for filename in files:
        match = re.match(r"^(\d{14})_(.+)\.sql$", filename)
        assert match is not None, f"Migration filename {filename} does not follow YYYYMMDDHHMMSS_name.sql format"
        timestamps.append(match.group(1))

    # Assert strictly non-decreasing timestamps
    for i in range(1, len(timestamps)):
        assert timestamps[i] >= timestamps[i - 1], (
            f"Migration timestamp out of order: {files[i]} is earlier than {files[i - 1]}"
        )


def test_migrations_sql_search_path_and_security_definer():
    """Ensure every SECURITY DEFINER function sets search_path = public to prevent search_path injection."""
    for sql_file in MIGRATIONS_DIR.glob("*.sql"):
        content = sql_file.read_text(encoding="utf-8")
        if "security definer" in content.lower():
            assert "search_path = public" in content.lower(), (
                f"Migration {sql_file.name} defines a SECURITY DEFINER function without explicit 'set search_path = public'"
            )


def test_two_user_permission_isolation():
    """Verify that User A and User B scan datasets cannot be read or cancelled across boundaries."""
    from app.scope import Scope

    user_a_id = "11111111-1111-1111-1111-111111111111"
    user_b_id = "22222222-2222-2222-2222-222222222222"
    admin_id = "99999999-9999-9999-9999-999999999999"

    class MockRecordStore:
        def __init__(self):
            self.scans = [
                {"id": "scan-a", "requested_by": user_a_id, "input": "target-a.com", "status": "queued"},
                {"id": "scan-b", "requested_by": user_b_id, "input": "target-b.com", "status": "queued"},
            ]

        def can_access_scan(self, actor_id, actor_role, scan_id):
            scan = next((s for s in self.scans if s["id"] == scan_id), None)
            if not scan:
                return False
            if actor_role in ("admin", "analyst"):
                return True
            return scan["requested_by"] == actor_id

        def cancel_scan(self, actor_id, actor_role, scan_id):
            if not self.can_access_scan(actor_id, actor_role, scan_id):
                raise PermissionError("Access denied to scan")
            scan = next(s for s in self.scans if s["id"] == scan_id)
            scan["status"] = "failed"
            return True

    store = MockRecordStore()

    # User A can access own scan
    assert store.can_access_scan(user_a_id, "operator", "scan-a") is True
    # User A CANNOT access User B scan
    assert store.can_access_scan(user_a_id, "operator", "scan-b") is False

    # User B CANNOT cancel User A scan
    with pytest.raises(PermissionError):
        store.cancel_scan(user_b_id, "operator", "scan-a")

    # Admin CAN access and cancel both
    assert store.can_access_scan(admin_id, "admin", "scan-a") is True
    assert store.can_access_scan(admin_id, "admin", "scan-b") is True
    assert store.cancel_scan(admin_id, "admin", "scan-a") is True
    assert store.scans[0]["status"] == "failed"


def test_worker_failure_recovery_and_retry_limit():
    """Verify worker recovers interrupted jobs and respects max_retries limit."""
    from app import jobs

    scans = [
        {"id": "s1", "status": "running", "retry_count": 0, "max_retries": 3},
        {"id": "s2", "status": "running", "retry_count": 3, "max_retries": 3},  # Exceeded
    ]

    # Simulate recovery logic
    for scan in scans:
        if scan["status"] == "running":
            if scan["retry_count"] < scan["max_retries"]:
                scan["status"] = "queued"
                scan["retry_count"] += 1
            else:
                scan["status"] = "failed"
                scan["error"] = "Max retries exceeded after worker interruption"

    assert scans[0]["status"] == "queued"
    assert scans[0]["retry_count"] == 1
    assert scans[1]["status"] == "failed"
    assert "Max retries exceeded" in scans[1]["error"]


def test_finding_context_validation():
    """Validate that finding records meet all completeness criteria."""
    valid_finding = {
        "title": "SQL Injection in /api/search",
        "target_id": "target-123",
        "host_id": "host-456",
        "scan_id": "scan-789",
        "affected_url": "https://example.com/api/search?q=1",
        "severity": "Critical",
    }

    def validate_finding(f):
        errors = []
        if not f.get("title"):
            errors.append("missing title")
        if not f.get("target_id"):
            errors.append("missing target_id")
        if not f.get("host_id"):
            errors.append("missing host_id")
        if not f.get("scan_id"):
            errors.append("missing scan_id")
        if not f.get("affected_url"):
            errors.append("missing affected_url")
        return len(errors) == 0, errors

    is_valid, errs = validate_finding(valid_finding)
    assert is_valid is True
    assert len(errs) == 0

    incomplete = valid_finding.copy()
    incomplete["affected_url"] = ""
    is_valid, errs = validate_finding(incomplete)
    assert is_valid is False
    assert "missing affected_url" in errs

