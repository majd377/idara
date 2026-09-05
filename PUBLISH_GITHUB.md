# نشر عمارة الأمين على GitHub Pages

## 1. أنشئ Repository جديد

مثال:

`amin-building-manager`

## 2. ارفع محتويات المجلد مباشرة داخل الجذر

يجب أن يكون `index.html` في الجذر.

## 3. فعّل Pages

GitHub → Settings → Pages → Build and deployment → Deploy from a branch → `main` → `/ (root)` → Save.

## 4. Firebase

Firebase Console → Authentication → Settings → Authorized domains → أضف:

`majd377.github.io`

وتأكد أن Google Enabled.

## 5. Firestore Rules

من Firebase → Firestore → Rules، انسخ محتوى `firestore.rules` ثم Publish.

## 6. لا ترفع أسرار إدارية

ممنوع رفع Service Account JSON أو Private Keys أو `.env`.
