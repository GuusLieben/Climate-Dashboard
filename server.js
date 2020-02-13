const express = require('express');
const cors = require('cors');
const mysql = require('mysql');
const moment = require('moment');
const connectionSettings = require('settings');

const connection = mysql.createConnection(connectionSettings);
connection.connect();

const port = process.env.PORT || 8080;
const app = express().use(cors());

app.get('/api', (req, res) => {
  connection.query('SELECT \'Temperature\' AS TypeSet, Datum AS Recorded, Tijd, temp1 AS Measure1, temp2 AS Measure2, press, light, humi FROM temperatures UNION SELECT \'Particle\' AS TypeSet, recorded AS Recorded, 0, pm25 AS Measure1, pm10 AS Measure2, 0, 0, 0 FROM particles', (error, results) => {
    if (error) res.status(500).json({ status: error });
    else {
      let temperatures = [];
      let particles = [];
      const response = {};

      results.forEach(element => {
        if (element.TypeSet === 'Particle') particles.push(element);
        else if (element.TypeSet === 'Temperature') temperatures.push(element);
      })

      particles.forEach(element => {
        // Particles has combined DateTime stamps, therefore we do not need to parse it with MomentJS
        const date = element.Recorded.split(' ')[0];
        const time = element.Recorded.split(' ')[1];
        if (!response[date]) response[date] = { particles: [] }

        response[date].particles.push({
          time: time,
          pm25: +element.Measure1,
          pm10: +element.Measure2
        });
      });

      temperatures.forEach(element => {
        const date = moment(element.Recorded, 'YYYY-MM-DD').format('DD.MM.YYYY');
        if (!response[date]) response[date] = { sensors: [] }
        if (!response[date].sensors) response[date].sensors = [];

        response[date].sensors.push({
          time: element.Tijd,
          temperatureLow: +element.Measure1,
          temperatureHigh: +element.Measure2,
          pressure: +element.press,
          lightLevel: +element.light,
          humidity: +element.humi
        });
      });

      res.status(200).json({
        legend: {
          pm25: 'Particulate Matter < 2.5 micrometer',
          pm10: 'Particulate Matter < 1.0 micrometer',
          pressure: 'Hectopascal',
          lightLevel: 'Lux',
          humidity: 'Percentage of humid air'
        },
        response
      });
    }
  });
})

app.use(express.static('dist/climate'))

app.listen(port, () => console.log('Started application'));
