use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::{header::HeaderMap, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Manager, State};

use crate::auth::{AuthCommandError, AuthState};

const WORKSPACE_FILE_NAME: &str = "workspace.json";
const REVIEW_CLONES_DIR_NAME: &str = "review-clones";
const REVIEW_CLONE_REPOSITORIES_DIR_NAME: &str = "repositories";
const REVIEW_CLONE_METADATA_DIR_NAME: &str = "metadata";
const GITHUB_API_ROOT: &str = "https://api.github.com";
const GITHUB_GRAPHQL_URL: &str = "https://api.github.com/graphql";
const MAX_PATCH_CACHE_BYTES: usize = 3 * 1024 * 1024;

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

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestMetadata {
    title: String,
    description: Option<String>,
    repository: String,
    number: u64,
    author_login: Option<String>,
    base_branch: Option<String>,
    head_branch: Option<String>,
    mergeable: Option<String>,
    merge_state_status: Option<String>,
    review_decision: Option<String>,
    url: String,
    is_draft: bool,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CachedReviewThread {
    id: String,
    author_login: Option<String>,
    file_path: String,
    line: Option<u64>,
    state: String,
    body: String,
    updated_at: String,
    comments: Vec<CachedReviewThreadComment>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CachedReviewThreadComment {
    id: String,
    author_login: Option<String>,
    body: String,
    updated_at: String,
    url: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CachedFileSummary {
    path: String,
    additions: u64,
    deletions: u64,
    status: String,
    patch: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CachedCheckRun {
    name: String,
    status: String,
    conclusion: Option<String>,
    url: Option<String>,
    started_at: Option<String>,
    completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CachedRateLimit {
    remaining: Option<u32>,
    reset_epoch_seconds: Option<u64>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestDataResponse {
    pull_request: PullRequestSummary,
    metadata: PullRequestMetadata,
    review_threads: Vec<CachedReviewThread>,
    file_summaries: Vec<CachedFileSummary>,
    checks: Vec<CachedCheckRun>,
    rate_limit: CachedRateLimit,
    fetched_at_epoch_ms: u64,
    last_accessed_epoch_ms: u64,
    pinned: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestChecksResponse {
    checks: Vec<CachedCheckRun>,
    rate_limit: CachedRateLimit,
    fetched_at_epoch_ms: u64,
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

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ReviewCloneHealthState {
    NotCloned,
    Cloning,
    Ready,
    Stale,
    Failed,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCloneStatusResponse {
    repository: WorkspaceRepository,
    state: ReviewCloneHealthState,
    storage_path: String,
    storage_root: String,
    remote_url: String,
    message: Option<String>,
    read_only: bool,
    write_permission: bool,
    last_checked_epoch_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct WorkspaceFile {
    repositories: Vec<WorkspaceRepository>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ReviewCloneMetadata {
    repository: String,
    remote_url: String,
    created_at_epoch_ms: u64,
    last_checked_epoch_ms: u64,
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
pub fn get_review_clone_status(
    app: AppHandle,
    auth_state: State<'_, AuthState>,
    repository: String,
) -> Result<ReviewCloneStatusResponse, WorkspaceCommandError> {
    let repository = parse_repository_slug(&repository)?;
    let write_permission = auth_state.github_token().ok().flatten().is_some();
    let root = review_clones_root_path(&app)?;

    Ok(inspect_review_clone_at(
        &repository,
        &root,
        review_clone_remote_url(&repository),
        write_permission,
    ))
}

#[tauri::command]
pub async fn ensure_review_clone(
    app: AppHandle,
    auth_state: State<'_, AuthState>,
    repository: String,
) -> Result<ReviewCloneStatusResponse, WorkspaceCommandError> {
    let repository = parse_repository_slug(&repository)?;
    let token = auth_state.github_token().ok().flatten();
    let write_permission = token.is_some();
    let root = review_clones_root_path(&app)?;
    let remote_url = review_clone_remote_url(&repository);

    tauri::async_runtime::spawn_blocking(move || {
        ensure_review_clone_at(
            &repository,
            &root,
            &remote_url,
            token.as_deref(),
            write_permission,
        )
    })
    .await
    .map_err(|error| {
        WorkspaceCommandError::new(
            "review-clone-task-error",
            format!("Could not initialize the Review Clone task: {error}"),
        )
    })?
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

    let token = match auth_state.github_token() {
        Ok(Some(token)) => token,
        Ok(None) => {
            return Ok(failed_refresh_response(
                repositories,
                "Sign in to refresh GitHub pull requests.".to_string(),
            ))
        }
        Err(error) => {
            return Ok(failed_refresh_response(
                repositories,
                github_session_failure_message(&error),
            ))
        }
    };

    fetch_open_pull_requests(&workspace_state.http, &token, repositories, include_drafts).await
}

#[tauri::command]
pub async fn fetch_pull_request_data(
    auth_state: State<'_, AuthState>,
    workspace_state: State<'_, WorkspaceState>,
    repository: String,
    number: u64,
) -> Result<PullRequestDataResponse, WorkspaceCommandError> {
    let repository = parse_repository_slug(&repository)?;
    let token = match auth_state.github_token() {
        Ok(Some(token)) => token,
        Ok(None) => {
            return Err(WorkspaceCommandError::new(
                "github-session-required",
                "Sign in to load Pull Request review data.",
            ))
        }
        Err(error) => {
            return Err(WorkspaceCommandError::new(
                "github-session-error",
                github_session_failure_message(&error),
            ))
        }
    };

    let detail =
        fetch_pull_request_detail(&workspace_state.http, &token, &repository, number).await?;
    let mut file_summaries =
        fetch_pull_request_files(&workspace_state.http, &token, &repository, number).await?;
    trim_cached_patches(&mut file_summaries);
    let review_threads = fetch_review_threads(
        &workspace_state.http,
        &token,
        &repository,
        number,
        &detail.updated_at,
    )
    .await?;
    let checks = fetch_check_runs(&workspace_state.http, &token, &repository, &detail.head_sha)
        .await
        .unwrap_or_default();
    let pull_request = PullRequestSummary {
        repository: repository.slug.clone(),
        number,
        title: detail.title.clone(),
        author_login: detail.author_login.clone(),
        is_draft: detail.is_draft,
        updated_at: detail.updated_at.clone(),
        url: detail.url.clone(),
    };
    let metadata = PullRequestMetadata {
        title: detail.title,
        description: detail.description,
        repository: repository.slug,
        number,
        author_login: detail.author_login,
        base_branch: detail.base_branch,
        head_branch: detail.head_branch,
        mergeable: detail.mergeable,
        merge_state_status: detail.merge_state_status,
        review_decision: detail.review_decision,
        url: detail.url,
        is_draft: detail.is_draft,
        updated_at: detail.updated_at,
    };
    let now = now_epoch_millis();

    Ok(PullRequestDataResponse {
        pull_request,
        metadata,
        review_threads,
        file_summaries,
        checks,
        rate_limit: CachedRateLimit {
            remaining: detail.rate_limit_remaining,
            reset_epoch_seconds: detail.rate_limit_reset_epoch_seconds,
        },
        fetched_at_epoch_ms: now,
        last_accessed_epoch_ms: now,
        pinned: false,
    })
}

#[tauri::command]
pub async fn fetch_pull_request_checks(
    auth_state: State<'_, AuthState>,
    workspace_state: State<'_, WorkspaceState>,
    repository: String,
    number: u64,
) -> Result<PullRequestChecksResponse, WorkspaceCommandError> {
    let repository = parse_repository_slug(&repository)?;
    let token = match auth_state.github_token() {
        Ok(Some(token)) => token,
        Ok(None) => {
            return Err(WorkspaceCommandError::new(
                "github-session-required",
                "Sign in to refresh Pull Request checks.",
            ))
        }
        Err(error) => {
            return Err(WorkspaceCommandError::new(
                "github-session-error",
                github_session_failure_message(&error),
            ))
        }
    };

    let detail =
        fetch_pull_request_detail(&workspace_state.http, &token, &repository, number).await?;
    let checks =
        fetch_check_runs(&workspace_state.http, &token, &repository, &detail.head_sha).await?;

    Ok(PullRequestChecksResponse {
        checks,
        rate_limit: CachedRateLimit {
            remaining: detail.rate_limit_remaining,
            reset_epoch_seconds: detail.rate_limit_reset_epoch_seconds,
        },
        fetched_at_epoch_ms: now_epoch_millis(),
    })
}

fn failed_refresh_response(
    repositories: Vec<WorkspaceRepository>,
    message: String,
) -> PullRequestRefreshResponse {
    PullRequestRefreshResponse {
        repositories,
        pull_requests: Vec::new(),
        status: RefreshStatus {
            state: RefreshState::Failed,
            message: Some(message),
            rate_limit_reset_epoch_seconds: None,
            refreshed_at_epoch_seconds: None,
        },
    }
}

fn github_session_failure_message(error: &AuthCommandError) -> String {
    format!(
        "Narview could not read your GitHub token from OS secure storage. Sign out and sign in again if this keeps happening. {}",
        error.message()
    )
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

        if response.status() == StatusCode::FORBIDDEN
            && rate_limit_remaining(response.headers()) == Some(0)
        {
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

        let github_pull_requests =
            response
                .json::<Vec<GithubPullRequest>>()
                .await
                .map_err(|error| {
                    WorkspaceCommandError::new(
                        "github-refresh-response-error",
                        format!("Could not read GitHub pull requests: {error}"),
                    )
                })?;

        pull_requests.extend(summarize_pull_requests(
            repository,
            github_pull_requests,
            include_drafts,
        ));
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

struct PullRequestDetail {
    title: String,
    description: Option<String>,
    author_login: Option<String>,
    base_branch: Option<String>,
    head_branch: Option<String>,
    head_sha: String,
    mergeable: Option<String>,
    merge_state_status: Option<String>,
    review_decision: Option<String>,
    url: String,
    is_draft: bool,
    updated_at: String,
    rate_limit_remaining: Option<u32>,
    rate_limit_reset_epoch_seconds: Option<u64>,
}

async fn fetch_pull_request_detail(
    http: &reqwest::Client,
    token: &str,
    repository: &WorkspaceRepository,
    number: u64,
) -> Result<PullRequestDetail, WorkspaceCommandError> {
    let url = format!(
        "{GITHUB_API_ROOT}/repos/{}/{}/pulls/{number}",
        repository.owner, repository.name
    );
    let response = github_get(http, token, url, "load Pull Request metadata").await?;
    let rate_limit_remaining = rate_limit_remaining(response.headers());
    let rate_limit_reset_epoch_seconds = rate_limit_reset(response.headers());
    let detail = response
        .json::<GithubPullRequestDetail>()
        .await
        .map_err(|error| {
            WorkspaceCommandError::new(
                "github-pr-detail-response-error",
                format!("Could not read Pull Request metadata: {error}"),
            )
        })?;

    Ok(PullRequestDetail {
        title: detail.title,
        description: detail.body,
        author_login: detail.user.map(|user| user.login),
        base_branch: Some(detail.base.git_ref),
        head_branch: Some(detail.head.git_ref),
        head_sha: detail.head.sha,
        mergeable: detail.mergeable.map(|mergeable| {
            if mergeable {
                "MERGEABLE".to_string()
            } else {
                "CONFLICTING".to_string()
            }
        }),
        merge_state_status: detail.mergeable_state.map(normalize_merge_state_status),
        review_decision: None,
        url: detail.html_url,
        is_draft: detail.draft.unwrap_or(false),
        updated_at: detail.updated_at,
        rate_limit_remaining,
        rate_limit_reset_epoch_seconds,
    })
}

async fn fetch_pull_request_files(
    http: &reqwest::Client,
    token: &str,
    repository: &WorkspaceRepository,
    number: u64,
) -> Result<Vec<CachedFileSummary>, WorkspaceCommandError> {
    let mut files = Vec::new();

    for page in 1..=20 {
        let url = format!(
            "{GITHUB_API_ROOT}/repos/{}/{}/pulls/{number}/files?per_page=100&page={page}",
            repository.owner, repository.name
        );
        let response = github_get(http, token, url, "load Pull Request files").await?;
        let page_files = response
            .json::<Vec<GithubPullRequestFile>>()
            .await
            .map_err(|error| {
                WorkspaceCommandError::new(
                    "github-pr-files-response-error",
                    format!("Could not read Pull Request files: {error}"),
                )
            })?;
        let page_len = page_files.len();

        files.extend(page_files.into_iter().map(|file| CachedFileSummary {
            path: file.filename,
            additions: file.additions,
            deletions: file.deletions,
            status: normalize_file_status(&file.status, file.patch.is_none()),
            patch: file.patch,
        }));

        if page_len < 100 {
            break;
        }
    }

    Ok(files)
}

fn trim_cached_patches(files: &mut [CachedFileSummary]) {
    let mut used = 0;

    for file in files {
        if let Some(patch) = file.patch.as_ref() {
            used += patch.len();
            if used > MAX_PATCH_CACHE_BYTES {
                file.patch = None;
            }
        }
    }
}

async fn fetch_review_threads(
    http: &reqwest::Client,
    token: &str,
    repository: &WorkspaceRepository,
    number: u64,
    fallback_updated_at: &str,
) -> Result<Vec<CachedReviewThread>, WorkspaceCommandError> {
    let mut threads = Vec::new();
    let mut cursor: Option<String> = None;

    loop {
        let body = json!({
            "query": "query NarviewReviewThreads($owner: String!, $name: String!, $number: Int!, $cursor: String) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { reviewDecision reviewThreads(first: 100, after: $cursor) { pageInfo { hasNextPage endCursor } nodes { id isResolved isOutdated path line originalLine comments(first: 50) { nodes { id author { login } body updatedAt url } } } } } } }",
            "variables": {
                "owner": repository.owner,
                "name": repository.name,
                "number": number as i64,
                "cursor": cursor.clone(),
            }
        });
        let response = http
            .post(GITHUB_GRAPHQL_URL)
            .bearer_auth(token)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", "Narview")
            .json(&body)
            .send()
            .await
            .map_err(|error| {
                WorkspaceCommandError::new(
                    "github-review-threads-network-error",
                    format!("Could not load Pull Request review threads: {error}"),
                )
            })?;

        if !response.status().is_success() {
            return Err(WorkspaceCommandError::new(
                "github-review-threads-error",
                format!(
                    "GitHub rejected Pull Request review thread loading with HTTP {}.",
                    response.status()
                ),
            ));
        }

        let payload = response.json::<GraphQlResponse>().await.map_err(|error| {
            WorkspaceCommandError::new(
                "github-review-threads-response-error",
                format!("Could not read Pull Request review threads: {error}"),
            )
        })?;

        if let Some(errors) = payload.errors {
            if !errors.is_empty() {
                return Err(WorkspaceCommandError::new(
                    "github-review-threads-graphql-error",
                    errors
                        .into_iter()
                        .map(|error| error.message)
                        .collect::<Vec<_>>()
                        .join("; "),
                ));
            }
        }

        let Some(connection) = payload
            .data
            .and_then(|data| data.repository)
            .and_then(|repository| repository.pull_request)
            .map(|pull_request| pull_request.review_threads)
        else {
            return Ok(threads);
        };

        threads.extend(connection.nodes.into_iter().map(|thread| {
            let comments = thread
                .comments
                .nodes
                .into_iter()
                .map(|comment| CachedReviewThreadComment {
                    id: comment.id,
                    author_login: comment.author.map(|author| author.login),
                    body: comment.body,
                    updated_at: comment
                        .updated_at
                        .unwrap_or_else(|| fallback_updated_at.to_string()),
                    url: comment.url,
                })
                .collect::<Vec<_>>();
            let first_comment = comments.first();
            CachedReviewThread {
                id: thread.id,
                author_login: first_comment.and_then(|comment| comment.author_login.clone()),
                file_path: thread.path,
                line: thread.line.or(thread.original_line),
                state: if thread.is_resolved {
                    "resolved".to_string()
                } else if thread.is_outdated {
                    "outdated".to_string()
                } else {
                    "unresolved".to_string()
                },
                body: first_comment
                    .map(|comment| comment.body.clone())
                    .unwrap_or_else(|| "Review thread has no visible comment body.".to_string()),
                updated_at: first_comment
                    .map(|comment| comment.updated_at.clone())
                    .unwrap_or_else(|| fallback_updated_at.to_string()),
                comments,
            }
        }));

        if !connection.page_info.has_next_page {
            break;
        }

        cursor = connection.page_info.end_cursor;
    }

    Ok(threads)
}

async fn fetch_check_runs(
    http: &reqwest::Client,
    token: &str,
    repository: &WorkspaceRepository,
    head_sha: &str,
) -> Result<Vec<CachedCheckRun>, WorkspaceCommandError> {
    let url = format!(
        "{GITHUB_API_ROOT}/repos/{}/{}/commits/{head_sha}/check-runs?per_page=100",
        repository.owner, repository.name
    );
    let response = github_get(http, token, url, "load Pull Request checks").await?;
    let payload = response
        .json::<GithubCheckRunsResponse>()
        .await
        .map_err(|error| {
            WorkspaceCommandError::new(
                "github-checks-response-error",
                format!("Could not read Pull Request checks: {error}"),
            )
        })?;

    Ok(payload
        .check_runs
        .into_iter()
        .map(|check| CachedCheckRun {
            name: check.name,
            status: normalize_check_status(&check.status),
            conclusion: check
                .conclusion
                .map(|conclusion| conclusion.replace('_', "-")),
            url: check.html_url,
            started_at: check.started_at,
            completed_at: check.completed_at,
        })
        .collect())
}

async fn github_get(
    http: &reqwest::Client,
    token: &str,
    url: String,
    operation: &str,
) -> Result<reqwest::Response, WorkspaceCommandError> {
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
                "github-network-error",
                format!("Could not {operation}: {error}"),
            )
        })?;

    if !response.status().is_success() {
        return Err(WorkspaceCommandError::new(
            "github-request-error",
            format!(
                "GitHub rejected {operation} with HTTP {}.",
                response.status()
            ),
        ));
    }

    Ok(response)
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

#[derive(Debug, Deserialize)]
struct GithubPullRequestDetail {
    title: String,
    body: Option<String>,
    draft: Option<bool>,
    html_url: String,
    updated_at: String,
    user: Option<GithubUser>,
    base: GithubBranchRef,
    head: GithubHeadRef,
    mergeable: Option<bool>,
    mergeable_state: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubBranchRef {
    #[serde(rename = "ref")]
    git_ref: String,
}

#[derive(Debug, Deserialize)]
struct GithubHeadRef {
    #[serde(rename = "ref")]
    git_ref: String,
    sha: String,
}

#[derive(Debug, Deserialize)]
struct GithubPullRequestFile {
    filename: String,
    status: String,
    additions: u64,
    deletions: u64,
    patch: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GraphQlResponse {
    data: Option<GraphQlData>,
    errors: Option<Vec<GraphQlError>>,
}

#[derive(Debug, Deserialize)]
struct GraphQlError {
    message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlData {
    repository: Option<GraphQlRepository>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlRepository {
    pull_request: Option<GraphQlPullRequest>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlPullRequest {
    review_threads: GraphQlReviewThreadConnection,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlReviewThreadConnection {
    page_info: GraphQlPageInfo,
    nodes: Vec<GraphQlReviewThread>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlPageInfo {
    has_next_page: bool,
    end_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlReviewThread {
    id: String,
    is_resolved: bool,
    is_outdated: bool,
    path: String,
    line: Option<u64>,
    original_line: Option<u64>,
    comments: GraphQlReviewThreadCommentConnection,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlReviewThreadCommentConnection {
    nodes: Vec<GraphQlReviewThreadComment>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlReviewThreadComment {
    id: String,
    author: Option<GraphQlAuthor>,
    body: String,
    updated_at: Option<String>,
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GraphQlAuthor {
    login: String,
}

#[derive(Debug, Deserialize)]
struct GithubCheckRunsResponse {
    check_runs: Vec<GithubCheckRun>,
}

#[derive(Debug, Deserialize)]
struct GithubCheckRun {
    name: String,
    status: String,
    conclusion: Option<String>,
    html_url: Option<String>,
    started_at: Option<String>,
    completed_at: Option<String>,
}

fn normalize_file_status(status: &str, missing_patch: bool) -> String {
    if missing_patch && matches!(status, "added" | "modified" | "changed") {
        return "binary".to_string();
    }

    match status {
        "added" | "removed" | "renamed" => status.to_string(),
        _ => "modified".to_string(),
    }
}

fn normalize_merge_state_status(status: String) -> String {
    match status.as_str() {
        "behind" => "BEHIND",
        "blocked" => "BLOCKED",
        "clean" => "CLEAN",
        "dirty" => "DIRTY",
        "draft" => "DRAFT",
        "has_hooks" => "HAS_HOOKS",
        "unstable" => "UNSTABLE",
        _ => "UNKNOWN",
    }
    .to_string()
}

fn normalize_check_status(status: &str) -> String {
    match status {
        "completed" => "completed",
        "queued" | "requested" | "waiting" | "pending" => "queued",
        _ => "in-progress",
    }
    .to_string()
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

fn review_clones_root_path(app: &AppHandle) -> Result<PathBuf, WorkspaceCommandError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| WorkspaceCommandError::new("workspace-path-error", error.to_string()))?;

    Ok(app_data_dir.join(REVIEW_CLONES_DIR_NAME))
}

fn review_clone_repository_path(root: &Path, repository: &WorkspaceRepository) -> PathBuf {
    root.join(REVIEW_CLONE_REPOSITORIES_DIR_NAME)
        .join(repository.owner.to_ascii_lowercase())
        .join(repository.name.to_ascii_lowercase())
}

fn review_clone_metadata_path(root: &Path, repository: &WorkspaceRepository) -> PathBuf {
    root.join(REVIEW_CLONE_METADATA_DIR_NAME)
        .join(repository.owner.to_ascii_lowercase())
        .join(format!("{}.json", repository.name.to_ascii_lowercase()))
}

fn review_clone_lock_path(root: &Path, repository: &WorkspaceRepository) -> PathBuf {
    root.join(REVIEW_CLONE_METADATA_DIR_NAME)
        .join(repository.owner.to_ascii_lowercase())
        .join(format!("{}.lock", repository.name.to_ascii_lowercase()))
}

fn review_clone_remote_url(repository: &WorkspaceRepository) -> String {
    format!(
        "https://github.com/{}/{}.git",
        repository.owner, repository.name
    )
}

fn inspect_review_clone_at(
    repository: &WorkspaceRepository,
    root: &Path,
    remote_url: String,
    write_permission: bool,
) -> ReviewCloneStatusResponse {
    let clone_path = review_clone_repository_path(root, repository);
    let metadata_path = review_clone_metadata_path(root, repository);
    let lock_path = review_clone_lock_path(root, repository);
    let now = now_epoch_millis();

    if lock_path.exists() {
        return review_clone_response(
            repository,
            root,
            &clone_path,
            remote_url,
            ReviewCloneHealthState::Cloning,
            Some("Narview is initializing this Review Clone.".to_string()),
            true,
            write_permission,
            now,
        );
    }

    if !clone_path.exists() {
        return review_clone_response(
            repository,
            root,
            &clone_path,
            remote_url,
            ReviewCloneHealthState::NotCloned,
            Some("No app-managed Review Clone exists for this repository yet.".to_string()),
            true,
            write_permission,
            now,
        );
    }

    if !clone_path.is_dir() || !clone_path.join(".git").exists() {
        return review_clone_response(
            repository,
            root,
            &clone_path,
            remote_url,
            ReviewCloneHealthState::Failed,
            Some(
                "Review Clone storage exists but is not a Git checkout Narview can inspect."
                    .to_string(),
            ),
            true,
            write_permission,
            now,
        );
    }

    let metadata = read_review_clone_metadata(&metadata_path).ok().flatten();
    match metadata {
        Some(metadata)
            if metadata.repository == repository.key() && metadata.remote_url == remote_url =>
        {
            review_clone_response(
                repository,
                root,
                &clone_path,
                remote_url,
                ReviewCloneHealthState::Ready,
                Some("Review Clone is ready for read-only analysis.".to_string()),
                true,
                write_permission,
                metadata.last_checked_epoch_ms,
            )
        }
        _ => review_clone_response(
            repository,
            root,
            &clone_path,
            remote_url,
            ReviewCloneHealthState::Stale,
            Some("Review Clone exists but Narview metadata is missing or outdated.".to_string()),
            true,
            write_permission,
            now,
        ),
    }
}

fn ensure_review_clone_at(
    repository: &WorkspaceRepository,
    root: &Path,
    remote_url: &str,
    token: Option<&str>,
    write_permission: bool,
) -> Result<ReviewCloneStatusResponse, WorkspaceCommandError> {
    if !git_available() {
        let clone_path = review_clone_repository_path(root, repository);
        return Ok(review_clone_response(
            repository,
            root,
            &clone_path,
            remote_url.to_string(),
            ReviewCloneHealthState::Unavailable,
            Some("Git is not available on this machine, so Narview cannot initialize a Review Clone.".to_string()),
            true,
            write_permission,
            now_epoch_millis(),
        ));
    }

    let existing =
        inspect_review_clone_at(repository, root, remote_url.to_string(), write_permission);
    if existing.state == ReviewCloneHealthState::Ready {
        touch_review_clone_metadata(root, repository, remote_url)?;
        return Ok(inspect_review_clone_at(
            repository,
            root,
            remote_url.to_string(),
            write_permission,
        ));
    }

    if existing.state == ReviewCloneHealthState::Stale {
        write_review_clone_metadata(root, repository, remote_url)?;
        return Ok(inspect_review_clone_at(
            repository,
            root,
            remote_url.to_string(),
            write_permission,
        ));
    }

    if existing.state != ReviewCloneHealthState::NotCloned {
        return Ok(existing);
    }

    let clone_path = review_clone_repository_path(root, repository);
    let lock_path = review_clone_lock_path(root, repository);
    if let Some(parent) = lock_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| WorkspaceCommandError::io("prepare Review Clone metadata", error))?;
    }
    if let Some(parent) = clone_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| WorkspaceCommandError::io("prepare Review Clone storage", error))?;
    }

    fs::write(&lock_path, now_epoch_millis().to_string())
        .map_err(|error| WorkspaceCommandError::io("mark Review Clone cloning", error))?;

    let clone_result = run_git_clone(remote_url, &clone_path, token);
    fs::remove_file(&lock_path).ok();

    if let Err(error) = clone_result {
        fs::remove_dir_all(&clone_path).ok();
        return Ok(review_clone_response(
            repository,
            root,
            &clone_path,
            remote_url.to_string(),
            ReviewCloneHealthState::Failed,
            Some(error.message),
            true,
            write_permission,
            now_epoch_millis(),
        ));
    }

    write_review_clone_metadata(root, repository, remote_url)?;
    Ok(inspect_review_clone_at(
        repository,
        root,
        remote_url.to_string(),
        write_permission,
    ))
}

fn run_git_clone(
    remote_url: &str,
    clone_path: &Path,
    token: Option<&str>,
) -> Result<(), WorkspaceCommandError> {
    let mut command = Command::new("git");
    command
        .arg("clone")
        .arg("--no-tags")
        .arg("--filter=blob:none")
        .arg(remote_url)
        .arg(clone_path)
        .env("GIT_TERMINAL_PROMPT", "0");

    if let Some(token) = token.filter(|value| !value.is_empty()) {
        command
            .env("GIT_CONFIG_COUNT", "1")
            .env("GIT_CONFIG_KEY_0", "http.https://github.com/.extraheader")
            .env(
                "GIT_CONFIG_VALUE_0",
                format!("AUTHORIZATION: bearer {token}"),
            );
    }

    let output = command.output().map_err(|error| {
        WorkspaceCommandError::new(
            "review-clone-git-unavailable",
            format!("Could not run git to initialize Review Clone: {error}"),
        )
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let message = if stderr.is_empty() {
            "git clone failed without a diagnostic.".to_string()
        } else {
            stderr
        };
        return Err(WorkspaceCommandError::new(
            "review-clone-git-error",
            format!("Could not initialize Review Clone: {message}"),
        ));
    }

    Ok(())
}

fn git_available() -> bool {
    Command::new("git")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn read_review_clone_metadata(
    path: &Path,
) -> Result<Option<ReviewCloneMetadata>, WorkspaceCommandError> {
    match fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents).map(Some).map_err(|error| {
            WorkspaceCommandError::new(
                "review-clone-metadata-invalid",
                format!("Could not read Review Clone metadata: {error}"),
            )
        }),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(WorkspaceCommandError::io(
            "read Review Clone metadata",
            error,
        )),
    }
}

fn touch_review_clone_metadata(
    root: &Path,
    repository: &WorkspaceRepository,
    remote_url: &str,
) -> Result<(), WorkspaceCommandError> {
    let metadata_path = review_clone_metadata_path(root, repository);
    let created_at_epoch_ms = read_review_clone_metadata(&metadata_path)?
        .map(|metadata| metadata.created_at_epoch_ms)
        .unwrap_or_else(now_epoch_millis);
    write_review_clone_metadata_with_created_at(root, repository, remote_url, created_at_epoch_ms)
}

fn write_review_clone_metadata(
    root: &Path,
    repository: &WorkspaceRepository,
    remote_url: &str,
) -> Result<(), WorkspaceCommandError> {
    write_review_clone_metadata_with_created_at(root, repository, remote_url, now_epoch_millis())
}

fn write_review_clone_metadata_with_created_at(
    root: &Path,
    repository: &WorkspaceRepository,
    remote_url: &str,
    created_at_epoch_ms: u64,
) -> Result<(), WorkspaceCommandError> {
    let metadata_path = review_clone_metadata_path(root, repository);
    if let Some(parent) = metadata_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| WorkspaceCommandError::io("prepare Review Clone metadata", error))?;
    }

    let metadata = ReviewCloneMetadata {
        repository: repository.key(),
        remote_url: remote_url.to_string(),
        created_at_epoch_ms,
        last_checked_epoch_ms: now_epoch_millis(),
    };
    let contents = serde_json::to_string_pretty(&metadata).map_err(|error| {
        WorkspaceCommandError::new(
            "review-clone-metadata-serialization-error",
            format!("Could not save Review Clone metadata: {error}"),
        )
    })?;

    fs::write(metadata_path, contents)
        .map_err(|error| WorkspaceCommandError::io("save Review Clone metadata", error))
}

fn review_clone_response(
    repository: &WorkspaceRepository,
    root: &Path,
    clone_path: &Path,
    remote_url: String,
    state: ReviewCloneHealthState,
    message: Option<String>,
    read_only: bool,
    write_permission: bool,
    last_checked_epoch_ms: u64,
) -> ReviewCloneStatusResponse {
    ReviewCloneStatusResponse {
        repository: repository.clone(),
        state,
        storage_path: clone_path.to_string_lossy().to_string(),
        storage_root: root.to_string_lossy().to_string(),
        remote_url,
        message: if !write_permission && message.is_none() {
            Some("Read-Only Mode: GitHub write permission is not available.".to_string())
        } else {
            message
        },
        read_only,
        write_permission,
        last_checked_epoch_ms,
    }
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
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
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

fn now_epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_workspace_path() -> PathBuf {
        std::env::temp_dir().join(format!("narview-workspace-{}.json", uuid::Uuid::new_v4()))
    }

    fn test_review_clone_root() -> PathBuf {
        std::env::temp_dir().join(format!("narview-review-clones-{}", uuid::Uuid::new_v4()))
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
    fn review_clone_health_transitions_are_reported_from_app_managed_storage() {
        let root = test_review_clone_root();
        let repository = WorkspaceRepository::new("Acme", "Api");
        let remote_url = review_clone_remote_url(&repository);

        let not_cloned = inspect_review_clone_at(&repository, &root, remote_url.clone(), false);
        assert_eq!(not_cloned.state, ReviewCloneHealthState::NotCloned);
        assert!(PathBuf::from(&not_cloned.storage_path)
            .starts_with(root.join(REVIEW_CLONE_REPOSITORIES_DIR_NAME)));
        assert!(not_cloned.read_only);
        assert!(!not_cloned.write_permission);

        let clone_path = review_clone_repository_path(&root, &repository);
        fs::create_dir_all(clone_path.join(".git")).unwrap();
        let stale = inspect_review_clone_at(&repository, &root, remote_url.clone(), true);
        assert_eq!(stale.state, ReviewCloneHealthState::Stale);
        assert!(stale.write_permission);

        let lock_path = review_clone_lock_path(&root, &repository);
        fs::create_dir_all(lock_path.parent().unwrap()).unwrap();
        fs::write(&lock_path, "1").unwrap();
        let cloning = inspect_review_clone_at(&repository, &root, remote_url.clone(), true);
        assert_eq!(cloning.state, ReviewCloneHealthState::Cloning);
        fs::remove_file(lock_path).unwrap();

        write_review_clone_metadata(&root, &repository, &remote_url).unwrap();
        let ready = inspect_review_clone_at(&repository, &root, remote_url, true);
        assert_eq!(ready.state, ReviewCloneHealthState::Ready);

        fs::remove_dir_all(root).ok();
    }

    #[test]
    fn review_clone_metadata_stays_outside_the_clone_checkout() {
        let root = test_review_clone_root();
        let repository = WorkspaceRepository::new("Acme", "Api");

        let clone_path = review_clone_repository_path(&root, &repository);
        let metadata_path = review_clone_metadata_path(&root, &repository);

        assert!(clone_path.starts_with(root.join(REVIEW_CLONE_REPOSITORIES_DIR_NAME)));
        assert!(metadata_path.starts_with(root.join(REVIEW_CLONE_METADATA_DIR_NAME)));
        assert!(!metadata_path.starts_with(&clone_path));
    }

    #[test]
    fn ensure_review_clone_creates_and_reuses_a_git_checkout() {
        if !git_available() {
            return;
        }

        let root = test_review_clone_root();
        fs::create_dir_all(&root).unwrap();
        let source = root.join("source.git");
        let init_output = Command::new("git")
            .arg("init")
            .arg("--bare")
            .arg(&source)
            .output()
            .unwrap();
        if !init_output.status.success() {
            fs::remove_dir_all(root).ok();
            return;
        }

        let repository = WorkspaceRepository::new("Acme", "Api");
        let remote_url = source.to_string_lossy().to_string();
        let first = ensure_review_clone_at(&repository, &root, &remote_url, None, false).unwrap();
        let second = ensure_review_clone_at(&repository, &root, &remote_url, None, false).unwrap();
        let clone_path = review_clone_repository_path(&root, &repository);
        let metadata_path = review_clone_metadata_path(&root, &repository);

        assert_eq!(first.state, ReviewCloneHealthState::Ready);
        assert_eq!(second.state, ReviewCloneHealthState::Ready);
        assert_eq!(first.storage_path, second.storage_path);
        assert!(clone_path.join(".git").exists());
        assert!(metadata_path.exists());
        assert!(!metadata_path.starts_with(&clone_path));
        assert!(!clone_path.join("analysis-index").exists());

        fs::remove_dir_all(root).ok();
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
