#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod camera;

use camera::CameraDevice;
use tauri::Manager;

#[tauri::command]
fn list_camera_devices() -> Vec<CameraDevice> {
    camera::list_devices()
}

#[tauri::command]
fn set_camera_control(device: String, control: String, value: String) -> Result<String, String> {
    camera::set_control(&device, &control, &value)
}

#[tauri::command]
fn get_camera_control(device: String, control: String) -> Result<String, String> {
    camera::get_control(&device, &control)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_camera_devices,
            set_camera_control,
            get_camera_control
        ])
        .setup(|app| {
            #[cfg(target_os = "linux")]
            {
                use webkit2gtk::{PermissionRequestExt, WebViewExt};
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.with_webview(|webview| {
                        let wv = webview.inner();
                        wv.connect_permission_request(|_, request| {
                            request.allow();
                            true
                        });
                    });
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar tauri");
}
