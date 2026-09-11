BEGIN;

CREATE TABLE IF NOT EXISTS portal_interview_tracking (
  user_id uuid PRIMARY KEY REFERENCES portal_users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  movement_at timestamptz NOT NULL DEFAULT now(),
  senior_entry_at timestamptz,
  test_end_date date,
  test_cycle uuid
);
CREATE TABLE IF NOT EXISTS portal_interview_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interviewer_id uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  cancelled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (interviewer_id, starts_at),
  CHECK (extract(minute FROM starts_at AT TIME ZONE 'Europe/Paris')::int % 15 = 0
    AND extract(second FROM starts_at) = 0)
);
CREATE TABLE IF NOT EXISTS portal_interview_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES portal_interview_slots(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('test_end','senior_entry','monthly')),
  cycle_key text NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','completed','cancelled','no_show')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS interview_slot_booked ON portal_interview_bookings(slot_id) WHERE status = 'booked';
CREATE UNIQUE INDEX IF NOT EXISTS interview_member_booked ON portal_interview_bookings(member_id) WHERE status = 'booked';
CREATE INDEX IF NOT EXISTS interview_member_history ON portal_interview_bookings(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS interview_upcoming_slots ON portal_interview_slots(starts_at);

-- Existing members start a new monthly cycle at launch, not at an invented promotion date.
INSERT INTO portal_interview_tracking(user_id) SELECT id FROM portal_users
  WHERE role IN ('officer','senior') AND approval_status = 'approved'
  ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION portal_track_interview_movement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role IN ('officer','senior') AND NEW.approval_status = 'approved' AND NOT NEW.blocked THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO portal_interview_tracking(user_id, senior_entry_at)
      VALUES (NEW.id, CASE WHEN NEW.role = 'senior' THEN now() END) ON CONFLICT DO NOTHING;
    ELSIF OLD.role IS DISTINCT FROM NEW.role OR OLD.grade IS DISTINCT FROM NEW.grade
      OR OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
      INSERT INTO portal_interview_tracking(user_id, movement_at, senior_entry_at)
      VALUES (NEW.id, now(), CASE WHEN NEW.role = 'senior' THEN now() END)
      ON CONFLICT(user_id) DO UPDATE SET movement_at = now(),
        senior_entry_at = CASE WHEN NEW.role = 'senior' AND (OLD.role <> 'senior' OR OLD.approval_status <> 'approved')
          THEN now() ELSE portal_interview_tracking.senior_entry_at END;
      IF NEW.role = 'senior' AND (OLD.role <> 'senior' OR OLD.approval_status <> 'approved') THEN
        UPDATE portal_interview_bookings SET reason = 'senior_entry', cycle_key = 'senior:' || now()::text,
          due_date = (now() AT TIME ZONE 'Europe/Paris')::date, updated_at = now()
          WHERE member_id = NEW.id AND status = 'booked';
      ELSE
        -- A change of unit or grade restarts the monthly cycle; an old booking
        -- must not look like it fulfils the new follow-up requirement.
        UPDATE portal_interview_bookings SET status = 'cancelled', updated_at = now()
          WHERE member_id = NEW.id AND status = 'booked';
      END IF;
    END IF;
  ELSE
    UPDATE portal_interview_bookings SET status = 'cancelled', updated_at = now()
      WHERE member_id = NEW.id AND status = 'booked';
  END IF;
  IF NEW.role NOT IN ('admin','management','referent') OR NEW.blocked OR NEW.approval_status <> 'approved' THEN
    UPDATE portal_interview_bookings SET status = 'cancelled', updated_at = now()
      WHERE status = 'booked' AND slot_id IN (SELECT id FROM portal_interview_slots WHERE interviewer_id = NEW.id);
    UPDATE portal_interview_slots SET cancelled = true WHERE interviewer_id = NEW.id AND starts_at > now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS portal_interview_movement ON portal_users;
CREATE TRIGGER portal_interview_movement AFTER INSERT OR UPDATE OF role, grade, approval_status, blocked
  ON portal_users FOR EACH ROW EXECUTE FUNCTION portal_track_interview_movement();

CREATE OR REPLACE FUNCTION portal_interview_due(p_member uuid) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE u portal_users; t portal_interview_tracking; a jsonb; cycle text; due date; reason text; base timestamptz;
BEGIN
  SELECT * INTO u FROM portal_users WHERE id = p_member AND role IN ('officer','senior') AND NOT blocked AND approval_status = 'approved';
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO t FROM portal_interview_tracking WHERE user_id = p_member;
  IF u.role = 'senior' AND t.senior_entry_at IS NOT NULL THEN
    cycle := 'senior:' || t.senior_entry_at::text; reason := 'senior_entry';
    due := (t.senior_entry_at AT TIME ZONE 'Europe/Paris')::date;
  ELSIF u.role = 'officer' THEN
    IF t.test_end_date IS NOT NULL THEN
      cycle := 'test:' || t.test_cycle::text; reason := 'test_end'; due := t.test_end_date;
    ELSE
      SELECT item INTO a FROM portal_notifications n,
        LATERAL jsonb_array_elements(n.body::jsonb) item
        WHERE n.target = '__portal_sergeant_assignments' AND item->>'sergeantId' = p_member::text
        AND item->>'dueDate' ~ '^\d{4}-\d{2}-\d{2}$'
        ORDER BY item->>'assignedAt' DESC NULLS LAST LIMIT 1;
      IF a IS NOT NULL THEN
        cycle := 'test:' || (a->>'id') || ':' || coalesce(a->>'assignedAt','');
        reason := 'test_end'; due := (a->>'dueDate')::date;
      END IF;
    END IF;
  END IF;
  IF cycle IS NULL OR EXISTS (SELECT 1 FROM portal_interview_bookings WHERE member_id = p_member AND cycle_key = cycle AND status = 'completed') THEN
    SELECT greatest(coalesce(t.movement_at, u.created_at), max(completed_at)) INTO base
      FROM portal_interview_bookings WHERE member_id = p_member AND status = 'completed';
    cycle := 'monthly:' || base::text; reason := 'monthly';
    due := ((base AT TIME ZONE 'Europe/Paris') + interval '1 month')::date;
  END IF;
  RETURN jsonb_build_object('reason',reason,'dueDate',due,'cycleKey',cycle,
    'daysUntil',due - (now() AT TIME ZONE 'Europe/Paris')::date);
END $$;

-- All mutations share a short transaction lock: booking, cancellation and completion are atomic.
-- The actor is supplied only by the authenticated server route, never by browser payloads.
CREATE OR REPLACE FUNCTION portal_interview_action(p_actor uuid, p_action text, p_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor portal_users; is_manager boolean; s portal_interview_slots; b portal_interview_bookings;
  d jsonb; first_slot timestamptz; last_slot timestamptz; moment timestamptz; count_slots int := 0;
  target uuid; result_id uuid; new_status text; note text; notify_user uuid; label text;
BEGIN
  PERFORM pg_advisory_xact_lock(184916, 15);
  SELECT * INTO actor FROM portal_users WHERE id = p_actor AND NOT blocked AND approval_status = 'approved';
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Compte non autorisé.','status',403); END IF;
  is_manager := actor.role IN ('admin','management','referent');
  IF p_action IN ('add_slots','cancel_slot','complete','no_show','set_test_end') AND NOT is_manager THEN
    RETURN jsonb_build_object('error','Cette action est réservée aux responsables.','status',403);
  END IF;
  IF p_action = 'add_slots' THEN
    IF NOT (coalesce(p_data->>'date','') ~ '^\d{4}-\d{2}-\d{2}$'
      AND coalesce(p_data->>'from','') ~ '^([01]\d|2[0-3]):(00|15|30|45)$'
      AND coalesce(p_data->>'to','') ~ '^([01]\d|2[0-3]):(00|15|30|45)$') THEN
      RETURN jsonb_build_object('error','Choisissez une date et des horaires par quart d’heure.','status',400);
    END IF;
    first_slot := ((p_data->>'date') || ' ' || (p_data->>'from'))::timestamp AT TIME ZONE 'Europe/Paris';
    last_slot := ((p_data->>'date') || ' ' || (p_data->>'to'))::timestamp AT TIME ZONE 'Europe/Paris';
    IF first_slot <= now() OR last_slot <= first_slot OR last_slot - first_slot > interval '8 hours' OR first_slot > now() + interval '1 year' THEN
      RETURN jsonb_build_object('error','Choisissez une plage future de 15 minutes à 8 heures, dans l’année à venir.','status',400);
    END IF;
    FOR moment IN SELECT generate_series(first_slot,last_slot - interval '15 minutes',interval '15 minutes') LOOP
      INSERT INTO portal_interview_slots(interviewer_id, starts_at) VALUES (p_actor,moment)
        ON CONFLICT(interviewer_id,starts_at) DO UPDATE SET cancelled = false
        WHERE portal_interview_slots.cancelled;
      IF FOUND THEN count_slots := count_slots + 1; END IF;
    END LOOP;
    label := count_slots || ' créneau(x) publié(s).';
  ELSIF p_action = 'book' THEN
    d := portal_interview_due(p_actor);
    IF d IS NULL THEN RETURN jsonb_build_object('error','Les rendez-vous sont destinés aux SO et SO Sup actifs.','status',403); END IF;
    SELECT * INTO s FROM portal_interview_slots WHERE id = (p_data->>'slotId')::uuid AND NOT cancelled AND starts_at > now();
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM portal_users WHERE id = s.interviewer_id AND role IN ('admin','management','referent') AND NOT blocked AND approval_status = 'approved') THEN
      RETURN jsonb_build_object('error','Ce créneau n’est plus disponible.','status',409);
    END IF;
    IF d->>'reason' = 'test_end' AND (s.starts_at AT TIME ZONE 'Europe/Paris')::date < (d->>'dueDate')::date THEN
      RETURN jsonb_build_object('error','Cet entretien doit avoir lieu à partir de la fin de votre test.','status',400);
    END IF;
    IF EXISTS (SELECT 1 FROM portal_interview_bookings WHERE status = 'booked' AND (slot_id = s.id OR member_id = p_actor)) THEN
      RETURN jsonb_build_object('error','Créneau déjà réservé ou rendez-vous déjà en cours. Actualisez le suivi.','status',409);
    END IF;
    INSERT INTO portal_interview_bookings(slot_id,member_id,reason,cycle_key,due_date)
      VALUES(s.id,p_actor,d->>'reason',d->>'cycleKey',(d->>'dueDate')::date) RETURNING id INTO result_id;
    notify_user := s.interviewer_id; label := concat_ws(' ',actor.grade,actor.first_name,actor.last_name) || ' : rendez-vous réservé le ' || to_char(s.starts_at AT TIME ZONE 'Europe/Paris','DD/MM/YYYY à HH24:MI') || ' (heure de Paris).';
  ELSIF p_action = 'cancel_slot' THEN
    SELECT * INTO s FROM portal_interview_slots WHERE id = (p_data->>'slotId')::uuid;
    IF NOT FOUND THEN RETURN jsonb_build_object('error','Créneau introuvable.','status',404); END IF;
    IF s.interviewer_id <> p_actor AND actor.role NOT IN ('admin','management') THEN
      RETURN jsonb_build_object('error','Vous ne pouvez retirer que vos propres disponibilités.','status',403);
    END IF;
    UPDATE portal_interview_slots SET cancelled = true WHERE id = s.id;
    UPDATE portal_interview_bookings SET status = 'cancelled', updated_at = now()
      WHERE slot_id = s.id AND status = 'booked' RETURNING member_id INTO notify_user;
    label := 'Créneau retiré. Le membre concerné peut reprendre rendez-vous.';
  ELSIF p_action IN ('cancel','complete','no_show') THEN
    SELECT * INTO b FROM portal_interview_bookings WHERE id = (p_data->>'bookingId')::uuid AND status = 'booked';
    IF NOT FOUND THEN RETURN jsonb_build_object('error','Ce rendez-vous a déjà été traité.','status',409); END IF;
    IF NOT is_manager AND b.member_id <> p_actor THEN RETURN jsonb_build_object('error','Accès refusé.','status',403); END IF;
    SELECT * INTO s FROM portal_interview_slots WHERE id = b.slot_id;
    IF p_action <> 'cancel' AND s.starts_at > now() THEN RETURN jsonb_build_object('error','Attendez le début du rendez-vous pour le clôturer.','status',400); END IF;
    new_status := CASE p_action WHEN 'complete' THEN 'completed' WHEN 'no_show' THEN 'no_show' ELSE 'cancelled' END;
    note := left(trim(coalesce(p_data->>'notes','')),3000);
    UPDATE portal_interview_bookings SET status = new_status, notes = CASE WHEN is_manager THEN note ELSE notes END,
      completed_at = CASE WHEN new_status = 'completed' THEN now() END, updated_at = now() WHERE id = b.id;
    notify_user := CASE WHEN p_actor = b.member_id THEN s.interviewer_id ELSE b.member_id END;
    label := CASE new_status WHEN 'completed' THEN 'Entretien réalisé : le suivi mensuel est actualisé.' WHEN 'no_show' THEN 'Rendez-vous manqué : un nouveau rendez-vous est nécessaire.' ELSE 'Rendez-vous annulé : le créneau est à nouveau disponible.' END;
  ELSIF p_action = 'set_test_end' THEN
    target := (p_data->>'memberId')::uuid;
    IF NOT EXISTS (SELECT 1 FROM portal_users WHERE id = target AND role = 'officer' AND grade = 'Sergent' AND approval_status = 'approved' AND NOT blocked) THEN
      RETURN jsonb_build_object('error','Choisissez un Sergent actif.','status',400);
    END IF;
    IF NOT coalesce(p_data->>'date','') ~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN jsonb_build_object('error','Date invalide.','status',400); END IF;
    INSERT INTO portal_interview_tracking(user_id, test_end_date, test_cycle)
      VALUES (target, (p_data->>'date')::date, gen_random_uuid())
      ON CONFLICT(user_id) DO UPDATE SET test_end_date = EXCLUDED.test_end_date, test_cycle = EXCLUDED.test_cycle;
    -- A changed test date may invalidate an existing booking: preserve its history and free the slot.
    UPDATE portal_interview_bookings SET status = 'cancelled', updated_at = now() WHERE member_id = target AND status = 'booked';
    notify_user := target; label := 'Fin de test enregistrée. Le membre doit réserver son entretien.';
  ELSE RETURN jsonb_build_object('error','Action inconnue.','status',400);
  END IF;
  INSERT INTO portal_audit_logs(id,actor_id,actor_name,actor_role,category,action,details)
    VALUES(gen_random_uuid(),p_actor,concat_ws(' ',actor.first_name,actor.last_name),actor.role,'interview','Entretiens : ' || p_action,label);
  IF notify_user IS NOT NULL THEN
    INSERT INTO portal_notifications(id,recipient_ids,kind,title,body,target)
      VALUES(gen_random_uuid(),jsonb_build_array(notify_user),'info','Entretien individuel',label,
        CASE WHEN p_action = 'book' OR (p_action = 'cancel' AND b.member_id = p_actor) THEN 'interview_management' ELSE 'interviews' END);
  END IF;
  RETURN jsonb_build_object('ok',true,'message',label,'id',result_id);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
  RETURN jsonb_build_object('error','Identifiant, date ou horaire invalide.','status',400);
WHEN unique_violation THEN RETURN jsonb_build_object('error','Ce créneau vient d’être réservé. Choisissez-en un autre.','status',409);
END $$;

CREATE OR REPLACE FUNCTION portal_interview_snapshot(p_actor uuid) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE is_manager boolean; members jsonb; slots jsonb; bookings jsonb;
BEGIN
  SELECT role IN ('admin','management','referent') INTO is_manager FROM portal_users
    WHERE id = p_actor AND NOT blocked AND approval_status = 'approved';
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Accès refusé.','status',403); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',concat_ws(' ',u.first_name,u.last_name),'grade',u.grade,'role',u.role,
    'due',portal_interview_due(u.id)) ORDER BY u.last_name,u.first_name),'[]') INTO members
    FROM portal_users u WHERE u.role IN ('officer','senior') AND NOT u.blocked AND u.approval_status = 'approved' AND (is_manager OR u.id = p_actor);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'interviewerId',s.interviewer_id,'interviewer',concat_ws(' ',u.grade,u.first_name,u.last_name),
    'startsAt',s.starts_at,'booked',EXISTS(SELECT 1 FROM portal_interview_bookings b WHERE b.slot_id = s.id AND b.status = 'booked')) ORDER BY s.starts_at),'[]') INTO slots
    FROM portal_interview_slots s JOIN portal_users u ON u.id = s.interviewer_id
    WHERE NOT s.cancelled AND s.starts_at > now() AND NOT u.blocked AND u.approval_status = 'approved' AND u.role IN ('admin','management','referent');
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'memberId',b.member_id,'member',concat_ws(' ',m.grade,m.first_name,m.last_name),
    'slotId',s.id,'interviewer',concat_ws(' ',u.grade,u.first_name,u.last_name),'startsAt',s.starts_at,'reason',b.reason,
    'status',b.status,'notes',b.notes,'completedAt',b.completed_at,'createdAt',b.created_at) ORDER BY b.created_at DESC),'[]') INTO bookings
    FROM portal_interview_bookings b JOIN portal_interview_slots s ON s.id = b.slot_id
    JOIN portal_users u ON u.id = s.interviewer_id JOIN portal_users m ON m.id = b.member_id
    WHERE is_manager OR b.member_id = p_actor;
  RETURN jsonb_build_object('members',members,'slots',slots,'bookings',bookings,'isManager',is_manager,'serverNow',now());
END $$;

REVOKE ALL ON FUNCTION portal_interview_action(uuid,text,jsonb), portal_interview_snapshot(uuid), portal_interview_due(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_interview_action(uuid,text,jsonb), portal_interview_snapshot(uuid), portal_interview_due(uuid) TO portal_api;
GRANT SELECT,INSERT,UPDATE,DELETE ON portal_interview_tracking,portal_interview_slots,portal_interview_bookings TO portal_api;
NOTIFY pgrst, 'reload schema';
COMMIT;
