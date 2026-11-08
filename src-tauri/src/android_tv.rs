use base64::{engine::general_purpose::STANDARD, Engine as _};
use chromiacast::android_tv::{
    AndroidTvKeyCode, AndroidTvPairingSession, AndroidTvRemote, AndroidTvRemoteClientInfo,
    AndroidTvRemoteIdentity,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, net::IpAddr, path::PathBuf};
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

#[derive(Default)]
pub struct AndroidTvState {
    pairings: Mutex<HashMap<IpAddr, AndroidTvPairingSession>>,
    remotes: Mutex<HashMap<IpAddr, AndroidTvRemote>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidTvDevice {
    pub id: String,
    pub platform: String,
    pub ip: String,
    pub name: String,
    pub model: String,
    pub vendor: String,
    pub software_version: String,
    pub is_tv: bool,
    pub supports_find_remote: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidTvPairingInfo {
    pub ip: String,
    pub server_name: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredIdentity {
    certificate_der: String,
    private_key_pkcs8_der: String,
}

fn identity_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Can't open app data folder: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Can't create app data folder: {e}"))?;
    Ok(dir.join("android-tv-identity.json"))
}

fn save_identity(app: &AppHandle, identity: &AndroidTvRemoteIdentity) -> Result<(), String> {
    let path = identity_path(app)?;
    let stored = StoredIdentity {
        certificate_der: STANDARD.encode(identity.certificate_der()),
        private_key_pkcs8_der: STANDARD.encode(identity.private_key_pkcs8_der()),
    };
    let bytes = serde_json::to_vec(&stored)
        .map_err(|e| format!("Can't encode Android TV pairing identity: {e}"))?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, bytes).map_err(|e| format!("Can't save Android TV pairing identity: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temp, fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Can't protect Android TV pairing identity: {e}"))?;
    }
    fs::rename(&temp, &path)
        .map_err(|e| format!("Can't finish saving Android TV pairing identity: {e}"))
}

fn load_identity(app: &AppHandle) -> Result<AndroidTvRemoteIdentity, String> {
    let path = identity_path(app)?;
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let identity = AndroidTvRemoteIdentity::generate("Open Remote Control")
                .map_err(|e| format!("Can't create Android TV pairing identity: {e}"))?;
            save_identity(app, &identity)?;
            return Ok(identity);
        }
        Err(error) => return Err(format!("Can't read Android TV pairing identity: {error}")),
    };
    let stored: StoredIdentity = serde_json::from_slice(&bytes)
        .map_err(|e| format!("Saved Android TV pairing identity is damaged: {e}"))?;
    let certificate = STANDARD
        .decode(stored.certificate_der)
        .map_err(|e| format!("Saved Android TV certificate is invalid: {e}"))?;
    let private_key = STANDARD
        .decode(stored.private_key_pkcs8_der)
        .map_err(|e| format!("Saved Android TV private key is invalid: {e}"))?;
    AndroidTvRemoteIdentity::from_der(certificate, private_key)
        .map_err(|e| format!("Saved Android TV pairing identity is invalid: {e}"))
}

fn parse_ip(value: &str) -> Result<IpAddr, String> {
    value
        .trim()
        .parse::<IpAddr>()
        .map_err(|_| "Enter the Android TV's IPv4 or IPv6 address.".to_string())
}

fn device_from_remote(ip: IpAddr, remote: &AndroidTvRemote) -> AndroidTvDevice {
    let info = remote.device_info();
    let model = info.model().trim().to_string();
    let vendor = info.vendor().trim().to_string();
    let service_version = info.service_version().trim().to_string();
    let name = if model.is_empty() {
        format!("Android TV at {ip}")
    } else if vendor.is_empty() {
        model.clone()
    } else {
        format!("{vendor} {model}")
    };
    AndroidTvDevice {
        id: format!("androidtv:{ip}"),
        platform: "androidtv".into(),
        ip: ip.to_string(),
        name,
        model,
        vendor,
        software_version: service_version,
        is_tv: true,
        supports_find_remote: false,
    }
}

fn device_without_remote(ip: IpAddr, name: Option<String>) -> AndroidTvDevice {
    AndroidTvDevice {
        id: format!("androidtv:{ip}"),
        platform: "androidtv".into(),
        ip: ip.to_string(),
        name: name
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| format!("Android TV at {ip}")),
        model: String::new(),
        vendor: String::new(),
        software_version: String::new(),
        is_tv: true,
        supports_find_remote: false,
    }
}

fn client_info() -> AndroidTvRemoteClientInfo {
    AndroidTvRemoteClientInfo::new(
        "Open Remote Control",
        "MOVE WEIGHT",
        "com.moveweight.roku-control",
        env!("CARGO_PKG_VERSION"),
    )
    .expect("valid Android TV client metadata")
}

async fn connect_remote(app: &AppHandle, state: &AndroidTvState, ip: IpAddr) -> Result<(), String> {
    if state.remotes.lock().await.contains_key(&ip) {
        return Ok(());
    }
    let identity = load_identity(app)?;
    let remote = AndroidTvRemote::connect(ip, &identity, client_info())
        .await
        .map_err(|e| format!("Can't connect to Android TV at {ip}: {e}"))?;
    state.remotes.lock().await.entry(ip).or_insert(remote);
    Ok(())
}

pub async fn start_pairing(
    app: &AppHandle,
    state: &AndroidTvState,
    value: &str,
) -> Result<AndroidTvPairingInfo, String> {
    let ip = parse_ip(value)?;
    let identity = load_identity(app)?;
    let pairing = AndroidTvPairingSession::begin(ip, &identity, "Open Remote Control")
        .await
        .map_err(|e| format!("Can't start Android TV pairing at {ip}: {e}"))?;
    let server_name = pairing.server_name().map(str::to_string);
    state.pairings.lock().await.insert(ip, pairing);
    Ok(AndroidTvPairingInfo {
        ip: ip.to_string(),
        server_name,
    })
}

pub async fn finish_pairing(
    app: &AppHandle,
    state: &AndroidTvState,
    value: &str,
    code: &str,
) -> Result<AndroidTvDevice, String> {
    let ip = parse_ip(value)?;
    let pairing = state
        .pairings
        .lock()
        .await
        .remove(&ip)
        .ok_or_else(|| "Start pairing with this Android TV first.".to_string())?;
    let server_name = pairing.server_name().map(str::to_string);
    pairing
        .finish(code.trim())
        .await
        .map_err(|e| format!("Android TV pairing failed: {e}"))?;
    let identity = load_identity(app)?;
    match AndroidTvRemote::connect(ip, &identity, client_info()).await {
        Ok(remote) => {
            let device = device_from_remote(ip, &remote);
            state.remotes.lock().await.insert(ip, remote);
            Ok(device)
        }
        Err(_) => Ok(device_without_remote(ip, server_name)),
    }
}

pub async fn connect(
    app: &AppHandle,
    state: &AndroidTvState,
    value: &str,
) -> Result<AndroidTvDevice, String> {
    let ip = parse_ip(value)?;
    connect_remote(app, state, ip).await?;
    let remotes = state.remotes.lock().await;
    let remote = remotes
        .get(&ip)
        .ok_or_else(|| "Android TV connection closed. Try again.".to_string())?;
    Ok(device_from_remote(ip, remote))
}

fn key_code(key: &str) -> Result<AndroidTvKeyCode, String> {
    let code = match key {
        "Up" => AndroidTvKeyCode::DPAD_UP,
        "Down" => AndroidTvKeyCode::DPAD_DOWN,
        "Left" => AndroidTvKeyCode::DPAD_LEFT,
        "Right" => AndroidTvKeyCode::DPAD_RIGHT,
        "Select" => AndroidTvKeyCode::DPAD_CENTER,
        "Back" => AndroidTvKeyCode::BACK,
        "Home" => AndroidTvKeyCode::HOME,
        "Info" => AndroidTvKeyCode::SETTINGS,
        "Search" => AndroidTvKeyCode::from_raw(84), // Android KEYCODE_SEARCH
        "Play" => AndroidTvKeyCode::MEDIA_PLAY_PAUSE,
        "Rev" => AndroidTvKeyCode::MEDIA_REWIND,
        "Fwd" => AndroidTvKeyCode::MEDIA_FAST_FORWARD,
        "InstantReplay" => AndroidTvKeyCode::MEDIA_PREVIOUS,
        "VolumeUp" => AndroidTvKeyCode::VOLUME_UP,
        "VolumeDown" => AndroidTvKeyCode::VOLUME_DOWN,
        "VolumeMute" => AndroidTvKeyCode::VOLUME_MUTE,
        "PowerOff" => AndroidTvKeyCode::SLEEP,
        "ChannelUp" => AndroidTvKeyCode::from_raw(92), // Android KEYCODE_PAGE_UP
        "ChannelDown" => AndroidTvKeyCode::from_raw(93), // Android KEYCODE_PAGE_DOWN
        _ => return Err(format!("{key} isn't available on Android TV.")),
    };
    Ok(code)
}

pub async fn keypress(
    app: &AppHandle,
    state: &AndroidTvState,
    value: &str,
    key: &str,
) -> Result<(), String> {
    let ip = parse_ip(value)?;
    let code = key_code(key)?;
    connect_remote(app, state, ip).await?;
    let remotes = state.remotes.lock().await;
    let remote = remotes
        .get(&ip)
        .ok_or_else(|| "Android TV connection closed. Try again.".to_string())?;
    remote
        .press_key(code)
        .await
        .map_err(|e| format!("Android TV command failed: {e}"))
}

pub async fn power_on(app: &AppHandle, state: &AndroidTvState, value: &str) -> Result<(), String> {
    let ip = parse_ip(value)?;
    connect_remote(app, state, ip).await?;
    let remotes = state.remotes.lock().await;
    let remote = remotes
        .get(&ip)
        .ok_or_else(|| "Android TV connection closed. Try again.".to_string())?;
    remote
        .press_wake_key()
        .await
        .map_err(|e| format!("Android TV wake command failed: {e}"))
}

pub async fn cancel_pairing(state: &AndroidTvState, value: &str) -> Result<(), String> {
    let ip = parse_ip(value)?;
    state.pairings.lock().await.remove(&ip);
    Ok(())
}

pub async fn forget(state: &AndroidTvState, value: &str) -> Result<(), String> {
    let ip = parse_ip(value)?;
    state.pairings.lock().await.remove(&ip);
    let remote = state.remotes.lock().await.remove(&ip);
    if let Some(remote) = remote {
        let _ = remote.close().await;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{key_code, parse_ip};

    #[test]
    fn maps_remote_keys_to_android_tv_keycodes() {
        for (name, expected) in [
            ("Up", 19),
            ("Down", 20),
            ("Left", 21),
            ("Right", 22),
            ("Select", 23),
            ("Back", 4),
            ("Home", 3),
            ("Search", 84),
            ("ChannelUp", 92),
            ("ChannelDown", 93),
        ] {
            assert_eq!(key_code(name).unwrap().raw(), expected, "{name}");
        }
        assert!(key_code("Lit_a").is_err());
    }

    #[test]
    fn accepts_only_ip_addresses_for_android_tv() {
        assert!(parse_ip("192.168.1.20").is_ok());
        assert!(parse_ip("android-tv.local").is_err());
    }
}
