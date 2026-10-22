-- Run after reconciling legacy records. Validation never deletes or rewrites rows.
DO $$
DECLARE constraint_record record;
BEGIN
  FOR constraint_record IN
    SELECT c.conrelid::regclass AS table_name,c.conname
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
    WHERE n.nspname='public' AND NOT c.convalidated
      AND c.conname=ANY(ARRAY['account_user_valid','chore_title_valid','shopping_name_valid','event_text_valid','note_text_valid','bill_text_valid','contribution_note_valid','invite_role_valid','member_role_valid','bills_amount_valid','bills_due_day_valid','contribution_amount_valid','contribution_month_valid','override_amount_valid','override_month_valid','override_status_valid','split_value_valid','chore_member_valid','event_member_valid','note_member_valid','contribution_member_valid','account_member_valid','split_household_valid','split_member_valid'])
  LOOP
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I',constraint_record.table_name,constraint_record.conname);
  END LOOP;
END $$;
