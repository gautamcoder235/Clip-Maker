# A Data-Driven, GPU-Accelerated Video Effects Architecture for Clip Maker

This architectural document outlines a production-grade video and image effects system for **Clip Maker**. Drawing contrast with legacy, C++-centric desktop structures (like OpenShot), this blueprint proposes a modern, decoupled architecture optimized for **Tauri, Rust, WebGL, and FFmpeg**.

---

## 1. Architectural Core: Why OpenShot's OOP Paradigm is an Anti-Pattern for Tauri

OpenShot's engine (`libopenshot`) relies on a monolithic C++ class hierarchy where each effect implements its own frame-rendering loop (`GetFrame`) and manages its own keyframes. 

For **Clip Maker** (which uses a web-based frontend and a Rust/FFmpeg command-line backend), replicating this architecture introduces severe maintenance and performance bottlenecks:
1.  **Duplicate Rendering Code:** Implementing pixel-manipulation filters once in C++/Rust for export, and again in JavaScript/WebGL for live UI previews.
2.  **State Pollution:** Storing raw FFmpeg command fragments (e.g., `"eq=brightness=0.2"`) in project database files, which breaks compatibility when migrating render backends or changing shader implementations.
3.  **Animation Overhead:** Hardcoding animation interpolation inside every individual effect rather than abstracting keyframes.

### Proposed Paradigm: The Data-Driven Registry
Instead of defining effects as rigid classes containing execution code, Clip Maker represents effects as **pure data configurations**. An **Effect Registry** describes the metadata, parameters, UI schemas, shader templates, and FFmpeg filter conversions, while separate specialized execution engines handle preview and export.

```
                  ┌──────────────────────┐
                  │ Project/Effect State │
                  └──────────┬───────────┘
                             │ (Pure Data JSON)
                             ▼
             ┌───────────────────────────────┐
             │    Data-Driven Registry       │
             └───────────────┬───────────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
┌──────────────────────┐           ┌──────────────────────┐
│  GPU Preview Engine  │           │ Export Engine (Rust) │
│ (WebGL/WebGPU GLSL)  │           │ (FFmpeg Filter Graph)│
└──────────────────────┘           └──────────────────────┘
```

---

## 2. Decoupled Multi-Layer Architecture

Clip Maker divides the effects pipeline into four isolated layers to guarantee real-time UI response (60 FPS previews) and decoupled media generation.

```
┌────────────────────────────────────────────────────────┐
│ 1. Frontend UI Layer (React/TypeScript)               │
│    - Renders dynamically generated sliders and knobs.   │
│    - Manipulates state parameters (does not write code)│
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. State & Serialization Layer (JSON)                 │
│    - Stores parameters as key-value configurations.   │
│    - Coordinates undo/redo stack & project persistence.│
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌──────────────────────────┴─────────────────────────────┐
│ 3. Core Preview Engine (GPU - WebGL/WebGPU)            │
│    - Binds video frames to GPU textures in real-time.  │
│    - Combines active GLSL fragment shaders in a stack. │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 4. Core Export Engine (CLI - FFmpeg avfilter)          │
│    - Reads State JSON at export time.                  │
│    - Generates optimized -vf commands for encoding.    │
└────────────────────────────────────────────────────────┘
```

---

## 3. Data-Driven Registry Schema

The system relies on a single source of truth describing what effects exist, their metadata, parameters, and targets.

### TypeScript Definition (`src/types/effects.ts`)
```typescript
export type ParameterType = 'number' | 'boolean' | 'color' | 'string' | 'lut';

export interface KeyframePoint {
  time: number; // Seconds relative to clip start
  value: number | string | boolean;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'bezier';
}

export interface KeyframeTrack {
  parameterId: string;
  points: KeyframePoint[];
}

export interface EffectParameter {
  id: string;
  name: string;
  type: ParameterType;
  defaultValue: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  supportsKeyframes: boolean;
}

export interface EffectDefinition {
  id: string;
  displayName: string;
  category: 'transform' | 'color' | 'blur' | 'sharpen' | 'stylize' | 'distortion' | 'keying' | 'lighting' | 'utility';
  icon: string;
  parameters: EffectParameter[];
  gpuShaderId: string;         // Maps to WebGL shader source
  ffmpegFilterTemplate: string; // Dynamic builder key (e.g. "eq", "boxblur")
  gpuOnly?: boolean;
  exportOnly?: boolean;
  priority: number;            // Forces strict rendering order (e.g. Crop before Blur)
}
```

### JSON Project File State Representation (No Raw Strings)
The file representation does not record FFmpeg strings. It stores structured variables:
```json
{
  "clipId": "clip-939a-1123",
  "effects": [
    {
      "effectId": "brightness-contrast",
      "enabled": true,
      "parameters": {
        "brightness": {
          "parameterId": "brightness",
          "points": [
            { "time": 0.0, "value": 10.0, "easing": "linear" },
            { "time": 2.5, "value": 45.0, "easing": "ease-out" }
          ]
        },
        "contrast": {
          "parameterId": "contrast",
          "points": [
            { "time": 0.0, "value": 1.1, "easing": "linear" }
          ]
        }
      }
    },
    {
      "effectId": "box-blur",
      "enabled": true,
      "parameters": {
        "radius": {
          "parameterId": "radius",
          "points": [
            { "time": 0.0, "value": 5, "easing": "linear" }
          ]
        }
      }
    }
  ]
}
```

---

## 4. Production-Grade Effect Categories

Effects are divided into semantic priority brackets. This ordering governs both UI listings and the logical render pipeline.

```
┌────────────────────────────────────────────────────────┐
│                     EFFECT GROUPS                      │
├─────────────┬─────────────┬──────────────┬─────────────┤
│  Transform  │    Color    │     Blur     │   Sharpen   │
├─────────────┼─────────────┼──────────────┼─────────────┤
│   Stylize   │  Distortion │    Keying    │  Lighting   │
└─────────────┴─────────────┴──────────────┴─────────────┘
```

1.  **Transform:** `Crop` | `Scale` | `Rotate` | `Perspective` | `Mirror` | `Flip`
2.  **Color:** `Brightness` | `Contrast` | `Exposure` | `Gamma` | `Temperature` | `Tint` | `Hue` | `Saturation` | `Vibrance` | `Curves` | `Levels` | `LUT (.cube)`
3.  **Blur:** `Gaussian` | `Box` | `Lens Blur` | `Directional` | `Zoom Blur` | `Motion Blur` | `Radial`
4.  **Sharpen:** `Unsharp Mask` | `Sharpen` | `Edge Enhance`
5.  **Stylize:** `Film Grain` | `Noise` | `Pixelate` | `Oil Paint` | `Sketch` | `Posterize` | `Halftone` | `Glitch` | `Bloom` | `Glow` | `Vignette`
6.  **Distortion:** `Wave` | `Ripple` | `Bulge` | `Fisheye` | `Twirl` | `Pinch`
7.  **Keying:** `Chroma Key` | `Luma Key` | `Color Key` | `Mask` | `Alpha`
8.  **Lighting:** `Shadow` | `Inner Shadow` | `Outline` | `Reflection`
9.  **Utility:** `Opacity` | `Invert` | `Threshold` | `Channel Mixer` | `Color Replace`

---

## 5. Parameter Easing and Animation Engine

Instead of implementing custom mathematical keyframe interpolation inside each individual effect, the interpolation logic is completely abstracted:

```
[Renderer Request] ────► [Animation Engine] ────► [KeyframeTrack]
                                                        │
   Gets Parameter ◄─────────────────────────────────────┘
  Interpolated Value
```

1.  Each parameter in an effect maps to a `KeyframeTrack` containing timestamped values.
2.  The rendering loop (both Live WebGL and Export FFMpeg) queries values through an evaluation function:
    \[V_t = \text{evaluate\_track\_value}(track, t)\]
3.  Easing algorithms (Linear, Easing, Bezier curves) are calculated globally within the animation engine module. The individual effect remains oblivious to whether the values it receives are animated or static.

---

## 6. Dual-Engine Rendering Pipelines

### A. Preview Engine (WebGL Shader Stack)
During live editing, the video stream feeds into GPU textures. Active effects are translated into a chain of Fragment Shaders:

```
Video Frame ──► GPU Texture ──► [Shader A (Color)] ──► [Shader B (Blur)] ──► Canvas
```

#### Fragment Shader Pipeline Interface (`src/editor/shaders/pipeline.ts`)
```typescript
export interface ShaderEffect {
  compile(gl: WebGLRenderingContext): void;
  setUniforms(gl: WebGLRenderingContext, time: number, parameters: Record<string, any>): void;
  bindTexture(gl: WebGLRenderingContext, texture: WebGLTexture): void;
}
```

Using this setup, sliding a brightness controls immediately updates WebGL uniforms. The UI runs consistently at 60 FPS without writing files or calling FFmpeg commands.

### B. Export Engine (FFmpeg Command Builder)
When the user triggers a "Render/Export" request:
1.  The Tauri Rust backend deserializes the JSON state containing the parameter records.
2.  The Rust backend requests the value of each parameter at coordinate keyframes (or maps them direct if static).
3.  The parameters are fed into an optimized FFmpeg filter chain builder (`builder.rs`).

#### FFmpeg Mapping Example (Rust Serialization mapping)
```rust
// src-tauri/src/ffmpeg/effects_mapper.rs

pub fn build_ffmpeg_filter_chain(effects: &[EffectState], clip_time: f64) -> String {
    let mut filters = Vec::new();

    // Loop through effects sorted strictly by priority
    for effect in sorted_by_priority(effects) {
        if !effect.enabled { continue; }

        match effect.id.as_str() {
            "brightness-contrast" => {
                let b = effect.evaluate_param("brightness", clip_time).as_float() / 100.0; // scale to [-1.0, 1.0]
                let c = effect.evaluate_param("contrast", clip_time).as_float();
                filters.push(format!("eq=brightness={}:contrast={}", b, c));
            },
            "box-blur" => {
                let r = effect.evaluate_param("radius", clip_time).as_int();
                filters.push(format!("boxblur={}", r));
            },
            "vignette" => {
                let s = effect.evaluate_param("strength", clip_time).as_float();
                filters.push(format!("vignette=angle={}", s));
            },
            _ => {}
        }
    }

    filters.join(",")
}
```

---

## 7. Next-Generation AI Pipeline Architecture

Advanced features like **AI background removal, face smoothing, and motion tracking** do not fit nicely into a standard WebGL shader stack or basic FFmpeg command parameters.

Clip Maker structures these as **AI Pipeline Processors** that isolate frame execution:

```
[Source Video] ────► [AI Inference Buffer] ────► [FFmpeg Render Node]
                       (WebNN / ONNX / CPU)        (Composition)
```

1.  **Direct Frame Capture:** Decodes specific frames to raw arrays.
2.  **Inference Pass:** Passes frame buffers sequentially through a Rust-based model execution thread (e.g., using `tract` or `onnxruntime` bindings) or via a browser-level WebNN/WebGPU execution pipeline.
3.  **Result Overlay:** Pipes the processed mask or track coordinate vectors back into the main preview/export loop.

---

## 8. Prioritized Implementation Roadmap for Clip Maker

Implementing all effects at once leads to high code churn. Clip Maker will adopt a three-tiered release schedule:

### Tier 1 (Essential) - High Priority
*   **Transform:** Crop, Scale, Rotate, Opacity.
*   **Color Adjustment:** Brightness, Contrast, Saturation, Gamma, Exposure, Vignette.
*   **Blur & Sharpness:** Box Blur, Gaussian Blur, Unsharp Mask.
*   **Stylize:** Film Grain, Shadow.

### Tier 2 (Common Creative) - Medium Priority
*   **Color Grading:** Color Balance, LUT Support (.cube format parser).
*   **Special Effects:** Glow, Pixelate, Noise, Chroma Key, Mask overlay.
*   **Dynamic Motion:** Motion Blur, Lens Distortion.

### Tier 3 (Advanced/AI) - Low Priority
*   **Professional Grading:** Curves, Levels, RGB Mixer, HSL Secondary.
*   **Complex Warp:** Perspective Warp, Ripple, Twirl, Fisheye.
*   **Smart Features:** AI Background Removal, AI Object Tracking (CSRT coordinates export).
