## Prompt B - Events router

Files changed:
- `routers/events.py`
- `WORKDONE.md`

Commands run:
- `git status --short` - passed; checked worktree before editing.
- `python -m compileall main.py routers\events.py` - passed.
- Inspected FastAPI registered routes - passed; confirmed `GET /api/events`, `POST /api/events`, `PATCH /api/events/{event_id}/acknowledge`, and `GET /api/events/stats`.
- Started `uvicorn main:app` on `127.0.0.1:8010` and hit `/` - passed; returned `{"status":"ok","version":"1.0.0"}`.
- Hit `/api/events` - passed; returned `[]`.
- Hit `/api/events/stats` - passed; returned `{"total":0,"unacknowledged":0,"critique_count":0,"by_source":[]}`.
- Started `uvicorn main:app` on `127.0.0.1:8011` for lifecycle testing - passed.
- `POST /api/events` with a unique `CODEX_PROMPT_B_TEST_*` source - passed; returned a UUID.
- `GET /api/events?source=...&severity=CRITIQUE&acknowledged=false&limit=10` - passed; returned exactly the created event.
- `GET /api/events/stats` after create - passed; counted `total=1`, `unacknowledged=1`, `critique_count=1`, and the unique source count.
- `PATCH /api/events/{event_id}/acknowledge` - passed; returned the updated row with `acknowledged=true`.
- `GET /api/events?source=...&acknowledged=true&limit=10` - passed; returned exactly the acknowledged event.
- `PATCH /api/events/{missing_uuid}/acknowledge` - passed; returned 404.
- Deleted only the unique lifecycle test event directly from the DB - passed; `CLEANUP_DELETED:1`.
- Started `uvicorn main:app` on `127.0.0.1:8012` after cleanup and hit `/api/events` plus `/api/events/stats` - passed; returned `[]` and zeroed stats.
- `git diff --check -- routers/events.py WORKDONE.md` - passed; only reported the repo's LF-to-CRLF warning for `WORKDONE.md`.
- `pnpm build` - passed.

Not validated:
- No pytest suite was found or run for the backend.

# 2026-05-02 - Prompt C: Docker + requirements + env example

## Files changed
- `requirements.txt` - added backend Python dependencies required by Prompt C.
- `Dockerfile` - added Python 3.11 slim backend image build and uvicorn start command.
- `.env.example` - added documented environment keys for local/demo setup.
- `.dockerignore` - added to keep `.env`, Git metadata, dependency folders, and build output out of the Docker image context.
- `docker-compose.yml` - changed backend from inline `python:3.12-slim` install/run command to `build: .`, `env_file: .env`, and `restart: unless-stopped`; frontend service left unchanged.

## Commands run
- `git status --short` - passed; noted existing unrelated working tree changes before/after this task.
- `Get-Content -Raw AGENT_PROMPTS.txt` - passed; read Prompt C.
- `docker compose config` - passed; compose file parses successfully.
- `python --version` - passed; local Python is 3.13.1.
- `python -m pip show fastapi uvicorn sqlalchemy pydantic` - passed; local packages present, with a pip warning about an invalid `~ip` distribution.
- `python -m compileall main.py database.py models.py schemas.py routers utils scripts` - passed.
- `docker compose up --build -d` - failed because Docker Desktop/Linux engine is not available: missing `//./pipe/dockerDesktopLinuxEngine`.

## Not validated
- Full cold `docker compose up --build` startup was not validated because Docker is unavailable in this environment.
- `curl http://localhost:8000/` through the Docker container was not validated for the same reason.

# 2026-05-02 - Prompt C Docker revalidation

## Files changed
- `.env` - local-only config fix: renamed `model` key to `GEMINI_MODEL` without changing or printing secret values.
- `WORKDONE.md` - added the successful Docker validation results.

## Commands run
- `git status --short` - passed; confirmed there are unrelated frontend/router/utility changes in the worktree and left them untouched.
- `rg "xlrd|google\\.generativeai|paho|dotenv|multipart|openpyxl|pandas|numpy|psycopg2"` - passed; no `xlrd` import found, so Prompt C dependency list is sufficient for current backend imports.
- `docker compose up --build -d` - passed; backend image built and backend/frontend containers started.
- `docker compose ps` - passed; backend and frontend containers are both `Up`.
- `Invoke-WebRequest http://localhost:8000/` - passed; returned `{"status":"ok","version":"1.0.0"}`.
- `docker compose logs --tail=80 backend` - passed; no startup traceback, Uvicorn startup complete.
- `docker compose logs --tail=120 frontend` - passed; Next dev server reached `Ready`.
- `docker compose exec -T backend sh -lc "test ! -f /app/.env && echo no-env-file-in-image"` - passed; `.env` was not copied into the backend image.
- `docker compose exec -T backend python -c "<dependency imports>"` - passed; all Prompt C backend packages imported successfully. Warning: `google.generativeai` is deprecated upstream, but Prompt C explicitly requires `google-generativeai`.
- `Invoke-WebRequest http://localhost:8000/api/events/stats` - passed; returned HTTP 200.
- `Invoke-WebRequest http://localhost:8000/api/scada/summary` - passed; returned zeroed summary with HTTP 200.
- `Invoke-WebRequest http://localhost:3000/` - passed; returned HTTP 200.
- `docker compose config --quiet` - passed.
- `git diff --check -- Dockerfile .dockerignore .env.example requirements.txt docker-compose.yml WORKDONE.md` - passed with only CRLF normalization warnings.
- `docker compose up -d --force-recreate backend` - passed after `.env` key rename.

## Not validated
- No production `pnpm build` was run during this Docker recheck; compose frontend uses `pnpm dev` by design in the existing service.
## Task A - SCADA router

Files changed:
- `routers/scada.py` - Added SCADA create/list/detail/summary endpoints under `/api/scada`.
- `utils/energy.py` - Updated the natural gas CO2 factor to `0.202 kg CO2/kWh` so SCADA summary uses the required shared factor.

Commands run:
- `git status --short` - passed.
- `python -m py_compile routers\scada.py utils\energy.py` - passed.
- `pnpm build` - passed.
- Started backend with `python -m uvicorn main:app --host 127.0.0.1 --port 8000`, then hit `GET /` - passed with `{"status":"ok","version":"1.0.0"}`.
- Hit `GET /api/scada/summary` - passed with zero-record summary shape.

Not validated:
- `POST /api/scada`, `GET /api/scada`, and `GET /api/scada/{record_id}` were not exercised with real database records.

## Prompt D - Frontend de-mocking

Files changed:
- `lib/api-client.ts` - added shared typed fetch wrapper and helpers for telemetry, documents, events, and SCADA.
- `app/(app)/dashboard/page.tsx` - replaced mock KPI/chart/alarm data with telemetry, document summary, and event API calls; added 10s telemetry polling.
- `app/(app)/energie/page.tsx` - replaced mock consumption and STEG billing data with document summary/list endpoints and empty states.
- `app/(app)/alertes/page.tsx` - replaced mock alarms/equipment filters with events API data, stats cards, and acknowledge PATCH wiring.
- `app/(app)/trigeneration/page.tsx` - replaced mock KPIs/charts with ESP32 telemetry, power history, and SCADA summary.
- `components/power-chart.tsx` - made the chart render caller-provided live data with loading/error/empty states.
- `components/active-alarms.tsx` - made the card render caller-provided event data and acknowledge actions.
- `components/top-bar.tsx` - replaced mock alarm badge count with `/events/stats`.
- `WORKDONE.md` - recorded Prompt D work and validation.
- `tsconfig.tsbuildinfo` - updated by the TypeScript/build validation commands.

Commands run:
- `git status --short` - passed; checked worktree before editing and before closeout.
- `Get-Content -Raw AGENT_PROMPTS.txt` - passed; read Prompt D instructions.
- `rg` over app/components/lib for mock usage - passed; no remaining `mockData` imports found after edits.
- `pnpm build` - passed.
- `pnpm exec tsc --noEmit` - passed.

Not validated:
- Live browser interaction was not run against a real backend dataset; the pages were validated by build/typecheck and are coded to render empty/error states when API data is empty or unavailable.
