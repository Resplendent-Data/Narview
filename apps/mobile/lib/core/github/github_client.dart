import 'dart:convert';

import 'package:http/http.dart' as http;

class GithubClient {
  GithubClient({
    required this.tokenProvider,
    http.Client? httpClient,
    Uri? apiRoot,
  }) : _httpClient = httpClient ?? http.Client(),
       _apiRoot = apiRoot ?? Uri.parse('https://api.github.com');

  final Future<String?> Function() tokenProvider;
  final http.Client _httpClient;
  final Uri _apiRoot;

  Future<Map<String, dynamic>> getJson(String path) async {
    final response = await _httpClient.get(
      _apiRoot.resolve(path),
      headers: await _headers(),
    );
    return _decodeObject(response);
  }

  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final response = await _httpClient.post(
      _apiRoot.resolve(path),
      headers: await _headers(),
      body: jsonEncode(body),
    );
    return _decodeObject(response);
  }

  Future<Map<String, dynamic>> postGraphql(
    String query, {
    Map<String, dynamic> variables = const {},
  }) {
    return postJson('/graphql', {'query': query, 'variables': variables});
  }

  Future<Map<String, String>> _headers() async {
    final token = await tokenProvider();
    return {
      'accept': 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      if (token != null && token.isNotEmpty) 'authorization': 'Bearer $token',
    };
  }

  Map<String, dynamic> _decodeObject(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw GithubClientException(response.statusCode, response.body);
    }
    final decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) {
      return decoded;
    }
    throw GithubClientException(
      response.statusCode,
      'Expected a JSON object response.',
    );
  }
}

class GithubClientException implements Exception {
  const GithubClientException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => 'GitHub request failed ($statusCode): $message';
}
