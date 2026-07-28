import { AppStateManager } from "../state/app_state";
import { DOMOverlay } from "./dom_overlay";

export interface ContextMenuActions {
  syncExtraOverlaysList: () => void;
  syncMediaOverlaysList: () => void;
  refreshViewport: () => void;
  showToast: (msg: string, type: "success" | "warning" | "error") => void;
  addMediaOverlayPrompt: () => Promise<string | null>;
  openMediaSettingsModal: (idx: number) => void;
  openTextEditModal: (type: string) => void;
}

const ICONS = {
  text: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  media: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
  crown: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/></svg>`,
  fit: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="3" rx="2"/><path d="M12 18v4M8 22h8"/></svg>`,
  play: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
  centerH: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12h8M12 8v8M4 6v12M20 6v12"/></svg>`,
  centerV: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v8M8 12h8M6 4h12M6 20h12"/></svg>`,
  duplicate: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  delete: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/></svg>`,
  up: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m17 14-5-5-5 5M12 9v12M17 4H7"/></svg>`,
  down: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m7 10 5 5 5-5M12 15V3M17 20H7"/></svg>`,
  forward: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
  backward: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`
};

export class CanvasContextMenu {
  private container: HTMLDivElement;
  private stateManager: AppStateManager;
  private domOverlay: DOMOverlay;
  private actions: ContextMenuActions;
  private menuElement: HTMLDivElement | null = null;

  constructor(
    container: HTMLDivElement,
    stateManager: AppStateManager,
    domOverlay: DOMOverlay,
    actions: ContextMenuActions
  ) {
    this.container = container;
    this.stateManager = stateManager;
    this.domOverlay = domOverlay;
    this.actions = actions;

    this.setupListeners();
    this.setupKeyboardShortcuts();
  }

  private setupListeners() {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      this.close();

      const interactiveBox = target.closest(".editor-interactive-box") as HTMLDivElement | null;
      let targetType: string | null = null;

      if (interactiveBox) {
        targetType = interactiveBox.getAttribute("data-type");
        if (targetType) {
          this.domOverlay.setFocusedElement(targetType);
          this.syncPropertiesPanelSelection(targetType);
        }
      }

      this.showMenu(e.clientX, e.clientY, targetType);
    };

    // Bind to the parent preview container to cover both canvas and letterbox borders
    const previewArea = document.getElementById("preview-area-16-9");
    if (previewArea) {
      previewArea.addEventListener("contextmenu", handler);
    }

    // Fallback binding directly on overlay container
    this.container.addEventListener("contextmenu", handler);

    document.addEventListener("mousedown", (e: MouseEvent) => {
      if (this.menuElement && !this.menuElement.contains(e.target as Node)) {
        this.close();
      }
    });

    window.addEventListener("resize", () => this.close());
  }

  private setupKeyboardShortcuts() {
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      // Guard: Ignore if typing in input fields
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key;
      const ctrlKey = e.ctrlKey || e.metaKey;
      const focused = this.domOverlay.getFocusedElement();

      // play / pause (Space)
      if (key === " " || key === "Spacebar") {
        e.preventDefault();
        this.togglePlayPause();
        return;
      }

      // fit video (F)
      if (key.toLowerCase() === "f") {
        e.preventDefault();
        this.fitVideo();
        return;
      }

      // center horizontally (H)
      if (key.toLowerCase() === "h") {
        if (focused) {
          e.preventDefault();
          this.centerElement(focused, "horizontal");
        }
        return;
      }

      // center vertically (V)
      if (key.toLowerCase() === "v") {
        if (focused) {
          e.preventDefault();
          this.centerElement(focused, "vertical");
        }
        return;
      }

      // duplicate (Ctrl + D)
      if (key.toLowerCase() === "d" && ctrlKey) {
        if (focused && focused.startsWith("extra-")) {
          e.preventDefault();
          this.duplicateExtra(focused);
        }
        return;
      }

      // delete (Del / Backspace)
      if (key === "Delete" || key === "Backspace") {
        if (focused) {
          e.preventDefault();
          if (focused === "text") {
            this.togglePrimaryText(false);
          } else {
            this.deleteOverlay(focused);
          }
        }
        return;
      }

      // bring to front ( ] ) / move forward ( Ctrl + ] )
      if (key === "]") {
        if (focused && (focused === "text" || focused.startsWith("extra-") || focused.startsWith("media-"))) {
          e.preventDefault();
          if (ctrlKey) {
            this.reorderLayer(focused, "forward");
          } else {
            this.reorderLayer(focused, "front");
          }
        }
        return;
      }

      // send to back ( [ ) / move backward ( Ctrl + [ )
      if (key === "[") {
        if (focused && (focused === "text" || focused.startsWith("extra-") || focused.startsWith("media-"))) {
          e.preventDefault();
          if (ctrlKey) {
            this.reorderLayer(focused, "backward");
          } else {
            this.reorderLayer(focused, "back");
          }
        }
        return;
      }
    });
  }

  private syncPropertiesPanelSelection(type: string) {
    if (type.startsWith("extra-")) {
      const idx = type.split("-")[1];
      const select = document.querySelector("#list-extra-overlays") as HTMLSelectElement | null;
      if (select) {
        select.value = idx;
        select.dispatchEvent(new Event("change"));
      }
    } else if (type.startsWith("media-")) {
      const idx = type.split("-")[1];
      const select = document.querySelector("#list-media-overlays") as HTMLSelectElement | null;
      if (select) {
        select.value = idx;
        select.dispatchEvent(new Event("change"));
      }
    }
  }

  private getProjectCoordinates(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.container.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    const targetW = this.stateManager.project.output_width || 1080;
    const targetH = this.stateManager.project.output_height || 1920;

    const scaleX = this.container.clientWidth / targetW;
    const scaleY = this.container.clientHeight / targetH;
    const scale = Math.min(scaleX, scaleY);

    return {
      x: Math.round(clickX / scale),
      y: Math.round(clickY / scale),
    };
  }

  private showMenu(clientX: number, clientY: number, targetType: string | null) {
    this.menuElement = document.createElement("div");
    this.menuElement.className = "canvas-context-menu";
    this.menuElement.style.position = "fixed";
    this.menuElement.style.left = `${clientX}px`;
    this.menuElement.style.top = `${clientY}px`;
    this.menuElement.style.zIndex = "100000";

    const isPrimaryTextEnabled = this.stateManager.project.text_settings.enabled !== false;

    // Define items based on right-click target type
    const items: Array<{
      label: string;
      icon: string;
      shortcut?: string;
      action: () => void | Promise<void>;
      danger?: boolean;
    }> = [];

    if (!targetType) {
      // Background / Empty Canvas right click
      items.push(
        {
          label: "Add Text Overlay",
          icon: ICONS.text,
          action: () => this.addTextOverlay(clientX, clientY),
        },
        {
          label: "Add Media Overlay",
          icon: ICONS.media,
          action: () => this.addMediaOverlay(clientX, clientY),
        }
      );

      if (!isPrimaryTextEnabled) {
        items.push({
          label: "Add Primary Text Overlay",
          icon: ICONS.crown,
          action: () => this.togglePrimaryText(true),
        });
      }

      items.push(
        {
          label: "Fit Video to Canvas",
          icon: ICONS.fit,
          shortcut: "F",
          action: () => this.fitVideo(),
        },
        {
          label: "Play / Pause",
          icon: ICONS.play,
          shortcut: "Space",
          action: () => this.togglePlayPause(),
        }
      );
    } else {
      // Clicked on an overlay element
      items.push(
        {
          label: "Center Horizontally",
          icon: ICONS.centerH,
          shortcut: "H",
          action: () => this.centerElement(targetType, "horizontal"),
        },
        {
          label: "Center Vertically",
          icon: ICONS.centerV,
          shortcut: "V",
          action: () => this.centerElement(targetType, "vertical"),
        }
      );

      if (targetType === "text") {
        // Primary text specific options
        items.push(
          {
            label: "Edit Text Overlay",
            icon: ICONS.edit,
            action: () => this.actions.openTextEditModal("text"),
          },
          {
            label: "Bring to Front",
            icon: ICONS.up,
            shortcut: "]",
            action: () => this.reorderLayer(targetType, "front"),
          },
          {
            label: "Send to Back",
            icon: ICONS.down,
            shortcut: "[",
            action: () => this.reorderLayer(targetType, "back"),
          },
          {
            label: "Move Forward",
            icon: ICONS.forward,
            shortcut: "Ctrl+]",
            action: () => this.reorderLayer(targetType, "forward"),
          },
          {
            label: "Move Backward",
            icon: ICONS.backward,
            shortcut: "Ctrl+[",
            action: () => this.reorderLayer(targetType, "backward"),
          },
          {
            label: "Remove Primary Text",
            icon: ICONS.delete,
            danger: true,
            shortcut: "Del",
            action: () => this.togglePrimaryText(false),
          }
        );
      } else if (targetType.startsWith("extra-")) {
        // Extra text specific options
        items.push(
          {
            label: "Edit Text Overlay",
            icon: ICONS.edit,
            action: () => this.actions.openTextEditModal(targetType),
          },
          {
            label: "Duplicate Overlay",
            icon: ICONS.duplicate,
            shortcut: "Ctrl+D",
            action: () => this.duplicateExtra(targetType),
          },
          {
            label: "Bring to Front",
            icon: ICONS.up,
            shortcut: "]",
            action: () => this.reorderLayer(targetType, "front"),
          },
          {
            label: "Send to Back",
            icon: ICONS.down,
            shortcut: "[",
            action: () => this.reorderLayer(targetType, "back"),
          },
          {
            label: "Move Forward",
            icon: ICONS.forward,
            shortcut: "Ctrl+]",
            action: () => this.reorderLayer(targetType, "forward"),
          },
          {
            label: "Move Backward",
            icon: ICONS.backward,
            shortcut: "Ctrl+[",
            action: () => this.reorderLayer(targetType, "backward"),
          },
          {
            label: "Delete Overlay",
            icon: ICONS.delete,
            danger: true,
            shortcut: "Del",
            action: () => this.deleteOverlay(targetType),
          }
        );
      } else if (targetType.startsWith("media-")) {
        // Media specific options
        items.push(
          {
            label: "Chroma Key & Settings",
            icon: ICONS.settings,
            action: () => {
              const idx = parseInt(targetType.split("-")[1]);
              if (!isNaN(idx)) {
                this.actions.openMediaSettingsModal(idx);
              }
            },
          },
          {
            label: "Bring to Front",
            icon: ICONS.up,
            shortcut: "]",
            action: () => this.reorderLayer(targetType, "front"),
          },
          {
            label: "Send to Back",
            icon: ICONS.down,
            shortcut: "[",
            action: () => this.reorderLayer(targetType, "back"),
          },
          {
            label: "Move Forward",
            icon: ICONS.forward,
            shortcut: "Ctrl+]",
            action: () => this.reorderLayer(targetType, "forward"),
          },
          {
            label: "Move Backward",
            icon: ICONS.backward,
            shortcut: "Ctrl+[",
            action: () => this.reorderLayer(targetType, "backward"),
          },
          {
            label: "Delete Overlay",
            icon: ICONS.delete,
            danger: true,
            shortcut: "Del",
            action: () => this.deleteOverlay(targetType),
          }
        );
      } else if (targetType === "video") {
        // Video specific options
        items.push({
          label: "Fit Video to Canvas",
          icon: ICONS.fit,
          shortcut: "F",
          action: () => this.fitVideo(),
        });
      }

      items.push({
        label: "Play / Pause",
        icon: ICONS.play,
        shortcut: "Space",
        action: () => this.togglePlayPause(),
      });
    }

    // Build the DOM nodes for items
    items.forEach((item, index) => {
      // Add a separator before reordering or deletion sections
      if (
        index > 0 &&
        (item.label.includes("Front") ||
          item.label.includes("Delete") ||
          item.label.includes("Remove") ||
          item.label.includes("Play"))
      ) {
        const separator = document.createElement("div");
        separator.className = "context-menu-separator";
        this.menuElement?.appendChild(separator);
      }

      const button = document.createElement("button");
      button.className = `context-menu-item ${item.danger ? "danger" : ""}`;
      
      const shortcutHtml = item.shortcut
        ? `<kbd class="context-item-shortcut">${item.shortcut}</kbd>`
        : "";
        
      button.innerHTML = `
        <span class="context-item-icon">${item.icon}</span>
        <span class="context-item-label">${item.label}</span>
        ${shortcutHtml}
      `;
      
      button.addEventListener("click", async () => {
        this.close();
        await item.action();
      });
      this.menuElement?.appendChild(button);
    });

    document.body.appendChild(this.menuElement);

    // Reposition if off screen boundaries
    const rect = this.menuElement.getBoundingClientRect();
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    if (rect.right > winW) {
      this.menuElement.style.left = `${clientX - rect.width}px`;
    }
    if (rect.bottom > winH) {
      this.menuElement.style.top = `${clientY - rect.height}px`;
    }
  }

  private close() {
    if (this.menuElement) {
      this.menuElement.remove();
      this.menuElement = null;
    }
  }

  // Action methods implementation
  private addTextOverlay(clientX: number, clientY: number) {
    const { x, y } = this.getProjectCoordinates(clientX, clientY);
    const overlays = [...(this.stateManager.project.extra_overlays || [])];
    overlays.push({
      name: `Overlay ${overlays.length + 1}`,
      text: "NEW OVERLAY",
      placement: "Custom",
      x_position: x.toString(),
      y_position: y.toString(),
      font_size: 80,
      font_color: "#ffffff",
      font_family: "Arial",
      outline: true,
    });
    this.stateManager.updateProjectField("extra_overlays", overlays);
    this.actions.syncExtraOverlaysList();
    this.actions.refreshViewport();
    this.actions.showToast("Added extra text overlay!", "success");
  }

  private async addMediaOverlay(clientX: number, clientY: number) {
    const { x, y } = this.getProjectCoordinates(clientX, clientY);
    const path = await this.actions.addMediaOverlayPrompt();
    if (!path) return;

    const overlays = [...(this.stateManager.project.media_overlays || [])];
    const newIdx = overlays.length;
    overlays.push({
      name: `Media ${newIdx + 1}`,
      type: "video",
      path: path,
      x: x,
      y: y,
      width: 400,
      height: 240,
      enabled: true,
      loop_mode: "repeat",
      chroma_key: false,
      chroma_color: "#00ff00",
      chroma_similarity: 0.3,
      chroma_blend: 0.05,
    });
    
    const order = [...this.stateManager.getNormalizedOverlayOrder(), `media-${newIdx}`];

    this.stateManager.updateProjectField("media_overlays", overlays);
    this.stateManager.updateProjectField("overlay_order", order);
    this.actions.syncMediaOverlaysList();
    this.actions.refreshViewport();
    this.actions.showToast("Added media overlay!", "success");

    // Auto-select and focus the new media overlay
    this.domOverlay.setFocusedElement(`media-${newIdx}`);
    const select = document.getElementById("list-media-overlays") as HTMLSelectElement | null;
    if (select) {
      select.value = newIdx.toString();
    }
  }

  private togglePrimaryText(enable: boolean) {
    const textSettings = { ...this.stateManager.project.text_settings, enabled: enable };
    this.stateManager.updateProjectField("text_settings", textSettings);
    this.actions.refreshViewport();
    this.actions.showToast(
      enable ? "Added primary text overlay" : "Removed primary text overlay",
      enable ? "success" : "warning"
    );
  }

  private centerElement(type: string, direction: "horizontal" | "vertical") {
    if (type === "text") {
      const field = direction === "horizontal" ? "x_position" : "y_position";
      const formula = direction === "horizontal" ? "(w-text_w)/2" : "(h-text_h)/2";
      const settings = { ...this.stateManager.project.text_settings, [field]: formula };
      this.stateManager.updateProjectField("text_settings", settings);
      this.actions.refreshViewport();
    } else if (type.startsWith("extra-")) {
      const idx = parseInt(type.split("-")[1]);
      const overlays = [...(this.stateManager.project.extra_overlays || [])];
      if (overlays[idx]) {
        const field = direction === "horizontal" ? "x_position" : "y_position";
        const formula = direction === "horizontal" ? "(w-text_w)/2" : "(h-text_h)/2";
        overlays[idx] = { ...overlays[idx], [field]: formula };
        this.stateManager.updateProjectField("extra_overlays", overlays);
        this.actions.refreshViewport();
      }
    } else if (type === "video") {
      const placement = { ...this.stateManager.project.video_placement };
      if (direction === "horizontal") {
        const canvasW = this.stateManager.project.output_width || 1080;
        placement.x = Math.round((canvasW - placement.width) / 2);
      } else {
        const canvasH = this.stateManager.project.output_height || 1920;
        placement.y = Math.round((canvasH - placement.height) / 2);
      }
      this.stateManager.updateProjectField("video_placement", placement);
      this.actions.refreshViewport();
    } else if (type.startsWith("media-")) {
      const idx = parseInt(type.split("-")[1]);
      const overlays = [...(this.stateManager.project.media_overlays || [])];
      if (overlays[idx]) {
        overlays[idx] = { ...overlays[idx] };
        if (direction === "horizontal") {
          const canvasW = this.stateManager.project.output_width || 1080;
          overlays[idx].x = Math.round((canvasW - overlays[idx].width) / 2);
        } else {
          const canvasH = this.stateManager.project.output_height || 1920;
          overlays[idx].y = Math.round((canvasH - overlays[idx].height) / 2);
        }
        this.stateManager.updateProjectField("media_overlays", overlays);
        this.actions.refreshViewport();
      }
    }
  }

  private duplicateExtra(type: string) {
    if (type.startsWith("extra-")) {
      const idx = parseInt(type.split("-")[1]);
      const overlays = [...(this.stateManager.project.extra_overlays || [])];
      if (overlays[idx]) {
        let newX = 100;
        let newY = 100;
        if (overlays[idx].x_position !== "(w-text_w)/2") {
          newX = (parseFloat(overlays[idx].x_position) || 100) + 50;
        }
        if (overlays[idx].y_position !== "(h-text_h)/2") {
          newY = (parseFloat(overlays[idx].y_position) || 100) + 50;
        }

        overlays.push({
          ...overlays[idx],
          name: `${overlays[idx].name || "Overlay"} (Copy)`,
          x_position: newX.toString(),
          y_position: newY.toString(),
        });
        
        const order = [...this.stateManager.getNormalizedOverlayOrder()];
        const originalId = `extra-${idx}`;
        const duplicateId = `extra-${overlays.length - 1}`;
        const targetIdx = order.indexOf(originalId);
        if (targetIdx !== -1) {
          order.splice(targetIdx + 1, 0, duplicateId);
        } else {
          order.push(duplicateId);
        }
        
        this.stateManager.updateProjectBatch({ extra_overlays: overlays, overlay_order: order });
        this.actions.syncExtraOverlaysList();
        this.actions.refreshViewport();
        this.actions.showToast("Duplicated extra overlay!", "success");
      }
    }
  }

  private deleteOverlay(type: string) {
    if (type.startsWith("extra-")) {
      const idx = parseInt(type.split("-")[1]);
      const overlays = [...(this.stateManager.project.extra_overlays || [])];
      overlays.splice(idx, 1);
      
      const order = [...this.stateManager.getNormalizedOverlayOrder()];
      const targetId = `extra-${idx}`;
      const newOrder = order
        .filter(id => id !== targetId)
        .map(id => {
          if (id.startsWith("extra-")) {
            const itemIdx = parseInt(id.split("-")[1]);
            if (itemIdx > idx) {
              return `extra-${itemIdx - 1}`;
            }
          }
          return id;
        });
      
      this.stateManager.updateProjectBatch({ extra_overlays: overlays, overlay_order: newOrder });
      this.domOverlay.setFocusedElement(null);
      this.actions.syncExtraOverlaysList();
      this.actions.refreshViewport();
      this.actions.showToast("Deleted extra text overlay", "warning");
    } else if (type.startsWith("media-")) {
      const idx = parseInt(type.split("-")[1]);
      const overlays = [...(this.stateManager.project.media_overlays || [])];
      overlays.splice(idx, 1);
      
      const order = [...this.stateManager.getNormalizedOverlayOrder()];
      const targetId = `media-${idx}`;
      const newOrder = order
        .filter(id => id !== targetId)
        .map(id => {
          if (id.startsWith("media-")) {
            const itemIdx = parseInt(id.split("-")[1]);
            if (itemIdx > idx) {
              return `media-${itemIdx - 1}`;
            }
          }
          return id;
        });
      
      this.stateManager.updateProjectField("media_overlays", overlays);
      this.stateManager.updateProjectField("overlay_order", newOrder);
      this.domOverlay.setFocusedElement(null);
      this.actions.syncMediaOverlaysList();
      this.actions.refreshViewport();
      this.actions.showToast("Deleted media overlay", "warning");
    }
  }

  private reorderLayer(type: string, action: "front" | "back" | "forward" | "backward") {
    const order = [...this.stateManager.getNormalizedOverlayOrder()];
    if (order.length <= 1) return;
    
    const idx = order.indexOf(type);
    if (idx === -1) return;
    
    order.splice(idx, 1);
    
    let newIdx = idx;
    if (action === "front") {
      order.push(type);
      newIdx = order.length - 1;
    } else if (action === "back") {
      order.unshift(type);
      newIdx = 0;
    } else if (action === "forward") {
      newIdx = Math.min(idx + 1, order.length);
      order.splice(newIdx, 0, type);
    } else if (action === "backward") {
      newIdx = Math.max(idx - 1, 0);
      order.splice(newIdx, 0, type);
    }
    
    this.stateManager.updateProjectField("overlay_order", order);
    this.domOverlay.setFocusedElement(type);
    this.actions.refreshViewport();
    this.actions.showToast("Reordered layers", "success");
  }

  private fitVideo() {
    const video = this.container.parentElement?.querySelector(
      ".preview-video-element"
    ) as HTMLVideoElement | null;

    const canvasW = this.stateManager.project.output_width || 1080;
    const canvasH = this.stateManager.project.output_height || 1920;

    let assetRatio = 16 / 9;
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      assetRatio = video.videoWidth / video.videoHeight;
    } else {
      assetRatio = canvasW / canvasH;
    }

    const canvasRatio = canvasW / canvasH;
    let newW = canvasW;
    let newH = canvasH;

    if (assetRatio > canvasRatio) {
      newW = canvasW;
      newH = Math.round(canvasW / assetRatio);
    } else {
      newH = canvasH;
      newW = Math.round(canvasH * assetRatio);
    }

    const newX = Math.round((canvasW - newW) / 2);
    const newY = Math.round((canvasH - newH) / 2);

    const placement = {
      enabled: true,
      x: newX,
      y: newY,
      width: newW,
      height: newH,
    };

    this.stateManager.updateProjectField("video_placement", placement);
    this.actions.refreshViewport();
    this.actions.showToast("Fitted video to canvas", "success");
  }

  private togglePlayPause() {
    const video = this.container.parentElement?.querySelector(
      ".preview-video-element"
    ) as HTMLVideoElement | null;
    if (video && video.src && video.src.trim() !== "") {
      if (video.paused) {
        video.play().catch((e) => console.error("Playback error:", e));
      } else {
        video.pause();
      }
    } else {
      this.actions.showToast("No media loaded to play.", "warning");
    }
  }
}
