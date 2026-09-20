const encoder = new TextEncoder();
const PBKDF2_ITERATIONS = 100000;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 10;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === '/api/health' && request.method === 'GET') return json({ ok: true }, 200, cors);
      if (url.pathname === '/api/bootstrap' && request.method === 'POST') return await bootstrap(request, env, cors);
      if (url.pathname === '/api/login' && request.method === 'POST') return await login(request, env, cors);

      const auth = await authenticate(request, env);
      if (!auth) return json({ error: 'Your session is missing or has expired. Please sign in again.' }, 401, cors);
      if (!auth.user.active) return json({ error: 'This account is inactive.' }, 403, cors);

      if (url.pathname === '/api/logout' && request.method === 'POST') return await logout(auth, env, cors);
      if (url.pathname === '/api/me' && request.method === 'GET') return json(publicSession(auth), 200, cors);
      if (url.pathname === '/api/change-pin' && request.method === 'POST') return await changePin(request, auth, env, cors);
      if (url.pathname === '/api/clock' && request.method === 'POST') return await clock(request, auth, env, cors);
      if (url.pathname === '/api/employee/time' && request.method === 'GET') return await employeeTime(auth, env, cors);

      if (url.pathname === '/api/admin/settings' && request.method === 'GET') return await adminSettings(auth, env, cors);
      if (url.pathname === '/api/admin/settings' && request.method === 'PATCH') return await updateAdminSettings(request, auth, env, cors);
      if (url.pathname === '/api/admin/employees' && request.method === 'GET') return await listEmployees(auth, env, cors);
      if (url.pathname === '/api/admin/employees' && request.method === 'POST') return await createEmployee(request, auth, env, cors);

      const employeeMatch = url.pathname.match(/^\/api\/admin\/employees\/([^/]+)$/);
      if (employeeMatch && request.method === 'PATCH') return await updateEmployee(request, auth, env, cors, decodeURIComponent(employeeMatch[1]));
      const resetMatch = url.pathname.match(/^\/api\/admin\/employees\/([^/]+)\/reset-pin$/);
      if (resetMatch && request.method === 'POST') return await resetEmployeePin(auth, env, cors, decodeURIComponent(resetMatch[1]));

      return json({ error: 'Not found.' }, 404, cors);
    } catch (error) {
      console.error(error);
      if (error instanceof HttpError) return json({ error: error.message, ...(error.details || {}) }, error.status, cors);
      return json({ error: 'Unexpected server error.' }, 500, cors);
    }
  }
};

class HttpError extends Error { constructor(status, message, details = null){ super(message); this.status=status; this.details=details; } }

function corsHeaders(request, env){
  const origin=request.headers.get('Origin');
  const allowed=String(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  const headers={ 'Access-Control-Allow-Headers':'Content-Type, Authorization', 'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS', 'Vary':'Origin' };
  if(origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin']=origin;
  return headers;
}
function json(body,status=200,headers={}){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}})}
async function bodyJson(request){try{return await request.json()}catch{throw new HttpError(400,'Invalid JSON request.')}}
function nowIso(){return new Date().toISOString()}
function normalizeUsername(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,'').slice(0,24)}
function normalizeSlug(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,40)}
function validateEmployeePin(pin){if(!/^\d{5}$/.test(String(pin||''))) throw new HttpError(400,'Employee PIN must be exactly 5 numbers.')}
function validateAdminPassword(p){if(String(p||'').length<10) throw new HttpError(400,'Admin password must be at least 10 characters.')}
function bytesToBase64(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
function base64ToBytes(value){const s=atob(value);return Uint8Array.from(s,c=>c.charCodeAt(0))}
function randomBytes(n){const b=new Uint8Array(n);crypto.getRandomValues(b);return b}
function base64Url(bytes){return bytesToBase64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function randomPin(){const a=new Uint32Array(1);crypto.getRandomValues(a);return String(10000+(a[0]%90000))}
async function sha256(text){const d=await crypto.subtle.digest('SHA-256',encoder.encode(text));return bytesToBase64(new Uint8Array(d))}
async function hashCredential(secret,saltB64,pepper){
  const material=await crypto.subtle.importKey('raw',encoder.encode(`${secret}|${pepper||''}`),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:base64ToBytes(saltB64),iterations:PBKDF2_ITERATIONS},material,256);
  return bytesToBase64(new Uint8Array(bits));
}
function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0}
async function makeCredential(secret,env){const salt=bytesToBase64(randomBytes(16));const hash=await hashCredential(secret,salt,env.PIN_PEPPER);return{salt,hash}}

async function bootstrap(request,env,cors){
  const b=await bodyJson(request);
  if(!env.BOOTSTRAP_KEY || !safeEqual(String(b.setupKey||''),String(env.BOOTSTRAP_KEY))) throw new HttpError(403,'Invalid setup key.');
  const companyName=String(b.companyName||'').trim();const slug=normalizeSlug(b.companySlug);const displayName=String(b.displayName||'').trim();const username=normalizeUsername(b.username);const password=String(b.password||'');
  if(!companyName||slug.length<3||!displayName||username.length<3)throw new HttpError(400,'Company name, company code, admin name, and username are required.');
  validateAdminPassword(password);
  if(await env.DB.prepare('SELECT id FROM organizations WHERE slug=?').bind(slug).first())throw new HttpError(409,'That company code already exists.');
  const orgId=crypto.randomUUID(),userId=crypto.randomUUID(),now=nowIso();const cred=await makeCredential(password,env);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO organizations(id,name,slug,created_at) VALUES(?,?,?,?)').bind(orgId,companyName,slug,now),
    env.DB.prepare('INSERT INTO users(id,organization_id,username,display_name,job_title,role,credential_hash,credential_salt,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?)').bind(userId,orgId,username,displayName,'Owner / Administrator','admin',cred.hash,cred.salt,now,now)
  ]);
  return json({ok:true,company:{name:companyName,slug}},201,cors);
}

async function login(request,env,cors){
  const b=await bodyJson(request);const company=normalizeSlug(b.company);const username=normalizeUsername(b.username);const credential=String(b.credential||'');
  if(!company||!username||!credential)throw new HttpError(400,'Company, username, and credential are required.');
  const row=await env.DB.prepare(`SELECT u.*,o.name AS org_name,o.slug AS org_slug,o.geofence_enabled,o.geofence_lat,o.geofence_lng,o.geofence_radius_m FROM users u JOIN organizations o ON o.id=u.organization_id WHERE o.slug=? AND u.username=? COLLATE NOCASE`).bind(company,username).first();
  if(!row||!row.active)throw new HttpError(401,'Invalid username or credential.');
  if(row.locked_until && new Date(row.locked_until)>new Date())throw new HttpError(429,`Too many failed attempts. Try again after ${new Date(row.locked_until).toLocaleTimeString()}.`);
  if(row.role==='employee') validateEmployeePin(credential);
  const hash=await hashCredential(credential,row.credential_salt,env.PIN_PEPPER);
  if(!safeEqual(hash,row.credential_hash)){
    const attempts=Number(row.failed_attempts||0)+1;const locked=attempts>=MAX_FAILED_LOGINS?new Date(Date.now()+LOCK_MINUTES*60000).toISOString():null;
    await env.DB.prepare('UPDATE users SET failed_attempts=?,locked_until=?,updated_at=? WHERE id=?').bind(attempts>=MAX_FAILED_LOGINS?0:attempts,locked,nowIso(),row.id).run();
    throw new HttpError(401,locked?`Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.`:'Invalid username or credential.');
  }
  await env.DB.prepare('UPDATE users SET failed_attempts=0,locked_until=NULL,updated_at=? WHERE id=?').bind(nowIso(),row.id).run();
  const rawToken=base64Url(randomBytes(32));const tokenHash=await sha256(rawToken);const hours=Math.max(1,Math.min(72,Number(env.SESSION_HOURS||12)));const expires=new Date(Date.now()+hours*3600000).toISOString();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(tokenHash,row.id,expires,nowIso()).run();
  return json({token:rawToken,...publicSession({user:row,organization:{id:row.organization_id,name:row.org_name,slug:row.org_slug,geofence_enabled:row.geofence_enabled,geofence_lat:row.geofence_lat,geofence_lng:row.geofence_lng,geofence_radius_m:row.geofence_radius_m}})},200,cors);
}

async function authenticate(request,env){
  const header=request.headers.get('Authorization')||'';if(!header.startsWith('Bearer '))return null;const raw=header.slice(7).trim();if(!raw)return null;const tokenHash=await sha256(raw);
  const row=await env.DB.prepare(`SELECT s.token_hash,s.expires_at,u.*,o.name AS org_name,o.slug AS org_slug,o.geofence_enabled,o.geofence_lat,o.geofence_lng,o.geofence_radius_m FROM sessions s JOIN users u ON u.id=s.user_id JOIN organizations o ON o.id=u.organization_id WHERE s.token_hash=?`).bind(tokenHash).first();
  if(!row)return null;if(new Date(row.expires_at)<=new Date()){await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(tokenHash).run();return null;}
  return{tokenHash,user:row,organization:{id:row.organization_id,name:row.org_name,slug:row.org_slug,geofence_enabled:row.geofence_enabled,geofence_lat:row.geofence_lat,geofence_lng:row.geofence_lng,geofence_radius_m:row.geofence_radius_m}};
}
function publicSession(auth){return{user:{id:auth.user.id,username:auth.user.username,displayName:auth.user.display_name,jobTitle:auth.user.job_title,role:auth.user.role,active:!!auth.user.active},organization:{id:auth.organization.id,name:auth.organization.name,slug:auth.organization.slug}}}
async function logout(auth,env,cors){await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(auth.tokenHash).run();return json({ok:true},200,cors)}
function requireAdmin(auth){if(auth.user.role!=='admin')throw new HttpError(403,'Administrator access required.')}

async function adminSettings(auth,env,cors){requireAdmin(auth);const o=await env.DB.prepare('SELECT geofence_enabled,geofence_lat,geofence_lng,geofence_radius_m FROM organizations WHERE id=?').bind(auth.organization.id).first();return json({geofence:{enabled:!!o.geofence_enabled,latitude:o.geofence_lat,longitude:o.geofence_lng,radiusMeters:o.geofence_radius_m}},200,cors)}
async function updateAdminSettings(request,auth,env,cors){
  requireAdmin(auth);const b=await bodyJson(request);const enabled=!!b.geofenceEnabled;const lat=b.latitude==null?null:Number(b.latitude);const lng=b.longitude==null?null:Number(b.longitude);const radius=Math.max(25,Math.min(5000,Number(b.radiusMeters||150)));
  if(enabled&&(!Number.isFinite(lat)||!Number.isFinite(lng)))throw new HttpError(400,'Latitude and longitude are required when the boundary is enabled.');
  if(lat!=null&&(lat<-90||lat>90))throw new HttpError(400,'Latitude must be between -90 and 90.');if(lng!=null&&(lng<-180||lng>180))throw new HttpError(400,'Longitude must be between -180 and 180.');
  await env.DB.prepare('UPDATE organizations SET geofence_enabled=?,geofence_lat=?,geofence_lng=?,geofence_radius_m=? WHERE id=?').bind(enabled?1:0,lat,lng,radius,auth.organization.id).run();
  return json({geofence:{enabled,latitude:lat,longitude:lng,radiusMeters:radius}},200,cors);
}

async function uniqueUsername(env,orgId,displayName){
  const parts=String(displayName).trim().toLowerCase().replace(/[^a-z0-9\s-]/g,'').split(/\s+/).filter(Boolean);let base=parts.length>1?`${parts[0][0]}${parts[parts.length-1]}`:parts[0]||'employee';base=normalizeUsername(base).slice(0,12)||'employee';let candidate=base,n=2;
  while(await env.DB.prepare('SELECT id FROM users WHERE organization_id=? AND username=? COLLATE NOCASE').bind(orgId,candidate).first()){candidate=`${base.slice(0,Math.max(1,12-String(n).length))}${n}`;n++;}
  return candidate;
}
async function listEmployees(auth,env,cors){
  requireAdmin(auth);const r=await env.DB.prepare(`SELECT u.id,u.username,u.display_name,u.job_title,u.active,
    EXISTS(SELECT 1 FROM time_entries t WHERE t.user_id=u.id AND t.clock_out_at IS NULL) AS clocked_in,
    (SELECT COALESCE(t.clock_out_at,t.clock_in_at) FROM time_entries t WHERE t.user_id=u.id ORDER BY t.clock_in_at DESC LIMIT 1) AS last_clock_event
    FROM users u WHERE u.organization_id=? AND u.role='employee' ORDER BY u.active DESC,u.display_name COLLATE NOCASE`).bind(auth.organization.id).all();
  return json({employees:(r.results||[]).map(x=>({id:x.id,username:x.username,displayName:x.display_name,jobTitle:x.job_title,active:!!x.active,clockedIn:!!x.clocked_in,lastClockEvent:x.last_clock_event}))},200,cors);
}
async function createEmployee(request,auth,env,cors){
  requireAdmin(auth);const b=await bodyJson(request);const displayName=String(b.displayName||'').trim();const jobTitle=String(b.jobTitle||'').trim();if(!displayName)throw new HttpError(400,'Employee name is required.');const username=await uniqueUsername(env,auth.organization.id,displayName);const pin=randomPin();const cred=await makeCredential(pin,env);const id=crypto.randomUUID(),now=nowIso();
  await env.DB.prepare('INSERT INTO users(id,organization_id,username,display_name,job_title,role,credential_hash,credential_salt,active,created_at,updated_at) VALUES(?,?,?,?,?,\'employee\',?,?,1,?,?)').bind(id,auth.organization.id,username,displayName,jobTitle,cred.hash,cred.salt,now,now).run();
  return json({employee:{id,username,displayName,jobTitle,active:true},initialPin:pin},201,cors);
}
async function updateEmployee(request,auth,env,cors,id){
  requireAdmin(auth);const current=await env.DB.prepare('SELECT * FROM users WHERE id=? AND organization_id=? AND role=\'employee\'').bind(id,auth.organization.id).first();if(!current)throw new HttpError(404,'Employee not found.');const b=await bodyJson(request);
  let displayName=b.displayName===undefined?current.display_name:String(b.displayName||'').trim();let jobTitle=b.jobTitle===undefined?current.job_title:String(b.jobTitle||'').trim();let username=b.username===undefined?current.username:normalizeUsername(b.username);let active=b.active===undefined?!!current.active:!!b.active;if(!displayName||username.length<2)throw new HttpError(400,'Employee name and username are required.');
  const collision=await env.DB.prepare('SELECT id FROM users WHERE organization_id=? AND username=? COLLATE NOCASE AND id<>?').bind(auth.organization.id,username,id).first();if(collision)throw new HttpError(409,'That username is already in use.');
  let hash=current.credential_hash,salt=current.credential_salt,generatedPin=null;if(b.newPin){validateEmployeePin(b.newPin);const cred=await makeCredential(String(b.newPin),env);hash=cred.hash;salt=cred.salt;generatedPin=String(b.newPin);}
  await env.DB.prepare('UPDATE users SET username=?,display_name=?,job_title=?,active=?,credential_hash=?,credential_salt=?,failed_attempts=0,locked_until=NULL,updated_at=? WHERE id=?').bind(username,displayName,jobTitle,active?1:0,hash,salt,nowIso(),id).run();
  if(!active) await closeOpenEntryForDeactivation(env,id,auth.organization.id);
  return json({employee:{id,username,displayName,jobTitle,active},generatedPin},200,cors);
}
async function closeOpenEntryForDeactivation(env,userId,orgId){const open=await env.DB.prepare('SELECT id FROM time_entries WHERE user_id=? AND organization_id=? AND clock_out_at IS NULL').bind(userId,orgId).first();if(open)await env.DB.prepare('UPDATE time_entries SET clock_out_at=? WHERE id=?').bind(nowIso(),open.id).run();}
async function resetEmployeePin(auth,env,cors,id){
  requireAdmin(auth);const e=await env.DB.prepare('SELECT id,username,display_name,job_title,active FROM users WHERE id=? AND organization_id=? AND role=\'employee\'').bind(id,auth.organization.id).first();if(!e)throw new HttpError(404,'Employee not found.');const pin=randomPin();const cred=await makeCredential(pin,env);await env.DB.prepare('UPDATE users SET credential_hash=?,credential_salt=?,failed_attempts=0,locked_until=NULL,updated_at=? WHERE id=?').bind(cred.hash,cred.salt,nowIso(),id).run();return json({employee:{id:e.id,username:e.username,displayName:e.display_name,jobTitle:e.job_title,active:!!e.active},initialPin:pin},200,cors);
}

async function changePin(request,auth,env,cors){
  if(auth.user.role!=='employee')throw new HttpError(403,'Employee account required.');const b=await bodyJson(request);const current=String(b.currentPin||''),next=String(b.newPin||'');validateEmployeePin(current);validateEmployeePin(next);const oldHash=await hashCredential(current,auth.user.credential_salt,env.PIN_PEPPER);if(!safeEqual(oldHash,auth.user.credential_hash))throw new HttpError(401,'Current PIN is incorrect.');const cred=await makeCredential(next,env);await env.DB.prepare('UPDATE users SET credential_hash=?,credential_salt=?,failed_attempts=0,locked_until=NULL,updated_at=? WHERE id=?').bind(cred.hash,cred.salt,nowIso(),auth.user.id).run();return json({ok:true},200,cors);
}

function haversineMeters(lat1,lon1,lat2,lon2){const R=6371000,toRad=x=>x*Math.PI/180;const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
async function clock(request,auth,env,cors){
  if(auth.user.role!=='employee')throw new HttpError(403,'Employee account required.');const b=await bodyJson(request);const action=String(b.action||'').toLowerCase();const lat=Number(b.latitude),lng=Number(b.longitude),accuracy=b.accuracy==null?null:Number(b.accuracy);if(!['in','out'].includes(action))throw new HttpError(400,'Clock action must be in or out.');if(!Number.isFinite(lat)||!Number.isFinite(lng))throw new HttpError(400,'A valid GPS location is required to clock in or out.');
  const org=await env.DB.prepare('SELECT geofence_enabled,geofence_lat,geofence_lng,geofence_radius_m FROM organizations WHERE id=?').bind(auth.organization.id).first();let distance=null;if(org.geofence_enabled){if(org.geofence_lat==null||org.geofence_lng==null)throw new HttpError(409,'The employer enabled a GPS boundary but has not configured its location.');distance=haversineMeters(lat,lng,Number(org.geofence_lat),Number(org.geofence_lng));if(distance>Number(org.geofence_radius_m))throw new HttpError(403,'You are outside the approved clock-in/out area.',{distanceMeters:distance,radiusMeters:Number(org.geofence_radius_m)});}
  const open=await env.DB.prepare('SELECT id,clock_in_at FROM time_entries WHERE user_id=? AND organization_id=? AND clock_out_at IS NULL').bind(auth.user.id,auth.organization.id).first();const now=nowIso();
  if(action==='in'){if(open)throw new HttpError(409,'You are already clocked in.');const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO time_entries(id,organization_id,user_id,clock_in_at,clock_in_lat,clock_in_lng,clock_in_accuracy,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,auth.organization.id,auth.user.id,now,lat,lng,Number.isFinite(accuracy)?accuracy:null,now).run();return json({ok:true,action:'in',at:now,distanceMeters:distance},200,cors);}
  if(!open)throw new HttpError(409,'You are not currently clocked in.');await env.DB.prepare('UPDATE time_entries SET clock_out_at=?,clock_out_lat=?,clock_out_lng=?,clock_out_accuracy=? WHERE id=?').bind(now,lat,lng,Number.isFinite(accuracy)?accuracy:null,open.id).run();return json({ok:true,action:'out',at:now,distanceMeters:distance},200,cors);
}
async function employeeTime(auth,env,cors){
  if(auth.user.role!=='employee')throw new HttpError(403,'Employee account required.');const org=await env.DB.prepare('SELECT geofence_enabled,geofence_radius_m FROM organizations WHERE id=?').bind(auth.organization.id).first();const open=await env.DB.prepare('SELECT id,clock_in_at FROM time_entries WHERE user_id=? AND organization_id=? AND clock_out_at IS NULL').bind(auth.user.id,auth.organization.id).first();const r=await env.DB.prepare('SELECT id,clock_in_at,clock_out_at FROM time_entries WHERE user_id=? AND organization_id=? ORDER BY clock_in_at DESC LIMIT 12').bind(auth.user.id,auth.organization.id).all();
  return json({currentEntry:open?{id:open.id,clockInAt:open.clock_in_at}:null,geofence:{enabled:!!org.geofence_enabled,radiusMeters:org.geofence_radius_m},entries:(r.results||[]).map(x=>({id:x.id,clockInAt:x.clock_in_at,clockOutAt:x.clock_out_at}))},200,cors);
}
