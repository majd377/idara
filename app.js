import { INITIAL_DATA } from './initial-data.js';

import {
  auth, provider, onAuthStateChanged, signInWithPopup, signOut,
  db, orgRef, orgCollection, orgDoc, doc, getDoc, getDocs, setDoc,
  addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, ADMIN_EMAIL
} from './firebase-init.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = {user:null,profile:null,view:'dashboard',periodId:null,data:{},loaded:false,loading:false};
const ROLES={admin:'مدير النظام',manager:'مدير',accountant:'محاسب',operator:'موظف قراءات',viewer:'مشاهد',resident:'ساكن',pending:'بانتظار الموافقة'};
const COLLECTIONS=['buildings','units','subscribers','meters','periods','readings','sources','energyReadings','costs','contributions','payments','ledger','members','waterSummary','seedDeletes','debts'];
const VIEW_NAMES={dashboard:'الرئيسية',periods:'الأسابيع والحساب',readings:'قراءات الماء',energy:'الكهرباء والمولدات',costs:'المصاريف والطوارئ',contributions:'المساهمات والخصومات',subscribers:'السكان والوحدات',payments:'الدفعات والأرصدة',debts:'الديون السابقة',reports:'التقارير والتصدير',settings:'الإعدادات والصلاحيات',guide:'دليل استخدام عملي',historical:'البيانات التاريخية'};
const money=v=>`${new Intl.NumberFormat('ar-PS',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0))} ₪`;
const num=v=>Number(v||0);
const fmt=(v,d=2)=>new Intl.NumberFormat('ar-PS',{maximumFractionDigits:d}).format(Number(v||0));
const dateNow=()=>new Date().toISOString().slice(0,10);
const safe=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const fmtDate=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
const roleName=r=>ROLES[r]||r||'—';

function toast(msg,type='success'){const e=$('#toast');if(!e)return;e.textContent=msg;e.className='toast '+(type==='error'?'error':'');clearTimeout(window.__toast);window.__toast=setTimeout(()=>e.className='toast hidden',3000);}
function openModal(html){$('#modalBody').innerHTML=html;$('#modal').classList.remove('hidden');$('#modal').setAttribute('aria-hidden','false');}
function closeModal(){if(!$('#modal'))return;$('#modal').classList.add('hidden');$('#modal').setAttribute('aria-hidden','true');$('#modalBody').innerHTML='';}
function can(...roles){return roles.includes(state.profile?.role);}
function statusBadge(s){const map={Draft:['مسودة','warn'],Calculated:['محسوبة','info'],Approved:['معتمدة','ok'],Closed:['مغلقة','ok'],Pending:['بانتظار','warn'],Entered:['مدخلة','ok'],Invalid:['غير صالحة','danger']};const x=map[s]||['—','info'];return `<span class="badge ${x[1]}">${x[0]}</span>`;}
function statusText(s){return ({Draft:'مسودة',Calculated:'محسوبة',Approved:'معتمدة',Closed:'مغلقة',Pending:'بانتظار',Entered:'مدخلة',Invalid:'غير صالحة'}[s]||s||'—');}
function empty(title,text=''){return `<div class="empty"><strong>${safe(title)}</strong><span>${safe(text)}</span></div>`;}
function buildingName(id){return state.data.buildings?.find(b=>b.id===id)?.name||'—';}
function unitForSub(s){return state.data.units?.find(u=>u.id===s?.unitId);}
function subscriberByMeter(m){return state.data.subscribers?.find(s=>s.id===m?.subscriberId);}
function balanceOf(id){return (state.data.ledger||[]).filter(x=>x.subscriberId===id).reduce((a,x)=>a+num(x.debit)-num(x.credit),0);}
function subscriberRow(s){const u=unitForSub(s);return {...s,unitCode:u?.code||'—',buildingName:buildingName(u?.buildingId),balance:balanceOf(s.id)};}
function periodById(id){return (state.data.periods||[]).find(p=>p.id===id);}
function selectedPeriod(){return periodById(state.periodId)||[...(state.data.periods||[])].sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate)))[0];}
function readingsForPeriod(pid){return (state.data.readings||[]).filter(r=>r.periodId===pid);}
function energyForPeriod(pid){return (state.data.energyReadings||[]).filter(r=>r.periodId===pid);}
function costsForPeriod(pid){return (state.data.costs||[]).filter(c=>c.periodId===pid);}

function upsertLocal(c,row){const a=state.data[c]||[];const i=a.findIndex(x=>x.id===row.id);if(i>=0)a[i]={...a[i],...row};else a.push(row);state.data[c]=a;state.loaded=true;}
function removeLocal(c,id){state.data[c]=(state.data[c]||[]).filter(x=>x.id!==id);state.loaded=true;}

async function loadData(force=false){
  if(state.loaded&&!force)return;
  if(state.loading)return;
  state.loading=true;
  try{const results=await Promise.all(COLLECTIONS.map(async c=>{const snap=await getDocs(orgCollection(c));return [c,snap.docs.map(d=>({id:d.id,...d.data()}))]}));for(const [c,rows] of results)state.data[c]=rows;state.loaded=true;}
  finally{state.loading=false;}
}

async function ensureProfile(){
  const ref=orgDoc('members',state.user.uid);const snap=await getDoc(ref);if(snap.exists())return {id:snap.id,...snap.data()};
  const isAdmin=(state.user.email||'').toLowerCase()===ADMIN_EMAIL.toLowerCase();const role=isAdmin?'admin':'pending';
  const data={displayName:state.user.displayName||'مستخدم',email:state.user.email||'',photoURL:state.user.photoURL||'',role,createdAt:serverTimestamp()};await setDoc(ref,data);return {id:ref.id,displayName:data.displayName,email:data.email,photoURL:data.photoURL,role};
}
function seedDeleteKey(collection,id){return `${collection}/${id}`;}
function seededItem(collection,id){
  return (INITIAL_DATA[collection]||[]).find(x=>x.id===id)||null;
}
function isSeededRecord(collection,row){
  return !!row?.seedKey || !!seededItem(collection,row?.id);
}
function seedTombstones(){
  return new Set((state.data.seedDeletes||[]).map(x=>x.key).filter(Boolean));
}
function mergeInitialDataIntoLocal(){
  const deleted=seedTombstones();
  for(const c of Object.keys(INITIAL_DATA)){
    if(!Array.isArray(INITIAL_DATA[c])) continue;
    if(!state.data[c]) state.data[c]=[];
    for(const row of INITIAL_DATA[c]){
      if(deleted.has(seedDeleteKey(c,row.id))) continue;
      if(!(state.data[c]||[]).some(x=>x.id===row.id)){
        state.data[c].push({...row});
      }
    }
  }
  state.loaded=true;
}
function findExistingBySeedMatch(collection, row, mapped={}){
  const rows=state.data[collection]||[];
  if(collection==='buildings') return rows.find(x=>String(x.code||'')===String(row.code||'')) || rows.find(x=>String(x.name||'')===String(row.name||''));
  if(collection==='units') return rows.find(x=>String(x.code||'')===String(row.code||'') && String(x.buildingId||'')===String(mapped.buildings?.[row.buildingId]||row.buildingId||'')) || rows.find(x=>String(x.code||'')===String(row.code||''));
  if(collection==='subscribers') return rows.find(x=>String(x.code||'')===String(row.code||''));
  if(collection==='meters') return rows.find(x=>String(x.meterCode||'')===String(row.meterCode||'')) || rows.find(x=>String(x.subscriberId||'')===String(mapped.subscribers?.[row.subscriberId]||row.subscriberId||''));
  if(collection==='sources') return rows.find(x=>String(x.code||'')===String(row.code||''));
  if(collection==='periods') return rows.find(x=>String(x.startDate||'')===String(row.startDate||'') && String(x.endDate||'')===String(row.endDate||''));
  if(collection==='readings'){
    const actualMeter=mapped.meters?.[row.meterKey]||row.meterId;
    return rows.find(x=>String(x.periodId||'')===String(mapped.periods?.[row.periodId]||row.periodId||'') && String(x.meterId||'')===String(actualMeter||''));
  }
  if(collection==='energyReadings'){
    const actualSource=mapped.sources?.[row.sourceKey]||row.sourceId;
    return rows.find(x=>String(x.periodId||'')===String(mapped.periods?.[row.periodId]||row.periodId||'') && String(x.sourceId||'')===String(actualSource||''));
  }
  if(collection==='costs'){
    return rows.find(x=>String(x.periodId||'')===String(mapped.periods?.[row.periodId]||row.periodId||'') && String(x.description||'')===String(row.description||'') && Number(x.amount||0)===Number(row.amount||0));
  }
  if(collection==='waterSummary'){
    return rows.find(x=>String(x.periodId||'')===String(mapped.periods?.[row.periodId]||row.periodId||'') && String(x.key||'')===String(row.key||''));
  }
  return rows.find(x=>x.id===row.id);
}
async function commitOps(ops){
  for(let i=0;i<ops.length;i+=400){
    const batch=writeBatch(db);
    for(const op of ops.slice(i,i+400)) op(batch);
    await batch.commit();
  }
}
async function syncEmbeddedDefaults(){
  if(!can('admin')) return;
  // Build stable mappings so the embedded historical data can coexist with existing V11 records.
  const deleted=seedTombstones();
  const mapped={buildings:{},units:{},subscribers:{},meters:{},sources:{},periods:{}};
  const ops=[];
  const prepareEntity=async(collection, row, targetFields={})=>{
    const existing=findExistingBySeedMatch(collection,row,mapped);
    const seedKey=`${collection}/${row.id}`;
    if(existing){
      mapped[collection][row.id]=existing.id;
      if(!existing.seedKey){
        ops.push(batch=>batch.update(orgDoc(collection,existing.id),{seedKey,embeddedSource:'Excel',embeddedVersion:INITIAL_DATA.version}));
      }
      return existing.id;
    }
    if(deleted.has(seedKey)) return row.id;
    mapped[collection][row.id]=row.id;
    ops.push(batch=>batch.set(orgDoc(collection,row.id),{...row,seedKey,embeddedSource:'Excel',embeddedVersion:INITIAL_DATA.version,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:state.user.uid}));
    return row.id;
  };

  for(const row of INITIAL_DATA.buildings) await prepareEntity('buildings',row);
  for(const row of INITIAL_DATA.units){
    const x={...row,buildingId:mapped.buildings[row.buildingId]||row.buildingId};
    await prepareEntity('units',x);
  }
  for(const row of INITIAL_DATA.subscribers) await prepareEntity('subscribers',row);
  for(const row of INITIAL_DATA.meters){
    const x={...row,subscriberId:mapped.subscribers[row.subscriberId]||row.subscriberId,unitId:row.unitId?(mapped.units[row.unitId]||row.unitId):null};
    await prepareEntity('meters',x);
  }
  for(const row of INITIAL_DATA.sources) await prepareEntity('sources',row);

  for(const row of INITIAL_DATA.periods) await prepareEntity('periods',row);

  const existingReadings=state.data.readings||[];
  for(const row of INITIAL_DATA.readings){
    const periodId=mapped.periods[row.periodId]||row.periodId;
    const meterId=mapped.meters[`meter-${row.subscriberCode}`]||`meter-${row.subscriberCode}`;
    const ex=existingReadings.find(x=>String(x.periodId)===String(periodId)&&String(x.meterId)===String(meterId));
    const seedKey=row.seedKey;
    if(ex){ if(!ex.seedKey) ops.push(batch=>batch.update(orgDoc('readings',ex.id),{seedKey,embeddedSource:'Excel',embeddedVersion:INITIAL_DATA.version})); continue; }
    if(deleted.has(seedKey)) continue;
    ops.push(batch=>batch.set(orgDoc('readings',row.id),{periodId,meterId,previousReading:row.previousReading,currentReading:row.currentReading,consumption:row.consumption,unitPrice:row.unitPrice,chargeAmount:row.chargeAmount,status:row.status,seedKey,embeddedSource:'Excel',embeddedVersion:INITIAL_DATA.version,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  }

  for(const row of INITIAL_DATA.energyReadings){
    const periodId=mapped.periods[row.periodId]||row.periodId;
    const sourceId=mapped.sources[`source-${row.sourceCode}`]||`source-${row.sourceCode}`;
    const ex=(state.data.energyReadings||[]).find(x=>String(x.periodId)===String(periodId)&&String(x.sourceId)===String(sourceId));
    if(ex){ if(!ex.seedKey) ops.push(batch=>batch.update(orgDoc('energyReadings',ex.id),{seedKey:row.seedKey,embeddedSource:'Excel',embeddedVersion:INITIAL_DATA.version})); continue; }
    if(deleted.has(row.seedKey)) continue;
    const payload={...row}; delete payload.sourceCode; delete payload.seedKey;
    ops.push(batch=>batch.set(orgDoc('energyReadings',row.id),{...payload,periodId,sourceId,seedKey:row.seedKey,embeddedSource:'Excel',embeddedVersion:INITIAL_DATA.version,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  }

  for(const row of INITIAL_DATA.costs){
    const periodId=mapped.periods[row.periodId]||row.periodId;
    const ex=(state.data.costs||[]).find(x=>String(x.periodId)===String(periodId)&&String(x.description||'')===String(row.description||'')&&Number(x.amount||0)===Number(row.amount||0));
    if(ex){ if(!ex.seedKey) ops.push(batch=>batch.update(orgDoc('costs',ex.id),{seedKey:row.seedKey,embeddedSource:'Excel',embeddedVersion:INITIAL_DATA.version})); continue; }
    if(deleted.has(row.seedKey)) continue;
    const payload={...row,periodId}; delete payload.seedKey;
    ops.push(batch=>batch.set(orgDoc('costs',row.id),{...payload,seedKey:row.seedKey,embeddedSource:'Excel',embeddedVersion:INITIAL_DATA.version,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  }

  for(const row of INITIAL_DATA.waterSummary){
    const periodId=mapped.periods[row.periodId]||row.periodId;
    const ex=(state.data.waterSummary||[]).find(x=>String(x.periodId)===String(periodId)&&String(x.key||'')===String(row.key||''));
    if(ex){ if(!ex.seedKey) ops.push(batch=>batch.update(orgDoc('waterSummary',ex.id),{seedKey:row.seedKey,embeddedSource:'Excel',embeddedVersion:INITIAL_DATA.version})); continue; }
    if(deleted.has(row.seedKey)) continue;
    const payload={...row,periodId}; delete payload.seedKey;
    ops.push(batch=>batch.set(orgDoc('waterSummary',row.id),{...payload,seedKey:row.seedKey,embeddedSource:'Excel',embeddedVersion:INITIAL_DATA.version,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  }

  if(ops.length) await commitOps(ops);
  state.loaded=false;
  await loadData(true);
}
async function ensureDefaults(){
  if(!can('admin'))return;
  try{
    await syncEmbeddedDefaults();
  }catch(e){
    // Keep the app usable offline: expose the embedded dataset locally, but do not claim it synced.
    console.warn('Embedded historical sync failed; using local embedded defaults temporarily.',e);
    mergeInitialDataIntoLocal();
  }
  // Fallback for a completely new organization only if no embedded data could be used.
  if(!(state.data.buildings||[]).length){
    const b1=doc(orgCollection('buildings'));const b2=doc(orgCollection('buildings'));
    await Promise.all([setDoc(b1,{name:'البناية الأولى',code:'1',active:true,createdAt:serverTimestamp()}),setDoc(b2,{name:'البناية الثانية',code:'2',active:true,createdAt:serverTimestamp()})]);
    state.loaded=false;await loadData(true);
  }
}

function setTitle(title,subtitle){$('#page-title').textContent=title;$('#page-subtitle').textContent=subtitle;$('#crumbText').textContent=VIEW_NAMES[state.view]||title;}
function setActiveNav(){ $$('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view)); }
function render(){const fn={dashboard:renderDashboard,periods:renderPeriods,readings:renderReadings,energy:renderEnergy,costs:renderCosts,contributions:renderContributions,subscribers:renderSubscribers,payments:renderPayments,debts:renderDebts,reports:renderReports,settings:renderSettings,guide:showGuide,historical:renderHistorical}[state.view]||renderDashboard;fn();}
async function navigate(view,periodId=null,force=false){if(!state.profile||state.profile.role==='pending'){renderPending();return;}state.view=view;if(periodId)state.periodId=periodId;setActiveNav();await loadData(force);render();$('#sidebar')?.classList.remove('open');}

function latestPeriods(){return [...(state.data.periods||[])].sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate)));}
function currentTotals(pid){
  const p=periodById(pid), rs=readingsForPeriod(pid), ers=energyForPeriod(pid), cs=costsForPeriod(pid);
  const breakdown=buildingWaterBreakdown(pid);
  const external=waterSummaryForPeriod(pid).find(r=>r.key==='external'||r.type==='external');
  const externalWater=external&&external.currentReading!=null&&external.previousReading!=null?Math.max(0,num(external.currentReading)-num(external.previousReading))/1000:0;
  const water=breakdown.buildings.reduce((a,b)=>a+b.total,0)+externalWater;
  const energy=ers.reduce((a,r)=>a+(r.cost!=null?num(r.cost):(r.currentReading!=null&&r.previousReading!=null?Math.max(0,num(r.currentReading)-num(r.previousReading))*num(r.pricePerKwh):0)),0);
  const expense=cs.filter(c=>c.direction!=='credit').reduce((a,c)=>a+num(c.amount),0);
  const contributions=(state.data.contributions||[]).filter(c=>c.periodId===pid).reduce((a,c)=>a+num(c.amount),0);
  const net=energy+expense-contributions;const raw=water>0?net/water:0;const applied=raw>0?Math.ceil(raw):0;
  return {period:p,readings:rs,energyReadings:ers,costs:cs,waterTotal:water,energyCost:energy,extraCost:expense,contributionsTotal:contributions,netCost:net,rawPrice:raw,appliedPrice:applied,waterBreakdown:breakdown,externalWater};
}

function waterSummaryForPeriod(pid){return (state.data.waterSummary||[]).filter(x=>x.periodId===pid).sort((a,b)=>{if(a.type!==b.type)return a.type==='building'?-1:1;return String(a.label||'').localeCompare(String(b.label||''),'ar')});}
function waterSummaryTotal(pid){
  const breakdown=buildingWaterBreakdown(pid);
  const external=waterSummaryForPeriod(pid).find(r=>r.key==='external'||r.type==='external');
  const externalWater=external&&external.currentReading!=null&&external.previousReading!=null?Math.max(0,num(external.currentReading)-num(external.previousReading))/1000:0;
  return breakdown.buildings.reduce((a,b)=>a+b.total,0)+externalWater;
}


function buildingWaterBreakdown(pid){
  const out=[];for(const b of (state.data.buildings||[])){
    const unitIds=(state.data.units||[]).filter(u=>u.buildingId===b.id).map(u=>u.id);const subIds=(state.data.subscribers||[]).filter(s=>unitIds.includes(s.unitId)&&s.type!=='خارجي'&&s.active!==false).map(s=>s.id);const meterIds=(state.data.meters||[]).filter(m=>subIds.includes(m.subscriberId)).map(m=>m.id);
    const total=readingsForPeriod(pid).filter(r=>meterIds.includes(r.meterId)).reduce((a,r)=>a+(r.currentReading!=null&&r.previousReading!=null?Math.max(0,num(r.currentReading)-num(r.previousReading))/1000:0),0);out.push({id:b.id,name:b.name,total});
  }
  const externalSubIds=(state.data.subscribers||[]).filter(s=>s.type==='خارجي'&&s.active!==false).map(s=>s.id);const extMeters=(state.data.meters||[]).filter(m=>externalSubIds.includes(m.subscriberId)).map(m=>m.id);const external=readingsForPeriod(pid).filter(r=>extMeters.includes(r.meterId)).reduce((a,r)=>a+(r.currentReading!=null&&r.previousReading!=null?Math.max(0,num(r.currentReading)-num(r.previousReading))/1000:0),0);return {buildings:out,external};
}

async function ensureWaterSummaryForPeriod(pid){
  const existing=waterSummaryForPeriod(pid);if(existing.some(x=>x.key==='external'))return;if(!can('admin','manager','accountant','operator'))return;const p=periodById(pid);if(!p)return;const prior=[...(state.data.waterSummary||[])].filter(x=>x.key==='external'&&x.currentReading!=null&&x.periodId!==pid).map(x=>({x,p:periodById(x.periodId)})).filter(x=>x.p).sort((a,b)=>String(b.p.startDate).localeCompare(String(a.p.startDate)))[0]?.x?.currentReading??null;await setDoc(doc(orgCollection('waterSummary')),{periodId:pid,key:'external',label:'الخارجي',type:'external',buildingId:null,previousReading:prior,currentReading:null,consumption:null,status:'Pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:state.user.uid});state.loaded=false;await loadData(true);
}

function renderDashboard(){
  setTitle('الرئيسية','من هنا تبدأ شغلك الأسبوعي — بدون مصطلحات معقدة.');const periods=latestPeriods(),latest=periods[0];const subs=(state.data.subscribers||[]).filter(s=>s.active!==false);const totals=latest?currentTotals(latest.id):null;
  $('#app').innerHTML=`<section class="welcome"><div class="kicker">عمارة الأمين • الإدارة اليومية</div><h2>أهلاً ${safe(state.user?.displayName?.split(' ')[0]||'بك')} 👋</h2><p>اعملها بهذا الترتيب: افتح الأسبوع → أدخل كهرباء وماء → احسب سعر الكوب → راجع → صدّر.</p><div class="welcome-actions"><button class="btn primary" id="dashNewWeek">+ افتح أسبوعًا</button><button class="btn ghost" id="dashReadings">إدخال قراءات الماء</button></div></section>
  <section class="stats"><div class="stat"><div class="stat-label">السكان النشطون</div><div class="stat-value">${fmt(subs.length,0)}</div><div class="stat-foot">مشترك داخل النظام</div></div><div class="stat"><div class="stat-label">آخر أسبوع</div><div class="stat-value">${latest?fmtDate(latest.startDate):'—'}</div><div class="stat-foot">${latest?statusBadge(latest.status||'Draft'):'لا يوجد'}</div></div><div class="stat"><div class="stat-label">استهلاك المياه</div><div class="stat-value">${totals?fmt(totals.waterTotal,3):'—'}</div><div class="stat-foot">كوب / م³</div></div><div class="stat"><div class="stat-label">سعر الكوب</div><div class="stat-value">${totals&&totals.appliedPrice?money(totals.appliedPrice):'—'}</div><div class="stat-foot">بعد رفع السعر للعدد الصحيح</div></div></section>
  <section class="grid-2"><div class="panel"><div class="panel-head"><div><h2>الطريقة الصحيحة كل أسبوع</h2><p>هذه هي نفس طريقتكم اليدوية، لكن البرنامج ينفذ الحسابات.</p></div></div><div class="workflow-grid"><div class="workflow-card"><div class="w-num">١</div><h3>سجّل الكهرباء</h3><p>السابقة والحالية وسعر الكيلو لكل مولد.</p></div><div class="workflow-card"><div class="w-num">٢</div><h3>سجّل الماء</h3><p>لكل ساكن: السابقة + الحالية.</p></div><div class="workflow-card"><div class="w-num">٣</div><h3>احسب سعر الكوب</h3><p>التكلفة ÷ مجموع استهلاك العمارتين والخارجي.</p></div><div class="workflow-card"><div class="w-num">٤</div><h3>وزّع على السكان</h3><p>استهلاك الشخص × سعر الكوب.</p></div></div></div><div class="panel"><div class="panel-head"><div><h2>آخر أسبوع</h2><p>${latest?'افتحه لمراجعة كل التفاصيل.':'ابدأ من زر الأسبوع الجديد.'}</p></div></div>${latest?`<button class="latest" id="dashLatest"><div class="latest-date">${fmtDate(latest.startDate)}</div><div class="latest-main"><b>${safe(latest.label||'أسبوع')}</b><span>${statusBadge(latest.status||'Draft')}</span></div><span class="arrow">←</span></button>`:empty('لا يوجد أسبوع بعد','ابدأ بفتح أول أسبوع.')}</div></section>
  <div class="trust"><div class="trust-icon">✓</div><div><b>البيانات مشتركة عبر Firebase</b><span>تدخل من أي جهاز بحساب مصرح له، والبيانات لا تعتمد على متصفح واحد.</span></div></div>`;
  $('#dashNewWeek').onclick=showPeriodForm;$('#dashReadings').onclick=()=>latest?navigate('readings',latest.id):showPeriodForm();if(latest)$('#dashLatest').onclick=()=>navigate('periods',latest.id);
}

async function renderPeriods(){
  setTitle('الأسابيع والحساب','هنا تعمل الحساب الكامل للأسبوع: الكهرباء + الماء + سعر الكوب.');const periods=latestPeriods();if(!state.periodId)state.periodId=periods[0]?.id;const p=selectedPeriod();if(p&&(state.data.waterSummary||[]).filter(x=>x.periodId===p.id).length<3){await ensureWaterSummaryForPeriod(p.id);}const t=p?currentTotals(p.id):null;const breakdown=p?buildingWaterBreakdown(p.id):null;
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>أسابيع الحساب</h2><p>اختَر الأسبوع من القائمة، وبعدها اعمل الحساب كاملًا.</p></div><div class="panel-actions"><button class="btn soft" id="newWeekBtn">+ أسبوع جديد</button>${p?`<button class="btn soft" id="servicesBtn">الخدمات الدورية</button><button class="btn primary" id="calcWeekBtn">احسب الأسبوع</button>`:''}</div></div><div class="period-picker"><label>الأسبوع الحالي</label><select id="periodSelect" class="period-select">${periods.map(x=>`<option value="${x.id}" ${x.id===p?.id?'selected':''}>${safe(x.label||'أسبوع')} — ${fmtDate(x.startDate)} إلى ${fmtDate(x.endDate)} — ${statusText(x.status||'Draft')}</option>`).join('')}</select></div>${!p?empty('لا يوجد أسبوع','افتح أول أسبوع من الزر بالأعلى.'):periodCalculationView(t,breakdown)}</section>`;
  $('#newWeekBtn').onclick=showPeriodForm;$('#periodSelect').onchange=e=>navigate('periods',e.target.value);if(p){$('#calcWeekBtn').onclick=()=>calculateWeek(p.id);$('#servicesBtn').onclick=()=>showServiceForm(p.id);}
}
function periodCalculationView(t,breakdown){
  const ext=waterSummaryForPeriod(t.period.id).find(r=>r.key==='external'||r.type==='external');
  const summaryComplete=!!(ext&&ext.currentReading!=null&&ext.previousReading!=null&&breakdown.buildings.every(b=>b.total>=0));
  const eligible=readingsForPeriod(t.period.id).filter(r=>r.currentReading!=null&&r.previousReading!=null).length;
  const missing=readingsForPeriod(t.period.id).length-eligible;
  return `<div class="calc-banner"><div><h3>نتيجة هذا الأسبوع</h3><p>أدخل كهرباء المولدات، ثم قراءات السكان، ثم قراءة الخارجي. البرنامج يجمع سكان كل بناية تلقائيًا.</p></div><div class="price">${t.appliedPrice?money(t.appliedPrice):'لم يُحسب بعد'}</div></div><div class="calc-board"><div class="calc-box"><h3>١) تكلفة الكهرباء والمصاريف</h3><div class="calc-line"><span>الكهرباء من المولدات</span><b>${money(t.energyCost)}</b></div><div class="calc-line"><span>المصاريف والإضافات</span><b>${money(t.extraCost)}</b></div><div class="calc-total"><span>صافي تكلفة التشغيل</span><span>${money(t.netCost)}</span></div></div><div class="calc-box"><h3>٢) إجمالي استهلاك الماء</h3>${breakdown.buildings.map(b=>`<div class="calc-line"><span>${safe(b.name)} من السكان</span><b>${fmt(b.total,3)} كوب</b></div>`).join('')}<div class="calc-line"><span>${safe(ext?.label||'الخارجي')}</span><b>${t.externalWater?fmt(t.externalWater,3)+' كوب':'—'}</b></div><div class="calc-total"><span>الإجمالي المعتمد للسعر</span><span>${fmt(t.waterTotal,3)} كوب</span></div></div></div><div class="money-grid" style="margin-top:13px"><div class="money-card"><small>السعر الخام</small><b>${t.rawPrice?money(t.rawPrice):'—'}</b><small>صافي التكلفة ÷ إجمالي الماء</small></div><div class="money-card"><small>السعر المعتمد</small><b>${t.appliedPrice?money(t.appliedPrice):'—'}</b><small>رفع للعدد الصحيح الأعلى</small></div><div class="money-card"><small>قراءات السكان</small><b>${eligible} / ${eligible+missing}</b><small>${missing?`باقي ${missing} قراءة`:'كل القراءات مكتملة'}</small></div></div><div class="section-note" style="margin-top:13px">المعادلة: <b>استهلاك سكان البناية الأولى + استهلاك سكان البناية الثانية + الخارجي = إجمالي استهلاك المياه</b>، ثم <b>صافي تكلفة التشغيل ÷ إجمالي المياه = سعر الكوب الخام</b>، ثم نرفعه للعدد الصحيح الأعلى.</div>`;
}

function showPeriodForm(){openModal(`<h2>فتح أسبوع جديد</h2><p class="modal-lead">السابقة لكل عداد ستنتقل تلقائيًا من آخر قراءة مسجلة، ويمكن تعديلها لاحقًا.</p><div class="form-grid"><div class="field"><label>اسم الأسبوع</label><input id="pLabel" value="أسبوع ${fmtDate(dateNow())}"></div><div class="field"><label>من</label><input id="pStart" type="date" value="${dateNow()}"></div><div class="field"><label>إلى</label><input id="pEnd" type="date" value="${dateNow()}"></div><div class="field"><label>سعر الكوب (اختياري)</label><input id="pPrice" type="number" min="0" step="0.01" placeholder="يُحسب بعد إدخال الكهرباء والماء"></div></div><div class="actions"><button class="btn primary" id="savePeriod">فتح الأسبوع</button><button class="btn ghost" id="cancelPeriod">إلغاء</button></div>`);$('#cancelPeriod').onclick=closeModal;$('#savePeriod').onclick=createPeriod;}
async function createPeriod(){
  if(!can('admin','manager','accountant','operator')){toast('لا تملك صلاحية فتح أسبوع','error');return;}const start=$('#pStart').value,end=$('#pEnd').value,label=$('#pLabel').value.trim()||`أسبوع ${fmtDate(start)}`;if(!start||!end){toast('حدد تاريخ بداية ونهاية الأسبوع','error');return;}if(end<start){toast('تاريخ النهاية يجب أن يكون بعد البداية','error');return;}
  if((state.data.periods||[]).some(p=>p.startDate===start&&p.endDate===end)){toast('هذا الأسبوع موجود بالفعل','error');return;}
  const ref=doc(orgCollection('periods'));const p={label,startDate:start,endDate:end,status:'Draft',waterUnitPrice:$('#pPrice').value===''?null:num($('#pPrice').value),createdAt:serverTimestamp(),createdBy:state.user.uid};const batch=writeBatch(db);batch.set(ref,p);
  const residents=(state.data.subscribers||[]).filter(s=>s.active!==false&&s.type!=='خارجي');
  for(const s of residents){const meter=(state.data.meters||[]).find(m=>m.subscriberId===s.id);if(!meter)continue;const history=(state.data.readings||[]).filter(r=>r.meterId===meter.id&&r.currentReading!=null).map(r=>({r,p:periodById(r.periodId)})).filter(x=>x.p).sort((a,b)=>String(b.p.startDate).localeCompare(String(a.p.startDate)));const prev=history[0]?.r.currentReading??null;batch.set(doc(orgCollection('readings')),{periodId:ref.id,meterId:meter.id,previousReading:prev,currentReading:null,consumption:null,unitPrice:p.waterUnitPrice,chargeAmount:null,status:'Pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});}
  for(const src of (state.data.sources||[]).filter(x=>x.active!==false)){const history=(state.data.energyReadings||[]).filter(r=>r.sourceId===src.id&&r.currentReading!=null).map(r=>({r,p:periodById(r.periodId)})).filter(x=>x.p).sort((a,b)=>String(b.p.startDate).localeCompare(String(a.p.startDate)));const prev=history[0]?.r.currentReading??null;batch.set(doc(orgCollection('energyReadings')),{periodId:ref.id,sourceId:src.id,previousReading:prev,currentReading:null,consumption:null,pricePerKwh:src.defaultRate??null,cost:null,status:'Pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});}
  const ext=(state.data.waterSummary||[]).filter(x=>x.key==='external'&&x.currentReading!=null&&x.periodId!==ref.id).map(x=>({x,p:periodById(x.periodId)})).filter(x=>x.p).sort((a,b)=>String(b.p.startDate).localeCompare(String(a.p.startDate)))[0]?.x?.currentReading??null;batch.set(doc(orgCollection('waterSummary')),{periodId:ref.id,key:'external',label:'الخارجي',type:'external',buildingId:null,previousReading:ext,currentReading:null,consumption:null,status:'Pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:state.user.uid});
  await batch.commit();state.loaded=false;await loadData(true);state.periodId=ref.id;closeModal();toast('تم فتح الأسبوع وتجهيز القراءات');await navigate('periods',ref.id,true);
}
async function renderReadings(){
  setTitle('قراءات الماء','أولًا أدخل قراءات الماء الإجمالية للعمارتين والخارجي، ثم قراءات السكان.');const periods=latestPeriods();if(!state.periodId)state.periodId=periods[0]?.id;const p=selectedPeriod();if(p&&(state.data.waterSummary||[]).filter(x=>x.periodId===p.id).length<3){await ensureWaterSummaryForPeriod(p.id);}
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>قراءات الماء</h2><p>في الأعلى مجموع المياه للعمارات والخارجي. تحتها قراءات السكان.</p></div><div class="panel-actions"><button class="btn soft" id="goCalc">الحساب الكامل</button><button class="btn primary" id="newWeek2">+ أسبوع جديد</button></div></div>${!p?`<div class="reading-start"><div class="reading-start-icon">◫</div><div><h2>ابدأ من أسبوع جديد</h2><p>بعد فتح الأسبوع ستظهر لك قراءات العمارات والخارجي ثم السكان.</p><button class="btn primary" id="firstWeek2">+ افتح أول أسبوع</button></div></div>`:`<div class="period-picker"><label>الأسبوع الحالي</label><select id="periodSelect" class="period-select">${periods.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${safe(x.label||'أسبوع')} — ${fmtDate(x.startDate)} إلى ${fmtDate(x.endDate)} — ${statusText(x.status||'Draft')}</option>`).join('')}</select></div><div class="section-note"><b>المهم:</b> اكتب أولًا القراءة السابقة والحالية لعداد البناية الأولى والثانية والخارجي. البرنامج يحسب استهلاك كل واحد منهم ويجمعهم = <b>إجمالي الاستهلاك الذي سنستخدمه لسعر الكوب.</b></div>${waterSummaryTable(p.id)}<div class="section-note"><b>ثم السكان:</b> لكل ساكن اكتب السابقة والحالية. (الحالية − السابقة) ÷ 1000 = استهلاكه بالكوب/م³.</div>${readingTable(p.id)}`}</section>`;
  $('#newWeek2').onclick=showPeriodForm;$('#goCalc').onclick=()=>p?navigate('periods',p.id):showPeriodForm;if($('#firstWeek2'))$('#firstWeek2').onclick=showPeriodForm;$('#periodSelect')?.addEventListener('change',e=>navigate('readings',e.target.value));if(p){bindWaterSummaryInputs(p.id);bindReadingInputs(p.id);} 
}
function waterSummaryTable(pid){
  const breakdown=buildingWaterBreakdown(pid);
  const ext=waterSummaryForPeriod(pid).find(r=>r.key==='external'||r.type==='external')||{id:'',key:'external',label:'الخارجي',type:'external',previousReading:null,currentReading:null};
  const extCons=ext.currentReading!=null&&ext.previousReading!=null?Math.max(0,num(ext.currentReading)-num(ext.previousReading))/1000:null;
  const allRows=[...breakdown.buildings.map(b=>({kind:'building',...b})),{kind:'external',...ext,total:extCons}];
  return `<div class="water-master"><div class="water-master-head"><div><h3>١) إجمالي استهلاك المياه</h3><p>البناية الأولى والثانية تُحسبان تلقائيًا من مجموع السكان. الخارجي فقط تدخله هنا.</p></div><div class="water-master-total" id="waterMasterTotal">${fmt(waterSummaryTotal(pid),3)} كوب</div></div><div class="table-wrap"><table class="table master-water-table"><thead><tr><th>الجهة</th><th>القراءة السابقة</th><th>القراءة الحالية</th><th>الاستهلاك</th><th>المصدر</th><th>الحالة</th></tr></thead><tbody>${allRows.map(r=>{
    const isExt=r.kind==='external';
    return `<tr ${isExt&&r.id?`data-wsid="${r.id}"`:''}><td><b>${safe(r.name||r.label)}</b><small>${isExt?'استهلاك خارجي':'مجموع استهلاك السكان'}</small></td><td>${isExt?`<input class="reading-input ws-prev" type="number" step="0.001" value="${r.previousReading??''}">`:'<span class="auto-reading">من السكان</span>'}</td><td>${isExt?`<input class="reading-input ws-current" type="number" step="0.001" value="${r.currentReading??''}">`:'<span class="auto-reading">من السكان</span>'}</td><td class="ws-cons">${r.total==null?'—':fmt(r.total,3)+' كوب'}</td><td>${isExt?'<span class="badge info">يدوي</span>':'<span class="badge ok">تلقائي</span>'}</td><td class="ws-status">${r.total==null?'<span class="badge warn">بانتظار</span>':'<span class="badge ok">جاهزة</span>'}</td></tr>`;
  }).join('')}</tbody></table></div><div class="master-water-footer"><span>سعر الكوب يعتمد على إجمالي السكان في البنايتين + الخارجي</span><span class="autosave-note">الحفظ التلقائي مفعّل</span><button class="btn soft" id="saveWaterSummary">حفظ الآن</button><button class="btn ghost" id="deleteExternalReading">حذف قراءة الخارجي</button></div></div>`;
}
let __autoSaveTimers={};
function queueAutoSave(key,fn){
  clearTimeout(__autoSaveTimers[key]);
  __autoSaveTimers[key]=setTimeout(async()=>{try{await fn();if($('#autosaveGlobal')) $('#autosaveGlobal').textContent='محفوظ تلقائيًا ✓';}catch(e){console.error(e);toast('تعذر الحفظ التلقائي، استخدم «حفظ الآن»','error');}},700);
}
function bindWaterSummaryInputs(pid){
  $$('.ws-prev,.ws-current').forEach(inp=>inp.addEventListener('input',()=>{
    const tr=inp.closest('tr'),prev=tr.querySelector('.ws-prev').value,cur=tr.querySelector('.ws-current').value;
    const cons=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev))/1000:null;
    tr.querySelector('.ws-cons').textContent=cons==null?'—':fmt(cons,3)+' كوب';
    tr.querySelector('.ws-status').innerHTML=cur===''?'<span class="badge warn">بانتظار</span>':(num(cur)<num(prev)?'<span class="badge danger">تحقق</span>':'<span class="badge ok">جاهزة</span>');
    const id=tr.dataset.wsid;
    if(id) queueAutoSave('ws-'+id,async()=>{
      if(num(cur)<num(prev))throw new Error('invalid');
      await updateDoc(orgDoc('waterSummary',id),{previousReading:prev===''?null:num(prev),currentReading:cur===''?null:num(cur),consumption:cons,status:cur===''?'Pending':'Entered',updatedAt:serverTimestamp(),updatedBy:state.user.uid});
    });
    const total=$$('[data-wsid]').reduce((acc,row)=>{const p=row.querySelector('.ws-prev')?.value,c=row.querySelector('.ws-current')?.value;return acc+(p!==''&&c!==''?Math.max(0,num(c)-num(p))/1000:0)},0)+buildingWaterBreakdown(pid).buildings.reduce((acc,b)=>acc+b.total,0);
    $('#waterMasterTotal').textContent=`${fmt(total,3)} كوب`;
  }));
  $('#deleteExternalReading')?.addEventListener('click',()=>deleteExternalWaterSummary(pid));
  $('#saveWaterSummary').onclick=async()=>{
    if(!can('admin','manager','accountant','operator')){toast('لا تملك صلاحية التعديل','error');return;}
    const tr=$('[data-wsid]'); if(!tr){toast('لا يوجد إدخال خارجي','error');return;}
    const prev=tr.querySelector('.ws-prev').value,cur=tr.querySelector('.ws-current').value;
    if(cur!==''&&prev!==''&&num(cur)<num(prev)){toast('القراءة الحالية أقل من السابقة.','error');return;}
    const cons=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev))/1000:null;
    await updateDoc(orgDoc('waterSummary',tr.dataset.wsid),{previousReading:prev===''?null:num(prev),currentReading:cur===''?null:num(cur),consumption:cons,status:cur===''?'Pending':'Entered',updatedAt:serverTimestamp(),updatedBy:state.user.uid});
    state.loaded=false;await loadData(true);toast('تم حفظ قراءة الخارجي');renderReadings();
  };
}

function readingTable(pid){
  const rows=readingsForPeriod(pid).map(r=>{const m=(state.data.meters||[]).find(x=>x.id===r.meterId);const s=subscriberByMeter(m);return{s,r,m}}).filter(x=>x.s&&x.s.active!==false).sort((a,b)=>String(a.s.code).localeCompare(String(b.s.code),undefined,{numeric:true}));const p=periodById(pid);
  return `<div class="table-wrap"><table class="table" style="min-width:1060px"><thead><tr><th>الكود</th><th>الساكن</th><th>البناية / النوع</th><th>القراءة السابقة</th><th>القراءة الحالية</th><th>السحب</th><th>سعر الكوب</th><th>القيمة</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>${rows.length?rows.map(x=>{const {s,r}=x;const cons=r.currentReading!=null&&r.previousReading!=null?Math.max(0,num(r.currentReading)-num(r.previousReading))/1000:null;const price=r.unitPrice??p.waterUnitPrice??'';const charge=cons!=null&&price!==''?cons*num(price):null;return `<tr data-rid="${r.id}"><td><span class="code">${safe(s.code)}</span></td><td><b>${safe(s.name)}</b></td><td>${s.type==='خارجي'?'<span class="badge warn">خارجي</span>':safe(subscriberRow(s).buildingName)}</td><td><input class="reading-input prev" type="number" step="0.001" value="${r.previousReading??''}"></td><td><input class="reading-input current" type="number" step="0.001" value="${r.currentReading??''}"></td><td class="cons">${cons==null?'—':fmt(cons,3)}</td><td><input class="reading-input price" type="number" step="0.01" value="${price}"></td><td class="charge">${charge==null?'—':money(charge)}</td><td class="status">${r.currentReading==null?'<span class="badge warn">بانتظار</span>':((num(r.currentReading)<num(r.previousReading))?'<span class="badge danger">تحقق</span>':'<span class="badge ok">جاهزة</span>')}</td><td>${can('admin','manager','accountant','operator')?`<button class="mini red" data-delete-reading="${r.id}">حذف</button>`:''}</td></tr>`}).join(''):`<tr><td colspan="10">${empty('لا توجد قراءات','تأكد من وجود سكان وعدادات قبل فتح الأسبوع.')}</td></tr>`}</tbody></table></div><div class="readings-actions"><span class="muted">الحفظ التلقائي مفعّل. الحساب النهائي من صفحة «الأسابيع والحساب».</span><button class="btn primary" id="saveReadings">حفظ كل القراءات</button></div>`;
}
function bindReadingInputs(pid){
  $$('[data-rid] .reading-input').forEach(inp=>inp.addEventListener('input',()=>{
    const tr=inp.closest('tr'),prev=tr.querySelector('.prev').value,cur=tr.querySelector('.current').value,price=tr.querySelector('.price').value;const cons=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev))/1000:null;tr.querySelector('.cons').textContent=cons==null?'—':fmt(cons,3);tr.querySelector('.charge').textContent=cons!=null&&price!==''?money(cons*num(price)):'—';tr.querySelector('.status').innerHTML=cur===''?'<span class="badge warn">بانتظار</span>':(num(cur)<num(prev)?'<span class="badge danger">تحقق</span>':'<span class="badge ok">جاهزة</span>');const id=tr.dataset.rid;queueAutoSave('reading-'+id,async()=>{if(cur!==''&&prev!==''&&num(cur)<num(prev))throw new Error('invalid');const consumption=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev))/1000:null;await updateDoc(orgDoc('readings',id),{previousReading:prev===''?null:num(prev),currentReading:cur===''?null:num(cur),consumption,unitPrice:price===''?null:num(price),chargeAmount:consumption!=null&&price!==''?consumption*num(price):null,status:cur===''?'Pending':'Entered',updatedAt:serverTimestamp(),updatedBy:state.user.uid});});
  }));
  $('#saveReadings').onclick=async()=>{if(!can('admin','manager','accountant','operator')){toast('لا تملك صلاحية التعديل','error');return;}const rows=$$('[data-rid]'),ops=[];for(const tr of rows){const prev=tr.querySelector('.prev').value,cur=tr.querySelector('.current').value,price=tr.querySelector('.price').value;if(cur!==''&&prev!==''&&num(cur)<num(prev)){toast('هناك قراءة حالية أقل من السابقة.','error');return;}const consumption=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev))/1000:null;ops.push(b=>b.update(orgDoc('readings',tr.dataset.rid),{previousReading:prev===''?null:num(prev),currentReading:cur===''?null:num(cur),consumption,unitPrice:price===''?null:num(price),chargeAmount:consumption!=null&&price!==''?consumption*num(price):null,status:cur===''?'Pending':'Entered',updatedAt:serverTimestamp(),updatedBy:state.user.uid}));}await commitOps(ops);state.loaded=false;await loadData(true);toast('تم حفظ كل القراءات');renderReadings();};
  $$('[data-delete-reading]').forEach(b=>b.onclick=()=>deleteReading(b.dataset.deleteReading));
}

function renderEnergy(){
  setTitle('الكهرباء والمولدات','أبو زايد والسويسي هما المصدران الأساسيان. المولد الخارجي يسجل كمصروف في صفحة المصاريف.');const periods=latestPeriods();if(!state.periodId)state.periodId=periods[0]?.id;const p=selectedPeriod();const sources=state.data.sources||[];const ers=p?energyForPeriod(p.id):[];
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>كهرباء المولدات</h2><p>القراءة الحالية − السابقة = الاستهلاك، ثم × سعر الكيلو = التكلفة.</p></div><div class="panel-actions">${can('admin','manager')?'<button class="btn soft" id="sourceManage">+ إضافة مصدر/مولد</button>':''}<button class="btn primary" id="energySave">حفظ القراءات</button></div></div>${!p?`<div class="reading-start"><div class="reading-start-icon">ϟ</div><div><h2>افتح أسبوعًا أولًا</h2><p>بعد فتحه ستظهر أبو زايد والسويسي.</p><button class="btn primary" id="energyFirst">+ افتح أسبوعًا</button></div></div>`:`<div class="period-picker"><label>الأسبوع الحالي</label><select id="periodSelect" class="period-select">${periods.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${safe(x.label||'أسبوع')} — ${fmtDate(x.startDate)} إلى ${fmtDate(x.endDate)} — ${statusText(x.status||'Draft')}</option>`).join('')}</select></div><div class="section-note"><b>المعادلة:</b> (الحالية − السابقة) × سعر الكيلو = تكلفة المصدر. لا يوجد مولد خارجي هنا؛ سجله كمصروف عندما تحتاجه.</div><div class="table-wrap"><table class="table" style="min-width:1050px"><thead><tr><th>المصدر</th><th>السابقة</th><th>الحالية</th><th>الاستهلاك</th><th>سعر الكيلو</th><th>التكلفة</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>${ers.length?ers.map(r=>{const src=sources.find(s=>s.id===r.sourceId);const cons=r.currentReading!=null&&r.previousReading!=null?Math.max(0,num(r.currentReading)-num(r.previousReading)):null;const cost=cons!=null&&r.pricePerKwh!=null?cons*num(r.pricePerKwh):null;return `<tr data-eid="${r.id}"><td><b>${safe(src?.name||'مصدر محذوف')}</b></td><td><input class="reading-input eprev" type="number" step="0.001" value="${r.previousReading??''}"></td><td><input class="reading-input ecur" type="number" step="0.001" value="${r.currentReading??''}"></td><td class="econs">${cons==null?'—':fmt(cons,3)}</td><td><input class="reading-input erate" type="number" step="0.01" value="${r.pricePerKwh??''}"></td><td class="ecost">${cost==null?'—':money(cost)}</td><td class="estatus">${r.currentReading==null?'<span class="badge warn">بانتظار</span>':(num(r.currentReading)<num(r.previousReading)?'<span class="badge danger">تحقق</span>':'<span class="badge ok">جاهز</span>')}</td><td><button class="mini red" data-delete-energy="${r.id}">حذف</button></td></tr>`}).join(''):`<tr><td colspan="8">${empty('لا توجد مصادر طاقة','أضف أبو زايد أو السويسي.')}</td></tr>`}</tbody></table></div><div class="panel" style="margin-top:13px;background:#fbfcfb"><div class="panel-head"><div><h2>مصادر الطاقة</h2><p>يمكن الإدارة تعديل الأسماء والأسعار الافتراضية، مع بقاء التاريخ.</p></div></div><div class="members">${sources.map(src=>`<div class="member-row"><div class="avatar">ϟ</div><div class="member-info"><b>${safe(src.name)}</b><span>${safe(src.type||'مولد')} • ${src.defaultRate!=null?`السعر الافتراضي ${money(src.defaultRate)}`:'بدون سعر افتراضي'}</span></div><span class="badge ${src.active!==false?'ok':'warn'}">${src.active!==false?'فعال':'موقوف'}</span>${can('admin','manager')?`<button class="mini" data-edit-source="${src.id}">تعديل</button><button class="mini red" data-delete-source="${src.id}">حذف</button>`:''}</div>`).join('')}</div></div>`}</section>`;
  $('#sourceManage')?.addEventListener('click',()=>showSourceForm());$$('[data-edit-source]').forEach(b=>b.onclick=()=>showSourceForm(b.dataset.editSource));$$('[data-delete-source]').forEach(b=>b.onclick=()=>deleteSource(b.dataset.deleteSource));$('#energySave').onclick=()=>p?saveEnergy(p.id):null;if($('#energyFirst'))$('#energyFirst').onclick=showPeriodForm;$('#periodSelect')?.addEventListener('change',e=>navigate('energy',e.target.value));bindEnergyInputs();
}
function bindEnergyInputs(){
  $$('[data-eid] .eprev,[data-eid] .ecur,[data-eid] .erate').forEach(inp=>inp.addEventListener('input',()=>{const tr=inp.closest('tr'),prev=tr.querySelector('.eprev').value,cur=tr.querySelector('.ecur').value,rate=tr.querySelector('.erate').value;const cons=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev)):null;tr.querySelector('.econs').textContent=cons==null?'—':fmt(cons,3);tr.querySelector('.ecost').textContent=cons!=null&&rate!==''?money(cons*num(rate)):'—';tr.querySelector('.estatus').innerHTML=cur===''?'<span class="badge warn">بانتظار</span>':(num(cur)<num(prev)?'<span class="badge danger">تحقق</span>':'<span class="badge ok">جاهز</span>');const id=tr.dataset.eid;queueAutoSave('energy-'+id,async()=>{if(cur!==''&&prev!==''&&num(cur)<num(prev))throw new Error('invalid');const c=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev)):null;await updateDoc(orgDoc('energyReadings',id),{previousReading:prev===''?null:num(prev),currentReading:cur===''?null:num(cur),pricePerKwh:rate===''?null:num(rate),consumption:c,cost:c!=null&&rate!==''?c*num(rate):null,status:cur===''?'Pending':'Entered',updatedAt:serverTimestamp(),updatedBy:state.user.uid});});}));
  $$('[data-delete-energy]').forEach(b=>b.onclick=()=>deleteEnergyReading(b.dataset.deleteEnergy));
}

async function saveEnergy(pid){if(!can('admin','manager','accountant','operator')){toast('لا تملك صلاحية التعديل','error');return;}const batch=writeBatch(db);for(const tr of $$('[data-eid]')){const prev=tr.querySelector('.eprev').value,cur=tr.querySelector('.ecur').value,rate=tr.querySelector('.erate').value;if(cur!==''&&prev!==''&&num(cur)<num(prev)){toast('هناك قراءة كهرباء أقل من السابقة. أصلحها أولًا.','error');return;}const cons=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev)):null;batch.update(orgDoc('energyReadings',tr.dataset.eid),{previousReading:prev===''?null:num(prev),currentReading:cur===''?null:num(cur),pricePerKwh:rate===''?null:num(rate),consumption:cons,cost:cons!=null&&rate!==''?cons*num(rate):null,status:cur===''?'Pending':'Entered',updatedAt:serverTimestamp(),updatedBy:state.user.uid});}await batch.commit();state.loaded=false;await loadData(true);toast('تم حفظ قراءات الكهرباء');renderEnergy();}
function showSourceForm(id){if(!can('admin','manager')){toast('إدارة مصادر الطاقة مخصصة للمدير','error');return;}const src=id?(state.data.sources||[]).find(x=>x.id===id):null;openModal(`<h2>${src?'تعديل المصدر':'إضافة مصدر / مولد'}</h2><p class="modal-lead">لا تربط النظام بعدد ثابت من المولدات؛ أضف أي مصدر مستقبلي.</p><div class="form-grid"><div class="field"><label>اسم المصدر</label><input id="sName" value="${safe(src?.name||'')}"></div><div class="field"><label>النوع</label><input id="sType" value="${safe(src?.type||'مولد')}"></div><div class="field"><label>سعر كيلو افتراضي</label><input id="sRate" type="number" step="0.01" value="${src?.defaultRate??''}"></div><div class="field"><label>الحالة</label><select id="sActive"><option value="1" ${src?.active!==false?'selected':''}>فعال</option><option value="0" ${src?.active===false?'selected':''}>موقوف</option></select></div></div><div class="actions"><button class="btn primary" id="saveSource">حفظ</button><button class="btn ghost" id="closeSource">إلغاء</button></div>`);$('#closeSource').onclick=closeModal;$('#saveSource').onclick=async()=>{const name=$('#sName').value.trim();if(!name){toast('اكتب اسم المصدر','error');return;}const data={name,type:$('#sType').value.trim()||'مولد',defaultRate:$('#sRate').value===''?null:num($('#sRate').value),active:$('#sActive').value==='1'};if(src){await updateDoc(orgDoc('sources',id),{...data,updatedAt:serverTimestamp()});upsertLocal('sources',{id,...data});toast('تم تعديل المصدر');}else{const r=doc(orgCollection('sources'));await setDoc(r,{...data,code:name.toLowerCase().replace(/\s+/g,'-'),createdAt:serverTimestamp()});upsertLocal('sources',{id:r.id,...data});const p=selectedPeriod();if(p){const er=doc(orgCollection('energyReadings'));await setDoc(er,{periodId:p.id,sourceId:r.id,previousReading:null,currentReading:null,pricePerKwh:data.defaultRate,consumption:null,cost:null,status:'Pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});}toast('تمت إضافة المصدر');}closeModal();state.loaded=false;await loadData(true);renderEnergy();};}

function renderCosts(){
  setTitle('المصاريف والطوارئ','سجّل الحارس، المولد الخارجي، السولار والصيانة. المساهمات والخصومات لها صفحة منفصلة.');
  const periods=latestPeriods();if(!state.periodId)state.periodId=periods[0]?.id;const p=selectedPeriod();const rows=p?costsForPeriod(p.id).filter(x=>x.direction!=='credit'):[];
  const totalExpense=rows.reduce((a,x)=>a+num(x.amount),0);
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>مصاريف وخدمات الأسبوع</h2><p>أضف الحارس، تأمين الغاطس، مولد خارجي، سولار، صيانة أو أي مصروف تشغيلي.</p></div><button class="btn primary" id="addCost">+ إضافة مصروف / خدمة</button></div>${!p?empty('افتح أسبوعًا أولًا','المصاريف والخدمات مرتبطة بالأسبوع.'): `<div class="period-picker"><label>الأسبوع الحالي</label><select id="periodSelect" class="period-select">${periods.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${safe(x.label||'أسبوع')} — ${fmtDate(x.startDate)} إلى ${fmtDate(x.endDate)}</option>`).join('')}</select></div><div class="money-grid"><div class="money-card"><small>إجمالي المصاريف</small><b>${money(totalExpense)}</b></div><div class="money-card"><small>المساهمات والخصومات</small><b>${money((state.data.contributions||[]).filter(x=>x.periodId===p.id).reduce((a,x)=>a+num(x.amount),0))}</b></div><div class="money-card"><small>صافي التشغيل</small><b>${money(totalExpense-(state.data.contributions||[]).filter(x=>x.periodId===p.id).reduce((a,x)=>a+num(x.amount),0))}</b></div></div><div class="section-note" style="margin-top:13px"><b>التوزيع:</b> اختر على كل ساكن، أو اقسم على عدد تحدده، أو مبلغًا ثابتًا للشخص الواحد. المولد الخارجي يعمل بنفس النظام.</div><div class="table-wrap" style="margin-top:13px"><table class="table"><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المبلغ</th><th>التوزيع</th><th>إجراءات</th></tr></thead><tbody>${rows.length?rows.map(c=>`<tr><td>${fmtDate(c.date)}</td><td>${safe(c.type||'—')}</td><td>${safe(c.description||'—')}</td><td class="strong">${money(c.amount)}</td><td>${c.allocationLabel?safe(c.allocationLabel):'—'}</td><td><div class="row-actions"><button class="mini" data-edit-cost="${c.id}">تعديل</button><button class="mini red" data-delete-cost="${c.id}">حذف</button></div></td></tr>`).join(''):`<tr><td colspan="6">${empty('لا توجد مصاريف','ابدأ بإضافة خدمة الحارس أو مولد خارجي أو أي مصروف.')}</td></tr>`}</tbody></table></div>`}</section>`;
  $('#addCost').onclick=()=>showCostForm(p?.id);$('#periodSelect')?.addEventListener('change',e=>navigate('costs',e.target.value));$$('[data-edit-cost]').forEach(b=>b.onclick=()=>showCostForm(p.id,b.dataset.editCost));$$('[data-delete-cost]').forEach(b=>b.onclick=()=>deleteCost(b.dataset.deleteCost));
}
function allocationPreview(kind,amount,perPerson,count){
  const n=Math.max(0,Math.floor(num(count)));const a=num(amount);const pp=num(perPerson);
  if(kind==='per_person') return {count:n,each:pp,total:pp*n,label:`${money(pp)} لكل ساكن × ${n}`};
  if(kind==='divide') return {count:n,each:n? a/n:0,total:a,label:`${money(a)} ÷ ${n}`};
  if(kind==='equal_all') return {count:n,each:n? a/n:0,total:a,label:`على ${n} ساكن`};
  return {count:0,each:0,total:0,label:'بدون توزيع'};
}
function showCostForm(pid,id){
  if(!can('admin','manager','accountant')){toast('إضافة المصاريف مخصصة للإدارة والمحاسبة','error');return;}
  const c=id?(state.data.costs||[]).find(x=>x.id===id):null;const subs=(state.data.subscribers||[]).filter(s=>s.active!==false && s.type!=='خارجي');
  const currentAlloc=c?.allocationRule||'none';
  openModal(`<h2>${c?'تعديل مصروف':'إضافة مصروف أو خدمة'}</h2><p class="modal-lead">الحارس والمولد الخارجي والخدمات كلها تستخدم نفس نظام التوزيع.</p><div class="form-grid"><div class="field"><label>نوع البند</label><select id="cType"><option value="خدمة الحارس" ${c?.type==='خدمة الحارس'?'selected':''}>خدمة الحارس</option><option value="تأمين الغاطس" ${c?.type==='تأمين الغاطس'?'selected':''}>تأمين الغاطس</option><option value="استئجار مولد خارجي" ${c?.type==='استئجار مولد خارجي'?'selected':''}>استئجار مولد خارجي</option><option value="سولار / وقود" ${c?.type==='سولار / وقود'?'selected':''}>سولار / وقود</option><option value="نقل" ${c?.type==='نقل'?'selected':''}>نقل</option><option value="صيانة" ${c?.type==='صيانة'?'selected':''}>صيانة</option><option value="طوارئ" ${c?.type==='طوارئ'?'selected':''}>طوارئ</option><option value="كهرباء الدرج" ${c?.type==='كهرباء الدرج'?'selected':''}>كهرباء الدرج</option><option value="أخرى" ${c?.type==='أخرى'||!c?'selected':''}>أخرى</option></select></div><div class="field"><label>التاريخ</label><input id="cDate" type="date" value="${safe(c?.date||dateNow())}"></div><div class="field"><label>المبلغ الكامل</label><input id="cAmount" type="number" step="0.01" min="0" value="${c?.amount??''}" placeholder="مثال 1110"></div><div class="field"><label>طريقة التوزيع</label><select id="cAlloc"><option value="none" ${currentAlloc==='none'?'selected':''}>بدون توزيع على السكان</option><option value="equal_all" ${currentAlloc==='equal_all'?'selected':''}>على كل ساكن (المبلغ ÷ العدد)</option><option value="divide" ${currentAlloc==='divide'?'selected':''}>أقسم على عدد أحدده</option><option value="per_person" ${currentAlloc==='per_person'?'selected':''}>مبلغ على الشخص الواحد</option></select></div><div class="field"><label>عدد الأشخاص</label><input id="cCount" type="number" min="0" step="1" value="${c?.allocationCount??subs.length}" placeholder="مثال 37"></div><div class="field"><label>مبلغ الشخص الواحد (عند الاختيار)</label><input id="cPerPerson" type="number" min="0" step="0.01" value="${c?.perPersonAmount??''}" placeholder="مثال 30"></div><div class="field full" id="allocationPreviewBox"><div class="section-note">سيظهر حساب التوزيع هنا.</div></div><div class="field full"><label>البيان</label><input id="cDesc" value="${safe(c?.description||'')}"></div><div class="field full"><label>ملاحظات</label><textarea id="cNotes">${safe(c?.notes||'')}</textarea></div></div><div class="actions"><button class="btn primary" id="saveCost">حفظ</button><button class="btn ghost" id="cancelCost">إلغاء</button></div>`);
  const updatePreview=()=>{const box=$('#allocationPreviewBox');const v=allocationPreview($('#cAlloc').value,$('#cAmount').value,$('#cPerPerson').value,$('#cCount').value);box.innerHTML=v.count?`<div class="section-note"><b>نتيجة التوزيع:</b> ${safe(v.label)}<br>المبلغ المحمّل لكل ساكن: <b>${money(v.each)}</b> — إجمالي موزع: <b>${money(v.total)}</b></div>`:'<div class="section-note">هذا البند لن يضاف تلقائيًا على حساب السكان.</div>';};
  ['cAlloc','cAmount','cPerPerson','cCount'].forEach(k=>$('#'+k).addEventListener('input',updatePreview));updatePreview();$('#cancelCost').onclick=closeModal;
  $('#saveCost').onclick=async()=>{
    const amount=num($('#cAmount').value);if(amount<=0){toast('اكتب المبلغ الكامل','error');return;}
    const alloc=$('#cAlloc').value,count=Math.max(0,Math.floor(num($('#cCount').value))),per=num($('#cPerPerson').value);if(alloc!=='none'&&!count){toast('اكتب عدد الأشخاص للتوزيع','error');return;}if(alloc==='per_person'&&per<=0){toast('اكتب مبلغ الشخص الواحد','error');return;}
    const preview=allocationPreview(alloc,amount,per,count);
    const data={periodId:pid,type:$('#cType').value,date:$('#cDate').value,amount,direction:'expense',description:$('#cDesc').value.trim()||$('#cType').value,notes:$('#cNotes').value.trim(),allocationRule:alloc,allocationCount:count,perPersonAmount:alloc==='per_person'?per:null,allocatedPerPerson:alloc==='none'?0:preview.each,allocationLabel:alloc==='none'?'بدون توزيع':preview.label,createdBy:c?.createdBy||state.user.uid,updatedAt:serverTimestamp()};
    const ref=c?orgDoc('costs',id):doc(orgCollection('costs'));const ops=[];
    if(c) ops.push(b=>b.update(ref,data)); else ops.push(b=>b.set(ref,{...data,createdAt:serverTimestamp()}));
    // remove old allocations on edit, then recreate the current distribution
    if(c) for(const tr of (state.data.ledger||[]).filter(x=>x.referenceId===id&&['SERVICE','ALLOCATED_COST'].includes(x.transactionType))) ops.push(b=>b.delete(orgDoc('ledger',tr.id)));
    if(alloc!=='none'&&preview.each>0){for(const sub of subs.slice(0,count)){const lr=doc(orgCollection('ledger'));ops.push(b=>b.set(lr,{subscriberId:sub.id,periodId:pid,transactionType:'SERVICE',serviceCode:data.type==='استئجار مولد خارجي'?'EXTERNAL_GENERATOR':data.type==='خدمة الحارس'?'GUARD':data.type==='تأمين الغاطس'?'PUMP_INSURANCE':'ALLOCATED_COST',debit:preview.each,credit:0,description:data.description,referenceId:ref.id,createdAt:serverTimestamp(),createdBy:state.user.uid}));}}
    await commitOps(ops);state.loaded=false;await loadData(true);closeModal();toast(c?'تم تحديث المصروف':'تم حفظ المصروف وتوزيعه');renderCosts();
  };
}

function renderContributions(){
  setTitle('المساهمات والخصومات','سجّل المساهمات التي تقلل تكلفة تشغيل الأسبوع قبل حساب سعر الكوب.');
  if(!can('admin','manager','accountant')){$('#app').innerHTML=`<section class="panel">${empty('هذه الصفحة للإدارة','لا تملك صلاحية تسجيل المساهمات.')}</section>`;return;}
  const periods=latestPeriods();if(!state.periodId)state.periodId=periods[0]?.id;const p=selectedPeriod();const rows=p?(state.data.contributions||[]).filter(x=>x.periodId===p.id):[];const total=rows.reduce((a,x)=>a+num(x.amount),0);
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>المساهمات والخصومات</h2><p>هذا المبلغ يُخصم من تكلفة التشغيل قبل قسمة التكلفة على استهلاك المياه.</p></div><button class="btn primary" id="addContribution">+ إضافة مساهمة / خصم</button></div>${!p?empty('افتح أسبوعًا أولًا',''): `<div class="period-picker"><label>الأسبوع الحالي</label><select id="periodSelect" class="period-select">${periods.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${safe(x.label||'أسبوع')} — ${fmtDate(x.startDate)} إلى ${fmtDate(x.endDate)}</option>`).join('')}</select></div><div class="money-grid"><div class="money-card"><small>إجمالي الخصومات</small><b>${money(total)}</b></div></div><div class="table-wrap" style="margin-top:13px"><table class="table"><thead><tr><th>التاريخ</th><th>البيان</th><th>المبلغ</th><th>إجراءات</th></tr></thead><tbody>${rows.length?rows.map(c=>`<tr><td>${fmtDate(c.date)}</td><td>${safe(c.description||'—')}</td><td class="strong">${money(c.amount)}</td><td><div class="row-actions"><button class="mini" data-edit-contribution="${c.id}">تعديل</button><button class="mini red" data-delete-contribution="${c.id}">حذف</button></div></td></tr>`).join(''):`<tr><td colspan="4">${empty('لا توجد مساهمات','يمكن تسجيل أي مساهمة/خصم من هنا.')}</td></tr>`}</tbody></table></div>`}</section>`;
  $('#addContribution').onclick=()=>showContributionForm(p?.id);$('#periodSelect')?.addEventListener('change',e=>navigate('contributions',e.target.value));$$('[data-edit-contribution]').forEach(b=>b.onclick=()=>showContributionForm(p.id,b.dataset.editContribution));$$('[data-delete-contribution]').forEach(b=>b.onclick=()=>deleteContribution(b.dataset.deleteContribution));
}
function showContributionForm(pid,id){
  if(!can('admin','manager','accountant')){toast('المساهمات مخصصة للإدارة والمحاسبة','error');return;}
  const c=id?(state.data.contributions||[]).find(x=>x.id===id):null;
  openModal(`<h2>${c?'تعديل مساهمة':'إضافة مساهمة / خصم'}</h2><p class="modal-lead">القيمة هنا تقلل من تكلفة التشغيل قبل حساب سعر الكوب.</p><div class="form-grid"><div class="field"><label>التاريخ</label><input id="xDate" type="date" value="${safe(c?.date||dateNow())}"></div><div class="field"><label>المبلغ</label><input id="xAmount" type="number" min="0" step="0.01" value="${c?.amount??''}"></div><div class="field full"><label>البيان</label><input id="xDesc" value="${safe(c?.description||'مساهمة / خصم')}"></div></div><div class="actions"><button class="btn primary" id="saveContribution">حفظ</button><button class="btn ghost" id="cancelContribution">إلغاء</button></div>`);
  $('#cancelContribution').onclick=closeModal;$('#saveContribution').onclick=async()=>{const amount=num($('#xAmount').value);if(amount<=0){toast('اكتب مبلغًا صحيحًا','error');return;}const data={periodId:pid,date:$('#xDate').value,amount,description:$('#xDesc').value.trim()||'مساهمة / خصم',createdBy:c?.createdBy||state.user.uid,updatedAt:serverTimestamp()};if(c)await updateDoc(orgDoc('contributions',id),data);else{const r=doc(orgCollection('contributions'));await setDoc(r,{...data,createdAt:serverTimestamp()});}state.loaded=false;await loadData(true);closeModal();renderContributions();toast(c?'تم تعديل المساهمة':'تمت إضافة المساهمة');};
}
async function deleteContribution(id){if(!can('admin','manager','accountant')){toast('لا تملك صلاحية الحذف','error');return;}const c=(state.data.contributions||[]).find(x=>x.id===id);if(!c)return;if(!confirm(`حذف المساهمة «${c.description||''}» بمبلغ ${money(c.amount)}؟`))return;await deleteDoc(orgDoc('contributions',id));removeLocal('contributions',id);toast('تم حذف المساهمة');renderContributions();}

function renderSubscribers(){
  setTitle('السكان والوحدات','هنا تحدد البنايات والوحدات وتعدل بيانات أي ساكن. الساكن لا يستطيع تعديل بياناته.');const rows=(state.data.subscribers||[]);const buildings=state.data.buildings||[];const units=state.data.units||[];
  $('#app').innerHTML=`<section class="grid-2"><div class="panel"><div class="panel-head"><div><h2>البنايات والوحدات</h2><p>حدد البناية ثم الوحدات التابعة لها.</p></div><button class="btn primary" id="addBuilding">+ بناية</button></div><div class="members">${buildings.length?buildings.map(b=>`<div class="member-row"><div class="avatar">ب</div><div class="member-info"><b>${safe(b.name)}</b><span>الكود: ${safe(b.code||'—')} • ${units.filter(u=>u.buildingId===b.id).length} وحدات</span></div><button class="mini" data-edit-building="${b.id}">تعديل</button><button class="mini red" data-delete-building="${b.id}">حذف</button></div>`).join(''):empty('لا توجد بنايات','أضف البناية الأولى.')}</div><div class="actions"><button class="btn soft" id="addUnit">+ إضافة وحدة</button></div></div><div class="panel"><div class="panel-head"><div><h2>السكان</h2><p>اضغط على الاسم لكشف الحساب. التعديل والحذف للإدارة فقط.</p></div><div class="panel-actions"><button class="btn soft" id="exportSubs">↓ Excel</button><button class="btn primary" id="addSub">+ ساكن</button></div></div><div class="toolbar"><input id="subSearch" class="search" placeholder="ابحث بالاسم أو الكود أو الهاتف…"><select id="subSort" class="sort-select"><option value="code-asc">الكود تصاعدي ↑</option><option value="code-desc">الكود تنازلي ↓</option><option value="name-asc">الاسم أبجدي ↑</option><option value="name-desc">الاسم أبجدي ↓</option></select><span class="muted">${rows.filter(s=>s.active!==false).length} نشط</span></div><div class="table-wrap"><table class="table" style="min-width:900px"><thead><tr><th>الكود</th><th>الاسم</th><th>النوع</th><th>البناية</th><th>الوحدة</th><th>الرصيد</th><th></th></tr></thead><tbody id="subBody">${subscriberRowsSorted(rows,'code-asc')}</tbody></table></div></section></section>`;
  $('#addBuilding').onclick=()=>showBuildingForm();$('#addUnit').onclick=()=>showUnitForm();$('#addSub').onclick=()=>showSubscriberForm();$('#exportSubs').onclick=()=>exportSubscribers(rows);$('#subSearch').oninput=e=>refreshSubscriberRows();$('#subSort').onchange=()=>refreshSubscriberRows();$$('[data-edit-building]').forEach(b=>b.onclick=()=>showBuildingForm(b.dataset.editBuilding));$$('[data-delete-building]').forEach(b=>b.onclick=()=>deleteBuilding(b.dataset.deleteBuilding));bindSubscriberActions();
  function refreshSubscriberRows(){const q=$('#subSearch').value.trim().toLowerCase();const sort=$('#subSort').value;const filtered=rows.filter(s=>[s.name,s.code,s.phone].some(v=>String(v||'').toLowerCase().includes(q)));$('#subBody').innerHTML=subscriberRowsSorted(filtered,sort);bindSubscriberActions();}
}
function subscriberRows(rows){return subscriberRowsSorted(rows,'code-asc');}
function subscriberRowsSorted(rows,sort){
  const a=[...rows].sort((x,y)=>{if(sort==='name-asc'||sort==='name-desc'){const c=String(x.name||'').localeCompare(String(y.name||''),'ar');return sort==='name-asc'?c:-c;}const c=String(x.code||'').localeCompare(String(y.code||''),undefined,{numeric:true});return sort==='code-asc'?c:-c;});
  if(!a.length)return `<tr><td colspan="7">${empty('لا يوجد سكان','أضف أول ساكن.')}</td></tr>`;
  return a.map(s=>{const r=subscriberRow(s);return `<tr><td><span class="code">${safe(s.code)}</span></td><td><button class="link" data-account="${s.id}">${safe(s.name)}</button></td><td>${s.type==='خارجي'?'<span class="badge warn">خارجي</span>':'داخلي'}</td><td>${safe(r.buildingName)}</td><td>${safe(r.unitCode)}</td><td class="strong">${money(r.balance)}</td><td><div class="row-actions">${can('admin','manager')?`<button class="mini" data-edit-sub="${s.id}">تعديل</button><button class="mini red" data-delete-sub="${s.id}">حذف</button>`:''}</div></td></tr>`}).join('');
}
function bindSubscriberActions(){$$('[data-edit-sub]').forEach(b=>b.onclick=()=>showSubscriberForm(b.dataset.editSub));$$('[data-delete-sub]').forEach(b=>b.onclick=()=>deleteSubscriber(b.dataset.deleteSub));}

function showBuildingForm(id){const b=id?(state.data.buildings||[]).find(x=>x.id===id):null;openModal(`<h2>${b?'تعديل البناية':'إضافة بناية'}</h2><p class="modal-lead">مثال: البناية الأولى، البناية الثانية.</p><div class="form-grid"><div class="field"><label>اسم البناية</label><input id="bName" value="${safe(b?.name||'')}"></div><div class="field"><label>الكود</label><input id="bCode" value="${safe(b?.code||'')}"></div></div><div class="actions"><button class="btn primary" id="saveBuilding">حفظ</button><button class="btn ghost" id="cancelBuilding">إلغاء</button></div>`);$('#cancelBuilding').onclick=closeModal;$('#saveBuilding').onclick=async()=>{const name=$('#bName').value.trim(),code=$('#bCode').value.trim();if(!name||!code){toast('اكتب الاسم والكود','error');return;}if(b)await updateDoc(orgDoc('buildings',id),{name,code,updatedAt:serverTimestamp()});else{const r=doc(orgCollection('buildings'));await setDoc(r,{name,code,active:true,createdAt:serverTimestamp()});}state.loaded=false;await loadData(true);closeModal();toast('تم حفظ البناية');renderSubscribers();};}
function showUnitForm(id){const u=id?(state.data.units||[]).find(x=>x.id===id):null;openModal(`<h2>${u?'تعديل الوحدة':'إضافة وحدة'}</h2><div class="form-grid"><div class="field"><label>البناية</label><select id="uBuilding"><option value="">اختر</option>${(state.data.buildings||[]).map(b=>`<option value="${b.id}" ${u?.buildingId===b.id?'selected':''}>${safe(b.name)}</option>`).join('')}</select></div><div class="field"><label>رقم الوحدة</label><input id="uCode" value="${safe(u?.code||'')}"></div><div class="field"><label>الدور</label><input id="uFloor" value="${safe(u?.floor||'')}"></div></div><div class="actions"><button class="btn primary" id="saveUnit">حفظ</button><button class="btn ghost" id="cancelUnit">إلغاء</button></div>`);$('#cancelUnit').onclick=closeModal;$('#saveUnit').onclick=async()=>{const buildingId=$('#uBuilding').value,code=$('#uCode').value.trim();if(!buildingId||!code){toast('اختر البناية واكتب رقم الوحدة','error');return;}const data={buildingId,code,unitNumber:code,floor:$('#uFloor').value.trim(),active:true,updatedAt:serverTimestamp()};if(u)await updateDoc(orgDoc('units',id),data);else{const r=doc(orgCollection('units'));await setDoc(r,{...data,createdAt:serverTimestamp()});}state.loaded=false;await loadData(true);closeModal();toast('تم حفظ الوحدة');renderSubscribers();};}
function showSubscriberForm(id){
  if(!can('admin','manager','accountant')){toast('تعديل بيانات السكان مخصص للإدارة','error');return;}
  const s=id?(state.data.subscribers||[]).find(x=>x.id===id):null;const u=s?unitForSub(s):null;openModal(`<h2>${s?'تعديل بيانات الساكن':'إضافة ساكن جديد'}</h2><p class="modal-lead">بيانات الساكن تعدلها الإدارة فقط، وتاريخه المالي لا يتأثر.</p><div class="form-grid"><div class="field"><label>الاسم</label><input id="fName" value="${safe(s?.name||'')}"></div><div class="field"><label>الكود</label><input id="fCode" value="${safe(s?.code||'')}"></div><div class="field"><label>النوع</label><select id="fType"><option value="داخلي" ${s?.type!=='خارجي'?'selected':''}>ساكن داخلي</option><option value="خارجي" ${s?.type==='خارجي'?'selected':''}>مستهلك خارجي</option></select></div><div class="field"><label>الهاتف</label><input id="fPhone" value="${safe(s?.phone||'')}"></div><div class="field"><label>البناية</label><select id="fBuilding"><option value="">${s?.type==='خارجي'?'غير مرتبط ببناية':'اختر البناية'}</option>${(state.data.buildings||[]).map(b=>`<option value="${b.id}" ${u?.buildingId===b.id?'selected':''}>${safe(b.name)}</option>`).join('')}</select></div><div class="field"><label>الوحدة</label><select id="fUnit"><option value="">${s?.type==='خارجي'?'خارجي / بدون وحدة':'اختر الوحدة'}</option>${(state.data.units||[]).map(x=>`<option value="${x.id}" ${x.id===u?.id?'selected':''}>${safe(buildingName(x.buildingId))} — ${safe(x.code)}</option>`).join('')}</select></div><div class="field"><label>خدمة الحارس</label><input id="fGuard" type="number" step="0.01" value="${s?.defaultGuardFee??0}"></div><div class="field"><label>تأمين الغاطس</label><input id="fPump" type="number" step="0.01" value="${s?.defaultPumpInsurance??0}"></div><div class="field full"><label>ملاحظات</label><textarea id="fNotes">${safe(s?.notes||'')}</textarea></div></div><div class="actions"><button class="btn primary" id="saveSub">حفظ</button><button class="btn ghost" id="cancelSub">إلغاء</button></div>`);
  $('#cancelSub').onclick=closeModal;$('#saveSub').onclick=async()=>{const name=$('#fName').value.trim(),code=$('#fCode').value.trim(),type=$('#fType').value;if(!name||!code){toast('اكتب الاسم والكود','error');return;}if((state.data.subscribers||[]).some(x=>x.code===code&&x.id!==id)){toast('الكود مستخدم بالفعل','error');return;}const unitId=type==='خارجي'?null:($('#fUnit').value||null);const data={name,code,type,phone:$('#fPhone').value.trim(),unitId,defaultGuardFee:num($('#fGuard').value),defaultPumpInsurance:num($('#fPump').value),notes:$('#fNotes').value.trim(),active:true};
    if(s){await updateDoc(orgDoc('subscribers',id),{...data,updatedAt:serverTimestamp(),updatedBy:state.user.uid});const meter=(state.data.meters||[]).find(m=>m.subscriberId===id);if(meter)await updateDoc(orgDoc('meters',meter.id),{unitId});upsertLocal('subscribers',{id,...data});toast('تم تعديل بيانات الساكن');}else{const sr=doc(orgCollection('subscribers'));await setDoc(sr,{...data,createdAt:serverTimestamp(),createdBy:state.user.uid});const mr=doc(orgCollection('meters'));await setDoc(mr,{meterCode:`W-${code}`,meterType:'مياه',subscriberId:sr.id,unitId,active:true,createdAt:serverTimestamp()});upsertLocal('subscribers',{id:sr.id,...data});upsertLocal('meters',{id:mr.id,meterCode:`W-${code}`,meterType:'مياه',subscriberId:sr.id,unitId,active:true});toast('تمت إضافة الساكن');}
    closeModal();state.loaded=false;await loadData(true);renderSubscribers();};
}
async function archiveOrDelete(id){return deleteSubscriber(id);}

function renderPayments(){
  setTitle('الدفعات والأرصدة','سجّل أي دفعة، وسيتم خصم دفعة الفترة في آخر حساب الرسالة والكشف.');const pays=[...(state.data.payments||[])].sort((a,b)=>String(b.paymentDate||'').localeCompare(String(a.paymentDate||'')));const subs=(state.data.subscribers||[]).filter(s=>s.active!==false);
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>الدفعات</h2><p>يمكن حذف الدفعة من زر الحذف، وسيعود الرصيد للحساب تلقائيًا.</p></div><div class="panel-actions"><button class="btn soft" id="exportPayments">↓ Excel</button><button class="btn primary" id="newPay">+ تسجيل دفعة</button></div></div><div class="toolbar"><input id="paySearch" class="search" placeholder="ابحث باسم الساكن أو رقم الإيصال…"></div><div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>الساكن</th><th>المبلغ</th><th>الطريقة</th><th>الإيصال</th><th>الرصيد</th><th>إجراءات</th></tr></thead><tbody id="payBody">${paymentRows(pays)}</tbody></table></div></section>`;
  $('#newPay').onclick=showPaymentForm;$('#exportPayments').onclick=()=>exportPayments(pays);$('#paySearch').oninput=e=>$('#payBody').innerHTML=paymentRows(pays.filter(p=>{const s=(state.data.subscribers||[]).find(x=>x.id===p.subscriberId);return [s?.name,p.receiptNumber].some(v=>String(v||'').includes(e.target.value))}));$$('[data-delete-payment]').forEach(b=>b.onclick=()=>deletePayment(b.dataset.deletePayment));
}
function paymentRows(pays){if(!pays.length)return `<tr><td colspan="7">${empty('لا توجد دفعات','سجّل أول دفعة من الزر أعلاه.')}</td></tr>`;return pays.map(p=>{const s=(state.data.subscribers||[]).find(x=>x.id===p.subscriberId);return `<tr><td>${fmtDate(p.paymentDate)}</td><td><button class="link" data-account="${p.subscriberId}">${safe(s?.name||'—')}</button></td><td class="strong">${money(p.amount)}</td><td>${safe(p.method||'—')}</td><td>${safe(p.receiptNumber||'—')}</td><td class="strong">${money(balanceOf(p.subscriberId))}</td><td><button class="mini red" data-delete-payment="${p.id}">حذف</button></td></tr>`}).join('');}
function showPaymentForm(){const subs=(state.data.subscribers||[]).filter(s=>s.active!==false);const periods=latestPeriods();openModal(`<h2>تسجيل دفعة</h2><p class="modal-lead">اختر الأسبوع الذي تخصه الدفعة حتى تظهر في الرسالة كدفعة الفترة وتُخصم في النهاية.</p><div class="form-grid"><div class="field full"><label>الساكن</label><select id="paySub"><option value="">اختر الساكن</option>${subs.map(s=>`<option value="${s.id}">${safe(s.code)} — ${safe(s.name)}</option>`).join('')}</select></div><div class="field"><label>الفترة</label><select id="payPeriod"><option value="">دفعة عامة / تحت الحساب</option>${periods.map(p=>`<option value="${p.id}" ${p.id===state.periodId?'selected':''}>${safe(p.label)} — ${fmtDate(p.startDate)}</option>`).join('')}</select></div><div class="field"><label>المبلغ</label><input id="payAmount" type="number" min="0" step="0.01"></div><div class="field"><label>التاريخ</label><input id="payDate" type="date" value="${dateNow()}"></div><div class="field"><label>طريقة الدفع</label><select id="payMethod"><option>نقدي</option><option>تحويل بنكي</option><option>أخرى</option></select></div><div class="field"><label>رقم الإيصال</label><input id="payReceipt" placeholder="اختياري"></div><div class="field full"><label>ملاحظة</label><textarea id="payNote"></textarea></div></div><div class="actions"><button class="btn primary" id="savePay">حفظ الدفعة</button><button class="btn ghost" id="cancelPay">إلغاء</button></div>`);$('#cancelPay').onclick=closeModal;$('#savePay').onclick=async()=>{const subscriberId=$('#paySub').value,amount=num($('#payAmount').value),periodId=$('#payPeriod').value||null;if(!subscriberId||amount<=0){toast('اختر الساكن واكتب مبلغًا صحيحًا','error');return;}const ref=doc(orgCollection('payments'));const lr=doc(orgCollection('ledger'));const payment={subscriberId,periodId,amount,paymentDate:$('#payDate').value,method:$('#payMethod').value,receiptNumber:$('#payReceipt').value.trim(),note:$('#payNote').value.trim(),createdBy:state.user.uid,createdAt:serverTimestamp()};const batch=writeBatch(db);batch.set(ref,payment);batch.set(lr,{subscriberId,periodId,transactionType:'PAYMENT',credit:amount,debit:0,description:'دفعة',referenceId:ref.id,paymentDate:payment.paymentDate,createdAt:serverTimestamp(),createdBy:state.user.uid});await batch.commit();closeModal();state.loaded=false;await loadData(true);toast('تم تسجيل الدفعة');renderPayments();};}


function showServiceForm(pid){
  if(!can('admin','manager','accountant')){toast('الخدمات مخصصة للإدارة والمحاسبة','error');return;}
  const active=(state.data.subscribers||[]).filter(s=>s.active!==false&&s.type!=='خارجي');
  openModal(`<h2>الخدمات الدورية</h2><p class="modal-lead">أضف خدمة الحارس وتأمين الغاطس للسكان لهذا الأسبوع. يمكنك حذف هذين النوعين من الخدمات لاحقًا.</p><div class="section-note">القيم الافتراضية تأتي من بيانات الساكن ويمكن تعديلها من صفحة السكان.</div><div class="table-wrap"><table class="table"><thead><tr><th>الكود</th><th>الساكن</th><th>الحارس</th><th>تأمين الغاطس</th></tr></thead><tbody>${active.map(s=>`<tr><td>${safe(s.code)}</td><td>${safe(s.name)}</td><td>${money(s.defaultGuardFee||0)}</td><td>${money(s.defaultPumpInsurance||0)}</td></tr>`).join('')}</tbody></table></div><div class="actions"><button class="btn primary" id="applyServices">إضافة الخدمات غير المضافة</button><button class="btn danger" id="deleteServices">حذف خدمات الحارس وتأمين الغاطس لهذا الأسبوع</button><button class="btn ghost" id="cancelServices">إلغاء</button></div>`);
  $('#cancelServices').onclick=closeModal;
  $('#applyServices').onclick=async()=>{const ops=[];let count=0;for(const s of active){if(num(s.defaultGuardFee)>0 && !(state.data.ledger||[]).some(x=>x.periodId===pid&&x.subscriberId===s.id&&x.transactionType==='SERVICE'&&x.serviceCode==='GUARD')){const lr=doc(orgCollection('ledger'));ops.push(b=>b.set(lr,{subscriberId:s.id,periodId:pid,transactionType:'SERVICE',serviceCode:'GUARD',debit:num(s.defaultGuardFee),credit:0,description:'خدمة الحارس',createdAt:serverTimestamp(),createdBy:state.user.uid}));count++;}if(num(s.defaultPumpInsurance)>0 && !(state.data.ledger||[]).some(x=>x.periodId===pid&&x.subscriberId===s.id&&x.transactionType==='SERVICE'&&x.serviceCode==='PUMP_INSURANCE')){const lr=doc(orgCollection('ledger'));ops.push(b=>b.set(lr,{subscriberId:s.id,periodId:pid,transactionType:'SERVICE',serviceCode:'PUMP_INSURANCE',debit:num(s.defaultPumpInsurance),credit:0,description:'تأمين الغاطس',createdAt:serverTimestamp(),createdBy:state.user.uid}));count++;}}await commitOps(ops);state.loaded=false;await loadData(true);closeModal();toast(`تمت إضافة ${count} رسوم خدمة`);renderPeriods();};
  $('#deleteServices').onclick=()=>deletePeriodicServices(pid);
}
async function calculateWeek(pid){
  if(!can('admin','manager','accountant')){toast('الحساب النهائي يحتاج صلاحية إدارية','error');return;}const t=currentTotals(pid);if(!t.period){toast('الأسبوع غير موجود','error');return;}
  const externalSummary=waterSummaryForPeriod(pid).find(r=>r.key==='external'||r.type==='external');const breakdown=buildingWaterBreakdown(pid);
  if(!externalSummary||externalSummary.currentReading==null||externalSummary.previousReading==null||breakdown.buildings.length<2){toast('تأكد من البنايتين ثم أكمل قراءة الخارجي قبل حساب سعر الكوب.','error');return;}
  const missingResidents=readingsForPeriod(pid).filter(r=>r.currentReading==null||r.previousReading==null).length;if(missingResidents>0){toast(`باقي ${missingResidents} قراءة ساكن قبل اعتماد سعر الكوب. أكملها أولًا.`,'error');return;}
  if(t.waterTotal<=0){toast('إجمالي استهلاك المياه يساوي صفرًا. راجع قراءات السكان والخارجي.','error');return;}if(t.netCost<0){toast('صافي التكلفة سلبي. راجع المصاريف والمساهمات.','error');return;}
  const roundDiff=(t.appliedPrice*t.waterTotal)-t.netCost;const ops=[];ops.push(b=>b.update(orgDoc('periods',pid),{waterUnitPrice:t.appliedPrice,rawWaterUnitPrice:t.rawPrice,totalWaterConsumption:t.waterTotal,netOperationalCost:t.netCost,roundingDifference:roundDiff,status:'Calculated',calculatedAt:serverTimestamp(),calculatedBy:state.user.uid}));
  for(const existing of (state.data.ledger||[]).filter(x=>x.periodId===pid&&x.transactionType==='WATER'))ops.push(b=>b.delete(orgDoc('ledger',existing.id)));
  for(const r of t.readings){if(r.currentReading==null||r.previousReading==null)continue;const m=(state.data.meters||[]).find(x=>x.id===r.meterId);const s=subscriberByMeter(m);if(!s)continue;const consumption=Math.max(0,num(r.currentReading)-num(r.previousReading))/1000;const charge=consumption*t.appliedPrice;ops.push(b=>b.update(orgDoc('readings',r.id),{consumption,unitPrice:t.appliedPrice,chargeAmount:charge,status:'Calculated',updatedAt:serverTimestamp()}));const lr=doc(orgCollection('ledger'));ops.push(b=>b.set(lr,{subscriberId:s.id,periodId:pid,transactionType:'WATER',debit:charge,credit:0,description:`مياه ${t.period.label||''}`,referenceId:r.id,createdAt:serverTimestamp(),createdBy:state.user.uid}));}
  await commitOps(ops);state.loaded=false;await loadData(true);toast(`تم حساب الأسبوع. سعر الكوب ${t.appliedPrice} ₪`);await navigate('periods',pid,true);
}

function renderDebts(){
  setTitle('الديون السابقة','سجّل ما بقي من الفترات القديمة، وسيظهر كله كرُصيد/دين سابق قبل إضافة مياه الأسبوع الحالي.');
  if(!can('admin','manager','accountant')){$('#app').innerHTML=`<section class="panel">${empty('هذه الصفحة للإدارة','لا تملك صلاحية تسجيل الديون.')}</section>`;return;}
  const debts=[...(state.data.debts||[])].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));const subs=(state.data.subscribers||[]).filter(s=>s.active!==false).sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>الديون السابقة</h2><p>يمكن حذف أي دين. الدين غير المسدد يدخل في حساب الرصيد السابق.</p></div><button class="btn primary" id="addDebt">+ إضافة دين</button></div><div class="money-grid"><div class="money-card"><small>إجمالي الديون</small><b>${money(debts.reduce((a,d)=>a+num(d.amount),0))}</b></div><div class="money-card"><small>المتبقي</small><b>${money(debts.reduce((a,d)=>a+Math.max(0,num(d.amount)-num(d.paidAmount)),0))}</b></div></div><div class="table-wrap" style="margin-top:13px"><table class="table"><thead><tr><th>التاريخ</th><th>الساكن</th><th>البيان</th><th>الدين</th><th>المسدد</th><th>المتبقي</th><th>إجراءات</th></tr></thead><tbody>${debts.length?debts.map(d=>{const su=subs.find(x=>x.id===d.subscriberId);return `<tr><td>${fmtDate(d.date)}</td><td>${safe(su?.name||'—')}</td><td>${safe(d.description||'—')}</td><td>${money(d.amount)}</td><td>${money(d.paidAmount||0)}</td><td class="strong">${money(Math.max(0,num(d.amount)-num(d.paidAmount)))}</td><td><div class="row-actions"><button class="mini" data-edit-debt="${d.id}">تعديل</button><button class="mini red" data-delete-debt="${d.id}">حذف</button></div></td></tr>`}).join(''):`<tr><td colspan="7">${empty('لا توجد ديون مسجلة','يمكن تسجيل المتأخرات القديمة هنا.')}</td></tr>`}</tbody></table></div></section>`;
  $('#addDebt').onclick=showDebtForm;$$('[data-edit-debt]').forEach(b=>b.onclick=()=>showDebtForm(b.dataset.editDebt));$$('[data-delete-debt]').forEach(b=>b.onclick=()=>deleteDebt(b.dataset.deleteDebt));
}
function showDebtForm(id){
  const subs=(state.data.subscribers||[]).filter(s=>s.active!==false).sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));const d=id?(state.data.debts||[]).find(x=>x.id===id):null;
  if(!can('admin','manager','accountant')){toast('لا تملك صلاحية تعديل الديون','error');return;}
  openModal(`<h2>${d?'تعديل الدين':'إضافة دين'}</h2><p class="modal-lead">هذا الدين سابق على الأسبوع الحالي وسيظهر في الرصيد السابق.</p><div class="form-grid"><div class="field full"><label>الساكن</label><select id="dSub">${subs.map(s=>`<option value="${s.id}" ${s.id===d?.subscriberId?'selected':''}>${safe(s.code)} — ${safe(s.name)}</option>`).join('')}</select></div><div class="field"><label>المبلغ</label><input id="dAmount" type="number" min="0" step="0.01" value="${d?.amount??''}"></div><div class="field"><label>المبلغ المسدد من هذا الدين</label><input id="dPaid" type="number" min="0" step="0.01" value="${d?.paidAmount??0}"></div><div class="field"><label>التاريخ</label><input id="dDate" type="date" value="${safe(d?.date||dateNow())}"></div><div class="field full"><label>البيان</label><input id="dDesc" value="${safe(d?.description||'دين سابق')}"></div></div><div class="actions"><button class="btn primary" id="saveDebt">حفظ</button><button class="btn ghost" id="cancelDebt">إلغاء</button></div>`);
  $('#cancelDebt').onclick=closeModal;$('#saveDebt').onclick=async()=>{const subscriberId=$('#dSub').value,amount=num($('#dAmount').value),paid=Math.min(amount,Math.max(0,num($('#dPaid').value)));if(!subscriberId||amount<=0){toast('اختر الساكن واكتب مبلغ الدين','error');return;}const data={subscriberId,amount,paidAmount:paid,date:$('#dDate').value,description:$('#dDesc').value.trim()||'دين سابق',updatedAt:serverTimestamp()};
    if(d){await updateDoc(orgDoc('debts',id),data);const led=(state.data.ledger||[]).find(x=>x.referenceId===id&&x.transactionType==='DEBT');if(led)await updateDoc(orgDoc('ledger',led.id),{subscriberId,debit:amount-paid,credit:0,description:data.description,date:data.date,updatedAt:serverTimestamp()});else{const lr=doc(orgCollection('ledger'));await setDoc(lr,{subscriberId,transactionType:'DEBT',debit:amount-paid,credit:0,description:data.description,referenceId:id,date:data.date,createdAt:serverTimestamp(),createdBy:state.user.uid});}
    }else{const ref=doc(orgCollection('debts'));const lr=doc(orgCollection('ledger'));const base={...data,paidAmount:paid,createdAt:serverTimestamp(),createdBy:state.user.uid};const batch=writeBatch(db);batch.set(ref,base);batch.set(lr,{subscriberId,transactionType:'DEBT',debit:amount-paid,credit:0,description:data.description,referenceId:ref.id,date:data.date,createdAt:serverTimestamp(),createdBy:state.user.uid});await batch.commit();}
    state.loaded=false;await loadData(true);closeModal();toast(d?'تم تعديل الدين':'تم تسجيل الدين');renderDebts();};
}


function renderReports(){
  setTitle('التقارير والتصدير','اختر ساكنًا لترى حسابه كاملًا بصورة واضحة، أو نزّل أي تقرير إلى Excel.');
  const periods=latestPeriods();
  const subs=(state.data.subscribers||[]).filter(s=>s.active!==false).sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));
  $('#app').innerHTML=`<section class="report-hero"><div><span class="guide-badge">التقارير</span><h2>كشف حساب الساكن</h2><p>شوف المطلوب عليه، الدين السابق، المياه، الخدمات والدفعات بدون فتح ملف Excel.</p></div><div class="report-mark">₪</div></section>
  <section class="report-grid">
    <div class="report-card report-card-wide"><div class="report-icon">♙</div><h3>كشف حساب ساكن</h3><p>بطاقة كاملة جاهزة للطباعة، مع رسالة جاهزة للنسخ والإرسال.</p><select id="repResident"><option value="">اختر الساكن</option>${subs.map(s=>`<option value="${s.id}">${safe(s.code)} — ${safe(s.name)}</option>`).join('')}</select><button class="btn primary" id="showResidentReport">عرض الكشف</button></div>
    <div class="report-card"><div class="report-icon">◫</div><h3>قراءات أسبوع</h3><p>القراءات السابقة والحالية والاستهلاك.</p><select id="repPeriod"><option value="">اختر الأسبوع</option>${periods.map(p=>`<option value="${p.id}">${safe(p.label)} — ${fmtDate(p.startDate)}</option>`).join('')}</select><button class="btn primary" id="repRead">↓ تنزيل Excel</button></div>
    <div class="report-card"><div class="report-icon">ϟ</div><h3>كهرباء الأسبوع</h3><p>قراءات المولدات والتكلفة.</p><select id="repEnergy"><option value="">اختر الأسبوع</option>${periods.map(p=>`<option value="${p.id}">${safe(p.label)} — ${fmtDate(p.startDate)}</option>`).join('')}</select><button class="btn primary" id="repEn">↓ تنزيل Excel</button></div>
    <div class="report-card"><div class="report-icon">₪</div><h3>الدفعات</h3><p>كل الدفعات المسجلة.</p><button class="btn primary" id="repPay">↓ تنزيل Excel</button></div>
    <div class="report-card"><div class="report-icon">▤</div><h3>الأرصدة</h3><p>الرصيد الحالي لكل ساكن.</p><button class="btn primary" id="repBal">↓ تنزيل Excel</button></div>
    <div class="report-card"><div class="report-icon">★</div><h3>ملخص الحساب</h3><p>التكلفة + الماء + سعر الكوب.</p><select id="repSummary"><option value="">اختر الأسبوع</option>${periods.map(p=>`<option value="${p.id}">${safe(p.label)} — ${fmtDate(p.startDate)}</option>`).join('')}</select><button class="btn primary" id="repSum">↓ تنزيل Excel</button></div>
  </section><section id="resident-report-holder"></section>`;
  $('#showResidentReport').onclick=()=>{const id=$('#repResident').value;if(!id){toast('اختر الساكن','error');return;}renderResidentReportCard(id);};
  $('#repRead').onclick=()=>{const id=$('#repPeriod').value;if(!id){toast('اختر الأسبوع','error');return;}exportPeriod(id)};
  $('#repEn').onclick=()=>{const id=$('#repEnergy').value;if(!id){toast('اختر الأسبوع','error');return;}exportEnergy(id)};
  $('#repPay').onclick=()=>exportPayments(state.data.payments||[]);
  $('#repBal').onclick=()=>exportBalances((state.data.subscribers||[]).map(subscriberRow));
  $('#repSum').onclick=()=>{const id=$('#repSummary').value;if(!id){toast('اختر الأسبوع','error');return;}exportSummary(id);};
}
function subscriberFinancialSummary(id,periodId=null){
  const s=(state.data.subscribers||[]).find(x=>x.id===id);if(!s)return null;const p=periodId?periodById(periodId):selectedPeriod();const ledger=[...(state.data.ledger||[])].filter(x=>x.subscriberId===id);
  const before=p?ledger.filter(x=>{const per=periodById(x.periodId);return !per || String(per.startDate)<String(p.startDate)}):ledger;
  const current=p?ledger.filter(x=>x.periodId===p.id):[];
  const previousBalance=before.reduce((a,x)=>a+num(x.debit)-num(x.credit),0);
  const reading=(state.data.readings||[]).find(r=>p&&r.periodId===p.id && (state.data.meters||[]).some(m=>m.id===r.meterId&&m.subscriberId===id));
  const appliedPrice=p?.waterUnitPrice??reading?.unitPrice??0;const currentConsumption=reading?.currentReading!=null&&reading?.previousReading!=null?Math.max(0,num(reading.currentReading)-num(reading.previousReading))/1000:0;
  const currentWater=(reading?.chargeAmount!=null?num(reading.chargeAmount):currentConsumption*num(appliedPrice));
  const services=current.filter(x=>x.transactionType==='SERVICE').reduce((a,x)=>a+num(x.debit)-num(x.credit),0);
  const debtsCurrent=current.filter(x=>x.transactionType==='DEBT').reduce((a,x)=>a+num(x.debit)-num(x.credit),0);
  const other=current.filter(x=>!['WATER','SERVICE','PAYMENT','DEBT'].includes(x.transactionType)).reduce((a,x)=>a+num(x.debit)-num(x.credit),0);
  const periodPayments=current.filter(x=>x.transactionType==='PAYMENT').reduce((a,x)=>a+num(x.credit),0);
  const totalPayments=ledger.filter(x=>x.transactionType==='PAYMENT').reduce((a,x)=>a+num(x.credit),0);
  const finalBeforePayments=previousBalance+currentWater+services+debtsCurrent+other;
  const finalBalance=finalBeforePayments-periodPayments;
  return {s,p,previousBalance,currentWater,currentConsumption,services,debtsCurrent,other,periodPayments,totalPayments,finalBeforePayments,unpaidDebts:previousBalance,finalBalance,appliedPrice};
}
function messageForResident(sum){
  const name=sum.s.name||'الساكن';const end=sum.p?.endDate||dateNow();const dayName=new Date(end+'T12:00:00').toLocaleDateString('ar-PS',{weekday:'long'});const day=`${dayName} ${fmtDate(end)}`;
  return `السلام عليكم ${name}\nتفاصيل حساب عمارة الأمين حتى يوم ${day}\nسحب المياه هذا الأسبوع : ${fmt(sum.currentConsumption,3)} كوب\nقيمة مياه الأسبوع : ${money(sum.currentWater)}\nخدمات الحارس + تأمين الغاطس : ${money(sum.services)}\nالرصيد السابق + الديون السابقة : ${money(Math.max(0,sum.previousBalance))}\nالدفعات المسجلة : ${money(sum.periodPayments)}\nالإجمالي قبل الدفعات : ${money(Math.max(0,sum.finalBeforePayments))}\nالإجمالي المطلوب : ${money(Math.max(0,sum.finalBalance))}\nوشكرا لتعاونكم`;
}
function renderResidentReportCard(id){
  const holder=$('#resident-report-holder'); const sum=subscriberFinancialSummary(id);
  if(!holder||!sum)return;
  const info=subscriberRow(sum.s);
  const allLedger=[...(state.data.ledger||[])].filter(x=>x.subscriberId===id).sort((a,b)=>String(b.paymentDate||b.createdAt?.seconds||'').localeCompare(String(a.paymentDate||a.createdAt?.seconds||'')));
  const rs=(state.data.readings||[]).filter(x=>{const m=(state.data.meters||[]).find(m=>m.id===x.meterId);return m?.subscriberId===id}).sort((a,b)=>String(b.periodId).localeCompare(String(a.periodId)));
  holder.innerHTML=`<section class="resident-report-card" id="residentReportCard">
    <div class="resident-report-head"><div><span class="code">${safe(sum.s.code)}</span><h2>${safe(sum.s.name)}</h2><p>${safe(info.buildingName)} · ${safe(info.unitCode)} · ${safe(sum.s.phone||'بدون هاتف')}</p></div><div class="balance-box"><span>الإجمالي المطلوب</span><b>${money(sum.finalBalance)}</b></div></div>
    <div class="resident-summary-grid">
      <div><small>سحب هذا الأسبوع</small><b>${fmt(sum.currentConsumption,3)} كوب</b></div><div><small>مياه الأسبوع</small><b>${money(sum.currentWater)}</b></div>
      <div><small>الحارس + تأمين الغاطس</small><b>${money(sum.services)}</b></div>
      <div><small>الرصيد السابق</small><b>${money(sum.previousBalance)}</b></div>
      <div><small>دفعات هذه الفترة</small><b>${money(sum.periodPayments)}</b></div>
      <div><small>إجمالي الدفعات المسجلة</small><b>${money(sum.totalPayments)}</b></div>
      <div><small>ديون غير مسددة</small><b>${money(sum.unpaidDebts)}</b></div><div><small>حركات إضافية</small><b>${money(sum.other)}</b></div>
    </div>
    <div class="resident-message"><div class="message-head"><div><h3>الرسالة الجاهزة للساكن</h3><p>انسخها وأرسلها على واتساب أو الرسائل.</p></div><button class="btn primary" id="copyResidentMessage">نسخ النص</button></div><textarea id="residentMessageText" readonly>${safe(messageForResident(sum))}</textarea></div>
    <div class="resident-report-actions"><button class="btn soft" id="printResidentReport">طباعة / PDF</button><button class="btn ghost" id="clearResidentReport">إغلاق الكشف</button></div>
    <div class="account-section"><h3>آخر قراءات المياه</h3><div class="table-wrap"><table class="table"><thead><tr><th>الأسبوع</th><th>السابقة</th><th>الحالية</th><th>الاستهلاك</th><th>القيمة</th></tr></thead><tbody>${rs.slice(0,12).map(r=>`<tr><td>${safe(periodById(r.periodId)?.label||'—')}</td><td>${r.previousReading??'—'}</td><td>${r.currentReading??'—'}</td><td>${r.consumption==null?'—':fmt(r.consumption,3)}</td><td>${r.chargeAmount==null?'—':money(r.chargeAmount)}</td></tr>`).join('')||`<tr><td colspan="5">${empty('لا توجد قراءات','')}</td></tr>`}</tbody></table></div></div>
    <div class="account-section"><h3>آخر الحركات المالية</h3><div class="table-wrap"><table class="table"><thead><tr><th>النوع</th><th>الفترة/التاريخ</th><th>المبلغ</th><th>البيان</th></tr></thead><tbody>${allLedger.slice(0,20).map(x=>`<tr><td>${safe(x.transactionType||'—')}</td><td>${safe(periodById(x.periodId)?.label||x.paymentDate||'—')}</td><td>${money(Math.abs(num(x.debit)-num(x.credit)))}</td><td>${safe(x.description||'')}</td></tr>`).join('')||`<tr><td colspan="4">${empty('لا توجد حركات','')}</td></tr>`}</tbody></table></div></div>
  </section>`;
  $('#copyResidentMessage').onclick=async()=>{const txt=$('#residentMessageText').value;try{await navigator.clipboard.writeText(txt);toast('تم نسخ الرسالة');}catch{const ta=$('#residentMessageText');ta.select();document.execCommand('copy');toast('تم نسخ الرسالة');}};
  $('#printResidentReport').onclick=()=>window.print();
  $('#clearResidentReport').onclick=()=>holder.innerHTML='';
}

function exportXlsx(rows,sheet,file){if(window.XLSX){const wb=XLSX.utils.book_new();const ws=XLSX.utils.json_to_sheet(rows);ws['!cols']=Object.keys(rows[0]||{}).map(()=>({wch:23}));XLSX.utils.book_append_sheet(wb,ws,sheet.slice(0,31));XLSX.writeFile(wb,file);toast('تم تنزيل Excel');return;}const csv=[Object.keys(rows[0]||{}).join(','),...rows.map(r=>Object.values(r).map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(','))].join('\n');const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download=file.replace('.xlsx','.csv');a.click();toast('تم تنزيل CSV يفتح في Excel');}
function exportSubscribers(rows){exportXlsx(rows.map(s=>({الكود:s.code,الاسم:s.name,النوع:s.type,البناية:s.buildingName,الوحدة:s.unitCode,الهاتف:s.phone||'',الرصيد:s.balance||0})),'السكان','سكان_عمارة_الأمين.xlsx');}
function exportBalances(rows){exportXlsx(rows.map(s=>({الكود:s.code,الاسم:s.name,البناية:s.buildingName,الوحدة:s.unitCode,الرصيد:s.balance||0})),'الأرصدة','أرصدة_عمارة_الأمين.xlsx');}
function exportPayments(rows){exportXlsx(rows.map(p=>({التاريخ:p.paymentDate,الساكن:(state.data.subscribers||[]).find(s=>s.id===p.subscriberId)?.name||'',المبلغ:p.amount||0,الطريقة:p.method||'',رقم_الإيصال:p.receiptNumber||'',ملاحظة:p.note||''})),'الدفعات','دفعات_عمارة_الأمين.xlsx');}
function exportPeriod(pid){const p=periodById(pid);const rows=readingsForPeriod(pid).map(r=>{const s=subscriberByMeter((state.data.meters||[]).find(m=>m.id===r.meterId));return{الكود:s?.code||'',الاسم:s?.name||'',النوع:s?.type||'',القراءة_السابقة:r.previousReading??'',القراءة_الحالية:r.currentReading??'',الاستهلاك:r.consumption??'',سعر_الكوب:r.unitPrice??p?.waterUnitPrice??'',قيمة_المياه:r.chargeAmount??'',الحالة:r.status||''}});exportXlsx(rows,'قراءات_الماء',`قراءات_${String(p?.label||pid).replace(/[^\w\u0600-\u06FF]+/g,'_')}.xlsx`);}
function exportEnergy(pid){const p=periodById(pid);const rows=energyForPeriod(pid).map(r=>{const s=(state.data.sources||[]).find(x=>x.id===r.sourceId);return{الأسبوع:p?.label||'',المصدر:s?.name||'',القراءة_السابقة:r.previousReading??'',القراءة_الحالية:r.currentReading??'',الاستهلاك:r.consumption??'',سعر_الكيلو:r.pricePerKwh??'',التكلفة:r.cost??'',الحالة:r.status||''}});exportXlsx(rows,'الكهرباء',`كهرباء_${String(p?.label||pid).replace(/[^\w\u0600-\u06FF]+/g,'_')}.xlsx`);}
function exportSummary(pid){const t=currentTotals(pid),b=buildingWaterBreakdown(pid);const rows=[{البند:'الكهرباء من المولدات',القيمة:t.energyCost},{البند:'المصاريف التشغيلية',القيمة:t.extraCost},{البند:'المساهمات والخصومات',القيمة:t.contributionsTotal},{البند:'صافي تكلفة التشغيل',القيمة:t.netCost},{البند:'البناية الأولى',القيمة:b.buildings[0]?.total||0},{البند:'البناية الثانية',القيمة:b.buildings[1]?.total||0},{البند:'الخارجي',القيمة:b.external},{البند:'إجمالي استهلاك المياه',القيمة:t.waterTotal},{البند:'سعر الكوب الخام',القيمة:t.rawPrice},{البند:'سعر الكوب المعتمد',القيمة:t.appliedPrice},{البند:'فرق التقريب',القيمة:(t.appliedPrice*t.waterTotal)-t.netCost}];exportXlsx(rows,'ملخص الحساب',`ملخص_${String(t.period?.label||pid).replace(/[^\w\u0600-\u06FF]+/g,'_')}.xlsx`);}

function renderHistorical(){
  setTitle('البيانات التاريخية','بيانات Excel القديمة المضمنة داخل البرنامج. تُستخدم كبداية، وتُحفظ في Firebase عند أول تشغيل للمدير.');
  const counts={};for(const c of Object.keys(INITIAL_DATA)){if(Array.isArray(INITIAL_DATA[c]))counts[c]=INITIAL_DATA[c].length;}
  const periods=[...(INITIAL_DATA.periods||[])].sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate)));
  const tomb=seedTombstones();
  const rows=periods.map(p=>{const pc=(state.data.periods||[]).find(x=>x.id===p.id);const rd=(state.data.readings||[]).filter(x=>x.periodId===p.id).length;const er=(state.data.energyReadings||[]).filter(x=>x.periodId===p.id).length;const ws=(state.data.waterSummary||[]).filter(x=>x.periodId===p.id&&x.key==='external').length;return `<tr><td><b>${safe(p.label)}</b></td><td>${fmtDate(p.startDate)}</td><td>${fmt(p.waterUnitPrice??0,0)} ₪</td><td>${rd}</td><td>${er}</td><td>${ws?'موجود':'—'}</td><td>${pc?'موجود':'مضمّن'}</td></tr>`}).join('');
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>البيانات القديمة المضمنة</h2><p>هذه البيانات جاءت من ملف Excel حتى 03/09/2026. ورقة 10/09 غير محسوبة لذلك لم تُضمّن.</p></div></div><div class="stats" style="margin-bottom:18px"><div class="stat"><div class="stat-label">السكان</div><div class="stat-value">${counts.subscribers||0}</div><div class="stat-foot">36 داخلي + خارجي</div></div><div class="stat"><div class="stat-label">الأسابيع</div><div class="stat-value">${counts.periods||0}</div><div class="stat-foot">حتى 03/09/2026</div></div><div class="stat"><div class="stat-label">قراءات الماء</div><div class="stat-value">${counts.readings||0}</div><div class="stat-foot">تاريخية</div></div><div class="stat"><div class="stat-label">قراءات الكهرباء</div><div class="stat-value">${counts.energyReadings||0}</div><div class="stat-foot">تاريخية</div></div></div><div class="section-note"><b>طريقة العمل:</b> البيانات المضمنة داخل الكود هي نسخة بداية فقط. عند أول دخول المدير تتم مزامنة ما هو مفقود إلى Firebase. لا يتم استبدال بيانات عدّلتموها في Firebase، وإذا حُذفت بيانات مضمّنة من الموقع فلن تعود للظهور تلقائيًا لأن النظام يسجل عملية الحذف.</div><div class="table-wrap"><table class="table"><thead><tr><th>الأسبوع</th><th>التاريخ</th><th>سعر الكوب</th><th>قراءات الماء</th><th>الكهرباء</th><th>الخارجي</th><th>حالة Firebase</th></tr></thead><tbody>${rows}</tbody></table></div><div class="actions"><button class="btn primary" id="syncEmbeddedBtn">مزامنة البيانات المضمنة الآن</button><button class="btn ghost" id="historyRefreshBtn">تحديث البيانات</button></div></section>`;
  $('#syncEmbeddedBtn').onclick=async()=>{if(!can('admin')){toast('المزامنة مخصصة للمدير','error');return;}try{await syncEmbeddedDefaults();toast('تمت مزامنة البيانات المضمنة');renderHistorical();}catch(e){console.error(e);toast(e?.message||'تعذر المزامنة','error');}};
  $('#historyRefreshBtn').onclick=async()=>{state.loaded=false;await loadData(true);renderHistorical();};
}

function renderSettings(){
  setTitle('الإعدادات والصلاحيات','إدارة المستخدمين والحذف الآمن.');const members=state.data.members||[];const periods=latestPeriods();
  $('#app').innerHTML=`<section class="settings-grid"><div class="panel"><div class="panel-head"><div><h2>حسابك</h2><p>حساب Google الحالي.</p></div></div><div class="member-row"><div class="avatar">${safe((state.user.displayName||'م').slice(0,1))}</div><div class="member-info"><b>${safe(state.user.displayName||'—')}</b><span>${safe(state.user.email||'—')} • ${roleName(state.profile.role)}</span></div></div><div class="actions"><button class="btn ghost" id="logoutSet">تسجيل الخروج</button></div></div><div class="panel"><div class="panel-head"><div><h2>المستخدمون والصلاحيات</h2><p>الحسابات الجديدة تنتظر موافقة المدير.</p></div></div><div class="members">${members.length?members.map(m=>`<div class="member-row"><div class="avatar">${safe((m.displayName||'م').slice(0,1))}</div><div class="member-info"><b>${safe(m.displayName||'—')}</b><span>${safe(m.email||'')}</span></div>${can('admin')?`<select data-role="${m.id}">${Object.entries(ROLES).filter(([k])=>k!=='pending').map(([k,v])=>`<option value="${k}" ${m.role===k?'selected':''}>${v}</option>`).join('')}</select><button class="mini red" data-delete-member="${m.id}">حذف</button>`:statusBadge(m.role)}</div>`).join(''):empty('لا يوجد مستخدمون','سيظهر الحساب بعد تسجيل الدخول.')}</div></div></section><section class="panel danger-panel"><div class="panel-head"><div><h2>الحذف الآمن</h2><p>الحذف من هنا مخصص للمدير.</p></div></div><div class="danger-actions"><select id="deletePeriod"><option value="">اختر أسبوعًا</option>${periods.map(p=>`<option value="${p.id}">${safe(p.label)} — ${fmtDate(p.startDate)}</option>`).join('')}</select><button class="btn danger" id="deletePeriodBtn">حذف الأسبوع</button><button class="btn danger" id="deleteOldPeriodsBtn">حذف كل الأسابيع ما عدا 03/09/2026</button></div></section>`;
  $('#logoutSet').onclick=()=>signOut(auth);$$('[data-role]').forEach(s=>s.onchange=()=>updateRole(s.dataset.role,s.value));$$('[data-delete-member]').forEach(b=>b.onclick=()=>deleteMember(b.dataset.deleteMember));$('#deletePeriodBtn').onclick=()=>deleteWeek($('#deletePeriod').value);$('#deleteOldPeriodsBtn').onclick=deleteOldPeriodsExceptCurrent;
}
async function updateRole(uid,role){if(!can('admin'))return;if(uid===state.user.uid&&role!=='admin'){toast('لا تنزل صلاحيتك من نفسك.','error');return;}await updateDoc(orgDoc('members',uid),{role,updatedAt:serverTimestamp(),updatedBy:state.user.uid});upsertLocal('members',{id:uid,role});toast('تم تعديل الصلاحية');renderSettings();}
async function deleteWeek(pid){
  if(!pid){toast('اختر أسبوعًا','error');return;}if(!can('admin')){toast('حذف الأسبوع مخصص للمدير','error');return;}const p=periodById(pid);if(!p)return;if(!confirm(`سيتم حذف ${p.label||'الأسبوع'} وكل البيانات المرتبطة به من النظام.\n\nهل أنت متأكد؟`))return;
  const ops=[b=>b.delete(orgDoc('periods',pid))];
  for(const c of ['readings','energyReadings','costs','contributions','waterSummary','payments'])for(const r of (state.data[c]||[]).filter(x=>x.periodId===pid))ops.push(b=>b.delete(orgDoc(c,r.id)));
  for(const t of (state.data.ledger||[]).filter(x=>x.periodId===pid))ops.push(b=>b.delete(orgDoc('ledger',t.id)));
  for(const d of (state.data.debts||[]).filter(x=>x.periodId===pid))ops.push(b=>b.delete(orgDoc('debts',d.id)));
  const seedPeriod=(INITIAL_DATA.periods||[]).find(x=>x.id===pid);if(seedPeriod)ops.push(b=>b.set(orgDoc('seedDeletes',`periods__${seedPeriod.id}`),{key:seedDeleteKey('periods',seedPeriod.id),deletedAt:serverTimestamp(),deletedBy:state.user.uid}));
  await commitOps(ops);state.loaded=false;await loadData(true);state.periodId=null;toast('تم حذف الأسبوع وكل بياناته');renderSettings();
}

function openAccount(id){const s=(state.data.subscribers||[]).find(x=>x.id===id);if(!s)return;const r=subscriberRow(s);const rs=(state.data.readings||[]).filter(x=>{const m=(state.data.meters||[]).find(m=>m.id===x.meterId);return m?.subscriberId===id}).sort((a,b)=>{const pa=periodById(a.periodId),pb=periodById(b.periodId);return String(pb?.startDate||'').localeCompare(String(pa?.startDate||''))});const led=(state.data.ledger||[]).filter(x=>x.subscriberId===id).sort((a,b)=>String(b.createdAt?.seconds||0).localeCompare(String(a.createdAt?.seconds||0)));openModal(`<div class="account-top"><div><span class="code">${safe(s.code)}</span><h2>${safe(s.name)}</h2><p>${safe(r.buildingName)} · ${safe(r.unitCode)} · ${safe(s.phone||'بدون هاتف')}</p></div><div class="balance-box"><span>الرصيد الحالي</span><b>${money(r.balance)}</b></div></div><div class="actions"><button class="btn gold" id="editAccount">تعديل بيانات الساكن</button><button class="btn primary" onclick="window.print()">طباعة / PDF</button></div><div class="account-section"><h3>القراءات</h3><div class="table-wrap"><table class="table"><thead><tr><th>الأسبوع</th><th>السابقة</th><th>الحالية</th><th>الاستهلاك</th><th>القيمة</th></tr></thead><tbody>${rs.slice(0,20).map(x=>`<tr><td>${safe(periodById(x.periodId)?.label||'—')}</td><td>${x.previousReading??'—'}</td><td>${x.currentReading??'—'}</td><td>${x.consumption==null?'—':fmt(x.consumption,3)}</td><td>${x.chargeAmount==null?'—':money(x.chargeAmount)}</td></tr>`).join('')||`<tr><td colspan="5">${empty('لا توجد قراءات','')}</td></tr>`}</tbody></table></div></div><div class="account-section"><h3>الحركات المالية</h3><div class="ledger">${led.slice(0,25).map(x=>`<div class="ledger-row"><div><b>${safe(x.description||x.transactionType||'حركة')}</b><span>${safe(x.transactionType||'')}</span></div><strong class="${num(x.credit)>0?'positive':'negative'}">${num(x.debit)>0?'+':'-'}${money(Math.abs(num(x.debit)-num(x.credit)))}</strong></div>`).join('')||empty('لا توجد حركات','')}</div></div>`);$('#editAccount').onclick=()=>{closeModal();showSubscriberForm(id);};}

function showGuide(){
  const steps=[
    {title:'أولًا: افتح الأسبوع',text:'اضغط «ابدأ أسبوعًا جديدًا». النظام يأخذ آخر قراءة لكل عداد ويضعها كقراءة سابقة.',demo:'period',go:'periods'},
    {title:'ثانيًا: سجّل كهرباء المولدات',text:'اذهب إلى «الكهرباء والمولدات». لكل مولد اكتب السابقة والحالية وسعر الكيلو. البرنامج يحسب استهلاك الكهرباء والتكلفة.',demo:'energy',go:'energy'},
    {title:'ثالثًا: أدخل قراءات الماء',text:'اذهب إلى «قراءات الماء». أمام كل ساكن: السابقة والحالية. إذا كانت السابقة خاطئة عدّلها هنا. البرنامج يقسم السحب على 1000 ليصير كوب/م³.',demo:'water',go:'readings'},
    {title:'رابعًا: أضف السولار والطوارئ',text:'اذهب إلى «المصاريف والطوارئ». سجّل السولار، إيجار المولد الخارجي، النقل، الصيانة أو أي طارئ. لا تحسبها يدويًا.',demo:'cost',go:'costs'},
    {title:'خامسًا: احسب سعر الكوب',text:'من «الأسابيع والحساب» ستشاهد تكلفة التشغيل، استهلاك البناية الأولى والثانية والخارجي، ثم السعر الخام وسعر الكوب المعتمد.',demo:'calc',go:'periods'},
    {title:'سادسًا: راجع السكان والدفعات',text:'عدّل بيانات أي ساكن من «السكان والوحدات»، وسجّل الدفع من «الدفعات والأرصدة». الرصيد يُبنى من الحركات.',demo:'money',go:'subscribers'},
    {title:'سابعًا: نزّل Excel',text:'من «التقارير والتصدير» اختر التقرير المطلوب واضغط «تنزيل Excel».',demo:'excel',go:'reports'}
  ];let i=0;const draw=()=>{const s=steps[i];let demo='';if(s.demo==='water')demo='<div class="demo-card-grid"><div class="demo-card"><small>السابقة</small><b>125000</b></div><div class="demo-card"><small>الحالية</small><b>126500</b></div><div class="demo-card"><small>السحب</small><b>1.500 كوب</b></div></div>';else if(s.demo==='energy')demo='<div class="demo-card-grid"><div class="demo-card"><small>أبو زايد — السابقة</small><b>1520</b></div><div class="demo-card"><small>الحالية</small><b>1548</b></div><div class="demo-card"><small>التكلفة</small><b>28 × السعر</b></div></div>';else if(s.demo==='cost')demo='<div class="demo-card-grid"><div class="demo-card"><small>مولد خارجي</small><b>استئجار</b></div><div class="demo-card"><small>سولار</small><b>وقود</b></div><div class="demo-card"><small>طارئ</small><b>صيانة</b></div></div>';else if(s.demo==='calc')demo='<div class="demo-card-grid"><div class="demo-card"><small>البناية 1</small><b>xx.xxx</b></div><div class="demo-card"><small>البناية 2</small><b>xx.xxx</b></div><div class="demo-card"><small>الخارجي</small><b>xx.xxx</b></div></div>';else if(s.demo==='excel')demo='<div class="demo-row"><span>تقرير قراءات</span><b>↓ تنزيل Excel</b></div><div class="demo-row"><span>ملخص الحساب</span><b>↓ تنزيل Excel</b></div>';else demo='<div class="demo-row"><span>الرصيد</span><b>325.00 ₪</b></div><div class="demo-row"><span>دفعة</span><b>−100.00 ₪</b></div>';openModal(`<div class="guide-hero"><div class="guide-topline"><span class="guide-badge">شرح عملي</span><span class="guide-counter">${i+1} / ${steps.length}</span></div><h2>${s.title}</h2><p>${s.text}</p></div><div class="guide-demo"><div class="demo-title">هكذا ستراه داخل الموقع</div>${demo}</div><div class="guide-actions"><button class="btn ghost" id="guideClose">إغلاق</button><div class="guide-actions-right"><button class="btn ghost" id="guidePrev" ${i===0?'disabled':''}>السابق</button><button class="btn primary" id="guideDo">اذهب لهذه الخطوة →</button></div></div>`);$('#guideClose').onclick=closeModal;$('#guidePrev').onclick=()=>{if(i>0){i--;draw();}};$('#guideDo').onclick=()=>{closeModal();navigate(s.go);};};draw();}
function renderPending(){setTitle('بانتظار الموافقة','حسابك معروف، لكن المدير لم يمنحك صلاحية بعد.');$('#app').innerHTML=`<section class="panel" style="max-width:680px;margin:50px auto;text-align:center;padding:40px"><div style="font-size:40px">⌛</div><h2>باقي موافقة المدير</h2><p class="muted">${safe(state.user?.email||'حسابك')} مسجل. بعد موافقة المدير ستظهر بيانات العمارة.</p><button class="btn primary" id="reloadPending">تحديث</button></section>`;$('#reloadPending').onclick=()=>location.reload();}

// Global actions
$('#googleLogin')?.addEventListener('click',async()=>{try{await signInWithPopup(auth,provider)}catch(e){const b=$('#auth-error');b.textContent=e?.message||'تعذر تسجيل الدخول';b.classList.remove('hidden');}});
$('#logoutBtn')?.addEventListener('click',()=>signOut(auth));
$('#refreshBtn')?.addEventListener('click',()=>navigate(state.view,state.periodId,true));
$('#mobileMenu')?.addEventListener('click',()=>$('#sidebar')?.classList.toggle('open'));
$('#quickPaymentBtn')?.addEventListener('click',showPaymentForm);
$('#quickPeriod')?.addEventListener('click',showPeriodForm);
$('#guideBtn')?.addEventListener('click',()=>showGuide());
$('#settingsBtn')?.addEventListener('click',()=>navigate('settings'));
$('#modalClose')?.addEventListener('click',closeModal);
$('#modal')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});
document.addEventListener('click',e=>{const v=e.target.closest('[data-view]');if(v)navigate(v.dataset.view);const a=e.target.closest('[data-account]');if(a)openAccount(a.dataset.account);const ed=e.target.closest('[data-edit-sub]');if(ed){if(can('admin','manager','accountant'))showSubscriberForm(ed.dataset.editSub);else toast('تعديل بيانات السكان مخصص للإدارة','error');}const ar=e.target.closest('[data-archive-sub]');if(ar)archiveOrDelete(ar.dataset.archiveSub);});

onAuthStateChanged(auth,async user=>{state.user=user;$('#boot')?.classList.add('hidden');if(!user){$('#auth-screen')?.classList.remove('hidden');$('#app-shell')?.classList.add('hidden');return;}$('#auth-screen')?.classList.add('hidden');$('#app-shell')?.classList.remove('hidden');$('#userName').textContent=user.displayName||user.email||'المستخدم';$('#userAvatar').textContent=(user.displayName||user.email||'م').slice(0,1);$('#userRole').textContent='جارٍ التحقق…';try{state.profile=await ensureProfile();$('#userRole').textContent=roleName(state.profile.role);if(state.profile.role==='pending'){renderPending();return;}await loadData(true);await ensureDefaults();await navigate('dashboard');}catch(e){console.error(e);$('#app').innerHTML=`<section class="panel" style="max-width:820px;margin:40px auto"><h2>تعذر تحميل البيانات</h2><p class="muted">${safe(e?.message||'تحقق من Firestore Rules وAuthorized Domains وإعدادات Firebase.')}</p></section>`;}});

async function deletePayment(id){if(!can('admin','manager','accountant')){toast('لا تملك صلاحية الحذف','error');return;}const p=(state.data.payments||[]).find(x=>x.id===id);if(!p)return;if(!confirm(`حذف الدفعة بمبلغ ${money(p.amount)}؟`))return;const ops=[b=>b.delete(orgDoc('payments',id))];for(const l of (state.data.ledger||[]).filter(x=>x.referenceId===id&&x.transactionType==='PAYMENT'))ops.push(b=>b.delete(orgDoc('ledger',l.id)));await commitOps(ops);state.loaded=false;await loadData(true);toast('تم حذف الدفعة');renderPayments();}

async function deleteDebt(id){if(!can('admin','manager','accountant')){toast('لا تملك صلاحية الحذف','error');return;}const d=(state.data.debts||[]).find(x=>x.id===id);if(!d)return;if(!confirm(`حذف الدين بمبلغ ${money(d.amount)}؟`))return;const ops=[b=>b.delete(orgDoc('debts',id))];for(const l of (state.data.ledger||[]).filter(x=>x.referenceId===id&&x.transactionType==='DEBT'))ops.push(b=>b.delete(orgDoc('ledger',l.id)));await commitOps(ops);state.loaded=false;await loadData(true);toast('تم حذف الدين');renderDebts();}

async function deleteSubscriber(id){
  if(!can('admin','manager')){toast('حذف السكان مخصص للمدير','error');return;}
  const s=(state.data.subscribers||[]).find(x=>x.id===id);if(!s)return;
  const hasFinance=(state.data.ledger||[]).some(x=>x.subscriberId===id)||(state.data.payments||[]).some(x=>x.subscriberId===id)||(state.data.debts||[]).some(x=>x.subscriberId===id);
  if(hasFinance){toast('هذا الساكن لديه تاريخ مالي. استخدم الأرشفة أو احذف حركاته المالية أولًا.','error');return;}
  if(!confirm(`حذف ${s.name} نهائيًا؟ سيتم حذف بياناته المرتبطة التي لا تحمل حركات مالية.`))return;
  const ops=[b=>b.delete(orgDoc('subscribers',id))];
  for(const m of (state.data.meters||[]).filter(x=>x.subscriberId===id))ops.push(b=>b.delete(orgDoc('meters',m.id)));
  for(const r of (state.data.readings||[])){const m=(state.data.meters||[]).find(x=>x.id===r.meterId);if(m?.subscriberId===id)ops.push(b=>b.delete(orgDoc('readings',r.id)));}
  const seed=(INITIAL_DATA.subscribers||[]).find(x=>x.code===s.code);if(seed)ops.push(b=>b.set(orgDoc('seedDeletes',`subscribers__${seed.id}`),{key:seedDeleteKey('subscribers',seed.id),deletedAt:serverTimestamp(),deletedBy:state.user.uid}));
  await commitOps(ops);state.loaded=false;await loadData(true);toast('تم حذف الساكن');renderSubscribers();
}
async function deleteBuilding(id){
  if(!can('admin','manager')){toast('حذف البنايات مخصص للمدير','error');return;}
  if((state.data.units||[]).some(u=>u.buildingId===id)){toast('لا يمكن حذف البناية قبل حذف الوحدات التابعة لها.','error');return;}
  const b=(state.data.buildings||[]).find(x=>x.id===id);if(!b)return;if(!confirm(`حذف البناية ${b.name}؟`))return;const ops=[bb=>bb.delete(orgDoc('buildings',id))];const seed=(INITIAL_DATA.buildings||[]).find(x=>x.id===id||x.code===b.code);if(seed)ops.push(bb=>bb.set(orgDoc('seedDeletes',`buildings__${seed.id}`),{key:seedDeleteKey('buildings',seed.id),deletedAt:serverTimestamp(),deletedBy:state.user.uid}));await commitOps(ops);state.loaded=false;await loadData(true);toast('تم حذف البناية');renderSubscribers();}

async function deleteReading(id){if(!can('admin','manager','accountant','operator')){toast('لا تملك صلاحية الحذف','error');return;}const r=(state.data.readings||[]).find(x=>x.id===id);if(!r)return;if(!confirm('حذف هذه القراءة؟ سيتم أيضًا حذف حركة المياه المرتبطة بها إن وجدت.'))return;const ops=[b=>b.delete(orgDoc('readings',id))];for(const l of (state.data.ledger||[]).filter(x=>x.referenceId===id&&x.transactionType==='WATER'))ops.push(b=>b.delete(orgDoc('ledger',l.id)));await commitOps(ops);state.loaded=false;await loadData(true);toast('تم حذف القراءة');renderReadings();}

async function deleteExternalWaterSummary(pid){if(!can('admin','manager','accountant','operator')){toast('لا تملك صلاحية الحذف','error');return;}const r=waterSummaryForPeriod(pid).find(x=>x.key==='external'||x.type==='external');if(!r)return;if(!confirm('حذف قراءة الخارجي لهذا الأسبوع؟'))return;await deleteDoc(orgDoc('waterSummary',r.id));removeLocal('waterSummary',r.id);toast('تم حذف قراءة الخارجي');renderReadings();}

async function deleteEnergyReading(id){if(!can('admin','manager','accountant','operator')){toast('لا تملك صلاحية الحذف','error');return;}if(!confirm('حذف قراءة الكهرباء؟'))return;await deleteDoc(orgDoc('energyReadings',id));removeLocal('energyReadings',id);toast('تم حذف قراءة الكهرباء');renderEnergy();}

async function deleteSource(id){if(!can('admin','manager')){toast('حذف المصدر مخصص للمدير','error');return;}const src=(state.data.sources||[]).find(x=>x.id===id);if(!src)return;if(!confirm(`حذف المصدر ${src.name}؟ سيتم حذف قراءات هذا المصدر أيضًا.`))return;const ops=[b=>b.delete(orgDoc('sources',id))];for(const r of (state.data.energyReadings||[]).filter(x=>x.sourceId===id))ops.push(b=>b.delete(orgDoc('energyReadings',r.id)));await commitOps(ops);state.loaded=false;await loadData(true);toast('تم حذف المصدر');renderEnergy();}

async function deleteMember(uid){if(!can('admin')){toast('حذف المستخدمين مخصص للمدير','error');return;}if(uid===state.user.uid){toast('لا يمكنك حذف حسابك من هنا.','error');return;}const m=(state.data.members||[]).find(x=>x.id===uid);if(!m)return;if(!confirm(`حذف المستخدم ${m.displayName||m.email||''}؟`))return;await deleteDoc(orgDoc('members',uid));removeLocal('members',uid);toast('تم حذف المستخدم');renderSettings();}
async function deleteOldPeriodsExceptCurrent(){if(!can('admin')){toast('هذه العملية للمدير فقط','error');return;}const keep=(state.data.periods||[]).find(p=>p.startDate==='2026-09-03');const olds=(state.data.periods||[]).filter(p=>p.id!==keep?.id);if(!olds.length){toast('لا توجد أسابيع قديمة للحذف');return;}if(!confirm(`سيتم حذف ${olds.length} أسبوعًا وكل بياناتها، وسيبقى 03/09/2026 فقط.\n\nهل أنت متأكد؟`))return;for(const p of olds)await deleteWeek(p.id);toast('تم حذف الأسابيع القديمة والإبقاء على 03/09/2026 فقط');renderSettings();}

async function deleteUnit(id){if(!can('admin','manager')){toast('حذف الوحدات مخصص للمدير','error');return;}const u=(state.data.units||[]).find(x=>x.id===id);if(!u)return;if((state.data.subscribers||[]).some(s=>s.unitId===id)){toast('لا يمكن حذف الوحدة قبل نقل/حذف الساكن المرتبط بها.','error');return;}if(!confirm(`حذف الوحدة ${u.code||''}؟`))return;const ops=[b=>b.delete(orgDoc('units',id))];const seed=(INITIAL_DATA.units||[]).find(x=>x.id===id);if(seed)ops.push(b=>b.set(orgDoc('seedDeletes',`units__${seed.id}`),{key:seedDeleteKey('units',seed.id),deletedAt:serverTimestamp(),deletedBy:state.user.uid}));await commitOps(ops);state.loaded=false;await loadData(true);toast('تم حذف الوحدة');renderSubscribers();}
async function deleteServiceLedger(id){return;}

async function deleteCost(id){
  if(!can('admin','manager','accountant')){toast('لا تملك صلاحية الحذف','error');return;}
  const c=(state.data.costs||[]).find(x=>x.id===id);if(!c)return;
  if(!confirm(`حذف المصروف «${c.description||c.type||''}» بمبلغ ${money(c.amount)}؟ سيتم أيضًا حذف الرسوم التي أنشأها هذا المصروف.`))return;
  const ops=[b=>b.delete(orgDoc('costs',id))];
  for(const l of (state.data.ledger||[]).filter(x=>x.referenceId===id))ops.push(b=>b.delete(orgDoc('ledger',l.id)));
  await commitOps(ops);state.loaded=false;await loadData(true);toast('تم حذف المصروف وحركاته');renderCosts();
}

async function deletePeriodicServices(pid){
  if(!can('admin','manager','accountant')){toast('لا تملك صلاحية الحذف','error');return;}
  const rows=(state.data.ledger||[]).filter(x=>x.periodId===pid&&x.transactionType==='SERVICE'&&['GUARD','PUMP_INSURANCE'].includes(x.serviceCode));
  if(!rows.length){toast('لا توجد خدمات حارس أو تأمين لحذفها');return;}
  if(!confirm(`حذف ${rows.length} حركة من خدمات الحارس وتأمين الغاطس لهذا الأسبوع؟`))return;
  await commitOps(rows.map(r=>b=>b.delete(orgDoc('ledger',r.id))));state.loaded=false;await loadData(true);toast('تم حذف خدمات الحارس وتأمين الغاطس');renderPeriods();
}
