-- Rename enum labels in place: profile IDs, relationships and defaults survive.
ALTER TYPE iam.user_role RENAME VALUE 'alumno' TO 'estudiante';
ALTER TYPE iam.user_role RENAME VALUE 'docente' TO 'mentor';
ALTER TYPE iam.user_role ADD VALUE 'soporte';

-- All domain access goes through the API's service-role client. Auth endpoints
-- remain available; clients must not bypass the API's application-role checks.
REVOKE ALL ON SCHEMA iam, courses, video FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA iam, courses, video FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA iam, courses, video FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA iam, courses, video FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA iam, courses, video TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA iam, courses, video TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA iam, courses, video TO service_role;
