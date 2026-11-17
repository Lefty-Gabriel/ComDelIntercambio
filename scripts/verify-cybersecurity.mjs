// Uses only temporary accounts. Never prints passwords, tokens or personal data.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
process.loadEnvFile('.env');
const { AppModule } = await import('../apps/api/dist/app.module.js');
const { configureHttpSecurity } = await import('../apps/api/dist/common/http-security.js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const checked = r => { if (r.error) throw Error(r.error.message); return r.data; };
const email = `security-${randomUUID()}@traction.test`;
const key = 'account:' + createHash('sha256').update(email).digest('hex');
const challenge=randomBytes(32).toString('hex');
const challengeKey='recovery:'+createHash('sha256').update(challenge).digest('hex');
let account, app;
try {
 const password = randomBytes(24).toString('base64url');
 account = checked(await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'PRUEBA temporal seguridad' } })).user;
 app = await NestFactory.create(AppModule, { logger: false });
 configureHttpSecurity(app, { NODE_ENV:'development' });
 app.useGlobalPipes(new ValidationPipe({ whitelist:true, transform:true }));
 await app.listen(0,'127.0.0.1');
 const base = await app.getUrl();
 const login = async secret => fetch(base+'/auth/login', { method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify({ email,password:secret }) });
 const initial = await login(password); assert.equal(initial.status,201);
 const session = await initial.json();
 for(let i=1;i<=5;i++) assert.equal((await login(randomBytes(12).toString('hex'))).status,i===5?429:401,`Failure ${i}`);
 assert.equal((await login(password)).status,429,'Correct password cannot bypass active block');
 assert.equal((await fetch(base+'/auth/me',{headers:{Authorization:`Bearer ${session.accessToken}`}})).status,401,'Existing token blocked too');
 const persisted = checked(await db.schema('iam').from('login_security').select('failures,blocked_until').eq('key',key).single());
 assert.equal(persisted.failures,5); assert.ok(Date.parse(persisted.blocked_until)>Date.now());
 // Expire only this temporary account's lock to simulate elapsed time.
 checked(await db.schema('iam').from('login_security').update({blocked_until:new Date(Date.now()-1000).toISOString()}).eq('key',key));
 const restored = await login(password); assert.equal(restored.status,201);
 const cleared=checked(await db.schema('iam').from('login_security').select('failures').eq('key',key).single());assert.equal(cleared.failures,0);
 const resetNormal=await fetch(base+'/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessToken:session.accessToken,password:randomBytes(24).toString('base64url')})});
 assert.equal(resetNormal.status,401,'Ordinary session cannot authorize password recovery');
 const link=checked(await db.auth.admin.generateLink({type:'recovery',email}));
 checked(await db.schema('iam').from('password_recovery_challenges').insert({key:challengeKey,account_key:key}));
 const anon=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const recovery=checked(await anon.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'recovery'}));
 const resetBody={accessToken:recovery.session.access_token,password:randomBytes(24).toString('base64url'),challenge};
 const reset=await fetch(base+'/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(resetBody)});
 assert.equal(reset.status,201,'Actual recovery link works');
 const replay=await fetch(base+'/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(resetBody)});assert.equal(replay.status,401,'Recovery challenge cannot be replayed');
 const headers=await fetch(base+'/auth/me'); assert.equal(headers.headers.get('x-content-type-options'),'nosniff');
 const evil=await fetch(base+'/auth/me',{headers:{Origin:'https://untrusted.example'}});assert.notEqual(evil.headers.get('access-control-allow-origin'),'https://untrusted.example');
 console.log('PASS: five-attempt persistent lock, correct-password rejection while locked, existing-session block, timed unlock, counter reset, recovery token boundary, real recovery flow, headers and CORS.');
} finally {
 await app?.close();
 if(account) checked(await db.auth.admin.deleteUser(account.id));
 checked(await db.schema('iam').from('login_security').delete().eq('key',key));
 checked(await db.schema('iam').from('password_recovery_challenges').delete().eq('key',challengeKey));
 console.log('Temporary security account and its counter removed.');
}
