const CACHE_NAME = "kairoscope-v1";

self.addEventListener("install", (event) => {
  console.log("Service Worker installing...");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker activated.");
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Let the browser handle requests normally.
});
