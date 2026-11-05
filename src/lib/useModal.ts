import {useEffect, useRef, type RefObject} from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusableIn = (root: HTMLElement): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hidden && el.getAttribute('aria-hidden') !== 'true');

/**
 * Keyboard behaviour every dialog needs: focus moves into it when it opens, Tab and Shift+Tab stay
 * inside it, Escape closes it, and focus returns to whatever opened it. Attach the returned ref to
 * the panel (and give the panel `role="dialog"`, `aria-modal="true"`, an accessible name and
 * `tabIndex={-1}`). Put `data-autofocus` on the element that should receive focus first, if it is
 * not the first focusable one.
 */
export function useModal<T extends HTMLElement>(isOpen: boolean, onClose: () => void): RefObject<T> {
  const ref = useRef<T>(null);
  // The latest handler, without re-running the effect (and so re-stealing focus) on every render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const panel = ref.current;
    if (!isOpen || !panel) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (panel.querySelector<HTMLElement>('[data-autofocus]') ?? focusableIn(panel)[0] ?? panel).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusableIn(panel);
      if (!items.length) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      opener?.focus?.();
    };
  }, [isOpen]);

  return ref;
}
