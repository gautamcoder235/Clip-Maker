import { invoke } from "@tauri-apps/api/core";
import { listen, Event } from "@tauri-apps/api/event";
import { AppConfig, ProjectData, ImportedAsset, RenderJob, SystemFont } from "../types";

export class TauriService {
  static async getConfig(): Promise<AppConfig> {
    return invoke<AppConfig>("get_config");
  }

  static async saveConfig(config: AppConfig): Promise<void> {
    return invoke("save_config", { config });
  }

  static async loadProject(filePath: string): Promise<ProjectData> {
    return invoke<ProjectData>("load_project", { filePath });
  }

  static async saveProject(filePath: string, project: ProjectData): Promise<void> {
    return invoke("save_project", { filePath, project });
  }

  static async importFile(filePath: string): Promise<ImportedAsset> {
    return invoke<ImportedAsset>("import_file", { filePath });
  }

  static async generatePreviewClip(config: AppConfig): Promise<string> {
    return invoke<string>("generate_preview_clip", { config });
  }

  static async startRenderQueue(
    config: AppConfig,
    startClip: number,
    endClip: number
  ): Promise<string[]> {
    return invoke<string[]>("start_render_queue", { config, startClip, endClip });
  }

  static async startBatchRenderQueue(
    requests: { config: AppConfig; start_clip: number; end_clip: number }[]
  ): Promise<string[]> {
    return invoke<string[]>("start_batch_render_queue", { requests });
  }

  static async cancelRenderJob(jobId: string): Promise<void> {
    return invoke("cancel_render_job", { jobId });
  }

  static async cancelAllJobs(): Promise<void> {
    return invoke("cancel_all_jobs");
  }

  static async getJobsList(): Promise<RenderJob[]> {
    return invoke<RenderJob[]>("get_jobs_list");
  }

  static async getFontsList(): Promise<SystemFont[]> {
    return invoke<SystemFont[]>("get_fonts_list");
  }

  static async clearCache(): Promise<void> {
    return invoke("clear_cache");
  }

  static async saveAutosave(project: ProjectData): Promise<void> {
    return invoke("save_autosave", { project });
  }

  static async loadAutosave(): Promise<ProjectData | null> {
    return invoke<ProjectData | null>("load_autosave");
  }

  // Listeners for render queue events
  static onJobStarted(callback: (jobId: string) => void) {
    return listen<string>("job-started", (event: Event<string>) => {
      callback(event.payload);
    });
  }

  static onJobProgress(
    callback: (
      jobId: string,
      progress: number,
      speed: string,
      elapsed: number,
      eta: number | null
    ) => void
  ) {
    type ProgressPayload = [string, number, string, number, number | null];
    return listen<ProgressPayload>("job-progress", (event: Event<ProgressPayload>) => {
      const [jobId, progress, speed, elapsed, eta] = event.payload;
      callback(jobId, progress, speed, elapsed, eta);
    });
  }

  static onJobCompleted(callback: (jobId: string) => void) {
    return listen<string>("job-completed", (event: Event<string>) => {
      callback(event.payload);
    });
  }

  static onJobFailed(callback: (jobId: string, error: string) => void) {
    type FailedPayload = [string, string];
    return listen<FailedPayload>("job-failed", (event: Event<FailedPayload>) => {
      const [jobId, error] = event.payload;
      callback(jobId, error);
    });
  }

  static onJobCancelled(callback: (jobId: string) => void) {
    return listen<string>("job-cancelled", (event: Event<string>) => {
      callback(event.payload);
    });
  }

  static onJobsCancelledAll(callback: () => void) {
    return listen<void>("jobs-cancelled-all", () => {
      callback();
    });
  }

  static onFFmpegLog(callback: (jobId: string, line: string) => void) {
    type LogPayload = [string, string];
    return listen<LogPayload>("ffmpeg-log", (event: Event<LogPayload>) => {
      const [jobId, line] = event.payload;
      callback(jobId, line);
    });
  }
}
