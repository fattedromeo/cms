using System.Text;
using System.Text.Json;
using CMS.API.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace CMS.API.Tests;

/// <summary>
/// Unit tests for <see cref="ExceptionHandlingMiddleware"/>: the 500 body carries only the generic
/// message (never exception text), the full exception reaches the logger, and a healthy request
/// passes through untouched.
/// </summary>
public class ExceptionHandlingMiddlewareTests
{
    // Realistic leak bait: the kind of detail a raw SqlException/connection failure would carry.
    private const string SecretDetail =
        "SELECT PasswordHash FROM AppUser WHERE UserId = @UserId; Server=.\\SQLEXPRESS;Database=CMS";

    [Fact]
    public async Task UnhandledException_Returns500_WithOnlyTheGenericMessage()
    {
        var logger = new CapturingLogger();
        var middleware = new ExceptionHandlingMiddleware(
            _ => throw new InvalidOperationException(SecretDetail), logger);
        var context = ContextWithBodyStream();

        await middleware.InvokeAsync(context);

        Assert.Equal(StatusCodes.Status500InternalServerError, context.Response.StatusCode);
        Assert.StartsWith("application/json", context.Response.ContentType);

        var body = ReadBody(context);
        using var json = JsonDocument.Parse(body);
        Assert.Equal(ExceptionHandlingMiddleware.GenericMessage, json.RootElement.GetProperty("message").GetString());
        // The one property is all there is — no stackTrace/detail/exception fields.
        Assert.Single(json.RootElement.EnumerateObject());
        // Neither the SQL text, the connection string, nor any stack frame leaks.
        Assert.DoesNotContain("SELECT", body);
        Assert.DoesNotContain("SQLEXPRESS", body);
        Assert.DoesNotContain("InvalidOperationException", body);
        Assert.DoesNotContain("at CMS.API", body);
    }

    [Fact]
    public async Task UnhandledException_IsLoggedInFull()
    {
        var logger = new CapturingLogger();
        var thrown = new InvalidOperationException(SecretDetail);
        var middleware = new ExceptionHandlingMiddleware(_ => throw thrown, logger);

        await middleware.InvokeAsync(ContextWithBodyStream());

        // Same exception instance, as an Error — LogError(ex, ...) carries message + stack trace.
        var entry = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Error, entry.Level);
        Assert.Same(thrown, entry.Exception);
    }

    [Fact]
    public async Task HealthyRequest_PassesThroughUntouched()
    {
        var logger = new CapturingLogger();
        var middleware = new ExceptionHandlingMiddleware(ctx =>
        {
            ctx.Response.StatusCode = StatusCodes.Status204NoContent;
            return Task.CompletedTask;
        }, logger);
        var context = ContextWithBodyStream();

        await middleware.InvokeAsync(context);

        Assert.Equal(StatusCodes.Status204NoContent, context.Response.StatusCode);
        Assert.Empty(logger.Entries);
        Assert.Empty(ReadBody(context));
    }

    [Fact]
    public async Task CancelledRequest_IsRethrown_NotTurnedIntoA500()
    {
        // A client that disconnected is not a server fault — no error log, no fabricated 500.
        var logger = new CapturingLogger();
        var middleware = new ExceptionHandlingMiddleware(
            _ => throw new OperationCanceledException(), logger);
        var context = ContextWithBodyStream();
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        context.RequestAborted = cts.Token;

        await Assert.ThrowsAsync<OperationCanceledException>(() => middleware.InvokeAsync(context));

        Assert.Empty(logger.Entries);
    }

    // --- Harness -------------------------------------------------------------

    private static DefaultHttpContext ContextWithBodyStream()
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();
        return context;
    }

    private static string ReadBody(HttpContext context)
    {
        context.Response.Body.Position = 0;
        return new StreamReader(context.Response.Body, Encoding.UTF8).ReadToEnd();
    }

    private sealed record LogEntry(LogLevel Level, Exception? Exception, string Message);

    private sealed class CapturingLogger : ILogger<ExceptionHandlingMiddleware>
    {
        public List<LogEntry> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state,
            Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add(new LogEntry(logLevel, exception, formatter(state, exception)));
    }
}
