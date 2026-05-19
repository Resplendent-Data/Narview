use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::{header::HeaderMap, StatusCode};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::auth::AuthState;

const WORKSPACE_FILE_NAME: &str = "workspace.json";
const GITHUB_API_ROOT: &str = "https://api.github.com";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCommandError {
    code: String,
    message: String,
}

impl WorkspaceCommandError {
    fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    fn io(operation: &str, error: io::Error) -> Self {
        Self::new(
            "workspace-io-error",
            format!("Could not {operation} the local Workspace: {error}"),
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRepository {
    owner: String,
    name: String,
    slug: String,
}

impl WorkspaceRepository {
    fn new(owner: impl Into<String>, name: impl Into<String>) -> Self {
        let owner = owner.into();
        let name = name.into();
        let slug = format!("{owner}/{name}");

        Self { owner, name, slug }
    }

    fn key(&self) -> String {
        self.slug.to_ascii_lowercase()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestSummary {
    repository: String,
    number: u64,
    title: String,
    author_login: Option<String>,
    is_draft: bool,
    updated_at: String,
    url: String,
}

impl PullRequestSummary {
    fn key(&self) -> String {
        format!("{}#{}", self.repository, self.number)
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RefreshState {
    Fresh,
    Failed,
    RateLimited,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RefreshStatus {
    state: RefreshState,
    message: Option<String>,
    rate_limit_reset_epoch_seconds: Option<u64>,
    refreshed_at_epoch_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestRefreshResponse {
    repositories: Vec<WorkspaceRepository>,
    pull_requests: Vec<PullRequestSummary>,
    status: RefreshStatus,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRepositoriesResponse {
    repositories: Vec<WorkspaceRepository>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct WorkspaceFile {
    repositories: Vec<WorkspaceRepository>,
}

pub struct WorkspaceState {
    pub(crate) http: reqwest::Client,
}

impl WorkspaceState {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
        }
    }
}

#[tauri::command]
pub fn list_workspace_repositories(
    app: AppHandle,
) -> Result<WorkspaceRepositoriesResponse, WorkspaceCommandError> {
    let workspace = read_workspace(&workspace_file_path(&app)?)?;

    Ok(WorkspaceRepositoriesResponse {
        repositories: workspace.repositories,
    })
}

#[tauri::command]
pub fn save_workspace_repository(
    app: AppHandle,
    slug: String,
) -> Result<WorkspaceRepositoriesResponse, WorkspaceCommandError> {
    let path = workspace_file_path(&app)?;
    let repository = parse_repository_slug(&slug)?;
    let mut workspace = read_workspace(&path)?;

    workspace
        .repositories
        .retain(|existing| existing.key() != repository.key());
    workspace.repositories.push(repository);
    sort_repositories(&mut workspace.repositories);
    write_workspace(&path, &workspace)?;

    Ok(WorkspaceRepositoriesResponse {
        repositories: workspace.repositories,
    })
}

#[tauri::command]
pub fn remove_workspace_repository(
    app: AppHandle,
    owner: String,
    name: String,
) -> Result<WorkspaceRepositoriesResponse, WorkspaceCommandError> {
    let path = workspace_file_path(&app)?;
    let target = WorkspaceRepository::new(owner, name);
    let mut workspace = read_workspace(&path)?;

    workspace
        .repositories
        .retain(|existing| existing.key() != target.key());
    write_workspace(&path, &workspace)?;

    Ok(WorkspaceRepositoriesResponse {
        repositories: workspace.repositories,
    })
}

#[tauri::command]
pub async fn refresh_pull_requests(
    app: AppHandle,
    auth_state: State<'_, AuthState>,
    workspace_state: State<'_, WorkspaceState>,
    include_drafts: bool,
) -> Result<PullRequestRefreshResponse, WorkspaceCommandError> {
    let repositories = read_workspace(&workspace_file_path(&app)?)?.repositories;
    if repositories.is_empty() {
        return Ok(PullRequestRefreshResponse {
            repositories,
            pull_requests: Vec::new(),
            status: RefreshStatus {
                state: RefreshState::Fresh,
                message: Some("No repositories saved yet.".to_string()),
                rate_limit_reset_epoch_seconds: None,
                refreshed_at_epoch_seconds: Some(now_epoch_seconds()),
            },
        });
    }

    let Some(token) = auth_state
        .github_token()
        .map_err(|error| WorkspaceCommandError::new("github-session-error", format!("{error:?}")))?
    else {
        return Ok(PullRequestRefreshResponse {
            repositories,
            pull_requests: Vec::new(),
            status: RefreshStatus {
                state: RefreshState::Failed,
                message: Some("Sign in to refresh GitHub pull requests.".to_string()),
                rate_limit_reset_epoch_seconds: None,
                refreshed_at_epoch_seconds: None,
            },
        });
    };

    fetch_open_pull_requests(
        &workspace_state.http,
        &token,
        repositories,
        include_drafts,
    )
    .await
}

async fn fetch_open_pull_requests(
    http: &reqwest::Client,
    token: &str,
    repositories: Vec<WorkspaceRepository>,
    include_drafts: bool,
) -> Result<PullRequestRefreshResponse, WorkspaceCommandError> {
    let mut pull_requests = Vec::new();

    for repository in &repositories {
        let url = format!(
            "{GITHUB_API_ROOT}/repos/{}/{}/pulls?state=open&per_page=100",
            repository.owner, repository.name
        );
        let response = http
            .get(url)
            .bearer_auth(token)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", "Narview")
            .send()
            .await
            .map_err(|error| {
                WorkspaceCommandError::new(
                    "github-refresh-network-error",
                    format!("Could not refresh GitHub pull requests: {error}"),
                )
            })?;

        if response.status() == StatusCode::FORBIDDEN && rate_limit_remaining(response.headers()) == Some(0) {
            return Ok(PullRequestRefreshResponse {
                repositories: repositories.clone(),
                pull_requests: Vec::new(),
                status: RefreshStatus {
                    state: RefreshState::RateLimited,
                    message: Some("GitHub rate limit reached. Refresh later.".to_string()),
                    rate_limit_reset_epoch_seconds: rate_limit_reset(response.headers()),
                    refreshed_at_epoch_seconds: None,
                },
            });
        }

        if !response.status().is_success() {
            return Ok(PullRequestRefreshResponse {
                repositories: repositories.clone(),
                pull_requests: Vec::new(),
                status: RefreshStatus {
                    state: RefreshState::Failed,
                    message: Some(format!(
                        "GitHub rejected {} with HTTP {}.",
                        repository.slug,
                        response.status()
                    )),
                    rate_limit_reset_epoch_seconds: rate_limit_reset(response.headers()),
                    refreshed_at_epoch_seconds: None,
                },
            });
        }

        let github_pull_requests = response
            .json::<Vec<GithubPullRequest>>()
            .await
            .map_err(|error| {
                WorkspaceCommandError::new(
                    "github-refresh-response-error",
                    format!("Could not read GitHub pull requests: {error}"),
                )
            })?;

        pull_requests.extend(summarize_pull_requests(repository, github_pull_requests, include_drafts));
    }

    pull_requests.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then_with(|| left.key().cmp(&right.key()))
    });

    let pull_request_count = pull_requests.len();

    Ok(PullRequestRefreshResponse {
        repositories,
        pull_requests,
        status: RefreshStatus {
            state: RefreshState::Fresh,
            message: Some(format!("Fetched {pull_request_count} open pull requests.")),
            rate_limit_reset_epoch_seconds: None,
            refreshed_at_epoch_seconds: Some(now_epoch_seconds()),
        },
    })
}

fn summarize_pull_requests(
    repository: &WorkspaceRepository,
    pull_requests: Vec<GithubPullRequest>,
    include_drafts: bool,
) -> Vec<PullRequestSummary> {
    pull_requests
        .into_iter()
        .filter(|pull_request| include_drafts || !pull_request.draft.unwrap_or(false))
        .map(|pull_request| PullRequestSummary {
            repository: repository.slug.clone(),
            number: pull_request.number,
            title: pull_request.title,
            author_login: pull_request.user.map(|user| user.login),
            is_draft: pull_request.draft.unwrap_or(false),
            updated_at: pull_request.updated_at,
            url: pull_request.html_url,
        })
        .collect()
}

#[derive(Debug, Deserialize)]
struct GithubPullRequest {
    number: u64,
    title: String,
    draft: Option<bool>,
    html_url: String,
    updated_at: String,
    user: Option<GithubUser>,
}

#[derive(Debug, Deserialize)]
struct GithubUser {
    login: String,
}

fn workspace_file_path(app: &AppHandle) -> Result<PathBuf, WorkspaceCommandError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| WorkspaceCommandError::new("workspace-path-error", error.to_string()))?;

    Ok(app_data_dir.join(WORKSPACE_FILE_NAME))
}

fn read_workspace(path: &Path) -> Result<WorkspaceFile, WorkspaceCommandError> {
    match fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents).map_err(|error| {
            WorkspaceCommandError::new(
                "workspace-file-invalid",
                format!("Could not read saved repositories: {error}"),
            )
        }),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(WorkspaceFile::default()),
        Err(error) => Err(WorkspaceCommandError::io("read", error)),
    }
}

fn write_workspace(path: &Path, workspace: &WorkspaceFile) -> Result<(), WorkspaceCommandError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| WorkspaceCommandError::io("prepare", error))?;
    }

    let contents = serde_json::to_string_pretty(workspace).map_err(|error| {
        WorkspaceCommandError::new(
            "workspace-serialization-error",
            format!("Could not save Workspace repositories: {error}"),
        )
    })?;

    fs::write(path, contents).map_err(|error| WorkspaceCommandError::io("save", error))
}

fn parse_repository_slug(value: &str) -> Result<WorkspaceRepository, WorkspaceCommandError> {
    let mut normalized = value.trim().trim_end_matches(".git").to_string();
    normalized = normalized
        .strip_prefix("https://github.com/")
        .or_else(|| normalized.strip_prefix("http://github.com/"))
        .or_else(|| normalized.strip_prefix("github.com/"))
        .or_else(|| normalized.strip_prefix("git@github.com:"))
        .unwrap_or(&normalized)
        .trim_end_matches('/')
        .to_string();

    if normalized.contains("://") || normalized.starts_with("git@") {
        return Err(WorkspaceCommandError::new(
            "repository-host-unsupported",
            "Narview v1 supports github.com repositories.",
        ));
    }

    let parts = normalized
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();

    if parts.len() < 2 || !valid_repository_part(parts[0]) || !valid_repository_part(parts[1]) {
        return Err(WorkspaceCommandError::new(
            "repository-slug-invalid",
            "Enter a GitHub repository as owner/name.",
        ));
    }

    Ok(WorkspaceRepository::new(parts[0], parts[1]))
}

fn valid_repository_part(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
}

fn sort_repositories(repositories: &mut [WorkspaceRepository]) {
    repositories.sort_by_key(WorkspaceRepository::key);
}

fn rate_limit_remaining(headers: &HeaderMap) -> Option<u32> {
    headers
        .get("x-ratelimit-remaining")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok())
}

fn rate_limit_reset(headers: &HeaderMap) -> Option<u64> {
    headers
        .get("x-ratelimit-reset")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok())
}

fn now_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_workspace_path() -> PathBuf {
        std::env::temp_dir().join(format!("narview-workspace-{}.json", uuid::Uuid::new_v4()))
    }

    #[test]
    fn saves_normalized_repositories_without_duplicates() {
        let path = test_workspace_path();
        let mut workspace = read_workspace(&path).unwrap();

        workspace
            .repositories
            .push(parse_repository_slug("https://github.com/Resplendent-Data/Narview").unwrap());
        let duplicate = parse_repository_slug("resplendent-data/narview").unwrap();
        workspace
            .repositories
            .retain(|repository| repository.key() != duplicate.key());
        workspace.repositories.push(duplicate);
        sort_repositories(&mut workspace.repositories);
        write_workspace(&path, &workspace).unwrap();

        let saved = read_workspace(&path).unwrap();
        fs::remove_file(path).ok();

        assert_eq!(saved.repositories.len(), 1);
        assert_eq!(saved.repositories[0].slug, "resplendent-data/narview");
    }

    #[test]
    fn removes_saved_repository_by_case_insensitive_key() {
        let path = test_workspace_path();
        write_workspace(
            &path,
            &WorkspaceFile {
                repositories: vec![
                    WorkspaceRepository::new("Resplendent-Data", "Narview"),
                    WorkspaceRepository::new("openai", "codex"),
                ],
            },
        )
        .unwrap();

        let mut workspace = read_workspace(&path).unwrap();
        let target = WorkspaceRepository::new("resplendent-data", "narview");
        workspace
            .repositories
            .retain(|repository| repository.key() != target.key());
        write_workspace(&path, &workspace).unwrap();

        let saved = read_workspace(&path).unwrap();
        fs::remove_file(path).ok();

        assert_eq!(saved.repositories.len(), 1);
        assert_eq!(saved.repositories[0].slug, "openai/codex");
    }

    #[test]
    fn rejects_non_github_repository_urls() {
        let error = parse_repository_slug("https://gitlab.com/acme/api").unwrap_err();

        assert_eq!(error.code, "repository-host-unsupported");
    }

    #[test]
    fn filters_draft_pull_requests_by_default() {
        let repository = WorkspaceRepository::new("acme", "api");
        let pull_requests = vec![
            GithubPullRequest {
                number: 11,
                title: "Ready review".to_string(),
                draft: Some(false),
                html_url: "https://github.com/acme/api/pull/11".to_string(),
                updated_at: "2026-05-18T12:00:00Z".to_string(),
                user: Some(GithubUser {
                    login: "octocat".to_string(),
                }),
            },
            GithubPullRequest {
                number: 12,
                title: "Draft review".to_string(),
                draft: Some(true),
                html_url: "https://github.com/acme/api/pull/12".to_string(),
                updated_at: "2026-05-18T13:00:00Z".to_string(),
                user: Some(GithubUser {
                    login: "monalisa".to_string(),
                }),
            },
        ];

        let visible = summarize_pull_requests(&repository, pull_requests, false);

        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].number, 11);
        assert!(!visible[0].is_draft);
    }

    #[test]
    fn includes_draft_pull_requests_when_filter_allows_them() {
        let repository = WorkspaceRepository::new("acme", "api");
        let pull_requests = vec![GithubPullRequest {
            number: 12,
            title: "Draft review".to_string(),
            draft: Some(true),
            html_url: "https://github.com/acme/api/pull/12".to_string(),
            updated_at: "2026-05-18T13:00:00Z".to_string(),
            user: None,
        }];

        let visible = summarize_pull_requests(&repository, pull_requests, true);

        assert_eq!(visible.len(), 1);
        assert!(visible[0].is_draft);
    }
}
