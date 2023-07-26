namespace WeatherGoat.Models;

public record RelativeLocation
{
    [JsonPropertyName("city")]
    public string City { get; set; }
	
    [JsonPropertyName("state")]
    public string State { get; set; }

    public string CityAndState => $"{City}, {State}";
}
