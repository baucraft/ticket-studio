# Start-Handoff: S4 Analyzer und Dashboard

Stand: 2026-09-13. Neue Session unter **Sol / High**
(`openai/gpt-5.6-sol`). Keine VM-Zugriffe, Commits oder Pushes ohne
ausdrueckliche Freigabe.

## Arbeitsbasis

- Studio-Worktree: `/home/tin/worktrees/ticket-analyzer/pilot-s3-studio`
- Branch/Basis: `feat/pilot-s3-studio` auf
  `origin/main@21e6006ee9f97b69e8b74090073e2d0bc727f61f`
- Analyzer-/S2-Vertrag:
  `/home/tin/worktrees/ticket-analyzer/pilot-s1-g4-self-attested`
  auf `342f1cd1d41ac8756b6a91ec5b27d1c5fea49c21`
- S3 ist technisch umgesetzt und reviewt, aber vollstaendig uncommitted.
  Geaendert sind `.gitignore`, `deployment/Dockerfile`,
  `deployment/default.conf`, `package.json`, `src/App.tsx` und
  `tests/hausmesse-demo.test.ts`. Neu sind
  `deployment/docker-compose.pilot-s3-local.yml`,
  `deployment/nginx.pilot-s3-local.conf`, `deployment/tests/`,
  `public/pilot-assets/`, `scripts/generate-pilot-assets.mjs`,
  `scripts/pilot-asset-source.mjs`, `scripts/verify-pilot-assets.mjs`,
  `src/components/pilot/`, `src/lib/pilot-api.ts`,
  `src/lib/pilot-print-pdf.ts`, `src/lib/pilot-workflow.ts`,
  `tests/pilot-browser-flow.test.ts` und dieser Handoff.

## API- und Druckvertrag

Die relative Same-Origin-API liegt unter `/api/pilot/v1`. Sie verwendet nur
eine HttpOnly-Sitzung im Browser: `POST /auth/login`, `GET /auth/session`,
`POST /auth/logout`, Projekt-/Revisions-GETs sowie projektgebundene
`POST /sync`, `POST /print-preparations` und `POST /activations`. Mutationen
binden stabile `requestId`, Projekt, Inhalt und erwartete Vorgaengerrevision.
401, 403 und 409 werden explizit behandelt. LCMD-Token, freie Proxyziele,
lokale Werktagsexpansion und lokal erfundene Karten- oder Tagidentitaeten sind
ausgeschlossen. Druckzuteilung und aktive Platzierung kommen ausschliesslich
vom S2-Backend.

Karten sind `66 x 120 mm` mit Innenrahmen `62,5 x 117 mm`, zwei offiziellen
`tagCircle49h12`-Statusmarkern mit `18 mm`, Klartext an beiden Enden und einem
um 180 Grad gedrehten Ende. Tafelmarker sind `36 mm` auf A4. PDF-Metadaten
binden Projekt, Revision/Hash, Plankarten-/Aktivitaetsidentitaet und Tag-IDs.
Das vollstaendige Codebuch stammt aus `AprilRobotics/apriltag-imgs`-Commit
`f3fd9a7add5bfd82a886fc65240fdb8e3c9ac5a1`, Tree
`52cc190bc5d2824afd5f3fb908283d71de86fc6a`, SHA-256
`1dc1820062286679af9ba90bee19704a31a45e62ce2538ab1a368024c86a8587`.

## Nachweis und offene Punkte

Bestanden sind `99` Tests, TypeScript, ESLint, Prettier, die Pruefung aller
`65.535` Codebuch-IDs, Produktions-/Deploymentbuild und Studio-Containerbuild.
Der unabhaengige Abschlussreview und die gezielte Nachpruefung aller fuenf
Befunde ergaben keinen verbleibenden actionable Befund.

Privater End-to-End-Nachweis:
`/home/tin/.local/state/ticket-analyzer/work/pilot-s3-local-08/`.
`browser-result.json` belegt Login, Sitzung, Sync, Delta, stabilen Druckretry,
Karten-/Tafelmarker-PDF, UI-seitige 409-Bereinigung, Aktivierung, vier
dynamische Tafeln, Reload, 401/403/409 und keine unerwarteten Browserfehler.
Der Lauf ist an S2-Image
`sha256:08de756a28cb24d44ec87aee44d1c0ab4b7c0f818ce1176e15ae3a4bd4580f18`
gebunden. Das finale lokale Studio-Image ist
`sha256:1474dd3714a792b3b8ad73492591dae3f48ffec4b35f3365d9aecec80829f272`.

`npm audit --audit-level=high` meldet weiterhin nur die zwei bereits bekannten
moderaten Findings in `@humanfs/node` und `fflate`; keine neue Abhaengigkeit
wurde dafuer ungeprueft aktualisiert.

Offen bleiben Realdatenbindung, physischer Druck und Stecktafeltest, reale
optische Kapazitaet, vier gleichzeitig vollstaendig vorbereitete Druckscopes,
gerenderte 900-Karten-Paginierung, Deployment, Betrieb und Gate G4. S4 soll im
Analyzer Capture, Reconcile, Review, unveraenderliche Snapshots, Historie und
Dashboard gegen die aktive serverseitige Platzierung umsetzen; bestehende
Tag-only-Semantik wiederverwenden und Pilotzustand von G4-/Evidenzprofilen
trennen.
