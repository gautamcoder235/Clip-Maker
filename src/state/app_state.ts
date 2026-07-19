import { ProjectData, ImportedAsset, RenderJob, SystemFont } from "../types";
import { HistoryManager, Command } from "./history";
import { TauriService } from "../services/tauri";
import { ProjectMigrationRunner } from "./migrations";

export interface WorkspaceLayout {
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;
  timelineZoom: number;
  canvasZoom: number; // percentage e.g. 100
}

export class AppStateManager {
  public project: ProjectData;
  public history: HistoryManager;
  public fonts: SystemFont[] = [];
  public assets: ImportedAsset[] = [];
  public renderQueue: RenderJob[] = [];
  private workspaceLayout: WorkspaceLayout = {
    leftWidth: 280,
    rightWidth: 320,
    bottomHeight: 250,
    timelineZoom: 1.0,
    canvasZoom: 100, // percentage, 100 = 100%
  };

  private listeners: (() => void)[] = [];

  constructor() {
    this.history = new HistoryManager();
    this.project = this.createDefaultProject();
    
    this.history.subscribe(() => {
      this.notifyListeners();
    });
  }

  createDefaultProject(): ProjectData {
    return {
      version: 1,
      name: "Untitled Project",
      imported_videos: [],
      imported_assets: [],
      asset_settings: {},
      input_path: "",
      input_paths: [],
      output_path: "",
      clip_duration: 50,
      preview_clip_seconds: 10,
      preview_fps: 30,
      start_offset: 0,
      start_clip: 1,
      aspect_ratio: "original",
      crop_anchor: "Center",
      output_resolution: "1080x1920 (Shorts)",
      output_width: 1080,
      output_height: 1920,
      ffmpeg_path: "",
      ffprobe_path: "",
      background: {
        mode: "color",
        color: "#000000",
        image_path: "",
        image_x: 0,
        image_y: 0,
        image_width: 0,
        image_height: 0,
      },
      video_placement: {
        enabled: true,
        x: 0,
        y: 0,
        width: 1080,
        height: 1920,
      },
      text_mode: "Per Clip",
      text_template: "PART {part}",
      text_preset_mode: "Single",
      text_presets: [],
      extra_overlays: [],
      media_overlays: [],
      overlay_order: ["text"],
      include_audio: true,
      parallel_processing: true,
      parallel_workers: 2,
      text_settings: {
        enabled: true,
        font_size: 120,
        font_color: "#ffffff",
        font_family: "Segoe UI",
        x_position: "(w-text_w)/2",
        y_position: "(h-text_h)/2",
        outline: true,
        placement: "Center",
      },
      gpu_acceleration: true,
      enable_webgl_preview: false,
      timeline_zoom: 1.0,
      selected_clip_index: null,
    };
  }

  async init() {
    try {
      this.fonts = await TauriService.getFontsList();
      
      // Load standard workspace settings from local storage if available
      const savedLayout = localStorage.getItem("clipmaker_workspace_layout");
      if (savedLayout) {
        this.workspaceLayout = JSON.parse(savedLayout);
      }
    } catch (e) {
      console.error("Failed to initialize AppStateManager:", e);
    }
  }

  getNormalizedOverlayOrder(): string[] {
    const proj = this.project;
    const order = proj.overlay_order || [];
    
    // Build a list of all currently active/existing layer IDs
    const existing = new Set<string>();
    if (proj.text_settings && proj.text_settings.enabled !== false) {
      existing.add("text");
    }
    
    const extraCount = proj.extra_overlays ? proj.extra_overlays.length : 0;
    for (let i = 0; i < extraCount; i++) {
      existing.add(`extra-${i}`);
    }
    
    const mediaCount = proj.media_overlays ? proj.media_overlays.length : 0;
    for (let i = 0; i < mediaCount; i++) {
      existing.add(`media-${i}`);
    }
    
    // Filter overlay_order to keep only existing elements
    const result = order.filter(id => existing.has(id));
    
    // Add any existing elements that are missing from overlay_order
    // (default ordering: media first, then text, then extras)
    const missing: string[] = [];
    
    const mediaList = proj.media_overlays || [];
    mediaList.forEach((_, i) => {
      const id = `media-${i}`;
      if (!result.includes(id) && existing.has(id)) {
        missing.push(id);
      }
    });
    
    if (!result.includes("text") && existing.has("text")) {
      missing.push("text");
    }
    
    const extraList = proj.extra_overlays || [];
    extraList.forEach((_, i) => {
      const id = `extra-${i}`;
      if (!result.includes(id) && existing.has(id)) {
        missing.push(id);
      }
    });
    
    return [...result, ...missing];
  }

  updateProjectField<K extends keyof ProjectData>(key: K, value: ProjectData[K]) {
    const oldValue = this.project[key];
    const self = this;

    class UpdateFieldCommand implements Command {
      name = `Update field: ${String(key)}`;
      execute() {
        self.project[key] = value;
        self.notifyListeners();
      }
      undo() {
        self.project[key] = oldValue;
        self.notifyListeners();
      }
    }

    this.history.push(new UpdateFieldCommand());
  }

  updateProjectDirectly(newData: Partial<ProjectData>) {
    const migratedData = ProjectMigrationRunner.migrate(newData);
    const defaultProj = this.createDefaultProject();
    this.project = {
      ...defaultProj,
      ...migratedData,
      text_settings: {
        ...defaultProj.text_settings,
        ...(migratedData.text_settings || {})
      }
    };
    this.notifyListeners();
  }

  getLayout(): WorkspaceLayout {
    return this.workspaceLayout;
  }

  public isSavingEnabled: boolean = true;
  private autosaveTimeout: any = null;

  triggerAutosave() {
    if (!this.isSavingEnabled) return;
    if (this.autosaveTimeout) {
      clearTimeout(this.autosaveTimeout);
    }
    this.autosaveTimeout = setTimeout(async () => {
      try {
        const projectCopy = {
          ...this.project,
          imported_assets: this.assets.map(a => ({ id: a.id, path: a.path })),
          imported_videos: this.assets.map(a => a.path),
        };
        await TauriService.saveAutosave(projectCopy);
      } catch (e) {
        console.error("Auto-save failed:", e);
      }
    }, 1000);
  }

  saveLayout(layout: Partial<WorkspaceLayout>) {
    this.workspaceLayout = { ...this.workspaceLayout, ...layout };
    localStorage.setItem("clipmaker_workspace_layout", JSON.stringify(this.workspaceLayout));
    this.notifyListeners();
  }

  subscribe(callback: () => void) {
    this.listeners.push(callback);
  }

  public triggerNotification() {
    this.notifyListeners();
  }

  private notifyListeners() {
    for (const callback of this.listeners) {
      callback();
    }
    this.triggerAutosave();
  }
}
