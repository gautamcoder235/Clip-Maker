import { ProjectData } from "../types";
import { convertFileSrc } from "@tauri-apps/api/core";

export class CanvasRenderer {
  private container: HTMLDivElement;
  private videoElement: HTMLVideoElement;
  private canvasElement: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
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

  setVideoSource(src: string) {
    this.videoElement.src = src;
    this.videoElement.load();
    this.videoElement.style.display = "block";
  }

  clearVideo() {
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

    // Draw background on canvas
    this.canvasElement.width = canvasW;
    this.canvasElement.height = canvasH;

    if (this.ctx) {
      this.ctx.clearRect(0, 0, canvasW, canvasH);
      
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
            this.drawCachedBackgroundImage(project, scale);
          };
        } else if (this.bgImage && this.bgImage.complete) {
          this.drawCachedBackgroundImage(project, scale);
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
      this.videoElement.style.objectFit = "cover";
    } else {
      // Default: fit to canvas
      this.videoElement.style.left = "0px";
      this.videoElement.style.top = "0px";
      this.videoElement.style.width = "100%";
      this.videoElement.style.height = "100%";
      this.videoElement.style.objectFit = "contain";
    }
  }

  private drawCachedBackgroundImage(project: ProjectData, scale: number) {
    if (this.ctx && this.bgImage) {
      const imgX = (project.background.image_x || 0) * scale;
      const imgY = (project.background.image_y || 0) * scale;
      const imgW = (project.background.image_width && project.background.image_width > 0)
        ? project.background.image_width * scale
        : this.canvasElement.width;
      const imgH = (project.background.image_height && project.background.image_height > 0)
        ? project.background.image_height * scale
        : this.canvasElement.height;
      this.ctx.drawImage(this.bgImage, imgX, imgY, imgW, imgH);
    }
  }
}
