import { ProjectData, ImportedAsset, RenderJob, SystemFont } from "../types";
import { HistoryManager, Command } from "./history";
import { TauriService } from "../services/tauri";

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
    bottomHeight: 180,
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
      include_audio: true,
      parallel_processing: true,
      parallel_workers: 2,
      text_settings: {
        font_size: 120,
        font_color: "#ffffff",
        font_family: "Segoe UI",
        x_position: "(w-text_w)/2",
        y_position: "(h-text_h)/2",
        outline: true,
        placement: "Center",
      },
      gpu_acceleration: true,
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

  updateProjectDirectly(newData: ProjectData) {
    this.project = newData;
    this.notifyListeners();
  }

  getLayout(): WorkspaceLayout {
    return this.workspaceLayout;
  }

  saveLayout(layout: Partial<WorkspaceLayout>) {
    this.workspaceLayout = { ...this.workspaceLayout, ...layout };
    localStorage.setItem("clipmaker_workspace_layout", JSON.stringify(this.workspaceLayout));
    this.notifyListeners();
  }

  subscribe(callback: () => void) {
    this.listeners.push(callback);
  }

  private notifyListeners() {
    for (const callback of this.listeners) {
      callback();
    }
  }
}
