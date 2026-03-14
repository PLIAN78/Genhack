# Dashboard Integration Guide

This document explains how to connect the Security Copilot landing page to the dashboard.

## Overview

The landing page includes several "Call-to-Action" buttons that redirect users to the dashboard:
- **"Try Now"** button in the navigation bar
- **"Launch Dashboard"** buttons in the hero section and CTA section
- **"View Demo"** button that scrolls to the how-it-works section

## Configuration

### Environment Variable

The dashboard URL is configured via the `VITE_DASHBOARD_URL` environment variable:

```bash
VITE_DASHBOARD_URL=http://localhost:3001
```

### Default Behavior

If `VITE_DASHBOARD_URL` is not set, it defaults to `http://localhost:3001`.

### Setting Up for Different Environments

#### Local Development

For local development with both landing page and dashboard running:

```bash
# Terminal 1: Landing page (port 3000)
cd security-copilot-landing
pnpm dev

# Terminal 2: Dashboard (port 3001)
cd ../Genhack_PLIAN/apps/dashboard
pnpm dev
```

The landing page will automatically redirect to `http://localhost:3001/app` when users click dashboard buttons.

#### Production Deployment

When deploying to production, set the environment variable to your dashboard domain:

```bash
VITE_DASHBOARD_URL=https://dashboard.security-copilot.com
```

## How It Works

### Button Click Handler

All dashboard navigation buttons use this pattern:

```typescript
const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL || "http://localhost:3001";

<Button 
  onClick={() => window.location.href = `${DASHBOARD_URL}/app`}
>
  Launch Dashboard
</Button>
```

### Navigation Flow

```
Landing Page (Port 3000)
    ↓
    [User clicks "Launch Dashboard"]
    ↓
    Redirect to VITE_DASHBOARD_URL/app
    ↓
Dashboard (Port 3001 or production domain)
```

## Troubleshooting

### "URI malformed" Error

If you see a "URI malformed" error in Vite:

1. **Check your file path** — Ensure there are no special characters or spaces in the project path
2. **Clear node_modules** — Run `rm -rf node_modules pnpm-lock.yaml && pnpm install`
3. **Restart dev server** — Kill the dev server and run `pnpm dev` again

### Dashboard Not Loading

If clicking the button doesn't load the dashboard:

1. **Verify dashboard is running** — Check that the dashboard app is running on the configured port
2. **Check VITE_DASHBOARD_URL** — Ensure the environment variable is set correctly
3. **Check browser console** — Look for CORS or network errors
4. **Verify port numbers** — Make sure landing page (3000) and dashboard (3001) are on different ports

## Integration with Monorepo

If you're using a monorepo structure, you can run both apps with:

```bash
# From root directory
pnpm dev
```

This will start both the landing page and dashboard in parallel if configured in `pnpm-workspace.yaml`.

## Cross-Origin Requests

If the landing page and dashboard are on different domains, ensure:

1. **CORS is enabled** on the dashboard backend
2. **Dashboard accepts requests** from the landing page domain
3. **Both use HTTPS** in production

## Next Steps

1. Set up the `VITE_DASHBOARD_URL` environment variable for your deployment
2. Test the navigation by clicking "Launch Dashboard" buttons
3. Verify the dashboard loads correctly and maintains user session state
4. Configure CORS if needed for cross-domain requests
