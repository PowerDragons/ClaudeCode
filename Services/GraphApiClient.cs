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

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, string url, object body = null, bool eventual = false)
    {
        var token = await GetTokenAsync();
        var request = new HttpRequestMessage(method, GraphBase + url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (eventual)
            request.Headers.Add("ConsistencyLevel", "eventual");

        if (body != null)
        {
            var json = JsonSerializer.Serialize(body, _opts);
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        }

        return await _http.SendAsync(request);
    }

    private static string Esc(string v) => v?.Replace("'", "''") ?? "";

    private const string UserSelect = "id,displayName,userPrincipalName,accountEnabled,department,jobTitle,title";

    // 사용자 검색 (계정 / 이름 / 그룹명) - contains (LIKE) 방식
    public async Task<string> SearchUsersAsync(string account, string name, string groupName, string status = null)
    {
        var statusFilter = status == "active"   ? "accountEnabled eq true"
                         : status == "inactive" ? "accountEnabled eq false"
                         : null;

        // 조건 없으면 전체 조회
        if (string.IsNullOrWhiteSpace(account) &&
            string.IsNullOrWhiteSpace(name) &&
            string.IsNullOrWhiteSpace(groupName))
        {
            var allUrl = statusFilter != null
                ? $"/users?$filter={statusFilter}&$select={UserSelect}&$top=100"
                : $"/users?$select={UserSelect}&$top=100";
            var all = await SendAsync(HttpMethod.Get, allUrl);
            return await all.Content.ReadAsStringAsync();
        }

        // 그룹명 검색: 그룹 찾고 → 멤버 조회
        if (!string.IsNullOrWhiteSpace(groupName))
        {
            var groupJson = await SearchGroupsByNameAsync(groupName);
            using (var doc = JsonDocument.Parse(groupJson))
            {
                if (!doc.RootElement.TryGetProperty("value", out var groups))
                    return "{\"value\":[]}";

                var allUsers = new List<JsonElement>();
                foreach (var g in groups.EnumerateArray())
                {
                    var gid = g.GetProperty("id").GetString();
                    var membersJson = await SendAsync(HttpMethod.Get,
                        $"/groups/{gid}/members/microsoft.graph.user?$select={UserSelect}&$top=100");
                    var membersText = await membersJson.Content.ReadAsStringAsync();

                    using (var md = JsonDocument.Parse(membersText))
                    {
                        if (!md.RootElement.TryGetProperty("value", out var members)) continue;
                        foreach (var u in members.EnumerateArray())
                            allUsers.Add(u.Clone());
                    }
                }

                // 계정/이름 추가 필터 (C#)
                var filtered = FilterUsers(allUsers, account, name, statusFilter);
                return JsonSerializer.Serialize(new { value = filtered });
            }
        }

        // 계정/이름 $search 검색 (LIKE 방식, ConsistencyLevel: eventual 필요)
        var terms = new List<string>();
        if (!string.IsNullOrWhiteSpace(account))
            terms.Add($"\"userPrincipalName:{Esc(account)}\"");
        if (!string.IsNullOrWhiteSpace(name))
            terms.Add($"\"displayName:{Esc(name)}\"");
        if (terms.Count == 0)
            return "{\"value\":[]}";

        var search = Uri.EscapeDataString(string.Join(" OR ", terms));
        var url    = $"/users?$search={search}&$select={UserSelect}&$top=50&$count=true";
        if (statusFilter != null)
            url += $"&$filter={statusFilter}";
        var res = await SendAsync(HttpMethod.Get, url, eventual: true);
        return await res.Content.ReadAsStringAsync();
    }

    private List<JsonElement> FilterUsers(List<JsonElement> users, string account, string name, string statusFilter)
    {
        return users.FindAll(u => {
            var upn     = u.TryGetProperty("userPrincipalName", out var v1) ? v1.GetString() ?? "" : "";
            var dn      = u.TryGetProperty("displayName",       out var v2) ? v2.GetString() ?? "" : "";
            var enabled = u.TryGetProperty("accountEnabled",    out var v3) && v3.GetBoolean();
            bool match  = true;
            if (!string.IsNullOrWhiteSpace(account))
                match &= upn.IndexOf(account, StringComparison.OrdinalIgnoreCase) >= 0;
            if (!string.IsNullOrWhiteSpace(name))
                match &= dn.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0;
            if (statusFilter == "accountEnabled eq true")  match &= enabled;
            if (statusFilter == "accountEnabled eq false") match &= !enabled;
            return match;
        });
    }

    // 그룹명으로 그룹 검색
    public async Task<string> SearchGroupsByNameAsync(string query)
    {
        var url = $"/groups?$filter=contains(displayName,'{Esc(query)}')&$select=id,displayName&$top=20&$count=true";
        var res = await SendAsync(HttpMethod.Get, url, eventual: true);
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
