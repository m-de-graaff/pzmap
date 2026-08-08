# Docker Self-Hosting Implementation Plan

> **To execute:** use the `executing-plans` skill. Steps use `- [ ]` for tracking.

**Goal:** Let Mark run `docker compose up` on a LAN machine to serve the built map app plus his locally-rendered isometric tile pyramid to his family, with no internet exposure required.

**Architecture:** A two-stage Dockerfile builds the Vite/React SPA (`public/mapdata/*` is already committed, so the build stage needs no local Project Zomboid install) and hands `dist/` to an `nginx:alpine` runtime stage. Nginx serves the SPA with a `try_files` fallback and a second `location /tiles/` that reads from a directory mounted read-only from the host — the same `…/html/map_data/base/` pzmap2dzi output the README already tells users to point a static file server at (`README.md:47`). `docker-compose.yml` wires the host tiles path and LAN port through `.env` so nothing is hardcoded or baked into the image (the tile pyramid is many GB and is copyrighted game-derived content that must never enter the committed image).

**Tech stack:** Docker, Docker Compose v2, `nginx:alpine`, `node:22-alpine` (build stage only — satisfies Vite 8's `^20.19 || >=22.12` engine requirement).

## Global Constraints

- No test runner in this repo (confirmed: `package.json` has no test script). Each task's gate is a concrete `docker`/`curl` command and its expected output, run against a real build.
- npm is the package manager of record (`package-lock.json` is tracked; `pnpm-lock.yaml` is untracked local cruft — do not touch it).
- The tile pyramid must never be `COPY`'d into the image or committed — it's user-rendered, multi-GB, and derived from copyrighted game assets. It is always a runtime bind mount.
- Keep the container config LAN-only in spirit: no auth, no TLS, and the docs must say explicitly not to port-forward it to the internet.
- `writing-prose` applies to the README section in Task 4 — write it in the repo's existing voice (see current README: terse, code-block-first, no marketing language).

---

### Task 1: Multi-stage Dockerfile + .dockerignore

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

**Interfaces:**
- Produces: a `pzmap:local` buildable image that serves the static SPA on container port 80.

- [ ] **Step 1: Write `.dockerignore`**

```
node_modules
dist
dist-ssr
.git
.vercel
.claude
docs
*.md
*.log
pnpm-lock.yaml
```

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS serve
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

(`nginx.conf` doesn't exist yet — that's Task 2. The build will fail until then, which is expected; don't stub it here.)

- [ ] **Step 3: Build and confirm the build stage works**

Since `nginx.conf` isn't written yet, first confirm just the build stage compiles cleanly:

Run: `docker build --target build -t pzmap:build-check .`
Expect: exits 0, last lines show Vite's `dist/index.html` output summary.

- [ ] **Step 4: Commit**

`git add Dockerfile .dockerignore && git commit -m "build: add Docker build stage for self-hosting"`

---

### Task 2: nginx runtime config (SPA fallback + tile mount point)

**Files:**
- Create: `nginx.conf`
- Modify: `Dockerfile` (already references it from Task 1 — no change needed, this task just makes the reference resolve)

**Interfaces:**
- Produces: `nginx.conf`, mounted by the Dockerfile's `serve` stage at `/etc/nginx/conf.d/default.conf`.
- Consumes: nothing from Task 1 beyond the existing `COPY nginx.conf ...` line.

- [ ] **Step 1: Write `nginx.conf`**

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /tiles/ {
        alias /tiles/;
        # Tile pyramid is immutable per render; safe to cache hard.
        add_header Cache-Control "public, max-age=604800, immutable";
    }
}
```

No custom `types {}` block: a `types { ... }` directive *replaces* nginx's whole inherited
MIME table for the block it's in rather than extending it, which would silently break
`.js`/`.css`/`.json` content-types for the entire server. The app only ever `fetch()`s
`map_info.json` and image tiles at runtime (confirmed in `src/data/tilesource.ts`) — it never
requests a `.dzi` XML descriptor — so there's nothing to add a MIME type for.

- [ ] **Step 2: Full image build**

Run: `docker build -t pzmap:local .`
Expect: exits 0, both stages complete.

- [ ] **Step 3: Run it standalone and check the SPA**

Run:
```sh
docker run -d --name pzmap-check -p 8080:80 pzmap:local
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/some/deep/route
```
Expect: both print `200` (the second proves the `try_files` SPA fallback works — a client-side route with no matching file still serves `index.html`).

- [ ] **Step 4: Check the tiles location with no volume mounted**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/tiles/map_info.json`
Expect: `404` (no volume mounted yet — confirms the location block doesn't 500 or leak a directory listing when empty).

- [ ] **Step 5: Clean up and commit**

```sh
docker rm -f pzmap-check
git add nginx.conf && git commit -m "build: serve SPA + tile mount point via nginx"
```

---

### Task 3: docker-compose.yml + .env.example (host tile mount, LAN port)

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

**Interfaces:**
- Consumes: `pzmap:local` image built by the Dockerfile from Tasks 1–2 (compose builds it directly via `build: .`, no separate tag needed).
- Produces: two env vars read from `.env` — `PZMAP_TILES_DIR` (host path to the pzmap2dzi `html/map_data/base` output) and `PZMAP_PORT` (host port, default `8080`).

- [ ] **Step 1: Write `.env.example`**

```sh
# Host path to your pzmap2dzi render output (see README "Isometric tiles").
# This is the same directory README.md tells you to point a static file
# server at — e.g. D:/Development/pzmap-tiles/html/map_data/base
PZMAP_TILES_DIR=/absolute/path/to/pzmap-tiles/html/map_data/base

# LAN port to publish the map on. http://<this-machine's-LAN-IP>:PZMAP_PORT
PZMAP_PORT=8080
```

- [ ] **Step 2: Write `docker-compose.yml`**

```yaml
services:
  pzmap:
    build: .
    image: pzmap:local
    restart: unless-stopped
    ports:
      - "${PZMAP_PORT:-8080}:80"
    volumes:
      - "${PZMAP_TILES_DIR}:/tiles:ro"
```

- [ ] **Step 3: End-to-end check with a fake tiles directory**

```sh
mkdir -p /tmp/pzmap-tiles-fake
echo '{"ok":true}' > /tmp/pzmap-tiles-fake/map_info.json
cp .env.example .env
# edit .env: PZMAP_TILES_DIR=/tmp/pzmap-tiles-fake (use the real absolute path for your OS)
docker compose up -d --build
curl -s http://localhost:8080/tiles/map_info.json
```
Expect: prints `{"ok":true}` — proves the compose volume mount reaches the nginx `/tiles/` location end to end.

- [ ] **Step 4: Tear down and confirm restart policy, then clean up**

```sh
docker compose down
rm -rf /tmp/pzmap-tiles-fake .env
```

- [ ] **Step 5: Commit**

`git add docker-compose.yml .env.example && git commit -m "build: add docker-compose for one-command LAN self-hosting"`

---

### Task 4: README documentation

**Files:**
- Modify: `README.md` (new section after "### Isometric tiles", `README.md:47`)

**Interfaces:**
- Consumes: the exact file/command names from Tasks 1–3 (`Dockerfile`, `docker-compose.yml`, `.env.example`, `PZMAP_TILES_DIR`, `PZMAP_PORT`).

- [ ] **Step 1: Add a "Self-hosting on your LAN" section**

Insert after the "Isometric tiles" subsection (`README.md:47`), before "## Notes":

```markdown
### Self-hosting on your LAN

Once you've built `public/mapdata/` (above) and rendered your isometric tiles (above), you can
serve the whole thing to your household over Docker instead of running `npm run dev`:

\```sh
cp .env.example .env
# edit .env: point PZMAP_TILES_DIR at your pzmap2dzi output
# (the same …/html/map_data/base directory from "Isometric tiles" above)
docker compose up -d --build
\```

The map is now at `http://<this-machine's-LAN-IP>:8080` (default port, override via `PZMAP_PORT`
in `.env`) for anyone on the same network. There's no login and no HTTPS — it's built for a
trusted home LAN, not the internet. Don't forward the port through your router.

To update after pulling new commits: `docker compose up -d --build`. To pick up a re-render of
your tiles, no rebuild is needed — the tiles directory is mounted live, so a new render just
appears (refresh the browser).

Stop it with `docker compose down`.
```

- [ ] **Step 2: Verify the doc against the real commands**

Re-run the Task 3 Step 3 sequence exactly as written in the new README paragraph (real tiles dir,
not `/tmp` this time is fine either way) and confirm every command in the block is copy-pasteable
as-is with no missing steps.

- [ ] **Step 3: Commit**

`git add README.md && git commit -m "docs: document Docker self-hosting for LAN use"`
