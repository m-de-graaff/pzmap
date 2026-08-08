import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Local pzmap2dzi render output (see README "Isometric tiles").
const TILES_DIR = process.env.PZMAP_TILES_DIR ?? 'D:/Development/pzmap-tiles/html/map_data/base'

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.dzi': 'application/xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

/** Serves the isometric tile pyramid at /tiles/* without copying it into public/. */
function serveTiles(): Plugin {
  return {
    name: 'serve-pz-tiles',
    configureServer(server) {
      server.middlewares.use('/tiles', (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^[/\\]+/, '')
        if (rel.includes('..')) return next()
        const file = join(TILES_DIR, rel)
        if (!existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404
          return res.end('not found')
        }
        const ext = file.slice(file.lastIndexOf('.'))
        res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-cache')
        createReadStream(file).pipe(res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), serveTiles()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
