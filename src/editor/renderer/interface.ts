import { RenderGraph } from "./graph";
import { WebGLTextureInfo } from "../../types/effects/preview";

export interface RendererInterface {
  initialize(canvas: HTMLCanvasElement): Promise<void>;
  createTexture(width: number, height: number, data?: TexImageSource): WebGLTextureInfo;
  deleteTexture(texture: WebGLTexture): void;
  compileShader(_id: string, fragmentSource: string): WebGLProgram;
  draw(time: number, renderGraph: RenderGraph): void;
  destroy(): void;
}
