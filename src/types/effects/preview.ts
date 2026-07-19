export interface WebGLTextureInfo {
  texture: WebGLTexture;
  width: number;
  height: number;
}

export interface PreviewRenderContext {
  gl: WebGL2RenderingContext;
  currentTime: number;
  width: number;
  height: number;
}

export interface PreviewImplementation {
  // Pre-compiles GLSL shaders or registers CPU/AI configurations
  initialize(ctx: PreviewRenderContext): Promise<void>;
  
  // Set uniforms for target frame time
  bindParameters(ctx: PreviewRenderContext, parameters: Record<string, any>): void;
  
  // Execute pixel processing pass
  render(ctx: PreviewRenderContext, input: WebGLTextureInfo): WebGLTextureInfo;
  
  // Free buffers/resources on GPU
  destroy(ctx: PreviewRenderContext): void;
}

export class PreviewRegistry {
  private static implementations: Map<string, PreviewImplementation> = new Map();

  public static registerPreview(effectId: string, impl: PreviewImplementation): void {
    this.implementations.set(effectId, impl);
  }

  public static getPreview(effectId: string): PreviewImplementation | undefined {
    return this.implementations.get(effectId);
  }
}
