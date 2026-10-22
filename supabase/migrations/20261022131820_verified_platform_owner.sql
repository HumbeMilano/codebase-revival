BEGIN;

-- The service owner supplies this private allowlist through an administrative
-- connection. A matching address receives its role only after Supabase Auth
-- verifies the email. User metadata and public RPCs cannot change the list.
CREATE TABLE homehub_private.platform_owners (
  email text PRIMARY KEY CHECK (email = lower(btrim(email)))
);
ALTER TABLE homehub_private.platform_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE homehub_private.platform_owners FROM PUBLIC, anon, authenticated;

CREATE FUNCTION homehub_private.provision_verified_platform_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM homehub_private.platform_owners o WHERE o.email = lower(NEW.email)
  ) THEN
    INSERT INTO public.user_roles(user_id, role)
    VALUES (NEW.id, 'platform_admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION homehub_private.provision_verified_platform_owner() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER provision_verified_platform_owner
AFTER INSERT OR UPDATE OF email, email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION homehub_private.provision_verified_platform_owner();

COMMIT;
