const { DataTypes } = require('sequelize');
const sequelize = require('./database');

const BTCPrice = sequelize.define('BTCPrice', {
  date: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  price: {
    type: DataTypes.FLOAT,
    allowNull: false
  }
});

module.exports = BTCPrice;
