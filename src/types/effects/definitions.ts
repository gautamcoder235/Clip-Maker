export type ParameterType = 
  | 'number' 
  | 'boolean' 
  | 'color' 
  | 'string' 
  | 'enum'
  | 'vec2' 
  | 'vec3' 
  | 'vec4' 
  | 'matrix4' 
  | 'curve' 
  | 'gradient' 
  | 'lut';

export interface ParameterMetadata {
  id: string;
  name: string;
  type: ParameterType;
  tooltip?: string;
  unit?: string;
  category?: string;
  defaultValue: any;
  softMin?: number;
  softMax?: number;
  hardMin?: number;
  hardMax?: number;
  precision?: number;
  sliderStyle?: 'default' | 'percentage' | 'angle' | 'logarithmic';
  options?: { value: string; label: string }[];
  supportsAnimation: boolean;
  supportsExpressions: boolean;
  supportsReset: boolean;
}

export interface EffectCapabilities {
  supportsPreview: boolean;
  supportsExport: boolean;
  supportsRealtime: boolean;
  supportsAnimation: boolean;
  supportsMask: boolean;
  supportsGPU: boolean;
  supportsCPU: boolean;
  supportsAI: boolean;
}

export interface EffectDefinition {
  id: string;
  displayName: string;
  category: 'transform' | 'color' | 'blur' | 'sharpen' | 'stylize' | 'distortion' | 'keying' | 'lighting' | 'utility';
  icon: string;
  parameters: ParameterMetadata[];
  capabilities: EffectCapabilities;
  pluginId?: string;
}

// Statically registered Tier 1 Effects Definition catalog
export const TIER1_EFFECT_DEFINITIONS: EffectDefinition[] = [
  {
    id: 'brightness-contrast',
    displayName: 'Brightness & Contrast',
    category: 'color',
    icon: 'sun',
    capabilities: {
      supportsPreview: true,
      supportsExport: true,
      supportsRealtime: true,
      supportsAnimation: true,
      supportsMask: true,
      supportsGPU: true,
      supportsCPU: false,
      supportsAI: false
    },
    parameters: [
      {
        id: 'brightness',
        name: 'Brightness',
        type: 'number',
        tooltip: 'Adjusts the light intensity of the video clip.',
        unit: '%',
        defaultValue: 0,
        softMin: -100,
        softMax: 100,
        hardMin: -255,
        hardMax: 255,
        precision: 0,
        sliderStyle: 'percentage',
        supportsAnimation: true,
        supportsExpressions: true,
        supportsReset: true
      },
      {
        id: 'contrast',
        name: 'Contrast',
        type: 'number',
        tooltip: 'Adjusts the difference between dark and light regions.',
        unit: 'x',
        defaultValue: 1.0,
        softMin: 0.5,
        softMax: 2.0,
        hardMin: 0.0,
        hardMax: 10.0,
        precision: 2,
        sliderStyle: 'default',
        supportsAnimation: true,
        supportsExpressions: true,
        supportsReset: true
      }
    ]
  },
  {
    id: 'saturation',
    displayName: 'Saturation',
    category: 'color',
    icon: 'sliders',
    capabilities: {
      supportsPreview: true,
      supportsExport: true,
      supportsRealtime: true,
      supportsAnimation: true,
      supportsMask: true,
      supportsGPU: true,
      supportsCPU: false,
      supportsAI: false
    },
    parameters: [
      {
        id: 'saturation',
        name: 'Saturation',
        type: 'number',
        tooltip: 'Adjusts the intensity of the color hues.',
        unit: '%',
        defaultValue: 100,
        softMin: 0,
        softMax: 200,
        hardMin: 0,
        hardMax: 500,
        precision: 0,
        sliderStyle: 'percentage',
        supportsAnimation: true,
        supportsExpressions: true,
        supportsReset: true
      }
    ]
  },
  {
    id: 'box-blur',
    displayName: 'Box Blur',
    category: 'blur',
    icon: 'blur',
    capabilities: {
      supportsPreview: true,
      supportsExport: true,
      supportsRealtime: true,
      supportsAnimation: true,
      supportsMask: true,
      supportsGPU: true,
      supportsCPU: false,
      supportsAI: false
    },
    parameters: [
      {
        id: 'radius',
        name: 'Blur Radius',
        type: 'number',
        tooltip: 'Horizontal and vertical pixel radius of the blur filter.',
        unit: 'px',
        defaultValue: 0,
        softMin: 0,
        softMax: 20,
        hardMin: 0,
        hardMax: 100,
        precision: 0,
        sliderStyle: 'default',
        supportsAnimation: true,
        supportsExpressions: true,
        supportsReset: true
      },
      {
        id: 'passes',
        name: 'Passes',
        type: 'number',
        tooltip: 'Number of blur iterations. Higher numbers approximate Gaussian blur.',
        defaultValue: 1,
        softMin: 1,
        softMax: 5,
        hardMin: 1,
        hardMax: 10,
        precision: 0,
        sliderStyle: 'default',
        supportsAnimation: false,
        supportsExpressions: false,
        supportsReset: true
      }
    ]
  },
  {
    id: 'opacity',
    displayName: 'Opacity',
    category: 'utility',
    icon: 'eye',
    capabilities: {
      supportsPreview: true,
      supportsExport: true,
      supportsRealtime: true,
      supportsAnimation: true,
      supportsMask: false,
      supportsGPU: true,
      supportsCPU: false,
      supportsAI: false
    },
    parameters: [
      {
        id: 'opacity',
        name: 'Opacity',
        type: 'number',
        tooltip: 'Adjusts the transparency of the video layer.',
        unit: '%',
        defaultValue: 100,
        softMin: 0,
        softMax: 100,
        hardMin: 0,
        hardMax: 100,
        precision: 0,
        sliderStyle: 'percentage',
        supportsAnimation: true,
        supportsExpressions: true,
        supportsReset: true
      }
    ]
  }
];

export class EffectDefinitionRegistry {
  private static definitions: Map<string, EffectDefinition> = new Map();

  static {
    // Populate compile-time static definitions
    for (const def of TIER1_EFFECT_DEFINITIONS) {
      this.definitions.set(def.id, def);
    }
  }

  public static registerEffect(def: EffectDefinition): void {
    if (this.definitions.has(def.id)) {
      throw new Error(`Duplicate effect registration with ID: ${def.id}`);
    }
    this.definitions.set(def.id, def);
  }

  public static getEffect(id: string): EffectDefinition | undefined {
    return this.definitions.get(id);
  }

  public static getAllEffects(): EffectDefinition[] {
    return Array.from(this.definitions.values());
  }
}
