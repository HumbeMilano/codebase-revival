
CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.households TO anon, authenticated;
GRANT ALL ON public.households TO service_role;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open households" ON public.households FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  pin_hash text NOT NULL,
  UNIQUE (household_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.members TO anon, authenticated;
GRANT ALL ON public.members TO service_role;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open members" ON public.members FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.chores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  title text NOT NULL,
  member_key text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  when_label text NOT NULL DEFAULT 'Hoy',
  position int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chores TO anon, authenticated;
GRANT ALL ON public.chores TO service_role;
ALTER TABLE public.chores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open chores" ON public.chores FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.shopping_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_items TO anon, authenticated;
GRANT ALL ON public.shopping_items TO service_role;
ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open shopping" ON public.shopping_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  title text NOT NULL,
  date date NOT NULL,
  time text NOT NULL DEFAULT '',
  member_key text NOT NULL,
  note text NOT NULL DEFAULT ''
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO anon, authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open events" ON public.events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  member_key text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO anon, authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open notes" ON public.notes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL,
  base numeric NOT NULL DEFAULT 0,
  due_day int NOT NULL DEFAULT 1,
  auto_pay boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills TO anon, authenticated;
GRANT ALL ON public.bills TO service_role;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open bills" ON public.bills FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.bill_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  person_key text NOT NULL,
  type text NOT NULL DEFAULT 'equal',
  value numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_splits TO anon, authenticated;
GRANT ALL ON public.bill_splits TO service_role;
ALTER TABLE public.bill_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open bill_splits" ON public.bill_splits FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.bill_overrides (
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  month text NOT NULL,
  amount numeric,
  status text,
  hidden boolean NOT NULL DEFAULT false,
  PRIMARY KEY (bill_id, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_overrides TO anon, authenticated;
GRANT ALL ON public.bill_overrides TO service_role;
ALTER TABLE public.bill_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open bill_overrides" ON public.bill_overrides FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  person_key text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  month text NOT NULL,
  note text NOT NULL DEFAULT ''
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contributions TO anon, authenticated;
GRANT ALL ON public.contributions TO service_role;
ALTER TABLE public.contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demo open contributions" ON public.contributions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.chores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bills;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bill_splits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bill_overrides;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contributions;

INSERT INTO public.households (id, name) VALUES ('11111111-1111-1111-1111-111111111111', 'Familia Pérez');

INSERT INTO public.members (household_id, key, name, role, pin_hash) VALUES
  ('11111111-1111-1111-1111-111111111111', 'papa', 'Papá', 'admin', '0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c'),
  ('11111111-1111-1111-1111-111111111111', 'mama', 'Mamá', 'admin', 'edee29f882543b956620b26d0ee0e7a950399b1c4222f5de05e06425b4c995e9'),
  ('11111111-1111-1111-1111-111111111111', 'lucas', 'Lucas', 'member', '318aee3fed8c9d040d35a7fc1fa776fb31303833aa2de885354ddf3d44d8fb69'),
  ('11111111-1111-1111-1111-111111111111', 'sofia', 'Sofía', 'member', '79f06f8fde333461739f220090a23cb2a79f6d714bee100d0e4b4af249294619');

INSERT INTO public.chores (id, household_id, title, member_key, done, when_label, position) VALUES
  ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Sacar la basura', 'lucas', false, 'Hoy', 0),
  ('c2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Poner el lavaplatos', 'sofia', true, 'Hoy', 1),
  ('c3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Regar las plantas', 'mama', false, 'Hoy', 2),
  ('c4444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Aspirar la sala', 'papa', false, 'Mañana', 3),
  ('c5555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'Ordenar el cuarto', 'lucas', false, 'Mañana', 4);

INSERT INTO public.shopping_items (id, household_id, name, done, position) VALUES
  ('51111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Tomates (1 kg)', false, 0),
  ('52222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Plátanos', false, 1),
  ('53333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Leche entera', true, 2),
  ('54444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Queso rallado', false, 3),
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'Arroz', false, 4),
  ('56666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'Detergente de platos', false, 5);

INSERT INTO public.events (id, household_id, title, date, time, member_key, note) VALUES
  ('e1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Revisión del coche', '2026-10-22', '10:00', 'papa', ''),
  ('e2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Cumpleaños de la abuela', '2026-10-23', '', 'mama', ''),
  ('e3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Partido de fútbol', '2026-10-24', '09:30', 'lucas', '');

INSERT INTO public.bills (id, household_id, name, category, base, due_day, auto_pay, position) VALUES
  ('b1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Renta', 'Vivienda', 2168.59, 2, true, 0),
  ('b2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'T-Mobile', 'Teléfono', 170, 12, true, 1),
  ('b3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'FPL', 'Utilidades', 95, 14, true, 2),
  ('b4444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'State Farm', 'Auto', 119.22, 15, true, 3),
  ('b5555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'YouTube Premium', 'Suscripciones', 30.54, 16, true, 4),
  ('b6666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'Amazon', 'Suscripciones', 7.08, 23, true, 5),
  ('b7777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', 'Quantum Fiber', 'Internet', 75.32, 27, true, 6),
  ('b8888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111', 'Toyota', 'Auto', 489.40, 29, false, 7);

INSERT INTO public.bill_splits (bill_id, person_key, type, value) VALUES
  ('b1111111-1111-1111-1111-111111111111', 'papa', 'equal', 0),
  ('b1111111-1111-1111-1111-111111111111', 'mama', 'equal', 0),
  ('b2222222-2222-2222-2222-222222222222', 'papa', 'equal', 0),
  ('b2222222-2222-2222-2222-222222222222', 'mama', 'equal', 0),
  ('b2222222-2222-2222-2222-222222222222', 'lucas', 'equal', 0),
  ('b3333333-3333-3333-3333-333333333333', 'papa', 'equal', 0),
  ('b3333333-3333-3333-3333-333333333333', 'mama', 'equal', 0),
  ('b4444444-4444-4444-4444-444444444444', 'papa', 'equal', 0),
  ('b4444444-4444-4444-4444-444444444444', 'mama', 'equal', 0),
  ('b5555555-5555-5555-5555-555555555555', 'papa', 'equal', 0),
  ('b5555555-5555-5555-5555-555555555555', 'mama', 'equal', 0),
  ('b6666666-6666-6666-6666-666666666666', 'papa', 'equal', 0),
  ('b6666666-6666-6666-6666-666666666666', 'mama', 'equal', 0),
  ('b7777777-7777-7777-7777-777777777777', 'papa', 'equal', 0),
  ('b7777777-7777-7777-7777-777777777777', 'mama', 'equal', 0),
  ('b8888888-8888-8888-8888-888888888888', 'papa', 'percent', 60),
  ('b8888888-8888-8888-8888-888888888888', 'mama', 'percent', 40);

INSERT INTO public.bill_overrides (bill_id, month, amount) VALUES
  ('b3333333-3333-3333-3333-333333333333', '2026-10', 102.33);

INSERT INTO public.contributions (id, household_id, person_key, amount, month, note) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'papa', 765.12, '2026-10', 'Quincena 1'),
  ('a2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'mama', 800, '2026-10', 'Quincena 1'),
  ('a3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'lucas', 56.67, '2026-10', 'Teléfono');
