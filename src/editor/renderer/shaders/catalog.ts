import { PreviewImplementation, PreviewRenderContext, WebGLTextureInfo, PreviewRegistry } from "../../../types/effects/preview";

export class ShaderPreviewImplementation implements PreviewImplementation {
  protected program: WebGLProgram | null = null;
  protected fragmentSource: string;
  protected vertexShaderSource = `#version 300 es
    in vec2 a_position;
    in vec2 a_texCoord;
    out vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `;

  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private outputTexture: WebGLTexture | null = null;

  constructor(fragmentSource: string) {
    this.fragmentSource = fragmentSource;
  }

  public async initialize(ctx: PreviewRenderContext): Promise<void> {
    const gl = ctx.gl;
    if (this.program) return;

    const vs = this.compileShader(gl, gl.VERTEX_SHADER, this.vertexShaderSource);
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, this.fragmentSource);
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(`Shader Link Error: ${gl.getProgramInfoLog(this.program)}`);
    }

    const positions = new Float32Array([
      -1.0, -1.0,  1.0, -1.0, -1.0,  1.0,
      -1.0,  1.0,  1.0, -1.0,  1.0,  1.0
    ]);
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const texCoords = new Float32Array([
      0.0, 0.0,  1.0, 0.0,  0.0, 1.0,
      0.0, 1.0,  1.0, 0.0,  1.0, 1.0
    ]);
    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

    this.framebuffer = gl.createFramebuffer();
  }

  private compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(`Compile Error: ${gl.getShaderInfoLog(s)}`);
    }
    return s;
  }

  public bindParameters(_ctx: PreviewRenderContext, _parameters: Record<string, any>): void {
    // Override in subclass
  }

  protected bindUniforms(_gl: WebGL2RenderingContext, _width: number, _height: number): void {
    // Override in subclass
  }

  public render(ctx: PreviewRenderContext, input: WebGLTextureInfo): WebGLTextureInfo {
    const gl = ctx.gl;
    if (!this.program) {
      throw new Error("Program not initialized.");
    }

    if (!this.outputTexture) {
      this.outputTexture = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.outputTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, input.width, input.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.outputTexture, 0);

    gl.viewport(0, 0, input.width, input.height);
    gl.useProgram(this.program);

    // Bind subclass uniforms
    this.bindUniforms(gl, input.width, input.height);

    const posLoc = gl.getAttribLocation(this.program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texLoc = gl.getAttribLocation(this.program, "a_texCoord");
    gl.enableVertexAttribArray(texLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input.texture);
    const imgLoc = gl.getUniformLocation(this.program, "u_image");
    gl.uniform1i(imgLoc, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return {
      texture: this.outputTexture!,
      width: input.width,
      height: input.height
    };
  }

  public destroy(ctx: PreviewRenderContext): void {
    const gl = ctx.gl;
    if (this.program) gl.deleteProgram(this.program);
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    if (this.outputTexture) gl.deleteTexture(this.outputTexture);
    this.program = null;
    this.outputTexture = null;
  }
}

// 1. Brightness & Contrast Shader Implementation
class BrightnessContrastPreview extends ShaderPreviewImplementation {
  private brightness = 0.0;
  private contrast = 1.0;

  constructor() {
    super(`#version 300 es
      precision mediump float;
      in vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform float u_brightness;
      uniform float u_contrast;
      out vec4 outColor;

      void main() {
        vec4 color = texture(u_image, v_texCoord);
        vec3 rgb = (color.rgb - 0.5) * u_contrast + 0.5 + u_brightness;
        outColor = vec4(clamp(rgb, 0.0, 1.0), color.a);
      }
    `);
  }

  public bindParameters(_ctx: PreviewRenderContext, parameters: Record<string, any>): void {
    const bRaw = typeof parameters.brightness === "number" ? parameters.brightness : 0.0;
    this.brightness = bRaw * 0.01;
    this.contrast = typeof parameters.contrast === "number" ? parameters.contrast : 1.0;
  }

  protected bindUniforms(gl: WebGL2RenderingContext, _width: number, _height: number): void {
    gl.uniform1f(gl.getUniformLocation(this.program!, "u_brightness"), this.brightness);
    gl.uniform1f(gl.getUniformLocation(this.program!, "u_contrast"), this.contrast);
  }
}

// 2. Saturation Shader Implementation
class SaturationPreview extends ShaderPreviewImplementation {
  private saturation = 1.0;

  constructor() {
    super(`#version 300 es
      precision mediump float;
      in vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform float u_saturation;
      out vec4 outColor;

      void main() {
        vec4 color = texture(u_image, v_texCoord);
        float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        vec3 rgb = mix(vec3(luma), color.rgb, u_saturation);
        outColor = vec4(clamp(rgb, 0.0, 1.0), color.a);
      }
    `);
  }

  public bindParameters(_ctx: PreviewRenderContext, parameters: Record<string, any>): void {
    const sRaw = typeof parameters.saturation === "number" ? parameters.saturation : 100.0;
    this.saturation = sRaw * 0.01;
  }

  protected bindUniforms(gl: WebGL2RenderingContext, _width: number, _height: number): void {
    gl.uniform1f(gl.getUniformLocation(this.program!, "u_saturation"), this.saturation);
  }
}

// 3. Box Blur Shader Implementation
class BoxBlurPreview extends ShaderPreviewImplementation {
  private radius = 0.0;

  constructor() {
    super(`#version 300 es
      precision mediump float;
      in vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform float u_radius;
      uniform vec2 u_resolution;
      out vec4 outColor;

      void main() {
        if (u_radius <= 0.1) {
          outColor = texture(u_image, v_texCoord);
          return;
        }
        vec2 texelSize = 1.0 / u_resolution;
        vec4 sum = vec4(0.0);
        float total = 0.0;
        int r = int(u_radius);
        for (int x = -r; x <= r; x++) {
          for (int y = -r; y <= r; y++) {
            sum += texture(u_image, v_texCoord + vec2(x, y) * texelSize);
            total += 1.0;
          }
        }
        outColor = sum / total;
      }
    `);
  }

  public bindParameters(_ctx: PreviewRenderContext, parameters: Record<string, any>): void {
    this.radius = typeof parameters.radius === "number" ? parameters.radius : 0.0;
  }

  protected bindUniforms(gl: WebGL2RenderingContext, width: number, height: number): void {
    gl.uniform1f(gl.getUniformLocation(this.program!, "u_radius"), this.radius);
    gl.uniform2f(
      gl.getUniformLocation(this.program!, "u_resolution"),
      width,
      height
    );
  }
}

// 4. Opacity Shader Implementation
class OpacityPreview extends ShaderPreviewImplementation {
  private opacity = 1.0;

  constructor() {
    super(`#version 300 es
      precision mediump float;
      in vec2 v_texCoord;
      uniform sampler2D u_image;
      uniform float u_opacity;
      out vec4 outColor;

      void main() {
        vec4 color = texture(u_image, v_texCoord);
        outColor = vec4(color.rgb, color.a * u_opacity);
      }
    `);
  }

  public bindParameters(_ctx: PreviewRenderContext, parameters: Record<string, any>): void {
    const oRaw = typeof parameters.opacity === "number" ? parameters.opacity : 100.0;
    this.opacity = oRaw * 0.01;
  }

  protected bindUniforms(gl: WebGL2RenderingContext, _width: number, _height: number): void {
    gl.uniform1f(gl.getUniformLocation(this.program!, "u_opacity"), this.opacity);
  }
}

// Static Catalog Registry Bootstrapper
export function bootstrapPreviewShaders(): void {
  PreviewRegistry.registerPreview('brightness-contrast', new BrightnessContrastPreview());
  PreviewRegistry.registerPreview('saturation', new SaturationPreview());
  PreviewRegistry.registerPreview('box-blur', new BoxBlurPreview());
  PreviewRegistry.registerPreview('opacity', new OpacityPreview());
  console.log("WebGL 2.0 Effect Shaders Catalog successfully registered.");
}
