#!/bin/bash

# ZyngTRACKER Deployment Script
# Usage: ./deploy.sh [production|development]

set -e

ENVIRONMENT=${1:-production}
WEB_ROOT="/var/www/html/tracker"
REPO_PATH=$(pwd)

echo "🚀 ZyngTRACKER Deployment Script"
echo "Environment: $ENVIRONMENT"
echo "==============================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Step 1: Install/Update Dependencies
print_info "Step 1: Installing dependencies..."
npm install > /dev/null 2>&1 || print_error "Failed to install root dependencies"

cd frontend
npm install > /dev/null 2>&1 || print_error "Failed to install frontend dependencies"
print_status "Frontend dependencies installed"

# Step 2: Build Frontend
print_info "Step 2: Building frontend..."
npm run build > /dev/null 2>&1 || {
    print_error "Frontend build failed"
    exit 1
}
print_status "Frontend built successfully"

# Step 3: Prepare Backend
cd ../backend
npm install > /dev/null 2>&1 || print_error "Failed to install backend dependencies"
print_status "Backend dependencies installed"

# Step 4: Copy Frontend to Web Root
print_info "Step 3: Deploying frontend to web server..."
if [ ! -d "$WEB_ROOT" ]; then
    print_info "Creating $WEB_ROOT directory..."
    sudo mkdir -p "$WEB_ROOT"
fi

# Check if we have sudo rights
if sudo test -w "$WEB_ROOT"; then
    sudo rm -rf "$WEB_ROOT"/*
    sudo cp -r "$REPO_PATH/frontend/dist"/* "$WEB_ROOT/" || {
        print_error "Failed to copy frontend files"
        exit 1
    }
    sudo chmod -R 755 "$WEB_ROOT"
    print_status "Frontend deployed to $WEB_ROOT"
else
    print_error "No write permission to $WEB_ROOT"
    print_info "Try running: sudo ./deploy.sh $ENVIRONMENT"
    exit 1
fi

# Step 5: Check Backend Process
print_info "Step 4: Checking backend process..."
if pm2 status tracker-api > /dev/null 2>&1; then
    print_info "Restarting backend..."
    pm2 restart tracker-api
    print_status "Backend restarted"
else
    print_info "Starting backend..."
    cd "$REPO_PATH/backend"
    pm2 start server.js --name "tracker-api" --env $ENVIRONMENT
    pm2 save
    print_status "Backend started"
fi

# Step 6: Verify Nginx
print_info "Step 5: Verifying Nginx configuration..."
if sudo nginx -t 2>&1 | grep -q "successful"; then
    print_status "Nginx configuration is valid"

    print_info "Reloading Nginx..."
    sudo systemctl restart nginx
    print_status "Nginx reloaded"
else
    print_error "Nginx configuration error"
    sudo nginx -t
    exit 1
fi

# Step 7: Final Checks
print_info "Step 6: Running final checks..."

# Check Frontend
if curl -s http://localhost/tracker/ > /dev/null 2>&1; then
    print_status "Frontend is accessible"
else
    print_error "Frontend is not accessible"
fi

# Check Backend
if curl -s http://localhost:5000/api/health | grep -q "ok"; then
    print_status "Backend API is running"
else
    print_error "Backend API is not responding"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
echo "=========================================="
echo ""
echo "📍 Access your app at: http://zyng.online/tracker"
echo ""
echo "Useful commands:"
echo "  • pm2 status              - Check backend status"
echo "  • pm2 logs tracker-api    - View backend logs"
echo "  • pm2 restart tracker-api - Restart backend"
echo "  • systemctl status nginx  - Check Nginx status"
echo ""
