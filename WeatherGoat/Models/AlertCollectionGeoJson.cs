namespace WeatherGoat.Models;

public record AlertCollectionGeoJson
{
    [JsonPropertyName("type")]
    public string Type { get; set; }
    
    [JsonPropertyName("title")]
    public string Title { get; set; }
    
    [JsonPropertyName("features")]
    public IEnumerable<GeoJsonFeature> Features { get; set; }
}