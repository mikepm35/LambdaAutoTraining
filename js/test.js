'use strict';

const request = require('request');

module.exports.test = (event, context, callback) => {
  var recs = Math.floor(Math.random() * 20) + 1; // num of recs
  console.log('Number of records to generate: ', recs);

  var records = [];
  
  var createdBase = (new Date).getTime();
  
  for (var i = 0; i < recs; i++) {
    // created variable
    var created = createdBase + i;    
    
    // random inputs
    var temp = Math.floor(Math.random() * 101);  // deg F
    var rh = Math.floor(Math.random() * 80) + 20;  // %
    var wind = Math.floor(Math.random() * 20);  // m/s
    var clo = Math.random() * 140 / 100; // clo score
    var label = null;    
    
    // score generator
    var score = 0;
    
    if (temp < 20) {
      score += 1 + Math.random();
    } else if (temp < 40) {
      score += 3 + Math.random();
    } else if (temp < 75) {
      score += 6 + Math.random();
    } else if (temp < 90) {
      score += 10 + Math.random();
    } else {
      score += 12 + Math.random();
    }
    
    if (rh < 20) {
      score += 1 + Math.random();
    } else if (rh < 40) {
      score += 1.2 + Math.random();
    } else if (rh < 75) {
      score += 1.4 + Math.random();
    } else if (rh < 90) {
      score += 1.6 + Math.random();
    } else {
      score += 1.8 + Math.random();
    }
    
    if (wind < 1) {
      score += 2.2 + Math.random();
    } else if (wind < 3) {
      score += 1.8 + Math.random();
    } else if (wind < 8) {
      score += 1.4 + Math.random();
    } else if (wind < 12) {
      score += 1.2 + Math.random();
    } else {
      score += 1 + Math.random();
    }
    
    if (clo < 0.5) {
      score += 1 + Math.random();
    } else if (clo < 0.8) {
      score += 2 + Math.random();
    } else if (clo < 1.0) {
      score += 3 + Math.random();
    } else if (clo < 1.2) {
      score += 4 + Math.random();
    } else {
      score += 5 + Math.random();
    }
    
    // create final label
    if (score > 13) {
      label = 'warm';
    } else if (score > 10) {
      label = 'ok';
    } else {
      label = 'cold';
    }
    
    // add to records
    records.push({
      created: created,
      temp: temp,
      rh: rh,
      wind: wind,
      clo: clo,
      label: label,
      score: score,
    });
  }
  
  var url = process.env.API_URL + '/upload';
  console.log('url: ', url);
    
  // POST data to upload
  request.post(
    url,
    { json: records },
    function (error, response, body) {
      if (error) {
        console.log('request error: ', error);
        callback(Error(error));
      } else if (response.statusCode >= 400) {
        console.log('response error: ', error);
        callback(Error(error));
      } else {
        console.log('success: ', response.statusCode);
        callback(null, response.statusCode);
      }
    }
  );

};
