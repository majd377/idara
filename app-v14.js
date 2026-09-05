(async function(){

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = {user:null,profile:null,view:'dashboard',periodId:null,data:{},loaded:false,loading:false};
const ROLES={admin:'مدير النظام',manager:'مدير',accountant:'محاسب',operator:'موظف قراءات',viewer:'مشاهد',resident:'ساكن',pending:'بانتظار الموافقة'};
const COLLECTIONS=['buildings','units','subscribers','meters','periods','readings','sources','energyReadings','costs','payments','ledger','members','waterSummary'];
const VIEW_NAMES={dashboard:'الرئيسية',periods:'الأسابيع والحساب',readings:'قراءات الماء',energy:'الكهرباء والمولدات',costs:'المصاريف والطوارئ',subscribers:'السكان والوحدات',payments:'الدفعات والأرصدة',reports:'التقارير والتصدير',settings:'الإعدادات والصلاحيات',guide:'دليل استخدام عملي'};
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

async function withTimeout(promise, ms, label){
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('انتهت مهلة الاتصال أثناء تحميل '+label)),ms);});
  try{return await Promise.race([promise,timeout]);}finally{clearTimeout(timer);}
}
async function loadData(force=false){
  if(state.loaded&&!force)return;
  if(state.loading)return;
  state.loading=true;
  try{
    const results=await Promise.all(COLLECTIONS.map(async c=>{
      const snap=await withTimeout(getDocs(orgCollection(c)),10000,c);
      return [c,snap.docs.map(d=>({id:d.id,...d.data()}))];
    }));
    for(const [c,rows] of results)state.data[c]=rows;
    state.loaded=true;
  }finally{state.loading=false;}
}

async function ensureProfile(){
  const ref=orgDoc('members',state.user.uid);const snap=await getDoc(ref);if(snap.exists())return {id:snap.id,...snap.data()};
  const isAdmin=(state.user.email||'').toLowerCase()===ADMIN_EMAIL.toLowerCase();const role=isAdmin?'admin':'pending';
  const data={displayName:state.user.displayName||'مستخدم',email:state.user.email||'',photoURL:state.user.photoURL||'',role,createdAt:serverTimestamp()};await setDoc(ref,data);return {id:ref.id,displayName:data.displayName,email:data.email,photoURL:data.photoURL,role};
}
async function ensureDefaults(){
  if(!can('admin'))return;
  if(!(state.data.buildings||[]).length){
    const b1=doc(orgCollection('buildings'));const b2=doc(orgCollection('buildings'));
    await Promise.all([setDoc(b1,{name:'البناية الأولى',code:'1',active:true,createdAt:serverTimestamp()}),setDoc(b2,{name:'البناية الثانية',code:'2',active:true,createdAt:serverTimestamp()})]);
  }
  if(!(state.data.sources||[]).length){for(const [name,code] of [['مولد أبو زايد','abu-zayid'],['مولد السويسي','sweissi']]){const r=doc(orgCollection('sources'));await setDoc(r,{name,code,type:'مولد',active:true,createdAt:serverTimestamp()});}}
  state.loaded=false;await loadData(true);
}

function setTitle(title,subtitle){$('#page-title').textContent=title;$('#page-subtitle').textContent=subtitle;$('#crumbText').textContent=VIEW_NAMES[state.view]||title;}
function setActiveNav(){ $$('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view)); }
function render(){const fn={dashboard:renderDashboard,periods:renderPeriods,readings:renderReadings,energy:renderEnergy,costs:renderCosts,subscribers:renderSubscribers,payments:renderPayments,reports:renderReports,settings:renderSettings,guide:showGuide}[state.view]||renderDashboard;fn();}
async function navigate(view,periodId=null,force=false){if(!state.profile||state.profile.role==='pending'){renderPending();return;}state.view=view;if(periodId)state.periodId=periodId;setActiveNav();await loadData(force);render();$('#sidebar')?.classList.remove('open');}

function latestPeriods(){return [...(state.data.periods||[])].sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate)));}
function currentTotals(pid){
  const p=periodById(pid), rs=readingsForPeriod(pid), ers=energyForPeriod(pid), cs=costsForPeriod(pid);
  const breakdown=buildingWaterBreakdown(pid);
  const external=waterSummaryForPeriod(pid).find(r=>r.key==='external'||r.type==='external');
  const externalWater=external&&external.currentReading!=null&&external.previousReading!=null?Math.max(0,num(external.currentReading)-num(external.previousReading))/1000:0;
  const water=breakdown.buildings.reduce((a,b)=>a+b.total,0)+externalWater;
  const energy=ers.reduce((a,r)=>a+(r.cost!=null?num(r.cost):(Math.max(0,num(r.currentReading)-num(r.previousReading))*num(r.pricePerKwh))),0);
  const extras=cs.reduce((a,c)=>a+(c.direction==='credit'?-num(c.amount):num(c.amount)),0);
  const net=energy+extras;const raw=water>0?net/water:0;const applied=raw>0?Math.ceil(raw):0;
  return {period:p,readings:rs,energyReadings:ers,costs:cs,waterTotal:water,energyCost:energy,extraCost:extras,netCost:net,rawPrice:raw,appliedPrice:applied,waterBreakdown:breakdown,externalWater};
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
  const existing=waterSummaryForPeriod(pid);if(existing.length>=3)return;
  if(!can('admin','manager','accountant','operator'))return;
  const p=periodById(pid);if(!p)return;
  const buildings=[...(state.data.buildings||[])];const targets=[...buildings.map(b=>({key:`building:${b.id}`,label:b.name,type:'building',buildingId:b.id})),{key:'external',label:'الخارجي',type:'external',buildingId:null}];
  const batch=writeBatch(db);
  for(const target of targets){if(existing.some(x=>x.key===target.key))continue;const prior=[...(state.data.waterSummary||[])].filter(x=>x.key===target.key&&x.currentReading!=null&&x.periodId!==pid).map(x=>({x,p:periodById(x.periodId)})).filter(x=>x.p).sort((a,b)=>String(b.p.startDate).localeCompare(String(a.p.startDate)))[0]?.x?.currentReading??null;batch.set(doc(orgCollection('waterSummary')),{periodId:pid,key:target.key,label:target.label,type:target.type,buildingId:target.buildingId,previousReading:prior,currentReading:null,consumption:null,status:'Pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:state.user.uid});}
  await batch.commit();state.loaded=false;await loadData(true);
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
  if(!can('admin','manager','accountant','operator')){toast('لا تملك صلاحية فتح أسبوع','error');return;}
  const start=$('#pStart').value,end=$('#pEnd').value,label=$('#pLabel').value.trim()||`أسبوع ${fmtDate(start)}`;
  if(!start||!end){toast('حدد تاريخ بداية ونهاية الأسبوع','error');return;}
  if(end<start){toast('تاريخ النهاية يجب أن يكون بعد البداية','error');return;}
  const ref=doc(orgCollection('periods'));
  const p={label,startDate:start,endDate:end,status:'Draft',waterUnitPrice:$('#pPrice').value===''?null:num($('#pPrice').value),createdAt:serverTimestamp(),createdBy:state.user.uid};
  const batch=writeBatch(db);batch.set(ref,p);
  const meters=state.data.meters||[];
  for(const m of meters){
    const history=(state.data.readings||[]).filter(r=>r.meterId===m.id&&r.currentReading!=null).map(r=>({r,p:periodById(r.periodId)})).filter(x=>x.p).sort((a,b)=>String(b.p.startDate).localeCompare(String(a.p.startDate)));
    const prev=history[0]?.r.currentReading??null;
    batch.set(doc(orgCollection('readings')),{periodId:ref.id,meterId:m.id,previousReading:prev,currentReading:null,consumption:null,unitPrice:p.waterUnitPrice,chargeAmount:null,status:'Pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  }
  for(const src of (state.data.sources||[])){
    const history=(state.data.energyReadings||[]).filter(r=>r.sourceId===src.id&&r.currentReading!=null).map(r=>({r,p:periodById(r.periodId)})).filter(x=>x.p).sort((a,b)=>String(b.p.startDate).localeCompare(String(a.p.startDate)));
    const prev=history[0]?.r.currentReading??null;
    batch.set(doc(orgCollection('energyReadings')),{periodId:ref.id,sourceId:src.id,previousReading:prev,currentReading:null,consumption:null,pricePerKwh:src.defaultRate??null,cost:null,status:'Pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  }
  // Master water meters / totals: building 1, building 2, and external.
  const buildings=[...(state.data.buildings||[])];
  const summaryTargets=[...buildings.map(b=>({key:`building:${b.id}`,label:b.name,type:'building',buildingId:b.id})),{key:'external',label:'الخارجي',type:'external',buildingId:null}];
  for(const target of summaryTargets){
    const prior=[...(state.data.waterSummary||[])].filter(x=>x.key===target.key&&x.currentReading!=null&&x.periodId!==ref.id).map(x=>({x,p:periodById(x.periodId)})).filter(x=>x.p).sort((a,b)=>String(b.p.startDate).localeCompare(String(a.p.startDate)))[0]?.x?.currentReading ?? null;
    const wr=doc(orgCollection('waterSummary'));
    batch.set(wr,{periodId:ref.id,key:target.key,label:target.label,type:target.type,buildingId:target.buildingId,previousReading:prior,currentReading:null,consumption:null,status:'Pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:state.user.uid});
  }
  await batch.commit();state.loaded=false;await loadData(true);state.periodId=ref.id;closeModal();toast('تم فتح الأسبوع مع تجهيز قراءات الكهرباء والماء الإجمالي والسكان');await navigate('periods',ref.id,true);
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
  }).join('')}</tbody></table></div><div class="master-water-footer"><span>سعر الكوب يعتمد على إجمالي السكان في البنايتين + الخارجي</span><span class="autosave-note">الحفظ التلقائي مفعّل</span><button class="btn soft" id="saveWaterSummary">حفظ الآن</button></div></div>`;
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
  const rows=readingsForPeriod(pid).map(r=>{const m=(state.data.meters||[]).find(x=>x.id===r.meterId);const s=subscriberByMeter(m);return{s,r,m}}).filter(x=>x.s&&x.s.active!==false).sort((a,b)=>String(a.s.code).localeCompare(String(b.s.code),undefined,{numeric:true}));
  const p=periodById(pid);return `<div class="table-wrap"><table class="table" style="min-width:980px"><thead><tr><th>الكود</th><th>الساكن</th><th>البناية / النوع</th><th>القراءة السابقة</th><th>القراءة الحالية</th><th>السحب</th><th>سعر الكوب</th><th>القيمة</th><th>الحالة</th></tr></thead><tbody>${rows.length?rows.map(x=>{const {s,r}=x;const cons=r.currentReading!=null&&r.previousReading!=null?Math.max(0,num(r.currentReading)-num(r.previousReading))/1000:null;const price=r.unitPrice??p.waterUnitPrice??'';const charge=cons!=null&&price!==''?cons*num(price):null;return `<tr data-rid="${r.id}"><td><span class="code">${safe(s.code)}</span></td><td><b>${safe(s.name)}</b></td><td>${s.type==='خارجي'?'<span class="badge warn">خارجي</span>':safe(subscriberRow(s).buildingName)}</td><td><input class="reading-input prev" type="number" step="0.001" value="${r.previousReading??''}"></td><td><input class="reading-input current" type="number" step="0.001" value="${r.currentReading??''}"></td><td class="cons">${cons==null?'—':fmt(cons,3)}</td><td><input class="reading-input price" type="number" step="0.01" value="${price}"></td><td class="charge">${charge==null?'—':money(charge)}</td><td class="status">${r.currentReading==null?'<span class="badge warn">بانتظار</span>':((num(r.currentReading)<num(r.previousReading))?'<span class="badge danger">تحقق</span>':'<span class="badge ok">جاهزة</span>')}</td></tr>`}).join(''):`<tr><td colspan="9">${empty('لا توجد قراءات','تأكد من وجود سكان وعدادات قبل فتح الأسبوع.')}</td></tr>`}</tbody></table></div><div class="readings-actions"><span class="muted">حفظ القراءة لا يعتمد على حساب السعر؛ الحساب النهائي يتم من صفحة «الأسابيع والحساب».</span><button class="btn primary" id="saveReadings">حفظ كل القراءات</button></div>`;
}
function bindReadingInputs(pid){
  $$('.reading-input').forEach(inp=>inp.addEventListener('input',()=>{
    const tr=inp.closest('tr'),prev=tr.querySelector('.prev').value,cur=tr.querySelector('.current').value,price=tr.querySelector('.price').value;
    const cons=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev))/1000:null;
    tr.querySelector('.cons').textContent=cons==null?'—':fmt(cons,3);
    tr.querySelector('.charge').textContent=cons!=null&&price!==''?money(cons*num(price)):'—';
    tr.querySelector('.status').innerHTML=cur===''?'<span class="badge warn">بانتظار</span>':(num(cur)<num(prev)?'<span class="badge danger">تحقق</span>':'<span class="badge ok">جاهزة</span>');
    const id=tr.dataset.rid;
    queueAutoSave('reading-'+id,async()=>{
      if(cur!==''&&prev!==''&&num(cur)<num(prev))throw new Error('invalid');
      const consumption=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev))/1000:null;
      await updateDoc(orgDoc('readings',id),{previousReading:prev===''?null:num(prev),currentReading:cur===''?null:num(cur),consumption,unitPrice:price===''?null:num(price),chargeAmount:consumption!=null&&price!==''?consumption*num(price):null,status:cur===''?'Pending':'Entered',updatedAt:serverTimestamp(),updatedBy:state.user.uid});
    });
  }));
  $('#saveReadings').onclick=async()=>{
    const rows=$$('[data-rid]'),batch=writeBatch(db);
    for(const tr of rows){
      const prev=tr.querySelector('.prev').value,cur=tr.querySelector('.current').value,price=tr.querySelector('.price').value;
      if(cur!==''&&prev!==''&&num(cur)<num(prev)){toast('هناك قراءة حالية أقل من السابقة. أصلحها قبل الحفظ.','error');return;}
      const consumption=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev))/1000:null;
      batch.update(orgDoc('readings',tr.dataset.rid),{previousReading:prev===''?null:num(prev),currentReading:cur===''?null:num(cur),consumption,unitPrice:price===''?null:num(price),chargeAmount:consumption!=null&&price!==''?consumption*num(price):null,status:cur===''?'Pending':'Entered',updatedAt:serverTimestamp(),updatedBy:state.user.uid});
    }
    await batch.commit();state.loaded=false;await loadData(true);toast('تم حفظ كل القراءات');renderReadings();
  };
}

function renderEnergy(){
  setTitle('الكهرباء والمولدات','هنا تدخل القراءة السابقة والحالية وسعر الكيلو لكل مولد.');const periods=latestPeriods();if(!state.periodId)state.periodId=periods[0]?.id;const p=selectedPeriod();const sources=state.data.sources||[];const ers=p?energyForPeriod(p.id):[];
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>كهرباء المولدات</h2><p>القراءة الحالية − السابقة = الكيلو المستهلك، ثم × سعر الكيلو = التكلفة.</p></div><div class="panel-actions"><button class="btn soft" id="sourceManage">+ إضافة مصدر/مولد</button><button class="btn primary" id="energySave">حفظ القراءات</button></div></div>${!p?`<div class="reading-start"><div class="reading-start-icon">ϟ</div><div><h2>افتح أسبوعًا أولًا</h2><p>بعد فتحه ستظهر لك كل المولدات.</p><button class="btn primary" id="energyFirst">+ افتح أسبوعًا</button></div></div>`:`<div class="period-picker"><label>الأسبوع الحالي</label><select id="periodSelect" class="period-select">${periods.map(x=>`<option value="${x.id}" ${x.id===p.id?'selected':''}>${safe(x.label||'أسبوع')} — ${fmtDate(x.startDate)} إلى ${fmtDate(x.endDate)} — ${statusText(x.status||'Draft')}</option>`).join('')}</select></div><div class="section-note"><b>المعادلة:</b> (القراءة الحالية − السابقة) × سعر الكيلو = تكلفة المصدر. بعد الحفظ تظهر التكلفة تلقائيًا في حساب الأسبوع.</div><div class="table-wrap"><table class="table" style="min-width:900px"><thead><tr><th>المصدر</th><th>القراءة السابقة</th><th>القراءة الحالية</th><th>الاستهلاك</th><th>سعر الكيلو</th><th>التكلفة</th><th>الحالة</th></tr></thead><tbody>${ers.length?ers.map(r=>{const src=sources.find(s=>s.id===r.sourceId);const cons=r.currentReading!=null&&r.previousReading!=null?Math.max(0,num(r.currentReading)-num(r.previousReading)):null;const cost=cons!=null&&r.pricePerKwh!=null?cons*num(r.pricePerKwh):null;return `<tr data-eid="${r.id}"><td><b>${safe(src?.name||'مصدر محذوف')}</b></td><td><input class="reading-input eprev" type="number" step="0.001" value="${r.previousReading??''}"></td><td><input class="reading-input ecur" type="number" step="0.001" value="${r.currentReading??''}"></td><td class="econs">${cons==null?'—':fmt(cons,3)}</td><td><input class="reading-input erate" type="number" step="0.01" value="${r.pricePerKwh??''}"></td><td class="ecost">${cost==null?'—':money(cost)}</td><td class="estatus">${r.currentReading==null?'<span class="badge warn">بانتظار</span>':(num(r.currentReading)<num(r.previousReading)?'<span class="badge danger">تحقق</span>':'<span class="badge ok">جاهز</span>')}</td></tr>`}).join(''):`<tr><td colspan="7">${empty('لا توجد مصادر طاقة','أضف مولدًا أو مصدرًا ثم أنشئ أسبوعًا جديدًا.')}</td></tr>`}</tbody></table></div><div class="panel" style="margin-top:13px;background:#fbfcfb"><div class="panel-head"><div><h2>مصادر الطاقة</h2><p>هذه الأسماء ستظهر تلقائيًا في كل أسبوع جديد.</p></div></div><div class="members">${sources.map(src=>`<div class="member-row"><div class="avatar">ϟ</div><div class="member-info"><b>${safe(src.name)}</b><span>${safe(src.type||'مولد')} • ${src.defaultRate!=null?`السعر الافتراضي ${money(src.defaultRate)}`:'بدون سعر افتراضي'}</span></div><span class="badge ${src.active!==false?'ok':'warn'}">${src.active!==false?'فعال':'موقوف'}</span><button class="mini" data-edit-source="${src.id}">تعديل</button></div>`).join('')||empty('لا توجد مصادر','أضف أبو زايد أو السويسي أو مولدًا خارجيًا.')}</div></div>`}</section>`;
  $('#sourceManage').onclick=showSourceForm;$$('[data-edit-source]').forEach(b=>b.onclick=()=>showSourceForm(b.dataset.editSource));$('#energySave').onclick=()=>p?saveEnergy(p.id):null;if($('#energyFirst'))$('#energyFirst').onclick=showPeriodForm;$('#periodSelect')?.addEventListener('change',e=>navigate('energy',e.target.value));bindEnergyInputs();
}
function bindEnergyInputs(){
  $$('.eprev,.ecur,.erate').forEach(inp=>inp.addEventListener('input',()=>{
    const tr=inp.closest('tr'),prev=tr.querySelector('.eprev').value,cur=tr.querySelector('.ecur').value,rate=tr.querySelector('.erate').value;
    const cons=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev)):null;
    tr.querySelector('.econs').textContent=cons==null?'—':fmt(cons,3);
    tr.querySelector('.ecost').textContent=cons!=null&&rate!==''?money(cons*num(rate)):'—';
    tr.querySelector('.estatus').innerHTML=cur===''?'<span class="badge warn">بانتظار</span>':(num(cur)<num(prev)?'<span class="badge danger">تحقق</span>':'<span class="badge ok">جاهز</span>');
    queueAutoSave('energy-'+tr.dataset.eid,async()=>{
      if(cur!==''&&prev!==''&&num(cur)<num(prev))throw new Error('invalid');
      const c=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev)):null;
      await updateDoc(orgDoc('energyReadings',tr.dataset.eid),{previousReading:prev===''?null:num(prev),currentReading:cur===''?null:num(cur),pricePerKwh:rate===''?null:num(rate),consumption:c,cost:c!=null&&rate!==''?c*num(rate):null,status:cur===''?'Pending':'Entered',updatedAt:serverTimestamp(),updatedBy:state.user.uid});
    });
  }));
}

async function saveEnergy(pid){if(!can('admin','manager','accountant','operator')){toast('لا تملك صلاحية التعديل','error');return;}const batch=writeBatch(db);for(const tr of $$('[data-eid]')){const prev=tr.querySelector('.eprev').value,cur=tr.querySelector('.ecur').value,rate=tr.querySelector('.erate').value;if(cur!==''&&prev!==''&&num(cur)<num(prev)){toast('هناك قراءة كهرباء أقل من السابقة. أصلحها أولًا.','error');return;}const cons=cur!==''&&prev!==''?Math.max(0,num(cur)-num(prev)):null;batch.update(orgDoc('energyReadings',tr.dataset.eid),{previousReading:prev===''?null:num(prev),currentReading:cur===''?null:num(cur),pricePerKwh:rate===''?null:num(rate),consumption:cons,cost:cons!=null&&rate!==''?cons*num(rate):null,status:cur===''?'Pending':'Entered',updatedAt:serverTimestamp(),updatedBy:state.user.uid});}await batch.commit();state.loaded=false;await loadData(true);toast('تم حفظ قراءات الكهرباء');renderEnergy();}
function showSourceForm(id){const src=id?(state.data.sources||[]).find(x=>x.id===id):null;openModal(`<h2>${src?'تعديل المصدر':'إضافة مصدر / مولد'}</h2><p class="modal-lead">لا تربط النظام بعدد ثابت من المولدات؛ أضف أي مصدر مستقبلي.</p><div class="form-grid"><div class="field"><label>اسم المصدر</label><input id="sName" value="${safe(src?.name||'')}"></div><div class="field"><label>النوع</label><input id="sType" value="${safe(src?.type||'مولد')}"></div><div class="field"><label>سعر كيلو افتراضي</label><input id="sRate" type="number" step="0.01" value="${src?.defaultRate??''}"></div><div class="field"><label>الحالة</label><select id="sActive"><option value="1" ${src?.active!==false?'selected':''}>فعال</option><option value="0" ${src?.active===false?'selected':''}>موقوف</option></select></div></div><div class="actions"><button class="btn primary" id="saveSource">حفظ</button><button class="btn ghost" id="closeSource">إلغاء</button></div>`);$('#closeSource').onclick=closeModal;$('#saveSource').onclick=async()=>{const name=$('#sName').value.trim();if(!name){toast('اكتب اسم المصدر','error');return;}const data={name,type:$('#sType').value.trim()||'مولد',defaultRate:$('#sRate').value===''?null:num($('#sRate').value),active:$('#sActive').value==='1'};if(src){await updateDoc(orgDoc('sources',id),{...data,updatedAt:serverTimestamp()});upsertLocal('sources',{id,...data});toast('تم تعديل المصدر');}else{const r=doc(orgCollection('sources'));await setDoc(r,{...data,code:name.toLowerCase().replace(/\s+/g,'-'),createdAt:serverTimestamp()});upsertLocal('sources',{id:r.id,...data});const p=selectedPeriod();if(p){const er=doc(orgCollection('energyReadings'));await setDoc(er,{periodId:p.id,sourceId:r.id,previousReading:null,currentReading:null,pricePerKwh:data.defaultRate,consumption:null,cost:null,status:'Pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});}toast('تمت إضافة المصدر');}closeModal();state.loaded=false;await loadData(true);renderEnergy();};}

function renderCosts(){
  setTitle('المصاريف والطوارئ','أضف السولار، استئجار مولد خارجي، النقل، الصيانة والطوارئ.');const periods=latestPeriods();if(!state.periodId)state.periodId=periods[0]?.id;const p=selectedPeriod();const rows=p?costsForPeriod(p.id):[];
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>مصاريف الأسبوع</h2><p>هذه المصاريف تدخل في تكلفة التشغيل إذا اخترت «مصروف». والمساهمة/الخصم تقلل التكلفة.</p></div><button class="btn primary" id="addCost">+ إضافة مصروف / طارئ</button></div>${!p?empty('افتح أسبوعًا أولًا','المصاريف مرتبطة بالأسبوع الذي تحسبه.'): `<div class="period-selector">${periods.map(x=>`<button class="period-card ${x.id===p.id?'active':''}" data-cperiod="${x.id}"><b>${safe(x.label||'أسبوع')}</b><span>${fmtDate(x.startDate)}</span></button>`).join('')}</div><div class="money-grid"> <div class="money-card"><small>إجمالي المصاريف</small><b>${money(rows.filter(x=>x.direction!=='credit').reduce((a,x)=>a+num(x.amount),0))}</b></div><div class="money-card"><small>المساهمات / الخصومات</small><b>${money(rows.filter(x=>x.direction==='credit').reduce((a,x)=>a+num(x.amount),0))}</b></div><div class="money-card"><small>صافي المصاريف</small><b>${money(rows.reduce((a,x)=>a+(x.direction==='credit'?-num(x.amount):num(x.amount)),0))}</b></div></div><div class="table-wrap" style="margin-top:13px"><table class="table"><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المبلغ</th><th>تحميل</th><th></th></tr></thead><tbody>${rows.length?rows.map(c=>`<tr><td>${fmtDate(c.date)}</td><td>${safe(c.type||'—')}</td><td>${safe(c.description||'—')}</td><td class="strong">${money(c.amount)}</td><td>${c.direction==='credit'?'<span class="badge ok">يقلل التكلفة</span>':'<span class="badge warn">على التكلفة</span>'}</td><td><button class="mini" data-edit-cost="${c.id}">تعديل</button></td></tr>`).join(''):`<tr><td colspan="6">${empty('لا توجد مصاريف','أضف السولار أو المولد الخارجي أو الطوارئ من الزر أعلاه.')}</td></tr>`}</tbody></table></div>`}`;
  $('#addCost').onclick=()=>showCostForm(p?.id);$$('[data-cperiod]').forEach(b=>b.onclick=()=>navigate('costs',b.dataset.cperiod));$$('[data-edit-cost]').forEach(b=>b.onclick=()=>showCostForm(p.id,b.dataset.editCost));
}
function showCostForm(pid,id){const c=id?(state.data.costs||[]).find(x=>x.id===id):null;openModal(`<h2>${c?'تعديل مصروف':'إضافة مصروف أو طارئ'}</h2><p class="modal-lead">أمثلة: سولار، استئجار مولد خارجي، نقل، صيانة، مضخة، طارئ.</p><div class="form-grid"><div class="field"><label>نوع المصروف</label><select id="cType"><option>سولار / وقود</option><option>استئجار مولد خارجي</option><option>نقل</option><option>صيانة</option><option>طوارئ</option><option>كهرباء الدرج</option><option>أخرى</option><option>مساهمة / خصم</option>${c?.type&&!['سولار / وقود','استئجار مولد خارجي','نقل','صيانة','طوارئ','كهرباء الدرج','أخرى','مساهمة / خصم'].includes(c.type)?`<option selected>${safe(c.type)}</option>`:''}</select></div><div class="field"><label>التاريخ</label><input id="cDate" type="date" value="${safe(c?.date||dateNow())}"></div><div class="field"><label>المبلغ</label><input id="cAmount" type="number" step="0.01" min="0" value="${c?.amount??''}"></div><div class="field"><label>طريقة التحميل</label><select id="cDir"><option value="expense" ${c?.direction!=='credit'?'selected':''}>مصروف يضاف للتكلفة</option><option value="credit" ${c?.direction==='credit'?'selected':''}>مساهمة / خصم يقلل التكلفة</option></select></div><div class="field full"><label>البيان</label><input id="cDesc" value="${safe(c?.description||'')}"></div><div class="field full"><label>ملاحظات</label><textarea id="cNotes">${safe(c?.notes||'')}</textarea></div></div><div class="actions"><button class="btn primary" id="saveCost">حفظ</button><button class="btn ghost" id="cancelCost">إلغاء</button></div>`);$('#cancelCost').onclick=closeModal;$('#saveCost').onclick=async()=>{const amount=num($('#cAmount').value);if(!amount){toast('اكتب المبلغ','error');return;}const data={periodId:pid,type:$('#cType').value,date:$('#cDate').value,amount,direction:$('#cDir').value,description:$('#cDesc').value.trim(),notes:$('#cNotes').value.trim(),createdBy:state.user.uid,updatedAt:serverTimestamp()};if(c){await updateDoc(orgDoc('costs',id),data);upsertLocal('costs',{id,...data});}else{const r=doc(orgCollection('costs'));await setDoc(r,{...data,createdAt:serverTimestamp()});upsertLocal('costs',{id:r.id,...data});}closeModal();toast('تم حفظ المصروف');renderCosts();};}

function renderSubscribers(){
  setTitle('السكان والوحدات','هنا تحدد البنايات والوحدات وتعدل بيانات أي ساكن.');const rows=(state.data.subscribers||[]);const buildings=state.data.buildings||[];const units=state.data.units||[];
  $('#app').innerHTML=`<section class="grid-2"><div class="panel"><div class="panel-head"><div><h2>البنايات والوحدات</h2><p>حدد البناية ثم الوحدات التابعة لها. هذا هو مكان تنظيم العمارتين.</p></div><button class="btn primary" id="addBuilding">+ بناية</button></div><div class="members">${buildings.length?buildings.map(b=>`<div class="member-row"><div class="avatar">ب</div><div class="member-info"><b>${safe(b.name)}</b><span>الكود: ${safe(b.code||'—')} • ${units.filter(u=>u.buildingId===b.id).length} وحدات</span></div><button class="mini" data-edit-building="${b.id}">تعديل</button></div>`).join(''):empty('لا توجد بنايات','أضف البناية الأولى.')}</div><div class="actions"><button class="btn soft" id="addUnit">+ إضافة وحدة</button></div></div><div class="panel"><div class="panel-head"><div><h2>السكان</h2><p>اضغط على الاسم لكشف الحساب أو تعديل لتغيير البيانات.</p></div><div class="panel-actions"><button class="btn soft" id="exportSubs">↓ Excel</button><button class="btn primary" id="addSub">+ ساكن</button></div></div><div class="toolbar"><input id="subSearch" class="search" placeholder="ابحث بالاسم أو الكود أو الهاتف…"><span class="muted">${rows.filter(s=>s.active!==false).length} نشط</span></div><div class="table-wrap"><table class="table" style="min-width:850px"><thead><tr><th>الكود</th><th>الاسم</th><th>النوع</th><th>البناية</th><th>الوحدة</th><th>الرصيد</th><th></th></tr></thead><tbody id="subBody">${subscriberRows(rows)}</tbody></table></div></div></section>`;
  $('#addBuilding').onclick=()=>showBuildingForm();$('#addUnit').onclick=()=>showUnitForm();$('#addSub').onclick=()=>showSubscriberForm();$('#exportSubs').onclick=()=>exportSubscribers(rows.map(subscriberRow));$('#subSearch').oninput=e=>$('#subBody').innerHTML=subscriberRows(rows.filter(s=>[s.name,s.code,s.phone].some(v=>String(v||'').includes(e.target.value))));$$('[data-edit-building]').forEach(b=>b.onclick=()=>showBuildingForm(b.dataset.editBuilding));
}
function subscriberRows(rows){if(!rows.length)return `<tr><td colspan="7">${empty('لا يوجد سكان','أضف أول ساكن.')}</td></tr>`;return rows.map(s=>{const r=subscriberRow(s);return `<tr><td><span class="code">${safe(s.code)}</span></td><td><button class="link" data-account="${s.id}">${safe(s.name)}</button></td><td>${s.type==='خارجي'?'<span class="badge warn">خارجي</span>':'داخلي'}</td><td>${safe(r.buildingName)}</td><td>${safe(r.unitCode)}</td><td class="strong">${money(r.balance)}</td><td><div class="row-actions"><button class="mini" data-edit-sub="${s.id}">تعديل</button>${can('admin','manager')?`<button class="mini red" data-archive-sub="${s.id}">${s.active===false?'حذف نهائي':'أرشفة'}</button>`:''}</div></td></tr>`}).join('');}
function showBuildingForm(id){const b=id?(state.data.buildings||[]).find(x=>x.id===id):null;openModal(`<h2>${b?'تعديل البناية':'إضافة بناية'}</h2><p class="modal-lead">مثال: البناية الأولى، البناية الثانية.</p><div class="form-grid"><div class="field"><label>اسم البناية</label><input id="bName" value="${safe(b?.name||'')}"></div><div class="field"><label>الكود</label><input id="bCode" value="${safe(b?.code||'')}"></div></div><div class="actions"><button class="btn primary" id="saveBuilding">حفظ</button><button class="btn ghost" id="cancelBuilding">إلغاء</button></div>`);$('#cancelBuilding').onclick=closeModal;$('#saveBuilding').onclick=async()=>{const name=$('#bName').value.trim(),code=$('#bCode').value.trim();if(!name||!code){toast('اكتب الاسم والكود','error');return;}if(b)await updateDoc(orgDoc('buildings',id),{name,code,updatedAt:serverTimestamp()});else{const r=doc(orgCollection('buildings'));await setDoc(r,{name,code,active:true,createdAt:serverTimestamp()});}state.loaded=false;await loadData(true);closeModal();toast('تم حفظ البناية');renderSubscribers();};}
function showUnitForm(id){const u=id?(state.data.units||[]).find(x=>x.id===id):null;openModal(`<h2>${u?'تعديل الوحدة':'إضافة وحدة'}</h2><div class="form-grid"><div class="field"><label>البناية</label><select id="uBuilding"><option value="">اختر</option>${(state.data.buildings||[]).map(b=>`<option value="${b.id}" ${u?.buildingId===b.id?'selected':''}>${safe(b.name)}</option>`).join('')}</select></div><div class="field"><label>رقم الوحدة</label><input id="uCode" value="${safe(u?.code||'')}"></div><div class="field"><label>الدور</label><input id="uFloor" value="${safe(u?.floor||'')}"></div></div><div class="actions"><button class="btn primary" id="saveUnit">حفظ</button><button class="btn ghost" id="cancelUnit">إلغاء</button></div>`);$('#cancelUnit').onclick=closeModal;$('#saveUnit').onclick=async()=>{const buildingId=$('#uBuilding').value,code=$('#uCode').value.trim();if(!buildingId||!code){toast('اختر البناية واكتب رقم الوحدة','error');return;}const data={buildingId,code,unitNumber:code,floor:$('#uFloor').value.trim(),active:true,updatedAt:serverTimestamp()};if(u)await updateDoc(orgDoc('units',id),data);else{const r=doc(orgCollection('units'));await setDoc(r,{...data,createdAt:serverTimestamp()});}state.loaded=false;await loadData(true);closeModal();toast('تم حفظ الوحدة');renderSubscribers();};}
function showSubscriberForm(id){const s=id?(state.data.subscribers||[]).find(x=>x.id===id):null;const u=s?unitForSub(s):null;openModal(`<h2>${s?'تعديل بيانات الساكن':'إضافة ساكن جديد'}</h2><p class="modal-lead">الاسم، الوحدة، الهاتف وخدمة الحارس يمكن تعديلها لاحقًا. التاريخ المالي لا يتأثر.</p><div class="form-grid"><div class="field"><label>الاسم</label><input id="fName" value="${safe(s?.name||'')}"></div><div class="field"><label>الكود</label><input id="fCode" value="${safe(s?.code||'')}"></div><div class="field"><label>النوع</label><select id="fType"><option value="داخلي" ${s?.type!=='خارجي'?'selected':''}>ساكن داخلي</option><option value="خارجي" ${s?.type==='خارجي'?'selected':''}>مستهلك خارجي</option></select></div><div class="field"><label>الهاتف</label><input id="fPhone" value="${safe(s?.phone||'')}"></div><div class="field"><label>البناية</label><select id="fBuilding"><option value="">${s?.type==='خارجي'?'غير مرتبط ببناية':'اختر البناية'}</option>${(state.data.buildings||[]).map(b=>`<option value="${b.id}" ${u?.buildingId===b.id?'selected':''}>${safe(b.name)}</option>`).join('')}</select></div><div class="field"><label>الوحدة</label><select id="fUnit"><option value="">${s?.type==='خارجي'?'خارجي / بدون وحدة':'اختر الوحدة'}</option>${(state.data.units||[]).map(x=>`<option value="${x.id}" ${x.id===u?.id?'selected':''}>${safe(buildingName(x.buildingId))} — ${safe(x.code)}</option>`).join('')}</select></div><div class="field"><label>خدمة الحارس</label><input id="fGuard" type="number" step="0.01" value="${s?.defaultGuardFee??0}"></div><div class="field"><label>تأمين الغاطس</label><input id="fPump" type="number" step="0.01" value="${s?.defaultPumpInsurance??0}"></div><div class="field full"><label>ملاحظات</label><textarea id="fNotes">${safe(s?.notes||'')}</textarea></div></div><div class="actions"><button class="btn primary" id="saveSub">حفظ</button><button class="btn ghost" id="cancelSub">إلغاء</button></div>`);$('#cancelSub').onclick=closeModal;$('#saveSub').onclick=async()=>{const name=$('#fName').value.trim(),code=$('#fCode').value.trim(),type=$('#fType').value;if(!name||!code){toast('اكتب الاسم والكود','error');return;}if((state.data.subscribers||[]).some(x=>x.code===code&&x.id!==id)){toast('الكود مستخدم بالفعل','error');return;}const unitId=type==='خارجي'?null:($('#fUnit').value||null);const data={name,code,type,phone:$('#fPhone').value.trim(),unitId,defaultGuardFee:num($('#fGuard').value),defaultPumpInsurance:num($('#fPump').value),notes:$('#fNotes').value.trim(),active:true};if(s){await updateDoc(orgDoc('subscribers',id),{...data,updatedAt:serverTimestamp(),updatedBy:state.user.uid});const meter=(state.data.meters||[]).find(m=>m.subscriberId===id);if(meter)await updateDoc(orgDoc('meters',meter.id),{unitId});upsertLocal('subscribers',{id,...data});toast('تم تعديل بيانات الساكن');}else{const sr=doc(orgCollection('subscribers'));await setDoc(sr,{...data,createdAt:serverTimestamp(),createdBy:state.user.uid});const mr=doc(orgCollection('meters'));await setDoc(mr,{meterCode:`W-${code}`,meterType:'مياه',subscriberId:sr.id,unitId,active:true,createdAt:serverTimestamp()});upsertLocal('subscribers',{id:sr.id,...data});upsertLocal('meters',{id:mr.id,meterCode:`W-${code}`,meterType:'مياه',subscriberId:sr.id,unitId,active:true});toast('تمت إضافة الساكن');}closeModal();state.loaded=false;await loadData(true);renderSubscribers();};}
async function archiveOrDelete(id){const s=(state.data.subscribers||[]).find(x=>x.id===id);if(!s)return;if(s.active!==false){if(!confirm(`أرشفة ${s.name}؟\nسيبقى كل تاريخه وحسابه محفوظًا.`))return;await updateDoc(orgDoc('subscribers',id),{active:false,archivedAt:serverTimestamp(),archivedBy:state.user.uid});upsertLocal('subscribers',{id,active:false});toast('تمت الأرشفة');}else{if((state.data.ledger||[]).some(x=>x.subscriberId===id)){toast('لا يمكن الحذف النهائي لأن لديه حركات مالية؛ استخدم الأرشفة.','error');return;}if(!confirm(`حذف ${s.name} نهائيًا؟`))return;const batch=writeBatch(db);batch.delete(orgDoc('subscribers',id));for(const m of (state.data.meters||[]).filter(x=>x.subscriberId===id))batch.delete(orgDoc('meters',m.id));await batch.commit();removeLocal('subscribers',id);toast('تم الحذف النهائي');}renderSubscribers();}

function renderPayments(){
  setTitle('الدفعات والأرصدة','سجّل أي دفعة، حتى لو كانت تحت الحساب، وسيُحدّث الرصيد.');const pays=[...(state.data.payments||[])].sort((a,b)=>String(b.paymentDate).localeCompare(String(a.paymentDate)));const subs=(state.data.subscribers||[]).filter(s=>s.active!==false);
  $('#app').innerHTML=`<section class="panel"><div class="panel-head"><div><h2>الدفعات</h2><p>الدفع يسجل كحركة ائتمانية، والرصيد يبقى قابلًا للتتبع.</p></div><div class="panel-actions"><button class="btn soft" id="exportPayments">↓ Excel</button><button class="btn primary" id="newPay">+ تسجيل دفعة</button></div></div><div class="toolbar"><input id="paySearch" class="search" placeholder="ابحث باسم الساكن أو رقم الإيصال…"></div><div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>الساكن</th><th>المبلغ</th><th>الطريقة</th><th>الإيصال</th><th>الرصيد الحالي</th></tr></thead><tbody id="payBody">${paymentRows(pays)}</tbody></table></div></section>`;$('#newPay').onclick=showPaymentForm;$('#exportPayments').onclick=()=>exportPayments(pays);$('#paySearch').oninput=e=>$('#payBody').innerHTML=paymentRows(pays.filter(p=>{const s=(state.data.subscribers||[]).find(x=>x.id===p.subscriberId);return [s?.name,p.receiptNumber].some(v=>String(v||'').includes(e.target.value))}));}
function paymentRows(pays){if(!pays.length)return `<tr><td colspan="6">${empty('لا توجد دفعات','سجّل أول دفعة من الزر أعلاه.')}</td></tr>`;return pays.map(p=>{const s=(state.data.subscribers||[]).find(x=>x.id===p.subscriberId);return `<tr><td>${fmtDate(p.paymentDate)}</td><td><button class="link" data-account="${p.subscriberId}">${safe(s?.name||'—')}</button></td><td class="strong">${money(p.amount)}</td><td>${safe(p.method||'—')}</td><td>${safe(p.receiptNumber||'—')}</td><td class="strong">${money(balanceOf(p.subscriberId))}</td></tr>`}).join('');}
function showPaymentForm(){const subs=(state.data.subscribers||[]).filter(s=>s.active!==false);openModal(`<h2>تسجيل دفعة</h2><p class="modal-lead">يمكن أن تكون الدفعة لسداد رصيد أو دفعة تحت الحساب.</p><div class="form-grid"><div class="field full"><label>الساكن</label><select id="paySub"><option value="">اختر الساكن</option>${subs.map(s=>`<option value="${s.id}">${safe(s.code)} — ${safe(s.name)}</option>`).join('')}</select></div><div class="field"><label>المبلغ</label><input id="payAmount" type="number" min="0" step="0.01"></div><div class="field"><label>التاريخ</label><input id="payDate" type="date" value="${dateNow()}"></div><div class="field"><label>طريقة الدفع</label><select id="payMethod"><option>نقدي</option><option>تحويل بنكي</option><option>أخرى</option></select></div><div class="field"><label>رقم الإيصال</label><input id="payReceipt" placeholder="اختياري"></div><div class="field full"><label>ملاحظة</label><textarea id="payNote"></textarea></div></div><div class="actions"><button class="btn primary" id="savePay">حفظ الدفعة</button><button class="btn ghost" id="cancelPay">إلغاء</button></div>`);$('#cancelPay').onclick=closeModal;$('#savePay').onclick=async()=>{const subscriberId=$('#paySub').value,amount=num($('#payAmount').value);if(!subscriberId||amount<=0){toast('اختر الساكن واكتب مبلغًا صحيحًا','error');return;}const ref=doc(orgCollection('payments'));const lr=doc(orgCollection('ledger'));const payment={subscriberId,amount,paymentDate:$('#payDate').value,method:$('#payMethod').value,receiptNumber:$('#payReceipt').value.trim(),note:$('#payNote').value.trim(),createdBy:state.user.uid,createdAt:serverTimestamp()};const batch=writeBatch(db);batch.set(ref,payment);batch.set(lr,{subscriberId,transactionType:'PAYMENT',credit:amount,debit:0,description:'دفعة',referenceId:ref.id,paymentDate:payment.paymentDate,createdAt:serverTimestamp(),createdBy:state.user.uid});await batch.commit();closeModal();state.loaded=false;await loadData(true);toast('تم تسجيل الدفعة');renderPayments();};}


function showServiceForm(pid){
  const active=(state.data.subscribers||[]).filter(s=>s.active!==false);
  openModal(`<h2>الخدمات الدورية</h2><p class="modal-lead">أضف خدمة الحارس وتأمين الغاطس للسكان لهذا الأسبوع. البرنامج يمنع تكرار نفس الرسوم في نفس الفترة.</p><div class="section-note">القيم الافتراضية تأتي من ملف الساكن ويمكن تعديلها من صفحة «السكان والوحدات» قبل الإضافة.</div><div class="table-wrap"><table class="table"><thead><tr><th>الكود</th><th>الساكن</th><th>الحارس</th><th>تأمين الغاطس</th></tr></thead><tbody>${active.map(s=>`<tr><td>${safe(s.code)}</td><td>${safe(s.name)}</td><td>${money(s.defaultGuardFee||0)}</td><td>${money(s.defaultPumpInsurance||0)}</td></tr>`).join('')}</tbody></table></div><div class="actions"><button class="btn primary" id="applyServices">إضافة الخدمات غير المضافة</button><button class="btn ghost" id="cancelServices">إلغاء</button></div>`);
  $('#cancelServices').onclick=closeModal;$('#applyServices').onclick=async()=>{const batch=writeBatch(db);let count=0;for(const s of active){if(num(s.defaultGuardFee)>0 && !(state.data.ledger||[]).some(x=>x.periodId===pid&&x.subscriberId===s.id&&x.transactionType==='SERVICE'&&x.serviceCode==='GUARD')){const lr=doc(orgCollection('ledger'));batch.set(lr,{subscriberId:s.id,periodId:pid,transactionType:'SERVICE',serviceCode:'GUARD',debit:num(s.defaultGuardFee),credit:0,description:'خدمة الحارس',createdAt:serverTimestamp(),createdBy:state.user.uid});count++;}if(num(s.defaultPumpInsurance)>0 && !(state.data.ledger||[]).some(x=>x.periodId===pid&&x.subscriberId===s.id&&x.transactionType==='SERVICE'&&x.serviceCode==='PUMP_INSURANCE')){const lr=doc(orgCollection('ledger'));batch.set(lr,{subscriberId:s.id,periodId:pid,transactionType:'SERVICE',serviceCode:'PUMP_INSURANCE',debit:num(s.defaultPumpInsurance),credit:0,description:'تأمين الغاطس',createdAt:serverTimestamp(),createdBy:state.user.uid});count++;}}await batch.commit();state.loaded=false;await loadData(true);closeModal();toast(`تمت إضافة ${count} رسوم خدمة`);};
}
async function calculateWeek(pid){if(!can('admin','manager','accountant')){toast('الحساب النهائي يحتاج صلاحية إدارية','error');return;}const t=currentTotals(pid);if(!t.period){toast('الأسبوع غير موجود','error');return;}const summaryRows=waterSummaryForPeriod(pid);const externalSummary=summaryRows.find(r=>r.key==='external'||r.type==='external');const breakdown=buildingWaterBreakdown(pid);if(!externalSummary||externalSummary.currentReading==null||externalSummary.previousReading==null||breakdown.buildings.length<2){toast('تأكد من وجود البنايتين ثم أكمل قراءة الخارجي قبل حساب سعر الكوب.','error');return;}const missingResidents=readingsForPeriod(pid).filter(r=>r.currentReading==null||r.previousReading==null).length;if(missingResidents>0){toast(`باقي ${missingResidents} قراءة ساكن قبل اعتماد سعر الكوب. أكملها أولًا.`,'error');return;}if(t.waterTotal<=0){toast('إجمالي استهلاك المياه يساوي صفرًا. راجع القراءات الإجمالية.','error');return;}if(t.netCost<0){toast('صافي التكلفة سلبي. راجع المصاريف والمساهمات.','error');return;}const roundDiff=(t.appliedPrice*t.waterTotal)-t.netCost;const batch=writeBatch(db);batch.update(orgDoc('periods',pid),{waterUnitPrice:t.appliedPrice,rawWaterUnitPrice:t.rawPrice,totalWaterConsumption:t.waterTotal,netOperationalCost:t.netCost,roundingDifference:roundDiff,status:'Calculated',calculatedAt:serverTimestamp(),calculatedBy:state.user.uid});for(const existing of (state.data.ledger||[]).filter(x=>x.periodId===pid&&x.transactionType==='WATER'))batch.delete(orgDoc('ledger',existing.id));for(const r of t.readings){if(r.currentReading==null||r.previousReading==null)continue;const m=(state.data.meters||[]).find(x=>x.id===r.meterId);const s=subscriberByMeter(m);if(!s)continue;const consumption=Math.max(0,num(r.currentReading)-num(r.previousReading))/1000;const charge=consumption*t.appliedPrice;batch.update(orgDoc('readings',r.id),{consumption,unitPrice:t.appliedPrice,chargeAmount:charge,status:'Calculated',updatedAt:serverTimestamp()});const lr=doc(orgCollection('ledger'));batch.set(lr,{subscriberId:s.id,periodId:pid,transactionType:'WATER',debit:charge,credit:0,description:`مياه ${t.period.label||''}`,referenceId:r.id,createdAt:serverTimestamp(),createdBy:state.user.uid});}await batch.commit();state.loaded=false;await loadData(true);toast(`تم حساب الأسبوع. سعر الكوب ${t.appliedPrice} ₪`);await navigate('periods',pid,true);}

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
  const s=(state.data.subscribers||[]).find(x=>x.id===id); if(!s)return null;
  const p=periodId?periodById(periodId):selectedPeriod();
  const ledger=[...(state.data.ledger||[])].filter(x=>x.subscriberId===id);
  const before=p?ledger.filter(x=>{const per=periodById(x.periodId);return per&&String(per.startDate)<String(p.startDate)}):[];
  const current=p?ledger.filter(x=>x.periodId===p.id):[];
  const previousBalance=before.reduce((a,x)=>a+num(x.debit)-num(x.credit),0);
  const currentWater=current.filter(x=>x.transactionType==='WATER').reduce((a,x)=>a+num(x.debit),0);
  const services=current.filter(x=>x.transactionType==='SERVICE').reduce((a,x)=>a+num(x.debit),0);
  const other=current.filter(x=>!['WATER','SERVICE','PAYMENT'].includes(x.transactionType)).reduce((a,x)=>a+num(x.debit),0);
  const periodPayments=current.filter(x=>x.transactionType==='PAYMENT').reduce((a,x)=>a+num(x.credit),0);
  const totalPayments=ledger.filter(x=>x.transactionType==='PAYMENT').reduce((a,x)=>a+num(x.credit),0);
  const finalBalance=previousBalance+currentWater+services+other-periodPayments;
  return {s,p,previousBalance,currentWater,services,other,periodPayments,totalPayments,finalBalance};
}
function messageForResident(sum){
  const name=sum.s.name||'الساكن';
  const end=sum.p?.endDate||dateNow();
  const dayName=new Date(end+'T12:00:00').toLocaleDateString('ar-PS',{weekday:'long'});
  const day=`${dayName} ${fmtDate(end)}`;
  return `السلام عليكم ${name}
تفاصيل حساب عمارة الأمين حتى يوم ${day}
قيمة مياه الأسبوع : ${money(sum.currentWater)}
خدمات الحارس + تأمين الغاطس : ${money(sum.services)}
الرصيد السابق + الديون السابقة : ${money(Math.max(0,sum.previousBalance))}
الدفعات المسجلة : ${money(sum.totalPayments)}
الإجمالي المطلوب : ${money(sum.finalBalance)}
وشكرا لتعاونكم`;
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
      <div><small>مياه الأسبوع</small><b>${money(sum.currentWater)}</b></div>
      <div><small>الحارس + تأمين الغاطس</small><b>${money(sum.services)}</b></div>
      <div><small>الرصيد السابق</small><b>${money(sum.previousBalance)}</b></div>
      <div><small>دفعات هذه الفترة</small><b>${money(sum.periodPayments)}</b></div>
      <div><small>إجمالي الدفعات المسجلة</small><b>${money(sum.totalPayments)}</b></div>
      <div><small>حركات إضافية</small><b>${money(sum.other)}</b></div>
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
function exportSummary(pid){const t=currentTotals(pid),b=buildingWaterBreakdown(pid);const rows=[{البند:'الكهرباء من المولدات',القيمة:t.energyCost},{البند:'المصاريف والإضافات',القيمة:t.extraCost},{البند:'صافي تكلفة التشغيل',القيمة:t.netCost},{البند:'البناية الأولى',القيمة:b.buildings[0]?.total||0},{البند:'البناية الثانية',القيمة:b.buildings[1]?.total||0},{البند:'الخارجي',القيمة:b.external},{البند:'إجمالي استهلاك المياه',القيمة:t.waterTotal},{البند:'سعر الكوب الخام',القيمة:t.rawPrice},{البند:'سعر الكوب المعتمد',القيمة:t.appliedPrice},{البند:'فرق التقريب',القيمة:(t.appliedPrice*t.waterTotal)-t.netCost}];exportXlsx(rows,'ملخص الحساب',`ملخص_${String(t.period?.label||pid).replace(/[^\w\u0600-\u06FF]+/g,'_')}.xlsx`);}


function excelSerialToDate(v){if(v instanceof Date)return v;if(typeof v==='number'){return new Date(Date.UTC(1899,11,30)+v*86400000);}return null;}
function isoDate(d){return d?new Date(d).toISOString().slice(0,10):'';}
function parseSheetDate(name, cell){
  const nameText=String(name||'').trim();
  const explicitYear=nameText.match(/(\d{1,2})\s*[-\/]\s*(\d{1,2})\s*[-\/]\s*(\d{4})/);
  if(explicitYear){const y=Number(explicitYear[3]),d=Number(explicitYear[1]),mo=Number(explicitYear[2]);const end=new Date(Date.UTC(y,mo-1,d));const start=new Date(end.getTime()-6*86400000);return {start:isoDate(start),end:isoDate(end)};}
  const text=String(cell||name||'').trim();
  const range=text.match(/(\d{1,2})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{4})\s*[-–—]\s*(\d{1,2})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{4})/);
  if(range){return {start:`${range[3]}-${String(range[2]).padStart(2,'0')}-${String(range[1]).padStart(2,'0')}`,end:`${range[6]}-${String(range[5]).padStart(2,'0')}-${String(range[4]).padStart(2,'0')}`};}
  const dv=excelSerialToDate(cell); if(dv && !isNaN(dv.getTime())){const y=dv.getUTCFullYear(); if(y>=2020&&y<=2035)return {start:isoDate(dv),end:isoDate(dv)};}
  const m2=nameText.match(/(\d{1,2})\s*[-\/]\s*(\d{1,2})(?:\s*[-\/]\s*(\d{4}))?/);
  if(m2){const y=Number(m2[3]||2026),d=Number(m2[1]),mo=Number(m2[2]);const end=new Date(Date.UTC(y,mo-1,d));const start=new Date(end.getTime()-6*86400000);return {start:isoDate(start),end:isoDate(end)};}
  return null;
}
function normName(v){return String(v||'').replace(/\s+/g,' ').trim().toLowerCase().replace(/["“”'`]/g,'');}
function numeric(v){return v==null||v===''||Number.isNaN(Number(v))?null:Number(v);}
function rowText(ws,r,c1=1,c2=9){return Array.from({length:c2-c1+1},(_,k)=>ws.cell(r,c1+k).value).map(v=>v==null?'':String(v)).join(' | ');}
function findRow(ws,pred,start=1,end=ws.maxRow){for(let r=start;r<=end;r++)if(pred(rowText(ws,r)))return r;return -1;}
async function parseLegacyExcelFile(file){
  if(!window.XLSX)throw new Error('مكتبة Excel لم تُحمّل بعد. أعد فتح الصفحة ثم جرّب مرة أخرى.');
  const wb=window.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
  const periods=[], registry=new Map(), energySources=new Map(), externalMap=new Map(), energyRows=[];
  for(const sheetName of wb.SheetNames){
    const ws=wb.Sheets[sheetName];
    const aoa=window.XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
    const get=(r,c)=>aoa[r-1]?.[c-1]??null;
    const dateInfo=parseSheetDate(sheetName,get(2,7));
    if(!dateInfo)continue;
    const headerRows=[];for(let r=1;r<=aoa.length;r++){const t=rowText({cell:(rr,cc)=>({value:aoa[rr-1]?.[cc-1]})},r);if(/اسم المشترك/.test(t))headerRows.push(r);}
    const groups=[];
    for(const h of headerRows){const rows=[];for(let r=h+1;r<=aoa.length;r++){const b=get(r,1),n=get(r,2);if(n&&/الاجمالي/.test(String(n)))break;if(n && typeof b==='number'){rows.push({index:Number(b),name:String(n).trim(),building:numeric(get(r,3)),floor:get(r,4),previous:numeric(get(r,5)),current:numeric(get(r,6)),consumption:numeric(get(r,7)),charge:numeric(get(r,8))});}}if(rows.length)groups.push(rows);}
    const endDate=dateInfo.end; if(endDate<'2026-09-10'){
      const period={key:`${dateInfo.start}_${dateInfo.end}`,label:`أسبوع ${dateInfo.end}`,startDate:dateInfo.start,endDate:dateInfo.end,sourceSheet:sheetName,waterUnitPrice:null,energy:[],externalWater:null,residents:[],solarCredit:0,rentalCost:0,stair:null};
      // Find water unit price
      for(let r=1;r<=aoa.length;r++){const t=rowText({cell:(rr,cc)=>({value:aoa[rr-1]?.[cc-1]})},r);if(/سعر الكوب من المياه/.test(t)){for(let c=8;c>=1;c--){const v=numeric(get(r,c));if(v!=null){period.waterUnitPrice=v;break;}}}}
      // Resident groups; keep stable position code per building
      for(const rows of groups){for(const x of rows){const b=x.building===2?2:1;const code=`${b}-${String(x.index).padStart(2,'0')}`;if(!registry.has(code))registry.set(code,{code,name:x.name,building:b,floor:x.floor});else{const cur=registry.get(code);if((!cur.name||cur.name.length<4)&&x.name)cur.name=x.name;}}period.residents.push(...groups.flatMap(rows=>rows.map((x,idx)=>{const b=x.building===2?2:1;const code=`${b}-${String(x.index).padStart(2,'0')}`;return {...x,code};})));}
      // External consumer(s)
      for(let r=1;r<=aoa.length;r++){const t=rowText({cell:(rr,cc)=>({value:aoa[rr-1]?.[cc-1]})},r);if(/قائمة المشت.*خارجي/.test(t)){
        let rr=r+2;while(rr<=aoa.length){const nm=get(rr,1);if(!nm||/الكمية المستهلكة/.test(String(nm)))break;const prev=numeric(get(rr,2)),cur=numeric(get(rr,3));if(prev!=null||cur!=null){const label=String(nm).trim();const ext={code:'EXT-01',name:label,previous:prev,current:cur,consumption:numeric(get(rr,5)),price:numeric(get(rr,6)),charge:numeric(get(rr,7))};period.externalWater=ext;}rr++;}break;}}
      // Generator(s)
      let foundGen=false;
      for(let r=1;r<=aoa.length;r++){
        const t=String(get(r,1)||'');
        if(/مولد \(1\)/.test(t)){foundGen=true;const d=r+2;period.energy.push({sourceCode:'abu-zayid',sourceName:'مولد أبو زايد',current:numeric(get(d,1)),previous:numeric(get(d,2)),loss:numeric(get(d,3))||0,consumption:numeric(get(d,4)),price:numeric(get(d,5)),cost:numeric(get(d,6))});}
        if(/مولد \(2\)/.test(t)){const d=r+1;period.energy.push({sourceCode:'sweissi',sourceName:'مولد السويسي',current:numeric(get(d,1)),previous:numeric(get(d,2)),loss:numeric(get(d,3))||0,consumption:numeric(get(d,4)),price:numeric(get(d,5)),cost:numeric(get(d,6))});}
      }
      if(!foundGen){const r=findRow({cell:(rr,cc)=>({value:aoa[rr-1]?.[cc-1]})},()=>false);for(let rr=1;rr<=aoa.length;rr++){if(/قراءة المولد الخارجي الأسبوعي/.test(String(get(rr,1)||''))){const d=rr+2;period.energy.push({sourceCode:'legacy-generator',sourceName:'المولد الخارجي (قديم)',current:numeric(get(d,1)),previous:numeric(get(d,2)),loss:0,consumption:numeric(get(d,3)),price:numeric(get(d,5)),cost:numeric(get(d,6))});break;}}}
      // Solar contribution and rental cost
      for(let r=1;r<=aoa.length;r++){const t=String(get(r,1)||'');if(/مساهمة السولار/.test(t)){period.solarCredit=numeric(get(r,3))||0;}if(/استئجار مولد خارجي/.test(t)){period.rentalCost=numeric(get(r,6))||0;}}
      // Stairs meter
      for(let r=1;r<=aoa.length;r++){if(/قراءة كيلو وات ساعة للدرج/.test(String(get(r,1)||''))){const d=r+2;period.stair={current:numeric(get(d,1)),previous:numeric(get(d,2)),consumption:numeric(get(d,3))};break;}}
      periods.push(period);
    }
  }
  periods.sort((a,b)=>a.endDate.localeCompare(b.endDate));
  const subscribers=[...registry.values()].sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  return {fileName:file.name,periods,subscribers,external:{code:'EXT-01',name:periods.find(p=>p.externalWater)?.externalWater?.name||'عمارة البنا 1',type:'خارجي'},counts:{periods:periods.length,subscribers:subscribers.length,readings:periods.reduce((a,p)=>a+p.residents.length,0),externalReadings:periods.filter(p=>p.externalWater).length,energyReadings:periods.reduce((a,p)=>a+p.energy.length+(p.stair?1:0),0)}};
}
function renderLegacyPreview(data,done=false){const el=$('#legacyPreview');if(!el)return;const c=done?{added:data.added,filled:data.filled,conflicts:data.conflicts,skipped:data.skipped}:data.counts;el.innerHTML=done?`<div class="import-result"><div><b>تم الدمج</b><span>جديد: ${fmt(c.added,0)} · تم تعبئته: ${fmt(c.filled,0)} · اختلافات: ${fmt(c.conflicts,0)} · متروك كما هو: ${fmt(c.skipped,0)}</span></div></div>`:`<div class="import-preview-grid"><div><b>${fmt(c.periods,0)}</b><span>أسبوع تاريخي</span></div><div><b>${fmt(c.subscribers,0)}</b><span>ساكن</span></div><div><b>${fmt(c.readings,0)}</b><span>قراءة سكن</span></div><div><b>${fmt(c.externalReadings,0)}</b><span>قراءة خارجي</span></div><div><b>${fmt(c.energyReadings,0)}</b><span>قراءة كهرباء</span></div></div><div class="import-note">الملف: <b>${safe(data.fileName)}</b> — سيتم استبعاد ورقة 10-09 لأنها نموذج مستقبلي بلا حساب فعلي.</div>`;}
function legacyId(prefix,key){return `${prefix}-${String(key).replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,120)}`;}
async function commitOps(ops){for(let i=0;i<ops.length;i+=350){const batch=writeBatch(db);for(const op of ops.slice(i,i+350))op(batch);await batch.commit();}}
async function importLegacyData(data){
  if(!can('admin'))throw new Error('الاستيراد مخصص للمدير.');
  state.loaded=false;await loadData(true);
  const report={added:0,filled:0,conflicts:0,skipped:0};const ops=[];const existing={buildings:state.data.buildings||[],units:state.data.units||[],subscribers:state.data.subscribers||[],meters:state.data.meters||[],periods:state.data.periods||[],readings:state.data.readings||[],sources:state.data.sources||[],energyReadings:state.data.energyReadings||[],costs:state.data.costs||[],waterSummary:state.data.waterSummary||[]};
  const bmap=new Map();
  for(const b of [{code:'1',name:'البناية الأولى'},{code:'2',name:'البناية الثانية'}]){let ex=existing.buildings.find(x=>String(x.code||'')===b.code)||existing.buildings.find(x=>normName(x.name)===normName(b.name));if(!ex){const id=legacyId('building',b.code);ex={id,...b,active:true,createdAt:serverTimestamp(),createdBy:state.user.uid,importedFrom:'Excel 03-09-2026'};ops.push(batch=>batch.set(orgDoc('buildings',id),ex));report.added++;}bmap.set(b.code,ex.id);}
  const smap=new Map();
  for(const s of data.subscribers){const bid=bmap.get(String(s.building));let ex=existing.subscribers.find(x=>String(x.code||'')===s.code);if(!ex)ex=existing.subscribers.find(x=>normName(x.name)===normName(s.name)&&String(unitForSub(x)?.buildingId||'')===String(bid));const unitCode=s.code;let u=existing.units.find(x=>String(x.code||'')===unitCode);if(!u){const uid=legacyId('unit',unitCode);u={id:uid,code:unitCode,buildingId:bid,floor:s.floor||'',active:true,createdAt:serverTimestamp(),importedFrom:'Excel 03-09-2026'};ops.push(batch=>batch.set(orgDoc('units',uid),u));report.added++;}else if(!u.buildingId){ops.push(batch=>batch.update(orgDoc('units',u.id),{buildingId:bid,floor:s.floor||u.floor||'',updatedAt:serverTimestamp()}));report.filled++;}
    if(!ex){const sid=legacyId('subscriber',s.code);ex={id:sid,code:s.code,name:s.name,type:'داخلي',unitId:u.id,active:true,notes:'مستورد من Excel',createdAt:serverTimestamp(),createdBy:state.user.uid,importedFrom:'Excel 03-09-2026'};ops.push(batch=>batch.set(orgDoc('subscribers',sid),ex));report.added++;}else{const upd={};if(!ex.unitId)upd.unitId=u.id;if(!ex.code)upd.code=s.code;if(!ex.name)upd.name=s.name;if(Object.keys(upd).length){upd.updatedAt=serverTimestamp();ops.push(batch=>batch.update(orgDoc('subscribers',ex.id),upd));report.filled;report.filled++;}
    smap.set(s.code,ex.id);
    let m=existing.meters.find(x=>x.subscriberId===ex.id);if(!m){const mid=legacyId('meter',s.code);m={id:mid,subscriberId:ex.id,name:`عداد ماء ${s.code}`,type:'ماء',unit:'لتر',active:true,createdAt:serverTimestamp(),importedFrom:'Excel 03-09-2026'};ops.push(batch=>batch.set(orgDoc('meters',mid),m));report.added++;}else if(!m.type){ops.push(batch=>batch.update(orgDoc('meters',m.id),{type:'ماء',unit:'لتر',updatedAt:serverTimestamp()}));report.filled++;}}
  }
  let extSub=existing.subscribers.find(x=>x.type==='خارجي'&&normName(x.name)===normName(data.external.name))||existing.subscribers.find(x=>x.type==='خارجي');
  if(!extSub){const sid='subscriber-EXT-01';extSub={id:sid,code:'EXT-01',name:data.external.name,type:'خارجي',active:true,notes:'مستورد من Excel',createdAt:serverTimestamp(),createdBy:state.user.uid,importedFrom:'Excel 03-09-2026'};ops.push(batch=>batch.set(orgDoc('subscribers',sid),extSub));report.added++;}
  let extMeter=existing.meters.find(x=>x.subscriberId===extSub.id);if(!extMeter){extMeter={id:'meter-EXT-01',subscriberId:extSub.id,name:'عداد الخارجي',type:'ماء',unit:'لتر',active:true,createdAt:serverTimestamp(),importedFrom:'Excel 03-09-2026'};ops.push(batch=>batch.set(orgDoc('meters',extMeter.id),extMeter));report.added++;}
  const srcMap=new Map(existing.sources.map(x=>[String(x.code||''),x]));
  for(const [code,name] of [['abu-zayid','مولد أبو زايد'],['sweissi','مولد السويسي'],['legacy-generator','المولد الخارجي (قديم)'],['stairs','كهرباء الدرج']]){if(!srcMap.has(code)){const id=legacyId('source',code);srcMap.set(code,{id,code,name,type:code==='stairs'?'عداد درج':'مولد',active:true,createdAt:serverTimestamp(),importedFrom:'Excel'});ops.push(batch=>batch.set(orgDoc('sources',id),srcMap.get(code)));report.added++;}}
  for(const p of data.periods){let ex=existing.periods.find(x=>x.startDate===p.startDate&&x.endDate===p.endDate)||existing.periods.find(x=>x.endDate===p.endDate);if(!ex){const id=legacyId('period',p.key);ex={id,label:p.label,startDate:p.startDate,endDate:p.endDate,status:'Closed',waterUnitPrice:p.waterUnitPrice,createdAt:serverTimestamp(),createdBy:state.user.uid,importedFrom:'Excel 03-09-2026'};ops.push(batch=>batch.set(orgDoc('periods',id),ex));report.added++;}else if(ex.waterUnitPrice==null&&p.waterUnitPrice!=null){ops.push(batch=>batch.update(orgDoc('periods',ex.id),{waterUnitPrice:p.waterUnitPrice,updatedAt:serverTimestamp()}));report.filled++;}
    const periodId=ex.id;
    for(const x of p.residents){const sid=smap.get(x.code);const m=existing.meters.find(z=>z.subscriberId===sid)||{id:legacyId('meter',x.code)};const old=existing.readings.find(r=>r.periodId===periodId&&r.meterId===m.id);const val={periodId,meterId:m.id,previousReading:x.previous,currentReading:x.current,consumption:x.consumption??(x.current!=null&&x.previous!=null?Math.max(0,x.current-x.previous)/1000:null),unitPrice:p.waterUnitPrice,chargeAmount:x.charge??(x.consumption!=null&&p.waterUnitPrice!=null?x.consumption*p.waterUnitPrice:null),status:x.current!=null?'Entered':'Pending',importedFrom:'Excel 03-09-2026'};if(!old){ops.push(batch=>batch.set(orgDoc('readings',legacyId('reading',`${periodId}_${x.code}`)),{...val,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));report.added++;}else if(old.currentReading==null&&x.current!=null){ops.push(batch=>batch.update(orgDoc('readings',old.id),{...val,updatedAt:serverTimestamp()}));report.filled++;}else if(old.currentReading!=null&&x.current!=null&&Number(old.currentReading)!==Number(x.current)){report.conflicts++;}else report.skipped++;}
    if(p.externalWater){const old=existing.waterSummary.find(w=>w.periodId===periodId&&(w.key==='external'||w.type==='external'));const val={periodId,key:'external',label:'الخارجي',type:'external',buildingId:null,previousReading:p.externalWater.previous,currentReading:p.externalWater.current,consumption:p.externalWater.consumption??(p.externalWater.current!=null&&p.externalWater.previous!=null?Math.max(0,p.externalWater.current-p.externalWater.previous)/1000:null),status:p.externalWater.current!=null?'Entered':'Pending',importedFrom:'Excel 03-09-2026'};if(!old){ops.push(batch=>batch.set(orgDoc('waterSummary',legacyId('water-summary',periodId)),{...val,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));report.added++;}else if(old.currentReading==null&&p.externalWater.current!=null){ops.push(batch=>batch.update(orgDoc('waterSummary',old.id),{...val,updatedAt:serverTimestamp()}));report.filled++;}}
    for(const e of p.energy){const src=srcMap.get(e.sourceCode);const old=existing.energyReadings.find(r=>r.periodId===periodId&&r.sourceId===src.id);const val={periodId,sourceId:src.id,previousReading:e.previous,currentReading:e.current,loss:e.loss||0,consumption:e.consumption,pricePerKwh:e.price,cost:e.cost,status:e.current!=null?'Entered':'Pending',importedFrom:'Excel 03-09-2026'};if(!old){ops.push(batch=>batch.set(orgDoc('energyReadings',legacyId('energy',`${periodId}_${e.sourceCode}`)),{...val,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));report.added++;}else if(old.currentReading==null&&e.current!=null){ops.push(batch=>batch.update(orgDoc('energyReadings',old.id),{...val,updatedAt:serverTimestamp()}));report.filled++;}else report.skipped++;}
    if(p.stair){const src=srcMap.get('stairs');const old=existing.energyReadings.find(r=>r.periodId===periodId&&r.sourceId===src.id);const val={periodId,sourceId:src.id,previousReading:p.stair.previous,currentReading:p.stair.current,consumption:p.stair.consumption,pricePerKwh:null,cost:0,status:'Entered',importedFrom:'Excel 03-09-2026'};if(!old){ops.push(batch=>batch.set(orgDoc('energyReadings',legacyId('energy',`${periodId}_stairs`)),{...val,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));report.added++;}else if(old.currentReading==null&&p.stair.current!=null){ops.push(batch=>batch.update(orgDoc('energyReadings',old.id),{...val,updatedAt:serverTimestamp()}));report.filled++;}}
    if(p.solarCredit){const old=existing.costs.find(c=>c.periodId===periodId&&c.sourceKey==='excel-solar-credit');if(!old){ops.push(batch=>batch.set(orgDoc('costs',legacyId('cost',`${periodId}_solar-credit`)),{periodId,type:'وقود/مساهمة سولار',description:'مساهمة السولار من Excel',amount:p.solarCredit,direction:'credit',sourceKey:'excel-solar-credit',createdAt:serverTimestamp(),createdBy:state.user.uid,importedFrom:'Excel 03-09-2026'}));report.added++;}}
    if(p.rentalCost){const old=existing.costs.find(c=>c.periodId===periodId&&c.sourceKey==='excel-generator-rental');if(!old){ops.push(batch=>batch.set(orgDoc('costs',legacyId('cost',`${periodId}_generator-rental`)),{periodId,type:'مولد خارجي',description:'استئجار/نقل مولد خارجي من Excel',amount:p.rentalCost,direction:'debit',sourceKey:'excel-generator-rental',createdAt:serverTimestamp(),createdBy:state.user.uid,importedFrom:'Excel 03-09-2026'}));report.added++;}}
  }
  await commitOps(ops);
  return report;
}
function renderSettings(){
  setTitle('الإعدادات والصلاحيات','إدارة المستخدمين، استيراد التاريخ، والحذف الآمن.');
  const members=state.data.members||[], periods=latestPeriods();
  $('#app').innerHTML=`<section class="settings-grid">
    <div class="panel"><div class="panel-head"><div><h2>حسابك</h2><p>حساب Google الحالي.</p></div></div>
      <div class="member-row"><div class="avatar">${safe((state.user.displayName||'م').slice(0,1))}</div><div class="member-info"><b>${safe(state.user.displayName||'—')}</b><span>${safe(state.user.email||'—')} • ${roleName(state.profile.role)}</span></div></div>
      <div class="actions"><button class="btn ghost" id="logoutSet">تسجيل الخروج</button></div>
    </div>
    <div class="panel"><div class="panel-head"><div><h2>المستخدمون والصلاحيات</h2><p>الحسابات الجديدة تنتظر موافقة المدير.</p></div></div>
      <div class="members">${members.length?members.map(m=>`<div class="member-row"><div class="avatar">${safe((m.displayName||'م').slice(0,1))}</div><div class="member-info"><b>${safe(m.displayName||'—')}</b><span>${safe(m.email||'')}</span></div>${can('admin')?`<select data-role="${m.id}">${Object.entries(ROLES).filter(([k])=>k!=='pending').map(([k,v])=>`<option value="${k}" ${m.role===k?'selected':''}>${v}</option>`).join('')}</select>`:statusBadge(m.role)}</div>`).join(''):empty('لا يوجد مستخدمون','سيظهر الحساب بعد تسجيل الدخول.')}</div>
    </div>
  </section>
  <section class="panel import-panel">
    <div class="panel-head"><div><h2>استيراد بيانات Excel القديمة</h2><p>ارفع ملف الحساب القديم، وسيقرأ النظام الأسابيع والقراءات والكهرباء والخارجي ثم يدمجها مع Firebase بدون الكتابة فوق البيانات الموجودة.</p></div><span class="badge info">آمن للدمج</span></div>
    <div class="import-safe"><div><b>لن نحذف البيانات الحالية</b><span>الموجود يبقى، والجديد يُضاف. وإذا وجدنا نفس السجل بقيمة مختلفة نحافظ على الموجود ونبلغك بالاختلاف.</span></div></div>
    <div class="import-actions"><label class="btn primary" for="legacyExcelInput">اختيار ملف Excel</label><input id="legacyExcelInput" type="file" accept=".xlsx,.xls" class="hidden-file"><span id="legacyFileName" class="file-name">لم يتم اختيار ملف</span><button class="btn soft" id="legacyPreviewBtn" disabled>فحص الملف</button><button class="btn gold" id="legacyImportBtn" disabled>استيراد ودمج البيانات</button></div>
    <div id="legacyPreview" class="import-preview hidden"></div>
  </section>
  <section class="panel danger-panel"><div class="panel-head"><div><h2>الحذف الآمن</h2><p>الأسبوع يمكن حذفه عند الحاجة، لكن العملية مخصصة للمدير. السكان أصحاب الحركات المالية تتم أرشفتهم بدل حذفهم.</p></div></div>
    <div class="danger-actions"><select id="deletePeriod"><option value="">اختر أسبوعًا</option>${periods.map(p=>`<option value="${p.id}">${safe(p.label)} — ${fmtDate(p.startDate)}</option>`).join('')}</select><button class="btn danger" id="deletePeriodBtn">حذف الأسبوع</button></div>
  </section>`;
  $('#logoutSet').onclick=()=>signOut(auth);
  $$('[data-role]').forEach(s=>s.onchange=()=>updateRole(s.dataset.role,s.value));
  $('#deletePeriodBtn').onclick=()=>deleteWeek($('#deletePeriod').value);
  const input=$('#legacyExcelInput'), previewBtn=$('#legacyPreviewBtn'), importBtn=$('#legacyImportBtn'), preview=$('#legacyPreview'), fileName=$('#legacyFileName');
  let parsed=null;
  input.onchange=()=>{parsed=null;preview.classList.add('hidden');preview.innerHTML='';const f=input.files?.[0];fileName.textContent=f?f.name:'لم يتم اختيار ملف';previewBtn.disabled=!f;importBtn.disabled=true;};
  previewBtn.onclick=async()=>{const f=input.files?.[0];if(!f)return;previewBtn.disabled=true;previewBtn.textContent='جاري الفحص…';try{parsed=await parseLegacyExcelFile(f);renderLegacyPreview(parsed);preview.classList.remove('hidden');importBtn.disabled=false;toast('تم فحص الملف بنجاح');}catch(e){console.error(e);toast(e?.message||'تعذر قراءة ملف Excel','error');}finally{previewBtn.disabled=false;previewBtn.textContent='فحص الملف';}};
  importBtn.onclick=async()=>{if(!parsed)return;if(!can('admin')){toast('استيراد التاريخ مخصص للمدير','error');return;}if(!confirm('سيتم دمج البيانات القديمة مع Firebase بدون حذف الموجود. هل تريد المتابعة؟'))return;importBtn.disabled=true;importBtn.textContent='جاري الاستيراد…';try{const report=await importLegacyData(parsed);renderLegacyPreview(report,true);toast(`تم الدمج: ${report.added} جديد، ${report.filled} تم تعبئته، ${report.conflicts} اختلاف يحتاج مراجعة`);state.loaded=false;await loadData(true);renderSettings();}catch(e){console.error(e);toast(e?.message||'تعذر استيراد البيانات','error');}finally{importBtn.disabled=false;importBtn.textContent='استيراد ودمج البيانات';}};
}

async function updateRole(uid,role){if(!can('admin'))return;if(uid===state.user.uid&&role!=='admin'){toast('لا تنزل صلاحيتك من نفسك.','error');return;}await updateDoc(orgDoc('members',uid),{role,updatedAt:serverTimestamp(),updatedBy:state.user.uid});upsertLocal('members',{id:uid,role});toast('تم تعديل الصلاحية');renderSettings();}
async function deleteWeek(pid){if(!pid){toast('اختر أسبوعًا','error');return;}if(!can('admin')){toast('حذف الأسبوع مخصص للمدير','error');return;}const p=periodById(pid);if(!confirm(`سيتم حذف ${p?.label||'الأسبوع'} مع قراءات الماء والكهرباء والمصاريف وحركات المياه المرتبطة به.\n\nهل أنت متأكد؟`))return;const batch=writeBatch(db);batch.delete(orgDoc('periods',pid));for(const c of ['readings','energyReadings','costs'])for(const r of (state.data[c]||[]).filter(x=>x.periodId===pid))batch.delete(orgDoc(c,r.id));for(const t of (state.data.ledger||[]).filter(x=>x.periodId===pid))batch.delete(orgDoc('ledger',t.id));await batch.commit();state.loaded=false;await loadData(true);state.periodId=null;toast('تم حذف الأسبوع');renderSettings();}

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
document.addEventListener('click',e=>{const v=e.target.closest('[data-view]');if(v)navigate(v.dataset.view);const a=e.target.closest('[data-account]');if(a)openAccount(a.dataset.account);const ed=e.target.closest('[data-edit-sub]');if(ed)showSubscriberForm(ed.dataset.editSub);const ar=e.target.closest('[data-archive-sub]');if(ar)archiveOrDelete(ar.dataset.archiveSub);});

onAuthStateChanged(auth,async user=>{state.user=user;$('#boot')?.classList.add('hidden');if(!user){$('#auth-screen')?.classList.remove('hidden');$('#app-shell')?.classList.add('hidden');return;}$('#auth-screen')?.classList.add('hidden');$('#app-shell')?.classList.remove('hidden');$('#userName').textContent=user.displayName||user.email||'المستخدم';$('#userAvatar').textContent=(user.displayName||user.email||'م').slice(0,1);$('#userRole').textContent='جارٍ التحقق…';try{state.profile=await ensureProfile();$('#userRole').textContent=roleName(state.profile.role);if(state.profile.role==='pending'){renderPending();return;}await loadData(true);await ensureDefaults();await navigate('dashboard');}catch(e){console.error(e);$('#app').innerHTML=`<section class="panel" style="max-width:820px;margin:40px auto"><h2>تعذر تحميل البيانات</h2><p class="muted">${safe(e?.message||'تحقق من Firestore Rules وAuthorized Domains وإعدادات Firebase.')}</p></section>`;}});

})();
