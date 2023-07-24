using WeatherGoat.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace WeatherGoat.Data;

public class AppDbContext : DbContext
{
    public DbSet<SentAlert>      Alerts         { get; set; }
    public DbSet<CoordinateInfo> CoordinateInfo { get; set; }

    private static readonly Func<AppDbContext, string, Task<bool>> HasAlertBeenReported
        = EF.CompileAsyncQuery((AppDbContext context, string alertId) => context.Alerts.Any(a => a.AlertId == alertId));
    
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public async Task<bool> HasAlertBeenReportedAsync(string alertId) => await HasAlertBeenReported(this, alertId);
}
