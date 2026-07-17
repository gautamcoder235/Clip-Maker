use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use std::process::Command;
use std::os::windows::process::CommandExt;

use crate::errors::{AppResult, AppError};
use crate::config::AppConfig;
use crate::resources::cache::CacheManager;
use crate::ffmpeg::builder::FFmpegBuilder;
use crate::ffmpeg::overlay::MediaOverlaySpec;

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct PreviewService {
    cache: CacheManager,
    ffmpeg_path: String,
}

impl PreviewService {
    pub fn new(cache: CacheManager, ffmpeg_path: &str) -> Self {
        PreviewService {
            cache,
            ffmpeg_path: ffmpeg_path.to_string(),
        }
    }

    pub fn generate_preview(&self, config: &AppConfig) -> AppResult<String> {
        if config.input_paths.is_empty() && config.input_path.is_empty() {
            return Err(AppError::Config("No input video selected".to_string()));
        }

        let input_path = if !config.input_paths.is_empty() {
            &config.input_paths[0]
        } else {
            &config.input_path
        };

        let signature = self.build_signature(input_path, config);
        let preview_filename = format!("{}.mp4", signature);
        let preview_path = self.cache.preview_dir().join(&preview_filename);
        let preview_path_str = preview_path.to_string_lossy().replace("\\", "/");

        // Cache hit
        if preview_path.exists() {
            return Ok(preview_path_str);
        }

        // Cache miss: Generate preview
        let preview_clip_seconds = config.preview_clip_seconds.max(1) as f64;
        let preview_fps = config.preview_fps.max(1) as f64;

        // Resolve trim settings if configured
        let mut trim_start = config.start_offset as f64;
        let mut trim_duration = preview_clip_seconds;

        let asset_id = config.imported_assets.iter()
            .find(|asset| asset.path == *input_path)
            .map(|asset| &asset.id);

        if let Some(id) = asset_id {
            if let Some(settings) = config.asset_settings.get(id) {
                if let Some(trim) = &settings.trim {
                    if trim.enabled && trim.start >= 0.0 && trim.end > trim.start {
                        trim_start = trim.start;
                        // Clamp preview to no longer than the trim boundaries
                        trim_duration = f64::min(preview_clip_seconds, trim.end - trim.start);
                    }
                }
            }
        }
        
        let mut builder = FFmpegBuilder::new(&self.ffmpeg_path);
        
        // Split/trim first clip preview using resolved trim parameters
        builder
            .input(input_path)
            .split(trim_start, trim_duration, true, 3.0)
            .set_fps(preview_fps);

        if config.aspect_ratio == "9:16" {
            builder.crop("9:16", &config.crop_anchor);
        }

        // Apply scaling or canvas placement
        let resolution = self.resolve_resolution(&config.output_resolution, config.output_width, config.output_height);
        if config.video_placement.enabled && resolution.is_some() {
            let res = resolution.unwrap();
            builder.place_on_canvas(
                res.0,
                res.1,
                config.video_placement.width as u32,
                config.video_placement.height as u32,
                config.video_placement.x,
                config.video_placement.y,
                &config.background.color,
                if config.background.mode == "image" { Some(&config.background.image_path) } else { None },
                config.background.image_x,
                config.background.image_y,
                config.background.image_width as u32,
                config.background.image_height as u32,
            );
        } else if let Some(res) = resolution {
            builder.scale_to(res.0, res.1, true);
        }

        // Media Overlays
        for overlay in &config.media_overlays {
            if overlay.enabled {
                let spec = MediaOverlaySpec::from_config(overlay, 0.0);
                builder.add_media_overlay(spec);
            }
        }

        // Text Overlays (fixed or template replacement for start clip)
        let template_text = if config.text_mode == "Fixed Text" {
            config.text_template.trim().to_string()
        } else {
            config.text_template.replace("{part}", &config.start_clip.to_string()).trim().to_string()
        };

        let text_font = if !config.text_settings.font_family.is_empty() {
            Some(config.text_settings.font_family.as_str())
        } else {
            None
        };

        builder.overlay_text(
            &template_text,
            config.text_settings.font_size,
            &config.text_settings.font_color,
            text_font,
            &config.text_settings.x_position,
            &config.text_settings.y_position,
            config.text_settings.outline,
        );

        // Encode as lightweight draft
        builder.encode(
            &preview_path_str,
            config.gpu_acceleration,
            None, // No specific GPU encoder for preview
            false, // strip audio for fast preview
            "ultrafast",
            30, // Lower quality, faster render
        );

        let args = builder.build();

        let mut cmd = Command::new(&self.ffmpeg_path);
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.args(args);

        let output = cmd.output()?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(AppError::FFmpeg(format!("Preview generation failed: {}", stderr)));
        }

        Ok(preview_path_str)
    }

    fn build_signature(&self, input_path: &str, config: &AppConfig) -> String {
        let mut hasher = DefaultHasher::new();
        input_path.hash(&mut hasher);
        config.clip_duration.hash(&mut hasher);
        config.start_offset.hash(&mut hasher);
        config.aspect_ratio.hash(&mut hasher);
        config.crop_anchor.hash(&mut hasher);
        config.output_resolution.hash(&mut hasher);
        config.output_width.hash(&mut hasher);
        config.output_height.hash(&mut hasher);
        config.background.color.hash(&mut hasher);
        config.background.image_path.hash(&mut hasher);
        config.video_placement.enabled.hash(&mut hasher);
        config.video_placement.x.hash(&mut hasher);
        config.video_placement.y.hash(&mut hasher);
        config.video_placement.width.hash(&mut hasher);
        config.video_placement.height.hash(&mut hasher);
        config.text_mode.hash(&mut hasher);
        config.text_template.hash(&mut hasher);
        config.text_settings.font_size.hash(&mut hasher);
        config.text_settings.font_color.hash(&mut hasher);
        config.text_settings.font_family.hash(&mut hasher);
        config.text_settings.x_position.hash(&mut hasher);
        config.text_settings.y_position.hash(&mut hasher);
        config.gpu_acceleration.hash(&mut hasher);

        for overlay in &config.media_overlays {
            overlay.path.hash(&mut hasher);
            overlay.enabled.hash(&mut hasher);
            overlay.x.hash(&mut hasher);
            overlay.y.hash(&mut hasher);
        }

        format!("{:x}", hasher.finish())
    }

    fn resolve_resolution(&self, selection: &str, width: u32, height: u32) -> Option<(u32, u32)> {
        if selection == "Source" || selection.is_empty() {
            return None;
        }
        if selection == "Custom" {
            if width > 0 && height > 0 {
                return Some((width, height));
            }
            return None;
        }
        match selection {
            "1080x1920 (Shorts)" => Some((1080, 1920)),
            "720x1280 (Shorts)" => Some((720, 1280)),
            "1920x1080" => Some((1920, 1080)),
            "1280x720" => Some((1280, 720)),
            _ => None,
        }
    }
}
