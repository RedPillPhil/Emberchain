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
 *
 * Improvements over v1:
 *  - Searches for IGD:1, IGD:2, WANIPConnection:1 and WANPPPConnection:1 in
 *    a single M-SEARCH burst so routers that only respond to one ST are found.
 *  - Collects ALL LOCATION responses; if the first control-URL fetch fails the
 *    next candidate is tried rather than giving up immediately.
 *  - SOAPAction matches the actual service type (WANIPConnection vs
 *    WANPPPConnection) so PPPoE routers no longer silently reject the mapping.
 *  - setMulticastTTL(4) improves delivery on segmented LANs.
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
const DISCOVER_TTL = 6_000; // ms — wait for all router replies

/** Service-types we search for, in preference order */
const ST_LIST = [
  "urn:schemas-upnp-org:device:InternetGatewayDevice:2",
  "urn:schemas-upnp-org:device:InternetGatewayDevice:1",
  "urn:schemas-upnp-org:service:WANIPConnection:1",
  "urn:schemas-upnp-org:service:WANPPPConnection:1",
];

// ── SSDP discovery ────────────────────────────────────────────────────────────

interface ControlUrlResult {
  controlUrl:  string;
  serviceType: "WANIPConnection" | "WANPPPConnection";
}

/**
 * Sends M-SEARCH queries for all known ST values and collects every unique
 * LOCATION header that arrives within DISCOVER_TTL ms.  Returns them in
 * arrival order so the first successful parse wins.
 */
function discoverLocations(): Promise<string[]> {
  return new Promise((resolve) => {
    const sock = dgram.createSocket("udp4");
    const seen = new Set<string>();
    const locs: string[] = [];
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      try { sock.close(); } catch { /* ignore */ }
      resolve(locs);
    };

    sock.on("error", () => finish());

    sock.on("message", (buf) => {
      const text = buf.toString("utf-8");
      const m = text.match(/LOCATION:\s*(http[^\r\n]+)/i);
      if (!m) return;
      const loc = m[1]!.trim();
      if (!seen.has(loc)) { seen.add(loc); locs.push(loc); }
    });

    sock.bind(0, () => {
      try { sock.setMulticastTTL(4); } catch { /* ignore */ }

      // Send one M-SEARCH per service type
      for (const st of ST_LIST) {
        const msg = Buffer.from(
          "M-SEARCH * HTTP/1.1\r\n" +
          `HOST: ${SSDP_ADDR}:${SSDP_PORT}\r\n` +
          "MAN: \"ssdp:discover\"\r\n" +
          "MX: 3\r\n" +
          `ST: ${st}\r\n\r\n`,
        );
        sock.send(msg, 0, msg.length, SSDP_PORT, SSDP_ADDR, (err) => {
          if (err && !done) finish();
        });
      }
    });

    setTimeout(finish, DISCOVER_TTL);
  });
}

/** Parse a UPnP device descriptor and return the WAN control URL + service type. */
function fetchControlUrl(location: string): Promise<ControlUrlResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(location);
    const req = http.get(
      { host: u.hostname, port: u.port || 80, path: u.pathname + u.search, timeout: 5000 },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => {
          // Try WANIPConnection first, then WANPPPConnection
          for (const svcType of ["WANIPConnection", "WANPPPConnection"] as const) {
            const m = body.match(
              new RegExp(
                `<serviceType>[^<]*${svcType}[^<]*<\\/serviceType>[\\s\\S]*?<controlURL>([^<]+)<\\/controlURL>`,
                "i",
              ),
            );
            if (m) {
              const base = `${u.protocol}//${u.host}`;
              const ctrl = m[1]!.trim();
              const controlUrl = ctrl.startsWith("http")
                ? ctrl
                : `${base}${ctrl.startsWith("/") ? "" : "/"}${ctrl}`;
              resolve({ controlUrl, serviceType: svcType });
              return;
            }
          }
          reject(new Error("No WAN control URL in descriptor"));
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Descriptor fetch timeout")); });
  });
}

// ── SOAP helpers ──────────────────────────────────────────────────────────────

function soapRequest(
  controlUrl:  string,
  serviceType: "WANIPConnection" | "WANPPPConnection",
  action:      string,
  body:        string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(controlUrl);
    const ns = `urn:schemas-upnp-org:service:${serviceType}:1`;
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
          "SOAPAction":     `"${ns}#${action}"`,
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
  { controlUrl, serviceType }: ControlUrlResult,
  internalIp:   string,
  internalPort: number,
  externalPort: number,
): Promise<void> {
  const ns = `urn:schemas-upnp-org:service:${serviceType}:1`;
  const body =
    `<u:AddPortMapping xmlns:u="${ns}">` +
    `<NewRemoteHost></NewRemoteHost>` +
    `<NewExternalPort>${externalPort}</NewExternalPort>` +
    `<NewProtocol>TCP</NewProtocol>` +
    `<NewInternalPort>${internalPort}</NewInternalPort>` +
    `<NewInternalClient>${internalIp}</NewInternalClient>` +
    `<NewEnabled>1</NewEnabled>` +
    `<NewPortMappingDescription>EmberchainNode</NewPortMappingDescription>` +
    `<NewLeaseDuration>0</NewLeaseDuration>` +
    `</u:AddPortMapping>`;
  await soapRequest(controlUrl, serviceType, "AddPortMapping", body);
}

async function getExternalIp(result: ControlUrlResult): Promise<string> {
  const ns = `urn:schemas-upnp-org:service:${result.serviceType}:1`;
  const body =
    `<u:GetExternalIPAddress xmlns:u="${ns}">` +
    `</u:GetExternalIPAddress>`;
  const res = await soapRequest(result.controlUrl, result.serviceType, "GetExternalIPAddress", body);
  const m = res.match(/<NewExternalIPAddress>([^<]+)<\/NewExternalIPAddress>/i);
  if (!m) throw new Error("External IP not found in SOAP response");
  return m[1]!.trim();
}

export function getLocalIp(): string {
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
    const locations = await discoverLocations();
    if (locations.length === 0) {
      return { mapped: false, reason: "No UPnP router found on local network (SSDP timeout)" };
    }

    const internalIp = getLocalIp();
    const errors: string[] = [];

    // Try each discovered LOCATION in order; use the first that works end-to-end
    for (const loc of locations) {
      try {
        const ctrlResult = await fetchControlUrl(loc);
        await addPortMapping(ctrlResult, internalIp, internalPort, internalPort);
        const externalIp = await getExternalIp(ctrlResult);
        return { mapped: true, externalIp, externalPort: internalPort };
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    return {
      mapped: false,
      reason: `UPnP router found but mapping failed: ${errors.join("; ")}`,
    };
  } catch (err) {
    return { mapped: false, reason: err instanceof Error ? err.message : "UPnP failed" };
  }
}
