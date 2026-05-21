mod auth;
mod thread_actions;
mod workspace;

#[tauri::command]
fn app_ready() -> &'static str {
    "narview-ready"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
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
            workspace::get_review_clone_status,
            workspace::ensure_review_clone,
            workspace::prepare_pull_request_review_clone,
            workspace::read_pull_request_analysis_files,
            workspace::refresh_pull_requests,
            workspace::fetch_pull_request_data,
            workspace::fetch_pull_request_checks,
            thread_actions::reply_review_thread,
            thread_actions::resolve_review_thread,
            thread_actions::unresolve_review_thread,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Narview");
}
