const API = window.SamsonsClockAPI;
const cfg = window.SAMSONS_CLOCK_CONFIG || {};
const qs = new URLSearchParams(location.search);
let company = String(qs.get('company') || cfg.COMPANY_SLUG || '').trim().toLowerCase();
const tokenKey = `samsonsEmployeeClockToken:${company}`;
let token = sessionStorage.getItem(tokenKey) || '';
let me = null;
const $ = s => document.querySelector(s);

function setMessage(el,text='',type=''){el.textContent=text;el.className=`form-message${type?' '+type:''}`}
function api(path,options={}){return API.request(path,{...options,token:options.token??token})}
function formatDateTime(v){if(!v)return'—';return new Date(v).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
function duration(entry){const start=new Date(entry.clockInAt).getTime();const end=entry.clockOutAt?new Date(entry.clockOutAt).getTime():Date.now();const hrs=Math.max(0,(end-start)/3600000);return `${hrs.toFixed(2)} hr`;}

async function restore(){
  if(!API.configured()){ $('#employeeNotConfigured').classList.remove('hidden');$('#employeeLoginCard').classList.add('hidden');return; }
  $('#employeeNotConfigured').classList.add('hidden');
  const form=$('#employeeLoginForm'); form.elements.company.value=company;
  if(company){$('#companyField').classList.add('hidden');form.elements.company.required=false;$('#companyCodeHint').textContent=`Company: ${company}`;}
  if(!token)return;
  try{const r=await api('/api/me');if(r.user.role!=='employee')throw new Error('Not an employee account.');me=r;showApp();await refreshClock();}catch{sessionStorage.removeItem(tokenKey);token='';}
}

$('#employeeLoginForm').addEventListener('submit',async e=>{
  e.preventDefault();const f=e.currentTarget;const m=$('#employeeLoginMessage');setMessage(m,'Signing in…','info');
  company=String(f.elements.company.value||company).trim().toLowerCase();
  try{const r=await API.request('/api/login',{method:'POST',body:{company,username:String(f.elements.username.value||'').trim(),credential:String(f.elements.pin.value||'')}});if(r.user.role!=='employee')throw new Error('This is not an employee clock account.');token=r.token;sessionStorage.setItem(`samsonsEmployeeClockToken:${company}`,token);me=r;showApp();setMessage(m,'');await refreshClock();}catch(err){setMessage(m,err.message,'error');}
});
function showApp(){ $('#employeeLoginCard').classList.add('hidden');$('#employeeApp').classList.remove('hidden');$('#employeeName').textContent=me.user.displayName;$('#employeeRole').textContent=me.user.jobTitle||'Employee'; }
$('#employeeLogout').addEventListener('click',async()=>{try{await api('/api/logout',{method:'POST'});}catch{}sessionStorage.removeItem(`samsonsEmployeeClockToken:${company}`);location.reload();});

async function refreshClock(){
  try{const r=await api('/api/employee/time');renderClock(r);}catch(err){setMessage($('#clockMessage'),err.message,'error');}
}
function renderClock(r){
  const punch=$('.punch-card');punch.classList.toggle('clocked',!!r.currentEntry);
  $('#clockStateIcon').textContent=r.currentEntry?'✓':'○';
  $('#clockStatus').textContent=r.currentEntry?'Clocked in':'Off clock';
  $('#clockStatusDetail').textContent=r.currentEntry?`Since ${formatDateTime(r.currentEntry.clockInAt)}`:'GPS permission is required when you clock in or out.';
  $('#clockAction').textContent=r.currentEntry?'Clock Out':'Clock In';
  $('#clockAction').dataset.action=r.currentEntry?'out':'in';
  $('#gpsRuleText').textContent=r.geofence.enabled?`Your location must be within ${r.geofence.radiusMeters} meters of the approved work location.`:'Your location is recorded for the clock event, but no location boundary is enforced.';
  const entries=r.entries||[];
  $('#recentEntries').innerHTML=entries.length?entries.map(x=>`<div class="entry-row"><div><strong>${x.clockOutAt?'Completed shift':'Current shift'}</strong><span>In: ${formatDateTime(x.clockInAt)}${x.clockOutAt?` · Out: ${formatDateTime(x.clockOutAt)}`:''}</span></div><div class="entry-duration">${duration(x)}</div></div>`).join(''):'<p class="small-note">No time entries yet.</p>';
}

$('#clockAction').addEventListener('click',()=>{
  const action=$('#clockAction').dataset.action||'in';const m=$('#clockMessage');setMessage(m,'Requesting GPS location…','info');$('#clockAction').disabled=true;
  if(!navigator.geolocation){setMessage(m,'This browser does not support GPS location.','error');$('#clockAction').disabled=false;return;}
  navigator.geolocation.getCurrentPosition(async pos=>{
    try{
      setMessage(m,'Location received. Recording clock event…','info');
      const r=await api('/api/clock',{method:'POST',body:{action,latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy:pos.coords.accuracy}});
      const where=r.distanceMeters==null?'':` · ${Math.round(r.distanceMeters)}m from approved location`;
      setMessage(m,`${action==='in'?'Clocked in':'Clocked out'} successfully${where}.`,'success');await refreshClock();
    }catch(err){
      if(err.details?.distanceMeters!=null){setMessage(m,`${err.message} You are about ${Math.round(err.details.distanceMeters)}m away; the allowed radius is ${err.details.radiusMeters}m.`,'error');}
      else setMessage(m,err.message,'error');
    }finally{$('#clockAction').disabled=false;}
  },err=>{setMessage(m,geoErrorText(err),'error');$('#clockAction').disabled=false;},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
});

$('#changePinForm').addEventListener('submit',async e=>{
  e.preventDefault();const f=e.currentTarget;const m=$('#pinMessage');const currentPin=f.elements.currentPin.value;const newPin=f.elements.newPin.value;const confirmPin=f.elements.confirmPin.value;
  if(newPin!==confirmPin){setMessage(m,'The new PIN entries do not match.','error');return;}
  if(!/^\d{5}$/.test(newPin)){setMessage(m,'PIN must be exactly 5 numbers.','error');return;}
  setMessage(m,'Changing PIN…','info');
  try{await api('/api/change-pin',{method:'POST',body:{currentPin,newPin}});f.reset();setMessage(m,'PIN changed. Use the new PIN the next time you sign in.','success');}catch(err){setMessage(m,err.message,'error');}
});

function geoErrorText(err){if(err.code===1)return 'Location permission is required to clock in or out. Open your browser/site settings, allow Location, and try again.';if(err.code===2)return 'Your phone could not determine its location. Turn on Location Services and try again.';if(err.code===3)return 'Location lookup timed out. Try again.';return err.message||'Could not get your location.'}
restore();
