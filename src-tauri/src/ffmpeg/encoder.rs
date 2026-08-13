#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct EncoderDetector {
    ffmpeg_path: String,
}

impl EncoderDetector {
    pub fn new(ffmpeg_path: &str) -> Self {
        EncoderDetector {
            ffmpeg_path: ffmpeg_path.to_string(),
        }
    }

    pub fn detect_gpu_encoder(&self) -> Option<String> {
        let candidates = vec!["h264_nvenc", "h264_qsv", "h264_amf", "h264_videotoolbox"];

        let mut cmd = Command::new(&self.ffmpeg_path);
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        cmd.args(["-hide_banner", "-encoders"]);

        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout).to_string()
                    + &String::from_utf8_lossy(&output.stderr);

                for enc in candidates {
                    if text.contains(enc) {
                        return Some(enc.to_string());
                    }
                }
            }
        }
        None
    }

    pub fn map_preset(encoder: &str, preset: &str) -> String {
        let value = preset.trim().to_lowercase();
        let is_nvenc = encoder.contains("nvenc");
        let is_amf = encoder.contains("amf");

        if is_nvenc {
            match value.as_str() {
                "ultrafast" | "superfast" | "veryfast" => "p1".to_string(),
                "faster" | "fast" => "p2".to_string(),
                "medium" => "p3".to_string(),
                "slow" => "p5".to_string(),
                "slower" | "veryslow" => "p7".to_string(),
                _ => "p2".to_string(),
            }
        } else if is_amf {
            match value.as_str() {
                "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" => "speed".to_string(),
                "slow" | "slower" | "veryslow" => "quality".to_string(),
                _ => "balanced".to_string(),
            }
        } else {
            preset.to_string()
        }
    }
}
