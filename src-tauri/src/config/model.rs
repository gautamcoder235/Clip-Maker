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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextPreset {
    pub name: String,
    pub font_size: u32,
    pub font_color: String,
    pub font_family: String,
    pub placement: String,
    pub x_position: String,
    pub y_position: String,
    pub outline: bool,
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
#[serde(rename_all = "camelCase")]
pub struct KeyframePoint {
    pub time: f64,
    pub value: serde_json::Value,
    pub easing: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectParameterState {
    pub parameter_id: String,
    pub points: Vec<KeyframePoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectState {
    pub effect_id: String,
    pub enabled: bool,
    pub parameters: std::collections::HashMap<String, EffectParameterState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetSettings {
    pub trim: Option<TrimSettings>,
    #[serde(default)]
    pub effects: Option<Vec<EffectState>>,
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
    pub start_offset: u32,
    pub start_clip: u32,
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
    pub parallel_processing: bool,
    pub parallel_workers: u32,
    pub text_settings: TextSettings,
    pub gpu_acceleration: bool,
}

fn default_version() -> u32 {
    1
}

fn default_text_enabled() -> bool {
    true
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
            preview_clip_seconds: 12,
            preview_fps: 12,
            start_offset: 0,
            start_clip: 1,
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
            },
            text_mode: "Per Clip".to_string(),
            text_template: "PART {part}".to_string(),
            text_preset_mode: "Single".to_string(),
            text_presets: Vec::new(),
            extra_overlays: Vec::new(),
            media_overlays: Vec::new(),
            overlay_order: Some(vec!["text".to_string()]),
            include_audio: true,
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
            },
            gpu_acceleration: false,
        }
    }
}
