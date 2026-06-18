use reqwest::StatusCode;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::State;

use crate::auth::{configured_github_review_thread_write_permission, AuthState};
use crate::workspace::WorkspaceState;

const GITHUB_GRAPHQL_URL: &str = "https://api.github.com/graphql";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ThreadActionError {
    code: String,
    message: String,
}

impl ThreadActionError {
    fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ThreadActionResponse {
    action: String,
    thread_id: String,
    message: String,
    reply_url: Option<String>,
    created_thread: Option<CreatedReviewThread>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreatedReviewThread {
    id: String,
    author_login: Option<String>,
    file_path: String,
    line: Option<u64>,
    state: String,
    body: String,
    updated_at: String,
    comments: Vec<CreatedReviewThreadComment>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreatedReviewThreadComment {
    id: String,
    author_login: Option<String>,
    body: String,
    updated_at: String,
    url: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileViewedActionResponse {
    ok: bool,
    path: String,
    viewer_viewed_state: String,
    message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PendingReviewResponse {
    pull_request_id: String,
    pull_request_review_id: String,
    state: String,
    message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PendingReviewDraftComment {
    id: String,
    author_login: Option<String>,
    file_path: Option<String>,
    line: Option<u64>,
    body: String,
    updated_at: String,
    url: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PendingReviewSnapshot {
    pull_request_id: String,
    pull_request_review_id: String,
    state: String,
    message: String,
    drafts: Vec<PendingReviewDraftComment>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PendingReviewThreadResponse {
    pull_request_id: String,
    pull_request_review_id: String,
    state: String,
    message: String,
    thread: Option<CreatedReviewThread>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSubmitResponse {
    ok: bool,
    pull_request_review_id: String,
    state: String,
    url: Option<String>,
    message: String,
}

#[tauri::command]
pub async fn reply_review_thread(
    auth_state: State<'_, AuthState>,
    workspace_state: State<'_, WorkspaceState>,
    thread_id: String,
    body: String,
) -> Result<ThreadActionResponse, ThreadActionError> {
    if body.trim().is_empty() {
        return Err(ThreadActionError::new(
            "github-thread-validation-error",
            "Reply body is required.",
        ));
    }

    let requested_thread_id = thread_id.clone();
    let data = send_graphql(
        &workspace_state.http,
        &github_token(&auth_state)?,
        "reply",
        json!({
            "query": "mutation ReplyReviewThread($threadId: ID!, $body: String!) { addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) { comment { id url } } }",
            "variables": {
                "threadId": thread_id,
                "body": body,
            }
        }),
    )
    .await?;

    let reply_url = data
        .pointer("/addPullRequestReviewThreadReply/comment/url")
        .and_then(Value::as_str)
        .map(ToString::to_string);

    Ok(ThreadActionResponse {
        action: "reply".to_string(),
        thread_id: requested_thread_id,
        message: "Reply added to GitHub Review Thread.".to_string(),
        reply_url,
        created_thread: None,
    })
}

#[tauri::command]
pub async fn resolve_review_thread(
    auth_state: State<'_, AuthState>,
    workspace_state: State<'_, WorkspaceState>,
    thread_id: String,
) -> Result<ThreadActionResponse, ThreadActionError> {
    let requested_thread_id = thread_id.clone();
    let _data = send_graphql(
        &workspace_state.http,
        &github_token(&auth_state)?,
        "resolve",
        json!({
            "query": "mutation ResolveReviewThread($threadId: ID!) { resolveReviewThread(input: { threadId: $threadId }) { thread { id isResolved } } }",
            "variables": {
                "threadId": thread_id,
            }
        }),
    )
    .await?;

    Ok(ThreadActionResponse {
        action: "resolve".to_string(),
        thread_id: requested_thread_id,
        message: "Review Thread resolved on GitHub.".to_string(),
        reply_url: None,
        created_thread: None,
    })
}

#[tauri::command]
pub async fn unresolve_review_thread(
    auth_state: State<'_, AuthState>,
    workspace_state: State<'_, WorkspaceState>,
    thread_id: String,
) -> Result<ThreadActionResponse, ThreadActionError> {
    let requested_thread_id = thread_id.clone();
    let _data = send_graphql(
        &workspace_state.http,
        &github_token(&auth_state)?,
        "unresolve",
        json!({
            "query": "mutation UnresolveReviewThread($threadId: ID!) { unresolveReviewThread(input: { threadId: $threadId }) { thread { id isResolved } } }",
            "variables": {
                "threadId": thread_id,
            }
        }),
    )
    .await?;

    Ok(ThreadActionResponse {
        action: "unresolve".to_string(),
        thread_id: requested_thread_id,
        message: "Review Thread unresolved on GitHub.".to_string(),
        reply_url: None,
        created_thread: None,
    })
}

#[tauri::command]
pub async fn start_review_thread(
    auth_state: State<'_, AuthState>,
    workspace_state: State<'_, WorkspaceState>,
    repository: String,
    pull_request_number: u64,
    path: String,
    body: String,
    line: Option<u64>,
    side: Option<String>,
    subject_type: String,
) -> Result<ThreadActionResponse, ThreadActionError> {
    let trimmed_body = body.trim();
    if trimmed_body.is_empty() {
        return Err(ThreadActionError::new(
            "github-thread-validation-error",
            "Review Thread body is required.",
        ));
    }
    if path.trim().is_empty() {
        return Err(ThreadActionError::new(
            "github-thread-validation-error",
            "Review Thread path is required.",
        ));
    }

    let (owner, name) = parse_repository_slug(&repository)?;
    let subject = subject_type.trim().to_ascii_uppercase();
    let action = if subject == "FILE" {
        "create-file"
    } else if subject == "LINE" {
        "create-line"
    } else {
        return Err(ThreadActionError::new(
            "github-thread-validation-error",
            "Review Thread subject type must be LINE or FILE.",
        ));
    };

    let mut input = serde_json::Map::new();
    input.insert("body".to_string(), json!(trimmed_body));
    input.insert("path".to_string(), json!(path.trim()));
    input.insert("subjectType".to_string(), json!(subject));

    if action == "create-line" {
        let line = line.ok_or_else(|| {
            ThreadActionError::new(
                "github-thread-validation-error",
                "Line-level Review Threads require a changed line anchor.",
            )
        })?;
        let side = side
            .map(|value| value.trim().to_ascii_uppercase())
            .filter(|value| value == "LEFT" || value == "RIGHT")
            .ok_or_else(|| {
                ThreadActionError::new(
                    "github-thread-validation-error",
                    "Line-level Review Threads require a LEFT or RIGHT diff side.",
                )
            })?;

        input.insert("line".to_string(), json!(line));
        input.insert("side".to_string(), json!(side));
    }

    let token = github_token(&auth_state)?;
    let pull_request_id = fetch_pull_request_id(
        &workspace_state.http,
        &token,
        &owner,
        &name,
        pull_request_number,
    )
    .await?;
    input.insert("pullRequestId".to_string(), json!(pull_request_id));

    let data = send_graphql(
        &workspace_state.http,
        &token,
        action,
        json!({
            "query": "mutation StartReviewThread($input: AddPullRequestReviewThreadInput!) { addPullRequestReviewThread(input: $input) { thread { id isResolved isOutdated path line originalLine comments(first: 50) { nodes { id author { login } body updatedAt url } } } } }",
            "variables": {
                "input": Value::Object(input),
            }
        }),
    )
    .await?;

    let thread_value = data
        .pointer("/addPullRequestReviewThread/thread")
        .ok_or_else(|| {
            ThreadActionError::new(
                "github-thread-response-error",
                "GitHub returned no newly created Review Thread.",
            )
        })?;
    let created_thread = created_review_thread_from_value(thread_value)?;
    let reply_url = created_thread
        .comments
        .first()
        .and_then(|comment| comment.url.clone());
    let thread_id = created_thread.id.clone();

    Ok(ThreadActionResponse {
        action: action.to_string(),
        thread_id,
        message: "Review Thread published to GitHub.".to_string(),
        reply_url,
        created_thread: Some(created_thread),
    })
}

#[tauri::command]
pub async fn set_file_viewed(
    auth_state: State<'_, AuthState>,
    workspace_state: State<'_, WorkspaceState>,
    repository: String,
    pull_request_number: u64,
    path: String,
    viewed: bool,
) -> Result<FileViewedActionResponse, ThreadActionError> {
    if path.trim().is_empty() {
        return Err(ThreadActionError::new(
            "github-viewed-file-validation-error",
            "File path is required.",
        ));
    }

    let (owner, name) = parse_repository_slug(&repository)?;
    let token = github_token(&auth_state)?;
    let pull_request_id = fetch_pull_request_id(
        &workspace_state.http,
        &token,
        &owner,
        &name,
        pull_request_number,
    )
    .await?;
    let action = if viewed {
        "markFileAsViewed"
    } else {
        "unmarkFileAsViewed"
    };
    let mutation = if viewed {
        "mutation MarkFileViewed($input: MarkFileAsViewedInput!) { markFileAsViewed(input: $input) { pullRequest { id } } }"
    } else {
        "mutation UnmarkFileViewed($input: UnmarkFileAsViewedInput!) { unmarkFileAsViewed(input: $input) { pullRequest { id } } }"
    };

    let _data = send_graphql(
        &workspace_state.http,
        &token,
        action,
        json!({
            "query": mutation,
            "variables": {
                "input": {
                    "pullRequestId": pull_request_id,
                    "path": path.trim(),
                }
            }
        }),
    )
    .await?;

    Ok(FileViewedActionResponse {
        ok: true,
        path: path.trim().to_string(),
        viewer_viewed_state: if viewed { "VIEWED" } else { "UNVIEWED" }.to_string(),
        message: if viewed {
            "File marked viewed on GitHub.".to_string()
        } else {
            "File marked unviewed on GitHub.".to_string()
        },
    })
}

#[tauri::command]
pub async fn ensure_pending_review(
    auth_state: State<'_, AuthState>,
    workspace_state: State<'_, WorkspaceState>,
    repository: String,
    pull_request_number: u64,
) -> Result<PendingReviewResponse, ThreadActionError> {
    let (owner, name) = parse_repository_slug(&repository)?;
    let token = github_token(&auth_state)?;

    ensure_pending_review_for_pull_request(
        &workspace_state.http,
        &token,
        &owner,
        &name,
        pull_request_number,
        None,
    )
    .await
}

#[tauri::command]
pub async fn find_pending_review(
    auth_state: State<'_, AuthState>,
    workspace_state: State<'_, WorkspaceState>,
    repository: String,
    pull_request_number: u64,
) -> Result<Option<PendingReviewSnapshot>, ThreadActionError> {
    let (owner, name) = parse_repository_slug(&repository)?;
    let token = github_token(&auth_state)?;
    let data = load_pending_review_data(
        &workspace_state.http,
        &token,
        &owner,
        &name,
        pull_request_number,
    )
    .await?;
    let pull_request_id = pull_request_id_from_pending_review_data(&data)?;

    Ok(viewer_pending_review_value(&data).and_then(|review| {
        review
            .pointer("/id")
            .and_then(Value::as_str)
            .map(|review_id| PendingReviewSnapshot {
                pull_request_id,
                pull_request_review_id: review_id.to_string(),
                state: "PENDING".to_string(),
                message: "Reconnected to pending GitHub review.".to_string(),
                drafts: pending_review_drafts_from_value(review),
            })
    }))
}

#[tauri::command]
pub async fn add_pending_review_thread(
    auth_state: State<'_, AuthState>,
    workspace_state: State<'_, WorkspaceState>,
    repository: String,
    pull_request_number: u64,
    pull_request_review_id: Option<String>,
    subject_type: String,
    path: Option<String>,
    body: String,
    line: Option<u64>,
    side: Option<String>,
    start_line: Option<u64>,
    start_side: Option<String>,
    reply_to_thread_id: Option<String>,
) -> Result<PendingReviewThreadResponse, ThreadActionError> {
    let trimmed_body = body.trim();
    if trimmed_body.is_empty() {
        return Err(ThreadActionError::new(
            "github-review-validation-error",
            "Draft comment body is required.",
        ));
    }

    let (owner, name) = parse_repository_slug(&repository)?;
    let token = github_token(&auth_state)?;
    let subject = subject_type.trim().to_ascii_uppercase();

    if subject == "REPLY" {
        let thread_id = reply_to_thread_id.ok_or_else(|| {
            ThreadActionError::new(
                "github-review-validation-error",
                "Reply draft requires a Review Thread id.",
            )
        })?;
        let pending = ensure_pending_review_for_pull_request(
            &workspace_state.http,
            &token,
            &owner,
            &name,
            pull_request_number,
            pull_request_review_id,
        )
        .await?;
        let _data = send_graphql(
            &workspace_state.http,
            &token,
            "reply",
            json!({
                "query": "mutation ReplyReviewThread($threadId: ID!, $body: String!) { addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) { comment { id url } } }",
                "variables": {
                    "threadId": thread_id,
                    "body": trimmed_body,
                }
            }),
        )
        .await?;

        return Ok(PendingReviewThreadResponse {
            pull_request_id: pending.pull_request_id,
            pull_request_review_id: pending.pull_request_review_id,
            state: pending.state,
            message: "Reply added to GitHub Review Thread.".to_string(),
            thread: None,
        });
    }

    let pending = ensure_pending_review_for_pull_request(
        &workspace_state.http,
        &token,
        &owner,
        &name,
        pull_request_number,
        pull_request_review_id,
    )
    .await?;
    let path = path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            ThreadActionError::new(
                "github-review-validation-error",
                "Draft review comments require a file path.",
            )
        })?;

    let mut input = serde_json::Map::new();
    input.insert(
        "pullRequestReviewId".to_string(),
        json!(pending.pull_request_review_id.clone()),
    );
    input.insert("body".to_string(), json!(trimmed_body));
    input.insert("path".to_string(), json!(path));

    if subject == "FILE" {
        input.insert("subjectType".to_string(), json!("FILE"));
    } else if subject == "LINE" {
        let line = line.ok_or_else(|| {
            ThreadActionError::new(
                "github-review-validation-error",
                "Line-level draft comments require a changed line anchor.",
            )
        })?;
        let side = side
            .map(|value| value.trim().to_ascii_uppercase())
            .filter(|value| value == "LEFT" || value == "RIGHT")
            .ok_or_else(|| {
                ThreadActionError::new(
                    "github-review-validation-error",
                    "Line-level draft comments require a LEFT or RIGHT diff side.",
                )
            })?;

        input.insert("subjectType".to_string(), json!("LINE"));
        input.insert("line".to_string(), json!(line));
        input.insert("side".to_string(), json!(side));
        if let Some(start_line) = start_line {
            input.insert("startLine".to_string(), json!(start_line));
        }
        if let Some(start_side) = start_side
            .map(|value| value.trim().to_ascii_uppercase())
            .filter(|value| value == "LEFT" || value == "RIGHT")
        {
            input.insert("startSide".to_string(), json!(start_side));
        }
    } else {
        return Err(ThreadActionError::new(
            "github-review-validation-error",
            "Draft review subject type must be LINE, FILE, or REPLY.",
        ));
    }

    let data = send_graphql(
        &workspace_state.http,
        &token,
        "add pending review thread",
        json!({
            "query": "mutation AddPendingReviewThread($input: AddPullRequestReviewThreadInput!) { addPullRequestReviewThread(input: $input) { thread { id isResolved isOutdated path line originalLine comments(first: 50) { nodes { id author { login } body updatedAt url } } } } }",
            "variables": {
                "input": serde_json::Value::Object(input),
            }
        }),
    )
    .await?;

    let thread = data
        .pointer("/addPullRequestReviewThread/thread")
        .map(created_review_thread_from_value)
        .transpose()?;

    Ok(PendingReviewThreadResponse {
        pull_request_id: pending.pull_request_id,
        pull_request_review_id: pending.pull_request_review_id,
        state: pending.state,
        message: "Draft comment added to pending GitHub review.".to_string(),
        thread,
    })
}

#[tauri::command]
pub async fn submit_pending_review(
    auth_state: State<'_, AuthState>,
    workspace_state: State<'_, WorkspaceState>,
    repository: String,
    pull_request_number: u64,
    pull_request_review_id: String,
    event: String,
    body: String,
) -> Result<ReviewSubmitResponse, ThreadActionError> {
    let (_owner, _name) = parse_repository_slug(&repository)?;
    let _ = pull_request_number;
    let token = github_token(&auth_state)?;
    let event = event.trim().to_ascii_uppercase();
    if !matches!(event.as_str(), "COMMENT" | "APPROVE" | "REQUEST_CHANGES") {
        return Err(ThreadActionError::new(
            "github-review-validation-error",
            "Review event must be COMMENT, APPROVE, or REQUEST_CHANGES.",
        ));
    }
    if (event == "COMMENT" || event == "REQUEST_CHANGES") && body.trim().is_empty() {
        return Err(ThreadActionError::new(
            "github-review-validation-error",
            "A review summary is required for this review event.",
        ));
    }

    let data = send_graphql(
        &workspace_state.http,
        &token,
        "submit pending review",
        json!({
            "query": "mutation SubmitPendingReview($input: SubmitPullRequestReviewInput!) { submitPullRequestReview(input: $input) { pullRequestReview { id state url } } }",
            "variables": {
                "input": {
                    "pullRequestReviewId": pull_request_review_id,
                    "event": event,
                    "body": body.trim(),
                }
            }
        }),
    )
    .await?;

    Ok(ReviewSubmitResponse {
        ok: true,
        pull_request_review_id: required_string(
            &data,
            "/submitPullRequestReview/pullRequestReview/id",
            "Pull Request Review id",
        )?,
        state: data
            .pointer("/submitPullRequestReview/pullRequestReview/state")
            .and_then(Value::as_str)
            .unwrap_or("SUBMITTED")
            .to_string(),
        url: data
            .pointer("/submitPullRequestReview/pullRequestReview/url")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        message: "Pending review submitted to GitHub.".to_string(),
    })
}

#[tauri::command]
pub async fn discard_pending_review(
    auth_state: State<'_, AuthState>,
    workspace_state: State<'_, WorkspaceState>,
    repository: String,
    pull_request_number: u64,
    pull_request_review_id: String,
) -> Result<ReviewSubmitResponse, ThreadActionError> {
    let (_owner, _name) = parse_repository_slug(&repository)?;
    let _ = pull_request_number;
    let token = github_token(&auth_state)?;
    let data = send_graphql(
        &workspace_state.http,
        &token,
        "discard pending review",
        json!({
            "query": "mutation DiscardPendingReview($input: DeletePullRequestReviewInput!) { deletePullRequestReview(input: $input) { pullRequestReview { id state url } } }",
            "variables": {
                "input": {
                    "pullRequestReviewId": pull_request_review_id,
                }
            }
        }),
    )
    .await?;

    Ok(ReviewSubmitResponse {
        ok: true,
        pull_request_review_id: data
            .pointer("/deletePullRequestReview/pullRequestReview/id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        state: data
            .pointer("/deletePullRequestReview/pullRequestReview/state")
            .and_then(Value::as_str)
            .unwrap_or("DELETED")
            .to_string(),
        url: data
            .pointer("/deletePullRequestReview/pullRequestReview/url")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        message: "Pending review discarded.".to_string(),
    })
}

fn github_token(auth_state: &AuthState) -> Result<String, ThreadActionError> {
    let token = auth_state
        .github_token()
        .map_err(|error| {
            ThreadActionError::new(
                "github-thread-session-error",
                format!(
                    "Narview could not read your GitHub token from OS secure storage. Sign out and sign in again if this keeps happening. {}",
                    error.message()
                ),
            )
        })?
        .ok_or_else(|| ThreadActionError::new("github-thread-unauthorized", "Sign in to write to GitHub Review Threads."))?;

    if !configured_github_review_thread_write_permission() {
        return Err(ThreadActionError::new(
            "github-thread-permission-error",
            "GitHub write access is needed to publish line-level and file-level Review Threads. Sign in with repo or public_repo scope.",
        ));
    }

    Ok(token)
}

async fn fetch_pull_request_id(
    http: &reqwest::Client,
    token: &str,
    owner: &str,
    name: &str,
    number: u64,
) -> Result<String, ThreadActionError> {
    let data = send_graphql(
        http,
        token,
        "load Pull Request for Review Thread",
        json!({
            "query": "query NarviewReviewThreadPullRequest($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { id } } }",
            "variables": {
                "owner": owner,
                "name": name,
                "number": number as i64,
            }
        }),
    )
    .await?;

    data.pointer("/repository/pullRequest/id")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .ok_or_else(|| {
            ThreadActionError::new(
                "github-thread-response-error",
                "GitHub returned no Pull Request id for this Review Thread.",
            )
        })
}

async fn ensure_pending_review_for_pull_request(
    http: &reqwest::Client,
    token: &str,
    owner: &str,
    name: &str,
    number: u64,
    preferred_review_id: Option<String>,
) -> Result<PendingReviewResponse, ThreadActionError> {
    let data = load_pending_review_data(http, token, owner, name, number).await?;

    let pull_request_id = pull_request_id_from_pending_review_data(&data)?;

    if let Some(review_id) = preferred_review_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        return Ok(PendingReviewResponse {
            pull_request_id,
            pull_request_review_id: review_id,
            state: "PENDING".to_string(),
            message: "Using existing pending GitHub review.".to_string(),
        });
    }

    if let Some(review_id) = viewer_pending_review_id(&data) {
        return Ok(PendingReviewResponse {
            pull_request_id,
            pull_request_review_id: review_id,
            state: "PENDING".to_string(),
            message: "Reusing pending GitHub review.".to_string(),
        });
    }

    let data = match send_graphql(
        http,
        token,
        "create pending review",
        json!({
            "query": "mutation CreatePendingReview($input: AddPullRequestReviewInput!) { addPullRequestReview(input: $input) { pullRequestReview { id state } } }",
            "variables": {
                "input": {
                    "pullRequestId": pull_request_id.clone(),
                }
            }
        }),
    )
    .await
    {
        Ok(data) => data,
        Err(error) if error.message.contains("one pending review") => {
            let data = load_pending_review_data(http, token, owner, name, number).await?;
            if let Some(review_id) = viewer_pending_review_id(&data) {
                return Ok(PendingReviewResponse {
                    pull_request_id,
                    pull_request_review_id: review_id,
                    state: "PENDING".to_string(),
                    message: "Reusing pending GitHub review.".to_string(),
                });
            }
            return Err(error);
        }
        Err(error) => return Err(error),
    };

    Ok(PendingReviewResponse {
        pull_request_id,
        pull_request_review_id: required_string(
            &data,
            "/addPullRequestReview/pullRequestReview/id",
            "Pull Request Review id",
        )?,
        state: data
            .pointer("/addPullRequestReview/pullRequestReview/state")
            .and_then(Value::as_str)
            .unwrap_or("PENDING")
            .to_string(),
        message: "Created pending GitHub review.".to_string(),
    })
}

async fn load_pending_review_data(
    http: &reqwest::Client,
    token: &str,
    owner: &str,
    name: &str,
    number: u64,
) -> Result<Value, ThreadActionError> {
    send_graphql(
        http,
        token,
        "load Pull Request pending review",
        json!({
            "query": "query NarviewPendingReview($owner: String!, $name: String!, $number: Int!) { viewer { login } repository(owner: $owner, name: $name) { pullRequest(number: $number) { id viewerLatestReview { id state comments(first: 100) { nodes { id author { login } body path line originalLine updatedAt url } } } reviews(first: 100, states: [PENDING]) { nodes { id state author { login } comments(first: 100) { nodes { id author { login } body path line originalLine updatedAt url } } } } } } }",
            "variables": {
                "owner": owner,
                "name": name,
                "number": number as i64,
            }
        }),
    )
    .await
}

fn pull_request_id_from_pending_review_data(data: &Value) -> Result<String, ThreadActionError> {
    data.pointer("/repository/pullRequest/id")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .ok_or_else(|| {
            ThreadActionError::new(
                "github-review-response-error",
                "GitHub returned no Pull Request id for this pending review.",
            )
        })
}

fn viewer_pending_review_id(data: &Value) -> Option<String> {
    viewer_pending_review_value(data)
        .and_then(|review| review.pointer("/id").and_then(Value::as_str))
        .map(ToString::to_string)
}

fn viewer_pending_review_value(data: &Value) -> Option<&Value> {
    if let Some(latest_review) = data.pointer("/repository/pullRequest/viewerLatestReview") {
        if latest_review.pointer("/state").and_then(Value::as_str) == Some("PENDING") {
            return Some(latest_review);
        }
    }

    let viewer_login = data.pointer("/viewer/login").and_then(Value::as_str)?;
    data.pointer("/repository/pullRequest/reviews/nodes")
        .and_then(Value::as_array)?
        .iter()
        .find(|review| {
            review.pointer("/state").and_then(Value::as_str) == Some("PENDING")
                && review.pointer("/author/login").and_then(Value::as_str) == Some(viewer_login)
        })
}

fn pending_review_drafts_from_value(value: &Value) -> Vec<PendingReviewDraftComment> {
    value
        .pointer("/comments/nodes")
        .and_then(Value::as_array)
        .map(|nodes| nodes.iter().map(pending_review_draft_from_value).collect())
        .unwrap_or_default()
}

fn pending_review_draft_from_value(value: &Value) -> PendingReviewDraftComment {
    PendingReviewDraftComment {
        id: value
            .pointer("/id")
            .and_then(Value::as_str)
            .unwrap_or("unknown-pending-review-comment")
            .to_string(),
        author_login: value
            .pointer("/author/login")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        file_path: value
            .pointer("/path")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        line: value
            .pointer("/line")
            .or_else(|| value.pointer("/originalLine"))
            .and_then(Value::as_u64),
        body: value
            .pointer("/body")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        updated_at: value
            .pointer("/updatedAt")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        url: value
            .pointer("/url")
            .and_then(Value::as_str)
            .map(ToString::to_string),
    }
}

fn parse_repository_slug(repository: &str) -> Result<(String, String), ThreadActionError> {
    let normalized = repository
        .trim()
        .trim_start_matches("https://github.com/")
        .trim_start_matches("http://github.com/")
        .trim_start_matches("github.com/")
        .trim_end_matches(".git")
        .trim_end_matches('/');
    let mut parts = normalized.split('/').filter(|part| !part.is_empty());
    let owner = parts.next();
    let name = parts.next();

    match (owner, name, parts.next()) {
        (Some(owner), Some(name), None) => Ok((owner.to_string(), name.to_string())),
        _ => Err(ThreadActionError::new(
            "github-thread-validation-error",
            "Repository must be in owner/name format.",
        )),
    }
}

fn created_review_thread_from_value(
    value: &Value,
) -> Result<CreatedReviewThread, ThreadActionError> {
    let comments = value
        .pointer("/comments/nodes")
        .and_then(Value::as_array)
        .map(|nodes| {
            nodes
                .iter()
                .map(created_review_thread_comment_from_value)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let first_comment = comments.first();

    Ok(CreatedReviewThread {
        id: required_string(value, "/id", "Review Thread id")?,
        author_login: first_comment.and_then(|comment| comment.author_login.clone()),
        file_path: required_string(value, "/path", "Review Thread path")?,
        line: value
            .pointer("/line")
            .or_else(|| value.pointer("/originalLine"))
            .and_then(Value::as_u64),
        state: if value
            .pointer("/isResolved")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            "resolved".to_string()
        } else if value
            .pointer("/isOutdated")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            "outdated".to_string()
        } else {
            "unresolved".to_string()
        },
        body: first_comment
            .map(|comment| comment.body.clone())
            .unwrap_or_else(|| "Review thread has no visible comment body.".to_string()),
        updated_at: first_comment
            .map(|comment| comment.updated_at.clone())
            .unwrap_or_default(),
        comments,
    })
}

fn created_review_thread_comment_from_value(value: &Value) -> CreatedReviewThreadComment {
    CreatedReviewThreadComment {
        id: value
            .pointer("/id")
            .and_then(Value::as_str)
            .unwrap_or("unknown-review-thread-comment")
            .to_string(),
        author_login: value
            .pointer("/author/login")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        body: value
            .pointer("/body")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        updated_at: value
            .pointer("/updatedAt")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        url: value
            .pointer("/url")
            .and_then(Value::as_str)
            .map(ToString::to_string),
    }
}

fn required_string(value: &Value, pointer: &str, label: &str) -> Result<String, ThreadActionError> {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .ok_or_else(|| {
            ThreadActionError::new(
                "github-thread-response-error",
                format!("GitHub returned no {label}."),
            )
        })
}

async fn send_graphql(
    http: &reqwest::Client,
    token: &str,
    action: &str,
    body: Value,
) -> Result<Value, ThreadActionError> {
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
            ThreadActionError::new(
                "github-thread-network-error",
                format!("Could not {action} GitHub Review Thread: {error}"),
            )
        })?;

    let status = response.status();
    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        return Err(ThreadActionError::new(
            "github-thread-permission-error",
            "GitHub rejected this Review Thread write. Check account access and token scopes.",
        ));
    }
    if status.is_server_error() {
        return Err(ThreadActionError::new(
            "github-thread-server-error",
            format!("GitHub could not {action} the Review Thread right now."),
        ));
    }
    if !status.is_success() {
        return Err(ThreadActionError::new(
            "github-thread-api-error",
            format!("GitHub rejected this Review Thread write with HTTP {status}."),
        ));
    }

    let payload = response.json::<Value>().await.map_err(|error| {
        ThreadActionError::new(
            "github-thread-response-error",
            format!("Could not read GitHub Review Thread response: {error}"),
        )
    })?;

    if let Some(errors) = payload.get("errors").and_then(Value::as_array) {
        let message = errors
            .iter()
            .filter_map(|error| error.get("message").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join(" ");

        return Err(ThreadActionError::new(
            "github-thread-api-error",
            if message.is_empty() {
                "GitHub returned an unknown Review Thread write error.".to_string()
            } else {
                message
            },
        ));
    }

    payload.get("data").cloned().ok_or_else(|| {
        ThreadActionError::new(
            "github-thread-response-error",
            "GitHub returned no Review Thread data.",
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_pending_review_from_viewer_latest_review() {
        let data = json!({
            "viewer": { "login": "malachibazar" },
            "repository": {
                "pullRequest": {
                    "id": "PR_1",
                    "viewerLatestReview": {
                        "id": "PRR_latest",
                        "state": "PENDING",
                        "comments": {
                            "nodes": [
                                {
                                    "id": "PRRC_1",
                                    "author": { "login": "malachibazar" },
                                    "body": "Looks odd.",
                                    "path": "src/slave.py",
                                    "line": 886,
                                    "originalLine": null,
                                    "updatedAt": "2026-06-18T12:20:00Z",
                                    "url": "https://github.com/o/r/pull/1#discussion_r1"
                                }
                            ]
                        }
                    },
                    "reviews": { "nodes": [] }
                }
            }
        });

        let review = viewer_pending_review_value(&data).expect("pending review");
        assert_eq!(
            review.pointer("/id").and_then(Value::as_str),
            Some("PRR_latest")
        );
        assert_eq!(
            viewer_pending_review_id(&data).as_deref(),
            Some("PRR_latest")
        );
        let drafts = pending_review_drafts_from_value(review);
        assert_eq!(drafts.len(), 1);
        assert_eq!(drafts[0].file_path.as_deref(), Some("src/slave.py"));
        assert_eq!(drafts[0].line, Some(886));
    }

    #[test]
    fn finds_pending_review_from_review_nodes_when_latest_review_is_null() {
        let data = json!({
            "viewer": { "login": "malachibazar" },
            "repository": {
                "pullRequest": {
                    "id": "PR_1",
                    "viewerLatestReview": null,
                    "reviews": {
                        "nodes": [
                            {
                                "id": "PRR_other",
                                "state": "PENDING",
                                "author": { "login": "someone-else" },
                                "comments": { "nodes": [] }
                            },
                            {
                                "id": "PRR_viewer",
                                "state": "PENDING",
                                "author": { "login": "malachibazar" },
                                "comments": { "nodes": [] }
                            }
                        ]
                    }
                }
            }
        });

        assert_eq!(
            viewer_pending_review_id(&data).as_deref(),
            Some("PRR_viewer")
        );
    }
}
