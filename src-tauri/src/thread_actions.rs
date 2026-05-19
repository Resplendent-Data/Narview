use reqwest::StatusCode;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::State;

use crate::auth::AuthState;
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
    })
}

fn github_token(auth_state: &AuthState) -> Result<String, ThreadActionError> {
    auth_state
        .github_token()
        .map_err(|error| ThreadActionError::new("github-thread-session-error", format!("{error:?}")))?
        .ok_or_else(|| ThreadActionError::new("github-thread-unauthorized", "Sign in to write to GitHub Review Threads."))
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

    payload
        .get("data")
        .cloned()
        .ok_or_else(|| ThreadActionError::new("github-thread-response-error", "GitHub returned no Review Thread data."))
}
