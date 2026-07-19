import { ProjectData } from "../types";
import { convertFileSrc } from "@tauri-apps/api/core";
import { WebGL2Renderer } from "./renderer/webgl2";
import { RenderGraph, DecodeNode, EffectNode } from "./renderer/graph";
import { RenderGraphOptimizer } from "./renderer/optimizer";

export class CanvasRenderer {
  private container: HTMLDivElement;
  private videoElement: HTMLVideoElement;
  private canvasElement: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private bgImage: HTMLImageElement | null = null;
  private bgImagePath: string = "";

  // WebGL 2.0 preview sandboxing elements
  private webglCanvasElement: HTMLCanvasElement;
  private webglRenderer: WebGL2Renderer | null = null;
  private renderGraph: RenderGraph | null = null;
  private webglEnabled = false;
  private project: ProjectData | null = null;
  private activeAssetId: string = "";
  private animationFrameId: number | null = null;

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

    // Create WebGL canvas
    this.webglCanvasElement = document.createElement("canvas");
    this.webglCanvasElement.className = "preview-webgl-canvas-element";
    this.webglCanvasElement.style.position = "absolute";
    this.webglCanvasElement.style.top = "0";
    this.webglCanvasElement.style.left = "0";
    this.webglCanvasElement.style.width = "100%";
    this.webglCanvasElement.style.height = "100%";
    this.webglCanvasElement.style.zIndex = "2"; // Placed above DOM overlay video elements
    this.webglCanvasElement.style.display = "none";

    this.container.appendChild(this.videoElement);
    this.container.appendChild(this.canvasElement);
    this.container.appendChild(this.webglCanvasElement);

    // Bind playhead changes to WebGL frame drawing when paused/scrubbed
    this.videoElement.addEventListener("timeupdate", () => {
      if (this.webglEnabled && this.videoElement.paused) {
        this.drawWebGLFrame();
      }
    });

    this.videoElement.addEventListener("seeked", () => {
      if (this.webglEnabled) {
        this.drawWebGLFrame();
      }
    });
  }

  setVideoSource(src: string, assetId?: string) {
    this.videoElement.src = src;
    this.videoElement.load();
    if (assetId) {
      this.activeAssetId = assetId;
    }
    
    this.videoElement.style.display = this.webglEnabled ? "none" : "block";
  }

  clearVideo() {
    this.stopWebGLRenderLoop();
    this.videoElement.pause();
    this.videoElement.removeAttribute("src");
    this.videoElement.load();
    this.videoElement.style.display = "none";
    this.activeAssetId = "";
  }

  play() {
    this.videoElement.play();
    if (this.webglEnabled) {
      this.startWebGLRenderLoop();
    }
  }

  pause() {
    this.videoElement.pause();
    this.stopWebGLRenderLoop();
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
    this.project = project;
    this.webglEnabled = project.enable_webgl_preview || false;

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

    if (this.webglEnabled) {
      // 1. WebGL 2.0 Rendering Path
      this.videoElement.style.display = "none";
      this.canvasElement.style.display = "none";
      this.webglCanvasElement.style.display = "block";

      this.webglCanvasElement.width = canvasW;
      this.webglCanvasElement.height = canvasH;

      if (!this.webglRenderer) {
        this.webglRenderer = new WebGL2Renderer();
        this.renderGraph = new RenderGraph();
        this.webglRenderer.initialize(this.webglCanvasElement).catch(err => {
          console.error("WebGL 2.0 initialization failed, falling back to legacy player.", err);
          this.webglEnabled = false;
          this.webglCanvasElement.style.display = "none";
          this.canvasElement.style.display = "block";
          this.videoElement.style.display = "block";
        });
      }

      this.drawWebGLFrame();
    } else {
      // 2. Legacy Renderer Path
      this.webglCanvasElement.style.display = "none";
      this.canvasElement.style.display = "block";

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

      this.videoElement.style.display = "block";
    }
  }

  private drawCachedBackgroundImage(project: ProjectData, scale: number) {
    if (this.ctx && this.bgImage) {
      const imgX = project.background.image_x * scale;
      const imgY = project.background.image_y * scale;
      const imgW = project.background.image_width * scale;
      const imgH = project.background.image_height * scale;
      this.ctx.drawImage(this.bgImage, imgX, imgY, imgW, imgH);
    }
  }

  private startWebGLRenderLoop() {
    if (this.animationFrameId) return;
    const loop = () => {
      this.drawWebGLFrame();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  private stopWebGLRenderLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private drawWebGLFrame() {
    if (!this.webglEnabled || !this.webglRenderer || !this.renderGraph || !this.project) return;

    const time = this.videoElement.currentTime;
    const activeEffects = this.project.asset_settings?.[this.activeAssetId]?.effects || [];

    // Rebuild Render Graph DAG at target playhead position
    this.renderGraph.clear();

    const decodeNode = new DecodeNode("video-source", this.videoElement);
    this.renderGraph.addNode(decodeNode);

    const effectNode = new EffectNode("effects-node", activeEffects);
    this.renderGraph.addNode(effectNode);

    const outputNode = new EffectNode("output", []);
    this.renderGraph.addNode(outputNode);

    this.renderGraph.connect("video-source", "effects-node");
    this.renderGraph.connect("effects-node", "output");
    this.renderGraph.setOutputNode("output");

    // Optimize and merge shaders
    RenderGraphOptimizer.optimize(this.renderGraph);

    // Execute shader evaluation draw pass
    this.webglRenderer.draw(time, this.renderGraph);
  }
}
