// Run after building the API. Creates only owned temporary accounts and removes them.
import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
process.loadEnvFile('.env');
const { AppModule } = await import('../apps/api/dist/app.module.js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const owned = [];
const checks = [];
const courses = [];
const sessions = new Map();
let app;
const checked = result => { if (result.error) throw new Error(result.error.message); return result.data; };
try {
  const run = randomUUID();
  const password = randomBytes(24).toString('base64url');
  const bootstrap = checked(await db.auth.admin.createUser({ email: `auth-audit-${run}@traction.test`, password, email_confirm: true, app_metadata: { auth_audit: run }, user_metadata: { full_name: 'PRUEBA temporal de autenticacion' } })).user;
  owned.push(bootstrap.id);
  checked(await db.schema('iam').from('profiles').update({ role: 'admin' }).eq('id', bootstrap.id));
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  async function call(path, expected, { token, method = 'GET', body } = {}) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (response.status !== expected) throw new Error(`${method} ${path}: expected ${expected}, received ${response.status}`);
    return data;
  }
  const login = async email => call('/auth/login', 201, { method: 'POST', body: { email, password } });
  const admin = await login(bootstrap.email);
  await call('/auth/me', 401);
  await call('/users', 401);
  await call('/auth/me', 401, { token: 'invalid-token' });
  await call('/auth/login', 401, { method: 'POST', body: { email: bootstrap.email, password: 'incorrect-password' } });
  checks.push('Anonymous, malformed-token and wrong-password requests rejected');
  for (const role of ['estudiante', 'mentor', 'admin', 'soporte']) {
    const email = `auth-audit-${role}-${run}@traction.test`;
    const account = await call('/users', 201, { token: admin.accessToken, method: 'POST', body: { email, password, fullName: `PRUEBA temporal ${role}`, role } });
    owned.push(account.id);
    const session = await login(email);
    sessions.set(role, session);
    if (session.user.role !== role) throw new Error(`Wrong persisted role for ${role}`);
    const me = await call('/auth/me', 200, { token: session.accessToken });
    if (me.id !== account.id || me.role !== role) throw new Error(`Wrong authenticated identity for ${role}`);
    await call('/users', role === 'admin' ? 200 : 403, { token: session.accessToken });
    await call('/courses', role === 'soporte' ? 403 : 200, { token: session.accessToken });
    await call('/tickets', role === 'mentor' ? 403 : 200, { token: session.accessToken });
    if (role !== 'admin') await call('/users', 403, { token: session.accessToken, method: 'POST', body: { email: `blocked-${run}@traction.test`, password, fullName: 'Must not exist', role: 'admin' } });
    await call('/auth/me', 200, { token: session.accessToken, method: 'PATCH', body: { role: 'admin' } });
    const unchanged = await call('/auth/me', 200, { token: session.accessToken });
    if (unchanged.role !== role) throw new Error('Self-service role escalation');
    checks.push(`${role}: registered, logged in, profile restored, route permissions verified, self-escalation blocked`);
  }
  const mentor = sessions.get('mentor');
  const student = sessions.get('estudiante');
  for (const docente_id of [mentor.user.id, null]) {
    const course = checked(await db.schema('courses').from('courses').insert({ title:'[TEMP SECURITY] program boundary', created_by:bootstrap.id, docente_id }).select('id').single());
    courses.push(course.id);
  }
  await call(`/admin/courses/${courses[0]}/curriculum`,200,{token:mentor.accessToken});
  await call(`/admin/courses/${courses[1]}/curriculum`,403,{token:mentor.accessToken});
  await call(`/dashboard/student/courses/${courses[0]}/resume`,403,{token:student.accessToken});
  await call(`/courses/${courses[0]}/enrollments`,201,{token:admin.accessToken,method:'POST',body:{studentId:student.user.id}});
  await call(`/dashboard/student/courses/${courses[0]}/resume`,200,{token:student.accessToken});
  await call(`/dashboard/student/courses/${courses[1]}/resume`,403,{token:student.accessToken});
  await call(`/admin/courses/${courses[0]}/curriculum`,403,{token:sessions.get('soporte').accessToken});
  await call('/tickets/options',403,{token:student.accessToken,method:'POST',body:{kind:'label',name:'Must not exist'}});
  await call('/tickets/options',403,{token:admin.accessToken,method:'POST',body:{kind:'label',name:'Must not exist'}});
  checks.push('Program boundary: assigned mentor allowed, other program denied; student allowed only after enrollment; support denied academic content; admin cannot write agent-only options');
  console.log(JSON.stringify({ passed: true, checks }, null, 2));
} finally {
  await app?.close();
  for (const id of courses) checked(await db.schema('courses').from('courses').delete().eq('id',id));
  const failures = [];
  for (const id of owned.reverse()) {
    const result = await db.auth.admin.deleteUser(id);
    if (result.error) failures.push(id);
  }
  if (failures.length) throw new Error(`Could not remove owned test accounts: ${failures.join(', ')}`);
}
