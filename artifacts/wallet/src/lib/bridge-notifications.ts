export function bridgeAlertKey(row: { direction: string; nonce: string; txHash: string }): string {
  return `${row.direction}:${row.nonce}:${row.txHash}`;
}

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export function showBridgeNotification(title: string, body: string): void {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: "ember-bridge-alert",
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      if (!window.location.pathname.startsWith("/admin")) {
        window.location.href = "/admin";
      }
      n.close();
    };
  } catch {
    /* ignore — e.g. insecure context */
  }
}

const NOTIFY_KEY = "ember_admin_bridge_notify";

export function getBridgeNotifyEnabled(): boolean {
  try {
    return localStorage.getItem(NOTIFY_KEY) === "1";
  } catch {
    return false;
  }
}

export function setBridgeNotifyEnabled(on: boolean): void {
  try {
    localStorage.setItem(NOTIFY_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

const SEEN_KEY = "ember_admin_bridge_seen";

export function loadSeenBridgeKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function saveSeenBridgeKeys(keys: Set<string>): void {
  try {
    const arr = [...keys].slice(-500);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/sw.js").catch(() => {});
}

export function isStandalonePwa(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
