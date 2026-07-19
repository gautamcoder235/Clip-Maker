import { Command } from "./history";
import { AppStateManager } from "./app_state";
import { EffectState } from "../types";
import { EasingType } from "../types/animation/curves";

export class AddEffectCommand implements Command {
  public name: string;
  private stateManager: AppStateManager;
  private assetId: string;
  private effect: EffectState;

  constructor(stateManager: AppStateManager, assetId: string, effect: EffectState) {
    this.stateManager = stateManager;
    this.assetId = assetId;
    this.effect = effect;
    this.name = `Add Effect: ${effect.effectId}`;
  }

  execute(): void {
    const proj = this.stateManager.project;
    if (!proj.asset_settings) {
      proj.asset_settings = {};
    }
    if (!proj.asset_settings[this.assetId]) {
      proj.asset_settings[this.assetId] = {};
    }
    const settings = proj.asset_settings[this.assetId];
    if (!settings.effects) {
      settings.effects = [];
    }
    
    // Push a deep copy of the effect to prevent mutations sharing reference
    settings.effects.push(JSON.parse(JSON.stringify(this.effect)));
    
    // Explicit compilation triggering when shader compiling is built (Phase 2)
    this.stateManager.triggerNotification();
  }

  undo(): void {
    const proj = this.stateManager.project;
    const settings = proj.asset_settings?.[this.assetId];
    if (settings && settings.effects) {
      const idx = settings.effects.findIndex(e => e.effectId === this.effect.effectId);
      if (idx !== -1) {
        settings.effects.splice(idx, 1);
      }
    }
    this.stateManager.triggerNotification();
  }
}

export class RemoveEffectCommand implements Command {
  public name: string;
  private stateManager: AppStateManager;
  private assetId: string;
  private effectId: string;
  private removedEffect: EffectState | null = null;
  private removedIndex: number = -1;

  constructor(stateManager: AppStateManager, assetId: string, effectId: string) {
    this.stateManager = stateManager;
    this.assetId = assetId;
    this.effectId = effectId;
    this.name = `Remove Effect: ${effectId}`;
  }

  execute(): void {
    const proj = this.stateManager.project;
    const settings = proj.asset_settings?.[this.assetId];
    if (settings && settings.effects) {
      const idx = settings.effects.findIndex(e => e.effectId === this.effectId);
      if (idx !== -1) {
        this.removedIndex = idx;
        this.removedEffect = settings.effects[idx];
        settings.effects.splice(idx, 1);
      }
    }
    this.stateManager.triggerNotification();
  }

  undo(): void {
    if (this.removedEffect !== null && this.removedIndex !== -1) {
      const proj = this.stateManager.project;
      const settings = proj.asset_settings?.[this.assetId];
      if (settings && settings.effects) {
        settings.effects.splice(this.removedIndex, 0, this.removedEffect);
      }
    }
    this.stateManager.triggerNotification();
  }
}

export class UpdateEffectParameterCommand implements Command {
  public name: string;
  private stateManager: AppStateManager;
  private assetId: string;
  private effectId: string;
  private parameterId: string;
  private newPoints: { time: number; value: any; easing: EasingType }[];
  private oldPoints: { time: number; value: any; easing: EasingType }[] = [];

  constructor(
    stateManager: AppStateManager,
    assetId: string,
    effectId: string,
    parameterId: string,
    newPoints: { time: number; value: any; easing: EasingType }[]
  ) {
    this.stateManager = stateManager;
    this.assetId = assetId;
    this.effectId = effectId;
    this.parameterId = parameterId;
    this.newPoints = JSON.parse(JSON.stringify(newPoints));
    this.name = `Update Effect Parameter: ${effectId}.${parameterId}`;
  }

  execute(): void {
    const proj = this.stateManager.project;
    const settings = proj.asset_settings?.[this.assetId];
    const effect = settings?.effects?.find(e => e.effectId === this.effectId);
    
    if (effect) {
      if (!effect.parameters[this.parameterId]) {
        effect.parameters[this.parameterId] = {
          parameterId: this.parameterId,
          points: []
        };
      }
      
      const paramState = effect.parameters[this.parameterId];
      this.oldPoints = JSON.parse(JSON.stringify(paramState.points));
      paramState.points = JSON.parse(JSON.stringify(this.newPoints));
    }
    
    this.stateManager.triggerNotification();
  }

  undo(): void {
    const proj = this.stateManager.project;
    const settings = proj.asset_settings?.[this.assetId];
    const effect = settings?.effects?.find(e => e.effectId === this.effectId);
    
    if (effect && effect.parameters[this.parameterId]) {
      effect.parameters[this.parameterId].points = JSON.parse(JSON.stringify(this.oldPoints));
    }
    
    this.stateManager.triggerNotification();
  }
}

export class ReorderEffectsCommand implements Command {
  public name: string;
  private stateManager: AppStateManager;
  private assetId: string;
  private newOrder: string[];
  private oldOrder: string[] = [];

  constructor(stateManager: AppStateManager, assetId: string, newOrder: string[]) {
    this.stateManager = stateManager;
    this.assetId = assetId;
    this.newOrder = [...newOrder];
    this.name = "Reorder Effects";
  }

  execute(): void {
    const proj = this.stateManager.project;
    const settings = proj.asset_settings?.[this.assetId];
    if (settings && settings.effects) {
      this.oldOrder = settings.effects.map(e => e.effectId);
      
      // Re-sort the effects array to match newOrder
      const sorted: EffectState[] = [];
      for (const id of this.newOrder) {
        const item = settings.effects.find(e => e.effectId === id);
        if (item) {
          sorted.push(item);
        }
      }
      
      // Append any items that were not in the newOrder just in case
      for (const e of settings.effects) {
        if (!this.newOrder.includes(e.effectId)) {
          sorted.push(e);
        }
      }
      
      settings.effects = sorted;
    }
    this.stateManager.triggerNotification();
  }

  undo(): void {
    const proj = this.stateManager.project;
    const settings = proj.asset_settings?.[this.assetId];
    if (settings && settings.effects && this.oldOrder.length > 0) {
      const sorted: EffectState[] = [];
      for (const id of this.oldOrder) {
        const item = settings.effects.find(e => e.effectId === id);
        if (item) {
          sorted.push(item);
        }
      }
      settings.effects = sorted;
    }
    this.stateManager.triggerNotification();
  }
}
