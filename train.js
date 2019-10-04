'use strict';

const child_process = require("child_process");

// Load the SDK for JavaScript
const AWS = require('aws-sdk');
// Set the Region 
AWS.config.update({region: process.env.REGION});

function retrieveInstanceProfile() {
  var iam = new AWS.IAM();
  var profileParams = {
    InstanceProfileName: process.env.SERVICE+'-'+process.env.STAGE,
  }
  
  var getProfilePromise = iam.getInstanceProfile(profileParams).promise();
  return getProfilePromise.then(async profileData => {
    console.log('Instance profile exists: ', profileData);
    return profileData;
  }).catch(async err => {
    if (err.statusCode == 404) {
      console.log('Instance profile does not exist, creating');
      var createProfilePromise = iam.createInstanceProfile(profileParams).promise();
      return createProfilePromise.then(async profileData => {
        console.log('Created new instance profile, pausing then adding role');
        child_process.execSync("sleep 10"); // sleep 10s
        profileParams.RoleName = process.env.IAM_ROLE;
        var addRolePromise = iam.addRoleToInstanceProfile(profileParams).promise();
        return addRolePromise.then(function(roleData) {
          console.log('Added role to instance profile');
          return profileData;
        }).catch(function(err) {
          console.error('Error addding role to instance profile>>>', err);
        }); 
      }).catch(function(err) {
        console.error('Error creating instance profile instance profile>>>', err);
      });  
    } else {
      console.error('Unexpected error getting instance profile: ', err);
    }
  });
}

module.exports.train = async event => {  
  // Create init script
  var userData = `#!/bin/bash
  sudo yum install -y unzip
  curl "https://s3.amazonaws.com/aws-cli/awscli-bundle.zip" -o "awscli-bundle.zip"
  unzip awscli-bundle.zip
  sudo ./awscli-bundle/install -i /usr/local/aws -b /usr/local/bin/aws
  $(aws ecr get-login --no-include-email --region <region>)
  docker pull <ecr_id>.dkr.ecr.<region>.amazonaws.com/<repo>:latest
  docker run --name keras-remote-training \
    -e "TABLE_MODELS=<table_models>" -e "TABLE_DATA=<table_data>" \
    -e "BUCKET=<bucket>" -e "REGION=<region>"\
    -d --rm <ecr_id>.dkr.ecr.<region>.amazonaws.com/<repo>:latest
  `;
  
  userData = userData.replace(/<region>/g, process.env.REGION);
  userData = userData.replace(/<ecr_id>/g, process.env.ECR_ID);
  userData = userData.replace(/<repo>/g, process.env.ECR_REPO);
  userData = userData.replace(/<table_models>/g, process.env.DYNAMODB_TABLE_MODELS);
  userData = userData.replace(/<table_data>/g, process.env.DYNAMODB_TABLE_DATA);
  userData = userData.replace(/<bucket>/g, process.env.BUCKET);
  
  console.log('Final userData>>> ', userData);
  
  var userDataBuff = new Buffer(userData);
  var userDataBase64 = userDataBuff.toString('base64');
  console.log('Base64 encoded userData>>>', userDataBase64);

  // Set EC2 instance parameters
  var instanceParams = {
     ImageId: process.env.AMI_ID, 
     InstanceType: process.env.INSTANCE_TYPE,
     KeyName: process.env.KEY_NAME,
     MinCount: 1,
     MaxCount: 1,
     UserData: userDataBase64,
     InstanceInitiatedShutdownBehavior: 'terminate',
     InstanceMarketOptions: {
       MarketType: 'spot',
       SpotOptions: {
         BlockDurationMinutes: process.env.SPOT_DURATION,
         InstanceInterruptionBehavior: 'terminate',
         SpotInstanceType: 'one-time',
       }
     },
     IamInstanceProfile: {
       Arn: 'STRING_VALUE',
     },
  };
  
  var instanceProfileResponse = await retrieveInstanceProfile();
  console.log('Received instanceProfileResponse: ', instanceProfileResponse);
  instanceParams.IamInstanceProfile.Arn = instanceProfileResponse.InstanceProfile.Arn;
  
  console.log('IAM instance profile details: ', instanceParams.IamInstanceProfile);
  
  // Create a promise on an EC2 service object
  var instancePromise = new AWS.EC2({apiVersion: '2016-11-15'}).runInstances(instanceParams).promise();

  // Handle promise's fulfilled/rejected states
  // TODO: modify promise chaining (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises)
  return instancePromise.then(
    async data => {
      console.log(data);
      var instanceId = data.Instances[0].InstanceId;
      console.log("Created instance", instanceId);
      
      // // Add tags to the instance
      // var tagParams = {Resources: [instanceId], Tags: [
      //    {
      //       Key: 'Project',
      //       Value: 'lambdaautotraining'
      //    }
      // ]};
      // // Create a promise on an EC2 service object
      // var tagPromise = new AWS.EC2({apiVersion: '2016-11-15'}).createTags(tagParams).promise();
      // // Handle promise's fulfilled/rejected states
      // tagPromise.then(
      //   function(data) {
      //     console.log("Instance tagged");
      //   }).catch(
      //     function(err) {
      //     console.error(err, err.stack);
      //   });
      
      // Create alarm to auto-terminate    
      var alarmParams = {
        AlarmName: process.env.SERVICE+'_CPU_Utilization_'+instanceId,
        ComparisonOperator: 'LessThanThreshold',
        EvaluationPeriods: 2,
        MetricName: 'CPUUtilization',
        Namespace: 'AWS/EC2',
        Period: 60*5,
        Statistic: 'Average',
        Threshold: 5.0,
        ActionsEnabled: true,
        AlarmActions: ['arn:aws:automate:'+process.env.REGION+':ec2:terminate'],
        AlarmDescription: 'Termination alarm for CPU below 5%',
        Dimensions: [
          {
            Name: 'InstanceId',
            Value: instanceId
          },
        ],
        Unit: 'Percent'
      };
      
      var alarmPromise = new AWS.CloudWatch({apiVersion: '2010-08-01'}).putMetricAlarm(alarmParams).promise();
      
      return alarmPromise.then(
        async data => {
          console.log("Alarm action added", data);
          var paramsEnableAlarmAction = {
            AlarmNames: [alarmParams.AlarmName]
          };
          var actionPromise = new AWS.CloudWatch({apiVersion: '2010-08-01'}).enableAlarmActions(paramsEnableAlarmAction).promise();
          return actionPromise.then(
            function (data) {
              console.log("Alarm action enabled", data);
              return { message: 'Instance, alarm and action successfully created', data };
            }).catch(
              function(err) {
                console.log("Error alarm action enablement", err);
                return { message: 'Alarm action enablement encountered an error', err };
              });
        }).catch(
          function(err) {
            console.log("Error alarm creation", err);
            return { message: 'Alarm creation encountered an error', err };
          });   
             
    }).catch(
      function(err) {
        console.error("Error instance creation", err);
        return { message: 'Instance creation encountered an error', err };
    });
    
  console.log('postpostpromise');

};
