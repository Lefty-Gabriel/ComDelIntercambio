# Administration and access

The NestJS AdministrationModule owns administrative curriculum and access writes. Existing auth, users, courses, video and notifications modules retain their responsibilities. Every /admin route checks the authenticated administrator role; service methods repeat this boundary.

## Current operations

- Create users with mentor/student roles through /users; edit roles through the existing protected route. New auth accounts are removed if their profile cannot be initialized. Administrators cannot remove their own administrative role.
- Create/edit courses with actual assigned mentors, categories and levels.
- Create/edit ordered modules and lessons. Draft lessons are hidden; publication makes the real content available to eligible students and the notification feed. Videos must be ready and belong to the same course.
- Register complementary links or upload private resource files (up to 25 MB). Uploaded files start unpublished; administrators explicitly publish or withdraw them.
- Schedule Zoom classes and publish manually uploaded recordings through the existing video module.
- Assign, edit, suspend or time-limit student course access without any purchasing/payment component.

## Access modes

| Mode | Lessons and files | Recordings | Zoom classes |
| --- | --- | --- | --- |
| full | yes | yes | yes |
| content | yes | yes | no |
| live | no | no | yes |

The service-only courses.active_enrollments view enforces status and expiry using the database clock. Student dashboards, lesson actions, resource links, video lists/playback, classes and notifications all use this scope. Existing enrollments retain full access with no expiry. Repeating enrollment preserves an existing active grant; suspended/expired grants require explicit administrative review.

## Future additions

Existing forums, assignments and grades module boundaries are reserved for community and evaluations. A separate mentoring module can reference the same user/course IDs and access service. courses.courses.extensions is reserved metadata (empty by default); it does not activate unfinished features or grant extra permissions. Future features must add their own DTOs, migrations, role checks and tests.

## Verification

Run npm run test --workspace api and npm run build --workspace api. The separate React frontend has its own tests/build. For end-to-end checks against the configured Supabase, run node --env-file=.env scripts/verify-administration.mjs --allow-test-data after building. This command creates isolated users/courses/files, exercises actual HTTP authentication and Storage, and removes only the IDs it created. It never changes existing users or student enrollments.
