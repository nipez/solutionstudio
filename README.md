# Solution Studio

Static site for [solutionstud.io](https://solutionstud.io), deployed on **Cloudflare Pages** from this GitHub repository.

| Path | Page |
|------|------|
| `/` | Main site |
| `/ai/` | Practical AI for small business |
| `/nonprofitai/` | Practical AI for nonprofits |

## Local development (Cursor)

```bash
npm run dev
```

Opens a local server at [http://localhost:3000](http://localhost:3000). Edit the HTML, refresh, then commit and push.

Optional Cloudflare-local preview:

```bash
npm run preview
```

## Deploy via GitHub → Cloudflare Pages

The site is plain HTML (no build step). Once Git is connected, every push to `main` deploys production; pull requests get preview URLs.

### One-time Cloudflare setup

1. Open [Cloudflare Dashboard → Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages).
2. **Create** → **Pages** → **Import an existing Git repository**.
3. Authorize GitHub and select **`nipez/solutionstudio`**.
4. Build settings:

   | Setting | Value |
   |---------|--------|
   | Production branch | `main` |
   | Build command | `exit 0` |
   | Build output directory | `/` |

5. Save and deploy.
6. Under **Custom domains**, attach `solutionstud.io` (and `www` if you use it). Remove or stop using the old zip-upload Pages project so only this Git-connected project serves the domain.

If you already have a zip-upload Pages project you want to keep: open that project → **Settings** → connect the GitHub repo (when available), or create a new Git-connected project and move the custom domain over.

### Day-to-day workflow

1. Edit in Cursor on a feature branch.
2. Open a PR → Cloudflare builds a **preview** deployment.
3. Merge to `main` → production updates automatically.

No more zip uploads.
