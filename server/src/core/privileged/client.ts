import { connect } from 'node:net';
import type { PrivilegedRequest, PrivilegedResponse } from './contract.js';

const DEFAULT_SOCKET = process.env.HS_HELPER_SOCKET ?? '/run/homeserver/helper.sock';

export async function callHelper<T = unknown>(
  request: PrivilegedRequest,
  socketPath: string = DEFAULT_SOCKET,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    let buf = '';
    socket.on('connect', () => {
      socket.write(JSON.stringify(request) + '\n');
    });
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const idx = buf.indexOf('\n');
      if (idx < 0) return;
      const raw = JSON.parse(buf.slice(0, idx)) as PrivilegedResponse<T>;
      socket.end();
      if (raw.ok) resolve(raw.data);
      else reject(new Error(`[${raw.code}] ${raw.error}`));
    });
    socket.on('error', reject);
    socket.setTimeout(120_000, () => {
      socket.destroy();
      reject(new Error('Timeout du helper privilégié'));
    });
  });
}
