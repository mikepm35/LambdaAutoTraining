'use strict';

const tf = require('@tensorflow/tfjs');

// See https://github.com/tensorflow/tfjs/issues/2029
const nodeFetch = require('node-fetch');
global.fetch = nodeFetch;

const AWS = require('aws-sdk');
AWS.config.update({region: process.env.REGION});
const ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

module.exports.infer = async event => {  
  // Expecting to be array of json objects with keys matching inputs
  var data = event.body
  if (typeof data == 'string') {
    data = JSON.parse(data)
  }
  
  var input = [];
  for (var entry in data) {
    input.push([entry.temp, entry.clo, entry.rh, entry.wind]);
  }
  
  // Download and load the model
  var url = process.env.API_URL + '/s3proxy/latest/model.json';
  console.log('s3proxy url: ', url);
  const model = await tf.loadLayersModel(url);

  // Run inference with predict()
  var predictResult = model.predict(tf.tensor2d(input));
  var resultArray = predictResult.arraySync();
  
  // Construct output
  var output = [];
  for (var entry in resultArray) {
    var maxIndex = entry.indexOf(Math.max(...entry));
    
    var simpleResult = null;
    switch (maxIndex) {
      case 0:
        simpleResult = 'cold';
        break;
      case 1:
        simpleResult = 'ok';
        break;
      case 2:
        simpleResult = 'warm';
        break;
    }
    
    output.push({
      simpleResult: simpleResult,
      rawResult: entry,
    });
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify(output),
  };

};
