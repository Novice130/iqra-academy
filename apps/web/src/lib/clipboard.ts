/**
 * Cross-platform clipboard & share utility.
 * Works across Android Chrome, iOS Safari, mobile WebViews, desktop,
 * insecure HTTP origins, and iframe/embedded contexts.
 */

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. textarea select + execCommand('copy') — deliberately FIRST and fully
  // synchronous. Both Safari and Chrome only honour a copy inside the user
  // gesture, and the moment we `await` anything (the async clipboard API's
  // own promise, a rejected NotAllowedError) Safari no longer counts the tap
  // as a gesture, so a fallback that runs after an await fails too. That is
  // what "the copy button doesn't work anywhere" was on iOS: the clipboard
  // write was rejected, and every fallback had already lost the gesture by
  // the time it ran.
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      // Do not set contentEditable or readOnly to weird values
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '-9999px';
      textarea.style.width = '2em';
      textarea.style.height = '2em';
      textarea.style.padding = '0';
      textarea.style.border = 'none';
      textarea.style.outline = 'none';
      textarea.style.boxShadow = 'none';
      textarea.style.background = 'transparent';
      textarea.style.fontSize = '16px';
      document.body.appendChild(textarea);

      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, text.length);

      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (successful) return true;
    } catch (err) {
      console.warn('execCommand copy failed:', err);
    }
  }

  // 2. Modern navigator.clipboard API (secure contexts). Reached when
  // execCommand is unavailable or refuses; by now the gesture may be spent,
  // but there is nothing left to lose by trying.
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Insecure origin, iframe permissions policy, or permission denied — proceed to fallback below
    }
  }

  // 3. Last-resort fallback: window.prompt so the user is never stuck without copied content
  if (typeof window !== 'undefined') {
    try {
      window.prompt('Copy to clipboard: Press Ctrl+C (or Cmd+C), then press Enter', text);
      return true;
    } catch {}
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
