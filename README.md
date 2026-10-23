# Traction

Plataforma educativa modular. Los cursos se organizan por **modulos** con material
(videos, PDFs y foros). Cuatro roles: **admin**, **mentor**, **estudiante** y **soporte**.

## Roles y migracion

`admin` administra usuarios, roles y cursos. `mentor` accede al material y a las
inscripciones de sus cursos asignados. `estudiante` accede al material de los cursos
donde tiene una inscripcion activa. `soporte` puede autenticarse y consultar su
propio perfil (`/auth/me`); no tiene acceso academico ni administra usuarios.
El modulo de tickets todavia no existe. Los registros nuevos reciben `estudiante`;
solo un administrador puede cambiar roles.

Aplicar las migraciones en orden, incluyendo
`supabase/migrations/20261018140000_four_roles.sql`, antes de iniciar esta version
de la API. La migracion renombra los roles existentes sin recrear perfiles ni
relaciones. Coordinar la actualizacion con una ventana de mantenimiento: la API
anterior utiliza los nombres viejos. No requiere reiniciar ni borrar la base.

Los schemas `iam`, `courses` y `video` siguen expuestos para el cliente de servicio
de la API, pero se revoca el acceso directo de `anon` y `authenticated` a sus datos.
Todo cliente academico debe usar la API; Auth de Supabase permanece disponible.
Mantener la clave `service_role` exclusivamente en el servidor. La columna
`docente_id`, el campo `docenteId` y la ruta `/docente` conservan sus nombres.

Verificacion enfocada de permisos:

```bash
npm run test --workspace api -- src/modules/authorization.spec.ts src/modules/auth/auth-permissions.spec.ts
```

## Arquitectura

Monolito modular en NestJS. Cada modulo de negocio es un bounded context
desplegado como una sola unidad, listo para extraerse a microservicio si hiciera falta.

```
apps/
  api/   NestJS (backend)  ->  Postgres (Supabase) + Supabase Storage + LiveKit
  web/   React + Vite (frontend)
infra/   infraestructura local (Docker / Supabase)
```

- **Backend**: TypeScript + NestJS
- **Frontend**: React + Vite
- **Base de datos**: Postgres (Supabase), un schema por modulo
- **Archivos** (video/PDF): Supabase Storage (los binarios NO van en la base)
- **Clases en vivo**: LiveKit Cloud (HLS para broadcast; WebRTC a futuro)
- **Notificaciones**: in-app

## Dashboard del estudiante

El frontend obtiene la información del alumno desde `GET /dashboard/student`.
La API filtra los cursos por matrículas activas y consulta en Supabase los módulos,
las lecciones publicadas, el progreso, las próximas clases y las novedades. El
progreso se guarda con `PATCH /dashboard/student/lessons/:lessonId`; antes de
actualizarlo, la API comprueba que el usuario esté matriculado en el curso.

Las tablas `courses.course_modules`, `courses.lessons`,
`courses.lesson_progress` y `courses.announcements` tienen RLS habilitado y no
permiten acceso directo desde los roles públicos. Toda lectura y escritura pasa
por la API del servidor.

Las lecciones pueden combinar video, contenido de texto y registros de
`courses.lesson_resources`. Los archivos se guardan en el bucket privado
`course-resources`; `GET /dashboard/student/resources/:resourceId/access`
comprueba la matrícula y genera un enlace temporal. Los enlaces externos solo
aceptan los protocolos HTTP y HTTPS.

Las notas privadas se guardan con
`PUT /dashboard/student/lessons/:lessonId/note` en
`courses.student_lesson_notes`. Las preguntas se crean con
`POST /dashboard/student/lessons/:lessonId/questions` y quedan vinculadas a la
lección y al estudiante.

## Dashboards por rol

- `GET /dashboard/admin` calcula usuarios, matrículas, sesiones, videos y
  progreso directamente desde Supabase. Solo está disponible para `admin`.
- `GET /dashboard/mentor` devuelve cursos asignados, estudiantes, progreso y
  preguntas reales. Solo incluye cursos donde el usuario es el mentor asignado.
- `PATCH /dashboard/mentor/questions/:questionId` permite responder una duda
  únicamente si pertenece a un curso asignado al mentor autenticado.

Las tablas `courses.student_lesson_notes` y `courses.lesson_questions` tienen
RLS habilitado y acceso directo revocado. La API valida rol, matrícula y
asignación de curso antes de leer o modificar información.

## Requisitos

- Node.js >= 22 (probado con 24.14.1)
- npm >= 11
- Docker (para Supabase local)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (viene como devDependency)

## Puesta en marcha

```bash
# 1. Instalar dependencias (raiz, workspaces)
npm install

# 2. Copiar variables de entorno
cp .env.example .env      # completar claves de Supabase

# 3. Levantar Supabase local (Postgres + Auth + Storage en Docker)
npm run db:start          # imprime las claves: copialas al .env

# 4. Levantar api + web en modo desarrollo
npm run dev
```

- API: http://localhost:3000
- Web: http://localhost:5173

## Scripts (raiz)

| Script            | Que hace                                   |
| ----------------- | ------------------------------------------ |
| `npm run dev`     | Levanta api y web en paralelo              |
| `npm run dev:api` | Solo el backend                            |
| `npm run dev:web` | Solo el frontend                           |
| `npm run build`   | Build de todos los workspaces              |
| `npm run test`    | Tests de todos los workspaces              |
| `npm run lint`    | Lint de todos los workspaces               |
| `npm run db:start`| Levanta Supabase local (Docker)            |
| `npm run db:stop` | Detiene Supabase local                     |
