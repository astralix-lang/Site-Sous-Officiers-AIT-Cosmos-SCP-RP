-- Les SO proposent leurs propres plages, puis un Référent SO confirme
-- le rendez-vous à l'intérieur de l'une de ces disponibilités.

CREATE TABLE IF NOT EXISTS portal_interview_availabilities (
  id uuid PRIMARY KEY,
  requirement_id uuid NOT NULL REFERENCES portal_interview_requirements(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'scheduled', 'withdrawn')),
  scheduled_slot_id uuid REFERENCES portal_interview_slots(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS portal_interview_availabilities_requirement_status_idx
  ON portal_interview_availabilities (requirement_id, status, starts_at);
CREATE INDEX IF NOT EXISTS portal_interview_availabilities_member_idx
  ON portal_interview_availabilities (member_id, starts_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON portal_interview_availabilities TO portal_api;

NOTIFY pgrst, 'reload schema';
