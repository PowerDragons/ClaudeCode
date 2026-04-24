using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Identity.Client;

public class GraphApiClient
{
    private readonly IConfidentialClientApplication _msal;
    private readonly HttpClient _http;
    private static readonly string[] Scopes = { "https://graph.microsoft.com/.default" };
    private const string GraphBase = "https://graph.microsoft.com/v1.0";

    private static readonly JsonSerializerOptions _opts =
        new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public GraphApiClient(string tenantId, string clientId, string clientSecret)
    {
        _msal = ConfidentialClientApplicationBuilder
            .Create(clientId)
            .WithClientSecret(clientSecret)
            .WithAuthority($"https://login.microsoftonline.com/{tenantId}")
            .Build();

        System.Net.ServicePointManager.SecurityProtocol =
            System.Net.SecurityProtocolType.Tls12 |
            System.Net.SecurityProtocolType.Tls11;

        _http = new HttpClient();
    }

    private async Task<string> GetTokenAsync()
    {
        var result = await _msal.AcquireTokenForClient(Scopes).ExecuteAsync();
        return result.AccessToken;
    }

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, object body = null)
    {
        var token = await GetTokenAsync();
        var request = new HttpRequestMessage(method, GraphBase + url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        if (body != null)
        {
            var json = JsonSerializer.Serialize(body, _opts);
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        }

        return await _http.SendAsync(request);
    }

    private static string Esc(string v) => v?.Replace("'", "''") ?? "";

    private const string UserSelect = "id,displayName,userPrincipalName,accountEnabled,department,jobTitle,title";

    // 사용자 검색 (계정 / 이름 / 소속그룹)
    public async Task<string> SearchUsersAsync(string account, string name, string groupId)
    {
        string url;

        if (!string.IsNullOrWhiteSpace(groupId))
        {
            // 그룹 멤버 조회 후 계정/이름 필터는 C#에서 처리
            url = $"/groups/{groupId}/members/microsoft.graph.user?$select={UserSelect}&$top=100";
        }
        else
        {
            var filters = new List<string>();
            if (!string.IsNullOrWhiteSpace(account))
                filters.Add($"startsWith(userPrincipalName,'{Esc(account)}')");
            if (!string.IsNullOrWhiteSpace(name))
                filters.Add($"startsWith(displayName,'{Esc(name)}')");
            if (filters.Count == 0)
                return "{\"value\":[]}";

            url = $"/users?$filter={string.Join(" or ", filters)}&$select={UserSelect}&$top=50";
        }

        var res = await SendAsync(HttpMethod.Get, url);
        var json = await res.Content.ReadAsStringAsync();

        // 그룹 조회 후 계정/이름 추가 필터 (C#)
        if (!string.IsNullOrWhiteSpace(groupId) &&
            (!string.IsNullOrWhiteSpace(account) || !string.IsNullOrWhiteSpace(name)))
        {
            json = FilterGroupMembers(json, account, name);
        }

        return json;
    }

    private string FilterGroupMembers(string json, string account, string name)
    {
        using (var doc = JsonDocument.Parse(json))
        {
            var filtered = new List<JsonElement>();
            foreach (var u in doc.RootElement.GetProperty("value").EnumerateArray())
            {
                var upn = u.TryGetProperty("userPrincipalName", out var v1) ? v1.GetString() ?? "" : "";
                var dn  = u.TryGetProperty("displayName", out var v2) ? v2.GetString() ?? "" : "";

                bool match = true;
                if (!string.IsNullOrWhiteSpace(account))
                    match &= upn.StartsWith(account, StringComparison.OrdinalIgnoreCase);
                if (!string.IsNullOrWhiteSpace(name))
                    match &= dn.StartsWith(name, StringComparison.OrdinalIgnoreCase);

                if (match) filtered.Add(u);
            }

            var result = new { value = filtered };
            return JsonSerializer.Serialize(result);
        }
    }

    // 그룹 목록
    public async Task<string> GetGroupsAsync()
    {
        var res = await SendAsync(HttpMethod.Get, "/groups?$select=id,displayName&$top=100");
        return await res.Content.ReadAsStringAsync();
    }

    // 비밀번호 초기화
    public async Task<(bool ok, string message)> ResetPasswordAsync(string userId, string password)
    {
        var body = new
        {
            passwordProfile = new
            {
                password,
                forceChangePasswordNextSignIn = true
            }
        };
        var res = await SendAsync(new HttpMethod("PATCH"), $"/users/{userId}", body);
        if (res.IsSuccessStatusCode) return (true, null);
        return (false, await res.Content.ReadAsStringAsync());
    }

    // 잠금 해제
    public async Task<(bool ok, string message)> UnlockUserAsync(string userId)
    {
        var body = new { accountEnabled = true };
        var res = await SendAsync(new HttpMethod("PATCH"), $"/users/{userId}", body);
        if (res.IsSuccessStatusCode) return (true, null);
        return (false, await res.Content.ReadAsStringAsync());
    }

    // 계정 사용 안함
    public async Task<(bool ok, string message)> DisableUserAsync(string userId)
    {
        var body = new { accountEnabled = false };
        var res = await SendAsync(new HttpMethod("PATCH"), $"/users/{userId}", body);
        if (res.IsSuccessStatusCode) return (true, null);
        return (false, await res.Content.ReadAsStringAsync());
    }
}
