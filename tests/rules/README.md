# Kiểm thử luật phân quyền (Firestore + Storage)

Chạy trên Firebase Emulator, không đụng dữ liệu thật. Cần Java + `firebase-tools`, `@firebase/rules-unit-testing`, `firebase`.

```
# đặt firestore.rules / storage.rules (bản trong upharma-cloud-functions) cạnh 2 file test, rồi:
npx firebase emulators:exec --project upharma-test --only firestore "node rules.test.js"
npx firebase emulators:exec --project upharma-test --only firestore "node crm.test.js"   # dữ liệu khách hàng (CRM mục 8)
npx firebase emulators:exec --project upharma-test --only storage "node storage.test.js"
```

Cổng: firestore 8085, storage 9199 (khai trong firebase.json của thư mục chạy).
