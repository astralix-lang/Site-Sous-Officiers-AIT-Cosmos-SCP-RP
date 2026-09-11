#!/bin/sh
set -eu
cd /opt/portail-so
# Install and exercise the entire migration in a transaction that is always rolled back.
{
  sed '/^COMMIT;$/d' database/init/010_interviews.sql
  cat database/tests/interviews.sql
  printf '\nROLLBACK;\n'
} | sudo -n docker exec -i portail-so-postgres-1 sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
