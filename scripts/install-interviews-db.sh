#!/bin/sh
set -eu
cd /opt/portail-so
backup="/opt/portail-so/backups/before-interviews-$(date -u +%Y%m%dT%H%M%SZ).dump"
sudo -n install -d -m 700 /opt/portail-so/backups
sudo -n docker exec portail-so-postgres-1 sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' | sudo -n tee "$backup" >/dev/null
sudo -n chmod 600 "$backup"
sudo -n test -s "$backup"
sudo -n docker exec -i portail-so-postgres-1 sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < database/init/010_interviews.sql
printf 'Interview migration installed. Backup: %s\n' "$backup"
