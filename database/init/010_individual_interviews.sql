-- Entretiens individuels : données distinctes du reste du portail.
-- Cette migration est idempotente et peut être appliquée sur une base déjà en service.

CREATE TABLE IF NOT EXISTS portal_interview_profiles (
  member_id uuid PRIMARY KEY REFERENCES portal_users(id) ON DELETE CASCADE,
  last_role text NOT NULL,
  last_grade text NOT NULL,
  baseline_at timestamptz NOT NULL DEFAULT now(),
  last_movement_at timestamptz NOT NULL DEFAULT now(),
  last_completed_at timestamptz,
  last_seen_user_update_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal_interview_requirements (
  id uuid PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('test_end', 'senior_entry', 'monthly')),
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'to_book' CHECK (status IN ('to_book', 'booked', 'completed')),
  completion_note text,
  completed_at timestamptz,
  completed_by uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal_interview_slots (
  id uuid PRIMARY KEY,
  interviewer_id uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at = starts_at + interval '15 minutes')
);

CREATE TABLE IF NOT EXISTS portal_interview_bookings (
  id uuid PRIMARY KEY,
  requirement_id uuid NOT NULL UNIQUE REFERENCES portal_interview_requirements(id) ON DELETE CASCADE,
  slot_id uuid NOT NULL UNIQUE REFERENCES portal_interview_slots(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  interviewer_id uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  booked_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES portal_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS portal_interview_requirements_member_status_idx
  ON portal_interview_requirements (member_id, status, due_date);
CREATE INDEX IF NOT EXISTS portal_interview_slots_status_starts_idx
  ON portal_interview_slots (status, starts_at);
CREATE UNIQUE INDEX IF NOT EXISTS portal_interview_slots_interviewer_starts_idx
  ON portal_interview_slots (interviewer_id, starts_at);
CREATE INDEX IF NOT EXISTS portal_interview_bookings_member_idx
  ON portal_interview_bookings (member_id, booked_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON portal_interview_profiles TO portal_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON portal_interview_requirements TO portal_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON portal_interview_slots TO portal_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON portal_interview_bookings TO portal_api;
