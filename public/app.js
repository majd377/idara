const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const state = { view:'dashboard', subscribers:[], periods:[], sources:[] };

const fmt = (n, digits=2) => new Intl.NumberFormat('ar-PS',{maximumFractionDigits:digits}).format(Number(n||0));
const money = (n) => `${fmt(n,2)} ₪`;
const safe = (v) => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

async function api(url, opts={}) {
  const r = await fetch(url, opts);
  let j={}; try { j=await r.json(); } catch {}
  if(!r.ok) throw new Error(j.error || 'حدث خطأ غير متوقع');
  return j;
}
function render(html){ $('#app').innerHTML=html; }
function setTitle(title, subtitle=''){ $('#page-title').textContent=title; $('#page-subtitle').textContent=subtitle; }
function showToast(message,type='success'){
  const t=$('#toast'); t.textContent=message; t.className=`toast ${type}`; clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>t.className='toast hidden',3000);
}
function badge(s){
  const ar = ({Draft:'مسودة',DataEntry:'إدخال',Calculated:'محسوبة',Review:'مراجعة',Approved:'معتمدة',Closed:'مغلقة',Pending:'بانتظار',Entered:'مدخلة','No Consumption':'لا استهلاك',Invalid:'غير صالحة',Sent:'تم الإرسال'})[s] || s || '-';
  const cls=['Closed','Approved','Calculated','Entered'].includes(s)?'success':['Pending','Draft','Review','DataEntry'].includes(s)?'warning':s==='Invalid'?'danger':'info';
  return `<span class="badge ${cls}">${safe(ar)}</span>`;
}
function statCard(label,value,sub,extra=''){return `<div class="card kpi"><div class="kpi-head"><div class="label">${label}</div><span class="badge info">${extra||'ملخص'}</span></div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;}

async function dashboard(){
  setTitle('لوحة التحكم','نظرة سريعة على حالة الحسابات والفترة الحالية');
  const d=await api('/api/dashboard');
  const periods=d.periods||[];
  const latest=periods[0];
  let summary=null; try{ if(latest) summary=await api('/api/periods/'+latest.id+'/summary'); }catch{}
  const max=(periods.map(p=>new Date(p.start_date).getTime()).filter(Boolean).length||1);
  const quick=`<div class="card section"><div class="section-head"><div><h2>اختصارات سريعة</h2><p>أكثر العمليات استخدامًا يوميًا.</p></div></div><div class="quick-grid"><button class="quick-action" id="qa-reading"><strong>إدخال قراءات المياه</strong><span>تسجيل القراءة الحالية للمشتركين</span></button><button class="quick-action" id="qa-cost"><strong>إضافة مصروف</strong><span>مولد، وقود، صيانة أو طوارئ</span></button><button class="quick-action" id="qa-sub"><strong>إضافة مشترك</strong><span>إضافة وحدة ومشترك جديد</span></button></div></div>`;
  render(`<div class="grid kpi-grid">
    ${statCard('المشتركون النشطون',fmt(d.subscribers,0),'مشترك داخل النظام','السكان')}
    ${statCard('إجمالي الرسوم',money(d.totalCharges),'الحركات المدينة','استحقاقات')}
    ${statCard('إجمالي الدفعات',money(d.totalPayments),'الحركات الدائنة','تحصيل')}
    ${statCard('الرصيد الصافي',money(d.outstanding),'إجمالي الرصيد المستحق','متابعة')}
  </div>
  <div class="grid two" style="margin-top:16px">
    <div class="card hero"><div class="hero-title">الفترة الأحدث</div><div class="hero-number">${latest?safe(latest.label):'لم تُنشأ فترة بعد'}</div><div class="hero-meta">${latest?`<span>التاريخ: <strong>${safe(latest.start_date)}</strong></span><span>الحالة: ${badge(latest.status)}</span>`:'ابدأ بإنشاء أول فترة حسابية من قسم الفترات والقراءات.'}</div>${summary?`<div class="grid three" style="margin-top:18px"><div class="mini-stat"><div class="title">تكلفة التشغيل</div><div class="num">${money(summary.netOperational)}</div></div><div class="mini-stat"><div class="title">الاستهلاك</div><div class="num">${fmt(summary.totalConsumption,3)}</div><div class="hint">وحدة مياه</div></div><div class="mini-stat"><div class="title">سعر الوحدة</div><div class="num">${money(summary.appliedUnitPrice)}</div><div class="hint">بعد التقريب</div></div></div>`:''}</div>
    <div class="card section"><div class="section-head"><div><h2>آخر الفترات</h2><p>الوضع التشغيلي للفترات الأخيرة.</p></div><button class="btn btn-secondary" data-go="periods">عرض الكل</button></div><div class="table-wrap"><table class="table"><thead><tr><th>الفترة</th><th>التاريخ</th><th>الحالة</th></tr></thead><tbody>${periods.slice(0,6).map(p=>`<tr><td class="emphasis">${safe(p.label)}</td><td>${safe(p.start_date)}</td><td>${badge(p.status)}</td></tr>`).join('') || `<tr><td colspan="3" class="empty">لا توجد فترات.</td></tr>`}</tbody></table></div></div>
  </div>
  <div class="grid two" style="margin-top:16px"><div class="card section"><div class="section-head"><div><h2>تدفق العمل المقترح</h2><p>الطريقة الأسهل لإغلاق الأسبوع بدون أخطاء.</p></div></div><div class="notice"><strong>1.</strong> أنشئ الفترة → <strong>2.</strong> أدخل الطاقة والمصاريف → <strong>3.</strong> أدخل قراءات المياه → <strong>4.</strong> راجع → <strong>5.</strong> أعد الحساب → <strong>6.</strong> اعتمد وأغلق.</div></div>${quick}</div>`);
  $$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  $('#qa-reading').onclick=()=>navigate('periods'); $('#qa-cost').onclick=showCostForm; $('#qa-sub').onclick=showSubForm;
}

async function subscribers(){
  setTitle('المشتركون','حسابات السكان والوحدات والعدادات');
  const data=await api('/api/subscribers'); state.subscribers=data;
  render(`<div class="card section"><div class="toolbar"><div><h2 style="margin:0">قائمة المشتركين</h2><div class="muted">ابحث بالاسم أو الكود أو رقم الهاتف.</div></div><div style="display:flex;gap:8px"><input id="subSearch" class="search" placeholder="بحث سريع..."/><button class="btn btn-primary" id="newSub">+ مشترك جديد</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>الكود</th><th>الاسم</th><th>البناية</th><th>الوحدة</th><th>الهاتف</th><th>النوع</th><th>الرصيد</th><th>الحساب</th></tr></thead><tbody id="subRows">${subRows(data)}</tbody></table></div></div>`);
  $('#newSub').onclick=showSubForm;
  $('#subSearch').oninput=async e=>{try{const d=await api('/api/subscribers?q='+encodeURIComponent(e.target.value));$('#subRows').innerHTML=subRows(d);}catch(err){showToast(err.message,'error')}};
}
function subRows(data){ return data.map(s=>`<tr><td><strong>${safe(s.code)}</strong></td><td class="emphasis">${safe(s.name)}</td><td>${safe(s.building_name||'-')}</td><td>${safe(s.unit_code||'-')}</td><td>${safe(s.phone||'-')}</td><td>${safe(s.type)}</td><td>${money(s.balance)}</td><td><button class="btn btn-secondary btn-view-sub" data-id="${s.id}">كشف الحساب</button></td></tr>`).join('') || `<tr><td colspan="8" class="empty">لا توجد نتائج مطابقة.</td></tr>`; }

async function periods(){
  setTitle('الفترات والقراءات','دورة العمل الأسبوعية وإدخال قراءات العدادات');
  const ps=await api('/api/periods'); state.periods=ps;
  render(`<div class="card section"><div class="toolbar"><div><h2 style="margin:0">الفترات الحسابية</h2><div class="muted">كل فترة مستقلة ويمكن إعادة حسابها قبل الإغلاق.</div></div><button class="btn btn-primary" id="newPeriod">+ إنشاء فترة</button></div><div class="table-wrap"><table class="table"><thead><tr><th>الفترة</th><th>البداية</th><th>النهاية</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>${ps.map(p=>`<tr><td class="emphasis">${safe(p.label)}</td><td>${safe(p.start_date)}</td><td>${safe(p.end_date)}</td><td>${badge(p.status)}</td><td><button class="btn btn-secondary period-open" data-id="${p.id}">القراءات</button> <button class="btn btn-secondary period-calc" data-id="${p.id}">الحساب</button></td></tr>`).join('')||`<tr><td colspan="5" class="empty">لا توجد فترات.</td></tr>`}</tbody></table></div></div>`);
  $('#newPeriod').onclick=showPeriodForm; $$('.period-calc').forEach(b=>b.onclick=()=>periodSummary(b.dataset.id)); $$('.period-open').forEach(b=>b.onclick=()=>periodDetail(b.dataset.id));
}
async function periodSummary(id){
  const s=await api('/api/periods/'+id+'/summary');
  openModal(`<div class="account-head"><div><h2>تفاصيل حساب الفترة</h2><div class="account-code">${safe(s.period.label)} · ${safe(s.period.start_date)}</div></div><div class="balance-box"><div class="label">سعر الوحدة المعتمد</div><div class="amount">${money(s.appliedUnitPrice)}</div></div></div><div class="grid three" style="margin-top:18px"><div class="mini-stat card"><div class="title">تكلفة الطاقة</div><div class="num">${money(s.energyTotal)}</div></div><div class="mini-stat card"><div class="title">صافي التشغيل</div><div class="num">${money(s.netOperational)}</div></div><div class="mini-stat card"><div class="title">الاستهلاك الإجمالي</div><div class="num">${fmt(s.totalConsumption,3)}</div></div></div><div class="card section" style="margin-top:14px"><div class="section-head"><div><h2>تفكيك المعادلة</h2><p>القيمة الخام محفوظة ولا يتم إخفاؤها.</p></div></div><table class="table"><tbody><tr><td>السعر الخام للوحدة</td><td class="emphasis">${fmt(s.rawUnitPrice,4)} ₪</td></tr><tr><td>السعر المعتمد بعد ROUNDUP</td><td class="emphasis">${money(s.appliedUnitPrice)}</td></tr><tr><td>فرق التقريب</td><td>${money(s.roundingDifference)}</td></tr></tbody></table></div>`);
}
async function periodDetail(id){
  const readings=await api('/api/readings/'+id); const meters=await api('/api/meters');
  if(!meters.length){openModal('<h2>لا توجد عدادات مياه</h2><p class="muted">أنشئ العدادات المرتبطة بالمشتركين أولًا.</p>');return;}
  const map=new Map(readings.map(r=>[r.meter_id,r]));
  render(`<div class="card section"><div class="section-head"><div><h2>إدخال قراءات المياه</h2><p>القراءة السابقة تظهر من السجل؛ أدخل الحالية فقط.</p></div><div class="top-actions"><button class="btn btn-secondary" id="backPeriods">عودة للفترات</button><button class="btn btn-primary" id="recalcBtn">إعادة حساب الفترة</button></div></div><div class="notice" style="margin-bottom:14px">إذا كانت القراءة الحالية أقل من السابقة، لن يتم اعتمادها وسيظهر تحذير للمراجعة.</div><div class="table-wrap"><table class="table"><thead><tr><th>الكود</th><th>المشترك</th><th>العداد</th><th>السابقة</th><th>الحالية</th><th>الاستهلاك</th><th>الحالة</th><th></th></tr></thead><tbody>${meters.map(m=>{const r=map.get(m.id)||{};return `<tr><td>${safe(m.subscriber_code||'-')}</td><td class="emphasis">${safe(m.subscriber_name||'-')}</td><td>${safe(m.meter_code)}</td><td>${r.previous_reading??'-'}</td><td><input class="current-reading" data-meter="${m.id}" value="${safe(r.current_reading??'')}" inputmode="decimal" style="width:130px;padding:9px;border:1px solid var(--line);border-radius:9px"></td><td>${r.consumption??'-'}</td><td>${badge(r.status||'Pending')}</td><td><button class="btn btn-secondary save-reading" data-meter="${m.id}" data-prev="${r.previous_reading??''}">حفظ</button></td></tr>`}).join('')}</tbody></table></div></div>`);
  $('#backPeriods').onclick=periods; $('#recalcBtn').onclick=()=>periodSummary(id);
  $$('.save-reading').forEach(b=>b.onclick=async()=>{try{const input=document.querySelector(`.current-reading[data-meter="${b.dataset.meter}"]`);await api('/api/readings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({periodId:id,meterId:b.dataset.meter,previous:b.dataset.prev,current:input.value})});showToast('تم حفظ القراءة');await periodDetail(id);}catch(e){showToast(e.message,'error')}});
}

async function costs(){
  setTitle('التكاليف والمولدات','مصادر الطاقة والمصاريف التشغيلية والطوارئ');
  const src=await api('/api/energy/sources'); state.sources=src;
  render(`<div class="grid two"><div class="card section"><div class="section-head"><div><h2>مصادر الطاقة</h2><p>المولدات الحالية قابلة للتوسع.</p></div><button class="btn btn-primary" id="newEnergy">+ قراءة طاقة</button></div><div class="table-wrap"><table class="table"><thead><tr><th>المصدر</th><th>النوع</th><th>الحالة</th></tr></thead><tbody>${src.map(s=>`<tr><td class="emphasis">${safe(s.name)}</td><td>${safe(s.source_type)}</td><td>${s.active?badge('Approved'):`<span class="badge info">غير نشط</span>`}</td></tr>`).join('')}</tbody></table></div></div><div class="card section"><div class="section-head"><div><h2>مصروفات التشغيل</h2><p>كل مصروف يرتبط بفترة وقاعدة توزيع.</p></div><button class="btn btn-primary" id="newCost">+ إضافة مصروف</button></div><div class="notice">يدعم النظام المولد الخارجي، النقل، الوقود، الصيانة والطوارئ والمساهمة/الخصم.</div></div></div>`);
  $('#newEnergy').onclick=showEnergyForm; $('#newCost').onclick=showCostForm;
}

async function payments(){
  setTitle('الدفعات','تسجيل الدفعات ومتابعة الأرصدة');
  const subs=await api('/api/subscribers'); state.subscribers=subs;
  render(`<div class="card section"><div class="toolbar"><div><h2 style="margin:0">حسابات التحصيل</h2><div class="muted">كل دفعة تُسجل كحركة دائنة في دفتر الحساب.</div></div><button class="btn btn-primary" id="payBtn">+ تسجيل دفعة</button></div><div class="table-wrap"><table class="table"><thead><tr><th>الكود</th><th>الاسم</th><th>الرصيد</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>${subs.map(s=>`<tr><td>${safe(s.code)}</td><td class="emphasis">${safe(s.name)}</td><td>${money(s.balance)}</td><td>${s.balance>0?badge('Invalid'):s.balance<0?`<span class="badge success">رصيد دائن</span>`:`<span class="badge success">مسدد</span>`}</td><td><button class="btn btn-secondary btn-view-sub" data-id="${s.id}">كشف الحساب</button></td></tr>`).join('')}</tbody></table></div></div>`);
  $('#payBtn').onclick=showPaymentForm;
}

async function reports(){
  setTitle('التقارير','مراجعة الحسابات واستخراج الكشوف');
  render(`<div class="grid two"><div class="card section"><div class="section-head"><div><h2>كشف حساب مشترك</h2><p>الاستهلاك + الخدمات + الدفعات + الرصيد.</p></div><button class="btn btn-primary" id="reportSub">اختيار مشترك</button></div></div><div class="card section"><div class="section-head"><div><h2>تقرير الفترة</h2><p>التكلفة، الاستهلاك، سعر الوحدة وفرق التقريب.</p></div><button class="btn btn-primary" id="reportPeriod">اختيار فترة</button></div></div></div>`);
  $('#reportSub').onclick=async()=>{const s=await api('/api/subscribers');openModal(`<h2>اختر مشتركًا</h2><div class="table-wrap" style="margin-top:14px"><table class="table"><tbody>${s.map(x=>`<tr><td>${safe(x.code)}</td><td>${safe(x.name)}</td><td><button class="btn btn-secondary" data-report="${x.id}">فتح</button></td></tr>`).join('')}</tbody></table></div>`);$$('[data-report]').forEach(b=>b.onclick=()=>subscriberAccount(b.dataset.id));};
  $('#reportPeriod').onclick=async()=>{const ps=await api('/api/periods');openModal(`<h2>اختر الفترة</h2><div style="display:grid;gap:8px;margin-top:14px">${ps.map(x=>`<button class="btn btn-secondary" data-rp="${x.id}">${safe(x.label)} — ${safe(x.start_date)}</button>`).join('')}</div>`);$$('[data-rp]').forEach(b=>b.onclick=async()=>{closeModal();await periodSummary(b.dataset.rp);});};
}
async function auditView(){setTitle('سجل النشاط','تتبع العمليات المهمة والتعديلات');let logs=[];try{logs=await api('/api/audit')}catch{}render(`<div class="card section"><div class="section-head"><div><h2>آخر العمليات</h2><p>تاريخ من أنشأ أو عدّل أو أعاد حساب البيانات.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>النوع</th><th>المعرف</th></tr></thead><tbody>${logs.map(l=>`<tr><td>${safe(l.created_at)}</td><td>${safe(l.actor)}</td><td>${safe(l.action)}</td><td>${safe(l.entity_type)}</td><td>${safe(l.entity_id)}</td></tr>`).join('')||`<tr><td colspan="5" class="empty">لا توجد عمليات مسجلة.</td></tr>`}</tbody></table></div></div>`);}

function showSubForm(){
  openModal(`<h2>إضافة مشترك جديد</h2><div class="muted" style="margin-bottom:16px">سيتم ربط المشترك بوحدة وعداد لاحقًا عند الحاجة.</div><form id="subForm"><div class="form-grid"><div class="field"><label>الكود</label><input name="code" required placeholder="مثال: 1-03"></div><div class="field"><label>اسم المشترك</label><input name="name" required></div><div class="field"><label>البناية</label><select name="buildingId" id="buildingSelect"></select></div><div class="field"><label>كود الوحدة</label><input name="unitCode"></div><div class="field"><label>الدور</label><input name="floor"></div><div class="field"><label>رقم الهاتف</label><input name="phone"></div><div class="field"><label>رسم الحارس الافتراضي</label><input name="guardFee" type="number" step="0.01" value="30"></div><div class="field"><label>تأمين الغاطس الافتراضي</label><input name="pumpInsurance" type="number" step="0.01" value="15"></div></div><div class="actions"><button class="btn btn-primary">حفظ المشترك</button></div></form>`);
  api('/api/buildings').then(bs=>$('#buildingSelect').innerHTML=bs.map(b=>`<option value="${b.id}">${safe(b.name)}</option>`).join(''));
  $('#subForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/subscribers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});closeModal();showToast('تم إضافة المشترك');await subscribers();}catch(err){showToast(err.message,'error')}};
}
function showPeriodForm(){
  const today=new Date().toISOString().slice(0,10);
  openModal(`<h2>إنشاء فترة حسابية</h2><div class="muted" style="margin-bottom:16px">يفضل أن تكون الفترة أسبوعية ومتوافقة مع دورة القراءات الفعلية.</div><form id="periodForm"><div class="form-grid"><div class="field"><label>اسم الفترة</label><input name="label" placeholder="أسبوع ${today.split('-').reverse().join('/')}" required></div><div class="field"><label>من</label><input name="startDate" type="date" value="${today}" required></div><div class="field"><label>إلى</label><input name="endDate" type="date" value="${today}" required></div></div><div class="actions"><button class="btn btn-primary">إنشاء الفترة</button></div></form>`);
  $('#periodForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/periods',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});closeModal();showToast('تم إنشاء الفترة');await periods();}catch(err){showToast(err.message,'error')}};
}
function showPaymentForm(){
  openModal(`<h2>تسجيل دفعة</h2><form id="paymentForm"><div class="form-grid"><div class="field"><label>المشترك</label><select name="subscriberId">${state.subscribers.map(s=>`<option value="${s.id}">${safe(s.code)} — ${safe(s.name)}</option>`).join('')}</select></div><div class="field"><label>المبلغ</label><input name="amount" type="number" step="0.01" min="0.01" required></div><div class="field"><label>التاريخ</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div><div class="field"><label>طريقة الدفع</label><select name="method"><option value="Cash">نقدي</option><option value="Bank Transfer">تحويل</option><option value="Other">أخرى</option></select></div><div class="field"><label>رقم الإيصال</label><input name="receiptNumber"></div><div class="field"><label>ملاحظة</label><input name="note"></div></div><div class="actions"><button class="btn btn-primary">حفظ الدفعة</button></div></form>`);
  $('#paymentForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/payments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});closeModal();showToast('تم تسجيل الدفعة');await payments();}catch(err){showToast(err.message,'error')}};
}
async function showEnergyForm(){
  const ps=await api('/api/periods');
  openModal(`<h2>إدخال قراءة طاقة</h2><form id="energyForm"><div class="form-grid"><div class="field"><label>الفترة</label><select name="periodId">${ps.map(p=>`<option value="${p.id}">${safe(p.label)}</option>`).join('')}</select></div><div class="field"><label>المصدر</label><select name="sourceId">${state.sources.map(s=>`<option value="${s.id}">${safe(s.name)}</option>`).join('')}</select></div><div class="field"><label>القراءة السابقة</label><input name="previous" type="number" step="0.001"></div><div class="field"><label>القراءة الحالية</label><input name="current" type="number" step="0.001"></div><div class="field"><label>الفاقد</label><input name="loss" type="number" step="0.001" value="0"></div><div class="field"><label>سعر الكيلو</label><input name="price" type="number" step="0.01" min="0"></div></div><div class="actions"><button class="btn btn-primary">حفظ القراءة</button></div></form>`);
  $('#energyForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/energy/reading',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});closeModal();showToast('تم حفظ قراءة الطاقة');await costs();}catch(err){showToast(err.message,'error')}};
}
async function showCostForm(){
  const ps=await api('/api/periods');
  openModal(`<h2>إضافة مصروف تشغيلي</h2><form id="costForm"><div class="form-grid"><div class="field"><label>الفترة</label><select name="periodId">${ps.map(p=>`<option value="${p.id}">${safe(p.label)}</option>`).join('')}</select></div><div class="field"><label>النوع</label><select name="type"><option>مولد خارجي</option><option>نقل</option><option>وقود</option><option>صيانة</option><option>طوارئ</option><option>مصروف آخر</option><option>مساهمة/خصم</option></select></div><div class="field"><label>المبلغ</label><input name="amount" type="number" step="0.01" min="0" required></div><div class="field"><label>قاعدة التوزيع</label><select name="allocationRule"><option value="WATER_CONSUMPTION">حسب استهلاك المياه</option><option value="EACH_SUBSCRIBER">بالتساوي على المشتركين</option><option value="CUSTOM">تخصيص يدوي</option><option value="NONE">لا يتم تحميله</option></select></div><div class="field"><label>الجهة / المورد</label><input name="vendor"></div><div class="field"><label>الوصف</label><input name="description"></div></div><div class="actions"><button class="btn btn-primary">حفظ المصروف</button></div></form>`);
  $('#costForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/operational-cost',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});closeModal();showToast('تم حفظ المصروف');await costs();}catch(err){showToast(err.message,'error')}};
}
async function subscriberAccount(id){
  const a=await api('/api/subscribers/'+id+'/account'); closeModal();
  openModal(`<div class="account-head"><div><h2>${safe(a.subscriber.name)}</h2><div class="account-code">${safe(a.subscriber.code)} · ${safe(a.subscriber.building_name||'')} · ${safe(a.subscriber.unit_code||'')}</div></div><div class="balance-box"><div class="label">الرصيد الحالي</div><div class="amount">${money(a.balance)}</div></div></div><div class="grid two" style="margin-top:16px"><div class="card section"><div class="section-head"><div><h2>الاستهلاك</h2><p>القراءات والقيمة المحسوبة.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>الفترة</th><th>السابقة</th><th>الحالية</th><th>الاستهلاك</th><th>القيمة</th><th>الحالة</th></tr></thead><tbody>${a.readings.map(r=>`<tr><td>${safe(r.label)}</td><td>${r.previous_reading??'-'}</td><td>${r.current_reading??'-'}</td><td>${r.consumption??'-'}</td><td>${money(r.charge_amount)}</td><td>${badge(r.status)}</td></tr>`).join('')||`<tr><td colspan="6" class="empty">لا توجد قراءات.</td></tr>`}</tbody></table></div></div><div class="card section"><div class="section-head"><div><h2>الدفعات</h2><p>كل الدفعات المسجلة.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th><th>الإيصال</th></tr></thead><tbody>${a.payments.map(p=>`<tr><td>${safe(p.payment_date)}</td><td class="emphasis">${money(p.amount)}</td><td>${safe(p.method)}</td><td>${safe(p.receipt_number||'-')}</td></tr>`).join('')||`<tr><td colspan="4" class="empty">لا توجد دفعات.</td></tr>`}</tbody></table></div></div></div><div class="card section" style="margin-top:16px"><div class="section-head"><div><h2>دفتر الحساب</h2><p>المصدر الرسمي لتفسير الرصيد.</p></div><button class="btn btn-primary" onclick="window.print()">طباعة / PDF</button></div><div class="table-wrap"><table class="table"><thead><tr><th>التاريخ</th><th>الحركة</th><th>مدين</th><th>دائن</th><th>البيان</th></tr></thead><tbody>${a.ledger.map(r=>`<tr><td>${safe((r.created_at||'').slice(0,10))}</td><td>${safe(r.transaction_type)}</td><td>${money(r.debit)}</td><td>${money(r.credit)}</td><td>${safe(r.description||'')}</td></tr>`).join('')||`<tr><td colspan="5" class="empty">لا توجد حركات.</td></tr>`}</tbody></table></div></div>`);
}
function openModal(html){$('#modalBody').innerHTML=html;$('#modal').classList.remove('hidden');$('#modal').setAttribute('aria-hidden','false')}
function closeModal(){$('#modal').classList.add('hidden');$('#modal').setAttribute('aria-hidden','true')}
function navigate(v){state.view=v;$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===v));({dashboard,subscribers,periods,costs,payments,reports,audit:auditView}[v]||dashboard)().catch(e=>showToast(e.message,'error'));}
$('#modalClose').onclick=closeModal; $('#refreshBtn').onclick=()=>navigate(state.view); $('#quickPaymentBtn').onclick=async()=>{try{state.subscribers=await api('/api/subscribers');showPaymentForm()}catch(e){showToast(e.message,'error')}};
document.addEventListener('click',e=>{const b=e.target.closest('.btn-view-sub');if(b)subscriberAccount(b.dataset.id)});
$$('.nav-item').forEach(b=>b.onclick=()=>navigate(b.dataset.view)); document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()}); $('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
window.subscriberAccount=subscriberAccount;
navigate('dashboard');
