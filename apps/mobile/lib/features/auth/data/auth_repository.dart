import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../../../core/storage/secure_token_store.dart';

const githubOAuthClientId = 'Ov23li1PomYCgqAQ2nvr';
const githubOAuthScopes = 'repo read:user';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return GithubDeviceAuthRepository(SecureTokenStore());
});

final authSessionProvider = FutureProvider<AuthSession>((ref) {
  return ref.watch(authRepositoryProvider).getSession();
});

abstract class AuthRepository {
  Future<AuthSession> getSession();

  Future<OAuthStartResponse> startSignIn();

  Future<OAuthPollResponse> pollSignIn(OAuthStartResponse flow);

  Future<void> signOut();
}

class GithubDeviceAuthRepository implements AuthRepository {
  GithubDeviceAuthRepository(
    this._tokenStore, {
    http.Client? httpClient,
    Uri? githubRoot,
  }) : _httpClient = httpClient ?? http.Client(),
       _githubRoot = githubRoot ?? Uri.parse('https://github.com');

  final SecureTokenStore _tokenStore;
  final http.Client _httpClient;
  final Uri _githubRoot;

  @override
  Future<AuthSession> getSession() async {
    final token = await _tokenStore.readToken();
    if (token == null || token.trim().isEmpty) {
      return const AuthSession.signedOut();
    }

    try {
      final user = await _fetchViewer(token);
      return AuthSession.signedIn(login: user.login);
    } catch (_) {
      return const AuthSession.signedIn(login: 'GitHub');
    }
  }

  @override
  Future<OAuthStartResponse> startSignIn() async {
    final response = await _httpClient.post(
      _githubRoot.resolve('/login/device/code'),
      headers: const {
        'accept': 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: {'client_id': githubOAuthClientId, 'scope': githubOAuthScopes},
    );

    final json = _decodeObject(response);
    return OAuthStartResponse(
      deviceCode: json['device_code'] as String,
      userCode: json['user_code'] as String,
      verificationUri: json['verification_uri'] as String,
      verificationUriComplete: json['verification_uri_complete'] as String?,
      expiresAt: DateTime.now().add(
        Duration(seconds: json['expires_in'] as int),
      ),
      intervalSeconds: json['interval'] as int? ?? 5,
    );
  }

  @override
  Future<OAuthPollResponse> pollSignIn(OAuthStartResponse flow) async {
    if (DateTime.now().isAfter(flow.expiresAt)) {
      return const OAuthPollResponse.expired('GitHub sign-in expired.');
    }

    final response = await _httpClient.post(
      _githubRoot.resolve('/login/oauth/access_token'),
      headers: const {
        'accept': 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: {
        'client_id': githubOAuthClientId,
        'device_code': flow.deviceCode,
        'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
      },
    );

    final json = _decodeObject(response);
    final accessToken = json['access_token'] as String?;
    if (accessToken != null && accessToken.isNotEmpty) {
      await _tokenStore.writeToken(accessToken);
      final user = await _fetchViewer(
        accessToken,
      ).catchError((_) => const _GithubUser(login: 'GitHub'));
      return OAuthPollResponse.authorized(
        AuthSession.signedIn(login: user.login),
      );
    }

    switch (json['error']) {
      case 'authorization_pending':
        return OAuthPollResponse.pending(
          message: json['error_description'] as String?,
          intervalSeconds: flow.intervalSeconds,
        );
      case 'slow_down':
        return OAuthPollResponse.pending(
          message: json['error_description'] as String?,
          intervalSeconds:
              (json['interval'] as int?) ?? flow.intervalSeconds + 5,
        );
      case 'expired_token':
        return OAuthPollResponse.expired(json['error_description'] as String?);
      case 'access_denied':
        return OAuthPollResponse.denied(json['error_description'] as String?);
      default:
        throw AuthException(
          json['error_description'] as String? ?? 'GitHub sign-in failed.',
        );
    }
  }

  @override
  Future<void> signOut() => _tokenStore.clearToken();

  Future<_GithubUser> _fetchViewer(String token) async {
    final response = await _httpClient.get(
      Uri.parse('https://api.github.com/user'),
      headers: {
        'accept': 'application/vnd.github+json',
        'authorization': 'Bearer $token',
        'x-github-api-version': '2022-11-28',
      },
    );
    final json = _decodeObject(response);
    return _GithubUser(login: json['login'] as String? ?? 'GitHub');
  }

  Map<String, dynamic> _decodeObject(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw AuthException('GitHub returned HTTP ${response.statusCode}.');
    }
    final decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) {
      return decoded;
    }
    throw const AuthException('GitHub returned an unexpected response.');
  }
}

class AuthSession {
  const AuthSession._({required this.state, required this.login});

  const AuthSession.signedOut()
    : this._(state: AuthSessionState.signedOut, login: null);

  const AuthSession.signedIn({required String login})
    : this._(state: AuthSessionState.signedIn, login: login);

  final AuthSessionState state;
  final String? login;

  bool get isSignedIn => state == AuthSessionState.signedIn;
}

enum AuthSessionState { signedIn, signedOut }

class OAuthStartResponse {
  const OAuthStartResponse({
    required this.deviceCode,
    required this.userCode,
    required this.verificationUri,
    required this.verificationUriComplete,
    required this.expiresAt,
    required this.intervalSeconds,
  });

  final String deviceCode;
  final String userCode;
  final String verificationUri;
  final String? verificationUriComplete;
  final DateTime expiresAt;
  final int intervalSeconds;

  Uri get browserUri => Uri.parse(verificationUriComplete ?? verificationUri);
}

class OAuthPollResponse {
  const OAuthPollResponse._({
    required this.state,
    required this.intervalSeconds,
    required this.message,
    required this.session,
  });

  const OAuthPollResponse.authorized(AuthSession session)
    : this._(
        state: OAuthPollState.authorized,
        intervalSeconds: 5,
        message: null,
        session: session,
      );

  const OAuthPollResponse.pending({
    String? message,
    required int intervalSeconds,
  }) : this._(
         state: OAuthPollState.pending,
         intervalSeconds: intervalSeconds,
         message: message,
         session: null,
       );

  const OAuthPollResponse.denied(String? message)
    : this._(
        state: OAuthPollState.denied,
        intervalSeconds: 5,
        message: message,
        session: null,
      );

  const OAuthPollResponse.expired(String? message)
    : this._(
        state: OAuthPollState.expired,
        intervalSeconds: 5,
        message: message,
        session: null,
      );

  final OAuthPollState state;
  final int intervalSeconds;
  final String? message;
  final AuthSession? session;
}

enum OAuthPollState { pending, authorized, denied, expired }

class AuthException implements Exception {
  const AuthException(this.message);

  final String message;

  @override
  String toString() => message;
}

class _GithubUser {
  const _GithubUser({required this.login});

  final String login;
}
