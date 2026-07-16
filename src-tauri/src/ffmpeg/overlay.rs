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
    ) -> String {
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
            drawtext.push_str(":borderw=2");
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
