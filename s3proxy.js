'use strict';

// Load the SDK for JavaScript
const AWS = require('aws-sdk');
// Set the Region 
AWS.config.update({region: process.env.REGION});

module.exports.s3proxy = async event => {    
  var filename = null;
  if (event) {
    filename = event.pathParameters.filename;
    console.log(filename);
  } else {
    console.log('using default model.json');
    filename = 'model.json';
  }
  
  if (event) {
    filename = event.pathParameters.key + '/' + filename;
  }
  
  filename = 'models/' + filename;
  
  console.log('Final filename: ', filename);

  const s3 = new AWS.S3();

  var signedUrl = s3.getSignedUrl('getObject', {
      Bucket: process.env.BUCKET,
      Key: filename, //filename
      Expires: 100 //time to expire in seconds
  });
  
  console.log(signedUrl);
  
  return {
    statusCode: 302,
    headers: {
      Location: signedUrl
    }
  };

};
