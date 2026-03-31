-- ╔══════════════════════════════════════════════════════════════╗
-- ║  POWERMATIX PORTAL — COMPLETE DATABASE SETUP                ║
-- ║  Run this ONE file in Supabase SQL Editor.                  ║
-- ║  It includes schema + RLS + seed data for all modules.      ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── EXTENSIONS ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════════════════════════
--  1. PROFILES  (auto-created on first Azure SSO login)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  full_name   TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'engineer'
              CHECK (role IN ('admin','manager','engineer')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  manager_id  UUID REFERENCES profiles(id),
  azure_oid   TEXT UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on first Azure SSO login
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name TEXT;
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'preferred_username',
    SPLIT_PART(NEW.email, '@', 1)
  );
  INSERT INTO profiles (id, email, full_name, role, is_active, azure_oid)
  VALUES (
    NEW.id, NEW.email, v_name, 'engineer', true,
    COALESCE(NEW.raw_user_meta_data->>'provider_id', NEW.raw_user_meta_data->>'sub')
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        azure_oid = COALESCE(profiles.azure_oid, EXCLUDED.azure_oid),
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ══════════════════════════════════════════════════════════════
--  2. ORG SETTINGS
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS org_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO org_settings (key, value) VALUES
  ('hrs_per_day',   '8'),
  ('days_per_week', '6'),
  ('portal_name',   'Powermatix Workforce Portal'),
  ('timezone',      'Asia/Karachi')
ON CONFLICT (key) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
--  3. TRACKER: PROJECTS
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tracker_projects (
  code       TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#8B949E',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO tracker_projects (code, label, color, is_active) VALUES
  ('FA',    'FortAugustus',     '#F4C542', true),
  ('A6',    'Askari (Dar)',      '#F4934A', true),
  ('MD',    'Middleton',         '#56CCF2', true),
  ('KB',    'Kamino BESS',       '#6FCF97', true),
  ('DS',    'Dar Saudi',         '#BB86FC', true),
  ('FT',    'Faraz Tendering',   '#F2994A', true),
  ('ST',    'Saqib Tendering',   '#9B51E0', true),
  ('WF',    'Wareham & Frome',   '#2F80ED', true),
  ('PR',    'Parco',             '#219653', true),
  ('FFC',   'FFCEL',             '#E056A0', true),
  ('LEAVE', 'On Leave',          '#EB5757', true)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label, color = EXCLUDED.color, is_active = EXCLUDED.is_active;

-- ══════════════════════════════════════════════════════════════
--  4. TRACKER: RESOURCES
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tracker_resources (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name       TEXT UNIQUE NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO tracker_resources (name, is_active, sort_order) VALUES
  ('Danival',         true,  1), ('Abdullah Sultan', true,  2),
  ('Shayan',          true,  3), ('Usama',           true,  4),
  ('Aish',            true,  5), ('Rafay',           true,  6),
  ('Asad',            true,  7), ('Sikander',        true,  8),
  ('Wasif',           true,  9), ('Umer Ahmed',      true, 10),
  ('Abrar',           true, 11), ('Ahmed',           true, 12),
  ('Mudassir',        true, 13), ('Saif',            true, 14),
  ('Tabish',          true, 15)
ON CONFLICT (name) DO UPDATE SET
  is_active = EXCLUDED.is_active, sort_order = EXCLUDED.sort_order;

-- ══════════════════════════════════════════════════════════════
--  5. TRACKER: ALLOCATIONS  (one row per week/resource/day)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tracker_allocations (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  week_monday   DATE NOT NULL,
  resource_name TEXT NOT NULL,
  day_index     INT  NOT NULL CHECK (day_index BETWEEN 0 AND 5),
  project_code  TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_monday, resource_name, day_index)
);

-- ══════════════════════════════════════════════════════════════
--  6. TRACKER: NOTES  (one row per week/resource)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tracker_notes (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  week_monday   DATE NOT NULL,
  resource_name TEXT NOT NULL,
  notes         TEXT NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_monday, resource_name)
);

-- ══════════════════════════════════════════════════════════════
--  7. ATTENDANCE
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS attendance (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  check_in          TIMESTAMPTZ,
  check_out         TIMESTAMPTZ,
  check_in_note     TEXT,
  check_out_note    TEXT,
  status            TEXT NOT NULL DEFAULT 'present'
                    CHECK (status IN ('present','absent','late','half_day','on_leave','pending')),
  is_correction     BOOLEAN NOT NULL DEFAULT false,
  correction_reason TEXT,
  approved_by       UUID REFERENCES profiles(id),
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

-- ══════════════════════════════════════════════════════════════
--  8. APPROVAL REQUESTS  (Phase 1 stub)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS approval_requests (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  entity_type      TEXT NOT NULL
                   CHECK (entity_type IN ('attendance_correction','allocation_edit','leave_request')),
  entity_id        UUID,
  requested_by     UUID NOT NULL REFERENCES profiles(id),
  level_1_approver UUID REFERENCES profiles(id),
  level_2_approver UUID REFERENCES profiles(id),
  current_level    INT NOT NULL DEFAULT 1,
  overall_status   TEXT NOT NULL DEFAULT 'pending'
                   CHECK (overall_status IN ('pending','approved','rejected','cancelled')),
  level_1_decision TEXT CHECK (level_1_decision IN ('approved','rejected')),
  level_1_remarks  TEXT,
  level_1_at       TIMESTAMPTZ,
  level_2_decision TEXT CHECK (level_2_decision IN ('approved','rejected')),
  level_2_remarks  TEXT,
  level_2_at       TIMESTAMPTZ,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);

-- ══════════════════════════════════════════════════════════════
--  9. AUDIT LOG
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID REFERENCES profiles(id),
  entity_type TEXT NOT NULL,
  entity_id   UUID,
  action      TEXT NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════
--  10. UPDATED_AT TRIGGERS
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','attendance',
    'tracker_allocations','tracker_notes'
  ]
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS set_updated_at ON %I;
      CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    ', t, t);
  END LOOP;
END;
$$;

-- ══════════════════════════════════════════════════════════════
--  11. ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════

-- Helper: get current user role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

-- Helper: is this user in my team?
CREATE OR REPLACE FUNCTION is_my_team_member(target UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = target AND manager_id = auth.uid())
$$;

-- ── PROFILES ──
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_read"        ON profiles;
DROP POLICY IF EXISTS "profiles_update_own"  ON profiles;
DROP POLICY IF EXISTS "profiles_admin_all"   ON profiles;
CREATE POLICY "profiles_read"       ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM profiles WHERE id = auth.uid()));
CREATE POLICY "profiles_admin_all"  ON profiles FOR ALL USING (current_user_role() = 'admin');

-- ── ORG SETTINGS ──
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_read"  ON org_settings;
DROP POLICY IF EXISTS "org_write" ON org_settings;
CREATE POLICY "org_read"  ON org_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "org_write" ON org_settings FOR ALL    USING (auth.uid() IS NOT NULL);

-- ── TRACKER PROJECTS ──
ALTER TABLE tracker_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tp_all" ON tracker_projects;
CREATE POLICY "tp_all" ON tracker_projects FOR ALL USING (auth.uid() IS NOT NULL);

-- ── TRACKER RESOURCES ──
ALTER TABLE tracker_resources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tr_all" ON tracker_resources;
CREATE POLICY "tr_all" ON tracker_resources FOR ALL USING (auth.uid() IS NOT NULL);

-- ── TRACKER ALLOCATIONS ──
ALTER TABLE tracker_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ta_all" ON tracker_allocations;
CREATE POLICY "ta_all" ON tracker_allocations FOR ALL USING (auth.uid() IS NOT NULL);

-- ── TRACKER NOTES ──
ALTER TABLE tracker_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tn_all" ON tracker_notes;
CREATE POLICY "tn_all" ON tracker_notes FOR ALL USING (auth.uid() IS NOT NULL);

-- ── ATTENDANCE ──
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "att_read"   ON attendance;
DROP POLICY IF EXISTS "att_insert" ON attendance;
DROP POLICY IF EXISTS "att_update" ON attendance;
-- Read: own rows + manager's team + admin
CREATE POLICY "att_read" ON attendance FOR SELECT USING (
  user_id = auth.uid()
  OR current_user_role() = 'admin'
  OR (current_user_role() = 'manager' AND is_my_team_member(user_id))
);
-- Insert: own record for today, or admin/manager anytime
CREATE POLICY "att_insert" ON attendance FOR INSERT WITH CHECK (
  (user_id = auth.uid() AND date = CURRENT_DATE)
  OR current_user_role() IN ('admin','manager')
);
-- Update: own today's record, or corrections, or admin/manager
CREATE POLICY "att_update" ON attendance FOR UPDATE USING (
  (user_id = auth.uid() AND date = CURRENT_DATE)
  OR (user_id = auth.uid() AND is_correction = true)
  OR current_user_role() IN ('admin','manager')
);

-- ── APPROVAL REQUESTS ──
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "apr_read"   ON approval_requests;
DROP POLICY IF EXISTS "apr_insert" ON approval_requests;
DROP POLICY IF EXISTS "apr_update" ON approval_requests;
CREATE POLICY "apr_read"   ON approval_requests FOR SELECT USING (
  requested_by = auth.uid()
  OR level_1_approver = auth.uid()
  OR level_2_approver = auth.uid()
  OR current_user_role() = 'admin'
);
CREATE POLICY "apr_insert" ON approval_requests FOR INSERT WITH CHECK (
  requested_by = auth.uid() OR current_user_role() = 'admin'
);
CREATE POLICY "apr_update" ON approval_requests FOR UPDATE USING (
  level_1_approver = auth.uid()
  OR level_2_approver = auth.uid()
  OR current_user_role() = 'admin'
);

-- ── AUDIT LOG ──
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aud_read"   ON audit_log;
DROP POLICY IF EXISTS "aud_insert" ON audit_log;
CREATE POLICY "aud_read"   ON audit_log FOR SELECT USING (user_id = auth.uid() OR current_user_role() = 'admin');
CREATE POLICY "aud_insert" ON audit_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ══════════════════════════════════════════════════════════════
--  12. USEFUL VIEWS
-- ══════════════════════════════════════════════════════════════

-- Today's team attendance at a glance
CREATE OR REPLACE VIEW todays_attendance AS
SELECT
  p.id, p.full_name, p.email, p.role,
  a.check_in, a.check_out, a.status,
  CASE
    WHEN a.check_out  IS NOT NULL THEN 'checked_out'
    WHEN a.check_in   IS NOT NULL THEN 'checked_in'
    ELSE 'not_checked_in'
  END AS current_status,
  ROUND(EXTRACT(EPOCH FROM (COALESCE(a.check_out, now()) - a.check_in)) / 3600.0, 2) AS hours_so_far
FROM profiles p
LEFT JOIN attendance a ON a.user_id = p.id AND a.date = CURRENT_DATE
WHERE p.is_active = true
ORDER BY p.full_name;

GRANT SELECT ON todays_attendance TO authenticated;

-- ══════════════════════════════════════════════════════════════
--  DONE — Database is fully set up.
--  Your portal will work as soon as this runs successfully.
--
--  After your first login, run:
--    UPDATE profiles SET role = 'admin'
--    WHERE email = 'your.email@powermatix.com';
-- ══════════════════════════════════════════════════════════════
