use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use crate::errors::{AppResult, AppError};

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct ThumbnailGenerator {
    ffmpeg_path: String,
}

impl ThumbnailGenerator {
    pub fn new(ffmpeg_path: &str) -> Self {
        ThumbnailGenerator {
            ffmpeg_path: ffmpeg_path.to_string(),
        }
    }

    pub fn generate_frame(
        &self,
        video_path: &str,
        time_seconds: f64,
        width: u32,
        output_path: &Path,
    ) -> AppResult<()> {
        let mut cmd = Command::new(&self.ffmpeg_path);
        
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        cmd.args([
            "-y",
            "-ss", &time_seconds.to_string(),
            "-i", video_path,
            "-vframes", "1",
            "-vf", &format!("scale={}:-1", width),
            &output_path.to_string_lossy(),
        ]);

        let output = cmd.output()?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(AppError::FFmpeg(format!("Failed to generate thumbnail: {}", stderr)));
        }

        Ok(())
    }

    pub fn generate_timeline_sprites(
        &self,
        video_path: &str,
        duration: f64,
        count: usize,
        width: u32,
        output_dir: &Path,
    ) -> AppResult<Vec<PathBuf>> {
        let mut paths = Vec::new();
        let interval = duration / (count as f64);
        
        for i in 0..count {
            let time = (i as f64) * interval;
            let output_name = format!("sprite_{:03}.png", i);
            let output_path = output_dir.join(output_name);
            
            self.generate_frame(video_path, time, width, &output_path)?;
            paths.push(output_path);
        }

        Ok(paths)
    }
}
