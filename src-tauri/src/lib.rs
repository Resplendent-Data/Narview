mod auth;
mod workspace;

#[tauri::command]
fn app_ready() -> &'static str {
    "narview-ready"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(auth::AuthState::new())
        .manage(workspace::WorkspaceState::new())
        .invoke_handler(tauri::generate_handler![
            app_ready,
            auth::auth_status,
            auth::start_github_oauth,
            auth::poll_github_oauth,
            auth::sign_out,
            workspace::list_workspace_repositories,
            workspace::save_workspace_repository,
            workspace::remove_workspace_repository,
            workspace::refresh_pull_requests,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Narview");
}
