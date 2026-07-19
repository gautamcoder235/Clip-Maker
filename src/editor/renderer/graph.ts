import { EffectState } from "../../types";
import { PreviewRenderContext, WebGLTextureInfo, PreviewRegistry } from "../../types/effects/preview";
import { AnimationEvaluator, AnimationTrack } from "../../types/animation/curves";

export abstract class RenderNode {
  public id: string;
  public inputs: RenderNode[] = [];
  public isDirty: boolean = true;
  protected cachedTexture: WebGLTextureInfo | null = null;

  constructor(id: string) {
    this.id = id;
  }

  public abstract execute(ctx: PreviewRenderContext): Promise<WebGLTextureInfo>;

  public hasCachedTexture(): boolean {
    return this.cachedTexture !== null;
  }

  public getCachedTexture(): WebGLTextureInfo | null {
    return this.cachedTexture;
  }

  public setDirty(dirty: boolean): void {
    this.isDirty = dirty;
    if (dirty) {
      // Propagate dirty state downstream
    }
  }

  public reset(): void {
    this.isDirty = true;
    this.cachedTexture = null;
  }
}

// 1. Decode Node: Decodes video frames or load images to GPU texture
export class DecodeNode extends RenderNode {
  private mediaSource: HTMLVideoElement | HTMLImageElement;
  private currentTexture: WebGLTexture | null = null;

  constructor(id: string, mediaSource: HTMLVideoElement | HTMLImageElement) {
    super(id);
    this.mediaSource = mediaSource;
  }

  public async execute(ctx: PreviewRenderContext): Promise<WebGLTextureInfo> {
    const gl = ctx.gl;
    
    // Allocate texture if not created
    if (!this.currentTexture) {
      this.currentTexture = gl.createTexture();
    }
    
    gl.bindTexture(gl.TEXTURE_2D, this.currentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    // Upload current video frame / image to texture
    let width = 1080;
    let height = 1920;
    
    if (this.mediaSource instanceof HTMLVideoElement) {
      width = this.mediaSource.videoWidth || 1080;
      height = this.mediaSource.videoHeight || 1920;
      if (width > 0 && height > 0) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.mediaSource);
      }
    } else {
      width = this.mediaSource.naturalWidth || 1080;
      height = this.mediaSource.naturalHeight || 1920;
      if (width > 0 && height > 0) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.mediaSource);
      }
    }

    this.cachedTexture = {
      texture: this.currentTexture!,
      width,
      height
    };
    this.isDirty = false;
    return this.cachedTexture;
  }

  public reset(): void {
    super.reset();
    // Do not delete the texture immediately to avoid allocation stalls
  }
}

// 2. Effect Node: Processes a reorderable list of active filters
export class EffectNode extends RenderNode {
  public effectsStack: EffectState[] = [];

  constructor(id: string, initialEffects: EffectState[] = []) {
    super(id);
    this.effectsStack = [...initialEffects];
  }

  public async execute(ctx: PreviewRenderContext): Promise<WebGLTextureInfo> {
    if (this.inputs.length === 0) {
      throw new Error(`EffectNode ${this.id} has no input texture connection.`);
    }

    // Resolve parent input texture
    let currentTextureInfo = await this.inputs[0].execute(ctx);

    if (this.effectsStack.length === 0) {
      this.cachedTexture = currentTextureInfo;
      this.isDirty = false;
      return currentTextureInfo;
    }

    // Loop through effects in reorderable execution stack
    for (const effect of this.effectsStack) {
      if (!effect.enabled) continue;

      const previewImpl = PreviewRegistry.getPreview(effect.effectId);
      if (previewImpl) {
        // Initialize implementation once if needed
        await previewImpl.initialize(ctx);

        // Evaluate parameter keyframes at target frame time
        const evaluatedParams: Record<string, any> = {};
        for (const [paramId, paramState] of Object.entries(effect.parameters)) {
          // Construct AnimationTrack shape from parameterState
          const track: AnimationTrack = {
            id: `${effect.effectId}_${paramId}`,
            parameterId: paramId,
            keyframes: paramState.points
          };
          evaluatedParams[paramId] = AnimationEvaluator.evaluate(track, ctx.currentTime);
        }

        // Bind uniform parameters
        previewImpl.bindParameters(ctx, evaluatedParams);

        // Render pass
        currentTextureInfo = previewImpl.render(ctx, currentTextureInfo);
      }
    }

    this.cachedTexture = currentTextureInfo;
    this.isDirty = false;
    return this.cachedTexture;
  }
}

// 3. Render Graph (DAG Coordinator)
export class RenderGraph {
  private nodes: Map<string, RenderNode> = new Map();
  private outputNodeId: string = "output";

  public addNode(node: RenderNode): void {
    this.nodes.set(node.id, node);
  }

  public getNode(id: string): RenderNode | undefined {
    return this.nodes.get(id);
  }

  public connect(fromId: string, toId: string): void {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);
    if (!fromNode || !toNode) {
      throw new Error(`Failed to connect nodes: ${fromId} -> ${toId}. Node not found.`);
    }
    toNode.inputs.push(fromNode);
  }

  public setOutputNode(id: string): void {
    this.outputNodeId = id;
  }

  public getOutputNode(): RenderNode | undefined {
    return this.nodes.get(this.outputNodeId);
  }

  public clear(): void {
    for (const node of this.nodes.values()) {
      node.reset();
    }
    this.nodes.clear();
  }

  /**
   * Performs a topological sort of the DAG starting from output node downstream inputs
   */
  public topologicalSort(): RenderNode[] {
    const visited = new Set<string>();
    const stack: RenderNode[] = [];

    const visit = (node: RenderNode) => {
      if (visited.has(node.id)) return;
      visited.add(node.id);
      
      for (const input of node.inputs) {
        visit(input);
      }
      stack.push(node);
    };

    const root = this.getOutputNode();
    if (root) {
      visit(root);
    }

    return stack;
  }
}
