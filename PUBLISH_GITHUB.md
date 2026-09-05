# رفع المشروع على GitHub Pages

## 1) ارفع محتويات هذا المجلد إلى جذر المستودع
يجب أن يكون `index.html` في جذر المستودع، وليس داخل مجلد إضافي.

## 2) من GitHub
Settings → Pages → Deploy from a branch → `main` → `/ (root)` → Save

## 3) ماذا يعمل على GitHub Pages؟
نسخة المعاينة تعمل داخل المتصفح وتحفظ البيانات في `localStorage`، وتوفر تصديرًا بصيغة CSV متوافقة مباشرة مع Excel.

## 4) ماذا يعمل محليًا؟
التشغيل المحلي يستخدم Node.js + SQLite ويعطيك API وقاعدة بيانات حقيقية محلية. التصدير المحلي يكون XLSX حقيقيًا.

## 5) التشغيل المحلي
```bash
npm install
npm start
```
ثم افتح `http://localhost:3000`.

Node.js 22 أو أحدث مطلوب لأن المشروع يستخدم SQLite المدمج في Node.
