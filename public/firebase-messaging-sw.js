// ==========================================
// Service Worker بسيط للتطبيق
// ==========================================

// تفعيل Service Worker
self.addEventListener('install', (event) => {
    console.log('✅ Service Worker تم تثبيته');
    self.skipWaiting();
});

// تفعيل Service Worker الجديد فوراً
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker تم تفعيله');
    event.waitUntil(self.clients.claim());
});

// استقبال الرسائل من التطبيق
self.addEventListener('message', (event) => {
    console.log('📨 تم استلام رسالة:', event.data);
});
