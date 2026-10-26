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


def test_member_account_changes():
    owner, recipient, outsider = (str(uuid.uuid4()) for _ in range(3))
    sql("INSERT INTO homehub_private.platform_owners(email) VALUES('account-owner@example.invalid');")
    sql(f"INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{owner}','account-owner@example.invalid',now()),('{recipient}','replacement@example.invalid',NULL),('{outsider}','outsider@example.invalid',now());")
    hid = sql("SELECT create_household('Account changes','Historical member','2468');",user=owner)
    key = sql('SELECT member_key FROM my_context();',user=owner)
    original_id = sql(f"SELECT id FROM members WHERE household_id='{hid}' AND key='{key}';")
    note_id, contribution_id = str(uuid.uuid4()), str(uuid.uuid4())
    sql(f"INSERT INTO notes(id,household_id,title,body,member_key,pinned) VALUES('{note_id}','{hid}','Keep this note','Historical content','{key}',true);")
    sql(f"INSERT INTO contributions(id,household_id,person_key,amount,month,occurred_on) VALUES('{contribution_id}','{hid}','{key}',12.50,'2026-10','2026-10-23');")
    sql("SELECT create_member('Other member','member','5678');",user=owner)
    sql(f"UPDATE profiles SET preferred_view='mobile',time_format='12' WHERE id='{owner}';")
    sql(f"INSERT INTO dashboard_preferences(user_id,layout) VALUES('{owner}','{{\"version\":3,\"widgets\":[{{\"id\":\"notes\",\"key\":\"notes\",\"size\":\"wide\"}}]}}');")
    prepare = f"SELECT homehub_private.prepare_member_account_change('{hid}','{key}','Renamed member','replacement@example.invalid','{owner}');"
    sql(prepare,user=owner,fail='permission denied')
    sql(prepare.replace(owner,outsider),fail='Verified platform owner')
    invitation = json.loads(sql(prepare))
    check('account-change preparation retains the old account until verification',sql(f"SELECT user_id FROM household_accounts WHERE household_id='{hid}' AND member_key='{key}';"),owner)
    check('uncertain account-change preparation reuses its delivery identity',json.loads(sql(prepare))['delivery_id'],invitation['delivery_id'])
    sql(f"SELECT redeem_invite('{invitation['code']}','9876');",user=outsider,fail='different verified email')
    sql(f"SELECT redeem_invite('{invitation['code']}','9876');",user=recipient,fail='different verified email')
    sql(f"UPDATE auth.users SET email_confirmed_at=now() WHERE id='{recipient}';")
    sql(f"SELECT update_member('{key}','Changed while pending',NULL,NULL);",user=owner)
    sql(f"SELECT redeem_invite('{invitation['code']}','9876');",user=recipient,fail='Member account changed')
    fresh = json.loads(sql(prepare))
    check('a fresh account change revokes the stale invitation',sql(f"SELECT revoked_at IS NOT NULL FROM invites WHERE code='{invitation['code']}';"),'t')
    sql(f"SELECT homehub_private.confirm_member_account_invite_delivery('{fresh['code']}','{fresh['delivery_id']}','fixture-provider');")
    check('account invitation delivery is recorded with its own receipt',sql(f"SELECT delivery_status FROM invites WHERE code='{fresh['code']}';"),'sent')
    sql(f"SELECT homehub_private.confirm_member_account_invite_delivery('{fresh['code']}','{uuid.uuid4()}','wrong-receipt');",fail='delivery changed')
    sql(f"SELECT redeem_invite('{fresh['code']}','5678');",user=recipient,fail='PIN already in use')
    check('PIN conflict rolls back the new account link and preserves the original',sql(f"SELECT user_id FROM household_accounts WHERE household_id='{hid}' AND member_key='{key}';"),owner)
    grant = sql("SELECT authorize_finances('2468');",user=owner)
    check('replacement joins the existing household',sql(f"SELECT redeem_invite('{fresh['code']}','9876');",user=recipient),hid)
    check('account replacement preserves member UUID and key',sql(f"SELECT id FROM members WHERE household_id='{hid}' AND key='{key}';"),original_id)
    check('account replacement does not create duplicate members',sql(f"SELECT count(*) FROM members WHERE household_id='{hid}';"),'2')
    check('account replacement applies the requested display name',sql(f"SELECT name FROM members WHERE id='{original_id}';"),'Renamed member')
    check('replacement preserves historical notes and financial contributions',sql(f"SELECT (SELECT count(*) FROM notes WHERE id='{note_id}' AND member_key='{key}')+(SELECT count(*) FROM contributions WHERE id='{contribution_id}' AND person_key='{key}' AND amount=12.50);"),'2')
    check('old account no longer belongs to the household',sql('SELECT count(*) FROM my_context();',user=owner),'0')
    check('old account has no household table access',sql(f"SELECT count(*) FROM notes WHERE household_id='{hid}';",user=owner),'0')
    check('old financial grants are revoked during reassignment',sql(f"SELECT revoked FROM finance_sessions WHERE token_hash=encode(extensions.digest('{grant}','sha256'),'hex');"),'t')
    check('master account retains platform administration',sql('SELECT am_platform_admin();',user=owner),'t')
    check('replacement household account does not gain platform administration',sql('SELECT am_platform_admin();',user=recipient),'f')
    check('replacement keeps the household adult role',sql(f"SELECT is_household_admin('{hid}');",user=recipient),'t')
    check('replacement copies the home layout without moving the old account preference',sql(f"SELECT count(*) FROM dashboard_preferences WHERE user_id IN('{owner}','{recipient}');"),'2')
    check('replacement keeps view and clock preferences',sql(f"SELECT preferred_view||':'||time_format FROM profiles WHERE id='{recipient}';"),'mobile:12')
    sql(f"SELECT redeem_invite('{fresh['code']}','9876');",user=recipient,fail='Invalid or expired')
    sql("SELECT leave_household();",user=recipient,fail='last adult account')
    check('ordinary clients cannot prepare account changes',sql("SELECT has_function_privilege('authenticated','homehub_private.prepare_member_account_change(uuid,text,text,text,uuid)','EXECUTE');"),'f')


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
        check('shopping list events are published for realtime refresh',sql("SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='shopping_lists';"),'1')
        sql("UPDATE homehub_private.business_settings SET country='CA' WHERE id;")
        check('public catalogue follows the edited operating country',json.loads(sql('SELECT business_catalog();',device=''))['country'],'CA')
        sql("UPDATE homehub_private.business_settings SET country='US' WHERE id;")
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
    layout = {'version': 1, 'widgets': [{'id': 'tasks', 'size': 'wide'}, {'id': 'notes', 'size': 'compact'}]}
    empty_layout = {'version': 1, 'widgets': []}
    save_layout = lambda value, revision, **kwargs: sql(f"SELECT row_to_json(saved) FROM save_dashboard_layout('{j(value)}'::jsonb,{revision}) saved;", **kwargs)
    saved_layout = json.loads(save_layout(layout, 0, user=USER_A))
    check('dashboard first save is bound to the account', (saved_layout['user_id'], saved_layout['layout'], saved_layout['revision']), (USER_A, layout, 1))
    check('uncertain dashboard response retries are idempotent', json.loads(save_layout(layout, 0, user=USER_A))['revision'], 1)
    check('dashboard preferences are private between accounts', sql('SELECT count(*) FROM dashboard_preferences;', user=USER_B), '0')
    check('dashboard function uses caller privileges and RLS', sql("SELECT NOT prosecdef FROM pg_proc WHERE oid='public.save_dashboard_layout(jsonb,integer)'::regprocedure;"), 't')
    check('anonymous clients cannot read or save dashboard preferences', sql("SELECT has_table_privilege('anon','public.dashboard_preferences','SELECT') OR has_function_privilege('anon','public.save_dashboard_layout(jsonb,integer)','EXECUTE');"), 'f')
    save_layout(layout, 0, device='', fail='permission denied')
    sql(f"INSERT INTO dashboard_preferences(user_id,layout) VALUES('{USER_A}','{j(layout)}');", user=USER_B, fail='row-level security')
    sql(f"UPDATE dashboard_preferences SET user_id='{USER_B}' WHERE user_id='{USER_A}';", user=USER_A, fail='row-level security')
    check('another account cannot update dashboard preferences', sql(f"WITH changed AS(UPDATE dashboard_preferences SET revision=99 WHERE user_id='{USER_A}' RETURNING user_id) SELECT count(*) FROM changed;", user=USER_B), '0')
    check('empty dashboard layout can be saved deliberately', json.loads(save_layout(empty_layout, 1, user=USER_A))['layout'], empty_layout)
    check('dashboard revision advances once', json.loads(save_layout(empty_layout, 1, user=USER_A))['revision'], 2)
    save_layout(layout, 1, user=USER_A, fail='Dashboard changed')
    check('stale dashboard save preserves confirmed layout', json.loads(sql(f"SELECT layout FROM dashboard_preferences WHERE user_id='{USER_A}';", user=USER_A)), empty_layout)
    for invalid_layout in [None, [], {}, {'version': 4, 'widgets': []}, {'version': 1, 'widgets': None},
                           {'version': 1, 'widgets': [{'id': 'unknown', 'size': 'compact'}]},
                           {'version': 1, 'widgets': [{'id': 'tasks', 'size': 'giant'}]},
                           {'version': 1, 'widgets': [{'id': 'tasks', 'size': 'wide'}] * 2},
                           {'version': 1, 'widgets': ['tasks']}, {'version': 1, 'widgets': [], 'secret': 'not allowed'},
                           {'version': 1, 'widgets': [{'id': 'tasks', 'size': 'wide', 'data': 'not allowed'}]}]:
        save_layout(invalid_layout, 2, user=USER_A, fail='Invalid dashboard layout')
    sql("SELECT save_dashboard_layout(NULL,2);", user=USER_A, fail='Invalid dashboard layout')
    save_layout(layout, -1, user=USER_A, fail='Invalid dashboard layout')
    check('another account starts an independent dashboard', json.loads(save_layout(layout, 0, user=USER_B))['revision'], 1)
    # Force overlapping saves on one account with the same expected revision.
    def begin_layout(value, pause):
        claims = json.dumps({'sub': USER_A})
        query = f"BEGIN;SET request.jwt.claims='{claims}';SET ROLE authenticated;SELECT revision FROM save_dashboard_layout('{j(value)}'::jsonb,2);SELECT pg_sleep({pause});COMMIT;"
        proc = subprocess.Popen(DOCKER + ['exec', '-i', NAME, 'psql', '-h', '127.0.0.1', '-X', '-qAt', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=ENV)
        proc.stdin.write(query)
        proc.stdin.close()
        return proc
    first_layout = begin_layout(layout, 1)
    time.sleep(.2)
    second_layout = begin_layout({'version': 1, 'widgets': [{'id': 'calendar', 'size': 'wide'}]}, 0)
    first_layout.wait(timeout=10)
    second_layout.wait(timeout=10)
    check('first concurrent dashboard save succeeds', first_layout.returncode, 0)
    check('second concurrent dashboard save cannot overwrite it', second_layout.returncode != 0, True)
    check('concurrent dashboard saves advance only one revision', sql(f"SELECT revision FROM dashboard_preferences WHERE user_id='{USER_A}';", user=USER_A), '3')
    instances = {'version':2,'widgets':[{'id':'specific-note','key':'first','size':'small','noteId':str(uuid.uuid4())},{'id':'specific-note','key':'second','size':'column','noteId':str(uuid.uuid4())},{'id':'member-summary','key':'person','size':'square','memberId':'m_example'}]}
    check('dashboard instances and references round trip privately',json.loads(save_layout(instances,3,user=USER_A))['layout'],instances)
    for bad in [
        {**instances,'widgets':[instances['widgets'][0]]*2},
        {'version':2,'widgets':[{'id':'tasks','key':'a','size':'small','memberId':'m_example'}]},
        {'version':2,'widgets':[{'id':'specific-note','key':'a','size':'small','noteId':'bad-id'}]},
        {'version':2,'widgets':[{'id':'member-summary','key':'a','size':'small','amount':100}]},
        {'version':2,'widgets':[{'id':'tasks','key':12,'size':'small'}]},
        {'version':2,'widgets':[{'id':'tasks','key':str(i),'size':'small'} for i in range(37)]},
    ]:
        save_layout(bad,4,user=USER_A,fail='Invalid dashboard layout')
    reviewed = {'version':3,'widgets':[{'id':'shopping','key':'list','size':'column','listId':str(uuid.uuid4())},{'id':'member-tasks','key':'person-tasks','size':'tall','memberId':'m_example'},{'id':'reminders','key':'reminders','size':'compact'},{'id':'next-bill','key':'next','size':'wide'},{'id':'shopping-summary','key':'all-lists','size':'square'}]}
    check('reviewed widgets retain only private reference IDs',json.loads(save_layout(reviewed,4,user=USER_A))['layout'],reviewed)
    for bad in [
        {'version':3,'widgets':[reviewed['widgets'][0],{**reviewed['widgets'][0],'key':'another'}]},
        {'version':3,'widgets':[{'id':'notes','key':'notes','size':'small','listId':str(uuid.uuid4())}]},
        {'version':3,'widgets':[{'id':'shopping','key':'shopping','size':'small','listId':'bad-id'}]},
        {'version':3,'widgets':[{'id':'member-tasks','key':'person','size':'small','amount':100}]},
        {'version':3,'widgets':[None]}, {'version':3,'widgets':[],'private':42},
        {'version':3,'widgets':[{'id':'tasks','key':'a','size':'small','memberId':'m_example'}]},
    ]:
        save_layout(bad,5,user=USER_A,fail='Invalid dashboard layout')
    check('reviewed layout still stays private between accounts',sql(f"SELECT count(*) FROM dashboard_preferences WHERE user_id='{USER_A}';",user=USER_B),'0')
    hid = sql("SELECT create_household('Test Home','Adult A','1234');", user=USER_A)
    member_a = sql('SELECT member_key FROM my_context();', user=USER_A)
    invite = sql("SELECT prepare_email_invite('Adult B','admin','b@example.invalid')->>'code';", user=USER_A)
    check('invitation joins correct household', sql(f"SELECT redeem_invite('{invite}','5678');", user=USER_B), hid)
    member_b = sql('SELECT member_key FROM my_context();', user=USER_B)
    child = sql("SELECT create_member('Child','member','2468');", user=USER_A)
    foreign_hid = sql("SELECT create_household('Other Home','Other Adult','4321');", user=USER_C)
    foreign_member = sql('SELECT member_key FROM my_context();', user=USER_C)
    check('new households receive a default shopping list', sql(f"SELECT name FROM shopping_lists WHERE id='{hid}';", user=USER_A), 'Groceries')
    school = str(uuid.uuid4())
    list_mutation = str(uuid.uuid4())
    list_edit = [{'id': school, 'operation': 'insert', 'expected_revision': None, 'values': {'name': 'School'}}]
    bundle = lambda mutation, changes, lists, **kw: sql(f"SELECT sync_shopping_lists('{hid}','{mutation}','{j(changes)}','{j(lists)}','{member_a}');", **kw)
    school_receipt = json.loads(bundle(list_mutation, [], list_edit, user=USER_A))
    check('independent shopping lists are persisted', school_receipt['lists'][0]['name'], 'School')
    check('list creation retries preserve their receipt', json.loads(bundle(list_mutation, [], list_edit, user=USER_A)), school_receipt)
    bundle(list_mutation, [], [{**list_edit[0], 'values': {'name': 'Changed payload'}}], user=USER_A, fail='identity reused')
    check('shopping lists are isolated between households', sql(f"SELECT count(*) FROM shopping_lists WHERE household_id='{hid}';", user=USER_C), '0')
    bundle(str(uuid.uuid4()), [], [], user=USER_C, fail='Household access')
    shared_name_items = [{'id': str(uuid.uuid4()), 'operation': 'insert', 'expected_revision': None, 'values': {'name':'Reusable bottle','list_id': lid}} for lid in [hid,school]]
    collection('shopping_items', hid, shared_name_items)
    check('same product is allowed in different lists', sql(f"SELECT count(*) FROM shopping_items WHERE household_id='{hid}' AND name='Reusable bottle';", user=USER_A), '2')
    foreign_list = [{'id': str(uuid.uuid4()), 'operation':'insert', 'expected_revision':None, 'values':{'name':'Foreign product','list_id':foreign_hid}}]
    collection('shopping_items',hid,foreign_list,fail='Shopping list changed')
    archive_list = [{'id':school,'operation':'update','expected_revision':1,'values':{'archived':True}}]
    bundle(str(uuid.uuid4()),[],archive_list,user=USER_A)
    collection('shopping_items',hid,[{'id':str(uuid.uuid4()),'operation':'insert','expected_revision':None,'values':{'name':'Archived list write','list_id':school}}],fail='Shopping list changed')
    bundle(str(uuid.uuid4()),[],archive_list,user=USER_A,fail='Shopping list changed')
    check('archiving preserves list products',sql(f"SELECT count(*) FROM shopping_items WHERE list_id='{school}';",user=USER_A),'1')
    bundle(str(uuid.uuid4()),[],[{'id':school,'operation':'update','expected_revision':2,'values':{'archived':False}}],user=USER_A)
    bundle(str(uuid.uuid4()),[],[{'id':hid,'operation':'update','expected_revision':1,'values':{'archived':True}}],user=USER_A,fail='check constraint')
    sql(f"UPDATE shopping_lists SET name='Bypass' WHERE id='{school}';",user=USER_A,fail='permission denied')
    check('all twelve widget types and large size are accepted',sql("SELECT valid_dashboard_layout('{\"version\":1,\"widgets\":[{\"id\":\"clock\",\"size\":\"large\"},{\"id\":\"my-tasks\",\"size\":\"compact\"},{\"id\":\"week\",\"size\":\"wide\"},{\"id\":\"pinned-note\",\"size\":\"large\"},{\"id\":\"progress\",\"size\":\"compact\"},{\"id\":\"quick-add\",\"size\":\"wide\"}]}');"),'t')
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
    event_id=str(uuid.uuid4())
    reminder={'title':'Remember school','date':'2026-10-23','member_key':member_a,'kind':'reminder','completed':False}
    saved_event=json.loads(collection('events',hid,[{'id':event_id,'operation':'insert','values':reminder}]))[0]
    check('reminder starts incomplete',saved_event['completed'],False)
    saved_event=json.loads(collection('events',hid,[{'id':event_id,'operation':'update','expected_revision':1,'values':{'completed':True}}]))[0]
    check('completing a reminder stamps a server timestamp',bool(saved_event['completed_at']),True)
    check('other households cannot read calendar entries',sql(f"SELECT count(*) FROM events WHERE id='{event_id}';",user=USER_C),'0')
    collection('events',hid,[{'id':event_id,'operation':'update','expected_revision':1,'values':{'completed':False}}],fail='Record changed')
    collection('events',hid,[{'id':event_id,'operation':'update','expected_revision':2,'values':{'kind':'event'}}],fail='calendar_completion_valid')
    collection('events',hid,[{'id':str(uuid.uuid4()),'operation':'insert','values':{**reminder,'kind':'bill'}}],fail='calendar_kind_valid')
    collection('events',hid,[{'id':str(uuid.uuid4()),'operation':'insert','values':{**reminder,'completed_at':'2026-01-01'}}],fail='Invalid fields')
    collection('events',hid,[{'id':str(uuid.uuid4()),'operation':'insert','values':{**reminder,'kind':'event','time':'18:00','end_time':'17:00'}}],fail='calendar_end_valid')
    saved_event=json.loads(collection('events',hid,[{'id':event_id,'operation':'update','expected_revision':2,'values':{'completed':False,'date':'2026-10-24'}}]))[0]
    check('postponing and reopening a reminder clear completion time',(saved_event['date'],saved_event['completed_at']),('2026-10-24',None))
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
    # Mirror the platform grant without adding a row policy: this table must
    # remain unreadable even while the account can manage its own photo files.
    sql('GRANT SELECT ON public.household_accounts TO authenticated;')
    check('account cannot read protected membership rows directly',sql('SELECT count(*) FROM household_accounts;',user=USER_A),'0')
    sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('household-photos','{photo_path}');",user=USER_A)
    check('adult uploads through the actual Storage INSERT policy',sql(f"SELECT count(*) FROM storage.objects WHERE bucket_id='household-photos' AND name='{photo_path}';",user=USER_A),'1')
    sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('household-photos','{hid}/{uuid.uuid4()}.jpg');",user=USER_C,fail='row-level security')
    sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('household-photos','{hid}/{uuid.uuid4()}.jpg');",device='',fail='row-level security')
    sql("INSERT INTO storage.objects(bucket_id,name) VALUES('household-photos','not-a-uuid/photo.jpg');",user=USER_A,fail='row-level security')
    sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('household-photos','{hid}');",user=USER_A,fail='row-level security')
    sql(f"UPDATE members SET role='member' WHERE household_id='{hid}' AND key='{member_b}';")
    sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('household-photos','{hid}/{uuid.uuid4()}.jpg');",user=USER_B,fail='row-level security')
    sql(f"UPDATE members SET role='admin' WHERE household_id='{hid}' AND key='{member_b}';")
    sql(f"UPDATE households SET suspended=true WHERE id='{hid}';")
    sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('household-photos','{hid}/{uuid.uuid4()}.jpg');",user=USER_A,fail='row-level security')
    sql(f"UPDATE households SET suspended=false WHERE id='{hid}';")
    check('another household cannot read stored photo files',sql(f"SELECT count(*) FROM storage.objects WHERE name='{photo_path}';",user=USER_C),'0')
    check('another household cannot delete stored photo files',sql(f"WITH removed AS(DELETE FROM storage.objects WHERE name='{photo_path}' RETURNING id) SELECT count(*) FROM removed;",user=USER_C),'0')
    photo_id = sql(f"SELECT add_household_photo('{photo_path}');",user=USER_A)
    check('lost metadata response retries return the same photo receipt',sql(f"SELECT add_household_photo('{photo_path}');",user=USER_A),photo_id)
    check('own household can read photo metadata',sql('SELECT count(*) FROM list_household_photos();',user=USER_A),'1')
    check('anonymous callers cannot execute photo mutations',sql("SELECT has_function_privilege('anon','public.add_household_photo(text)','EXECUTE') OR has_function_privilege('anon','public.remove_household_photo(uuid)','EXECUTE') OR has_function_privilege('anon','public.reorder_household_photos(uuid[])','EXECUTE');"),'f')
    check('other household cannot read photo metadata',sql('SELECT count(*) FROM list_household_photos();',user=USER_C),'0')
    sql(f"SELECT add_household_photo('{photo_path}');",user=USER_C,fail='Upload a household photo first')
    sql(f"SELECT reorder_household_photos(ARRAY['{photo_id}'::uuid]);",user=USER_C,fail='Photo order changed')
    sql(f"SELECT remove_household_photo('{photo_id}');",user=USER_C)
    check('another household cannot remove a photo',sql(f"SELECT count(*) FROM household_photos WHERE id='{photo_id}';"),'1')
    extra_paths = [f'{hid}/{uuid.uuid4()}.jpg' for _ in range(11)]
    sql(''.join(f"INSERT INTO storage.objects(bucket_id,name) VALUES('household-photos','{path}');SELECT add_household_photo('{path}');" for path in extra_paths),user=USER_A)
    check('household photo cap is enforced',sql('SELECT count(*) FROM list_household_photos();',user=USER_A),'12')
    check('photo receipt remains idempotent at the cap',sql(f"SELECT add_household_photo('{photo_path}');",user=USER_A),photo_id)
    overflow_path=f'{hid}/{uuid.uuid4()}.jpg'
    sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('household-photos','{overflow_path}');",user=USER_A)
    sql(f"SELECT add_household_photo('{overflow_path}');",user=USER_A,fail='At most 12')
    sql(''.join(f"SELECT remove_household_photo((SELECT id FROM household_photos WHERE path='{path}'));DELETE FROM storage.objects WHERE bucket_id='household-photos' AND name='{path}';" for path in extra_paths)+f"DELETE FROM storage.objects WHERE bucket_id='household-photos' AND name='{overflow_path}';",user=USER_A)
    sql(f"SELECT remove_household_photo('{photo_id}');",user=USER_A)
    check('adult can remove own household photo',sql('SELECT count(*) FROM list_household_photos();',user=USER_A),'0')
    check('adult deletes through the Storage DELETE policy',sql(f"WITH removed AS(DELETE FROM storage.objects WHERE name='{photo_path}' RETURNING id) SELECT count(*) FROM removed;",user=USER_A),'1')
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
    check('guided tour preferences were removed',sql("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='onboarding_state';"),'0')
    check('guided tour RPC was removed',sql("SELECT to_regprocedure('public.save_onboarding_progress(text[],boolean,boolean)') IS NULL;"),'t')
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
    # The service owner has no household membership and still administers the business.
    master = str(uuid.uuid4())
    sql("INSERT INTO homehub_private.platform_owners(email) VALUES('master@example.invalid');")
    sql(f"INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{master}','master@example.invalid',now());")
    check('master administration works without a household',sql("SELECT count(*) FROM my_context();",user=master),'0')
    overview = json.loads(sql('SELECT admin_business_overview();',user=master))
    check('automatic charges remain disabled until a provider is configured',overview['automatic_billing'],False)
    check('only the verified owner delegates staff administration',overview['can_delegate'],True)
    sql('SELECT admin_business_overview();',user=USER_A,fail='Forbidden')
    sql('SELECT admin_business_overview();',device='',fail='permission denied')
    sql('SELECT * FROM homehub_private.business_payments;',user=USER_A,fail='permission denied')
    payment = str(uuid.uuid4())
    create_payment = f"SELECT admin_create_business_payment('{payment}','{hid}',1250,'USD','bank-ref','Internal test');"
    created = json.loads(sql(create_payment,user=master))
    check('business payments start pending without charging anyone',created['status'],'pending')
    check('payment creation is safe after a lost response',json.loads(sql(create_payment,user=master))['id'],payment)
    sql(f"SELECT admin_create_business_payment('{payment}','{hid}',1500,'USD','bank-ref','Internal test');",user=master,fail='identity reused')
    sql(f"SELECT admin_update_business_payment('{payment}',1,'received','');",user=master,fail='check constraint')
    sql(f"SELECT admin_update_business_payment('{payment}',0,'received','bank-verified');",user=master,fail='Payment changed')
    received = f"SELECT admin_update_business_payment('{payment}',1,'received','bank-verified');"
    check('external receipt is required to register a received payment',json.loads(sql(received,user=master))['status'],'received')
    check('payment confirmation retry advances the revision only once',json.loads(sql(received,user=master))['revision'],2)
    sql(f"SELECT admin_update_business_payment('{payment}',2,'pending','bank-verified');",user=master,fail='Invalid payment transition')
    totals = json.loads(sql('SELECT admin_business_overview();',user=master))['totals']
    check('business totals use exact cents and separate currencies',totals,[{'currency':'USD','status':'received','count':1,'amount_cents':1250}])
    settings = {'business_name':'Business test','country':'US','currency':'USD','support_email':'support@example.invalid'}
    settings_query = f"SELECT admin_save_business_settings('{j(settings)}',1);"
    check('business settings use revisions',json.loads(sql(settings_query,user=master))['revision'],2)
    check('business settings retry is idempotent',json.loads(sql(settings_query,user=master))['revision'],2)
    sql("SELECT admin_save_business_settings('{\"automatic_billing\":true}',2);",user=master,fail='Invalid business fields')
    plan = {'id':'pro','name':'Family Pro test','amount_cents':500,'annual_amount_cents':4000,'currency':'USD','billing_interval':'month'}
    check('plan preparation does not activate automatic billing',json.loads(sql(f"SELECT admin_save_business_plan('{j(plan)}',1);",user=master))['amount_cents'],500)
    check('plan prices never implicitly enable charging',json.loads(sql('SELECT admin_business_overview();',user=master))['automatic_billing'],False)
    sql(f"SELECT admin_set_platform_admin('{USER_B}',true);",user=master)
    sql(f"SELECT admin_set_platform_admin('{USER_A}',true);",user=USER_B,fail='Only the verified platform owner')
    sql(f"SELECT admin_set_platform_admin('{master}',false);",user=master,fail='Cannot remove')
    check('administrative actions leave an append-only business audit',sql("SELECT count(*)>=5 FROM homehub_private.platform_audit;"),'t')
    sql("DELETE FROM homehub_private.platform_audit;",user=master,fail='permission denied')
    check('business records never create family contributions',sql("SELECT count(*) FROM contributions WHERE note='Internal test';"),'0')
    test_gateway = 'fixture-gateway-' + 'x' * 48
    sql(f"INSERT INTO homehub_private.billing_gateway_keys(id,key_hash) VALUES(true,encode(extensions.digest('{test_gateway}','sha256'),'hex'));")
    sql("SELECT stripe_sandbox_configuration('wrong-key');",device='',fail='Forbidden billing gateway')
    configure = f"SELECT configure_stripe_sandbox('{test_gateway}','acct_fixture','we_fixture','whsec_fixture');"
    check('sandbox webhook setup is private and idempotent',json.loads(sql(configure,device=''))['configured'],True)
    check('sandbox setup retry returns the same endpoint',json.loads(sql(configure,device=''))['webhook_id'],'we_fixture')
    stripe_status = json.loads(sql('SELECT admin_stripe_sandbox_status();',user=master))
    check('administration never receives webhook signing secrets','webhook_secret' in stripe_status,False)
    sql('SELECT admin_stripe_sandbox_status();',user=USER_A,fail='Forbidden')
    before_plan = sql(f"SELECT plan FROM households WHERE id='{hid}';")
    test_event = {'id':'evt_fixture','type':'checkout.session.completed','livemode':False,'created':int(time.time()),'data':{'object':{'id':'cs_fixture','amount_total':299,'currency':'usd','customer_email':'private@example.invalid','payment_status':'paid','metadata':{'application':'homehub','environment':'sandbox'}}}}
    event_query = f"SELECT record_stripe_sandbox_event('{test_gateway}','{j(test_event)}');"
    check('verified sandbox events have their own ledger',json.loads(sql(event_query,device=''))['received'],True)
    check('replayed Stripe events are processed only once',json.loads(sql(event_query,device=''))['duplicate'],True)
    check('sandbox event history contains no customer email',sql("SELECT summary ? 'customer_email' FROM homehub_private.stripe_sandbox_events WHERE event_id='evt_fixture';"),'f')
    check('sandbox payments never change real household plans',sql(f"SELECT plan FROM households WHERE id='{hid}';"),before_plan)
    live_event = {**test_event,'id':'evt_live','livemode':True}
    sql(f"SELECT record_stripe_sandbox_event('{test_gateway}','{j(live_event)}');",device='',fail='Only supported sandbox events')
    check('sandbox ledger is inaccessible to ordinary accounts',sql("SELECT has_table_privilege('authenticated','homehub_private.stripe_sandbox_events','SELECT');"),'f')
    check('public catalogue exposes the editable monthly and annual prices',json.loads(sql('SELECT business_catalog();',device=''))['plans'][1]['annual_amount_cents'],4000)
    test_member_account_changes()
    test_household_avatars()
    print(f'\n{COUNT} database checks passed (plus negative permission/validation assertions).', flush=True)


def test_household_avatars():
    a,b,c=(str(uuid.uuid4()) for _ in range(3))
    sql(f"INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('{a}','avatar-a@example.invalid',now()),('{b}','avatar-b@example.invalid',now()),('{c}','avatar-c@example.invalid',now());")
    hid=sql("SELECT create_household('Avatar household','Parent','1122');",user=a)
    inv=sql("SELECT prepare_email_invite('Child','member','avatar-b@example.invalid')->>'code';",user=a)
    sql(f"SELECT redeem_invite('{inv}','3344');",user=b)
    sql("SELECT create_household('Other household','Outsider','5566');",user=c)
    for uid in [a,b,c]:
        sql(f"UPDATE profiles SET avatar_path='{uid}/avatar.png' WHERE id='{uid}';")
        sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('personal-avatars','{uid}/avatar.png');",user=uid)
    paths=lambda **kwargs: json.loads(sql('SELECT coalesce(jsonb_agg(x),\'[]\'::jsonb) FROM household_avatar_paths() x;',**kwargs))
    check('members can render both avatars in their own household',set(x['path'] for x in paths(user=b)),{f'{a}/avatar.png',f'{b}/avatar.png'})
    check('avatar metadata excludes other households',[x['path'] for x in paths(user=c)],[f'{c}/avatar.png'])
    sql('SELECT household_avatar_paths();',device='',fail='Household access denied')
    check('sharing avatars does not expose another personal profile',sql(f"SELECT count(*) FROM profiles WHERE id='{a}';",user=b),'0')
    check('sharing avatars does not grant direct access to another private object',sql(f"SELECT count(*) FROM storage.objects WHERE bucket_id='personal-avatars' AND name='{a}/avatar.png';",user=b),'0')
    token='avatar-device-fixture'
    sql(f"INSERT INTO devices(household_id,name,token_hash) VALUES('{hid}','Avatar tablet',encode(extensions.digest('{token}','sha256'),'hex'));")
    check('a paired tablet receives only its own household avatars',len(paths(device=token)),2)
    sql(f"UPDATE profiles SET avatar_path='{a}/invalid.txt' WHERE id='{a}';")
    check('an invalid reference cannot break other household avatars',[x['path'] for x in paths(user=b)],[f'{b}/avatar.png'])
    sql(f"UPDATE profiles SET avatar_path=NULL WHERE id='{a}';")
    check('removing a profile photo removes it from every household avatar list',[x['path'] for x in paths(user=b)],[f'{b}/avatar.png'])
    sql(f"UPDATE households SET suspended=true WHERE id='{hid}';")
    sql('SELECT household_avatar_paths();',user=b,fail='Household suspended')
    sql('SELECT household_avatar_paths();',device=token,fail='Household suspended')
    sql(f"UPDATE households SET suspended=false WHERE id='{hid}';UPDATE devices SET revoked=true WHERE household_id='{hid}';")
    sql('SELECT household_avatar_paths();',device=token,fail='Device revoked')
    check('avatar bucket remains private',sql("SELECT NOT public FROM storage.buckets WHERE id='personal-avatars';"),'t')


if __name__ == '__main__':
    if sys.argv[1:] not in ([], ['--empty-install']):
        raise SystemExit('Usage: test-database.py [--empty-install]')
    try:
        run()
    finally:
        execute(DOCKER + ['rm', '-f', NAME])
