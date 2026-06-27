using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace TeamleadsBackend.Data;

// Design-time only: lets `dotnet ef migrations add/update` build the context
// without booting Program (which requires a real connection string). The
// placeholder is never connected to for `migrations add`; `database update`
// picks up the real ConnectionStrings__Default from the environment.
public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var conn = Environment.GetEnvironmentVariable("ConnectionStrings__Default")
                   ?? "Host=localhost;Port=5432;Database=teamleads;Username=postgres;Password=postgres";
        var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(conn).Options;
        return new AppDbContext(options);
    }
}
