/**
 * Backup Encryption Helper — Story 9-9 AC#5
 *
 * AES-256-GCM authenticated encryption for daily Postgres backups.
 *
 * Why GCM over the story's original openssl-CBC recipe:
 *   - Authenticated: tampering with ciphertext or auth tag fails decryption (CBC is malleable).
 *   - Native Node crypto: no shell dependency on openssl + no PBKDF2 password-derivation needed.
 *   - Streamable: pipeline through Cipher/Decipher transforms; no full-file in-memory load.
 *   - 12-byte random IV per backup (GCM standard) — never reused for the same key, since each
 *     backup gets a fresh randomBytes(12).
 *
 * Key management — the BACKUP_ENCRYPTION_KEY env var is a 32-byte (256-bit) key encoded as 64
 * hex characters. Generate with: `openssl rand -hex 32`. Store in:
 *   - VPS .env (single source for runtime)
 *   - Operator's password manager (recovery)
 *   - Paper backup in physically secure location (last resort)
 *
 * Loss = backups become unrecoverable. The `quarterly-restore-drill` operational cadence in
 * runbook §6.1 verifies the key still works against current S3 ciphertexts.
 *
 * The IV and auth tag are NOT secret. They are stored in the BackupManifest (cleartext JSON)
 * alongside the ciphertext object in S3. Recovering a backup needs the key + the manifest.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from 'node:crypto';

export const ENCRYPTION_ALGORITHM = 'aes-256-gcm' as const;
export const IV_LENGTH_BYTES = 12; // GCM standard
export const KEY_LENGTH_BYTES = 32; // AES-256
export const AUTH_TAG_LENGTH_BYTES = 16;

export interface EncryptionMeta {
  algorithm: typeof ENCRYPTION_ALGORITHM;
  ivHex: string;
  authTagHex: string;
}

/**
 * Read and validate BACKUP_ENCRYPTION_KEY from env. Throws with an actionable message if
 * unset, wrong length, or non-hex. Returns the 32-byte key buffer.
 */
export function getEncryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const hex = env.BACKUP_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      'BACKUP_ENCRYPTION_KEY env var not set. Generate with: openssl rand -hex 32',
    );
  }
  const expectedHexLength = KEY_LENGTH_BYTES * 2;
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length !== expectedHexLength) {
    throw new Error(
      `BACKUP_ENCRYPTION_KEY must be ${expectedHexLength} hex chars (${KEY_LENGTH_BYTES}-byte AES-256 key); ` +
        `got ${hex.length} chars. Regenerate with: openssl rand -hex 32`,
    );
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Returns true if the env var is set and validates as a usable key. Used by the backup worker
 * to gate encryption — when the var is absent (dev/test/legacy prod before rollout), the
 * worker writes unencrypted `.sql.gz` for backward compat with existing S3 objects.
 */
export function isEncryptionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.BACKUP_ENCRYPTION_KEY) return false;
  try {
    getEncryptionKey(env);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create an AES-256-GCM cipher with a fresh random IV. The IV is returned alongside the cipher
 * so the caller can record it in the manifest. After all data has flowed through the cipher,
 * call `cipher.getAuthTag()` to obtain the tag for the manifest.
 */
export function createEncryptCipher(key: Buffer): { cipher: CipherGCM; iv: Buffer } {
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(`Encryption key must be ${KEY_LENGTH_BYTES} bytes; got ${key.length}`);
  }
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  return { cipher, iv };
}

/**
 * Create an AES-256-GCM decipher initialised with the IV + auth tag from the manifest. Pipe
 * the ciphertext through the returned decipher — if the auth tag verification fails (key
 * mismatch, tampered ciphertext, tampered tag, or tampered IV), the final read throws.
 */
export function createDecryptDecipher(
  key: Buffer,
  meta: EncryptionMeta,
): DecipherGCM {
  if (meta.algorithm !== ENCRYPTION_ALGORITHM) {
    throw new Error(`Unsupported algorithm: ${meta.algorithm}; only ${ENCRYPTION_ALGORITHM} supported`);
  }
  const iv = Buffer.from(meta.ivHex, 'hex');
  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error(`IV must be ${IV_LENGTH_BYTES} bytes; got ${iv.length}`);
  }
  const authTag = Buffer.from(meta.authTagHex, 'hex');
  if (authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new Error(`Auth tag must be ${AUTH_TAG_LENGTH_BYTES} bytes; got ${authTag.length}`);
  }
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher;
}

/**
 * Build the metadata block recorded in BackupManifest.encryption. Call after all plaintext
 * has been written through the cipher and the cipher has emitted its `final()`.
 */
export function buildEncryptionMeta(iv: Buffer, cipher: CipherGCM): EncryptionMeta {
  return {
    algorithm: ENCRYPTION_ALGORITHM,
    ivHex: iv.toString('hex'),
    authTagHex: cipher.getAuthTag().toString('hex'),
  };
}
