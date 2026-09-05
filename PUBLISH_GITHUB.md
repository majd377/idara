# نشر النسخة على GitHub Pages

## 1. المستودع
ارفع محتويات هذا المجلد مباشرة إلى جذر المستودع:

- index.html
- app.js
- styles.css
- firebase-init.js
- firebase-config.js
- firestore.rules
- README.md
- .nojekyll

لا ترفع ملفات Excel الأصلية ولا قاعدة بيانات محلية تحتوي بيانات حقيقية.

## 2. Pages
GitHub → Settings → Pages → Deploy from a branch → main → / (root)

## 3. Firebase
- Authentication → Sign-in method → Google → Enable
- Authentication → Settings → Authorized domains → `majd377.github.io`
- Firestore → Rules → الصق محتوى `firestore.rules`

## 4. رابط المستودع
إذا كان المستودع `amin-building-manager` فالرابط المتوقع:
`https://majd377.github.io/amin-building-manager/`

## 5. البيانات
البيانات الحقيقية ليست في GitHub. هي داخل Firestore تحت organization `amin-main`.
