#!/bin/bash
# SSL initialization script for sourcelab.truepathgroup.co.uk
# Run this ONCE on the droplet to get the initial certificate

DOMAIN="sourcelab.truepathgroup.co.uk"
EMAIL="tom@truepathgroup.co.uk"

echo "=== SSL Setup for $DOMAIN ==="

# Step 1: Create a temporary nginx config that only serves HTTP (for the ACME challenge)
echo "Step 1: Creating temporary nginx config..."
cat > /tmp/nginx-temp.conf << 'NGINXEOF'
events {
    worker_connections 1024;
}
http {
    server {
        listen 80;
        server_name sourcelab.truepathgroup.co.uk;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 200 'Setting up SSL...';
            add_header Content-Type text/plain;
        }
    }
}
NGINXEOF

# Step 2: Stop existing containers
echo "Step 2: Stopping containers..."
docker-compose down

# Step 3: Start nginx with temp config to handle ACME challenge
echo "Step 3: Starting temporary nginx..."
docker run -d --name nginx-temp \
  -p 80:80 \
  -v /tmp/nginx-temp.conf:/etc/nginx/nginx.conf:ro \
  -v certbot_www:/var/www/certbot \
  nginx:alpine

# Step 4: Request the certificate
echo "Step 4: Requesting SSL certificate..."
docker run --rm \
  -v certbot_www:/var/www/certbot \
  -v certbot_certs:/etc/letsencrypt \
  certbot/certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email $EMAIL \
  --agree-tos \
  --no-eff-email \
  -d $DOMAIN

# Step 5: Stop temporary nginx
echo "Step 5: Cleaning up..."
docker stop nginx-temp
docker rm nginx-temp

# Step 6: Check if certificate was created
if [ -d "/var/lib/docker/volumes/certbot_certs/_data/live/$DOMAIN" ]; then
    echo ""
    echo "=== SUCCESS! Certificate obtained ==="
    echo "Now update your .env file and run: docker-compose up -d --build"
else
    echo ""
    echo "=== Certificate may have been created in a named volume ==="
    echo "Try running: docker-compose up -d --build"
    echo "Check logs with: docker-compose logs nginx"
fi
