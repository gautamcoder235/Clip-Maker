use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use serde::Serialize;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize)]
pub struct SystemFont {
    pub name: String,
    pub path: String,
}

pub struct FontScanner;

impl FontScanner {
    pub fn scan_system_fonts() -> Vec<SystemFont> {
        let mut fonts = Vec::new();
        
        #[cfg(target_os = "windows")]
        {
            let windir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".to_string());
            let system_fonts_dir = format!("{}\\Fonts", windir);
            
            // 1. Scan System Fonts (HKLM)
            Self::scan_registry("HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts", &system_fonts_dir, &mut fonts);
            
            // 2. Scan User Fonts (HKCU) - Where user-installed Google Fonts reside
            if let Ok(userprofile) = std::env::var("USERPROFILE") {
                let user_fonts_dir = format!("{}\\AppData\\Local\\Microsoft\\Windows\\Fonts", userprofile);
                Self::scan_registry("HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts", &user_fonts_dir, &mut fonts);
            }
        }

        // Add standard fallbacks if list is empty or on other systems
        if fonts.is_empty() {
            fonts.push(SystemFont {
                name: "Arial".to_string(),
                path: "Arial".to_string(),
            });
            fonts.push(SystemFont {
                name: "Courier New".to_string(),
                path: "Courier New".to_string(),
            });
            fonts.push(SystemFont {
                name: "Times New Roman".to_string(),
                path: "Times New Roman".to_string(),
            });
            fonts.push(SystemFont {
                name: "Segoe UI".to_string(),
                path: "Segoe UI".to_string(),
            });
        }

        // De-duplicate and sort
        fonts.sort_by(|a, b| a.name.cmp(&b.name));
        fonts.dedup_by(|a, b| a.name == b.name);

        fonts
    }

    #[cfg(target_os = "windows")]
    fn scan_registry(key: &str, default_dir: &str, fonts: &mut Vec<SystemFont>) {
        let mut cmd = Command::new("reg");
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.args(["query", key]);

        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let parts: Vec<&str> = line.split("    ").filter(|s| !s.is_empty()).collect();
                    if parts.len() >= 3 {
                        let font_name_raw = parts[0].trim();
                        let font_file = parts[2].trim();
                        
                        // Remove trailing type indicator like " (TrueType)" or " (OpenType)"
                        let clean_name = font_name_raw.split(" (").next().unwrap_or(font_name_raw).to_string();
                        
                        let mut full_path = std::path::PathBuf::from(font_file);
                        if !full_path.is_absolute() {
                            full_path = std::path::PathBuf::from(default_dir).join(font_file);
                        }

                        if full_path.exists() {
                            fonts.push(SystemFont {
                                name: clean_name,
                                path: full_path.to_string_lossy().replace("\\", "/"),
                            });
                        }
                    }
                }
            }
        }
    }
}
