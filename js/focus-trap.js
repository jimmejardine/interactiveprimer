// @ts-check
/**
 * A tiny focus trap for modal surfaces (the menu's restore dialog, the confirm dialog). While a
 * modal is open, keyboard focus must stay inside it and return to wherever it came from on close —
 * `aria-modal="true"` promises this to assistive tech but doesn't enforce it, so we do it here.
 *
 * `trapFocus(container)` moves focus into `container`, loops Tab / Shift+Tab within it, and returns
 * a `release()` that restores focus to the previously-focused element. It deliberately does NOT own
 * Escape/backdrop dismissal — each caller already wires those and calls `release()` from its own
 * close path.
 * @module
 */

/** Elements that can hold keyboard focus, in document order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {ParentNode} container
 * @returns {HTMLElement[]} the visible, focusable descendants of `container`, in tab order
 */
function focusable(container) {
  return /** @type {HTMLElement[]} */ ([...container.querySelectorAll(FOCUSABLE)]).filter(
    // Skip elements hidden via `hidden`, display:none, or zero-size (offsetParent is null when
    // the node — or an ancestor — is not rendered). getClientRects() covers position:fixed too.
    (el) => !el.hasAttribute("hidden") && el.getClientRects().length > 0,
  );
}

/**
 * Trap focus inside `container` until the returned function is called.
 * @param {HTMLElement} container the modal element to keep focus within
 * @param {{ initial?: HTMLElement | null }} [opts] `initial` — the element to focus first
 *   (defaults to the first focusable, else the container itself)
 * @returns {() => void} release — restores focus to the previously-focused element
 */
export function trapFocus(container, opts = {}) {
  const previouslyFocused = /** @type {HTMLElement | null} */ (document.activeElement);

  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (e.key !== "Tab") return;
    const items = focusable(container);
    if (items.length === 0) {
      // Nothing tabbable inside — keep focus pinned on the container itself.
      e.preventDefault();
      container.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = /** @type {HTMLElement} */ (document.activeElement);
    // Wrap around the ends; also pull focus back in if it has somehow escaped the container.
    if (e.shiftKey && (active === first || !container.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !container.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  // Capture phase so we see Tab before it moves focus anywhere.
  document.addEventListener("keydown", onKey, true);

  // Move focus in. A container that isn't natively focusable needs tabindex=-1 to receive it.
  const target = opts.initial ?? focusable(container)[0] ?? container;
  if (target === container && !container.hasAttribute("tabindex")) container.tabIndex = -1;
  target.focus();

  return () => {
    document.removeEventListener("keydown", onKey, true);
    // Restore focus only if it's still inside the (closing) modal, so we don't yank focus away
    // from wherever the user has since moved it.
    if (previouslyFocused && typeof previouslyFocused.focus === "function") {
      if (container.contains(/** @type {Node} */ (document.activeElement))) previouslyFocused.focus();
    }
  };
}
