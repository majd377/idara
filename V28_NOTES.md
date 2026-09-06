# V28 — Cross-device login / role fix

- Built from working V27.
- Fixes the main cross-account problem: resident accounts no longer attempt to read all admin collections.
- Staff roles (admin/manager/accountant/operator/viewer) still load the full admin dataset.
- Resident accounts get a safe limited home instead of a Firestore permission error.
- Error UI now explains Firestore permission-denied errors clearly.
- Firebase config, ORG_ID, and Firestore schema are unchanged.
