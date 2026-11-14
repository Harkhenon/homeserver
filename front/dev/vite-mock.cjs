// Interface du panel sur une API simulée, sans serveur ni VM : node front/dev/vite-mock.cjs
// Ouvre http://localhost:5173, puis connexion avec n'importe quels identifiants (rien n'est vérifié).
// Les données (domaines, boîtes, file d'attente…) vivent en mémoire et repartent de zéro à chaque lancement.
const { spawn } = require('child_process');
const path = require('path');

const front = path.resolve(__dirname, '..');
const port = process.env.HS_MOCK_PORT ?? '3901';
const api = spawn(process.execPath, [path.join(__dirname, 'mock-api.cjs')], { env: { ...process.env, HS_MOCK_PORT: port }, stdio: 'inherit' });
const vite = spawn(process.execPath, [path.join(front, 'node_modules/vite/bin/vite.js'), '--port', '5173', '--strictPort'], {
  cwd: front,
  env: { ...process.env, HS_API_TARGET: `http://127.0.0.1:${port}` },
  stdio: 'inherit',
});
const stop = () => { api.kill(); vite.kill(); };
vite.on('exit', (c) => { api.kill(); process.exit(c ?? 0); });
api.on('exit', (c) => { if (c) { console.error(`API simulée arrêtée (code ${c}) : port ${port} déjà pris ? HS_MOCK_PORT=... pour en changer`); vite.kill(); } });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, stop);
