# Deploy to Vercel

## Option 1: Web Interface (Recommended)

1. Go to https://vercel.com and sign in
2. Click "Add New Project"
3. Import repository `barbos001/tipzo` from GitHub
4. Configure settings:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
5. Click "Deploy"

## Option 2: CLI

1. Login to Vercel:
   ```bash
   cd frontend
   vercel login
   ```

2. Deploy to production:
   ```bash
   vercel --prod
   ```

## Configuration

The `frontend/vercel.json` file is already configured with:
- Build command: `npm run build`
- Output directory: `dist`
- SPA routing rewrites
- Static asset caching

## Notes

- After deployment, your site will be available at `tipzo.vercel.app` (or your custom domain)
- Vercel automatically deploys on every push to the main branch if you enable it in project settings
