const API = window.SamsonsClockAPI;
const config = window.SAMSONS_CLOCK_CONFIG || {};
const tokenKey = 'samsonsClockAdminToken';
let adminToken = sessionStorage.getItem(tokenKey) || '';
let currentCompany = new URLSearchParams(location.search).get('company') || config.COMPANY_SLUG || '';
let adminMe = null;
let employees = [];

const $ = (s) => document.querySelector(s);
const loginCard = $('#adminLoginCard');
const app = $('#adminApp');
const notConfigured = $('#notConfigured');
const loginForm = $('#adminLoginForm');
const loginMessage = $('#adminLoginMessage');
const employeeModal = $('#secureEmployeeModal');
const employeeForm = $('#secureEmployeeForm');
const credentialModal = $('#credentialModal');

function setMessage(el, text = '', type = '') { el.textContent = text; el.className = `form-message${type ? ' ' + type : ''}`; }
function openBackdrop(el){ el.classList.add('open'); el.setAttribute('aria-hidden','false'); }
function closeBackdrop(el){ el.classList.remove('open'); el.setAttribute('aria-hidden','true'); }
function formatWhen(value){ if(!value) return '—'; const d=new Date(value); return d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }
function normalizeCompany(value){ return String(value||'').trim().toLowerCase(); }

function updatePortalLink(){
  const url = new URL('employee.html', location.href);
  url.searchParams.set('company', currentCompany);
  $('#portalUrl').value = url.href;
  $('#employeePortalLink').href = url.href;
}

async function api(path, options={}) { return API.request(path, {...options, token: options.token ?? adminToken}); }

async function restoreSession(){
  if (!API.configured()) { notConfigured.classList.remove('hidden'); loginCard.classList.add('hidden'); return; }
  notConfigured.classList.add('hidden');
  loginForm.elements.company.value = currentCompany;
  updatePortalLink();
  if (!adminToken) return;
  try {
    const result = await api('/api/me');
    if (result.user.role !== 'admin') throw new Error('This account is not an administrator.');
    adminMe = result;
    currentCompany = result.organization.slug;
    showAdmin();
    await refreshAdmin();
  } catch (err) {
    sessionStorage.removeItem(tokenKey); adminToken='';
  }
}

function showAdmin(){
  loginCard.classList.add('hidden'); app.classList.remove('hidden'); $('#adminLogout').classList.remove('hidden');
  $('#adminCompanyName').textContent = adminMe.organization.name;
  $('#adminIdentity').textContent = `${adminMe.user.displayName} · ${adminMe.user.username}`;
  updatePortalLink();
}

loginForm.addEventListener('submit', async e => {
  e.preventDefault(); setMessage(loginMessage,'Signing in…','info');
  const fd=new FormData(loginForm);
  currentCompany=normalizeCompany(fd.get('company'));
  try{
    const result=await API.request('/api/login',{method:'POST',body:{company:currentCompany,username:String(fd.get('username')||'').trim(),credential:String(fd.get('password')||'')}});
    if(result.user.role!=='admin') throw new Error('This login is not an administrator account.');
    adminToken=result.token; sessionStorage.setItem(tokenKey,adminToken); adminMe=result; showAdmin(); setMessage(loginMessage,''); await refreshAdmin();
  }catch(err){ setMessage(loginMessage,err.message,'error'); }
});

$('#adminLogout').addEventListener('click',async()=>{ try{await api('/api/logout',{method:'POST'});}catch{} sessionStorage.removeItem(tokenKey); adminToken=''; adminMe=null; location.reload(); });

async function refreshAdmin(){ await Promise.all([loadSettings(),loadEmployees()]); }

async function loadSettings(){
  const result=await api('/api/admin/settings');
  const f=$('#geoForm');
  f.elements.enabled.checked=!!result.geofence.enabled;
  f.elements.latitude.value=result.geofence.latitude ?? '';
  f.elements.longitude.value=result.geofence.longitude ?? '';
  f.elements.radius.value=result.geofence.radiusMeters ?? 150;
  updateGeoBadge(!!result.geofence.enabled);
}
function updateGeoBadge(enabled){ const b=$('#geoStateBadge'); b.textContent=enabled?'Boundary on':'Boundary off'; b.style.background=enabled?'#e8f5ef':'#eef1f5'; b.style.color=enabled?'#16794a':'#596579'; }

$('#useCurrentLocation').addEventListener('click',()=>{
  const m=$('#geoMessage'); setMessage(m,'Requesting your current location…','info');
  if(!navigator.geolocation){ setMessage(m,'This browser does not support geolocation.','error'); return; }
  navigator.geolocation.getCurrentPosition(pos=>{
    $('#geoForm').elements.latitude.value=pos.coords.latitude.toFixed(7);
    $('#geoForm').elements.longitude.value=pos.coords.longitude.toFixed(7);
    setMessage(m,`Location filled in. Reported accuracy: about ${Math.round(pos.coords.accuracy)} meters. Save the rule when ready.`,'success');
  },err=>setMessage(m,geoErrorText(err),'error'),{enableHighAccuracy:true,timeout:15000,maximumAge:0});
});

$('#geoForm').addEventListener('submit',async e=>{
  e.preventDefault(); const f=e.currentTarget; const m=$('#geoMessage'); setMessage(m,'Saving…','info');
  const enabled=f.elements.enabled.checked;
  const latitude=f.elements.latitude.value===''?null:Number(f.elements.latitude.value);
  const longitude=f.elements.longitude.value===''?null:Number(f.elements.longitude.value);
  const radiusMeters=Number(f.elements.radius.value)||150;
  if(enabled && (!Number.isFinite(latitude)||!Number.isFinite(longitude))){setMessage(m,'Choose a latitude and longitude before enabling the boundary.','error');return;}
  try{const r=await api('/api/admin/settings',{method:'PATCH',body:{geofenceEnabled:enabled,latitude,longitude,radiusMeters}});updateGeoBadge(r.geofence.enabled);setMessage(m,'GPS clock rule saved.','success');}catch(err){setMessage(m,err.message,'error');}
});

async function loadEmployees(){
  const result=await api('/api/admin/employees'); employees=result.employees||[]; renderEmployees();
}
function renderEmployees(){
  const list=$('#employeeAdminList');
  if(!employees.length){list.innerHTML='<div class="secure-employee-card"><h3>No employees yet</h3><p>Add the first employee to generate their username and PIN.</p></div>';return;}
  list.innerHTML=employees.map(e=>`<article class="secure-employee-card ${e.active?'':'inactive-card'}">
    <div class="secure-employee-head"><div><h3>${escapeHtml(e.displayName)}</h3><p>${escapeHtml(e.jobTitle||'Employee')}</p></div><span class="status-pill ${e.clockedIn?'status-live':'status-off'}">${e.active?(e.clockedIn?'Clocked in':'Off clock'):'Inactive'}</span></div>
    <div class="credential-meta"><div><span>Username</span><strong>${escapeHtml(e.username)}</strong></div><div><span>Last clock event</span><strong>${escapeHtml(formatWhen(e.lastClockEvent))}</strong></div></div>
    <div class="secure-actions"><button class="row-action edit-employee-action" data-edit-secure="${e.id}" type="button">Edit</button><button class="row-action" data-reset-pin="${e.id}" type="button">Reset PIN</button><button class="danger-button" data-toggle-employee="${e.id}" type="button">${e.active?'Remove':'Restore'}</button></div>
  </article>`).join('');
  list.querySelectorAll('[data-edit-secure]').forEach(b=>b.addEventListener('click',()=>openEmployeeEditor(b.dataset.editSecure)));
  list.querySelectorAll('[data-reset-pin]').forEach(b=>b.addEventListener('click',()=>resetPin(b.dataset.resetPin)));
  list.querySelectorAll('[data-toggle-employee]').forEach(b=>b.addEventListener('click',()=>toggleEmployee(b.dataset.toggleEmployee)));
}

$('#addSecureEmployee').addEventListener('click',()=>openEmployeeEditor());
function openEmployeeEditor(id=null){
  employeeForm.reset(); setMessage($('#employeeFormMessage'),''); employeeForm.elements.employeeId.value='';
  const editing=id!==null;
  document.querySelectorAll('.edit-only').forEach(x=>x.classList.toggle('hidden',!editing));
  document.querySelectorAll('.add-only').forEach(x=>x.classList.toggle('hidden',editing));
  if(editing){
    const e=employees.find(x=>x.id===id); if(!e)return;
    $('#secureEmployeeTitle').textContent='Edit employee'; $('#saveSecureEmployee').textContent='Save changes';
    employeeForm.elements.employeeId.value=e.id; employeeForm.elements.displayName.value=e.displayName; employeeForm.elements.jobTitle.value=e.jobTitle||''; employeeForm.elements.username.value=e.username; employeeForm.elements.newPin.value='';
  } else { $('#secureEmployeeTitle').textContent='Add employee'; $('#saveSecureEmployee').textContent='Add employee'; }
  openBackdrop(employeeModal); setTimeout(()=>employeeForm.elements.displayName.focus(),0);
}
function closeEmployeeEditor(){closeBackdrop(employeeModal)}
$('#closeSecureEmployee').addEventListener('click',closeEmployeeEditor);$('#cancelSecureEmployee').addEventListener('click',closeEmployeeEditor);employeeModal.addEventListener('pointerdown',e=>{if(e.target===employeeModal)closeEmployeeEditor()});

employeeForm.addEventListener('submit',async e=>{
  e.preventDefault(); const fd=new FormData(employeeForm); const id=String(fd.get('employeeId')||''); const m=$('#employeeFormMessage'); setMessage(m,'Saving…','info');
  const body={displayName:String(fd.get('displayName')||'').trim(),jobTitle:String(fd.get('jobTitle')||'').trim()};
  try{
    if(id){ body.username=String(fd.get('username')||'').trim(); const pin=String(fd.get('newPin')||'').trim(); if(pin) body.newPin=pin; const result=await api(`/api/admin/employees/${encodeURIComponent(id)}`,{method:'PATCH',body}); closeEmployeeEditor(); if(result.generatedPin) showCredentials(result.employee.username,result.generatedPin); }
    else { const result=await api('/api/admin/employees',{method:'POST',body}); closeEmployeeEditor(); showCredentials(result.employee.username,result.initialPin); }
    await loadEmployees();
  }catch(err){setMessage(m,err.message,'error');}
});

async function resetPin(id){
  const e=employees.find(x=>x.id===id); if(!e)return;
  if(!confirm(`Generate a new 5-digit PIN for ${e.displayName}? Their old PIN will stop working immediately.`))return;
  try{const r=await api(`/api/admin/employees/${encodeURIComponent(id)}/reset-pin`,{method:'POST'});showCredentials(r.employee.username,r.initialPin);}catch(err){alert(err.message);}
}
async function toggleEmployee(id){
  const e=employees.find(x=>x.id===id); if(!e)return;
  const next=!e.active; const wording=next?'restore':'remove';
  if(!confirm(`${wording[0].toUpperCase()+wording.slice(1)} ${e.displayName}? ${next?'They will be able to sign in again.':'Their login will be disabled, but past time records are preserved.'}`))return;
  try{await api(`/api/admin/employees/${encodeURIComponent(id)}`,{method:'PATCH',body:{active:next}});await loadEmployees();}catch(err){alert(err.message);}
}

function showCredentials(username,pin){ $('#credentialUsername').textContent=username; $('#credentialPin').textContent=pin; openBackdrop(credentialModal); }
function closeCredentials(){closeBackdrop(credentialModal);$('#credentialPin').textContent='';}
$('#closeCredentialModal').addEventListener('click',closeCredentials);$('#doneCredentials').addEventListener('click',closeCredentials);credentialModal.addEventListener('pointerdown',e=>{if(e.target===credentialModal)closeCredentials()});
$('#copyCredentials').addEventListener('click',async()=>{const text=`Username: ${$('#credentialUsername').textContent}\nPIN: ${$('#credentialPin').textContent}\nClock in: ${$('#portalUrl').value}`;await navigator.clipboard.writeText(text);$('#copyCredentials').textContent='Copied';setTimeout(()=>$('#copyCredentials').textContent='Copy credentials',1400);});
$('#copyPortalUrl').addEventListener('click',async()=>{await navigator.clipboard.writeText($('#portalUrl').value);$('#copyPortalUrl').textContent='Copied';setTimeout(()=>$('#copyPortalUrl').textContent='Copy',1400);});

function geoErrorText(err){ if(err.code===1)return 'Location permission was denied. Allow location access in the browser and try again.'; if(err.code===2)return 'Your device could not determine its location. Try again where GPS/Wi-Fi signal is stronger.'; if(err.code===3)return 'Location lookup timed out. Try again.'; return err.message||'Could not get location.'; }
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
restoreSession();
