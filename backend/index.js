const express = require('express');
const cors = require('cors');
const axios = require('axios');
const sequelize = require('./db/database');
const BTCPrice = require('./db/btcModel');
const cron = require('node-cron');
const moment = require('moment-timezone');
const NodeCache = require("node-cache");
require('dotenv').config();

const cache = new NodeCache({ stdTTL: 600 });
const fetchHistoricalData = require('./fetchHistory');

const app = express();
const PORT = process.env.PORT || 5000;
const { Op } = require("sequelize");

app.use(cors({
  origin: [
    'http://localhost:8080',
    'http://frontend:3000',
    'http://backend:5000'
  ],
  methods: ['GET']
}));
app.use(express.json());

async function checkAndFetchHistory() {
  const requiredDays = 999;
  const count = await BTCPrice.count();

  console.log(`В БД сейчас ${count} записей.`);

  if (count < requiredDays) {
    const missingDays = requiredDays - count;
    console.log(`⚠️ Недостаточно данных (${count}/${requiredDays} дней). Дозагружаем ${missingDays} дней...`);
    await fetchHistoricalData(missingDays);
  } else {
    console.log(`В БД достаточно данных (${count} дней).`);
  }
}

async function fetchAndSaveData({ days, startDate, endDate }) {
  try {
    const allData = [];
    const limit = 1000;
    const interval = '1d';
    const symbol = 'BTCUSDT';

    if (days) {
      endDate = moment().valueOf();
      startDate = moment().subtract(days, 'days').valueOf();
    } else if (startDate && endDate) {
      startDate = moment(startDate).valueOf();
      endDate = moment(endDate).valueOf();
    } else {
      throw new Error('Необходимо указать либо количество дней, либо диапазон дат.');
    }

    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const chunks = Math.ceil(totalDays / limit);
    console.log(`Загрузка данных: ${totalDays} дней, ${chunks} чанков.`);

    for (let i = 0; i < chunks; i++) {
      const chunkStart = moment(startDate).add(i * limit, 'days').valueOf();
      const chunkEnd = Math.min(
        moment(chunkStart).add(limit - 1, 'days').valueOf(),
        endDate
      );

      const apiUrl = `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${chunkStart}&endTime=${chunkEnd}&limit=${limit}`;

      try {
        console.log(`Запрос данных с ${moment(chunkStart).format('YYYY-MM-DD')} по ${moment(chunkEnd).format('YYYY-MM-DD')}`);
        const response = await axios.get(apiUrl);

        if (!response.data || response.data.length === 0) {
          console.warn(`Чанк ${i + 1}: API вернул пустые данные.`);
          continue;
        }

        const chunkData = response.data.map(item => ({
          date: moment(item[0]).format('YYYY-MM-DD'),
          price: parseFloat(item[4])
        }));

        allData.push(...chunkData);
        console.log(`Чанк ${i + 1}: Загружено ${chunkData.length} записей.`);
      } catch (error) {
        console.error(`❌ Ошибка при загрузке чанка ${i + 1}:`, error.message);
      }
    }

    if (allData.length === 0) {
      console.warn('⚠️ Нет данных для сохранения.');
      return [];
    }

    console.log(`Сохранение ${allData.length} записей в базу данных...`);
    await BTCPrice.bulkCreate(allData, { updateOnDuplicate: ['price'] });

    return await BTCPrice.findAll({
      where: {
        date: days
          ? { [Op.gte]: moment().subtract(days, 'days').format('YYYY-MM-DD') }
          : { [Op.between]: [moment(startDate).format('YYYY-MM-DD'), moment(endDate).format('YYYY-MM-DD')] }
      },
      order: [['date', 'ASC']]
    });
  } catch (error) {
    console.error('❌ Ошибка при загрузке данных:', error.message);
    throw error;
  }
}

sequelize.sync().then(async () => {
  console.log('База данных подключена!');
  await checkAndFetchHistory();

  app.listen(PORT, () => {
    console.log(`Backend запущен на порту ${PORT}`);
  });

}).catch(err => {
  console.error('Ошибка подключения к БД:', err);
});

cron.schedule('0 10 * * *', async () => {
  try {
    console.log('⏳ Автоматический сбор данных BTC...');
    await fetchHistoricalData(1);
  } catch (error) {
    console.error('❌ Ошибка при автоматическом сборе данных:', error.message);
  }
}, {
  timezone: "Europe/Moscow"
});
console.log('NB: Автосбор данных BTC запланирован на 10:00 МСК каждый день.');

app.get('/api/btc-price', async (req, res) => {
  const days = Number(req.query.days) || 7;
  const cacheKey = `btc-price-${days}`;
  const forceRefresh = req.query.forceRefresh === 'true';

  if (!forceRefresh) {
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log(`Используем кешированные данные для ключа ${cacheKey}`);
      return res.json(cachedData);
    }
  }

  try {
    let prices = await BTCPrice.findAll({
      where: { date: { [Op.gte]: moment().subtract(days, 'days').format('YYYY-MM-DD') } },
      order: [['date', 'ASC']]
    });

    const today = moment().format('YYYY-MM-DD');
    const hasTodayData = prices.some(price => price.date === today);

    if (!hasTodayData) {
      console.log('⚠️ Данные за текущий день отсутствуют. Запрашиваем у Binance...');
      prices = await fetchAndSaveData({ days });
    }

    if (prices.length < days) {
      const missingDays = days - prices.length;
      console.log(`⚠️ Недостаточно данных. Нужно ещё ${missingDays} дней. Запрашиваем у Binance...`);
      prices = await fetchAndSaveData({ days: missingDays });
    }

    cache.set(cacheKey, prices, 600);
    res.json(prices);
  } catch (error) {
    console.error('Ошибка:', error.message);
    res.status(500).json({ error: 'Ошибка получения данных' });
  }
});

app.get('/api/btc-price-range', async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({ error: "Необходимо указать начальную и конечную дату." });
  }

  try {
    console.log(`🔍 Запрашиваем данные с ${start} по ${end}`);
    let prices = await BTCPrice.findAll({
      where: { date: { [Op.between]: [start, end] } },
      order: [['date', 'ASC']]
    });

    const today = moment().format('YYYY-MM-DD');
    const isTodayInRange = moment(today).isBetween(start, end, null, '[]');

    if (isTodayInRange) {
      const hasTodayData = prices.some(price => price.date === today);

      if (!hasTodayData) {
        console.log('⚠️ Данные за текущий день отсутствуют. Запрашиваем у Binance...');
        const todayData = await fetchAndSaveData({ startDate: today, endDate: today });
        await BTCPrice.bulkCreate(todayData, { updateOnDuplicate: ['price'] });
        prices = await BTCPrice.findAll({
          where: { date: { [Op.between]: [start, end] } },
          order: [['date', 'ASC']]
        });
      }
    }

    if (!prices || prices.length === 0) {
      console.log("⚠️ Данные за этот период отсутствуют в БД. Запрашиваем у Binance...");
      const historicalData = await fetchAndSaveData({ startDate: start, endDate: end });
      await BTCPrice.bulkCreate(historicalData, { updateOnDuplicate: ['price'] });
      prices = await BTCPrice.findAll({
        where: { date: { [Op.between]: [start, end] } },
        order: [['date', 'ASC']]
      });
    }

    if (!prices || prices.length === 0) {
      return res.status(404).json({ error: "Данные за запрашиваемый период отсутствуют." });
    }

    res.json(prices);
  } catch (error) {
    console.error('❌ Ошибка на сервере:', error.message);
    res.status(500).json({ error: 'Ошибка получения данных' });
  }
});
