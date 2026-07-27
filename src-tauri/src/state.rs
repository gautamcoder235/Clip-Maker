use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::config::ConfigManager;
use crate::resources::cache::CacheManager;
use crate::resources::manager::ResourceManager;
use crate::jobs::JobManager;
use crate::fonts::{FontScanner, SystemFont};
use crate::errors::AppResult;

pub struct AppState {
    pub ffmpeg_path: String,
    pub ffprobe_path: String,
    pub config_manager: ConfigManager,
    pub cache_manager: CacheManager,
    pub resource_manager: ResourceManager,
    pub job_manager: JobManager,
    pub fonts: Vec<SystemFont>,
}

impl AppState {
    pub fn init(app_handle: &AppHandle) -> AppResult<Self> {
        let app_dir = app_handle.path().app_data_dir()?;
        let cache_dir = app_handle.path().app_cache_dir().unwrap_or_else(|_| app_dir.join("cache"));

        // Resolve bundled binaries: try executable's directory first (works in NSIS installs),
        // then resource_dir (works in dev mode), then fall back to system PATH.
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()));
        let resource_dir = app_handle.path().resource_dir().ok();

        let ffmpeg_path = Self::resolve_binary("ffmpeg.exe", &exe_dir, &resource_dir);
        let ffprobe_path = Self::resolve_binary("ffprobe.exe", &exe_dir, &resource_dir);

        let config_manager = ConfigManager::new(&app_dir);
        let cache_manager = CacheManager::new(&cache_dir);
        cache_manager.init()?;

        let resource_manager = ResourceManager::new(
            cache_manager.clone(),
            &ffmpeg_path,
            &ffprobe_path,
        );

        let job_manager = JobManager::new();
        let fonts = FontScanner::scan_system_fonts();

        Ok(AppState {
            ffmpeg_path,
            ffprobe_path,
            config_manager,
            cache_manager,
            resource_manager,
            job_manager,
            fonts,
        })
    }

    /// Search for a binary in multiple candidate directories.
    /// Priority: exe_dir/binaries/ → exe_dir/ → resource_dir/binaries/ → resource_dir/ → system PATH
    fn resolve_binary(name: &str, exe_dir: &Option<PathBuf>, resource_dir: &Option<PathBuf>) -> String {
        let candidates: Vec<PathBuf> = [
            exe_dir.as_ref().map(|d| d.join("binaries").join(name)),
            exe_dir.as_ref().map(|d| d.join(name)),
            resource_dir.as_ref().map(|d| d.join("binaries").join(name)),
            resource_dir.as_ref().map(|d| d.join(name)),
        ]
        .into_iter()
        .flatten()
        .collect();

        for candidate in &candidates {
            if candidate.exists() {
                eprintln!("[AppState] Resolved {} -> {}", name, candidate.display());
                return candidate.to_string_lossy().to_string();
            }
        }

        // Fall back to bare name (system PATH lookup)
        eprintln!("[AppState] {} not found in bundled paths, falling back to system PATH", name);
        name.replace(".exe", "").to_string()
    }
}
