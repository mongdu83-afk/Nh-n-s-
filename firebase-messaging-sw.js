// ===== firebase-messaging-sw.js — Upharma Ops =====
// File này BẮT BUỘC phải nằm ở GỐC website (cùng cấp với index.html).
//
// 26/9/2026: SỬA LỖI "bấm thông báo nào cũng mở ra cùng 1 nội dung". Nguyên nhân: trước đây khi bấm
// thông báo, nếu app đang mở sẵn (hoặc chạy nền trên điện thoại) thì service worker chỉ focus lại
// cửa sổ đó mà KHÔNG chuyển màn hình → luôn thấy đúng màn đang đứng dở (VD báo cáo AI). Server
// cũng chỉ gửi link "/" cho mọi thông báo. Nay:
//   - Server gửi link riêng cho từng loại: /?open=<tab>&p=<JSON tham số>
//   - Bấm thông báo: nếu app đang mở → focus + gửi message OPEN_LINK để app tự chuyển đúng màn;
//     nếu chưa mở → mở cửa sổ mới đúng link đó.
//   - Mỗi thông báo có tag riêng nên không đè lên nhau.

// Đăng ký xử lý click TRƯỚC khi nạp Firebase để luôn chạy code của mình.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
  const data = event.notification.data || {};
  // Hỗ trợ cả dạng cũ (Firebase tự hiển thị, link nằm trong FCM_MSG) phòng khi còn tin cũ.
  const fcm = data.FCM_MSG || {};
  const rawLink = data.link
    || (fcm.data && fcm.data.link)
    || (fcm.notification && fcm.notification.click_action)
    || "/";
  const url = new URL(rawLink, self.location.origin).href;

  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const sameOrigin = all.filter((c) => c.url && c.url.startsWith(self.location.origin));
    if (sameOrigin.length) {
      const client = sameOrigin.find((c) => c.focused) || sameOrigin[0];
      try { await client.focus(); } catch (e) { /* bỏ qua */ }
      client.postMessage({ type: "OPEN_LINK", link: url });
      return;
    }
    await clients.openWindow(url);
  })());
});

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

// Server gửi payload "data"-only → luôn tự hiển thị ở đây (không phụ thuộc cơ chế tự động của trình duyệt).
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  const title = d.title || "Upharma Ops";
  const link = d.link || "/";
  return self.registration.showNotification(title, {
    body: d.body || "",
    icon: d.icon || "/icon-192.png",
    badge: "/icon-192.png",
    tag: d.tag || (link + "|" + Date.now()),
    data: { link },
  });
});

// ===== 15/10/2026 TỐI ƯU TỐC ĐỘ MỞ APP (chị Hà): lưu sẵn trang app (index.html ~730KB) trên máy =====
// Mở app → hiện NGAY bản đã lưu (không phải tải lại 730KB mỗi lần, nhất là trên 4G), đồng thời tải bản mới ở nền để lần sau dùng.
// App vẫn tự kiểm tra bản mới (fetch ?_v=… — KHÔNG đi qua bộ nhớ này) → có bản mới thì hiện "Có bản app mới" / tự tải lại.
// Chỉ áp dụng cho trang chính; mọi dữ liệu (Firestore, Cloud Functions) vẫn lấy trực tiếp từ máy chủ như cũ.
const SHELL_CACHE = "upharma-shell-v1";
function isShellRequest(req) {
  if (req.method !== "GET" || req.mode !== "navigate") return false;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return false;
  if (u.searchParams.has("_v") || u.searchParams.has("nocache")) return false;
  return u.pathname === "/" || u.pathname === "/index.html";
}
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (!isShellRequest(req)) return; // mọi yêu cầu khác: để trình duyệt xử lý bình thường
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match("/");
    const network = fetch("/", { cache: "no-cache", credentials: "same-origin" }).then(async (res) => {
      if (res && res.ok && (res.headers.get("content-type") || "").includes("text/html")) await cache.put("/", res.clone());
      return res;
    });
    if (cached) { event.waitUntil(network.catch(() => {})); return cached; }
    try { return await network; } catch (e) { return cached || Response.error(); }
  })());
});
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_SHELL") event.waitUntil(caches.delete(SHELL_CACHE));
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));
