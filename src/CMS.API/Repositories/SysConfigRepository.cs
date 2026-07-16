using System.Text.Json;
using CMS.API.Data;
using Dapper;

namespace CMS.API.Repositories;

public sealed class SysConfigRepository : ISysConfigRepository
{
    private const string AppConfigKey = "appConfig";
    private const string DefaultPasswordProperty = "defaultPassword";
    private const string SymmetricSecurityKeyProperty = "symmetricSecurityKey";

    private readonly IDbConnectionFactory _factory;

    public SysConfigRepository(IDbConnectionFactory factory) => _factory = factory;

    public Task<string> GetDefaultPasswordAsync(CancellationToken ct = default)
        => ReadAppConfigStringAsync(DefaultPasswordProperty, ct);

    public Task<string> GetSymmetricSecurityKeyAsync(CancellationToken ct = default)
        => ReadAppConfigStringAsync(SymmetricSecurityKeyProperty, ct);

    /// <summary>
    /// Reads exactly ONE string property out of the <c>appConfig</c> JSON.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The JSON is parsed in C# rather than with SQL's <c>OPENJSON</c> on purpose: the CMS database
    /// runs at <b>compatibility level 100</b>, where <c>OPENJSON</c> does not exist ("Invalid object
    /// name 'OPENJSON'"). Verified against the dev DB.
    /// </para>
    /// <para>
    /// 🔐 No code path here puts <c>configValue</c> — or the property value — into an exception
    /// message or a log. The row holds <c>symmetricSecurityKey</c>; a message quoting the payload
    /// would leak the JWT signing key into whatever reads the logs. Messages name only the key and
    /// the property.
    /// </para>
    /// </remarks>
    private async Task<string> ReadAppConfigStringAsync(string propertyName, CancellationToken ct)
    {
        using var conn = await _factory.CreateOpenConnectionAsync(ct);

        var configValue = await conn.QuerySingleOrDefaultAsync<string>(new CommandDefinition(
            "SELECT configValue FROM SysConfig WHERE configKey = @AppConfigKey;",
            new { AppConfigKey }, cancellationToken: ct));

        if (string.IsNullOrWhiteSpace(configValue))
            throw new InvalidOperationException(
                $"SysConfig row '{AppConfigKey}' is missing or empty; cannot read '{propertyName}'.");

        string? value;
        try
        {
            using var doc = JsonDocument.Parse(configValue);
            value = doc.RootElement.TryGetProperty(propertyName, out var prop)
                && prop.ValueKind == JsonValueKind.String
                    ? prop.GetString()
                    : null;
        }
        catch (JsonException)
        {
            // Deliberately does not include the payload — it holds the signing key.
            throw new InvalidOperationException(
                $"SysConfig['{AppConfigKey}'] is not valid JSON; cannot read '{propertyName}'.");
        }

        if (string.IsNullOrEmpty(value))
            throw new InvalidOperationException(
                $"SysConfig['{AppConfigKey}'] has no non-empty '{propertyName}' property. " +
                "Refusing to fall back to a default: for defaultPassword that would seed a guessable " +
                "password hash, and for symmetricSecurityKey it would sign tokens with a known key.");

        return value;
    }
}
