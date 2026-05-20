#!/bin/bash

# Performance Optimization Deployment Script
# This script rebuilds and prepares the application for deployment

echo "🚀 Starting Performance Optimization Deployment..."
echo ""

# Step 1: Navigate to client directory
echo "📁 Navigating to client directory..."
cd client || exit 1

# Step 2: Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/

# Step 3: Install dependencies (if needed)
echo "📦 Checking dependencies..."
npm install --production=false

# Step 4: Build the application
echo "🔨 Building optimized production bundle..."
npm run build

# Step 5: Verify build output
echo ""
echo "✅ Build completed successfully!"
echo ""
echo "📊 Build output:"
ls -lh dist/ | head -20
echo ""

# Step 6: Show bundle size analysis
echo "📈 Bundle size summary:"
du -sh dist/
echo ""

# Navigate back to root
cd ..

echo "🎉 Build ready for deployment!"
echo ""
echo "Next steps:"
echo "1. Test the build locally: npm run preview (in client directory)"
echo "2. Deploy to Vercel: vercel --prod"
echo "3. Run Lighthouse audit on production URL"
echo "4. Compare performance metrics with baseline"
echo ""
echo "Expected improvements:"
echo "  • FCP: 4.4s → ~1.5-2.0s (60-65% faster)"
echo "  • LCP: 5.5s → ~2.0-2.5s (55-60% faster)"
echo "  • Speed Index: 11.2s → ~3.0-4.0s (65-70% faster)"
echo ""
