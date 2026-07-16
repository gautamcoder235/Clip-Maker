use std::process::Command;
use std::os::windows::process::CommandExt;
use serde::{Deserialize, Serialize};
use crate::errors::{AppResult, AppError};

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoMetadata {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub aspect_ratio: String,
    pub fps: f64,
    pub has_audio: bool,
    pub format_name: String,
    pub size_bytes: u64,
}

pub struct VideoProbe {
    ffprobe_path: String,
}

impl VideoProbe {
    pub fn new(ffprobe_path: &str) -> Self {
        VideoProbe {
            ffprobe_path: ffprobe_path.to_string(),
        }
    }

    pub fn probe(&self, video_path: &str) -> AppResult<VideoMetadata> {
        let mut cmd = Command::new(&self.ffprobe_path);
        
        // Hide terminal window on Windows
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        cmd.args([
            "-v", "error",
            "-show_entries", "format=duration,size,format_name:stream=width,height,codec_type,r_frame_rate",
            "-of", "json",
            video_path,
        ]);

        let output = cmd.output()?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(AppError::FFprobe(format!("ffprobe failed: {}", stderr)));
        }

        let stdout_str = String::from_utf8_lossy(&output.stdout);
        let parsed: serde_json::Value = serde_json::from_str(&stdout_str)?;

        let duration = parsed["format"]["duration"]
            .as_str()
            .and_then(|d| d.parse::<f64>().ok())
            .unwrap_or(0.0);

        let size_bytes = parsed["format"]["size"]
            .as_str()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);

        let format_name = parsed["format"]["format_name"]
            .as_str()
            .unwrap_or("unknown")
            .to_string();

        let mut width = 0;
        let mut height = 0;
        let mut fps = 24.0;
        let mut has_audio = false;

        if let Some(streams) = parsed["streams"].as_array() {
            for stream in streams {
                let codec_type = stream["codec_type"].as_str().unwrap_or("");
                if codec_type == "video" {
                    width = stream["width"].as_u64().unwrap_or(0) as u32;
                    height = stream["height"].as_u64().unwrap_or(0) as u32;
                    
                    if let Some(r_frame_rate) = stream["r_frame_rate"].as_str() {
                        let parts: Vec<&str> = r_frame_rate.split('/').collect();
                        if parts.len() == 2 {
                            if let (Ok(num), Ok(den)) = (parts[0].parse::<f64>(), parts[1].parse::<f64>()) {
                                if den > 0.0 {
                                    fps = num / den;
                                }
                            }
                        }
                    }
                } else if codec_type == "audio" {
                    has_audio = true;
                }
            }
        }

        let aspect_ratio = if width > 0 && height > 0 {
            format!("{}:{}", width, height)
        } else {
            "unknown".to_string()
        };

        Ok(VideoMetadata {
            duration,
            width,
            height,
            aspect_ratio,
            fps,
            has_audio,
            format_name,
            size_bytes,
        })
    }
}
