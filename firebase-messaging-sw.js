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
//
// QUAN TRỌNG: server (Cloud Functions) giờ gửi payload dạng "data"-only (KHÔNG có field
// "notification" ở cấp cao nhất) — vì để trình duyệt tự hiển thị theo field "notification" đã
// được xác nhận CHẬP CHỜN trên thực tế (nhiều máy không hiện thông báo dù Firebase báo gửi thành
// công 100%, không lỗi nào). Dùng "data"-only buộc đoạn code này LUÔN LUÔN chạy để tự gọi
// showNotification — kiểm soát được hoàn toàn, không phụ thuộc hành vi tự động của trình duyệt.
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || "Upharma Ops";
  const body = data.body || "";
  self.registration.showNotification(title, {
    body,
    icon: data.icon || "/favicon.ico",
    badge: "/favicon.ico",
    data: { link: data.link || "/" },
  });
});

// Khi người dùng bấm vào thông báo — mở đúng trang app (hoặc tab đã mở sẵn nếu có).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});
