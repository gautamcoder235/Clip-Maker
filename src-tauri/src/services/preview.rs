use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

use crate::errors::{AppResult, AppError};
use crate::config::AppConfig;
use crate::resources::cache::CacheManager;
use crate::ffmpeg::builder::FFmpegBuilder;
use crate::fonts::SystemFont;

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

    pub fn generate_preview(&self, config: &AppConfig, fonts: &[SystemFont]) -> AppResult<String> {
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

        // Cache hit: verify file exists AND has valid non-zero size (> 1KB)
        if preview_path.exists() {
            if let Ok(meta) = std::fs::metadata(&preview_path) {
                if meta.len() > 1024 {
                    return Ok(preview_path_str);
                }
            }
            // Delete corrupt or 0-byte preview file if present
            let _ = std::fs::remove_file(&preview_path);
        }


        // Cache miss: Generate preview
        let preview_clip_seconds = config.preview_clip_seconds.max(1) as f64;
        let preview_fps = config.preview_fps.max(1) as f64;

        // Resolve trim settings if configured
        let mut trim_start = 0.0;
        let mut trim_end = f64::MAX;

        let asset_id = config.imported_assets.iter()
            .find(|asset| asset.path == *input_path)
            .map(|asset| &asset.id);

        if let Some(id) = asset_id {
            if let Some(settings) = config.asset_settings.get(id) {
                if let Some(trim) = &settings.trim {
                    if trim.enabled && trim.start >= 0.0 && trim.end > trim.start {
                        trim_start = trim.start;
                        trim_end = trim.end;
                    }
                }
            }
        }

        let mut preview_start = trim_start;
        if let Some(idx) = config.selected_clip_index {
            if idx >= 1 {
                let clip_len = config.clip_duration.max(1) as f64;
                preview_start = trim_start + (idx - 1) as f64 * clip_len;
            }
        }

        let preview_duration = if trim_end != f64::MAX {
            f64::min(preview_clip_seconds, (trim_end - preview_start).max(0.0))
        } else {
            preview_clip_seconds
        };
        
        let mut builder = FFmpegBuilder::new(&self.ffmpeg_path);
        
        // Split/trim clip preview using resolved parameters
        builder
            .input(input_path)
            .split(preview_start, preview_duration, true, 3.0)
            .set_fps(preview_fps);

        if config.aspect_ratio == "9:16" && !config.video_placement.enabled {
            builder.crop("9:16", &config.crop_anchor);
        }

        // Apply scaling or canvas placement
        let resolution = self.resolve_resolution(&config.output_resolution, config.output_width, config.output_height);
        let has_bg_image = config.background.mode == "image" && !config.background.image_path.is_empty();
        if (config.video_placement.enabled || has_bg_image) && resolution.is_some() {
            let res = resolution.unwrap();
            let vid_w = if config.video_placement.enabled { config.video_placement.width as u32 } else { res.0 };
            let vid_h = if config.video_placement.enabled { config.video_placement.height as u32 } else { res.1 };
            let vid_x = if config.video_placement.enabled { config.video_placement.x } else { 0 };
            let vid_y = if config.video_placement.enabled { config.video_placement.y } else { 0 };
            builder.place_on_canvas(
                res.0,
                res.1,
                vid_w,
                vid_h,
                vid_x,
                vid_y,
                &config.background.color,
                if config.background.mode == "image" { Some(&config.background.image_path) } else { None },
                config.background.image_x,
                config.background.image_y,
                config.background.image_width as u32,
                config.background.image_height as u32,
                config.video_placement.crop_left.unwrap_or(0.0),
                config.video_placement.crop_top.unwrap_or(0.0),
            );
        } else if let Some(res) = resolution {
            builder.scale_to(res.0, res.1, true);
        }

        let crop_t = config.video_placement.crop_top.unwrap_or(0.0);
        let crop_b = config.video_placement.crop_bottom.unwrap_or(0.0);
        let crop_l = config.video_placement.crop_left.unwrap_or(0.0);
        let crop_r = config.video_placement.crop_right.unwrap_or(0.0);
        
        if crop_t > 0.0 || crop_b > 0.0 || crop_l > 0.0 || crop_r > 0.0 {
            builder.add_video_filter(&format!(
                "crop=iw-{}-{}:ih-{}-{}:{}:{}",
                crop_l, crop_r, crop_t, crop_b, crop_l, crop_t
            ));
        }

        let rot = config.video_placement.rotation.unwrap_or(0.0);
        if rot != 0.0 {
            builder.add_video_filter(&format!("rotate={rot}*PI/180:c=black@0:ow=iw*abs(cos({rot}*PI/180))+ih*abs(sin({rot}*PI/180)):oh=iw*abs(sin({rot}*PI/180))+ih*abs(cos({rot}*PI/180))", rot=rot));
        }

        // Helper to resolve font family name and font weight to absolute system font path
        let resolve_font_path = |family: &str, weight: u32| -> Option<String> {
            if family.is_empty() {
                return None;
            }
            let lower_family = family.to_lowercase();
            let is_bold = weight >= 700;

            if is_bold {
                let bold_name = format!("{} bold", lower_family);
                if let Some(f) = fonts.iter().find(|f| f.name.to_lowercase() == bold_name) {
                    return Some(f.path.clone());
                }
                if let Some(f) = fonts.iter().find(|f| f.name.to_lowercase().contains(&lower_family) && (f.name.to_lowercase().contains("bold") || f.path.to_lowercase().contains("bd") || f.path.to_lowercase().contains("b.ttf"))) {
                    return Some(f.path.clone());
                }
            }

            // 1. Exact match
            if let Some(f) = fonts.iter().find(|f| f.name.to_lowercase() == lower_family) {
                return Some(f.path.clone());
            }
            // 2. Partial / prefix match
            if let Some(f) = fonts.iter().find(|f| f.name.to_lowercase().starts_with(&lower_family) || f.name.to_lowercase().contains(&lower_family)) {
                return Some(f.path.clone());
            }
            None
        };

        // Use overlay_order if available, otherwise default order
        let default_order: Vec<String> = {
            let mut order = vec!["text".to_string()];
            for (idx, _) in config.extra_overlays.iter().enumerate() {
                order.push(format!("extra-{}", idx));
            }
            for (idx, _) in config.media_overlays.iter().enumerate() {
                order.push(format!("media-{}", idx));
            }
            order
        };
        let normalized_order = config.overlay_order.as_ref().unwrap_or(&default_order);

        for id in normalized_order {
            if id == "text" {
                if config.text_settings.enabled {
                    let part_str = config.selected_clip_index.unwrap_or(1).to_string();
                    let template_text = if config.text_mode == "Fixed Text" {
                        config.text_template.trim().to_string()
                    } else {
                        config.text_template.replace("{part}", &part_str).trim().to_string()
                    };
                    let font_path = resolve_font_path(&config.text_settings.font_family, config.text_settings.font_weight);
                    builder.overlay_text(
                        &template_text,
                        config.text_settings.font_size,
                        &config.text_settings.font_color,
                        font_path.as_deref(),
                        &config.text_settings.x_position,
                        &config.text_settings.y_position,
                        config.text_settings.outline,
                        config.text_settings.letter_spacing,
                        config.text_settings.font_weight,
                    );
                }
            } else if id.starts_with("extra-") {
                if let Ok(idx) = id.replace("extra-", "").parse::<usize>() {
                    if let Some(extra) = config.extra_overlays.get(idx) {
                        let part_str = config.selected_clip_index.unwrap_or(1).to_string();
                        let extra_text = extra.text.replace("{part}", &part_str).trim().to_string();
                        let font_path = resolve_font_path(&extra.font_family, extra.font_weight);
                        builder.overlay_text(
                            &extra_text,
                            extra.font_size,
                            &extra.font_color,
                            font_path.as_deref(),
                            &extra.x_position,
                            &extra.y_position,
                            extra.outline,
                            extra.letter_spacing,
                            extra.font_weight,
                        );
                    }
                }
            } else if id.starts_with("media-") {
                if let Ok(idx) = id.replace("media-", "").parse::<usize>() {
                    if let Some(overlay) = config.media_overlays.get(idx) {
                        if overlay.enabled {
                            let spec = crate::ffmpeg::overlay::MediaOverlaySpec::from_config(overlay, 0.0);
                            builder.add_media_overlay(spec);
                        }
                    }
                }
            }
        }



        // Encode as lightweight draft
        builder.encode(
            &preview_path_str,
            config.gpu_acceleration,
            None, // No specific GPU encoder for preview
            config.include_audio, // keep audio if enabled in project
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
        config.selected_clip_index.hash(&mut hasher);

        config.aspect_ratio.hash(&mut hasher);
        config.crop_anchor.hash(&mut hasher);
        config.output_resolution.hash(&mut hasher);
        config.output_width.hash(&mut hasher);
        config.output_height.hash(&mut hasher);
        config.background.color.hash(&mut hasher);
        config.background.mode.hash(&mut hasher);
        config.background.image_path.hash(&mut hasher);
        config.background.image_x.hash(&mut hasher);
        config.background.image_y.hash(&mut hasher);
        config.background.image_width.hash(&mut hasher);
        config.background.image_height.hash(&mut hasher);
        config.video_placement.enabled.hash(&mut hasher);
        config.video_placement.x.hash(&mut hasher);
        config.video_placement.y.hash(&mut hasher);
        config.video_placement.width.hash(&mut hasher);
        config.video_placement.height.hash(&mut hasher);
        config.text_mode.hash(&mut hasher);
        config.text_template.hash(&mut hasher);
        config.text_settings.enabled.hash(&mut hasher);
        config.text_settings.font_size.hash(&mut hasher);
        config.text_settings.font_color.hash(&mut hasher);
        config.text_settings.font_family.hash(&mut hasher);
        config.text_settings.x_position.hash(&mut hasher);
        config.text_settings.y_position.hash(&mut hasher);
        config.text_settings.outline.hash(&mut hasher);
        config.text_settings.letter_spacing.hash(&mut hasher);
        config.text_settings.font_weight.hash(&mut hasher);
        config.gpu_acceleration.hash(&mut hasher);
        config.preview_clip_seconds.hash(&mut hasher);
        config.preview_fps.hash(&mut hasher);

        if let Some(ref order) = config.overlay_order {
            for o in order {
                o.hash(&mut hasher);
            }
        }

        for extra in &config.extra_overlays {
            extra.text.hash(&mut hasher);
            extra.font_size.hash(&mut hasher);
            extra.font_color.hash(&mut hasher);
            extra.font_family.hash(&mut hasher);
            extra.x_position.hash(&mut hasher);
            extra.y_position.hash(&mut hasher);
            extra.outline.hash(&mut hasher);
            extra.letter_spacing.hash(&mut hasher);
            extra.font_weight.hash(&mut hasher);
        }

        for overlay in &config.media_overlays {
            overlay.path.hash(&mut hasher);
            overlay.enabled.hash(&mut hasher);
            overlay.x.hash(&mut hasher);
            overlay.y.hash(&mut hasher);
            overlay.width.hash(&mut hasher);
            overlay.height.hash(&mut hasher);
            overlay.loop_mode.hash(&mut hasher);
            overlay.chroma_key.hash(&mut hasher);
        }

        for (key, settings) in &config.asset_settings {
            key.hash(&mut hasher);
            if let Some(trim) = &settings.trim {
                trim.enabled.hash(&mut hasher);
                trim.start.to_bits().hash(&mut hasher);
                trim.end.to_bits().hash(&mut hasher);
            }
        }

        if let Ok(meta) = std::fs::metadata(input_path) {
            if let Ok(mtime) = meta.modified() {
                mtime.hash(&mut hasher);
            }
        }

        format!("{:x}", hasher.finish())
    }


    fn resolve_resolution(&self, selection: &str, width: u32, height: u32) -> Option<(u32, u32)> {
        if width > 0 && height > 0 {
            return Some((width, height));
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
