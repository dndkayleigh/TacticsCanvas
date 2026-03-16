# Deployment Runbook

## Purpose

This runbook covers the current practical deployment model for TacticsCanvas: a trusted internal or local deployment, not a public internet service.

Longer-term target deployment:

- Vercel for the frontend
- Render for the backend/API layer

The current repository is not there yet, but deployment planning should assume that split.

## Recommended Deployment Profile

Use one of these:

- local workstation for a single operator
- internal machine on a trusted network
- protected container/VM for a small review team
- target future hosted deployment: Vercel frontend + Render backend

Do not expose the current app directly to the public internet without additional hardening.

For the target hosted model:

- Vercel should serve the frontend/UI
- Render should host the API, AI integration, and durable workflow logic
- persistent annotation/session state should not depend on Vercel local filesystem behavior

## Requirements

- Node.js 18+
- npm
- `OPENAI_API_KEY` for AI drafting
- writable access to:
  - `data/maps`
  - `data/logs`

Future hosted requirements:

- durable storage for map assets and sidecars
- durable storage for workflow/session/adjudication state
- environment-variable management in both Vercel and Render

## Startup Procedure

1. Install dependencies:

```bash
npm install
```

2. Set the API key:

```bash
export OPENAI_API_KEY="your_key_here"
```

3. Start the app:

```bash
node server.js
```

4. Verify health:

```bash
curl http://localhost:3000/health
```

Expected result:

- JSON response with `ok: true`

## Operational Checks

Before handing the app to an operator, verify:

- the homepage loads
- an existing map opens
- saving metadata works
- `data/logs/ai-draft-log.ndjson` is writable
- AI drafting works if `OPENAI_API_KEY` is present

## Data Directories

- Maps and sidecars live in [data/maps](/home/witschey/TacticsCanvas/data/maps)
- AI logs live in [data/logs](/home/witschey/TacticsCanvas/data/logs)

Backup recommendation:

- back up `data/maps` and `data/logs` together
- treat sidecars as primary project data
- retain AI logs for cost and audit visibility

## Known Risks

- no authentication
- no rate limiting
- synchronous file I/O
- upload filenames are not strongly sanitized
- no process supervision included in the repo
- current filesystem assumptions do not map cleanly to Vercel-hosted frontend deployments

## Recommended Hardening Before Shared Deployment

- sanitize upload filenames and reject path-like names
- verify image dimensions server-side instead of trusting client values
- add request size and upload policy limits
- add authentication if more than one trusted operator is involved
- add process supervision such as `systemd`, Docker, or another service manager
- move mutable workflow state out of local filesystem assumptions
- define a storage backend compatible with Render-hosted API services
- make the frontend callable against a separately deployed API origin from Vercel

## Basic Failure Recovery

### App will not start

Check:

- Node version
- dependency install status
- port availability
- syntax errors in checked-in JS

### UI loads but actions fail

Check:

- browser console
- server logs
- permissions on `data/maps` and `data/logs`
- JSON parse errors in edited metadata

### AI drafting fails

Check:

- `OPENAI_API_KEY`
- outbound network availability from the host
- errors appended to [data/logs/ai-draft-log.ndjson](/home/witschey/TacticsCanvas/data/logs/ai-draft-log.ndjson)

## Minimum Production-Readiness Checklist

- Phase 0 of the development plan complete
- syntax checks pass
- smoke test completed
- backups defined
- deployment scope remains trusted/internal

## Target Hosted Checklist

Before a Vercel + Render deployment, also require:

- frontend/backend split is implemented cleanly
- API base URL configuration is environment-driven
- workflow/session persistence is durable outside local disk
- asset and sidecar storage is durable outside local disk
- auth, auditing, and concurrency control are implemented for shared use
