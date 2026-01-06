// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyA5msJMllaFsz_-1X9ZFXZZ8EvFZ45UXlM",
    authDomain: "edufocus-app-6b4df.firebaseapp.com",
    projectId: "edufocus-app-6b4df",
    storageBucket: "edufocus-app-6b4df.firebasestorage.app",
    messagingSenderId: "320254244078",
    appId: "1:320254244078:web:28f3552fd2167483bd6fff"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);

    const notificationTitle = payload.notification.title || 'EduFocus';
    const notificationOptions = {
        body: payload.notification.body || 'Nova notificação',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        vibrate: [200, 100, 200, 100, 200],
        tag: 'edufocus-notification',
        requireInteraction: true,
        data: payload.data
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Notification click received.');

    event.notification.close();

    // Open the app
    event.waitUntil(
        clients.openWindow('/')
    );
});
