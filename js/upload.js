'use strict';

// Load the SDK for JavaScript
const AWS = require('aws-sdk');
AWS.config.update({region: process.env.REGION});
const ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

module.exports.upload = (event, context, callback) => {
  var data = event.body
  if (typeof data == 'string') {
    data = JSON.parse(data)
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
