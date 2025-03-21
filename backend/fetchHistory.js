const axios = require('axios');
const moment = require('moment-timezone');
const BTCPrice = require('./db/btcModel');

async function fetchHistoricalData(startDate, endDate) {
  const limit = 1000;
  const interval = '1d';
  const symbol = 'BTCUSDT';

  const start = moment(startDate);
  const end = moment(endDate);
  const totalDays = end.diff(start, 'days') + 1;

  let allData = [];

  for (let i = 0; i < totalDays; i += limit) {
    const chunkStart = start.clone().add(i, 'days');
    const chunkEndTimestamp = Math.min(
      chunkStart.clone().add(limit - 1, 'days').valueOf(),
      end.valueOf()
    );

    const apiUrl = `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${chunkStart.valueOf()}&endTime=${chunkEndTimestamp}&limit=${limit}`;

    try {
      console.log(`Запрос данных с ${chunkStart.format('YYYY-MM-DD')} по ${moment(chunkEndTimestamp).format('YYYY-MM-DD')}`);
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

  return allData;
}

module.exports = fetchHistoricalData;