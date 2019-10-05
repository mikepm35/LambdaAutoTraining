'use strict';

const child_process = require("child_process");

const AWS = require('aws-sdk');
AWS.config.update({region: process.env.REGION});
const iam = new AWS.IAM();
const ec2 = new AWS.EC2({apiVersion: '2016-11-15'});
const cw = new AWS.CloudWatch({apiVersion: '2010-08-01'});

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
  
  // Get instance profile
  var profileParams = {
    InstanceProfileName: process.env.SERVICE+'-'+process.env.STAGE,
  }
  
  var profileData = null;
  try {
    profileData = await iam.getInstanceProfile(profileParams).promise();
  } catch (err) {
    if (err.statusCode == 404) {
      console.log('Instance profile does not exist, creating');
      profileData = await iam.createInstanceProfile(profileParams).promise();
      child_process.execSync("sleep 10"); // alllows new profile to propogate
      profileParams.RoleName = process.env.IAM_ROLE;
      var roleData = await iam.addRoleToInstanceProfile(profileParams).promise();
      console.log('Added role to instance profile');
    } else {
      console.error('Unexpected error getting instance profile: ', err);
      return {
        statusCode: 500,
        body: JSON.stringify({error: "Error getting instance profile"}),
      };
    }
  }      
  
  console.log('Instance profile data: ', profileData);
  instanceParams.IamInstanceProfile.Arn = profileData.InstanceProfile.Arn;

  // Create EC2 instance
  try {
    var instanceData = await ec2.runInstances(instanceParams).promise();
    var instanceId = instanceData.Instances[0].InstanceId;
    console.log("Created instance", instanceId);
    
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
    
    var alarmData = await cw.putMetricAlarm(alarmParams).promise();
    console.log('Alarm created: ', alarmData);
    
    // Enable action on alarm
    var paramsEnableAlarmAction = {
      AlarmNames: [alarmParams.AlarmName]
    };
    
    var actionData = await cw.enableAlarmActions(paramsEnableAlarmAction).promise();
    console.log("Alarm action enabled", actionData);
    
    return {
      statusCode: 200,
      body: JSON.stringify({result: "Instance created"}),
    };  
    
  } catch (err) {
    console.error('Error creating instance: ', err);
    return {
      statusCode: 500,
      body: JSON.stringify({error: "Error creating instance"}),
    };  
  }

};
