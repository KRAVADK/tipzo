# Vercel Deployment Guide

## Quick Setup Instructions

When setting up the project in Vercel UI, configure these settings:

### Required Settings:

1. **Root Directory**: 
   - Click "Edit" next to Root Directory
   - Change from `./` to `frontend`
   - This tells Vercel to use the `frontend` folder as the project root

2. **Framework Preset**:
   - Select **"Vite"** from the dropdown (or leave as "Other" if Vite is not available)

3. **Build and Output Settings** (click to expand):
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install` (or leave default)

4. **Environment Variables** (if needed):
   - Add any required environment variables here

5. Click **"Deploy"**

## Automatic Deployment via GitHub

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New Project"
3. Import your GitHub repository (`barbos001/tipzo`)
4. **IMPORTANT**: Set Root Directory to `frontend`
5. Configure Build Settings as shown above
6. Click "Deploy"

## Manual Deployment via Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Navigate to frontend directory:
   ```bash
   cd frontend
   ```

4. Deploy:
   ```bash
   vercel
   ```

5. For production deployment:
   ```bash
   vercel --prod
   ```

## Configuration

The `vercel.json` file is configured to:
- Build from the `frontend` directory (when root is set to `frontend`)
- Output to `dist`
- Handle SPA routing with rewrites
- Cache static assets

## Troubleshooting

If deployment fails:
- Make sure **Root Directory** is set to `frontend` (not `./`)
- Verify **Build Command** is `npm run build`
- Verify **Output Directory** is `dist`
- Check build logs for specific errors

## Notes

- Vercel automatically handles Node.js version (uses Node 20 by default)
- The build runs in the `frontend` directory when Root Directory is set correctly
- All routes are rewritten to `/index.html` for React Router to work
