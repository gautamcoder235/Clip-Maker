use tauri::{AppHandle, State, Manager, Emitter};
use crate::state::AppState;
use crate::errors::AppResult;
use crate::config::AppConfig;
use crate::project::{ProjectManager, ProjectData};
use crate::resources::manager::ImportedAsset;
use crate::jobs::RenderJob;
use crate::fonts::SystemFont;
use crate::services::PreviewService;
use crate::services::ExportService;

#[tauri::command]
pub async fn select_video_file() -> AppResult<String> {
    let file = rfd::FileDialog::new()
        .add_filter("Media Files", &["mp4", "mkv", "avi", "mov", "png", "jpg", "jpeg", "webp"])
        .pick_file();
    
    match file {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Ok("".to_string()),
    }
}

#[tauri::command]
pub async fn select_output_folder() -> AppResult<String> {
    let folder = rfd::FileDialog::new()
        .pick_folder();
    
    match folder {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Ok("".to_string()),
    }
}

#[tauri::command]
pub async fn select_project_file(mode: String) -> AppResult<String> {
    let dialog = rfd::FileDialog::new()
        .add_filter("Clip Maker Project (*.clipmaker)", &["clipmaker"]);
    
    let file = if mode == "save" {
        dialog.save_file()
    } else {
        dialog.pick_file()
    };
    
    match file {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Ok("".to_string()),
    }
}

#[tauri::command]
pub async fn get_config(state: State<'_, AppState>) -> AppResult<AppConfig> {
    state.config_manager.load()
}

#[tauri::command]
pub async fn save_config(state: State<'_, AppState>, config: AppConfig) -> AppResult<()> {
    state.config_manager.save(&config)
}

#[tauri::command]
pub async fn load_project(file_path: String) -> AppResult<ProjectData> {
    ProjectManager::load(file_path)
}

#[tauri::command]
pub async fn save_project(file_path: String, project: ProjectData) -> AppResult<()> {
    ProjectManager::save(file_path, project)
}

#[tauri::command]
pub async fn import_file(state: State<'_, AppState>, file_path: String) -> AppResult<ImportedAsset> {
    state.resource_manager.import_asset(&file_path)
}

#[tauri::command]
pub async fn generate_preview_clip(state: State<'_, AppState>, config: AppConfig) -> AppResult<String> {
    let preview_service = PreviewService::new(
        state.cache_manager.clone(),
        &state.ffmpeg_path,
    );
    preview_service.generate_preview(&config)
}

#[tauri::command]
pub async fn start_render_queue(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    config: AppConfig,
    start_clip: u32,
    end_clip: u32,
) -> AppResult<Vec<String>> {
    let mut job_ids = Vec::new();
    let export_service = ExportService::new(
        app_handle.clone(),
        &state.ffmpeg_path,
    );

    let total_clips = if end_clip >= start_clip {
        end_clip - start_clip + 1
    } else {
        1
    };
    let workers = config.parallel_workers.max(1) as usize;
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(workers));

    let mut jobs_to_run = Vec::new();

    for clip_idx in start_clip..=end_clip {
        let job_name = format!("Render Clip {}", clip_idx);
        
        let input_file = if !config.input_paths.is_empty() { &config.input_paths[0] } else { &config.input_path };
        let movie_name = std::path::Path::new(input_file)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("clip");
        let output_filename = format!("{}_part_{:03}.mp4", movie_name, clip_idx);
        let output_filepath = std::path::Path::new(&config.output_path).join(&output_filename);
        let output_file_str = output_filepath.to_string_lossy().replace("\\", "/");

        let job_id = state.job_manager.create_job(
            &job_name,
            input_file,
            &output_file_str,
            clip_idx,
            total_clips,
            &state.ffmpeg_path,
        );

        job_ids.push(job_id.clone());
        jobs_to_run.push((clip_idx, job_id));
    }


    let export_service_arc = std::sync::Arc::new(export_service);
    let cfg = config.clone();
    let jobs_manager = state.job_manager.clone();
    let fonts_list = state.fonts.clone();
    let app_handle_clone = app_handle.clone();

    // Spawn a single orchestrator task to enforce strict numerical order
    tokio::spawn(async move {
        for (clip_idx, j_id) in jobs_to_run {
            // Strictly wait for an available worker slot before proceeding to next clip
            let permit = semaphore.clone().acquire_owned().await.unwrap();
            
            let export = export_service_arc.clone();
            let config_clone = cfg.clone();
            let jobs = jobs_manager.clone();
            let j_id_clone = j_id.clone();
            let app_handle_inner = app_handle_clone.clone();
            let fonts = fonts_list.clone();
            
            tokio::spawn(async move {
                let res: AppResult<()> = export.export_clip(&config_clone, clip_idx, total_clips, &j_id_clone, &jobs, &fonts);
                if let Err(e) = res {
                    jobs.fail_job(&j_id_clone, &e.to_string());
                    let _ = app_handle_inner.emit("job-failed", (j_id_clone, e.to_string()));
                }
                // The permit drops here, releasing the slot for the orchestrator to spawn the next clip
                drop(permit);
            });
        }
    });

    Ok(job_ids)
}

#[derive(serde::Deserialize, Clone)]
pub struct BatchRenderRequest {
    config: AppConfig,
    start_clip: u32,
    end_clip: u32,
}

#[tauri::command]
pub async fn start_batch_render_queue(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    requests: Vec<BatchRenderRequest>,
) -> AppResult<Vec<String>> {
    let mut job_ids = Vec::new();
    let export_service = ExportService::new(
        app_handle.clone(),
        &state.ffmpeg_path,
    );

    let mut jobs_to_run = Vec::new();

    // Collect global max workers
    let workers = requests.first().map(|r| r.config.parallel_workers.max(1) as usize).unwrap_or(1);
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(workers));

    for req in requests {
        let total_clips = if req.end_clip >= req.start_clip {
            req.end_clip - req.start_clip + 1
        } else {
            1
        };

        for clip_idx in req.start_clip..=req.end_clip {
            let job_name = format!("Render Clip {}", clip_idx);
            
            let input_file = if !req.config.input_paths.is_empty() { &req.config.input_paths[0] } else { &req.config.input_path };
            let movie_name = std::path::Path::new(input_file)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("clip");
            let output_filename = format!("{}_part_{:03}.mp4", movie_name, clip_idx);
            let output_filepath = std::path::Path::new(&req.config.output_path).join(&output_filename);
            let output_file_str = output_filepath.to_string_lossy().replace("\\", "/");

            let job_id = state.job_manager.create_job(
                &job_name,
                input_file,
                &output_file_str,
                clip_idx,
                total_clips,
                &state.ffmpeg_path,
            );

            job_ids.push(job_id.clone());
            jobs_to_run.push((clip_idx, total_clips, job_id, req.config.clone()));
        }

    }

    let export_service_arc = std::sync::Arc::new(export_service);
    let jobs_manager = state.job_manager.clone();
    let fonts_list = state.fonts.clone();
    let app_handle_clone = app_handle.clone();

    // Spawn a single orchestrator task to enforce strict numerical order
    tokio::spawn(async move {
        for (clip_idx, total_clips, j_id, cfg) in jobs_to_run {
            // Strictly wait for an available worker slot before proceeding to next clip
            let permit = semaphore.clone().acquire_owned().await.unwrap();
            
            let export = export_service_arc.clone();
            let config_clone = cfg;
            let jobs = jobs_manager.clone();
            let j_id_clone = j_id.clone();
            let app_handle_inner = app_handle_clone.clone();
            let fonts = fonts_list.clone();
            
            tokio::spawn(async move {
                let res: AppResult<()> = export.export_clip(&config_clone, clip_idx, total_clips, &j_id_clone, &jobs, &fonts);
                if let Err(e) = res {
                    jobs.fail_job(&j_id_clone, &e.to_string());
                    let _ = app_handle_inner.emit("job-failed", (j_id_clone, e.to_string()));
                }
                // The permit drops here, releasing the slot for the orchestrator to spawn the next clip
                drop(permit);
            });
        }
    });

    Ok(job_ids)
}

#[tauri::command]
pub async fn cancel_render_job(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    job_id: String,
) -> AppResult<()> {
    state.job_manager.cancel_job(&job_id)?;
    let _ = app_handle.emit("job-cancelled", job_id);
    Ok(())
}

#[tauri::command]
pub async fn cancel_all_jobs(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.job_manager.cancel_all()?;
    let _ = app_handle.emit("jobs-cancelled-all", ());
    Ok(())
}

#[tauri::command]
pub async fn get_jobs_list(state: State<'_, AppState>) -> AppResult<Vec<RenderJob>> {
    Ok(state.job_manager.get_all_jobs())
}

#[tauri::command]
pub async fn get_fonts_list(state: State<'_, AppState>) -> AppResult<Vec<SystemFont>> {
    Ok(state.fonts.clone())
}

#[tauri::command]
pub async fn clear_cache(state: State<'_, AppState>) -> AppResult<()> {
    state.cache_manager.clear()
}

#[tauri::command]
pub async fn save_autosave(app_handle: AppHandle, project: ProjectData) -> AppResult<()> {
    let app_dir = app_handle.path().app_data_dir()?;
    if !app_dir.exists() {
        std::fs::create_dir_all(&app_dir)?;
    }
    let autosave_path = app_dir.join("autosave.json");
    let content = serde_json::to_string_pretty(&project)?;
    std::fs::write(autosave_path, content)?;
    Ok(())
}

#[tauri::command]
pub async fn load_autosave(app_handle: AppHandle) -> AppResult<Option<ProjectData>> {
    let app_dir = app_handle.path().app_data_dir()?;
    let autosave_path = app_dir.join("autosave.json");
    if !autosave_path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(autosave_path)?;
    let project: ProjectData = serde_json::from_str(&content)?;
    Ok(Some(project))
}

#[tauri::command]
pub async fn select_zip_file(default_name: String) -> AppResult<String> {
    let dialog = rfd::FileDialog::new()
        .set_file_name(&default_name)
        .add_filter("ZIP Archive (*.zip)", &["zip"]);
    
    let file = dialog.save_file();
    
    match file {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Ok("".to_string()),
    }
}

#[tauri::command]
pub async fn export_clips_as_zip(clip_paths: Vec<String>, zip_output_path: String) -> AppResult<String> {
    use std::io::{Read, Write};
    use crate::errors::AppError;

    let target_path = std::path::Path::new(&zip_output_path);
    if let Some(parent) = target_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::Config(format!("Cannot create parent directory: {}", e)))?;
        }
    }

    let zip_file = std::fs::File::create(&zip_output_path)
        .map_err(|e| AppError::Config(format!("Cannot create ZIP file '{}': {}", zip_output_path, e)))?;
    let mut zip_writer = zip::ZipWriter::new(zip_file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored);

    for path_str in &clip_paths {
        let path = std::path::Path::new(path_str);
        if !path.exists() || path.is_dir() {
            eprintln!("[export_clips_as_zip] Clip path does not exist or is a directory, skipping: {}", path_str);
            continue;
        }


        let file_name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("clip.mp4");

        zip_writer.start_file(file_name, options)
            .map_err(|e| AppError::Config(format!("ZIP write error for '{}': {}", file_name, e)))?;

        let mut file = std::fs::File::open(path)
            .map_err(|e| AppError::Config(format!("Cannot read clip '{}': {}", path_str, e)))?;
        let mut buffer = vec![0u8; 8 * 1024 * 1024]; // 8MB buffer
        loop {
            let bytes_read = file.read(&mut buffer)
                .map_err(|e| AppError::Config(format!("Read error: {}", e)))?;
            if bytes_read == 0 {
                break;
            }
            zip_writer.write_all(&buffer[..bytes_read])
                .map_err(|e| AppError::Config(format!("ZIP write error: {}", e)))?;
        }
    }

    zip_writer.finish()
        .map_err(|e| AppError::Config(format!("ZIP finalize error: {}", e)))?;
    Ok(zip_output_path)
}


