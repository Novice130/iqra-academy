#!/usr/bin/env bash
# One-time server setup for the novicetutor VPS (Ubuntu on Hetzner, Docker
# already installed). Safe to re-run: every step checks before it changes.
#
#   sudo bash bootstrap.sh                 everything except SSH hardening
#   sudo bash bootstrap.sh --harden-ssh    also turn off SSH password logins
#
# Run it as root. It does not start the app — see docs/deploy-vps.md.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR="${APP_DIR:-/opt/novicetutor}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
HARDEN_SSH=0

for arg in "$@"; do
  case "$arg" in
    --harden-ssh) HARDEN_SSH=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo bash bootstrap.sh)." >&2; exit 1; }
command -v docker >/dev/null || { echo "Docker is not installed." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "The docker compose plugin is missing (apt install docker-compose-plugin)." >&2; exit 1; }

echo "==> Deploy user: ${DEPLOY_USER}"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"

# Give the deploy user root's authorized keys on first run so there is a way
# in. Add the CI deploy key to this file afterwards.
DEPLOY_HOME="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_HOME/.ssh"
if [ ! -s "$DEPLOY_HOME/.ssh/authorized_keys" ] && [ -s /root/.ssh/authorized_keys ]; then
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /root/.ssh/authorized_keys "$DEPLOY_HOME/.ssh/authorized_keys"
  echo "    copied root's authorized_keys to ${DEPLOY_USER}"
fi

echo "==> Directory layout under ${APP_DIR}"
install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/caddy" "$APP_DIR/downloads"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR/certs"
if [ ! -f "$APP_DIR/.env" ]; then
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /dev/null "$APP_DIR/.env"
  echo "    created empty ${APP_DIR}/.env (600) — fill it in from deploy/env.example"
fi

echo "==> Swap (${SWAP_SIZE})"
if swapon --show --noheadings | grep -q .; then
  echo "    swap already active"
else
  if [ ! -f /swapfile ]; then
    fallocate -l "$SWAP_SIZE" /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# Swap is a safety net for a memory spike, not somewhere to live.
echo 'vm.swappiness=10' > /etc/sysctl.d/99-novicetutor.conf
sysctl -q --system

echo "==> Packages: ufw, unattended-upgrades"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ufw unattended-upgrades >/dev/null
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'APT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

echo "==> Firewall (ufw): 22, 80, 443"
# Note: ports published by Docker bypass ufw. Restricting 443 to Cloudflare's
# ranges is done in the Hetzner Cloud Firewall, which sits in front of the box.
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status | sed 's/^/    /'

if [ "$HARDEN_SSH" -eq 1 ]; then
  echo
  echo "!!! ------------------------------------------------------------------"
  echo "!!! --harden-ssh: SSH PASSWORD LOGINS ARE ABOUT TO BE TURNED OFF."
  echo "!!! If key login does not already work, you WILL be locked out and"
  echo "!!! will need the Hetzner web console to get back in."
  echo "!!! ------------------------------------------------------------------"
  if [ ! -s "$DEPLOY_HOME/.ssh/authorized_keys" ] && [ ! -s /root/.ssh/authorized_keys ]; then
    echo "Refusing: neither root nor ${DEPLOY_USER} has an authorized key." >&2
    exit 1
  fi
  cat > /etc/ssh/sshd_config.d/99-novicetutor.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
SSHD
  if sshd -t; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd
    echo "    password logins disabled. KEEP THIS SESSION OPEN and confirm a"
    echo "    key login works from a second terminal before closing it."
  else
    rm -f /etc/ssh/sshd_config.d/99-novicetutor.conf
    echo "sshd config test failed; change reverted." >&2
    exit 1
  fi
else
  echo
  echo "!!! SSH password logins were NOT changed. Once you have confirmed that"
  echo "!!! key login works for ${DEPLOY_USER}, re-run with --harden-ssh."
fi

echo
echo "Done. Next: certs into ${APP_DIR}/certs, fill ${APP_DIR}/.env, then deploy."
