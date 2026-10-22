#!/usr/bin/env python3
"""Integration tests against a disposable, network-isolated PostgreSQL container.

Requires Docker and Python 3 only. No real project credentials are used. The
Supabase scaffold provides platform schemas, not Auth/Storage HTTP services.
"""
import json
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
ENV = os.environ.copy()
for selector in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'):
    ENV.pop(selector, None)
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
NAME = 'homehub-sql-test-' + uuid.uuid4().hex[:10]
USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
USER_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
COUNT = 0


def execute(command, **kwargs):
    return subprocess.run(command, env=ENV, text=True, capture_output=True, **kwargs)


def sql(query, *, user=None, device=None, finance=None, fail=None, passkey=False, session_id=None, passkey_age=0):
    claims = {'sub': user, 'session_id': 'sql-test-' + user} if user else {}
    if user and passkey:
        claims['amr'] = [{'method': 'passkey', 'timestamp': int(time.time())-passkey_age}]
        claims['session_id'] = session_id or str(uuid.uuid4())
    headers = {}
    if device:
        headers['x-device-token'] = device
    if finance:
        headers['x-finance-token'] = finance
    prefix = f"SET request.jwt.claims='{json.dumps(claims)}'; SET request.headers='{json.dumps(headers)}';"
    if user:
        prefix += 'SET ROLE authenticated;'
    elif device is not None:
        prefix += 'SET ROLE anon;'
    result = execute(DOCKER + ['exec', '-i', NAME, 'psql', '-h', '127.0.0.1', '-X', '-qAt', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], input=prefix + query)
    if fail:
        assert result.returncode != 0 and fail in result.stderr, (query, result.stdout, result.stderr)
    else:
        assert result.returncode == 0, (query, result.stdout, result.stderr)
    return result.stdout.strip()


def check(label, actual, expected):
    global COUNT
    assert actual == expected, (label, actual, expected)
    COUNT += 1
    print('PASS', label, flush=True)


def j(value):
    return json.dumps(value).replace("'", "''")


def collection(table, hid, changes, *, user=USER_A, fail=None):
    return sql(f"SELECT save_collection('{table}','{hid}','{j(changes)}'::jsonb);", user=user, fail=fail)


def run():
    started = execute(DOCKER + ['run', '--name', NAME, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-d', os.environ.get('HOMEHUB_TEST_POSTGRES_IMAGE', 'postgres:17-alpine')])
    assert started.returncode == 0, started.stderr
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        # The image first starts a temporary Unix-socket-only server for initdb.
        # Wait for TCP so migrations cannot race its shutdown and final startup.
        if execute(DOCKER + ['exec', NAME, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).returncode == 0:
            break
        time.sleep(.2)
    else:
        raise RuntimeError('PostgreSQL did not become ready')
    if sys.argv[1:] == ['--empty-install']:
        sql((ROOT / 'scripts/database-bootstrap.sql').read_text())
        prepared = execute([sys.executable, str(ROOT / 'scripts/prepare-empty-database.py')])
        assert prepared.returncode == 0, prepared.stderr
        sql(prepared.stdout)
        check('new install contains no households or accounts', sql('SELECT (SELECT count(*) FROM households)+(SELECT count(*) FROM auth.users);'), '0')
        check('new install contains no demo finance or members', sql('SELECT (SELECT count(*) FROM members)+(SELECT count(*) FROM bills)+(SELECT count(*) FROM pairing_codes);'), '0')
        migration_count = len(list((ROOT / 'drizzle/migrations').glob('*.sql'))) + len(list((ROOT / 'supabase/migrations').glob('*.sql')))
        check('new installation tracks every source migration', sql('SELECT count(*) FROM drizzle.__drizzle_migrations;'), str(migration_count))
        check('all new-install constraints are validated', sql("SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated;"), '0')
        check('admin allowlist is private', sql("SELECT has_schema_privilege('authenticated','homehub_private','USAGE');"), 'f')
        sql("INSERT INTO homehub_private.platform_owners(email) VALUES('owner@example.invalid');")
        sql(f"INSERT INTO auth.users(id,email) VALUES('{USER_A}','owner@example.invalid');")
        check('unverified owner has no administrator role', sql('SELECT count(*) FROM user_roles;'), '0')
        sql(f"UPDATE auth.users SET email_confirmed_at=now() WHERE id='{USER_A}';")
        check('verified allowlisted owner is provisioned', sql(f"SELECT am_platform_admin();", user=USER_A), 't')
        sql(f"INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{USER_B}','other@example.invalid',now());")
        check('ordinary verified account stays unprivileged', sql('SELECT am_platform_admin();', user=USER_B), 'f')
        sql('SELECT claim_platform_admin();', user=USER_B, fail='permission denied')
        sql("INSERT INTO homehub_private.platform_owners(email) VALUES('forbidden@example.invalid');", user=USER_B, fail='permission denied')
        check('only designated owner receives platform administration', sql('SELECT count(*) FROM user_roles;'), '1')
        repeated = execute([sys.executable, str(ROOT / 'scripts/prepare-empty-database.py')])
        sql(repeated.stdout, fail='Empty installation requires')
        print(f'\n{COUNT} empty-install checks passed (plus permission and rerun guards).', flush=True)
        return
    legacy = [ROOT / 'scripts/database-bootstrap.sql', *sorted((ROOT / 'drizzle/migrations').glob('*.sql'))]
    for path in legacy:
        sql(path.read_text())
    sql("INSERT INTO pairing_codes(code,household_id,expires_at,max_uses) VALUES('PEREZ1','11111111-1111-1111-1111-111111111111',now()+interval '1 year',9999);")
    for path in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
        if path.name == '20261022225312_qr_pairing_and_guided_tour.sql':
            sql("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','existing@example.invalid',now());")
        sql(path.read_text())
    sql((ROOT / 'scripts/validate-constraints.sql').read_text())
    check('all integrity constraints validate on a clean installation', sql("SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated;"), '0')
    check('legacy demo pairing credentials are expired without deleting history', sql("SELECT expires_at<=now() FROM pairing_codes WHERE code='PEREZ1';"), 't')
    sql("SELECT pair_device('PEREZ1','Forbidden demo');", device='', fail='permission denied')
    check('all migrations preserve the seeded household', sql("SELECT count(*) FROM households WHERE name='Familia Pérez';"), '1')
    check('private avatar bucket is provisioned with limits', sql("SELECT count(*) FROM storage.buckets WHERE id='personal-avatars' AND NOT public AND file_size_limit=2097152;"), '1')
    sql(f"INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{USER_A}','a@example.invalid',now()),('{USER_B}','b@example.invalid',now()),('{USER_C}','c@example.invalid',now());")
    sql('SELECT claim_platform_admin();', user=USER_A, fail='permission denied')
    check('ordinary account cannot claim global administration', sql('SELECT count(*) FROM user_roles;'), '0')
    hid = sql("SELECT create_household('Test Home','Adult A','1234');", user=USER_A)
    member_a = sql('SELECT member_key FROM my_context();', user=USER_A)
    invite = sql("SELECT prepare_email_invite('Adult B','admin','b@example.invalid')->>'code';", user=USER_A)
    check('invitation joins correct household', sql(f"SELECT redeem_invite('{invite}','5678');", user=USER_B), hid)
    member_b = sql('SELECT member_key FROM my_context();', user=USER_B)
    child = sql("SELECT create_member('Child','member','2468');", user=USER_A)
    foreign_hid = sql("SELECT create_household('Other Home','Other Adult','4321');", user=USER_C)
    foreign_member = sql('SELECT member_key FROM my_context();', user=USER_C)
    rowid = str(uuid.uuid4())
    changes = [{'id': rowid, 'operation': 'insert', 'expected_revision': None, 'values': {'name': 'Milk', 'done': False, 'position': 0}}]
    rows = json.loads(collection('shopping_items', hid, changes))
    check('atomic collection insert starts at revision one', rows[0]['revision'], 1)
    rows = json.loads(collection('shopping_items', hid, [{'id': rowid, 'operation': 'update', 'expected_revision': 1, 'values': {'done': True}}]))
    check('partial update increments revision and preserves name', (rows[0]['revision'], rows[0]['name'], rows[0]['done']), (2, 'Milk', True))
    collection('shopping_items', hid, [{'id': rowid, 'expected_revision': 2, 'values': {'name': 'Missing operation'}}], fail='Invalid change')
    collection('shopping_items', hid, [{'id': rowid, 'operation': 'update', 'expected_revision': 1, 'values': {'name': 'Stale'}}], fail='Record changed')
    check('stale edit preserves latest record', sql(f"SELECT name FROM shopping_items WHERE id='{rowid}';", user=USER_A), 'Milk')
    second = str(uuid.uuid4())
    collection('shopping_items', hid, [
        {'id': second, 'operation': 'insert', 'expected_revision': None, 'values': {'name': 'Bread'}},
        {'id': rowid, 'operation': 'update', 'expected_revision': 1, 'values': {'name': 'Stale'}},
    ], fail='Record changed')
    check('failed batch rolls back its earlier insert', sql(f"SELECT count(*) FROM shopping_items WHERE id='{second}';", user=USER_A), '0')
    sql(f"UPDATE shopping_items SET done=false WHERE id='{rowid}';", user=USER_A, fail='permission denied')
    check('cross-household reads remain isolated', sql(f"SELECT count(*) FROM shopping_items WHERE household_id='{hid}';", user=USER_C), '0')
    collection('shopping_items', foreign_hid, changes, fail='Household access denied')
    collection('shopping_items', hid, [{'id': str(uuid.uuid4()), 'operation': 'insert', 'values': {'name': 'Bad', 'household_id': foreign_hid}}], fail='Invalid fields')
    check('RPC cannot call internal privileged helpers', sql("SELECT has_schema_privilege('authenticated','homehub_private','USAGE');"), 'f')
    # All financial subrecords are one transaction and all effective amounts validate.
    billid = str(uuid.uuid4())
    bill = {'id': billid, 'name': 'Rent', 'category': 'Vivienda', 'base': 100, 'due_day': 31, 'auto_pay': False, 'position': 0, 'splits': [{'person_key': member_a, 'type': 'amount', 'value': 100}], 'overrides': []}
    saved = json.loads(sql(f"SELECT save_bill('{hid}','{j(bill)}'::jsonb,NULL);", user=USER_A))
    check('atomic bill insert returns its revision', saved['revision'], 1)
    invalid = {**bill, 'name': 'Should roll back', 'overrides': [{'month': 'bad-month', 'amount': 100}]}
    sql(f"SELECT save_bill('{hid}','{j(invalid)}'::jsonb,1);", user=USER_A, fail='override_month_valid')
    check('failed replacement keeps original bill and split', sql(f"SELECT name||':'||(SELECT count(*) FROM bill_splits WHERE bill_id='{billid}') FROM bills WHERE id='{billid}';", user=USER_A), 'Rent:1')
    invalid = {**bill, 'overrides': [{'month': '2026-10', 'amount': 50}]}
    sql(f"SELECT save_bill('{hid}','{j(invalid)}'::jsonb,1);", user=USER_A, fail='Split total must match')
    invalid = {**bill, 'splits': [{'person_key': foreign_member, 'type': 'equal', 'value': 0}]}
    sql(f"SELECT save_bill('{hid}','{j(invalid)}'::jsonb,1);", user=USER_A, fail='Invalid split or household member')
    invalid = {**bill, 'due_day': 99}
    sql(f"SELECT save_bill('{hid}','{j(invalid)}'::jsonb,1);", user=USER_A, fail='bills_due_day_valid')
    check('invalid financial records never replace originals', sql(f"SELECT revision FROM bills WHERE id='{billid}';", user=USER_A), '1')
    saved = json.loads(sql(f"SELECT save_bill('{hid}','{j({**bill, 'name':'New Rent'})}'::jsonb,1);", user=USER_A))
    check('bill update increments revision', saved['revision'], 2)
    sql(f"SELECT delete_bill('{billid}',1);", user=USER_A, fail='Record changed')
    contribution = [{'id': str(uuid.uuid4()), 'operation': 'insert', 'values': {'person_key': 'papa', 'amount': 50, 'month': '2026-10'}}]
    collection('contributions', hid, contribution, fail='contribution_member_valid')
    check('invalid member cannot silently receive an aporte', sql(f"SELECT count(*) FROM contributions WHERE household_id='{hid}';", user=USER_A), '0')
    sql(f"SELECT delete_member('{member_a}');", user=USER_B, fail='linked account')
    # Daily use features: timestamp provenance, dates, durable retries, recipient binding and photos.
    chore_id = str(uuid.uuid4())
    row = json.loads(collection('chores', hid, [{'id': chore_id, 'operation': 'insert', 'values': {'title':'Archive me','member_key':member_a,'done':False}}]))[0]
    check('new incomplete task has no completion timestamp', row['completed_at'], None)
    row = json.loads(collection('chores', hid, [{'id': chore_id, 'operation':'update','expected_revision':1,'values':{'done':True}}]))[0]
    completed_at = row['completed_at']
    check('completing a task stamps server time', bool(completed_at), True)
    row = json.loads(collection('chores', hid, [{'id': chore_id, 'operation':'update','expected_revision':2,'values':{'title':'Keep completion'}}]))[0]
    check('editing a completed task does not postpone archival', row['completed_at'], completed_at)
    collection('chores', hid, [{'id':chore_id,'operation':'update','expected_revision':3,'values':{'completed_at':'2099-01-01'}}], fail='Invalid fields')
    row = json.loads(collection('chores', hid, [{'id':chore_id,'operation':'update','expected_revision':3,'values':{'done':False}}]))[0]
    check('restoring a task clears its completion timestamp', row['completed_at'], None)
    contribution_id = str(uuid.uuid4())
    value = {'person_key':member_a,'amount':12.34,'month':'2026-10','occurred_on':'2026-10-20'}
    row = json.loads(collection('contributions', hid, [{'id':contribution_id,'operation':'insert','values':value}]))[0]
    check('contribution retains the selected date', row['occurred_on'], '2026-10-20')
    collection('contributions', hid, [{'id':contribution_id,'operation':'update','expected_revision':1,'values':{'occurred_on':'2026-11-01'}}], fail='contribution_date_month')
    mutation_id = str(uuid.uuid4()); offline_item = str(uuid.uuid4())
    changes = [{'id':offline_item,'operation':'insert','expected_revision':None,'values':{'name':'Offline apples','done':False}}]
    query = f"SELECT sync_shopping('{hid}','{mutation_id}','{j(changes)}'::jsonb,'{member_a}');"
    response = sql(query,user=USER_A)
    check('lost-response shopping retry returns the original receipt', sql(query,user=USER_A), response)
    check('shopping retry inserts exactly one product', sql(f"SELECT count(*) FROM shopping_items WHERE id='{offline_item}';"), '1')
    sql(f"SELECT sync_shopping('{hid}','{mutation_id}','[]'::jsonb,'{member_a}');",user=USER_A,fail='Mutation identity reused')
    sql(f"SELECT sync_shopping('{hid}','{uuid.uuid4()}','[]'::jsonb,'wrong-member');",user=USER_A,fail='member changed')
    sql(query,user=USER_C,fail='Household access denied')
    email_invite = sql("SELECT prepare_email_invite('New person','member','newperson@example.invalid')->>'code';",user=USER_A)
    sql(f"SELECT redeem_invite('{email_invite}','9999');",user=USER_C,fail='different verified email')
    check('email invitation uses a stronger random credential',len(email_invite),32)
    sql("SELECT prepare_email_invite('New person','member','newperson@example.invalid');",user=USER_A,fail='Wait a minute')
    check('unaccepted email remains pending',sql(f"SELECT delivery_status FROM invites WHERE code='{email_invite}';"),'pending')
    delivery = sql(f"SELECT email_delivery_id FROM invites WHERE code='{email_invite}';")
    sql(f"SELECT mark_invite_email_sent('{email_invite}','provider-one','{delivery}');",user=USER_A)
    sql(f"UPDATE invites SET last_email_attempt_at=now()-interval '2 minutes' WHERE code='{email_invite}';")
    resent = json.loads(sql(f"SELECT prepare_email_invite('New person','member','newperson@example.invalid','{email_invite}');",user=USER_A))
    check('intentional resend creates a new provider delivery identity',resent['delivery_id']!=delivery,True)
    sql(f"SELECT mark_invite_email_sent('{email_invite}','stale-provider','{delivery}');",user=USER_A,fail='delivery changed')
    sql(f"UPDATE invites SET last_email_attempt_at=now()-interval '2 minutes' WHERE code='{email_invite}';")
    retry = json.loads(sql(f"SELECT prepare_email_invite('New person','member','newperson@example.invalid','{email_invite}');",user=USER_A))
    check('uncertain pending email retries keep the same delivery identity',retry['delivery_id'],resent['delivery_id'])
    sql(f"UPDATE auth.users SET email='newperson@example.invalid',email_confirmed_at=NULL WHERE id='{USER_C}';")
    sql(f"SELECT redeem_invite('{email_invite}','9999');",user=USER_C,fail='different verified email')
    sql(f"UPDATE auth.users SET email='c@example.invalid',email_confirmed_at=now() WHERE id='{USER_C}';")
    photo_path = f'{hid}/{uuid.uuid4()}.jpg'
    sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('household-photos','{photo_path}');")
    photo_id = sql(f"SELECT add_household_photo('{photo_path}');",user=USER_A)
    check('own household can read photo metadata',sql('SELECT count(*) FROM list_household_photos();',user=USER_A),'1')
    check('anonymous callers cannot execute photo mutations',sql("SELECT has_function_privilege('anon','public.add_household_photo(text)','EXECUTE') OR has_function_privilege('anon','public.remove_household_photo(uuid)','EXECUTE') OR has_function_privilege('anon','public.reorder_household_photos(uuid[])','EXECUTE');"),'f')
    check('other household cannot read photo metadata',sql('SELECT count(*) FROM list_household_photos();',user=USER_C),'0')
    sql(f"SELECT add_household_photo('{photo_path}');",user=USER_C,fail='Upload a household photo first')
    sql(f"SELECT reorder_household_photos(ARRAY['{photo_id}'::uuid]);",user=USER_C,fail='Photo order changed')
    sql(f"SELECT remove_household_photo('{photo_id}');",user=USER_C)
    check('another household cannot remove a photo',sql(f"SELECT count(*) FROM household_photos WHERE id='{photo_id}';"),'1')
    sql(f"SELECT remove_household_photo('{photo_id}');",user=USER_A)
    check('adult can remove own household photo',sql('SELECT count(*) FROM list_household_photos();',user=USER_A),'0')
    # Failed PIN entries are committed and common to both public PIN endpoints.
    for _ in range(4):
        check('invalid PIN returns no identity', sql("SELECT count(*) FROM verify_pin('0000');", user=USER_A), '0')
    check('valid child PIN does not erase adult guesses', sql("SELECT count(*) FROM verify_pin('2468');", user=USER_A), '1')
    check('fifth invalid attempt commits', sql("SELECT count(*) FROM verify_pin('0000');", user=USER_A), '0')
    check('shared budget is locked', json.loads(sql('SELECT pin_lock_status();', user=USER_A))['locked'], True)
    check('valid adult PIN is blocked at verification', sql("SELECT count(*) FROM verify_pin('1234');", user=USER_A), '0')
    check('direct financial authorization cannot bypass lockout', sql("SELECT authorize_finances('1234') IS NULL;", user=USER_A), 't')
    sql(f"UPDATE pin_attempts SET created_at=now()-interval '6 minutes' WHERE household_id='{hid}';")
    sql('SELECT create_pairing_code();', user=USER_A, fail='permission denied')
    sql("SELECT pair_tablet_with_passkey('Denied');", user=USER_A, fail='fresh passkey')
    sql("SELECT pair_device('ABCDEF123456','Old route');",device='',fail='permission denied')
    sql("SELECT pair_tablet_with_passkey('Expired');",user=USER_A,passkey=True,passkey_age=180,fail='fresh passkey')
    sql(f"UPDATE members SET role='member' WHERE household_id='{hid}' AND key='{member_b}';")
    sql("SELECT pair_tablet_with_passkey('Child account');",user=USER_B,passkey=True,fail='Only adults')
    sql(f"UPDATE members SET role='admin' WHERE household_id='{hid}' AND key='{member_b}';")
    pairing_session = str(uuid.uuid4())
    device = sql("SELECT pair_tablet_with_passkey('Test tablet');", user=USER_A, passkey=True, session_id=pairing_session)
    sql("SELECT pair_tablet_with_passkey('Reused session');",user=USER_A,passkey=True,session_id=pairing_session,fail='duplicate key')
    check('passkey pairing returns a cryptographic device credential', len(device), 64)
    # QR pairing separates phone approval from the tablet's private claim key.
    server_key = 'sql-fixture-pairing-server'
    digest = lambda value: hashlib.sha256(value.encode()).hexdigest()
    sql(f"INSERT INTO homehub_private.tablet_pairing_keys VALUES('{digest(server_key)}');")
    sql('SELECT * FROM homehub_private.tablet_pairing_requests;', device='', fail='permission denied')
    def qr_request():
        rid, claim, approval = str(uuid.uuid4()), uuid.uuid4().hex*2, uuid.uuid4().hex*2
        query = f"SELECT create_tablet_pairing('{rid}','QR tablet','{digest(claim)}','{digest(approval)}','{server_key}');"
        return rid, claim, approval, query
    rid, claim, approval, create = qr_request()
    sql(create.replace(server_key, 'wrong-server-key'), device='', fail='server authorization')
    sql(create, user=USER_A, fail='permission denied')
    prepared = json.loads(sql(create, device=''))
    check('anonymous QR creation returns only public request metadata', sorted(prepared), ['expires_at', 'id', 'name'])
    check('QR creation retry preserves the request expiry', json.loads(sql(create, device='')), prepared)
    check('phone preview names the authorizing household', json.loads(sql(f"SELECT tablet_pairing_preview('{rid}','{approval}');",user=USER_A))['household_name'], 'Test Home')
    sql(f"SELECT tablet_pairing_preview('{rid}','{claim}');",user=USER_A,fail='Invalid or expired')
    approve = f"SELECT approve_tablet_pairing('{rid}','{approval}');"
    sql(approve, user=USER_A, fail='fresh passkey')
    sql(approve, user=USER_A, passkey=True, fail='fresh passkey')  # fabricated/deleted Auth session
    sid = str(uuid.uuid4())
    sql(f"INSERT INTO auth.sessions(id,user_id) VALUES('{sid}','{USER_A}');")
    sql(approve,user=USER_A,passkey=True,session_id=sid,passkey_age=180,fail='fresh passkey')
    sql(f"SELECT claim_tablet_pairing('{rid}','{claim}');",device='',fail='not approved')
    sql(f"UPDATE members SET role='member' WHERE household_id='{hid}' AND key='{member_b}';")
    sql(approve,user=USER_B,passkey=True,fail='Only adults')
    sql(f"UPDATE members SET role='admin' WHERE household_id='{hid}' AND key='{member_b}';")
    sql(approve,user=USER_A,passkey=True,session_id=sid)
    sql(approve,user=USER_A,passkey=True,session_id=sid)  # lost HTTP response retry
    check('only the tablet claim secret sees approval', json.loads(sql(f"SELECT tablet_pairing_status('{rid}','{claim}');",device=''))['status'], 'approved')
    sql(f"SELECT claim_tablet_pairing('{rid}','{approval}');",device='',fail='not approved')
    claim_sql = f"SELECT claim_tablet_pairing('{rid}','{claim}');"
    # Concurrent retries must produce the same credential and exactly one device.
    claim_prefix = "SET ROLE anon;"
    def claim_process():
        proc = subprocess.Popen(DOCKER + ['exec','-i',NAME,'psql','-h','127.0.0.1','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=ENV)
        return proc
    processes = [claim_process(),claim_process()]
    receipts = []
    for proc in processes:
        proc.stdin.write(claim_prefix+claim_sql)
        proc.stdin.close()
    for proc in processes:
        proc.wait(timeout=10)
        assert proc.returncode == 0, proc.stderr.read()
        receipts.append(json.loads(proc.stdout.read().strip()))
    check('concurrent QR claims return one identical private device credential', receipts[0], receipts[1])
    check('QR claim retry never inserts a second device', sql(f"SELECT count(*) FROM devices WHERE token_hash='{digest(receipts[0]['token'])}';"), '1')
    check('claimed tablet receives device mode without an adult account', json.loads(sql('SELECT row_to_json(c) FROM my_context() c;',device=receipts[0]['token']))['mode'], 'device')
    rid2, claim2, approval2, create2 = qr_request()
    sql(create2,device='')
    sql(f"SELECT approve_tablet_pairing('{rid2}','{approval2}');",user=USER_A,passkey=True,session_id=sid,fail='already used')
    sql(f"UPDATE devices SET revoked=true WHERE token_hash='{digest(receipts[0]['token'])}';")
    sql(claim_sql,device='',fail='Device revoked')
    sql(f"SELECT cancel_tablet_pairing('{rid2}','{approval2}');",device='')
    check('phone approval key cannot cancel or claim the tablet', json.loads(sql(f"SELECT tablet_pairing_status('{rid2}','{claim2}');",device=''))['status'], 'pending')
    sql(f"SELECT cancel_tablet_pairing('{rid2}','{claim2}');",device='')
    check('tablet cancellation invalidates its QR', json.loads(sql(f"SELECT tablet_pairing_status('{rid2}','{claim2}');",device=''))['status'], 'expired')
    sql(f"SELECT tablet_pairing_preview('{rid2}','{approval2}');",user=USER_A,fail='Invalid or expired')
    rid3, claim3, approval3, create3 = qr_request()
    sql(create3,device='')
    sid3 = str(uuid.uuid4())
    sql(f"INSERT INTO auth.sessions(id,user_id) VALUES('{sid3}','{USER_A}');")
    sql(f"SELECT approve_tablet_pairing('{rid3}','{approval3}');",user=USER_A,passkey=True,session_id=sid3)
    sql(f"UPDATE households SET suspended=true WHERE id='{hid}';")
    sql(f"SELECT claim_tablet_pairing('{rid3}','{claim3}');",device='',fail='approval no longer valid')
    sql(f"UPDATE households SET suspended=false WHERE id='{hid}';")
    sql(f"UPDATE members SET role='member' WHERE household_id='{hid}' AND key='{member_a}';")
    sql(f"SELECT claim_tablet_pairing('{rid3}','{claim3}');",device='',fail='approval no longer valid')
    sql(f"UPDATE members SET role='admin' WHERE household_id='{hid}' AND key='{member_a}';")
    sql(f"UPDATE homehub_private.tablet_pairing_requests SET expires_at=now()-interval '1 second' WHERE id='{rid3}';")
    sql(f"SELECT claim_tablet_pairing('{rid3}','{claim3}');",device='',fail='Invalid or expired')
    check('existing accounts are not interrupted by the new tour', sql("SELECT onboarding_state->>'dismissed' FROM profiles WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';"), 'true')
    check('new accounts start a contextual tour', json.loads(sql(f"SELECT onboarding_state FROM profiles WHERE id='{USER_A}';",user=USER_A))['dismissed'], False)
    progress = json.loads(sql("SELECT save_onboarding_progress(ARRAY['home','notes']);",user=USER_A))
    check('tour progress merges visited sections', sorted(progress['seen']), ['home','notes'])
    check('tour progress stays private to its account', json.loads(sql("SELECT save_onboarding_progress();",user=USER_B))['seen'], [])
    sql("SELECT save_onboarding_progress(ARRAY['invalid']);",user=USER_A,fail='Invalid tour progress')
    sql('SELECT save_onboarding_progress();',device='',fail='permission denied')
    sql("SELECT save_onboarding_progress(_dismissed=>true);",user=USER_A)
    check('tour skip survives a delayed progress update', json.loads(sql("SELECT save_onboarding_progress(ARRAY['shopping']);",user=USER_A))['dismissed'], True)
    check('only explicit replay resets the tour', json.loads(sql("SELECT save_onboarding_progress(_restart=>true);",user=USER_A)), {'version':1,'seen':[],'dismissed':False})
    token = sql("SELECT authorize_finances('1234');", device=device)
    check('paired adult grant enables finances', sql(f"SELECT can_access_finances('{hid}');", device=device, finance=token), 't')
    check('finance grant lifetime is bounded', sql(f"SELECT expires_at<=now()+interval '15 minutes' AND authorized_by IS NOT NULL FROM finance_sessions WHERE household_id='{hid}' ORDER BY created_at DESC LIMIT 1;"), 't')
    sql(f"UPDATE finance_sessions SET expires_at=now()-interval '1 second' WHERE household_id='{hid}';")
    check('expired grant is rejected by the server', sql(f"SELECT can_access_finances('{hid}');", device=device, finance=token), 'f')
    token = sql("SELECT authorize_finances('1234');", device=device)
    sql(f"SELECT update_member('{member_a}',NULL,NULL,'1357');", user=USER_A)
    check('adult PIN change revokes tablet grants', sql(f"SELECT can_access_finances('{hid}');", device=device, finance=token), 'f')
    sql(f"UPDATE households SET suspended=true WHERE id='{hid}';")
    sql('SELECT household_members();', user=USER_A, fail='Household suspended')
    sql("SELECT prepare_email_invite('Forbidden','member','blocked@example.invalid');", user=USER_A, fail='Household suspended')
    sql('SELECT my_context();', device=device, fail='Household suspended')
    check('suspension removes table access', sql(f"SELECT count(*) FROM shopping_items WHERE household_id='{hid}';", user=USER_A), '0')
    sql(f"UPDATE households SET suspended=false WHERE id='{hid}';")
    sql(f"UPDATE devices SET revoked=true WHERE household_id='{hid}';")
    sql('SELECT my_context();', device=device, fail='Device revoked')
    check('revocation immediately removes household membership', sql('SELECT count(*) FROM current_household_ids();', device=device), '0')
    # Leave preserves member/history; last adult account cannot abandon management.
    sql('SELECT leave_household();', user=USER_B)
    check('leave keeps the historical member', sql(f"SELECT count(*) FROM members WHERE household_id='{hid}' AND key='{member_b}';"), '1')
    sql('SELECT leave_household();', user=USER_A, fail='last adult account')
    sql(f"INSERT INTO household_accounts(user_id,household_id,member_key) VALUES('{USER_B}','{hid}','{member_b}');")
    # Transaction A changes one adult while transaction B waits for the household
    # lock. B must re-check and refuse removing the final connected adult.
    def begin_demote(user, key, pause):
        claims = json.dumps({'sub': user, 'session_id': 'sql-test-' + user})
        query = f"BEGIN;SET request.jwt.claims='{claims}'; SET ROLE authenticated;SELECT update_member('{key}',NULL,'member',NULL);SELECT pg_sleep({pause});COMMIT;"
        proc = subprocess.Popen(DOCKER + ['exec', '-i', NAME, 'psql', '-h', '127.0.0.1', '-X', '-qAt', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=ENV)
        proc.stdin.write(query)
        proc.stdin.close()
        return proc
    first = begin_demote(USER_A, member_a, 1)
    time.sleep(.2)
    second = begin_demote(USER_B, member_b, 0)
    first.wait(timeout=10)
    second.wait(timeout=10)
    check('first adult change succeeds', first.returncode, 0)
    check('concurrent last-adult change is rejected', second.returncode != 0, True)
    check('concurrent changes retain one adult', sql(f"SELECT count(*) FROM members WHERE household_id='{hid}' AND role='admin';"), '1')
    # A child linked account cannot access the retained financial rows.
    check('child account cannot read household finances', sql(f"SELECT count(*) FROM bills WHERE household_id='{hid}';", user=USER_A), '0')
    sql(f"SELECT save_bill('{hid}','{j(bill)}'::jsonb,2);", user=USER_A, fail='Financial authorization required')
    # Histories without an account also prevent destructive member deletion.
    sql(f"DELETE FROM household_accounts WHERE household_id='{hid}' AND member_key='{member_a}';")
    sql(f"SELECT delete_member('{member_a}');", user=USER_B, fail='household history')
    print(f'\n{COUNT} database checks passed (plus negative permission/validation assertions).', flush=True)


if __name__ == '__main__':
    if sys.argv[1:] not in ([], ['--empty-install']):
        raise SystemExit('Usage: test-database.py [--empty-install]')
    try:
        run()
    finally:
        execute(DOCKER + ['rm', '-f', NAME])
