#!/usr/bin/env bash
# Fix ERR_CERT_COMMON_NAME_INVALID for https://www.emberchain.org
#
# Cause: LetsEncrypt cert missing www in SAN, or www DNS not pointing at this server.
#
# Run on seed:
#   cd /root/Emberchain/emberchain
#   bash scripts/deploy-vm/fix-www-ssl.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NGINX_SITE="/etc/nginx/sites-available/emberchain"

echo "=== Emberchain www SSL fix ==="

echo ""
echo "1) DNS check (www must resolve to this server's public IP)"
PUBLIC_IP="$(curl -sf -4 ifconfig.me || curl -sf -4 icanhazip.com || true)"
WWW_IP="$(getent ahostsv4 www.emberchain.org 2>/dev/null | awk '{print $1; exit}' || true)"
APEX_IP="$(getent ahostsv4 emberchain.org 2>/dev/null | awk '{print $1; exit}' || true)"
echo "   Server public IP: ${PUBLIC_IP:-unknown}"
echo "   emberchain.org    → ${APEX_IP:-lookup failed}"
echo "   www.emberchain.org → ${WWW_IP:-lookup failed}"
if [[ -n "${PUBLIC_IP}" && -n "${WWW_IP}" && "${WWW_IP}" != "${PUBLIC_IP}" ]]; then
  echo ""
  echo "⚠  www.emberchain.org does NOT point to this server."
  echo "   Add a DNS A record:  www  →  ${PUBLIC_IP}"
  echo "   (or CNAME www → emberchain.org once apex is correct)"
  echo "   Wait for DNS propagation, then re-run this script."
  exit 1
fi

echo ""
echo "2) Expand LetsEncrypt cert to include www"
certbot certonly --nginx --expand \
  -d emberchain.org \
  -d www.emberchain.org \
  -d emberchain.duckdns.org \
  --non-interactive --agree-tos -m emberchaindev@gmail.com \
  || certbot certonly --webroot -w /var/www/emberchain --expand \
  -d emberchain.org \
  -d www.emberchain.org \
  -d emberchain.duckdns.org \
  --non-interactive --agree-tos -m emberchaindev@gmail.com

echo ""
echo "3) Install nginx config (www redirects to https://emberchain.org)"
cp "${REPO_ROOT}/scripts/deploy-vm/nginx-emberchain.conf" "$NGINX_SITE"
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/emberchain
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

echo ""
echo "4) Verify certificate SAN"
openssl x509 -in /etc/letsencrypt/live/emberchain.org/fullchain.pem -noout -text \
  | grep -A1 'Subject Alternative Name' || true

echo ""
echo "=== Done ==="
echo "  https://emberchain.org/          (canonical)"
echo "  https://www.emberchain.org/      (should 301 → apex)"
echo ""
echo "Test:"
echo "  curl -sI https://www.emberchain.org/ | head -5"
