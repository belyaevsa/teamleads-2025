using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace TeamleadsBackend.Data;

// Design-time only: lets `dotnet ef migrations add/update` build the context without
// booting Program.
//
// It resolves the connection string the same way the app does – appsettings.json, then
// appsettings.{Environment}.json, then environment variables (so ConnectionStrings__Default
// wins) – because a factory that reads a different source than the app is how you end up
// migrating a database you didn't mean to.
//
// It also prints the target host before doing anything. `dotnet ef database update` is one
// of the few commands here that can rewrite a production schema, and the difference between
// the right database and the wrong one should not be invisible.
public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";

        var config = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile($"appsettings.{environment}.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        var conn = config.GetConnectionString("Default");

        if (string.IsNullOrWhiteSpace(conn))
        {
            // `migrations add` only needs a provider, never a connection, so a local
            // placeholder keeps scaffolding working. `database update` would otherwise
            // silently target localhost – hence the warning rather than a silent default.
            conn = "Host=localhost;Port=5432;Database=teamleads;Username=postgres;Password=postgres";
            Console.Error.WriteLine(
                "warn: no ConnectionStrings__Default found (checked appsettings*.json and environment). " +
                "Using the localhost placeholder – fine for `migrations add`, wrong for `database update`.");
        }
        else
        {
            // Host only: the connection string carries a password.
            var host = conn.Split(';')
                .FirstOrDefault(p => p.TrimStart().StartsWith("Host=", StringComparison.OrdinalIgnoreCase))
                ?.Trim() ?? "unknown host";
            Console.Error.WriteLine($"info: design-time context targets {host}");
        }

        var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(conn).Options;
        return new AppDbContext(options);
    }
}
