using TeamleadsBackend.Security;
using TeamleadsBackend.Settings;

namespace TeamleadsBackend.Endpoints;

public static class SettingsEndpoints
{
    public record SettingInput(string Value);

    public static IEndpointRouteBuilder MapSettings(this IEndpointRouteBuilder api)
    {
        // Admin: every tunable with its effective value and where it came from.
        api.MapGet("/settings", async (SettingsService settings, CancellationToken ct) =>
            Results.Ok(await settings.DescribeAsync(ct)))
        .RequireApiKey()
        .WithName("ListSettings");

        // Admin: change one. Unknown keys and out-of-range values are rejected here –
        // a settings store that accepts anything just relocates the bug.
        api.MapPut("/settings/{key}", async (string key, SettingInput input, SettingsService settings, CancellationToken ct) =>
        {
            var error = await settings.SetAsync(key, input.Value?.Trim() ?? "", null, ct);
            return error is null
                ? Results.Ok(new { key, value = input!.Value!.Trim() })
                : Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [error] });
        })
        .RequireApiKey()
        .WithName("UpdateSetting");

        return api;
    }
}
