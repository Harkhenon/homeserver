// Exécution de commandes pour le service e-mail (rôle : root).
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export async function exec(cmd: string, args: string[], timeoutMs = 120_000): Promise<string> {
  const { stdout } = await run(cmd, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

export async function tryExec(cmd: string, args: string[], timeoutMs = 120_000): Promise<string | null> {
  try {
    return await exec(cmd, args, timeoutMs);
  } catch {
    return null;
  }
}

/** Commande avec données sur stdin : les secrets ne passent jamais par les arguments (visibles dans ps). */
export function execInput(cmd: string, args: string[], input: string, timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs });
    let out = '';
    let err = '';
    child.stdout.on('data', (c: Buffer) => { out += c.toString('utf8'); });
    child.stderr.on('data', (c: Buffer) => { err += c.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} : ${err.trim() || `code ${code}`}`));
    });
    child.stdin.end(input);
  });
}

export async function serviceActive(unit: string): Promise<boolean> {
  return ((await tryExec('systemctl', ['is-active', unit], 10_000)) ?? '').trim() === 'active';
}

export function errText(e: unknown): string {
  const err = e as Error & { stderr?: string };
  return (err.stderr ?? '').trim() || err.message;
}
