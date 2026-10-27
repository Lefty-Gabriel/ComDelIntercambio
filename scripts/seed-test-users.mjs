import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

export async function ensureTestAccount(api, account, owner) {
  const existing = await api.lookup(account.email);
  if (existing) {
    if (existing.app_metadata?.test_seed_owner !== owner)
      throw new Error(`Email collision: ${account.email}; no existing account was changed`);
    if (await api.getRole(existing.id) !== account.role)
      throw new Error(`Unexpected profile role for ${account.email}; refusing to change it`);
    if (!await api.verify(account))
      throw new Error(`Stored credentials no longer work for ${account.email}; refusing password reset`);
    return existing.id;
  }
  const user = await api.create(account, owner);
  try {
    await api.setRole(user.id, account.role);
  } catch (error) {
    try { await api.remove(user.id); }
    catch { throw new Error(`Profile setup and cleanup failed for ${account.email}; inspect the owned account before retrying`); }
    throw error;
  }
  return user.id;
}

function checked(result, operation) {
  if (result.error) throw new Error(`${operation} failed`);
  return result.data;
}

export function createSeedAdapter(url, serviceKey, anonKey) {
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const admin = createClient(url, serviceKey, options);
  return {
    async lookup(email) {
      for (let page = 1; ; page++) {
        const { users } = checked(await admin.auth.admin.listUsers({ page, perPage: 100 }), 'Account lookup');
        const found = users.find(user => user.email?.toLowerCase() === email);
        if (found) return found;
        if (users.length < 100) return null;
      }
    },
    async create(account, owner) {
      const { user } = checked(await admin.auth.admin.createUser({
        email: account.email, password: account.password, email_confirm: true,
        app_metadata: { test_seed_owner: owner }, user_metadata: { full_name: account.fullName },
      }), 'Test account creation');
      if (!user) throw new Error('Test account creation returned no user');
      return user;
    },
    async setRole(id, role) {
      const row = checked(await admin.schema('iam').from('profiles').update({ role })
        .eq('id', id).select('id,role').single(), 'Profile setup');
      if (!row || row.role !== role) throw new Error('Profile role setup failed');
    },
    async getRole(id) {
      return checked(await admin.schema('iam').from('profiles').select('role').eq('id', id).single(), 'Profile lookup')?.role;
    },
    async verify(account) {
      // Never sign in on the administrative client: that would replace its authorization.
      const anonymous = createClient(url, anonKey, options);
      const result = await anonymous.auth.signInWithPassword({ email: account.email, password: account.password });
      if (result.data.session) await anonymous.auth.signOut({ scope: 'local' });
      return !result.error && Boolean(result.data.user);
    },
    async remove(id) { checked(await admin.auth.admin.deleteUser(id), 'Owned orphan cleanup'); },
  };
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  try { process.loadEnvFile(resolve(root, '.env')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey, SUPABASE_ANON_KEY: anonKey } = process.env;
  if (!url || !serviceKey || !anonKey) throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY in .env');
  const location = resolve(root, '.env.seed.local');
  let state;
  try { state = JSON.parse(await readFile(location, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Cannot read existing test credentials; refusing to overwrite');
    state = { version: 1, url, owner: randomUUID(), accounts: [
      { email: 'estudiante.pruebas@traction.test', role: 'estudiante', fullName: 'Test Student' },
      { email: 'soporte.pruebas@traction.test', role: 'soporte', fullName: 'Test Support' },
    ].map(account => ({ ...account, password: `${randomBytes(24).toString('base64url')}!aA1` })) };
    // Save generated passwords before remote creation so an interrupted run can resume.
    // Exclusive creation prevents concurrent invocations from replacing ownership.
    await writeFile(location, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  }
  if (state.version !== 1 || state.url !== url || typeof state.owner !== 'string' || !state.owner ||
      !Array.isArray(state.accounts) || state.accounts.length !== 2 ||
      state.accounts.some((account, index) => account.role !== ['estudiante', 'soporte'][index] ||
        account.email !== ['estudiante.pruebas@traction.test', 'soporte.pruebas@traction.test'][index] ||
        typeof account.password !== 'string' || account.password.length < 24))
    throw new Error('Test credentials do not match this project or expected fixtures; refusing changes');
  const lock = `${location}.lock`;
  await writeFile(lock, '', { flag: 'wx', mode: 0o600 });
  try {
    const api = createSeedAdapter(url, serviceKey, anonKey);
    for (const account of state.accounts) {
      await ensureTestAccount(api, account, state.owner);
      console.log(`Ready: ${account.role} ${account.email}`);
    }
    console.log(`Test credentials: ${location} (JSON; keep private)`);
  } finally { await unlink(lock); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Test account seed failed; no passwords or infrastructure credentials were logged. Check project configuration, fixture ownership, profile roles and any stale .env.seed.local.lock.'); process.exitCode = 1; });
}
