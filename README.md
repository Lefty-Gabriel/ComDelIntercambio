# Traction

Plataforma educativa modular. Los cursos se organizan por **modulos** con material
(videos, PDFs y foros). Tres roles: **alumno**, **docente** y **admin**.

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
