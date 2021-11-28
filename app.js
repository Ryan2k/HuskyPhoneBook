"use-strict";

// AWS allows us to instantiate objects
const AWS = require('aws-sdk');

AWS.config.update({
  region: "us-west-2"
});

// Like AmazonS3 object from java, allows us to interact with API's to put for example
const S3 = new AWS.S3();

// Same as above for dynamo db
const DOC_CLIENT = new AWS.DynamoDB.DocumentClient();

const express = require('express');
const multer = require('multer');

const app = express();

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log('Server is listening on Port ' + PORT);
});

app.use(express.static('public'));

app.use(multer().none());

/**
 * When the web page is loaded, makes the client make a get request to this API
 * which sends back the index.html for the client to view.
 */
app.get('/', (req, res) => {
  res.sendFile('/public/index.html');
});

app.get('/test', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.type('text');
  res.send('connected');
});
/**
 * When the load button is clicked, sends a post request to this API with
 * the text contained in the file Dr. Dimpsey gave to us as the parameters
 * and then sends it over to the S3 Bucket created for this program.
 */
app.post('/upload/s3', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  await uploadToS3('css436-program4-bucket', req.body.text, 'input.txt');
  res.send('recieved');
});

/**
 * Asyncronous function used to upload a file onto an S3 bucket. The S3 object created
 * at the top of the document has a function called putObject which takes an object with 3
 * key value pairs as parameters. The body is the content that is going to go into the file,
 * the bucket is the unique name of the S3 bucket, and the key is the name of the file on S3.
 * putObject is an asyncronous function so we must await it and chain it as a promise.
 * @param {String} bucketName - name of the bucket we are sending data to
 * @param {String} data - contents of the file we are sending
 * @param {String} fileName - the name the file will have in S3.
 */
async function uploadToS3(bucketName, data, fileName) {
  await S3.putObject({
    Body: data,
    Bucket: bucketName,
    Key: fileName
  }).promise();
}

/**
 * API to delete input.txt from the projects s3 bucket. Simply a GET because
 * we know the name of the file and the bucket so can just directly plug in instead
 * of taking them as parameters in the body.
 */
app.get('/delete/s3', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  deleteFromS3();
  res.send('deleted');
});

/**
 * Uses the S3 object to delete input.txt from the projects s3 bucket.
 * unlike upload, deleteObject is syncronous so no need to wait on it.
 * Takes in the unique bucket name as one parameter and the name of the file in
 * s3 as the other (the key). We already know the name of the bucket and the file
 * so can just directly pass in hard coded text every time without taking parameters.
 */
function deleteFromS3() {
  let params = {
    Bucket: 'css436-program4-bucket',
    Key: 'input.txt'
  };

  S3.deleteObject(params, function(err, data) {
    if (err) {
      console.log(err);
    } else {
      console.log('successfully deleted');
    }
  })
}

/**
 * todo: upload to dynamodb, this function doesnt work yet
 * .put returns nothing by default
 */
app.post('/upload/dynamo', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  let params = {
    TableName: 'css436-program4-table',
    Item: req.body
  }

  DOC_CLIENT.put(params, function(err, data) {
    if (err) {
      console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      // console.log('data: ' + data);
      // console.log("Added item:", JSON.stringify(data, null, 2));
      res.send('success');
    }
  });
});

app.get('/query/full', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // url takes in a parameter after 'dynamo', 'Name=<this value below>'
  const name = req.query.Name;
  // .pretty() formats the query results
  
  let params = {
    TableName: 'css436-program4-table',
    ExpressionAttributeNames: { 
      "#n" : "Name" // giving Name an allias because it is a reserved parameter
    },
    KeyConditionExpression: '#n = :name1',
    ExpressionAttributeValues: {
      ':name1': name // maps the name we recieved to the value above
    }
  };

  DOC_CLIENT.query(params, function(err, data) {
    if (err) {
      console.log(err);
      const RESPONSE = {
        "error": "No Entries in the Phone Book Match Your Query"
      }
      res.send(RESPONSE);
    } else { 
      res.send(data);
    }
 });
});


/**
 * In params expressionattributenames maps an allias to a column name, filterexpression
 * maps the allias to what we want the value to be called, and expressionattributevalues
 * sets the value of the line above.
 */
app.get('/query/first', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // url takes in a parameter after 'dynamo', 'Name=<this value below>'
  const name = req.query.Name;
  // .pretty() formats the query results
  
  let params = {
    TableName: 'css436-program4-table',
    ExpressionAttributeNames: {
      '#fn': "First_Name",
    },
    FilterExpression: '#fn = :name1',
    ExpressionAttributeValues: {
      ':name1': name
    }
  }

  // .scan(params) needs to have a callback function with err and data as the parameters.
  // in the anonomous function, can use those parameters and whatever else we want to add our own funcitonality
  DOC_CLIENT.scan(params, function(err, data) {
    onScan(err, data, res);
  });
});

app.get('/query/last', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const name = req.query.Name;
  
  let params = {
    TableName: 'css436-program4-table',
    ExpressionAttributeNames: {
      '#ln': "Last_Name",
    },
    FilterExpression: '#ln = :name1',
    ExpressionAttributeValues: {
      ':name1': name
    }
  }

  DOC_CLIENT.scan(params, function(err, data) {
    onScan(err, data, res);
  });
});

function onScan(err, data, res) {
  if (err) {
    let object = {};
    res.send(object);
    console.log(err);
  } else {
    res.send(data);
  }
}

/**
 * Removes all entries from the dynamo db table. Takes in a name of a person as a parameter
 * (gets called once for each person) and calls the function below to delete them.-
 */
app.post('/delete/dynamo', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const NAME = req.body.name;

  try {
    await deleteItemFromDynamo(NAME);
    res.send('deleted');
  } catch (err) {
    res.send('failed');
  }
});

/**
 * Helper for the app.post route above. Takes in the name of an item to delet its row from
 * the dynamo db table as the primary key. docclient has a function called delete which removes
 * the whole row given a primary key and the table name as parameters.
 * @param {String} name - name of the person who we are deleting 
 */
async function deleteItemFromDynamo(name) {
  let params = {
    TableName: 'css436-program4-table',
    Key: {
      "Name": name
    }
  };

  try {
    await DOC_CLIENT.delete(params).promise();
  } catch (err) {
    console.log(err);
  }
}