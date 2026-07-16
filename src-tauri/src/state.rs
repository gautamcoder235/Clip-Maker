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
        let workspace_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

        // Resolve bundled binaries first, or fall back to system PATH
        let resource_dir = app_handle.path().resource_dir().ok();
        
        let ffmpeg_path = resource_dir
            .as_ref()
            .map(|d| d.join("binaries/ffmpeg.exe"))
            .filter(|p| p.exists())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "ffmpeg".to_string());

        let ffprobe_path = resource_dir
            .as_ref()
            .map(|d| d.join("binaries/ffprobe.exe"))
            .filter(|p| p.exists())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| "ffprobe".to_string());

        let config_manager = ConfigManager::new(&app_dir);
        let cache_manager = CacheManager::new(&workspace_dir);
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
}
