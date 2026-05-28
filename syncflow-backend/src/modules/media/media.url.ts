/**
 * YouTube URL parser.
 *
 * Returns the canonical 11-character video id for the common URL
 * shapes:
 *   - https://www.youtube.com/watch?v=ID
 *   - https://youtu.be/ID
 *   - https://www.youtube.com/embed/ID
 *   - https://www.youtube.com/v/ID
 *   - https://www.youtube.com/shorts/ID
 *
 * Handles `www.` and `m.` subdomains and ignores extra query
 * parameters (timestamps via `&t=`, etc).
 *
 * Returns null for anything that isn't a recognised YouTube URL.
 * Service code maps null to MediaInvalidUrlError.
 */

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function extractYouTubeVideoId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }

  // Only http/https are sensible here. The URL parser accepts any scheme.
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, '');

  if (host === 'youtu.be') {
    const id = u.pathname.slice(1);
    return VIDEO_ID_PATTERN.test(id) ? id : null;
  }

  if (host === 'youtube.com') {
    if (u.pathname === '/watch') {
      const v = u.searchParams.get('v');
      return v !== null && VIDEO_ID_PATTERN.test(v) ? v : null;
    }
    const match = u.pathname.match(
      /^\/(?:embed|v|shorts)\/([A-Za-z0-9_-]{11})(?:[/?].*)?$/,
    );
    if (match) return match[1];
  }

  return null;
}
