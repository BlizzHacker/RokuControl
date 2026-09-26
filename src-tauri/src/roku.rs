//! Roku External Control Protocol (ECP) client: discovery, device queries,
//! key presses, text entry and waking a TV that is switched off.
//!
//! Every request goes straight to the Roku on the LAN (port 8060). Nothing here
//! talks to the internet.

use serde::Serialize;
use std::collections::{BTreeSet, HashSet};
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tokio::net::{TcpStream, UdpSocket};
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use tokio::time::Instant;

pub const ECP_PORT: u16 = 8060;
const SSDP_ADDR: Ipv4Addr = Ipv4Addr::new(239, 255, 255, 250);
const SSDP_PORT: u16 = 1900;
const M_SEARCH: &str = "M-SEARCH * HTTP/1.1\r\n\
                        HOST: 239.255.255.250:1900\r\n\
                        MAN: \"ssdp:discover\"\r\n\
                        ST: roku:ecp\r\n\
                        MX: 2\r\n\r\n";

/// Longest text we will type in one go; each character is its own request.
const MAX_TEXT_CHARS: usize = 500;

pub const LIMITED_HELP: &str = "Your Roku is blocking remote control from this computer \
(it is in Limited mode, which only allows volume). On the Roku, open Settings › System › \
Advanced system settings › Control by mobile apps and set it to Enabled — or set Network \
access to Permissive.";

const FAST_START_HELP: &str = "To turn the TV on from this app while it is off, enable \
Fast TV start on the TV: Settings › System › Power › Fast TV start.";

// ─── Errors ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorKind {
    /// Nothing answered: the device is off, asleep, on another network or has a new IP.
    Unreachable,
    /// The Roku answered 403 — "Control by mobile apps" is Limited or Disabled.
    Limited,
    /// The Roku answered 404 — this model has no such key, app or input.
    Unsupported,
    /// Malformed input from the UI (address, key or app id).
    Invalid,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct EcpError {
    pub kind: ErrorKind,
    pub message: String,
}

impl EcpError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self { kind, message: message.into() }
    }
    fn invalid(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Invalid, message)
    }
}

impl std::fmt::Display for EcpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

/// Map a non-success HTTP status from the Roku to an error the user can act on.
pub fn status_error(status: u16, body: &str) -> EcpError {
    match status {
        403 => EcpError::new(ErrorKind::Limited, LIMITED_HELP),
        404 => EcpError::new(
            ErrorKind::Unsupported,
            "This Roku doesn't support that button or app.",
        ),
        _ => {
            let detail: String = body.trim().chars().take(120).collect();
            let message = if detail.is_empty() {
                format!("The Roku answered with HTTP {status}.")
            } else {
                format!("The Roku answered with HTTP {status}: {detail}")
            };
            EcpError::new(ErrorKind::Other, message)
        }
    }
}

fn transport_error(host: &str, e: &reqwest::Error) -> EcpError {
    if e.is_timeout() || e.is_connect() {
        EcpError::new(
            ErrorKind::Unreachable,
            format!(
                "Can't reach the Roku at {host}. Check that it's on and connected to the \
                 same network as this computer."
            ),
        )
    } else {
        EcpError::new(ErrorKind::Other, format!("Network error talking to {host}: {e}"))
    }
}

// ─── Input validation ──────────────────────────────────────────────────────

/// Accept what people paste — `192.168.1.20`, `http://192.168.1.20:8060/`,
/// `roku-den.local` — and reduce it to a bare IPv4 address or hostname.
pub fn normalize_host(input: &str) -> Result<String, EcpError> {
    let mut s = input.trim();
    for scheme in ["http://", "https://"] {
        if s.get(..scheme.len()).is_some_and(|p| p.eq_ignore_ascii_case(scheme)) {
            s = &s[scheme.len()..];
        }
    }
    let s = s.split(['/', '?', '#']).next().unwrap_or("");
    let s = s.split(':').next().unwrap_or("").trim();

    if s.is_empty() {
        return Err(EcpError::invalid(
            "Enter your Roku's IP address, like 192.168.1.20. On the Roku it's under \
             Settings › Network › About.",
        ));
    }
    if let Ok(ip) = s.parse::<Ipv4Addr>() {
        if ip.is_unspecified() || ip.is_broadcast() || ip.is_multicast() {
            return Err(EcpError::invalid(format!("{s} isn't a device address.")));
        }
        return Ok(ip.to_string());
    }
    if s.chars().all(|c| c.is_ascii_digit() || c == '.') {
        return Err(EcpError::invalid(format!("{s} isn't a valid IP address.")));
    }
    let valid_hostname = s.len() <= 253
        && s.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        });
    if valid_hostname {
        Ok(s.to_ascii_lowercase())
    } else {
        Err(EcpError::invalid(format!("\"{s}\" isn't an IP address or hostname.")))
    }
}

/// ECP key names: `Home`, `VolumeUp`, `Lit_a`, `Lit_%C3%A9`, …
pub fn validate_key(key: &str) -> Result<(), EcpError> {
    let ok = !key.is_empty()
        && key.len() <= 64
        && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '%');
    if ok {
        Ok(())
    } else {
        Err(EcpError::invalid(format!("\"{key}\" isn't a Roku key name.")))
    }
}

/// App ids are numeric (`12`), `dev`, or TV inputs like `tvinput.hdmi1`.
pub fn validate_app_id(id: &str) -> Result<(), EcpError> {
    let ok = !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'));
    if ok {
        Ok(())
    } else {
        Err(EcpError::invalid(format!("\"{id}\" isn't a Roku app id.")))
    }
}

// ─── HTTP ──────────────────────────────────────────────────────────────────

fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            // A Roku is always on the LAN. A system or corporate proxy can only
            // break the connection, so never use one.
            .no_proxy()
            .connect_timeout(Duration::from_millis(1500))
            .timeout(Duration::from_secs(6))
            .pool_idle_timeout(Duration::from_secs(20))
            .build()
            .expect("building the HTTP client")
    })
}

fn ecp_url(host: &str, path: &str) -> String {
    format!("http://{host}:{ECP_PORT}/{path}")
}

async fn check_status(resp: reqwest::Response) -> Result<reqwest::Response, EcpError> {
    let status = resp.status();
    if status.is_success() {
        return Ok(resp);
    }
    let body = resp.text().await.unwrap_or_default();
    Err(status_error(status.as_u16(), &body))
}

async fn ecp_get(host: &str, path: &str) -> Result<reqwest::Response, EcpError> {
    let resp = http()
        .get(ecp_url(host, path))
        .send()
        .await
        .map_err(|e| transport_error(host, &e))?;
    check_status(resp).await
}

async fn ecp_get_text(host: &str, path: &str) -> Result<String, EcpError> {
    ecp_get(host, path)
        .await?
        .text()
        .await
        .map_err(|e| transport_error(host, &e))
}

async fn ecp_post(host: &str, path: &str) -> Result<(), EcpError> {
    let resp = http()
        .post(ecp_url(host, path))
        // Some firmware wants an explicit Content-Length: 0 on POST.
        .body("")
        .send()
        .await
        .map_err(|e| transport_error(host, &e))?;
    check_status(resp).await.map(|_| ())
}

// ─── XML helpers (ECP responses are small and flat) ────────────────────────

fn unescape_xml(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        rest = &rest[amp..];
        let Some(semi) = rest.find(';').filter(|&i| i <= 10) else {
            out.push('&');
            rest = &rest[1..];
            continue;
        };
        let entity = &rest[1..semi];
        let decoded = match entity {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            _ => entity
                .strip_prefix("#x")
                .or_else(|| entity.strip_prefix("#X"))
                .and_then(|hex| u32::from_str_radix(hex, 16).ok())
                .or_else(|| entity.strip_prefix('#').and_then(|d| d.parse().ok()))
                .and_then(char::from_u32),
        };
        match decoded {
            Some(c) => {
                out.push(c);
                rest = &rest[semi + 1..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// Text of the first `<tag>…</tag>`; empty when missing or self-closing.
fn xml_text(xml: &str, tag: &str) -> String {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    xml.find(&open)
        .and_then(|start| {
            let inner = &xml[start + open.len()..];
            inner.find(&close).map(|end| unescape_xml(inner[..end].trim()))
        })
        .unwrap_or_default()
}

fn xml_attr(tag: &str, attr: &str) -> String {
    let pattern = format!(" {attr}=\"");
    tag.find(&pattern)
        .and_then(|start| {
            let rest = &tag[start + pattern.len()..];
            rest.find('"').map(|end| unescape_xml(&rest[..end]))
        })
        .unwrap_or_default()
}

// ─── Device info ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RokuDevice {
    pub ip: String,
    pub name: String,
    pub model: String,
    pub model_number: String,
    pub vendor: String,
    pub serial: String,
    pub device_id: String,
    pub location: String,
    pub software_version: String,
    /// `PowerOn`, `DisplayOff`, `Ready`, `Headless`, … — empty when unknown.
    pub power_mode: String,
    /// `ecp-setting-mode` on newer firmware, e.g. `default`, `limited`.
    pub ecp_mode: String,
    pub network_type: String,
    pub wifi_mac: String,
    pub ethernet_mac: String,
    pub is_tv: bool,
    pub is_stick: bool,
    pub supports_find_remote: bool,
    pub supports_wake_on_wlan: bool,
}

pub fn parse_device_info(ip: &str, xml: &str) -> Option<RokuDevice> {
    let text = |tag: &str| xml_text(xml, tag);
    let flag = |tag: &str| text(tag).eq_ignore_ascii_case("true");

    let vendor = text("vendor-name");
    let model_name = text("model-name");
    let serial = text("serial-number");
    if vendor.is_empty() && model_name.is_empty() && serial.is_empty() {
        return None;
    }
    let model = first_non_empty([text("friendly-model-name"), model_name]);
    let name = first_non_empty([
        text("user-device-name"),
        text("friendly-device-name"),
        text("default-device-name"),
        model.clone(),
        format!("Roku at {ip}"),
    ]);

    Some(RokuDevice {
        ip: ip.to_string(),
        name,
        model,
        model_number: text("model-number"),
        vendor,
        serial,
        device_id: text("device-id"),
        location: text("user-device-location"),
        software_version: text("software-version"),
        power_mode: text("power-mode"),
        ecp_mode: text("ecp-setting-mode").to_ascii_lowercase(),
        network_type: text("network-type"),
        wifi_mac: text("wifi-mac").to_ascii_lowercase(),
        ethernet_mac: text("ethernet-mac").to_ascii_lowercase(),
        is_tv: flag("is-tv"),
        is_stick: flag("is-stick"),
        supports_find_remote: flag("supports-find-remote"),
        supports_wake_on_wlan: flag("supports-wake-on-wlan"),
    })
}

fn first_non_empty<const N: usize>(candidates: [String; N]) -> String {
    candidates.into_iter().find(|s| !s.is_empty()).unwrap_or_default()
}

pub async fn device_info(host: &str) -> Result<RokuDevice, EcpError> {
    let xml = ecp_get_text(host, "query/device-info").await?;
    parse_device_info(host, &xml).ok_or_else(|| {
        EcpError::new(
            ErrorKind::Other,
            format!("The device at {host} answered, but it doesn't look like a Roku."),
        )
    })
}

// ─── Apps ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct RokuApp {
    pub id: String,
    pub name: String,
    /// `appl` for channels, `tvin` for TV inputs, `menu`, `ndka`, …
    #[serde(rename = "type")]
    pub kind: String,
    pub version: String,
}

pub fn parse_apps(xml: &str) -> Vec<RokuApp> {
    let mut apps = Vec::new();
    let mut rest = xml;
    while let Some(start) = rest.find("<app") {
        rest = &rest[start + 4..];
        // Skip `<apps>` and anything else that merely starts with "app".
        if !rest.starts_with([' ', '>', '/']) {
            continue;
        }
        let Some(tag_end) = rest.find('>') else { break };
        let attrs = &rest[..tag_end];
        let self_closing = attrs.ends_with('/');
        rest = &rest[tag_end + 1..];
        let name = if self_closing {
            String::new()
        } else {
            let end = rest.find("</app>").unwrap_or(rest.len());
            let name = unescape_xml(rest[..end].trim());
            rest = &rest[end..];
            name
        };
        apps.push(RokuApp {
            id: xml_attr(attrs, "id"),
            name,
            kind: xml_attr(attrs, "type"),
            version: xml_attr(attrs, "version"),
        });
    }
    apps
}

pub async fn apps(host: &str) -> Result<Vec<RokuApp>, EcpError> {
    let xml = ecp_get_text(host, "query/apps").await?;
    Ok(parse_apps(&xml).into_iter().filter(|a| !a.id.is_empty()).collect())
}

/// What's on screen now. `None` when the Roku is on its home screen.
pub async fn active_app(host: &str) -> Result<Option<RokuApp>, EcpError> {
    let xml = ecp_get_text(host, "query/active-app").await?;
    Ok(parse_apps(&xml).into_iter().find(|a| !a.id.is_empty()))
}

/// The channel's poster art as a `data:` URL, so the UI can show real icons.
pub async fn app_icon(host: &str, app_id: &str) -> Result<String, EcpError> {
    use base64::Engine as _;
    validate_app_id(app_id)?;
    let resp = ecp_get(host, &format!("query/icon/{app_id}")).await?;
    let mime = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .filter(|v| v.starts_with("image/"))
        .unwrap_or("image/png")
        .to_string();
    let bytes = resp.bytes().await.map_err(|e| transport_error(host, &e))?;
    if bytes.is_empty() || bytes.len() > 1_000_000 {
        return Err(EcpError::new(ErrorKind::Unsupported, "No icon for this app."));
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

// ─── Keys, apps and text ───────────────────────────────────────────────────

pub async fn keypress(host: &str, key: &str) -> Result<(), EcpError> {
    validate_key(key)?;
    ecp_post(host, &format!("keypress/{key}")).await
}

pub async fn launch(host: &str, app_id: &str) -> Result<(), EcpError> {
    validate_app_id(app_id)?;
    ecp_post(host, &format!("launch/{app_id}")).await
}

fn percent_encode_char(c: char) -> String {
    let mut buf = [0u8; 4];
    c.encode_utf8(&mut buf)
        .bytes()
        .map(|b| format!("%{b:02X}"))
        .collect()
}

/// Turn text into ECP key names. Letters and digits go as-is; everything else
/// (space, punctuation, accents, emoji) is UTF-8 percent-encoded, which is
/// what `Lit_` expects. A newline presses Enter.
pub fn text_to_keys(text: &str) -> Vec<String> {
    text.chars()
        .filter_map(|c| match c {
            '\n' => Some("Enter".to_string()),
            c if c.is_control() => None,
            c if c.is_ascii_alphanumeric() => Some(format!("Lit_{c}")),
            c => Some(format!("Lit_{}", percent_encode_char(c))),
        })
        .collect()
}

pub async fn send_text(host: &str, text: &str) -> Result<(), EcpError> {
    if text.chars().count() > MAX_TEXT_CHARS {
        return Err(EcpError::invalid(format!(
            "That's too long to type — keep it under {MAX_TEXT_CHARS} characters."
        )));
    }
    let keys = text_to_keys(text);
    for (i, key) in keys.iter().enumerate() {
        if i > 0 {
            // Some on-screen keyboards drop characters that arrive back-to-back.
            tokio::time::sleep(Duration::from_millis(30)).await;
        }
        ecp_post(host, &format!("keypress/{key}")).await?;
    }
    Ok(())
}

// ─── Local networks ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct LocalNet {
    pub ip: Ipv4Addr,
    pub netmask: Ipv4Addr,
}

impl LocalNet {
    pub fn broadcast(&self) -> Ipv4Addr {
        Ipv4Addr::from(u32::from(self.ip) | !u32::from(self.netmask))
    }
}

/// Every IPv4 network this computer is on (Wi-Fi, Ethernet, VPN, virtual switches).
pub fn local_networks() -> Vec<LocalNet> {
    let mut nets: Vec<LocalNet> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|iface| !iface.is_loopback())
        .filter_map(|iface| match iface.addr {
            if_addrs::IfAddr::V4(v4) => Some(LocalNet { ip: v4.ip, netmask: v4.netmask }),
            _ => None,
        })
        .filter(|n| !n.ip.is_loopback() && !n.ip.is_link_local() && !n.ip.is_unspecified())
        .collect();
    nets.sort();
    nets.dedup();
    nets
}

/// Hosts to probe when multicast discovery finds nothing. Only private
/// networks are scanned; anything wider than /22 is narrowed to our own /24.
pub fn scan_targets(nets: &[LocalNet]) -> Vec<Ipv4Addr> {
    let mut out = BTreeSet::new();
    for net in nets.iter().filter(|n| n.ip.is_private()) {
        let ip = u32::from(net.ip);
        let mut mask = u32::from(net.netmask);
        if mask.leading_ones() < 22 {
            mask = 0xFFFF_FF00;
        }
        let network = ip & mask;
        let broadcast = network | !mask;
        if broadcast.saturating_sub(network) < 2 {
            continue;
        }
        out.extend(
            ((network + 1)..broadcast)
                .filter(|&h| h != ip)
                .map(Ipv4Addr::from),
        );
    }
    out.into_iter().collect()
}

// ─── Discovery ─────────────────────────────────────────────────────────────

/// Pull the device address out of an SSDP reply, if it's from a Roku.
pub fn parse_ssdp_response(data: &[u8], src: SocketAddr) -> Option<String> {
    let text = String::from_utf8_lossy(data);
    if !text.to_ascii_lowercase().contains("roku:ecp") {
        return None;
    }
    text.lines()
        .filter_map(|line| line.split_once(':'))
        .find(|(k, _)| k.trim().eq_ignore_ascii_case("location"))
        .and_then(|(_, v)| normalize_host(v).ok())
        .or_else(|| Some(src.ip().to_string()))
}

fn ssdp_socket(bind_ip: Option<Ipv4Addr>) -> Option<UdpSocket> {
    use socket2::{Domain, Protocol, Socket, Type};
    let sock = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP)).ok()?;
    if let Some(ip) = bind_ip {
        // Send the search out of this specific adapter, not just the default route.
        sock.set_multicast_if_v4(&ip).ok()?;
    }
    sock.set_multicast_ttl_v4(2).ok();
    let addr = SocketAddr::from((bind_ip.unwrap_or(Ipv4Addr::UNSPECIFIED), 0));
    sock.bind(&addr.into()).ok()?;
    sock.set_nonblocking(true).ok()?;
    UdpSocket::from_std(sock.into()).ok()
}

async fn ssdp_search(nets: &[LocalNet], window: Duration) -> HashSet<String> {
    // One socket per adapter so a VPN or Hyper-V switch can't swallow the
    // search, plus one on the default route in case enumeration missed something.
    let sockets = nets
        .iter()
        .map(|n| Some(n.ip))
        .chain(std::iter::once(None))
        .filter_map(ssdp_socket);

    let mut tasks = JoinSet::new();
    for sock in sockets {
        tasks.spawn(async move {
            let dest = SocketAddr::from((SSDP_ADDR, SSDP_PORT));
            let start = Instant::now();
            let deadline = start + window;
            let mut found = HashSet::new();
            let mut buf = [0u8; 2048];
            let mut sent = 0;
            while Instant::now() < deadline {
                // UDP is lossy on Wi-Fi: ask three times, spaced out.
                if sent < 3 && start.elapsed() >= Duration::from_millis(350 * sent) {
                    let _ = sock.send_to(M_SEARCH.as_bytes(), dest).await;
                    sent += 1;
                }
                let slice = deadline
                    .saturating_duration_since(Instant::now())
                    .min(Duration::from_millis(150));
                if let Ok(Ok((n, src))) = tokio::time::timeout(slice, sock.recv_from(&mut buf)).await
                {
                    if let Some(host) = parse_ssdp_response(&buf[..n], src) {
                        found.insert(host);
                    }
                }
            }
            found
        });
    }

    let mut all = HashSet::new();
    while let Some(res) = tasks.join_next().await {
        if let Ok(found) = res {
            all.extend(found);
        }
    }
    all
}

/// Find anything listening on the ECP port. Used when multicast is blocked
/// (Windows "Public" networks, some mesh routers).
async fn scan_for_ecp(targets: Vec<Ipv4Addr>) -> Vec<String> {
    let limit = Arc::new(Semaphore::new(96));
    let mut tasks = JoinSet::new();
    for ip in targets {
        let limit = limit.clone();
        tasks.spawn(async move {
            let _permit = limit.acquire_owned().await.ok()?;
            let addr = SocketAddr::from((ip, ECP_PORT));
            match tokio::time::timeout(Duration::from_millis(500), TcpStream::connect(addr)).await {
                Ok(Ok(_)) => Some(ip.to_string()),
                _ => None,
            }
        });
    }
    let mut found = Vec::new();
    while let Some(res) = tasks.join_next().await {
        if let Ok(Some(ip)) = res {
            found.push(ip);
        }
    }
    found
}

/// Find every Roku on the local network. SSDP first; if nothing answers (or
/// `deep` is set) probe the local subnets directly.
pub async fn discover(deep: bool) -> Vec<RokuDevice> {
    let nets = local_networks();
    let mut hosts = ssdp_search(&nets, Duration::from_millis(2000)).await;
    if deep || hosts.is_empty() {
        hosts.extend(scan_for_ecp(scan_targets(&nets)).await);
    }

    let mut tasks = JoinSet::new();
    for host in hosts {
        tasks.spawn(async move {
            match device_info(&host).await {
                Ok(dev) => Some(dev),
                // It answered on the ECP port but refuses queries: still a Roku,
                // and the user needs to see it to learn how to fix the setting.
                Err(e) if e.kind == ErrorKind::Limited => Some(RokuDevice {
                    name: format!("Roku at {host}"),
                    ip: host,
                    ecp_mode: "limited".into(),
                    ..Default::default()
                }),
                Err(_) => None,
            }
        });
    }

    let mut devices: Vec<RokuDevice> = Vec::new();
    while let Some(res) = tasks.join_next().await {
        if let Ok(Some(dev)) = res {
            // A Roku on both Wi-Fi and Ethernet answers twice; keep one.
            let dup = !dev.serial.is_empty() && devices.iter().any(|d| d.serial == dev.serial);
            if !dup {
                devices.push(dev);
            }
        }
    }
    devices.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()).then(a.ip.cmp(&b.ip)));
    devices
}

// ─── Power on: ECP, then Wake-on-LAN ───────────────────────────────────────

pub fn parse_mac(s: &str) -> Option<[u8; 6]> {
    let s = s.trim();
    let parts: Vec<&str> = if s.contains([':', '-']) {
        s.split([':', '-']).collect()
    } else if s.len() == 12 && s.is_ascii() {
        (0..6).map(|i| &s[i * 2..i * 2 + 2]).collect()
    } else {
        return None;
    };
    if parts.len() != 6 {
        return None;
    }
    let mut mac = [0u8; 6];
    for (slot, part) in mac.iter_mut().zip(&parts) {
        // macOS prints "a:b:c:1:2:3" without leading zeros.
        if part.is_empty() || part.len() > 2 || !part.chars().all(|c| c.is_ascii_hexdigit()) {
            return None;
        }
        *slot = u8::from_str_radix(part, 16).ok()?;
    }
    if mac == [0; 6] || mac == [0xFF; 6] {
        return None;
    }
    Some(mac)
}

pub fn format_mac(mac: [u8; 6]) -> String {
    mac.iter().map(|b| format!("{b:02x}")).collect::<Vec<_>>().join(":")
}

pub fn magic_packet(mac: &[u8; 6]) -> [u8; 102] {
    let mut pkt = [0xFF; 102];
    for chunk in pkt[6..].chunks_mut(6) {
        chunk.copy_from_slice(mac);
    }
    pkt
}

async fn send_magic_packets(macs: &[[u8; 6]], host: &str, nets: &[LocalNet]) -> usize {
    let Ok(sock) = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).await else {
        return 0;
    };
    let _ = sock.set_broadcast(true);

    let mut targets: Vec<Ipv4Addr> = vec![Ipv4Addr::BROADCAST];
    targets.extend(nets.iter().filter(|n| n.ip.is_private()).map(LocalNet::broadcast));
    if let Ok(ip) = host.parse::<Ipv4Addr>() {
        targets.push(ip);
    }
    targets.sort();
    targets.dedup();

    let mut sent = 0;
    for mac in macs {
        let pkt = magic_packet(mac);
        for &ip in &targets {
            for port in [9, 7] {
                if sock.send_to(&pkt, (ip, port)).await.is_ok() {
                    sent += 1;
                }
            }
        }
    }
    sent
}

/// Find the MAC for `ip` in `arp -a` / `arp -n` / `/proc/net/arp` output.
pub fn parse_arp_output(text: &str, ip: Ipv4Addr) -> Option<String> {
    let ip = ip.to_string();
    text.lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>())
        .filter(|tokens| tokens.iter().any(|t| t.trim_matches(['(', ')']) == ip))
        .find_map(|tokens| tokens.iter().find_map(|t| parse_mac(t)))
        .map(format_mac)
}

#[cfg(target_os = "linux")]
fn arp_lookup_blocking(ip: Ipv4Addr) -> Option<String> {
    let table = std::fs::read_to_string("/proc/net/arp").ok()?;
    parse_arp_output(&table, ip)
}

#[cfg(not(target_os = "linux"))]
fn arp_lookup_blocking(ip: Ipv4Addr) -> Option<String> {
    let mut cmd = std::process::Command::new("arp");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW).args(["-a", &ip.to_string()]);
    }
    #[cfg(not(windows))]
    cmd.args(["-n", &ip.to_string()]);
    let out = cmd.output().ok()?;
    parse_arp_output(&String::from_utf8_lossy(&out.stdout), ip)
}

/// The MAC address of a device we've talked to recently, from the OS ARP cache.
/// Newer Roku firmware hides its MAC from device-info in Limited mode.
pub async fn arp_lookup(host: &str) -> Option<String> {
    let ip: Ipv4Addr = host.parse().ok()?;
    tokio::task::spawn_blocking(move || arp_lookup_blocking(ip))
        .await
        .ok()
        .flatten()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerOnReport {
    /// `ecp` when the TV was listening, `wakeOnLan` when it had to be woken.
    pub method: &'static str,
    pub packets_sent: usize,
    pub waited_ms: u64,
}

/// `PowerOn` for TVs; streaming players have no such key, so press Home,
/// which wakes the player and (over HDMI-CEC) usually the TV too.
async fn power_key(host: &str) -> Result<(), EcpError> {
    match keypress(host, "PowerOn").await {
        Err(e) if e.kind == ErrorKind::Unsupported => keypress(host, "Home").await,
        other => other,
    }
}

/// Turn a device on, even from deep standby.
///
/// A Roku TV with Fast TV start keeps its network up while "off" and accepts
/// `PowerOn` straight away. Without it the network sleeps too, so send
/// Wake-on-LAN magic packets to every MAC we know and keep knocking until the
/// TV answers or we give up.
pub async fn power_on(host: &str, macs: &[String]) -> Result<PowerOnReport, EcpError> {
    let start = Instant::now();
    let report = |method, packets_sent| PowerOnReport {
        method,
        packets_sent,
        waited_ms: start.elapsed().as_millis() as u64,
    };

    match power_key(host).await {
        Ok(()) => return Ok(report("ecp", 0)),
        Err(e) if e.kind != ErrorKind::Unreachable => return Err(e),
        Err(_) => {}
    }

    let mut known: Vec<[u8; 6]> = macs.iter().filter_map(|m| parse_mac(m)).collect();
    if let Some(mac) = arp_lookup(host).await.and_then(|m| parse_mac(&m)) {
        known.push(mac);
    }
    known.sort();
    known.dedup();
    if known.is_empty() {
        return Err(EcpError::new(
            ErrorKind::Unreachable,
            format!(
                "The TV at {host} isn't answering, so it's fully powered off. {FAST_START_HELP} \
                 (Wake-on-LAN also needs this app to have seen the TV once while it was on.)"
            ),
        ));
    }

    let nets = local_networks();
    let deadline = start + Duration::from_secs(25);
    let mut packets = 0;
    let mut last_wol: Option<Instant> = None;
    while Instant::now() < deadline {
        if last_wol.map_or(true, |t| t.elapsed() >= Duration::from_secs(3)) {
            packets += send_magic_packets(&known, host, &nets).await;
            last_wol = Some(Instant::now());
        }
        tokio::time::sleep(Duration::from_millis(1200)).await;
        match power_key(host).await {
            Ok(()) => return Ok(report("wakeOnLan", packets)),
            Err(e) if e.kind == ErrorKind::Unreachable => continue,
            Err(e) => return Err(e),
        }
    }
    Err(EcpError::new(
        ErrorKind::Unreachable,
        format!("Sent wake-up signals, but the TV didn't respond. {FAST_START_HELP}"),
    ))
}

// ─── Tests ─────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const DEVICE_INFO: &str = r#"<?xml version="1.0" encoding="UTF-8" ?>
<device-info>
	<udn>29380011-0800-1026-806b-a0629f9a1cbe</udn>
	<serial-number>X01900ABCDEF</serial-number>
	<device-id>S0A1234567890</device-id>
	<vendor-name>Hisense</vendor-name>
	<model-name>58R6E3</model-name>
	<model-number>G218X</model-number>
	<is-tv>true</is-tv>
	<is-stick>false</is-stick>
	<wifi-mac>A0:62:FB:9A:1C:BE</wifi-mac>
	<ethernet-mac>a0:62:fb:9a:1c:bd</ethernet-mac>
	<network-type>wifi</network-type>
	<friendly-device-name>Hisense•58R6E3</friendly-device-name>
	<friendly-model-name>Hisense•58R6E3</friendly-model-name>
	<default-device-name>Hisense•58R6E3 - X01900ABCDEF</default-device-name>
	<user-device-name>Living Room &amp; Den</user-device-name>
	<user-device-location>Living room</user-device-location>
	<software-version>14.1.4</software-version>
	<power-mode>DisplayOff</power-mode>
	<supports-find-remote>true</supports-find-remote>
	<supports-wake-on-wlan>false</supports-wake-on-wlan>
	<ecp-setting-mode>Limited</ecp-setting-mode>
	<keyed-developer-id/>
</device-info>"#;

    #[test]
    fn parses_device_info() {
        let d = parse_device_info("192.168.1.20", DEVICE_INFO).unwrap();
        assert_eq!(d.ip, "192.168.1.20");
        assert_eq!(d.name, "Living Room & Den");
        assert_eq!(d.model, "Hisense•58R6E3");
        assert_eq!(d.model_number, "G218X");
        assert_eq!(d.vendor, "Hisense");
        assert_eq!(d.serial, "X01900ABCDEF");
        assert_eq!(d.software_version, "14.1.4");
        assert_eq!(d.power_mode, "DisplayOff");
        assert_eq!(d.ecp_mode, "limited");
        assert_eq!(d.wifi_mac, "a0:62:fb:9a:1c:be");
        assert!(d.is_tv && !d.is_stick && d.supports_find_remote && !d.supports_wake_on_wlan);
    }

    #[test]
    fn device_name_falls_back_to_model_then_ip() {
        let xml = "<device-info><vendor-name>Roku</vendor-name><model-name>Roku Express</model-name></device-info>";
        assert_eq!(parse_device_info("10.0.0.5", xml).unwrap().name, "Roku Express");
        let xml = "<device-info><serial-number>X1</serial-number></device-info>";
        assert_eq!(parse_device_info("10.0.0.5", xml).unwrap().name, "Roku at 10.0.0.5");
    }

    #[test]
    fn rejects_non_roku_xml() {
        assert!(parse_device_info("10.0.0.5", "<html><body>router</body></html>").is_none());
    }

    #[test]
    fn parses_apps_and_skips_the_container() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8" ?>
<apps>
	<app id="tvinput.hdmi1" type="tvin" version="1.0.0">Xbox</app>
	<app id="12" type="appl" version="5.1.22">Netflix</app>
	<app id="2213" subtype="rsga" type="appl" version="3.2.1">Roku Media Player</app>
	<app id="61322" type="appl" version="2.0.1">Max &amp; HBO</app>
</apps>"#;
        let apps = parse_apps(xml);
        assert_eq!(apps.len(), 4);
        assert_eq!(apps[0], RokuApp { id: "tvinput.hdmi1".into(), name: "Xbox".into(), kind: "tvin".into(), version: "1.0.0".into() });
        assert_eq!(apps[2].kind, "appl");
        assert_eq!(apps[3].name, "Max & HBO");
    }

    #[test]
    fn active_app_home_screen_has_no_id() {
        let home = "<active-app><app>Roku</app></active-app>";
        assert!(parse_apps(home).into_iter().all(|a| a.id.is_empty()));
        let playing = r#"<active-app><app id="12" type="appl" version="5.1">Netflix</app><screensaver id="55545" type="ssvr" version="2.0.1">Aquarium</screensaver></active-app>"#;
        let first = parse_apps(playing).into_iter().find(|a| !a.id.is_empty()).unwrap();
        assert_eq!(first.name, "Netflix");
    }

    #[test]
    fn unescapes_entities() {
        assert_eq!(unescape_xml("A &amp; B &lt;3 &#233;&#x1F600; & done"), "A & B <3 é😀 & done");
        assert_eq!(unescape_xml("no entities"), "no entities");
        assert_eq!(unescape_xml("&bogus;"), "&bogus;");
    }

    #[test]
    fn text_becomes_lit_keys() {
        assert_eq!(text_to_keys("Hi 5"), ["Lit_H", "Lit_i", "Lit_%20", "Lit_5"]);
        assert_eq!(text_to_keys("a+b&c/?#"), ["Lit_a", "Lit_%2B", "Lit_b", "Lit_%26", "Lit_c", "Lit_%2F", "Lit_%3F", "Lit_%23"]);
        assert_eq!(text_to_keys("é"), ["Lit_%C3%A9"]);
        assert_eq!(text_to_keys("ok\r\n\t"), ["Lit_o", "Lit_k", "Enter"]);
        for key in text_to_keys("Crème brûlée — 100% 🎬") {
            validate_key(&key).unwrap();
        }
    }

    #[test]
    fn normalizes_hosts() {
        assert_eq!(normalize_host(" 192.168.1.20 ").unwrap(), "192.168.1.20");
        assert_eq!(normalize_host("http://192.168.1.20:8060/query/device-info").unwrap(), "192.168.1.20");
        assert_eq!(normalize_host("HTTP://Roku-Den.local").unwrap(), "roku-den.local");
        for bad in ["", "   ", "192.168.1.300", "0.0.0.0", "255.255.255.255", "evil com", "a b", "roku_den.local", "-bad.local", "http://", "é.local"] {
            let err = normalize_host(bad).unwrap_err();
            assert_eq!(err.kind, ErrorKind::Invalid, "{bad:?} should be rejected");
        }
    }

    #[test]
    fn validates_keys_and_app_ids() {
        for ok in ["Home", "VolumeUp", "Lit_a", "Lit_%C3%A9", "InputHDMI1"] {
            validate_key(ok).unwrap();
        }
        for bad in ["", "../launch/12", "Home?x=1", "Lit_ ", "a/b"] {
            assert!(validate_key(bad).is_err(), "{bad:?}");
        }
        for ok in ["12", "tvinput.hdmi1", "dev", "tvinput.dtv"] {
            validate_app_id(ok).unwrap();
        }
        for bad in ["", "12/../../keypress/Home", "12?x", "a b"] {
            assert!(validate_app_id(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn maps_http_status_to_actionable_errors() {
        let e = status_error(403, "ECP command not allowed in limited mode.");
        assert_eq!(e.kind, ErrorKind::Limited);
        assert!(e.message.contains("Control by mobile apps"));
        assert_eq!(status_error(404, "").kind, ErrorKind::Unsupported);
        let other = status_error(503, "busy");
        assert_eq!(other.kind, ErrorKind::Other);
        assert!(other.message.contains("503") && other.message.contains("busy"));
    }

    #[test]
    fn parses_macs_in_every_os_format() {
        let want = [0xa0, 0x62, 0xfb, 0x02, 0x1c, 0x0e];
        assert_eq!(parse_mac("a0:62:fb:02:1c:0e"), Some(want));
        assert_eq!(parse_mac("A0-62-FB-02-1C-0E"), Some(want));
        assert_eq!(parse_mac("a0:62:fb:2:1c:e"), Some(want));
        assert_eq!(parse_mac("a062fb021c0e"), Some(want));
        for bad in ["", "00:00:00:00:00:00", "ff:ff:ff:ff:ff:ff", "a0:62:fb:02:1c", "zz:62:fb:02:1c:0e", "0x1", "192.168.1.1", "a0:62:fb:02:1c:0e:11"] {
            assert_eq!(parse_mac(bad), None, "{bad:?}");
        }
        assert_eq!(format_mac(want), "a0:62:fb:02:1c:0e");
    }

    #[test]
    fn builds_magic_packets() {
        let mac = [1, 2, 3, 4, 5, 6];
        let pkt = magic_packet(&mac);
        assert_eq!(&pkt[..6], &[0xFF; 6]);
        assert!(pkt[6..].chunks(6).all(|c| c == mac));
        assert_eq!(pkt[6..].chunks(6).count(), 16);
    }

    #[test]
    fn finds_macs_in_arp_tables() {
        let ip: Ipv4Addr = "192.168.0.126".parse().unwrap();
        let windows = "\r\nInterface: 192.168.0.10 --- 0x5\r\n  Internet Address      Physical Address      Type\r\n  192.168.0.1           10-20-30-40-50-60     dynamic\r\n  192.168.0.126         a0-62-fb-9a-1c-be     dynamic\r\n";
        let macos = "? (192.168.0.1) at 10:20:30:40:50:60 on en0 ifscope [ethernet]\n? (192.168.0.126) at a0:62:fb:9a:1c:be on en0 ifscope [ethernet]\n";
        let linux = "IP address       HW type     Flags       HW address            Mask     Device\n192.168.0.126    0x1         0x2         a0:62:fb:9a:1c:be     *        wlan0\n192.168.0.12     0x1         0x0         00:00:00:00:00:00     *        wlan0\n";
        for table in [windows, macos, linux] {
            assert_eq!(parse_arp_output(table, ip).as_deref(), Some("a0:62:fb:9a:1c:be"));
        }
        let incomplete: Ipv4Addr = "192.168.0.12".parse().unwrap();
        assert_eq!(parse_arp_output(linux, incomplete), None);
        let other: Ipv4Addr = "192.168.0.12".parse().unwrap();
        assert_eq!(parse_arp_output(windows, other), None);
    }

    #[test]
    fn scan_targets_cover_the_local_subnet_only() {
        let net = |ip: &str, mask: &str| LocalNet { ip: ip.parse().unwrap(), netmask: mask.parse().unwrap() };
        let t = scan_targets(&[net("192.168.1.50", "255.255.255.0")]);
        assert_eq!(t.len(), 253);
        assert!(!t.contains(&"192.168.1.50".parse().unwrap()));
        assert!(!t.contains(&"192.168.1.0".parse().unwrap()) && !t.contains(&"192.168.1.255".parse().unwrap()));
        // A /16 is narrowed to our own /24.
        assert_eq!(scan_targets(&[net("10.0.4.9", "255.255.0.0")]).len(), 253);
        // A /22 is scanned whole.
        assert_eq!(scan_targets(&[net("172.16.5.9", "255.255.252.0")]).len(), 1021);
        // Public addresses and point-to-point links are never scanned.
        assert!(scan_targets(&[net("8.8.8.8", "255.255.255.0"), net("192.168.9.1", "255.255.255.255")]).is_empty());
        assert_eq!(net("192.168.1.50", "255.255.255.0").broadcast(), "192.168.1.255".parse::<Ipv4Addr>().unwrap());
    }

    #[test]
    fn parses_ssdp_replies() {
        let src: SocketAddr = "192.168.1.77:1900".parse().unwrap();
        let reply = b"HTTP/1.1 200 OK\r\nCache-Control: max-age=3600\r\nST: roku:ecp\r\nLOCATION: http://192.168.1.134:8060/\r\nUSN: uuid:roku:ecp:X01900ABCDEF\r\n\r\n";
        assert_eq!(parse_ssdp_response(reply, src).as_deref(), Some("192.168.1.134"));
        let no_location = b"HTTP/1.1 200 OK\r\nST: roku:ecp\r\n\r\n";
        assert_eq!(parse_ssdp_response(no_location, src).as_deref(), Some("192.168.1.77"));
        let not_roku = b"HTTP/1.1 200 OK\r\nST: upnp:rootdevice\r\nLOCATION: http://192.168.1.1:5000/\r\n\r\n";
        assert_eq!(parse_ssdp_response(not_roku, src), None);
    }

    /// Try discovery on whatever network this machine is on:
    /// `cargo test discovers_on_this_network -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "needs a real network"]
    async fn discovers_on_this_network() {
        let start = std::time::Instant::now();
        let nets = local_networks();
        println!("networks: {nets:?} ({} scan targets)", scan_targets(&nets).len());
        let found = discover(false).await;
        println!("{} Roku(s) in {:?}: {found:#?}", found.len(), start.elapsed());
        assert!(start.elapsed() < Duration::from_secs(20), "discovery must stay quick");
    }

    /// A tiny fake Roku on a loopback address, answering every request with
    /// the scripted status and body, and recording the request lines it saw.
    #[cfg(target_os = "linux")]
    async fn fake_roku(ip: &str, routes: Vec<(&'static str, u16, &'static str)>) -> Arc<std::sync::Mutex<Vec<String>>> {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind((ip, ECP_PORT)).await.expect("bind fake roku");
        let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let log = seen.clone();
        tokio::spawn(async move {
            loop {
                let Ok((mut stream, _)) = listener.accept().await else { return };
                let routes = routes.clone();
                let log = log.clone();
                tokio::spawn(async move {
                    let mut buf = vec![0u8; 4096];
                    loop {
                        let Ok(n) = stream.read(&mut buf).await else { return };
                        if n == 0 { return; }
                        let req = String::from_utf8_lossy(&buf[..n]).to_string();
                        let line = req.lines().next().unwrap_or_default().to_string();
                        log.lock().unwrap().push(line.clone());
                        let (status, body) = routes
                            .iter()
                            .find(|(prefix, _, _)| line.contains(prefix))
                            .map(|(_, s, b)| (*s, *b))
                            .unwrap_or((404, ""));
                        let resp = format!("HTTP/1.1 {status} X\r\nContent-Length: {}\r\n\r\n{body}", body.len());
                        if stream.write_all(resp.as_bytes()).await.is_err() { return; }
                    }
                });
            }
        });
        seen
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn talks_to_a_roku_and_reports_limited_mode() {
        let ip = "127.0.0.61";
        let seen = fake_roku(ip, vec![
            ("/query/device-info", 200, DEVICE_INFO),
            ("/keypress/VolumeUp", 200, ""),
            ("/keypress/Home", 403, "ECP command not allowed in limited mode."),
            ("/keypress/Lit_", 200, ""),
            ("/launch/12", 200, ""),
        ]).await;

        let dev = device_info(ip).await.unwrap();
        assert_eq!(dev.name, "Living Room & Den");
        keypress(ip, "VolumeUp").await.unwrap();
        let err = keypress(ip, "Home").await.unwrap_err();
        assert_eq!(err.kind, ErrorKind::Limited);
        assert_eq!(keypress(ip, "InputHDMI9").await.unwrap_err().kind, ErrorKind::Unsupported);
        send_text(ip, "a b").await.unwrap();
        launch(ip, "12").await.unwrap();

        let seen = seen.lock().unwrap().clone();
        assert!(seen.contains(&"POST /keypress/Lit_a HTTP/1.1".to_string()), "{seen:?}");
        assert!(seen.contains(&"POST /keypress/Lit_%20 HTTP/1.1".to_string()), "{seen:?}");
        assert!(seen.contains(&"POST /launch/12 HTTP/1.1".to_string()), "{seen:?}");
        let order: Vec<_> = seen.iter().filter(|l| l.contains("Lit_")).cloned().collect();
        assert_eq!(order, ["POST /keypress/Lit_a HTTP/1.1", "POST /keypress/Lit_%20 HTTP/1.1", "POST /keypress/Lit_b HTTP/1.1"]);
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn subnet_scan_finds_the_ecp_port() {
        fake_roku("127.0.0.70", vec![]).await;
        let targets: Vec<Ipv4Addr> = (65..=80).map(|h| Ipv4Addr::new(127, 0, 0, h)).collect();
        let start = std::time::Instant::now();
        assert_eq!(scan_for_ecp(targets).await, ["127.0.0.70"]);
        assert!(start.elapsed() < Duration::from_secs(2));
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn power_on_uses_ecp_when_the_tv_is_listening() {
        let ip = "127.0.0.62";
        let seen = fake_roku(ip, vec![("/keypress/PowerOn", 200, "")]).await;
        let report = power_on(ip, &[]).await.unwrap();
        assert_eq!(report.method, "ecp");
        assert_eq!(report.packets_sent, 0);
        assert_eq!(seen.lock().unwrap().as_slice(), ["POST /keypress/PowerOn HTTP/1.1"]);
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn power_on_presses_home_on_players_without_a_power_key() {
        let ip = "127.0.0.63";
        let seen = fake_roku(ip, vec![("/keypress/Home", 200, "")]).await;
        assert_eq!(power_on(ip, &[]).await.unwrap().method, "ecp");
        assert_eq!(seen.lock().unwrap().as_slice(), ["POST /keypress/PowerOn HTTP/1.1", "POST /keypress/Home HTTP/1.1"]);
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn unreachable_without_a_mac_explains_fast_tv_start() {
        // Nothing listens on this loopback address, so the connection is refused.
        let err = power_on("127.0.0.64", &[]).await.unwrap_err();
        assert_eq!(err.kind, ErrorKind::Unreachable);
        assert!(err.message.contains("Fast TV start"), "{}", err.message);
    }
}
