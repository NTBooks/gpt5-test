import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

export default defineConfig({
    root: '.',
    server: {
        port: 5173,
        open: false,
        hmr: { overlay: true },
        fs: {
            allow: ['..']
        }
    },
    plugins: [
        {
            name: 'public-playlist-endpoint',
            configureServer(server) {
                server.middlewares.use('/__playlist', (req, res) => {
                    try {
                        const rootDir = server.config?.root ?? process.cwd();
                        const publicDir = path.resolve(rootDir, 'public');
                        const exts = new Set(['.mp3', '.wav', '.flac', '.m4a']);
                        const files = fs.existsSync(publicDir)
                            ? fs.readdirSync(publicDir).filter((f) => exts.has(path.extname(f).toLowerCase()))
                            : [];
                        const items = files.sort().map((f) => ({ name: f, url: '/' + f }));
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ items }));
                    } catch (e) {
                        res.statusCode = 500;
                        res.end(JSON.stringify({ items: [], error: String(e) }));
                    }
                });
            },
        },
    ],
})


