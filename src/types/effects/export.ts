export interface ExportParameterContext {
  evaluateExpression: (paramId: string) => string; // Returns FFmpeg algebraic syntax (e.g. "brightness=0.15")
  evaluateStatic: (paramId: string) => any;         // Evaluates constant parameter values
  isAnimated: (paramId: string) => boolean;
}

export type ExportExecutionType = 
  | 'NativeExpression'  // Translated directly into mathematical parameters in FFmpeg filters (eq, opacity, hue)
  | 'NativeFilter'      // Standard static FFmpeg filters
  | 'SoftwareProcessing'// CPU pixel manipulations during export
  | 'AIProcessing';     // Asynchronous, neural model processing queues

export interface ExportImplementation {
  executionType: ExportExecutionType;
  
  // Generates filter string fragments for FFmpeg filtergraphs
  buildFFmpegFilter(ctx: ExportParameterContext): string;
  
  // Custom frame modification if executionType is SoftwareProcessing/AIProcessing
  processFrame?(
    width: number,
    height: number,
    buffer: Uint8ClampedArray,
    ctx: ExportParameterContext
  ): Promise<void>;
}

export class ExportRegistry {
  private static implementations: Map<string, ExportImplementation> = new Map();

  public static registerExport(effectId: string, impl: ExportImplementation): void {
    this.implementations.set(effectId, impl);
  }

  public static getExport(effectId: string): ExportImplementation | undefined {
    return this.implementations.get(effectId);
  }
}
