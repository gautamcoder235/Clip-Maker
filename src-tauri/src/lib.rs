pub mod errors;
pub mod state;
pub mod commands;
pub mod config;
pub mod project;
pub mod resources;
pub mod jobs;
pub mod services;
pub mod ffmpeg;
pub mod fonts;

use tauri::Manager;
use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.app_handle().try_state::<AppState>() {
                    let _ = state.job_manager.cancel_all();
                }
            }
        })
        .setup(|app| {
            let app_handle = app.handle().clone();
            match AppState::init(&app_handle) {
                Ok(state) => {
                    app.manage(state);
                }
                Err(err) => {
                    eprintln!("Failed to initialize app state: {:?}", err);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::select_video_file,
            commands::select_output_folder,
            commands::select_project_file,
            commands::get_config,
            commands::save_config,
            commands::load_project,
            commands::save_project,
            commands::import_file,
            commands::generate_preview_clip,
            commands::start_render_queue,
            commands::cancel_render_job,
            commands::cancel_all_jobs,
            commands::get_jobs_list,
            commands::get_fonts_list,
            commands::clear_cache,
            commands::save_autosave,
            commands::load_autosave
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
