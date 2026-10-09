/* Tests for MMM-WeatherdotcomChart. Run with `npm test` (node --test).
 *
 * The fixtures are real WEATHERDOTCOM_DATA payloads for Central Park, New York
 * City: one from Weather.com and one from the NOAA backup (taken with an
 * invalid Weather.com API key). The clock is set to when they were fetched,
 * and expected values are read from the fixtures where possible, so the
 * fixtures can be captured again with MMM-Weatherdotcom.
 */

process.env.TZ = "America/New_York";

const test = require("node:test");
const assert = require("node:assert/strict");
const moment = require("moment");

// Browser and MagicMirror globals used by the module
const loadedImages = [];
global.moment = moment;
global.config = { timeFormat: 24 };
global.Log = { info() {}, log() {}, warn() {}, error() {} };
global.Image = class {
    set src(value) {
        this._src = value;
        loadedImages.push(value);
    }
    get src() {
        return this._src;
    }
};
global.document = {
    createElement: () => ({ getContext: () => ({ drawImage() {} }) })
};
let definition;
global.Module = { register: (name, def) => (definition = def) };
require("../MMM-WeatherdotcomChart.js");

const weathercomPayload = require("./fixtures/weathercom_payload.json");
const noaaPayload = require("./fixtures/noaa_payload.json");
const ICON_PATH = "/modules/MMM-Weatherdotcom/icons";
const clone = (o) => JSON.parse(JSON.stringify(o));
const wc = weathercomPayload.weathercom;

// When the Weather.com fixture was fetched
const NOW = weathercomPayload.fetchedAt;

function createModule(config) {
    const module = Object.create(definition);
    module.name = "MMM-WeatherdotcomChart";
    module.config = Object.assign({}, definition.defaults, config);
    module.updateDom = () => {};
    module.sentNotifications = [];
    module.sendNotification = (n) => module.sentNotifications.push(n);
    module.start();
    return module;
}

function receive(module, payload) {
    module.notificationReceived(
        "WEATHERDOTCOM_DATA",
        Object.assign(clone(payload), { iconPath: ICON_PATH })
    );
}

test.beforeEach((t) => {
    t.mock.timers.enable({ apis: ["Date"], now: NOW });
});

test("asks MMM-Weatherdotcom for data once all modules have started", () => {
    const module = createModule();
    module.notificationReceived("ALL_MODULES_STARTED");
    assert.deepEqual(module.sentNotifications, ["WEATHERDOTCOM_REQUEST"]);
});

test("converts Weather.com hourly data", () => {
    const module = createModule({ units: "imperial" });
    receive(module, weathercomPayload);
    const hourly = module.weatherdata.hourly;

    assert.equal(hourly.length, wc.hourly.validTimeUtc.length);
    assert.deepEqual(
        hourly.slice(0, 4).map((h) => [h.dt, h.temp, h.icon, h.isDay]),
        [0, 1, 2, 3].map((i) => [
            wc.hourly.validTimeUtc[i],
            wc.hourly.temperature[i],
            wc.hourly.iconName[i],
            wc.hourly.dayOrNight[i] == "D",
        ])
    );
    // inHg to hPa
    assert.ok(
        Math.abs(hourly[0].pressure - wc.hourly.pressureMeanSeaLevel[0] * 33.8639) < 1e-9
    );
});

test("converts Weather.com daily data", () => {
    const module = createModule({ units: "imperial" });
    receive(module, weathercomPayload);
    const daily = module.weatherdata.daily;

    // The daily forecast starts today
    const today = wc.daily.validTimeUtc.findIndex(
        (t) => moment.unix(t).isSame(moment(), "day")
    );
    assert.equal(daily[0].dt, wc.daily.validTimeUtc[today]);
    assert.equal(daily.length, wc.daily.validTimeUtc.length - today);

    // Once today's daytime has passed, its high is null: the calendar-day
    // high and the night's icon are used
    const dayPart = wc.daily.daypart[0];
    const max = wc.daily.temperatureMax[today] ?? wc.daily.calendarDayTemperatureMax[today];
    const min = wc.daily.temperatureMin[today] ?? wc.daily.calendarDayTemperatureMin[today];
    const icon = dayPart.iconName[2 * today] ?? dayPart.iconName[2 * today + 1];
    assert.deepEqual(daily[0].temp, { min: min, max: max });
    assert.equal(daily[0].icon, icon);

    // Rain in inches is converted to mm
    const rainy = wc.daily.qpf.findIndex((q, i) => i >= today && q > 0);
    assert.notEqual(rainy, -1);
    assert.ok(Math.abs(daily[rainy - today].rain - wc.daily.qpf[rainy] * 25.4) < 1e-9);
});

test("converts Weather.com English units to metric and Kelvin", () => {
    const metric = createModule({ units: "metric" });
    receive(metric, weathercomPayload);
    const fahrenheit = wc.hourly.temperature[0];
    const celsius = ((fahrenheit - 32) * 5) / 9;
    assert.ok(Math.abs(metric.weatherdata.hourly[0].temp - celsius) < 1e-9);

    const standard = createModule({ units: "standard" });
    receive(standard, weathercomPayload);
    assert.ok(
        Math.abs(standard.weatherdata.hourly[0].temp - (celsius + 273.15)) < 1e-9
    );
});

test("converts NOAA data", () => {
    const module = createModule({ units: "imperial" });
    receive(module, noaaPayload);
    const { hourly, daily } = module.weatherdata;

    assert.ok(hourly.length > 100);
    assert.equal(typeof hourly[0].temp, "number");
    assert.ok(!isNaN(hourly[0].temp));
    assert.equal(typeof hourly[0].isDay, "boolean");
    assert.ok(hourly.every((h) => typeof h.icon === "string"));
    assert.ok(daily.length >= 7);
    assert.ok(daily.every((d) => d.temp.max >= d.temp.min));
});

test("draws icons from the MMM-Weatherdotcom icon set", () => {
    const module = createModule({
        units: "imperial",
        showIcon: true,
        iconset: "4c",
        dataNum: 4,
    });
    const payload = clone(weathercomPayload);
    payload.weathercom.hourly.iconName.splice(
        0,
        4,
        "partly-cloudy-day",
        "partly-cloudy-day",
        "clear-night",
        "clear-night"
    );
    receive(module, payload);
    loadedImages.length = 0;
    const dataset = module.getHourlyDataset();

    const icons = dataset.datasets.find((d) => d.label == "Icons");
    assert.equal(icons.pointStyle.length, 4);
    assert.deepEqual(loadedImages, [
        ICON_PATH + "/4c/partly-cloudy-day.svg",
        ICON_PATH + "/4c/clear-night.svg",
    ]);
    // Same icon, same cached canvas
    assert.equal(icons.pointStyle[0], icons.pointStyle[1]);
});

test("splits the temperature line into day and night", () => {
    const module = createModule({ units: "imperial", dataNum: 5 });
    const payload = clone(weathercomPayload);
    payload.weathercom.hourly.dayOrNight.splice(0, 5, "D", "D", "D", "N", "N");
    payload.weathercom.hourly.temperature.splice(0, 5, 65, 63, 60, 55, 53);
    receive(module, payload);
    const dataset = module.getHourlyDataset();
    const day = dataset.datasets.find((d) => d.label == "Day Temparature");
    const night = dataset.datasets.find((d) => d.label == "Night Temparature");

    // Three daytime hours, then two night hours; the first night hour joins both lines
    assert.deepEqual(day.data, [65, 63, 60, 55, NaN]);
    assert.deepEqual(night.data, [NaN, NaN, NaN, 55, 53]);
});

test("keeps the source status and the update time published by the source", () => {
    const module = createModule();
    receive(module, weathercomPayload);
    assert.deepEqual(module.status, {
        sourceLabel: "Weather.com",
        isFallback: false,
        stale: false,
        error: null,
        updatedAt: weathercomPayload.updatedAt,
        expiresAt: weathercomPayload.expiresAt,
    });
    // The observation time, not the time the data was fetched
    assert.equal(module.status.updatedAt, wc.current.validTimeUtc * 1000);
    assert.notEqual(module.status.updatedAt, weathercomPayload.fetchedAt);
    assert.equal(
        module.formatUpdatedAt(module.status.updatedAt),
        moment(weathercomPayload.updatedAt).format("HH:mm")
    );
    assert.equal(
        module.formatUpdatedAt(module.status.expiresAt),
        moment(weathercomPayload.expiresAt).format("HH:mm")
    );

    receive(module, noaaPayload);
    assert.equal(module.status.sourceLabel, "NOAA (backup)");
    assert.equal(module.status.isFallback, true);
    assert.equal(
        module.formatUpdatedAt(module.status.updatedAt),
        moment(noaaPayload.updatedAt).format("HH:mm")
    );
    // NOAA publishes no expiration time
    assert.equal(module.status.expiresAt, null);
});

test("keeps the previous chart when the hub has no data to send", () => {
    const module = createModule();
    receive(module, weathercomPayload);
    const before = module.weatherdata;
    module.notificationReceived("WEATHERDOTCOM_DATA", {
        source: null,
        sourceLabel: "Unavailable",
        error: "NOAA: HTTP 500",
    });
    assert.equal(module.weatherdata, before);
});

test("hour format follows MagicMirror's global timeFormat", () => {
    assert.equal(definition.defaults.hourFormat, "24h");
    const saved = global.config;
    global.config = { timeFormat: 12 };
    delete require.cache[require.resolve("../MMM-WeatherdotcomChart.js")];
    require("../MMM-WeatherdotcomChart.js");
    assert.equal(definition.defaults.hourFormat, "12h");
    global.config = saved;
});
