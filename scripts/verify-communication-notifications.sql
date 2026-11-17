BEGIN;
DO $$
DECLARE s uuid; m uuid; t uuid; r uuid; msg uuid;
BEGIN
SELECT a.student_id,a.mentor_id INTO s,m FROM iam.student_mentors a JOIN iam.profiles p ON p.id=a.student_id AND p.role::text='estudiante' JOIN iam.profiles q ON q.id=a.mentor_id AND q.role::text='mentor' LIMIT 1;
IF s IS NULL THEN RAISE EXCEPTION 'No valid assignment to verify'; END IF;
INSERT INTO courses.forum_threads(author_id,title,category,content) VALUES(s,'Verification','Finanzas','Verification') RETURNING id INTO t;
INSERT INTO courses.forum_replies(thread_id,author_id,content) VALUES(t,m,'Verification') RETURNING id INTO r;
IF NOT EXISTS(SELECT 1 FROM courses.notification_feed(s) WHERE id='forum:'||t::text||':'||r::text) THEN RAISE EXCEPTION 'Student forum notification missing'; END IF;
INSERT INTO courses.forum_replies(thread_id,author_id,content,created_at) VALUES(t,s,'Verification',clock_timestamp()) RETURNING id INTO r;
IF NOT EXISTS(SELECT 1 FROM courses.notification_feed(m) WHERE id='forum:'||t::text||':'||r::text) THEN RAISE EXCEPTION 'Mentor forum notification missing'; END IF;
INSERT INTO courses.mentor_messages(student_id,mentor_id,sender_id,body) VALUES(s,m,m,'Verification') RETURNING id INTO msg;
IF NOT EXISTS(SELECT 1 FROM courses.notification_feed(s) WHERE id='chat:'||s::text||':'||m::text||':'||msg::text) THEN RAISE EXCEPTION 'Student private notification missing'; END IF;
IF EXISTS(SELECT 1 FROM courses.notification_feed(m) WHERE id='chat:'||s::text||':'||m::text||':'||msg::text) THEN RAISE EXCEPTION 'Sender received own notification'; END IF;
INSERT INTO courses.mentor_messages(student_id,mentor_id,sender_id,body) VALUES(s,m,s,'Verification') RETURNING id INTO msg;
IF NOT EXISTS(SELECT 1 FROM courses.notification_feed(m) WHERE id='chat:'||s::text||':'||m::text||':'||msg::text) THEN RAISE EXCEPTION 'Mentor private notification missing'; END IF;
IF EXISTS(SELECT 1 FROM iam.profiles p CROSS JOIN LATERAL courses.notification_feed(p.id) f WHERE p.role::text IN ('admin','soporte') AND f.id='chat:'||s::text||':'||m::text||':'||msg::text) THEN RAISE EXCEPTION 'Private notification leaked'; END IF;
IF EXISTS(SELECT 1 FROM iam.profiles staff WHERE staff.role::text IN ('admin','mentor') AND staff.id<>s AND NOT EXISTS(SELECT 1 FROM courses.notification_feed(staff.id) f WHERE f.id='forum:'||t::text||':created')) THEN RAISE EXCEPTION 'Staff debate notification missing'; END IF;
IF EXISTS(SELECT 1 FROM iam.profiles staff WHERE staff.role::text IN ('admin','mentor') AND staff.id<>s AND NOT EXISTS(SELECT 1 FROM courses.notification_feed(staff.id) f WHERE f.id='forum:'||t::text||':'||r::text)) THEN RAISE EXCEPTION 'Staff reply notification missing'; END IF;
IF EXISTS(SELECT 1 FROM courses.notification_feed(m) WHERE type IN ('chat','forum') AND title LIKE '%?%') THEN RAISE EXCEPTION 'Broken notification accent'; END IF;
END $$;
ROLLBACK;
SELECT 'Bidirectional forum/chat notifications verified; fixtures rolled back' AS result;