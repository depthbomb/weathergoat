using WeatherGoat.Services;
using WeatherGoat.Exceptions;

namespace WeatherGoat.Modules;

[RequireOwner]
[Group("features", "Feature flag commands")]
public class FeaturesModule : InteractionModuleBase<SocketInteractionContext>
{
    private readonly FeatureService _features;

    public FeaturesModule(FeatureService features)
    {
        _features = features;
    }
    
    [SlashCommand("list", "Lists all feature flags")]
    public async Task ListFeaturesAsync()
    {
        await DeferAsync();
        
        try
        {
            var features = await _features.ListAsync();
            if (features.Any())
            {
                var embed = new EmbedBuilder()
                            .WithTitle("Feature Flags")
                            .WithDescription($"I currently have `{features.Count}` feature flag(s).");

                foreach (var feature in features)
                {
                    embed.AddField($"{(feature.Enabled ? "\ud83d\udfe2" : "\ud83d\udd34")} `{feature.Name}`", feature.Description);
                }
                
                await ModifyOriginalResponseAsync(x => x.Embed = embed.Build());
            }
            else
            {
                await ModifyOriginalResponseAsync(x => x.Content = "I currently have no features.");
            }
        }
        catch
        {
            await ModifyOriginalResponseAsync(x => x.Content = "Could not list features.");
        }
    }

    [SlashCommand("enable", "Enables a feature if it exists")]
    public async Task EnableFeatureAsync(
        [Summary("feature-name", "The name of the feature to enable")]
        string featureName)
    {
        featureName = featureName.ToScreamingSnakeCase();
        
        await DeferAsync();

        try
        {
            await _features.EnableAsync(featureName);
            await ModifyOriginalResponseAsync(x => x.Content = $"Feature `{featureName}` has been enabled!");
        }
        catch (FeatureDoesNotExistException)
        {
            await ModifyOriginalResponseAsync(x => x.Content = $"Could not enable `{featureName}`, feature does not exist.");
        }
    }
    
    [SlashCommand("disable", "Disable a feature if it exists")]
    public async Task DisableFeatureAsync(
        [Summary("feature-name", "The name of the feature to disable")]
        string featureName)
    {
        featureName = featureName.ToScreamingSnakeCase();
        
        await DeferAsync();

        try
        {
            await _features.DisableAsync(featureName);
            await ModifyOriginalResponseAsync(x => x.Content = $"Feature `{featureName}` has been disabled!");
        }
        catch (FeatureDoesNotExistException)
        {
            await ModifyOriginalResponseAsync(x => x.Content = $"Could not disable `{featureName}`, feature does not exist.");
        }
    }
    
    [SlashCommand("toggle", "Toggles a feature if it exists")]
    public async Task ToggleFeatureAsync(
        [Summary("feature-name", "The name of the feature to toggle")]
        string featureName)
    {
        featureName = featureName.ToScreamingSnakeCase();

        await DeferAsync();

        try
        {
            var isNowEnabled = await _features.ToggleAsync(featureName);
            await ModifyOriginalResponseAsync(x => x.Content = $"Feature `{featureName}` has been {(isNowEnabled ? "enabled" : "disabled")}!");
        }
        catch (FeatureDoesNotExistException)
        {
            await ModifyOriginalResponseAsync(x => x.Content = $"Could not toggle `{featureName}`, feature does not exist.");
        }
    }
}
