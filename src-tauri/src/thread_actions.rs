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
