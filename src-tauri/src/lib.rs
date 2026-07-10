mod roku;

use roku::{RokuDevice, RokuApp};
use tauri::State;
use std::sync::Mutex;

struct AppState {
    devices: Mutex<Vec<RokuDevice>>,
}

#[tauri::command]
async fn discover(state: State<'_, AppState>) -> Result<Vec<RokuDevice>, String> {
    let devices = roku::discover_devices().await?;
    if let Ok(mut stored) = state.devices.lock() {
        *stored = devices.clone();
    }
    Ok(devices)
}

#[tauri::command]
async fn get_apps(ip: String) -> Result<Vec<RokuApp>, String> {
    roku::get_apps(&ip).await
}

#[tauri::command]
async fn keypress(ip: String, key: String) -> Result<(), String> {
    roku::send_keypress(&ip, &key).await
}

#[tauri::command]
async fn launch(ip: String, app_id: String) -> Result<(), String> {
    roku::launch_app(&ip, &app_id).await
}

#[tauri::command]
async fn send_text(ip: String, text: String) -> Result<(), String> {
    roku::send_text(&ip, &text).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            devices: Mutex::new(Vec::new()),
        })
        .invoke_handler(tauri::generate_handler![
            discover,
            get_apps,
            keypress,
            launch,
            send_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Roku Control");
}
