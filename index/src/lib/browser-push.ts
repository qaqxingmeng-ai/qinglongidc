function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function browserPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export async function ensurePushRegistration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!browserPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function subscribeBrowserPush(publicKey: string): Promise<PushSubscription> {
  const registration = await ensurePushRegistration();
  const applicationServerKey = urlBase64ToUint8Array(publicKey) as BufferSource;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });
}
