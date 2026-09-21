"""Synthetic local Studio-to-S2 TLS/Nginx/browser proof; no live LCMD data."""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--analyzer", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--playwright-modules", type=Path, required=True)
    args = parser.parse_args()
    studio = Path(__file__).resolve().parents[2]
    analyzer = args.analyzer.resolve()
    sys.path.insert(0, str(analyzer))
    from backend.models.pilot import PlanCard, SourceState, SyncRequest
    from backend.services.pilot_auth import password_record
    from backend.services.pilot_repository import PilotRepository

    fixture = json.loads(
        (analyzer / "backend/tests/fixtures/pilot/six_plan_cards.json").read_text()
    )

    def source():
        cards = [
            PlanCard(
                sourcePlanCardId=key,
                sourceActivityId=fixture["sourceActivityId"],
                date=day,
                activity="Synthetic activity",
            )
            for key, day in zip(fixture["cardIds"], fixture["datesBefore"])
        ]
        return SourceState(
            sourceProjectId=fixture["sourceProjectId"],
            cards=cards,
            processSha256="a" * 64,
            cardSha256="b" * 64,
            processFetchedAt="2026-09-13T10:00:00+00:00",
            cardFetchedAt="2026-09-13T10:00:01+00:00",
        )

    def sync(request_id):
        return SyncRequest(
            requestId=request_id,
            expectedRevision=0,
            forecastStart="2026-10-01",
            forecastEnd="2026-10-31",
        )

    root = args.output.resolve()
    root.mkdir(mode=0o700)
    contract_commit = subprocess.run(
        ["git", "-C", str(analyzer), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    if contract_commit != "342f1cd1d41ac8756b6a91ec5b27d1c5fea49c21":
        raise RuntimeError("S2 analyzer contract commit mismatch")
    if not (studio / "dist/index.html").is_file():
        raise RuntimeError("run npm run build:deployment first")
    os.umask(0o077)
    project_name = "pilot-s3-local-" + str(os.getpid())
    env = dict(
        os.environ,
        PILOT_LOCAL_ROOT=str(root),
        PILOT_LOCAL_UID=str(os.getuid()),
        PILOT_LOCAL_GID=str(os.getgid()),
        PILOT_ANALYZER_ROOT=str(analyzer),
        PILOT_STUDIO_DIST=str((studio / "dist").resolve()),
    )
    compose = [
        "docker", "compose", "-p", project_name,
        "-f", str(studio / "deployment/docker-compose.pilot-s3-local.yml"),
    ]

    def run(label, command, timeout=120, extra_env=None):
        result = subprocess.run(
            command,
            cwd=studio,
            env={**env, **(extra_env or {})},
            capture_output=True,
            timeout=timeout,
        )
        (root / (label + ".log")).write_bytes(result.stdout + result.stderr)
        if result.returncode:
            raise RuntimeError(f"{label} exited {result.returncode}; see {root / (label + '.log')}")
        return result.stdout

    image_id = run(
        "backend-image",
        ["docker", "image", "inspect", "--format", "{{.Id}}", "ticket-analyzer-pilot:s2-local"],
    ).decode().strip()
    if image_id != "sha256:08de756a28cb24d44ec87aee44d1c0ab4b7c0f818ce1176e15ae3a4bd4580f18":
        raise RuntimeError("S2 backend image digest mismatch")

    repository = PilotRepository.initialize(
        root / "product/db.sqlite3",
        root / "allocation/journal.jsonl",
        root / "witness/highwater.json",
        project=fixture["sourceProjectId"],
        allowed_tags=list(range(10000, 10012)),
        allowed_markers=[64000, 64001, 64002, 64003],
        inventory_reference="synthetic-s3-local-only",
    )
    repository.propose(
        sync("studio-sync-00000000-0000-4000-8000-000000000002"),
        source(),
        "fixture-preparation",
    )
    (root / "auth").mkdir(mode=0o700)
    credentials = {
        "users": {
            "member-a": {
                "password": password_record("test-only-password"),
                "enabled": True,
                "sourceProjectIds": [fixture["sourceProjectId"]],
            }
        }
    }
    (root / "credentials.json").write_text(json.dumps(credentials))
    config = {
        "database": "/var/lib/pilot/db.sqlite3",
        "allocationJournal": "/var/lib/pilot-allocation/journal.jsonl",
        "allocationWitness": "/var/lib/pilot-witness/highwater.json",
        "authDatabase": "/var/lib/pilot-auth/auth.sqlite3",
        "credentialsFile": "/run/pilot/credentials.json",
        "sourceProjectId": fixture["sourceProjectId"],
        "lcmdToken": "synthetic-unused-token",
        "origins": ["https://ticket-studio.dreso.int:8443"],
    }
    (root / "config.json").write_text(json.dumps(config))
    (root / "tls").mkdir(mode=0o700)
    (root / "proxy-auth").mkdir(mode=0o755)
    run(
        "certificate",
        [
            "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
            "-subj", "/CN=local-pilot-test",
            "-addext", "subjectAltName=DNS:ticket-studio.dreso.int",
            "-keyout", str(root / "tls/key.pem"), "-out", str(root / "tls/cert.pem"),
        ],
    )
    encoded = run("static-password", ["openssl", "passwd", "-apr1", "static-only-password"]).decode().strip()
    (root / "proxy-auth/htpasswd").write_text("static-test:" + encoded + "\n")
    (root / "proxy-auth").chmod(0o755)
    (root / "proxy-auth/htpasswd").chmod(0o644)
    try:
        run("compose-config", compose + ["config", "--quiet"])
        run("compose-up", compose + ["up", "-d", "--no-build", "--pull", "never"])
        proxy = run("proxy-id", compose + ["ps", "-q", "pilot-proxy"]).decode().strip()
        ip = json.loads(run("proxy-inspect", ["docker", "inspect", proxy]))[0]["NetworkSettings"]["Networks"][project_name + "_pilot-local"]["IPAddress"]
        for _ in range(30):
            check = subprocess.run(
                compose + ["exec", "-T", "pilot-backend", "python", "-c", "import backend.pilot_main"],
                env=env,
                capture_output=True,
            )
            if check.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("backend_startup_failed")
        run(
            "browser",
            [
                "docker", "run", "--rm", "--network", project_name + "_pilot-local",
                "--user", f"{os.getuid()}:{os.getgid()}", "--ipc", "host",
                "--add-host", "ticket-studio.dreso.int:" + ip,
                "--mount", f"type=bind,src={studio / 'deployment/tests/pilot-browser'},dst=/test,readonly",
                "--mount", f"type=bind,src={args.playwright_modules.resolve()},dst=/node_modules,readonly",
                "--mount", f"type=bind,src={root},dst=/proof",
                "--env", f"PILOT_TEST_PROJECT={fixture['sourceProjectId']}",
                "--workdir", "/test", "mcr.microsoft.com/playwright:v1.55.0-noble",
                "node", "check.mjs",
            ],
            timeout=240,
        )
        print("Studio S3 local S2/Nginx/Chromium flow: PASS")
        print(f"Private evidence: {root}")
    finally:
        run("compose-logs", compose + ["logs", "--no-color"])
        run("compose-down", compose + ["down", "--volumes", "--remove-orphans"])


if __name__ == "__main__":
    main()
