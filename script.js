// Firebase settings copied from your web app configuration.
const firebaseConfig = {
  apiKey: "AIzaSyDUMafdWbBMTtlQ4TazZEUmxHaudhv3A3k",
  authDomain: "tempmonitor-e2c3a.firebaseapp.com",
  databaseURL: "https://tempmonitor-e2c3a-default-rtdb.firebaseio.com/",
  projectId: "tempmonitor-e2c3a",
  appId: "1:94636105761:web:057c625780dc9e03ff0360"
};

const $ = (selector) => document.querySelector(selector);
const statusText = $("#systemStatusText");
const statusPill = $(".system-status");
const temperatureCard = $(".temperature-card");
const humidityCard = $(".humidity-card");
const temperatureValue = $("#currentTemperature");
const maximumValue = $("#maximumTemperature");
const minimumValue = $("#minimumTemperature");
const humidityValue = $("#humidityValue");
const temperatureNote = $("#temperatureNote");
const humidityNote = $("#humidityNote");
const lastUpdated = $("#lastUpdated");
const settingsDialog = $("#settingsDialog");
const settingsForm = $("#settingsForm");
const REFRESH_SECONDS = 5;
const DEFAULT_SETTINGS = { tempCritical: null, humidityCritical: null, webhookUrl: "" };
let settings = readSettings();
let allReadings = [];
let selectedRange = "1";
let databaseRef = null;
let refreshTimer = null;
let secondsUntilRefresh = REFRESH_SECONDS;
let autoRefresh = true;
let previousAlertState = "safe";

function readSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem("serverRoomSettings") || "{}");
    return {
      tempCritical: Number.isFinite(stored.tempCritical) ? stored.tempCritical : null,
      humidityCritical: Number.isFinite(stored.humidityCritical) && stored.humidityCritical >= 0 && stored.humidityCritical <= 100 ? stored.humidityCritical : null,
      webhookUrl: typeof stored.webhookUrl === "string" ? stored.webhookUrl : ""
    };
  } catch (error) {
    console.warn("Could not read saved alert settings:", error);
    return { ...DEFAULT_SETTINGS };
  }
}

const temperatureChart = new Chart(document.getElementById("temperatureChart"), {
  type: "line",
  data: { labels: [], datasets: [
    { label: "Temperature", data: [], borderColor: "#38c9f5", backgroundColor: "rgba(56, 201, 245, 0.1)", borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: "#38c9f5", tension: 0.35, fill: true, yAxisID: "y" },
    { label: "Humidity", data: [], borderColor: "#a78bfa", backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointBackgroundColor: "#a78bfa", tension: 0.35, spanGaps: false, yAxisID: "y1" }
  ] },
  options: {
    responsive: true, maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: { legend: { display: true, labels: { color: "#a8b4c1", usePointStyle: true, boxWidth: 8 } }, tooltip: {
      displayColors: true,
      titleColor: "#eef4fa", bodyColor: "#c5d0dc",
      callbacks: {
        title: (items) => items.length ? new Date(items[0].label).toLocaleString([], { dateStyle: "medium", timeStyle: "medium" }) : "",
        label: (context) => context.datasetIndex === 0 ? ` Temperature: ${context.parsed.y.toFixed(1)} °C` : (context.parsed.y == null ? " Humidity: no reading" : ` Humidity: ${context.parsed.y.toFixed(0)}%`)
      }
    } },
    scales: {
      x: { type: "category", title: { display: true, text: "Reading time", color: "#a8b4c1" }, ticks: { color: "#7f8d9b", maxTicksLimit: 8 }, grid: { color: "#26313d" } },
      y: { title: { display: true, text: "Temperature (°C)", color: "#a8b4c1" }, ticks: { color: "#7f8d9b" }, grid: { color: "#26313d" } },
      y1: { position: "right", min: 0, max: 100, title: { display: true, text: "Humidity (%)", color: "#a8b4c1" }, ticks: { color: "#7f8d9b" }, grid: { drawOnChartArea: false } }
    }
  }
});

function renderChart() {
  const cutoff = selectedRange === "all" ? 0 : Date.now() - Number(selectedRange) * 60 * 60 * 1000;
  const visible = allReadings.filter((reading) => reading.timestamp >= cutoff);
  temperatureChart.data.labels = visible.map((reading) => new Date(reading.timestamp).toISOString());
  temperatureChart.data.datasets[0].data = visible.map((reading) => reading.temperature);
  temperatureChart.data.datasets[1].data = visible.map((reading) => typeof reading.humidity === "number" ? reading.humidity : null);
  temperatureChart.update();
}

function setStatus(label, state) {
  statusText.textContent = label;
  statusPill.dataset.state = state;
  statusPill.setAttribute("aria-label", `System status: ${label}`);
}

function classify(value, criticalAt, margin) {
  if (criticalAt === null) return "unknown";
  if (value >= criticalAt) return "critical";
  if (value >= criticalAt - margin) return "warning";
  return "safe";
}

function setCardState(card, state, label) {
  card.dataset.state = state;
  const stateElement = card.querySelector(".reading-state");
  stateElement.textContent = label;
}

function updateCooling(selector, value, label) {
  const indicator = $(selector);
  const isKnown = typeof value === "boolean";
  indicator.dataset.state = isKnown ? (value ? "active" : "inactive") : "unknown";
  indicator.querySelector("strong").textContent = isKnown ? (value ? "Active" : "Standby") : "Unknown";
}

function average(readings) {
  if (!readings.length) return "--";
  return `${(readings.reduce((sum, item) => sum + item.temperature, 0) / readings.length).toFixed(1)} °C`;
}

function renderAnalytics(readings) {
  const now = Date.now();
  const today = readings.filter((item) => new Date(item.timestamp).toDateString() === new Date(now).toDateString());
  const week = readings.filter((item) => item.timestamp >= now - 7 * 24 * 60 * 60 * 1000);
  $("#dailyAverage").textContent = average(today);
  $("#weeklyAverage").textContent = average(week);

  const hours = new Map();
  week.forEach((item) => {
    const hour = new Date(item.timestamp).getHours();
    const bucket = hours.get(hour) || { sum: 0, count: 0 };
    bucket.sum += item.temperature;
    bucket.count += 1;
    hours.set(hour, bucket);
  });
  const peak = [...hours.entries()].sort((a, b) => b[1].sum / b[1].count - a[1].sum / a[1].count)[0];
  $("#peakHour").textContent = peak ? `${String(peak[0]).padStart(2, "0")}:00` : "--";

  let coveredMs = 0;
  for (let index = 1; index < week.length; index += 1) coveredMs += Math.min(week[index].timestamp - week[index - 1].timestamp, 5 * 60 * 1000);
  const observedMs = week.length > 1 ? week[week.length - 1].timestamp - week[0].timestamp : 0;
  $("#uptimeValue").textContent = observedMs > 0 ? `${Math.min(100, Math.round(coveredMs / observedMs * 100))}%` : "--";
}

async function sendWebhook(state, reading) {
  if (!settings.webhookUrl) return;
  try {
    const response = await fetch(settings.webhookUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "server_room_threshold", state, temperature: reading.temperature, humidity: reading.humidity ?? null, timestamp: reading.timestamp, message: `Server room ${state}: ${reading.temperature} °C${typeof reading.humidity === "number" ? `, ${reading.humidity}% humidity` : ""}` })
    });
    if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
  } catch (error) { console.error("Webhook alert failed:", error); }
}

function renderReadings(readings) {
  if (!readings.length) return;
  allReadings = readings;
  const latest = readings[readings.length - 1];
  const values = readings.map((reading) => reading.temperature);
  const tempState = classify(latest.temperature, settings.tempCritical, 2);
  const humidityState = typeof latest.humidity === "number" ? classify(latest.humidity, settings.humidityCritical, 5) : "unknown";
  temperatureValue.innerHTML = `${latest.temperature.toFixed(1)}<span class="unit">°C</span>`;
  maximumValue.innerHTML = `${Math.max(...values).toFixed(1)}<span class="unit">°C</span>`;
  minimumValue.innerHTML = `${Math.min(...values).toFixed(1)}<span class="unit">°C</span>`;
  if (typeof latest.humidity === "number") {
    humidityValue.innerHTML = `${latest.humidity.toFixed(0)}<span class="unit">%</span>`;
    setCardState(humidityCard, humidityState, humidityState === "unknown" ? "NO LIMIT" : humidityState.toUpperCase());
    humidityNote.textContent = settings.humidityCritical === null
      ? "Set a critical limit in Settings"
      : `Critical at or above ${settings.humidityCritical}%`;
  } else {
    humidityValue.innerHTML = `--<span class="unit">%</span>`;
    setCardState(humidityCard, "unknown", "NO DATA");
    humidityNote.textContent = "Live humidity reading";
  }

  setCardState(temperatureCard, tempState, tempState === "unknown" ? "NO LIMIT" : tempState.toUpperCase());
  temperatureNote.textContent = settings.tempCritical === null
    ? "Set a critical limit in Settings"
    : `Critical at or above ${settings.tempCritical} °C`;
  const combinedState = tempState === "critical" || humidityState === "critical" ? "critical" : tempState === "warning" || humidityState === "warning" ? "warning" : "safe";
  const bothLimitsSet = settings.tempCritical !== null && settings.humidityCritical !== null;
  setStatus(
    combinedState === "critical" ? "Critical environment alert" :
      combinedState === "warning" ? "Approaching critical limit" :
        bothLimitsSet ? "Sensor online" : "Set critical limits",
    combinedState === "safe" && bothLimitsSet ? "online" : combinedState === "safe" ? "waiting" : combinedState
  );
  lastUpdated.textContent = `Last updated: ${new Date(latest.timestamp).toLocaleTimeString()}`;

  updateCooling("#acIndicator", latest.acActive, "AC");
  updateCooling("#fanIndicator", latest.fanActive, "Fan");
  renderAnalytics(readings);
  renderChart();

  if (combinedState !== previousAlertState) {
    if (combinedState === "critical") {
      sendWebhook(combinedState, latest);
    } else if (combinedState === "warning") sendWebhook(combinedState, latest);
    previousAlertState = combinedState;
  }
}

function applyRefreshState() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
  $("#refreshCountdown").textContent = autoRefresh ? `Refreshes in ${secondsUntilRefresh}s` : "Auto-refresh paused";
  if (autoRefresh) {
    refreshTimer = setInterval(() => {
      secondsUntilRefresh -= 1;
      if (secondsUntilRefresh <= 0) {
        secondsUntilRefresh = REFRESH_SECONDS;
        fetchReadings();
      }
      $("#refreshCountdown").textContent = `Refreshes in ${secondsUntilRefresh}s`;
    }, 1000);
  }
}

function fetchReadings() {
  if (!databaseRef) return;
  databaseRef.once("value").then((snapshot) => {
    const data = snapshot.val();
    if (!data) { setStatus("Waiting for readings", "waiting"); return; }
    const temperature = Number(data.Temperature);
    const humidity = Number(data.Humidity);
    if (!Number.isFinite(temperature) || !Number.isFinite(humidity)) {
      setStatus("Waiting for valid sensor data", "waiting");
      return;
    }
    // The NodeMCU stores only the latest values, so this dashboard can show
    // the current reading but cannot reconstruct historical readings.
    renderReadings([{ temperature, humidity, timestamp: Date.now() }]);
  }).catch((error) => {
    console.error("Could not read temperature data from Firebase:", error);
    setStatus("Database unavailable", "critical");
  });
}

document.querySelectorAll(".range-button").forEach((button) => {
  button.addEventListener("click", () => {
    selectedRange = button.dataset.range;
    document.querySelectorAll(".range-button").forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    renderChart();
  });
});

$("#exportButton").addEventListener("click", () => {
  if (!allReadings.length) return;
  const rows = [["timestamp", "temperature_c", "humidity_percent", "ac_active", "fan_active"], ...allReadings.map(({ timestamp, temperature, humidity = "", acActive = "", fanActive = "" }) => [new Date(timestamp).toISOString(), temperature, humidity, acActive, fanActive])];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `server-room-readings-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

$("#refreshButton").addEventListener("click", () => { secondsUntilRefresh = REFRESH_SECONDS; fetchReadings(); applyRefreshState(); });
$("#autoRefreshToggle").addEventListener("change", (event) => { autoRefresh = event.target.checked; secondsUntilRefresh = REFRESH_SECONDS; applyRefreshState(); });
function syncAlertSettings(next) {
  if (!databaseRef) throw new Error("Firebase is not connected");
  let timeoutId;
  const write = databaseRef.child("AlertSettings").set({
    temperatureEnabled: next.tempCritical !== null,
    temperatureCritical: next.tempCritical ?? 0,
    humidityEnabled: next.humidityCritical !== null,
    humidityCritical: next.humidityCritical ?? 0
  });
  return Promise.race([
    write,
    new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Firebase settings sync timed out")), 8000);
    })
  ]).finally(() => clearTimeout(timeoutId));
}

function fillSettingsForm() {
  Object.entries(settings).forEach(([key, value]) => {
    if (settingsForm.elements[key]) settingsForm.elements[key].value = value ?? "";
  });
}
$("#settingsButton").addEventListener("click", () => { fillSettingsForm(); $("#settingsError").textContent = ""; settingsDialog.showModal(); });
$("#closeSettings").addEventListener("click", () => settingsDialog.close());
$("#cancelSettings").addEventListener("click", () => settingsDialog.close());
settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(settingsForm);
  const parseOptionalNumber = (value) => {
    const text = String(value ?? "").trim();
    if (!text) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : NaN;
  };
  const next = {
    tempCritical: parseOptionalNumber(form.get("tempCritical")),
    humidityCritical: parseOptionalNumber(form.get("humidityCritical")),
    webhookUrl: String(form.get("webhookUrl") || "").trim()
  };
  if (Number.isNaN(next.tempCritical) || Number.isNaN(next.humidityCritical) ||
      (next.humidityCritical !== null && (next.humidityCritical < 0 || next.humidityCritical > 100))) {
    $("#settingsError").textContent = "Enter a valid temperature and humidity limit (0–100%).";
    return;
  }
  try {
    localStorage.setItem("serverRoomSettings", JSON.stringify(next));
  } catch (error) {
    console.error("Could not save alert settings:", error);
    $("#settingsError").textContent = "Settings could not be saved in this browser.";
    return;
  }
  settings = next;
  if (allReadings.length) renderReadings(allReadings);
  try {
    await syncAlertSettings(next);
    settingsDialog.close();
  } catch (error) {
    console.error("Could not sync critical limits to Firebase:", error);
    $("#settingsError").textContent = "Saved in this browser, but Firebase sync failed. The NodeMCU buzzer may not receive the new limits.";
  }
});

try {
  firebase.initializeApp(firebaseConfig);
  databaseRef = firebase.database().ref("ServerRoom");
  fetchReadings();
  applyRefreshState();
} catch (error) {
  console.error("Firebase could not be started:", error);
  setStatus("Connection unavailable", "critical");
}
