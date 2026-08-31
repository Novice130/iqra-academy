/**
 * Cross-platform clipboard & share utility.
 * Works across Android Chrome, iOS Safari, mobile WebViews, desktop,
 * insecure HTTP origins, and iframe/embedded contexts.
 */

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern navigator.clipboard API first
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Insecure context or permission denied — proceed to fallback below
    }
  }

  // 2. Fallback: DOM selection + execCommand('copy')
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.width = '2em';
      textarea.style.height = '2em';
      textarea.style.padding = '0';
      textarea.style.border = 'none';
      textarea.style.outline = 'none';
      textarea.style.boxShadow = 'none';
      textarea.style.background = 'transparent';
      textarea.style.fontSize = '16px';
      textarea.style.opacity = '0.01';
      document.body.appendChild(textarea);

      textarea.focus({ preventScroll: true });
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);

      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (successful) return true;
    } catch (err) {
      console.warn('execCommand copy failed:', err);
    }
  }

  return false;
}

/**
 * Share via native OS share sheet (e.g. WhatsApp, Messages, Copy on Android/iOS).
 * Falls back to clipboard copy if Web Share API is unavailable or rejected.
 */
export async function shareOrCopy(
  data: { title?: string; text?: string; url?: string },
  fallbackText: string
): Promise<{ method: 'shared' | 'copied' | 'failed' }> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: data.title,
        text: data.text,
        url: data.url,
      });
      return { method: 'shared' };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User dismissed the native share sheet
        return { method: 'failed' };
      }
      // If native share threw an error, fall back to direct clipboard copy
    }
  }

  const ok = await copyTextToClipboard(fallbackText);
  return { method: ok ? 'copied' : 'failed' };
}
