/**
 * Mirror of the backend's `deriveUid(userId)` in
 * syncflow-backend/src/modules/voice/voice.issuer.ts.
 *
 * Agora's RTC channels use 32-bit unsigned integer UIDs. We can't ship
 * a UUID as a UID, so the backend hashes the user id with SHA-256 and
 * takes the first 4 bytes as a uint32. The same function on the client
 * lets us reverse the mapping locally: knowing a room's members
 * (userId + username), we can pre-compute every member's Agora UID and
 * later answer "who is this remote UID?" when a user-published event
 * fires.
 *
 * Web Crypto's subtle.digest is the lightweight equivalent of
 * crypto.createHash('sha256') on Node.
 */
export async function deriveAgoraUid(userId: string): Promise<number> {
  const bytes = new TextEncoder().encode(userId);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const view = new DataView(hashBuffer);
  const n = view.getUint32(0, false); // big-endian, matches Node's readUInt32BE
  return n === 0 ? 1 : n;
}
