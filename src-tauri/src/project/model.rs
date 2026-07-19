use serde::{Deserialize, Serialize};
use crate::config::model::{
    BackgroundConfig, VideoPlacementConfig, TextSettings, TextPreset, ExtraOverlay, MediaOverlay,
    ProjectAsset, AssetSettings
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectData {
    #[serde(default = "default_version")]
    pub version: u32,
    pub name: String,
    pub imported_videos: Vec<String>,
    #[serde(default)]
    pub imported_assets: Vec<ProjectAsset>,
    #[serde(default)]
    pub asset_settings: std::collections::HashMap<String, AssetSettings>,
    pub output_path: String,
    pub clip_duration: u32,

    pub aspect_ratio: String,
    pub crop_anchor: String,
    pub output_resolution: String,
    pub output_width: u32,
    pub output_height: u32,
    pub background: BackgroundConfig,
    pub video_placement: VideoPlacementConfig,
    pub text_mode: String,
    pub text_template: String,
    pub text_preset_mode: String,
    pub text_presets: Vec<TextPreset>,
    pub extra_overlays: Vec<ExtraOverlay>,
    pub media_overlays: Vec<MediaOverlay>,
    pub include_audio: bool,
    pub parallel_processing: bool,
    pub parallel_workers: u32,
    pub text_settings: TextSettings,
    pub gpu_acceleration: bool,
    
    // UI specific layouts
    #[serde(default)]
    pub timeline_zoom: f32,
    #[serde(default)]
    pub selected_clip_index: Option<usize>,
}

fn default_version() -> u32 {
    1
}

impl Default for ProjectData {
    fn default() -> Self {
        let default_config = crate::config::AppConfig::default();
        ProjectData {
            version: 1,
            name: "Untitled Project".to_string(),
            imported_videos: default_config.input_paths,
            imported_assets: Vec::new(),
            asset_settings: std::collections::HashMap::new(),
            output_path: default_config.output_path,
            clip_duration: default_config.clip_duration,

            aspect_ratio: default_config.aspect_ratio,
            crop_anchor: default_config.crop_anchor,
            output_resolution: default_config.output_resolution,
            output_width: default_config.output_width,
            output_height: default_config.output_height,
            background: default_config.background,
            video_placement: default_config.video_placement,
            text_mode: default_config.text_mode,
            text_template: default_config.text_template,
            text_preset_mode: default_config.text_preset_mode,
            text_presets: default_config.text_presets,
            extra_overlays: default_config.extra_overlays,
            media_overlays: default_config.media_overlays,
            include_audio: default_config.include_audio,
            parallel_processing: default_config.parallel_processing,
            parallel_workers: default_config.parallel_workers,
            text_settings: default_config.text_settings,
            gpu_acceleration: default_config.gpu_acceleration,
            timeline_zoom: 1.0,
            selected_clip_index: None,
        }
    }
}
