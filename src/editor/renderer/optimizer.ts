import { EffectState } from "../../types";
import { PreviewRenderContext, PreviewRegistry } from "../../types/effects/preview";
import { ShaderPreviewImplementation } from "./shaders/catalog";
import { RenderGraph, EffectNode } from "./graph";
import { AnimationEvaluator, AnimationTrack } from "../../types/animation/curves";

export class MergedEffectPreview extends ShaderPreviewImplementation {
  private activeEffects: EffectState[];
  private parameterKeys: string[] = [];

  constructor(effects: EffectState[]) {
    const source = MergedEffectPreview.generateMergedShaderSource(effects);
    super(source);
    this.activeEffects = effects;
  }

  private static generateMergedShaderSource(effects: EffectState[]): string {
    let uniforms = "";
    let body = "  vec4 color = texture(u_image, v_texCoord);\n  vec3 rgb = color.rgb;\n";

    for (let i = 0; i < effects.length; i++) {
      const effect = effects[i];
      if (!effect.enabled) continue;

      if (effect.effectId === "brightness-contrast") {
        uniforms += `  uniform float u_brightness_${i};\n  uniform float u_contrast_${i};\n`;
        body += `  rgb = (rgb - 0.5) * u_contrast_${i} + 0.5 + u_brightness_${i};\n`;
      } else if (effect.effectId === "saturation") {
        uniforms += `  uniform float u_saturation_${i};\n`;
        body += `  float luma_${i} = dot(rgb, vec3(0.299, 0.587, 0.114));\n`;
        body += `  rgb = mix(vec3(luma_${i}), rgb, u_saturation_${i});\n`;
      } else if (effect.effectId === "opacity") {
        uniforms += `  uniform float u_opacity_${i};\n`;
        body += `  color.a = color.a * u_opacity_${i};\n`;
      }
    }

    body += "  outColor = vec4(clamp(rgb, 0.0, 1.0), color.a);\n";

    return `#version 300 es
      precision mediump float;
      in vec2 v_texCoord;
      uniform sampler2D u_image;
${uniforms}
      out vec4 outColor;

      void main() {
${body}
      }
    `;
  }

  public bindParameters(ctx: PreviewRenderContext, _parameters: Record<string, any>): void {
    this.parameterKeys = [];
    for (let i = 0; i < this.activeEffects.length; i++) {
      const effect = this.activeEffects[i];
      if (!effect.enabled) continue;

      for (const [paramId, paramState] of Object.entries(effect.parameters)) {
        const track: AnimationTrack = {
          id: `${effect.effectId}_${paramId}_${i}`,
          parameterId: paramId,
          keyframes: paramState.points
        };
        const val = AnimationEvaluator.evaluate(track, ctx.currentTime);
        this.parameterKeys.push(`${paramId}_${i}##VAL##${val}`);
      }
    }
  }

  protected bindUniforms(gl: WebGL2RenderingContext, _width: number, _height: number): void {
    for (const keyVal of this.parameterKeys) {
      const parts = keyVal.split("##VAL##");
      const key = parts[0];
      const val = parseFloat(parts[1]);

      if (key.startsWith("brightness_")) {
        gl.uniform1f(gl.getUniformLocation(this.program!, `u_${key}`), val * 0.01);
      } else if (key.startsWith("contrast_")) {
        gl.uniform1f(gl.getUniformLocation(this.program!, `u_${key}`), val);
      } else if (key.startsWith("saturation_")) {
        gl.uniform1f(gl.getUniformLocation(this.program!, `u_${key}`), val * 0.01);
      } else if (key.startsWith("opacity_")) {
        gl.uniform1f(gl.getUniformLocation(this.program!, `u_${key}`), val * 0.01);
      }
    }
  }
}

export class RenderGraphOptimizer {
  /**
   * Compiles contiguous mergeable pixel manipulation effect passes into a single ShaderProgram.
   */
  public static optimize(graph: RenderGraph): void {
    const root = graph.getOutputNode();
    if (!root) return;

    const sorted = graph.topologicalSort();
    for (const node of sorted) {
      if (node instanceof EffectNode) {
        const mergeable: EffectState[] = [];
        const unmergeable: EffectState[] = [];

        for (const effect of node.effectsStack) {
          if (effect.enabled && effect.effectId !== "box-blur") {
            mergeable.push(effect);
          } else {
            unmergeable.push(effect);
          }
        }

        if (mergeable.length > 1) {
          const mergedEffectId = `merged_${mergeable.map(m => m.effectId).join("_")}`;
          const optimizedStack: EffectState[] = [];
          
          const mergedState: EffectState = {
            effectId: mergedEffectId,
            enabled: true,
            parameters: {}
          };
          
          for (const m of mergeable) {
            for (const [pId, pState] of Object.entries(m.parameters)) {
              mergedState.parameters[`${pId}`] = pState;
            }
          }

          if (!PreviewRegistry.getPreview(mergedEffectId)) {
            PreviewRegistry.registerPreview(mergedEffectId, new MergedEffectPreview(mergeable));
          }

          optimizedStack.push(mergedState);
          optimizedStack.push(...unmergeable);
          node.effectsStack = optimizedStack;
        }
      }
    }
  }
}
