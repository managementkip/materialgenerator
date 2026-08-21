const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const KEYS={url:'kip_gas_web_app_url',token:'kip_gas_session_token'};
const CURRICULUM_START='2026-08-31';
const state={token:sessionStorage.getItem(KEYS.token)||'',materials:[],date:'',health:null,pendingRun:null};

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function status(el,msg,kind='info'){el.textContent=msg;el.className='status '+kind;}
function clearStatus(el){el.textContent='';el.className='status hidden';}
function btnBusy(btn,label){const old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<span class="loader"></span>'+label;return()=>{btn.innerHTML=old;btn.disabled=false;};}
function gasUrl(){return(localStorage.getItem(KEYS.url)||'').trim();}
function validUrl(u){try{const x=new URL(u);return x.protocol==='https:'&&x.hostname==='script.google.com'&&/\/macros\/s\/.+\/exec$/.test(x.pathname);}catch{return false;}}
async function gas(action,payload={},auth=true){
  if(!validUrl(gasUrl()))throw new Error('Apps Script /exec URL is not configured.');
  const r=await fetch(gasUrl(),{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...(auth?{token:state.token}:{}),...payload})});
  const t=await r.text();let d;try{d=JSON.parse(t);}catch{throw new Error('Unreadable Apps Script response. Use the deployed /exec URL.');}
  if(!d.ok){if(['AUTH_REQUIRED','AUTH_EXPIRED'].includes(d.code)){state.token='';sessionStorage.removeItem(KEYS.token);showLogin();}const e=new Error(d.error||'Request failed');e.code=d.code;throw e;}return d;
}
function shortErr(e){const s=e?.message||String(e);return s.length>260?s.slice(0,257)+'…':s;}
function fmtDate(s){if(!s)return'—';const[y,m,d]=s.split('-').map(Number);return new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(new Date(Date.UTC(y,m-1,d,12)));}
function fmtTime(iso){if(!iso)return'—';const d=new Date(iso);if(isNaN(d))return iso;return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Jakarta'}).format(d)+' WIB';}
function expiryText(iso){if(!iso)return'—';const ms=new Date(iso).getTime()-Date.now();if(ms<=0)return'Expired';const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);return`${h}h ${m}m left`;}
function ymdToUtc(s){const[y,m,d]=s.split('-').map(Number);return new Date(Date.UTC(y,m-1,d,12));}
function utcToYmd(d){return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;}
function isWeekdayDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const day=ymdToUtc(s).getUTCDay();return day>=1&&day<=5;}
function validCurriculumDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&s>=CURRICULUM_START&&isWeekdayDate(s);}
function moveWeekday(s,delta){let d=ymdToUtc(s||CURRICULUM_START);do{d.setUTCDate(d.getUTCDate()+delta);}while([0,6].includes(d.getUTCDay()));const out=utcToYmd(d);return out<CURRICULUM_START?CURRICULUM_START:out;}

function showLogin(){$('#appView').classList.add('hidden');$('#loginView').classList.remove('hidden');$('#gasUrlInput').value=gasUrl();}
function showApp(){$('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');refreshHealth();}
$('#saveGasUrlBtn').onclick=()=>{const u=$('#gasUrlInput').value.trim();if(!validUrl(u))return status($('#loginStatus'),'Use the deployed Apps Script URL ending in /exec.','error');localStorage.setItem(KEYS.url,u);status($('#loginStatus'),'Connection saved only in this browser.','ok');};
$('#loginForm').onsubmit=async e=>{e.preventDefault();clearStatus($('#loginStatus'));const done=btnBusy($('#loginBtn'),'Signing in…');try{const d=await gas('login',{email:$('#loginEmail').value.trim(),password:$('#loginPassword').value},false);state.token=d.token;sessionStorage.setItem(KEYS.token,d.token);$('#loginPassword').value='';showApp();}catch(e){status($('#loginStatus'),shortErr(e),'error');}finally{done();}};
$('#logoutBtn').onclick=()=>{state.token='';sessionStorage.removeItem(KEYS.token);showLogin();};
async function checkSession(){if(!state.token||!validUrl(gasUrl()))return showLogin();try{await gas('auth');showApp();}catch{showLogin();}}

async function refreshHealth(){try{state.health=await gas('health');renderSchedule();const l=state.health.links||{};setLink($('#generationLogLink'),l.generationLog);setLink($('#driveFolderLink'),l.regularMaterial);}catch(e){status($('#globalStatus'),shortErr(e),'error');}}
function setLink(a,url){if(url){a.href=url;a.classList.remove('disabled');}else{a.removeAttribute('href');a.classList.add('disabled');}}
function renderSchedule(){const list=state.health?.schedule||[];$('#scheduleGrid').innerHTML=list.map((x,i)=>`<div class="schedule-item"><span>${esc(x.time)}</span><b>${esc(x.label)}</b><small>${i===0?'starts':'staggered +30m'} · Mon–Fri</small></div>`).join('');}

$('#prevDateBtn').onclick=()=>{$('#materialDate').value=moveWeekday($('#materialDate').value||CURRICULUM_START,-1);loadMaterials();};
$('#nextDateBtn').onclick=()=>{$('#materialDate').value=moveWeekday($('#materialDate').value||CURRICULUM_START,1);loadMaterials();};
$('#startDateBtn').onclick=()=>{$('#materialDate').value=CURRICULUM_START;loadMaterials();};
$('#materialDate').addEventListener('change',()=>{const d=$('#materialDate').value;if(d&&d<CURRICULUM_START){$('#materialDate').value=CURRICULUM_START;status($('#globalStatus'),'Curriculum production begins on Monday, 31 August 2026.','warn');return;}if(d&&!isWeekdayDate(d))status($('#globalStatus'),'Regular Material is weekdays only. Choose Monday–Friday.','warn');});
$('#loadBtn').onclick=loadMaterials;

async function loadMaterials(){
  const date=$('#materialDate').value;
  if(!date)return status($('#globalStatus'),'Choose a curriculum material date.','warn');
  if(date<CURRICULUM_START)return status($('#globalStatus'),'The first curriculum material date is 31 August 2026.','warn');
  if(!isWeekdayDate(date))return status($('#globalStatus'),'Regular Material is generated on weekdays only. Choose Monday–Friday.','warn');
  const done=btnBusy($('#loadBtn'),'Loading…');clearStatus($('#globalStatus'));
  try{const d=await gas('materials',{date});state.date=date;state.materials=d.materials||[];renderMaterials();updateSummary();status($('#globalStatus'),`Loaded ${d.count}/5 materials for ${fmtDate(date)}. Source files open through Google Drive links to keep the dashboard fast.`,'ok');}
  catch(e){status($('#globalStatus'),shortErr(e),'error');}
  finally{done();}
}

function prod(entry){return entry.production||{p1:{status:'NOT_STARTED',version:0},p2:{status:'NOT_STARTED',version:0},pdf:{status:'NOT_STARTED',version:0},qcStatus:'PENDING'};}
function badgeClass(s){s=String(s||'');if(['DONE','READY','APPROVED'].includes(s))return'ok';if(s.includes('RUNNING')||s==='BUILDING')return'work';if(s==='ERROR')return'bad';return'';}
function sourceLink(p,page){if(!p.driveUrl||p.expired)return`<button class="btn btn-ghost" disabled>Source unavailable</button>`;return`<a class="btn btn-navy" href="${esc(p.driveUrl)}" target="_blank" rel="noopener">Open Page ${page} source ↗</a>`;}
function assetCard(entry,page){
  const p=prod(entry)[page===1?'p1':'p2'];
  const label=p.status==='ERROR'?'Retry':p.version?'Regenerate':'Generate manually';
  return `<div class="asset-card"><div class="asset-head"><b>Page ${page}</b><span class="pill ${badgeClass(p.status)}">${esc(p.status)}</span></div><div class="asset-meta"><span>v${p.version||0}</span><span>${p.generatedAt?fmtTime(p.generatedAt):'Not generated'}</span><span class="${p.expired?'expired':''}">${p.expiresAt?expiryText(p.expiresAt):'18h retention after generation'}</span></div><div class="asset-actions">${sourceLink(p,page)}<button class="btn btn-red" data-action="regen" data-page="${page}" ${entry.ready?'':'disabled'}>${label} P${page}</button></div><p class="drive-note">Source is stored in Drive. New files are shared for view by link when Google Workspace policy allows it.</p></div>`;
}
function card(entry){
  if(!entry.material)return`<article class="material panel missing"><b>${esc(entry.label)}</b><p>${esc(entry.error||'No material')}</p></article>`;
  const m=entry.material,p=prod(entry),pdf=p.pdf||{};
  return `<article class="material panel" data-id="${esc(m.materialId)}" data-key="${esc(entry.key)}"><div class="material-top"><div><span class="level">${esc(m.level)}</span><h3>${esc(m.topic)}</h3><p>${esc(m.theme)}</p></div><div class="schedule-time">${esc(entry.scheduleTime)} WIB</div></div><div class="chips"><span>${fmtDate(m.date)}</span><span>Week ${esc(m.week)}</span><span>Meeting ${esc(m.meeting)}</span><span>${esc(m.materialId)}</span></div>${p.continuityWarning?`<div class="warning">⚠ ${esc(p.continuityWarning)}</div>`:''}${p.lastError?`<div class="error-box">${esc(p.lastError)}</div>`:''}<div class="asset-grid">${assetCard(entry,1)}${assetCard(entry,2)}</div><div class="pdf-row"><div><b>Final PDF</b><span class="pill ${badgeClass(pdf.status)}">${esc(pdf.status||'NOT_STARTED')}</span><small>${pdf.version?`v${pdf.version} · full-page source images · P1v${pdf.sourceP1Version} + P2v${pdf.sourceP2Version}`:'Built automatically after both pages'}</small></div><div class="pdf-actions">${pdf.driveUrl?`<a href="${esc(pdf.driveUrl)}" target="_blank" rel="noopener" class="btn btn-navy">Open PDF in Drive ↗</a>`:''}<button class="btn btn-ghost" data-action="pdf" ${(p.p1?.expired||p.p2?.expired||!p.p1?.fileId||!p.p2?.fileId)?'disabled':''}>Rebuild PDF</button><button class="btn ${p.qcStatus==='APPROVED'?'btn-ok':'btn-ghost'}" data-action="qc" ${pdf.status==='READY'?'':'disabled'}>${p.qcStatus==='APPROVED'?'✓ QC Approved':'Approve QC'}</button></div></div><div class="card-foot"><button class="btn btn-ghost" data-action="run">Run level manually</button><span>Manual Run shows a confirmation panel first. The backend skips already completed or already auto-attempted pages.</span></div></article>`;
}
function renderMaterials(){const g=$('#materialsGrid');g.innerHTML=state.materials.length?state.materials.map(card).join(''):`<div class="empty panel"><b>Load a curriculum date</b></div>`;bindCards();}
function findEntry(id){return state.materials.find(x=>x.material?.materialId===id);}
function bindCards(){$$('.material[data-id]').forEach(c=>c.onclick=async e=>{const t=e.target.closest('[data-action]');if(!t)return;const entry=findEntry(c.dataset.id);if(!entry)return;const a=t.dataset.action,page=Number(t.dataset.page||0);if(a==='regen')await regen(entry,page);if(a==='pdf')await rebuildPdf(entry);if(a==='qc')await qc(entry);if(a==='run')openRunModal(entry);});}
async function refreshEntry(entry){const d=await gas('materials',{date:state.date});state.materials=d.materials||[];renderMaterials();updateSummary();return state.materials.find(x=>x.material?.materialId===entry.material.materialId);}

async function regen(entry,page){
  const p=prod(entry)[page===1?'p1':'p2'];const verb=p.status==='ERROR'?'Retry':'Regenerate';
  if(!confirm(`${verb} Page ${page}?\n\nThis makes exactly ONE new paid OpenAI image request. The other page will NOT be regenerated. Existing image versions remain until their own 18-hour expiry.`))return;
  status($('#globalStatus'),`${verb} Page ${page} for ${entry.label}…`,'info');
  try{await gas('regenerate',{materialId:entry.material.materialId,page});await refreshEntry(entry);status($('#globalStatus'),`Page ${page} finished. If both sources exist, the PDF was rebuilt without another OpenAI image call.`,'ok');}
  catch(e){await refreshEntry(entry).catch(()=>{});status($('#globalStatus'),shortErr(e),'error');}
}
async function rebuildPdf(entry){if(!confirm('Rebuild this PDF from the current Page 1 + Page 2?\n\nThis does NOT call OpenAI. Each generated source image will fill one PDF page edge-to-edge.'))return;try{await gas('rebuildPdf',{materialId:entry.material.materialId});await refreshEntry(entry);status($('#globalStatus'),'Full-page PDF rebuilt and saved to Google Drive.','ok');}catch(e){status($('#globalStatus'),shortErr(e),'error');}}
async function qc(entry){const approved=prod(entry).qcStatus==='APPROVED';try{await gas('qc',{materialId:entry.material.materialId,status:approved?'PENDING':'APPROVED'});await refreshEntry(entry);status($('#globalStatus'),approved?'QC returned to pending.':'Final PDF approved.','ok');}catch(e){status($('#globalStatus'),shortErr(e),'error');}}

function openRunModal(entry){
  state.pendingRun=entry;clearStatus($('#runModalStatus'));
  const p=prod(entry);
  $('#runModalTitle').textContent=entry.material.topic||'Run level manually';
  $('#runModalDate').textContent=fmtDate(entry.material.date);
  $('#runModalLevel').textContent=entry.label;
  $('#runModalMaterialId').textContent=entry.material.materialId;
  $('#runModalP1').textContent=`${p.p1.status} · v${p.p1.version||0}${p.p1.autoAttempted?' · automatic attempt already used':''}`;
  $('#runModalP2').textContent=`${p.p2.status} · v${p.p2.version||0}${p.p2.autoAttempted?' · automatic attempt already used':''}`;
  $('#runModalPdf').textContent=`${p.pdf.status||'NOT_STARTED'} · ${p.pdf.version?`v${p.pdf.version}`:'will build after P1 + P2'}`;
  $('#confirmRunBtn').textContent='Run this level';$('#cancelRunBtn').textContent='Cancel';
  $('#confirmRunBtn').disabled=false;$('#cancelRunBtn').disabled=false;$('#closeRunModalBtn').disabled=false;
  $('#runModal').classList.remove('hidden');
}
function closeRunModal(){if($('#confirmRunBtn').disabled)return;state.pendingRun=null;$('#runModal').classList.add('hidden');}
$('#closeRunModalBtn').onclick=closeRunModal;$('#cancelRunBtn').onclick=closeRunModal;
$('#runModal').onclick=e=>{if(e.target.id==='runModal')closeRunModal();};
$('#confirmRunBtn').onclick=async()=>{
  const entry=state.pendingRun;if(!entry)return;
  const btn=$('#confirmRunBtn'),cancel=$('#cancelRunBtn'),close=$('#closeRunModalBtn');const done=btnBusy(btn,'Pipeline running…');cancel.disabled=true;close.disabled=true;
  status($('#runModalStatus'),'Running this level once. Please keep this panel open. Duplicate protection is active; there are no automatic retries.','info');
  try{const d=await gas('runLevelNow',{date:state.date,levelKey:entry.key});await refreshEntry(entry);status($('#runModalStatus'),d.message||'Manual production pipeline finished. Check the Drive source links and final PDF.','ok');status($('#globalStatus'),`${entry.label}: manual production finished. Review the Drive links and PDF.`,'ok');}
  catch(e){await refreshEntry(entry).catch(()=>{});status($('#runModalStatus'),shortErr(e),'error');status($('#globalStatus'),shortErr(e),'error');}
  finally{done();btn.textContent='Run again safely';btn.disabled=false;cancel.textContent='Close';cancel.disabled=false;close.disabled=false;}
};

function updateSummary(){const valid=state.materials.filter(x=>x.material);const n=k=>valid.filter(x=>prod(x)[k]?.status===(k==='pdf'?'READY':'DONE')).length;$('#summaryLoaded').textContent=`${valid.length} / 5`;$('#summaryP1').textContent=`${n('p1')} / 5`;$('#summaryP2').textContent=`${n('p2')} / 5`;$('#summaryPdf').textContent=`${n('pdf')} / 5`;$('#summaryQc').textContent=`${valid.filter(x=>prod(x).qcStatus==='APPROVED').length} / 5`;}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#runModal').classList.contains('hidden'))closeRunModal();});
setInterval(()=>{if(state.materials.length){renderMaterials();updateSummary();}},60000);

$('#materialDate').value=CURRICULUM_START;
checkSession();
