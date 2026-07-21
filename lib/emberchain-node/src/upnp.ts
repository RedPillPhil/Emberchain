/**
 * UPnP IGD (Internet Gateway Device) port-mapping.
 *
 * Uses SSDP multicast to discover the home router, then sends SOAP requests to:
 *   1. Map an external TCP port → this machine's internal port
 *   2. Retrieve the router's public IP address
 *
 * No npm packages needed — pure Node.js built-ins (dgram, http, os, url).
 * This is the same mechanism Bitcoin Core uses to become publicly reachable
 * without manual port-forwarding configuration.
 */

import dgram from "node:dgram";
import http  from "node:http";
import os    from "node:os";
import { URL } from "node:url";

export interface UPnPResult {
  mapped:        boolean;
  externalIp?:   string;
  externalPort?: number;
  reason?:       string;
}

const SSDP_ADDR    = "239.255.255.250";
const SSDP_PORT    = 1900;
const DISCOVER_TTL = 5_000; // ms

// ── SSDP discovery ────────────────────────────────────────────────────────────

function discoverControlUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    const sock = dgram.createSocket("udp4");
    let done = false;

    const finish = (url: string | null) => {
      if (done) return;
      done = true;
      try { sock.close(); } catch { /* ignore */ }
      resolve(url);
    };

    const msg = Buffer.from(
      "M-SEARCH * HTTP/1.1\r\n" +
      `HOST: ${SSDP_ADDR}:${SSDP_PORT}\r\n` +
      "MAN: \"ssdp:discover\"\r\n" +
      "MX: 3\r\n" +
      "ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\r\n",
    );

    sock.on("error", () => finish(null));

    sock.on("message", (buf) => {
      const text = buf.toString("utf-8");
      const locationMatch = text.match(/LOCATION:\s*(http[^\r\n]+)/i);
      if (!locationMatch) return;
      const location = locationMatch[1]!.trim();
      fetchControlUrl(location).then(finish).catch(() => finish(null));
    });

    sock.bind(0, () => {
      sock.send(msg, 0, msg.length, SSDP_PORT, SSDP_ADDR, (err) => {
        if (err) finish(null);
      });
    });

    setTimeout(() => finish(null), DISCOVER_TTL);
  });
}

function fetchControlUrl(location: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(location);
    const req = http.get(
      { host: u.hostname, port: u.port || 80, path: u.pathname + u.search, timeout: 5000 },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => {
          const m = body.match(
            /<serviceType>[^<]*(?:WANIPConnection|WANPPPConnection)[^<]*<\/serviceType>[\s\S]*?<controlURL>([^<]+)<\/controlURL>/i,
          );
          if (!m) { reject(new Error("No WAN control URL in descriptor")); return; }
          const base = `${u.protocol}//${u.host}`;
          const ctrl = m[1]!.trim();
          resolve(ctrl.startsWith("http") ? ctrl : `${base}${ctrl.startsWith("/") ? "" : "/"}${ctrl}`);
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Descriptor fetch timeout")); });
  });
}

// ── SOAP helpers ──────────────────────────────────────────────────────────────

function soapRequest(controlUrl: string, action: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(controlUrl);
    const payload = Buffer.from(
      `<?xml version="1.0"?>\r\n` +
      `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ` +
      `s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">\r\n` +
      `  <s:Body>${body}</s:Body>\r\n` +
      `</s:Envelope>`,
    );
    const req = http.request(
      {
        host:    u.hostname,
        port:    u.port || 80,
        path:    u.pathname,
        method:  "POST",
        headers: {
          "Content-Type":   "text/xml; charset=utf-8",
          "SOAPAction":     `"urn:schemas-upnp-org:service:WANIPConnection:1#${action}"`,
          "Content-Length": String(payload.length),
        },
        timeout: 6000,
      },
      (res) => {
        let out = "";
        res.on("data", (c: Buffer) => { out += c.toString(); });
        res.on("end", () => resolve(out));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("SOAP timeout")); });
    req.write(payload);
    req.end();
  });
}

async function addPortMapping(
  controlUrl: string, internalIp: string,
  internalPort: number, externalPort: number,
): Promise<void> {
  const body =
    `<u:AddPortMapping xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1">` +
    `<NewRemoteHost></NewRemoteHost>` +
    `<NewExternalPort>${externalPort}</NewExternalPort>` +
    `<NewProtocol>TCP</NewProtocol>` +
    `<NewInternalPort>${internalPort}</NewInternalPort>` +
    `<NewInternalClient>${internalIp}</NewInternalClient>` +
    `<NewEnabled>1</NewEnabled>` +
    `<NewPortMappingDescription>EmberchainNode</NewPortMappingDescription>` +
    `<NewLeaseDuration>0</NewLeaseDuration>` +
    `</u:AddPortMapping>`;
  await soapRequest(controlUrl, "AddPortMapping", body);
}

async function getExternalIp(controlUrl: string): Promise<string> {
  const body =
    `<u:GetExternalIPAddress xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1">` +
    `</u:GetExternalIPAddress>`;
  const res = await soapRequest(controlUrl, "GetExternalIPAddress", body);
  const m = res.match(/<NewExternalIPAddress>([^<]+)<\/NewExternalIPAddress>/i);
  if (!m) throw new Error("External IP not found in SOAP response");
  return m[1]!.trim();
}

function getLocalIp(): string {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Attempts UPnP port-mapping so this node is reachable from the internet.
 *
 * Returns { mapped: true, externalIp, externalPort } when the router cooperates,
 * or { mapped: false, reason } when UPnP is unavailable — in which case the
 * node runs in outbound-only mode and still syncs fine.
 */
export async function tryUPnP(internalPort: number): Promise<UPnPResult> {
  try {
    const controlUrl = await discoverControlUrl();
    if (!controlUrl) return { mapped: false, reason: "No UPnP router found on local network" };

    const internalIp = getLocalIp();
    await addPortMapping(controlUrl, internalIp, internalPort, internalPort);
    const externalIp = await getExternalIp(controlUrl);

    return { mapped: true, externalIp, externalPort: internalPort };
  } catch (err) {
    return { mapped: false, reason: err instanceof Error ? err.message : "UPnP failed" };
  }
}
