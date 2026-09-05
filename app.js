import {
  auth, provider, onAuthStateChanged, signInWithPopup, signOut, ADMIN_EMAIL,
  db, orgRef, orgCollection, orgDoc, collection, doc, getDoc, getDocs,
  setDoc, addDoc, updateDoc, deleteDoc, query, orderBy, limit, where,
  writeBatch, serverTimestamp
} from './firebase-init.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const fmt = (n, d=2) => new Intl.NumberFormat('ar-PS',{maximumFractionDigits:d}).format(Number(n||0));
const money = (n) => `${fmt(n,2)} ₪`;
const n = (v) => (v === '' || v == null ? 0 : Number(v));
const safe = (v) => String(v ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const dateNow = () => new Date().toISOString().slice(0,10);
const state = { view:'dashboard', user:null, profile:null, data:{} };
let loading = false;

const COLLECTIONS = ['buildings','units','subscribers','meters','periods','readings','sources','energyReadings','costs','payments','ledger'];

function setTitle(title, subtitle){ $('#page-title').textContent=title; $('#page-subtitle').textContent=subtitle; }
function toast(msg, type='success'){ const el=$('#toast'); el.textContent=msg; el.className=`toast ${type}`; clearTimeout(toast.t); toast.t=setTimeout(()=>el.className='toast hidden',3200); }
function openModal(html){ $('#modalBody').innerHTML=html; $('#modal').classList.remove('hidden'); $('#modal').setAttribute('aria-hidden','false'); }
function closeModal(){ $('#modal').classList.add('hidden'); $('#modal').setAttribute('aria-hidden','true'); $('#modalBody').innerHTML=''; }
$('#modalClose').onclick=closeModal; $('#modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal()});

const roleLabel = {admin:'مدير النظام', manager:'مدير', accountant:'محاسب', operator:'موظف قراءات', viewer:'مشاهد', resident:'ساكن', pending:'بانتظار الموافقة'};
function can(...roles){ return roles.includes(state.profile?.role); }
function badge(text,type='info'){ return `<span class="badge ${type}">${safe(text)}</span>`; }
function statusBadge(status){ const map={Draft:['مسودة','warning'],DataEntry:['إدخال','warning'],Calculated:['محسوبة','info'],Review:['مراجعة','warning'],Approved:['معتمدة','success'],Closed:['مغلقة','success'],Pending:['بانتظار','warning'],Entered:['مدخلة','success'],Invalid:['غير صالحة','danger'],NoConsumption:['لا استهلاك','info']}; const x=map[status]||[status,'info']; return badge(x[0],x[1]); }
function fmtDate(v){ return v ? String(v).split('-').reverse().join('/') : '-'; }
function empty(title, msg){ return `<div class="empty"><div class="empty-icon">⌂</div><strong>${safe(title)}</strong><span>${safe(msg)}</span></div>`; }

async function signIn(){
  $('#auth-error').classList.add('hidden');
  try{ await signInWithPopup(auth, provider); }catch(e){ $('#auth-error').textContent = e?.message || 'تعذر تسجيل الدخول'; $('#auth-error').classList.remove('hidden'); }
}
$('#googleLogin').onclick=signIn;
$('#logoutBtn').onclick=()=>signOut(auth);
$('#refreshBtn').onclick=()=>route(state.view,true);
$('#mobileMenu').onclick=()=>$('#sidebar').classList.toggle('open');
$('#quickPaymentBtn').onclick=()=>showPaymentForm();
$('#quickPeriod').onclick=()=>showPeriodForm();

document.addEventListener('click',e=>{ const btn=e.target.closest('[data-view]'); if(!btn)return; const v=btn.dataset.view; $$('.nav-item').forEach(x=>x.classList.toggle('active',x===btn)); $('#sidebar').classList.remove('open'); route(v); });

async function ensureProfile(){
  const ref=doc(orgCollection('members'),state.user.uid); const snap=await getDoc(ref);
  const isRootAdmin=(state.user.email||'').toLowerCase()===ADMIN_EMAIL.toLowerCase();
  if(snap.exists()){
    const existing={id:snap.id,...snap.data()};
    if(isRootAdmin && existing.role!=='admin'){
      await updateDoc(ref,{role:'admin',updatedAt:serverTimestamp(),promotedBy:'root-email'});
      existing.role='admin';
    }
    state.profile=existing; return state.profile;
  }
  const role=isRootAdmin?'admin':'pending';
  await setDoc(ref,{displayName:state.user.displayName||'مستخدم جديد',email:state.user.email||'',photoURL:state.user.photoURL||'',role,createdAt:serverTimestamp()});
  state.profile={id:state.user.uid,displayName:state.user.displayName,email:state.user.email,photoURL:state.user.photoURL,role}; return state.profile;
}

async function ensureBootstrap(){
  const meta=await getDoc(doc(orgRef,'meta','setup'));
  if(meta.exists()) return;
  if(state.profile?.role!=='admin') return;
  await setDoc(doc(orgRef,'meta','setup'),{initialized:true,ownerUid:state.user.uid,createdAt:serverTimestamp()},{merge:false});
  const countSnap=await getDocs(query(orgCollection('buildings'),limit(1)));
  if(!countSnap.empty) return;
  try{
    const seed=await fetch('./data_seed.json').then(r=>r.json());
    const batch=writeBatch(db);
    batch.set(orgDoc('buildings','b1'),{code:'1',name:'البناية الأولى',active:true});
    batch.set(orgDoc('buildings','b2'),{code:'2',name:'البناية الثانية',active:true});
    let idx=1;
    for(const row of (seed.subscribers||[])){
      const [code,name,buildingCode,floor,type,phone,_active,guardFee,pumpInsurance,notes]=row;
      const sid=`s_${String(idx).padStart(3,'0')}`;
      const uid=`u_${buildingCode}_${String(code).replace(/[^\w-]/g,'_')}`;
      const mid=`m_${sid}`;
      batch.set(orgDoc('units',uid),{buildingId:String(buildingCode)==='2'?'b2':'b1',code:String(code),floor:String(floor??''),unitNumber:String(code),active:true});
      batch.set(orgDoc('subscribers',sid),{code:String(code),name:String(name).trim(),phone:phone?String(phone):'',type:type||'داخلي',unitId:uid,active:true,defaultGuardFee:n(guardFee),defaultPumpInsurance:n(pumpInsurance),notes:notes||'',createdAt:serverTimestamp()});
      batch.set(orgDoc('meters',mid),{meterCode:`W-${code}`,meterType:'مياه',subscriberId:sid,unitId:uid,active:true});
      idx++;
    }
    batch.set(orgDoc('sources','src_abu_zaid'),{name:'مولد أبو زايد',sourceType:'مولد',active:true});
    batch.set(orgDoc('sources','src_swaisy'),{name:'مولد السويسي',sourceType:'مولد',active:true});
    batch.set(orgDoc('sources','src_external'),{name:'مولد خارجي',sourceType:'مولد خارجي',active:true});
    await batch.commit();
  }catch(e){ console.warn('Bootstrap seed skipped',e); }
}

async function getList(name, qy){
  const ref=orgCollection(name);
  const snap= qy ? await getDocs(qy(ref)) : await getDocs(ref);
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function refreshBase(){
  if(loading)return; loading=true;
  try{
    const entries=await Promise.all(COLLECTIONS.map(async c=>[c,await getList(c)]));
    state.data=Object.fromEntries(entries);
  } finally { loading=false; }
}
function buildingName(id){ return state.data.buildings?.find(b=>b.id===id)?.name || '-'; }
function unitForSub(s){ return state.data.units?.find(u=>u.id===s.unitId); }
function subscriberRow(s){ const u=unitForSub(s); const bal=(state.data.ledger||[]).filter(t=>t.subscriberId===s.id).reduce((a,t)=>a+n(t.debit)-n(t.credit),0); return {...s,unitCode:u?.code||'-',buildingName:buildingName(u?.buildingId),balance:bal}; }
function subscriberBalance(id){ return (state.data.ledger||[]).filter(t=>t.subscriberId===id).reduce((a,t)=>a+n(t.debit)-n(t.credit),0); }
function periodData(pid){ const period=state.data.periods?.find(p=>p.id===pid); const readings=(state.data.readings||[]).filter(r=>r.periodId===pid); return {period,readings}; }

async function createPeriod(label,startDate,endDate){
  const pRef=doc(orgCollection('periods')); const p={label,startDate,endDate,status:'Draft',createdAt:serverTimestamp(),createdBy:state.user.uid};
  const batch=writeBatch(db); batch.set(pRef,p);
  for(const m of state.data.meters||[]){
    const prev=[...(state.data.readings||[])].filter(r=>r.meterId===m.id&&r.currentReading!=null).sort((a,b)=>String(b.periodId).localeCompare(String(a.periodId)))[0]?.currentReading ?? null;
    batch.set(doc(orgCollection('readings')), {periodId:pRef.id,meterId:m.id,previousReading:prev,currentReading:null,consumption:null,unitPrice:null,chargeAmount:null,status:'Pending',updatedAt:serverTimestamp()});
  }
  await batch.commit(); toast('تم فتح الأسبوع الجديد'); closeModal(); await route('readings');
}

function renderDashboard(){
  const subs=(state.data.subscribers||[]).filter(s=>s.active); const periods=[...(state.data.periods||[])].sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate))); const latest=periods[0];
  const charges=(state.data.ledger||[]).reduce((a,t)=>a+n(t.debit),0), payments=(state.data.ledger||[]).reduce((a,t)=>a+n(t.credit),0), outstanding=charges-payments;
  $('#app').innerHTML=`
  <section class="welcome-card"><div class="welcome-copy"><div class="pill">مرحبًا ${safe(state.user?.displayName?.split(' ')[0]||'بك')} <span>●</span></div><h2>خلّي الحسابات تمشي معك، مش العكس.</h2><p>كل أسبوع له خطته، وكل ساكن له كشف واضح. البرنامج يحسب ويجمع ويحتفظ بالتاريخ.</p><div class="welcome-actions"><button class="btn btn-primary" id="dashReadings">إدخال قراءات الماء</button><button class="btn btn-light" id="dashReport">عرض التقارير</button></div></div><div class="welcome-orb"><div class="orb-inner">أ</div></div></section>
  <section class="stats-grid"><div class="stat-card"><span>السكان النشطون</span><strong>${fmt(subs.length,0)}</strong><small>مشترك</small></div><div class="stat-card"><span>إجمالي الاستحقاقات</span><strong>${money(charges)}</strong><small>من سجل الحسابات</small></div><div class="stat-card"><span>إجمالي الدفعات</span><strong>${money(payments)}</strong><small>المبالغ المستلمة</small></div><div class="stat-card highlight"><span>المتبقي</span><strong>${money(outstanding)}</strong><small>بحاجة للتحصيل</small></div></section>
  <section class="split-grid"><div class="panel"><div class="panel-head"><div><h3>ابدأ الأسبوع من هنا</h3><p>${latest?`آخر أسبوع: ${safe(latest.label||fmtDate(latest.startDate))}`:'لا يوجد أسبوع بعد'}</p></div><button class="text-btn" id="newWeekInline">+ أسبوع جديد</button></div><div class="step-list"><div class="step-row"><div class="step-icon">١</div><div><b>افتح الأسبوع</b><span>يتم تجهيز القراءات السابقة تلقائيًا.</span></div></div><div class="step-row"><div class="step-icon">٢</div><div><b>أدخل القراءة الحالية</b><span>يمكنك تعديل السابقة والحالية بكل سهولة.</span></div></div><div class="step-row"><div class="step-icon">٣</div><div><b>احسب وراجع</b><span>سعر الكوب والمبالغ تحسب تلقائيًا.</span></div></div></div></div><div class="panel"><div class="panel-head"><div><h3>الفترة الأخيرة</h3><p>اضغط للدخول مباشرة.</p></div></div>${latest?`<button class="period-card" id="latestPeriod"><div class="period-date">${fmtDate(latest.startDate)}</div><div><b>${safe(latest.label||'أسبوع')}</b><div class="muted">${statusBadge(latest.status||'Draft')}</div></div><span>←</span></button>`:empty('لا يوجد أسبوع','أنشئ أول أسبوع للبدء.')}</div></section>
  <div class="data-trust"><div class="trust-icon">☁</div><div><b>بياناتك صارت مشتركة بين الحسابات المصرح لها.</b><span>الحفظ في Firestore، مع ذاكرة محلية تلقائية لتسريع الاستخدام ودعم العمل عند انقطاع الاتصال.</span></div></div>`;
  $('#dashReadings').onclick=()=>latest?route('readings'):showPeriodForm(); $('#dashReport').onclick=()=>route('reports'); $('#newWeekInline').onclick=showPeriodForm; if(latest)$('#latestPeriod').onclick=()=>route('readings',false,latest.id);
}

function renderSubscribers(){
  setTitle('السكان','عدّل أي بيانات أساسية بدون أن يضيع تاريخ الحساب.'); const rows=state.data.subscribers||[];
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>السكان</h2><p>كل ساكن له ملف مستقل وحساب يمكن الرجوع إليه بأي وقت.</p></div><div class="panel-actions"><button class="btn btn-soft" id="exportSubs">↓ تصدير Excel</button><button class="btn btn-primary" id="newSub">＋ إضافة ساكن</button></div></div><div class="toolbar"><input id="subSearch" class="search" placeholder="اكتب الاسم أو الكود أو الهاتف..."><div class="toolbar-note">${fmt(rows.filter(x=>x.active).length,0)} ساكن نشط</div></div><div class="table-wrap"><table class="table"><thead><tr><th>الكود</th><th>الاسم</th><th>البناية</th><th>الوحدة</th><th>الهاتف</th><th>الرصيد</th><th>الحالة</th><th></th></tr></thead><tbody id="subRows">${rowsHtml(rows)}</tbody></table></div></section>`;
  $('#newSub').onclick=()=>showSubForm(); $('#exportSubs').onclick=()=>exportSubscribers(rows.map(subscriberRow)); $('#subSearch').oninput=e=>$('#subRows').innerHTML=rowsHtml(rows.filter(s=>[s.name,s.code,s.phone].some(v=>String(v||'').toLowerCase().includes(e.target.value.toLowerCase()))));
}
function rowsHtml(rows){ if(!rows.length)return `<tr><td colspan="8">${empty('لا يوجد سكان','أضف أول ساكن للبدء.')}</td></tr>`; return rows.map(s=>{const r=subscriberRow(s);return `<tr><td><span class="code-chip">${safe(s.code)}</span></td><td><button class="link-btn" data-account="${s.id}">${safe(s.name)}</button></td><td>${safe(r.buildingName)}</td><td>${safe(r.unitCode)}</td><td>${safe(s.phone||'-')}</td><td class="money-cell">${money(r.balance)}</td><td>${s.active?badge('نشط','success'):badge('مؤرشف','warning')}</td><td><div class="row-actions"><button class="mini-btn" data-edit-sub="${s.id}">تعديل</button>${can('admin','manager')?`<button class="mini-btn danger" data-delete-sub="${s.id}">${s.active?'أرشفة':'حذف'}</button>`:''}</div></td></tr>`}).join(''); }

function showSubForm(id){
  const s=id?state.data.subscribers.find(x=>x.id===id):null; const units=state.data.units||[]; const buildings=state.data.buildings||[]; const u=s?unitForSub(s):null;
  openModal(`<h2>${s?'تعديل بيانات الساكن':'إضافة ساكن جديد'}</h2><p class="modal-lead">الاسم والرقم والوحدة يمكن تعديلهم لاحقًا بدون التأثير على سجل الحساب.</p><div class="form-grid"><div class="field"><label>الاسم</label><input id="fName" value="${safe(s?.name||'')}"></div><div class="field"><label>الكود</label><input id="fCode" value="${safe(s?.code||'')}"></div><div class="field"><label>رقم الهاتف</label><input id="fPhone" value="${safe(s?.phone||'')}"></div><div class="field"><label>البناية</label><select id="fBuilding"><option value="">اختر البناية</option>${buildings.map(b=>`<option value="${b.id}" ${(u?.buildingId===b.id)?'selected':''}>${safe(b.name)}</option>`).join('')}</select></div><div class="field"><label>رقم الوحدة</label><input id="fUnit" value="${safe(u?.code||'')}" placeholder="مثلاً 1-03"></div><div class="field"><label>الدور</label><input id="fFloor" value="${safe(u?.floor||'')}"></div><div class="field"><label>خدمة الحارس</label><input id="fGuard" type="number" step="0.01" value="${s?.defaultGuardFee??0}"></div><div class="field"><label>تأمين الغاطس</label><input id="fPump" type="number" step="0.01" value="${s?.defaultPumpInsurance??0}"></div><div class="field full"><label>ملاحظات</label><textarea id="fNotes">${safe(s?.notes||'')}</textarea></div></div><div class="actions"><button class="btn btn-primary" id="saveSub">حفظ البيانات</button><button class="btn btn-ghost" id="cancelModal">إلغاء</button></div>`);
  $('#cancelModal').onclick=closeModal; $('#saveSub').onclick=async()=>{
    const code=$('#fCode').value.trim(),name=$('#fName').value.trim(); if(!code||!name){toast('اكتب الاسم والكود أولًا','error');return}
    const buildingId=$('#fBuilding').value; let unitId=u?.id||null;
    const unitCode=$('#fUnit').value.trim(); const floor=$('#fFloor').value.trim();
    const unit=units.find(x=>x.id===unitId);
    if(unitCode && buildingId){ const match=units.find(x=>x.buildingId===buildingId&&x.code===unitCode&&x.id!==unitId); if(match) unitId=match.id; else {const ur=doc(orgCollection('units')); await setDoc(ur,{buildingId,code:unitCode,floor,unitNumber:unitCode,active:true}); unitId=ur.id;} }
    if(s){ await updateDoc(orgDoc('subscribers',s.id),{code,name,phone:$('#fPhone').value.trim(),unitId,defaultGuardFee:n($('#fGuard').value),defaultPumpInsurance:n($('#fPump').value),notes:$('#fNotes').value.trim(),updatedAt:serverTimestamp(),updatedBy:state.user.uid}); toast('تم تعديل بيانات الساكن'); }
    else { if(rowsHaveCode(code)){toast('هذا الكود مستخدم لسكان آخر','error');return;} const sr=doc(orgCollection('subscribers')); await setDoc(sr,{code,name,phone:$('#fPhone').value.trim(),type:'داخلي',unitId,active:true,defaultGuardFee:n($('#fGuard').value),defaultPumpInsurance:n($('#fPump').value),notes:$('#fNotes').value.trim(),createdAt:serverTimestamp(),createdBy:state.user.uid}); const mr=doc(orgCollection('meters')); await setDoc(mr,{meterCode:`W-${code}`,meterType:'مياه',subscriberId:sr.id,unitId,active:true}); toast('تمت إضافة الساكن'); }
    await route('subscribers'); closeModal();
  };
}
function rowsHaveCode(code){return (state.data.subscribers||[]).some(s=>s.code===code);}

async function archiveOrDeleteSubscriber(id){
  const s=state.data.subscribers.find(x=>x.id===id); if(!s)return;
  if(s.active){ if(!confirm(`سيتم أرشفة ${s.name} وإخفاؤه من السكان النشطين مع الحفاظ على كل الحسابات والتاريخ.\n\nمتأكد؟`))return; await updateDoc(orgDoc('subscribers',id),{active:false,archivedAt:serverTimestamp(),archivedBy:state.user.uid}); toast('تمت أرشفة الساكن'); }
  else {
    const hasLedger=(state.data.ledger||[]).some(t=>t.subscriberId===id); if(hasLedger){toast('لا يمكن الحذف النهائي لأن لهذا الساكن سجل حسابات. الأرشفة تحافظ على التاريخ.','error');return;}
    if(!confirm(`حذف نهائي لـ ${s.name}؟ هذا لا يمكن التراجع عنه.`))return; await deleteDoc(orgDoc('subscribers',id)); for(const m of (state.data.meters||[]).filter(x=>x.subscriberId===id))await deleteDoc(orgDoc('meters',m.id)); toast('تم الحذف النهائي'); }
  await route('subscribers');
}

function renderReadings(){
  setTitle('قراءات الماء','اختَر الأسبوع، وعدّل السابقة والحالية بنفس الشاشة.'); const periods=[...(state.data.periods||[])].sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate))); const selectedId=state.selectedPeriodId||periods[0]?.id; state.selectedPeriodId=selectedId;
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>القراءات</h2><p>لا تحتاج آلة حاسبة: اكتب الرقم، والبرنامج يحسب الاستهلاك والقيمة.</p></div><div class="panel-actions"><button class="btn btn-ghost" id="exportReading">↓ تصدير Excel</button><button class="btn btn-primary" id="newWeek">＋ أسبوع جديد</button></div></div><div class="period-tabs">${periods.map(p=>`<button class="period-tab ${p.id===selectedId?'active':''}" data-period-tab="${p.id}"><b>${safe(p.label||'أسبوع')}</b><span>${fmtDate(p.startDate)}</span></button>`).join('')}${!periods.length?empty('لا توجد أسابيع','ابدأ بفتح أسبوع جديد.'):''}</div>${selectedId?readingEditor(selectedId):''}</section>`;
  $('#newWeek').onclick=showPeriodForm; $$('.period-tab').forEach(b=>b.onclick=()=>{state.selectedPeriodId=b.dataset.periodTab;renderReadings()}); if(selectedId){$('#exportReading').onclick=()=>exportPeriod(selectedId); bindReadingSave(selectedId);}
}
function readingEditor(pid){ const p=state.data.periods.find(x=>x.id===pid); const readings=(state.data.readings||[]).filter(r=>r.periodId===pid); const joined=readings.map(r=>{const m=state.data.meters.find(x=>x.id===r.meterId);const s=state.data.subscribers.find(x=>x.id===m?.subscriberId);return {...r,meter:m,subscriber:s}}).filter(x=>x.subscriber&&x.subscriber.active);
  const complete=joined.filter(x=>x.currentReading!=null&&x.previousReading!=null&&n(x.currentReading)>=n(x.previousReading)).length;
  return `<div class="reading-toolbar"><div><div class="period-title">${safe(p?.label||'الأسبوع')}</div><div class="muted">${fmtDate(p?.startDate)} · ${statusBadge(p?.status||'Draft')}</div></div><div class="reading-progress">${complete} / ${joined.length} قراءات مكتملة</div></div><div class="notice">القراءة السابقة <b>قابلة للتعديل</b>. أول مرة تستخدم النظام؟ اكتبها يدويًا بدون مشكلة. القراءة الحالية هي الرقم الجديد، والاستهلاك يحسب تلقائيًا.</div><div class="table-wrap"><table class="table reading-table"><thead><tr><th>الكود</th><th>الاسم</th><th>السابقة</th><th>الحالية</th><th>الاستهلاك</th><th>القيمة</th><th>الحالة</th></tr></thead><tbody>${joined.map(x=>`<tr data-reading-row="${x.id}"><td><span class="code-chip">${safe(x.subscriber.code)}</span></td><td class="strong">${safe(x.subscriber.name)}</td><td><input class="reading-prev" data-id="${x.id}" value="${x.previousReading??''}" inputmode="decimal"></td><td><input class="reading-current" data-id="${x.id}" value="${x.currentReading??''}" inputmode="decimal"></td><td class="calc-consumption">${x.consumption!=null?fmt(x.consumption,3):'—'}</td><td class="calc-charge">${x.chargeAmount!=null?money(x.chargeAmount):'—'}</td><td class="calc-status">${statusBadge(x.status||'Pending')}</td></tr>`).join('')}</tbody></table></div><div class="reading-bottom"><div><b>احفظ الكل</b><span>يمكنك تعديل أي قراءة ثم حفظها مرة واحدة.</span></div><button class="btn btn-primary" id="saveReadings">حفظ كل القراءات</button></div>`;
}
async function bindReadingSave(pid){
  $$('.reading-prev,.reading-current').forEach(inp=>inp.addEventListener('input',()=>updateRowPreview(inp.closest('tr'),pid)));
  $('#saveReadings').onclick=async()=>{
    const batch=writeBatch(db); const rows=$$('.reading-table tbody tr'); let invalid=0;
    for(const row of rows){ const rid=row.dataset.readingRow; const r=state.data.readings.find(x=>x.id===rid); if(!r)continue; const prev=$(`.reading-prev[data-id="${rid}"]`).value,current=$(`.reading-current[data-id="${rid}"]`).value; const changes={previousReading:prev===''?null:n(prev),currentReading:current===''?null:n(current),updatedAt:serverTimestamp(),updatedBy:state.user.uid}; if(prev!==''&&current!==''&&n(current)<n(prev))invalid++; batch.update(orgDoc('readings',rid),changes); }
    if(invalid){toast('هناك قراءات حالية أقل من السابقة، راجعها قبل الحفظ.','error');return;} await batch.commit(); toast('تم حفظ القراءات'); await refreshBase(); renderReadings();
  };
}
function updateRowPreview(row){const p=n(row.querySelector('.reading-prev').value),c=n(row.querySelector('.reading-current').value);const has=row.querySelector('.reading-current').value!==''&&row.querySelector('.reading-prev').value!=='';const con=has?(c-p)/1000:null;row.querySelector('.calc-consumption').textContent=con==null?'—':fmt(con,3); if(con!=null&&con<0)row.querySelector('.calc-status').innerHTML=statusBadge('Invalid'); else row.querySelector('.calc-status').innerHTML=statusBadge(con==null?'Pending':con===0?'NoConsumption':'Entered'); row.querySelector('.calc-charge').textContent='سيحسب بعد الاعتماد'; }

function showPeriodForm(){ openModal(`<h2>فتح أسبوع جديد</h2><p class="modal-lead">سيأخذ البرنامج آخر قراءة معروفة لكل عداد ويضعها كـ«سابقة»، ويمكنك تعديلها يدويًا.</p><div class="form-grid"><div class="field"><label>اسم الأسبوع</label><input id="pLabel" value="أسبوع ${dateNow().split('-').reverse().join('/')}"></div><div class="field"><label>تاريخ الأسبوع</label><input id="pStart" type="date" value="${dateNow()}"></div><div class="field"><label>حتى تاريخ</label><input id="pEnd" type="date" value="${dateNow()}"></div></div><div class="actions"><button class="btn btn-primary" id="createWeek">فتح الأسبوع</button><button class="btn btn-ghost" id="cancelWeek">إلغاء</button></div>`); $('#cancelWeek').onclick=closeModal; $('#createWeek').onclick=()=>createPeriod($('#pLabel').value.trim()||`أسبوع ${fmtDate($('#pStart').value)}`,$('#pStart').value,$('#pEnd').value); }

function renderCosts(){setTitle('المصاريف','سجّل تكلفة حقيقية، ومصدرها، وهل تُوزع على السكان.'); const costs=state.data.costs||[]; $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>المصاريف التشغيلية</h2><p>كهرباء، سولار، مولد خارجي، صيانة، طوارئ وأي بند آخر.</p></div><button class="btn btn-primary" id="addCost">＋ إضافة مصروف</button></div><div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>الفترة</th><th>النوع</th><th>البيان</th><th>المبلغ</th><th>التوزيع</th></tr></thead><tbody>${costs.length?costs.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(c=>`<tr><td>${fmtDate(c.date)}</td><td>${safe(state.data.periods.find(p=>p.id===c.periodId)?.label||'-')}</td><td>${safe(c.type||'أخرى')}</td><td>${safe(c.description||'-')}</td><td class="money-cell">${money(c.amount)}</td><td>${badge(c.allocation||'غير محدد','info')}</td></tr>`).join(''):`<tr><td colspan="6">${empty('لا توجد مصاريف','أضف أول مصروف تشغيلي.')}</td></tr>`}</tbody></table></div></section>`; $('#addCost').onclick=showCostForm; }
function showCostForm(){const periods=state.data.periods||[];openModal(`<h2>إضافة مصروف</h2><p class="modal-lead">المصروف لا يُحمّل على السكان إلا إذا حددت له طريقة توزيع.</p><div class="form-grid"><div class="field"><label>التاريخ</label><input id="cDate" type="date" value="${dateNow()}"></div><div class="field"><label>الفترة</label><select id="cPeriod"><option value="">بدون فترة</option>${periods.map(p=>`<option value="${p.id}">${safe(p.label)}</option>`).join('')}</select></div><div class="field"><label>النوع</label><select id="cType"><option>كهرباء</option><option>سولار/وقود</option><option>مولد خارجي</option><option>نقل</option><option>صيانة</option><option>طوارئ</option><option>أخرى</option></select></div><div class="field"><label>المبلغ</label><input id="cAmount" type="number" step="0.01"></div><div class="field"><label>طريقة التوزيع</label><select id="cAlloc"><option>على استهلاك الماء</option><option>بالتساوي على السكان</option><option>على بناية محددة</option><option>على مجموعة محددة</option><option>لا يوزع</option></select></div><div class="field full"><label>البيان</label><input id="cDesc" placeholder="مثلاً: استئجار مولد خارجي بسبب العطل"></div></div><div class="actions"><button class="btn btn-primary" id="saveCost">حفظ المصروف</button></div>`); $('#saveCost').onclick=async()=>{await addDoc(orgCollection('costs'),{date:$('#cDate').value,periodId:$('#cPeriod').value||null,type:$('#cType').value,amount:n($('#cAmount').value),allocation:$('#cAlloc').value,description:$('#cDesc').value.trim(),createdBy:state.user.uid,createdAt:serverTimestamp()});toast('تم حفظ المصروف');closeModal();await route('costs');}; }

function renderPayments(){setTitle('الدفعات','سجّل أي دفعة، حتى لو كانت تحت الحساب.'); const payments=state.data.payments||[]; $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>الدفعات</h2><p>كل دفعة تصبح حركة واضحة في كشف الحساب.</p></div><button class="btn btn-primary" id="addPayment">＋ تسجيل دفعة</button></div><div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>الساكن</th><th>المبلغ</th><th>الطريقة</th><th>رقم الإيصال</th><th>البيان</th></tr></thead><tbody>${payments.length?payments.slice().sort((a,b)=>String(b.paymentDate).localeCompare(String(a.paymentDate))).map(p=>`<tr><td>${fmtDate(p.paymentDate)}</td><td class="strong">${safe(state.data.subscribers.find(s=>s.id===p.subscriberId)?.name||'-')}</td><td class="money-cell">${money(p.amount)}</td><td>${safe(p.method||'نقدي')}</td><td>${safe(p.receiptNumber||'-')}</td><td>${safe(p.note||'-')}</td></tr>`).join(''):`<tr><td colspan="6">${empty('لا توجد دفعات','سجّل أول دفعة من الزر أعلاه.')}</td></tr>`}</tbody></table></div></section>`; $('#addPayment').onclick=showPaymentForm; }
function showPaymentForm(){const subs=(state.data.subscribers||[]).filter(s=>s.active);openModal(`<h2>تسجيل دفعة</h2><p class="modal-lead">الدفعة قد تكون عن فاتورة محددة أو دفعة تحت الحساب.</p><div class="form-grid"><div class="field full"><label>الساكن</label><select id="paySub"><option value="">اختر الساكن</option>${subs.map(s=>`<option value="${s.id}">${safe(s.code)} — ${safe(s.name)}</option>`).join('')}</select></div><div class="field"><label>المبلغ</label><input id="payAmount" type="number" step="0.01"></div><div class="field"><label>التاريخ</label><input id="payDate" type="date" value="${dateNow()}"></div><div class="field"><label>طريقة الدفع</label><select id="payMethod"><option>نقدي</option><option>تحويل بنكي</option><option>أخرى</option></select></div><div class="field"><label>رقم الإيصال</label><input id="payReceipt"></div><div class="field full"><label>ملاحظة</label><input id="payNote" placeholder="مثلاً: دفعة تحت الحساب"></div></div><div class="actions"><button class="btn btn-primary" id="savePay">حفظ الدفعة</button></div>`); $('#savePay').onclick=async()=>{const sid=$('#paySub').value,amount=n($('#payAmount').value);if(!sid||amount<=0){toast('اختر الساكن واكتب مبلغًا صحيحًا','error');return;}const batch=writeBatch(db);const pr=doc(orgCollection('payments'));batch.set(pr,{subscriberId:sid,amount,paymentDate:$('#payDate').value,method:$('#payMethod').value,receiptNumber:$('#payReceipt').value.trim(),note:$('#payNote').value.trim(),createdBy:state.user.uid,createdAt:serverTimestamp()});const tr=doc(orgCollection('ledger'));batch.set(tr,{subscriberId:sid,periodId:null,transactionType:'PAYMENT',debit:0,credit:amount,description:`دفعة ${$('#payReceipt').value.trim()||pr.id}`,createdAt:serverTimestamp(),createdBy:state.user.uid});await batch.commit();toast('تم تسجيل الدفعة');closeModal();await route('payments');};}

function renderReports(){setTitle('التقارير','نزّل البيانات التي تحتاجها بصيغة Excel، أو راجعها على الشاشة.');const periods=[...(state.data.periods||[])].sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate)));const subs=(state.data.subscribers||[]).map(subscriberRow);$('#app').innerHTML=`<section class="report-hero"><div><span class="eyebrow">التقارير والتصدير</span><h2>البيانات ملكك، والبرنامج يجعل الوصول لها سهلًا.</h2><p>كل زر هنا ينتج ملف Excel فعلي من قاعدة بيانات العمارة.</p></div><div class="report-badge">XLSX</div></section><section class="report-grid"><div class="report-card"><div class="report-icon">♙</div><h3>تصدير السكان</h3><p>الأسماء، الأكواد، الوحدات، الهواتف والأرصدة.</p><button class="btn btn-primary" id="repSubs">↓ تنزيل Excel</button></div><div class="report-card"><div class="report-icon">◫</div><h3>تقرير قراءات أسبوع</h3><p>السابق، الحالي، الاستهلاك وقيمة المياه.</p><select id="repPeriod"><option value="">اختر أسبوعًا</option>${periods.map(p=>`<option value="${p.id}">${safe(p.label)} — ${fmtDate(p.startDate)}</option>`).join('')}</select><button class="btn btn-primary" id="repPeriodBtn">↓ تنزيل Excel</button></div><div class="report-card"><div class="report-icon">₪</div><h3>تقرير الدفعات</h3><p>كل الدفعات المسجلة مع الإيصالات والبيانات.</p><button class="btn btn-primary" id="repPayments">↓ تنزيل Excel</button></div><div class="report-card"><div class="report-icon">▤</div><h3>تقرير الأرصدة</h3><p>كشف سريع بأرصدة السكان الحالية.</p><button class="btn btn-primary" id="repBalances">↓ تنزيل Excel</button></div></section><section class="panel report-check"><div class="panel-head"><div><h3>تنبيه مهم</h3><p>ملفات Excel أصبحت ناتجة مباشرة من قاعدة البيانات السحابية، وليس من LocalStorage.</p></div></div><div class="data-trust"><div class="trust-icon">✓</div><div><b>أي تعديل يظهر عند إعادة تحميل الموقع.</b><span>يمكن استخدام نفس بيانات العمارة من أكثر من حساب Google مصرح له.</span></div></div></section>`; $('#repSubs').onclick=()=>exportSubscribers(subs); $('#repPeriodBtn').onclick=()=>{const p=$('#repPeriod').value;if(!p){toast('اختر أسبوعًا أولًا','error');return;}exportPeriod(p)}; $('#repPayments').onclick=()=>exportPayments(state.data.payments||[]); $('#repBalances').onclick=()=>exportBalances(subs);}

function exportXlsx(rows, sheet, filename){ if(!window.XLSX){toast('مكتبة Excel لم تُحمّل بعد. جرّب مرة ثانية.','error');return;} const wb=XLSX.utils.book_new(); const ws=XLSX.utils.json_to_sheet(rows); ws['!cols']=[...Array(Math.max(6,Object.keys(rows[0]||{}).length))].map(()=>({wch:20})); XLSX.utils.book_append_sheet(wb,ws,sheet.slice(0,31)); XLSX.writeFile(wb,filename);toast('تم تنزيل ملف Excel بنجاح'); }
function exportSubscribers(rows){exportXlsx(rows.map(s=>({الكود:s.code,الاسم:s.name,البناية:s.buildingName,الوحدة:s.unitCode,الهاتف:s.phone||'',الرصيد:Number(s.balance||0)})),'السكان','سكان_عمارة_الأمين.xlsx');}
function exportBalances(rows){exportXlsx(rows.map(s=>({الكود:s.code,الاسم:s.name,البناية:s.buildingName,الوحدة:s.unitCode,الرصيد:Number(s.balance||0)})),'الأرصدة','أرصدة_عمارة_الأمين.xlsx');}
function exportPayments(rows){exportXlsx(rows.map(p=>({التاريخ:p.paymentDate,الساكن:state.data.subscribers.find(s=>s.id===p.subscriberId)?.name||'',المبلغ:Number(p.amount||0),الطريقة:p.method||'',رقم_الإيصال:p.receiptNumber||'',ملاحظة:p.note||''})),'الدفعات','دفعات_عمارة_الأمين.xlsx');}
function exportPeriod(pid){const p=state.data.periods.find(x=>x.id===pid);const rows=(state.data.readings||[]).filter(r=>r.periodId===pid).map(r=>{const m=state.data.meters.find(x=>x.id===r.meterId);const s=state.data.subscribers.find(x=>x.id===m?.subscriberId);return{الكود:s?.code||'',الاسم:s?.name||'',القراءة_السابقة:r.previousReading??'',القراءة_الحالية:r.currentReading??'',الاستهلاك:r.consumption??'',قيمة_المياه:r.chargeAmount??'',الحالة:r.status||''}}); exportXlsx(rows,'قراءات','قراءات_'+String(p?.label||pid).replace(/[^\d\w\u0600-\u06FF]+/g,'_')+'.xlsx'); }

function renderSettings(){setTitle('الإعدادات','إدارة الحساب، النسخ الاحتياطي، والصلاحيات.');const members=state.data.members||[];$('#app').innerHTML=`<section class="split-grid"><div class="panel"><div class="panel-head"><div><h2>حسابك</h2><p>دخول Google المرتبط بالنظام.</p></div></div><div class="profile-box"><div class="avatar big">${safe((state.user.displayName||'م').slice(0,1))}</div><div><h3>${safe(state.user.displayName||'-')}</h3><p>${safe(state.user.email||'-')}</p>${badge(roleLabel[state.profile.role]||state.profile.role,'info')}</div></div><button class="btn btn-ghost" id="logoutSettings">تسجيل الخروج</button></div><div class="panel"><div class="panel-head"><div><h2>المستخدمون</h2><p>تظهر حسابات Google التي طلبت الدخول. المدير يحدد الصلاحية.</p></div></div><div class="member-list">${members.length?members.map(m=>`<div class="member-row"><div class="avatar small">${safe((m.displayName||'م').slice(0,1))}</div><div class="member-main"><b>${safe(m.displayName||'-')}</b><span>${safe(m.email||'')}</span></div>${can('admin')?`<select data-role-user="${m.id}">${Object.entries(roleLabel).filter(([k])=>k!=='resident').map(([k,v])=>`<option value="${k}" ${m.role===k?'selected':''}>${v}</option>`).join('')}</select>`:badge(roleLabel[m.role]||m.role,'info')}</div>`).join(''):`${empty('لا يوجد مستخدمون آخرون','عند أول تسجيل دخول سيظهر المستخدم هنا.')}`}</div></div></section><section class="panel danger-panel"><div><h3>حذف أسبوع</h3><p>الحذف هنا نهائي ويزيل الفترة وقراءات المياه والحركات المائية المرتبطة بها.</p></div><select id="deletePeriodSelect"><option value="">اختر أسبوعًا</option>${(state.data.periods||[]).map(p=>`<option value="${p.id}">${safe(p.label)} — ${fmtDate(p.startDate)}</option>`).join('')}</select><button class="btn btn-danger" id="deletePeriod">حذف الأسبوع المحدد</button></section>`;
  $('#logoutSettings').onclick=()=>signOut(auth); if(can('admin'))$$('[data-role-user]').forEach(sel=>sel.onchange=()=>updateRole(sel.dataset.roleUser,sel.value)); $('#deletePeriod').onclick=()=>deletePeriod($('#deletePeriodSelect').value);
}
async function updateRole(uid,role){if(uid===state.user.uid&&role!=='admin'){toast('لا تغيّر دور حساب المدير الحالي من هنا.','error');await renderSettings();return;}await updateDoc(orgDoc('members',uid),{role,updatedAt:serverTimestamp(),updatedBy:state.user.uid});toast('تم تحديث الصلاحية');await refreshBase();renderSettings();}
async function deletePeriod(pid){if(!pid)return;const p=state.data.periods.find(x=>x.id===pid);if(!p)return;if(!can('admin','manager')){toast('ليس لديك صلاحية حذف أسبوع','error');return;}if(!confirm(`حذف ${p.label||'الأسبوع'} نهائيًا؟\n\nسيتم حذف القراءات والحركات المائية المرتبطة به.`))return;const batch=writeBatch(db);batch.delete(orgDoc('periods',pid));for(const r of (state.data.readings||[]).filter(x=>x.periodId===pid))batch.delete(orgDoc('readings',r.id));for(const t of (state.data.ledger||[]).filter(x=>x.periodId===pid&&x.transactionType==='WATER'))batch.delete(orgDoc('ledger',t.id));for(const c of (state.data.costs||[]).filter(x=>x.periodId===pid))batch.delete(orgDoc('costs',c.id));await batch.commit();toast('تم حذف الأسبوع');await route('settings');}

async function openAccount(id){const s=state.data.subscribers.find(x=>x.id===id);if(!s)return;const ledger=(state.data.ledger||[]).filter(t=>t.subscriberId===id).slice().reverse();const readings=(state.data.readings||[]).filter(r=>state.data.meters.find(m=>m.id===r.meterId)?.subscriberId===id).slice().reverse();openModal(`<div class="account-head"><div><div class="code-chip">${safe(s.code)}</div><h2>${safe(s.name)}</h2><p>${safe(subscriberRow(s).buildingName)} · ${safe(subscriberRow(s).unitCode)} · ${safe(s.phone||'بدون هاتف')}</p></div><div class="account-balance"><span>الرصيد الحالي</span><b>${money(subscriberBalance(id))}</b></div></div><div class="account-tabs"><button class="account-tab active">الحساب</button><button class="account-tab">القراءات</button></div><div class="account-section"><h3>آخر الحركات</h3><div class="ledger-list">${ledger.length?ledger.slice(0,12).map(t=>`<div class="ledger-row"><div><b>${safe(t.description||t.transactionType)}</b><span>${safe(t.createdAt?.toDate?.().toLocaleDateString('ar-PS')||'')}</span></div><strong class="${n(t.credit)>0?'credit':''}">${n(t.credit)>0?'-':''}${money(Math.abs(n(t.debit)-n(t.credit)))}</strong></div>`).join(''):`${empty('لا توجد حركات','سيظهر هنا الماء والدفعات والخدمات عند إضافتها.')}`}</div></div><div class="account-section"><h3>آخر القراءات</h3><div class="table-wrap"><table class="table"><thead><tr><th>الفترة</th><th>السابقة</th><th>الحالية</th><th>الاستهلاك</th><th>القيمة</th></tr></thead><tbody>${readings.slice(0,8).map(r=>`<tr><td>${safe(state.data.periods.find(p=>p.id===r.periodId)?.label||'-')}</td><td>${r.previousReading??'-'}</td><td>${r.currentReading??'-'}</td><td>${r.consumption!=null?fmt(r.consumption,3):'-'}</td><td>${r.chargeAmount!=null?money(r.chargeAmount):'-'}</td></tr>`).join('')}</tbody></table></div></div>`);}

async function route(view='dashboard',force=false,periodId){
  if(!state.profile || state.profile.role==='pending'){renderPending();return;}
  if(view==='readings'&&periodId)state.selectedPeriodId=periodId; state.view=view; $$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===view)); await refreshBase();
  const renders={dashboard:renderDashboard,subscribers:renderSubscribers,readings:renderReadings,costs:renderCosts,payments:renderPayments,reports:renderReports,settings:renderSettings}; (renders[view]||renderDashboard)();
}
function renderPending(){setTitle('بانتظار الموافقة','تم تسجيل حسابك، لكن المدير لم يمنحك صلاحية بعد.');$('#app').innerHTML=`<section class="pending-card"><div class="pending-icon">⌛</div><h2>حسابك جاهز، وباقي الموافقة</h2><p>أنت مسجل باسم <b>${safe(state.user.displayName||'المستخدم')}</b>. اطلب من مدير النظام تفعيل حسابك من الإعدادات.</p><button class="btn btn-primary" onclick="location.reload()">تحديث الحالة</button></section>`;}

document.addEventListener('click',e=>{const a=e.target.closest('[data-edit-sub]');if(a)showSubForm(a.dataset.editSub);const d=e.target.closest('[data-delete-sub]');if(d)archiveOrDeleteSubscriber(d.dataset.deleteSub);const ac=e.target.closest('[data-account]');if(ac)openAccount(ac.dataset.account);});

onAuthStateChanged(auth, async user=>{
  state.user=user;
  if(!user){$('#auth-screen').classList.remove('hidden');$('#app-shell').classList.add('hidden');return;}
  $('#auth-screen').classList.add('hidden');$('#app-shell').classList.remove('hidden');$('#userName').textContent=user.displayName||user.email||'المستخدم';$('#userRole').textContent='جارٍ التحقق...';$('#userAvatar').textContent=(user.displayName||user.email||'م').slice(0,1);
  try{state.profile=await ensureProfile();$('#userRole').textContent=roleLabel[state.profile.role]||state.profile.role;if(state.profile.role==='admin')await ensureBootstrap();await refreshBase();const members=await getList('members');state.data.members=members;await route('dashboard');}
  catch(e){ console.error(e); $('#app').innerHTML=`<section class="panel error-panel"><h2>تعذر تحميل البيانات</h2><p>${safe(e?.message||'تحقق من إعدادات Firebase وFirestore Rules.')}</p></section>`; }
});
