use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

const KEYRING_SERVICE: &str = "com.resplendent-data.narview";
const KEYRING_USER: &str = "github-oauth";
const GITHUB_DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const DEFAULT_GITHUB_SCOPES: &str = "repo read:user";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SecureStoreError {
    code: &'static str,
    message: String,
}

impl SecureStoreError {
    fn unavailable(message: impl Into<String>) -> Self {
        let message = redact_secrets(&message.into());
        let message = if message.to_lowercase().contains("secure storage") {
            message
        } else {
            format!("secure storage unavailable: {message}")
        };

        Self {
            code: "secure-storage-unavailable",
            message,
        }
    }

    fn access(message: impl Into<String>) -> Self {
        Self {
            code: "secure-storage-access-denied",
            message: redact_secrets(&message.into()),
        }
    }

    fn operation(message: impl Into<String>) -> Self {
        Self {
            code: "secure-storage-error",
            message: redact_secrets(&message.into()),
        }
    }
}

impl From<KeyringError> for SecureStoreError {
    fn from(value: KeyringError) -> Self {
        match value {
            KeyringError::NoStorageAccess(_) => SecureStoreError::access(value.to_string()),
            KeyringError::NoEntry => SecureStoreError::operation(value.to_string()),
            _ => SecureStoreError::operation(value.to_string()),
        }
    }
}

pub trait SecureTokenStore: Send + Sync {
    fn load_token(&self) -> Result<Option<String>, SecureStoreError>;
    fn save_token(&self, token: &str) -> Result<(), SecureStoreError>;
    fn clear_token(&self) -> Result<(), SecureStoreError>;
}

struct NativeKeyringTokenStore;

impl NativeKeyringTokenStore {
    fn new() -> Result<Self, SecureStoreError> {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        {
            Ok(Self)
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            Err(SecureStoreError::unavailable(
                "Narview v1 supports secure session storage on macOS and Linux.",
            ))
        }
    }

    fn entry(&self) -> Result<Entry, SecureStoreError> {
        Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(SecureStoreError::from)
    }
}

impl SecureTokenStore for NativeKeyringTokenStore {
    fn load_token(&self) -> Result<Option<String>, SecureStoreError> {
        match self.entry()?.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(error) => Err(SecureStoreError::from(error)),
        }
    }

    fn save_token(&self, token: &str) -> Result<(), SecureStoreError> {
        self.entry()?
            .set_password(token)
            .map_err(SecureStoreError::from)
    }

    fn clear_token(&self) -> Result<(), SecureStoreError> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(SecureStoreError::from(error)),
        }
    }
}

struct UnavailableTokenStore {
    message: String,
}

impl UnavailableTokenStore {
    fn new(error: SecureStoreError) -> Self {
        Self {
            message: error.message,
        }
    }
}

impl SecureTokenStore for UnavailableTokenStore {
    fn load_token(&self) -> Result<Option<String>, SecureStoreError> {
        Err(SecureStoreError::unavailable(self.message.clone()))
    }

    fn save_token(&self, _token: &str) -> Result<(), SecureStoreError> {
        Err(SecureStoreError::unavailable(self.message.clone()))
    }

    fn clear_token(&self) -> Result<(), SecureStoreError> {
        Err(SecureStoreError::unavailable(self.message.clone()))
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AuthSessionKind {
    SignedIn,
    SignedOut,
    StorageUnavailable,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SecureStorageStatus {
    available: bool,
    message: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
    state: AuthSessionKind,
    storage: SecureStorageStatus,
    account_login: Option<String>,
    token_hint: Option<String>,
}

impl AuthSession {
    fn signed_in() -> Self {
        Self {
            state: AuthSessionKind::SignedIn,
            storage: SecureStorageStatus {
                available: true,
                message: None,
            },
            account_login: None,
            token_hint: Some("os-secure-storage".to_string()),
        }
    }

    fn signed_out() -> Self {
        Self {
            state: AuthSessionKind::SignedOut,
            storage: SecureStorageStatus {
                available: true,
                message: None,
            },
            account_login: None,
            token_hint: None,
        }
    }

    fn storage_unavailable(error: SecureStoreError) -> Self {
        Self {
            state: AuthSessionKind::StorageUnavailable,
            storage: SecureStorageStatus {
                available: false,
                message: Some(error.message),
            },
            account_login: None,
            token_hint: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthCommandError {
    code: String,
    message: String,
}

impl AuthCommandError {
    fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: redact_secrets(&message.into()),
        }
    }
}

impl From<SecureStoreError> for AuthCommandError {
    fn from(value: SecureStoreError) -> Self {
        Self {
            code: value.code.to_string(),
            message: value.message,
        }
    }
}

#[derive(Debug, Clone)]
struct PendingOAuthFlow {
    device_code: String,
    expires_at_epoch_seconds: u64,
    interval_seconds: u64,
}

pub struct AuthState {
    token_store: Box<dyn SecureTokenStore>,
    pending_flows: Mutex<HashMap<String, PendingOAuthFlow>>,
    http: reqwest::Client,
}

impl AuthState {
    pub fn new() -> Self {
        let token_store: Box<dyn SecureTokenStore> = match NativeKeyringTokenStore::new() {
            Ok(store) => Box::new(store),
            Err(error) => Box::new(UnavailableTokenStore::new(error)),
        };

        Self {
            token_store,
            pending_flows: Mutex::new(HashMap::new()),
            http: reqwest::Client::new(),
        }
    }

    #[cfg(test)]
    fn with_token_store(token_store: Box<dyn SecureTokenStore>) -> Self {
        Self {
            token_store,
            pending_flows: Mutex::new(HashMap::new()),
            http: reqwest::Client::new(),
        }
    }

    fn session(&self) -> AuthSession {
        session_from_store(self.token_store.as_ref())
    }

    fn sign_out_session(&self) -> Result<AuthSession, AuthCommandError> {
        self.token_store.clear_token()?;
        Ok(AuthSession::signed_out())
    }
}

#[derive(Debug, Clone)]
struct OAuthConfig {
    client_id: String,
    scopes: String,
}

impl OAuthConfig {
    fn from_env() -> Result<Self, AuthCommandError> {
        let client_id = std::env::var("NARVIEW_GITHUB_CLIENT_ID")
            .or_else(|_| std::env::var("NARVIEW_GITHUB_OAUTH_CLIENT_ID"))
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                AuthCommandError::new(
                    "github-oauth-client-missing",
                    "Set NARVIEW_GITHUB_CLIENT_ID before starting GitHub sign-in.",
                )
            })?;

        let scopes = std::env::var("NARVIEW_GITHUB_SCOPES")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| DEFAULT_GITHUB_SCOPES.to_string());

        Ok(Self { client_id, scopes })
    }
}

#[derive(Debug, Deserialize)]
struct GithubDeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    verification_uri_complete: Option<String>,
    expires_in: u64,
    interval: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthStartResponse {
    flow_id: String,
    user_code: String,
    verification_uri: String,
    verification_uri_complete: Option<String>,
    expires_at_epoch_seconds: u64,
    interval_seconds: u64,
    opened_browser: bool,
}

#[derive(Debug, Deserialize)]
struct GithubAccessTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
    interval: Option<u64>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum OAuthPollState {
    Pending,
    SlowDown,
    Authorized,
    Denied,
    Expired,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthPollResponse {
    state: OAuthPollState,
    interval_seconds: u64,
    message: Option<String>,
    session: Option<AuthSession>,
}

#[tauri::command]
pub async fn auth_status(state: State<'_, AuthState>) -> Result<AuthSession, AuthCommandError> {
    Ok(state.session())
}

#[tauri::command]
pub async fn sign_out(state: State<'_, AuthState>) -> Result<AuthSession, AuthCommandError> {
    state.sign_out_session()
}

#[tauri::command]
pub async fn start_github_oauth(
    state: State<'_, AuthState>,
) -> Result<OAuthStartResponse, AuthCommandError> {
    let config = OAuthConfig::from_env()?;
    let response = request_device_code(&state.http, &config).await?;
    let flow_id = Uuid::new_v4().to_string();
    let interval_seconds = response.interval.unwrap_or(5);
    let expires_at_epoch_seconds = now_epoch_seconds() + response.expires_in;
    let browser_url = response
        .verification_uri_complete
        .as_deref()
        .unwrap_or(&response.verification_uri)
        .to_string();

    state
        .pending_flows
        .lock()
        .map_err(|_| AuthCommandError::new("oauth-state-lock-failed", "Could not update OAuth state."))?
        .insert(
            flow_id.clone(),
            PendingOAuthFlow {
                device_code: response.device_code,
                expires_at_epoch_seconds,
                interval_seconds,
            },
        );

    let opened_browser = open::that(browser_url).is_ok();

    Ok(OAuthStartResponse {
        flow_id,
        user_code: response.user_code,
        verification_uri: response.verification_uri,
        verification_uri_complete: response.verification_uri_complete,
        expires_at_epoch_seconds,
        interval_seconds,
        opened_browser,
    })
}

#[tauri::command]
pub async fn poll_github_oauth(
    flow_id: String,
    state: State<'_, AuthState>,
) -> Result<OAuthPollResponse, AuthCommandError> {
    let config = OAuthConfig::from_env()?;
    let flow = {
        let pending_flows = state
            .pending_flows
            .lock()
            .map_err(|_| AuthCommandError::new("oauth-state-lock-failed", "Could not read OAuth state."))?;
        pending_flows
            .get(&flow_id)
            .cloned()
            .ok_or_else(|| AuthCommandError::new("oauth-flow-not-found", "This GitHub sign-in flow is no longer active."))?
    };

    if now_epoch_seconds() >= flow.expires_at_epoch_seconds {
        state
            .pending_flows
            .lock()
            .map_err(|_| AuthCommandError::new("oauth-state-lock-failed", "Could not update OAuth state."))?
            .remove(&flow_id);
        return Ok(OAuthPollResponse {
            state: OAuthPollState::Expired,
            interval_seconds: flow.interval_seconds,
            message: Some("GitHub sign-in expired.".to_string()),
            session: Some(state.session()),
        });
    }

    let response = request_access_token(&state.http, &config, &flow.device_code).await?;
    if let Some(token) = response.access_token {
        state.token_store.save_token(&token)?;
        state
            .pending_flows
            .lock()
            .map_err(|_| AuthCommandError::new("oauth-state-lock-failed", "Could not update OAuth state."))?
            .remove(&flow_id);
        return Ok(OAuthPollResponse {
            state: OAuthPollState::Authorized,
            interval_seconds: flow.interval_seconds,
            message: None,
            session: Some(AuthSession::signed_in()),
        });
    }

    match response.error.as_deref() {
        Some("authorization_pending") => Ok(OAuthPollResponse {
            state: OAuthPollState::Pending,
            interval_seconds: flow.interval_seconds,
            message: response.error_description.map(|value| redact_secrets(&value)),
            session: None,
        }),
        Some("slow_down") => {
            let interval_seconds = response.interval.unwrap_or(flow.interval_seconds + 5);
            state
                .pending_flows
                .lock()
                .map_err(|_| AuthCommandError::new("oauth-state-lock-failed", "Could not update OAuth state."))?
                .insert(
                    flow_id,
                    PendingOAuthFlow {
                        interval_seconds,
                        ..flow
                    },
                );
            Ok(OAuthPollResponse {
                state: OAuthPollState::SlowDown,
                interval_seconds,
                message: response.error_description.map(|value| redact_secrets(&value)),
                session: None,
            })
        }
        Some("expired_token") => {
            state
                .pending_flows
                .lock()
                .map_err(|_| AuthCommandError::new("oauth-state-lock-failed", "Could not update OAuth state."))?
                .remove(&flow_id);
            Ok(OAuthPollResponse {
                state: OAuthPollState::Expired,
                interval_seconds: flow.interval_seconds,
                message: response.error_description.map(|value| redact_secrets(&value)),
                session: Some(state.session()),
            })
        }
        Some("access_denied") => {
            state
                .pending_flows
                .lock()
                .map_err(|_| AuthCommandError::new("oauth-state-lock-failed", "Could not update OAuth state."))?
                .remove(&flow_id);
            Ok(OAuthPollResponse {
                state: OAuthPollState::Denied,
                interval_seconds: flow.interval_seconds,
                message: response.error_description.map(|value| redact_secrets(&value)),
                session: Some(state.session()),
            })
        }
        Some(error) => Err(AuthCommandError::new(
            "github-oauth-error",
            format!("GitHub sign-in failed: {error}"),
        )),
        None => Err(AuthCommandError::new(
            "github-oauth-malformed-response",
            "GitHub did not return an OAuth token or pending state.",
        )),
    }
}

async fn request_device_code(
    http: &reqwest::Client,
    config: &OAuthConfig,
) -> Result<GithubDeviceCodeResponse, AuthCommandError> {
    let response = http
        .post(GITHUB_DEVICE_CODE_URL)
        .header("Accept", "application/json")
        .header("User-Agent", "Narview")
        .form(&[
            ("client_id", config.client_id.as_str()),
            ("scope", config.scopes.as_str()),
        ])
        .send()
        .await
        .map_err(|error| AuthCommandError::new("github-oauth-network-error", error.to_string()))?;

    if !response.status().is_success() {
        return Err(AuthCommandError::new(
            "github-oauth-start-failed",
            format!("GitHub rejected OAuth start with HTTP {}.", response.status()),
        ));
    }

    response
        .json::<GithubDeviceCodeResponse>()
        .await
        .map_err(|error| AuthCommandError::new("github-oauth-response-error", error.to_string()))
}

async fn request_access_token(
    http: &reqwest::Client,
    config: &OAuthConfig,
    device_code: &str,
) -> Result<GithubAccessTokenResponse, AuthCommandError> {
    let response = http
        .post(GITHUB_ACCESS_TOKEN_URL)
        .header("Accept", "application/json")
        .header("User-Agent", "Narview")
        .form(&[
            ("client_id", config.client_id.as_str()),
            ("device_code", device_code),
            (
                "grant_type",
                "urn:ietf:params:oauth:grant-type:device_code",
            ),
        ])
        .send()
        .await
        .map_err(|error| AuthCommandError::new("github-oauth-network-error", error.to_string()))?;

    if !response.status().is_success() {
        return Err(AuthCommandError::new(
            "github-oauth-poll-failed",
            format!("GitHub rejected OAuth polling with HTTP {}.", response.status()),
        ));
    }

    response
        .json::<GithubAccessTokenResponse>()
        .await
        .map_err(|error| AuthCommandError::new("github-oauth-response-error", error.to_string()))
}

fn session_from_store(store: &dyn SecureTokenStore) -> AuthSession {
    match store.load_token() {
        Ok(Some(_token)) => AuthSession::signed_in(),
        Ok(None) => AuthSession::signed_out(),
        Err(error) => AuthSession::storage_unavailable(error),
    }
}

fn now_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn redact_secrets(value: &str) -> String {
    let mut redacted = value.to_string();
    for prefix in ["gho_", "ghp_", "ghu_", "ghs_", "ghr_", "github_pat_"] {
        redacted = redact_prefixed_secret(redacted, prefix);
    }
    redacted
}

fn redact_prefixed_secret(mut value: String, prefix: &str) -> String {
    let mut cursor = 0;
    while let Some(relative_start) = value[cursor..].find(prefix) {
        let start = cursor + relative_start;
        let mut end = start + prefix.len();
        for (offset, character) in value[end..].char_indices() {
            if character.is_ascii_alphanumeric() || character == '_' {
                end = start + prefix.len() + offset + character.len_utf8();
            } else {
                break;
            }
        }
        value.replace_range(start..end, "[redacted]");
        cursor = start + "[redacted]".len();
    }
    value
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    struct MemoryTokenStore {
        token: Mutex<Option<String>>,
    }

    impl MemoryTokenStore {
        fn with_token(token: &str) -> Self {
            Self {
                token: Mutex::new(Some(token.to_string())),
            }
        }

        fn empty() -> Self {
            Self {
                token: Mutex::new(None),
            }
        }
    }

    impl SecureTokenStore for MemoryTokenStore {
        fn load_token(&self) -> Result<Option<String>, SecureStoreError> {
            Ok(self.token.lock().unwrap().clone())
        }

        fn save_token(&self, token: &str) -> Result<(), SecureStoreError> {
            *self.token.lock().unwrap() = Some(token.to_string());
            Ok(())
        }

        fn clear_token(&self) -> Result<(), SecureStoreError> {
            *self.token.lock().unwrap() = None;
            Ok(())
        }
    }

    struct FailingTokenStore {
        message: String,
    }

    impl SecureTokenStore for FailingTokenStore {
        fn load_token(&self) -> Result<Option<String>, SecureStoreError> {
            Err(SecureStoreError::unavailable(self.message.clone()))
        }

        fn save_token(&self, _token: &str) -> Result<(), SecureStoreError> {
            Err(SecureStoreError::unavailable(self.message.clone()))
        }

        fn clear_token(&self) -> Result<(), SecureStoreError> {
            Err(SecureStoreError::unavailable(self.message.clone()))
        }
    }

    #[test]
    fn restores_session_without_exposing_token() {
        let token = "gho_secretabcdefghijklmnopqrstuvwxyz123456";
        let store = MemoryTokenStore::with_token(token);
        let session = session_from_store(&store);
        let payload = serde_json::to_string(&session).unwrap();

        assert_eq!(session.state, AuthSessionKind::SignedIn);
        assert!(!payload.contains(token));
        assert!(payload.contains("os-secure-storage"));
    }

    #[test]
    fn sign_out_clears_secure_token() {
        let state = AuthState::with_token_store(Box::new(MemoryTokenStore::with_token(
            "gho_secretabcdefghijklmnopqrstuvwxyz123456",
        )));

        let session = state.sign_out_session().unwrap();

        assert_eq!(session.state, AuthSessionKind::SignedOut);
        assert_eq!(state.session().state, AuthSessionKind::SignedOut);
    }

    #[test]
    fn storage_failure_is_clear_and_sanitized() {
        let token = "ghp_secretabcdefghijklmnopqrstuvwxyz123456";
        let store = FailingTokenStore {
            message: format!("keychain locked while reading {token}"),
        };

        let session = session_from_store(&store);
        let payload = serde_json::to_string(&session).unwrap();

        assert_eq!(session.state, AuthSessionKind::StorageUnavailable);
        assert!(!payload.contains(token));
        assert!(payload.contains("secure storage"));
    }

    #[test]
    fn saving_token_does_not_put_secret_in_error_payload() {
        let token = "github_pat_abcdefghijklmnopqrstuvwxyz123456";
        let state = AuthState::with_token_store(Box::new(FailingTokenStore {
            message: format!("refused to persist {token}"),
        }));

        let error = state.token_store.save_token(token).unwrap_err();
        let payload = serde_json::to_string(&AuthCommandError::from(error)).unwrap();

        assert!(!payload.contains(token));
        assert!(payload.contains("[redacted]"));
    }

    #[test]
    fn empty_store_restores_signed_out_session() {
        let store = MemoryTokenStore::empty();

        assert_eq!(session_from_store(&store).state, AuthSessionKind::SignedOut);
    }
}
