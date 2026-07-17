/**
 * A tiny right-click / long-press context menu, shared by the mini explorer (`<primer-pathway>`,
 * shadow DOM) and the full explorer (`concepts.html`, light DOM). It owns the popup element,
 * positioning, and dismissal; each caller wires its own triggers (the node surfaces differ) and
 * supplies the items. `position: fixed` at the pointer means it works identically in either DOM.
 *
 * Colours/elevation come from the shared `--primer-*` tokens (which pierce shadow boundaries), so
 * the menu matches the rest of the chrome and re-themes for free.
 * @module
 */

/** Stylesheet for the popup — class-scoped so it's safe in a shadow root or the document head. */
export const CONTEXT_MENU_CSS = `
  .primer-ctx-menu {
    position: fixed; z-index: 1200; min-width: 9rem;
    margin: 0; padding: 0.3rem; list-style: none;
    background: var(--primer-surface, #fff); color: var(--primer-ink, #111);
    border: 1px solid var(--primer-border, #ddd); border-radius: var(--primer-radius, 0.6rem);
    box-shadow: var(--primer-shadow-lg, 0 12px 36px rgba(0, 0, 0, 0.18));
    font-family: var(--primer-font-ui, sans-serif); font-size: 0.9rem;
  }
  .primer-ctx-menu[hidden] { display: none; }
  .primer-ctx-menu li { margin: 0; }
  .primer-ctx-menu button {
    display: block; width: 100%; text-align: left;
    padding: 0.4rem 0.6rem; border: 0; border-radius: 0.4rem;
    background: none; color: inherit; font: inherit; cursor: pointer;
    white-space: nowrap;
  }
  .primer-ctx-menu button:hover,
  .primer-ctx-menu button:focus-visible {
    background: var(--primer-accent, #46e); color: var(--primer-accent-ink, #fff); outline: none;
  }
`;

export interface ContextMenuItem { label: string, run: (id: string) => void }

/**
 * Create a context menu inside `container` (a ShadowRoot, or a light-DOM element such as
 * `document.body`). The returned handle's `open(id, x, y)` shows the menu at viewport point (x, y)
 * for concept `id`; `close()` hides it; `destroy()` removes it and any listeners.
 */
export function createContextMenu(container: ShadowRoot | HTMLElement, items: ContextMenuItem[]): { open: (id: string, x: number, y: number) => void, close: () => void, destroy: () => void } {
  // Inject the stylesheet once into the right place: the shadow root, or the document head for
  // light DOM. Keyed by a marker attribute so repeat mounts don't pile up duplicate <style>s.
  const isShadow = typeof ShadowRoot !== "undefined" && container instanceof ShadowRoot;
  const styleHost = isShadow ? container : document.head;
  if (!styleHost.querySelector("style[data-primer-ctx]")) {
    const style = document.createElement("style");
    style.setAttribute("data-primer-ctx", "");
    style.textContent = CONTEXT_MENU_CSS;
    styleHost.appendChild(style);
  }

  const menu = document.createElement("ul");
  menu.className = "primer-ctx-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  container.appendChild(menu);

  let currentId = "";

  const onDocDown = (e: Event) => {
    if (!e.composedPath().includes(menu)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };

  const detach = () => {
    document.removeEventListener("pointerdown", onDocDown, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", close, true);
    window.removeEventListener("resize", close);
  };

  function close() {
    if (menu.hidden) return;
    menu.hidden = true;
    detach();
  }

  const open = (id: string, x: number, y: number) => {
    currentId = id;
    menu.replaceChildren();
    for (const item of items) {
      const li = document.createElement("li");
      li.setAttribute("role", "none");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "menuitem");
      btn.textContent = item.label;
      btn.addEventListener("click", () => {
        const id2 = currentId;
        close();
        item.run(id2);
      });
      li.appendChild(btn);
      menu.appendChild(li);
    }

    // Show, then clamp so it never spills off the viewport edges.
    detach(); // a re-open while already showing shouldn't double-register dismiss listeners
    menu.hidden = false;
    menu.style.left = "0px";
    menu.style.top = "0px";
    const r = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    (menu.querySelector("button") as HTMLElement | null)?.focus();

    // Capture-phase so a click/keypress meant to dismiss is seen before anything else acts on it.
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
  };

  const destroy = () => {
    close();
    menu.remove();
  };

  return { open, close, destroy };
}
