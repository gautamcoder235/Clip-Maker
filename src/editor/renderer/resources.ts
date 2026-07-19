import { WebGLTextureInfo } from "../../types/effects/preview";

export class GPUResourceManager {
  private gl: WebGL2RenderingContext;
  private texturePool: Map<string, WebGLTexture[]> = new Map();
  private framebufferPool: WebGLFramebuffer[] = [];
  private programCache: Map<string, WebGLProgram> = new Map();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /**
   * Acquire a texture of specified dimensions from the pool, or allocate a new one.
   */
  public acquireTexture(width: number, height: number): WebGLTexture {
    const key = `${width}_${height}`;
    let list = this.texturePool.get(key);
    
    if (list && list.length > 0) {
      return list.pop()!;
    }
    
    // Allocate new texture if pool is empty
    const texture = this.gl.createTexture();
    if (!texture) {
      throw new Error(`Failed to allocate GPU texture for dimensions: ${width}x${height}`);
    }
    
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      width,
      height,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      null
    );
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    
    return texture;
  }

  /**
   * Return a texture to the pool for reuse.
   */
  public releaseTexture(width: number, height: number, texture: WebGLTexture): void {
    const key = `${width}_${height}`;
    if (!this.texturePool.has(key)) {
      this.texturePool.set(key, []);
    }
    this.texturePool.get(key)!.push(texture);
  }

  /**
   * Acquire a framebuffer from the pool, or allocate a new one.
   */
  public acquireFramebuffer(): WebGLFramebuffer {
    if (this.framebufferPool.length > 0) {
      return this.framebufferPool.pop()!;
    }
    
    const fb = this.gl.createFramebuffer();
    if (!fb) {
      throw new Error("Failed to allocate WebGL framebuffer.");
    }
    return fb;
  }

  /**
   * Return a framebuffer to the pool for reuse.
   */
  public releaseFramebuffer(fb: WebGLFramebuffer): void {
    this.framebufferPool.push(fb);
  }

  /**
   * Retrieve a compiled and linked shader program from cache, or compile a new one.
   */
  public getProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
    const cacheKey = `${vertexSource}##SPLIT##${fragmentSource}`;
    if (this.programCache.has(cacheKey)) {
      return this.programCache.get(cacheKey)!;
    }

    const program = this.createShaderProgram(vertexSource, fragmentSource);
    this.programCache.set(cacheKey, program);
    return program;
  }

  private createShaderProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
    const gl = this.gl;
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

    const program = gl.createProgram();
    if (!program) {
      throw new Error("Failed to create WebGL Program.");
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      throw new Error(`Shader Link Error: ${log}`);
    }

    // Shaders can be detached and deleted after linking
    gl.detachShader(program, vertexShader);
    gl.detachShader(program, fragmentShader);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    return program;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) {
      throw new Error(`Failed to create shader of type: ${type}`);
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader Compile Error (Type: ${type}): ${log}`);
    }

    return shader;
  }

  /**
   * Flush and release all cached and pooled GPU resources.
   */
  public destroy(): void {
    const gl = this.gl;

    // Delete textures
    for (const textures of this.texturePool.values()) {
      for (const tex of textures) {
        gl.deleteTexture(tex);
      }
    }
    this.texturePool.clear();

    // Delete framebuffers
    for (const fb of this.framebufferPool) {
      gl.deleteFramebuffer(fb);
    }
    this.framebufferPool = [];

    // Delete shader programs
    for (const program of this.programCache.values()) {
      gl.deleteProgram(program);
    }
    this.programCache.clear();
  }
}

export interface CachedFrame {
  time: number;
  textureInfo: WebGLTextureInfo;
  accessCount: number;
}

export class FrameCache {
  private gl: WebGL2RenderingContext;
  private resourceManager: GPUResourceManager;
  private cache: Map<number, CachedFrame> = new Map();
  private maxCacheSize = 30; // Max number of textures stored in RAM/VRAM

  constructor(gl: WebGL2RenderingContext, resourceManager: GPUResourceManager) {
    this.gl = gl;
    this.resourceManager = resourceManager;
  }

  /**
   * Fetch a cached texture for target frame timestamp
   */
  public getFrame(time: number, thresholdMs = 15): WebGLTextureInfo | null {
    // Find closest frame within the threshold (e.g. 15ms threshold at 60 FPS)
    for (const cached of this.cache.values()) {
      if (Math.abs(cached.time - time) * 1000 <= thresholdMs) {
        cached.accessCount++;
        return cached.textureInfo;
      }
    }
    return null;
  }

  /**
   * Cache a processed texture frame
   */
  public putFrame(time: number, textureInfo: WebGLTextureInfo): void {
    // If already cached, bypass
    if (this.getFrame(time) !== null) return;

    // LRU Eviction if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLeastRecentlyUsed();
    }

    // Copy texture to cache (since the source texture will be recycled by renderer)
    const cachedTex = this.resourceManager.acquireTexture(textureInfo.width, textureInfo.height);
    this.copyTexture(textureInfo.texture, cachedTex, textureInfo.width, textureInfo.height);

    this.cache.set(time, {
      time,
      textureInfo: {
        texture: cachedTex,
        width: textureInfo.width,
        height: textureInfo.height
      },
      accessCount: 1
    });
  }

  private evictLeastRecentlyUsed(): void {
    let lruTime = -1;
    let lruAccess = Infinity;
    
    for (const [time, frame] of this.cache.entries()) {
      if (frame.accessCount < lruAccess) {
        lruAccess = frame.accessCount;
        lruTime = time;
      }
    }
    
    if (lruTime !== -1) {
      const evicted = this.cache.get(lruTime)!;
      this.resourceManager.releaseTexture(
        evicted.textureInfo.width,
        evicted.textureInfo.height,
        evicted.textureInfo.texture
      );
      this.cache.delete(lruTime);
    }
  }

  private copyTexture(srcTex: WebGLTexture, destTex: WebGLTexture, width: number, height: number): void {
    const gl = this.gl;
    const fb = this.resourceManager.acquireFramebuffer();

    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, srcTex, 0);

    gl.bindTexture(gl.TEXTURE_2D, destTex);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, width, height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.resourceManager.releaseFramebuffer(fb);
  }

  public clear(): void {
    for (const frame of this.cache.values()) {
      this.resourceManager.releaseTexture(
        frame.textureInfo.width,
        frame.textureInfo.height,
        frame.textureInfo.texture
      );
    }
    this.cache.clear();
  }
}
