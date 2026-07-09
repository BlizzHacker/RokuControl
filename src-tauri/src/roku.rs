use std::net::{SocketAddr, UdpSocket};
use std::time::Duration;
use serde::{Deserialize, Serialize};

const SSDP_MULTICAST: &str = "239.255.255.250:1900";
const ROKU_PORT: u16 = 8060;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RokuDevice {
    pub ip: String,
    pub name: String,
    pub model: String,
    pub vendor: String,
    pub serial: String,
    pub power_mode: String,
    pub ecp_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RokuApp {
    pub id: String,
    pub name: String,
    pub app_type: String,
    pub version: String,
}

/// Discover Roku devices via SSDP multicast
pub async fn discover_devices() -> Result<Vec<RokuDevice>, String> {
    let mut devices = Vec::new();
    let mut seen = std::collections::HashSet::new();

    // Try SSDP first
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        socket.set_read_timeout(Some(Duration::from_secs(3))).ok();
        socket.set_broadcast(true).ok();

        let ssdp_msg = "M-SEARCH * HTTP/1.1\r\n\
                        HOST: 239.255.255.250:1900\r\n\
                        MAN: \"ssdp:discover\"\r\n\
                        ST: roku:ecp\r\n\
                        MX: 3\r\n\r\n";

        if socket.send_to(ssdp_msg.as_bytes(), SSDP_MULTICAST).is_ok() {
            let mut buf = [0u8; 4096];
            let start = std::time::Instant::now();
            while start.elapsed() < Duration::from_secs(4) {
                if let Ok((size, src)) = socket.recv_from(&mut buf) {
                    let response = String::from_utf8_lossy(&buf[..size]);
                    if response.contains("roku:ecp") {
                        let ip = extract_ip(&response, &src);
                        if !seen.contains(&ip) {
                            seen.insert(ip.clone());
                            if let Ok(device) = get_device_info(&ip).await {
                                devices.push(device);
                            }
                        }
                    }
                } else {
                    break;
                }
            }
        }
    }

    // Fallback: scan common subnets
    if devices.is_empty() {
        for subnet in &["192.168.0", "192.168.1", "10.0.0"] {
            for i in 1..=254 {
                let ip = format!("{}.{}", subnet, i);
                if seen.contains(&ip) { continue; }
                if let Ok(device) = get_device_info(&ip).await {
                    seen.insert(ip);
                    devices.push(device);
                }
            }
        }
    }

    Ok(devices)
}

fn extract_ip(response: &str, src: &SocketAddr) -> String {
    for line in response.lines() {
        if line.to_lowercase().starts_with("location:") {
            if let Some(start) = line.find("://") {
                let rest = &line[start + 3..];
                if let Some(end) = rest.find(|c: char| c == '/' || c == ':') {
                    return rest[..end].to_string();
                }
                return rest.trim().to_string();
            }
        }
    }
    src.ip().to_string()
}

/// Get device info from a Roku
pub async fn get_device_info(ip: &str) -> Result<RokuDevice, String> {
    let url = format!("http://{}:{}/query/device-info", ip, ROKU_PORT);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let xml = resp.text().await.map_err(|e| e.to_string())?;

    let name = extract_xml(&xml, "user-device-name");
    let model = extract_xml(&xml, "model-name");
    let vendor = extract_xml(&xml, "vendor-name");
    let serial = extract_xml(&xml, "serial-number");
    let power = extract_xml(&xml, "power-mode");
    let ecp = extract_xml(&xml, "ecp-setting-mode");

    if vendor.is_empty() && model.is_empty() {
        return Err("Not a Roku device".into());
    }

    Ok(RokuDevice {
        ip: ip.to_string(),
        name,
        model,
        vendor,
        serial,
        power_mode: power,
        ecp_mode: ecp,
    })
}

/// Get installed apps
pub async fn get_apps(ip: &str) -> Result<Vec<RokuApp>, String> {
    let url = format!("http://{}:{}/query/apps", ip, ROKU_PORT);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let xml = resp.text().await.map_err(|e| e.to_string())?;

    let mut apps = Vec::new();
    let mut rest = xml.as_str();
    
    while let Some(start) = rest.find("<app ") {
        rest = &rest[start..];
        let end = rest.find("</app>").unwrap_or(rest.len());
        let app_xml = &rest[..end + 6];
        
        let id = extract_attr(app_xml, "id");
        let app_type = extract_attr(app_xml, "type");
        let version = extract_attr(app_xml, "version");
        let name_end = app_xml.find("</app>").unwrap_or(app_xml.len());
        let inner = &app_xml[app_xml.find('>').unwrap_or(0) + 1..name_end];
        let name = inner.trim().to_string();

        apps.push(RokuApp { id, name, app_type, version });
        rest = &rest[end + 6..];
    }

    Ok(apps)
}

/// Send a keypress
pub async fn send_keypress(ip: &str, key: &str) -> Result<(), String> {
    let url = format!("http://{}:{}/keypress/{}", ip, ROKU_PORT, key);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    
    client.post(&url).send().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Launch an app
pub async fn launch_app(ip: &str, app_id: &str) -> Result<(), String> {
    let url = format!("http://{}:{}/launch/{}", ip, ROKU_PORT, app_id);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    
    client.post(&url).send().await.map_err(|e| e.to_string())?;
    Ok(())
}

fn extract_xml(xml: &str, tag: &str) -> String {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    if let Some(start) = xml.find(&open) {
        let inner = &xml[start + open.len()..];
        if let Some(end) = inner.find(&close) {
            return inner[..end].trim().to_string();
        }
    }
    String::new()
}

fn extract_attr(xml: &str, attr: &str) -> String {
    let pattern = format!("{}=\"", attr);
    if let Some(start) = xml.find(&pattern) {
        let rest = &xml[start + pattern.len()..];
        if let Some(end) = rest.find('"') {
            return rest[..end].to_string();
        }
    }
    String::new()
}
