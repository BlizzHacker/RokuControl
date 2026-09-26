mod roku;

use roku::{EcpError, ErrorKind, PowerOnReport, RokuApp, RokuDevice};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

type CmdResult<T> = Result<T, EcpError>;

#[tauri::command]
async fn discover(deep: Option<bool>) -> Vec<RokuDevice> {
    roku::discover(deep.unwrap_or(false)).await
}

/// Also serves as "add by IP" and the periodic health check.
#[tauri::command]
async fn device_info(ip: String) -> CmdResult<RokuDevice> {
    let host = roku::normalize_host(&ip)?;
    roku::device_info(&host).await
}

#[tauri::command]
async fn get_apps(ip: String) -> CmdResult<Vec<RokuApp>> {
    roku::apps(&roku::normalize_host(&ip)?).await
}

#[tauri::command]
async fn active_app(ip: String) -> CmdResult<Option<RokuApp>> {
    roku::active_app(&roku::normalize_host(&ip)?).await
}

#[tauri::command]
async fn app_icon(ip: String, app_id: String) -> CmdResult<String> {
    roku::app_icon(&roku::normalize_host(&ip)?, &app_id).await
}

#[tauri::command]
async fn keypress(ip: String, key: String) -> CmdResult<()> {
    roku::keypress(&roku::normalize_host(&ip)?, &key).await
}

#[tauri::command]
async fn launch(ip: String, app_id: String) -> CmdResult<()> {
    roku::launch(&roku::normalize_host(&ip)?, &app_id).await
}

#[tauri::command]
async fn send_text(ip: String, text: String) -> CmdResult<()> {
    roku::send_text(&roku::normalize_host(&ip)?, &text).await
}

#[tauri::command]
async fn power_on(ip: String, macs: Vec<String>) -> CmdResult<PowerOnReport> {
    roku::power_on(&roku::normalize_host(&ip)?, &macs).await
}

#[tauri::command]
async fn lookup_mac(ip: String) -> Option<String> {
    let host = roku::normalize_host(&ip).ok()?;
    roku::arp_lookup(&host).await
}

/// Links the UI may open in the user's browser or the Microsoft Store.
const LINK_PREFIXES: &[&str] = &[
    "https://moveweight.com",
    "https://www.moveweight.com",
    "https://github.com/BlizzHacker/RokuControl",
    "https://apps.microsoft.com/detail/9mtnngzkj1wk",
    "ms-windows-store://review/?ProductId=9MTNNGZKJ1WK",
    "ms-windows-store://pdp/?ProductId=9MTNNGZKJ1WK",
    "https://support.roku.com/",
];

fn is_allowed_link(url: &str) -> bool {
    if url.len() > 8000 || url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return false;
    }
    LINK_PREFIXES.iter().any(|prefix| {
        url.strip_prefix(prefix).is_some_and(|rest| {
            // Stop "https://moveweight.com.evil.example" slipping through.
            prefix.ends_with('/') || rest.is_empty() || rest.starts_with(['/', '?', '#', '&'])
        })
    })
}

#[tauri::command]
fn open_link(app: tauri::AppHandle, url: String) -> CmdResult<()> {
    if !is_allowed_link(&url) {
        return Err(EcpError::new(ErrorKind::Invalid, "That link isn't allowed."));
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| EcpError::new(ErrorKind::Other, format!("Couldn't open the link: {e}")))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            discover,
            device_info,
            get_apps,
            active_app,
            app_icon,
            keypress,
            launch,
            send_text,
            power_on,
            lookup_mac,
            open_link,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    window.app_handle().exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Roku Control");
}

#[cfg(test)]
mod tests {
    use super::is_allowed_link;

    #[test]
    fn only_our_links_open() {
        for ok in [
            "https://moveweight.com",
            "https://moveweight.com/",
            "https://github.com/BlizzHacker/RokuControl",
            "https://github.com/BlizzHacker/RokuControl/issues/new?template=bug_report.yml&title=x%20y",
            "ms-windows-store://review/?ProductId=9MTNNGZKJ1WK",
            "https://support.roku.com/article/123",
        ] {
            assert!(is_allowed_link(ok), "{ok}");
        }
        for bad in [
            "https://moveweight.com.evil.example",
            "https://github.com/BlizzHacker/RokuControlEvil",
            "https://github.com/someone/else",
            "file:///C:/Windows/System32/calc.exe",
            "https://moveweight.com/ x",
            "javascript:alert(1)",
            "",
        ] {
            assert!(!is_allowed_link(bad), "{bad}");
        }
    }
}
