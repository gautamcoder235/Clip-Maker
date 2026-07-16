use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::os::windows::process::CommandExt;
use std::sync::atomic::Ordering;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

use crate::errors::{AppResult, AppError};
use crate::jobs::JobManager;
use crate::ffmpeg::builder::FFmpegBuilder;

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct ProcessingService {
    app_handle: AppHandle,
    ffmpeg_path: String,
}

impl ProcessingService {
    pub fn new(app_handle: AppHandle, ffmpeg_path: &str) -> Self {
        ProcessingService {
            app_handle,
            ffmpeg_path: ffmpeg_path.to_string(),
        }
    }

    pub fn execute_render_job(
        &self,
        job_id: &str,
        duration: f64,
        builder: &mut FFmpegBuilder,
        job_manager: &JobManager,
    ) -> AppResult<()> {
        let args = builder.build();

        let mut cmd = Command::new(&self.ffmpeg_path);
        
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        cmd.args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = cmd.spawn()?;
        let stderr = child.stderr.take().ok_or_else(|| {
            AppError::FFmpeg("Failed to capture FFmpeg stderr".to_string())
        })?;

        // Register the active child handle in JobManager
        let cancel_flag = job_manager.register_process(job_id, child);

        job_manager.update_job_status(job_id, "Encoding");
        self.app_handle.emit("job-started", job_id)?;

        let reader = BufReader::new(stderr);
        let start_time = Instant::now();

        for line_result in reader.lines() {
            if cancel_flag.load(Ordering::SeqCst) {
                return Err(AppError::Job("Render job cancelled".to_string()));
            }

            if let Ok(line) = line_result {
                // Pipe low-level log lines to stdout/logs
                let _ = self.app_handle.emit("ffmpeg-log", (job_id, line.clone()));

                // Parse progress
                // Line format typically contains: frame=  345 fps= 24 q=-1.0 Lsize=    1234kB time=00:00:14.34 bitrate= 703.1kbits/s speed=2.34x
                if line.contains("time=") {
                    if let Some(time_str) = self.extract_value(&line, "time=") {
                        let parts: Vec<&str> = time_str.split(':').collect();
                        if parts.len() == 3 {
                            if let (Ok(h), Ok(m), Ok(s_raw)) = (
                                parts[0].parse::<f64>(),
                                parts[1].parse::<f64>(),
                                parts[2].parse::<f64>(),
                            ) {
                                let elapsed_seconds = h * 3600.0 + m * 60.0 + s_raw;
                                let progress = if duration > 0.0 {
                                    ((elapsed_seconds / duration) * 100.0).min(99.9) as f32
                                } else {
                                    0.0
                                };

                                let speed_str = self.extract_value(&line, "speed=")
                                    .unwrap_or_else(|| "1.0x".to_string());

                                let elapsed_run = start_time.elapsed().as_secs();
                                
                                let speed_val = speed_str.replace("x", "")
                                    .trim()
                                    .parse::<f64>()
                                    .unwrap_or(1.0);

                                let eta = if speed_val > 0.0 {
                                    let remaining_secs = (duration - elapsed_seconds).max(0.0);
                                    Some((remaining_secs / speed_val) as u64)
                                } else {
                                    None
                                };

                                job_manager.update_job_progress(
                                    job_id,
                                    progress,
                                    &speed_str,
                                    elapsed_run,
                                    eta,
                                );

                                // Emit progress update event
                                let _ = self.app_handle.emit(
                                    "job-progress",
                                    (job_id, progress, speed_str, elapsed_run, eta),
                                );
                            }
                        }
                    }
                }
            }
        }

        // Wait for exit
        job_manager.update_job_status(job_id, "Finalizing");
        
        // We'll run a quick process status check by attempting to retrieve the process child from standard wait
        // Wait, since complete_job cleans up the child from JobManager, we just call wait on the child if it wasn't cancelled
        if cancel_flag.load(Ordering::SeqCst) {
            return Err(AppError::Job("Render job cancelled".to_string()));
        }

        job_manager.complete_job(job_id);
        self.app_handle.emit("job-completed", job_id)?;

        Ok(())
    }

    fn extract_value(&self, line: &str, key: &str) -> Option<String> {
        if let Some(idx) = line.find(key) {
            let start = idx + key.len();
            let rest = &line[start..];
            let end = rest.find(' ').unwrap_or(rest.len());
            Some(rest[..end].trim().to_string())
        } else {
            None
        }
    }
}
