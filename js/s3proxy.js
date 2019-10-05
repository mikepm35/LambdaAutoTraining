'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: process.env.REGION});
const s3 = new AWS.S3();
  
module.exports.s3proxy = async event => {    
  //var filename = event.pathParameters.filename;
  //filename = 'models/' + event.pathParameters.key + '/' + filename;
  var filename = 'models/latest/model.json';
  console.log('Final filename: ', filename);

  var signedUrl = s3.getSignedUrl('getObject', {
      Bucket: process.env.BUCKET,
      Key: filename,
      Expires: 100 // seconds
  });
  
  console.log('Signed url: ', signedUrl);
  
  return {
    statusCode: 302,
    headers: {
      Location: signedUrl
    }
  };

};
