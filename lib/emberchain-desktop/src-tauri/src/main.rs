#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

// ── shared state ─────────────────────────────────────────────────────────────

struct AppState {
    node_process: Arc<Mutex<Option<Child>>>,
}

// ── event payload ─────────────────────────────────────────────────────────────

#[derive(Clone, Serialize, Deserialize)]
struct NodeStatus {
    state: String,   // checking | syncing | starting | ready | error
    message: String,
    progress: f32,   // 0.0 – 1.0
}

// ── helpers ───────────────────────────────────────────────────────────────────

fn emit(app: &AppHandle, state: &str, message: &str, progress: f32) {
    let _ = app.emit(
        "node-status",
        NodeStatus {
            state: state.into(),
            message: message.into(),
            progress,
        },
    );
}

/// Find the system Node.js binary.
fn find_node() -> Option<PathBuf> {
    // 1. Try `which` / `where`
    let which = if cfg!(windows) { "where" } else { "which" };
    for name in &["node", "nodejs"] {
        if let Ok(out) = Command::new(which).arg(name).output() {
            if out.status.success() {
                let path = String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .next()
                    .map(|s| s.trim().to_string())
                    .unwrap_or_default();
                if !path.is_empty() {
                    return Some(PathBuf::from(path));
                }
            }
        }
    }

    // 2. Check common install locations
    let candidates: &[&str] = if cfg!(windows) {
        &[
            r"C:\Program Files\nodejs\node.exe",
            r"C:\Program Files (x86)\nodejs\node.exe",
        ]
    } else if cfg!(target_os = "macos") {
        &[
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ]
    } else {
        &["/usr/bin/node", "/usr/local/bin/node", "/usr/local/sbin/node"]
    };

    candidates
        .iter()
        .map(PathBuf::from)
        .find(|p| p.exists())
}

/// Spin-wait until the local server is accepting TCP connections.
async fn wait_for_port(port: u16, timeout_secs: u64) -> bool {
    let deadline = tokio::time::Instant::now()
        + tokio::time::Duration::from_secs(timeout_secs);
    let addr = format!("127.0.0.1:{port}");
    while tokio::time::Instant::now() < deadline {
        if TcpStream::connect(&addr).is_ok() {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    }
    false
}

/// Download the full chain snapshot from the production node.
async fn download_snapshot(
    chain_file: &PathBuf,
    app: &AppHandle,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;

    emit(app, "syncing", "Connecting to emberchain.org…", 0.15);

    let response = client
        .get("https://emberchain.org/api/sync/snapshot")
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Snapshot server returned HTTP {}",
            response.status()
        ));
    }

    emit(app, "syncing", "Downloading chain state…", 0.45);

    let body = response
        .text()
        .await
        .map_err(|e| format!("Download error: {e}"))?;

    emit(app, "syncing", "Saving chain data…", 0.80);

    std::fs::write(chain_file, &body)
        .map_err(|e| format!("Write error: {e}"))?;

    Ok(())
}

// ── core setup task ───────────────────────────────────────────────────────────

async fn run_setup(app: AppHandle) {
    const PORT: u16 = 8545;

    // ── locate data dir ──────────────────────────────────────────────────────
    let data_dir = match app.path().app_data_dir() {
        Ok(d) => d.join("chain-data"),
        Err(e) => {
            emit(&app, "error", &format!("Cannot access app data directory: {e}"), 0.0);
            return;
        }
    };
    let chain_file = data_dir.join("chain.json");

    // ── locate bundled server ────────────────────────────────────────────────
    let server_mjs = match app.path().resource_dir() {
        Ok(r) => r.join("server.mjs"),
        Err(e) => {
            emit(&app, "error", &format!("Cannot find bundled server: {e}"), 0.0);
            return;
        }
    };

    if !server_mjs.exists() {
        emit(
            &app,
            "error",
            "Bundled server.mjs not found — please reinstall Emberchain Desktop.",
            0.0,
        );
        return;
    }

    // ── check for Node.js ────────────────────────────────────────────────────
    emit(&app, "checking", "Looking for Node.js…", 0.05);
    let node_bin = match find_node() {
        Some(b) => b,
        None => {
            emit(
                &app,
                "no-node",
                "Node.js is required but was not found on your system.",
                0.0,
            );
            return;
        }
    };

    // ── verify Node.js version ≥ 20 ──────────────────────────────────────────
    if let Ok(out) = Command::new(&node_bin).arg("--version").output() {
        let ver = String::from_utf8_lossy(&out.stdout);
        let major: u32 = ver
            .trim()
            .trim_start_matches('v')
            .split('.')
            .next()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        if major < 20 {
            emit(
                &app,
                "error",
                &format!("Node.js {ver} found but v20+ is required. Please update Node.js."),
                0.0,
            );
            return;
        }
    }

    // ── download snapshot if first run ───────────────────────────────────────
    if !chain_file.exists() {
        emit(&app, "syncing", "First launch — downloading chain data…", 0.10);
        if let Err(e) = std::fs::create_dir_all(&data_dir) {
            emit(&app, "error", &format!("Cannot create data directory: {e}"), 0.0);
            return;
        }
        if let Err(e) = download_snapshot(&chain_file, &app).await {
            emit(&app, "error", &format!("Sync failed: {e}"), 0.0);
            return;
        }
        emit(&app, "syncing", "Chain data saved.", 0.85);
    }

    // ── start the local node ─────────────────────────────────────────────────
    emit(&app, "starting", "Starting local Emberchain node…", 0.90);

    let child = Command::new(&node_bin)
        .arg("--enable-source-maps")
        .arg(&server_mjs)
        .env("PORT", PORT.to_string())
        .env("CHAIN_DATA_FILE", chain_file.to_string_lossy().as_ref())
        .env("DATABASE_URL", "")
        .env("NODE_ENV", "production")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();

    let child = match child {
        Ok(c) => c,
        Err(e) => {
            emit(&app, "error", &format!("Failed to start node process: {e}"), 0.0);
            return;
        }
    };

    if let Some(state) = app.try_state::<AppState>() {
        *state.node_process.lock().unwrap() = Some(child);
    }

    // ── wait for server to accept connections ─────────────────────────────────
    emit(&app, "starting", "Waiting for node to be ready…", 0.95);

    if wait_for_port(PORT, 30).await {
        emit(&app, "ready", "Your local Emberchain node is running.", 1.0);
    } else {
        emit(
            &app,
            "error",
            &format!("Node did not start within 30 seconds — is port {PORT} already in use?"),
            0.0,
        );
    }
}

// ── tauri commands ────────────────────────────────────────────────────────────

/// Force a chain re-sync: delete local chain.json and restart.
#[tauri::command]
async fn resync_chain(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    // Kill existing node process
    if let Ok(mut guard) = state.node_process.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    // Delete chain file
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("chain-data");
    let chain_file = data_dir.join("chain.json");
    if chain_file.exists() {
        std::fs::remove_file(&chain_file).map_err(|e| e.to_string())?;
    }

    // Re-run setup
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move { run_setup(app2).await });

    Ok(())
}

/// Return the path to the chain data file (for display in Settings).
#[tauri::command]
fn chain_data_path(app: AppHandle) -> String {
    app.path()
        .app_data_dir()
        .map(|d| d.join("chain-data").join("chain.json").to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".into())
}

// ── main ──────────────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            node_process: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![resync_chain, chain_data_path])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                run_setup(handle).await;
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<AppState>() {
                    if let Ok(mut guard) = state.node_process.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Emberchain Desktop");
}
