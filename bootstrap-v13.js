const boot = document.getElementById('boot');
function showBootError(message){
  if(!boot)return;
  boot.innerHTML = `<div class="boot-card"><div class="brand-logo">!</div><h1>تعذر تشغيل الموقع</h1><p style="max-width:520px;line-height:1.8">${String(message||'خطأ غير معروف').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))}</p><button class="btn primary" onclick="location.reload()">إعادة المحاولة</button></div>`;
}
import('./app-v13.js').catch(err=>{ console.error('App load error',err); showBootError(err?.message || err); });
