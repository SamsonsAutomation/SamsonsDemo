const KEY='samsonsDemoV1';
const seed={
  leads:[
    {id:1,name:'Megan Cole',phone:'207-555-0164',need:'Heat pump estimate',status:'New',followup:offsetDate(0),value:3200},
    {id:2,name:'Robert Lane',phone:'207-555-0191',need:'Panel upgrade',status:'Contacted',followup:offsetDate(1),value:2400},
    {id:3,name:'Pine Street Office',phone:'207-555-0127',need:'Quarterly service agreement',status:'Estimate Sent',followup:offsetDate(2),value:4800},
    {id:4,name:'Alicia Grant',phone:'207-555-0182',need:'Emergency repair follow-up',status:'Won',followup:offsetDate(7),value:950},
    {id:5,name:'North Ridge Storage',phone:'207-555-0105',need:'Parking lot lighting quote',status:'Suspended',previousStatus:'Contacted',followup:offsetDate(14),value:1750}
  ],
  employees:[
    {id:1,name:'Chris Walker',role:'Field Technician',hours:38.5,rate:27,clocked:true,startedAt:Date.now()-1000*60*96},
    {id:2,name:'Jordan Brooks',role:'Installer',hours:42.25,rate:25,clocked:false,startedAt:null},
    {id:3,name:'Taylor Reed',role:'Crew Lead',hours:40,rate:31,clocked:true,startedAt:Date.now()-1000*60*54}
  ]
};
const ACTIVE_STAGES=['New','Contacted','Estimate Sent','Won'];
const CLOSED_STAGES=['Won','Lost','Suspended'];

function offsetDate(days){const d=new Date();d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)}
function clone(v){return JSON.parse(JSON.stringify(v))}
let state=load();let filter='All';
function load(){
  try{
    const loaded=JSON.parse(localStorage.getItem(KEY));
    if(!loaded) return clone(seed);
    loaded.leads=(loaded.leads||[]).map(l=>({...l,previousStatus:l.previousStatus||null}));
    return loaded;
  }catch{return clone(seed)}
}
function save(){localStorage.setItem(KEY,JSON.stringify(state));renderAll()}
function money(n){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n)}
function shortDate(s){const d=new Date(s+'T12:00:00');return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}
function payrollRows(){return state.employees.map(e=>{const h=e.hours+(e.clocked&&e.startedAt?(Date.now()-e.startedAt)/3600000:0);const reg=Math.min(40,h);const ot=Math.max(0,h-40);return {...e,totalHours:h,regular:reg,ot,gross:reg*e.rate+ot*e.rate*1.5}})}
const views={overview:document.querySelector('#overviewView'),leads:document.querySelector('#leadsView'),time:document.querySelector('#timeView'),payroll:document.querySelector('#payrollView')};
const titles={overview:'Operations Overview',leads:'Lead Follow-Up',time:'Timekeeping',payroll:'Payroll Ready'};
function switchView(name){Object.values(views).forEach(v=>v.classList.remove('active'));views[name].classList.add('active');document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.view===name));document.querySelector('#pageTitle').textContent=titles[name];document.querySelector('#sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});}
document.querySelectorAll('.nav-link').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.jump)));
document.querySelector('#menuButton').addEventListener('click',()=>document.querySelector('#sidebar').classList.toggle('open'));

function renderOverview(){
  const p=payrollRows();
  const open=state.leads.filter(l=>!CLOSED_STAGES.includes(l.status)).length;
  const due=state.leads.filter(l=>l.followup<=offsetDate(0)&&!CLOSED_STAGES.includes(l.status)).length;
  const suspended=state.leads.filter(l=>l.status==='Suspended').length;
  const on=state.employees.filter(e=>e.clocked).length;
  const gross=p.reduce((s,e)=>s+e.gross,0);
  document.querySelector('#metrics').innerHTML=[['Open leads',open],['Follow-ups due',due],['Suspended leads',suspended],['Clocked in',on],['Payroll gross',money(gross)]].map(([a,b])=>`<div class="metric"><span>${a}</span><strong>${b}</strong></div>`).join('');
  const leads=state.leads.filter(l=>!CLOSED_STAGES.includes(l.status)).sort((a,b)=>a.followup.localeCompare(b.followup)).slice(0,4);
  document.querySelector('#followupPreview').innerHTML=leads.map(l=>`<div class="mini-row"><div><strong>${l.name}</strong><span>${l.need} · ${shortDate(l.followup)}</span></div><span class="badge ${l.status.replaceAll(' ','-')}">${l.status}</span></div>`).join('')||'<p>No follow-ups due.</p>';
  document.querySelector('#clockPreview').innerHTML=state.employees.map(e=>`<div class="mini-row"><div><strong>${e.name}</strong><span>${e.role}</span></div><span class="badge ${e.clocked?'Won':'Contacted'}">${e.clocked?'Clocked in':'Off clock'}</span></div>`).join('')
}

function actionButtons(l){
  // Keep all three action slots present at all times. This prevents the buttons
  // from sliding under the mouse when a lead changes stage.
  if(l.status==='Suspended'){
    return `<div class="lead-actions">
      <button class="row-action" type="button" disabled title="Suspended leads cannot move backward until reactivated">← Back</button>
      <button class="row-action primary-row-action" type="button" disabled title="Suspended leads cannot advance until reactivated">Advance →</button>
      <button class="row-action reactivate-action" type="button" data-reactivate="${l.id}">Reactivate</button>
    </div>`;
  }
  const i=ACTIVE_STAGES.indexOf(l.status);
  const canBack=i>0;
  const canAdvance=i>=0&&i<ACTIVE_STAGES.length-1;
  const canSuspend=!['Won','Lost'].includes(l.status);
  return `<div class="lead-actions">
    <button class="row-action" type="button" ${canBack?`data-back="${l.id}"`:'disabled'} title="${canBack?'Move this lead back one stage':'This lead is already at the first stage'}">← Back</button>
    <button class="row-action primary-row-action" type="button" ${canAdvance?`data-advance="${l.id}"`:'disabled'} title="${canAdvance?'Move this lead forward one stage':'This lead cannot advance any further'}">Advance →</button>
    <button class="row-action suspend-action" type="button" ${canSuspend?`data-suspend="${l.id}"`:'disabled'} title="${canSuspend?'Pause follow-ups and mark this lead cold':'Closed leads cannot be suspended'}">Suspend</button>
  </div>`;
}

function renderLeads(){
  const rows=state.leads.filter(l=>filter==='All'||l.status===filter);
  document.querySelector('#leadTable').innerHTML=rows.map(l=>`<tr class="${l.status==='Suspended'?'suspended-row':''}"><td><strong>${l.name}</strong><br><span class="subtle">${l.phone||'No phone'}</span></td><td>${l.need}</td><td><span class="badge ${l.status.replaceAll(' ','-')}">${l.status}</span>${l.status==='Suspended'&&l.previousStatus?`<span class="status-note">Was ${l.previousStatus}</span>`:''}</td><td>${l.status==='Suspended'?'<span class="muted-cell">Paused</span>':shortDate(l.followup)}</td><td>${money(l.value)}</td><td>${actionButtons(l)}</td></tr>`).join('');
  document.querySelectorAll('[data-advance]').forEach(b=>b.addEventListener('click',()=>advanceLead(Number(b.dataset.advance))));
  document.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click',()=>deAdvanceLead(Number(b.dataset.back))));
  document.querySelectorAll('[data-suspend]').forEach(b=>b.addEventListener('click',()=>suspendLead(Number(b.dataset.suspend))));
  document.querySelectorAll('[data-reactivate]').forEach(b=>b.addEventListener('click',()=>reactivateLead(Number(b.dataset.reactivate))));
}
function advanceLead(id){
  const lead=state.leads.find(l=>l.id===id);if(!lead||lead.status==='Suspended')return;
  const i=ACTIVE_STAGES.indexOf(lead.status);if(i<0||i>=ACTIVE_STAGES.length-1)return;
  lead.status=ACTIVE_STAGES[i+1];
  lead.previousStatus=null;
  lead.followup=offsetDate(lead.status==='Won'?7:1);
  save();
}
function deAdvanceLead(id){
  const lead=state.leads.find(l=>l.id===id);if(!lead||lead.status==='Suspended')return;
  const i=ACTIVE_STAGES.indexOf(lead.status);if(i<=0)return;
  lead.status=ACTIVE_STAGES[i-1];
  lead.previousStatus=null;
  lead.followup=offsetDate(1);
  save();
}
function suspendLead(id){
  const lead=state.leads.find(l=>l.id===id);if(!lead||CLOSED_STAGES.includes(lead.status))return;
  if(!confirm(`Suspend ${lead.name}? This pauses follow-up reminders until the lead is reactivated.`))return;
  lead.previousStatus=lead.status;
  lead.status='Suspended';
  save();
}
function reactivateLead(id){
  const lead=state.leads.find(l=>l.id===id);if(!lead||lead.status!=='Suspended')return;
  const restored=ACTIVE_STAGES.includes(lead.previousStatus)&&lead.previousStatus!=='Won'?lead.previousStatus:'New';
  lead.status=restored;
  lead.previousStatus=null;
  lead.followup=offsetDate(1);
  save();
}
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderLeads()}));

function renderTime(){
  const p=payrollRows();
  document.querySelector('#employeeCards').innerHTML=state.employees.map(e=>`<div class="employee-card">
    <div class="employee-top">
      <div><strong>${e.name}</strong><p>${e.role} · $${e.rate.toFixed(2)}/hr</p></div>
      <span><i class="status-dot ${e.clocked?'on':'off'}"></i>${e.clocked?'In':'Out'}</span>
    </div>
    <button class="${e.clocked?'secondary-button':'primary-button'} employee-clock-button" data-clock="${e.id}">${e.clocked?'Clock out':'Clock in'}</button>
    <div class="employee-manager-actions">
      <button class="row-action edit-employee-action" type="button" data-edit-employee="${e.id}">Edit</button>
      <button class="row-action remove-employee-action" type="button" data-remove-employee="${e.id}">Remove</button>
    </div>
  </div>`).join('') || '<div class="panel"><p>No employees have been added yet.</p></div>';
  document.querySelector('#timeTable').innerHTML=p.map(e=>`<tr><td><strong>${e.name}</strong></td><td>${e.role}</td><td>${e.totalHours.toFixed(2)}</td><td>$${e.rate.toFixed(2)}/hr</td><td>${e.clocked?'Clocked in':'Off clock'}</td></tr>`).join('') || '<tr><td colspan="5">No employee hours to show.</td></tr>';
  document.querySelectorAll('[data-clock]').forEach(b=>b.addEventListener('click',()=>toggleClock(Number(b.dataset.clock))));
  document.querySelectorAll('[data-edit-employee]').forEach(b=>b.addEventListener('click',()=>openEmployeeModal(Number(b.dataset.editEmployee))));
  document.querySelectorAll('[data-remove-employee]').forEach(b=>b.addEventListener('click',()=>removeEmployee(Number(b.dataset.removeEmployee))));
}
function toggleClock(id){
  const e=state.employees.find(x=>x.id===id);if(!e)return;
  if(e.clocked&&e.startedAt){e.hours+=(Date.now()-e.startedAt)/3600000;e.startedAt=null;e.clocked=false}else{e.startedAt=Date.now();e.clocked=true}
  save();
}
function removeEmployee(id){
  const e=state.employees.find(x=>x.id===id);if(!e)return;
  const clockWarning=e.clocked?' They are currently clocked in.':'';
  if(!confirm(`Remove ${e.name} from the timekeeping system?${clockWarning} This removes their demo hours from the payroll-ready totals.`))return;
  state.employees=state.employees.filter(x=>x.id!==id);
  save();
}
function renderPayroll(){const p=payrollRows();const reg=p.reduce((s,e)=>s+e.regular,0);const ot=p.reduce((s,e)=>s+e.ot,0);const gross=p.reduce((s,e)=>s+e.gross,0);document.querySelector('#payrollMetrics').innerHTML=[['Regular hours',reg.toFixed(1)],['Overtime hours',ot.toFixed(1)],['Employees',p.length],['Gross wages',money(gross)]].map(([a,b])=>`<div class="metric"><span>${a}</span><strong>${b}</strong></div>`).join('');document.querySelector('#payrollTable').innerHTML=p.map(e=>`<tr><td><strong>${e.name}</strong></td><td>${e.regular.toFixed(2)}</td><td>${e.ot.toFixed(2)}</td><td>$${e.rate.toFixed(2)}</td><td>${money(e.gross)}</td></tr>`).join('')}
function renderAll(){renderOverview();renderLeads();renderTime();renderPayroll()}
const modal=document.querySelector('#leadModal');function openModal(){modal.classList.add('open');modal.setAttribute('aria-hidden','false')}function closeModal(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}

const employeeModal=document.querySelector('#employeeModal');
const employeeForm=document.querySelector('#employeeForm');
function openEmployeeModal(id=null){
  const title=document.querySelector('#employeeModalTitle');
  const saveButton=document.querySelector('#saveEmployeeButton');
  employeeForm.reset();
  employeeForm.elements.employeeId.value='';
  employeeForm.elements.employeeRate.value='25';
  employeeForm.elements.employeeHours.value='0';
  employeeForm.dataset.originalHoursValue='0';
  if(id!==null){
    const e=state.employees.find(x=>x.id===id);if(!e)return;
    const current=payrollRows().find(x=>x.id===id);
    employeeForm.elements.employeeId.value=String(e.id);
    employeeForm.elements.employeeName.value=e.name;
    employeeForm.elements.employeeRole.value=e.role;
    employeeForm.elements.employeeRate.value=e.rate;
    // Show accumulated hours through this moment. If currently clocked in, reset
    // the running timer after save so elapsed time is not double-counted.
    const displayedHours=current?current.totalHours.toFixed(2):e.hours.toFixed(2);
    employeeForm.elements.employeeHours.value=displayedHours;
    // Remember what was shown when the modal opened. If the manager only edits
    // the employee's name, role, or pay rate, we leave the underlying time data
    // completely untouched instead of rounding/re-writing it.
    employeeForm.dataset.originalHoursValue=displayedHours;
    title.textContent='Edit employee';
    saveButton.textContent='Save changes';
  }else{
    title.textContent='Add employee';
    saveButton.textContent='Add employee';
  }
  employeeModal.classList.add('open');
  employeeModal.setAttribute('aria-hidden','false');
  setTimeout(()=>employeeForm.elements.employeeName.focus(),0);
}
function closeEmployeeModal(){
  employeeModal.classList.remove('open');
  employeeModal.setAttribute('aria-hidden','true');
}

document.querySelector('#openLeadForm').addEventListener('click',openModal);
document.querySelector('#closeLeadForm').addEventListener('click',closeModal);
document.querySelector('#cancelLeadForm').addEventListener('click',closeModal);
// Close only when the pointer goes DOWN directly on the backdrop. This prevents
// dragging a text selection from inside the dialog onto the backdrop and then
// releasing the mouse from accidentally closing the modal.
modal.addEventListener('pointerdown',e=>{if(e.target===modal)closeModal()});

document.querySelector('#openEmployeeForm').addEventListener('click',()=>openEmployeeModal());
document.querySelector('#closeEmployeeForm').addEventListener('click',closeEmployeeModal);
document.querySelector('#cancelEmployeeForm').addEventListener('click',closeEmployeeModal);
// Same backdrop behavior for the employee editor: only the initial pointer-down
// outside the dialog closes it. Mouse-up/click after a drag will not.
employeeModal.addEventListener('pointerdown',e=>{if(e.target===employeeModal)closeEmployeeModal()});
employeeForm.addEventListener('submit',e=>{
  e.preventDefault();
  const fd=new FormData(e.currentTarget);
  const rawId=String(fd.get('employeeId')||'').trim();
  const id=rawId?Number(rawId):null;
  const name=String(fd.get('employeeName')||'').trim();
  const role=String(fd.get('employeeRole')||'').trim();
  const rate=Math.max(0,Number(fd.get('employeeRate'))||0);
  const hours=Math.max(0,Number(fd.get('employeeHours'))||0);
  if(!name||!role)return;
  if(id!==null){
    const employee=state.employees.find(x=>x.id===id);if(!employee)return;
    employee.name=name;
    employee.role=role;
    employee.rate=rate;
    const originalHoursValue=String(employeeForm.dataset.originalHoursValue||'');
    const submittedHoursValue=String(fd.get('employeeHours')||'').trim();
    const hoursWereEdited=submittedHoursValue!==originalHoursValue;
    if(hoursWereEdited){
      employee.hours=hours;
      // When the manager intentionally corrects the hour total while someone is
      // clocked in, that entered total becomes the new baseline as of this save.
      if(employee.clocked) employee.startedAt=Date.now();
    }
    // If hours were not touched, keep employee.hours and startedAt exactly as-is.
    // This prevents editing a name/role/rate from changing worked time by rounding.
  }else{
    state.employees.push({id:Date.now(),name,role,hours,rate,clocked:false,startedAt:null});
  }
  closeEmployeeModal();
  save();
});

document.querySelector('#leadForm').addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget);state.leads.unshift({id:Date.now(),name:fd.get('name'),phone:fd.get('phone'),need:fd.get('need'),status:'New',previousStatus:null,followup:offsetDate(Number(fd.get('followup'))),value:Number(fd.get('value'))||0});e.currentTarget.reset();closeModal();save()});
document.querySelector('#resetDemo').addEventListener('click',()=>{if(confirm('Reset all demo data?')){state=clone(seed);save();switchView('overview')}});
document.querySelector('#exportPayroll').addEventListener('click',()=>{const rows=payrollRows();const csv=['Employee,Role,Regular Hours,Overtime Hours,Hourly Rate,Gross Wages',...rows.map(e=>`"${e.name}","${e.role}",${e.regular.toFixed(2)},${e.ot.toFixed(2)},${e.rate.toFixed(2)},${e.gross.toFixed(2)}`)].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='payroll-ready-demo.csv';a.click();URL.revokeObjectURL(a.href)});
renderAll();setInterval(()=>{if(Object.values(views).some(v=>v.classList.contains('active'))) {renderOverview();renderTime();renderPayroll()}},30000);
