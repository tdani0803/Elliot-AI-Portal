// Phone notifications + "add to home screen" helpers for the dashboard.
import { DEMO_MODE, supabase } from './supabase.js';

const ua = navigator.userAgent;
export const isIOS = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
export const isAndroid = /android/i.test(ua);
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// Android/Chrome lets us show our own "Install" button.
let installEvent = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installEvent = event;
  window.dispatchEvent(new Event('elliot:installable'));
});
export const canPromptInstall = () => Boolean(installEvent);
export async function promptInstall() {
  if (!installEvent) return false;
  installEvent.prompt();
  const { outcome } = await installEvent.userChoice;
  installEvent = null;
  return outcome === 'accepted';
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || DEMO_MODE) return;
  navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker not registered', err));
  // If a notification is tapped while the app is open, jump to that lead.
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'open' && event.data.url) location.href = event.data.url;
  });
}

// What should we show the person?
//   'unsupported'  old phone/browser
//   'install-ios'  iPhone: must add to home screen before notifications work
//   'denied'       they said no — must re-enable in phone settings
//   'off'          ready to turn on
//   'on'           all good
export async function notificationStatus() {
  if (DEMO_MODE) return 'off';
  if (isIOS && !isStandalone()) return 'install-ios';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

const urlBase64ToUint8Array = (base64) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

// Must be called from a tap (browsers only allow the permission prompt after a user action).
export async function enableNotifications(clientId) {
  if (DEMO_MODE) throw new Error('Notifications are off in demo mode.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  const reg = await navigator.serviceWorker.ready;
  const res = await fetch('/api/push-config');
  if (!res.ok) throw new Error("Notifications aren't set up on the server yet.");
  const { publicKey } = await res.json();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  const { endpoint, keys } = sub.toJSON();
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ client_id: clientId, endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: ua.slice(0, 250) }, { onConflict: 'endpoint' });
  if (error) throw error;
  return 'granted';
}

export async function sendTestNotification() {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/push-test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
  });
  if (!res.ok) throw new Error('Test failed');
  return res.json();
}
