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
function setGpsDiagnostic(text,type='') { const el=$('#gpsDiagnostic'); if(!el)return; el.textContent=text; el.className=`gps-diagnostic${type?' '+type:''}`; }

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

function positionAttempt(options){return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,options));}
async function getPhoneLocation(){
  if(!window.isSecureContext) throw new Error('Location requires a secure HTTPS page. Open the hosted HTTPS employee link rather than a downloaded/local copy.');
  if(!navigator.geolocation) throw new Error('This browser does not support GPS location.');
  let permission='unknown';
  try{if(navigator.permissions?.query){const p=await navigator.permissions.query({name:'geolocation'});permission=p.state;if(p.state==='denied')throw new Error('Location is blocked for this site. Open your browser site settings, set Location to Allow, then reload this page.');}}catch(err){if(String(err.message||'').startsWith('Location is blocked'))throw err;}
  try{
    const pos=await positionAttempt({enableHighAccuracy:true,timeout:20000,maximumAge:0});
    return {pos,mode:'high accuracy',permission};
  }catch(firstErr){
    // Phones can fail a fresh high-accuracy fix indoors. Retry using network/cached location.
    try{
      const pos=await positionAttempt({enableHighAccuracy:false,timeout:20000,maximumAge:60000});
      return {pos,mode:'fallback',permission};
    }catch(secondErr){
      const err=secondErr||firstErr;throw new Error(geoErrorText(err));
    }
  }
}

async function testGps(){
  const btn=$('#gpsTestButton');btn.disabled=true;setGpsDiagnostic('Checking phone location…');
  try{const {pos,mode}=await getPhoneLocation();setGpsDiagnostic(`GPS ready · ±${Math.round(pos.coords.accuracy)}m accuracy${mode==='fallback'?' · fallback fix':''}`,'good');}
  catch(err){setGpsDiagnostic(err.message,'bad');}
  finally{btn.disabled=false;}
}
$('#gpsTestButton')?.addEventListener('click',testGps);

$('#clockAction').addEventListener('click',async()=>{
  const action=$('#clockAction').dataset.action||'in';const m=$('#clockMessage');$('#clockAction').disabled=true;
  setMessage(m,'Requesting your phone location…','info');
  try{
    const {pos,mode}=await getPhoneLocation();
    setGpsDiagnostic(`GPS ready · ±${Math.round(pos.coords.accuracy)}m accuracy${mode==='fallback'?' · fallback fix':''}`,'good');
    setMessage(m,`Location received (±${Math.round(pos.coords.accuracy)}m). Recording clock event…`,'info');
    let r;
    try{r=await api('/api/clock',{method:'POST',body:{action,latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy:pos.coords.accuracy}});}
    catch(err){
      if(err.networkError){
        const health=await API.health();
        if(!health) throw new Error('Your phone found its location, but it could not reach the secure clock server. Check cellular/Wi-Fi and open this employee link directly in Chrome, Safari, or Edge instead of an email/text in-app browser.');
      }
      throw err;
    }
    const where=r.distanceMeters==null?'':` · ${Math.round(r.distanceMeters)}m from approved location`;
    setMessage(m,`${action==='in'?'Clocked in':'Clocked out'} successfully${where}.`,'success');await refreshClock();
  }catch(err){
    if(err.details?.distanceMeters!=null){setMessage(m,`${err.message} You are about ${Math.round(err.details.distanceMeters)}m away; the allowed radius is ${err.details.radiusMeters}m.`,'error');}
    else setMessage(m,err.message,'error');
  }finally{$('#clockAction').disabled=false;}
});

$('#changePinForm').addEventListener('submit',async e=>{
  e.preventDefault();const f=e.currentTarget;const m=$('#pinMessage');const currentPin=f.elements.currentPin.value;const newPin=f.elements.newPin.value;const confirmPin=f.elements.confirmPin.value;
  if(newPin!==confirmPin){setMessage(m,'The new PIN entries do not match.','error');return;}
  if(!/^\d{5}$/.test(newPin)){setMessage(m,'PIN must be exactly 5 numbers.','error');return;}
  setMessage(m,'Changing PIN…','info');
  try{await api('/api/change-pin',{method:'POST',body:{currentPin,newPin}});f.reset();setMessage(m,'PIN changed. Use the new PIN the next time you sign in.','success');}catch(err){setMessage(m,err.message,'error');}
});

function geoErrorText(err){
  const code=Number(err?.code||0),message=String(err?.message||'').toLowerCase();
  if(code===1||message.includes('permission')||message.includes('denied'))return 'Location permission is required. In your browser settings for this site, set Location to Allow, then try again.';
  if(code===2||message.includes('unavailable')||message.includes('network')||message.includes('fetch'))return 'Your phone could not get a location fix. Make sure Location Services are on, turn Wi-Fi or cellular data on, and try the GPS test again. If you opened this link inside Gmail, Messages, Facebook, or another app, open it directly in Chrome or Safari.';
  if(code===3||message.includes('timeout'))return 'Location lookup timed out. Move near a window or outdoors, make sure Location Services are on, and try again.';
  return err?.message||'Could not get your location.';
}
restore();
