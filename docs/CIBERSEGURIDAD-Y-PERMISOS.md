# Ciberseguridad y permisos

Implementación: 17 de noviembre de 2026. Esta matriz incluye los cuatro roles reales. Si la rúbrica solicita tres, estudiante/mentor/admin constituyen la matriz principal y soporte es el rol adicional.

## Matriz de acceso del backend

| Módulo / operación | Estudiante | Mentor | Administrador | Soporte |
|---|---|---|---|---|
| Perfil propio | Sí | Sí | Sí | Sí |
| Crear usuarios, cambiar roles, eliminar cuentas | No | No | Sí | No |
| Consultar programas | Matrícula activa | Cursos que imparte | Todos | No |
| Lecciones, materiales, progreso | Matrícula y permiso de contenido; solo datos propios | Contenido de sus cursos | Gestión académica | No |
| Editar módulos, lecciones, materiales | No | Solo cursos asignados | Sí | No |
| Matrículas | No | Solo sus cursos, con límites del servicio | Sí | No |
| Clases en vivo | Matrícula con permiso de clases | Solo sus cursos | Sí | No |
| Grabaciones | Matrícula con permiso de grabaciones | Solo sus cursos | Sí | No |
| Foro | Sí | Sí | Sí | No |
| Chat privado | Solo mentor asignado | Solo estudiantes asignados | No | No |
| Consultar tickets | Solo propios | No | Supervisión | Disponibles y propios; conversación después de tomar el ticket |
| Responder, etiquetar, resolver tickets | Responder a su caso abierto | No | Solo lectura | Solo casos propios |
| Crear/editar etiquetas y estados | No | No | No | Solo opciones propias |

La autorización se ejecuta en el servidor: `JwtAuthGuard` valida firma, emisor, audiencia, vencimiento y sujeto. El rol se consulta en la base de datos, no se toma del navegador. `RolesGuard` usa roles explícitos y ya no concede un bypass general al administrador. Los servicios comprueban dueño, matrícula activa y capacidades de contenido, grabaciones o clases. Las tablas privadas no están disponibles para clientes anon/authenticated; el uso de service_role exige conservar estas comprobaciones de servidor.

## Protecciones implementadas

- Cinco fallos de contraseña en la ventana de 15 minutos bloquean el acceso durante 15 minutos. Contadores persistentes y bloqueo de fila; una reserva serializa intentos simultáneos por cuenta.
- La contraseña correcta no evita un bloqueo activo. Las sesiones existentes también quedan rechazadas por el backend durante el bloqueo. Al finalizar el plazo, un login correcto limpia el contador.
- Los errores de red no cuentan como contraseñas incorrectas. Si falla la base de seguridad, no se autoriza el login.
- Límite persistente por IP: 30 solicitudes/minuto a login y 5/minuto a cada endpoint de recuperación/restablecimiento. IPs y correos se convierten a hashes para los contadores; no se registran contraseñas ni tokens.
- Supabase Auth conserva los hashes de contraseñas. No se crea una segunda tabla de contraseñas. La creación y recuperación conservan un mínimo de 8 caracteres; la recuperación admite hasta 128.
- Recuperación con sesión validada por Supabase más desafío aleatorio de un solo uso vinculado al correo, con una hora de duración. No basta una sesión normal ni modificar `type=recovery` en la URL. Los enlaces antiguos sin desafío deben solicitarse nuevamente.
- El cambio de correo mediante perfil ya no utiliza confirmación administrativa automática. Se rechaza un correo distinto hasta disponer de un flujo de verificación dedicado.
- Cada operación de autenticación usa un cliente anon aislado; no se comparte sesión mutable entre usuarios.
- CORS limitado a orígenes configurados. Sin comodines ni reflejo de orígenes arbitrarios.
- Cabeceras nosniff, DENY para marcos de la API, no-referrer, permisos de dispositivos deshabilitados y no-store.
- Auditoría en `iam.security_events`: logins, fallos/bloqueos, solicitudes rechazadas y operaciones autenticadas de escritura. Guarda identidad cuando está disponible, plantilla de ruta, método y estado. Nunca cuerpos, parámetros de consulta, contraseñas o tokens. Aún no incluye una pantalla de reportes.

## HTTPS y despliegue

`deploy/Caddyfile` sirve el frontend con fallback SPA, obtiene certificados y redirige HTTP a HTTPS. `deploy/production.env.example` describe las variables. No sustituye publicar la aplicación en un dominio real.

1. Apuntar los dominios de frontend y API al servidor y permitir los puertos 80/443 para Caddy.
2. Compilar el frontend con `VITE_API_URL=https://api.TU-DOMINIO`.
3. Definir NODE_ENV=production, FRONTEND_URL, CORS_ORIGINS, PUBLIC_API_URL y TRUST_PROXY=loopback si Caddy está en el mismo servidor. Sustituir todos los dominios de ejemplo.
4. Hacer que el puerto 3000 solo sea accesible por Caddy. No confiar en cabeceras de proxies arbitrarios.
5. Iniciar Caddy con APP_DOMAIN, API_DOMAIN, ACME_EMAIL y FRONTEND_DIST reales. Su configuración cubre tanto el frontend como la API.
6. Autorizar en Supabase el redirect de recuperación con el desafío: `https://TU-DOMINIO/recuperar-contrasena**`. Para desarrollo, el equivalente en localhost:5174. Configurar SMTP para entrega fiable.
7. Verificar certificado, redirección HTTP, HSTS y recuperación real desde correo.

La API en producción rechaza configuración sin orígenes HTTPS y PUBLIC_API_URL HTTPS. Redirige GET/HEAD inseguros al origen configurado y rechaza escrituras HTTP. Solo confía en el proxy explícito. Localhost conserva HTTP en desarrollo.

## Alcance pendiente que no debe declararse completado

- HTTPS público necesita dominio, alojamiento y certificado: no se ha publicado un sitio nuevo ni cambiado DNS en esta tarea.
- El contador de cinco fallos se aplica a `/auth/login` de la plataforma. Supabase tiene su propio endpoint público de autenticación y sus límites propios. Para exigir exactamente cinco fallos también en llamadas directas al proveedor, hace falta configurar su Password Verification Hook (si el plan lo permite) o una arquitectura de autenticación que no exponga ese flujo. No se ha activado ese hook ni contratado un plan. Un bloqueo ya producido en la plataforma sí se comprueba también al presentar un token a la API.
- No se declara una auditoría de penetración completa, MFA, antivirus de archivos ni rotación automática de secretos. Tampoco se eliminan sesiones del proveedor al restablecer: el desafío es de un solo uso y el bloqueo de la API se verifica independientemente.
- Antes de exposición pública deben revisarse políticas del proveedor, claves vigentes, retención/limpieza periódica de registros, backups y alertas operativas.

## Evidencia reproducible

Desde la raíz del backend, con .env autorizado y API compilada:

```powershell
npm.cmd run build --workspace api
npm.cmd test --workspace api
node scripts/verify-auth-roles.mjs
node scripts/verify-cybersecurity.mjs
```

Los scripts crean cuentas/cursos temporales y los eliminan en finally. Nunca imprimen credenciales. Verifican los cuatro roles, rechazo sin sesión, no escalamiento de rol, límites entre programas, matrícula, bloqueo real, desbloqueo simulado solo en la cuenta temporal, recuperación real sin enviar correo, rechazo de replay, CORS y cabeceras. Las pruebas unitarias verifican además las reglas HTTPS y el bypass eliminado.
