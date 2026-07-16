pub mod model;

use std::fs;
use std::path::Path;
use crate::errors::{AppResult, AppError};
pub use model::ProjectData;

pub struct ProjectManager;

impl ProjectManager {
    pub fn save<P: AsRef<Path>>(file_path: P, mut data: ProjectData) -> AppResult<()> {
        let file_path = file_path.as_ref();
        let project_dir = file_path.parent().ok_or_else(|| {
            AppError::Project("Invalid project file path".to_string())
        })?;

        // Convert absolute paths to relative paths (if within project dir)
        data.imported_videos = data
            .imported_videos
            .into_iter()
            .map(|p| Self::make_relative(project_dir, &p))
            .collect();

        data.imported_assets = data
            .imported_assets
            .into_iter()
            .map(|mut asset| {
                asset.path = Self::make_relative(project_dir, &asset.path);
                asset
            })
            .collect();

        if !data.background.image_path.is_empty() {
            data.background.image_path = Self::make_relative(project_dir, &data.background.image_path);
        }

        for overlay in &mut data.media_overlays {
            if !overlay.path.is_empty() {
                overlay.path = Self::make_relative(project_dir, &overlay.path);
            }
        }

        let content = serde_json::to_string_pretty(&data)?;
        fs::write(file_path, content)?;
        Ok(())
    }

    pub fn load<P: AsRef<Path>>(file_path: P) -> AppResult<ProjectData> {
        let file_path = file_path.as_ref();
        let project_dir = file_path.parent().ok_or_else(|| {
            AppError::Project("Invalid project file path".to_string())
        })?;

        let content = fs::read_to_string(file_path)?;
        let mut data: ProjectData = serde_json::from_str(&content)?;

        // Resolve relative paths back to absolute paths
        data.imported_videos = data
            .imported_videos
            .into_iter()
            .map(|p| Self::make_absolute(project_dir, &p))
            .collect();

        data.imported_assets = data
            .imported_assets
            .into_iter()
            .map(|mut asset| {
                asset.path = Self::make_absolute(project_dir, &asset.path);
                asset
            })
            .collect();

        // Migrate legacy imported_videos to imported_assets on load if empty
        if data.imported_assets.is_empty() && !data.imported_videos.is_empty() {
            for (idx, video_path) in data.imported_videos.iter().enumerate() {
                let name = Path::new(video_path)
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("video");
                let id = format!("asset_legacy_{}_{}", idx, name);
                data.imported_assets.push(crate::config::model::ProjectAsset {
                    id,
                    path: video_path.clone(),
                });
            }
        }

        if !data.background.image_path.is_empty() {
            data.background.image_path = Self::make_absolute(project_dir, &data.background.image_path);
        }

        for overlay in &mut data.media_overlays {
            if !overlay.path.is_empty() {
                overlay.path = Self::make_absolute(project_dir, &overlay.path);
            }
        }

        Ok(data)
    }

    fn make_relative(base_dir: &Path, target_path: &str) -> String {
        let target = Path::new(target_path);
        if !target.is_absolute() {
            return target_path.to_string();
        }
        if let Ok(rel) = target.strip_prefix(base_dir) {
            return rel.to_string_lossy().replace("\\", "/");
        }
        target_path.to_string()
    }

    fn make_absolute(base_dir: &Path, target_path: &str) -> String {
        let target = Path::new(target_path);
        if target.is_absolute() {
            return target_path.to_string();
        }
        let abs = base_dir.join(target);
        abs.to_string_lossy().replace("\\", "/")
    }
}
