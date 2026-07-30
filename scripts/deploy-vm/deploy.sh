#!/usr/bin/env bash
# ============================================================
# EmberChain VM deploy script
# Run this on the DigitalOcean VM after uploading wallet.tar.gz
#
# Usage:
#   On your LOCAL machine first:
#     scp scripts/deploy-vm/nginx-emberchain.conf root@<VM_IP>:/tmp/
#     scp wallet.tar.gz root@<VM_IP>:/tmp/
#   Then SSH into the VM and run:
#     bash /tmp/deploy.sh
# ============================================================
set -euo pipefail

echo "=== EmberChain VM deploy ==="

# 1. Install nginx if not present
if ! command -v nginx &>/dev/null; then
    echo "Installing nginx..."
    apt-get update -q && apt-get install -y nginx
fi

# 2. Install certbot if not present
if ! command -v certbot &>/dev/null; then
    echo "Installing certbot..."
    apt-get install -y certbot python3-certbot-nginx
fi

# 3. Deploy wallet static files
echo "Deploying wallet static files..."
mkdir -p /var/www/emberchain
tar -xzf /tmp/wallet.tar.gz -C /var/www/emberchain --strip-components=0
chown -R www-data:www-data /var/www/emberchain

# 4. Install nginx config
echo "Installing nginx config..."
cp /tmp/nginx-emberchain.conf /etc/nginx/sites-available/emberchain
ln -sf /etc/nginx/sites-available/emberchain /etc/nginx/sites-enabled/emberchain
# Remove default site if it exists
rm -f /etc/nginx/sites-enabled/default

# 5. Test nginx config
nginx -t

# 6. Obtain / renew SSL cert
echo "Setting up SSL..."
certbot --nginx -d emberchain.org -d www.emberchain.org \
    --non-interactive --agree-tos --email admin@emberchain.org \
    --redirect 2>/dev/null || \
certbot renew --nginx 2>/dev/null || \
echo "NOTE: SSL cert could not be obtained automatically — DNS may not point here yet. Run certbot manually after DNS update."

# 7. Reload nginx
echo "Reloading nginx..."
systemctl enable nginx
systemctl reload nginx

echo ""
echo "=== Deploy complete ==="
echo "Test with: curl -I https://emberchain.org/"
echo "Check miners are blocked: curl -X POST https://emberchain.org/api/mining/share"
