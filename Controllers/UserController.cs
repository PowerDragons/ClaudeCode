using System;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

[Route("api/users")]
public class UserController : ControllerBase
{
    private readonly GraphApiClient _graph;
    private readonly string _defaultPassword;

    public UserController(GraphApiClient graph, IConfiguration config)
    {
        _graph           = graph;
        _defaultPassword = config["DefaultPassword"] ?? "Welcome@2024!";
    }

    private bool HasPerm(string perm)
    {
        var perms = HttpContext.Session.GetString("permissions") ?? "";
        return perms.Contains(perm);
    }

    // 사용자 검색 (계정 / 이름 / 소속그룹)
    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery] string account,
        [FromQuery] string name,
        [FromQuery] string groupName,
        [FromQuery] string status)
    {
        var json = await _graph.SearchUsersAsync(account, name, groupName, status);

        using (var doc = JsonDocument.Parse(json))
        {
            if (doc.RootElement.TryGetProperty("error", out _))
                return BadRequest(new { error = "사용자 검색 실패: " + json });

            var users = doc.RootElement
                .GetProperty("value")
                .EnumerateArray()
                .Select(u => new
                {
                    id                = u.GetProperty("id").GetString(),
                    displayName       = Str(u, "displayName"),
                    userPrincipalName = Str(u, "userPrincipalName"),
                    accountEnabled    = u.TryGetProperty("accountEnabled", out var ae) && ae.GetBoolean(),
                    department        = Str(u, "department"),
                    jobTitle          = Str(u, "jobTitle"),
                    title             = Str(u, "title")
                })
                .ToList();

            return Ok(users);
        }
    }

    // 비밀번호 초기화
    [HttpPost("{userId}/reset-password")]
    public async Task<IActionResult> ResetPassword(string userId, [FromBody] ResetPasswordRequest req)
    {
        if (!HasPerm("reset_password"))
            return Forbid();

        var password = req?.UseDefault == true
            ? _defaultPassword
            : req?.Password;

        if (string.IsNullOrWhiteSpace(password))
            return BadRequest(new { error = "비밀번호를 입력하세요." });

        var (ok, message) = await _graph.ResetPasswordAsync(userId, password);
        if (!ok) return BadRequest(new { error = "비밀번호 초기화 실패: " + message });

        return Ok(new
        {
            message = "비밀번호가 초기화되었습니다.",
            temporaryPassword = password,
            isDefault = req?.UseDefault == true
        });
    }

    // 잠금 해제
    [HttpPost("{userId}/unlock")]
    public async Task<IActionResult> Unlock(string userId)
    {
        if (!HasPerm("unlock"))
            return Forbid();

        var (ok, message) = await _graph.UnlockUserAsync(userId);
        if (!ok) return BadRequest(new { error = "잠금 해제 실패: " + message });
        return Ok(new { message = "계정 잠금이 해제되었습니다." });
    }

    // 계정 사용 안함
    [HttpPost("{userId}/disable")]
    public async Task<IActionResult> Disable(string userId)
    {
        if (!HasPerm("disable"))
            return Forbid();

        var (ok, message) = await _graph.DisableUserAsync(userId);
        if (!ok) return BadRequest(new { error = "계정 비활성화 실패: " + message });
        return Ok(new { message = "계정이 비활성화되었습니다." });
    }

    private static string Str(JsonElement el, string prop)
        => el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() ?? ""
            : "";

    public class ResetPasswordRequest
    {
        public bool   UseDefault { get; set; }
        public string Password   { get; set; }
    }
}
