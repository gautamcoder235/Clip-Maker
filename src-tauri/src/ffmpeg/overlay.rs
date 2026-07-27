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
        _letter_spacing: i32,
        font_weight: u32,
    ) -> String {
        // Note: FFmpeg drawtext has no native letter-spacing/tracking support.
        // Letter spacing is rendered visually in the DOM canvas preview only.
        // The FFmpeg output uses standard character spacing to avoid text explosion.
        let escaped_text = Self::escape_drawtext(text);
        let safe_color = if font_color.is_empty() { "black" } else { font_color };
        
        let mut font_arg = String::new();
        if let Some(ff) = font_file {
            let normalized_ff = ff.replace("\\", "/");
            font_arg = format!(":fontfile='{}'", Self::escape_drawtext(&normalized_ff));
        }

        let mut drawtext = format!(
            "drawtext=text='{}'{}:fontsize={}:fontcolor={}:x={}:y={}",
            escaped_text, font_arg, font_size, safe_color, x, y
        );

        if outline {
            let base_border = (font_size as f32 / 35.0).max(1.5);
            let weight_scale = (font_weight as f32 / 400.0).clamp(0.5, 2.5);
            let border_w = (base_border * weight_scale).round() as u32;
            drawtext.push_str(&format!(":borderw={}", border_w.max(1)));
        } else if font_weight > 400 {
            let bold_thickness = ((font_weight as f32 - 400.0) / 100.0 * (font_size as f32 / 80.0)).clamp(0.5, 6.0);
            drawtext.push_str(&format!(":borderw={:.1}:bordercolor={}", bold_thickness, safe_color));
        }

        drawtext
    }


    pub fn escape_drawtext(text: &str) -> String {
        text.replace("\\", "\\\\")
            .replace(":", "\\:")
            .replace("'", "\\'")
            .replace("%", "\\%")
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
    pub start_offset_seconds: f64,
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
            start_offset_seconds: start_offset,
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

