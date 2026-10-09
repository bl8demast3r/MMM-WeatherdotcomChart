# MMM-WeatherdotcomChart

A [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror) module that charts hourly and daily weather forecasts using [Chart.js](https://www.chartjs.org/). It's a fork of [MMM-WeatherChart](https://github.com/mtatsuma/MMM-WeatherChart) by Tatsuma Matsuki that displays the weather data shared by [MMM-Weatherdotcom](https://github.com/bl8demast3r/MMM-Weatherdotcom): [Weather.com](https://weather.com/) data, with [NOAA](https://www.weather.gov/documentation/services-web-api) as a backup.

Daily forecast (high and low temperature, weather icons on top, precipitation on the bottom):

![Daily forecast](screenshots/daily.png?raw=true "Daily forecast")

When Weather.com is unavailable, the chart keeps working with NOAA data and the footer shows the fallback:

![Daily forecast from the NOAA backup](screenshots/daily-noaa-backup.png?raw=true "Daily forecast from the NOAA backup")

## Requirements

> [!IMPORTANT]
> **[MMM-Weatherdotcom](https://github.com/bl8demast3r/MMM-Weatherdotcom) is a required module.** It polls Weather.com (and NOAA as a backup) for weather data; this module doesn't poll anything itself. MMM-Weatherdotcom also provides the weather icons.
>
> **A Weather.com API key must be purchased directly from Weather.com (The Weather Company).** No API keys are included in this repository. The key goes in the MMM-Weatherdotcom configuration. Without a key, MMM-Weatherdotcom uses NOAA only, which covers the United States and its territories.

## Installation

Install [MMM-Weatherdotcom](https://github.com/bl8demast3r/MMM-Weatherdotcom) first, then:

```sh
cd ~/MagicMirror/modules
git clone https://github.com/bl8demast3r/MMM-WeatherdotcomChart.git
```

There are no dependencies to install. Chart.js is loaded from a CDN.

## Configuration

```js
{
    module: "MMM-Weatherdotcom",
    config: {
        apiKey: "<your Weather.com API key>",
        lat: "40.7128",
        lon: "-74.0060"
    }
},
{
    module: "MMM-WeatherdotcomChart",
    position: "top_right",
    config: {
        dataNum: 12,
        dataType: "hourly",
        height: "500px",
        width: "800px",
        units: "metric",
        showRain: true,
        showSnow: true,
        showIcon: true
    }
},
```

The location, the API key and how often the weather is updated are set in [MMM-Weatherdotcom](https://github.com/bl8demast3r/MMM-Weatherdotcom#configuration). You can add several MMM-WeatherdotcomChart modules (for example an hourly and a daily chart) and they all use the same data.

### Configuration options

| Option | Default | Description |
|:-------|:--------|:------------|
| units | `standard` | Units of temperature. `standard` (Kelvin), `metric` (Celsius) and `imperial` (Fahrenheit) are available. |
| chartjsVersion | `3.9.1` | Version of [Chart.js](https://www.chartjs.org/) |
| chartjsDatalabelsVersion | `2.2.0` | Version of Chart.js [Datalabels plugin](https://github.com/chartjs/chartjs-plugin-datalabels) |
| height | `300px` | Height of the chart area in px |
| width | `500px` | Width of the chart area in px |
| fontSize | `16` | Font size of characters in the chart |
| fontWeight | `normal` | Font weight of characters in the chart. See https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight for available values. |
| timeOffsetHours | `0` | Offset in hours. This is used when your timezone is different from the timezone set in MagicMirror server. |
| title | `Weather Forecast` | Title of the chart to display |
| dataType | `hourly` | Data type to display. `hourly` or `daily` is available. |
| dataNum | `24` | Number of data points to display. When this is larger than the number of data points from the weather source (see [Weather sources](#weather-sources)), all available data is displayed. |
| nightBorderDash | `[5, 1]` | Style of dash line for nighttime (`[<line length>, <blank length>]`). This option is available only for `hourly` data type. |
| showIcon | `false` | Show weather icons on the top |
| iconset | `1c` | Icon set to use, from the sets bundled with MMM-Weatherdotcom: `1c`–`5c` (color), `1m`–`5m` (monochrome), `6fa` or `6oa`. See the [icon set previews](https://github.com/bl8demast3r/MMM-Weatherdotcom#icon-sets). |
| iconSize | `50` | Size of the weather icons in px |
| showRain | `false` | Show precipitation volume on the bottom. This is the total liquid precipitation, so it includes the water equivalent of snow. |
| showZeroRain | `true` | Show rain chart even when there is no rain volume. This option is effective only when `showRain` is true. |
| rainUnit | `mm` | Unit of rain volume (`mm` or `inch`) |
| rainMinHeight | `0.01` | Minimum height (in mm or inch) of the rain volume chart. When the max rain volume in the chart is less than this value, the height of chart is set as this value. Otherwise, the height of the chart is set according to the max rain volume. |
| showSnow | `false` | Show snowfall amount (depth of snow) line in the rain volume chart. If you enable both showRain and showSnow, datalabels for snow volume are not shown because they can overlap with the rain volume datalabels. |
| showZeroSnow | `true` | Show snow chart even when there is no snow volume. This option is effective only when `showSnow` is true. |
| color | `rgba(255, 255, 255, 1)` | Color of line and letters |
| colorMin | `rgba(255, 255, 255, 1)` | Color of the minimum temperature line e.g. yellow |
| colorMax | `rgba(255, 255, 255, 1)` | Color of the maximum temperature line e.g. orange |
| colorRain | `rgba(255, 255, 255, 1)` | Color of the rain line e.g. blue |
| colorSnow | `rgba(255, 255, 255, 1)` | Color of the snow line |
| backgroundColor | `rgba(0, 0, 0, 0)` | Color of background |
| fillColor | `rgba(255, 255, 255, 0.1)` | Color for filling rain volume line |
| dailyLabel | `date` | Label of x-axis for the daily forecast chart. The available labels are `date` or `days_of_week` or `date+days_of_week` |
| hourFormat | `24h`, or `12h` when MagicMirror's global `timeFormat` is `12` | Hour label format for hourly forecast charts and the update and expiration times (`24h` or `12h`). If it's `24h`, the format is [0, 1, 2, ..., 22, 23]. If it's `12h`, the format is [12am, 1am, 2am, ..., 10pm, 11pm]. |
| curveTension | `0.4` | Tension of line chart in Chart.js. See https://www.chartjs.org/docs/latest/charts/line.html#line-styling for details. |
| datalabelsDisplay | `auto` | Visibility of data labels. See https://chartjs-plugin-datalabels.netlify.app/guide/positioning.html#visibility for details. |
| datalabelsOffset | `4` | Offset of data labels. See https://chartjs-plugin-datalabels.netlify.app/guide/positioning.html#alignment-and-offset for details. |
| datalabelsRoundDecimalPlace | `1` | Decimal place to which round for data labels on charts. When you set this option as `0`, the labels are rounded to integer. This option is affected only on the labels (not affected on the data values). |
| showPressure | `false` | `true` or `false`. Toggles display of pressure values (Weather.com only). If units is `imperial`, it is displayed in inHg. |
| colorPressure | `rgba(255, 255, 255, 1)` | Color of the pressure line, if shown |
| pressureBorderDash | `[5, 1]` | Style of dash line for pressure (`[<line length>, <blank length>]`). |
| showUpdatedAt | `true` | Show when the weather source last updated the data, below the chart |
| showExpiresAt | `true` | Show when Weather.com says the data is due to be refreshed, below the chart (Weather.com only) |
| showSource | `true` | Show the weather source in use below the chart (see [Weather sources](#weather-sources)) |

## Weather sources

MMM-Weatherdotcom fetches forecasts from Weather.com. If Weather.com fails (for example, because the API key stops working), it falls back to NOAA for that update and tries Weather.com again on the next one. Without an API key, NOAA is always used.

The footer under the chart shows:

- **Updated**: when the weather source updated the data, not when it was fetched. For Weather.com this is the time of its latest current conditions observation (Weather.com doesn't publish an issue time for forecasts); for NOAA it is the time of the latest station observation.
- **Expires**: when Weather.com says the data is due to be refreshed (the earliest `expirationTimeUtc` of the current conditions and forecasts), usually about 10 minutes after the observation. MMM-Weatherdotcom polls on its own interval, so this time may already have passed when it is shown. NOAA publishes no expiration time, so it isn't shown while NOAA is in use.
- **Source**: `Weather.com`, `NOAA (backup)` or `NOAA`. The source is highlighted when the NOAA backup is in use, and `(offline)` is added when every source failed and the last good data is shown.

| | Weather.com | NOAA |
|:-|:------------|:-----|
| API key | required, purchased from Weather.com | not needed |
| Coverage | worldwide | United States and its territories only |
| Hourly forecast | 15 days | about 6.5 days |
| Daily forecast | 15 days | about 7 days |
| Rain and snow amounts | 15 days | 3 to 7 days, depending on your local NWS forecast office. Beyond that, rain and snow are shown as gaps in the chart. |
| Pressure | yes | no (the pressure line is hidden while NOAA is in use) |
| Daily min/max temperature | the day's high and the following night's low, as shown on weather.com | the same as [MMM-NOAAForecast](https://github.com/bl8demast3r/MMM-NOAAForecast): the warmest/coldest of the day's hourly forecast and NOAA's official high/low, so the low is usually the one ending that morning |
| Daily rain and snow | 7am to 7am, as shown on weather.com | calendar day |

Rain is the total liquid precipitation for both sources, so it includes the water equivalent of snow.

## Weather icons

Weather icons come from the icon sets bundled with [MMM-Weatherdotcom](https://github.com/bl8demast3r/MMM-Weatherdotcom#icon-sets); choose one with `iconset`. Weather.com and NOAA conditions are both mapped to the same icons. The icons were created by Adam Whitcroft (Climacons), Svilen Petrov, Thom (designed for DuckDuckGo), unknown artists from Graphberry (sets 4 and 5) and Bas Milius (Meteocons, sets 6fa and 6oa). See the [MMM-Weatherdotcom attributions](https://github.com/bl8demast3r/MMM-Weatherdotcom#attributions) for details.

## Tests

```sh
npm install
npm test
```

## Attributions

Forked from [MMM-WeatherChart](https://github.com/mtatsuma/MMM-WeatherChart) by Tatsuma Matsuki (MIT License), which borrows code from [MagicMirror-Module-Template](https://github.com/roramirez/MagicMirror-Module-Template) and [MMM-OpenmapWeather](https://github.com/sathyarajv/MMM-OpenmapWeather).

Charts are drawn with [Chart.js](https://www.chartjs.org/) and [chartjs-plugin-datalabels](https://github.com/chartjs/chartjs-plugin-datalabels).

**Data from [Weather.com](https://weather.com/)** and **[NOAA](https://www.weather.gov/documentation/services-web-api)**, via MMM-Weatherdotcom.
