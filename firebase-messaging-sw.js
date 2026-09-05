// firebase-messaging-sw.js
// File này BẮT BUỘC phải nằm ở GỐC website (cùng cấp với index.html/upharma-ops.html),
// ví dụ: https://nhansu-upharma.netlify.app/firebase-messaging-sw.js
// Không đổi tên file, không đặt trong thư mục con.

importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDUi5PEjF59RD1AZ4AhTQE_f0-00BZLQ08",
  authDomain: "upharma-176d5.firebaseapp.com",
  projectId: "upharma-176d5",
  storageBucket: "upharma-176d5.firebasestorage.app",
  messagingSenderId: "913487072756",
  appId: "1:913487072756:web:40d0c94547e1246be27da1",
});

const messaging = firebase.messaging();

// Xử lý thông báo đẩy khi trình duyệt đang chạy NỀN hoặc đã đóng tab
// (nhưng trình duyệt/thiết bị vẫn đang bật) — hiện thông báo hệ điều hành.
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "Upharma Ops";
  const body = (payload.notification && payload.notification.body) || "";
  self.registration.showNotification(title, {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
  });
});
