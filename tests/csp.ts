/** The policy the brief starts from; every directive here must appear unchanged. */
export const BRIEF_CSP =
  "default-src 'self'; connect-src 'none'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'";

/**
 * Directives added on top, each only tightening the policy: the app uses no workers
 * (so no service worker can ever be registered), frames, web fonts, media or manifest.
 */
export const TIGHTENING = "worker-src 'none'; frame-src 'none'; font-src 'none'; media-src 'none'; manifest-src 'none'";

export const APP_CSP = `${BRIEF_CSP}; ${TIGHTENING}`;
