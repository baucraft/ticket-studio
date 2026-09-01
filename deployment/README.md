# Statisches Internes Preview

Dieses Image liefert ausschliesslich den statischen, synthetischen Ticket-Studio-
Stand aus. Es enthaelt kein Produktbackend, keine Datenbank, keine LCMD-Zugangsdaten
und keine lokalen Projektdateien. Reale Projektdateien bleiben bis zur getrennten
Pilot- und Zugriffsfreigabe ausgeschlossen.

## Build

Aus einem sauberen, commitgebundenen Checkout:

```bash
set -eu
release="$(git rev-parse HEAD)"
test -z "$(git status --porcelain)"
docker build --file deployment/Dockerfile \
  --build-arg "VCS_REF=$release" \
  --tag "ticket-studio:${release}" .
```

Die Node- und Nginx-Basisimages sind zusaetzlich per Digest gebunden. Ein
bewusstes Basisimage-Update aendert Tag und Digest gemeinsam und wiederholt
Audit, Build sowie den gehaerteten Container-Smoke-Test.

Die allowlist-basierte `.dockerignore` sendet nur Buildquellen, versionierte
synthetische Assets und Deploymentdateien an den Docker-Daemon. `docs`, `examples`,
Tests, lokale Exporte und Git-Metadaten sind ausgeschlossen. Das Runtime-Image
enthaelt nur Nginx und `dist`; Node, npm, CLI-Skripte und XLSX-Quelldateien bleiben
im Buildstage.

## Lokaler Lauf

```bash
docker run --rm --name ticket-studio-preview \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --publish 127.0.0.1:18080:8080 \
  "ticket-studio:$(git rev-parse HEAD)"
```

`/healthz` dient nur der Containerbereitschaft. Der spaetere externe Zugriff
erfolgt ausschliesslich ueber den bestehenden TLS-Einstieg auf
`ticket-studio.dreso.int` und einen dort vorgeschalteten benannten Zugriffsschutz.
Der Studio-Container erhaelt keinen Hostport.

## Grenzen

- Nur synthetisches Preview; kein TST-18-Produktdeployment und keine Pilotfreigabe.
- Kein Serverupload: XLSX-Verarbeitung und Exporte bleiben im Browser.
- Kein CDN- oder Google-Fonts-Fallback; fehlende vendored Assets blockieren.
- GitHub Pages verwendet separat `VITE_BASE_PATH=/ticket-studio/`.
- HSTS folgt der gemeinsamen Analyzer-Betriebsentscheidung und wird nicht hier
  unabhaengig aktiviert.
