# Vercel Deployment Guide

## Automatic Deployment via GitHub

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New Project"
3. Import your GitHub repository (`tipzo`)
4. Vercel will auto-detect the settings:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend` (or leave as root and it will use `vercel.json`)
   - **Build Command**: `npm run build` (runs in `frontend` directory)
   - **Output Directory**: `dist`
5. Click "Deploy"

## Manual Deployment via Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy:
   ```bash
   vercel
   ```

4. For production deployment:
   ```bash
   vercel --prod
   ```

## Configuration

The `vercel.json` file is configured to:
- Build from the `frontend` directory
- Output to `frontend/dist`
- Handle SPA routing with rewrites
- Cache static assets

## Environment Variables

If you need environment variables:
1. Go to Project Settings → Environment Variables
2. Add any required variables
3. Redeploy

## Notes

- Vercel automatically handles Node.js version (uses Node 20 by default)
- The build runs in the `frontend` directory as specified in `vercel.json`
- All routes are rewritten to `/index.html` for React Router to work
