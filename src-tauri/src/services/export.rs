use std::path::Path;
use tauri::AppHandle;

use crate::errors::{AppResult, AppError};
use crate::config::AppConfig;
use crate::jobs::JobManager;
use crate::ffmpeg::builder::FFmpegBuilder;
use crate::ffmpeg::overlay::MediaOverlaySpec;
use crate::ffmpeg::encoder::EncoderDetector;
use crate::services::processing::ProcessingService;

use crate::fonts::SystemFont;

#[derive(Clone)]
pub struct ExportService {
    app_handle: AppHandle,
    ffmpeg_path: String,
}

impl ExportService {
    pub fn new(app_handle: AppHandle, ffmpeg_path: &str) -> Self {
        ExportService {
            app_handle,
            ffmpeg_path: ffmpeg_path.to_string(),
        }
    }

    pub fn export_clip(
        &self,
        config: &AppConfig,
        clip_index: u32,
        _total_clips: u32,
        job_id: &str,
        job_manager: &JobManager,
        fonts: &[SystemFont],
    ) -> AppResult<()> {
        if let Some(job) = job_manager.get_job(job_id) {
            if job.status == "Cancelled" {
                return Err(AppError::Job("Job was cancelled by user".to_string()));
            }
        }

        if config.input_paths.is_empty() && config.input_path.is_empty() {
            return Err(AppError::Config("No input video selected".to_string()));
        }

        let input_path = if !config.input_paths.is_empty() {
            &config.input_paths[0]
        } else {
            &config.input_path
        };

        let movie_name = Path::new(input_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("clip");

        let output_filename = format!("{}_part_{:03}.mp4", movie_name, clip_index);
        let output_filepath = Path::new(&config.output_path).join(&output_filename);
        let _output_filepath_str = output_filepath.to_string_lossy().replace("\\", "/");


        // Clean up any old output file to prevent cache stale reads
        let _ = std::fs::remove_file(&output_filepath);

        // Use temporary path during active render
        let temp_filename = format!("{}_part_{:03}.tmp.mp4", movie_name, clip_index);
        let temp_filepath = Path::new(&config.output_path).join(&temp_filename);
        let temp_filepath_str = temp_filepath.to_string_lossy().replace("\\", "/");

        // Calculate clip start/duration matching the ClipSplitter logic and user-specific trim settings
        let mut trim_start = 0.0;
        let mut trim_end = None;

        let asset_id = config.imported_assets.iter()
            .find(|asset| asset.path == *input_path)
            .map(|asset| &asset.id);

        if let Some(id) = asset_id {
            if let Some(settings) = config.asset_settings.get(id) {
                if let Some(trim) = &settings.trim {
                    if trim.enabled && trim.start >= 0.0 && trim.end > trim.start {
                        trim_start = trim.start;
                        trim_end = Some(trim.end);
                    }
                }
            }
        }

        let start_time = trim_start + ((clip_index - 1) * config.clip_duration) as f64;
        let mut duration = config.clip_duration as f64;

        if let Some(end) = trim_end {
            // Guard against start time exceeding trimmed end boundary
            if start_time >= end {
                return Err(AppError::Config(format!(
                    "Clip index {} start time {:.2}s is out of trimmed bounds (end: {:.2}s)",
                    clip_index, start_time, end
                )));
            }
            duration = f64::min(duration, end - start_time);
        }

        // Export Safety Guard: If duration is extremely small, skip or error out safely
        if duration <= 0.01 || duration.is_nan() {
            return Err(AppError::Config(format!(
                "Clip duration {:.3}s is too small to export",
                duration
            )));
        }

        let processor = ProcessingService::new(self.app_handle.clone(), &self.ffmpeg_path);
        
        let mut builder = FFmpegBuilder::new(&self.ffmpeg_path);
        builder
            .input(input_path)
            .split(start_time, duration, true, 0.5);

        if config.aspect_ratio == "9:16" && !config.video_placement.enabled {
            builder.crop("9:16", &config.crop_anchor);
        }

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

        // Resolve template text first
        let template_text = if config.text_mode == "Fixed Text" {
            config.text_template.trim().to_string()
        } else {
            config.text_template.replace("{part}", &clip_index.to_string()).trim().to_string()
        };

        // Determine overlay application order (normalized)
        let mut order = Vec::new();
        if let Some(ref o) = config.overlay_order {
            order = o.clone();
        }
        
        let mut existing = std::collections::HashSet::new();
        if config.text_settings.enabled {
            existing.insert("text".to_string());
        }
        for i in 0..config.extra_overlays.len() {
            existing.insert(format!("extra-{}", i));
        }
        for i in 0..config.media_overlays.len() {
            existing.insert(format!("media-{}", i));
        }
        
        let mut normalized_order: Vec<String> = order
            .into_iter()
            .filter(|id| existing.contains(id))
            .collect();
            
        // Append missing elements in default order
        for i in 0..config.media_overlays.len() {
            let id = format!("media-{}", i);
            if !normalized_order.contains(&id) && existing.contains(&id) {
                normalized_order.push(id);
            }
        }
        if !normalized_order.contains(&"text".to_string()) && existing.contains("text") {
            normalized_order.push("text".to_string());
        }
        for i in 0..config.extra_overlays.len() {
            let id = format!("extra-{}", i);
            if !normalized_order.contains(&id) && existing.contains(&id) {
                normalized_order.push(id);
            }
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

        // Apply overlays in order to builder
        for id in &normalized_order {
            if id == "text" {
                if config.text_settings.enabled {
                    let is_cycle = config.text_preset_mode.eq_ignore_ascii_case("Cycle") && !config.text_presets.is_empty();
                    
                    if is_cycle {
                        let clip_idx_usize = (clip_index.saturating_sub(1)) as usize;
                        let preset_idx = clip_idx_usize % config.text_presets.len();
                        let active_preset = &config.text_presets[preset_idx];
                        
                        let active_text = match active_preset.template_text {
                            Some(ref tpl) if !tpl.trim().is_empty() => {
                                tpl.replace("{part}", &clip_index.to_string()).trim().to_string()
                            }
                            _ => template_text.clone(),
                        };
                        
                        let font_path = resolve_font_path(&active_preset.font_family, active_preset.font_weight);
                        builder.overlay_text(
                            &active_text,
                            active_preset.font_size,
                            &active_preset.font_color,
                            font_path.as_deref(),
                            &active_preset.x_position,
                            &active_preset.y_position,
                            active_preset.outline,
                            active_preset.letter_spacing,
                            active_preset.font_weight,
                        );
                    } else {
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
                }
            } else if id.starts_with("extra-") {
                if let Ok(idx) = id.replace("extra-", "").parse::<usize>() {
                    if let Some(extra) = config.extra_overlays.get(idx) {
                        let extra_text = extra.text.replace("{part}", &clip_index.to_string()).trim().to_string();
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
                            let spec = MediaOverlaySpec::from_config(overlay, 0.0);
                            builder.add_media_overlay(spec);
                        }
                    }
                }
            }
        }

        // Resolve GPU encoder
        let mut active_gpu = false;
        let mut active_encoder = None;

        if config.gpu_acceleration {
            let detector = EncoderDetector::new(&self.ffmpeg_path);
            if let Some(enc) = detector.detect_gpu_encoder() {
                active_gpu = true;
                active_encoder = Some(enc);
            }
        }

        builder.set_audio_codec(&config.audio_codec);
        builder.set_audio_stream_index(config.audio_stream_index);
        builder.encode(
            &temp_filepath_str,
            active_gpu,
            active_encoder.as_deref(),
            config.include_audio,
            "veryfast",
            22,
        );

        // Run render job
        let mut res = processor.execute_render_job(job_id, duration, &mut builder, job_manager);

        // CPU Fallback logic if GPU render fails
        if let Err(ref err) = res {
            if active_gpu {
                eprintln!("GPU rendering failed with error: {:?}. Retrying with CPU...", err);
                let mut retry_builder = FFmpegBuilder::new(&self.ffmpeg_path);
                // rebuild identical configuration without GPU
                retry_builder
                    .input(input_path)
                    .split(start_time, duration, true, 0.5);

                if config.aspect_ratio == "9:16" {
                    retry_builder.crop("9:16", &config.crop_anchor);
                }

                let has_bg_image = config.background.mode == "image" && !config.background.image_path.is_empty();
                if (config.video_placement.enabled || has_bg_image) && resolution.is_some() {
                    let res = resolution.unwrap();
                    let vid_w = if config.video_placement.enabled { config.video_placement.width as u32 } else { res.0 };
                    let vid_h = if config.video_placement.enabled { config.video_placement.height as u32 } else { res.1 };
                    let vid_x = if config.video_placement.enabled { config.video_placement.x } else { 0 };
                    let vid_y = if config.video_placement.enabled { config.video_placement.y } else { 0 };
                    retry_builder.place_on_canvas(
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
                    retry_builder.scale_to(res.0, res.1, true);
                }

                let crop_t = config.video_placement.crop_top.unwrap_or(0.0);
                let crop_b = config.video_placement.crop_bottom.unwrap_or(0.0);
                let crop_l = config.video_placement.crop_left.unwrap_or(0.0);
                let crop_r = config.video_placement.crop_right.unwrap_or(0.0);
                
                if crop_t > 0.0 || crop_b > 0.0 || crop_l > 0.0 || crop_r > 0.0 {
                    retry_builder.add_video_filter(&format!(
                        "crop=iw-{}-{}:ih-{}-{}:{}:{}",
                        crop_l, crop_r, crop_t, crop_b, crop_l, crop_t
                    ));
                }

                let rot = config.video_placement.rotation.unwrap_or(0.0);
                if rot != 0.0 {
                    retry_builder.add_video_filter(&format!("rotate={rot}*PI/180:c=black@0:ow=iw*abs(cos({rot}*PI/180))+ih*abs(sin({rot}*PI/180)):oh=iw*abs(sin({rot}*PI/180))+ih*abs(cos({rot}*PI/180))", rot=rot));
                }

                // Apply overlays in order to retry_builder
                for id in &normalized_order {
                    if id == "text" {
                        if config.text_settings.enabled {
                            let font_path = resolve_font_path(&config.text_settings.font_family, config.text_settings.font_weight);
                            retry_builder.overlay_text(
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
                                let extra_text = extra.text.replace("{part}", &clip_index.to_string()).trim().to_string();
                                let font_path = resolve_font_path(&extra.font_family, extra.font_weight);
                                retry_builder.overlay_text(
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
                                    let spec = MediaOverlaySpec::from_config(overlay, 0.0);
                                    retry_builder.add_media_overlay(spec);
                                }
                            }
                        }
                    }
                }

                retry_builder.set_audio_codec(&config.audio_codec);
                retry_builder.set_audio_stream_index(config.audio_stream_index);
                retry_builder.encode(
                    &temp_filepath_str,
                    false, // force CPU fallback
                    None,
                    config.include_audio,
                    "veryfast",
                    22,
                );

                if let Some(job) = job_manager.get_job(job_id) {
                    if job.status == "Cancelled" {
                        return Err(AppError::Job("Job was cancelled by user".to_string()));
                    }
                }

                res = processor.execute_render_job(job_id, duration, &mut retry_builder, job_manager);
            }
        }

        // Finalize: Rename temp file to final target file if render succeeded
        if res.is_ok() {
            if temp_filepath.exists() {
                std::fs::rename(&temp_filepath, &output_filepath).map_err(|e| {
                    AppError::Io(format!("Failed to finalize export file rename: {}", e))
                })?;
            }
        } else {

            // Clean up temp file if render failed
            let _ = std::fs::remove_file(&temp_filepath);
        }

        res

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
