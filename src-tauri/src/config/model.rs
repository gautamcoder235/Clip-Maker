use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundConfig {
    pub mode: String, // "color", "image"
    pub color: String,
    pub image_path: String,
    pub image_x: i32,
    pub image_y: i32,
    pub image_width: i32,
    pub image_height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoPlacementConfig {
    pub enabled: bool,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    #[serde(default)]
    pub ratio_locked: Option<bool>,
    #[serde(default)]
    pub rotation: Option<f64>,
    #[serde(default)]
    pub crop_top: Option<f64>,
    #[serde(default)]
    pub crop_right: Option<f64>,
    #[serde(default)]
    pub crop_bottom: Option<f64>,
    #[serde(default)]
    pub crop_left: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextSettings {
    #[serde(default = "default_text_enabled")]
    pub enabled: bool,
    pub font_size: u32,
    pub font_color: String,
    pub font_family: String,
    pub x_position: String, // String to allow expressions like (w-text_w)/2
    pub y_position: String,
    pub outline: bool,
    pub placement: String, // "Custom", "Top Center", "Center", etc.
    #[serde(default)]
    pub letter_spacing: i32,
    #[serde(default = "default_font_weight")]
    pub font_weight: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextPreset {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub template_text: Option<String>,
    pub font_size: u32,
    pub font_color: String,
    pub font_family: String,
    pub placement: String,
    pub x_position: String,
    pub y_position: String,
    pub outline: bool,
    #[serde(default)]
    pub letter_spacing: i32,
    #[serde(default = "default_font_weight")]
    pub font_weight: u32,
    #[serde(default)]
    pub extra_overlays: Option<Vec<ExtraOverlay>>,
    #[serde(default)]
    pub media_overlays: Option<Vec<MediaOverlay>>,
    #[serde(default)]
    pub overlay_order: Option<Vec<String>>,
    #[serde(default)]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtraOverlay {
    pub name: String,
    pub text: String,
    pub placement: String,
    pub x_position: String,
    pub y_position: String,
    pub font_size: u32,
    pub font_color: String,
    pub font_family: String,
    pub outline: bool,
    #[serde(default)]
    pub letter_spacing: i32,
    #[serde(default = "default_font_weight")]
    pub font_weight: u32,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaOverlay {
    pub name: String,
    pub r#type: String, // "video", "image"
    pub path: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub enabled: bool,
    pub loop_mode: String, // "repeat", "freeze", "stop"
    pub chroma_key: bool,
    pub chroma_color: String,
    pub chroma_similarity: f32,
    pub chroma_blend: f32,
    #[serde(default)]
    pub ratio_locked: Option<bool>,
    #[serde(default)]
    pub rotation: Option<f64>,
    #[serde(default)]
    pub crop_top: Option<f64>,
    #[serde(default)]
    pub crop_right: Option<f64>,
    #[serde(default)]
    pub crop_bottom: Option<f64>,
    #[serde(default)]
    pub crop_left: Option<f64>,
    #[serde(default)]
    pub chroma_mode: Option<String>,
    #[serde(default)]
    pub chroma_spill: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectAsset {
    pub id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrimSettings {
    pub start: f64,
    pub end: f64,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetSettings {
    #[serde(default)]
    pub trim: Option<TrimSettings>,
    #[serde(default)]
    pub video_placement: Option<VideoPlacementConfig>,
    #[serde(default)]
    pub text_settings: Option<TextSettings>,
    #[serde(default)]
    pub text_template: Option<String>,
    #[serde(default)]
    pub extra_overlays: Option<Vec<ExtraOverlay>>,
    #[serde(default)]
    pub media_overlays: Option<Vec<MediaOverlay>>,
    #[serde(default)]
    pub overlay_order: Option<Vec<String>>,
    #[serde(default)]
    pub audio_codec: Option<String>,
    #[serde(default)]
    pub audio_stream_index: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default = "default_version")]
    pub version: u32,
    pub input_path: String,
    #[serde(default)]
    pub imported_assets: Vec<ProjectAsset>,
    #[serde(default)]
    pub asset_settings: std::collections::HashMap<String, AssetSettings>,
    pub input_paths: Vec<String>,
    pub output_path: String,
    pub clip_duration: u32,
    pub preview_clip_seconds: u32,
    pub preview_fps: u32,

    pub aspect_ratio: String, // "original", "9:16"
    pub crop_anchor: String, // "Center", "Left", "Right", "Top", "Bottom"
    pub output_resolution: String, // "Source", "1080x1920 (Shorts)", etc.
    pub output_width: u32,
    pub output_height: u32,
    pub ffmpeg_path: String,
    pub ffprobe_path: String,
    pub background: BackgroundConfig,
    pub video_placement: VideoPlacementConfig,
    pub text_mode: String, // "Per Clip", "Fixed Text"
    pub text_template: String, // "PART {part}"
    pub text_preset_mode: String, // "Single", "Cycle"
    pub text_presets: Vec<TextPreset>,
    pub extra_overlays: Vec<ExtraOverlay>,
    pub media_overlays: Vec<MediaOverlay>,
    #[serde(default)]
    pub overlay_order: Option<Vec<String>>,
    pub include_audio: bool,
    #[serde(default = "default_audio_codec")]
    pub audio_codec: String,
    #[serde(default)]
    pub audio_stream_index: usize,
    pub parallel_processing: bool,
    pub parallel_workers: u32,
    pub text_settings: TextSettings,
    pub gpu_acceleration: bool,
    #[serde(default)]
    pub selected_clip_index: Option<usize>,
}

fn default_version() -> u32 {
    1
}

fn default_text_enabled() -> bool {
    true
}

fn default_font_weight() -> u32 {
    400
}

fn default_audio_codec() -> String {
    "copy".to_string()
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            version: 1,
            input_path: String::new(),
            imported_assets: Vec::new(),
            asset_settings: std::collections::HashMap::new(),
            input_paths: Vec::new(),
            output_path: String::new(),
            clip_duration: 60,
            preview_clip_seconds: 10,
            preview_fps: 12,

            aspect_ratio: "original".to_string(),
            crop_anchor: "Center".to_string(),
            output_resolution: "Source".to_string(),
            output_width: 1080,
            output_height: 1920,
            ffmpeg_path: String::new(),
            ffprobe_path: String::new(),
            background: BackgroundConfig {
                mode: "color".to_string(),
                color: "#0e1117".to_string(),
                image_path: String::new(),
                image_x: 0,
                image_y: 0,
                image_width: 0,
                image_height: 0,
            },
            video_placement: VideoPlacementConfig {
                enabled: false,
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                ratio_locked: Some(true),
                rotation: Some(0.0),
                crop_top: Some(0.0),
                crop_right: Some(0.0),
                crop_bottom: Some(0.0),
                crop_left: Some(0.0),
            },
            text_mode: "Per Clip".to_string(),
            text_template: "PART {part}".to_string(),
            text_preset_mode: "Single".to_string(),
            text_presets: Vec::new(),
            extra_overlays: Vec::new(),
            media_overlays: Vec::new(),
            overlay_order: Some(vec!["text".to_string()]),
            include_audio: true,
            audio_codec: "copy".to_string(),
            audio_stream_index: 0,
            parallel_processing: false,
            parallel_workers: 2,
            text_settings: TextSettings {
                enabled: true,
                font_size: 120,
                font_color: "black".to_string(),
                font_family: "Arial".to_string(),
                x_position: "10".to_string(),
                y_position: "10".to_string(),
                outline: true,
                placement: "Custom".to_string(),
                letter_spacing: 0,
                font_weight: 400,
            },
            gpu_acceleration: false,
            selected_clip_index: None,
        }
    }
}

