# EmberChain Production Migration

Two options to fix the miner flood issue. Pick one.

---

## Option A — Cloudflare (30 min, no server access needed)

Cloudflare sits in front of Replit and blocks miners at the edge before they
ever reach the server.

### Steps

1. **Create a free Cloudflare account** at https://cloudflare.com

2. **Add your domain**  
   Click "Add site" → enter `emberchain.org` → choose the **Free** plan.  
   Cloudflare will scan and import your current DNS records automatically.

3. **Update nameservers at your registrar**  
   Cloudflare will show you two nameservers (e.g. `ada.ns.cloudflare.com`).  
   Log into wherever you bought `emberchain.org` and replace the nameservers
   with those two values. DNS propagation takes 5–30 minutes.

4. **Add a WAF rule to block miners**  
   In Cloudflare dashboard: Security → WAF → Create rule  
   - **Field:** URI Path  
   - **Operator:** starts with  
   - **Value:** `/api/mining`  
   - **Action:** Block  
   Save. That's it — miners are stopped at Cloudflare's edge, zero reach
   Replit.

5. **Enable "Under Attack Mode" temporarily** (optional but helpful)  
   Security → Settings → Security Level → "Under Attack" for a few hours
   while miners back off.

---

## Option B — DigitalOcean VM (permanent, miners never reach Replit)

Your existing DigitalOcean VM becomes the primary host. nginx serves the
wallet locally, blocks mining routes, and proxies legitimate API calls to
Replit. Miners hitting `emberchain.org/api/mining/*` get a 503 from nginx
with zero upstream connections opened.

### What you need
- SSH access to the VM
- Your VM's public IP address
- DNS control for `emberchain.org`

### Steps

**On your LOCAL machine:**

```bash
# Find out the VM's public IP
ssh root@<VM_IP> "curl -s ifconfig.me"

# Upload the files
scp scripts/deploy-vm/wallet.tar.gz    root@<VM_IP>:/tmp/
scp scripts/deploy-vm/nginx-emberchain.conf root@<VM_IP>:/tmp/
scp scripts/deploy-vm/deploy.sh        root@<VM_IP>:/tmp/
```

**SSH into the VM and run:**

```bash
ssh root@<VM_IP>
chmod +x /tmp/deploy.sh
bash /tmp/deploy.sh
```

**Update DNS:**  
At your domain registrar, change the `A` record for `emberchain.org` from
Replit's IP to your VM's public IP.

Wait 5–30 minutes for DNS to propagate, then:

```bash
curl -I https://emberchain.org/           # should return 200
curl -X POST https://emberchain.org/api/mining/share  # should return 503
```

### How it works after migration

```
miners ──→ emberchain.org/api/mining/* ──→ nginx (VM) → 503 (never hits Replit)
users  ──→ emberchain.org/             ──→ nginx (VM) → static wallet files
users  ──→ emberchain.org/api/*        ──→ nginx (VM) → proxy → Replit api-server
```

Replit stays running for the database and API logic — it just never sees miner
traffic again.
