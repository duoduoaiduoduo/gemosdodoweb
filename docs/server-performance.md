# Website performance operations

## Changes on 2026-09-22

- `deploy.sh` generates gzip companions for public JavaScript, CSS, JSON, SVG and WebAssembly. Source files and URLs remain unchanged. Precompression runs before the build is activated; a failure leaves the previous build live.
- `scripts/prune-builds.mjs` retains the newest three completed rollback builds after successful deployment. It never selects runtime JSON snapshots, uploads, upload backups, current dist or unfinished staging directories. Run with `--dry-run --root .deploy-state` under the deployment lock to inspect its plan.
- Timeline video uploads use one asynchronous media-processing slot with at most two waiting jobs. A full queue returns the original upload. Encoding quality settings are retained, while encoding/filter threads are limited to one. Existing sources remain intact after failure.
- Experiment list/detail reads load the small experiment store directly.
- AdminStudio loads on entering the admin route. The unused third-party Three.js/Lucide blocking scripts are removed, with required icons rendered by the existing React icon library. Desktop backdrop animation only mounts on the desktop home page.

## Nginx configuration

The checked-in `ops/nginx/gemos-performance.conf` is installed at `/www/server/panel/vhost/nginx/extension/8.147.65.3/gemos-performance.conf`. It is an include inside the existing website server block, not a replacement for that block.

- `/assets/`: generated content-hashed assets receive a one-year immutable cache.
- HTML and public unversioned scripts: `no-cache`, so clients validate before reuse.
- `deployment.json`: `no-store`.
- Static gzip is negotiated with `Vary: Accept-Encoding`; `.mjs` and `.wasm` receive their actual MIME types.
- API, uploads, dedicated model/download aliases and existing root sensitive-file restrictions retain their routing.

Before installation or later edits, preserve the previous configuration, run `/www/server/nginx/sbin/nginx -t`, then reload. The 2026-09-22 baseline configuration and prior PM2 process dump are retained privately at `.deploy-state/performance-config-20260922/` on the server. Do not publish this directory.

`pm2-root.service` was enabled with the installed Node/PM2 paths and the existing process list saved, allowing the site and deployment daemon to recover at boot. No server reboot was required for this change.

## Verification

The release source is exported from the Git index to a clean directory so unrelated local uncommitted design assets are excluded. Check TypeScript and the production build; run the deployment, pruning, precompression, runtime-data and media-processing tests.

After deployment, compare the public `deployment.json` commit with `origin/main` and the server deployment marker. Inspect the real homepage and lazy admin login UI. Check gzip negotiation, MIME/cache headers, conditional 304 responses, download byte ranges, unauthenticated transfer protection and the existing hidden-file denies. Check disk space and PM2 state/logs.

Baseline inspection found CPU idle, roughly 1.3 GiB available RAM, disk usage 88% and 52 retained builds consuming approximately 8.3 GiB. These changes address measured waste and blocking work; they are not a hardware upgrade or a claim about every visitor's connection speed. Existing upload originals and backups are preserved.
