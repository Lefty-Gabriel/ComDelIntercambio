# Frontend de Comunidad

El portal antiguo de pruebas fue eliminado. Este workspace conserva los comandos de arranque y los clientes de API utilizados por pruebas de regresion.

- `npm run dev --workspace web` inicia la plataforma de Comunidad.
- `npm run build --workspace web` compila la misma plataforma.
- `npm run preview --workspace web` sirve su compilacion.

El lanzador usa la carpeta `traction-frontend` de este entorno. Para otra ubicacion, define `COMMUNITY_FRONTEND_DIR` con la ruta absoluta del frontend antes de ejecutar el comando.

Se utiliza el puerto 5174 con `strictPort`: si esta ocupado, el proceso informa el conflicto en vez de cambiar silenciosamente a otro puerto. Deten el servidor antiguo antes de iniciar el nuevo.

La recuperacion de contrasena se atiende en `/recuperar-contrasena` por la plataforma de Comunidad. Un enlace vencido debe solicitarse nuevamente.
