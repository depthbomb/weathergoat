﻿using WeatherGoat.Shared;
using WeatherGoat.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace WeatherGoat.Data;

public class AppDbContext : DbContext
{
    public DbSet<Feature>             Features             { get; set; }
    public DbSet<AlertDestination>    AlertDestinations    { get; set; }
    public DbSet<ForecastDestination> ForecastDestinations { get; set; }
    public DbSet<SentAlert>           SentAlerts           { get; set; }
    public DbSet<VolatileMessage>     VolatileMessages     { get; set; }
    
    private static readonly Func<AppDbContext, string, Task<bool>> HasAlertBeenReported
        = EF.CompileAsyncQuery((AppDbContext context, string alertId) => context.SentAlerts.Any(x => x.AlertId == alertId));

    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }
    
    public async Task<bool> HasAlertBeenReportedAsync(string alertId) => await HasAlertBeenReported(this, alertId);

    #region Overrides of DbContext
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Feature>()
                    .Property(f => f.Name)
                    .HasConversion(v => v.ToScreamingSnakeCase(), v => v);
        
        base.OnModelCreating(modelBuilder);
    }
    #endregion
}