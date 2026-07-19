import { ProjectData } from "../types";
import { AppStateManager } from "../state/app_state";
import { checkSnapping, GuideLine, SnapTarget } from "./snapping";
import { convertFileSrc } from "@tauri-apps/api/core";

export class DOMOverlay {
  private overlayContainer: HTMLDivElement;
  private stateManager: AppStateManager;

  private videoBox: HTMLDivElement | null = null;
  private textBox: HTMLDivElement | null = null;
  private extraBoxes: HTMLDivElement[] = [];
  private mediaBoxes: HTMLDivElement[] = [];

  // Active Media Overlays live elements for editor sync
  private activeOverlayVideos: { [key: number]: HTMLVideoElement } = {};
  private activeOverlayImages: { [key: number]: HTMLImageElement } = {};
  private activeOverlayCanvases: { [key: number]: HTMLCanvasElement } = {};
  private syncAnimId = 0;

  // Dynamic snapping guide pool
  private guidePool: HTMLDivElement[] = [];
  private guideContainer: HTMLDivElement;

  private isDragging = false;
  private isResizing = false;
  private activeElement: string | null = null; // "video" | "text" | "extra-${idx}" | "media-${idx}"
  private resizeHandle: string | null = null; // "tl", "tr", "bl", "br"
  private focusedElement: string | null = null; // track active selection focus

  public ratioLocked = true;

  private dragStartX = 0;
  private dragStartY = 0;
  private elementStartX = 0;
  private elementStartY = 0;
  private elementStartW = 0;
  private elementStartH = 0;
  private elementStartFontSize = 32;

  private onLayoutChangeCallback: () => void = () => {};

  constructor(container: HTMLDivElement, stateManager: AppStateManager) {
    this.overlayContainer = container;
    this.stateManager = stateManager;

    this.overlayContainer.style.position = "absolute";
    this.overlayContainer.style.top = "0";
    this.overlayContainer.style.left = "0";
    this.overlayContainer.style.width = "100%";
    this.overlayContainer.style.height = "100%";
    this.overlayContainer.style.zIndex = "10";
    this.overlayContainer.style.pointerEvents = "none"; // allow click-throughs to canvas by default

    // Guide container for all dynamic alignment lines
    this.guideContainer = document.createElement("div");
    this.guideContainer.className = "snap-guides-container";
    this.guideContainer.style.position = "absolute";
    this.guideContainer.style.top = "0";
    this.guideContainer.style.left = "0";
    this.guideContainer.style.width = "100%";
    this.guideContainer.style.height = "100%";
    this.guideContainer.style.pointerEvents = "none";
    this.guideContainer.style.zIndex = "99";
    this.overlayContainer.appendChild(this.guideContainer);

    this.setupGlobalEvents();
  }

  private measureText(text: string, fontSize: number, fontFamily: string): { width: number; height: number; ascent: number } {
    const span = document.createElement("span");
    span.style.fontFamily = fontFamily;
    span.style.fontSize = `${fontSize}px`;
    span.style.fontWeight = "bold";
    span.style.whiteSpace = "nowrap";
    span.style.position = "absolute";
    span.style.visibility = "hidden";
    span.style.pointerEvents = "none";
    span.style.lineHeight = "1";
    span.innerText = text;
    
    document.body.appendChild(span);
    const rect = span.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    document.body.removeChild(span);
    
    return { width, height, ascent: height * 0.7 };
  }

  onLayoutChange(callback: () => void) {
    this.onLayoutChangeCallback = callback;
  }

  update(project: ProjectData, containerWidth: number, containerHeight: number) {
    // Don't rebuild overlays while user is actively dragging/resizing — the active
    // box references would be destroyed and interaction breaks
    if (this.isDragging || this.isResizing) return;

    // Clear dynamic overlay DOM elements except guidelines
    if (this.videoBox) {
      this.videoBox.remove();
      this.videoBox = null;
    }
    if (this.textBox) {
      this.textBox.remove();
      this.textBox = null;
    }

    this.extraBoxes.forEach(b => b.remove());
    this.extraBoxes = [];

    // Stop and clear previous overlay videos/elements
    Object.values(this.activeOverlayVideos).forEach(video => {
      video.pause();
      video.src = "";
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
    });
    this.activeOverlayVideos = {};
    this.activeOverlayImages = {};
    this.activeOverlayCanvases = {};
    if (this.syncAnimId) {
      cancelAnimationFrame(this.syncAnimId);
      this.syncAnimId = 0;
    }

    this.mediaBoxes.forEach(b => b.remove());
    this.mediaBoxes = [];

    const targetW = project.output_width || 1080;
    const targetH = project.output_height || 1920;
    const scaleX = containerWidth / targetW;
    const scaleY = containerHeight / targetH;
    const scale = Math.min(scaleX, scaleY);

    const canvasW = targetW * scale;
    const canvasH = targetH * scale;

    // Render Video Box
    if (project.video_placement.enabled) {
      const boxX = project.video_placement.x * scale;
      const boxY = project.video_placement.y * scale;
      const boxW = project.video_placement.width * scale;
      const boxH = project.video_placement.height * scale;

      this.videoBox = this.createInteractiveBox("video", boxX, boxY, boxW, boxH, scale);
      this.overlayContainer.appendChild(this.videoBox);
    }

    // Render Primary Text Box (approximated size based on template length and font size)
    if (project.text_settings.enabled !== false) {
      let textX = 10;
      let textY = 10;
      const partNum = project.selected_clip_index || 1;
      const rawTemplate = project.text_template || "PART {part}";
      const txtVal = rawTemplate.replace(/{part}/g, partNum.toString()).trim();
      const txtFS = project.text_settings.font_size || 120;
      const txtFontFamily = project.text_settings.font_family || "Arial";
      // Measure at the actual rendered pixel size to avoid font hinting discrepancies
      const scaledFS = txtFS * scale;
      const txtMetrics = this.measureText(txtVal, scaledFS, txtFontFamily);

      const boxW = txtMetrics.width;
      const boxH = txtMetrics.height;

      if (project.text_settings.x_position === "(w-text_w)/2") {
        textX = (canvasW - boxW) / 2;
      } else {
        textX = parseFloat(project.text_settings.x_position) * scale || 10;
      }

      if (project.text_settings.y_position === "(h-text_h)/2") {
        textY = (canvasH - boxH) / 2;
      } else {
        textY = parseFloat(project.text_settings.y_position) * scale || 10;
      }

      this.textBox = this.createInteractiveBox("text", textX, textY, boxW, boxH, scale, txtVal);
      this.overlayContainer.appendChild(this.textBox);
    }

    // Render Extra Overlays
    if (project.extra_overlays) {
      project.extra_overlays.forEach((overlay, idx) => {
        const extraTxt = (overlay.text || "Static Text").trim();
        const extraFS = overlay.font_size || 80;
        const extraFontFamily = overlay.font_family || "Arial";
        // Measure at the actual rendered pixel size
        const extraScaledFS = extraFS * scale;
        const extraMetrics = this.measureText(extraTxt, extraScaledFS, extraFontFamily);

        const extraBoxW = extraMetrics.width;
        const extraBoxH = extraMetrics.height;

        let x = 20;
        let y = 20;
        if (overlay.x_position === "(w-text_w)/2") {
          x = (canvasW - extraBoxW) / 2;
        } else {
          x = parseFloat(overlay.x_position) * scale || 20;
        }
        if (overlay.y_position === "(h-text_h)/2") {
          y = (canvasH - extraBoxH) / 2;
        } else {
          y = parseFloat(overlay.y_position) * scale || 20;
        }

        const box = this.createInteractiveBox(`extra-${idx}`, x, y, extraBoxW, extraBoxH, scale, extraTxt);
        this.overlayContainer.appendChild(box);
        this.extraBoxes.push(box);
      });
    }

    // Render Media Overlays
    if (project.media_overlays) {
      project.media_overlays.forEach((overlay, idx) => {
        if (!overlay.enabled) return;
        const x = (overlay.x || 0) * scale;
        const y = (overlay.y || 0) * scale;
        const w = (overlay.width || 200) * scale;
        const h = (overlay.height || 120) * scale;

        const box = this.createInteractiveBox(`media-${idx}`, x, y, w, h, scale, overlay.name);

        // Append canvas inside box for video/image rendering
        const canvas = document.createElement("canvas");
        canvas.style.position = "absolute";
        canvas.style.top = "0";
        canvas.style.left = "0";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.pointerEvents = "none";
        canvas.style.zIndex = "1";
        box.appendChild(canvas);
        this.activeOverlayCanvases[idx] = canvas;

        if (overlay.type === "video") {
          const video = document.createElement("video");
          video.crossOrigin = "anonymous";
          video.src = convertFileSrc(overlay.path);
          video.loop = true;
          video.muted = true;
          video.playsInline = true;
          video.style.display = "none";
          document.body.appendChild(video);
          video.load();
          this.activeOverlayVideos[idx] = video;
        } else {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = convertFileSrc(overlay.path);
          this.activeOverlayImages[idx] = img;
        }

        this.mediaBoxes.push(box);
      });
    }

    // Re-append elements in the correct z-order sequence
    // Video is always at the bottom
    if (this.videoBox) {
      this.overlayContainer.appendChild(this.videoBox);
    }

    const order = this.stateManager.getNormalizedOverlayOrder();
    order.forEach(id => {
      if (id === "text") {
        if (this.textBox) this.overlayContainer.appendChild(this.textBox);
      } else if (id.startsWith("extra-")) {
        const idx = parseInt(id.split("-")[1]);
        const box = this.extraBoxes[idx];
        if (box) this.overlayContainer.appendChild(box);
      } else if (id.startsWith("media-")) {
        const idx = parseInt(id.split("-")[1]);
        const box = this.mediaBoxes[idx];
        if (box) this.overlayContainer.appendChild(box);
      }
    });

    // Start the live sync loop
    this.startSyncLoop();
  }

  private createInteractiveBox(
    type: string,
    x: number,
    y: number,
    w: number,
    h: number,
    scale: number,
    labelText?: string
  ): HTMLDivElement {
    const box = document.createElement("div");
    box.className = `editor-interactive-box selection-${type}`;
    box.setAttribute("data-type", type);
    box.style.position = "absolute";
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    box.style.width = `${w}px`;
    box.style.height = `${h}px`;
    
    // Manage borders and handles via focused class states rather than hardcoded inline values
    if (this.focusedElement === type) {
      box.classList.add("focused");
    }
    
    box.style.cursor = "move";
    box.style.pointerEvents = "auto";
    box.style.zIndex = type === "video" ? "5" : "10";
    box.style.overflow = (type === "text" || type.startsWith("extra-")) ? "visible" : "hidden";

    // Render visible text content inside the box for text overlays
    if (type === "text" || type.startsWith("extra-")) {
      const textContent = document.createElement("div");
      textContent.className = "overlay-text-content";
      textContent.style.width = "100%";
      textContent.style.height = "100%";
      textContent.style.display = "flex";
      textContent.style.alignItems = "center";
      textContent.style.justifyContent = "center";
      textContent.style.boxSizing = "border-box";

      // Get the actual font size from state
      let fontSize = 48;
      let fontColor = "#ffffff";
      let fontFamily = "Arial";
      let hasOutline = true;
      if (type === "text") {
        fontSize = this.stateManager.project.text_settings.font_size || 120;
        fontColor = this.stateManager.project.text_settings.font_color || "#ffffff";
        fontFamily = this.stateManager.project.text_settings.font_family || "Arial";
        hasOutline = this.stateManager.project.text_settings.outline !== false;
      } else if (type.startsWith("extra-")) {
        const idx = parseInt(type.split("-")[1]);
        const overlay = (this.stateManager.project.extra_overlays || [])[idx];
        if (overlay) {
          fontSize = overlay.font_size || 80;
          fontColor = overlay.font_color || "#ffffff";
          fontFamily = overlay.font_family || "Arial";
          hasOutline = overlay.outline !== false;
        }
      }

      const scaledFontSize = Math.max(8, fontSize * scale);
      textContent.innerText = labelText || "Text";
      textContent.style.fontSize = `${scaledFontSize}px`;
      textContent.style.color = fontColor;
      textContent.style.fontFamily = fontFamily;
      textContent.style.fontWeight = "bold";
      textContent.style.lineHeight = "1";
      textContent.style.whiteSpace = "nowrap";
      textContent.style.pointerEvents = "none";
      textContent.style.userSelect = "none";

      if (hasOutline) {
        textContent.style.textShadow =
          "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, " +
          "0 -2px 0 #000, 0 2px 0 #000, -2px 0 0 #000, 2px 0 0 #000";
      }

      box.appendChild(textContent);
    }

    // Small type label badge (top-left corner, above the box)
    const label = document.createElement("div");
    label.className = "box-label";
    if (type === "video") {
      label.innerText = "Video Placement";
    } else if (type === "text") {
      label.innerText = "Primary Text";
    } else if (type.startsWith("extra-")) {
      label.innerText = labelText ? `Extra: ${labelText.substring(0, 12)}` : "Extra Text";
    } else {
      label.innerText = labelText || "Media";
    }
    label.style.position = "absolute";
    label.style.top = "-20px";
    label.style.left = "4px";
    
    if (type === "video") {
      label.style.background = "#3b82f6";
    } else if (type === "text" || type.startsWith("extra-")) {
      label.style.background = "#10b981";
    } else {
      label.style.background = "#a855f7";
    }
    
    label.style.color = "white";
    label.style.fontSize = "10px";
    label.style.padding = "1px 5px";
    label.style.borderRadius = "3px";
    label.style.whiteSpace = "nowrap";
    label.style.pointerEvents = "none";
    box.appendChild(label);

    // Create corner resize handles
    const corners = ["tl", "tr", "bl", "br"];
    for (const c of corners) {
      const handle = document.createElement("div");
      handle.className = `resize-handle handle-${c}`;
      handle.style.position = "absolute";
      handle.style.width = "10px";
      handle.style.height = "10px";
      handle.style.background = "white";
      
      if (type === "video") {
        handle.style.border = "1px solid #3b82f6";
      } else if (type === "text" || type.startsWith("extra-")) {
        handle.style.border = "1px solid #10b981";
      } else {
        handle.style.border = "1px solid #a855f7";
      }
      
      handle.style.borderRadius = "50%";
      handle.style.zIndex = "10";
      
      if (c === "tl") {
        handle.style.top = "-5px";
        handle.style.left = "-5px";
        handle.style.cursor = "nwse-resize";
      } else if (c === "tr") {
        handle.style.top = "-5px";
        handle.style.right = "-5px";
        handle.style.cursor = "nesw-resize";
      } else if (c === "bl") {
        handle.style.bottom = "-5px";
        handle.style.left = "-5px";
        handle.style.cursor = "nesw-resize";
      } else if (c === "br") {
        handle.style.bottom = "-5px";
        handle.style.right = "-5px";
        handle.style.cursor = "nwse-resize";
      }

      handle.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.isResizing = true;
        this.activeElement = type;
        this.resizeHandle = c;

        // Sync focus state
        this.focusedElement = type;
        this.refreshFocus();

        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.elementStartX = parseFloat(box.style.left);
        this.elementStartY = parseFloat(box.style.top);
        this.elementStartW = parseFloat(box.style.width);
        this.elementStartH = parseFloat(box.style.height);

        // Capture starting font size for dynamic text scaling
        if (type === "text") {
          this.elementStartFontSize = this.stateManager.project.text_settings.font_size;
        } else if (type.startsWith("extra-")) {
          const idx = parseInt(type.split("-")[1]);
          this.elementStartFontSize = (this.stateManager.project.extra_overlays || [])[idx]?.font_size || 80;
        }
      });

      box.appendChild(handle);
    }

    // Create side pill resizer handles (like Canva)
    const sides = ["l", "r", "t", "b"];
    for (const s of sides) {
      const handle = document.createElement("div");
      handle.className = `resize-handle handle-side-${s}`;
      handle.style.position = "absolute";
      handle.style.background = "white";
      
      if (type === "video") {
        handle.style.border = "1px solid #3b82f6";
      } else if (type === "text" || type.startsWith("extra-")) {
        handle.style.border = "1px solid #10b981";
      } else {
        handle.style.border = "1px solid #a855f7";
      }
      
      handle.style.borderRadius = "3px";
      handle.style.zIndex = "10";

      if (s === "l") {
        handle.style.width = "5px";
        handle.style.height = "16px";
        handle.style.left = "-3px";
        handle.style.top = "calc(50% - 8px)";
        handle.style.cursor = "ew-resize";
      } else if (s === "r") {
        handle.style.width = "5px";
        handle.style.height = "16px";
        handle.style.right = "-3px";
        handle.style.top = "calc(50% - 8px)";
        handle.style.cursor = "ew-resize";
      } else if (s === "t") {
        handle.style.width = "16px";
        handle.style.height = "5px";
        handle.style.top = "-3px";
        handle.style.left = "calc(50% - 8px)";
        handle.style.cursor = "ns-resize";
      } else if (s === "b") {
        handle.style.width = "16px";
        handle.style.height = "5px";
        handle.style.bottom = "-3px";
        handle.style.left = "calc(50% - 8px)";
        handle.style.cursor = "ns-resize";
      }

      handle.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.isResizing = true;
        this.activeElement = type;
        this.resizeHandle = s;

        // Sync focus state
        this.focusedElement = type;
        this.refreshFocus();

        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.elementStartX = parseFloat(box.style.left);
        this.elementStartY = parseFloat(box.style.top);
        this.elementStartW = parseFloat(box.style.width);
        this.elementStartH = parseFloat(box.style.height);

        // Capture starting font size for dynamic text scaling
        if (type === "text") {
          this.elementStartFontSize = this.stateManager.project.text_settings.font_size;
        } else if (type.startsWith("extra-")) {
          const idx = parseInt(type.split("-")[1]);
          this.elementStartFontSize = (this.stateManager.project.extra_overlays || [])[idx]?.font_size || 80;
        }
      });

      box.appendChild(handle);
    }

    // Drag setup
    box.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.isDragging = true;
      this.activeElement = type;

      // Sync focus state
      this.focusedElement = type;
      this.refreshFocus();

      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.elementStartX = parseFloat(box.style.left);
      this.elementStartY = parseFloat(box.style.top);
      this.elementStartW = parseFloat(box.style.width);
      this.elementStartH = parseFloat(box.style.height);
    });

    return box;
  }

  private getActiveBox(): HTMLDivElement | null {
    if (!this.activeElement) return null;
    if (this.activeElement === "video") return this.videoBox;
    if (this.activeElement === "text") return this.textBox;
    if (this.activeElement.startsWith("extra-")) {
      const idx = parseInt(this.activeElement.split("-")[1]);
      return this.extraBoxes[idx] || null;
    }
    if (this.activeElement.startsWith("media-")) {
      const idx = parseInt(this.activeElement.split("-")[1]);
      return this.mediaBoxes[idx] || null;
    }
    return null;
  }

  private setupGlobalEvents() {
    window.addEventListener("mousemove", (e) => {
      if (!this.isDragging && !this.isResizing) return;
      e.preventDefault();

      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;

      const overlayW = this.overlayContainer.clientWidth;
      const overlayH = this.overlayContainer.clientHeight;

      const activeBox = this.getActiveBox();
      if (!activeBox) return;

      if (this.isDragging) {
        let newX = this.elementStartX + dx;
        let newY = this.elementStartY + dy;

        // Collect other elements for element-to-element snapping
        const others = this.collectSnapTargets();

        // Perform Snapping check
        const snap = checkSnapping(
          newX,
          newY,
          this.elementStartW,
          this.elementStartH,
          overlayW,
          overlayH,
          6,
          others
        );

        newX = snap.x;
        newY = snap.y;

        // Render dynamic alignment guides
        this.renderGuides(snap.guides);

        activeBox.style.left = `${newX}px`;
        activeBox.style.top = `${newY}px`;

      } else if (this.isResizing && this.resizeHandle) {
        let newW = this.elementStartW;
        let newH = this.elementStartH;
        let newX = this.elementStartX;
        let newY = this.elementStartY;

        let isProportional = this.ratioLocked || (this.activeElement === "text" || (this.activeElement !== null && this.activeElement.startsWith("extra-")));
        let startRatio = 1.0;

        if (this.activeElement) {
          const naturalRatio = this.getNaturalRatio(this.activeElement);
          if (naturalRatio !== null) {
            startRatio = naturalRatio;
          } else {
            startRatio = this.elementStartW / this.elementStartH;
          }
        }

        if (isProportional) {
          // Proportional scaling to preserve aspect ratio
          let scaleFactor = 1.0;
          if (this.resizeHandle === "br" || this.resizeHandle === "r") {
            scaleFactor = Math.max(0.1, (this.elementStartW + dx) / this.elementStartW);
          } else if (this.resizeHandle === "bl" || this.resizeHandle === "l") {
            scaleFactor = Math.max(0.1, (this.elementStartW - dx) / this.elementStartW);
          } else if (this.resizeHandle === "tr") {
            scaleFactor = Math.max(0.1, (this.elementStartW + dx) / this.elementStartW);
          } else if (this.resizeHandle === "tl") {
            scaleFactor = Math.max(0.1, (this.elementStartW - dx) / this.elementStartW);
          } else if (this.resizeHandle === "b") {
            scaleFactor = Math.max(0.1, (this.elementStartH + dy) / this.elementStartH);
          } else if (this.resizeHandle === "t") {
            scaleFactor = Math.max(0.1, (this.elementStartH - dy) / this.elementStartH);
          }

          newW = this.elementStartW * scaleFactor;
          newH = newW / startRatio;

          if (this.resizeHandle.includes("l")) {
            newX = this.elementStartX + (this.elementStartW - newW);
          }
          if (this.resizeHandle.includes("t")) {
            newY = this.elementStartY + (this.elementStartH - newH);
          }
        } else {
          // Free scaling for video and media overlays
          if (this.resizeHandle.includes("r")) {
            newW = Math.max(20, this.elementStartW + dx);
          }
          if (this.resizeHandle.includes("l")) {
            newW = Math.max(20, this.elementStartW - dx);
            newX = this.elementStartX + (this.elementStartW - newW);
          }
          if (this.resizeHandle.includes("b")) {
            newH = Math.max(20, this.elementStartH + dy);
          }
          if (this.resizeHandle.includes("t")) {
            newH = Math.max(20, this.elementStartH - dy);
            newY = this.elementStartY + (this.elementStartH - newH);
          }
        }

        // Resizing boundary edge & corner snapping magnet
        const snapThreshold = 12; // 12px border snap magnet pull
        const guides: GuideLine[] = [];
        let borderSnapped = false;

        if (isProportional) {
          if (this.resizeHandle === "tr") {
            const distRight = Math.abs((newX + newW) - overlayW);
            const distTop = Math.abs(newY);
            if (distRight < snapThreshold) {
              newW = overlayW - newX;
              newH = newW / startRatio;
              newY = (this.elementStartY + this.elementStartH) - newH;
              guides.push({ axis: "v", position: overlayW });
              borderSnapped = true;
            } else if (distTop < snapThreshold) {
              newY = 0;
              newH = this.elementStartY + this.elementStartH;
              newW = newH * startRatio;
              guides.push({ axis: "h", position: 0 });
              borderSnapped = true;
            }
          } else if (this.resizeHandle === "tl") {
            const distLeft = Math.abs(newX);
            const distTop = Math.abs(newY);
            if (distLeft < snapThreshold) {
              newX = 0;
              newW = (this.elementStartX + this.elementStartW) - newX;
              newH = newW / startRatio;
              newY = (this.elementStartY + this.elementStartH) - newH;
              guides.push({ axis: "v", position: 0 });
              borderSnapped = true;
            } else if (distTop < snapThreshold) {
              newY = 0;
              newH = this.elementStartY + this.elementStartH;
              newW = newH * startRatio;
              newX = (this.elementStartX + this.elementStartW) - newW;
              guides.push({ axis: "h", position: 0 });
              borderSnapped = true;
            }
          } else if (this.resizeHandle === "br") {
            const distRight = Math.abs((newX + newW) - overlayW);
            const distBottom = Math.abs((newY + newH) - overlayH);
            if (distRight < snapThreshold) {
              newW = overlayW - newX;
              newH = newW / startRatio;
              guides.push({ axis: "v", position: overlayW });
              borderSnapped = true;
            } else if (distBottom < snapThreshold) {
              newH = overlayH - newY;
              newW = newH * startRatio;
              guides.push({ axis: "h", position: overlayH });
              borderSnapped = true;
            }
          } else if (this.resizeHandle === "bl") {
            const distLeft = Math.abs(newX);
            const distBottom = Math.abs((newY + newH) - overlayH);
            if (distLeft < snapThreshold) {
              newX = 0;
              newW = (this.elementStartX + this.elementStartW) - newX;
              newH = newW / startRatio;
              guides.push({ axis: "v", position: 0 });
              borderSnapped = true;
            } else if (distBottom < snapThreshold) {
              newH = overlayH - newY;
              newW = newH * startRatio;
              newX = (this.elementStartX + this.elementStartW) - newW;
              guides.push({ axis: "h", position: overlayH });
              borderSnapped = true;
            }
          }
        } else {
          if (this.resizeHandle.includes("r")) {
            if (Math.abs((newX + newW) - overlayW) < snapThreshold) {
              newW = overlayW - newX;
              guides.push({ axis: "v", position: overlayW });
              borderSnapped = true;
            }
          }
          if (this.resizeHandle.includes("l")) {
            if (Math.abs(newX) < snapThreshold) {
              newX = 0;
              newW = (this.elementStartX + this.elementStartW) - newX;
              guides.push({ axis: "v", position: 0 });
              borderSnapped = true;
            }
          }
          if (this.resizeHandle.includes("b")) {
            if (Math.abs((newY + newH) - overlayH) < snapThreshold) {
              newH = overlayH - newY;
              guides.push({ axis: "h", position: overlayH });
              borderSnapped = true;
            }
          }
          if (this.resizeHandle.includes("t")) {
            if (Math.abs(newY) < snapThreshold) {
              newY = 0;
              newH = (this.elementStartY + this.elementStartH) - newY;
              guides.push({ axis: "h", position: 0 });
              borderSnapped = true;
            }
          }
        }

        // Render snap guide lines and viewport snap border outline glow
        this.renderGuides(guides);
        const viewport = this.overlayContainer.parentElement;
        if (viewport) {
          if (borderSnapped) {
            viewport.classList.add("border-snapped");
          } else {
            viewport.classList.remove("border-snapped");
          }
        }

        activeBox.style.left = `${newX}px`;
        activeBox.style.top = `${newY}px`;
        activeBox.style.width = `${newW}px`;
        activeBox.style.height = `${newH}px`;

        // Live update text font size inside the overlay box during resize
        if (this.activeElement === "text" || (this.activeElement && this.activeElement.startsWith("extra-"))) {
          const scaleFactor = newW / this.elementStartW;
          const scale = Math.min(
            overlayW / (this.stateManager.project.output_width || 1080),
            overlayH / (this.stateManager.project.output_height || 1920)
          );
          const liveFontSize = Math.max(8, this.elementStartFontSize * scaleFactor);
          const textEl = activeBox.querySelector(".overlay-text-content") as HTMLDivElement | null;
          if (textEl) {
            textEl.style.fontSize = `${liveFontSize * scale}px`;
          }
        }
      }
    });

    window.addEventListener("mouseup", () => {
      if (!this.isDragging && !this.isResizing) return;

      // Hide all guides
      this.renderGuides([]);

      const scale = Math.min(
        this.overlayContainer.clientWidth / (this.stateManager.project.output_width || 1080),
        this.overlayContainer.clientHeight / (this.stateManager.project.output_height || 1920)
      );

      const activeBox = this.getActiveBox();

      if (this.activeElement && activeBox) {
        const xVal = Math.round(parseFloat(activeBox.style.left) / scale);
        const yVal = Math.round(parseFloat(activeBox.style.top) / scale);
        const wVal = Math.round(parseFloat(activeBox.style.width) / scale);
        const hVal = Math.round(parseFloat(activeBox.style.height) / scale);

        if (this.activeElement === "video") {
          this.stateManager.updateProjectField("video_placement", {
            enabled: true,
            x: xVal,
            y: yVal,
            width: wVal,
            height: hVal,
          });
        } else if (this.activeElement === "text") {
          const settings = { ...this.stateManager.project.text_settings };
          settings.x_position = xVal.toString();
          settings.y_position = yVal.toString();
          settings.placement = "Custom";

          // Compute font size from the ratio of screen-px widths (no double-conversion)
          if (this.isResizing) {
            const screenW = parseFloat(activeBox.style.width);
            const scaleFactor = screenW / this.elementStartW;
            settings.font_size = Math.max(8, Math.round(this.elementStartFontSize * scaleFactor));
          }

          this.stateManager.updateProjectField("text_settings", settings);
        } else if (this.activeElement.startsWith("extra-")) {
          const idx = parseInt(this.activeElement.split("-")[1]);
          const overlays = [...(this.stateManager.project.extra_overlays || [])];
          if (overlays[idx]) {
            overlays[idx].x_position = xVal.toString();
            overlays[idx].y_position = yVal.toString();
            overlays[idx].placement = "Custom";

            // Compute font size from the ratio of screen-px widths (no double-conversion)
            if (this.isResizing) {
              const screenW = parseFloat(activeBox.style.width);
              const scaleFactor = screenW / this.elementStartW;
              overlays[idx].font_size = Math.max(8, Math.round(this.elementStartFontSize * scaleFactor));
            }

            this.stateManager.updateProjectField("extra_overlays", overlays);
          }
        } else if (this.activeElement.startsWith("media-")) {
          const idx = parseInt(this.activeElement.split("-")[1]);
          const overlays = [...(this.stateManager.project.media_overlays || [])];
          if (overlays[idx]) {
            overlays[idx].x = xVal;
            overlays[idx].y = yVal;
            overlays[idx].width = wVal;
            overlays[idx].height = hVal;
            this.stateManager.updateProjectField("media_overlays", overlays);
          }
        }
      }

      this.isDragging = false;
      this.isResizing = false;
      this.activeElement = null;
      this.resizeHandle = null;

      this.onLayoutChangeCallback();

      // Deferred rebuild: the guard above skipped update() during state commit,
      // so rebuild overlays on the next frame with committed positions
      requestAnimationFrame(() => {
        const p = this.stateManager.project;
        const cw = this.overlayContainer.clientWidth;
        const ch = this.overlayContainer.clientHeight;
        this.update(p, cw, ch);
      });
    });
  }

  /** Collect all visible overlay boxes as snap targets (excluding the active one) */
  private collectSnapTargets(): SnapTarget[] {
    const targets: SnapTarget[] = [];
    const addBox = (box: HTMLDivElement | null, id: string) => {
      if (!box || id === this.activeElement) return;
      targets.push({
        id,
        x: parseFloat(box.style.left),
        y: parseFloat(box.style.top),
        width: parseFloat(box.style.width),
        height: parseFloat(box.style.height),
      });
    };
    addBox(this.videoBox, "video");
    addBox(this.textBox, "text");
    this.extraBoxes.forEach((b, i) => addBox(b, `extra-${i}`));
    this.mediaBoxes.forEach((b, i) => addBox(b, `media-${i}`));
    return targets;
  }

  /** Render dynamic guide lines — show exactly the lines in `guides`, hide the rest */
  private renderGuides(guides: GuideLine[]) {
    // Grow pool if needed
    while (this.guidePool.length < guides.length) {
      const el = document.createElement("div");
      el.className = "snap-guide-line";
      el.style.position = "absolute";
      el.style.pointerEvents = "none";
      el.style.zIndex = "100";
      this.guideContainer.appendChild(el);
      this.guidePool.push(el);
    }

    const overlayW = this.overlayContainer.clientWidth;
    const overlayH = this.overlayContainer.clientHeight;
    let borderSnapped = false;

    for (let i = 0; i < this.guidePool.length; i++) {
      const el = this.guidePool[i];
      if (i < guides.length) {
        const g = guides[i];
        el.style.display = "block";

        if (g.axis === "v" && (g.position === 0 || Math.abs(g.position - overlayW) < 2)) {
          borderSnapped = true;
        }
        if (g.axis === "h" && (g.position === 0 || Math.abs(g.position - overlayH) < 2)) {
          borderSnapped = true;
        }

        if (g.axis === "v") {
          el.style.left = `${g.position}px`;
          el.style.top = "0";
          el.style.width = "1px";
          el.style.height = "100%";
          el.style.background = "linear-gradient(180deg, transparent 0%, #f43f5e 15%, #f43f5e 85%, transparent 100%)";
        } else {
          el.style.left = "0";
          el.style.top = `${g.position}px`;
          el.style.width = "100%";
          el.style.height = "1px";
          el.style.background = "linear-gradient(90deg, transparent 0%, #f43f5e 15%, #f43f5e 85%, transparent 100%)";
        }
      } else {
        el.style.display = "none";
      }
    }

    const viewport = this.overlayContainer.parentElement;
    if (viewport) {
      if (borderSnapped) {
        viewport.classList.add("border-snapped");
      } else {
        viewport.classList.remove("border-snapped");
      }
    }
  }

  getFocusedElement(): string | null {
    return this.focusedElement;
  }

  setFocusedElement(type: string | null) {
    this.focusedElement = type;
    this.refreshFocus();
  }

  private refreshFocus() {
    const boxes = [this.videoBox, this.textBox, ...this.extraBoxes, ...this.mediaBoxes];
    boxes.forEach((box) => {
      if (!box) return;
      const matches = box.className.includes(`selection-${this.focusedElement}`);
      if (this.focusedElement && matches) {
        box.classList.add("focused");
      } else {
        box.classList.remove("focused");
      }
    });
    this.onLayoutChangeCallback();
  }

  getNaturalRatio(type: string): number | null {
    if (type === "video") {
      const video = document.querySelector(".preview-video-element") as HTMLVideoElement | null;
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        return video.videoWidth / video.videoHeight;
      }
    } else if (type === "text") {
      const partNum = this.stateManager.project.selected_clip_index || 1;
      const rawTemplate = this.stateManager.project.text_template || "PART {part}";
      const txtVal = rawTemplate.replace(/{part}/g, partNum.toString()).trim();
      const txtFS = this.stateManager.project.text_settings.font_size || 120;
      const txtFontFamily = this.stateManager.project.text_settings.font_family || "Arial";
      const metrics = this.measureText(txtVal, txtFS, txtFontFamily);
      if (metrics.width > 0 && metrics.height > 0) {
        return metrics.width / metrics.height;
      }
    } else if (type.startsWith("extra-")) {
      const idx = parseInt(type.split("-")[1]);
      const overlay = (this.stateManager.project.extra_overlays || [])[idx];
      if (overlay) {
        const extraTxt = (overlay.text || "Static Text").trim();
        const extraFS = overlay.font_size || 80;
        const extraFontFamily = overlay.font_family || "Arial";
        const metrics = this.measureText(extraTxt, extraFS, extraFontFamily);
        if (metrics.width > 0 && metrics.height > 0) {
          return metrics.width / metrics.height;
        }
      }
    } else if (type.startsWith("media-")) {
      const idx = parseInt(type.split("-")[1]);
      const overlay = (this.stateManager.project.media_overlays || [])[idx];
      if (overlay) {
        if (overlay.type === "video") {
          const video = this.activeOverlayVideos[idx];
          if (video && video.videoWidth > 0 && video.videoHeight > 0) {
            return video.videoWidth / video.videoHeight;
          }
        } else {
          const img = this.activeOverlayImages[idx];
          if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
            return img.naturalWidth / img.naturalHeight;
          }
        }
      }
    }
    return null;
  }

  getFocusedElementBounds(): { x: number; y: number; width: number; height: number } | null {
    if (!this.focusedElement) return null;
    
    const scale = Math.min(
      this.overlayContainer.clientWidth / (this.stateManager.project.output_width || 1080),
      this.overlayContainer.clientHeight / (this.stateManager.project.output_height || 1920)
    );

    const box = this.overlayContainer.querySelector(`.editor-interactive-box.selection-${this.focusedElement}`) as HTMLDivElement | null;
    if (!box) return null;

    return {
      x: Math.round(parseFloat(box.style.left) / scale),
      y: Math.round(parseFloat(box.style.top) / scale),
      width: Math.round(parseFloat(box.style.width) / scale),
      height: Math.round(parseFloat(box.style.height) / scale)
    };
  }

  updateFocusedElementBounds(bounds: { x?: number; y?: number; width?: number; height?: number }) {
    if (!this.focusedElement) return;

    if (this.focusedElement === "video") {
      const placement = { ...this.stateManager.project.video_placement };
      if (bounds.x !== undefined) placement.x = bounds.x;
      if (bounds.y !== undefined) placement.y = bounds.y;
      if (bounds.width !== undefined) placement.width = bounds.width;
      if (bounds.height !== undefined) placement.height = bounds.height;
      this.stateManager.updateProjectField("video_placement", placement);
    } else if (this.focusedElement === "text") {
      const settings = { ...this.stateManager.project.text_settings };
      if (bounds.x !== undefined) settings.x_position = bounds.x.toString();
      if (bounds.y !== undefined) settings.y_position = bounds.y.toString();
      if (bounds.width !== undefined) {
        const currentBounds = this.getFocusedElementBounds();
        if (currentBounds && currentBounds.width > 0) {
          const ratio = bounds.width / currentBounds.width;
          settings.font_size = Math.max(8, Math.round(settings.font_size * ratio));
        }
      }
      this.stateManager.updateProjectField("text_settings", settings);
    } else if (this.focusedElement.startsWith("extra-")) {
      const idx = parseInt(this.focusedElement.split("-")[1]);
      const overlays = [...(this.stateManager.project.extra_overlays || [])];
      if (overlays[idx]) {
        if (bounds.x !== undefined) overlays[idx].x_position = bounds.x.toString();
        if (bounds.y !== undefined) overlays[idx].y_position = bounds.y.toString();
        if (bounds.width !== undefined) {
          const currentBounds = this.getFocusedElementBounds();
          if (currentBounds && currentBounds.width > 0) {
            const ratio = bounds.width / currentBounds.width;
            overlays[idx].font_size = Math.max(8, Math.round(overlays[idx].font_size * ratio));
          }
        }
        this.stateManager.updateProjectField("extra_overlays", overlays);
      }
    } else if (this.focusedElement.startsWith("media-")) {
      const idx = parseInt(this.focusedElement.split("-")[1]);
      const overlays = [...(this.stateManager.project.media_overlays || [])];
      if (overlays[idx]) {
        if (bounds.x !== undefined) overlays[idx].x = bounds.x;
        if (bounds.y !== undefined) overlays[idx].y = bounds.y;
        if (bounds.width !== undefined) overlays[idx].width = bounds.width;
        if (bounds.height !== undefined) overlays[idx].height = bounds.height;
        this.stateManager.updateProjectField("media_overlays", overlays);
      }
    }
  }

  private startSyncLoop() {
    const mainVideo = document.querySelector(".preview-video-element") as HTMLVideoElement | null;
    if (!mainVideo) return;

    const hexToRgb = (hex: string) => {
      const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
      const fullHex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 0, g: 255, b: 0 };
    };

    const rgbToYuv = (r: number, g: number, b: number) => {
      return {
        u: -0.169 * r - 0.331 * g + 0.5 * b + 128,
        v: 0.5 * r - 0.419 * g - 0.081 * b + 128
      };
    };

    const updateFrames = () => {
      const project = this.stateManager.project;
      const isMainPlaying = !mainVideo.paused && !mainVideo.ended;

      project.media_overlays.forEach((overlay, idx) => {
        if (!overlay.enabled) return;

        // 1. Sync Video State
        if (overlay.type === "video") {
          const video = this.activeOverlayVideos[idx];
          const canvas = this.activeOverlayCanvases[idx];
          if (video && canvas) {
            const loopMode = (overlay.loop_mode || "repeat").toLowerCase();
            const duration = video.duration || 1;
            
            let targetTime = 0;
            let showOverlay = true;
            let shouldPlay = isMainPlaying;

            if (loopMode === "repeat") {
              targetTime = mainVideo.currentTime % duration;
              showOverlay = true;
            } else if (loopMode === "freeze") {
              const isPast = mainVideo.currentTime >= duration;
              targetTime = Math.min(mainVideo.currentTime, duration - 0.05);
              showOverlay = true;
              if (isPast) {
                shouldPlay = false;
              }
            } else if (loopMode === "stop") {
              const isPast = mainVideo.currentTime >= duration;
              if (isPast) {
                targetTime = duration - 0.05;
                showOverlay = false;
                shouldPlay = false;
              } else {
                targetTime = mainVideo.currentTime;
                showOverlay = true;
              }
            }

            // Sync play/pause
            if (shouldPlay) {
              if (video.paused) {
                video.play().catch(() => {});
              }
            } else {
              if (!video.paused) {
                video.pause();
              }
            }

            // Sync currentTime
            if (Math.abs(video.currentTime - targetTime) > 0.25) {
              video.currentTime = targetTime;
            }

            // Show/hide canvas
            canvas.style.opacity = showOverlay ? "1" : "0";
          }
        }

        // 2. Draw Frame on Canvas
        const canvas = this.activeOverlayCanvases[idx];
        if (canvas) {
          const ctx = canvas.getContext("2d")!;
          let srcW = 0;
          let srcH = 0;

          const video = this.activeOverlayVideos[idx];
          const img = this.activeOverlayImages[idx];

          if (overlay.type === "video" && video) {
            srcW = video.videoWidth;
            srcH = video.videoHeight;
          } else if (overlay.type === "image" && img) {
            srcW = img.naturalWidth;
            srcH = img.naturalHeight;
          }

          if (srcW > 0 && srcH > 0) {
            if (canvas.width !== srcW || canvas.height !== srcH) {
              canvas.width = srcW;
              canvas.height = srcH;
            }

            ctx.clearRect(0, 0, srcW, srcH);
            if (overlay.type === "video" && video) {
              ctx.drawImage(video, 0, 0);
            } else if (overlay.type === "image" && img) {
              ctx.drawImage(img, 0, 0);
            }

            // Apply Chroma Key filter if enabled
            if (overlay.chroma_key) {
              const imgData = ctx.getImageData(0, 0, srcW, srcH);
              const data = imgData.data;
              
              const chromaColor = overlay.chroma_color || "#00ff00";
              const targetRgb = hexToRgb(chromaColor);
              const targetYuv = rgbToYuv(targetRgb.r, targetRgb.g, targetRgb.b);
              const similarity = overlay.chroma_similarity || 0.3;
              const blend = overlay.chroma_blend || 0.05;

              const tU = targetYuv.u;
              const tV = targetYuv.v;

              for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];

                const u = -0.169 * r - 0.331 * g + 0.5 * b + 128;
                const v = 0.5 * r - 0.419 * g - 0.081 * b + 128;

                const uDiff = u - tU;
                const vDiff = v - tV;
                const dist = Math.sqrt(uDiff * uDiff + vDiff * vDiff) / 240.0;

                if (dist < similarity) {
                  if (blend > 0 && (similarity - dist) < blend) {
                    const alphaFactor = (similarity - dist) / blend;
                    data[i + 3] = Math.round(alphaFactor * 255);
                  } else {
                    data[i + 3] = 0;
                  }
                }
              }

              ctx.putImageData(imgData, 0, 0);
            }
          }
        }
      });

      this.syncAnimId = requestAnimationFrame(updateFrames);
    };

    this.syncAnimId = requestAnimationFrame(updateFrames);
  }
}
