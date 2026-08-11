use crate::config::model::MediaOverlay;

pub struct TextOverlayFilter;

impl TextOverlayFilter {
    pub fn build(
        text: &str,
        font_size: u32,
        font_color: &str,
        font_file: Option<&str>,
        x: &str,
        y: &str,
        outline: bool,
        letter_spacing: i32,
        font_weight: u32,
    ) -> String {
        // Note: FFmpeg drawtext has no native letter-spacing/tracking support.
        // We use a best-effort approximation by injecting Unicode Hair Spaces (U+200A)
        let mut final_text = text.to_string();
        if letter_spacing > 0 {
            let num_spaces = (letter_spacing / 5).max(1) as usize;
            let space_str = "\u{200A}".repeat(num_spaces);
            let chars: Vec<char> = text.chars().collect();
            final_text = chars
                .iter()
                .map(|c| c.to_string())
                .collect::<Vec<String>>()
                .join(&space_str);
        }
        let escaped_text = Self::escape_drawtext(&final_text);
        let safe_color = if font_color.is_empty() {
            "black"
        } else {
            font_color
        };

        let mut font_arg = String::new();
        if let Some(ff) = font_file {
            let normalized_ff = ff.replace("\\", "/");
            font_arg = format!(":fontfile='{}'", Self::escape_drawtext_path(&normalized_ff));
        }

        let norm_x = match x.trim() {
            "(w-text_w)/2" | "(W-tw)/2" | "(main_w-text_w)/2" | "center" => {
                "(main_w-text_w)/2".to_string()
            }
            other => other.to_string(),
        };
        let norm_y = match y.trim() {
            "(h-text_h)/2" | "(H-th)/2" | "(main_h-text_h)/2" | "center" | "middle" => {
                "(main_h-text_h)/2".to_string()
            }
            "top" => "100".to_string(),
            "bottom" => "(main_h-text_h-100)".to_string(),
            other => other.to_string(),
        };

        let mut filters = Vec::new();
        let has_bold = font_weight > 600;
        let bold_thickness = if has_bold {
            ((font_weight as f32 - 400.0) / 300.0 * (font_size as f32 / 100.0)).clamp(0.5, 4.0)
        } else {
            0.0
        };

        if outline && has_bold {
            // Draw background outline + bold thickness in black
            let border_w = ((font_size as f32) / 30.0).round().max(1.0) + bold_thickness;
            filters.push(format!(
                "drawtext=text='{}'{}:fontsize={}:fontcolor=black:borderw={:.1}:bordercolor=black:x={}:y={}",
                escaped_text, font_arg, font_size, border_w, norm_x, norm_y
            ));
            // Draw foreground text + bold thickness in safe_color
            filters.push(format!(
                "drawtext=text='{}'{}:fontsize={}:fontcolor={}:borderw={:.1}:bordercolor={}:x={}:y={}",
                escaped_text, font_arg, font_size, safe_color, bold_thickness, safe_color, norm_x, norm_y
            ));
        } else if outline {
            let border_w = ((font_size as f32) / 30.0).round().max(1.0) as u32;
            filters.push(format!(
                "drawtext=text='{}'{}:fontsize={}:fontcolor={}:borderw={}:bordercolor=black:x={}:y={}",
                escaped_text, font_arg, font_size, safe_color, border_w, norm_x, norm_y
            ));
        } else if has_bold {
            filters.push(format!(
                "drawtext=text='{}'{}:fontsize={}:fontcolor={}:borderw={:.1}:bordercolor={}:x={}:y={}",
                escaped_text, font_arg, font_size, safe_color, bold_thickness, safe_color, norm_x, norm_y
            ));
        } else {
            filters.push(format!(
                "drawtext=text='{}'{}:fontsize={}:fontcolor={}:x={}:y={}",
                escaped_text, font_arg, font_size, safe_color, norm_x, norm_y
            ));
        }

        filters.join(",")
    }

    pub fn escape_drawtext(text: &str) -> String {
        text.replace("\\", "\\\\")
            .replace(":", "\\:")
            .replace("'", "\\'")
            .replace("%", "\\%")
    }

    pub fn escape_drawtext_path(path: &str) -> String {
        path.replace("\\", "/")
            .replace(":", "\\:")
            .replace("'", "\\'")
    }
}

#[derive(Debug, Clone)]
pub struct MediaOverlaySpec {
    pub path: String,
    pub r#type: String, // "video", "image"
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub loop_mode: String,
    pub chroma_key: bool,
    pub chroma_color: String,
    pub chroma_similarity: f32,
    pub chroma_blend: f32,
    pub chroma_mode: String,
    pub chroma_spill: f32,
    pub start_offset_seconds: f64,
    pub rotation: f64,
    pub crop_top: f64,
    pub crop_right: f64,
    pub crop_bottom: f64,
    pub crop_left: f64,
}

impl MediaOverlaySpec {
    pub fn from_config(overlay: &MediaOverlay, start_offset: f64) -> Self {
        MediaOverlaySpec {
            path: overlay.path.clone(),
            r#type: overlay.r#type.clone(),
            x: overlay.x,
            y: overlay.y,
            width: overlay.width as u32,
            height: overlay.height as u32,
            loop_mode: overlay.loop_mode.clone(),
            chroma_key: overlay.chroma_key,
            chroma_color: overlay.chroma_color.clone(),
            chroma_similarity: overlay.chroma_similarity,
            chroma_blend: overlay.chroma_blend,
            chroma_mode: overlay.chroma_mode.clone().unwrap_or_else(|| "chromakey".to_string()),
            chroma_spill: overlay.chroma_spill.unwrap_or(0.3),
            start_offset_seconds: start_offset,
            rotation: overlay.rotation.unwrap_or(0.0),
            crop_top: overlay.crop_top.unwrap_or(0.0),
            crop_right: overlay.crop_right.unwrap_or(0.0),
            crop_bottom: overlay.crop_bottom.unwrap_or(0.0),
            crop_left: overlay.crop_left.unwrap_or(0.0),
        }
    }
}

#[derive(Debug, Clone)]
pub enum OverlayStep {
    Media(MediaOverlaySpec),
    Text {
        text: String,
        font_size: u32,
        font_color: String,
        font_file: Option<String>,
        x: String,
        y: String,
        outline: bool,
        letter_spacing: i32,
        font_weight: u32,
    },
}
