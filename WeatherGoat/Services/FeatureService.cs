using WeatherGoat.Data;
using WeatherGoat.Exceptions;
using WeatherGoat.Data.Entities;
using Microsoft.EntityFrameworkCore;

namespace WeatherGoat.Services;

public class FeatureService
{
    private readonly ILogger<FeatureService>         _logger;
    private readonly IDbContextFactory<AppDbContext> _contextFactory;

    public FeatureService(ILogger<FeatureService> logger, IDbContextFactory<AppDbContext> contextFactory)
    {
        _logger         = logger;
        _contextFactory = contextFactory;
    }

    /// <summary>
    /// Whether a feature is enabled
    /// </summary>
    /// <param name="name">The name of the feature</param>
    /// <returns><c>true</c> if the feature should be enabled, <c>false</c> otherwise</returns>
    public async Task<bool> IsEnabledAsync(string name)
    {
        await using var db = await _contextFactory.CreateDbContextAsync();

        var feature = await db.Features.FirstOrDefaultAsync(f => f.Name == name && f.Enabled);
        // TODO throw if feature doesn't exist?
        return feature != null;
    }

    /// <summary>
    /// Creates a new feature flag if it doesn't already exist.
    /// </summary>
    /// <param name="name">The name of the feature.</param>
    /// <param name="description">The description of the feature.</param>
    /// <param name="enabled">Whether the feature is currently enabled.</param>
    public async Task TryCreateAsync(string name, string description, bool enabled = true)
    {
        try
        {
            await CreateAsync(name, description, enabled);
        }
        catch (FeatureExistsException)
        {
            // ignored
        }
    }

    /// <summary>
    /// Creates a new feature flag.
    /// </summary>
    /// <param name="name">The name of the feature.</param>
    /// <param name="description">The description of the feature.</param>
    /// <param name="enabled">Whether the feature is currently enabled.</param>
    /// <exception cref="FeatureExistsException">Thrown if the feature already exists.</exception>
    public async Task CreateAsync(string name, string description, bool enabled = true)
    {
        var featureExists = await ExistsAsync(name);
        if (featureExists)
        {
            throw new FeatureExistsException();
        }

        await using var db = await _contextFactory.CreateDbContextAsync();

        var feature = new Feature
        {
            Name        = name,
            Description = description,
            Enabled     = enabled,
        };

        await db.Features.AddAsync(feature);
        await db.SaveChangesAsync();

        _logger.LogInformation("Created feature flag {Feature}", feature);
    }

    /// <summary>
    /// Lists all features.
    /// </summary>
    public async Task<IReadOnlyList<Feature>> ListAsync()
    {
        await using var db = await _contextFactory.CreateDbContextAsync();

        var features = await db.Features.ToListAsync();

        return features.AsReadOnly();
    }
    
    public async Task<bool> ExistsAsync(string name)
    {
        await using var db = await _contextFactory.CreateDbContextAsync();

        return await db.Features.AnyAsync(f => f.Name == name);
    }

    public async Task<bool> ToggleAsync(string name)
    {
        await using var db = await _contextFactory.CreateDbContextAsync();

        var feature = await db.Features.FirstOrDefaultAsync(f => f.Name == name);

        FeatureDoesNotExistException.ThrowIfNull(feature);

        if (feature.Enabled)
        {
            await DisableAsync(name);

            return false;
        }
        
        await EnableAsync(name);

        return true;
    }

    public async Task EnableAsync(string name)
    {
        await using var db = await _contextFactory.CreateDbContextAsync();

        var feature = await db.Features.FirstOrDefaultAsync(f => f.Name == name);

        FeatureDoesNotExistException.ThrowIfNull(feature);

        if (!feature.Enabled)
        {
            feature.Enabled = true;

            await db.SaveChangesAsync();
        }
    }
    
    public async Task DisableAsync(string name)
    {
        await using var db = await _contextFactory.CreateDbContextAsync();

        var feature = await db.Features.FirstOrDefaultAsync(f => f.Name == name);
        
        FeatureDoesNotExistException.ThrowIfNull(feature);

        if (feature.Enabled)
        {
            feature.Enabled = false;

            await db.SaveChangesAsync();
        }
    }
}
