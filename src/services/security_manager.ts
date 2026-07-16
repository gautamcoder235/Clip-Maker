import { AppStateManager } from "../state/app_state";
import { openUrl } from "@tauri-apps/plugin-opener";

export interface AppShortcut {
  key: string;       // e.g. "z", "y", "k", "escape"
  ctrl?: boolean;    // requires Ctrl/Cmd
  shift?: boolean;   // requires Shift
  alt?: boolean;     // requires Alt
  action: (e: KeyboardEvent) => void;
}

export class SecurityManager {
  private static shortcuts: AppShortcut[] = [];

  /**
   * Initializes the WebView security layer, intercepts links, blocks defaults, and sets up shortcut captures.
   */
  public static init(stateManager: AppStateManager, toggleCommandPalette: () => void) {
    // 1. Intercept all anchor clicks globally and open external links in system default browser
    document.addEventListener("click", async (e) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (anchor && anchor.href) {
        const url = anchor.href;
        // Intercept http/https web links
        if (url.startsWith("http://") || url.startsWith("https://")) {
          e.preventDefault();
          try {
            await openUrl(url);
          } catch (err) {
            console.error("Failed to open external link:", err);
          }
        }
      }
    });

    // 2. Disable default browser drag-and-drop file navigation redirect behavior on window
    window.addEventListener("dragover", (e) => e.preventDefault(), false);
    window.addEventListener("drop", (e) => e.preventDefault(), false);

    // 3. Disable auxiliary browser middle-mouse button click redirects
    window.addEventListener("auxclick", (e) => {
      if (e.button === 1) {
        e.preventDefault(); // blocks middle-click tab opens/navs
      }
    });

    // 4. Disable context menu globally outside form controls
    window.addEventListener("contextmenu", (e) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      
      e.preventDefault(); // Lock down and disable context menu
    });

    // 5. Disable default browser zoom behaviors (Pinch zoom) in JS
    window.addEventListener("wheel", (e) => {
      if (e.ctrlKey) {
        e.preventDefault(); // blocks mouse wheel zoom
      }
    }, { passive: false });

    window.addEventListener("touchmove", (e) => {
      if (e.touches.length > 1) {
        e.preventDefault(); // blocks pinch-to-zoom gestures
      }
    }, { passive: false });

    // 6. Set up default system app shortcuts
    this.register({
      key: "z",
      ctrl: true,
      action: () => stateManager.history.undo()
    });

    this.register({
      key: "y",
      ctrl: true,
      action: () => stateManager.history.redo()
    });

    this.register({
      key: "k",
      ctrl: true,
      action: () => toggleCommandPalette()
    });

    this.register({
      key: "escape",
      action: () => {
        const commandPalette = document.querySelector("#command-palette") as HTMLDivElement | null;
        if (commandPalette) {
          commandPalette.style.display = "none";
        }
        const userManualModal = document.getElementById("user-manual-modal");
        if (userManualModal) {
          userManualModal.style.display = "none";
        }
      }
    });

    // 7. Centralized Keydown Capture & Filtering
    window.addEventListener("keydown", (e) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // --- Browser Defaults Blocks (Reserved System Interceptions) ---
      
      // Reloads & Hard Reloads
      if ((isCmdOrCtrl && key === "r") || key === "f5" || (isCmdOrCtrl && e.shiftKey && key === "r")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // DevTools
      if (key === "f12" || (isCmdOrCtrl && e.shiftKey && key === "i")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // View Source
      if (isCmdOrCtrl && key === "u") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Address Bar Focus
      if (isCmdOrCtrl && key === "l") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Close Tab / Window close behavior inside WebView
      if (isCmdOrCtrl && key === "w") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Browser Tab Switch behavior
      if (isCmdOrCtrl && key === "tab") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Browser Zoom Hotkeys (Ctrl + Plus, Minus, 0)
      if (isCmdOrCtrl && (key === "=" || key === "+" || key === "-" || key === "0")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Browser History navigation (Alt + Left/Right)
      if (e.altKey && (key === "arrowleft" || key === "arrowright")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Print (Ctrl+P)
      if (isCmdOrCtrl && key === "p") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Find (Ctrl+F, F3)
      if ((isCmdOrCtrl && key === "f") || key === "f3") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Browser History, Downloads, Bookmarks, Search, New Window/Open (Ctrl + H, J, D, E, N, O)
      if (isCmdOrCtrl && (key === "h" || key === "j" || key === "d" || key === "e" || key === "n" || key === "o")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Save Webpage (Ctrl+S) - allow if handled by custom shortcuts, otherwise prevent browser save dialog
      if (isCmdOrCtrl && key === "s") {
        const hasCustomSave = this.shortcuts.some(s => s.key.toLowerCase() === "s" && s.ctrl);
        if (!hasCustomSave) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
      }

      // Caret Browsing (F7)
      if (key === "f7") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // --- Match Custom App Registered Shortcuts ---
      for (const shortcut of this.shortcuts) {
        const matchesKey = key === shortcut.key.toLowerCase();
        const matchesCtrl = !!shortcut.ctrl === isCmdOrCtrl;
        const matchesShift = !!shortcut.shift === e.shiftKey;
        const matchesAlt = !!shortcut.alt === e.altKey;

        if (matchesKey && matchesCtrl && matchesShift && matchesAlt) {
          e.preventDefault();
          shortcut.action(e);
          return;
        }
      }
    }, { capture: true });
  }

  /**
   * Registers a custom application-wide keyboard shortcut.
   */
  public static register(shortcut: AppShortcut) {
    this.shortcuts.push(shortcut);
  }

  /**
   * Unregisters a keyboard shortcut by its trigger key.
   */
  public static unregister(key: string) {
    this.shortcuts = this.shortcuts.filter(s => s.key.toLowerCase() !== key.toLowerCase());
  }
}
