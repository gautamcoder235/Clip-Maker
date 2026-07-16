pub mod model;

use std::fs;
use std::path::{Path, PathBuf};
use crate::errors::AppResult;
pub use model::AppConfig;

pub struct ConfigManager {
    config_path: PathBuf,
}

impl ConfigManager {
    pub fn new<P: AsRef<Path>>(config_dir: P) -> Self {
        let config_path = config_dir.as_ref().join("config.json");
        ConfigManager { config_path }
    }

    pub fn load(&self) -> AppResult<AppConfig> {
        if !self.config_path.exists() {
            let default_config = AppConfig::default();
            self.save(&default_config)?;
            return Ok(default_config);
        }

        let content = fs::read_to_string(&self.config_path)?;
        
        // Parse into generic serde_json Value first for migration inspection
        let raw_val: serde_json::Value = serde_json::from_str(&content)?;
        
        let version = raw_val
            .get("version")
            .and_then(|v| v.as_u64())
            .unwrap_or(1) as u32;

        let migrated_config = if version < 1 {
            // Placeholder: perform migration from pre-v1 to v1
            AppConfig::default()
        } else {
            // Directly deserialize
            match serde_json::from_value::<AppConfig>(raw_val) {
                Ok(cfg) => cfg,
                Err(err) => {
                    eprintln!("Failed to parse config: {}. Resetting to defaults.", err);
                    let default_config = AppConfig::default();
                    self.save(&default_config)?;
                    default_config
                }
            }
        };

        Ok(migrated_config)
    }

    pub fn save(&self, config: &AppConfig) -> AppResult<()> {
        if let Some(parent) = self.config_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(config)?;
        fs::write(&self.config_path, content)?;
        Ok(())
    }
}
