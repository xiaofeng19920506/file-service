import { readHeardAudioCacheEnabled } from './heard-audio-cache-preference';

const SW_URL = '/heard-audio-sw.js';

export async function registerHeardAudioServiceWorker(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (!readHeardAudioCacheEnabled()) return;
  try {
    await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  } catch {
    /* ignore */
  }
}

export async function unregisterHeardAudioServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((reg) => {
          const url = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
          return url.includes('heard-audio-sw.js');
        })
        .map(async (reg) => {
          try {
            reg.active?.postMessage({ type: 'CLEAR_HEARD_AUDIO' });
          } catch {
            /* ignore */
          }
          await reg.unregister();
        }),
    );
  } catch {
    /* ignore */
  }
}
