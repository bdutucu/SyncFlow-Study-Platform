import bcrypt from 'bcrypt';
import { env } from '../config/env';

/**
 * Password hashing helpers.
 *
 * DSD §3.5.5: bcrypt with cost factor >= 10. The cost is configurable via
 * BCRYPT_COST so tests can run with a lower cost without weakening prod.
 */

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, env.BCRYPT_COST);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Dummy bcrypt comparison used during login when the email does not exist.
 * Without this, attackers can distinguish "unknown email" from "wrong
 * password" purely by response time (real bcrypt takes ~100ms at cost 10,
 * a missing-user short-circuit takes microseconds). We lazy-init the hash
 * so module load does not block the event loop.
 */
let _dummyHash: string | undefined;
function dummyHash(): string {
  if (!_dummyHash) {
    _dummyHash = bcrypt.hashSync('not-a-real-password', env.BCRYPT_COST);
  }
  return _dummyHash;
}

export async function dummyCompare(plaintext: string): Promise<void> {
  // Result discarded; we only care about the time spent.
  await bcrypt.compare(plaintext, dummyHash());
}
