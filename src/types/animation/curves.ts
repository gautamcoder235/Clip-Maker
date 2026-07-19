export type EasingType = 'step' | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bezier';

export interface KeyframePoint {
  time: number; // Seconds from timeline clip start
  value: any;
  easing: EasingType;
  // Control points for cubic bezier curves (reserved for future Phase 4 Graph interface additions)
  bezierControls?: {
    cp1x: number;
    cp1y: number;
    cp2x: number;
    cp2y: number;
  };
}

export interface AnimationTrack {
  id: string;
  parameterId: string;
  keyframes: KeyframePoint[];
}

export interface AnimationBinding {
  trackId: string;
  targetPath: string; // Refers to the clip property path (e.g., "clips/0/effects/brightness/brightness")
}

export class AnimationEvaluator {
  /**
   * Interpolate standard numeric values based on active easing presets
   */
  public static evaluate(track: AnimationTrack, time: number): any {
    const kfs = [...track.keyframes].sort((a, b) => a.time - b.time);
    
    if (kfs.length === 0) {
      return null;
    }
    
    // 1. Time before first keyframe
    if (time <= kfs[0].time) {
      return kfs[0].value;
    }
    
    // 2. Time after last keyframe
    if (time >= kfs[kfs.length - 1].time) {
      return kfs[kfs.length - 1].value;
    }
    
    // 3. Find keyframe bounding segment
    let startKf = kfs[0];
    let endKf = kfs[0];
    for (let i = 0; i < kfs.length - 1; i++) {
      if (time >= kfs[i].time && time <= kfs[i + 1].time) {
        startKf = kfs[i];
        endKf = kfs[i + 1];
        break;
      }
    }
    
    const duration = endKf.time - startKf.time;
    if (duration === 0) {
      return startKf.value;
    }
    
    // Normalized interpolation factor [0.0, 1.0]
    const ratio = (time - startKf.time) / duration;
    
    // Non-numeric parameters (like strings or custom assets) immediately step-snap
    if (typeof startKf.value !== 'number' || typeof endKf.value !== 'number') {
      return ratio >= 0.5 ? endKf.value : startKf.value;
    }
    
    const startVal = startKf.value;
    const endVal = endKf.value;
    const diff = endVal - startVal;
    
    const easing = startKf.easing;
    
    switch (easing) {
      case 'step':
        return startVal;
        
      case 'linear':
        return startVal + diff * ratio;
        
      case 'ease-in':
        // Quadratic Ease In (ratio^2)
        return startVal + diff * (ratio * ratio);
        
      case 'ease-out':
        // Quadratic Ease Out (ratio * (2 - ratio))
        return startVal + diff * (ratio * (2 - ratio));
        
      case 'ease-in-out':
        // Smoothstep approximation for Ease In-Out
        return startVal + diff * (ratio * ratio * (3 - 2 * ratio));
        
      case 'bezier':
        if (startKf.bezierControls) {
          const t = this.solveBezierT(ratio, startKf.bezierControls.cp1x, startKf.bezierControls.cp2x);
          const y = this.sampleBezierY(t, startKf.bezierControls.cp1y, startKf.bezierControls.cp2y);
          return startVal + diff * y;
        }
        return startVal + diff * ratio; // Fallback to linear if no controls
        
      default:
        return startVal + diff * ratio;
    }
  }

  // --- Cubic Bezier Numerical Solvers ---
  
  private static solveBezierT(targetX: number, cp1x: number, cp2x: number): number {
    let t = targetX;
    // Newton-Raphson iteration for roots
    for (let i = 0; i < 8; i++) {
      const currentX = this.sampleBezierX(t, cp1x, cp2x) - targetX;
      const slope = this.getBezierSlope(t, cp1x, cp2x);
      if (Math.abs(slope) < 1e-6) break;
      t -= currentX / slope;
    }
    return Math.min(Math.max(t, 0), 1);
  }

  private static sampleBezierX(t: number, cp1x: number, cp2x: number): number {
    // Bezier polynomial calculation: x(t) = 3(1-t)^2*t*cp1x + 3(1-t)*t^2*cp2x + t^3
    return 3.0 * (1.0 - t) * (1.0 - t) * t * cp1x + 3.0 * (1.0 - t) * t * t * cp2x + t * t * t;
  }

  private static sampleBezierY(t: number, cp1y: number, cp2y: number): number {
    // Bezier polynomial calculation: y(t) = 3(1-t)^2*t*cp1y + 3(1-t)*t^2*cp2y + t^3
    return 3.0 * (1.0 - t) * (1.0 - t) * t * cp1y + 3.0 * (1.0 - t) * t * t * cp2y + t * t * t;
  }

  private static getBezierSlope(t: number, cp1x: number, cp2x: number): number {
    // Derivative of the X Bezier polynomial
    return 3.0 * (1.0 - 3.0 * t + 3.0 * t * t) * cp1x + 3.0 * (2.0 * t - 3.0 * t * t) * cp2x + 3.0 * t * t;
  }
}
