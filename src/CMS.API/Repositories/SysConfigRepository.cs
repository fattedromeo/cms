using System.Text.Json;
using CMS.API.Data;
using Dapper;

namespace CMS.API.Repositories;

public sealed class SysConfigRepository : ISysConfigRepository
{
    private const string AppConfigKey = "appConfig";
    private const string DefaultPasswordProperty = "defaultPassword";

    private readonly IDbConnectionFactory _factory;

    public SysConfigRepository(IDbConnectionFactory factory) => _factory = factory;

    public async Task<string> GetDefaultPasswordAsync(CancellationToken ct = default)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        var configValue = await conn.QuerySingleOrDefaultAsync<string>(new CommandDefinition(
            "SELECT configValue FROM SysConfig WHERE configKey = @AppConfigKey;",
            new { AppConfigKey }, cancellationToken: ct));

        if (string.IsNullOrWhiteSpace(configValue))
            throw new InvalidOperationException(
                $"SysConfig row '{AppConfigKey}' is missing or empty; cannot derive the default password.");

        // The JSON also carries symmetricSecurityKey (a JWT signing secret). Read ONLY
        // defaultPassword out of it, and never surface configValue in a message or log.
        string? defaultPassword;
        try
        {
            using var doc = JsonDocument.Parse(configValue);
            defaultPassword = doc.RootElement.TryGetProperty(DefaultPasswordProperty, out var prop)
                && prop.ValueKind == JsonValueKind.String
                    ? prop.GetString()
                    : null;
        }
        catch (JsonException)
        {
            // Deliberately does not include the payload — it holds the signing key.
            throw new InvalidOperationException(
                $"SysConfig['{AppConfigKey}'] is not valid JSON; cannot derive the default password.");
        }

        if (string.IsNullOrEmpty(defaultPassword))
            throw new InvalidOperationException(
                $"SysConfig['{AppConfigKey}'] has no non-empty '{DefaultPasswordProperty}' property; " +
                "refusing to create a user rather than fall back to a guessable password.");

        return defaultPassword;
    }
}
