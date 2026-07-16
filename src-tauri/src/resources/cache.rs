use std::fs;
use std::path::{Path, PathBuf};
use crate::errors::AppResult;

#[derive(Clone)]
pub struct CacheManager {
    base_dir: PathBuf,
}

impl CacheManager {
    pub fn new<P: AsRef<Path>>(workspace_dir: P) -> Self {
        let base_dir = workspace_dir.as_ref().join(".cache");
        CacheManager { base_dir }
    }

    pub fn init(&self) -> AppResult<()> {
        fs::create_dir_all(self.preview_dir())?;
        fs::create_dir_all(self.thumbnail_dir())?;
        fs::create_dir_all(self.logs_dir())?;
        fs::create_dir_all(self.temp_dir())?;
        Ok(())
    }

    pub fn base_dir(&self) -> PathBuf {
        self.base_dir.clone()
    }

    pub fn preview_dir(&self) -> PathBuf {
        self.base_dir.join("preview")
    }

    pub fn thumbnail_dir(&self) -> PathBuf {
        self.base_dir.join("thumbnails")
    }

    pub fn logs_dir(&self) -> PathBuf {
        self.base_dir.join("logs")
    }

    pub fn temp_dir(&self) -> PathBuf {
        self.base_dir.join("temp")
    }

    pub fn clear(&self) -> AppResult<()> {
        if self.base_dir.exists() {
            fs::remove_dir_all(&self.base_dir)?;
        }
        self.init()?;
        Ok(())
    }
}
