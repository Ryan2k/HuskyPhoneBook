"use-strict";

window.addEventListener("load", onLoad);
let firstIteration = true; // used to add listeners to query and clear if its the first iteration
let queryCount = 0;
let primaryKeys = [];

/**
 * When the web page loads, the event listener triggers this function which
 * adds event listeners and functions to all 3 of the buttons on the page.
 */
function onLoad() {
  const LOAD_BTN = document.getElementById('load-data-btn');
  LOAD_BTN.addEventListener("click", loadData);
}

/**
 * Triggers when the "Load Data" button is clicked. First collects the text file
 * given by Dr. Dimpsey with the initial data in the helper function below, then sends
 * the data as a text file to an S3 bucket and parses the information to upload to DynamoDB.
 * Once the data is loaded, hides the button and unhides the form for queries along with the
 * button to clear the data.
 */
async function loadData() {
  const TEXT_DATA = await getData();
  sendToS3(TEXT_DATA);

  // Splits the text into lines, each of which will be a dynamo entry
  const UNFORMATTED_DATA_ENTRIES = TEXT_DATA.split('\n');

  // cleans up each row of extra characters and removes empty lines
  const DATA_ENTRIES = cleanData(UNFORMATTED_DATA_ENTRIES);

  // uses dom elements to store the data onto the screen
  appendData(DATA_ENTRIES);

  // store all the primary keys as a global variable
  storePrimaryKeys(DATA_ENTRIES);

  // Loops through the lines and calls the function to parse and create an entry
  for (let i = 0; i < DATA_ENTRIES.length; i++) {
    sendEntryToDynamo(DATA_ENTRIES[i]);
  }

  // now that data is loaded, should hide the button
  const LOAD_BTN = document.getElementById('load-data-btn');
  LOAD_BTN.classList.add('hidden');

  // once data is loaded, should show the clear data, and query options
  const CLEAR_DATA = document.getElementById('clear-data');
  CLEAR_DATA.classList.remove('hidden');

  const QUERY_CONTAINER = document.getElementById('container');
  QUERY_CONTAINER.classList.remove('hidden');

  // add event listeners to newly appeared buttons
  // global variable of firstIteration lets us know if it is the first iteration
  // which is the only time we need to add event listeners because otherwise the buttons
  // already have them and are just hidden
  if (firstIteration) {
    const CLEAR_DATA_BTN = document.getElementById('clear-data-btn');
    CLEAR_DATA_BTN.addEventListener("click", clearData);
    
    const QUERY_FORM = document.getElementById('query-form');
    QUERY_FORM.addEventListener('submit', query);

    firstIteration = false;
  }
}

/**
 * Loops through each entry parsing it for the parameters and sets them into key
 * value pairs in a form to make a post request to the api in app.js which makes an entry
 * to the dynamoDB table I created for this program.
 * I parse by splitting the entry up by spaces and the format will always take the last as the first
 * token, first name as the second, then a random set of key value pairs seperated by an equals sign
 * Example input: Dimpsey Robert id=65764 phone=4528769876 office=trulyhouse
 * @param {String} entry - line of text representing a row in the table
 */
async function sendEntryToDynamo(entry) {
  let entryElements = entry.split(' ');
  const NAME = entryElements[1] + ' ' + entryElements[0];

  let params = new FormData();
  params.append('Name', NAME);
  params.append('First_Name', entryElements[1]);
  params.append('Last_Name', entryElements[0]);

  // entryElements[i] coule be id=65764 which would append to params "id": "65764"
  for (let i = 2; i < entryElements.length; i++) {
    let keyVal = entryElements[i].split('=');
    if (keyVal[0] === '' || keyVal[0] === '%0D') continue; // if there is accidentally an extra space between tokens
    // if(i === entryElements.length - 1) keyVal[1] = keyVal[1].substring(0, keyVal[1].length - 1); // removes /r from last token in line
    params.append(keyVal[0], keyVal[1]);
  }

  try {
    const RESPONSE = await fetch('/upload/dynamo', {
      method: 'POST',
      body: params
    });

    await statusCheck(RESPONSE);
  } catch (error) {
    console.log(error);
  }
}

/**
 * Sends a get request to the url holding the text file professor uploaded.
 * @returns {String} - text object with the exact format of the professors input
 */
async function getData() {
  try {
    const RESPONSE = await fetch('https://s3-us-west-2.amazonaws.com/css490/input.txt');
    await statusCheck(RESPONSE);
    const TEXT = RESPONSE.text();
    return TEXT;
  } catch (error) {
    console.log(error);
  }
}

/**
 * Takes in the input from the function above and sends it to the post API I created in app.js
 * which creates a file with the contents of the parameter passed in, and sends it to the S3
 * bucket I created for this project.
 * @param {String} TEXT 
 */
async function sendToS3(TEXT) {
  let params = new FormData();
  params.append('text', TEXT);

  try {
    const RESPONSE = await fetch('/upload/s3', {
      method: 'POST',
      body: params
    });

    await statusCheck(RESPONSE);
  } catch (error) {
    console.log(error);
  }
}

/**
 * Takes in an array of each line of the text got from the professors input.txt
 * containing each entry. Splits the entry into tokens and uses the function below
 * to append each entry to the table in the html.
 * @param {List of Strings} dataEntries - list of each line representing an entry
 */
function appendData(dataEntries) {
  const DATA_TABLE_CONTAINER = document.getElementById('data-table-container');
  DATA_TABLE_CONTAINER.classList.remove('hidden');

  // this function will now just be displaying a box to show that the data is loaded
  const RAW_ENTRIES = document.getElementById('raw-entries');

  for (let i = 0; i < dataEntries.length; i++) {
    let listItem = document.createElement('li');
    listItem.innerHTML = dataEntries[i];
    RAW_ENTRIES.appendChild(listItem);
  }

  /* dont need this anymore as I wont be displaying the data
  const DATA_TABLE = document.getElementById('data-table');
  const DATA_TABLE_CONTAINER = document.getElementById('data-table-container');
  DATA_TABLE_CONTAINER.classList.remove('hidden');

  for (let i = 0; i < dataEntries.length; i++) {
    let dataElements = dataEntries[i].split(' ');
    let newRow = createRow(dataElements);
    DATA_TABLE.appendChild(newRow);
  }
  */
}

/**
 * When the clear data button is pressed, this function will call other functions to
 * remove the text file from the S3 bucket and the table from dynamodb, then revert the
 * web page back to having the load data button available and hiding clear data button.
 */
async function clearData() {
  removeFromS3();
  removeEntriesFromDynamo();

  // hide the clear data and query buttons once the data is cleared from db's
  const CLEAR_DATA = document.getElementById('clear-data');
  CLEAR_DATA.classList.add('hidden');

  const QUERY_CONTAINER = document.getElementById('container');
  QUERY_CONTAINER.classList.add('hidden');

  /* 
   * remove the added data entries from the data table by looping through all of its
   * children we created when appending td's. Doesnt delete the first one as those are
   * column headers (such as name, id, phone number, etc.)
   */
  const RAW_ENTRIES = document.getElementById('data-table');

  while (RAW_ENTRIES.children.length > 1) {
    RAW_ENTRIES.removeChild(DATA_TABLE.children[1]);
  }

  // hide the remainder of the data table
  const DATA_TABLE_CONTAINER = document.getElementById('data-table-container');
  DATA_TABLE_CONTAINER.classList.add('hidden');

  // unhide load button
  const LOAD_BUTTON = document.getElementById('load-data-btn');
  LOAD_BUTTON.classList.remove('hidden');

  // hide query history and remove its children except for the h2 that comes standard
  const QUERY_HISTORY = document.getElementById('query-history');

  while (QUERY_HISTORY.children.length > 1) {
    QUERY_HISTORY.removeChild(QUERY_HISTORY.children[1]);
  }

  QUERY_HISTORY.classList.add('hidden');
  
  // reset query count
  queryCount = 0;
}

/**
 * Gets called in the function above to remove the data we sent earlier on load
 * from the S3 bucket. Does this by sending a GET request to the /delete/s3 API
 * created in app.js which calls a function to do so. Even though updating a database,
 * didnt need to pass in any body so a GET request works fine and POST isnt needed.
 */
async function removeFromS3() {
  try {
    const RESPONSE = await fetch('/delete/s3');
    statusCheck(RESPONSE);
  } catch (error) {
    console.log(error);
  }
}

/**
 * When the "Search" button is pressed, queries the dynamodb table for a person
 * with the provided name by the form that was just submitted. Checks to see if
 * there was a value for first name and last name, if so, queries by full name, otherwise,
 * queries by whichever name exists. If neither do, gives an error message and doesnt query.
 * @param {Event} event - form was submitted 
 */
async function query(event) {
  event.preventDefault();

  const FIRST_NAME = document.getElementById('first-name').value;
  const LAST_NAME = document.getElementById('last-name').value;

  // Object returned by the API calls containing all key value pairs the
  // queried result recieved from the API.
  let JSON;

  const EMPTY_QUERY_ERROR = document.getElementById('empty-query-error');
  if(FIRST_NAME.length > 0 && LAST_NAME.length > 0) {
    const FULL_NAME = FIRST_NAME + ' ' + LAST_NAME;
    JSON = await queryFullName(FULL_NAME);
    appendQuery(JSON, FULL_NAME);
  } else if (FIRST_NAME.length > 0) {
    JSON = await queryFirstName(FIRST_NAME);
    appendQuery(JSON, FIRST_NAME);
  } else if (LAST_NAME.length > 0) {
    JSON = await queryLastName(LAST_NAME);
    appendQuery(JSON, LAST_NAME);
  } else {
    // both parameters were empty so unhides the error message and returns
    EMPTY_QUERY_ERROR.classList.remove('hidden');
    return;
  }

  // if it didnt hit the else case, hides the error if it became unhidden in another query
  EMPTY_QUERY_ERROR.classList.add('hidden');

  // unhide the query history
  const QUERY_HISTORY = document.getElementById('query-history');
  QUERY_HISTORY.classList.remove('hidden');
}

/**
 * Gets called by query if both firstname and lastname form parameters were not null.
 * Sends a get request with the name of the person we are querying for to the query/all
 * api in app.js
 * @param {String} FULL_NAME - Full name of person being queried.
 */
async function queryFullName(FULL_NAME) {
  try {
    // in get request to send information have to send it through the url
    // '?' means parameters and then parameters exist after the '?'
    const RESPONSE = await fetch('/query/full?Name=' + FULL_NAME);
    statusCheck(RESPONSE);
    const JSON = await RESPONSE.json();
    return JSON.Items;
  } catch (err) {
    console.log(err);
  }
}

// same thing as function above, just for first name
async function queryFirstName(firstName) {
  try {
    const RESPONSE = await fetch('/query/first?Name=' + firstName);
    statusCheck(RESPONSE);
    const JSON = await RESPONSE.json();
    return JSON.Items;
  } catch (err) {
    console.log(err);
  }
}

// same thing as function above, just for last name
async function queryLastName(lastName) {
  try {
    const RESPONSE = await fetch('/query/last?Name=' + lastName);
    statusCheck(RESPONSE);
    const JSON = await RESPONSE.json();
    return JSON.Items;
  } catch (err) {
    console.log(err);
  }
}

/**
 * Every time a query is made, it should be appended to the query-history element.
 * If it did not find the object it was looking for, the JSON_ARRAY will have a length
 * of 0 so I just append an error statement. Otherwise, loop through the Array,
 * each one being a result found by the query, and append all of its keys and values to
 * the entry element via the helper method below, then append that to the query history.
 * @param {Array of JSON Objects} JSON_ARRAY - Key value pairs of all results found and the attributes they have
 * @param {String} queryString - string that made the query
 */
function appendQuery(JSON_ARRAY, queryString) {
  queryCount++;
  const QUERY_HISTORY = document.getElementById('query-history');

  const ENTRY = document.createElement('div');
  ENTRY.classList.add('query-entry');
  const FIRST_LINE = document.createElement('pre');
  const FIRST_LINE_TEXT = document.createTextNode('Query ' + queryCount + ': ' + queryString + '\n');
  FIRST_LINE.appendChild(FIRST_LINE_TEXT);
  ENTRY.appendChild(FIRST_LINE);

  if (JSON_ARRAY.length == 0) {
    const SECOND_LINE = document.createElement('pre');
    const SECOND_LINE_TEXT = document.createTextNode('No Entries in the Phone Book The Name ' + queryString);
    SECOND_LINE.appendChild(SECOND_LINE_TEXT);
    ENTRY.appendChild(SECOND_LINE);
  } else {
    const SECOND_LINE = document.createElement('pre');
    let text;
    if (JSON_ARRAY.length == 1) {
      text = '  Found 1 Entry in the Phone Book by the Query: ' + queryString;
    } else {
      text = '  Found ' + JSON_ARRAY.length + ' Entries in the Phone Book by the Query: ' + queryString;
    }
    const SECOND_LINE_TEXT = document.createTextNode(text);
    SECOND_LINE.appendChild(SECOND_LINE_TEXT);
    ENTRY.appendChild(SECOND_LINE);
    
    for (let i = 0; i < JSON_ARRAY.length; i++) {
      let headerLine = document.createElement('pre');
      let headerLineText = document.createTextNode('    Result ' + (i + 1) + ': ');
      headerLine.appendChild(headerLineText);
      ENTRY.appendChild(headerLine);
      helperToAppendMultipleEntires(JSON_ARRAY[i], ENTRY);
    }
  }

  QUERY_HISTORY.appendChild(ENTRY);
}

/**
 * Helper method for function above, takes in a single JSON Object with the key-val pairs
 * of the attributes stored for that person, loops through all of its keys appending them to
 * a new line, then appends the lines to an entry.
 * @param {JSON Object} JSON - One result found by the query
 * @param {DOM} ENTRY - DOM element created to hold the query
 */
function helperToAppendMultipleEntires(JSON, ENTRY) {
  for (var key in JSON) {
    if (JSON.hasOwnProperty(key)) {
      let nextLine = document.createElement('pre');
      let nextLineText = document.createTextNode('      ' + key + ': ' + JSON[key]);
      nextLine.appendChild(nextLineText);
      ENTRY.appendChild(nextLine);
    }
  }
}

/**
 * Removes all entries from the dynamodb table by calling the delete api in app.js
 * does this by looping through all the names stored in the primaryKeys global array.
 * After its done it whipes the array as there are no more entries but gets re-populated
 * once the load button gets hit again.
 */
async function removeEntriesFromDynamo() {
  for (let i = 0; i < primaryKeys.length; i++) {
    await singleDynamoEntryRemoval(primaryKeys[i]);
  }

  primaryKeys = [];
}

/**
 * Helper for the function above making a post request to the delete from dynamodb api in app.js.
 * The API needs a single parameter which is the primary key for a row (a string of name)
 * @param {String} name - primary key for a row we are deleting. 
 */
async function singleDynamoEntryRemoval(name) {
  let params = new FormData();
  params.append("name", name);

  try {
    const RESPONSE = await fetch('/delete/dynamo', {
      method: 'POST',
      body: params
    });

    await statusCheck(RESPONSE);
  } catch (err) {
    console.log(err);
  }
}

function cleanData(entries) {
  let cleanedEntries = [];

  for(let i = 0; i < entries.length; i++) {
    if (entries[i].trim() !== '') {
      cleanedEntries.push(entries[i]);
    }
  }

  return cleanedEntries;
}

/**
 * Takes in an array of entries and adds all the first names to the primaryKeys array
 * which is globaly held. Main purpose is for deletion from the dynamoDB table.
 * @param {Array} Entries - Array of Strings of each entry line
 */
function storePrimaryKeys(Entries) {
  for (let i = 0; i < Entries.length; i++) {
    let nameElements = Entries[i].split(" ");
    let currName = nameElements[1] + ' ' + nameElements[0];
    primaryKeys.push(currName);
  }
}

/**
 * Called every time a post or get request is made. Takes in the response given by the API
 * and checks to see if there is a 200 status code (success). If not, throws an error.
 * @param {Object} res - response from an API call
 * @returns {Object} - just returns the response it took in if successful.
 */
async function statusCheck(res) {
  if (!res.ok) {
    throw new Error(await res.test());
  }
  return res;
}

/* used this to display the table but now that data is changing, it is irrelavent
function createRow(data) {
    const MAP = new Map();
    const NEW_ROW = document.createElement('tr');
  
    // name always comes first so dont have to map it
    const name = data[1] + ' ' + data[0];
    NEW_ROW.id = name; // to help query
    const NAME_ENTRY = document.createElement('td');
    NAME_ENTRY.innerHTML = name;
    NEW_ROW.appendChild(NAME_ENTRY);
  
    for (let i = 2; i < data.length; i++) {
      let keyVal = data[i].split('=');
      MAP.set(keyVal[0], keyVal[1]);
    }
  
    const ID_ENTRY = document.createElement('td');
    if (MAP.has('id')) {
      ID_ENTRY.innerHTML = MAP.get('id');
      ID_ENTRY.classList.add('highlight');
    } else {
      ID_ENTRY.innerHTML = 'N/A';
    }
    NEW_ROW.appendChild(ID_ENTRY);
  
    const PHONE_ENTRY = document.createElement('td');
    if (MAP.has('phone')) {
      PHONE_ENTRY.innerHTML = MAP.get('phone');
      PHONE_ENTRY.classList.add('highlight');
    } else {
      PHONE_ENTRY.innerHTML = 'N/A';
    }
    NEW_ROW.appendChild(PHONE_ENTRY);
  
  
    const AGE_ENTRY = document.createElement('td');
    if (MAP.has('age')) {
      AGE_ENTRY.innerHTML = MAP.get('age');
      AGE_ENTRY.classList.add('highlight');
    } else {
      AGE_ENTRY.innerHTML = 'N/A';
    }
    NEW_ROW.appendChild(AGE_ENTRY);
  
  
    const W_ENTRY = document.createElement('td');
    if (MAP.has('weight')) {
      W_ENTRY.innerHTML = MAP.get('weight');
      W_ENTRY.classList.add('highlight');
    } else {
      W_ENTRY.innerHTML = 'N/A';
    }
    NEW_ROW.appendChild(W_ENTRY);
  
  
    const IQ_ENTRY = document.createElement('td');
    if (MAP.has('iq')) {
      IQ_ENTRY.innerHTML = MAP.get('iq');
      IQ_ENTRY.classList.add('highlight');
    } else {
      IQ_ENTRY.innerHTML = 'N/A';
    }
    NEW_ROW.appendChild(IQ_ENTRY);
  
    const GENDER_ENTRY = document.createElement('td');
    if (MAP.has('gender')) {
      if (MAP.get('gender')[0] === 'm' || MAP.get('gender')[0] === 'M') {
        GENDER_ENTRY.innerHTML = 'Male';
      } else {
        GENDER_ENTRY.innerHTML = 'Female';
      }
      GENDER_ENTRY.classList.add('highlight');
    } else {
      GENDER_ENTRY.innerHTML = 'N/A';
    }
    NEW_ROW.appendChild(GENDER_ENTRY);
  
    const N_ENTRY = document.createElement('td');
    if (MAP.has('nationality')) {
      N_ENTRY.innerHTML = MAP.get('nationality');
      N_ENTRY.classList.add('highlight');
    } else {
      N_ENTRY.innerHTML = 'N/A';
    }
    NEW_ROW.appendChild(N_ENTRY);
  
    const M_ENTRY = document.createElement('td');
    if (MAP.has('military')) {
      M_ENTRY.innerHTML = MAP.get('military');
      M_ENTRY.classList.add('highlight');
    } else {
      M_ENTRY.innerHTML = 'N/A';
    }
    NEW_ROW.appendChild(M_ENTRY);
  
    const H_ENTRY = document.createElement('td');
    if (MAP.has('hobby')) {
      H_ENTRY.innerHTML = MAP.get('hobby');
      H_ENTRY.classList.add('highlight');
    } else {
      H_ENTRY.innerHTML = 'N/A';
    }
    NEW_ROW.appendChild(H_ENTRY);
  
    const U_ENTRY = document.createElement('td');
    if (MAP.has('university')) {
      U_ENTRY.innerHTML = MAP.get('university');
      U_ENTRY.classList.add('highlight');
    } else {
      U_ENTRY.innerHTML = 'N/A';
    }
    NEW_ROW.appendChild(U_ENTRY);
  
    const O_ENTRY = document.createElement('td');
    if (MAP.has('office')) {
      O_ENTRY.innerHTML = MAP.get('office');
      O_ENTRY.classList.add('highlight');
    } else {
      O_ENTRY.innerHTML = 'N/A';
    }
    NEW_ROW.appendChild(O_ENTRY);
  
    return NEW_ROW;
} */