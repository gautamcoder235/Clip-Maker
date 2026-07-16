use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
pub enum AppError {
    #[error("I/O error: {0}")]
    Io(String),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Project error: {0}")]
    Project(String),

    #[error("FFmpeg error: {0}")]
    FFmpeg(String),

    #[error("FFprobe error: {0}")]
    FFprobe(String),

    #[error("Job error: {0}")]
    Job(String),

    #[error("Resource manager error: {0}")]
    Resource(String),

    #[error("Font scan error: {0}")]
    Font(String),

    #[error("System error: {0}")]
    System(String),
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Serialization(err.to_string())
    }
}

impl From<tauri::Error> for AppError {
    fn from(err: tauri::Error) -> Self {
        AppError::System(err.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

