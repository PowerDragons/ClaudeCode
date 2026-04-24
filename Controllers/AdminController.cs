using System.Linq;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

[Route("api/admin")]
public class AdminController : ControllerBase
{
    private readonly OperatorService _operators;

    public AdminController(OperatorService operators) => _operators = operators;

    private bool IsAdmin()
    {
        var perms = HttpContext.Session.GetString("permissions") ?? "";
        return perms.Contains("admin");
    }

    [HttpGet("operators")]
    public IActionResult GetOperators()
    {
        if (!IsAdmin()) return Forbid();
        var ops = _operators.GetAll().Select(o => new
        {
            o.Id,
            o.Username,
            o.DisplayName,
            o.Permissions,
            Password = "••••••••"  // 비밀번호 노출 방지
        });
        return Ok(ops);
    }

    [HttpPost("operators")]
    public IActionResult AddOperator([FromBody] Operator op)
    {
        if (!IsAdmin()) return Forbid();
        if (string.IsNullOrWhiteSpace(op.Username) || string.IsNullOrWhiteSpace(op.Password))
            return BadRequest(new { error = "계정과 비밀번호는 필수입니다." });

        if (_operators.GetByUsername(op.Username) != null)
            return BadRequest(new { error = "이미 존재하는 계정입니다." });

        _operators.Add(op);
        return Ok(new { message = "등록되었습니다." });
    }

    [HttpPut("operators/{id}")]
    public IActionResult UpdateOperator(string id, [FromBody] Operator op)
    {
        if (!IsAdmin()) return Forbid();
        op.Id = id;
        if (!_operators.Update(op))
            return NotFound(new { error = "관리자를 찾을 수 없습니다." });

        // 자기 자신을 수정한 경우 세션 권한 즉시 갱신
        var me = HttpContext.Session.GetString("username");
        bool sessionUpdated = false;
        if (!string.IsNullOrEmpty(op.Username) && op.Username == me)
        {
            var updated = _operators.GetByUsername(me);
            if (updated != null)
            {
                HttpContext.Session.SetString("permissions", string.Join(",", updated.Permissions));
                HttpContext.Session.SetString("displayName", updated.DisplayName);
                sessionUpdated = true;
            }
        }

        return Ok(new { message = "수정되었습니다.", sessionUpdated });
    }

    [HttpDelete("operators/{id}")]
    public IActionResult DeleteOperator(string id)
    {
        if (!IsAdmin()) return Forbid();
        var me = HttpContext.Session.GetString("username");
        var op = _operators.GetAll().FirstOrDefault(o => o.Id == id);
        if (op?.Username == me)
            return BadRequest(new { error = "자기 자신은 삭제할 수 없습니다." });

        if (!_operators.Delete(id))
            return NotFound(new { error = "관리자를 찾을 수 없습니다." });
        return Ok(new { message = "삭제되었습니다." });
    }
}
