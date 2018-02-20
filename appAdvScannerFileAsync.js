// Copyright 2017,2018 Axiomware Systems Inc. 
//
// Licensed under the MIT license <LICENSE-MIT or 
// http://opensource.org/licenses/MIT>. This file may not be copied, 
// modified, or distributed except according to those terms.
//

//Add external modules dependencies
var netrunr = require('netrunr-gapi-async');
var inquirer = require('inquirer');
var chalk = require('chalk');
var figlet = require('figlet');
var fs = require('fs');
var Preferences = require("preferences");
var CLI = require('clui');

//Gobal variables
const gapiAsync = new netrunr('');                      //Create at Netrunr gateway instance(one per gateway)
var prefs = new Preferences('myAdvApp_uniqueID123');    //Preferences are stored in system file
var exitFlag = false;                                   //set flag when exiting
var dataFileHandle = null;                              //Open file for storing adv data, append to existing file
var dataFileWriteHeader = false;                        //Keep track of header writing, only write if new file is created

//User configuration
var userConfig = {           
    'scanPeriod': 1,    // seconds of advertising scan
    'scanMode': 1,      // 1-> active, 0-> passive
};

//Used to monitor for ctrl-c and exit program
process.stdin.resume();//so the program will not close instantly
process.on("SIGINT", function () {
    axShutdown(3, "Received Ctrl-C - shutting down.. please wait");
});

//On exit handler
process.on('exit', function () {
    console.log('Goodbye!');
});

// Ensure any unhandled promise rejections get logged.
process.on('unhandledRejection', err => {
    axShutdown(3, "Unhandled promise rejection - shutting down.. " + + JSON.stringify(err, Object.getOwnPropertyNames(err)));
})

//Application start
console.log(chalk.green.bold(figlet.textSync('NETRUNR GATEWAY', { horizontalLayout: 'default' })));
console.log(chalk.green.bold('Advertisement Scanner (Async version) Application with File Save'));
console.log(chalk.red.bold('Press Ctrl-C to exit'));
main(); // Call main function

/**
 * Main program entry point
 * Using Command Line Interface (CLI), get user credentails
 * 
 */
async function main() {
    try {
        let cred = await axmUIgetAxiomwareCredentials();                        //get user credentials (CLI)
        let ret = await gapiAsync.login({ 'user': cred.user, 'pwd': cred.pwd });//login
        let gwid = await axmUIgetGatewaySelection(ret.gwid);                    //get gateway Selection (CLI)
        if (!gwid)
            await axShutdown(3, 'Shutting down...');                            //Exit program 

        gapiAsync.config({ 'gwid': gwid });                                     //select gateway (CLI)
        await gapiAsync.open({});                                               //open connection to gateway
        gapiAsync.event({ 'did': '*' }, myGatewayEventHandler, null);           //Attach event handlers
        gapiAsync.report({ 'did': '*' }, myGatewayReportHandler, null);         //Attach report handlers

        let ver = await gapiAsync.version(5000);                                //Check gateway version - if gateway is not online(err), exit 
        let scanParams = await axmUIgetScanPeriodType();                        //get scan parameters
        userConfig.scanPeriod = scanParams.period;                        //store var in global for other function calls 
        userConfig.scanMode = scanParams.active;                          //store var in global for other function calls 
        let advLogFileName = await axmUIgetFilename();
        if (advLogFileName) {
            dataFileWriteHeader = fs.existsSync(advLogFileName) ? ((fs.statSync(advLogFileName).size > 10)?false:true) : true;//Write file header if brand new file
            dataFileHandle = fs.createWriteStream(advLogFileName, { 'flags': 'a' });//Open file for storing adv data, append to existing file
            dataFileHandle.on('error', async (err) => {await axShutdown(3, 'File error: ' + JSON.stringify(err, Object.getOwnPropertyNames(err)));});    
        }
        await axScanForBLEdev(userConfig.scanMode, userConfig.scanPeriod );//scan for BLE devices
    } catch (err) {
        await axShutdown(3, 'Error! Exiting... ' + JSON.stringify(err, Object.getOwnPropertyNames(err)));//Error - exit
    }
}

/**
 * Scan for BLE devices and generate "scan complete" event at the end of scan
 * 
 * @param {number} scanMode - Scan mode  1-> active, 0-> passive
 * @param {number} scanPeriod - Scan period in seconds
 */
async function axScanForBLEdev(scanMode, scanPeriod) {
    if (!exitFlag) {
        try {
            let ret = await gapiAsync.list({ 'active': scanMode, 'period': scanPeriod });
        } catch (err) {
            console.log('List failed' + JSON.stringify(err, Object.getOwnPropertyNames(err)));
        }
    }
};

/**
 * Event handler (for scan complete, disconnection, etc events)
 * 
 * @param {Object} iobj - Event handler object - see API docs
 */
async function myGatewayEventHandler(iobj) {
    switch (iobj.event) {
        case 1: //disconnect event
            console.log('Device disconnect event' + JSON.stringify(iobj, null, 0));
            break;
        case 39://Scan complete event
            await axScanForBLEdev(userConfig.scanMode, userConfig.scanPeriod );//scan for BLE devices
            break;
        default:
            console.log('Other unhandled event [' + iobj.event + ']');
    }
}

/**
 * Report handler (for advertisement data, notification and indication events)
 * 
 * @param {Object} iobj - Report handler object - see API docs 
 */
function myGatewayReportHandler(iobj) {
    switch (iobj.report) {
        case 1://adv report
            var advPrnArray = axParseAdv(iobj.nodes);
            axPrintAdvArrayScreen(advPrnArray);//Print data to screen 
            dataFileWriteHeader = axPrintAdvArrayFile(dataFileHandle, advPrnArray, dataFileWriteHeader);//print to file
            break;
        case 27://Notification report
            console.log('Notification received: ' + JSON.stringify(iobj, null, 0))
            break;
        default:
            console.log('(Other report) ' + JSON.stringify(iobj, null, 0))
    }
}

/**
 * Call this function to gracefully shutdown all connections
 * 
 * @param {number} retryCount - Number of retry attempts 
 * @param {string} prnStr - String to print before exit  
 */
async function axShutdown(retryCount, prnStr) {
    console.log(prnStr);
    exitFlag = true;
    if (gapiAsync.isOpen) {//stop scanning
        if (gapiAsync.isGWlive) {//only if gw is alive
            try {
                let ret = await gapiAsync.list({ 'active': userConfig.scanMode, 'period': 0 });//stop scan
                let cdev = await gapiAsync.show({});
                if (cdev.nodes.length > 0) {
                    await gapiAsync.disconnect({ did: '*' });
                }
            } catch (err) {
                console.log('Error' + JSON.stringify(err, Object.getOwnPropertyNames(err)));
                if (retryCount > 0)
                    setTimeout(async () => { await axShutdown(retryCount--, retryCount + ' Shutdown...') }, 100);
            }
        }
        await gapiAsync.close({});
    }
    if (gapiAsync.isLogin) {
        await gapiAsync.logout({});//logout
    }
    if (dataFileHandle)
        dataFileHandle.end();//clsoe data file
    process.exit()
};

/**
 * Get user credentails from command line interface (CLI)
 * 
 * @returns {Object} username and password
 */
async function axmUIgetAxiomwareCredentials() {
    var questions = [
        {
            name: 'user',
            type: 'input',
            message: 'Enter your Axiomware account username(e-mail):',
            default: () => { return prefs.user ? prefs.user : null; },//Use previously stored username
            validate: (email) => { return validateEmail(email) ? true : 'Please enter valid e-mail address'; }
        },
        {
            name: 'pwd',
            type: 'password',
            message: 'Enter your password:',
            default: () => { return prefs.pwd ? prefs.pwd : null; },//Use previously stored password(see comment below)
            validate: (value) => { return (value.length > 0) ? true : 'Please enter your password'; }
        }
    ];

    let answer = await inquirer.prompt(questions);
    prefs.user = answer.user;
    //prefs.pwd = answer.pwd; //Don't store password for security reasons. Enable this during development for convenience
    return { user: answer.user, pwd: answer.pwd };
}

/**
 * Get user choice of gateway selection (CLI)
 * 
 * @param {string []} gwidList - List of gateways
 * @returns {string} selected gateway
 */
async function axmUIgetGatewaySelection(gwidList) {
    var choice_ext = gwidList;//gwidList;
    choice_ext.push('Exit');
    var questions = [
        {
            type: 'list',
            name: 'gwid',
            message: 'Login success! Select the Netrunr gateway for connection:',
            choices: choice_ext,
        }
    ];
    let answers = await inquirer.prompt(questions);
    if (answers.gwid == 'Exit')
        return null;
    else
        return answers.gwid;
}

/**
 * get user choice of scan type period (CLI)
 * 
 * @returns {Object} type and scan period in seconds 
 */
async function axmUIgetScanPeriodType() {
    var questions = [
        {
            name: 'type',
            type: 'list',
            message: 'Connection open success! Enter scan type:',
            choices: [{ name: 'Active', value: 1 }, { name: 'Passive', value: 0 }]
        },
        {
            name: 'period',
            type: 'input',
            message: 'Enter scan period (seconds):',
            default: 1,
            validate: (value) => { return ((parseInt(value) != NaN) && (parseInt(value) >= 0)) ? true : 'Please enter scan period in seconds'; },
        }
    ];

    let answers = await inquirer.prompt(questions);
    return { 'active': answers.type, 'period': parseInt(answers.period) }
}

/**
 * get user choice of file name (CLI)
 * 
 * @returns {string | null} filename 
 */
async function axmUIgetFilename() {
    var questions = [
        {
            name: 'logFileState',
            type: 'list',
            message: 'Save advertisement data to file?',
            choices: [{ name: 'Yes', value: true }, { name: 'No', value: false }],
        },
        {
            name: 'logFileName',
            type: 'input',
            message: 'Enter file name for storing data:',
            default: () => { return prefs.dataFileName ? prefs.dataFileName : null },
            when: (answers) => { return answers.logFileState; },//Execute this question only if previous answer is true
        }
    ];

    let answers = await inquirer.prompt(questions);
    if(answers.logFileState)
        prefs.dataFileName = answers.logFileName;
    return answers.logFileState ? answers.logFileName : null;
}

// Utitlity Functions

/**
 * Format adv packets to print to screen using console.log
 * 
 * @param {Object[]} advArray - Array of advertsisement objects from report callback
 */
function axPrintAdvArrayScreen(advArray) {
    for (var i = 0; i < advArray.length; i++) {
        console.log(JSON.stringify(advArray[i], null, 0));
    }
}

/**
 * Format adv packets to print to file using fs
 *
 * @param {string | null} fileHandle - filehandle
 * @param {Object[]} advArray - Array of advertsisement objects from report callback
 * @param {boolean} writeHeaderFlag - write csv file header if true
 * @returns {boolean} flag set to false to prevent header write on next call
 */
function axPrintAdvArrayFile(fileHandle, advArray, writeHeaderFlag) {
    var str = "";
    if (fileHandle) {
        for (var i = 0; i < advArray.length; i++) {
            console.log(JSON.stringify(advArray[i], null, 0));
            if (writeHeaderFlag) {
                str = "";
                for (var key in advArray[i]) {
                    if (advArray[i].hasOwnProperty(key)) {
                        str += key + ','
                    }
                }
                fileHandle.write(str.slice(0, -1) + '\n');//write CSV header one time
                writeHeaderFlag = false;
            }
            str = "";
            for (var key in advArray[i]) {
                if (advArray[i].hasOwnProperty(key)) {
                    str += advArray[i][key] + ','
                }
            }
            fileHandle.write(str.slice(0, -1) + '\n');//write CSV header one time
        }
        return false;//Use this value to update writeHeaderFlag in calling function
    }
}

/**
 * Parse advertisement packets
 * 
 * @param {Object[]} advArray - Array of advertsisement objects from report callback
 * @returns 
 */
function axParseAdv(advArray) {
    var advArrayMap = advArray.map(axAdvExtractData);//Extract data
    var advArrayFilter = advArrayMap.filter(axAdvMatchAll);//Filter adv
    return advArrayFilter;
}

/**
 * Function to extract advertisement data
 * 
 * @param {Object} advItem - Single advertisement object
 * @returns {Object} advObj - Single parsed advertisement data object
 */
function axAdvExtractData(advItem) {
    advObj = {
        ts: dateTime(advItem.tss + 1e-6 * advItem.tsus),    //Time stamp
        did: addrDisplaySwapEndianness(advItem.did),        //BLE address
        dt: advItem.dtype,                                  // Adress type
        ev: advItem.ev,                                     //adv packet type
        rssi: advItem.rssi,                                 //adv packet RSSI in dBm
        name: axParseAdvGetName(advItem.adv, advItem.rsp),  //BLE device name
        //adv1: JSON.stringify(advItem.adv, null, 0),       //payload of adv packet
        //rsp1: JSON.stringify(advItem.rsp, null, 0),       //payload of rsp packet
    };
    return advObj;
}

/**
 * Function to match all devices(dummy)
 * 
 * @param {any} advItem 
 * @returns {boolean} - true if advertsiment has to be retained
 */
function axAdvMatchAll(advItem) {
    return (true);
}

/**
 * Function to match TI sensorTag, see http://processors.wiki.ti.com/index.php/CC2650_SensorTag_User%27s_Guide
 * 
 * @param {any} advItem 
 * @returns {boolean} - true if advertsiment has to be retained
 */
function axAdvMatchSensorTag(advItem) {
    return (advItem.name == "CC2650 SensorTag");
}

/**
 * Get device name from advertisement packet
 * 
 * @param {Object} adv - Advertisement payload
 * @param {Object} rsp - Scan response payload
 * @returns {string} - Name of the device or null if not present
 */
function axParseAdvGetName(adv, rsp) {
    var didName = '';
    for (var i = 0; i < adv.length; i++) {
        if ((adv[i].t == 8) || (adv[i].t == 9)) {
            didName = adv[i].v;
            return didName;
        }
    }
    for (var i = 0; i < rsp.length; i++) {
        if ((rsp[i].t == 8) || (rsp[i].t == 9)) {
            didName = rsp[i].v;
            return didName;
        }
    }
    return didName;
}

/**
 * Convert unix seconds to time string - local time (yyyy-mm-ddThh:mm:ss.sss).
 * 
 * @param {Number} s - Number is Unix time format
 * @returns {string} - in local time format
 */
function dateTime(s) {
    var d = new Date(s*1000);
    var localISOTime = new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, -1);
    return localISOTime;
}

/**
 * Validate email
 * 
 * @param {string} email - string in valid email format
 * @returns boolean - true if valid email address based on RegEx match
 */
function validateEmail(email) {
    var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
}

/**
 * Swap endianness of a hex-string 
 * 
 * @param {string} hexStr - Hex string(make sure length is even)
 * @returns {string} 
 */
function swapEndianness(hexStr) {
    if (hexStr.length > 2)
        return hexStr.replace(/^(.(..)*)$/, "0$1").match(/../g).reverse().join("");
    else
        return hexStr
}

/**
 * Swap endianness of a hex-string. Format it to standard BLE address style
 * 
 * @param {string} hexStr - Hex string(make sure length is even) 
 * @returns {string}
 */
function addrDisplaySwapEndianness(hexStr) {
    if (hexStr.length > 2)
        return hexStr.replace(/^(.(..)*)$/, "0$1").match(/../g).reverse().join(":").toUpperCase();
    else
        return hexStr
}