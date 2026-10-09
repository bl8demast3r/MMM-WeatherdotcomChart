/* MagicMirror²
 * Module: MMM-WeatherdotcomChart
 *
 * Fork of MMM-WeatherChart (https://github.com/mtatsuma/MMM-WeatherChart)
 * by Tatsuma Matsuki, MIT Licensed.
 *
 * Draws the weather data shared by the MMM-Weatherdotcom module (Weather.com,
 * with NOAA as a backup) instead of polling the weather sources itself.
 *
 * Some code is borrowed from
 * https://github.com/roramirez/MagicMirror-Module-Template
 * https://github.com/sathyarajv/MMM-OpenmapWeather
 */

Module.register("MMM-WeatherdotcomChart", {
    defaults: {
        units: "standard",
        chartjsVersion: "3.9.1",
        chartjsDatalabelsVersion: "2.2.0",
        height: "300px",
        width: "500px",
        fontSize: 16,
        fontWeight: "normal",
        dataNum: 24,
        timeOffsetHours: 0,
        title: "Weather Forecast",
        iconset: "1c",
        iconSize: 50,
        dataType: "hourly",
        nightBorderDash: [5, 1],
        pressureBorderDash: [5, 1],
        showIcon: false,
        showPressure: false,
        showRain: false,
        showZeroRain: true,
        rainUnit: "mm",
        rainMinHeight: 0.01,
        showSnow: false,
        showZeroSnow: true,
        color: "rgba(255, 255, 255, 1)",
        colorMin: "rgba(255, 255, 255, 1)",
        colorMax: "rgba(255, 255, 255, 1)",
        colorRain: "rgba(255, 255, 255, 1)",
        colorSnow: "rgba(255, 255, 255, 1)",
        colorPressure: "rgba(255, 255, 255, 1)",
        backgroundColor: "rgba(0, 0, 0, 0)",
        fillColor: "rgba(255, 255, 255, 0.1)",
        dailyLabel: "date",
        // Follows MagicMirror's global timeFormat (12 or 24)
        hourFormat: config.timeFormat === 12 ? "12h" : "24h",
        curveTension: 0.4,
        datalabelsDisplay: "auto",
        datalabelsOffset: 4,
        datalabelsRoundDecimalPlace: 1,
        showUpdatedAt: true,
        showExpiresAt: true,
        showSource: true,
    },

    requiresVersion: "2.15.0",

    start: function () {
        //Flag for check if module is loaded
        this.loaded = false;
        this.iconImages = {};
    },

    notificationReceived: function (notification, payload) {
        if (notification === "ALL_MODULES_STARTED") {
            // Ask MMM-Weatherdotcom for data it received before this module started
            this.sendNotification("WEATHERDOTCOM_REQUEST");
        } else if (notification === "WEATHERDOTCOM_DATA") {
            this.receiveWeather(payload);
        }
    },

    // Convert the shared weather data from either source into the records
    // used to draw the charts
    receiveWeather: function (payload) {
        if (!payload || !payload.source) {
            Log.warn(
                this.name +
                    ": no weather data from MMM-Weatherdotcom" +
                    (payload && payload.error ? ": " + payload.error : "")
            );
            return;
        }
        let data;
        try {
            if (payload.source === "weathercom") {
                const wc = payload.weathercom;
                data = this.convertWeatherComData(
                    wc.daily,
                    wc.hourly,
                    wc.units
                );
            } else {
                const noaa = payload.noaa;
                data = this.convertNOAAData(
                    noaa.forecast,
                    noaa.forecastHourly,
                    noaa.forecastGridData
                );
            }
        } catch (err) {
            Log.error(
                this.name + ": failed to read weather data: " + err.message
            );
            return;
        }
        this.processData(data, payload);
    },

    // Expand a NOAA gridpoint layer, whose values are valid for ISO 8601
    // intervals (e.g. "2026-10-07T12:00:00+00:00/PT6H"), into a Map of
    // hour start time (ms) -> value. When accumulated is true, the value is an
    // amount over the whole interval and is spread evenly across its hours.
    expandGridLayer: function (layer, accumulated) {
        const values = new Map();
        if (!layer || !Array.isArray(layer.values)) return values;
        for (const entry of layer.values) {
            if (entry.value === null) continue;
            const [start, duration] = entry.validTime.split("/");
            const startTime = Date.parse(start);
            const hours = Math.max(
                1,
                Math.round(moment.duration(duration).asHours())
            );
            for (let h = 0; h < hours; h++) {
                values.set(
                    startTime + h * 60 * 60 * 1000,
                    accumulated ? entry.value / hours : entry.value
                );
            }
        }
        return values;
    },

    getLayerEndTime: function (values) {
        let end = -Infinity;
        for (const time of values.keys()) {
            end = Math.max(end, time + 60 * 60 * 1000);
        }
        return end;
    },

    // Convert temperature from Celsius to the configured units
    convertTemperature: function (celsius) {
        if (this.config.units == "imperial") {
            return (celsius * 9) / 5 + 32;
        } else if (this.config.units == "metric") {
            return celsius;
        }
        return celsius + 273.15;
    },

    // Convert NOAA forecast, hourly forecast and gridpoint data into
    // { hourly: [...], daily: [...] } records used to draw the charts.
    // Temperatures are in the configured units and rain/snow in mm.
    // Icons are the icon names that MMM-Weatherdotcom adds to each period.
    // Rain/snow are NaN where NOAA gives no amounts (usually beyond ~3 days).
    convertNOAAData: function (forecast, forecastHourly, grid) {
        const hourMs = 60 * 60 * 1000,
            offsetMs = this.config.timeOffsetHours * hourMs,
            hourlyPeriods = forecastHourly.properties.periods,
            dailyPeriods = forecast.properties.periods,
            gridLayers = grid ? grid.properties : {};

        // Temperatures (Celsius) by hour. Gridpoint values are preferred
        // because they are not rounded and also cover the earlier part of today.
        const getPeriodTemp = (period) =>
            period.temperatureUnit == "F"
                ? ((period.temperature - 32) * 5) / 9
                : period.temperature;
        const temps = new Map();
        for (const period of hourlyPeriods) {
            temps.set(Date.parse(period.startTime), getPeriodTemp(period));
        }
        for (const [time, temp] of this.expandGridLayer(
            gridLayers.temperature,
            false
        )) {
            temps.set(time, temp);
        }
        // quantitativePrecipitation is the liquid equivalent of all
        // precipitation; snowfallAmount is the depth of snow
        const rains = this.expandGridLayer(
                gridLayers.quantitativePrecipitation,
                true
            ),
            snows = this.expandGridLayer(gridLayers.snowfallAmount, true),
            rainEnd = this.getLayerEndTime(rains),
            snowEnd = this.getLayerEndTime(snows);

        const hourly = hourlyPeriods.map((period) => {
            const time = Date.parse(period.startTime);
            return {
                dt: time / 1000,
                temp: this.convertTemperature(temps.get(time)),
                rain: rains.has(time) ? rains.get(time) : NaN,
                snow: snows.has(time) ? snows.get(time) : NaN,
                icon: period.iconName,
                isDay: period.isDaytime,
            };
        });

        // Daily values are calculated the same way as MMM-NOAAForecast
        // (https://github.com/bl8demast3r/MMM-NOAAForecast): one day per
        // calendar date of the forecast periods, with the icon of its first
        // period ("Today", "Tonight" or the daytime forecast).
        // Dates are local time + timeOffsetHours, as displayed.
        const getDateKey = (time) =>
            moment(time + offsetMs).format("YYYY-MM-DD");
        const todayKey = getDateKey(Date.now());
        const days = new Map();
        for (const period of dailyPeriods) {
            const key = getDateKey(Date.parse(period.startTime));
            if (key < todayKey || days.has(key)) continue;
            const midnight = moment(key, "YYYY-MM-DD");
            days.set(key, {
                dt: (midnight.valueOf() + 12 * hourMs - offsetMs) / 1000,
                end: midnight.clone().add(1, "day").valueOf() - offsetMs,
                temps: [],
                rain: 0,
                snow: 0,
                icon: period.iconName,
                isDay: period.isDaytime,
            });
        }
        // The high/low is the warmest/coldest of the day's hourly forecast and
        // NOAA's official high/low. Official values are matched to a day by
        // the UTC date their period starts on, so the low is usually the
        // overnight low ending that morning.
        for (const period of hourlyPeriods) {
            const day = days.get(getDateKey(Date.parse(period.startTime)));
            if (day) day.temps.push(getPeriodTemp(period));
        }
        const findGridValue = (layer, key) => {
            const entry = ((layer && layer.values) || []).find(
                (v) => v.validTime.slice(0, 10) == key && v.value !== null
            );
            return entry ? entry.value : undefined;
        };
        for (const [time, rain] of rains) {
            const day = days.get(getDateKey(time));
            if (day) day.rain += rain;
        }
        for (const [time, snow] of snows) {
            const day = days.get(getDateKey(time));
            if (day) day.snow += snow;
        }

        const daily = [];
        for (const [key, day] of days) {
            const maxTemps = day.temps.slice(),
                minTemps = day.temps.slice();
            const gridMax = findGridValue(gridLayers.maxTemperature, key),
                gridMin = findGridValue(gridLayers.minTemperature, key);
            if (gridMax !== undefined) maxTemps.push(gridMax);
            if (gridMin !== undefined) minTemps.push(gridMin);
            daily.push({
                dt: day.dt,
                temp: {
                    min: minTemps.length
                        ? this.convertTemperature(Math.min(...minTemps))
                        : NaN,
                    max: maxTemps.length
                        ? this.convertTemperature(Math.max(...maxTemps))
                        : NaN,
                },
                // Amounts would be underestimated for days that NOAA only
                // partially covers, so treat them as unknown
                rain: day.end <= rainEnd ? day.rain : NaN,
                snow: day.end <= snowEnd ? day.snow : NaN,
                icon: day.icon,
                isDay: day.isDay,
            });
        }

        return { hourly: hourly, daily: daily };
    },

    // Convert Weather.com 15-day daily and hourly forecasts, which are
    // parallel arrays with one entry per day or hour, into the same records as
    // convertNOAAData (plus pressure in hPa). apiUnits is the units the API was
    // called with: "e" (English) or "m" (metric).
    convertWeatherComData: function (daily, hourly, apiUnits) {
        const offsetMs = this.config.timeOffsetHours * 60 * 60 * 1000,
            english = apiUnits == "e";
        const toNumber = (value) => (value === null ? NaN : value);
        // Values already in the configured units are kept as they are, so
        // whole degrees don't pick up rounding errors
        const toTemp = (temp) => {
            const t = toNumber(temp);
            if (english == (this.config.units == "imperial")) {
                return this.config.units == "standard" ? t + 273.15 : t;
            }
            return this.convertTemperature(english ? ((t - 32) * 5) / 9 : t);
        };
        // English amounts are in inches; metric rain is in mm and snow in cm
        const toMM = (amount, isSnow) =>
            toNumber(amount) * (english ? 25.4 : isSnow ? 10 : 1);
        const toHPa = (pressure) =>
            toNumber(pressure) * (english ? 33.8639 : 1);
        const getDayKey = (dt) => new Date(dt * 1000 + offsetMs).toDateString();

        const hourlyRecords = hourly.validTimeUtc.map((dt, i) => ({
            dt: dt,
            temp: toTemp(hourly.temperature[i]),
            rain: toMM(hourly.qpf[i], false),
            snow: toMM(hourly.qpfSnow[i], true),
            pressure: toHPa(hourly.pressureMeanSeaLevel[i]),
            icon: hourly.iconName[i],
            isDay: hourly.dayOrNight[i] == "D",
        }));

        // The daily forecast has no pressure, so average the hourly values
        const dayPressures = new Map();
        for (const record of hourlyRecords) {
            const key = getDayKey(record.dt);
            if (!dayPressures.has(key)) dayPressures.set(key, []);
            if (!isNaN(record.pressure)) {
                dayPressures.get(key).push(record.pressure);
            }
        }

        const now = new Date(Date.now() + offsetMs),
            todayStart = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate()
            ).getTime();
        // Day and night halves of each day, e.g. [null, "Tonight", "Tomorrow", ...]
        const daypart = daily.daypart[0];
        const dailyRecords = [];
        daily.validTimeUtc.forEach((dt, i) => {
            // Until 7am, Weather.com still lists yesterday as the first day
            if (dt * 1000 + offsetMs < todayStart) return;
            // The day's high is null once the daytime has passed
            const max = daily.temperatureMax[i] ?? daily.calendarDayTemperatureMax[i],
                min = daily.temperatureMin[i] ?? daily.calendarDayTemperatureMin[i];
            const part = daypart.iconCode[2 * i] !== null ? 2 * i : 2 * i + 1;
            const pressures = dayPressures.get(getDayKey(dt)) || [];
            dailyRecords.push({
                dt: dt,
                temp: { min: toTemp(min), max: toTemp(max) },
                rain: toMM(daily.qpf[i], false),
                snow: toMM(daily.qpfSnow[i], true),
                pressure: pressures.length
                    ? pressures.reduce((a, b) => a + b) / pressures.length
                    : NaN,
                icon: daypart.iconName[part],
                isDay: daypart.dayOrNight[part] == "D",
            });
        });

        return { hourly: hourlyRecords, daily: dailyRecords };
    },

    getDayString: function (dateTime) {
        return dateTime
            .toLocaleString(moment.locale(), { weekday: "short" })
            .substring(0, 2);
    },

    getHourString: function (hour) {
        if (this.config.hourFormat == "12h") {
            let ampm = hour < 12 ? "am" : "pm";
            let h = hour % 12;
            h = h ? h : 12;
            return `${h}${ampm}`;
        } else {
            return hour;
        }
    },

    formatRain: function (rain) {
        if (this.config.rainUnit == "inch") {
            return rain / 25.4;
        }
        return rain;
    },

    // Icons come from the icon sets bundled with MMM-Weatherdotcom. Each icon
    // is drawn onto a canvas used as the point style: Chart.js fails on
    // images that could not be loaded, while a canvas just stays blank.
    // The chart is redrawn once an icon has loaded.
    getIconImage: function (iconName) {
        const size = this.config.iconSize;
        const src = iconName
            ? this.iconPath + "/" + this.config.iconset + "/" + iconName + ".svg"
            : "";
        if (!this.iconImages[src]) {
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            this.iconImages[src] = canvas;
            if (src) {
                const image = new Image();
                image.onload = () => {
                    canvas.getContext("2d").drawImage(image, 0, 0, size, size);
                    if (this.chart && this.chart.ctx) this.chart.draw();
                };
                image.onerror = () =>
                    Log.warn(this.name + ": failed to load icon " + src);
                image.src = src;
            }
        }
        return this.iconImages[src];
    },

    getPressureValue(hPa) {
        if (this.config.units == "imperial") {
            return hPa * 0.029529983071445; // return value as inHg
        } else {
            return hPa;
        }
    },

    // Get min value from arrays including NaN value
    getMin: function (array) {
        let min;
        for (let i = 0, l = array.length; i < l; i++) {
            let n = array[i];
            if (!isNaN(n)) {
                if (min !== undefined) {
                    min = Math.min(min, n);
                } else {
                    min = n;
                }
            }
        }
        return min;
    },

    // Get max value from arrays including NaN value
    getMax: function (array) {
        let max;
        for (let i = 0, l = array.length; i < l; i++) {
            let n = array[i];
            if (!isNaN(n)) {
                if (max !== undefined) {
                    max = Math.max(max, n);
                } else {
                    max = n;
                }
            }
        }
        return max;
    },

    // Calculate MarginFactors from the simultanious equations
    //
    // x = iconSize/2 * ((1 + x + y + z)/h)
    // y = (dataLabelOffset + fontSize + iconSize) * ((1 + x + y + z)/h)
    // z = (dataLabelOffset * 2 + fontSize * a) * ((1 + x + y + z)/h)
    //
    // where
    // x is the margin on the top of Weather icons,
    // y is the margin on the below of Weather icons,
    // z is the margin between temperature and rain lines,
    // a is 2 when dataType is hourly and show rain or snow,
    // a is 2.5 when dataType is daily and show rain or snow,
    // a is 1 when rain or snow is not shown.
    getTempRainMarginFactor: function (
        showRain = true,
        iconSize = this.config.iconSize
    ) {
        // Calculate z
        const h = parseInt(this.config.height);
        let c1 = iconSize / 2.0;
        c1 = c1 / (h - iconSize);
        let c2 = this.config.datalabelsOffset + this.config.fontSize + iconSize;
        c2 = c1 + c2;
        c2 = c2 / (h - c2);
        let c3;
        let a;
        if (showRain) {
            if (this.config.dataType == "hourly") {
                a = 2;
            } else {
                a = 2.5;
            }
        } else {
            a = 1;
        }
        c3 = this.config.datalabelsOffset * 2 + this.config.fontSize * a;
        let z = (c3 * (1 + c1 + c2 * c1 + c2)) / (h - (c2 + c2 * c3 + c3 + 1));
        if (z < 0) z = 0;
        if (showRain) z = z * 2;
        return z;
    },

    getIconBelowMarginFactor: function (
        z = this.getTempRainMarginFactor(),
        showRain = true,
        iconSize = this.config.iconSize
    ) {
        // Calculate y
        const h = parseInt(this.config.height);
        let c1 = iconSize / 2.0;
        c1 = c1 / (h - iconSize);
        let c2 = this.config.datalabelsOffset + this.config.fontSize + iconSize;
        c2 = c1 + c2;
        c2 = c2 / (h - c2);
        let y = c2 * (1 + z / 2.0);
        if (y < 0) y = 0;
        if (showRain) y = y * 2;
        return y;
    },

    getIconTopMarginFactor: function (
        y = this.getIconBelowMarginFactor(),
        z = this.getTempRainMarginFactor(),
        showRain = true,
        iconSize = this.config.iconSize
    ) {
        // Calculate x
        const h = parseInt(this.config.height);
        let c1 = iconSize / 2.0;
        c1 = c1 / (h - iconSize);
        let x = c1 * (1 + (y + z) / 2.0);
        if (x < 0) x = 0;
        if (showRain) x = x * 2;
        return x;
    },

    getHourlyDataset: function () {
        const self = this;
        const data = this.weatherdata.hourly;

        const temps = [],
            rains = [],
            snows = [],
            dayTemps = [],
            nightTemps = [],
            labels = [],
            iconNames = [],
            pressures = [];

        data.sort(function (a, b) {
            if (a.dt < b.dt) return -1;
            if (a.dt > b.dt) return 1;
            return 0;
        });
        let dayTime;
        for (let i = 0; i < Math.min(this.config.dataNum, data.length); i++) {
            // Only Weather.com provides pressure; it is undefined for NOAA
            pressures.push(this.getPressureValue(data[i].pressure));
            let dateTime = new Date(
                data[i].dt * 1000 + this.config.timeOffsetHours * 60 * 60 * 1000
            );
            let isDay = Boolean(data[i].isDay);
            let temp = data[i].temp;
            if (i === 0) {
                dayTime = isDay;
            }
            labels.push(this.getHourString(dateTime.getHours()));
            if (isDay) {
                dayTemps.push(temp);
                if (!dayTime) {
                    nightTemps.push(temp);
                } else {
                    nightTemps.push(NaN);
                }
                dayTime = true;
            }
            if (!isDay) {
                nightTemps.push(temp);
                if (dayTime) {
                    dayTemps.push(temp);
                } else {
                    dayTemps.push(NaN);
                }
                dayTime = false;
            }
            temps.push(temp);
            rains.push(this.formatRain(data[i].rain));
            snows.push(this.formatRain(data[i].snow));
            iconNames.push(data[i].icon);
        }

        const minTemp = this.getMin(temps),
            maxTemp = this.getMax(temps),
            maxRain = this.getMax(rains) || 0,
            maxSnow = this.getMax(snows) || 0,
            maxPressure = this.getMax(pressures),
            minPressure = this.getMin(pressures),
            iconLine = [],
            icons = [];

        let showRainSnow = false;
        if (this.config.showRain || this.config.showSnow) {
            if (
                this.config.showZeroRain ||
                maxRain > 0 ||
                this.config.showZeroSnow ||
                maxSnow > 0
            ) {
                showRainSnow = true;
            }
        }
        const tempRainMargin = this.getTempRainMarginFactor(showRainSnow);
        const iconBelowMargin = this.getIconBelowMarginFactor(
            tempRainMargin,
            showRainSnow
        );
        const iconTopMargin = this.getIconTopMarginFactor(
            iconBelowMargin,
            tempRainMargin,
            showRainSnow
        );

        // Create dummy line for icons
        for (let i = 0; i < temps.length; i++) {
            let v = maxTemp + (maxTemp - minTemp) * iconBelowMargin;
            iconLine.push(v);
            icons.push(this.getIconImage(iconNames[i]));
        }

        const datasets = [];
        datasets.push({
            label: "Day Temparature",
            borderColor: this.config.color,
            pointBackgroundColor: this.config.color,
            datalabels: {
                color: this.config.color,
                align: "top",
                offset: this.config.datalabelsOffset,
                font: {
                    weight: this.config.fontWeight,
                },
                display: this.config.datalabelsDisplay,
                formatter: function (value) {
                    let place = 10 ** self.config.datalabelsRoundDecimalPlace;
                    let label = Math.round(value * place) / place;
                    return label;
                },
            },
            data: dayTemps,
            yAxisID: "y1",
        });
        datasets.push({
            label: "Night Temparature",
            borderColor: this.config.color,
            pointBackgroundColor: this.config.color,
            borderDash: this.config.nightBorderDash,
            datalabels: {
                color: this.config.color,
                align: "top",
                offset: this.config.datalabelsOffset,
                font: {
                    weight: this.config.fontWeight,
                },
                display: this.config.datalabelsDisplay,
                formatter: function (value) {
                    let place = 10 ** self.config.datalabelsRoundDecimalPlace;
                    let label = Math.round(value * place) / place;
                    return label;
                },
            },
            data: nightTemps,
            yAxisID: "y1",
        });
        if (this.config.showPressure && maxPressure !== undefined) {
            datasets.push({
                label: "Pressure",
                borderColor: this.config.colorPressure,
                pointBackgroundColor: this.config.colorPressure,
                borderDash: this.config.pressureBorderDash,
                datalabels: {
                    color: this.config.color,
                    align: "top",
                    offset: this.config.datalabelsOffset,
                    font: {
                        weight: this.config.fontWeight,
                    },
                    display: this.config.datalabelsDisplay,
                    formatter: function (value) {
                        let place =
                            10 ** self.config.datalabelsRoundDecimalPlace;
                        let label = Math.round(value * place) / place;
                        return label;
                    },
                },
                data: pressures,
                yAxisID: "y3",
            });
        }
        if (this.config.showIcon) {
            datasets.push({
                label: "Icons",
                borderWidth: 0,
                data: iconLine,
                pointStyle: icons,
                datalabels: {
                    display: false,
                },
                yAxisID: "y1",
            });
        }
        if (this.config.showRain) {
            if (this.config.showZeroRain || maxRain > 0) {
                datasets.push({
                    label: "Rain Volume",
                    backgroundColor: this.config.fillColor,
                    borderColor: this.config.color,
                    borderWidth: 1,
                    pointBackgroundColor: this.config.color,
                    datalabels: {
                        color: this.config.color,
                        align: "top",
                        offset: this.config.datalabelsOffset,
                        font: {
                            weight: this.config.fontWeight,
                        },
                        display: this.config.datalabelsDisplay,
                        formatter: function (value) {
                            let place =
                                10 ** self.config.datalabelsRoundDecimalPlace;
                            let label = Math.round(value * place) / place;
                            return self.config.showZeroRain || value > 0
                                ? label
                                : "";
                        },
                    },
                    data: rains,
                    fill: true,
                    yAxisID: "y2",
                });
            }
        }
        if (this.config.showSnow) {
            if (this.config.showZeroSnow || maxSnow > 0) {
                datasets.push({
                    label: "Snow Volume",
                    backgroundColor: this.config.fillColor,
                    borderColor: this.config.color,
                    borderWidth: 1,
                    pointBackgroundColor: this.config.color,
                    datalabels: {
                        color: this.config.color,
                        display: this.config.showRain ? false : true,
                        align: "top",
                        offset: this.config.datalabelsOffset,
                        font: {
                            weight: this.config.fontWeight,
                        },
                        display: this.config.datalabelsDisplay,
                        formatter: function (value) {
                            let place =
                                10 ** self.config.datalabelsRoundDecimalPlace;
                            let label = Math.round(value * place) / place;
                            return self.config.showZeroSnow || value > 0
                                ? label
                                : "";
                        },
                    },
                    data: snows,
                    fill: true,
                    pointStyle: "star",
                    pointRadius: function (context) {
                        let value = context.dataset.data[context.dataIndex];
                        return value == 0 ? 3 : 6;
                    },
                    yAxisID: "y2",
                });
            }
        }

        // Set Y-Axis range not to overlap each other
        let y1_max = iconLine[0] + (maxTemp - minTemp) * iconTopMargin,
            y1_min = minTemp - (maxTemp - minTemp) * tempRainMargin,
            y2_max =
                Math.max(maxRain, maxSnow, this.config.rainMinHeight) *
                (2 + iconTopMargin + iconBelowMargin + tempRainMargin),
            y2_min = 0;

        if (showRainSnow) y1_min = y1_min - (maxTemp - minTemp);
        const ranges = {
            y1: {
                min: y1_min,
                max: y1_max,
            },
            y2: {
                min: y2_min,
                max: y2_max,
            },
        };
        if (maxPressure !== undefined) {
            ranges.y3 = {
                min: minPressure - (maxPressure - minPressure) * 0.1,
                max:
                    maxPressure +
                    (maxPressure - minPressure) *
                        ((iconTopMargin + iconBelowMargin) / 2),
            };
        }

        return { labels: labels, datasets: datasets, ranges: ranges };
    },

    getDailyDataset: function () {
        const self = this;
        const data = this.weatherdata.daily;

        const maxTemps = [],
            minTemps = [],
            rains = [],
            snows = [],
            labels = [],
            iconNames = [],
            pressures = [];

        data.sort(function (a, b) {
            if (a.dt < b.dt) return -1;
            if (a.dt > b.dt) return 1;
            return 0;
        });
        for (let i = 0; i < Math.min(this.config.dataNum, data.length); i++) {
            // Only Weather.com provides pressure; it is undefined for NOAA
            pressures.push(this.getPressureValue(data[i].pressure));
            const dateTime = new Date(
                data[i].dt * 1000 + this.config.timeOffsetHours * 60 * 60 * 1000
            );
            if (this.config.dailyLabel == "date") {
                labels.push(dateTime.getDate());
            } else if (this.config.dailyLabel == "days_of_week") {
                labels.push(this.getDayString(dateTime));
            } else if (this.config.dailyLabel == "date+days_of_week") {
                labels.push(
                    this.getDayString(dateTime) + " " + dateTime.getDate()
                );
            }
            maxTemps.push(data[i].temp.max);
            minTemps.push(data[i].temp.min);
            rains.push(this.formatRain(data[i].rain));
            snows.push(this.formatRain(data[i].snow));
            iconNames.push(data[i].icon);
        }

        const minValue = this.getMin(minTemps),
            maxValue = this.getMax(maxTemps),
            maxRain = this.getMax(rains) || 0,
            maxSnow = this.getMax(snows) || 0,
            maxPressure = this.getMax(pressures),
            minPressure = this.getMin(pressures),
            iconLine = [],
            icons = [];

        let showRainSnow = false;
        if (this.config.showRain || this.config.showSnow) {
            if (
                this.config.showZeroRain ||
                maxRain > 0 ||
                this.config.showZeroSnow ||
                maxSnow > 0
            ) {
                showRainSnow = true;
            }
        }
        const tempRainMargin = this.getTempRainMarginFactor(showRainSnow);
        const iconBelowMargin = this.getIconBelowMarginFactor(
            tempRainMargin,
            showRainSnow
        );
        const iconTopMargin = this.getIconTopMarginFactor(
            iconBelowMargin,
            tempRainMargin,
            showRainSnow
        );

        // Create dummy line for icons
        for (let i = 0; i < minTemps.length; i++) {
            let v = maxValue + (maxValue - minValue) * iconBelowMargin;
            iconLine.push(v);
            icons.push(this.getIconImage(iconNames[i]));
        }

        const datasets = [];
        datasets.push({
            label: "Minimum Temperature",
            borderColor: this.config.colorMin,
            pointBackgroundColor: this.config.colorMin,
            datalabels: {
                color: this.config.color,
                align: "bottom",
                offset: this.config.datalabelsOffset,
                font: {
                    weight: this.config.fontWeight,
                },
                display: this.config.datalabelsDisplay,
                formatter: function (value) {
                    let place = 10 ** self.config.datalabelsRoundDecimalPlace;
                    let label = Math.round(value * place) / place;
                    return label;
                },
            },
            data: minTemps,
            yAxisID: "y1",
        });
        datasets.push({
            label: "Maximum Temperature",
            borderColor: this.config.colorMax,
            pointBackgroundColor: this.config.colorMax,
            datalabels: {
                color: this.config.color,
                align: "top",
                offset: this.config.datalabelsOffset,
                font: {
                    weight: this.config.fontWeight,
                },
                display: this.config.datalabelsDisplay,
                formatter: function (value) {
                    let place = 10 ** self.config.datalabelsRoundDecimalPlace;
                    let label = Math.round(value * place) / place;
                    return label;
                },
            },
            data: maxTemps,
            yAxisID: "y1",
        });
        if (this.config.showPressure && maxPressure !== undefined) {
            datasets.push({
                label: "Pressure",
                borderColor: this.config.colorPressure,
                pointBackgroundColor: this.config.colorPressure,
                borderDash: this.config.pressureBorderDash,
                datalabels: {
                    color: this.config.colorPressure,
                    align: "top",
                    offset: this.config.datalabelsOffset,
                    font: {
                        weight: this.config.fontWeight,
                    },
                    display: this.config.datalabelsDisplay,
                    formatter: function (value) {
                        let place =
                            10 ** self.config.datalabelsRoundDecimalPlace;
                        let label = Math.round(value * place) / place;
                        return label;
                    },
                },
                data: pressures,
                yAxisID: "y3",
            });
        }
        if (this.config.showIcon) {
            datasets.push({
                label: "Icons",
                borderWidth: 0,
                data: iconLine,
                pointStyle: icons,
                datalabels: {
                    display: false,
                },
                yAxisID: "y1",
            });
        }
        if (this.config.showRain) {
            if (this.config.showZeroRain || maxRain > 0) {
                datasets.push({
                    label: "Rain Volume",
                    backgroundColor: this.config.fillColor,
                    borderColor: this.config.colorRain,
                    borderWidth: 1,
                    pointBackgroundColor: this.config.colorRain,
                    datalabels: {
                        color: this.config.color,
                        align: "top",
                        offset: this.config.datalabelsOffset,
                        font: {
                            weight: this.config.fontWeight,
                        },
                        display: this.config.datalabelsDisplay,
                        formatter: function (value) {
                            let place =
                                10 ** self.config.datalabelsRoundDecimalPlace;
                            let label = Math.round(value * place) / place;
                            return self.config.showZeroRain || value > 0
                                ? label
                                : "";
                        },
                    },
                    data: rains,
                    fill: true,
                    yAxisID: "y2",
                });
            }
        }
        if (this.config.showSnow) {
            if (this.config.showZeroSnow || maxSnow > 0) {
                datasets.push({
                    label: "Snow Volume",
                    backgroundColor: this.config.fillColor,
                    borderColor: this.config.colorSnow,
                    borderWidth: 1,
                    pointBackgroundColor: this.config.colorSnow,
                    datalabels: {
                        color: this.config.color,
                        display: this.config.showRain ? false : true,
                        align: "top",
                        offset: this.config.datalabelsOffset,
                        font: {
                            weight: this.config.fontWeight,
                        },
                        display: this.config.datalabelsDisplay,
                        formatter: function (value) {
                            let place =
                                10 ** self.config.datalabelsRoundDecimalPlace;
                            let label = Math.round(value * place) / place;
                            return self.config.showZeroSnow || value > 0
                                ? label
                                : "";
                        },
                    },
                    data: snows,
                    fill: true,
                    pointStyle: "star",
                    pointRadius: function (context) {
                        let value = context.dataset.data[context.dataIndex];
                        return value == 0 ? 3 : 6;
                    },
                    yAxisID: "y2",
                });
            }
        }

        // Set Y-Axis range not to overlap each other
        let y1_max = iconLine[0] + (maxValue - minValue) * iconTopMargin,
            y1_min = minValue - (maxValue - minValue) * tempRainMargin,
            y2_max =
                Math.max(maxRain, maxSnow, this.config.rainMinHeight) *
                (2 + (iconTopMargin + iconBelowMargin + tempRainMargin) * 2),
            y2_min = 0;

        if (showRainSnow) y1_min = y1_min - (maxValue - minValue);
        const ranges = {
            y1: {
                min: y1_min,
                max: y1_max,
            },
            y2: {
                min: y2_min,
                max: y2_max,
            },
        };
        if (maxPressure !== undefined) {
            ranges.y3 = {
                min: minPressure - (maxPressure - minPressure) * 0.1,
                max:
                    maxPressure +
                    (maxPressure - minPressure) *
                        ((iconTopMargin + iconBelowMargin) / 2),
            };
        }

        return { labels: labels, datasets: datasets, ranges: ranges };
    },

    getDom: function () {
        var self = this;

        const wrapper = document.createElement("div");
        // Chart.js sizes the chart to its container, so the footer goes outside it
        const chartContainer = document.createElement("div");
        chartContainer.setAttribute(
            "style",
            "position: relative; height: " +
                this.config.height +
                "; width: " +
                this.config.width +
                ";"
        );
        wrapper.appendChild(chartContainer);
        if (this.weatherdata) {
            const wrapperCanvas = document.createElement("canvas"),
                ctx = wrapperCanvas.getContext("2d");

            let dataset;
            if (this.config.dataType === "hourly") {
                dataset = this.getHourlyDataset();
            } else if (this.config.dataType == "daily") {
                dataset = this.getDailyDataset();
            }

            Chart.defaults.font.size = this.config.fontSize;
            Chart.defaults.font.weight = this.config.fontWeight;
            Chart.defaults.color = this.config.color;
            Chart.register(ChartDataLabels);

            // Plugin for background color config
            // Refer:
            // https://www.chartjs.org/docs/latest/configuration/canvas-background.html#color
            const plugin = {
                id: "custom_canvas_background_color",
                beforeDraw: (chart) => {
                    const ctx = chart.canvas.getContext("2d");
                    ctx.save();
                    ctx.globalCompositeOperation = "destination-over";
                    ctx.fillStyle = this.config.backgroundColor;
                    ctx.fillRect(0, 0, chart.width, chart.height);
                    ctx.restore();
                },
            };

            if (this.chart) {
                this.chart.destroy();
            }
            this.chart = new Chart(ctx, {
                type: "line",
                data: {
                    labels: dataset.labels,
                    datasets: dataset.datasets,
                },
                plugins: [plugin],
                options: {
                    maintainAspectRatio: false,
                    tension: this.config.curveTension,
                    title: {
                        display: true,
                        text: this.config.title,
                    },
                    plugins: {
                        legend: {
                            display: false,
                        },
                    },
                    scales: {
                        x: {
                            grid: {
                                display: false,
                                borderWidth: 0,
                            },
                            clip: false,
                            offset: true,
                        },
                        y1: {
                            display: false,
                            min: dataset.ranges.y1.min,
                            max: dataset.ranges.y1.max,
                        },
                        y2: {
                            display: false,
                            min: dataset.ranges.y2.min,
                            max: dataset.ranges.y2.max,
                        },
                        y3: {
                            display: false,
                            ...dataset.ranges.y3,
                        },
                    },
                    animation: { duration: 500 },
                },
            });
            this.chart.update();
            chartContainer.appendChild(wrapperCanvas);
        }

        const footerItems = [];
        const status = this.status;
        if (status && status.updatedAt && this.config.showUpdatedAt) {
            // When the source last updated the data, not when it was fetched
            footerItems.push(
                this.createFooterItem(
                    "Updated " + this.formatUpdatedAt(status.updatedAt),
                    "updated-at"
                )
            );
        }
        if (status && status.expiresAt && this.config.showExpiresAt) {
            // When Weather.com says the data is due to be refreshed
            footerItems.push(
                this.createFooterItem(
                    "Expires " + this.formatUpdatedAt(status.expiresAt),
                    "expires-at"
                )
            );
        }
        if (status && this.config.showSource) {
            let source = "Source: " + status.sourceLabel;
            if (status.stale) source += " (offline)";
            footerItems.push(
                this.createFooterItem(
                    source,
                    "source" +
                        (status.isFallback || status.stale
                            ? " source-fallback"
                            : "")
                )
            );
        }
        if (footerItems.length > 0) {
            const footer = document.createElement("div");
            footer.className = "footer xsmall dimmed";
            footerItems.forEach((item, i) => {
                if (i > 0) footer.appendChild(document.createTextNode(" · "));
                footer.appendChild(item);
            });
            if (status.error) footer.title = status.error;
            wrapper.appendChild(footer);
        }
        return wrapper;
    },

    createFooterItem: function (text, className) {
        const item = document.createElement("span");
        item.className = className;
        item.innerText = text;
        return item;
    },

    formatUpdatedAt: function (date) {
        const time = moment(date);
        let format = this.config.hourFormat == "12h" ? "h:mm a" : "HH:mm";
        // Show the date too when data is stale from a previous day
        if (!time.isSame(moment(), "day")) {
            format = "MMM D " + format;
        }
        return time.format(format);
    },

    getScripts: function () {
        // Load chart.js from CDN
        let chartjsFileName = "chart.min.js";
        if (Number(this.config.chartjsVersion.split(".")[0]) < 3) {
            chartjsFileName = "Chart.min.js";
        }
        return [
            "https://cdn.jsdelivr.net/npm/chart.js@" +
                this.config.chartjsVersion +
                "/dist/" +
                chartjsFileName,
            "https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@" +
                this.config.chartjsDatalabelsVersion +
                "/dist/chartjs-plugin-datalabels.min.js",
        ];
    },

    getStyles: function () {
        return ["MMM-WeatherdotcomChart.css"];
    },

    getTranslations: function () {
        return false;
    },

    processData: function (data, payload) {
        this.weatherdata = data;
        this.iconPath = payload.iconPath;
        this.status = {
            sourceLabel: payload.sourceLabel,
            isFallback: payload.isFallback,
            stale: payload.stale,
            error: payload.error,
            updatedAt: payload.updatedAt,
            expiresAt: payload.expiresAt || null,
        };
        this.loaded = true;
        this.updateDom();
    },
});
