<template>
  <div class="chart-container">

    <h2>График цен BTC/USDT</h2>

    <div class="period-selector">
      <label for="period">Выберите период:</label>
      <select id="period" v-model="selectedPeriod" @change="fetchData">
        <option value="1d">📅 1 день</option>
        <option value="7d">📅 7 дней</option>
        <option value="30d">📅 30 дней</option>
        <option value="365d">📅 1 год</option>
        <option value="custom">📅 Выбрать свой период</option>
      </select>

      <button @click="fetchData" :disabled="isLoading">Обновить данные</button>
    </div>

    <div v-if="selectedPeriod === 'custom'" class="custom-period">
      <label>📅 Начальная дата:</label>
      <input type="date" v-model="customStartDate" />

      <label>📅 Конечная дата:</label>
      <input type="date" v-model="customEndDate" />

      <button @click="fetchCustomData" :disabled="isLoading">Загрузить</button>
    </div>

    <div v-if="isLoading" class="loader"></div>

    <div v-show="!isLoading" class="chart-wrapper">
      <canvas ref="chartCanvas"></canvas>
    </div>

    <div class="chart-legend">
      <h3>Легенда:</h3>
      <ul>
        <li><span class="legend-line dark"></span> Линия графика — цена BTC/USDT</li>
        <li><span class="legend-dot blue"></span> Точка — значение в выбранный день</li>
        <li><span class="legend-line green"></span><strong>Рост цены</strong> – график зелёный, если цена BTC в конце периода больше цены в начале периода</li>
        <li><span class="legend-line red"></span><strong>Падение цены</strong> – график красный, если цена BTC в конце периода меньше цены в начале периода</li>
      </ul>
    </div>
  </div>
</template>


<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js/auto'
import 'chartjs-adapter-date-fns'
import './BitcoinChart.css'

Chart.register(...registerables)

const chartCanvas = ref(null)
let chartInstance = null
const selectedPeriod = ref('7d')
const customStartDate = ref('')
const customEndDate = ref('')
const isLoading = ref(false)
const runtimeConfig = useRuntimeConfig();
console.log('Runtime Config:', runtimeConfig);
const apiBaseUrl = runtimeConfig.public.apiBaseUrl;

if (!apiBaseUrl) {
  console.error('API_BASE_URL is undefined!');
}

const CACHE_TTL = 10 * 60 * 1000

function getCachedData(period) {
  const cache = localStorage.getItem(`btc-price-${period}`)
  if (cache) {
    const { timestamp, data } = JSON.parse(cache)
    if (Date.now() - timestamp < CACHE_TTL) {
      return data
    }
  }
  return null
}

function cacheData(period, data) {
  localStorage.setItem(`btc-price-${period}`, JSON.stringify({ timestamp: Date.now(), data }))
}

function clearCache() {
  localStorage.removeItem(`btc-price-${selectedPeriod.value}`)
}

async function fetchData(forceRefresh = false) {
  isLoading.value = true;
  try {
    let days = 7;
    if (selectedPeriod.value === '1d') days = 1;
    if (selectedPeriod.value === '30d') days = 30;
    if (selectedPeriod.value === '365d') days = 365;

    const cache = getCachedData(selectedPeriod.value);
    if (cache && !forceRefresh) {
      console.log(`⚡ Используем кеш для ${selectedPeriod.value}`);
      await renderChart(cache);
      return;
    }

    console.log(`📡 Загружаем свежие данные для ${selectedPeriod.value}`);
    const apiUrl = `${apiBaseUrl}/api/btc-price?days=${days}`;
    console.log('API URL:', apiUrl);
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`Ошибка HTTP: ${response.status}`);

    const data = await response.json();
    if (!data.length) return;

    cacheData(selectedPeriod.value, data);
    await renderChart(data);
  } catch (err) {
    console.error("Ошибка загрузки данных:", err);
  } finally {
    isLoading.value = false;
  }
}

function aggregateData(data, interval) {
  const aggregated = [];
  let currentGroup = { dates: [], prices: [] };

  for (const item of data) {
    currentGroup.dates.push(item.date);
    currentGroup.prices.push(item.price);

    if (currentGroup.dates.length === interval) {
      aggregated.push({
        date: currentGroup.dates[0],
        price: currentGroup.prices.reduce((a, b) => a + b, 0) / currentGroup.prices.length
      });
      currentGroup = { dates: [], prices: [] };
    }
  }

  if (currentGroup.dates.length > 0) {
    aggregated.push({
      date: currentGroup.dates[0],
      price: currentGroup.prices.reduce((a, b) => a + b, 0) / currentGroup.prices.length
    });
  }

  return aggregated;
}

async function renderChart(data) {
  if (!data || data.length === 0) return;

  const totalDays = (new Date(data[data.length - 1].date) - new Date(data[0].date)) / (1000 * 60 * 60 * 24);
  const interval = totalDays > 365 ? 7 : 1;
  const aggregatedData = aggregateData(data, interval);

  const labels = aggregatedData.map(item => item.date);
  const prices = aggregatedData.map(item => item.price);

  const firstPrice = prices[0];
  const lastPrice = prices[prices.length - 1];
  const trendColor = lastPrice >= firstPrice ? 'green' : 'red';

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const buffer = (maxPrice - minPrice) * 0.02;

  const timeUnit = totalDays > 365 ? 'year' : totalDays > 30 ? 'month' : 'day';

  const chartData = {
    labels,
    datasets: [{
      label: 'Цена BTC (USDT)',
      data: prices,
      borderColor: trendColor,
      borderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: trendColor,
      fill: true,
      tension: 0.3,
      backgroundColor: trendColor === 'green'
        ? 'rgba(0, 255, 0, 0.2)'
        : 'rgba(255, 0, 0, 0.2)'
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: trendColor === 'green' ? 'Цена BTC растет' : 'Цена BTC падает',
        color: trendColor,
        font: { size: 16 }
      },
      tooltip: {
        callbacks: {
          label: (tooltipItem) => `Цена: ${tooltipItem.raw.toFixed(2)} USDT`
        }
      },
      annotation: {
        annotations: {
          minLine: {
            type: 'line',
            yMin: minPrice,
            yMax: minPrice,
            borderColor: 'red',
            borderWidth: 2,
            label: { content: `Мин: ${minPrice.toFixed(2)} USDT`, enabled: true }
          },
          maxLine: {
            type: 'line',
            yMin: maxPrice,
            yMax: maxPrice,
            borderColor: 'green',
            borderWidth: 2,
            label: { content: `Макс: ${maxPrice.toFixed(2)} USDT`, enabled: true }
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: { unit: timeUnit },
        tooltipFormat: 'yyyy-MM-dd'
      },
      y: {
        min: minPrice - buffer,
        max: maxPrice + buffer,
        ticks: {
          callback: (value) => `${value.toFixed(2)} USDT`
        }
      }
    }
  };

  if (chartInstance) {
    chartInstance.destroy();
    await nextTick();
  }

  chartInstance = new Chart(chartCanvas.value, {
    type: 'line',
    data: chartData,
    options: chartOptions
  });
}

async function fetchCustomData() {
  if (!customStartDate.value || !customEndDate.value) {
    alert("Выберите обе даты");
    return
  }
  isLoading.value = true;
  try {
    const apiUrl = `${apiBaseUrl}/api/btc-price-range?start=${customStartDate.value}&end=${customEndDate.value}`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
      if (response.status === 404) {
        alert("⚠️ Данные за выбранный период отсутствуют. Попробуйте другой диапазон.");
        return
      }
      const errorData = await response.json();
      throw new Error(`Ошибка HTTP: ${response.status} - ${errorData.error || 'Неизвестная ошибка'}`);
    }

    const data = await response.json();
    if (!data.length) {
      alert("⚠️ Данные за выбранный период отсутствуют. Попробуйте другой диапазон.");
      return;
    }

    let chartData;
    let chartOptions;

    if (data.length === 1) {
      const date = data[0].date;
      const price = data[0].price;

      chartData = {
        datasets: [{
          label: 'Цена BTC (USDT)',
          data: [{ x: date, y: price }],
          backgroundColor: 'blue',
          pointRadius: 6
        }]
      };

      chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (tooltipItem) => `Цена: ${tooltipItem.raw.y.toFixed(2)} USDT`
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'day' }
          },
          y: {
            min: price * 0.98,
            max: price * 1.02,
            ticks: {
              callback: (value) => `${value.toFixed(2)} USDT`
            }
          }
        }
      }
    } else {
      const labels = data.map(item => item.date)
      const prices = data.map(item => item.price)

      const firstPrice = prices[0]
      const lastPrice = prices[prices.length - 1]
      const trendColor = lastPrice >= firstPrice ? 'green' : 'red'

      const minPrice = Math.min(...prices)
      const maxPrice = Math.max(...prices)
      const buffer = (maxPrice - minPrice) * 0.02

      chartData = {
        labels,
        datasets: [{
          label: 'Цена BTC (USDT)',
          data: prices,
          borderColor: trendColor,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: trendColor,
          fill: true,
          tension: 0.3,
          backgroundColor: trendColor === 'green'
            ? 'rgba(0, 255, 0, 0.2)'
            : 'rgba(255, 0, 0, 0.2)'
        }]
      };

      chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (tooltipItem) => `Цена: ${tooltipItem.raw.toFixed(2)} USDT`
            }
          }
        },
        scales: {
          y: {
            min: minPrice - buffer,
            max: maxPrice + buffer,
            ticks: {
              callback: (value) => `${value.toFixed(2)} USDT`
            }
          },
          x: { type: 'category' }
        }
      }
    }

    if (chartInstance) {
      chartInstance.destroy();
      await nextTick();
    }

    chartInstance = new Chart(chartCanvas.value, {
      type: data.length === 1 ? 'scatter' : 'line',
      data: chartData,
      options: chartOptions
    })
  } catch (err) {
    console.error("Ошибка загрузки данных:", err.message);
    alert(`Ошибка: ${err.message}`);
  } finally {
    isLoading.value = false;
  }
}

onMounted(fetchData)
watch(selectedPeriod, fetchData)
</script>
