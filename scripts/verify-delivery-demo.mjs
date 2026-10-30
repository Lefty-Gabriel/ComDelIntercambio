import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const state = JSON.parse(await readFile('.env.demo.local', 'utf8'));
let token;
async function call(path, body, method = 'GET') {
  const response = await fetch('http://localhost:3000' + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}
for (const role of ['estudiante', 'admin']) {
  const account = state.accounts.find(a => a.role === role);
  token = undefined;
  token = (await call('/auth/login', { email: account.email, password: account.password }, 'POST')).accessToken;
  assert.ok(token);
  const dashboard = await call(`/dashboard/${role === 'admin' ? 'admin' : 'student'}`);
  const course = dashboard.courses.find(c => c.id === state.course.id);
  assert.ok(course, 'demo course visible');
  if (role === 'estudiante') {
    assert.equal(course.modules.flatMap(m => m.lessons).length, 3);
    const lessonId = state.lessons[0].id;
    await call(`/dashboard/student/lessons/${lessonId}/note`, { content: 'DEMO: nota guardada durante la verificación de entrega.' }, 'PUT');
    await call(`/dashboard/student/lessons/${lessonId}`, { completed: true }, 'PATCH');
    await call(`/dashboard/student/courses/${course.id}/resume`, { lessonId, positionSeconds: 0 }, 'PUT');
    assert.equal((await call(`/dashboard/student/courses/${course.id}/resume`)).lessonId, lessonId);
    const updated = await call('/dashboard/student');
    const lesson = updated.courses.find(c => c.id === course.id).modules.flatMap(m => m.lessons).find(l => l.id === lessonId);
    assert.equal(lesson.completed, true);
    assert.match(lesson.note, /nota guardada/);
    const resource = await call(`/dashboard/student/resources/${state.resource.id}/access`);
    const download = await fetch(resource.url);
    assert.ok(download.ok, 'private resource downloaded');
    assert.match(await download.text(), /DEMO/);
    const sessions = await call('/live-sessions');
    assert.ok(sessions.some(s => s.id === state.session.id));
    await call(`/dashboard/student/lessons/${lessonId}`, { completed: false }, 'PATCH');
    console.log('PASS student: login, dashboard, 3 lessons, persisted note/progress/resume, real resource download, live schedule');
  } else {
    const curriculum = await call(`/admin/courses/${course.id}/curriculum`);
    assert.equal(curriculum.modules[0].lessons.length, 3);
    assert.ok((await call('/users')).some(u => u.id === state.accounts.find(a => a.role === 'estudiante').id));
    console.log('PASS admin: login, dashboard, curriculum and user management reads');
  }
}
