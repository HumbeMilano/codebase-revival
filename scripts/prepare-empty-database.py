#!/usr/bin/env python3
"""Emit an atomic, tracked installation for a NEW empty Supabase project only.

The existing database and applied migration files are never modified by this
generator. Run the resulting SQL once through an owner-controlled connection.
"""
from datetime import datetime, timezone
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def prepare(owner_email=None):
    parts = ["""BEGIN;
DO $$ BEGIN
  IF to_regclass('public.households') IS NOT NULL
     OR EXISTS (SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'Empty installation requires a new project without application data or accounts';
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS drizzle;
REVOKE ALL ON SCHEMA drizzle FROM PUBLIC, anon, authenticated;
CREATE TABLE drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint NOT NULL);
"""]
    journal = json.loads((ROOT / 'drizzle/migrations/meta/_journal.json').read_text())
    migrations = [(ROOT / 'drizzle/migrations' / (e['tag'] + '.sql'), e['when']) for e in journal['entries']]
    for path, timestamp in migrations:
        contents = path.read_text()
        parts.append(contents)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        parts.append(f"INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES('{digest}',{timestamp});")
    # The immutable legacy history includes a sample household. Remove precisely
    # that seeded household within this new-install transaction, before adding
    # historical-member constraints. There are no existing user records here.
    parts.append("DELETE FROM public.households WHERE id='11111111-1111-1111-1111-111111111111';")
    for path in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
        contents = re.sub(r'^\s*(?:BEGIN|COMMIT);\s*$', '', path.read_text(), flags=re.M | re.I)
        parts.append(contents)
        timestamp = int(datetime.strptime(path.name[:14], '%Y%m%d%H%M%S').replace(tzinfo=timezone.utc).timestamp() * 1000)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        parts.append(f"INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES('{digest}',{timestamp});")
    parts.append((ROOT / 'scripts/validate-constraints.sql').read_text())
    if owner_email:
        owner_email = owner_email.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", owner_email):
            raise ValueError('A valid owner email is required')
        literal = owner_email.replace("'", "''")
        parts.append(f"INSERT INTO homehub_private.platform_owners(email) VALUES('{literal}');")
    parts.append("COMMIT;\nSELECT (SELECT count(*) FROM public.households) AS households, (SELECT count(*) FROM auth.users) AS accounts, (SELECT count(*) FROM drizzle.__drizzle_migrations) AS tracked_migrations;")
    return '\n\n'.join(parts)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', nargs='?')
    parser.add_argument('--owner-email')
    args = parser.parse_args()
    sql = prepare(args.owner_email)
    if args.output:
        Path(args.output).write_text(sql)
    else:
        print(sql)
