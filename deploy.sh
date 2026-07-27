#!/bin/bash
# N15 deployment script — run on your VPS
set -e

APP_DIR="/var/www/n15"
REPO="https://github.com/bychikola/N15.git"

echo "=== N15 Deploy ==="

# 1. Install Node.js 20+ if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# 2. Install PM2 if not present
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    sudo npm install -g pm2
fi

# 3. Clone or pull
if [ -d "$APP_DIR" ]; then
    echo "Pulling latest code..."
    cd "$APP_DIR"
    git pull origin master
else
    echo "Cloning repository..."
    sudo mkdir -p "$APP_DIR"
    sudo chown $USER:$USER "$APP_DIR"
    git clone "$REPO" "$APP_DIR"
    cd "$APP_DIR"
fi

# 4. Install dependencies
echo "Installing dependencies..."
npm ci --production=false

# 5. Build
echo "Building Next.js..."
npx next build

# 6. Restart
echo "Restarting app..."
pm2 delete n15 2>/dev/null || true
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup systemd -u $USER --hp $HOME

# 7. Done
echo ""
echo "=== Done! ==="
echo "App running on http://localhost:3000"
echo ""
echo "Next steps:"
echo "  1. Set up nginx: sudo cp nginx.conf /etc/nginx/sites-available/n15"
echo "  2. Enable: sudo ln -s /etc/nginx/sites-available/n15 /etc/nginx/sites-enabled/"
echo "  3. SSL: sudo certbot --nginx -d n15.ru -d www.n15.ru"
echo "  4. Set PAYLOAD_SECRET: pm2 env n15 PAYLOAD_SECRET=$(openssl rand -hex 32)"
