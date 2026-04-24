using System.Linq;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly OperatorService _operators;

    public AuthController(OperatorService operators) => _operators = operators;

    [HttpPost("login")]
    public IActionResult Login([FromBody] LoginRequest req)
    {
        if (req == null || string.IsNullOrWhiteSpace(req.Username))
            return BadRequest(new { error = "아이디를 입력하세요." });

        var op = _operators.GetByUsername(req.Username);
        if (op == null || op.Password != req.Password)
            return StatusCode(401, new { error = "아이디 또는 비밀번호가 틀립니다." });

        HttpContext.Session.SetString("username",    op.Username);
        HttpContext.Session.SetString("displayName", op.DisplayName);
        HttpContext.Session.SetString("permissions", string.Join(",", op.Permissions));

        return Ok(new
        {
            displayName = op.DisplayName,
            permissions = op.Permissions
        });
    }

    [HttpPost("logout")]
    public IActionResult Logout()
    {
        HttpContext.Session.Clear();
        return Ok();
    }

    [HttpGet("me")]
    public IActionResult Me()
    {
        var username = HttpContext.Session.GetString("username");
        if (string.IsNullOrEmpty(username))
            return StatusCode(401, new { error = "로그인이 필요합니다." });

        var perms = HttpContext.Session.GetString("permissions") ?? "";
        return Ok(new
        {
            username,
            displayName = HttpContext.Session.GetString("displayName"),
            permissions = perms.Split(new[] { ',' }, System.StringSplitOptions.RemoveEmptyEntries)
        });
    }

    public class LoginRequest
    {
        public string Username { get; set; }
        public string Password { get; set; }
    }
}
