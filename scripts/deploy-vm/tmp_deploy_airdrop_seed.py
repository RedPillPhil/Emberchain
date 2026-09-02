"""Deploy Ember Airdrop + api-server on seed. Private key set ONLY on server env file."""
import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = "159.203.190.93"
KEY_PATH = r"C:\Users\robth\.ssh\id_ed25519"
PASSPHRASE = "DAKota2399!!"
REPO = "/root/Emberchain"
API_ENV = "/etc/emberchain/api-server.env"
AIRDROP_ENV = "/etc/emberchain/ember-airdrop.env"


def run(client, cmd, timeout=900):
    print("=" * 80)
    print("CMD:", cmd[:240])
    print("=" * 80)
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    if out.strip():
        print(out[-5000:] if len(out) > 5000 else out)
    if err.strip():
        print("STDERR:", err[-2000:] if len(err) > 2000 else err)
    return out, err


def main():
    key = paramiko.Ed25519Key.from_private_key_file(KEY_PATH, password=PASSPHRASE)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", pkey=key, timeout=30)

    run(client, f"cd {REPO} && git pull origin main")

    run(
        client,
        f"""
if [[ ! -f {AIRDROP_ENV} ]]; then
  cp {REPO}/scripts/deploy-vm/ember-airdrop.env.example {AIRDROP_ENV}
fi
grep -q '^AIRDROP_DISTRIBUTOR_PRIVATE_KEY=' {API_ENV} || echo 'AIRDROP_DISTRIBUTOR_PRIVATE_KEY=' >> {API_ENV}
grep AIRDROP_DISTRIBUTOR_PRIVATE_KEY {API_ENV} | sed 's/=.*/=***REDACTED***/'
""",
    )

    run(client, f"bash {REPO}/scripts/deploy-vm/deploy-api-server.sh", timeout=1200)
    run(client, f"bash {REPO}/scripts/deploy-vm/deploy-ember-airdrop.sh", timeout=1200)

    run(
        client,
        "cp /root/Emberchain/scripts/deploy-vm/nginx-emberchain.conf /etc/nginx/sites-available/emberchain && nginx -t && systemctl reload nginx",
    )

    run(
        client,
        "systemctl is-active emberchain-api emberchain-airdrop; "
        "curl -sf http://127.0.0.1:8081/api/airdrop/status | head -c 400; "
        "curl -sf http://127.0.0.1:43774/airdrop/api/health | head -c 200",
    )

    client.close()
    print("\nDone. Set AIRDROP_DISTRIBUTOR_PRIVATE_KEY manually in /etc/emberchain/api-server.env if not already configured.")


if __name__ == "__main__":
    main()
