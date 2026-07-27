use std::collections::HashMap;
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

use crate::errors::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderJob {
    pub id: String,
    pub name: String,
    pub input_file: String,
    pub output_file: String,
    pub clip_index: u32,
    pub total_clips: u32,
    pub status: String, // "Queued", "Preparing", "Encoding", "Finalizing", "Completed", "Cancelled", "Failed"
    pub progress: f32,
    pub speed: String,
    pub elapsed_seconds: u64,
    pub eta_seconds: Option<u64>,
    pub encoder: String,
    pub start_time: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
}

pub struct ActiveProcess {
    pub child: Arc<Mutex<Option<std::process::Child>>>,
    pub cancel_flag: Arc<AtomicBool>,
}

#[derive(Clone)]
pub struct JobManager {
    jobs: Arc<Mutex<HashMap<String, RenderJob>>>,
    processes: Arc<Mutex<HashMap<String, ActiveProcess>>>,
}

impl JobManager {
    pub fn new() -> Self {
        JobManager {
            jobs: Arc::new(Mutex::new(HashMap::new())),
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn create_job(
        &self,
        name: &str,
        input_file: &str,
        output_file: &str,
        clip_index: u32,
        total_clips: u32,
        encoder: &str,
    ) -> String {
        let id = Uuid::new_v4().to_string();
        let job = RenderJob {
            id: id.clone(),
            name: name.to_string(),
            input_file: input_file.to_string(),
            output_file: output_file.to_string(),
            clip_index,
            total_clips,
            status: "Queued".to_string(),
            progress: 0.0,
            speed: "--".to_string(),
            elapsed_seconds: 0,
            eta_seconds: None,
            encoder: encoder.to_string(),
            start_time: None,
            error_message: None,
            created_at: Utc::now(),
        };

        self.jobs.lock().unwrap().insert(id.clone(), job);
        id
    }

    pub fn register_process(&self, job_id: &str, child: std::process::Child) -> Arc<AtomicBool> {
        let child_arc = Arc::new(Mutex::new(Some(child)));
        let cancel_flag = Arc::new(AtomicBool::new(false));

        self.processes.lock().unwrap().insert(
            job_id.to_string(),
            ActiveProcess {
                child: child_arc,
                cancel_flag: cancel_flag.clone(),
            },
        );

        cancel_flag
    }

    pub fn update_job_status(&self, job_id: &str, status: &str) {
        let mut jobs = self.jobs.lock().unwrap();
        if let Some(job) = jobs.get_mut(job_id) {
            job.status = status.to_string();
            if status == "Encoding" && job.start_time.is_none() {
                job.start_time = Some(Utc::now());
            }
        }
    }

    pub fn update_job_progress(&self, job_id: &str, progress: f32, speed: &str, elapsed: u64, eta: Option<u64>) {
        let mut jobs = self.jobs.lock().unwrap();
        if let Some(job) = jobs.get_mut(job_id) {
            job.progress = progress;
            job.speed = speed.to_string();
            job.elapsed_seconds = elapsed;
            job.eta_seconds = eta;
        }
    }

    pub fn fail_job(&self, job_id: &str, error: &str) {
        let mut jobs = self.jobs.lock().unwrap();
        if let Some(job) = jobs.get_mut(job_id) {
            if job.status != "Cancelled" {
                job.status = "Failed".to_string();
                job.error_message = Some(error.to_string());
            }
        }
        self.processes.lock().unwrap().remove(job_id);
    }

    pub fn complete_job(&self, job_id: &str) {
        let mut jobs = self.jobs.lock().unwrap();
        if let Some(job) = jobs.get_mut(job_id) {
            job.status = "Completed".to_string();
            job.progress = 100.0;
        }
        self.processes.lock().unwrap().remove(job_id);
    }

    /// Take the child process out of the active map and wait for its exit status.
    /// Returns None if the process was already consumed.
    pub fn wait_process(&self, job_id: &str) -> Option<std::io::Result<std::process::ExitStatus>> {
        let mut processes = self.processes.lock().unwrap();
        if let Some(proc) = processes.get_mut(job_id) {
            let mut guard = proc.child.lock().unwrap();
            if let Some(mut child) = guard.take() {
                return Some(child.wait());
            }
        }
        None
    }

    pub fn cancel_job(&self, job_id: &str) -> AppResult<()> {
        {
            let mut jobs = self.jobs.lock().unwrap();
            if let Some(job) = jobs.get_mut(job_id) {
                job.status = "Cancelled".to_string();
            }
        }

        let mut processes = self.processes.lock().unwrap();
        if let Some(proc) = processes.remove(job_id) {
            proc.cancel_flag.store(true, Ordering::SeqCst);
            let mut guard = proc.child.lock().unwrap();
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }

        Ok(())
    }

    pub fn cancel_all(&self) -> AppResult<()> {
        let mut jobs = self.jobs.lock().unwrap();
        for job in jobs.values_mut() {
            if job.status == "Queued" || job.status == "Preparing" || job.status == "Encoding" {
                job.status = "Cancelled".to_string();
            }
        }

        let mut processes = self.processes.lock().unwrap();
        for proc in processes.values_mut() {
            proc.cancel_flag.store(true, Ordering::SeqCst);
            let mut guard = proc.child.lock().unwrap();
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
        processes.clear();

        Ok(())
    }

    pub fn get_job(&self, job_id: &str) -> Option<RenderJob> {
        self.jobs.lock().unwrap().get(job_id).cloned()
    }

    pub fn get_all_jobs(&self) -> Vec<RenderJob> {
        let jobs = self.jobs.lock().unwrap();
        let mut list: Vec<RenderJob> = jobs.values().cloned().collect();
        // Sort serially by creation time, with clip_index as tiebreaker for tight loops
        list.sort_by(|a, b| {
            let cmp = a.created_at.cmp(&b.created_at);
            if cmp == std::cmp::Ordering::Equal {
                a.clip_index.cmp(&b.clip_index)
            } else {
                cmp
            }
        });
        list
    }

    pub fn clear_completed(&self) {
        let mut jobs = self.jobs.lock().unwrap();
        jobs.retain(|_, job| job.status != "Completed" && job.status != "Cancelled" && job.status != "Failed");
    }
}
