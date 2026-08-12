use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use std::path::Path;
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::errors::AppResult;
use crate::resources::cache::CacheManager;
use crate::resources::thumbnails::ThumbnailGenerator;
use crate::ffmpeg::probe::{VideoProbe, VideoMetadata};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportedAsset {
    pub hash: String,
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub r#type: String, // "video", "image", "audio"
    pub thumbnail_path: Option<String>,
    pub timeline_thumbnails: Vec<String>,
    pub metadata: Option<VideoMetadata>,
    pub proxy_path: Option<String>,
}

#[derive(Clone)]
pub struct ResourceManager {
    cache: CacheManager,
    ffmpeg_path: String,
    ffprobe_path: String,
    assets: Arc<Mutex<HashMap<String, ImportedAsset>>>,
}

impl ResourceManager {
    pub fn new(cache: CacheManager, ffmpeg_path: &str, ffprobe_path: &str) -> Self {
        ResourceManager {
            cache,
            ffmpeg_path: ffmpeg_path.to_string(),
            ffprobe_path: ffprobe_path.to_string(),
            assets: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn import_asset(&self, path: &str) -> AppResult<ImportedAsset> {
        let abs_path = std::fs::canonicalize(path)?;
        let abs_path_str = abs_path.to_string_lossy()
            .trim_start_matches(r"\\?\")
            .replace("\\", "/");
        
        let hash = self.get_asset_hash(&abs_path_str);
        
        {
            let assets = self.assets.lock().unwrap();
            if let Some(asset) = assets.get(&hash) {
                return Ok(asset.clone());
            }
        }

        let name = Path::new(&abs_path_str)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        let metadata = std::fs::metadata(&abs_path_str)?;
        let size_bytes = metadata.len();
        
        let ext = Path::new(&abs_path_str)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        let r#type = match ext.as_str() {
            "mp4" | "mkv" | "avi" | "mov" | "webm" | "flv" | "wmv" => "video",
            "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" => "image",
            "mp3" | "wav" | "ogg" | "m4a" | "aac" | "flac" => "audio",
            _ => "video", // default fallback
        };

        let mut video_metadata = None;
        let mut thumbnail_path = None;
        let mut timeline_thumbnails = Vec::new();

        let mut proxy_path = None;

        if r#type == "video" {
            // Probe video details
            let probe = VideoProbe::new(&self.ffprobe_path);
            let meta = probe.probe(&abs_path_str)?;
            video_metadata = Some(meta.clone());

            // Generate thumbnail
            let thumb_generator = ThumbnailGenerator::new(&self.ffmpeg_path);
            let thumb_filename = format!("{}.png", hash);
            let thumb_dest = self.cache.thumbnail_dir().join(&thumb_filename);
            
            // Extract thumbnail at 10% duration or 1s
            let time_seconds = (meta.duration * 0.1).min(5.0);
            if thumb_generator.generate_frame(&abs_path_str, time_seconds, 320, &thumb_dest).is_ok() {
                thumbnail_path = Some(thumb_dest.to_string_lossy().replace("\\", "/"));
            }

            // Generate small 5-frame timeline previews in background directory
            let timeline_dir = self.cache.thumbnail_dir().join(&hash);
            std::fs::create_dir_all(&timeline_dir)?;
            if let Ok(sprites) = thumb_generator.generate_timeline_sprites(
                &abs_path_str,
                meta.duration,
                5,
                160,
                &timeline_dir,
            ) {
                timeline_thumbnails = sprites
                    .into_iter()
                    .map(|p| p.to_string_lossy().replace("\\", "/"))
                    .collect();
            }

            // Generate Proxy for unsupported formats for live DOM preview
            if !matches!(ext.as_str(), "mp4" | "webm") {
                let proxy_filename = format!("{}_proxy.mp4", hash);
                let proxy_dest = self.cache.thumbnail_dir().join(&proxy_filename);
                
                if !proxy_dest.exists() {
                    let mut cmd = std::process::Command::new(&self.ffmpeg_path);
                    cmd.args(&[
                        "-y",
                        "-i", &abs_path_str,
                        "-vf", "scale=-2:720", // Fast 720p proxy
                        "-c:v", "libx264",
                        "-preset", "ultrafast",
                        "-crf", "28",
                        "-c:a", "aac",
                        "-b:a", "128k",
                        &proxy_dest.to_string_lossy(),
                    ]);
                    
                    #[cfg(target_os = "windows")]
                    cmd.creation_flags(0x08000000); // Hide console window
                    
                    if let Ok(status) = cmd.status() {
                        if status.success() {
                            proxy_path = Some(proxy_dest.to_string_lossy().replace("\\", "/"));
                        }
                    }
                } else {
                    proxy_path = Some(proxy_dest.to_string_lossy().replace("\\", "/"));
                }
            }
        } else if r#type == "image" {
            // Copy or link image as its thumbnail
            thumbnail_path = Some(abs_path_str.clone());
        }

        let asset = ImportedAsset {
            hash: hash.clone(),
            path: abs_path_str,
            name,
            size_bytes,
            r#type: r#type.to_string(),
            thumbnail_path,
            timeline_thumbnails,
            metadata: video_metadata,
            proxy_path,
        };

        self.assets.lock().unwrap().insert(hash, asset.clone());
        Ok(asset)
    }

    pub fn get_asset(&self, hash: &str) -> Option<ImportedAsset> {
        self.assets.lock().unwrap().get(hash).cloned()
    }

    pub fn remove_asset(&self, hash: &str) {
        self.assets.lock().unwrap().remove(hash);
    }

    fn get_asset_hash(&self, path: &str) -> String {
        let mut hasher = DefaultHasher::new();
        path.hash(&mut hasher);
        if let Ok(metadata) = std::fs::metadata(path) {
            metadata.len().hash(&mut hasher);
            if let Ok(mod_time) = metadata.modified() {
                mod_time.hash(&mut hasher);
            }
        }
        format!("{:x}", hasher.finish())
    }
}
