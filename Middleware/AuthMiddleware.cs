using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

public class AuthMiddleware
{
    private readonly RequestDelegate _next;

    public AuthMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? "";

        // /api/auth/login 은 인증 불필요
        if (path.StartsWith("/api/", System.StringComparison.OrdinalIgnoreCase) &&
            !path.StartsWith("/api/auth/login", System.StringComparison.OrdinalIgnoreCase))
        {
            var username = context.Session.GetString("username");
            if (string.IsNullOrEmpty(username))
            {
                context.Response.StatusCode = 401;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsync("{\"error\":\"로그인이 필요합니다.\"}");
                return;
            }
        }

        await _next(context);
    }
}
