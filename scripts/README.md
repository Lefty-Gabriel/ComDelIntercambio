# Create student and support test logins

Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the root `.env`, then run `npm run seed:test-users` from the repository root. This explicitly creates confirmed `estudiante.pruebas@traction.test` and `soporte.pruebas@traction.test` accounts in the configured Supabase project.

Read their generated passwords from the gitignored `.env.seed.local` JSON file. Keep that file private and retain it for repeat runs. The seed verifies existing owned accounts without resetting passwords or changing their roles. An unrelated email collision, changed role or invalid saved password fails safely. Never remove the credentials file to retry a failed run: doing so loses the ownership marker and passwords.

The accounts have no course enrollments. Their dashboard can be empty. The seed sends no confirmation email and never runs automatically at API startup. A terminated process may leave `.env.seed.local.lock`; remove that lock only after verifying no seed process is running.
