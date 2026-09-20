#!/usr/bin/env bash
# Runs the database tests against disposable containers: the schema and Row Level Security
# (supabase/tests/rls.test.ts) and the app's data layer through PostgREST, the same REST layer
# Supabase uses (supabase/tests/repository.test.ts).
#
# With RLS_DATABASE_URL set (a disposable Postgres you provide) only the schema tests run.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -n "${RLS_DATABASE_URL:-}" ]]; then
  exec npx vitest run supabase/tests
fi

command -v docker >/dev/null || { echo "docker is required (or set RLS_DATABASE_URL to a disposable Postgres)" >&2; exit 1; }

id="$$"
pg="leaderforge-pg-$id"
rest="leaderforge-rest-$id"
cleanup() { docker rm -f "$pg" "$rest" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --rm --name "$pg" -e POSTGRES_PASSWORD=test -p 127.0.0.1::5432 postgres:16-alpine >/dev/null
pgport="$(docker port "$pg" 5432/tcp | head -n1 | sed 's/.*://')"
for _ in $(seq 1 80); do
  # TCP, not the socket: the image's temporary init server only listens on the socket, then restarts.
  docker exec "$pg" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
  sleep 0.5
done

# A database with the app's schema, for the data-layer tests. (rls.test.ts makes its own.)
psql_app() { docker exec -i "$pg" psql -U postgres -d app -v ON_ERROR_STOP=1 -q "$@"; }
docker exec "$pg" psql -U postgres -v ON_ERROR_STOP=1 -q -c "create database app" >/dev/null
psql_app < supabase/tests/bootstrap.sql
for f in supabase/migrations/*.sql; do psql_app < "$f"; done

secret="test-jwt-secret-at-least-thirty-two-characters-long"
restport="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
docker run -d --rm --name "$rest" --network host \
  -e PGRST_DB_URI="postgres://authenticator:test@127.0.0.1:${pgport}/app" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$secret" -e PGRST_SERVER_PORT="$restport" \
  postgrest/postgrest >/dev/null
for _ in $(seq 1 80); do
  curl -fs "http://127.0.0.1:${restport}/" >/dev/null 2>&1 && break
  sleep 0.5
done

RLS_DATABASE_URL="postgres://postgres:test@127.0.0.1:${pgport}/postgres" \
REPO_DATABASE_URL="postgres://postgres:test@127.0.0.1:${pgport}/app" \
POSTGREST_URL="http://127.0.0.1:${restport}" \
POSTGREST_JWT_SECRET="$secret" \
  npx vitest run supabase/tests
