import { randomBytes, scrypt, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';


const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 64;

/**
 * Hash un mot de passe avec scrypt (format: scrypt$N$r$p$salt_hex$hash_hex).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scryptAsync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p })) as Buffer;
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function isHashedPassword(value: string): boolean {
  return /^scrypt\$/.test(value);
}

/**
 * Vérifie un mot de passe contre un hash scrypt — en temps constant quand le format est valide.
 * Renvoie false sur un mot de passe en clair (migration à gérer par l'appelant).
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltHex = parts[4] ?? '';
  const hashHex = parts[5] ?? '';
  if (saltHex.length === 0 || hashHex.length === 0) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (salt.length === 0 || expected.length === 0) return false;
  if (N < 2 || N > 2 ** 20 || r < 1 || p < 1) return false;
  const key = (await scryptAsync(password, salt, expected.length, { N, r, p })) as Buffer;
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/**
 * TOTP RFC 6238 (SHA-1, 6 chiffres, 30s) — implémentation native, sans dépendance.
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const c of clean) {
    const idx = BASE32_ALPHABET.indexOf(c);
    if (idx === -1) throw new Error(`caractère base32 invalide: ${c}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function createHmacBuf(secret: Buffer, counter: number, digits: number): { value: string } {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(buf).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const code = ((digest[offset] ?? 0) & 0x7f) << 24
    | (digest[offset + 1] ?? 0) << 16
    | (digest[offset + 2] ?? 0) << 8
    | (digest[offset + 3] ?? 0);
  return { value: String(code % 10 ** digits).padStart(digits, '0') };
}

/**
 * Génère un secret TOTP (base32) + URL otpauth pour QR code.
 */
export function generateTotpSecret(label: string, issuer = 'Homeserver'): { secret: string; otpauthUrl: string } {
  const raw = randomBytes(20);
  const secret = base32Encode(raw);
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return { secret, otpauthUrl };
}

/**
 * Vérifie un code TOTP avec fenêtre de tolérance ±1 période (30s).
 * Renvoie le compteur TOTP du code accepté (pour l'anti-replay), ou null si invalide.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  windowSteps = 1,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  let secret: Buffer;
  try {
    secret = base32Decode(secretBase32);
  } catch {
    return null;
  }
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let i = -windowSteps; i <= windowSteps; i++) {
    const expected = createHmacBuf(secret, counter + i, 6).value;
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return counter + i;
  }
  return null;
}

/**
 * Vérification factice contre un hash scrypt constant — égalise le timing de réponse
 * quand le nom d'utilisateur n'existe pas (anti user-enumeration).
 */
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = hashPassword('timing-equalizer-dummy');
  return dummyHashPromise;
}

export async function verifyDummyPassword(password: string): Promise<void> {
  const hash = await dummyHash();
  await verifyPassword(password, hash);
}
