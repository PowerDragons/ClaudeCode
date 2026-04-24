using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

[Route("api/groups")]
public class GroupController : ControllerBase
{
    private readonly GraphApiClient _graph;

    public GroupController(GraphApiClient graph) => _graph = graph;

    [HttpGet]
    public async Task<IActionResult> GetGroups()
    {
        var json = await _graph.GetGroupsAsync();
        using (var doc = JsonDocument.Parse(json))
        {
            if (doc.RootElement.TryGetProperty("error", out _))
                return BadRequest(new { error = "그룹 조회 실패" });

            var groups = doc.RootElement
                .GetProperty("value")
                .EnumerateArray()
                .Select(g => new
                {
                    id          = g.GetProperty("id").GetString(),
                    displayName = g.TryGetProperty("displayName", out var dn) ? dn.GetString() : ""
                })
                .ToList();

            return Ok(groups);
        }
    }
}
