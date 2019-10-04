'use strict';

const tf = require('@tensorflow/tfjs');

const nodeFetch = require('node-fetch');  // https://github.com/tensorflow/tfjs/issues/2029
global.fetch = nodeFetch;

// Load the SDK for JavaScript
const AWS = require('aws-sdk');
// Set the Region 
AWS.config.update({region: process.env.REGION});

const ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

module.exports.infer = async event => {  
  // parse the event
  console.log(event);
    
  // Download the model
  var url = process.env.API_URL + '/s3proxy/latest/model.json';
  console.log('s3proxy url: ', url);
  const model = await tf.loadLayersModel(url);
  console.log(model);

  // Run inference with predict().
  var predictResult = model.predict(tf.tensor2d([[25, 1.2, 75, 1.1]]));
  console.log('string', predictResult.toString());
  console.log('predictResult', predictResult);
  console.log('predictResult Array', predictResult.arraySync());
  
  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        message: predictResult.toString(),
        input: event,
      },
      null,
      2
    ),
  };

};
