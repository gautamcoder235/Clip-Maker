import { ProjectData } from "../types";
import { convertFileSrc } from "@tauri-apps/api/core";

export class CanvasRenderer {
  private container: HTMLDivElement;
  private videoElement: HTMLVideoElement;
  private canvasElement: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private isMissing: boolean = false;
  private missingPath: string = "";
  private bgImage: HTMLImageElement | null = null;
  private bgImagePath: string = "";

  constructor(container: HTMLDivElement) {
    this.container = container;
    
    // Create preview video
    this.videoElement = document.createElement("video");
    this.videoElement.className = "preview-video-element";
    this.videoElement.autoplay = false;
    this.videoElement.controls = false;
    this.videoElement.loop = true;
    this.videoElement.style.position = "absolute";
    this.videoElement.style.zIndex = "1";
    this.videoElement.style.pointerEvents = "none";
    this.videoElement.style.display = "none";

    this.videoElement.onerror = () => {
      this.setOfflineState(true, this.videoElement.src);
    };

    // Create background canvas
    this.canvasElement = document.createElement("canvas");
    this.canvasElement.className = "preview-canvas-element";
    this.canvasElement.style.position = "absolute";
    this.canvasElement.style.top = "0";
    this.canvasElement.style.left = "0";
    this.canvasElement.style.width = "100%";
    this.canvasElement.style.height = "100%";
    this.canvasElement.style.zIndex = "0";
    
    this.ctx = this.canvasElement.getContext("2d");

    this.container.appendChild(this.videoElement);
    this.container.appendChild(this.canvasElement);
  }

  setOfflineState(isMissing: boolean, missingPath: string = "") {
    this.isMissing = isMissing;
    this.missingPath = missingPath;
    if (isMissing) {
      this.videoElement.pause();
      this.videoElement.style.display = "none";
    } else {
      this.videoElement.style.display = "block";
    }
  }

  getIsMissing(): boolean {
    return this.isMissing;
  }

  setVideoSource(src: string) {
    this.setOfflineState(false);
    this.videoElement.src = src;
    this.videoElement.load();
    this.videoElement.style.display = "block";
  }

  clearVideo() {
    this.setOfflineState(false);
    this.videoElement.pause();
    this.videoElement.removeAttribute("src");
    this.videoElement.load();
    this.videoElement.style.display = "none";
  }

  play() {
    this.videoElement.play();
  }

  pause() {
    this.videoElement.pause();
  }

  setCurrentTime(seconds: number) {
    this.videoElement.currentTime = seconds;
  }

  getCurrentTime(): number {
    return this.videoElement.currentTime;
  }

  getVideoElement(): HTMLVideoElement {
    return this.videoElement;
  }

  updateLayout(project: ProjectData, containerWidth: number, containerHeight: number) {
    // Calculate aspect ratio scale to fit container
    const targetW = project.output_width || 1080;
    const targetH = project.output_height || 1920;
    
    const scaleX = containerWidth / targetW;
    const scaleY = containerHeight / targetH;
    const scale = Math.min(scaleX, scaleY);

    const canvasW = targetW * scale;
    const canvasH = targetH * scale;

    // Center canvas inside container
    const left = (containerWidth - canvasW) / 2;
    const top = (containerHeight - canvasH) / 2;

    this.container.style.width = `${canvasW}px`;
    this.container.style.height = `${canvasH}px`;
    this.container.style.left = `${left}px`;
    this.container.style.top = `${top}px`;

    // Draw background on canvas - use devicePixelRatio for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    this.canvasElement.width = canvasW * dpr;
    this.canvasElement.height = canvasH * dpr;

    if (this.ctx) {
      // Scale context so draw calls use CSS pixel coordinates
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.clearRect(0, 0, canvasW, canvasH);
      
      if (this.isMissing) {
        // ── PREMIERE PRO STYLE "MEDIA OFFLINE" GRAPHIC ──
        // 1. Red/Dark Red Diagonal Hazard Pattern Background
        this.ctx.fillStyle = "#7f1d1d";
        this.ctx.fillRect(0, 0, canvasW, canvasH);

        this.ctx.fillStyle = "#991b1b";
        const stripeWidth = 30 * scale;
        for (let x = -canvasH; x < canvasW + canvasH; x += stripeWidth * 2) {
          this.ctx.beginPath();
          this.ctx.moveTo(x, 0);
          this.ctx.lineTo(x + stripeWidth, 0);
          this.ctx.lineTo(x + stripeWidth - canvasH, canvasH);
          this.ctx.lineTo(x - canvasH, canvasH);
          this.ctx.closePath();
          this.ctx.fill();
        }

        // 2. Central Translucent Dark Card Overlay
        const cardW = Math.min(canvasW * 0.88, 420 * scale);
        const cardH = 160 * scale;
        const cardX = (canvasW - cardW) / 2;
        const cardY = (canvasH - cardH) / 2;

        this.ctx.fillStyle = "rgba(15, 23, 42, 0.94)";
        this.ctx.strokeStyle = "rgba(245, 158, 11, 0.7)";
        this.ctx.lineWidth = 2 * scale;
        
        const radius = 12 * scale;
        if (typeof (this.ctx as any).roundRect === "function") {
          this.ctx.beginPath();
          (this.ctx as any).roundRect(cardX, cardY, cardW, cardH, radius);
          this.ctx.fill();
          this.ctx.stroke();
        } else {
          this.ctx.fillRect(cardX, cardY, cardW, cardH);
          this.ctx.strokeRect(cardX, cardY, cardW, cardH);
        }

        // 3. Warning Icon & MEDIA OFFLINE Text
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";

        this.ctx.font = `900 ${Math.max(16, 22 * scale)}px sans-serif`;
        this.ctx.fillStyle = "#f59e0b";
        this.ctx.fillText("⚠️ MEDIA OFFLINE", canvasW / 2, cardY + 40 * scale);

        this.ctx.font = `500 ${Math.max(11, 13 * scale)}px sans-serif`;
        this.ctx.fillStyle = "#cbd5e1";
        const fname = (this.missingPath || "").split(/[/\\]/).pop() || "Missing File";
        this.ctx.fillText(`File: ${fname}`, canvasW / 2, cardY + 80 * scale);

        this.ctx.font = `600 ${Math.max(11, 12 * scale)}px sans-serif`;
        this.ctx.fillStyle = "#94a3b8";
        this.ctx.fillText("Click 'Relink Media' to locate file", canvasW / 2, cardY + 120 * scale);
      } else {
        // Background color
        this.ctx.fillStyle = project.background.color || "#000000";
        this.ctx.fillRect(0, 0, canvasW, canvasH);

        // Background image (if set)
        if (project.background.mode === "image" && project.background.image_path) {
          if (this.bgImagePath !== project.background.image_path) {
            this.bgImagePath = project.background.image_path;
            this.bgImage = new Image();
            this.bgImage.src = convertFileSrc(project.background.image_path);
            this.bgImage.onload = () => {
              this.drawCachedBackgroundImage(project, scale, canvasW, canvasH);
            };
          } else if (this.bgImage && this.bgImage.complete) {
            this.drawCachedBackgroundImage(project, scale, canvasW, canvasH);
          }
        }
      }
    }

    // Position Video Placement
    if (project.video_placement.enabled) {
      const vidX = project.video_placement.x * scale;
      const vidY = project.video_placement.y * scale;
      const vidW = project.video_placement.width * scale;
      const vidH = project.video_placement.height * scale;

      this.videoElement.style.left = `${vidX}px`;
      this.videoElement.style.top = `${vidY}px`;
      this.videoElement.style.width = `${vidW}px`;
      this.videoElement.style.height = `${vidH}px`;
      this.videoElement.style.objectFit = "fill";

      const rot = project.video_placement.rotation || 0;
      this.videoElement.style.transform = `rotate(${rot}deg)`;

      const cropT = (project.video_placement.crop_top || 0) * scale;
      const cropR = (project.video_placement.crop_right || 0) * scale;
      const cropB = (project.video_placement.crop_bottom || 0) * scale;
      const cropL = (project.video_placement.crop_left || 0) * scale;
      
      if (cropT > 0 || cropR > 0 || cropB > 0 || cropL > 0) {
        this.videoElement.style.clipPath = `inset(${cropT}px ${cropR}px ${cropB}px ${cropL}px)`;
      } else {
        this.videoElement.style.clipPath = "none";
      }
    } else {
      // Default: fit to canvas
      this.videoElement.style.left = "0px";
      this.videoElement.style.top = "0px";
      this.videoElement.style.width = "100%";
      this.videoElement.style.height = "100%";
      this.videoElement.style.objectFit = "contain";
    }
  }

  private drawCachedBackgroundImage(project: ProjectData, scale: number, cssW: number, cssH: number) {
    if (this.ctx && this.bgImage) {
      const imgX = (project.background.image_x || 0) * scale;
      const imgY = (project.background.image_y || 0) * scale;
      const imgW = (project.background.image_width && project.background.image_width > 0)
        ? project.background.image_width * scale
        : cssW;
      const imgH = (project.background.image_height && project.background.image_height > 0)
        ? project.background.image_height * scale
        : cssH;
      this.ctx.drawImage(this.bgImage, imgX, imgY, imgW, imgH);
    }
  }
}
