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
  private lastFocusedElement: string = "video";

  public ratioLocked = true;

  private dragStartX = 0;
  private dragStartY = 0;
  private elementStartX = 0;
  private elementStartY = 0;
  private elementStartW = 0;
  private elementStartH = 0;
  private elementStartFontSize = 32;
  
  private isCropping = false;
  private isRotating = false;
  private elementStartCropT = 0;
  private elementStartCropR = 0;
  private elementStartCropB = 0;
  private elementStartCropL = 0;

  private onLayoutChangeCallback: () => void = () => {};
  private onFocusChangeCallback: (focusedElement: string | null) => void = () => {};

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

  private applyLetterSpacing(text: string, letterSpacing: number): string {
    if (letterSpacing > 0) {
      const numSpaces = Math.max(1, Math.floor(letterSpacing / 5));
      const spaceStr = "\u200A".repeat(numSpaces);
      return Array.from(text).join(spaceStr);
    }
    return text;
  }

  private measureText(text: string, fontSize: number, fontFamily: string, fontWeight: number = 400): { width: number; height: number; ascent: number } {
    const span = document.createElement("span");
    span.style.fontFamily = fontFamily;
    span.style.fontSize = `${fontSize}px`;
    span.style.fontWeight = fontWeight.toString();
    span.style.whiteSpace = "pre";
    span.style.position = "absolute";
    span.style.visibility = "hidden";
    span.style.pointerEvents = "none";
    span.style.lineHeight = "1";
    span.textContent = text;
    
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

  update(project: ProjectData, containerWidth: number, containerHeight: number, forceRebuild = false) {
    // Don't rebuild overlays while user is actively dragging/resizing unless forced
    if (!forceRebuild && (this.isDragging || this.isResizing)) return;

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
      const cropT = (project.video_placement.crop_top || 0) * scale;
      const cropR = (project.video_placement.crop_right || 0) * scale;
      const cropB = (project.video_placement.crop_bottom || 0) * scale;
      const cropL = (project.video_placement.crop_left || 0) * scale;

      const boxX = project.video_placement.x * scale + cropL;
      const boxY = project.video_placement.y * scale + cropT;
      const boxW = project.video_placement.width * scale - cropL - cropR;
      const boxH = project.video_placement.height * scale - cropT - cropB;
      const rot = project.video_placement.rotation || 0;

      this.videoBox = this.createInteractiveBox("video", boxX, boxY, boxW, boxH, scale, undefined, rot, cropT, cropR, cropB, cropL);

      const activeAsset = this.stateManager.assets.find(a => a.path === project.input_path);
      if (activeAsset && activeAsset.isMissing) {
        const btnRelinkCanvas = document.createElement("button");
        btnRelinkCanvas.className = "btn-canvas-relink-media";
        btnRelinkCanvas.innerHTML = `🔍 Relink Media`;
        btnRelinkCanvas.style.cssText = `
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 50;
          padding: 8px 16px;
          background: #f59e0b;
          color: #000;
          font-weight: 700;
          font-size: 13px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(245, 158, 11, 0.5);
          pointer-events: auto;
          transition: transform 0.15s;
        `;
        btnRelinkCanvas.addEventListener("click", (e) => {
          e.stopPropagation();
          const btn = document.querySelector("#btn-browse-relocate-file") as HTMLButtonElement;
          if (btn) btn.click();
        });
        this.videoBox.appendChild(btnRelinkCanvas);
      }

      this.overlayContainer.appendChild(this.videoBox);
    }

    // Render Primary Text Box (approximated size based on template length and font size)
    if (project.text_settings.enabled !== false) {
      let textX = 10;
      let textY = 10;
      const partNum = project.selected_clip_index || 1;

      let rawTemplate = project.text_template || "PART {part}";
      let txtFS = project.text_settings.font_size || 120;
      let txtFontColor = project.text_settings.font_color || "#ffffff";
      let txtFontFamily = project.text_settings.font_family || "Arial";
      let txtFontWeight = project.text_settings.font_weight || 400;
      let txtLetterSpacing = project.text_settings.letter_spacing || 0;
      let txtOutline = project.text_settings.outline ?? true;
      let posX = (project.text_settings.x_position || "").trim();
      let posY = (project.text_settings.y_position || "").trim();

      const isCycle = (project.text_preset_mode === "Cycle") && (project.text_presets && project.text_presets.length > 0);
      if (isCycle) {
        const clipIdx = (project.selected_clip_index || 1) - 1;
        const presetIdx = clipIdx % project.text_presets.length;
        const preset = project.text_presets[presetIdx];
        if (preset) {
          txtFS = preset.font_size;
          txtFontColor = preset.font_color;
          txtFontFamily = preset.font_family;
          txtFontWeight = preset.font_weight || 400;
          txtLetterSpacing = preset.letter_spacing || 0;
          txtOutline = preset.outline;
          if (preset.template_text && preset.template_text.trim()) {
            rawTemplate = preset.template_text;
          }
          if (preset.x_position) posX = preset.x_position.trim();
          if (preset.y_position) posY = preset.y_position.trim();
        }
      }

      let txtVal = rawTemplate.replace(/{part}/g, partNum.toString()).trim();
      txtVal = this.applyLetterSpacing(txtVal, txtLetterSpacing);

      // Measure at the actual rendered pixel size to avoid font hinting discrepancies
      const scaledFS = txtFS * scale;
      const txtMetrics = this.measureText(txtVal, scaledFS, txtFontFamily, txtFontWeight);

      const boxW = txtMetrics.width;
      const boxH = txtMetrics.height;

      textX = this.evaluatePosFormula(posX, canvasW, boxW, scale, (canvasW - boxW) / 2);
      textY = this.evaluatePosFormula(posY, canvasH, boxH, scale, (canvasH - boxH) / 2);

      const origFS = project.text_settings.font_size;
      const origFC = project.text_settings.font_color;
      const origFF = project.text_settings.font_family;
      const origFW = project.text_settings.font_weight;
      const origLS = project.text_settings.letter_spacing;
      const origOL = project.text_settings.outline;

      project.text_settings.font_size = txtFS;
      project.text_settings.font_color = txtFontColor;
      project.text_settings.font_family = txtFontFamily;
      project.text_settings.font_weight = txtFontWeight;
      project.text_settings.letter_spacing = txtLetterSpacing;
      project.text_settings.outline = txtOutline;

      this.textBox = this.createInteractiveBox("text", textX, textY, boxW, boxH, scale, txtVal);

      project.text_settings.font_size = origFS;
      project.text_settings.font_color = origFC;
      project.text_settings.font_family = origFF;
      project.text_settings.font_weight = origFW;
      project.text_settings.letter_spacing = origLS;
      project.text_settings.outline = origOL;

      this.overlayContainer.appendChild(this.textBox);
    }

    // Render Extra Overlays
    if (project.extra_overlays) {
      project.extra_overlays.forEach((overlay, idx) => {
        let extraTxt = (overlay.text || "Static Text").trim();
        extraTxt = this.applyLetterSpacing(extraTxt, overlay.letter_spacing || 0);
        const extraFS = overlay.font_size || 80;
        const extraFontFamily = overlay.font_family || "Arial";
        const extraFontWeight = overlay.font_weight || 400;
        // Measure at the actual rendered pixel size
        const extraScaledFS = extraFS * scale;
        const extraMetrics = this.measureText(extraTxt, extraScaledFS, extraFontFamily, extraFontWeight);

        const extraBoxW = extraMetrics.width;
        const extraBoxH = extraMetrics.height;

        const exPosX = (overlay.x_position || "").trim();
        const exPosY = (overlay.y_position || "").trim();
        const x = this.evaluatePosFormula(exPosX, canvasW, extraBoxW, scale, 20);
        const y = this.evaluatePosFormula(exPosY, canvasH, extraBoxH, scale, 20);

        const box = this.createInteractiveBox(`extra-${idx}`, x, y, extraBoxW, extraBoxH, scale, extraTxt);
        this.overlayContainer.appendChild(box);
        this.extraBoxes.push(box);
      });
    }


    // Render Media Overlays
    if (project.media_overlays) {
      project.media_overlays.forEach((overlay, idx) => {
        if (overlay.enabled === false) return;

        const cropT = (overlay.crop_top || 0) * scale;
        const cropR = (overlay.crop_right || 0) * scale;
        const cropB = (overlay.crop_bottom || 0) * scale;
        const cropL = (overlay.crop_left || 0) * scale;

        const boxX = overlay.x * scale + cropL;
        const boxY = overlay.y * scale + cropT;
        const boxW = overlay.width * scale - cropL - cropR;
        const boxH = overlay.height * scale - cropT - cropB;
        const rot = overlay.rotation || 0;

        const box = this.createInteractiveBox(`media-${idx}`, boxX, boxY, boxW, boxH, scale, overlay.name, rot, cropT, cropR, cropB, cropL);
        this.overlayContainer.appendChild(box);
        this.mediaBoxes.push(box);

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
    labelText?: string,
    rotation: number = 0,
    cropTop: number = 0,
    cropRight: number = 0,
    cropBottom: number = 0,
    cropLeft: number = 0
  ): HTMLDivElement {
    const box = document.createElement("div");
    box.className = `editor-interactive-box selection-${type}`;
    box.setAttribute("data-type", type);
    box.style.position = "absolute";
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    box.style.width = `${w}px`;
    box.style.height = `${h}px`;
    box.style.transform = `rotate(${rotation}deg)`;
    box.dataset.cropT = cropTop.toString();
    box.dataset.cropR = cropRight.toString();
    box.dataset.cropB = cropBottom.toString();
    box.dataset.cropL = cropLeft.toString();

    // Manage borders and handles via focused class states rather than hardcoded inline values
    if (this.focusedElement === type) {
      box.classList.add("focused");
    }
    
    box.style.cursor = "move";
    box.style.pointerEvents = "auto";
    box.style.zIndex = type === "video" ? "5" : "10";
    box.style.overflow = "visible";

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
      textContent.textContent = labelText || "Text";
      textContent.style.fontSize = `${scaledFontSize}px`;
      textContent.style.color = fontColor;
      textContent.style.fontFamily = `"${fontFamily}", sans-serif`;
      textContent.style.lineHeight = "1";
      textContent.style.whiteSpace = "pre";
      textContent.style.pointerEvents = "none";
      textContent.style.userSelect = "none";

      let fontWeight = 400;
      if (type === "text") {
        fontWeight = this.stateManager.project.text_settings.font_weight || 400;
      } else if (type.startsWith("extra-")) {
        const idx = parseInt(type.split("-")[1]);
        const overlay = (this.stateManager.project.extra_overlays || [])[idx];
        if (overlay) {
          fontWeight = overlay.font_weight || 400;
        }
      }

      textContent.style.fontWeight = fontWeight.toString();

      if (fontWeight > 600) {
        // Synthesize boldness visually to match user expectations (FFmpeg backend fakes bold too)
        const boldThickness = Math.max(0.5, ((fontWeight - 400) / 300) * (fontSize / 100) * scale);
        textContent.style.setProperty('-webkit-text-stroke', `${boldThickness}px ${fontColor}`);
      }

      if (hasOutline) {
        // Use textShadow instead of webkitTextStroke so it doesn't eat into the font thickness
        const ot = Math.max(1, Math.round(fontSize / 30 * scale));
        textContent.style.textShadow = `-${ot}px -${ot}px 0 #000, ${ot}px -${ot}px 0 #000, -${ot}px ${ot}px 0 #000, ${ot}px ${ot}px 0 #000, 0px ${ot}px 0 #000, ${ot}px 0px 0 #000, 0px -${ot}px 0 #000, -${ot}px 0px 0 #000`;
        // Add inner padding so shadow doesn't clip at box edges
        textContent.style.padding = `${ot}px ${ot * 2}px`;
      }

      textContent.style.overflow = "visible";
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
        
        if (e.altKey && type !== "text" && !type.startsWith("extra-")) {
          this.isCropping = true;
          this.isResizing = false;
        } else {
          this.isResizing = true;
          this.isCropping = false;
        }
        
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
        
        const bounds = this.getFocusedElementBounds();
        if (bounds) {
          this.elementStartCropT = (bounds.crop_top || 0) * scale;
          this.elementStartCropR = (bounds.crop_right || 0) * scale;
          this.elementStartCropB = (bounds.crop_bottom || 0) * scale;
          this.elementStartCropL = (bounds.crop_left || 0) * scale;
        }

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
        
        if (e.altKey && type !== "text" && !type.startsWith("extra-")) {
          this.isCropping = true;
          this.isResizing = false;
        } else {
          this.isResizing = true;
          this.isCropping = false;
        }
        
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

        const bounds = this.getFocusedElementBounds();
        if (bounds) {
          this.elementStartCropT = (bounds.crop_top || 0) * scale;
          this.elementStartCropR = (bounds.crop_right || 0) * scale;
          this.elementStartCropB = (bounds.crop_bottom || 0) * scale;
          this.elementStartCropL = (bounds.crop_left || 0) * scale;
        }

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

    if (type !== "text" && !type.startsWith("extra-")) {
      const rotHandle = document.createElement("div");
      rotHandle.className = "rot-handle resize-handle";
      rotHandle.style.position = "absolute";
      rotHandle.style.width = "24px";
      rotHandle.style.height = "24px";
      rotHandle.style.background = (type === "video" ? "#3b82f6" : "#a855f7");
      rotHandle.style.borderRadius = "50%";
      rotHandle.style.left = "50%";
      rotHandle.style.top = "-36px";
      rotHandle.style.transform = "translateX(-50%)";
      rotHandle.style.cursor = "crosshair";
      rotHandle.style.display = "flex";
      rotHandle.style.alignItems = "center";
      rotHandle.style.justifyContent = "center";
      rotHandle.style.color = "white";
      rotHandle.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";
      rotHandle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l5.67-5.67"/></svg>`;

      box.appendChild(rotHandle);

      rotHandle.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.isRotating = true;
        this.activeElement = type;
        
        this.focusedElement = type;
        this.refreshFocus();

        const boxRect = box.getBoundingClientRect();
        this.dragStartX = boxRect.left + boxRect.width / 2; // center X
        this.dragStartY = boxRect.top + boxRect.height / 2; // center Y
      });
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

  private syncLiveMedia(activeBox: HTMLDivElement) {
    if (!this.activeElement) return;

    const newX = parseFloat(activeBox.style.left) || 0;
    const newY = parseFloat(activeBox.style.top) || 0;
    const newW = parseFloat(activeBox.style.width) || 0;
    const newH = parseFloat(activeBox.style.height) || 0;
    const cropT = parseFloat(activeBox.dataset.cropT || "0");
    const cropR = parseFloat(activeBox.dataset.cropR || "0");
    const cropB = parseFloat(activeBox.dataset.cropB || "0");
    const cropL = parseFloat(activeBox.dataset.cropL || "0");

    const rotStr = activeBox.style.transform || "";
    const rotMatch = rotStr.match(/rotate\(([-\d.]+)deg\)/);
    const rot = rotMatch ? parseFloat(rotMatch[1]) : 0;

    if (this.activeElement === "video") {
      const videoElement = document.querySelector(".preview-video-element") as HTMLVideoElement | null;
      if (videoElement) {
        videoElement.style.left = `${newX - cropL}px`;
        videoElement.style.top = `${newY - cropT}px`;
        videoElement.style.width = `${newW + cropL + cropR}px`;
        videoElement.style.height = `${newH + cropT + cropB}px`;
        videoElement.style.transform = `rotate(${rot}deg)`;
        if (cropT > 0 || cropR > 0 || cropB > 0 || cropL > 0) {
          videoElement.style.clipPath = `inset(${cropT}px ${cropR}px ${cropB}px ${cropL}px)`;
        } else {
          videoElement.style.clipPath = "none";
        }
      }
    } else if (this.activeElement.startsWith("media-")) {
      const idx = parseInt(this.activeElement.split("-")[1]);
      const canvas = this.activeOverlayCanvases[idx];
      if (canvas) {
        canvas.style.left = `${-cropL}px`;
        canvas.style.top = `${-cropT}px`;
        canvas.style.width = `${newW + cropL + cropR}px`;
        canvas.style.height = `${newH + cropT + cropB}px`;
        if (cropT > 0 || cropR > 0 || cropB > 0 || cropL > 0) {
          canvas.style.clipPath = `inset(${cropT}px ${cropR}px ${cropB}px ${cropL}px)`;
        } else {
          canvas.style.clipPath = "none";
        }
      }
    }
  }

  private setupGlobalEvents() {
    window.addEventListener("mousemove", (e) => {
      if (!this.isDragging && !this.isResizing && !this.isCropping && !this.isRotating) return;
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
        this.syncLiveMedia(activeBox);

      } else if (this.isRotating) {
        const rect = activeBox.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        // The rotate handle is at the top center, which is -90 degrees in atan2.
        // We add 90 so that pointing straight up equals 0 degrees rotation.
        let rotation = angle + 90;
        
        // Add snapping to 15 degree increments if shift is held
        if (e.shiftKey) {
          rotation = Math.round(rotation / 15) * 15;
        }

        activeBox.style.transform = `rotate(${rotation}deg)`;
        this.syncLiveMedia(activeBox);
        
      } else if (this.isCropping && this.resizeHandle) {
        let cropT = this.elementStartCropT;
        let cropB = this.elementStartCropB;
        let cropL = this.elementStartCropL;
        let cropR = this.elementStartCropR;

        if (this.resizeHandle.includes("t")) cropT = Math.max(0, this.elementStartCropT + dy);
        if (this.resizeHandle.includes("b")) cropB = Math.max(0, this.elementStartCropB - dy);
        if (this.resizeHandle.includes("l")) cropL = Math.max(0, this.elementStartCropL + dx);
        if (this.resizeHandle.includes("r")) cropR = Math.max(0, this.elementStartCropR - dx);

        // Prevent cropping more than the box size
        if (cropT + cropB >= this.elementStartH) {
           if (this.resizeHandle.includes("t")) cropT = this.elementStartH - cropB - 1;
           if (this.resizeHandle.includes("b")) cropB = this.elementStartH - cropT - 1;
        }
        if (cropL + cropR >= this.elementStartW) {
           if (this.resizeHandle.includes("l")) cropL = this.elementStartW - cropR - 1;
           if (this.resizeHandle.includes("r")) cropR = this.elementStartW - cropL - 1;
        }

        const deltaL = cropL - this.elementStartCropL;
        const deltaR = cropR - this.elementStartCropR;
        const deltaT = cropT - this.elementStartCropT;
        const deltaB = cropB - this.elementStartCropB;

        activeBox.dataset.cropT = cropT.toString();
        activeBox.dataset.cropB = cropB.toString();
        activeBox.dataset.cropL = cropL.toString();
        activeBox.dataset.cropR = cropR.toString();

        activeBox.style.left = `${this.elementStartX + deltaL}px`;
        activeBox.style.top = `${this.elementStartY + deltaT}px`;
        activeBox.style.width = `${this.elementStartW - deltaL - deltaR}px`;
        activeBox.style.height = `${this.elementStartH - deltaT - deltaB}px`;
        this.syncLiveMedia(activeBox);
        
      } else if (this.isResizing && this.resizeHandle) {
        let newW = this.elementStartW;
        let newH = this.elementStartH;
        let newX = this.elementStartX;
        let newY = this.elementStartY;

        let isProportional = this.getElementRatioLocked(this.activeElement) || (this.activeElement === "text" || (this.activeElement !== null && (this.activeElement.startsWith("extra-") || this.activeElement.startsWith("media-"))));
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

        // Live sync video and media overlays
        this.syncLiveMedia(activeBox);

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
      if (!this.isDragging && !this.isResizing && !this.isRotating && !this.isCropping) return;

      // Hide all guides
      this.renderGuides([]);

      const scale = Math.min(
        this.overlayContainer.clientWidth / (this.stateManager.project.output_width || 1080),
        this.overlayContainer.clientHeight / (this.stateManager.project.output_height || 1920)
      );

      const activeBox = this.getActiveBox();

      if (this.activeElement && activeBox) {
        const bounds = this.getFocusedElementBounds();
        const xVal = bounds?.x ?? Math.round(parseFloat(activeBox.style.left) / scale);
        const yVal = bounds?.y ?? Math.round(parseFloat(activeBox.style.top) / scale);
        const wVal = bounds?.width ?? Math.round(parseFloat(activeBox.style.width) / scale);
        const hVal = bounds?.height ?? Math.round(parseFloat(activeBox.style.height) / scale);
        const rotVal = bounds?.rotation || 0;
        const cropTVal = bounds?.crop_top || 0;
        const cropRVal = bounds?.crop_right || 0;
        const cropBVal = bounds?.crop_bottom || 0;
        const cropLVal = bounds?.crop_left || 0;

        if (this.activeElement === "video") {
          this.stateManager.updateProjectField("video_placement", {
            ...this.stateManager.project.video_placement,
            enabled: true,
            x: xVal,
            y: yVal,
            width: wVal,
            height: hVal,
            rotation: rotVal,
            crop_top: cropTVal,
            crop_right: cropRVal,
            crop_bottom: cropBVal,
            crop_left: cropLVal,
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
            overlays[idx] = {
              ...overlays[idx],
              x: xVal,
              y: yVal,
              width: wVal,
              height: hVal,
              rotation: rotVal,
              crop_top: cropTVal,
              crop_right: cropRVal,
              crop_bottom: cropBVal,
              crop_left: cropLVal,
            };
            this.stateManager.updateProjectField("media_overlays", overlays);
          }
        }
      }

      this.isDragging = false;
      this.isResizing = false;
      this.isRotating = false;
      this.isCropping = false;
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

  /** Render dynamic guide lines & labels — show exactly the lines in `guides`, hide the rest */
  private renderGuides(guides: GuideLine[]) {
    // Grow pool if needed
    while (this.guidePool.length < guides.length) {
      const el = document.createElement("div");
      el.className = "snap-guide-line";
      el.style.position = "absolute";
      el.style.pointerEvents = "none";
      el.style.zIndex = "100";

      const labelEl = document.createElement("div");
      labelEl.className = "snap-guide-label";
      el.appendChild(labelEl);

      this.guideContainer.appendChild(el);
      this.guidePool.push(el);
    }

    const overlayW = this.overlayContainer.clientWidth;
    const overlayH = this.overlayContainer.clientHeight;
    let borderSnapped = false;

    for (let i = 0; i < this.guidePool.length; i++) {
      const el = this.guidePool[i];
      let labelEl = el.querySelector(".snap-guide-label") as HTMLDivElement | null;
      if (!labelEl) {
        labelEl = document.createElement("div");
        labelEl.className = "snap-guide-label";
        el.appendChild(labelEl);
      }

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
          el.style.width = "2px";
          el.style.height = "100%";
          el.style.border = "none";
          el.style.backgroundImage = "repeating-linear-gradient(180deg, #34d399 0px, #34d399 12px, transparent 12px, transparent 22px)";
          el.style.filter = "drop-shadow(0 0 5px rgba(52, 211, 153, 0.85))";

          if (g.label) {
            labelEl.innerText = g.label;
            labelEl.style.display = "block";
            labelEl.style.left = "6px";
            labelEl.style.top = "16px";
          } else {
            labelEl.style.display = "none";
          }
        } else {
          el.style.left = "0";
          el.style.top = `${g.position}px`;
          el.style.width = "100%";
          el.style.height = "2px";
          el.style.border = "none";
          el.style.backgroundImage = "repeating-linear-gradient(90deg, #34d399 0px, #34d399 12px, transparent 12px, transparent 22px)";
          el.style.filter = "drop-shadow(0 0 5px rgba(52, 211, 153, 0.85))";

          if (g.label) {
            labelEl.innerText = g.label;
            labelEl.style.display = "block";
            labelEl.style.left = "16px";
            labelEl.style.top = "6px";
          } else {
            labelEl.style.display = "none";
          }
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

  getLastFocusedElement(): string {
    return this.lastFocusedElement || "video";
  }

  setFocusedElement(type: string | null) {
    if (type) this.lastFocusedElement = type;
    this.focusedElement = type;
    this.refreshFocus();
  }

  onFocusChange(callback: (focusedElement: string | null) => void) {
    this.onFocusChangeCallback = callback;
  }

  public getElementRatioLocked(elementId: string | null = this.focusedElement || "video"): boolean {
    const proj = this.stateManager.project;
    const target = elementId || this.focusedElement || "video";
    if (target === "video") {
      return proj.video_placement?.ratio_locked !== false;
    }
    if (target.startsWith("media-")) {
      const idx = parseInt(target.split("-")[1]);
      const overlay = (proj.media_overlays || [])[idx];
      return overlay ? overlay.ratio_locked !== false : true;
    }
    return true;
  }

  public setElementRatioLocked(elementId: string | null, isLocked: boolean) {
    const target = elementId || this.focusedElement || "video";
    const proj = this.stateManager.project;
    if (target === "video") {
      const placement = { ...proj.video_placement, ratio_locked: isLocked };
      this.stateManager.updateProjectField("video_placement", placement);
    } else if (target.startsWith("media-")) {
      const idx = parseInt(target.split("-")[1]);
      const overlays = [...(proj.media_overlays || [])];
      if (overlays[idx]) {
        overlays[idx] = { ...overlays[idx], ratio_locked: isLocked };
        this.stateManager.updateProjectField("media_overlays", overlays);
      }
    }
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
    if (this.onFocusChangeCallback) {
      this.onFocusChangeCallback(this.focusedElement);
    }
    this.onLayoutChangeCallback();
  }

  private evaluatePosFormula(posStr: string, canvasDim: number, boxDim: number, scale: number, defaultPos: number): number {
    const str = (posStr || "").trim().toLowerCase();
    if (!str) return defaultPos;

    // Center / Middle
    if (str === "(w-text_w)/2" || str === "(main_w-text_w)/2" || str === "(h-text_h)/2" || str === "(main_h-text_h)/2" || str === "center" || str === "middle") {
      return (canvasDim - boxDim) / 2;
    }

    // Top keyword
    if (str === "top") {
      return 100 * scale;
    }

    // Bottom keyword or FFmpeg bottom formula (main_h-text_h-100), (h-text_h-150), etc.
    if (str === "bottom") {
      return Math.max(0, canvasDim - boxDim - 100 * scale);
    }

    if (str.includes("h-text_h") || str.includes("main_h-text_h") || str.includes("w-text_w") || str.includes("main_w-text_w")) {
      const match = str.match(/[-+]\s*(\d+)/);
      const offset = match ? parseInt(match[1]) : 100;
      return Math.max(0, canvasDim - boxDim - offset * scale);
    }

    // Direct numeric value e.g. "150" or "450"
    const p = parseFloat(str);
    if (!isNaN(p)) {
      return p * scale;
    }

    return defaultPos;
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
      let txtVal = rawTemplate.replace(/{part}/g, partNum.toString()).trim();
      txtVal = this.applyLetterSpacing(txtVal, this.stateManager.project.text_settings.letter_spacing || 0);
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
        let extraTxt = (overlay.text || "Static Text").trim();
        extraTxt = this.applyLetterSpacing(extraTxt, overlay.letter_spacing || 0);
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

  getFocusedElementBounds(targetOverride?: string): { x: number; y: number; width: number; height: number; rotation?: number; crop_top?: number; crop_right?: number; crop_bottom?: number; crop_left?: number; } | null {
    const target = targetOverride || this.focusedElement || this.lastFocusedElement || "video";
    
    const scale = Math.min(
      this.overlayContainer.clientWidth / (this.stateManager.project.output_width || 1080),
      this.overlayContainer.clientHeight / (this.stateManager.project.output_height || 1920)
    );

    const box = this.overlayContainer.querySelector(`.editor-interactive-box.selection-${target}`) as HTMLDivElement | null;
    if (!box) return null;

    let rotation = 0;
    const transform = box.style.transform;
    if (transform && transform.includes("rotate(")) {
      rotation = parseFloat(transform.match(/rotate\((.*?)deg\)/)?.[1] || "0");
    }

    const crop_top = parseFloat(box.dataset.cropT || "0") / scale;
    const crop_right = parseFloat(box.dataset.cropR || "0") / scale;
    const crop_bottom = parseFloat(box.dataset.cropB || "0") / scale;
    const crop_left = parseFloat(box.dataset.cropL || "0") / scale;

    const croppedX = parseFloat(box.style.left);
    const croppedY = parseFloat(box.style.top);
    const croppedW = parseFloat(box.style.width);
    const croppedH = parseFloat(box.style.height);

    const x = Math.round((croppedX - crop_left * scale) / scale);
    const y = Math.round((croppedY - crop_top * scale) / scale);
    const width = Math.round((croppedW + crop_left * scale + crop_right * scale) / scale);
    const height = Math.round((croppedH + crop_top * scale + crop_bottom * scale) / scale);

    return {
      x, y, width, height,
      rotation, crop_top, crop_right, crop_bottom, crop_left
    };
  }

  updateFocusedElementBounds(bounds: { x?: number | string; y?: number | string; width?: number; height?: number; rotation?: number; crop_top?: number; crop_right?: number; crop_bottom?: number; crop_left?: number; }, targetOverride?: string, recordHistory = true) {
    const target = targetOverride || this.focusedElement || this.lastFocusedElement || "video";

    if (target === "video") {
      const placement = { ...this.stateManager.project.video_placement };
      if (bounds.x !== undefined) placement.x = typeof bounds.x === 'number' ? bounds.x : parseInt(bounds.x) || 0;
      if (bounds.y !== undefined) placement.y = typeof bounds.y === 'number' ? bounds.y : parseInt(bounds.y) || 0;
      if (bounds.width !== undefined) placement.width = bounds.width;
      if (bounds.height !== undefined) placement.height = bounds.height;
      if (bounds.rotation !== undefined) placement.rotation = bounds.rotation;
      if (bounds.crop_top !== undefined) placement.crop_top = bounds.crop_top;
      if (bounds.crop_right !== undefined) placement.crop_right = bounds.crop_right;
      if (bounds.crop_bottom !== undefined) placement.crop_bottom = bounds.crop_bottom;
      if (bounds.crop_left !== undefined) placement.crop_left = bounds.crop_left;
      this.stateManager.updateProjectField("video_placement", placement, recordHistory);
    } else if (target === "text") {
      const settings = { ...this.stateManager.project.text_settings };
      if (bounds.x !== undefined) settings.x_position = bounds.x.toString();
      if (bounds.y !== undefined) settings.y_position = bounds.y.toString();
      if (bounds.width !== undefined) {
        const currentBounds = this.getFocusedElementBounds("text");
        if (currentBounds && currentBounds.width > 0) {
          const ratio = bounds.width / currentBounds.width;
          settings.font_size = Math.max(8, Math.round(settings.font_size * ratio));
        }
      }
      this.stateManager.updateProjectField("text_settings", settings, recordHistory);
    } else if (target.startsWith("extra-")) {
      const idx = parseInt(target.split("-")[1]);
      const overlays = [...(this.stateManager.project.extra_overlays || [])];
      if (overlays[idx]) {
        overlays[idx] = { ...overlays[idx] };
        if (bounds.x !== undefined) overlays[idx].x_position = bounds.x.toString();
        if (bounds.y !== undefined) overlays[idx].y_position = bounds.y.toString();
        if (bounds.width !== undefined) {
          const currentBounds = this.getFocusedElementBounds(target);
          if (currentBounds && currentBounds.width > 0) {
            const ratio = bounds.width / currentBounds.width;
            overlays[idx].font_size = Math.max(8, Math.round(overlays[idx].font_size * ratio));
          }
        }
        this.stateManager.updateProjectField("extra_overlays", overlays, recordHistory);
      }
    } else if (target.startsWith("media-")) {
      const idx = parseInt(target.split("-")[1]);
      const overlays = [...(this.stateManager.project.media_overlays || [])];
      if (overlays[idx]) {
        overlays[idx] = { ...overlays[idx] };
        if (bounds.x !== undefined) overlays[idx].x = typeof bounds.x === 'number' ? bounds.x : parseInt(bounds.x) || 0;
        if (bounds.y !== undefined) overlays[idx].y = typeof bounds.y === 'number' ? bounds.y : parseInt(bounds.y) || 0;
        if (bounds.width !== undefined) overlays[idx].width = bounds.width;
        if (bounds.height !== undefined) overlays[idx].height = bounds.height;
        if (bounds.rotation !== undefined) overlays[idx].rotation = bounds.rotation;
        if (bounds.crop_top !== undefined) overlays[idx].crop_top = bounds.crop_top;
        if (bounds.crop_right !== undefined) overlays[idx].crop_right = bounds.crop_right;
        if (bounds.crop_bottom !== undefined) overlays[idx].crop_bottom = bounds.crop_bottom;
        if (bounds.crop_left !== undefined) overlays[idx].crop_left = bounds.crop_left;
        this.stateManager.updateProjectField("media_overlays", overlays, recordHistory);
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
            // Auto aspect ratio correction if overlay has squeezed or default aspect ratio
            if (!(overlay as any).ratio_corrected) {
              const currentAspect = overlay.width / overlay.height;
              const trueAspect = srcW / srcH;
              if (Math.abs(currentAspect - trueAspect) > 0.05) {
                overlay.height = Math.round(overlay.width / trueAspect);
                (overlay as any).ratio_corrected = true;
                this.stateManager.updateProjectDirectly(this.stateManager.project);
                requestAnimationFrame(() => {
                  this.update(this.stateManager.project, this.overlayContainer.clientWidth, this.overlayContainer.clientHeight);
                });
              } else {
                (overlay as any).ratio_corrected = true;
              }
            }

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
              const similarity = overlay.chroma_similarity ?? 0.3;
              const blend = overlay.chroma_blend ?? 0.05;
              const mode = overlay.chroma_mode || "chromakey";
              const spill = overlay.chroma_spill ?? 0.3;

              const isGreenDominant = targetRgb.g >= targetRgb.r && targetRgb.g >= targetRgb.b;
              const isBlueDominant = !isGreenDominant && targetRgb.b >= targetRgb.r && targetRgb.b >= targetRgb.g;

              const tU = targetYuv.u;
              const tV = targetYuv.v;

              for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];

                let dist = 0;
                if (mode === "colorkey") {
                  const dr = r - targetRgb.r;
                  const dg = g - targetRgb.g;
                  const db = b - targetRgb.b;
                  dist = Math.sqrt(dr * dr + dg * dg + db * db) / 441.673;
                } else {
                  const u = -0.169 * r - 0.331 * g + 0.5 * b + 128;
                  const v = 0.5 * r - 0.419 * g - 0.081 * b + 128;
                  const uDiff = u - tU;
                  const vDiff = v - tV;
                  dist = Math.sqrt(uDiff * uDiff + vDiff * vDiff) / 181.019;
                }

                if (dist < similarity) {
                  const innerBound = Math.max(0, similarity - blend);
                  if (blend > 0 && dist > innerBound) {
                    const alphaFactor = (dist - innerBound) / blend;
                    data[i + 3] = Math.round(alphaFactor * data[i + 3]);
                  } else {
                    data[i + 3] = 0;
                  }
                }

                if (spill > 0 && data[i + 3] > 0) {
                  if (isGreenDominant && g > Math.max(r, b)) {
                    const excess = g - Math.max(r, b);
                    data[i + 1] = Math.max(0, Math.round(g - excess * spill));
                  } else if (isBlueDominant && b > Math.max(r, g)) {
                    const excess = b - Math.max(r, g);
                    data[i + 2] = Math.max(0, Math.round(b - excess * spill));
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
