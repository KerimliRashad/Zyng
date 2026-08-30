#!/bin/bash

# ZyngTRACKER Development Setup Script
# Prepares the environment for local development

set -e

echo "🚀 ZyngTRACKER Development Setup"
echo "================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Check Node.js
print_info "Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js 16+"
    exit 1
fi
NODE_VERSION=$(node -v)
print_status "Node.js $NODE_VERSION found"

# Check npm
print_info "Checking npm installation..."
if ! command -v npm &> /dev/null; then
    echo "npm is not installed"
    exit 1
fi
NPM_VERSION=$(npm -v)
print_status "npm $NPM_VERSION found"

# Install root dependencies
print_info "Installing root dependencies..."
npm install
print_status "Root dependencies installed"

# Install frontend dependencies
print_info "Installing frontend dependencies..."
cd frontend
npm install
print_status "Frontend dependencies installed"

# Install backend dependencies
print_info "Installing backend dependencies..."
cd ../backend
npm install
print_status "Backend dependencies installed"

echo ""
echo "================================="
echo -e "${GREEN}✓ Setup completed!${NC}"
echo "================================="
echo ""
echo "Next steps:"
echo "1. Terminal 1 - Start backend:"
echo "   cd backend && npm start"
echo ""
echo "2. Terminal 2 - Start frontend:"
echo "   cd frontend && npm run dev"
echo ""
echo "3. Open http://localhost:5173 in your browser"
echo ""
echo "Happy coding! 💪"
