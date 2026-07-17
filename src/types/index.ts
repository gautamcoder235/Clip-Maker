export interface BackgroundConfig {
  mode: string; // "color" | "image"
  color: string;
  image_path: string;
  image_x: number;
  image_y: number;
  image_width: number;
  image_height: number;
}

export interface VideoPlacementConfig {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextSettings {
  enabled: boolean;
  font_size: number;
  font_color: string;
  font_family: string;
  x_position: string;
  y_position: string;
  outline: boolean;
  placement: string;
}

export interface TextPreset {
  name: string;
  font_size: number;
  font_color: string;
  font_family: string;
  placement: string;
  x_position: string;
  y_position: string;
  outline: boolean;
}

export interface ExtraOverlay {
  name: string;
  text: string;
  placement: string;
  x_position: string;
  y_position: string;
  font_size: number;
  font_color: string;
  font_family: string;
  outline: boolean;
}

export interface MediaOverlay {
  name: string;
  type: string; // "video" | "image"
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  enabled: boolean;
  loop_mode: string; // "repeat" | "freeze" | "stop"
  chroma_key: boolean;
  chroma_color: string;
  chroma_similarity: number;
  chroma_blend: number;
}

export interface ProjectAsset {
  id: string;
  path: string;
}

export interface TrimSettings {
  start: number;
  end: number;
  enabled: boolean;
}

export interface AssetSettings {
  trim?: TrimSettings;
  video_placement?: VideoPlacementConfig;
  text_settings?: TextSettings;
  text_template?: string;
  extra_overlays?: ExtraOverlay[];
  media_overlays?: MediaOverlay[];
}

export interface AppConfig {
  version: number;
  input_path: string;
  imported_assets: ProjectAsset[];
  asset_settings: Record<string, AssetSettings>;
  input_paths: string[];
  output_path: string;
  clip_duration: number;
  preview_clip_seconds: number;
  preview_fps: number;
  start_offset: number;
  start_clip: number;
  aspect_ratio: string;
  crop_anchor: string;
  output_resolution: string;
  output_width: number;
  output_height: number;
  ffmpeg_path: string;
  ffprobe_path: string;
  background: BackgroundConfig;
  video_placement: VideoPlacementConfig;
  text_mode: string;
  text_template: string;
  text_preset_mode: string;
  text_presets: TextPreset[];
  extra_overlays: ExtraOverlay[];
  media_overlays: MediaOverlay[];
  include_audio: boolean;
  parallel_processing: boolean;
  parallel_workers: number;
  text_settings: TextSettings;
  gpu_acceleration: boolean;
}

export interface ProjectData extends AppConfig {
  name: string;
  imported_videos: string[];
  timeline_zoom: number;
  selected_clip_index: number | null;
}

export interface RenderJob {
  id: string;
  name: string;
  input_file: string;
  output_file: string;
  clip_index: number;
  total_clips: number;
  status: string; // "Queued" | "Preparing" | "Encoding" | "Finalizing" | "Completed" | "Cancelled" | "Failed"
  progress: number;
  speed: string;
  elapsed_seconds: number;
  eta_seconds: number | null;
  encoder: string;
  start_time: string | null;
  error_message: string | null;
}

export interface SystemFont {
  name: string;
  path: string;
}

export interface ImportedAsset {
  id: string;
  hash: string;
  path: string;
  name: string;
  size_bytes: number;
  type: string; // "video" | "image" | "audio"
  thumbnail_path: string | null;
  timeline_thumbnails: string[];
  metadata: {
    duration: number;
    width: number;
    height: number;
    aspect_ratio: string;
    fps: number;
    has_audio: boolean;
    format_name: string;
    size_bytes: number;
  } | null;
}
