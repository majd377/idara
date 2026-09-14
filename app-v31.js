import { INITIAL_DATA } from './initial-data.js';

import {
  auth, provider, onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut,
  db, orgRef, orgCollection, orgDoc, doc, getDoc, getDocs,
  addDoc, setDoc as fsSetDoc, updateDoc as fsUpdateDoc, deleteDoc as rawDeleteDoc, writeBatch, serverTimestamp, ADMIN_EMAILS
} from './firebase-init-v31.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = {user:null,profile:null,view:'dashboard',periodId:null,data:{},loaded:false,loading:false};
const ROLES={admin:'مدير النظام',manager:'مدير',accountant:'محاسب',operator:'موظف قراءات',viewer:'مشاهد',resident:'ساكن',pending:'بانتظار الموافقة'};
const COLLECTIONS=['buildings','units','subscribers','meters','periods','readings','sources','energyReadings','costs','contributions','payments','ledger','members','waterSummary','seedDeletes','debts','fundGuardConfig','fundGuardPayments','fundGuardExpenses','solarReceipts','solarSales','fundOtherIncome','fundExpenses','fundRevenues','fundWithdrawals','solarStock','solarBatches','approvalRequests','auditLogs'];
const VIEW_NAMES={dashboard:'الرئيسية',periods:'الأسابيع والحساب',readings:'قراءات الماء',energy:'الكهرباء والمولدات',costs:'المصاريف والطوارئ',guard:'خدمة الحارس',contributions:'المساهمات والخصومات',subscribers:'السكان والوحدات',payments:'الدفعات والأرصدة',debts:'الديون السابقة',fund:'الإيرادات و الصندوق',reports:'التقارير والتصدير',settings:'الإعدادات والصلاحيات',guide:'دليل استخدام عملي',historical:'البيانات التاريخية'};
const roundMoney=v=>Math.round(Number(v||0));
const formatFinancialInteger=v=>new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:0,useGrouping:true}).format(Math.round(Number(v||0)));
const money=v=>`${formatFinancialInteger(v)} ₪`;
const money0=v=>`${formatFinancialInteger(v)} ₪`;
const num=v=>Number(v||0);
const fmt=(v,d=2)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:d}).format(Number(v||0));
const msgMoney=v=>`${formatFinancialInteger(v)} ₪`;
const dateNow=()=>new Date().toISOString().slice(0,10);
const safe=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const fmtDate=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
const roleName=r=>ROLES[r]||r||'—';
const CONTRIBUTION_TYPES={
  utility_discount:{label:'خصم من الماء والكهرباء',short:'ماء وكهرباء'},
  expense_discount:{label:'خصم من المصاريف',short:'المصاريف'},
  fund_contribution:{label:'مساهمة للصندوق',short:'الصندوق'}
};
function contributionType(c){
  const t=String(c?.contributionType||c?.type||'').trim();
  if(t==='expense_discount'||t==='خصم من المصاريف') return 'expense_discount';
  if(t==='fund_contribution'||t==='مساهمة للصندوق'||c?.toFund===true) return 'fund_contribution';
  return 'utility_discount';
}
function contributionLabel(c){return CONTRIBUTION_TYPES[contributionType(c)]?.label||CONTRIBUTION_TYPES.utility_discount.label;}
function contributionRowsForPeriod(pid){return (state.data.contributions||[]).filter(c=>sameId(c.periodId,pid));}
function contributionTotal(pid,type){return contributionRowsForPeriod(pid).filter(c=>!type||contributionType(c)===type).reduce((a,c)=>a+num(c.amount),0);}


function toast(msg,type='success'){const e=$('#toast');if(!e)return;e.textContent=msg;e.className='toast '+(type==='error'?'error':'');clearTimeout(window.__toast);window.__toast=setTimeout(()=>e.className='toast hidden',3000);}
function openModal(html){$('#modalBody').innerHTML=html;$('#modal').classList.remove('hidden');$('#modal').setAttribute('aria-hidden','false');}
function closeModal(){if(!$('#modal'))return;$('#modal').classList.add('hidden');$('#modal').setAttribute('aria-hidden','true');$('#modalBody').innerHTML='';}
function can(...roles){return roles.includes(state.profile?.role);}
const VIEW_PERMISSIONS={
  admin:['dashboard','periods','readings','energy','costs','guard','contributions','subscribers','payments','debts','fund','reports','settings','guide','historical'],
  manager:['dashboard','periods','readings','energy','costs','guard','contributions','subscribers','payments','debts','fund','reports','guide','historical'],
  accountant:['dashboard','periods','readings','energy','costs','guard','contributions','subscribers','payments','debts','fund','reports','guide','historical'],
  operator:['dashboard','readings','energy'],
  viewer:['dashboard','periods','readings','energy','costs','guard','contributions','subscribers','payments','debts','fund','reports','guide','historical'],
  resident:['dashboard','readings','energy','costs','contributions','subscribers'],
};
function canView(view){return (VIEW_PERMISSIONS[state.profile?.role]||[]).includes(view);}
function isOwnerEmail(email=(state.user?.email||'')){return ADMIN_EMAILS.map(x=>x.toLowerCase()).includes(String(email).toLowerCase());}
function isCurrentPeriodRecord(data){const p=data?.periodId?periodById(data.periodId):null;return !!p && ['Draft','Calculated'].includes(p.status||'Draft');}
function accountantCanFillBlankMeasurement(collection,oldData,nextData){return state.profile?.role==='accountant'&&['readings','energyReadings','waterSummary'].includes(collection)&&oldData&&oldData.currentReading==null&&nextData?.currentReading!=null;}
function plainApprovalData(data){
  const out={}; for(const [k,v] of Object.entries(data||{})){ if(['updatedAt','updatedBy'].includes(k)) continue; if(v && typeof v==='object' && !Array.isArray(v)){ const sv=v.toString?.(); if(String(sv||'').includes('serverTimestamp')) continue; } if(v===undefined) continue; out[k]=v; }
  return out;
}
async function addAudit(action,collection='',docId='',details='',extra={}){
  if(!state.user?.uid || !state.profile || state.profile.role==='pending') return;
  try{await addDoc(orgCollection('auditLogs'),{action,collection,docId,details,userId:state.user.uid,userName:state.user.displayName||state.user.email||'مستخدم',userEmail:state.user.email||'',role:state.profile.role,createdAt:serverTimestamp(),...extra});}catch(e){console.warn('audit log failed',e);}
}
async function createApprovalRequest(action,ref,data,oldData){
  const collection=ref?.parent?.id||''; const docId=ref?.id||'';
  const payload=plainApprovalData(data); const old=plainApprovalData(oldData);
  const r=await addDoc(orgCollection('approvalRequests'),{action,collection,docId,payload,oldData:old,requesterId:state.user.uid,requesterName:state.user.displayName||state.user.email||'مستخدم',requesterEmail:state.user.email||'',status:'pending',createdAt:serverTimestamp()});
  await addAudit('طلب موافقة',collection,docId,action==='delete'?'طلب حذف':'طلب تعديل للسجل السابق',{requestId:r.id});
  toast(action==='delete'?'تم إرسال طلب الحذف لمدير النظام':'هذا سجل سابق؛ تم إرسال طلب التعديل لمدير النظام');
  return r.id;
}
const APPROVAL_SENT='__APPROVAL_SENT__';
async function setDoc(ref,data,options){
  const result=await fsSetDoc(ref,data,options);
  const coll=ref?.parent?.id||'';
  if(state.user&&state.profile&&coll&&!['auditLogs','approvalRequests','seedDeletes','members'].includes(coll)&&!(data?.embeddedSource)) await addAudit('إضافة',coll,ref?.id||'',`إضافة سجل ${ref?.id||''}`);
  return result;
}
async function fsDeleteDoc(ref){const result=await rawDeleteDoc(ref);const coll=ref?.parent?.id||'';if(state.user&&state.profile&&coll&&!['auditLogs','approvalRequests','seedDeletes'].includes(coll))await addAudit('حذف',coll,ref?.id||'',`حذف سجل ${ref?.id||''}`);return result;}
async function updateDoc(ref,data){
  const coll=ref?.parent?.id||'';
  if(state.profile?.role==='accountant'){
    const snap=await getDoc(ref); const old=snap.exists()?snap.data():null;
    const own=old && sameId(old.createdBy,state.user.uid);
    if(old && !own && !accountantCanFillBlankMeasurement(coll,old,data)){ await createApprovalRequest('update',ref,data,old); throw new Error(APPROVAL_SENT); }
    const result=await fsUpdateDoc(ref,data); await addAudit('تعديل',coll,ref?.id||'',describeChanges(old,data)); return result;
  }
  const result=await fsUpdateDoc(ref,data); await addAudit('تعديل',coll,ref?.id||'',describeChanges(null,data)); return result;
}
function statusBadge(s){const map={Draft:['مسودة','warn'],Calculated:['محسوبة','info'],Approved:['معتمدة','ok'],Closed:['مغلقة','ok'],Pending:['بانتظار','warn'],Entered:['مدخلة','ok'],Invalid:['غير صالحة','danger']};const x=map[s]||['—','info'];return `<span class="badge ${x[1]}">${x[0]}</span>`;}
function statusText(s){return ({Draft:'مسودة',Calculated:'محسوبة',Approved:'معتمدة',Closed:'مغلقة',Pending:'بانتظار',Entered:'مدخلة',Invalid:'غير صالحة'}[s]||s||'—');}
function empty(title,text=''){return `<div class="empty"><strong>${safe(title)}</strong><span>${safe(text)}</span></div>`;}
function sameId(a,b){return a!=null&&b!=null&&String(a)===String(b);}
function findBuildingRef(ref){
  const v=String(ref??'').trim(); if(!v) return null;
  return (state.data.buildings||[]).find(b=>sameId(b.id,v)||String(b.code??'').trim()===v||String(b.name??'').trim()===v)||null;
}
function findUnitRef(ref,buildingRef=null){
  const v=String(ref??'').trim(); if(!v) return null;
  const rows=(state.data.units||[]).filter(u=>sameId(u.id,v)||String(u.code??'').trim()===v||String(u.unitNumber??'').trim()===v);
  if(buildingRef){
    const bid=String(buildingRef.id??buildingRef).trim();
    return rows.find(u=>sameId(u.buildingId,bid)||String(u.buildingId??'').trim()===bid||findBuildingRef(u.buildingId)?.id===bid)||rows[0]||null;
  }
  return rows.length===1?rows[0]:rows.find(u=>sameId(u.id,v))||null;
}
function buildingName(id){return findBuildingRef(id)?.name||'—';}
function unitForSub(s){
  const direct=(state.data.units||[]).find(u=>sameId(u.id,s?.unitId));
  if(direct) return direct;
  return findUnitRef(s?.unitId,s?.buildingId||null);
}
function subscriberByMeter(m){return (state.data.subscribers||[]).find(s=>sameId(s.id,m?.subscriberId));}
function transactionDate(x){
  if(x?.paymentDate) return String(x.paymentDate).slice(0,10);
  if(x?.date) return String(x.date).slice(0,10);
  const p=x?.periodId?periodById(x.periodId):null;
  if(p?.startDate) return String(p.startDate).slice(0,10);
  if(x?.createdAt?.toDate){try{return x.createdAt.toDate().toISOString().slice(0,10);}catch{}}
  if(x?.createdAt?.seconds){try{return new Date(Number(x.createdAt.seconds)*1000).toISOString().slice(0,10);}catch{}}
  return '';
}
function balanceOf(id){return (state.data.ledger||[]).filter(x=>x.subscriberId===id).reduce((a,x)=>a+num(x.debit)-num(x.credit),0);}
function subscriberRow(s){
  const u=unitForSub(s);
  const p=selectedPeriod();
  let debt=Math.max(0,balanceOf(s.id));
  if(p){const sum=subscriberFinancialSummary(s.id,p.id);if(sum)debt=Math.max(0,sum.finalBalance);}
  return {...s,unitCode:u?.code||'—',buildingName:buildingName(u?.buildingId),balance:debt,debt};
}
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
  try{
    const readable=COLLECTIONS.filter(c=>state.profile?.role==='admin'||!['members','approvalRequests','auditLogs'].includes(c));
    const results=await Promise.all(readable.map(async c=>{const snap=await getDocs(orgCollection(c));return [c,snap.docs.map(d=>({id:d.id,...d.data()}))]}));
    for(const [c,rows] of results)state.data[c]=rows;
    if(state.profile?.role!=='admin'){state.data.members=[];state.data.approvalRequests=[];state.data.auditLogs=[];}
    state.loaded=true;
    await repairEntityLinks();
  } finally{state.loading=false;}
}

async function repairEntityLinks(){
  // Repair legacy/new records whose references contain a code/name instead of the Firestore document ID.
  // Only managers/admins write repairs so read-only users are never blocked by this migration.
  if(!can('admin','manager')) return;
  const ops=[];
  const buildings=state.data.buildings||[], units=state.data.units||[], subs=state.data.subscribers||[], meters=state.data.meters||[];
  for(const u of units){
    const b=findBuildingRef(u.buildingId);
    if(b && !sameId(u.buildingId,b.id)) ops.push(batch=>batch.update(orgDoc('units',u.id),{buildingId:b.id,updatedAt:serverTimestamp(),updatedBy:state.user.uid}));
  }
  for(const sub of subs){
    if(sub.type==='خارجي') continue;
    const direct=(units||[]).find(u=>sameId(u.id,sub.unitId));
    const unit=direct||findUnitRef(sub.unitId,sub.buildingId||null);
    if(unit){
      const b=findBuildingRef(unit.buildingId);
      const patch={unitId:unit.id,updatedAt:serverTimestamp(),updatedBy:state.user.uid};
      if(b && !sameId(sub.buildingId,b.id)) patch.buildingId=b.id;
      if(!sameId(sub.unitId,unit.id)||patch.buildingId) ops.push(batch=>batch.update(orgDoc('subscribers',sub.id),patch));
    }
    const meter=meters.find(m=>sameId(m.subscriberId,sub.id));
    if(meter && unit && !sameId(meter.unitId,unit.id)) ops.push(batch=>batch.update(orgDoc('meters',meter.id),{unitId:unit.id,updatedAt:serverTimestamp(),updatedBy:state.user.uid}));
  }
  for(const m of meters){
    const sub=subs.find(s=>sameId(s.id,m.subscriberId));
    if(sub?.type==='خارجي') continue;
    const unit=sub?unitForSub(sub):findUnitRef(m.unitId);
    if(unit && !sameId(m.unitId,unit.id)) ops.push(batch=>batch.update(orgDoc('meters',m.id),{unitId:unit.id,updatedAt:serverTimestamp(),updatedBy:state.user.uid}));
  }
  // Create missing water meters for internal residents so new and legacy residents enter water calculations consistently.
  for(const sub of subs){
    if(sub.type==='خارجي'||sub.active===false) continue;
    if(meters.some(m=>sameId(m.subscriberId,sub.id))) continue;
    const unit=unitForSub(sub);
    const ref=doc(orgCollection('meters'));
    ops.push(batch=>batch.set(ref,{meterCode:`W-${sub.code}`,meterType:'مياه',subscriberId:sub.id,unitId:unit?.id||null,active:true,createdAt:serverTimestamp(),createdBy:state.user.uid}));
  }
  if(!ops.length) return;
  await commitOps(ops);
  state.loaded=false;
  // Do not recurse through repairEntityLinks endlessly; the next forced load sees normalized data.
  const results=await Promise.all(['buildings','units','subscribers','meters'].map(async c=>{const snap=await getDocs(orgCollection(c));return [c,snap.docs.map(d=>({id:d.id,...d.data()}))]}));
  for(const [c,rows] of results) state.data[c]=rows;
  state.loaded=true;
}

async function ensureProfile(){
  const ref=orgDoc('members',state.user.uid);const snap=await getDoc(ref);
  if(snap.exists()){
    const d=snap.data();
    if(isOwnerEmail(state.user.email) && d.role!=='admin'){ await fsUpdateDoc(ref,{role:'admin',updatedAt:serverTimestamp(),updatedBy:state.user.uid}); d.role='admin'; }
    return {id:snap.id,...d};
  }
  const role=isOwnerEmail(state.user.email)?'admin':'pending';
  const data={displayName:state.user.displayName||'مستخدم',email:state.user.email||'',photoURL:state.user.photoURL||'',role,createdAt:serverTimestamp()};await fsSetDoc(ref,data);
  return {id:ref.id,displayName:data.displayName,email:data.email,photoURL:data.photoURL,role};
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
  if(state.user&&state.profile) await addAudit('تعديل جماعي','','',`تنفيذ ${ops.length} عملية على البيانات`);
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

function renderHistorical(){
  setTitle('البيانات التاريخية','');
  const d = (typeof INITIAL_DATA === 'object' && INITIAL_DATA) ? INITIAL_DATA : {};
  const count = k => Array.isArray(d[k]) ? d[k].length : 0;
  const periods = Array.isArray(d.periods) ? d.periods : [];
  const newest = [...periods].sort((a,b)=>String(b.startDate||'').localeCompare(String(a.startDate||'')))[0];
  $('#app').innerHTML = `
    <section class="hero"><div><span class="guide-badge">البيانات المضمنة</span><h2>البيانات التاريخية</h2></div></section>
    <section class="cards-grid">
      <div class="stat-card"><span>البنايات</span><b>${count('buildings')}</b></div>
      <div class="stat-card"><span>السكان</span><b>${count('subscribers')}</b></div>
      <div class="stat-card"><span>الأسابيع</span><b>${count('periods')}</b></div>
      <div class="stat-card"><span>قراءات المياه</span><b>${count('readings')}</b></div>
      <div class="stat-card"><span>قراءات الكهرباء</span><b>${count('energyReadings')}</b></div>
      <div class="stat-card"><span>الخارجي</span><b>${count('waterSummary')}</b></div>
    </section>
    <section class="panel">
      <div class="section-head-inline"><div><h3>آخر أسبوع مضمن</h3><p>${newest ? safe(newest.label||fmtDate(newest.startDate)) : 'لا يوجد'}</p></div><span class="badge success">جاهز</span></div>
      <div class="notice"><b>ملاحظة:</b> </div>
    </section>`;
}

function setTitle(title,subtitle){$('#page-title').textContent=title;$('#page-subtitle').textContent='';$('#crumbText').textContent=VIEW_NAMES[state.view]||title;}
function setActiveNav(){
  $$('.nav-item[data-view]').forEach(el=>{const v=el.dataset.view;el.style.display=canView(v)?'':'none';el.classList.toggle('active',v===state.view);});
  const setBtn=$('.nav-item[data-view="settings"]'); if(setBtn){setBtn.querySelector('.approval-count')?.remove(); const n=(state.data.approvalRequests||[]).filter(x=>x.status==='pending').length; if(can('admin')&&n){const b=document.createElement('span');b.className='approval-count';b.textContent=n;setBtn.appendChild(b);}}
  $('#quickPeriod')?.classList.toggle('hidden',!['admin','manager','accountant'].includes(state.profile?.role));
}
function render(){
  if(state.profile?.role==='resident'){return renderResidentView(state.view);}
  const fn={dashboard:renderDashboard,periods:renderPeriods,readings:renderReadings,energy:renderEnergy,costs:renderCosts,guard:renderGuard,contributions:renderContributions,subscribers:renderSubscribers,payments:renderPayments,debts:renderDebts,fund:renderFund,reports:renderReports,settings:renderSettings,guide:showGuide,historical:renderHistorical}[state.view]||renderDashboard;fn();
}
async function navigate(view,periodId=null,force=false){
  if(!state.profile||state.profile.role==='pending'){renderPending();return;}
  if(!canView(view)){toast('لا تملك صلاحية فتح هذا القسم','error');return;}
  state.view=view;if(periodId)state.periodId=periodId;setActiveNav();await loadData(force);render();$('#sidebar')?.classList.remove('open');
  addAudit('قراءة',view,'',`فتح قسم ${VIEW_NAMES[view]||view}`);
}

function latestPeriods(){return [...(state.data.periods||[])].sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate)));}
function firstPeriodOfMonth(periodId){
  const target=periodById(periodId);if(!target)return null;
  const key=String(target.startDate||'').slice(0,7);
  return latestPeriods().filter(p=>String(p.startDate||'').slice(0,7)===key).sort((a,b)=>String(a.startDate).localeCompare(String(b.startDate)))[0]||target;
}
function isGuardChargePeriod(periodId){
  const first=firstPeriodOfMonth(periodId); return !!first && first.id===periodId;
}
function firstSystemPeriod(){
  return [...(state.data.periods||[])].sort((a,b)=>String(a.startDate).localeCompare(String(b.startDate)))[0]||null;
}

function isWaterPricingCost(c){
  if(!c) return false;
  if(c.waterPricingIncluded===false) return false;
  const t=String(c.type||'').trim();
  // These are resident-level charges/services, not part of the water unit-price calculation.
  if(['خدمة الحارس','تأمين الغاطس','استئجار مولد خارجي'].includes(t)) return false;
  return true;
}
function readingManualPrice(r){return r?.manualUnitPrice!=null?num(r.manualUnitPrice):(r?.manualPrice===true&&r?.unitPrice!=null?num(r.unitPrice):null);}
function autoWaterPrice(pid){
  const p=periodById(pid); if(!p) return 0;
  const rs=readingsForPeriod(pid), ers=energyForPeriod(pid), cs=costsForPeriod(pid);
  const breakdown=buildingWaterBreakdown(pid);
  const external=waterSummaryForPeriod(pid).find(r=>r.key==='external'||r.type==='external');
  const externalWater=external&&external.currentReading!=null&&external.previousReading!=null?Math.max(0,num(external.currentReading)-num(external.previousReading))/1000:0;
  const water=breakdown.buildings.reduce((a,b)=>a+b.total,0)+externalWater;
  const energy=ers.reduce((a,r)=>a+(r.cost!=null?num(r.cost):(r.currentReading!=null&&r.previousReading!=null?Math.max(0,num(r.currentReading)-num(r.previousReading))*num(r.pricePerKwh):0)),0);
  const baseExpense=cs.filter(isWaterPricingCost).reduce((a,c)=>a+num(c.amount),0);
  const utilityDiscount=contributionTotal(pid,'utility_discount');
  const expenseDiscount=Math.min(baseExpense,contributionTotal(pid,'expense_discount'));
  const expense=Math.max(0,baseExpense-expenseDiscount);
  const contributions=utilityDiscount+expenseDiscount;
  const net=Math.max(0,energy+expense-utilityDiscount);
  const raw=water>0?net/water:0;
  return raw>0?Math.ceil(raw):0;
}
function currentTotals(pid){
  const p=periodById(pid), rs=readingsForPeriod(pid), ers=energyForPeriod(pid), cs=costsForPeriod(pid);
  const breakdown=buildingWaterBreakdown(pid);
  const external=waterSummaryForPeriod(pid).find(r=>r.key==='external'||r.type==='external');
  const externalWater=external&&external.currentReading!=null&&external.previousReading!=null?Math.max(0,num(external.currentReading)-num(external.previousReading))/1000:0;
  const water=breakdown.buildings.reduce((a,b)=>a+b.total,0)+externalWater;
  const energy=ers.reduce((a,r)=>a+(r.cost!=null?num(r.cost):(r.currentReading!=null&&r.previousReading!=null?Math.max(0,num(r.currentReading)-num(r.previousReading))*num(r.pricePerKwh):0)),0);
  const baseExpense=cs.filter(isWaterPricingCost).reduce((a,c)=>a+num(c.amount),0);
  const utilityDiscount=contributionTotal(pid,'utility_discount');
  const expenseDiscount=Math.min(baseExpense,contributionTotal(pid,'expense_discount'));
  const expense=Math.max(0,baseExpense-expenseDiscount);
  const contributions=utilityDiscount+expenseDiscount;
  const net=Math.max(0,energy+expense-utilityDiscount);
  const raw=water>0?net/water:0;
  const autoApplied=raw>0?Math.ceil(raw):0;
  // The weekly price is automatically recalculated from live costs/contributions.
  // Existing stored waterUnitPrice is kept only as historical snapshot; autoApplied is the current value.
  const manualPeriod=(p?.manualWaterUnitPrice!=null?num(p.manualWaterUnitPrice):null);
  const applied=manualPeriod!=null?manualPeriod:autoApplied;
  return {period:p,readings:rs,energyReadings:ers,costs:cs,waterTotal:water,energyCost:energy,baseExpense,expenseDiscount,extraCost:expense,utilityDiscount,contributionsTotal:contributions,netCost:net,rawPrice:raw,autoAppliedPrice:autoApplied,appliedPrice:applied,waterBreakdown:breakdown,externalWater,manualPeriodPrice:manualPeriod};
}
async function syncPeriodWaterPrice(pid){
  if(!can('admin','manager','accountant')) return;
  const t=currentTotals(pid); if(!t.period) return;
  const ops=[b=>b.update(orgDoc('periods',pid),{
    waterUnitPrice:t.appliedPrice,
    rawWaterUnitPrice:t.rawPrice,
    totalWaterConsumption:t.waterTotal,
    netOperationalCost:t.netCost,
    roundingDifference:(t.appliedPrice*t.waterTotal)-t.netCost,
    updatedAt:serverTimestamp(),
    updatedBy:state.user.uid
  })];
  if(t.waterTotal>0){
    for(const r of t.readings){
      if(r.currentReading==null||r.previousReading==null) continue;
      const manual=readingManualPrice(r);
      if(manual!=null) continue;
      const consumption=Math.max(0,num(r.currentReading)-num(r.previousReading))/1000;
      const charge=consumption*t.appliedPrice;
      ops.push(b=>b.update(orgDoc('readings',r.id),{unitPrice:t.appliedPrice,chargeAmount:charge,updatedAt:serverTimestamp(),updatedBy:state.user.uid}));
      const led=(state.data.ledger||[]).find(x=>x.referenceId===r.id&&x.transactionType==='WATER');
      if(led) ops.push(b=>b.update(orgDoc('ledger',led.id),{debit:charge,updatedAt:serverTimestamp(),updatedBy:state.user.uid}));
    }
  }
  await commitOps(ops);
  state.loaded=false;
  await loadData(true);
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
    const unitIds=(state.data.units||[]).filter(u=>sameId(u.buildingId,b.id)).map(u=>u.id);const subIds=(state.data.subscribers||[]).filter(s=>unitIds.some(uid=>sameId(uid,s.unitId))&&s.type!=='خارجي'&&s.active!==false).map(s=>s.id);const meterIds=(state.data.meters||[]).filter(m=>subIds.some(sid=>sameId(sid,m.subscriberId))).map(m=>m.id);
    const total=readingsForPeriod(pid).filter(r=>meterIds.includes(r.meterId)).reduce((a,r)=>a+(r.currentReading!=null&&r.previousReading!=null?Math.max(0,num(r.currentReading)-num(r.previousReading))/1000:0),0);out.push({id:b.id,name:b.name,total});
  }
  const externalSubIds=(state.data.subscribers||[]).filter(s=>s.type==='خارجي'&&s.active!==false).map(s=>s.id);const extMeters=(state.data.meters||[]).filter(m=>externalSubIds.some(sid=>sameId(sid,m.subscriberId))).map(m=>m.id);const external=readingsForPeriod(pid).filter(r=>extMeters.some(mid=>sameId(mid,r.meterId))).reduce((a,r)=>a+(r.currentReading!=null&&r.previousReading!=null?Math.max(0,num(r.currentReading)-num(r.previousReading))/1000:0),0);return {buildings:out,external};
}

async function ensureWaterSummaryForPeriod(pid){
  const existing=waterSummaryForPeriod(pid);if(existing.some(x=>x.key==='external'))return;if(!can('admin','manager','accountant','operator'))return;const p=periodById(pid);if(!p)return;const prior=[...(state.data.waterSummary||[])].filter(x=>x.key==='external'&&x.currentReading!=null&&x.periodId!==pid).map(x=>({x,p:periodById(x.periodId)})).filter(x=>x.p).sort((a,b)=>String(b.p.startDate).localeCompare(String(a.p.startDate)))[0]?.x?.currentReading??null;await fsSetDoc(doc(orgCollection('waterSummary')),{periodId:pid,key:'external',label:'الخارجي',type:'external',buildingId:null,previousReading:prior,currentReading:null,consumption:null,status:'Pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:state.user.uid});state.loaded=false;await loadData(true);
}

function renderResidentView(view){
  if(view==='dashboard') return renderResidentDashboard();
  if(view==='energy') return renderResidentEnergy();
  if(view==='readings') return renderResidentWater();
  if(view==='costs') return renderResidentCosts();
  if(view==='contributions') return renderResidentContributions();
  if(view==='subscribers') return renderResidentSubscribers();
  return renderResidentDashboard();
}
function residentSelected(){return (state.data.subscribers||[]).find(s=>sameId(s.id,state.profile?.residentSubscriberId));}
function residentEnergyRateText(){const p=selectedPeriod();const rates=[...new Set((p?energyForPeriod(p.id):[]).map(r=>num(r.pricePerKwh)).filter(v=>v>0))];return rates.length===1?money(rates[0]):rates.length>1?'حسب المصادر':'—';}
function residentPeriodList(){return latestPeriods();}
function renderResidentDashboard(){
  const s=residentSelected();const p=selectedPeriod();const t=p?currentTotals(p.id):null;setTitle('الرئيسية','');$('#app').innerHTML=`<section class="welcome"><div class="welcome-copy"><div class="kicker">عمارة الأمين • حساب الساكن</div><h2>أهلاً ${safe(s?.name||'بالساكن')} 👋</h2><p class="muted">هذا الحساب للعرض فقط ولا يمكن تعديل البيانات.</p></div></section><section class="stats"><div class="stat"><div class="stat-label">سعر كيلو الكهرباء</div><div class="stat-value">${residentEnergyRateText()}</div><div class="stat-foot">القيمة المعتمدة من النظام</div></div><div class="stat"><div class="stat-label">سعر كوب المياه</div><div class="stat-value">${t?.appliedPrice?money(t.appliedPrice):'—'}</div><div class="stat-foot">لآخر أسبوع</div></div><div class="stat"><div class="stat-label">آخر أسبوع</div><div class="stat-value">${p?fmtDate(p.startDate):'—'}</div><div class="stat-foot">اختر الأسبوع من قسم المياه</div></div><div class="stat"><div class="stat-label">مديونيتك</div><div class="stat-value">${s?money(subscriberRow(s).debt):'—'}</div><div class="stat-foot">للعرض فقط</div></div></section>`;
}
function renderResidentEnergy(){const p=selectedPeriod();setTitle('الكهرباء','سعر الكيلو ومعلومات المولدات للعرض فقط.');const rows=p?energyForPeriod(p.id):[];$('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>الكهرباء والمولدات</h2><p class="muted">يمكنك معرفة سعر الكيلو والقراءات العامة دون تعديل.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>المصدر</th><th>القراءة السابقة</th><th>القراءة الحالية</th><th>الاستهلاك</th><th>سعر الكيلو</th></tr></thead><tbody>${rows.map(r=>{const src=(state.data.sources||[]).find(x=>x.id===r.sourceId);return `<tr><td>${safe(src?.name||'—')}</td><td>${fmt(r.previousReading,3)}</td><td>${r.currentReading==null?'—':fmt(r.currentReading,3)}</td><td>${r.consumption==null?'—':fmt(r.consumption,3)}</td><td>${r.pricePerKwh==null?'—':money(r.pricePerKwh)}</td></tr>`}).join('')||`<tr><td colspan="5">${empty('لا توجد قراءات','')}</td></tr>`}</tbody></table></div></section>`;}
function renderResidentWater(){const s=residentSelected();const periods=residentPeriodList();const p=selectedPeriod();const meter=(state.data.meters||[]).find(m=>sameId(m.subscriberId,s?.id));const shown=p?periods.filter(x=>sameId(x.id,p.id)):[];const rows=shown.map(x=>{const r=(state.data.readings||[]).find(y=>sameId(y.periodId,x.id)&&sameId(y.meterId,meter?.id));const cons=r&&r.currentReading!=null&&r.previousReading!=null?Math.max(0,num(r.currentReading)-num(r.previousReading))/1000:null;return `<tr><td>${safe(x.label||'أسبوع')}<br><small>${fmtDate(x.startDate)} → ${fmtDate(x.endDate)}</small></td><td>${r?.previousReading==null?'—':fmt(r.previousReading,3)}</td><td>${r?.currentReading==null?'—':fmt(r.currentReading,3)}</td><td>${cons==null?'—':fmt(cons,3)} كوب</td><td>${r?.unitPrice==null?'—':money(r.unitPrice)}</td></tr>`}).join('');setTitle('المياه','عرض قراءاتك فقط.');$('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>قراءات المياه — ${safe(s?.name||'')}</h2><p class="muted">البيانات تخص حسابك فقط.</p></div><select id="residentWeekSelect" class="period-select">${periods.map(x=>`<option value="${x.id}" ${x.id===p?.id?'selected':''}>${safe(x.label||'أسبوع')} — ${fmtDate(x.startDate)}</option>`).join('')}</select></div><div class="table-wrap"><table class="table"><thead><tr><th>الأسبوع</th><th>السابقة</th><th>الحالية</th><th>الاستهلاك</th><th>سعر الكوب</th></tr></thead><tbody>${rows||`<tr><td colspan="5">${empty('لا توجد قراءات','')}</td></tr>`}</tbody></table></div></section>`;$('#residentWeekSelect').onchange=e=>{state.periodId=e.target.value;renderResidentWater();};}
function renderResidentCosts(){setTitle('المصاريف والطوارئ','عرض لفهم البنود التي أثرت على كشفك.');const rows=(state.data.costs||[]).filter(c=>c.periodId);$('#app').innerHTML=`<section class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>الأسبوع</th><th>البند</th><th>المبلغ</th><th>البيان</th></tr></thead><tbody>${rows.map(c=>`<tr><td>${fmtDate(periodById(c.periodId)?.startDate)}</td><td>${safe(c.type||'—')}</td><td>${money(c.amount)}</td><td>${safe(c.description||'—')}</td></tr>`).join('')||`<tr><td colspan="4">${empty('لا توجد مصاريف','')}</td></tr>`}</tbody></table></div></section>`;}
function renderResidentContributions(){setTitle('المساهمات','عرض المساهمات والخصومات فقط.');const rows=state.data.contributions||[];$('#app').innerHTML=`<section class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>البيان</th></tr></thead><tbody>${rows.map(c=>`<tr><td>${fmtDate(c.date)}</td><td>${safe(contributionLabel(c))}</td><td>${money(c.amount)}</td><td>${safe(c.description||'—')}</td></tr>`).join('')||`<tr><td colspan="4">${empty('لا توجد مساهمات','')}</td></tr>`}</tbody></table></div></section>`;}
function renderResidentSubscribers(){const s=residentSelected();setTitle('السكان','يظهر لك اسمك فقط.');$('#app').innerHTML=`<section class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>الاسم</th></tr></thead><tbody><tr><td><b>${safe(s?.name||'لم يتم ربط حسابك بساكن بعد')}</b></td></tr></tbody></table></div></section>`;}

function renderDashboard(){
  setTitle('الرئيسية','');const periods=latestPeriods(),latest=periods[0];const subs=(state.data.subscribers||[]).filter(s=>s.active!==false&&s.type!=='خارجي');const totals=latest?currentTotals(latest.id):null;const fundRev=fundRevenueTotal(),fundOut=fundWithdrawalTotal(),residentDebt=residentDebtTotal(),fundBal=Math.max(0,fundRev-fundOut-residentDebt),solarQty=solarAvailableQty();
  $('#app').innerHTML=`<section class="welcome"><div class="welcome-art" aria-hidden="true"><svg viewBox="0 0 220 160" role="presentation"><rect x="55" y="36" width="110" height="100" rx="8"/><rect x="76" y="16" width="68" height="120" rx="8"/><path d="M111 17v119M76 60h68M76 91h68"/><rect x="91" y="108" width="16" height="28" rx="2"/><rect x="122" y="108" width="16" height="28" rx="2"/><circle cx="111" cy="43" r="8"/></svg></div><div class="welcome-copy"><div class="kicker">عمارة الأمين • الإدارة اليومية</div><h2>أهلاً ${safe(state.user?.displayName?.split(' ')[0]||'بك')} 👋</h2><div class="welcome-actions">${['admin','manager','accountant'].includes(state.profile?.role)?'<button class="btn primary" id="dashNewWeek">+ افتح أسبوعًا</button>':''}${canView('readings')?'<button class="btn ghost" id="dashReadings">إدخال قراءات الماء</button>':''}${canView('fund')?'<button class="btn soft" id="dashFund">فتح الإيرادات و الصندوق</button>':''}</div></div></section>
  <section class="stats"><div class="stat"><div class="stat-label">السكان النشطون</div><div class="stat-value">${fmt(subs.length,0)}</div><div class="stat-foot">مشترك داخل النظام</div></div><div class="stat"><div class="stat-label">آخر أسبوع</div><div class="stat-value">${latest?fmtDate(latest.startDate):'—'}</div><div class="stat-foot">${latest?statusBadge(latest.status||'Draft'):'لا يوجد'}</div></div><div class="stat"><div class="stat-label">رصيد صندوق العمارة</div><div class="stat-value">${money(fundBal)}</div><div class="stat-foot">إيرادات ${money(fundRev)} − سحب ${money(fundOut)} − مديونية السكان ${money(residentDebt)}</div></div><div class="stat"><div class="stat-label">السولار المتبقي</div><div class="stat-value">${fmt(solarQty,3)} لتر</div><div class="stat-foot">دفعات السولار − المبيعات</div></div></section><section class="stats"><div class="stat"><div class="stat-label">استهلاك المياه</div><div class="stat-value">${totals?fmt(totals.waterTotal,3):'—'}</div><div class="stat-foot">كوب / م³</div></div><div class="stat"><div class="stat-label">سعر الكوب</div><div class="stat-value">${totals&&totals.appliedPrice?money(totals.appliedPrice):'—'}</div><div class="stat-foot">السعر المعتمد للكوب</div></div><div class="stat"><div class="stat-label">مجموع المديونية</div><div class="stat-value">${money(subs.reduce((a,s)=>a+num(subscriberRow(s).debt),0))}</div><div class="stat-foot">إجمالي المديونية الحالية للسكان</div></div><div class="stat"><div class="stat-label">حالة الحساب</div><div class="stat-value">${latest?'جاهز':'ابدأ'}</div><div class="stat-foot">${latest?'راجع الأسبوع الحالي':'افتح أول أسبوع'}</div></div></section>
  <section class="grid-2"><div class="panel"><div class="panel-head"><div><h2>طريقة إدخال البيانات</h2></div></div><div class="workflow-grid"><div class="workflow-card"><div class="w-num">١</div><h3>سجّل الكهرباء</h3></div><div class="workflow-card"><div class="w-num">٢</div><h3>سجّل الماء</h3></div><div class="workflow-card"><div class="w-num">٣</div><h3>احسب سعر الكوب</h3></div><div class="workflow-card"><div class="w-num">٤</div><h3>وزّع على السكان</h3></div></div></div><div class="panel"><div class="panel-head"><div><h2>آخر أسبوع</h2></div></div>${latest&&canView('periods')?`<button class="latest" id="dashLatest"><div class="latest-date">${fmtDate(latest.startDate)}</div><div class="latest-main"><b>${safe(latest.label||'أسبوع')}</b><span>${statusBadge(latest.status||'Draft')}</span></div><span class="arrow">←</span></button>`:latest?`<div class="latest disabled"><div class="latest-date">${fmtDate(latest.startDate)}</div><div class="latest-main"><b>${safe(latest.label||'أسبوع')}</b><span>${statusBadge(latest.status||'Draft')}</span></div></div>`:empty('لا يوجد أسبوع بعد','ابدأ بفتح أول أسبوع.')}</div></section>
  `;
  $('#dashNewWeek')?.addEventListener('click',showPeriodForm);$('#dashReadings')?.addEventListener('click',()=>latest?navigate('readings',latest.id):showPeriodForm);$('#dashFund')?.addEventListener('click',()=>navigate('fund'));if(latest)$('#dashLatest')?.addEventListener('click',()=>navigate('periods',latest.id));
}

async function renderPeriods(){
  setTitle('الأسابيع والحساب','');const periods=latestPeriods();if(!state.periodId)state.periodId=periods[0]?.id;const p=selectedPeriod();if(p&&(state.data.waterSummary||[]).filter(x=>x.periodId===p.id).length<3){await ensureWaterSummaryForPeriod(p.id);}const t=p?currentTotals(p.id):null;const breakdown=p?buildingWaterBreakdown(p.id):null;
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>أسابيع الحساب</h2></div><div class="panel-actions"><button class="btn soft" id="newWeekBtn">+ أسبوع جديد</button>${p?`<button class="btn soft" id="servicesBtn">الخدمات الدورية</button><button class="btn primary" id="calcWeekBtn">احسب الأسبوع</button>`:''}</div></div><div class="period-picker"><label>الأسبوع الحالي</label><select id="periodSelect" class="period-select">${periods.map(x=>`<option value="${x.id}" ${x.id===p?.id?'selected':''}>${safe(x.label||'أسبوع')} — ${fmtDate(x.startDate)} إلى ${fmtDate(x.endDate)} — ${statusText(x.status||'Draft')}</option>`).join('')}</select></div>${!p?empty('لا يوجد أسبوع','افتح أول أسبوع من الزر بالأعلى.'):periodCalculationView(t,breakdown)}</section>`;
  $('#newWeekBtn').onclick=showPeriodForm;$('#periodSelect').onchange=e=>navigate('periods',e.target.value);if(p){$('#calcWeekBtn').onclick=()=>calculateWeek(p.id);$('#servicesBtn').onclick=()=>showServiceForm(p.id);}
}
function periodCalculationView(t,breakdown){
  const ext=waterSummaryForPeriod(t.period.id).find(r=>r.key==='external'||r.type==='external');
  const summaryComplete=!!(ext&&ext.currentReading!=null&&ext.previousReading!=null&&breakdown.buildings.every(b=>b.total>=0));
  const eligible=readingsForPeriod(t.period.id).filter(r=>r.currentReading!=null&&r.previousReading!=null).length;
  const missing=readingsForPeriod(t.period.id).length-eligible;
  return `<div class="calc-banner"><div><h3>نتيجة هذا الأسبوع</h3><p></p></div><div class="price">${t.appliedPrice?money(t.appliedPrice):'لم يُحسب بعد'}</div></div><div class="calc-board"><div class="calc-box"><h3>١) تكلفة الكهرباء والمصاريف</h3><div class="calc-line"><span>الكهرباء من المولدات</span><b>${money(t.energyCost)}</b></div><div class="calc-line"><span>المصاريف والإضافات</span><b>${money(t.extraCost)}</b></div><div class="calc-total"><span>صافي تكلفة التشغيل</span><span>${money(t.netCost)}</span></div></div><div class="calc-box"><h3>٢) إجمالي استهلاك الماء</h3>${breakdown.buildings.map(b=>`<div class="calc-line"><span>${safe(b.name)} من السكان</span><b>${fmt(b.total,3)} كوب</b></div>`).join('')}<div class="calc-line"><span>${safe(ext?.label||'الخارجي')}</span><b>${t.externalWater?fmt(t.externalWater,3)+' كوب':'—'}</b></div><div class="calc-total"><span>الإجمالي المعتمد للسعر</span><span>${fmt(t.waterTotal,3)} كوب</span></div></div></div><div class="money-grid" style="margin-top:13px"><div class="money-card"><small>السعر الخام</small><b>${t.rawPrice?`${fmt(t.rawPrice,3)} ₪`:'—'}</b><small>صافي التكلفة ÷ إجمالي الماء</small></div><div class="money-card"><small>السعر المعتمد</small><b>${t.appliedPrice?money(t.appliedPrice):'—'}</b><small>${t.manualPeriodPrice!=null?'تعديل يدوي للفترة':'يتحدث تلقائيًا مع المساهمات'}</small></div><div class="money-card"><small>قراءات السكان</small><b>${eligible} / ${eligible+missing}</b><small>${missing?`باقي ${missing} قراءة`:'كل القراءات مكتملة'}</small></div></div><div class="section-note" style="margin-top:13px"><b>ملاحظة السعر:</b> عند إضافة أو حذف مساهمة يتحدث السعر الحالي للكوب تلقائيًا. السعر اليدوي لساكن معيّن يُحفظ فقط إذا وافقت على التنبيه.<br><br>المعادلة: <b>استهلاك سكان البناية الأولى + استهلاك سكان البناية الثانية + الخارجي = إجمالي استهلاك المياه</b>، ثم <b>صافي تكلفة التشغيل ÷ إجمالي المياه = سعر الكوب الخام</b>، ثم نرفعه للعدد الصحيح الأعلى.</div>`;
}

function showPeriodForm(){if(!['admin','manager','accountant'].includes(state.profile?.role)){toast('فتح أسبوع جديد مخصص للإدارة والحسابات','error');return;}openModal(`<h2>فتح أسبوع جديد</h2><p class="modal-lead">السابقة لكل عداد ستنتقل تلقائيًا من آخر قراءة مسجلة، ويمكن تعديلها لاحقًا.</p><div class="form-grid"><div class="field"><label>اسم الأسبوع</label><input id="pLabel" value="أسبوع ${fmtDate(dateNow())}"></div><div class="field"><label>من</label><input id="pStart" type="date" value="${dateNow()}"></div><div class="field"><label>إلى</label><input id="pEnd" type="date" value="${dateNow()}"></div><div class="field"><label>سعر الكوب (اختياري)</label><input id="pPrice" type="number" min="0" step="0.01" placeholder="يُحسب بعد إدخال الكهرباء والماء"></div></div><div class="actions"><button class="btn primary" id="savePeriod">فتح الأسبوع</button><button class="btn ghost" id="cancelPeriod">إلغاء</button></div>`);$('#cancelPeriod').onclick=closeModal;$('#savePeriod').onclick=createPeriod;}
async function createPeriod(){
  if(!can('admin','manager','accountant','operator')){toast('لا تملك صلاحية فتح أسبوع','error');return;}const start=$('#pStart').value,end=$('#pEnd').value,label=$('#pLabel').value.trim()||`أسبوع ${fmtDate(start)}`;if(!start||!end){toast('حدد تاريخ بداية ونهاية الأسبوع','error');return;}if(end<start){toast('تاريخ النهاية يجب أن يكون بعد البداية','error');return;}
  if((state.data.periods||[]).some(p=>p.startDate===start&&p.endDate===end)){toast('هذا الأسبوع موجود بالفعل','error');return;}
  const ref=doc(orgCollection('periods'));const p={label,startDate:start,endDate:end,status:'Draft',waterUnitPrice:$('#pPrice').value===''?null:num($('#pPrice').value),createdAt:serverTimestamp(),createdBy:state.user.uid};const batch=writeBatch(db);batch.set(ref,p);
  const residents=(state.data.subscribers||[]).filter(s=>s.active!==false&&s.type!=='خارجي');
  for(const s of residents){const meter=(state.data.meters||[]).find(m=>sameId(m.subscriberId,s.id));if(!meter)continue;const history=(state.data.readings||[]).filter(r=>r.meterId===meter.id&&r.currentReading!=null).map(r=>({r,p:periodById(r.periodId)})).filter(x=>x.p).sort((a,b)=>String(b.p.startDate).localeCompare(String(a.p.startDate)));const prev=history[0]?.r.currentReading??null;batch.set(doc(orgCollection('readings')),{periodId:ref.id,meterId:meter.id,previousReading:prev,currentReading:null,consumption:null,unitPrice:p.waterUnitPrice,chargeAmount:null,status:'Pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});}
  for(const src of (state.data.sources||[]).filter(x=>x.active!==false)){const history=(state.data.energyReadings||[]).filter(r=>r.sourceId===src.id&&r.currentReading!=null).map(r=>({r,p:periodById(r.periodId)})).filter(x=>x.p).sort((a,b)=>String(b.p.startDate).localeCompare(String(a.p.startDate)));const prev=history[0]?.r.currentReading??null;batch.set(doc(orgCollection('energyReadings')),{periodId:ref.id,sourceId:src.id,previousReading:prev,currentReading:null,consumption:null,pricePerKwh:src.defaultRate??null,cost:null,status:'Pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});}
  const ext=(state.data.waterSummary||[]).filter(x=>x.key==='external'&&x.currentReading!=null&&x.periodId!==ref.id).map(x=>({x,p:periodById(x.periodId)})).filter(x=>x.p).sort((a,b)=>String(b.p.startDate).localeCompare(String(a.p.startDate)))[0]?.x?.currentReading??null;batch.set(doc(orgCollection('waterSummary')),{periodId:ref.id,key:'external',label:'الخارجي',type:'external',buildingId:null,previousReading:ext,currentReading:null,consumption:null,status:'Pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:state.user.uid});
  await batch.commit();state.loaded=false;await loadData(true);state.periodId=ref.id;closeModal();toast('تم فتح الأسبوع وتجهيز القراءات');await navigate('periods',ref.id,true);
}
async function renderReadings(){
  setTitle('قراءات الماء','أولًا أدخل قراءات الماء الإجمالية للعمارتين والخارجي، ثم قراءات السكان.');const periods=latestPeriods();if(!state.periodId)state.periodId=periods[0]?.id;const p=selectedPeriod();if(p&&(state.data.waterSummary||[]).filter(x=>x.periodId===p.id).length<3){await ensureWaterSummaryForPeriod(p.id);}
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>قراءات الماء</h2></div><div class="panel-actions"><button class="btn soft" id="goCalc">الحساب الكامل</button><button class="btn primary" id="newWeek2">+ أسبوع جديد</button></div></div>${!p?`<div class="reading-start"><div class="reading-start-icon">◫</div><div><h2>ابدأ من أسبوع جديد</h2><p>بعد فتح الأسبوع ستظهر لك قراءات العمارات والخارجي ثم السكان.</p><button class="btn primary" id="firstWeek2">+ افتح أول أسبوع</button></div></div>`:`<div class="period-picker"><label>الأسبوع الحالي</label><select id="periodSelect" class="period-select">${periods.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${safe(x.label||'أسبوع')} — ${fmtDate(x.startDate)} إلى ${fmtDate(x.endDate)} — ${statusText(x.status||'Draft')}</option>`).join('')}</select></div><div class="section-note"><b>المهم:</b> اكتب أولًا القراءة السابقة والحالية لعداد البناية الأولى والثانية والخارجي. البرنامج يحسب استهلاك كل واحد منهم ويجمعهم = <b>إجمالي الاستهلاك الذي سنستخدمه لسعر الكوب.</b></div>${waterSummaryTable(p.id)}<div class="section-note"><b>ثم السكان:</b> لكل ساكن اكتب السابقة والحالية. (الحالية − السابقة) ÷ 1000 = استهلاكه بالكوب/م³.</div>${readingTable(p.id)}`}</section>`;
  $('#newWeek2').onclick=showPeriodForm;$('#goCalc').onclick=()=>p?navigate('periods',p.id):showPeriodForm;if($('#firstWeek2'))$('#firstWeek2').onclick=showPeriodForm;$('#periodSelect')?.addEventListener('change',e=>navigate('readings',e.target.value));if(p){bindWaterSummaryInputs(p.id);bindReadingInputs(p.id);} 
}
function waterSummaryTable(pid){
  const breakdown=buildingWaterBreakdown(pid);
  const ext=waterSummaryForPeriod(pid).find(r=>r.key==='external'||r.type==='external')||{id:'',key:'external',label:'الخارجي',type:'external',previousReading:null,currentReading:null};
  const extCons=ext.currentReading!=null&&ext.previousReading!=null?Math.max(0,num(ext.currentReading)-num(ext.previousReading))/1000:null;
  const allRows=[...breakdown.buildings.map(b=>({kind:'building',...b})),{kind:'external',...ext,total:extCons}];
  return `<div class="water-master"><div class="water-master-head"><div><h3>١) إجمالي استهلاك المياه</h3><p>البناية الأولى والثانية تُحسبان تلقائيًا من مجموع السكان. الخارجي فقط تدخله هنا.</p></div><div class="water-master-total" id="waterMasterTotal">${fmt(waterSummaryTotal(pid),3)} كوب</div></div><div class="table-wrap"><table class="table master-water-table"><thead><tr><th>الجهة</th><th>القراءة السابقة</th><th>القراءة الحالية</th><th>الاستهلاك</th><th>المصدر</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>${allRows.map(r=>{
    const isExt=r.kind==='external';
    return `<tr ${isExt&&r.id?`data-wsid="${r.id}"`:''}><td><b>${safe(r.name||r.label)}</b><small>${isExt?'استهلاك خارجي':'مجموع استهلاك السكان'}</small></td><td>${isExt?`<input class="reading-input ws-prev" type="number" step="0.001" value="${r.previousReading??''}">`:'<span class="auto-reading">من السكان</span>'}</td><td>${isExt?`<input class="reading-input ws-current" type="number" step="0.001" value="${r.currentReading??''}">`:'<span class="auto-reading">من السكان</span>'}</td><td class="ws-cons">${r.total==null?'—':fmt(r.total,3)+' كوب'}</td><td>${isExt?'<span class="badge info">يدوي</span>':'<span class="badge ok">تلقائي</span>'}</td><td class="ws-status">${r.total==null?'<span class="badge warn">بانتظار</span>':'<span class="badge ok">جاهزة</span>'}</td><td>${!isExt&&can('admin','manager','accountant')?`<button class="mini red" data-water-delete-building="${r.id}" title="حذف البناية">حذف</button>`:''}</td></tr>`;
  }).join('')}</tbody></table></div><div class="master-water-footer"><span>سعر الكوب يعتمد على إجمالي السكان في البنايتين + الخارجي. زر حذف البناية يظهر هنا أيضًا حتى لو لم يكن عليها استهلاك ماء.</span><span class="autosave-note">الحفظ التلقائي مفعّل</span><button class="btn soft" id="saveWaterSummary">حفظ الآن</button><button class="btn ghost" id="deleteExternalReading">حذف قراءة الخارجي</button></div></div>`;
}
let __autoSaveTimers={};
function queueAutoSave(key,fn){
  clearTimeout(__autoSaveTimers[key]);
  if($('#autosaveGlobal')) $('#autosaveGlobal').textContent='جاري الحفظ تلقائيًا…';
  __autoSaveTimers[key]=setTimeout(async()=>{try{await fn();if($('#autosaveGlobal')) $('#autosaveGlobal').textContent='محفوظ تلقائيًا ✓';}catch(e){console.error(e);if($('#autosaveGlobal')) $('#autosaveGlobal').textContent='الحفظ يحتاج مراجعة';toast('تعذر الحفظ التلقائي، استخدم «حفظ الآن»','error');}finally{delete __autoSaveTimers[key];}},650);
}
window.addEventListener('beforeunload',e=>{if(Object.values(__autoSaveTimers).some(Boolean)){e.preventDefault();e.returnValue='';}});
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
  $$('[data-water-delete-building]').forEach(b=>b.addEventListener('click',()=>deleteBuilding(b.dataset.waterDeleteBuilding)));
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
  const rows=readingsForPeriod(pid).map(r=>{const m=(state.data.meters||[]).find(x=>x.id===r.meterId);const s=subscriberByMeter(m);return{s,r,m}}).filter(x=>x.s&&x.s.active!==false).sort((a,b)=>String(a.s.code).localeCompare(String(b.s.code),undefined,{numeric:true}));const p=periodById(pid); const t=currentTotals(pid); const weekPrice=t.appliedPrice;
  return `<div class="table-wrap"><table class="table" style="min-width:1060px"><thead><tr><th>الكود</th><th>الساكن</th><th>البناية / النوع</th><th>القراءة السابقة</th><th>القراءة الحالية</th><th>السحب</th><th>سعر الكوب</th><th>القيمة</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>${rows.length?rows.map(x=>{const {s,r}=x;const cons=r.currentReading!=null&&r.previousReading!=null?Math.max(0,num(r.currentReading)-num(r.previousReading))/1000:null;const price=readingManualPrice(r)??weekPrice??p.waterUnitPrice??'';const charge=cons!=null&&price!==''?cons*num(price):null;return `<tr data-rid="${r.id}"><td><span class="code">${safe(s.code)}</span></td><td><b>${safe(s.name)}</b></td><td>${s.type==='خارجي'?'<span class="badge warn">خارجي</span>':safe(subscriberRow(s).buildingName)}</td><td><input class="reading-input prev" type="number" step="0.001" value="${r.previousReading??''}"></td><td><input class="reading-input current" type="number" step="0.001" value="${r.currentReading??''}"></td><td class="cons">${cons==null?'—':fmt(cons,3)}</td><td><input class="reading-input price" data-manual="${readingManualPrice(r)!=null?'1':'0'}" type="number" step="0.01" value="${price}"></td><td class="charge">${charge==null?'—':money(charge)}</td><td class="status">${r.currentReading==null?'<span class="badge warn">بانتظار</span>':((num(r.currentReading)<num(r.previousReading))?'<span class="badge danger">تحقق</span>':'<span class="badge ok">جاهزة</span>')}</td><td>${can('admin','manager','accountant')?`<button class="mini red" data-delete-reading="${r.id}">حذف</button>`:''}</td></tr>`}).join(''):`<tr><td colspan="10">${empty('لا توجد قراءات','تأكد من وجود سكان وعدادات قبل فتح الأسبوع.')}</td></tr>`}</tbody></table></div><div class="readings-actions"><span class="muted"></span><button class="btn primary" id="saveReadings">حفظ كل القراءات</button></div>`;
}
function bindReadingInputs(pid){
  const weekPrice=currentTotals(pid).appliedPrice;
  $$('[data-rid] .prev,[data-rid] .current').forEach(inp=>inp.addEventListener('input',()=>{
    const tr=inp.closest('tr'),prev=tr.querySelector('.prev').value,cur=tr.querySelector('.current').value;
    const manual=tr.querySelector('.price').dataset.manual==='1'?num(tr.querySelector('.price').value):null;
    const price=manual!=null?manual:weekPrice;
    const cons=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev))/1000:null;
    tr.querySelector('.cons').textContent=cons==null?'—':fmt(cons,3);
    tr.querySelector('.charge').textContent=cons!=null?money(cons*price):'—';
    tr.querySelector('.status').innerHTML=cur===''?'<span class="badge warn">بانتظار</span>':(num(cur)<num(prev)?'<span class="badge danger">تحقق</span>':'<span class="badge ok">جاهزة</span>');
    const id=tr.dataset.rid;
    queueAutoSave('reading-'+id,async()=>{
      if(cur!==''&&prev!==''&&num(cur)<num(prev))throw new Error('invalid');
      const consumption=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev))/1000:null;
      await updateDoc(orgDoc('readings',id),{previousReading:prev===''?null:num(prev),currentReading:cur===''?null:num(cur),consumption,unitPrice:price,chargeAmount:consumption!=null?consumption*price:null,status:cur===''?'Pending':'Entered',updatedAt:serverTimestamp(),updatedBy:state.user.uid});
    });
  }));
  $$('[data-rid] .price').forEach(inp=>inp.addEventListener('change',async()=>{
    const tr=inp.closest('tr'); const next=inp.value===''?null:num(inp.value); const row=(state.data.readings||[]).find(x=>x.id===tr.dataset.rid); if(!row)return;
    const auto=currentTotals(pid).appliedPrice;
    if(next!=null && Math.abs(next-auto)>0.0001){
      const keep=confirm(`السعر الذي أدخلته (${money(next)}) مختلف عن السعر الحالي للكوب (${money(auto)}).\n\nاضغط "موافق" لإبقاء السعر الجديد يدويًا، أو "إلغاء" لإرجاع السعر الأصلي.`);
      if(!keep){inp.value=auto;inp.dataset.manual='0';}
      else {inp.dataset.manual='1';}
    } else {inp.value=auto;inp.dataset.manual='0';}
    const prev=tr.querySelector('.prev').value,cur=tr.querySelector('.current').value,price=inp.value===''?null:num(inp.value);
    if(cur!==''&&prev!==''&&num(cur)<num(prev)){toast('القراءة الحالية أقل من السابقة.','error');return;}
    const consumption=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev))/1000:null;
    await updateDoc(orgDoc('readings',tr.dataset.rid),{unitPrice:price,manualUnitPrice:(inp.dataset.manual==='1'?price:null),manualPrice:inp.dataset.manual==='1',chargeAmount:consumption!=null&&price!=null?consumption*price:null,updatedAt:serverTimestamp(),updatedBy:state.user.uid});
    state.loaded=false;await loadData(true);renderReadings();
  }));
  $('#saveReadings').onclick=async()=>{
    if(!can('admin','manager','accountant','operator')){toast('لا تملك صلاحية التعديل','error');return;}
    const rows=$$('[data-rid]');
    if(state.profile?.role==='accountant'){let requested=0;for(const tr of rows){const prev=tr.querySelector('.prev').value,cur=tr.querySelector('.current').value,priceInput=tr.querySelector('.price');if(cur!==''&&prev!==''&&num(cur)<num(prev)){toast('هناك قراءة حالية أقل من السابقة.','error');return;}const manual=priceInput.dataset.manual==='1'?num(priceInput.value):null;const price=manual!=null?manual:weekPrice;const consumption=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev))/1000:null;const row=(state.data.readings||[]).find(x=>x.id===tr.dataset.rid);const data={previousReading:prev===''?null:num(prev),currentReading:cur===''?null:num(cur),consumption,unitPrice:price,manualUnitPrice:manual,manualPrice:manual!=null,chargeAmount:consumption!=null?consumption*price:null,status:cur===''?'Pending':'Entered'};if(row&&!sameId(row.createdBy,state.user.uid)&&!accountantCanFillBlankMeasurement('readings',row,data)){await createApprovalRequest('update',orgDoc('readings',tr.dataset.rid),data,row);requested++;}else{await updateDoc(orgDoc('readings',tr.dataset.rid),{...data,updatedAt:serverTimestamp(),updatedBy:state.user.uid});}}state.loaded=false;await loadData(true);toast(requested?`تم إرسال ${requested} قراءة سابقة للموافقة`:'تم حفظ كل القراءات');renderReadings();return;}
    const ops=[];for(const tr of rows){const prev=tr.querySelector('.prev').value,cur=tr.querySelector('.current').value,priceInput=tr.querySelector('.price');if(cur!==''&&prev!==''&&num(cur)<num(prev)){toast('هناك قراءة حالية أقل من السابقة.','error');return;}const manual=priceInput.dataset.manual==='1'?num(priceInput.value):null;const price=manual!=null?manual:weekPrice;const consumption=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev))/1000:null;ops.push(b=>b.update(orgDoc('readings',tr.dataset.rid),{previousReading:prev===''?null:num(prev),currentReading:cur===''?null:num(cur),consumption,unitPrice:price,manualUnitPrice:manual,manualPrice:manual!=null,chargeAmount:consumption!=null?consumption*price:null,status:cur===''?'Pending':'Entered',updatedAt:serverTimestamp(),updatedBy:state.user.uid}));}
    await commitOps(ops);state.loaded=false;await loadData(true);toast('تم حفظ كل القراءات');renderReadings();
  };
  $$('[data-delete-reading]').forEach(b=>b.onclick=()=>deleteReading(b.dataset.deleteReading));
}

function renderEnergy(){
  setTitle('الكهرباء والمولدات','أبو زايد والسويسي هما المصدران الأساسيان. المولد الخارجي يسجل كمصروف في صفحة المصاريف.');const periods=latestPeriods();if(!state.periodId)state.periodId=periods[0]?.id;const p=selectedPeriod();const sources=state.data.sources||[];const ers=p?energyForPeriod(p.id):[];
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>كهرباء المولدات</h2></div><div class="panel-actions">${can('admin','manager','accountant')?'<button class="btn soft" id="sourceManage">+ إضافة مصدر/مولد</button>':''}<button class="btn primary" id="energySave">حفظ القراءات</button></div></div>${!p?`<div class="reading-start"><div class="reading-start-icon">ϟ</div><div><h2>افتح أسبوعًا أولًا</h2><p>بعد فتحه ستظهر أبو زايد والسويسي.</p><button class="btn primary" id="energyFirst">+ افتح أسبوعًا</button></div></div>`:`<div class="period-picker"><label>الأسبوع الحالي</label><select id="periodSelect" class="period-select">${periods.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${safe(x.label||'أسبوع')} — ${fmtDate(x.startDate)} إلى ${fmtDate(x.endDate)} — ${statusText(x.status||'Draft')}</option>`).join('')}</select></div><div class="section-note"><b>المعادلة:</b> (الحالية − السابقة) × سعر الكيلو = تكلفة المصدر. لا يوجد مولد خارجي هنا؛ سجله كمصروف عندما تحتاجه.</div><div class="table-wrap"><table class="table" style="min-width:1050px"><thead><tr><th>المصدر</th><th>السابقة</th><th>الحالية</th><th>الاستهلاك</th><th>سعر الكيلو</th><th>التكلفة</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>${ers.length?ers.map(r=>{const src=sources.find(s=>s.id===r.sourceId);const cons=r.currentReading!=null&&r.previousReading!=null?Math.max(0,num(r.currentReading)-num(r.previousReading)):null;const cost=cons!=null&&r.pricePerKwh!=null?cons*num(r.pricePerKwh):null;return `<tr data-eid="${r.id}"><td><b>${safe(src?.name||'مصدر محذوف')}</b></td><td><input class="reading-input eprev" type="number" step="0.001" value="${r.previousReading??''}"></td><td><input class="reading-input ecur" type="number" step="0.001" value="${r.currentReading??''}"></td><td class="econs">${cons==null?'—':fmt(cons,3)}</td><td><input class="reading-input erate" type="number" step="0.01" value="${r.pricePerKwh??''}"></td><td class="ecost">${cost==null?'—':money(cost)}</td><td class="estatus">${r.currentReading==null?'<span class="badge warn">بانتظار</span>':(num(r.currentReading)<num(r.previousReading)?'<span class="badge danger">تحقق</span>':'<span class="badge ok">جاهز</span>')}</td><td>${can('admin','manager','accountant')?`<button class="mini red" data-delete-energy="${r.id}">حذف</button>`:''}</td></tr>`}).join(''):`<tr><td colspan="8">${empty('لا توجد مصادر طاقة','أضف أبو زايد أو السويسي.')}</td></tr>`}</tbody></table></div><div class="panel" style="margin-top:13px;background:#fbfcfb"><div class="panel-head"><div><h2>مصادر الطاقة</h2></div></div><div class="members">${sources.map(src=>`<div class="member-row"><div class="avatar">ϟ</div><div class="member-info"><b>${safe(src.name)}</b><span>${safe(src.type||'مولد')} • ${src.defaultRate!=null?`السعر الافتراضي ${money(src.defaultRate)}`:'بدون سعر افتراضي'}</span></div><span class="badge ${src.active!==false?'ok':'warn'}">${src.active!==false?'فعال':'موقوف'}</span>${can('admin','manager','accountant')?`<button class="mini" data-edit-source="${src.id}">تعديل</button><button class="mini red" data-delete-source="${src.id}">حذف</button>`:''}</div>`).join('')}</div></div>`}</section>`;
  $('#sourceManage')?.addEventListener('click',()=>showSourceForm());$$('[data-edit-source]').forEach(b=>b.onclick=()=>showSourceForm(b.dataset.editSource));$$('[data-delete-source]').forEach(b=>b.onclick=()=>deleteSource(b.dataset.deleteSource));$('#energySave').onclick=()=>p?saveEnergy(p.id):null;if($('#energyFirst'))$('#energyFirst').onclick=showPeriodForm;$('#periodSelect')?.addEventListener('change',e=>navigate('energy',e.target.value));bindEnergyInputs();
}
function bindEnergyInputs(){
  $$('[data-eid] .eprev,[data-eid] .ecur,[data-eid] .erate').forEach(inp=>inp.addEventListener('input',()=>{const tr=inp.closest('tr'),prev=tr.querySelector('.eprev').value,cur=tr.querySelector('.ecur').value,rate=tr.querySelector('.erate').value;const cons=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev)):null;tr.querySelector('.econs').textContent=cons==null?'—':fmt(cons,3);tr.querySelector('.ecost').textContent=cons!=null&&rate!==''?money(cons*num(rate)):'—';tr.querySelector('.estatus').innerHTML=cur===''?'<span class="badge warn">بانتظار</span>':(num(cur)<num(prev)?'<span class="badge danger">تحقق</span>':'<span class="badge ok">جاهز</span>');const id=tr.dataset.eid;queueAutoSave('energy-'+id,async()=>{if(cur!==''&&prev!==''&&num(cur)<num(prev))throw new Error('invalid');const c=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev)):null;await updateDoc(orgDoc('energyReadings',id),{previousReading:prev===''?null:num(prev),currentReading:cur===''?null:num(cur),pricePerKwh:rate===''?null:num(rate),consumption:c,cost:c!=null&&rate!==''?c*num(rate):null,status:cur===''?'Pending':'Entered',updatedAt:serverTimestamp(),updatedBy:state.user.uid});});}));
  $$('[data-delete-energy]').forEach(b=>b.onclick=()=>deleteEnergyReading(b.dataset.deleteEnergy));
}

async function saveEnergy(pid){if(!can('admin','manager','accountant','operator')){toast('لا تملك صلاحية التعديل','error');return;}const rows=$$('[data-eid]').map(tr=>{const prev=tr.querySelector('.eprev').value,cur=tr.querySelector('.ecur').value,rate=tr.querySelector('.erate').value;const cons=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev)):null;return {tr,id:tr.dataset.eid,prev,cur,rate,cons,row:(state.data.energyReadings||[]).find(x=>x.id===tr.dataset.eid)};});for(const x of rows){if(x.cur!==''&&x.prev!==''&&num(x.cur)<num(x.prev)){toast('هناك قراءة كهرباء أقل من السابقة. أصلحها أولًا.','error');return;}}if(state.profile?.role==='accountant'){let requested=0;for(const x of rows){const d={previousReading:x.prev===''?null:num(x.prev),currentReading:x.cur===''?null:num(x.cur),pricePerKwh:x.rate===''?null:num(x.rate),consumption:x.cons,cost:x.cons!=null&&x.rate!==''?x.cons*num(x.rate):null,status:x.cur===''?'Pending':'Entered'};if(x.row && !sameId(x.row.createdBy,state.user.uid) && !accountantCanFillBlankMeasurement('energyReadings',x.row,d)){await createApprovalRequest('update',orgDoc('energyReadings',x.id),d,x.row);requested++;}else{await updateDoc(orgDoc('energyReadings',x.id),{...d,updatedAt:serverTimestamp(),updatedBy:state.user.uid});}}if(requested){state.loaded=false;await loadData(true);toast(`تم إرسال ${requested} تعديل/تعديلات سابقة للموافقة`);renderEnergy();return;}}else{const batch=writeBatch(db);for(const x of rows){batch.update(orgDoc('energyReadings',x.id),{previousReading:x.prev===''?null:num(x.prev),currentReading:x.cur===''?null:num(x.cur),pricePerKwh:x.rate===''?null:num(x.rate),consumption:x.cons,cost:x.cons!=null&&x.rate!==''?x.cons*num(x.rate):null,status:x.cur===''?'Pending':'Entered',updatedAt:serverTimestamp(),updatedBy:state.user.uid});}await batch.commit();await addAudit('تعديل','energyReadings',pid,`حفظ قراءات الكهرباء للأسبوع`);}state.loaded=false;await loadData(true);toast('تم حفظ قراءات الكهرباء');renderEnergy();}
function showSourceForm(id){if(!can('admin','manager','accountant')){toast('لا تملك صلاحية إدارة مصادر الطاقة','error');return;}const src=id?(state.data.sources||[]).find(x=>x.id===id):null;openModal(`<h2>${src?'تعديل المصدر':'إضافة مصدر / مولد'}</h2><p class="modal-lead">لا تربط النظام بعدد ثابت من المولدات؛ أضف أي مصدر مستقبلي.</p><div class="form-grid"><div class="field"><label>اسم المصدر</label><input id="sName" value="${safe(src?.name||'')}"></div><div class="field"><label>النوع</label><input id="sType" value="${safe(src?.type||'مولد')}"></div><div class="field"><label>سعر كيلو افتراضي</label><input id="sRate" type="number" step="0.01" value="${src?.defaultRate??''}"></div><div class="field"><label>الحالة</label><select id="sActive"><option value="1" ${src?.active!==false?'selected':''}>فعال</option><option value="0" ${src?.active===false?'selected':''}>موقوف</option></select></div></div><div class="actions"><button class="btn primary" id="saveSource">حفظ</button><button class="btn ghost" id="closeSource">إلغاء</button></div>`);$('#closeSource').onclick=closeModal;$('#saveSource').onclick=async()=>{const name=$('#sName').value.trim();if(!name){toast('اكتب اسم المصدر','error');return;}const data={name,type:$('#sType').value.trim()||'مولد',defaultRate:$('#sRate').value===''?null:num($('#sRate').value),active:$('#sActive').value==='1'};if(src){await updateDoc(orgDoc('sources',id),{...data,updatedAt:serverTimestamp()});upsertLocal('sources',{id,...data});toast('تم تعديل المصدر');}else{const r=doc(orgCollection('sources'));await fsSetDoc(r,{...data,code:name.toLowerCase().replace(/\s+/g,'-'),createdAt:serverTimestamp()});upsertLocal('sources',{id:r.id,...data});const p=selectedPeriod();if(p){const er=doc(orgCollection('energyReadings'));await fsSetDoc(er,{periodId:p.id,sourceId:r.id,previousReading:null,currentReading:null,pricePerKwh:data.defaultRate,consumption:null,cost:null,status:'Pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});}toast('تمت إضافة المصدر');}closeModal();state.loaded=false;await loadData(true);renderEnergy();};}

function renderCosts(){
  setTitle('المصاريف والطوارئ','');
  const periods=latestPeriods();if(!state.periodId)state.periodId=periods[0]?.id;const p=selectedPeriod();const rows=p?costsForPeriod(p.id).filter(x=>x.direction!=='credit'):[];
  const totalExpense=rows.reduce((a,x)=>a+num(x.amount),0);
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>مصاريف وخدمات الأسبوع</h2></div><button class="btn primary" id="addCost">+ إضافة مصروف / خدمة</button></div>${!p?empty('افتح أسبوعًا أولًا','المصاريف والخدمات مرتبطة بالأسبوع.'): `<div class="period-picker"><label>الأسبوع الحالي</label><select id="periodSelect" class="period-select">${periods.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${safe(x.label||'أسبوع')} — ${fmtDate(x.startDate)} إلى ${fmtDate(x.endDate)}</option>`).join('')}</select></div><div class="money-grid"><div class="money-card"><small>إجمالي المصاريف</small><b>${money(totalExpense)}</b></div><div class="money-card"><small>خصم من المصاريف</small><b>${money(contributionTotal(p.id,'expense_discount'))}</b></div><div class="money-card"><small>صافي المصاريف</small><b>${money(Math.max(0,totalExpense-contributionTotal(p.id,'expense_discount')))}</b></div></div><div class="section-note" style="margin-top:13px"><b>التوزيع:</b> اختر على كل ساكن، أو اقسم على عدد تحدده، أو مبلغًا ثابتًا للشخص الواحد. المولد الخارجي يعمل بنفس النظام.</div><div class="table-wrap" style="margin-top:13px"><table class="table"><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المبلغ</th><th>التوزيع</th><th>إجراءات</th></tr></thead><tbody>${rows.length?rows.map(c=>`<tr><td>${fmtDate(c.date)}</td><td>${safe(c.type||'—')}</td><td>${safe(c.description||'—')}</td><td class="strong">${money(c.amount)}</td><td>${c.allocationLabel?safe(c.allocationLabel):'—'}</td><td><div class="row-actions"><button class="mini" data-edit-cost="${c.id}">تعديل</button>${can('admin','manager','accountant')?`<button class="mini red" data-delete-cost="${c.id}">حذف</button>`:''}</div></td></tr>`).join(''):`<tr><td colspan="6">${empty('لا توجد مصاريف','ابدأ بإضافة خدمة الحارس أو مولد خارجي أو أي مصروف.')}</td></tr>`}</tbody></table></div>`}</section>`;
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
  const defaultWaterIncluded=c?.waterPricingIncluded===false||['خدمة الحارس','تأمين الغاطس','استئجار مولد خارجي'].includes(String(c?.type||''))?'0':'1';
  openModal(`<h2>${c?'تعديل مصروف':'إضافة مصروف أو خدمة'}</h2><p class="modal-lead">الحارس والمولد الخارجي والخدمات كلها تستخدم نفس نظام التوزيع.</p><div class="form-grid"><div class="field"><label>نوع البند</label><select id="cType"><option value="تأمين الغاطس" ${c?.type==='تأمين الغاطس'?'selected':''}>تأمين الغاطس</option><option value="استئجار مولد خارجي" ${c?.type==='استئجار مولد خارجي'?'selected':''}>استئجار مولد خارجي</option><option value="سولار / وقود" ${c?.type==='سولار / وقود'?'selected':''}>سولار / وقود</option><option value="نقل" ${c?.type==='نقل'?'selected':''}>نقل</option><option value="صيانة" ${c?.type==='صيانة'?'selected':''}>صيانة</option><option value="طوارئ" ${c?.type==='طوارئ'?'selected':''}>طوارئ</option><option value="كهرباء الدرج" ${c?.type==='كهرباء الدرج'?'selected':''}>كهرباء الدرج</option><option value="أخرى" ${c?.type==='أخرى'||!c?'selected':''}>أخرى</option></select></div><div class="field"><label>التاريخ</label><input id="cDate" type="date" value="${safe(c?.date||dateNow())}"></div><div class="field"><label>المبلغ الكامل</label><input id="cAmount" type="number" step="0.01" min="0" value="${c?.amount??''}" placeholder="مثال 1110"></div><div class="field"><label>يدخل في حساب سعر الكوب؟</label><select id="cWater"><option value="1" ${defaultWaterIncluded==='1'?'selected':''}>نعم، تكلفة تشغيل المياه</option><option value="0" ${defaultWaterIncluded==='0'?'selected':''}>لا، مصروف/خدمة مستقلة</option></select></div><div class="field"><label>طريقة التوزيع</label><select id="cAlloc"><option value="none" ${currentAlloc==='none'?'selected':''}>بدون توزيع على السكان</option><option value="equal_all" ${currentAlloc==='equal_all'?'selected':''}>على كل ساكن (المبلغ ÷ العدد)</option><option value="divide" ${currentAlloc==='divide'?'selected':''}>أقسم على عدد أحدده</option><option value="per_person" ${currentAlloc==='per_person'?'selected':''}>مبلغ على الشخص الواحد</option></select></div><div class="field"><label>عدد الأشخاص</label><input id="cCount" type="number" min="0" step="1" value="${c?.allocationCount??subs.length}" placeholder="مثال 37"></div><div class="field"><label>مبلغ الشخص الواحد (عند الاختيار)</label><input id="cPerPerson" type="number" min="0" step="0.01" value="${c?.perPersonAmount??''}" placeholder="مثال 30"></div><div class="field full" id="allocationPreviewBox"><div class="section-note"></div></div><div class="field full"><label>البيان</label><input id="cDesc" value="${safe(c?.description||'')}"></div><div class="field full"><label>ملاحظات</label><textarea id="cNotes">${safe(c?.notes||'')}</textarea></div></div><div class="actions"><button class="btn primary" id="saveCost">حفظ</button><button class="btn ghost" id="cancelCost">إلغاء</button></div>`);
  const updatePreview=()=>{const box=$('#allocationPreviewBox');const v=allocationPreview($('#cAlloc').value,$('#cAmount').value,$('#cPerPerson').value,$('#cCount').value);box.innerHTML=v.count?`<div class="section-note"><b>نتيجة التوزيع:</b> ${safe(v.label)}<br>المبلغ المحمّل لكل ساكن: <b>${money(v.each)}</b> — إجمالي موزع: <b>${money(v.total)}</b></div>`:'<div class="section-note">هذا البند لن يضاف تلقائيًا على حساب السكان.</div>';};
  ['cAlloc','cAmount','cPerPerson','cCount'].forEach(k=>$('#'+k).addEventListener('input',updatePreview));updatePreview();$('#cancelCost').onclick=closeModal;
  $('#saveCost').onclick=async()=>{
    const amount=num($('#cAmount').value);if(amount<=0){toast('اكتب المبلغ الكامل','error');return;}
    const alloc=$('#cAlloc').value,count=Math.max(0,Math.floor(num($('#cCount').value))),per=num($('#cPerPerson').value);if(alloc!=='none'&&!count){toast('اكتب عدد الأشخاص للتوزيع','error');return;}if(alloc==='per_person'&&per<=0){toast('اكتب مبلغ الشخص الواحد','error');return;}
    const preview=allocationPreview(alloc,amount,per,count);
    const data={periodId:pid,type:$('#cType').value,date:$('#cDate').value,amount,direction:'expense',description:$('#cDesc').value.trim()||$('#cType').value,notes:$('#cNotes').value.trim(),allocationRule:alloc,allocationCount:count,perPersonAmount:alloc==='per_person'?per:null,allocatedPerPerson:alloc==='none'?0:preview.each,allocationLabel:alloc==='none'?'بدون توزيع':preview.label,waterPricingIncluded:$('#cWater').value==='1',createdBy:c?.createdBy||state.user.uid,updatedAt:serverTimestamp()};
    if(c && state.profile?.role==='accountant' && !sameId(c.createdBy,state.user.uid) && !isCurrentPeriodRecord(c)){ await createApprovalRequest('update',orgDoc('costs',id),data,c); return; }
    const ref=c?orgDoc('costs',id):doc(orgCollection('costs'));const ops=[];
    if(c) ops.push(b=>b.update(ref,data)); else ops.push(b=>b.set(ref,{...data,createdAt:serverTimestamp()}));
    // remove old allocations on edit, then recreate the current distribution
    if(c) for(const tr of (state.data.ledger||[]).filter(x=>x.referenceId===id&&['SERVICE','ALLOCATED_COST'].includes(x.transactionType))) ops.push(b=>b.delete(orgDoc('ledger',tr.id)));
    if(alloc!=='none'&&preview.each>0){for(const sub of subs.slice(0,count)){const lr=doc(orgCollection('ledger'));ops.push(b=>b.set(lr,{subscriberId:sub.id,periodId:pid,transactionType:'SERVICE',serviceCode:data.type==='استئجار مولد خارجي'?'EXTERNAL_GENERATOR':data.type==='خدمة الحارس'?'GUARD':data.type==='تأمين الغاطس'?'PUMP_INSURANCE':'ALLOCATED_COST',debit:preview.each,credit:0,description:data.description,referenceId:ref.id,createdAt:serverTimestamp(),createdBy:state.user.uid}));}}
    await commitOps(ops);state.loaded=false;await loadData(true);closeModal();toast(c?'تم تحديث المصروف':'تم حفظ المصروف وتوزيعه');renderCosts();
  };
}

function renderContributions(){
  setTitle('المساهمات والخصومات','اختر بوضوح أين تذهب المساهمة: الماء والكهرباء أو المصاريف أو صندوق العمارة.');
  const periods=latestPeriods();if(!state.periodId)state.periodId=periods[0]?.id;const p=selectedPeriod();
  const rows=p?contributionRowsForPeriod(p.id):[];
  const totals={utility:contributionTotal(p?.id,'utility_discount'),expense:contributionTotal(p?.id,'expense_discount'),fund:contributionTotal(p?.id,'fund_contribution')};
  const canManage=can('admin','manager','accountant');
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>المساهمات والخصومات</h2><p class="muted">المساهمة الافتراضية تخفف تكلفة الماء والكهرباء فقط. مساهمة الصندوق تدخل الإيرادات والصندوق فقط. خصم المصاريف يقلل المصاريف فقط.</p></div>${canManage?'<button class="btn primary" id="addContribution">+ إضافة مساهمة</button>':''}</div>${!p?empty('افتح أسبوعًا أولًا',''): `<div class="period-picker"><label>الأسبوع الحالي</label><select id="periodSelect" class="period-select">${periods.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${safe(x.label||'أسبوع')} — ${fmtDate(x.startDate)} إلى ${fmtDate(x.endDate)}</option>`).join('')}</select></div><div class="money-grid"><div class="money-card"><small>خصم من الماء والكهرباء</small><b>${money(totals.utility)}</b></div><div class="money-card"><small>خصم من المصاريف</small><b>${money(totals.expense)}</b></div><div class="money-card"><small>مساهمة للصندوق</small><b>${money(totals.fund)}</b></div></div><div class="table-wrap" style="margin-top:13px"><table class="table"><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المبلغ</th><th>إجراءات</th></tr></thead><tbody>${rows.length?rows.map(c=>`<tr><td>${fmtDate(c.date)}</td><td><span class="badge info">${safe(contributionLabel(c))}</span></td><td>${safe(c.description||'—')}</td><td class="strong">${money(c.amount)}</td><td>${canManage?`<div class="row-actions"><button class="mini" data-edit-contribution="${c.id}">تعديل</button>${can('admin','manager')?`<button class="mini red" data-delete-contribution="${c.id}">حذف</button>`:''}</div>`:'—'}</td></tr>`).join(''):`<tr><td colspan="5">${empty('لا توجد مساهمات','يمكن تسجيل النوع المناسب من هنا.')}</td></tr>`}</tbody></table></div>`}</section>`;
  $('#addContribution')?.addEventListener('click',()=>showContributionForm(p?.id));$('#periodSelect')?.addEventListener('change',e=>navigate('contributions',e.target.value));$$('[data-edit-contribution]').forEach(b=>b.onclick=()=>showContributionForm(p.id,b.dataset.editContribution));$$('[data-delete-contribution]').forEach(b=>b.onclick=()=>deleteContribution(b.dataset.deleteContribution));
}
function showContributionForm(pid,id){
  if(!can('admin','manager','accountant')){toast('المساهمات مخصصة للإدارة والمحاسبة','error');return;}
  const c=id?(state.data.contributions||[]).find(x=>x.id===id):null;
  const type=contributionType(c);
  openModal(`<h2>${c?'تعديل مساهمة':'إضافة مساهمة'}</h2><p class="modal-lead">حدد المسار المحاسبي للمبلغ قبل الحفظ حتى لا يختلط الصندوق مع تكلفة الماء أو المصاريف.</p><div class="form-grid"><div class="field full"><label>نوع المساهمة</label><select id="xType"><option value="utility_discount" ${type==='utility_discount'?'selected':''}>خصم من الماء والكهرباء — الافتراضي</option><option value="expense_discount" ${type==='expense_discount'?'selected':''}>خصم من المصاريف</option><option value="fund_contribution" ${type==='fund_contribution'?'selected':''}>مساهمة للصندوق</option></select></div><div class="field"><label>التاريخ</label><input id="xDate" type="date" value="${safe(c?.date||dateNow())}"></div><div class="field"><label>المبلغ</label><input id="xAmount" type="number" min="0" step="0.01" value="${c?.amount??''}"></div><div class="field full"><label>البيان</label><input id="xDesc" value="${safe(c?.description||'مساهمة')}" placeholder="مثال: مساهمة من أحد السكان"></div></div><div class="section-note" id="contributionPathNote"></div><div class="actions"><button class="btn primary" id="saveContribution">حفظ</button><button class="btn ghost" id="cancelContribution">إلغاء</button></div>`);
  const updateNote=()=>{const t=$('#xType').value;$('#contributionPathNote').innerHTML=t==='fund_contribution'?'<b>المسار:</b> ستضاف القيمة مباشرة إلى الإيرادات و الصندوق ولن تُخصم من الماء أو المصاريف.':t==='expense_discount'?'<b>المسار:</b> ستخصم القيمة من المصاريف الداخلة في الحساب ولن تُضاف للصندوق.':'<b>المسار:</b> ستخفف صافي تكلفة الماء والكهرباء قبل حساب سعر الكوب ولن تُضاف للصندوق.';};
  $('#xType').onchange=updateNote;updateNote();$('#cancelContribution').onclick=closeModal;
  $('#saveContribution').onclick=async()=>{
    const amount=num($('#xAmount').value),date=$('#xDate').value,type=$('#xType').value,description=$('#xDesc').value.trim()||'مساهمة';
    if(amount<=0||!date){toast('أكمل التاريخ والمبلغ','error');return;}
    const data={periodId:pid,date,amount,description,contributionType:type,createdBy:c?.createdBy||state.user.uid,updatedAt:serverTimestamp()};
    if(c && state.profile?.role==='accountant' && !sameId(c.createdBy,state.user.uid) && !isCurrentPeriodRecord(c)){ await createApprovalRequest('update',orgDoc('contributions',id),data,c); return; }
    const batch=writeBatch(db),ref=c?orgDoc('contributions',id):doc(orgCollection('contributions'));
    if(c) batch.update(ref,data); else batch.set(ref,{...data,createdAt:serverTimestamp()});
    const oldFund=c&&contributionType(c)==='fund_contribution';
    const oldRevenueId=c?.fundRevenueId||null;
    if(oldFund&&oldRevenueId) batch.delete(orgDoc('fundRevenues',oldRevenueId));
    if(type==='fund_contribution'){
      const revRef=oldRevenueId?orgDoc('fundRevenues',oldRevenueId):doc(orgCollection('fundRevenues'));
      const revData={type:'مساهمة للصندوق',date,amount,description,notes:'مساهمة مخصصة لصندوق العمارة',source:'contribution',contributionId:ref.id,updatedAt:serverTimestamp(),updatedBy:state.user.uid};
      if(oldRevenueId) batch.set(revRef,revData,{merge:true}); else batch.set(revRef,{...revData,createdAt:serverTimestamp()});
      data.fundRevenueId=revRef.id;
      if(c) batch.update(ref,{fundRevenueId:revRef.id}); else batch.update(ref,{fundRevenueId:revRef.id});
    } else if(c?.fundRevenueId){ batch.update(ref,{fundRevenueId:null}); }
    await batch.commit();state.loaded=false;await loadData(true);await syncPeriodWaterPrice(pid);closeModal();renderContributions();toast(c?'تم تعديل المساهمة':'تمت إضافة المساهمة');
  };
}
async function deleteContribution(id){
  if(!can('admin','manager')){toast('الحذف مخصص للمديرين','error');return;}
  const c=(state.data.contributions||[]).find(x=>x.id===id);if(!c)return;if(!confirm(`حذف المساهمة «${c.description||''}» بمبلغ ${money(c.amount)}؟`))return;
  const batch=writeBatch(db);batch.delete(orgDoc('contributions',id));if(c.fundRevenueId)batch.delete(orgDoc('fundRevenues',c.fundRevenueId));await batch.commit();await addAudit('حذف','contributions',id,`حذف المساهمة ${c.description||''}`);removeLocal('contributions',id);await loadData(true);await syncPeriodWaterPrice(c.periodId);toast('تم حذف المساهمة وتحديث المسار المالي');renderContributions();
}

function renderSubscribers(){
  setTitle('السكان والوحدات','حدد البنايات والوحدات من اليمين، والسكان من اليسار. التعديل والحذف للمديرين فقط.');
  const rows=(state.data.subscribers||[]),buildings=state.data.buildings||[],units=state.data.units||[];
  const canManage=can('admin','manager','accountant');
  const residentDebtTotal=rows.filter(s=>s.active!==false&&s.type!=='خارجي').reduce((sum,s)=>sum+Math.max(0,num(subscriberRow(s).debt)),0);
  $('#app').innerHTML=`<section class="grid-2">
    <div class="panel">
      <div class="panel-head"><div><h2>السكان</h2></div><div class="panel-actions"><button class="btn soft" id="exportSubs">↓ Excel</button>${canManage?'<button class="btn primary" id="addSub">+ ساكن</button>':''}</div></div>
      <div class="toolbar"><input id="subSearch" class="search" placeholder="ابحث بالاسم أو الكود أو الهاتف…"><select id="subSort" class="sort-select"><option value="code-asc">الكود تصاعدي ↑</option><option value="code-desc">الكود تنازلي ↓</option><option value="name-asc">الاسم أبجدي ↑</option><option value="name-desc">الاسم أبجدي ↓</option></select><span class="muted">${rows.filter(s=>s.active!==false).length} نشط</span></div>
      <div class="table-wrap"><table class="table" style="min-width:900px"><thead><tr><th>الكود</th><th>الاسم</th><th>الهاتف</th><th>النوع</th><th>البناية</th><th>الوحدة</th><th>المديونية</th><th>إجراءات</th></tr></thead><tbody id="subBody">${subscriberRowsSorted(rows,'code-asc')}</tbody></table></div>
      <div class="money-grid" style="margin-top:13px"><div class="money-card"><small>مجموع المديونية الحالية للسكان</small><b>${money(residentDebtTotal)}</b></div></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>البنايات والوحدات</h2></div><div class="panel-actions"><button class="btn primary" id="addBuilding">+ بناية</button><button class="btn soft" id="addUnit">+ وحدة</button></div></div>
      <div class="mini-section"><h3>البنايات</h3><div class="members">${buildings.length?buildings.map(b=>`<div class="member-row"><div class="avatar">ب</div><div class="member-info"><b>${safe(b.name)}</b><span>الكود: ${safe(b.code||'—')} • ${units.filter(u=>sameId(u.buildingId,b.id)).length} وحدات</span></div>${canManage?`<button class="mini" data-edit-building="${b.id}">تعديل</button><button class="mini red" data-delete-building="${b.id}">حذف</button>`:''}</div>`).join(''):empty('لا توجد بنايات','أضف البناية الأولى.')}</div></div>
      <div class="mini-section"><h3>الوحدات</h3><div class="members">${units.length?units.sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true})).map(u=>{const b=buildings.find(x=>x.id===u.buildingId);const occupant=rows.find(s=>sameId(s.unitId,u.id)&&s.active!==false);return `<div class="member-row"><div class="avatar">و</div><div class="member-info"><b>${safe(u.code)}</b><span>${safe(b?.name||'—')} · ${occupant?safe(occupant.name):'غير مشغولة'}</span></div>${canManage?`<button class="mini" data-edit-unit="${u.id}">تعديل</button><button class="mini red" data-delete-unit="${u.id}">حذف</button>`:''}</div>`}).join(''):empty('لا توجد وحدات','أضف وحدة جديدة.')}</div></div>
    </div>
  </section>`;
  $('#addBuilding').onclick=()=>showBuildingForm();$('#addUnit').onclick=()=>showUnitForm();$('#addSub')?.addEventListener('click',()=>showSubscriberForm());$('#exportSubs').onclick=()=>exportSubscribers(rows);
  $('#subSearch').oninput=()=>refreshSubscriberRows();$('#subSort').onchange=()=>refreshSubscriberRows();
  $$('[data-edit-building]').forEach(b=>b.onclick=()=>showBuildingForm(b.dataset.editBuilding));$$('[data-delete-building]').forEach(b=>b.onclick=()=>deleteBuilding(b.dataset.deleteBuilding));
  $$('[data-edit-unit]').forEach(b=>b.onclick=()=>showUnitForm(b.dataset.editUnit));$$('[data-delete-unit]').forEach(b=>b.onclick=()=>deleteUnit(b.dataset.deleteUnit));
  bindSubscriberActions();
  function refreshSubscriberRows(){const q=$('#subSearch').value.trim().toLowerCase(),sort=$('#subSort').value;const filtered=rows.filter(s=>[s.name,s.code,s.phone].some(v=>String(v||'').toLowerCase().includes(q)));$('#subBody').innerHTML=subscriberRowsSorted(filtered,sort);bindSubscriberActions();}
}
function subscriberRows(rows){return subscriberRowsSorted(rows,'code-asc');}
function subscriberRowsSorted(rows,sort){
  const a=[...rows].sort((x,y)=>{if(sort==='name-asc'||sort==='name-desc'){const c=String(x.name||'').localeCompare(String(y.name||''),'ar');return sort==='name-asc'?c:-c;}const c=String(x.code||'').localeCompare(String(y.code||''),undefined,{numeric:true});return sort==='code-asc'?c:-c;});
  if(!a.length)return `<tr><td colspan="8">${empty('لا يوجد سكان','أضف أول ساكن.')}</td></tr>`;
  const canManage=can('admin','manager','accountant');
  return a.map(s=>{const r=subscriberRow(s);return `<tr><td><span class="code">${safe(s.code)}</span></td><td><button class="link" data-account="${s.id}">${safe(s.name)}</button></td><td>${safe(s.phone||'—')}</td><td>${s.type==='خارجي'?'<span class="badge warn">خارجي</span>':'داخلي'}</td><td>${safe(r.buildingName)}</td><td>${safe(r.unitCode)}</td><td class="strong">${money(r.debt)}</td><td><div class="row-actions">${canManage?`<button class="mini" data-edit-sub="${s.id}">تعديل</button><button class="mini red" data-delete-sub="${s.id}">حذف</button>`:''}</div></td></tr>`}).join('');
}
function bindSubscriberActions(){$$('[data-edit-sub]').forEach(b=>b.onclick=()=>showSubscriberForm(b.dataset.editSub));$$('[data-delete-sub]').forEach(b=>b.onclick=()=>deleteSubscriber(b.dataset.deleteSub));}

function showBuildingForm(id){if(!can('admin','manager','accountant')){toast('لا تملك صلاحية إدارة البنايات','error');return;}const b=id?(state.data.buildings||[]).find(x=>x.id===id):null;openModal(`<h2>${b?'تعديل البناية':'إضافة بناية'}</h2><p class="modal-lead">مثال: البناية الأولى، البناية الثانية.</p><div class="form-grid"><div class="field"><label>اسم البناية</label><input id="bName" value="${safe(b?.name||'')}"></div><div class="field"><label>الكود</label><input id="bCode" value="${safe(b?.code||'')}"></div></div><div class="actions"><button class="btn primary" id="saveBuilding">حفظ</button><button class="btn ghost" id="cancelBuilding">إلغاء</button></div>`);$('#cancelBuilding').onclick=closeModal;$('#saveBuilding').onclick=async()=>{const name=$('#bName').value.trim(),code=$('#bCode').value.trim();if(!name||!code){toast('اكتب الاسم والكود','error');return;}if(b)await updateDoc(orgDoc('buildings',id),{name,code,updatedAt:serverTimestamp()});else{const r=doc(orgCollection('buildings'));await fsSetDoc(r,{name,code,active:true,createdAt:serverTimestamp()});}state.loaded=false;await loadData(true);closeModal();toast('تم حفظ البناية');renderSubscribers();};}
function showUnitForm(id){if(!can('admin','manager','accountant')){toast('لا تملك صلاحية إدارة الوحدات','error');return;}const u=id?(state.data.units||[]).find(x=>x.id===id):null;openModal(`<h2>${u?'تعديل الوحدة':'إضافة وحدة'}</h2><div class="form-grid"><div class="field"><label>البناية</label><select id="uBuilding"><option value="">اختر</option>${(state.data.buildings||[]).map(b=>`<option value="${b.id}" ${u?.buildingId===b.id?'selected':''}>${safe(b.name)}</option>`).join('')}</select></div><div class="field"><label>رقم الوحدة</label><input id="uCode" value="${safe(u?.code||'')}"></div><div class="field"><label>الدور</label><input id="uFloor" value="${safe(u?.floor||'')}"></div></div><div class="actions"><button class="btn primary" id="saveUnit">حفظ</button><button class="btn ghost" id="cancelUnit">إلغاء</button></div>`);$('#cancelUnit').onclick=closeModal;$('#saveUnit').onclick=async()=>{const buildingId=$('#uBuilding').value,code=$('#uCode').value.trim();if(!buildingId||!code){toast('اختر البناية واكتب رقم الوحدة','error');return;}const data={buildingId,code,unitNumber:code,floor:$('#uFloor').value.trim(),active:true,updatedAt:serverTimestamp()};if(u)await updateDoc(orgDoc('units',id),data);else{const r=doc(orgCollection('units'));await fsSetDoc(r,{...data,createdAt:serverTimestamp()});}state.loaded=false;await loadData(true);closeModal();toast('تم حفظ الوحدة');renderSubscribers();};}
async function syncNewResidentServices(subscriber, meter){
  if(!subscriber || subscriber.type==='خارجي' || subscriber.active===false) return;
  const periods=allPeriodsAscending();
  if(!periods.length) return;
  const latest=periods.at(-1);
  const ops=[];
  const now=serverTimestamp();
  const existingReadings=state.data.readings||[];
  for(const p of periods){
    if(existingReadings.some(r=>sameId(r.periodId,p.id)&&sameId(r.meterId,meter.id))) continue;
    const prior=[...existingReadings]
      .filter(r=>sameId(r.meterId,meter.id)&&r.currentReading!=null&&periodById(r.periodId))
      .map(r=>({r,p:periodById(r.periodId)}))
      .filter(x=>String(x.p.startDate||'')<String(p.startDate||''))
      .sort((a,b)=>String(b.p.startDate).localeCompare(String(a.p.startDate)))[0]?.r?.currentReading??null;
    const rr=doc(orgCollection('readings'));
    ops.push(b=>b.set(rr,{periodId:p.id,meterId:meter.id,previousReading:prior,currentReading:null,consumption:null,unitPrice:p.waterUnitPrice??null,chargeAmount:null,status:'Pending',createdAt:now,updatedAt:now,createdBy:state.user.uid}));
  }
  // A new resident is included in already-applied services for the current/latest billing period only.
  // This avoids charging historical months retroactively.
  const serviceRows=(state.data.ledger||[]).filter(x=>sameId(x.periodId,latest.id)&&x.transactionType==='SERVICE'&&['GUARD','PUMP_INSURANCE'].includes(x.serviceCode));
  const serviceCodes=[...new Set(serviceRows.map(x=>x.serviceCode))];
  for(const code of serviceCodes){
    if(serviceRows.some(x=>sameId(x.subscriberId,subscriber.id)&&x.serviceCode===code)) continue;
    const sample=serviceRows.find(x=>x.serviceCode===code);
    const amount=sample?num(sample.debit)-num(sample.credit):0;
    if(amount<=0) continue;
    const lr=doc(orgCollection('ledger'));
    ops.push(b=>b.set(lr,{subscriberId:subscriber.id,periodId:latest.id,transactionType:'SERVICE',serviceCode:code,debit:amount,credit:0,description:code==='GUARD'?'خدمة الحارس':'تأمين الغاطس',createdAt:now,createdBy:state.user.uid}));
  }
  if(Number(subscriber.defaultPumpInsurance||0)>0 && !serviceRows.some(x=>sameId(x.subscriberId,subscriber.id)&&x.serviceCode==='PUMP_INSURANCE')){
    const amount=num(subscriber.defaultPumpInsurance);
    const lr=doc(orgCollection('ledger'));
    ops.push(b=>b.set(lr,{subscriberId:subscriber.id,periodId:latest.id,transactionType:'SERVICE',serviceCode:'PUMP_INSURANCE',debit:amount,credit:0,description:'تأمين الغاطس',createdAt:now,createdBy:state.user.uid}));
  }
  if(!ops.length) return;
  await commitOps(ops);
  state.loaded=false;await loadData(true);
}
function showSubscriberForm(id){
  if(!can('admin','manager','accountant')){toast('لا تملك صلاحية إدارة السكان','error');return;}
  const s=id?(state.data.subscribers||[]).find(x=>sameId(x.id,id)):null;
  const u=s?unitForSub(s):null;
  const currentBuilding=u?findBuildingRef(u.buildingId):null;
  openModal(`<h2>${s?'تعديل بيانات الساكن':'إضافة ساكن جديد'}</h2>
    <p class="modal-lead">اختر البناية أولًا ثم ستظهر وحداتها فقط. بعد الحفظ يُنشأ/يُصلح عداد المياه وتُزامَن الخدمات المستحقة للسكان.</p>
    <div class="form-grid">
      <div class="field"><label>الاسم</label><input id="fName" value="${safe(s?.name||'')}"></div>
      <div class="field"><label>الكود</label><input id="fCode" value="${safe(s?.code||'')}"></div>
      <div class="field"><label>النوع</label><select id="fType"><option value="داخلي" ${s?.type!=='خارجي'?'selected':''}>ساكن داخلي</option><option value="خارجي" ${s?.type==='خارجي'?'selected':''}>مستهلك خارجي</option></select></div>
      <div class="field"><label>الهاتف</label><input id="fPhone" value="${safe(s?.phone||'')}"></div>
      <div class="field"><label>البناية</label><select id="fBuilding"><option value="">${s?.type==='خارجي'?'غير مرتبط ببناية':'اختر البناية'}</option>${(state.data.buildings||[]).map(b=>`<option value="${b.id}" ${currentBuilding&&sameId(currentBuilding.id,b.id)?'selected':''}>${safe(b.name)}</option>`).join('')}</select></div>
      <div class="field"><label>الوحدة</label><select id="fUnit"><option value="">${s?.type==='خارجي'?'خارجي / بدون وحدة':'اختر البناية أولًا'}</option></select></div>
      <div class="field full"><label>ملاحظات</label><textarea id="fNotes">${safe(s?.notes||'')}</textarea></div>
    </div>
    <div class="actions"><button class="btn primary" id="saveSub">حفظ</button><button class="btn ghost" id="cancelSub">إلغاء</button></div>`);
  const fillUnits=()=>{
    const type=$('#fType').value,buildingId=$('#fBuilding').value;
    const unitSelect=$('#fUnit');
    if(type==='خارجي'){unitSelect.innerHTML='<option value="">خارجي / بدون وحدة</option>';unitSelect.value='';return;}
    const units=(state.data.units||[]).filter(x=>sameId(x.buildingId,buildingId)).sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));
    unitSelect.innerHTML=`<option value="">اختر الوحدة</option>${units.map(x=>`<option value="${x.id}" ${u&&sameId(u.id,x.id)?'selected':''}>${safe(x.code)}</option>`).join('')}`;
    if(u&&!units.some(x=>sameId(x.id,u.id))) unitSelect.value='';
  };
  $('#fBuilding').onchange=fillUnits;
  $('#fType').onchange=()=>{
    const external=$('#fType').value==='خارجي';
    $('#fBuilding').disabled=external;
    $('#fUnit').disabled=external;
    if(external){$('#fBuilding').value='';$('#fUnit').value='';}
    fillUnits();
  };
  $('#fType').onchange(); fillUnits();
  $('#cancelSub').onclick=closeModal;
  $('#saveSub').onclick=async()=>{
    const name=$('#fName').value.trim(),code=$('#fCode').value.trim(),type=$('#fType').value,buildingId=$('#fBuilding').value||null,unitId=$('#fUnit').value||null;
    if(!name||!code){toast('اكتب الاسم والكود','error');return;}
    if((state.data.subscribers||[]).some(x=>String(x.code||'')===code&&x.id!==id)){toast('الكود مستخدم بالفعل','error');return;}
    if(type!=='خارجي'){
      if(!buildingId){toast('اختر البناية أولًا','error');return;}
      const unit=(state.data.units||[]).find(x=>sameId(x.id,unitId));
      if(!unit||!sameId(unit.buildingId,buildingId)){toast('الوحدة لا تتبع البناية المختارة. اختر الوحدة من قائمة البناية نفسها.','error');return;}
      if((state.data.subscribers||[]).some(x=>x.active!==false&&x.type!=='خارجي'&&sameId(x.unitId,unitId)&&x.id!==id)){toast('هذه الوحدة مرتبطة بساكن آخر بالفعل','error');return;}
    }
    const data={name,code,type,phone:$('#fPhone').value.trim(),buildingId:type==='خارجي'?null:buildingId,unitId:type==='خارجي'?null:unitId,notes:$('#fNotes').value.trim(),active:true};
    if(s){
      await updateDoc(orgDoc('subscribers',id),{...data,updatedAt:serverTimestamp(),updatedBy:state.user.uid});
      let meter=(state.data.meters||[]).find(m=>sameId(m.subscriberId,id));
      if(meter) await updateDoc(orgDoc('meters',meter.id),{unitId:data.unitId,updatedAt:serverTimestamp(),updatedBy:state.user.uid});
      else if(type!=='خارجي'){
        const mr=doc(orgCollection('meters'));
        await fsSetDoc(mr,{meterCode:`W-${code}`,meterType:'مياه',subscriberId:id,unitId:data.unitId,active:true,createdAt:serverTimestamp(),createdBy:state.user.uid});
      }
      upsertLocal('subscribers',{id,...data});
      toast('تم تعديل بيانات الساكن وربطه بالبناية والوحدة');
    }else{
      const sr=doc(orgCollection('subscribers'));
      const mr=type==='خارجي'?null:doc(orgCollection('meters'));
      const batch=writeBatch(db);
      batch.set(sr,{...data,createdAt:serverTimestamp(),createdBy:state.user.uid});
      if(mr) batch.set(mr,{meterCode:`W-${code}`,meterType:'مياه',subscriberId:sr.id,unitId:data.unitId,active:true,createdAt:serverTimestamp(),createdBy:state.user.uid});
      await batch.commit();
      upsertLocal('subscribers',{id:sr.id,...data});
      if(mr) upsertLocal('meters',{id:mr.id,meterCode:`W-${code}`,meterType:'مياه',subscriberId:sr.id,unitId:data.unitId,active:true});
      if(mr) await syncNewResidentServices({...data,id:sr.id},{id:mr.id,meterCode:`W-${code}`,meterType:'مياه',subscriberId:sr.id,unitId:data.unitId,active:true});
      toast(type==='خارجي'?'تمت إضافة المستهلك الخارجي':'تمت إضافة الساكن وربطه بكل خدماته الأساسية');
    }
    closeModal();state.loaded=false;await loadData(true);renderSubscribers();
  };
}
async function archiveOrDelete(id){return deleteSubscriber(id);}

function renderPayments(){
  setTitle('الدفعات والأرصدة','الدفعة تبقى مرتبطة بالفترة التي سجلتها. في الأسبوع الجديد لا تظهر كدفعة جديدة؛ الذي ينتقل فقط هو نتيجة الحساب السابقة.');const pays=[...(state.data.payments||[])].sort((a,b)=>String(b.paymentDate||'').localeCompare(String(a.paymentDate||'')));const subs=(state.data.subscribers||[]).filter(s=>s.active!==false);
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>الدفعات</h2></div><div class="panel-actions"><button class="btn soft" id="exportPayments">↓ Excel</button><button class="btn primary" id="newPay">+ تسجيل دفعة</button></div></div><div class="toolbar"><input id="paySearch" class="search" placeholder="ابحث باسم الساكن أو رقم الإيصال…"></div><div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>الساكن</th><th>المبلغ</th><th>الطريقة</th><th>الإيصال</th><th>إجراءات</th></tr></thead><tbody id="payBody">${paymentRows(pays)}</tbody></table></div></section>`;
  $('#newPay').onclick=()=>showPaymentForm();$('#exportPayments').onclick=()=>exportPayments(pays);$('#paySearch').oninput=e=>$('#payBody').innerHTML=paymentRows(pays.filter(p=>{const s=(state.data.subscribers||[]).find(x=>x.id===p.subscriberId);return [s?.name,p.receiptNumber].some(v=>String(v||'').includes(e.target.value))}));$$('[data-delete-payment]').forEach(b=>b.onclick=()=>deletePayment(b.dataset.deletePayment));$$('[data-edit-payment]').forEach(b=>b.onclick=()=>showPaymentForm(b.dataset.editPayment));
}
function paymentRows(pays){if(!pays.length)return `<tr><td colspan="6">${empty('لا توجد دفعات','سجّل أول دفعة من الزر أعلاه.')}</td></tr>`;return pays.map(p=>{const s=(state.data.subscribers||[]).find(x=>x.id===p.subscriberId);return `<tr><td>${fmtDate(p.paymentDate)}</td><td><button class="link" data-account="${p.subscriberId}">${safe(s?.name||'—')}</button></td><td class="strong">${money(p.amount)}</td><td>${safe(p.method||'—')}</td><td>${safe(p.receiptNumber||'—')}</td><td>${can('admin','manager','accountant')?`<div class="row-actions"><button class="mini" data-edit-payment="${p.id}">تعديل</button><button class="mini red" data-delete-payment="${p.id}">حذف</button></div>`:''}</td></tr>`}).join('');}
function showPaymentForm(id=null){
  const subs=(state.data.subscribers||[]).filter(s=>s.active!==false).sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));
  const periods=latestPeriods();
  const existing=id?(state.data.payments||[]).find(x=>x.id===id):null;
  if(id&&!existing){toast('الدفعة غير موجودة','error');return;}
  openModal(`<h2>${existing?'تعديل دفعة':'تسجيل دفعة'}</h2><p class="modal-lead">الدفعة مرتبطة بالفترة المختارة فقط، ولا تتكرر في الأسابيع التالية.</p>
  <div class="form-grid">
  <div class="field full"><label>الساكن</label><select id="paySub"><option value="">اختر الساكن</option>${subs.map(s=>`<option value="${s.id}" ${s.id===existing?.subscriberId?'selected':''}>${safe(s.code)} — ${safe(s.name)}</option>`).join('')}</select></div>
  <div class="field"><label>الأسبوع</label><select id="payPeriod"><option value="">دفعة عامة / تحت الحساب</option>${periods.map(p=>`<option value="${p.id}" ${p.id===existing?.periodId?'selected':''}>${safe(p.label)} — ${fmtDate(p.startDate)}</option>`).join('')}</select></div>
  <div class="field"><label>المبلغ</label><input id="payAmount" type="number" min="0" step="0.01" value="${existing?.amount??''}"></div>
  <div class="field"><label>التاريخ</label><input id="payDate" type="date" value="${safe(existing?.paymentDate||dateNow())}"></div>
  <div class="field"><label>طريقة الدفع</label><select id="payMethod"><option ${existing?.method==='نقدي'?'selected':''}>نقدي</option><option ${existing?.method==='تحويل بنكي'?'selected':''}>تحويل بنكي</option><option ${existing?.method==='أخرى'?'selected':''}>أخرى</option></select></div>
  <div class="field"><label>رقم الإيصال</label><input id="payReceipt" value="${safe(existing?.receiptNumber||'')}" placeholder="اختياري"></div>
  <div class="field full"><label>ملاحظة</label><textarea id="payNote">${safe(existing?.note||'')}</textarea></div>
  </div><div class="actions"><button class="btn primary" id="savePay">${existing?'حفظ التعديل':'حفظ الدفعة'}</button><button class="btn ghost" id="cancelPay">إلغاء</button></div>`);
  $('#cancelPay').onclick=closeModal;
  $('#savePay').onclick=async()=>{
    const subscriberId=$('#paySub').value,amount=num($('#payAmount').value),periodId=$('#payPeriod').value||null,paymentDate=$('#payDate').value;
    if(!subscriberId||amount<=0||!paymentDate){toast('أكمل الساكن والمبلغ والتاريخ','error');return;}
    if(periodId){const p=periodById(periodId);if(p&&!(paymentDate>=String(p.startDate)&&paymentDate<=String(p.endDate))){toast('تاريخ الدفعة خارج الأسبوع المختار.','error');return;}}
    if(existing){
      await updateDoc(orgDoc('payments',id),{subscriberId,periodId,amount,paymentDate,method:$('#payMethod').value,receiptNumber:$('#payReceipt').value.trim(),note:$('#payNote').value.trim(),updatedBy:state.user.uid,updatedAt:serverTimestamp()});
      const led=(state.data.ledger||[]).find(x=>x.referenceId===id&&x.transactionType==='PAYMENT');
      if(led) await updateDoc(orgDoc('ledger',led.id),{subscriberId,periodId,credit:amount,debit:0,paymentDate,description:'دفعة',updatedAt:serverTimestamp(),updatedBy:state.user.uid});
      else {const lr=doc(orgCollection('ledger'));await fsSetDoc(lr,{subscriberId,periodId,transactionType:'PAYMENT',credit:amount,debit:0,description:'دفعة',referenceId:id,paymentDate,createdAt:serverTimestamp(),createdBy:state.user.uid});}
    }else{
      const ref=doc(orgCollection('payments')),lr=doc(orgCollection('ledger'));const batch=writeBatch(db);
      batch.set(ref,{subscriberId,periodId,amount,paymentDate,method:$('#payMethod').value,receiptNumber:$('#payReceipt').value.trim(),note:$('#payNote').value.trim(),createdBy:state.user.uid,createdAt:serverTimestamp()});
      batch.set(lr,{subscriberId,periodId,transactionType:'PAYMENT',credit:amount,debit:0,description:'دفعة',referenceId:ref.id,paymentDate,createdAt:serverTimestamp(),createdBy:state.user.uid});
      await batch.commit();
    }
    closeModal();state.loaded=false;await loadData(true);toast(existing?'تم تعديل الدفعة':'تم تسجيل الدفعة');renderPayments();
  };
}
function showServiceForm(pid){
  if(!can('admin','manager','accountant')){toast('الخدمات مخصصة للإدارة والمحاسبة','error');return;}
  const active=(state.data.subscribers||[]).filter(s=>s.active!==false&&s.type!=='خارجي');
  openModal(`<h2>تأمين الغاطس</h2><p class="modal-lead">خدمة الحارس لها صفحة مستقلة. من هنا نضيف تأمين الغاطس فقط لهذا الأسبوع.</p><div class="section-note"></div><div class="table-wrap"><table class="table"><thead><tr><th>الكود</th><th>الساكن</th><th>تأمين الغاطس</th></tr></thead><tbody>${active.map(s=>`<tr><td>${safe(s.code)}</td><td>${safe(s.name)}</td><td>${money(s.defaultPumpInsurance||0)}</td></tr>`).join('')}</tbody></table></div><div class="actions"><button class="btn primary" id="applyServices">إضافة التأمين غير المضاف</button><button class="btn danger" id="deleteServices">حذف تأمين الغاطس لهذا الأسبوع</button><button class="btn ghost" id="cancelServices">إلغاء</button></div>`);
  $('#cancelServices').onclick=closeModal;
  $('#applyServices').onclick=async()=>{const ops=[];let count=0;for(const s of active){if(num(s.defaultPumpInsurance)>0 && !(state.data.ledger||[]).some(x=>x.periodId===pid&&x.subscriberId===s.id&&x.transactionType==='SERVICE'&&x.serviceCode==='PUMP_INSURANCE')){const lr=doc(orgCollection('ledger'));ops.push(b=>b.set(lr,{subscriberId:s.id,periodId:pid,transactionType:'SERVICE',serviceCode:'PUMP_INSURANCE',debit:num(s.defaultPumpInsurance),credit:0,description:'تأمين الغاطس',createdAt:serverTimestamp(),createdBy:state.user.uid}));count++;}}await commitOps(ops);state.loaded=false;await loadData(true);closeModal();toast(`تمت إضافة ${count} رسوم تأمين`);renderPeriods();};
  $('#deleteServices').onclick=()=>deletePumpInsuranceServices(pid);
}
async function deletePumpInsuranceServices(pid){
  if(!can('admin','manager')){toast('الحذف مخصص للمديرين','error');return;}
  const rows=(state.data.ledger||[]).filter(x=>x.periodId===pid&&x.transactionType==='SERVICE'&&x.serviceCode==='PUMP_INSURANCE');
  if(!rows.length){toast('لا توجد رسوم تأمين لحذفها');return;}
  if(!confirm(`حذف ${rows.length} حركة تأمين غاطس لهذا الأسبوع؟`))return;
  await commitOps(rows.map(r=>b=>b.delete(orgDoc('ledger',r.id))));state.loaded=false;await loadData(true);toast('تم حذف رسوم تأمين الغاطس');renderPeriods();
}

function renderGuard(){
  setTitle('خدمة الحارس','ضع مبلغ الحارس على الشخص الواحد، واستثنِ أي سكان لا يدفعون خدمة الحارس.');
  if(!can('admin','manager','accountant','viewer')){$('#app').innerHTML=`<section class="panel">${empty('هذه الصفحة للإدارة','خدمة الحارس مخصصة للإدارة والمحاسبة.')}</section>`;return;}
  const periods=latestPeriods();if(!state.periodId)state.periodId=periods[0]?.id;const p=selectedPeriod();
  if(!p){$('#app').innerHTML=`<section class="panel">${empty('لا يوجد أسبوع','افتح أسبوعًا أولًا.')}</section>`;return;}
  const residents=(state.data.subscribers||[]).filter(s=>s.active!==false&&s.type!=='خارجي').sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));
  const guardEligible=isGuardChargePeriod(p.id);
  const guardRows=(state.data.ledger||[]).filter(x=>x.periodId===p.id&&x.transactionType==='SERVICE'&&x.serviceCode==='GUARD');
  const appliedByResident=new Map(guardRows.map(x=>[x.subscriberId,num(x.debit)-num(x.credit)]));
  const amountDefault=guardRows.length?([...appliedByResident.values()][0]||0):0;
  const excluded=new Set(residents.filter(s=>!appliedByResident.has(s.id)).map(s=>s.id));
  const checkedCount=residents.length-excluded.size;
  const totalExisting=guardRows.reduce((a,x)=>a+num(x.debit)-num(x.credit),0);
  $('#app').innerHTML=`<section class="panel">
    <div class="panel-head"><div><h2>خدمة الحارس</h2></div><button class="btn ghost" id="guardDeleteWeek">حذف خدمات الحارس لهذا الأسبوع</button></div>
    <div class="period-picker"><label>الأسبوع</label><select id="guardPeriod" class="period-select">${periods.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${safe(x.label||'أسبوع')} — ${fmtDate(x.startDate)} إلى ${fmtDate(x.endDate)}</option>`).join('')}</select></div>
    <div class="money-grid">
      <div class="money-card"><small>المبلغ على الشخص الواحد</small><b id="guardEach">${money(amountDefault)}</b></div>
      <div class="money-card"><small>عدد المشمولين</small><b id="guardCount">${checkedCount}</b></div>
      <div class="money-card"><small>إجمالي الحارس</small><b id="guardTotal">${money(totalExisting)}</b></div>
    </div>
    <div class="form-grid" style="margin-top:14px"><div class="field"><label>المبلغ على الشخص الواحد</label><input id="guardAmount" type="number" min="0" step="0.01" value="${amountDefault||''}" placeholder="مثال 30" ${guardEligible?'':'disabled'}></div></div>
    <div class="section-note"><b>لا يدفع خدمة الحارس:</b> علّم الأشخاص الذين لا تشملهم الخدمة. مثلًا الحواصل أو أي ساكن آخر حسب قرار الإدارة.</div>
    <div class="table-wrap" style="margin-top:13px"><table class="table"><thead><tr><th style="width:70px">يدفع؟</th><th>الكود</th><th>الساكن</th><th>المبلغ</th></tr></thead><tbody id="guardBody">${residents.map(s=>{const on=!excluded.has(s.id);return `<tr><td><input type="checkbox" class="guardInclude" data-sid="${s.id}" ${on?'checked':''} ${guardEligible?'':'disabled'}></td><td><span class="code">${safe(s.code)}</span></td><td>${safe(s.name)}</td><td class="guardRowAmount">${on?money(amountDefault):money(0)}</td></tr>`}).join('')}</tbody></table></div>
    <div class="actions"><button class="btn primary" id="saveGuard" ${guardEligible?'':'disabled'}>حفظ خدمة الحارس</button><button class="btn ghost" id="guardReset">إلغاء الاختيارات</button></div>
  </section>`;
  const recalc=()=>{const amt=num($('#guardAmount').value);const included=$$('.guardInclude').filter(x=>x.checked);$('#guardEach').textContent=money(amt);$('#guardCount').textContent=String(included.length);$('#guardTotal').textContent=money(amt*included.length);$$('.guardInclude').forEach(x=>{x.closest('tr').querySelector('.guardRowAmount').textContent=x.checked?money(amt):money(0);});};
  $('#guardPeriod').onchange=e=>navigate('guard',e.target.value);
  $('#guardAmount').oninput=recalc;$$('.guardInclude').forEach(x=>x.addEventListener('change',recalc));recalc();
  $('#guardReset').onclick=()=>{$$('.guardInclude').forEach(x=>x.checked=true);recalc();};
  $('#guardDeleteWeek').onclick=()=>deleteGuardServices(p.id);
  $('#saveGuard').onclick=async()=>{
    if(!guardEligible){toast('خدمة الحارس تُضاف في أول أسبوع فقط من كل شهر.','error');return;}
    const amt=num($('#guardAmount').value);const included=$$('.guardInclude').filter(x=>x.checked).map(x=>x.dataset.sid);
    if(amt<0){toast('المبلغ غير صحيح','error');return;}
    if(!included.length&&amt>0){toast('اختر سكانًا لتوزيع الخدمة','error');return;}
    if(guardRows.length && !confirm('خدمة الحارس موجودة مسبقًا لهذا الأسبوع. سيتم حذفها وإعادة إنشائها حسب الاختيارات الجديدة. هل تريد المتابعة؟'))return;
    const ops=[];for(const row of guardRows)ops.push(b=>b.delete(orgDoc('ledger',row.id)));
    for(const sid of included){const lr=doc(orgCollection('ledger'));ops.push(b=>b.set(lr,{subscriberId:sid,periodId:p.id,transactionType:'SERVICE',serviceCode:'GUARD',debit:amt,credit:0,description:'خدمة الحارس',createdAt:serverTimestamp(),createdBy:state.user.uid}));}
    await commitOps(ops);state.loaded=false;await loadData(true);toast(`تم حفظ خدمة الحارس: ${included.length} × ${money(amt)}`);renderGuard();
  };
}
async function deleteGuardServices(pid){
  if(!can('admin','manager')){toast('الحذف مخصص للمديرين','error');return;}
  const rows=(state.data.ledger||[]).filter(x=>x.periodId===pid&&x.transactionType==='SERVICE'&&x.serviceCode==='GUARD');
  if(!rows.length){toast('لا توجد خدمة حارس لهذا الأسبوع');return;}
  if(!confirm(`حذف خدمة الحارس عن ${rows.length} ساكن لهذا الأسبوع؟`))return;
  await commitOps(rows.map(r=>b=>b.delete(orgDoc('ledger',r.id))));state.loaded=false;await loadData(true);toast('تم حذف خدمة الحارس');renderGuard();
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
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>الديون السابقة</h2></div><button class="btn primary" id="addDebt">+ إضافة دين</button></div><div class="money-grid"><div class="money-card"><small>إجمالي الديون</small><b>${money(debts.reduce((a,d)=>a+num(d.amount),0))}</b></div><div class="money-card"><small>المتبقي</small><b>${money(debts.reduce((a,d)=>a+Math.max(0,num(d.amount)-num(d.paidAmount)),0))}</b></div></div><div class="table-wrap" style="margin-top:13px"><table class="table"><thead><tr><th>التاريخ</th><th>الساكن</th><th>البيان</th><th>الدين</th><th>المسدد</th><th>المتبقي</th><th>إجراءات</th></tr></thead><tbody>${debts.length?debts.map(d=>{const su=subs.find(x=>x.id===d.subscriberId);return `<tr><td>${fmtDate(d.date)}</td><td>${safe(su?.name||'—')}</td><td>${safe(d.description||'—')}</td><td>${money(d.amount)}</td><td>${money(d.paidAmount||0)}</td><td class="strong">${money(Math.max(0,num(d.amount)-num(d.paidAmount)))}</td><td><div class="row-actions"><button class="mini" data-edit-debt="${d.id}">تعديل</button>${can('admin','manager','accountant')?`<button class="mini red" data-delete-debt="${d.id}">حذف</button>`:''}</div></td></tr>`}).join(''):`<tr><td colspan="7">${empty('لا توجد ديون مسجلة','يمكن تسجيل المتأخرات القديمة هنا.')}</td></tr>`}</tbody></table></div></section>`;
  $('#addDebt').onclick=showDebtForm;$$('[data-edit-debt]').forEach(b=>b.onclick=()=>showDebtForm(b.dataset.editDebt));$$('[data-delete-debt]').forEach(b=>b.onclick=()=>deleteDebt(b.dataset.deleteDebt));
}
function showDebtForm(id){
  const subs=(state.data.subscribers||[]).filter(s=>s.active!==false).sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));
  const d=id?(state.data.debts||[]).find(x=>x.id===id):null;
  if(!can('admin','manager','accountant')){toast('لا تملك صلاحية تعديل الديون','error');return;}
  openModal(`<h2>${d?'تعديل الدين':'إضافة دين'}</h2><p class="modal-lead">هذا الدين السابق يُثبت في أول أسبوع بالنظام، ثم يترحل المتبقي تلقائيًا إلى الأسابيع التالية. إذا سدد الساكن، سجّل السداد من «الدفعات» فقط.</p>
  <div class="form-grid">
    <div class="field full"><label>الساكن</label><select id="dSub">${subs.map(s=>`<option value="${s.id}" ${s.id===d?.subscriberId?'selected':''}>${safe(s.code)} — ${safe(s.name)}</option>`).join('')}</select></div>
    <div class="field"><label>مبلغ الدين</label><input id="dAmount" type="number" min="0" step="0.01" value="${d?.amount??''}"></div>
    <div class="field"><label>تاريخ تسجيل الدين</label><input id="dDate" type="date" value="${safe(d?.date||dateNow())}"></div>
    <div class="field full"><label>البيان</label><input id="dDesc" value="${safe(d?.description||'دين سابق')}"></div>
  </div>
  <div class="actions"><button class="btn primary" id="saveDebt">حفظ</button><button class="btn ghost" id="cancelDebt">إلغاء</button></div>`);
  $('#cancelDebt').onclick=closeModal;
  $('#saveDebt').onclick=async()=>{
    const subscriberId=$('#dSub').value,amount=num($('#dAmount').value),first=firstSystemPeriod();
    if(!subscriberId||amount<=0){toast('اختر الساكن واكتب مبلغ الدين','error');return;}
    const data={
      subscriberId,
      amount,
      paidAmount:d?num(d.paidAmount||0):0,
      date:$('#dDate').value,
      description:$('#dDesc').value.trim()||'دين سابق',
      openingPeriodId:d?.openingPeriodId||first?.id||null,
      isOpeningDebt:true,
      updatedAt:serverTimestamp()
    };
    if(d){
      await updateDoc(orgDoc('debts',id),data);
      const led=(state.data.ledger||[]).find(x=>x.referenceId===id&&x.transactionType==='DEBT');
      if(led)await updateDoc(orgDoc('ledger',led.id),{subscriberId,periodId:data.openingPeriodId||null,debit:amount-num(data.paidAmount||0),credit:0,description:data.description,date:data.date,isOpeningDebt:true,updatedAt:serverTimestamp()});
      else{
        const lr=doc(orgCollection('ledger'));
        await fsSetDoc(lr,{subscriberId,periodId:data.openingPeriodId||null,transactionType:'DEBT',debit:amount-num(data.paidAmount||0),credit:0,description:data.description,referenceId:id,date:data.date,isOpeningDebt:true,createdAt:serverTimestamp(),createdBy:state.user.uid});
      }
    }else{
      const ref=doc(orgCollection('debts'));const lr=doc(orgCollection('ledger'));
      const batch=writeBatch(db);
      batch.set(ref,{...data,createdAt:serverTimestamp(),createdBy:state.user.uid});
      batch.set(lr,{subscriberId,periodId:data.openingPeriodId||null,transactionType:'DEBT',debit:amount,credit:0,description:data.description,referenceId:ref.id,date:data.date,isOpeningDebt:true,createdAt:serverTimestamp(),createdBy:state.user.uid});
      await batch.commit();
    }
    state.loaded=false;await loadData(true);closeModal();toast(d?'تم تعديل الدين':'تم تسجيل الدين');renderDebts();
  };
}


// =========================
// Reliable Excel exports
// =========================
function downloadCsvFallback(rows,file){
  const safeRows=rows.length?rows:[{}],head=Object.keys(safeRows[0]);
  const csv='\ufeff'+[head.join(','),...safeRows.map(r=>head.map(k=>`"${String(r[k]??'').replaceAll('"','""')}"`).join(','))].join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.replace(/\.xlsx$/i,'.csv');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('تم تنزيل ملف CSV قابل للفتح في Excel');
}
function excelCellStyle(isHeader=false,align='right'){
  return isHeader?{font:{name:'Arial',sz:11,bold:true,color:{rgb:'FFFFFFFF'}},fill:{fgColor:{rgb:'155E54'}},alignment:{horizontal:'center',vertical:'center',wrapText:true,readingOrder:2},border:{top:{style:'thin',color:{rgb:'D5E2DE'}},bottom:{style:'thin',color:{rgb:'D5E2DE'}},left:{style:'thin',color:{rgb:'D5E2DE'}},right:{style:'thin',color:{rgb:'D5E2DE'}}}}:{font:{name:'Arial',sz:10,color:{rgb:'183734'}},alignment:{horizontal:align,vertical:'center',wrapText:true,readingOrder:2},border:{top:{style:'thin',color:{rgb:'E0E7E4'}},bottom:{style:'thin',color:{rgb:'E0E7E4'}},left:{style:'thin',color:{rgb:'E0E7E4'}},right:{style:'thin',color:{rgb:'E0E7E4'}}}};
}
function exportXlsx(rows,sheet,file){
  const data=Array.isArray(rows)?rows:[];
  if(window.XLSX?.utils){
    try{
      const wb=window.XLSX.utils.book_new();wb.Props={Title:String(sheet||'تقرير'),Subject:'تقرير عمارة الأمين',Author:'عمارة الأمين'};wb.Workbook={Views:[{RTL:true}]};
      const headers=data.length?Object.keys(data[0]):['البيان'];
      const aoa=[headers,...data.map(r=>headers.map(k=>r[k]??''))];
      const ws=window.XLSX.utils.aoa_to_sheet(aoa);ws['!rtl']=true;ws['!freeze']={xSplit:0,ySplit:1};ws['!autofilter']={ref:window.XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(0,aoa.length-1),c:Math.max(0,headers.length-1)}})};
      ws['!cols']=headers.map(h=>({wch:Math.min(32,Math.max(12,String(h).length+5))}));ws['!rows']=[{hpt:24},...data.map(()=>({hpt:20}))];
      for(let r=0;r<aoa.length;r++)for(let c=0;c<headers.length;c++){const addr=window.XLSX.utils.encode_cell({r,c});const cell=ws[addr];if(cell)cell.s=excelCellStyle(r===0,r===0?'center':'right');}
      window.XLSX.utils.book_append_sheet(wb,ws,String(sheet||'تقرير').slice(0,31));window.XLSX.writeFile(wb,file);toast('تم تنزيل ملف Excel منسق');return;
    }catch(e){console.error('Excel export failed',e);}
  }
  downloadCsvFallback(data,file);
}
function subscriberExportRows(rows){return rows.filter(s=>s.active!==false).map(s=>{const u=unitForSub(s);return{الكود:s.code||'',الاسم:s.name||'',النوع:s.type||'',الهاتف:s.phone||'',البناية:u?buildingName(u.buildingId):'—',الوحدة:u?.code||'—',المديونية:subscriberRow(s).debt??0};});}
function exportSubscribers(rows){exportXlsx(subscriberExportRows(rows||state.data.subscribers||[]),'السكان','سكان_عمارة_الأمين.xlsx');}
function exportPayments(rows){exportXlsx((rows||[]).map(p=>({التاريخ:p.paymentDate||'',الأسبوع:periodById(p.periodId)?.label||'',الساكن:(state.data.subscribers||[]).find(s=>sameId(s.id,p.subscriberId))?.name||'—',المبلغ:p.amount??0,الطريقة:p.method||'',الإيصال:p.receiptNumber||'',الملاحظة:p.note||''})),'الدفعات','دفعات_عمارة_الأمين.xlsx');}
function exportPeriod(pid){const p=periodById(pid);const rows=readingsForPeriod(pid).map(r=>{const m=(state.data.meters||[]).find(x=>sameId(x.id,r.meterId));const ss=subscriberByMeter(m);const u=ss?unitForSub(ss):null;return{الكود:ss?.code||'',الاسم:ss?.name||'',البناية:u?buildingName(u.buildingId):'—',الوحدة:u?.code||'—',القراءة_السابقة:r.previousReading??'',القراءة_الحالية:r.currentReading??'',السحب:r.consumption??'',سعر_الكوب:r.unitPrice??p?.waterUnitPrice??'',قيمة_المياه:r.chargeAmount??''};});exportXlsx(rows,'قراءات الماء',`قراءات_الماء_${p?.startDate||pid}.xlsx`);}
function exportEnergy(pid){const rows=energyForPeriod(pid).map(r=>{const src=(state.data.sources||[]).find(s=>sameId(s.id,r.sourceId));const consumption=r.consumption??(r.currentReading!=null&&r.previousReading!=null?Math.max(0,num(r.currentReading)-num(r.previousReading)):null);return{الأسبوع:periodById(pid)?.label||'',المصدر:src?.name||'—',القراءة_السابقة:r.previousReading??'',القراءة_الحالية:r.currentReading??'',الاستهلاك:consumption??'',سعر_الكيلو:r.pricePerKwh??'',التكلفة:r.cost??(consumption!=null&&r.pricePerKwh!=null?consumption*num(r.pricePerKwh):'')};});exportXlsx(rows,'الكهرباء',`كهرباء_${periodById(pid)?.startDate||pid}.xlsx`);}
function exportBalances(rows){exportXlsx((rows||[]).filter(s=>s.type!=='خارجي'&&s.active!==false).map(s=>({الكود:s.code||'',الاسم:s.name||'',البناية:s.buildingName||unitForSub(s)&&buildingName(unitForSub(s).buildingId)||'—',الوحدة:s.unitCode||unitForSub(s)?.code||'—',المديونية:s.debt??s.balance??0})),'المديونيات','مديونيات_عمارة_الأمين.xlsx');}
function exportSummary(pid){const t=currentTotals(pid),p=t.period;const rows=[{البيان:'الأسبوع',القيمة:p?.label||''},{البيان:'من',القيمة:p?.startDate||''},{البيان:'إلى',القيمة:p?.endDate||''},{البيان:'إجمالي استهلاك المياه',القيمة:t.waterTotal},{البيان:'تكلفة الكهرباء',القيمة:t.energyCost},{البيان:'المصاريف الأساسية',القيمة:t.baseExpense},{البيان:'خصم من المصاريف',القيمة:t.expenseDiscount},{البيان:'خصم من الماء والكهرباء',القيمة:t.utilityDiscount},{البيان:'مساهمة للصندوق',القيمة:contributionTotal(pid,'fund_contribution')},{البيان:'صافي التكلفة',القيمة:t.netCost},{البيان:'السعر الخام للكوب',القيمة:t.rawPrice},{البيان:'السعر المعتمد للكوب',القيمة:t.appliedPrice}];for(const b of t.waterBreakdown.buildings)rows.push({البيان:`استهلاك ${b.name}`,القيمة:b.total});rows.push({البيان:'استهلاك الخارجي',القيمة:t.externalWater});exportXlsx(rows,'ملخص الحساب',`ملخص_الحساب_${p?.startDate||pid}.xlsx`);}

function renderReports(){
  setTitle('التقارير والتصدير','اختر الساكن والأسبوع. التقرير والرسالة يستخدمان نفس الحساب.');
  const periods=latestPeriods(),oldest=[...periods].sort((a,b)=>String(a.startDate).localeCompare(String(b.startDate))),subs=(state.data.subscribers||[]).filter(s=>s.active!==false).sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));
  const defaultWeek=state.periodId||periods[0]?.id||'';const oldestWeek=oldest[0]?.id||defaultWeek;const newestWeek=oldest[oldest.length-1]?.id||defaultWeek;
  $('#app').innerHTML=`<section class="report-hero"><div><span class="guide-badge">التقارير</span><h2>كشف حساب الساكن</h2><p>اختر الساكن وأسبوع الرسالة، وحدد نطاق الأسابيع الذي تريده في كشف PDF.</p></div><div class="report-mark">₪</div></section>
  <section class="report-card report-card-wide">
    <div class="report-icon">♙</div><h3>كشف الحساب والرسالة</h3>
    <div class="form-grid">
      <div class="field"><label>الساكن</label><select id="repResident"><option value="">اختر الساكن</option>${subs.map(s=>`<option value="${s.id}">${safe(s.code)} — ${safe(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label>أسبوع الرسالة والكشف</label><select id="repWeek"><option value="">اختر الأسبوع</option>${periods.map(p=>`<option value="${p.id}" ${p.id===defaultWeek?'selected':''}>${safe(p.label)} — ${fmtDate(p.startDate)} إلى ${fmtDate(p.endDate)}</option>`).join('')}</select></div>
      <div class="field"><label>من أسبوع للجدول/PDF</label><select id="repFrom"><option value="">الأقدم</option>${periods.map(p=>`<option value="${p.id}" ${p.id===oldestWeek?'selected':''}>${safe(p.label)} — ${fmtDate(p.startDate)}</option>`).join('')}</select></div>
      <div class="field"><label>إلى أسبوع للجدول/PDF</label><select id="repTo"><option value="">الأحدث</option>${periods.map(p=>`<option value="${p.id}" ${p.id===newestWeek?'selected':''}>${safe(p.label)} — ${fmtDate(p.startDate)}</option>`).join('')}</select></div>
    </div>
    <div class="actions"><button class="btn primary" id="showResidentReport">عرض الكشف</button><button class="btn soft" id="printResidentReport" disabled>طباعة الكشف</button><button class="btn soft" id="downloadResidentPdf" disabled>↓ تنزيل كشف PDF</button></div>
  </section>
  <section class="report-grid" style="margin-top:14px">
    <div class="report-card"><div class="report-icon">◫</div><h3>قراءات أسبوع</h3><p>القراءات السابقة والحالية والاستهلاك.</p><select id="repPeriod">${periods.map(p=>`<option value="${p.id}">${safe(p.label)} — ${fmtDate(p.startDate)}</option>`).join('')}</select><button class="btn primary" id="repRead">↓ تنزيل Excel</button></div>
    <div class="report-card"><div class="report-icon">ϟ</div><h3>كهرباء الأسبوع</h3><p>قراءات المولدات والتكلفة.</p><select id="repEnergy">${periods.map(p=>`<option value="${p.id}">${safe(p.label)} — ${fmtDate(p.startDate)}</option>`).join('')}</select><button class="btn primary" id="repEn">↓ تنزيل Excel</button></div>
    <div class="report-card"><div class="report-icon">₪</div><h3>الدفعات</h3><p>كل الدفعات المسجلة.</p><button class="btn primary" id="repPay">↓ تنزيل Excel</button></div>
    <div class="report-card"><div class="report-icon">▤</div><h3>المديونيات</h3><p>المديونية الحالية لكل ساكن.</p><button class="btn primary" id="repBal">↓ تنزيل Excel</button></div>
    <div class="report-card"><div class="report-icon">★</div><h3>ملخص الحساب</h3><p>التكلفة + الماء + سعر الكوب.</p><select id="repSummary">${periods.map(p=>`<option value="${p.id}">${safe(p.label)} — ${fmtDate(p.startDate)}</option>`).join('')}</select><button class="btn primary" id="repSum">↓ تنزيل Excel</button></div>
  </section><section id="resident-report-holder"></section>`;
  $('#repResident').onchange=()=>{$('#resident-report-holder').innerHTML='';$('#downloadResidentPdf').disabled=true;};
  $('#showResidentReport').onclick=()=>{
    const sid=$('#repResident').value,wid=$('#repWeek').value;if(!sid||!wid){toast('اختر الساكن والأسبوع','error');return;}
    const fromId=$('#repFrom').value||oldestWeek,toId=$('#repTo').value||newestWeek;
    renderResidentReportCard(sid,wid,fromId,toId);$('#downloadResidentPdf').disabled=false;$('#printResidentReport').disabled=false;
  };
  $('#downloadResidentPdf').onclick=()=>downloadResidentPdf($('#resident-report-card-data')?.dataset.subscriber,$('#resident-report-card-data')?.dataset.week,$('#resident-report-card-data')?.dataset.from,$('#resident-report-card-data')?.dataset.to);
  $('#printResidentReport').onclick=()=>printResidentReport();
  $('#repRead').onclick=()=>exportPeriod($('#repPeriod').value);$('#repEn').onclick=()=>exportEnergy($('#repEnergy').value);$('#repPay').onclick=()=>exportPayments(state.data.payments||[]);$('#repBal').onclick=()=>exportBalances((state.data.subscribers||[]).map(subscriberRow));$('#repSum').onclick=()=>exportSummary($('#repSummary').value);
}
function openingDebtsForPeriod(id,periodId){
  const first=firstSystemPeriod();
  return (state.data.debts||[]).filter(d=>{
    if(d.subscriberId!==id)return false;
    const remaining=Math.max(0,num(d.amount)-num(d.paidAmount));
    if(remaining<=0)return false;
    if(d.openingPeriodId)return d.openingPeriodId===periodId;
    return !!first && periodId===first.id;
  }).reduce((a,d)=>a+Math.max(0,num(d.amount)-num(d.paidAmount)),0);
}
function allPeriodsAscending(){
  return [...(state.data.periods||[])].sort((a,b)=>String(a.startDate).localeCompare(String(b.startDate)));
}
function paymentBucket(payment){
  if(payment.periodId)return payment.periodId;
  const dt=transactionDate(payment);if(!dt)return null;
  const periods=allPeriodsAscending();if(!periods.length)return null;
  if(dt<String(periods[0].startDate))return '__opening__';
  for(let i=0;i<periods.length;i++){
    const p=periods[i];
    if(dt>=String(p.startDate)&&dt<=String(p.endDate))return p.id;
    if(i<periods.length-1 && dt>String(p.endDate) && dt<String(periods[i+1].startDate))return periods[i+1].id;
  }
  return periods[periods.length-1].id;
}
function paymentsForWeek(id,p){
  return (state.data.payments||[]).filter(x=>x.subscriberId===id&&paymentBucket(x)===p.id).reduce((a,x)=>a+num(x.amount),0);
}
function openingCreditBeforeFirstPeriod(id){
  return (state.data.payments||[]).filter(x=>x.subscriberId===id&&paymentBucket(x)==='__opening__').reduce((a,x)=>a+num(x.amount),0);
}
function currentNonWaterCharges(id,p){
  const current=(state.data.ledger||[]).filter(x=>x.subscriberId===id&&x.periodId===p.id);
  return current.filter(x=>{
    if(['PAYMENT','WATER','DEBT'].includes(x.transactionType))return false;
    if(x.transactionType==='SERVICE'&&x.serviceCode==='GUARD')return false;
    return ['SERVICE','ALLOCATED_COST','ADJUSTMENT','OTHER'].includes(x.transactionType);
  }).reduce((a,x)=>a+num(x.debit)-num(x.credit),0);
}
function currentWaterCharge(id,p){
  const reading=(state.data.readings||[]).find(r=>r.periodId===p.id&&(state.data.meters||[]).some(m=>m.id===r.meterId&&m.subscriberId===id));
  const price=readingManualPrice(reading)??currentTotals(p.id).appliedPrice;
  const currentConsumption=reading?.currentReading!=null&&reading?.previousReading!=null?Math.max(0,num(reading.currentReading)-num(reading.previousReading))/1000:0;
  return {reading,price,currentConsumption,currentWater:currentConsumption*num(price)};
}
function guardChargeForPeriod(id,p){
  if(!isGuardChargePeriod(p.id))return 0;
  return (state.data.ledger||[]).filter(x=>x.subscriberId===id&&x.periodId===p.id&&x.transactionType==='SERVICE'&&x.serviceCode==='GUARD')
    .reduce((a,x)=>a+num(x.debit)-num(x.credit),0);
}
function subscriberFinancialSeries(id){
  const s=(state.data.subscribers||[]).find(x=>x.id===id);if(!s)return [];
  const periods=allPeriodsAscending();
  let runningSigned=openingCreditBeforeFirstPeriod(id)*-1;
  return periods.map(p=>{
    const carryFromPrevious=runningSigned;
    const priorDebt=Math.max(0,carryFromPrevious);
    const priorCredit=Math.max(0,-carryFromPrevious);
    const explicitOpeningDebt=openingDebtsForPeriod(id,p.id);
    const water=currentWaterCharge(id,p);
    const guard=guardChargeForPeriod(id,p);
    const other=currentNonWaterCharges(id,p);
    const periodPayments=paymentsForWeek(id,p);
    const currentCharges=water.currentWater+guard+other;
    const previousCarry=carryFromPrevious+explicitOpeningDebt;
    const before=previousCarry+currentCharges;
    const signedAfter=before-periodPayments;
    const finalBalance=signedAfter;
    const result={
      s,p,previousBalance:carryFromPrevious,previousDebt:previousCarry,previousCredit:Math.max(0,-previousCarry),explicitOpeningDebt,
      currentConsumption:water.currentConsumption,currentWater:water.currentWater,guard,services:guard,other,
      periodPayments,
      totalPaymentsAll:(state.data.payments||[]).filter(x=>x.subscriberId===id).reduce((a,x)=>a+num(x.amount),0),
      finalBeforePayments:before,finalBalance,creditCarry:Math.max(0,-finalBalance),appliedPrice:water.price||0,
      carrySigned:finalBalance
    };
    runningSigned=finalBalance;
    return result;
  });
}
function subscriberFinancialSummary(id,periodId=null){
  const p=periodId?periodById(periodId):selectedPeriod();
  const series=subscriberFinancialSeries(id);
  if(!series.length){
    const s=(state.data.subscribers||[]).find(x=>x.id===id);const b=balanceOf(id);
    return {s,p,previousBalance:b,previousDebt:b,previousCredit:Math.max(0,-b),currentConsumption:0,currentWater:0,guard:0,services:0,other:0,periodPayments:0,totalPaymentsAll:0,finalBeforePayments:b,finalBalance:b,creditCarry:Math.max(0,-b),appliedPrice:0};
  }
  return series.find(x=>x.p.id===p?.id)||series[series.length-1];
}
function messageForResident(sum){
  const end=sum.p?.endDate||dateNow(),dayName=new Date(end+'T12:00:00').toLocaleDateString('ar-PS',{weekday:'long'}),day=`${dayName} ${fmtDate(end)}`;
  return `السلام عليكم ${sum.s.name||'الساكن'}\nتفاصيل حساب عمارة الأمين حتى يوم ${day}\nسحب المياه هذا الأسبوع : ${fmt(sum.currentConsumption,3)} كوب\nقيمة مياه الأسبوع : ${msgMoney(sum.currentWater)}\nخدمات الحارس : ${msgMoney(sum.guard)}\nمصاريف أخرى : ${msgMoney(sum.other)}\nالديون السابقة : ${msgMoney(sum.previousDebt)}\nالإجمالي قبل الدفعات : ${msgMoney(sum.finalBeforePayments)}\nالدفعات المسجلة : ${msgMoney(sum.periodPayments)}\nالإجمالي المطلوب : ${msgMoney(sum.finalBalance)}\nوشكرا لتعاونكم`;
}
function residentReportPeriods(fromId,toId){
  const all=latestPeriods();if(!all.length)return [];
  const from=fromId?periodById(fromId):all[0],to=toId?periodById(toId):all[all.length-1];if(!from||!to)return all;
  const min=String(from.startDate)<=String(to.startDate)?from.startDate:to.startDate,max=String(from.startDate)<=String(to.startDate)?to.startDate:from.startDate;
  return all.filter(p=>String(p.startDate)>=String(min)&&String(p.startDate)<=String(max)).sort((a,b)=>String(a.startDate).localeCompare(String(b.startDate)));
}
function renderResidentReportCard(id,weekId,fromId,toId){
  const holder=$('#resident-report-holder'),sum=subscriberFinancialSummary(id,weekId);if(!holder||!sum)return;
  const info=subscriberRow(sum.s),periods=residentReportPeriods(fromId,toId);
  const rows=periods.map(p=>{const x=subscriberFinancialSummary(id,p.id);return `<tr>
    <td><b>${safe(p.label||'أسبوع')}</b><br><small>${fmtDate(p.startDate)} → ${fmtDate(p.endDate)}</small></td>
    <td>${fmt(x.currentConsumption,3)} كوب</td><td>${money(Math.round(num(x.currentWater)))}</td>
    <td>${money(x.guard)}</td><td>${money(x.other)}</td><td>${money(x.previousDebt)}</td>
    <td>${money(x.finalBeforePayments)}</td><td>${money(x.periodPayments)}</td><td class="strong">${money(x.finalBalance)}</td>
  </tr>`;}).join('');
  holder.innerHTML=`<section class="resident-report-card" id="resident-report-card-data" data-subscriber="${safe(id)}" data-week="${safe(weekId)}" data-from="${safe(fromId||'')}" data-to="${safe(toId||'')}">
    <div class="resident-report-head"><div><span class="code">${safe(sum.s.code)}</span><h2>${safe(sum.s.name)}</h2><p>${safe(info.buildingName)} · ${safe(info.unitCode)} · ${safe(sum.s.phone||'بدون هاتف')}</p></div><div class="balance-box"><span>المديونية</span><b>${money(sum.finalBalance)}</b></div></div>
    <div class="resident-message"><div class="message-head"><div><h3>الرسالة الجاهزة للساكن</h3><p>المعلومات مبنية على الأسبوع المحدد.</p></div><button class="btn primary" id="copyResidentMessage">نسخ النص</button></div><textarea id="residentMessageText" readonly>${safe(messageForResident(sum))}</textarea></div>
    <div class="account-section"><div class="section-head-inline"><div><h3>كشف الحساب الأسبوعي</h3><p>كل صف أسبوع مستقل ونفس البنود الموجودة في الرسالة.</p></div><span class="muted">${periods.length} أسبوع</span></div>
      <div class="table-wrap resident-ledger-table"><table class="table" style="min-width:1250px"><thead><tr><th>الأسبوع</th><th>سحب المياه</th><th>قيمة المياه</th><th>خدمة الحارس</th><th>مصاريف أخرى</th><th>الديون السابقة</th><th>الإجمالي قبل الدفعات</th><th>الدفعات</th><th>الإجمالي المطلوب</th></tr></thead><tbody>${rows||`<tr><td colspan="9">${empty('لا توجد أسابيع ضمن النطاق','')}</td></tr>`}</tbody></table></div>
    </div>
  </section>`;
  $('#copyResidentMessage').onclick=async()=>{const txt=$('#residentMessageText').value;try{await navigator.clipboard.writeText(txt);toast('تم نسخ الرسالة');}catch{const ta=$('#residentMessageText');ta.select();document.execCommand('copy');toast('تم نسخ الرسالة');}};
}
function residentPrintHtml(source,titleText='كشف حساب'){
  const table=source?.querySelector('.resident-ledger-table');
  if(!table)return null;
  const title=source.querySelector('.resident-report-head');
  const tableClone=table.cloneNode(true);
  const innerTable=tableClone.querySelector('table');
  if(innerTable){innerTable.style.minWidth='0';innerTable.style.maxWidth='281mm';innerTable.style.width='281mm';}
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${safe(titleText)}</title><style>
  *{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#183734;font-family:Arial,"Cairo",sans-serif;direction:rtl;width:281mm;max-width:281mm}body{min-height:194mm}.resident-report-head{margin:0 0 8px}.resident-report-head h2{margin:0 0 4px;font-size:18px}.resident-report-head p{margin:0;color:#5f6c67;font-size:10px}.balance-box{padding:8px;background:#eef6f3;border-radius:8px;display:inline-block;margin-top:6px}.balance-box span{display:block;font-size:7px;color:#6c7a76}.balance-box b{font-size:15px}.resident-report-card{width:281mm;max-width:281mm}.resident-ledger-table{width:281mm;max-width:281mm;overflow:visible!important}.table{width:281mm!important;max-width:281mm!important;min-width:0!important;border-collapse:collapse;table-layout:fixed;font-size:6.8px;direction:rtl}.table th,.table td{border:1px solid #cdd9d6;padding:3.5px 3px;text-align:center;vertical-align:middle;white-space:normal!important;word-break:break-word;overflow-wrap:anywhere;line-height:1.25}.table th{background:#edf5f2;font-weight:800}.table td:first-child{text-align:right}.table th:nth-child(1),.table td:nth-child(1){width:11%}.table th:nth-child(2),.table td:nth-child(2){width:9%}.table th:nth-child(3),.table td:nth-child(3){width:11%}.table th:nth-child(4),.table td:nth-child(4){width:10%}.table th:nth-child(5),.table td:nth-child(5){width:11%}.table th:nth-child(6),.table td:nth-child(6){width:11%}.table th:nth-child(7),.table td:nth-child(7){width:13%}.table th:nth-child(8),.table td:nth-child(8){width:10%}.table th:nth-child(9),.table td:nth-child(9){width:14%}@page{size:A4 landscape;margin:8mm}@media print{button{display:none!important}}
  </style></head><body><div>${title?title.outerHTML:''}</div>${tableClone.outerHTML}</body></html>`;
}
function printResidentReport(){
  const source=document.getElementById('resident-report-card-data');if(!source){toast('اعرض الكشف أولًا','error');return;}
  const html=residentPrintHtml(source);if(!html){toast('تعذر العثور على جدول الكشف','error');return;}
  const w=window.open('','_blank','width=1500,height=900');if(!w){toast('المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم حاول.','error');return;}
  w.document.open();w.document.write(html.replace('</body>','<script>window.onload=()=>{window.focus();setTimeout(()=>window.print(),150);};</script></body>'));w.document.close();
}
function printReportElement(source){
  const html=residentPrintHtml(source);if(!html){toast('اعرض الكشف أولًا','error');return;}
  const w=window.open('','_blank','width=1500,height=900');if(!w){toast('المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم حاول.','error');return;}
  w.document.open();w.document.write(html.replace('</body>','<script>window.onload=()=>{window.focus();setTimeout(()=>window.print(),150);};</script></body>'));w.document.close();
}
async function downloadReportElementPdf(source,s,periods){
  if(!source){toast('اعرض الكشف أولًا','error');return;}
  if(!window.html2pdf){toast('مكوّن PDF غير محمل. حدّث الصفحة وجرب مرة ثانية.','error');return;}
  const html=residentPrintHtml(source,'كشف حساب');if(!html){toast('تعذر العثور على جدول الكشف','error');return;}
  const iframe=document.createElement('iframe');iframe.style.cssText='position:fixed;width:1px;height:1px;left:-10000px;top:-10000px;border:0;opacity:0';document.body.appendChild(iframe);
  try{
    const idoc=iframe.contentDocument;idoc.open();idoc.write(html);idoc.close();
    await new Promise(resolve=>setTimeout(resolve,350));
    try{await idoc.fonts?.ready;}catch{}
    const host=idoc.body;const filename=`كشف_حساب_${String(s?.name||'ساكن').replace(/[\\/:*?"<>|]+/g,'_')}.pdf`;
    await window.html2pdf().set({margin:[6,6,8,6],filename,image:{type:'jpeg',quality:.98},html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false,scrollX:0,scrollY:0,windowWidth:1063,windowHeight:750},jsPDF:{unit:'mm',format:'a4',orientation:'landscape',compress:true},pagebreak:{mode:['css','legacy'],avoid:['tr','.table tr']}}).from(host).save();
    toast('تم تنزيل كشف الحساب PDF');
  }catch(e){console.error(e);toast('تعذر إنشاء PDF','error');}
  finally{iframe.remove();}
}
async function downloadResidentPdf(id,weekId,fromId,toId){
  const source=document.getElementById('resident-report-card-data');const periods=residentReportPeriods(fromId,toId);const ss=(state.data.subscribers||[]).find(x=>x.id===id);if(!source||!ss){toast('اعرض الكشف أولًا','error');return;}await downloadReportElementPdf(source,ss,periods);
}

function renderSettings(){
  setTitle('الإعدادات والصلاحيات','مدير النظام فقط: المستخدمون والموافقات وسجل الحركات والحذف الآمن.');
  if(!can('admin')){$('#app').innerHTML=`<section class="panel">${empty('الإعدادات للمدير فقط','هذه الصفحة متاحة لمدير النظام فقط.')}</section>`;return;}
  const members=state.data.members||[], periods=latestPeriods(), approvals=(state.data.approvalRequests||[]).filter(x=>x.status==='pending'), logs=[...(state.data.auditLogs||[])].sort((a,b)=>String(b.createdAt?.seconds||0).localeCompare(String(a.createdAt?.seconds||0)));
  const roleOpts=Object.entries(ROLES).filter(([k])=>!['pending'].includes(k));
  $('#app').innerHTML=`
  <section class="settings-grid">
   <div class="panel"><div class="panel-head"><div><h2>حسابك</h2><p class="muted">أنت مدير النظام ولديك كامل الصلاحيات.</p></div></div><div class="member-row"><div class="avatar">${safe((state.user.displayName||'م').slice(0,1))}</div><div class="member-info"><b>${safe(state.user.displayName||'—')}</b><span>${safe(state.user.email||'—')} • ${roleName(state.profile.role)}</span></div></div><div class="actions"><button class="btn ghost" id="logoutSet">تسجيل الخروج</button></div></div>
   <div class="panel"><div class="panel-head"><div><h2>المستخدمون والصلاحيات</h2><p class="muted">الحساب الجديد يبقى بانتظار موافقة مدير النظام. بعد القبول تظهر له صلاحية المشاهد ويمكنك تغييرها لاحقًا.</p></div></div><div class="members">${members.length?members.map(m=>`<div class="member-row"><div class="avatar">${safe((m.displayName||'م').slice(0,1))}</div><div class="member-info"><b>${safe(m.displayName||'—')}</b><span>${safe(m.email||'')}</span></div>${m.id===state.user.uid?'<span class="badge ok">حسابك</span>':`<select data-role="${m.id}">${roleOpts.map(([k,v])=>`<option value="${k}" ${m.role===k?'selected':''}>${v}</option>`).join('')}</select>${m.role==='pending'?`<button class="mini" data-approve-member="${m.id}">قبول</button>`:''}${m.role==='resident'?`<select data-resident-sub="${m.id}"><option value="">اختر الساكن</option>${(state.data.subscribers||[]).filter(x=>x.type!=='خارجي').map(x=>`<option value="${x.id}" ${sameId(m.residentSubscriberId,x.id)?'selected':''}>${safe(x.name)}</option>`).join('')}</select>`:''}<button class="mini red" data-delete-member="${m.id}">حذف</button>`}</div>`).join(''):empty('لا يوجد مستخدمون','سيظهر الحساب بعد تسجيل الدخول.')}</div></div>
  </section>
  <section class="panel"><div class="panel-head"><div><h2>طلبات الموافقة</h2><p class="muted">تظهر هنا طلبات موظف الحسابات لتعديل أو حذف بيانات سابقة.</p></div><span class="badge warn">${approvals.length} معلّق</span></div>${approvals.length?`<div class="table-wrap"><table class="table audit-table"><thead><tr><th>الوقت</th><th>المستخدم</th><th>الإجراء</th><th>القسم</th><th>السجل</th><th>إجراءات</th></tr></thead><tbody>${approvals.map(a=>`<tr><td>${auditDate(a.createdAt)}</td><td>${safe(a.requesterName||a.requesterEmail)}</td><td><span class="badge info">${a.action==='delete'?'حذف':'تعديل'}</span></td><td>${safe(VIEW_NAMES[a.collection]||a.collection||'—')}</td><td><code>${safe(a.docId||'—')}</code></td><td><div class="row-actions"><button class="mini" data-approve-request="${a.id}">موافقة</button><button class="mini red" data-reject-request="${a.id}">رفض</button></div></td></tr>`).join('')}</tbody></table></div>`:empty('لا توجد طلبات معلقة','كل الطلبات تمت معالجتها.')}</section>
  <section class="panel"><div class="panel-head"><div><h2>مراقبة الحركات</h2><p class="muted">راجع من أضاف أو عدّل أو حذف أو فتح قسمًا، مع الوقت والحساب.</p></div></div><div class="toolbar audit-filters"><select id="auditAction"><option value="">كل الأنواع</option><option>إضافة</option><option>تعديل</option><option>حذف</option><option>قراءة</option><option>طلب موافقة</option><option>موافقة</option><option>رفض</option></select><select id="auditUser"><option value="">كل الأشخاص</option>${[...new Set(logs.map(x=>x.userEmail||x.userName).filter(Boolean))].map(v=>`<option value="${safe(v)}">${safe(v)}</option>`).join('')}</select><select id="auditCollection"><option value="">كل الأقسام</option>${[...new Set(logs.map(x=>x.collection).filter(Boolean))].map(v=>`<option value="${safe(v)}">${safe(VIEW_NAMES[v]||v)}</option>`).join('')}</select><select id="auditSort"><option value="newest">الأحدث أولًا</option><option value="oldest">الأقدم أولًا</option></select></div><div class="table-wrap"><table class="table audit-table"><thead><tr><th>الوقت</th><th>الشخص</th><th>الوظيفة</th><th>النوع</th><th>القسم</th><th>التفصيل</th></tr></thead><tbody id="auditBody">${auditRows(logs)}</tbody></table></div></section>
  <section class="panel danger-panel"><div class="panel-head"><div><h2>الحذف الآمن</h2></div></div><div class="danger-actions"><select id="deletePeriod"><option value="">اختر أسبوعًا</option>${periods.map(p=>`<option value="${p.id}">${safe(p.label)} — ${fmtDate(p.startDate)}</option>`).join('')}</select><button class="btn danger" id="deletePeriodBtn">حذف الأسبوع المختار</button><button class="btn danger" id="deleteExceptSelectedBtn">حذف كل الأسابيع ما عدا المختار</button></div></section>`;
  $('#logoutSet').onclick=()=>signOut(auth);
  $$('[data-role]').forEach(s=>s.onchange=()=>updateRole(s.dataset.role,s.value));
  $$('[data-delete-member]').forEach(b=>b.onclick=()=>deleteMember(b.dataset.deleteMember));$$('[data-resident-sub]').forEach(sel=>sel.onchange=()=>assignResident(sel.dataset.residentSub,sel.value));
  $$('[data-approve-member]').forEach(b=>b.onclick=()=>approveMember(b.dataset.approveMember));
  $$('[data-approve-request]').forEach(b=>b.onclick=()=>resolveApproval(b.dataset.approveRequest,true));
  $$('[data-reject-request]').forEach(b=>b.onclick=()=>resolveApproval(b.dataset.rejectRequest,false));
  $('#deletePeriodBtn').onclick=()=>deleteWeek($('#deletePeriod').value);$('#deleteExceptSelectedBtn').onclick=()=>deleteAllExceptSelected($('#deletePeriod').value);
  const apply=()=>{let a=logs.filter(x=>!$('#auditAction').value||x.action===$('#auditAction').value).filter(x=>!$('#auditUser').value||String(x.userEmail||x.userName)===String($('#auditUser').value)).filter(x=>!$('#auditCollection').value||x.collection===$('#auditCollection').value);if($('#auditSort').value==='oldest')a.reverse();$('#auditBody').innerHTML=auditRows(a);};
  ['auditAction','auditUser','auditCollection','auditSort'].forEach(id=>$('#'+id).onchange=apply);
}
function auditDate(v){try{const d=v?.toDate?v.toDate():(v?.seconds?new Date(Number(v.seconds)*1000):null);if(!d)return '—';return d.toLocaleString('ar-PS',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});}catch{return '—';}
function describeChanges(oldData,nextData){const changed=[];const labels={amount:'المبلغ',date:'التاريخ',paymentDate:'تاريخ الدفعة',currentReading:'القراءة الحالية',previousReading:'القراءة السابقة',unitId:'الوحدة',buildingId:'البناية',subscriberId:'الساكن',periodId:'الأسبوع',pricePerKwh:'سعر الكيلو',cost:'التكلفة',description:'البيان',contributionType:'نوع المساهمة',sourceId:'المصدر'};for(const k of new Set([...Object.keys(oldData||{}),...Object.keys(nextData||{})])){if(['updatedAt','updatedBy'].includes(k))continue;const a=oldData?.[k],b=nextData?.[k];const sa=typeof a==='object'?JSON.stringify(a):String(a??'');const sb=typeof b==='object'?JSON.stringify(b):String(b??'');if(sa!==sb)changed.push(labels[k]||k);}return changed.length?`تغيير: ${changed.join('، ')}`:'تعديل بيانات السجل';}
function auditRows(rows){return rows.length?rows.slice(0,300).map(x=>`<tr><td>${auditDate(x.createdAt)}</td><td>${safe(x.userName||x.userEmail||'—')}</td><td>${safe(roleName(x.role))}</td><td><span class="badge info">${safe(x.action||'—')}</span></td><td>${safe(VIEW_NAMES[x.collection]||x.collection||'—')}</td><td>${safe(x.details||'—')}</td></tr>`).join(''):`<tr><td colspan="6">${empty('لا توجد حركات','لا توجد حركات مطابقة للفلاتر.')}</td></tr>`;}
async function approveMember(uid){if(!can('admin'))return;const m=(state.data.members||[]).find(x=>x.id===uid);if(!m)return;await fsUpdateDoc(orgDoc('members',uid),{role:'viewer',approvedAt:serverTimestamp(),approvedBy:state.user.uid,updatedAt:serverTimestamp(),updatedBy:state.user.uid});upsertLocal('members',{id:uid,role:'viewer'});await addAudit('موافقة','members',uid,`قبول الحساب ${m.email||m.displayName}`);toast('تم قبول الحساب كمشاهد');renderSettings();}
async function executeApprovedDelete(req){
  const c=req.collection,id=req.docId,batch=writeBatch(db);const del=(coll,did)=>batch.delete(orgDoc(coll,did));
  if(c==='payments'){del('payments',id);for(const l of (state.data.ledger||[]).filter(x=>sameId(x.referenceId,id)&&x.transactionType==='PAYMENT'))del('ledger',l.id);
  }else if(c==='debts'){del('debts',id);for(const l of (state.data.ledger||[]).filter(x=>sameId(x.referenceId,id)&&x.transactionType==='DEBT'))del('ledger',l.id);
  }else if(c==='contributions'){del('contributions',id);const row=(state.data.contributions||[]).find(x=>x.id===id);if(row?.fundRevenueId)del('fundRevenues',row.fundRevenueId);
  }else if(c==='costs'){del('costs',id);for(const l of (state.data.ledger||[]).filter(x=>sameId(x.referenceId,id)))del('ledger',l.id);
  }else if(['energyReadings','readings','waterSummary','fundRevenues','fundWithdrawals','solarBatches','solarSales','sources','units'].includes(c)){del(c,id);
  }else if(c==='subscribers'){del('subscribers',id);for(const m of (state.data.meters||[]).filter(x=>sameId(x.subscriberId,id))){del('meters',m.id);for(const r of (state.data.readings||[]).filter(x=>sameId(x.meterId,m.id)))del('readings',r.id);}for(const l of (state.data.ledger||[]).filter(x=>sameId(x.subscriberId,id)))del('ledger',l.id);for(const pay of (state.data.payments||[]).filter(x=>sameId(x.subscriberId,id)))del('payments',pay.id);for(const d of (state.data.debts||[]).filter(x=>sameId(x.subscriberId,id)))del('debts',d.id);
  }else if(c==='buildings'){const units=(state.data.units||[]).filter(u=>sameId(u.buildingId,id));const unitIds=units.map(u=>u.id);const subs=(state.data.subscribers||[]).filter(s=>unitIds.some(uid=>sameId(uid,s.unitId)));if(subs.length)throw new Error('لا يمكن حذف البناية ما دامت تحتوي سكانًا. انقل السكان أولًا ثم اطلب حذفها.');del('buildings',id);for(const u of units)del('units',u.id);
  }else{del(c,id);}await batch.commit();
}
async function resolveApproval(id,approved){if(!can('admin'))return;const req=(state.data.approvalRequests||[]).find(x=>x.id===id);if(!req)return;if(!confirm(approved?'تأكيد تنفيذ الطلب؟':'رفض الطلب؟'))return;try{if(approved){if(req.action==='delete')await executeApprovedDelete(req);else await fsUpdateDoc(orgDoc(req.collection,req.docId),{...(req.payload||{}),updatedAt:serverTimestamp(),updatedBy:state.user.uid});}await fsUpdateDoc(orgDoc('approvalRequests',id),{status:approved?'approved':'rejected',resolvedAt:serverTimestamp(),resolvedBy:state.user.uid});await addAudit(approved?'موافقة':'رفض',req.collection,req.docId,approved?`تنفيذ طلب ${req.action}`:`رفض طلب ${req.action}`,{requestId:id});state.loaded=false;await loadData(true);toast(approved?'تم تنفيذ الطلب':'تم رفض الطلب');renderSettings();}catch(e){console.error(e);toast(e?.message||'تعذر معالجة الطلب','error');}}

async function assignResident(uid,subscriberId){if(!can('admin'))return;if(!subscriberId){await fsUpdateDoc(orgDoc('members',uid),{residentSubscriberId:null,updatedAt:serverTimestamp(),updatedBy:state.user.uid});toast('تم إلغاء ربط الساكن بالحساب');return;}await fsUpdateDoc(orgDoc('members',uid),{residentSubscriberId:subscriberId,updatedAt:serverTimestamp(),updatedBy:state.user.uid});upsertLocal('members',{id:uid,residentSubscriberId:subscriberId});await addAudit('تعديل','members',uid,'ربط حساب الساكن بساكن محدد');toast('تم ربط الحساب بالساكن');}
async function updateRole(uid,role){if(!can('admin'))return;if(uid===state.user.uid&&role!=='admin'){toast('لا تنزل صلاحيتك من نفسك.','error');return;}await fsUpdateDoc(orgDoc('members',uid),{role,updatedAt:serverTimestamp(),updatedBy:state.user.uid}); await addAudit('تعديل','members',uid,`تغيير صلاحية الحساب إلى ${roleName(role)}`);upsertLocal('members',{id:uid,role});toast('تم تعديل الصلاحية');renderSettings();}
async function deleteWeek(pid){
  if(!pid){toast('اختر أسبوعًا','error');return;}if(!can('admin')){toast('حذف الأسبوع مخصص للمدير','error');return;}const p=periodById(pid);if(!p)return;if(!confirm(`سيتم حذف ${p.label||'الأسبوع'} وكل البيانات المرتبطة به من النظام.\n\nهل أنت متأكد؟`))return;
  const ops=[b=>b.delete(orgDoc('periods',pid))];
  for(const c of ['readings','energyReadings','costs','contributions','waterSummary','payments'])for(const r of (state.data[c]||[]).filter(x=>x.periodId===pid))ops.push(b=>b.delete(orgDoc(c,r.id)));
  for(const t of (state.data.ledger||[]).filter(x=>x.periodId===pid))ops.push(b=>b.delete(orgDoc('ledger',t.id)));
  for(const d of (state.data.debts||[]).filter(x=>x.periodId===pid))ops.push(b=>b.delete(orgDoc('debts',d.id)));
  const seedPeriod=(INITIAL_DATA.periods||[]).find(x=>x.id===pid);if(seedPeriod)ops.push(b=>b.set(orgDoc('seedDeletes',`periods__${seedPeriod.id}`),{key:seedDeleteKey('periods',seedPeriod.id),deletedAt:serverTimestamp(),deletedBy:state.user.uid}));
  await commitOps(ops);state.loaded=false;await loadData(true);state.periodId=null;toast('تم حذف الأسبوع وكل بياناته');renderSettings();
}

function openAccount(id){
  const s=(state.data.subscribers||[]).find(x=>x.id===id);if(!s)return;
  const r=subscriberRow(s);
  const periods=allPeriodsAscending();
  const selected=selectedPeriod();
  const rows=periods.map(p=>{const x=subscriberFinancialSummary(id,p.id);return `<tr><td><b>${safe(p.label||'أسبوع')}</b><br><small>${fmtDate(p.startDate)} → ${fmtDate(p.endDate)}</small></td><td>${fmt(x.currentConsumption,3)} كوب</td><td>${money(x.currentWater)}</td><td>${money(x.guard)}</td><td>${money(x.other)}</td><td>${money(x.previousDebt)}</td><td>${money(x.finalBeforePayments)}</td><td>${money(x.periodPayments)}</td><td class="strong">${money(x.finalBalance)}</td></tr>`}).join('');
  openModal(`<section class="resident-report-card account-modal-report" id="account-modal-report-${safe(id)}"><div class="resident-report-head"><div><span class="code">${safe(s.code)}</span><h2>${safe(s.name)}</h2><p>${safe(r.buildingName)} · ${safe(r.unitCode)} · ${safe(s.phone||'بدون هاتف')}</p></div><div class="balance-box"><span>المديونية</span><b>${money(r.debt)}</b></div></div><div class="account-section"><div class="section-head-inline"><div><h3>كشف الحساب الأسبوعي</h3><p>من الأقدم إلى الأحدث، وبنفس بنود التقرير.</p></div><div class="row-actions"><button class="btn soft" id="accountModalPrint">طباعة الكشف</button><button class="btn soft" id="accountModalPdf">تنزيل PDF</button><span class="muted">${periods.length} أسبوع</span></div></div><div class="table-wrap resident-ledger-table"><table class="table account-report-table"><thead><tr><th>الأسبوع</th><th>سحب المياه</th><th>قيمة المياه</th><th>خدمة الحارس</th><th>مصاريف أخرى</th><th>الديون السابقة</th><th>الإجمالي قبل الدفعات</th><th>الدفعات</th><th>الإجمالي المطلوب</th></tr></thead><tbody>${rows||`<tr><td colspan="9">${empty('لا يوجد كشف','')}</td></tr>`}</tbody></table></div></div></section>`);
  $('#accountModalPrint').onclick=()=>printReportElement(document.getElementById(`account-modal-report-${id}`));
  $('#accountModalPdf').onclick=()=>downloadReportElementPdf(document.getElementById(`account-modal-report-${id}`), s, periods);

}
function showGuide(){
  const steps=[
    {title:'1) الرئيسية',text:'تعرض أهم الأرقام بسرعة: آخر أسبوع، رصيد صندوق العمارة، السولار، استهلاك المياه والمديونية.',go:'dashboard'},
    {title:'2) الأسابيع',text:'افتح أسبوعًا جديدًا أولًا. القراءات السابقة تُرحّل تلقائيًا عندما يبدأ الأسبوع.',go:'periods'},
    {title:'3) الكهرباء',text:'أدخل القراءات السابقة والحالية وسعر الكيلو لكل مصدر ثم احفظ. تكلفة الكهرباء تدخل في حساب تكلفة التشغيل.',go:'energy'},
    {title:'4) المياه',text:'أدخل قراءات المياه. عند إضافة ساكن جديد ينشأ له عداد ويُربط بوحدته وبنايته.',go:'readings'},
    {title:'5) خدمة الحارس',text:'طبّق خدمة الحارس حسب النظام. عند إضافة ساكن جديد تُزامَن الخدمة الحالية تلقائيًا فقط دون تحميل تاريخ قديم.',go:'guard'},
    {title:'6) المصاريف والطوارئ',text:'سجّل المصروف وحدد هل يدخل في سعر الكوب وهل يوزع على السكان. خصم المصاريف له مسار مستقل عن مساهمة الصندوق.',go:'costs'},
    {title:'7) المساهمات',text:'اختر نوعًا واحدًا لكل مساهمة: خصم من الماء والكهرباء، خصم من المصاريف، أو مساهمة للصندوق. هذا يمنع خلط المبالغ بين الحسابات.',go:'contributions'},
    {title:'8) الدفعات',text:'دفعات السكان تخفّض مديونية الساكن وتسجل كسداد فقط، ولا تدخل تلقائيًا في الإيرادات و الصندوق.',go:'payments'},
    {title:'9) الديون السابقة',text:'سجّل الديون التي كانت مستحقة قبل الفترة الحالية، وتظهر لاحقًا في كشف الحساب.',go:'debts'},
    {title:'10) السكان والوحدات',text:'أنشئ البناية ثم الوحدة ثم الساكن. يجب أن تكون الوحدة من نفس البناية، والنظام يحافظ على الربط ويجهز عداد المياه والخدمات الحالية.',go:'subscribers'},
    {title:'11) الإيرادات و الصندوق',text:'إيرادات السولار والمساهمات المخصصة للصندوق والإيرادات الأخرى تزيد رصيد الصندوق. السحب منه ينقص الرصيد فقط.',go:'fund'},
    {title:'12) التقارير',text:'استخدم عرض الكشف ثم الطباعة أو تنزيل PDF. زر التنزيل يستخدم نفس قالب الطباعة حتى تكون النتيجة مطابقة لها.',go:'reports'},
    {title:'13) Excel',text:'ملفات Excel تُنشأ بجداول مرتبة ومروسة مع اتجاه عربي من اليمين إلى اليسار وتنسيق للصفوف والأعمدة.',go:'reports'},
    {title:'14) البيانات التاريخية',text:'هذه الصفحة تعرض البيانات التاريخية المضمنة في النظام.',go:'historical'},
    {title:'15) الصلاحيات',text:'مدير النظام وحده يرى صفحة الإعدادات والصلاحيات. المدير يدير العمل دون إعدادات النظام. موظف الحسابات يستطيع إدخال الجديد، أما تعديل أو حذف البيانات السابقة فيرسل طلب موافقة. موظف القراءات يرى الرئيسية والكهرباء والمياه فقط. المشاهد يقرأ كل شيء دون تعديل. الساكن يختار اسمه من الحساب ويرى بياناته فقط.',go:'settings'}
  ].filter(step=>canView(step.go));
  let i=0;
  const draw=()=>{const s=steps[i],last=i===steps.length-1;openModal(`<div class="guide-hero"><div class="guide-topline"><span class="guide-badge">دليل الاستخدام</span><span class="guide-counter">${i+1} / ${steps.length}</span></div><h2>${safe(s.title)}</h2><p>${safe(s.text)}</p></div><div class="guide-demo"><div class="demo-title">كيف تستخدم هذا القسم</div><div class="demo-row"><span>البيانات</span><b>تُحفظ على Firebase</b></div><div class="demo-row"><span>الإجراء</span><b>استخدم «التالي» للانتقال بين التعليمات</b></div></div><div class="guide-actions"><button class="btn ghost" id="guideClose">إغلاق</button><div class="guide-actions-right"><button class="btn ghost" id="guidePrev" ${i===0?'disabled':''}>السابق</button><button class="btn primary" id="guideNext">${last?'فتح القسم →':'التالي ←'}</button></div></div>`);$('#guideClose').onclick=closeModal;$('#guidePrev').onclick=()=>{if(i>0){i--;draw();}};$('#guideNext').onclick=()=>{if(last){closeModal();navigate(s.go);}else{i++;draw();}};};draw();
}

function renderPending(){setTitle('بانتظار الموافقة','حسابك مسجل كمشاهد مبدئيًا، لكن لا يمكن الدخول قبل موافقة مدير النظام.');$('#app').innerHTML=`<section class="panel" style="max-width:680px;margin:50px auto;text-align:center;padding:40px"><div style="font-size:40px">⌛</div><h2>باقي موافقة المدير</h2><p class="muted">${safe(state.user?.email||'حسابك')} مسجل. بعد موافقة المدير ستظهر بيانات العمارة.</p><button class="btn primary" id="reloadPending">تحديث</button></section>`;$('#reloadPending').onclick=async()=>{try{state.profile=await ensureProfile();$('#userRole').textContent=roleName(state.profile.role);if(state.profile.role!=='pending'){await loadData(true);await ensureSolarBatchMigration();await ensureDefaults();refreshResidentAccountSelect();await navigate('dashboard');}else toast('ما زال الحساب بانتظار موافقة المدير','error');}catch(e){toast(e?.message||'تعذر تحديث حالة الحساب','error');}};}

// Global actions
function authFriendlyError(e){ const c=e?.code||''; const m={ 'auth/unauthorized-domain':'الدومين غير مصرح به في Firebase. أضف majd377.github.io إلى Authorized domains.','auth/operation-not-allowed':'تسجيل الدخول بحساب Google غير مفعّل في Firebase.','auth/network-request-failed':'تعذر الاتصال بـ Firebase. تحقق من الإنترنت ثم حاول مرة أخرى.','auth/popup-blocked':'تم حظر نافذة تسجيل الدخول.','auth/popup-closed-by-user':'تم إغلاق نافذة تسجيل الدخول قبل إكمال العملية.'}; return m[c]||'';}
$('#googleLogin')?.addEventListener('click',async()=>{const b=$('#auth-error');b.classList.add('hidden');try{await signInWithPopup(auth,provider)}catch(e){console.warn('Google popup login failed',e);const code=e?.code||'';if(['auth/popup-blocked','auth/operation-not-supported-in-this-environment','auth/cancelled-popup-request'].includes(code)){try{await signInWithRedirect(auth,provider);return;}catch(re){console.error('Google redirect fallback failed',re);b.textContent=authFriendlyError(re)||re?.message||'تعذر تسجيل الدخول بحساب Google';b.classList.remove('hidden');return;}}b.textContent=authFriendlyError(e)||e?.message||'تعذر تسجيل الدخول بحساب Google';b.classList.remove('hidden');}});

getRedirectResult(auth).catch(e=>{if(e){const b=$('#auth-error');if(b){b.textContent=authFriendlyError(e)||e?.message||'تعذر تسجيل الدخول';b.classList.remove('hidden');}}});
function refreshResidentAccountSelect(){const sel=$('#residentAccountSelect');if(!sel)return;if(state.profile?.role!=='resident'){sel.classList.add('hidden');return;}const residents=(state.data.subscribers||[]).filter(s=>s.active!==false&&s.type!=='خارجي');sel.classList.remove('hidden');sel.innerHTML=`<option value="">اختر اسمك</option>${residents.map(s=>`<option value="${s.id}" ${sameId(state.profile.residentSubscriberId,s.id)?'selected':''}>${safe(s.name)}</option>`).join('')}`;}
$('#residentAccountSelect')?.addEventListener('change',async e=>{if(state.profile?.role!=='resident')return;const subscriberId=e.target.value;if(!subscriberId){toast('اختر اسم الساكن المرتبط بحسابك','error');return;}await fsUpdateDoc(orgDoc('members',state.user.uid),{residentSubscriberId:subscriberId,updatedAt:serverTimestamp(),updatedBy:state.user.uid});state.profile.residentSubscriberId=subscriberId;render();toast('تم تحديد حسابك كساكن');});
$('#logoutBtn')?.addEventListener('click',()=>signOut(auth));
$('#refreshBtn')?.addEventListener('click',()=>navigate(state.view,state.periodId,true));
function isReadOnlyRole(){return ['viewer','resident'].includes(state.profile?.role);}
function applyReadOnlyUi(){
  const ro=isReadOnlyRole();document.body.classList.toggle('readonly-role',ro);if(!ro)return;
  $$('input:not([type="search"]),textarea,select').forEach(el=>{if(!el.closest('#resident-report-holder')&& !['residentAccountSelect'].includes(el.id||'') && !/^rep|^subSearch$|^subSort$/.test(el.id||'')) el.disabled=true;});
  $$('button').forEach(btn=>{const id=btn.id||'',txt=(btn.textContent||'').trim();const allowed=['refreshBtn','mobileMenu','logoutBtn','logoutSet','showResidentReport','printResidentReport','downloadResidentPdf','copyResidentMessage','guideClose','guidePrev','guideNext'].includes(id)||/^rep|^subSearch$|^subSort$/.test(id)||txt.includes('↓ تنزيل')||txt.includes('🖨')||txt==='نسخ النص'||txt==='عرض الكشف'||txt==='التالي ←'||txt==='السابق';
    const mut=/^\+|إضافة|تسجيل|حفظ|حذف|تعديل|سحب|بيع السولار|ابدأ أسبوعًا|فتح أسبوعًا|اعتماد|إعادة/.test(txt);
    if(mut&&!allowed)btn.closest('.member-row,.panel-head,.head-actions,.actions,.danger-actions,.panel,.report-card')?.classList.add('readonly-hidden');
    if(mut&&!allowed)btn.classList.add('readonly-hidden');
  });
}
const _renderOriginal=render;render=async function(){const result=await _renderOriginal();setTimeout(applyReadOnlyUi,0);return result;};

$('#mobileMenu')?.addEventListener('click',()=>$('#sidebar')?.classList.toggle('open'));
$('#quickPeriod')?.addEventListener('click',showPeriodForm);
$('#guideBtn')?.addEventListener('click',()=>showGuide());
$('#settingsBtn')?.addEventListener('click',()=>navigate('settings'));
$('#modalClose')?.addEventListener('click',closeModal);
$('#modal')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});window.addEventListener('unhandledrejection',e=>{if(e.reason?.message===APPROVAL_SENT){e.preventDefault();}});
document.addEventListener('click',e=>{const v=e.target.closest('[data-view]');if(v)navigate(v.dataset.view);const a=e.target.closest('[data-account]');if(a)openAccount(a.dataset.account);const ed=e.target.closest('[data-edit-sub]');if(ed){if(can('admin','manager','accountant'))showSubscriberForm(ed.dataset.editSub);else toast('تعديل بيانات السكان مخصص للمديرين فقط','error');}const ar=e.target.closest('[data-archive-sub]');if(ar)archiveOrDelete(ar.dataset.archiveSub);});



// =========================
// V38 — إيرادات وصندوق العمارة + مخزون السولار بالدفعات
// =========================
const FUND_COLLECTIONS=['fundGuardConfig','fundGuardPayments','fundGuardExpenses','solarReceipts','solarSales','fundOtherIncome','fundExpenses','fundRevenues','fundWithdrawals','solarStock','solarBatches'];
function fundRows(c){return state.data[c]||[];}
function fundDateKey(v){return String(v||'').slice(0,10);}
function fundAllRevenues(){return fundRows('fundRevenues').slice().sort((a,b)=>fundDateKey(b.date).localeCompare(fundDateKey(a.date)) || String(b.createdAt?.seconds||0).localeCompare(String(a.createdAt?.seconds||0)));}
function fundAllWithdrawals(){return fundRows('fundWithdrawals').slice().sort((a,b)=>fundDateKey(b.date).localeCompare(fundDateKey(a.date)) || String(b.createdAt?.seconds||0).localeCompare(String(a.createdAt?.seconds||0)));}
function fundRevenueTotal(){return fundRows('fundRevenues').reduce((a,x)=>a+num(x.amount),0);}
function fundWithdrawalTotal(){return fundRows('fundWithdrawals').reduce((a,x)=>a+num(x.amount),0);}
function residentDebtTotal(){return (state.data.subscribers||[]).filter(s=>s.active!==false&&s.type!=='خارجي').reduce((a,s)=>a+Math.max(0,num(subscriberRow(s).debt)),0);}
function fundBalance(){return Math.max(0,fundRevenueTotal()-fundWithdrawalTotal()-residentDebtTotal());}
function solarBatches(){return fundRows('solarBatches').slice().sort((a,b)=>fundDateKey(b.date).localeCompare(fundDateKey(a.date)) || String(b.createdAt?.seconds||0).localeCompare(String(a.createdAt?.seconds||0)));}
function solarBatchTotal(){const rows=solarBatches();return rows.length?rows.reduce((a,x)=>a+num(x.liters),0):solarStockQty()+solarSoldTotal();}
function solarSales(){return fundRows('solarSales').slice().sort((a,b)=>fundDateKey(b.date).localeCompare(fundDateKey(a.date)) || String(b.createdAt?.seconds||0).localeCompare(String(a.createdAt?.seconds||0)));}
function solarSoldTotal(){return solarSales().reduce((a,x)=>a+num(x.liters),0);}
function solarAvailableQty(){return Math.max(0,solarBatchTotal()-solarSoldTotal());}
function solarStockRow(){return fundRows('solarStock').find(x=>x.id==='main')||fundRows('solarStock')[0]||null;}
function solarStockQty(){return Math.max(0,num(solarStockRow()?.quantity));}
async function ensureSolarBatchMigration(){if(!can('admin','manager'))return;const batches=fundRows('solarBatches');if(batches.length)return;const legacy=solarStockRow(),sold=solarSoldTotal(),legacyQty=solarStockQty(),opening=legacyQty+sold;if(!legacy||opening<=0)return;const ref=doc(orgCollection('solarBatches'));await fsSetDoc(ref,{date:dateNow(),liters:opening,description:'رصيد سولار افتتاحي — مرحّل من النظام السابق',notes:'تم إنشاؤها تلقائيًا للمحافظة على الرصيد السابق.',source:'legacyMigration',createdAt:serverTimestamp(),createdBy:state.user.uid,updatedAt:serverTimestamp()});state.data.solarBatches=[{id:ref.id,date:dateNow(),liters:opening,description:'رصيد سولار افتتاحي — مرحّل من النظام السابق',notes:'تم إنشاؤها تلقائيًا للمحافظة على الرصيد السابق.',source:'legacyMigration'}];}
async function fundUpsert(collection,id,data){if(id){await updateDoc(orgDoc(collection,id),{...data,updatedAt:serverTimestamp(),updatedBy:state.user.uid});upsertLocal(collection,{id,...data});return id;}const ref=doc(orgCollection(collection));await fsSetDoc(ref,{...data,createdAt:serverTimestamp(),createdBy:state.user.uid,updatedAt:serverTimestamp()});upsertLocal(collection,{id:ref.id,...data});return ref.id;}
async function fundRemove(collection,id){await fsDeleteDoc(orgDoc(collection,id));removeLocal(collection,id);}
function fundActions(collection,id){if(can('viewer'))return '—';const edit=`<button class="btn tiny ghost" data-fund-edit="${safe(collection)}:${safe(id)}">تعديل</button>`;const del=`<button class="btn tiny danger" data-fund-delete="${safe(collection)}:${safe(id)}">حذف</button>`;return `<div class="row-actions">${edit}${can('admin','manager','accountant')?del:''}</div>`;}
function printFundSection(sourceId,title,mode='table'){const source=document.getElementById(sourceId);if(!source){toast('تعذر العثور على القسم المطلوب','error');return;}const w=window.open('','_blank','width=1400,height=900');if(!w){toast('المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم حاول.','error');return;}let content='';if(mode==='summary'){content=`<table class="print-table"><thead><tr><th>البند</th><th>القيمة</th></tr></thead><tbody><tr><td>إجمالي الإيرادات</td><td>${safe(money(fundRevenueTotal()))}</td></tr><tr><td>إجمالي السحب من الصندوق</td><td>${safe(money(fundWithdrawalTotal()))}</td></tr><tr><td>مديونية السكان</td><td>${safe(money(residentDebtTotal()))}</td></tr><tr><td>المتبقي في صندوق العمارة</td><td>${safe(money(fundBalance()))}</td></tr><tr><td>إجمالي دفعات السولار</td><td>${safe(fmt(solarBatchTotal(),3))} لتر</td></tr><tr><td>إجمالي مبيعات السولار</td><td>${safe(fmt(solarSoldTotal(),3))} لتر</td></tr><tr><td>رصيد السولار الحالي</td><td>${safe(fmt(solarAvailableQty(),3))} لتر</td></tr></tbody></table>`;}else{const table=source.querySelector('table');if(!table){toast('تعذر العثور على جدول القسم','error');return;}const clone=table.cloneNode(true);clone.querySelectorAll('[data-fund-edit],[data-fund-delete],.row-actions').forEach(x=>x.remove());content=clone.outerHTML;}w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${safe(title)}</title><style>body{font-family:Arial,"Cairo",sans-serif;padding:24px;color:#183734}h1{font-size:22px;margin:0 0 16px}.print-table{width:100%;border-collapse:collapse;direction:rtl;font-size:12px}.print-table th,.print-table td{border:1px solid #cfdad6;padding:8px 10px;text-align:center;vertical-align:middle}.print-table th{background:#edf5f2;font-weight:800}.print-table td:first-child{text-align:right}@page{size:A4 landscape;margin:10mm}@media print{button{display:none!important}}</style></head><body><h1>${safe(title)}</h1>${content}<script>window.onload=()=>window.print();</script></body></html>`);w.document.close();w.focus();}
function renderFund(){setTitle('الإيرادات و الصندوق','كل الإيرادات هنا تدخل إلى صندوق العمارة فقط، ولا تُحمّل على أي ساكن ولا تدخل في حسبة المياه أو الكهرباء.');if(!can('admin','manager','accountant','viewer')){$('#app').innerHTML=`<section class="panel">${empty('هذه الصفحة غير متاحة','لا تملك صلاحية فتح الإيرادات والصندوق.')}</section>`;return;}const revenues=fundAllRevenues(),withdrawals=fundAllWithdrawals(),totalRevenue=fundRevenueTotal(),totalWithdrawals=fundWithdrawalTotal(),balance=fundBalance(),batches=solarBatches(),sales=solarSales(),totalBatches=solarBatchTotal(),totalSold=solarSoldTotal(),available=solarAvailableQty();$('#app').innerHTML=`
<section class="hero"><div><span class="guide-badge">حساب مستقل</span><h2>الإيرادات و الصندوق</h2></div></section>
<section class="panel fund-section solar-section" id="solarSection"><div class="panel-head"><div><h2>السولار — الدفعات والمبيعات</h2></div><div class="head-actions"><button class="btn primary" id="addSolarBatch">+ إضافة دفعة سولار</button><button class="btn soft" id="printSolarSummary">🖨 طباعة ملخص السولار</button></div></div><div class="money-grid"><div class="money-card"><small>إجمالي دفعات السولار</small><b>${fmt(totalBatches,3)} لتر</b></div><div class="money-card"><small>إجمالي السولار المباع</small><b>${fmt(totalSold,3)} لتر</b></div><div class="money-card"><small>السولار المتبقي</small><b>${fmt(available,3)} لتر</b></div></div>
<div class="subpanel" id="solarBatchesSection"><div class="panel-head"><div><h3>جدول إضافة دفعات السولار</h3></div><button class="btn soft" id="printSolarBatches">🖨 طباعة الدفعات</button></div><div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>الكمية</th><th>البيان</th><th>الملاحظات</th><th>إجراءات</th></tr></thead><tbody>${batches.map(x=>`<tr><td>${safe(fmtDate(x.date))}</td><td class="strong">${fmt(x.liters,3)} لتر</td><td>${safe(x.description||'—')}</td><td>${safe(x.notes||'—')}</td><td>${fundActions('solarBatches',x.id)}</td></tr>`).join('')||`<tr><td colspan="5">${empty('لا توجد دفعات سولار','اضغط «إضافة دفعة سولار».')}</td></tr>`}</tbody></table></div></div>
<div class="subpanel" id="solarSalesSection"><div class="panel-head"><div><h3>جدول مبيعات السولار</h3></div><div class="head-actions"><button class="btn primary" id="addSolarSale">+ بيع السولار</button><button class="btn soft" id="printSolarSales">🖨 طباعة المبيعات</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>الكمية المباعة</th><th>سعر اللتر</th><th>إجمالي البيع</th><th>المشتري</th><th>البيان</th><th>إجراءات</th></tr></thead><tbody>${sales.map(x=>`<tr><td>${safe(fmtDate(x.date))}</td><td class="strong">${fmt(x.liters,3)} لتر</td><td>${money(x.pricePerLiter)}</td><td class="strong">${money(x.total)}</td><td>${safe(x.buyer||'—')}</td><td>${safe(x.notes||'بيع سولار')}</td><td>${fundActions('solarSales',x.id)}</td></tr>`).join('')||`<tr><td colspan="7">${empty('لا توجد مبيعات سولار','اضغط «بيع السولار».')}</td></tr>`}</tbody></table></div></div></section>
<section class="panel fund-section" id="fundRevenueSection"><div class="panel-head"><div><h2>إيرادات صندوق العمارة</h2></div><div class="head-actions"><button class="btn primary" id="addFundRevenue">+ إضافة إيراد</button><button class="btn soft" id="printFundRevenues">🖨 طباعة الإيرادات</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>البيان</th><th>الملاحظات</th><th>إجراءات</th></tr></thead><tbody>${revenues.map(x=>`<tr><td>${safe(fmtDate(x.date))}</td><td><span class="badge info">${safe(x.type||'—')}</span></td><td class="strong">${money(x.amount)}</td><td>${safe(x.description||'—')}</td><td>${safe(x.notes||'—')}</td><td>${fundActions('fundRevenues',x.id)}</td></tr>`).join('')||`<tr><td colspan="6">${empty('لا توجد إيرادات مسجلة','اضغط «إضافة إيراد».')}</td></tr>`}</tbody></table></div></section>
<section class="panel fund-section" id="fundWithdrawalSection"><div class="panel-head"><div><h2>السحب من صندوق العمارة</h2></div><div class="head-actions"><button class="btn primary" id="addFundWithdrawal">+ سحب من الصندوق</button><button class="btn soft" id="printFundWithdrawals">🖨 طباعة السحب</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>المبلغ</th><th>البيان / سبب السحب</th><th>الملاحظات</th><th>إجراءات</th></tr></thead><tbody>${withdrawals.map(x=>`<tr><td>${safe(fmtDate(x.date))}</td><td class="strong">${money(x.amount)}</td><td>${safe(x.description||'—')}</td><td>${safe(x.notes||'—')}</td><td>${fundActions('fundWithdrawals',x.id)}</td></tr>`).join('')||`<tr><td colspan="5">${empty('لا توجد عمليات سحب','استخدم السحب عندما يتم الدفع من صندوق العمارة.')}</td></tr>`}</tbody></table></div></section>
<section class="panel fund-section" id="fundSummarySection"><div class="panel-head"><div><h2>ملخص الصندوق</h2></div><button class="btn soft" id="printFundSummary">🖨 طباعة الملخص</button></div><div class="money-grid"><div class="money-card"><small>إجمالي الإيرادات</small><b>${money(totalRevenue)}</b></div><div class="money-card"><small>إجمالي السحب</small><b>${money(totalWithdrawals)}</b></div><div class="money-card"><small>مديونية السكان</small><b>${money(residentDebtTotal())}</b></div><div class="money-card"><small>المتبقي في الصندوق</small><b>${money(balance)}</b></div></div><div class="section-note"><b>السولار:</b> ${fmt(totalBatches,3)} لتر دفعات − ${fmt(totalSold,3)} لتر مبيعات = <b>${fmt(available,3)} لتر</b> متبقية.</div><div class="section-note"><b>مهم:</b> الصفحة مستقلة عن مصاريف السكان وحسبة المياه والكهرباء.</div></section>`;
$('#addSolarBatch').onclick=()=>showSolarBatchForm();$('#addSolarSale').onclick=()=>showSolarSaleForm();$('#addFundRevenue').onclick=()=>showFundRevenueForm();$('#addFundWithdrawal').onclick=()=>showFundWithdrawalForm();$('#printSolarBatches').onclick=()=>printFundSection('solarBatchesSection','جدول دفعات السولار');$('#printSolarSales').onclick=()=>printFundSection('solarSalesSection','جدول مبيعات السولار');$('#printSolarSummary').onclick=()=>printFundSection('solarSection','ملخص السولار','summary');$('#printFundRevenues').onclick=()=>printFundSection('fundRevenueSection','جدول إيرادات صندوق العمارة');$('#printFundWithdrawals').onclick=()=>printFundSection('fundWithdrawalSection','جدول السحب من صندوق العمارة');$('#printFundSummary').onclick=()=>printFundSection('fundSummarySection','ملخص صندوق العمارة','summary');$$('[data-fund-edit]').forEach(b=>b.onclick=()=>{const [c,id]=b.dataset.fundEdit.split(':');showFundFormFor(c,id);});$$('[data-fund-delete]').forEach(b=>b.onclick=async()=>{const [c,id]=b.dataset.fundDelete.split(':');await deleteFundRecord(c,id);});}
function showSolarBatchForm(id=null){const row=id?fundRows('solarBatches').find(x=>x.id===id):null;openModal(`<h2>${row?'تعديل دفعة سولار':'إضافة دفعة سولار'}</h2><p class="modal-lead">هذه الدفعة تزيد كمية السولار المتوفرة فقط، ولا تسجّل إيرادًا ماليًا.</p><div class="form-grid"><div class="field"><label>التاريخ</label><input id="sbDate" type="date" value="${safe(row?.date||dateNow())}"></div><div class="field"><label>الكمية (لتر)</label><input id="sbLiters" type="number" min="0.001" step="0.001" value="${row?.liters??''}" placeholder="مثال 500"></div><div class="field full"><label>البيان</label><input id="sbDesc" value="${safe(row?.description||'')}" placeholder="مثال: دفعة سولار جديدة"></div><div class="field full"><label>الملاحظات</label><textarea id="sbNotes">${safe(row?.notes||'')}</textarea></div></div><div class="actions"><button class="btn primary" id="sbSave">${row?'حفظ التعديل':'إضافة الدفعة'}</button><button class="btn ghost" id="sbCancel">إلغاء</button></div>`);$('#sbCancel').onclick=closeModal;$('#sbSave').onclick=async()=>{const date=$('#sbDate').value,liters=num($('#sbLiters').value),description=$('#sbDesc').value.trim(),notes=$('#sbNotes').value.trim();if(!date||liters<=0){toast('أكمل التاريخ والكمية','error');return;}const otherBatches=solarBatchTotal()-(row?num(row.liters):0),sold=solarSoldTotal();if(otherBatches+liters<sold){toast(`لا يمكن حفظ الدفعة. رصيد السولار بعد التعديل سيصبح أقل من السولار المباع (${fmt(sold,3)} لتر).`,'error');return;}await fundUpsert('solarBatches',id,{date,liters,description,notes});closeModal();toast(row?'تم تعديل دفعة السولار':'تمت إضافة دفعة السولار');renderFund();};}
function showSolarSaleForm(id=null){const row=id?fundRows('solarSales').find(x=>x.id===id):null;const currentWithoutRow=solarAvailableQty()+(row?num(row.liters):0);openModal(`<h2>${row?'تعديل بيع سولار':'بيع السولار'}</h2><p class="modal-lead">أدخل الكمية وسعر اللتر. قيمة البيع تُضاف تلقائيًا إلى الإيرادات باسم «إيرادات سولار» وبيان «بيع سولار».</p><div class="form-grid"><div class="field"><label>التاريخ</label><input id="ssDate" type="date" value="${safe(row?.date||dateNow())}"></div><div class="field"><label>الكمية المباعة (لتر)</label><input id="ssLiters" type="number" min="0.001" step="0.001" value="${row?.liters??''}" placeholder="مثال 30"></div><div class="field"><label>سعر اللتر</label><input id="ssPrice" type="number" min="0.01" step="0.01" value="${row?.pricePerLiter??''}" placeholder="مثال 30"></div><div class="field"><label>المشتري (اختياري)</label><input id="ssBuyer" value="${safe(row?.buyer||'')}" placeholder="اسم المشتري"></div><div class="field full"><label>الملاحظات</label><textarea id="ssNotes" placeholder="ملاحظات عن البيع">${safe(row?.notes||'')}</textarea></div></div><div class="calc-preview"><span>قيمة البيع</span><b id="ssTotalPreview">${money(row?.total||0)}</b><small>المتاح للبيع: ${fmt(currentWithoutRow,3)} لتر</small></div><div class="actions"><button class="btn primary" id="ssSave">${row?'حفظ التعديل':'تسجيل البيع'}</button><button class="btn ghost" id="ssCancel">إلغاء</button></div>`);const calc=()=>{const liters=num($('#ssLiters').value),price=num($('#ssPrice').value);$('#ssTotalPreview').textContent=money(liters*price);};$('#ssLiters').oninput=calc;$('#ssPrice').oninput=calc;calc();$('#ssCancel').onclick=closeModal;$('#ssSave').onclick=async()=>{const date=$('#ssDate').value,liters=num($('#ssLiters').value),price=num($('#ssPrice').value),buyer=$('#ssBuyer').value.trim(),notes=$('#ssNotes').value.trim();if(!date||liters<=0||price<=0){toast('أكمل التاريخ والكمية وسعر اللتر','error');return;}const oldLiters=row?num(row.liters):0,availableForSale=solarAvailableQty()+oldLiters;if(liters>availableForSale){toast(`الكمية المتاحة للبيع ${fmt(availableForSale,3)} لتر فقط`,'error');return;}const total=liters*price,saleData={date,liters,pricePerLiter:price,total,buyer,notes},revenueId=row?.revenueId||null; if(row && state.profile?.role==='accountant' && !sameId(row.createdBy,state.user.uid)){await createApprovalRequest('update',orgDoc('solarSales',id),saleData,row);return;} const batch=writeBatch(db),saleRef=row?orgDoc('solarSales',id):doc(orgCollection('solarSales')),revRef=revenueId?orgDoc('fundRevenues',revenueId):doc(orgCollection('fundRevenues'));if(row)batch.update(saleRef,{...saleData,updatedAt:serverTimestamp(),updatedBy:state.user.uid});else batch.set(saleRef,{...saleData,revenueId:revRef.id,createdAt:serverTimestamp(),createdBy:state.user.uid,updatedAt:serverTimestamp()});const revData={type:'إيرادات سولار',date,amount:total,description:'بيع سولار',notes:`${liters} لتر × ${price} ₪${buyer?` — المشتري: ${buyer}`:''}${notes?` — ${notes}`:''}`,source:'solarSale',solarSaleId:id||saleRef.id,updatedAt:serverTimestamp(),updatedBy:state.user.uid};if(revenueId)batch.update(revRef,revData);else batch.set(revRef,{...revData,createdAt:serverTimestamp(),createdBy:state.user.uid});await batch.commit();state.loaded=false;await loadData(true);closeModal();toast(row?'تم تعديل بيع السولار وتحديث الصندوق':'تم تسجيل بيع السولار وإضافة قيمة البيع للصندوق');renderFund();};}
function showFundRevenueForm(id=null){const row=id?fundRows('fundRevenues').find(x=>x.id===id):null;openModal(`<h2>${row?'تعديل إيراد':'إضافة إيراد'}</h2><p class="modal-lead"></p><div class="form-grid"><div class="field"><label>النوع</label><select id="frType"><option value="إيرادات سولار" ${row?.type==='إيرادات سولار'||!row?'selected':''}>إيرادات سولار</option><option value="إيرادات من خدمات الحارس" ${row?.type==='إيرادات من خدمات الحارس'?'selected':''}>إيرادات من خدمات الحارس</option><option value="الإيرادات الأخرى" ${row?.type==='الإيرادات الأخرى'?'selected':''}>الإيرادات الأخرى</option><option value="مساهمة للصندوق" ${row?.type==='مساهمة للصندوق'?'selected':''}>مساهمة للصندوق</option></select></div><div class="field"><label>التاريخ</label><input id="frDate" type="date" value="${safe(row?.date||dateNow())}"></div><div class="field"><label>المبلغ</label><input id="frAmount" type="number" min="0" step="1" value="${row?.amount??''}" placeholder="مثال 500"></div><div class="field full"><label>البيان</label><input id="frDesc" value="${safe(row?.description||'')}" placeholder="مثال: إيراد خدمة حارس / إيراد آخر"></div><div class="field full"><label>الملاحظات</label><textarea id="frNotes">${safe(row?.notes||'')}</textarea></div></div><div class="actions"><button class="btn primary" id="frSave">حفظ</button><button class="btn ghost" id="frCancel">إلغاء</button></div>`);$('#frCancel').onclick=closeModal;$('#frSave').onclick=async()=>{const amount=num($('#frAmount').value),date=$('#frDate').value,description=$('#frDesc').value.trim();if(amount<=0||!date){toast('أكمل التاريخ والمبلغ','error');return;}if(!description){toast('اكتب البيان','error');return;}await fundUpsert('fundRevenues',id,{type:$('#frType').value,date,amount,description,notes:$('#frNotes').value.trim()});closeModal();toast(row?'تم تعديل الإيراد':'تمت إضافة الإيراد للصندوق');renderFund();};}
function showFundWithdrawalForm(id=null){const row=id?fundRows('fundWithdrawals').find(x=>x.id===id):null;openModal(`<h2>${row?'تعديل سحب من الصندوق':'سحب من الصندوق'}</h2><p class="modal-lead">هذا السجل ينقص من رصيد صندوق العمارة فقط، حتى لا يتم تحميل المبلغ على السكان.</p><div class="form-grid"><div class="field"><label>التاريخ</label><input id="fwDate" type="date" value="${safe(row?.date||dateNow())}"></div><div class="field"><label>المبلغ</label><input id="fwAmount" type="number" min="0" step="1" value="${row?.amount??''}" placeholder="مثال 300"></div><div class="field full"><label>البيان / سبب السحب</label><input id="fwDesc" value="${safe(row?.description||'')}" placeholder="مثال: صيانة مضخة"></div><div class="field full"><label>الملاحظات</label><textarea id="fwNotes">${safe(row?.notes||'')}</textarea></div></div><div class="actions"><button class="btn primary" id="fwSave">حفظ السحب</button><button class="btn ghost" id="fwCancel">إلغاء</button></div>`);$('#fwCancel').onclick=closeModal;$('#fwSave').onclick=async()=>{const amount=num($('#fwAmount').value),date=$('#fwDate').value,description=$('#fwDesc').value.trim();if(amount<=0||!date){toast('أكمل التاريخ والمبلغ','error');return;}if(!description){toast('اكتب سبب السحب / البيان','error');return;}await fundUpsert('fundWithdrawals',id,{date,amount,description,notes:$('#fwNotes').value.trim()});closeModal();toast(row?'تم تعديل السحب':'تم تسجيل السحب من الصندوق');renderFund();};}
function showFundFormFor(collection,id){if(collection==='fundRevenues')showFundRevenueForm(id);else if(collection==='fundWithdrawals')showFundWithdrawalForm(id);else if(collection==='solarSales')showSolarSaleForm(id);else if(collection==='solarBatches')showSolarBatchForm(id);}
async function deleteFundRecord(collection,id){if(state.profile?.role==='accountant'){const row=fundRows(collection).find(x=>x.id===id);if(row)await createApprovalRequest('delete',orgDoc(collection,id),{},row);return;}if(!can('admin','manager')){toast('الحذف مخصص للمديرين فقط','error');return;}const labels={fundRevenues:'الإيراد',fundWithdrawals:'السحب من الصندوق',solarSales:'عملية بيع السولار',solarBatches:'دفعة السولار'};if(!confirm(`حذف ${labels[collection]||'السجل'}؟`))return;if(collection==='solarBatches'){const row=fundRows('solarBatches').find(x=>x.id===id);if(!row)return;const remaining=solarBatchTotal()-num(row.liters);if(remaining<solarSoldTotal()){toast(`لا يمكن حذف الدفعة. الدفعات المتبقية (${fmt(remaining,3)} لتر) أقل من السولار المباع (${fmt(solarSoldTotal(),3)} لتر).`,'error');return;}await fundRemove(collection,id);toast('تم حذف دفعة السولار');renderFund();return;}if(collection==='solarSales'){const row=fundRows('solarSales').find(x=>x.id===id);if(!row)return;const batch=writeBatch(db);batch.delete(orgDoc('solarSales',id));if(row.revenueId)batch.delete(orgDoc('fundRevenues',row.revenueId));await batch.commit();state.loaded=false;await loadData(true);toast('تم حذف بيع السولار وإرجاع الكمية للرصيد وتحديث الصندوق');renderFund();return;}if(collection==='fundRevenues'){const row=fundRows('fundRevenues').find(x=>x.id===id);if(row?.source==='solarSale'&&row?.solarSaleId){const sale=fundRows('solarSales').find(x=>x.id===row.solarSaleId);const batch=writeBatch(db);batch.delete(orgDoc('fundRevenues',id));if(sale)batch.delete(orgDoc('solarSales',sale.id));await batch.commit();state.loaded=false;await loadData(true);toast('تم حذف إيراد بيع السولار وتحديث الصندوق والكمية');renderFund();return;}}await fundRemove(collection,id);toast('تم الحذف وتحديث رصيد الصندوق');renderFund();}

onAuthStateChanged(auth,async user=>{state.user=user;$('#boot')?.classList.add('hidden');if(!user){$('#auth-screen')?.classList.remove('hidden');$('#app-shell')?.classList.add('hidden');return;}$('#auth-screen')?.classList.add('hidden');$('#app-shell')?.classList.remove('hidden');$('#userName').textContent=user.displayName||user.email||'المستخدم';$('#userAvatar').textContent=(user.displayName||user.email||'م').slice(0,1);$('#userRole').textContent='جارٍ التحقق…';try{state.profile=await ensureProfile();$('#userRole').textContent=roleName(state.profile.role);if(state.profile.role==='pending'){renderPending();return;}await loadData(true);await ensureSolarBatchMigration();await ensureDefaults();refreshResidentAccountSelect();await navigate('dashboard');}catch(e){console.error(e);$('#app').innerHTML=`<section class="panel" style="max-width:820px;margin:40px auto"><h2>تعذر تحميل البيانات</h2><p class="muted">${safe(e?.message||'تحقق من Firestore Rules وAuthorized Domains وإعدادات Firebase.')}</p></section>`;}});

async function deletePayment(id){if(state.profile?.role==='accountant'){const p=(state.data.payments||[]).find(x=>x.id===id);if(p){await createApprovalRequest('delete',orgDoc('payments',id),{},p);}return;}if(!can('admin','manager')){toast('الحذف مخصص للمديرين','error');return;}const p=(state.data.payments||[]).find(x=>x.id===id);if(!p)return;if(!confirm(`حذف الدفعة بمبلغ ${money(p.amount)}؟`))return;const ops=[b=>b.delete(orgDoc('payments',id))];for(const l of (state.data.ledger||[]).filter(x=>x.referenceId===id&&x.transactionType==='PAYMENT'))ops.push(b=>b.delete(orgDoc('ledger',l.id)));await commitOps(ops);await addAudit('حذف','payments',id,`حذف دفعة بمبلغ ${money(p.amount)}`);state.loaded=false;await loadData(true);toast('تم حذف الدفعة');renderPayments();}

async function deleteDebt(id){if(state.profile?.role==='accountant'){const d=(state.data.debts||[]).find(x=>x.id===id);if(d){await createApprovalRequest('delete',orgDoc('debts',id),{},d);}return;}if(!can('admin','manager')){toast('الحذف مخصص للمديرين','error');return;}const d=(state.data.debts||[]).find(x=>x.id===id);if(!d)return;if(!confirm(`حذف الدين بمبلغ ${money(d.amount)}؟`))return;const ops=[b=>b.delete(orgDoc('debts',id))];for(const l of (state.data.ledger||[]).filter(x=>x.referenceId===id&&x.transactionType==='DEBT'))ops.push(b=>b.delete(orgDoc('ledger',l.id)));await commitOps(ops);await addAudit('حذف','debts',id,`حذف دين بمبلغ ${money(d.amount)}`);state.loaded=false;await loadData(true);toast('تم حذف الدين');renderDebts();}

async function deleteSubscriber(id){
  if(state.profile?.role==='accountant'){const s=(state.data.subscribers||[]).find(x=>x.id===id);if(s)await createApprovalRequest('delete',orgDoc('subscribers',id),{},s);return;}
  if(!can('admin','manager')){toast('حذف السكان مخصص للمدير','error');return;}
  const s=(state.data.subscribers||[]).find(x=>x.id===id);if(!s)return;
  const hasFinance=(state.data.ledger||[]).some(x=>x.subscriberId===id)||(state.data.payments||[]).some(x=>x.subscriberId===id)||(state.data.debts||[]).some(x=>x.subscriberId===id);
  if(hasFinance){toast('هذا الساكن لديه تاريخ مالي. استخدم الأرشفة أو احذف حركاته المالية أولًا.','error');return;}
  if(!confirm(`حذف ${s.name} نهائيًا؟ سيتم حذف بياناته المرتبطة التي لا تحمل حركات مالية.`))return;
  const ops=[b=>b.delete(orgDoc('subscribers',id))];
  for(const m of (state.data.meters||[]).filter(x=>x.subscriberId===id))ops.push(b=>b.delete(orgDoc('meters',m.id)));
  for(const r of (state.data.readings||[])){const m=(state.data.meters||[]).find(x=>x.id===r.meterId);if(m?.subscriberId===id)ops.push(b=>b.delete(orgDoc('readings',r.id)));}
  const seed=(INITIAL_DATA.subscribers||[]).find(x=>x.code===s.code);if(seed)ops.push(b=>b.set(orgDoc('seedDeletes',`subscribers__${seed.id}`),{key:seedDeleteKey('subscribers',seed.id),deletedAt:serverTimestamp(),deletedBy:state.user.uid}));
  await commitOps(ops);await addAudit('حذف','subscribers',id,`حذف الساكن ${s.name||''}`);state.loaded=false;await loadData(true);toast('تم حذف الساكن');renderSubscribers();
}
async function deleteBuilding(id){
  if(state.profile?.role==='accountant'){const b=(state.data.buildings||[]).find(x=>sameId(x.id,id));if(b)await createApprovalRequest('delete',orgDoc('buildings',id),{},b);return;}
  if(!can('admin','manager')){toast('حذف البنايات مخصص للمديرين','error');return;}
  const b=(state.data.buildings||[]).find(x=>sameId(x.id,id));if(!b)return;
  const units=(state.data.units||[]).filter(u=>sameId(u.buildingId,id)||sameId(findBuildingRef(u.buildingId)?.id,id));
  const unitIds=units.map(u=>u.id);
  const linkedSubs=(state.data.subscribers||[]).filter(s=>{const u=unitForSub(s);return u&&unitIds.some(uid=>sameId(uid,u.id));});
  const financialSubs=linkedSubs.filter(s=>(state.data.ledger||[]).some(x=>sameId(x.subscriberId,s.id))||(state.data.payments||[]).some(x=>sameId(x.subscriberId,s.id))||(state.data.debts||[]).some(x=>sameId(x.subscriberId,s.id)));
  if(linkedSubs.length){
    toast(`لا يمكن حذف ${b.name}: عليها ${linkedSubs.length} ساكن/سكان مرتبطين. انقل السكان أو احذفهم بالطريقة الآمنة أولًا.`,'error');return;
  }
  if(financialSubs.length){
    toast('لا يمكن حذف البناية لأن لها تاريخًا ماليًا مرتبطًا بالسكان.','error');return;
  }
  const serviceRows=(state.data.ledger||[]).filter(x=>unitIds.some(uid=>{const sub=linkedSubs.find(s=>sameId(s.id,x.subscriberId));return !!sub&&sameId(sub.unitId,uid);}));
  if(serviceRows.length){toast('لا يمكن حذف البناية لأن عليها حركات خدمات مرتبطة.','error');return;}
  if(!confirm(`حذف البناية «${b.name}»؟ سيتم حذف وحداتها الفارغة فقط. لا يمكن التراجع من داخل الموقع.`))return;
  const ops=[batch=>batch.delete(orgDoc('buildings',b.id))];
  for(const u of units) ops.push(batch=>batch.delete(orgDoc('units',u.id)));
  const seed=(INITIAL_DATA.buildings||[]).find(x=>x.id===b.id||String(x.code||'')===String(b.code||''));
  if(seed) ops.push(batch=>batch.set(orgDoc('seedDeletes',`buildings__${seed.id}`),{key:seedDeleteKey('buildings',seed.id),deletedAt:serverTimestamp(),deletedBy:state.user.uid}));
  for(const u of units){const seedU=(INITIAL_DATA.units||[]).find(x=>x.id===u.id||String(x.code||'')===String(u.code||''));if(seedU) ops.push(batch=>batch.set(orgDoc('seedDeletes',`units__${seedU.id}`),{key:seedDeleteKey('units',seedU.id),deletedAt:serverTimestamp(),deletedBy:state.user.uid}));}
  await commitOps(ops);await addAudit('حذف','buildings',id,`حذف البناية ${b.name||''}`);state.loaded=false;await loadData(true);toast(`تم حذف البناية ${b.name}`);renderSubscribers();
}

async function deleteReading(id){if(state.profile?.role==='accountant'){const r=(state.data.readings||[]).find(x=>x.id===id);if(r)await createApprovalRequest('delete',orgDoc('readings',id),{},r);return;}if(!can('admin','manager')){toast('الحذف مخصص للمديرين','error');return;}const r=(state.data.readings||[]).find(x=>x.id===id);if(!r)return;if(!confirm('حذف هذه القراءة؟ سيتم أيضًا حذف حركة المياه المرتبطة بها إن وجدت.'))return;const ops=[b=>b.delete(orgDoc('readings',id))];for(const l of (state.data.ledger||[]).filter(x=>x.referenceId===id&&x.transactionType==='WATER'))ops.push(b=>b.delete(orgDoc('ledger',l.id)));await commitOps(ops);await addAudit('حذف','readings',id,'حذف قراءة مياه');state.loaded=false;await loadData(true);toast('تم حذف القراءة');renderReadings();}

async function deleteExternalWaterSummary(pid){if(state.profile?.role==='accountant'){const r=waterSummaryForPeriod(pid).find(x=>x.key==='external'||x.type==='external');if(r)await createApprovalRequest('delete',orgDoc('waterSummary',r.id),{},r);return;}if(!can('admin','manager')){toast('الحذف مخصص للمديرين','error');return;}const r=waterSummaryForPeriod(pid).find(x=>x.key==='external'||x.type==='external');if(!r)return;if(!confirm('حذف قراءة الخارجي لهذا الأسبوع؟'))return;await fsDeleteDoc(orgDoc('waterSummary',r.id));removeLocal('waterSummary',r.id);toast('تم حذف قراءة الخارجي');renderReadings();}

async function deleteEnergyReading(id){if(state.profile?.role==='accountant'){const r=(state.data.energyReadings||[]).find(x=>x.id===id);if(r)await createApprovalRequest('delete',orgDoc('energyReadings',id),{},r);return;}if(!can('admin','manager')){toast('الحذف مخصص للمديرين','error');return;}if(!confirm('حذف قراءة الكهرباء؟'))return;await fsDeleteDoc(orgDoc('energyReadings',id));removeLocal('energyReadings',id);toast('تم حذف قراءة الكهرباء');renderEnergy();}

async function deleteSource(id){if(state.profile?.role==='accountant'){const r=(state.data.sources||[]).find(x=>x.id===id);if(r)await createApprovalRequest('delete',orgDoc('sources',id),{},r);return;}if(!can('admin','manager')){toast('حذف المصدر مخصص للمدير','error');return;}const src=(state.data.sources||[]).find(x=>x.id===id);if(!src)return;if(!confirm(`حذف المصدر ${src.name}؟ سيتم حذف قراءات هذا المصدر أيضًا.`))return;const ops=[b=>b.delete(orgDoc('sources',id))];for(const r of (state.data.energyReadings||[]).filter(x=>x.sourceId===id))ops.push(b=>b.delete(orgDoc('energyReadings',r.id)));await commitOps(ops);state.loaded=false;await loadData(true);toast('تم حذف المصدر');renderEnergy();}

async function deleteMember(uid){if(!can('admin')){toast('حذف المستخدمين مخصص للمدير','error');return;}if(uid===state.user.uid){toast('لا يمكنك حذف حسابك من هنا.','error');return;}const m=(state.data.members||[]).find(x=>x.id===uid);if(!m)return;if(!confirm(`حذف المستخدم ${m.displayName||m.email||''}؟`))return;await fsDeleteDoc(orgDoc('members',uid));removeLocal('members',uid);await addAudit('حذف','members',uid,`حذف المستخدم ${m.email||m.displayName||''}`);toast('تم حذف المستخدم');renderSettings();}
async function deleteAllExceptSelected(selectedId){
  if(!can('admin')){toast('هذه العملية للمدير فقط','error');return;}
  if(!selectedId){toast('اختر الأسبوع الذي تريد الإبقاء عليه','error');return;}
  const keep=periodById(selectedId);if(!keep)return;
  const olds=(state.data.periods||[]).filter(p=>p.id!==selectedId);
  if(!olds.length){toast('لا توجد أسابيع أخرى للحذف');return;}
  if(!confirm(`سيتم حذف ${olds.length} أسبوعًا وكل بياناتها، وسيبقى «${keep.label||'الأسبوع المختار'}» فقط.\n\nهل أنت متأكد؟`))return;
  for(const p of olds) await deleteWeek(p.id);
  toast('تم حذف كل الأسابيع ما عدا الأسبوع المختار');
  state.periodId=selectedId;
  state.loaded=false;await loadData(true);renderSettings();
}
async function deleteOldPeriodsExceptCurrent(){
  // Backward-compatible helper: keep the currently selected week, not a hard-coded date.
  return deleteAllExceptSelected(state.periodId);
}

async function deleteUnit(id){if(state.profile?.role==='accountant'){const r=(state.data.units||[]).find(x=>x.id===id);if(r)await createApprovalRequest('delete',orgDoc('units',id),{},r);return;}if(!can('admin','manager')){toast('حذف الوحدات مخصص للمدير','error');return;}const u=(state.data.units||[]).find(x=>x.id===id);if(!u)return;if((state.data.subscribers||[]).some(s=>s.unitId===id)){toast('لا يمكن حذف الوحدة قبل نقل/حذف الساكن المرتبط بها.','error');return;}if(!confirm(`حذف الوحدة ${u.code||''}؟`))return;const ops=[b=>b.delete(orgDoc('units',id))];const seed=(INITIAL_DATA.units||[]).find(x=>x.id===id);if(seed)ops.push(b=>b.set(orgDoc('seedDeletes',`units__${seed.id}`),{key:seedDeleteKey('units',seed.id),deletedAt:serverTimestamp(),deletedBy:state.user.uid}));await commitOps(ops);await addAudit('حذف','units',id,`حذف الوحدة ${u.code||''}`);state.loaded=false;await loadData(true);toast('تم حذف الوحدة');renderSubscribers();}
async function deleteServiceLedger(id){return;}

async function deleteCost(id){
  if(state.profile?.role==='accountant'){const r=(state.data.costs||[]).find(x=>x.id===id);if(r)await createApprovalRequest('delete',orgDoc('costs',id),{},r);return;}
  if(!can('admin','manager')){toast('الحذف مخصص للمديرين','error');return;}
  const c=(state.data.costs||[]).find(x=>x.id===id);if(!c)return;
  if(!confirm(`حذف المصروف «${c.description||c.type||''}» بمبلغ ${money(c.amount)}؟ سيتم أيضًا حذف الرسوم التي أنشأها هذا المصروف.`))return;
  const ops=[b=>b.delete(orgDoc('costs',id))];
  for(const l of (state.data.ledger||[]).filter(x=>x.referenceId===id))ops.push(b=>b.delete(orgDoc('ledger',l.id)));
  await commitOps(ops);await addAudit('حذف','costs',id,`حذف مصروف ${c.description||c.type||''}`);state.loaded=false;await loadData(true);toast('تم حذف المصروف وحركاته');renderCosts();
}

async function deletePeriodicServices(pid){
  if(!can('admin','manager')){toast('الحذف مخصص للمديرين','error');return;}
  const rows=(state.data.ledger||[]).filter(x=>x.periodId===pid&&x.transactionType==='SERVICE'&&['GUARD','PUMP_INSURANCE'].includes(x.serviceCode));
  if(!rows.length){toast('لا توجد خدمات حارس أو تأمين لحذفها');return;}
  if(!confirm(`حذف ${rows.length} حركة من خدمات الحارس وتأمين الغاطس لهذا الأسبوع؟`))return;
  await commitOps(rows.map(r=>b=>b.delete(orgDoc('ledger',r.id))));state.loaded=false;await loadData(true);toast('تم حذف خدمات الحارس وتأمين الغاطس');renderPeriods();
}
