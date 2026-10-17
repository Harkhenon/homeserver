import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { hashPassword, isHashedPassword } from './crypto.js';
import { logger } from '../core/logger.js';

export interface LoginAttempt {
  at: string;
  ip: string;
  username: string;
  success: boolean;
}

export interface AuthState {
  adminUser: string;
  passwordHash: string; // scrypt$N$r$p$salt$hash
  totpSecret?: string | undefined; // base32, si 2FA activée
  totpEnabledAt?: string | undefined;
  recentAttempts: LoginAttempt[]; // 100 derniers
}

const MAX_ATTEMPTS_LOGGED = 100;

export class AuthStore {
  private state: AuthState | null = null;
  private loaded = false;

  constructor(
    private readonly filePath: string,
    private readonly envUser: string,
    private readonly envPassword: string,
  ) {}

  private ensureDir(): void {
    const dir = this.filePath.replace(/\/[^/]+$/, '');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  load(): AuthState {
    if (this.loaded && this.state) return this.state;
    const state = this.loadFromDisk();
    this.state = state;
    this.loaded = true;
    return state;
  }

  private loadFromDisk(): AuthState {
    this.ensureDir();
    if (existsSync(this.filePath)) {
      try {
        const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as AuthState;
        if (typeof raw.adminUser === 'string' && typeof raw.passwordHash === 'string') {
          return {
            adminUser: raw.adminUser,
            passwordHash: raw.passwordHash,
            totpSecret: typeof raw.totpSecret === 'string' ? raw.totpSecret : undefined,
            totpEnabledAt: typeof raw.totpEnabledAt === 'string' ? raw.totpEnabledAt : undefined,
            recentAttempts: Array.isArray(raw.recentAttempts) ? raw.recentAttempts : [],
          };
        }
      } catch (err) {
        logger.error('auth store illisible, réinitialisation:', err);
      }
    }
    // Initialisation : hasher le mot de passe env (migration depuis l'env en clair)
    logger.info('auth: initialisation du store (hash scrypt du mot de passe env)');
    return {
      adminUser: this.envUser,
      passwordHash: 'pending',
      recentAttempts: [],
    };
  }

  async save(state: AuthState): Promise<void> {
    this.state = state;
    this.ensureDir();
    const tmp = `${this.filePath}.tmp-${randomBytes(4).toString('hex')}`;
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, this.filePath);
  }

  /**
   * Vérifie le mot de passe ; migre au passage un mot de passe env en clair vers scrypt.
   */
  async verifyPassword(password: string): Promise<{ ok: boolean; state: AuthState }> {
    let state = this.load();
    // Migration : premier démarrage — hasher le mot de passe env
    if (state.passwordHash === 'pending') {
      const matches = password === this.envPassword;
      if (matches) {
        state = { ...state, passwordHash: await hashPassword(password) };
        await this.save(state);
        logger.info('auth: mot de passe migré vers scrypt (première utilisation)');
      }
      return { ok: matches, state };
    }
    if (!isHashedPassword(state.passwordHash)) {
      // Ancien format (clair) — vérifier puis migrer
      const matches = password === state.passwordHash;
      if (matches) {
        state = { ...state, passwordHash: await hashPassword(password) };
        await this.save(state);
        logger.info('auth: mot de passe en clair migré vers scrypt');
      }
      return { ok: matches, state };
    }
    const { verifyPassword: verify } = await import('./crypto.js');
    return { ok: await verify(password, state.passwordHash), state };
  }

  async setPassword(password: string): Promise<void> {
    const state = this.load();
    await this.save({ ...state, passwordHash: await hashPassword(password) });
  }

  async setTotp(secret: string | undefined): Promise<void> {
    const state = this.load();
    const next: AuthState = { ...state };
    if (secret) {
      next.totpSecret = secret;
      next.totpEnabledAt = new Date().toISOString();
    } else {
      delete next.totpSecret;
      delete next.totpEnabledAt;
    }
    await this.save(next);
  }

  async recordAttempt(attempt: LoginAttempt): Promise<void> {
    const state = this.load();
    const attempts = [attempt, ...state.recentAttempts].slice(0, MAX_ATTEMPTS_LOGGED);
    await this.save({ ...state, recentAttempts: attempts });
  }

  getAttempts(): LoginAttempt[] {
    return this.load().recentAttempts;
  }

  async clearAttempts(): Promise<void> {
    const state = this.load();
    await this.save({ ...state, recentAttempts: [] });
  }
}
