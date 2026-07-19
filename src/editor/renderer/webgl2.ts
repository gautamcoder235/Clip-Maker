import { RendererInterface } from "./interface";
import { RenderGraph } from "./graph";
import { GPUResourceManager, FrameCache } from "./resources";
import { PreviewRenderContext, WebGLTextureInfo } from "../../types/effects/preview";

export class WebGL2Renderer implements RendererInterface {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private resourceManager: GPUResourceManager | null = null;
  private frameCache: FrameCache | null = null;

  // Vertex buffer structures
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;

  // Pass-through shaders
  private passThroughProgram: WebGLProgram | null = null;

  private isContextLost = false;

  private static VERTEX_SHADER_SOURCE = `#version 300 es
    in vec2 a_position;
    in vec2 a_texCoord;
    out vec2 v_texCoord;

    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `;

  private static FRAGMENT_SHADER_SOURCE = `#version 300 es
    precision mediump float;
    in vec2 v_texCoord;
    uniform sampler2D u_image;
    out vec4 outColor;

    void main() {
      outColor = texture(u_image, v_texCoord);
    }
  `;

  public async initialize(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance"
    });

    if (!gl) {
      throw new Error("WebGL 2.0 context is not supported by this browser.");
    }

    this.gl = gl;
    this.resourceManager = new GPUResourceManager(gl);
    this.frameCache = new FrameCache(gl, this.resourceManager);

    // Context loss handlers
    canvas.addEventListener("webglcontextlost", this.handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored, false);

    this.setupBuffers();
    this.setupPassThroughProgram();
  }

  private setupBuffers(): void {
    const gl = this.gl!;

    // 2D Quad positions: covers entire viewport clip space [-1, 1]
    const positions = new Float32Array([
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
       1.0, -1.0,
       1.0,  1.0
    ]);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    // Texture coordinates corresponding to the quad vertices: flips Y for WebGL orientation
    const texCoords = new Float32Array([
      0.0, 0.0,
      1.0, 0.0,
      0.0, 1.0,
      0.0, 1.0,
      1.0, 0.0,
      1.0, 1.0
    ]);

    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
  }

  private setupPassThroughProgram(): void {
    if (!this.resourceManager) return;
    this.passThroughProgram = this.resourceManager.getProgram(
      WebGL2Renderer.VERTEX_SHADER_SOURCE,
      WebGL2Renderer.FRAGMENT_SHADER_SOURCE
    );
  }

  public createTexture(width: number, height: number, data?: TexImageSource): WebGLTextureInfo {
    if (!this.gl || !this.resourceManager) {
      throw new Error("Renderer not initialized.");
    }
    const texture = this.resourceManager.acquireTexture(width, height);
    
    if (data) {
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, data);
    }
    
    return { texture, width, height };
  }

  public deleteTexture(texture: WebGLTexture): void {
    // Release immediately back to manager for recycling
    this.gl?.deleteTexture(texture);
  }

  public compileShader(_id: string, fragmentSource: string): WebGLProgram {
    if (!this.resourceManager) {
      throw new Error("Renderer not initialized.");
    }
    return this.resourceManager.getProgram(WebGL2Renderer.VERTEX_SHADER_SOURCE, fragmentSource);
  }

  public draw(time: number, renderGraph: RenderGraph): void {
    if (!this.gl || !this.canvas || this.isContextLost) return;
    const gl = this.gl;

    // Check if the output frame is already in cache
    const cachedFrame = this.frameCache?.getFrame(time);
    let outputTextureInfo: WebGLTextureInfo | null = null;

    if (cachedFrame) {
      outputTextureInfo = cachedFrame;
    } else {
      // Evaluate Render Graph DAG topological order
      const sortedNodes = renderGraph.topologicalSort();
      const ctx: PreviewRenderContext = {
        gl,
        currentTime: time,
        width: this.canvas.width,
        height: this.canvas.height
      };

      for (const node of sortedNodes) {
        // Evaluate each node sequentially
        node.execute(ctx).then(texInfo => {
          if (node.id === renderGraph.getOutputNode()?.id) {
            outputTextureInfo = texInfo;
            // Write completed result into Frame Cache
            this.frameCache?.putFrame(time, texInfo);
            this.renderToScreen(texInfo);
          }
        }).catch(err => {
          console.error(`Error rendering node ${node.id} in DAG:`, err);
        });
      }
    }

    if (outputTextureInfo) {
      this.renderToScreen(outputTextureInfo);
    }
  }

  private renderToScreen(texInfo: WebGLTextureInfo): void {
    const gl = this.gl!;
    const canvas = this.canvas!;

    // Bind visible viewport screen framebuffer (null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.passThroughProgram!);

    // Bind texture coordinates attributes
    const posLoc = gl.getAttribLocation(this.passThroughProgram!, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texLoc = gl.getAttribLocation(this.passThroughProgram!, "a_texCoord");
    gl.enableVertexAttribArray(texLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    // Bind output texture uniform
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texInfo.texture);
    const imgLoc = gl.getUniformLocation(this.passThroughProgram!, "u_image");
    gl.uniform1i(imgLoc, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // --- Context Loss Listeners ---

  private handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.isContextLost = true;
    console.warn("WebGL 2.0 context lost. Clearing resources...");
    
    this.frameCache?.clear();
    this.resourceManager?.destroy();

    this.positionBuffer = null;
    this.texCoordBuffer = null;
    this.passThroughProgram = null;
  };

  private handleContextRestored = (): void => {
    this.isContextLost = false;
    console.log("WebGL 2.0 context restored. Re-compiling...");
    
    if (this.gl && this.canvas) {
      this.resourceManager = new GPUResourceManager(this.gl);
      this.frameCache = new FrameCache(this.gl, this.resourceManager);
      this.setupBuffers();
      this.setupPassThroughProgram();
    }
  };

  public destroy(): void {
    if (this.canvas) {
      this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
      this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    }
    
    this.frameCache?.clear();
    this.resourceManager?.destroy();
    
    if (this.gl) {
      if (this.positionBuffer) this.gl.deleteBuffer(this.positionBuffer);
      if (this.texCoordBuffer) this.gl.deleteBuffer(this.texCoordBuffer);
    }
  }
}
