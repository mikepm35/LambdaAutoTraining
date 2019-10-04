'use strict';

// Load the SDK for JavaScript
const AWS = require('aws-sdk');
// Set the Region 
AWS.config.update({region: process.env.REGION});

// Create DynamoDB service object
const ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

const testData = [ 
  {
    created: 1569861691316,
    temp: 44,
    rh: 38,
    wind: 19,
    clo: 0.26223705232180966,
    label: 'ok',
    score: 10.583140077331759
  },
  {
    created: 1569861691317,
    temp: 48,
    rh: 25,
    wind: 11,
    clo: 0.45549595652619856,
    label: 'ok',
    score: 10.73776466298334
  },
  {
    created: 1569861691318,
    temp: 91,
    rh: 99,
    wind: 1,
    clo: 1.113239650312202,
    label: 'warm',
    score: 20.94336949290375
  } 
];

module.exports.upload = (event, context, callback) => {
  var data = null;
  if (!event) {
    console.log('using testData');
    data = testData;
  } else {
    data = JSON.parse(event.body);
    console.log('data>>> ', data);
  }
  
  // construct put request items
  var requestItems = [];
  data.forEach(item => {
    requestItems.push({
      PutRequest: {
        Item: {
          created: { "N": item.created.toString() },
          temp: { "N": item.temp.toString() },
          rh: { "N": item.rh.toString() },
          wind: { "N": item.wind.toString() },
          clo: { "N": item.clo.toString() },
          label: { "S": item.label.toString() },
          score: { "N": item.score.toString() },
        }
      }
    }); 
  });
  
  if (requestItems.length == 0) {
    callback(null, {
      statusCode: 200,
      headers: {'Content-Type': 'text/plain'},
      body: 'No records created since request body length was zero',
    });
    return;
  }
  
  var params = {
    RequestItems: {
      [process.env.DYNAMODB_TABLE_DATA]: requestItems
    }
  };
  
  console.log('params>>>', params);

  ddb.batchWriteItem(params, function(err, data) {
    if (err) {
      console.log("Error", err);
      callback(Error(err), {
        statusCode: 500,
        headers: {'Content-Type': 'text/plain'},
        body: 'Error encountered during record creation',
      });
    } else {
      console.log("Success", data);
      callback(null, {
        statusCode: 200,
        headers: {'Content-Type': 'text/plain'},
        body: requestItems.length.toString() + ' records successfully created',
      });
    }
  });
};
