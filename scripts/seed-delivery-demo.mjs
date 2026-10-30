// Creates only explicitly marked demo accounts and content. Secrets stay in .env.demo.local.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createSeedAdapter, ensureTestAccount } from './seed-test-users.mjs';
process.loadEnvFile('.env');
const file = '.env.demo.local';
let state;
try { state = JSON.parse(await readFile(file, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const owner = randomUUID();
  state = { owner, url: process.env.SUPABASE_URL, accounts: ['admin', 'estudiante'].map(role => ({
    role, email: `demo.${role}.${owner.slice(0, 8)}@traction.test`,
    fullName: `DEMO / PRUEBA ${role}`, password: `${randomBytes(24).toString('base64url')}!aA1`,
  })) };
  await writeFile(file, JSON.stringify(state, null, 2), { flag: 'wx' });
}
if (state.url !== process.env.SUPABASE_URL) throw new Error('Demo belongs to another database');
const save = () => writeFile(file, JSON.stringify(state, null, 2));
const adapter = createSeedAdapter(state.url, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_ANON_KEY);
for (const account of state.accounts) {
  account.id = await ensureTestAccount(adapter, account, state.owner);
  await save();
}
const base = 'http://localhost:3000';
let token;
async function call(path, body, method = 'POST') {
  const multipart = body instanceof FormData;
  const response = await fetch(base + path, { method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(!multipart ? { 'Content-Type': 'application/json' } : {}) },
    ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${JSON.stringify(result)}`);
  return result;
}
const admin = state.accounts.find(a => a.role === 'admin');
token = (await call('/auth/login', { email: admin.email, password: admin.password })).accessToken;
if (!state.course) {
  state.course = await call('/courses', { title: 'DEMO / PRUEBA — Primeros pasos en Traction',
    description: 'Contenido de demostración para validar la entrega. No es un programa académico oficial.',
    category: 'Demostración', level: 'Inicial', contentType: 'course' });
  await save();
}
if (!state.module) {
  state.module = await call(`/admin/courses/${state.course.id}/modules`, { title: 'DEMO — Aprende a usar tu plataforma', position: 0 });
  await save();
}
const lessons = [
  ['Bienvenida y objetivo', 'Este es un curso DEMO / PRUEBA. Tu objetivo es recorrer la plataforma de manera independiente.\n\n1. Revisa el programa y selecciona esta lección.\n2. Lee el contenido y descarga la guía en Recursos.\n3. Escribe una nota privada y guárdala.\n4. Marca la lección como completada y continúa.'],
  ['Organiza tu aprendizaje', 'DEMO / PRUEBA\n\nDefine un objetivo concreto para esta semana y reserva 20 minutos para aprender. Anota tu objetivo en la pestaña de notas.\n\nPuedes enviar una pregunta desde la lección. Las respuestas requieren un mentor asignado. El avance se guarda en tu cuenta y podrás retomarlo al volver al curso.'],
  ['Explora biblioteca y clases en vivo', 'DEMO / PRUEBA\n\nAbre Biblioteca en el menú para encontrar el curso y sus recursos. Después visita Clases en vivo para consultar la agenda.\n\nLa sesión de demostración no es una reunión real y no incluye un enlace de Zoom. Para una clase real, un administrador o mentor debe publicar su enlace.\n\nMarca esta última lección como completada para comprobar el progreso del programa.'],
];
state.lessons ||= [];
for (let index = state.lessons.length; index < lessons.length; index++) {
  const [title, content] = lessons[index];
  state.lessons.push(await call(`/admin/modules/${state.module.id}/lessons`, {
    title: `DEMO — ${title}`, content, summary: 'Lección de demostración con actividad práctica.',
    position: index, durationMinutes: 5, isPublished: true,
  }));
  await save();
}
if (!state.resource) {
  const form = new FormData();
  form.set('title', 'DEMO — Guía de recorrido');
  form.set('file', new Blob(['DEMO / PRUEBA — Guía de recorrido\n\n[ ] Entrar como estudiante\n[ ] Abrir el curso DEMO\n[ ] Leer una lección\n[ ] Guardar una nota\n[ ] Completar una lección\n[ ] Abrir biblioteca\n[ ] Consultar clases en vivo\n\nEste archivo es material de demostración.'], { type: 'text/plain' }), 'guia-demo.txt');
  state.resource = await call(`/admin/lessons/${state.lessons[0].id}/resources/upload`, form);
  await save();
}
await call(`/admin/resources/${state.resource.id}`, { isPublished: true }, 'PATCH');
await call('/admin/access', { courseId: state.course.id, studentId: state.accounts.find(a => a.role === 'estudiante').id,
  accessType: 'full', status: 'active' });
if (!state.session) {
  const when = new Date(); when.setDate(when.getDate() + 1); when.setHours(15, 0, 0, 0);
  state.session = await call('/live-sessions', { courseId: state.course.id, title: 'DEMO / PRUEBA — Recorrido de la plataforma (sin reunión real)',
    scheduledAt: when.toISOString(), durationMinutes: 30 });
  await save();
}
console.log('Demo ready. Credentials and created IDs: .env.demo.local (private, ignored by Git).');
