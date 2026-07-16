using System.Text.Json;

namespace CMS.API.Middleware;

/// <summary>
/// Global last-resort exception handler. Any exception that escapes a controller/repository is
/// logged in full (message + stack trace) server-side, and the client gets ONE consistent shape:
/// <c>500 { "message": "..." }</c> with a generic, safe message.
/// </summary>
/// <remarks>
/// <para>
/// 🔐 The response body must never carry the exception message, stack trace, SQL text or
/// connection details — a raw <see cref="Microsoft.Data.SqlClient.SqlException"/> message can name
/// tables, columns and even parameter values, and SysConfig-related failures could mention paths
/// that hint at where secrets live. Detail goes to the log; the client gets the constant below.
/// </para>
/// <para>
/// This deliberately does NOT touch responses that are already meaningful: 401/403 are produced by
/// the auth pipeline and validation 400s by MVC — none of those throw, so none of them pass
/// through the catch. Controllers that catch specific exceptions themselves (the SqlException 547
/// → 409 delete conflicts) also keep working: a handled exception never reaches here.
/// </para>
/// <para>
/// Registered FIRST in the pipeline (see Program.cs), so everything downstream — auth, MVC,
/// repositories — is covered.
/// </para>
/// </remarks>
public sealed class ExceptionHandlingMiddleware
{
    /// <summary>The one safe message a client ever sees for an unexpected error.</summary>
    public const string GenericMessage = "系統發生未預期的錯誤，請稍後再試。";

    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        // A cancelled request (client disconnected mid-flight) is not a server fault: there is
        // nobody left to answer, and logging it as an error would just pollute the log.
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            // LogError(ex, ...) records the full exception — message, stack trace, inner chain.
            _logger.LogError(ex, "Unhandled exception for {Method} {Path}",
                context.Request.Method, context.Request.Path);

            if (context.Response.HasStarted)
            {
                // Headers are gone; nothing consistent can be written any more. Rethrow so the
                // server can at least abort the connection instead of sending a half-true 200.
                throw;
            }

            context.Response.Clear();
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json; charset=utf-8";
            await context.Response.WriteAsync(
                JsonSerializer.Serialize(new { message = GenericMessage }),
                context.RequestAborted);
        }
    }
}
