use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use crate::errors::AppResult;

pub struct FFmpegLogger {
    log_file_path: std::path::PathBuf,
    error_file_path: std::path::PathBuf,
}

impl FFmpegLogger {
    pub fn new<P: AsRef<Path>>(logs_dir: P) -> Self {
        FFmpegLogger {
            log_file_path: logs_dir.as_ref().join("ffmpeg.log"),
            error_file_path: logs_dir.as_ref().join("errors.log"),
        }
    }

    pub fn write_stdout(&self, data: &str) -> AppResult<()> {
        if let Some(parent) = self.log_file_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_file_path)?;
        
        file.write_all(data.as_bytes())?;
        Ok(())
    }

    pub fn write_stderr(&self, data: &str) -> AppResult<()> {
        if let Some(parent) = self.log_file_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        // Write to regular ffmpeg.log
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_file_path)?;
        file.write_all(data.as_bytes())?;

        // Write to error log if it contains errors
        let lowered = data.to_lowercase();
        if lowered.contains("error") || lowered.contains("failed") || lowered.contains("invalid") {
            let mut err_file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&self.error_file_path)?;
            err_file.write_all(data.as_bytes())?;
        }

        Ok(())
    }
}
