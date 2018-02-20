# advertisement-scanner-file-async

Basic Nodejs example of using [Axiomware's](http://www.axiomware.com) [netrunr-gapi-async](http://www.axiomware.com/apidocs/index.html) Javascript SDK to scan for advertisements and save to CSV file

Program to illustrate Netrunr API functions. The program will perform the following functions: 1) connect to your account, 2) list all gateways associated with this account, 3) connect to the selected gateway from the list, 4) open a network connection, 5) get version information from the gateway, 6) initiate advertisement scan and print(to screen and file) key information from the advertisement packets, 7) Step 6 is repeated until user ends the program by using CTRL-C.


**This example uses promises and async/await functionality present in Nodejs version 8.+**.

## SDK, Documentation and examples
- [Netrunr B24C API Documentation](http://www.axiomware.com/apidocs/index.html)
- [Netrunr-gapi SDK](https://github.com/axiomware/netrunr-gapi-js)
  - [List of Netrunr-gapi examples](https://github.com/axiomware/list-of-examples-netrunr-gapi)
- [Netrunr-gapi-async SDK](https://github.com/axiomware/netrunr-gapi-async-js)
  - [List of Netrunr-gapi-async examples](https://github.com/axiomware/list-of-examples-netrunr-gapi-async)

## Requirements

- [Netrunr B24C](http://www.axiomware.com/netrunr-b24c-product.html) gateway
- Axiomware cloud account. See the Netrunr [quick start guide](http://www.axiomware.com/page-netrunr-b24c-qs-guide.html) on creating an account.
- Nodejs (see [https://nodejs.org/en/](https://nodejs.org/en/) for download and installation instructions)
  - Nodejs version 8.x.x is required due to the use of promises/async/await
- NPM (Node package manager - part of Nodejs)   
- Windows, MacOS or Linux computer with access to internet
- One or more Bluetooth LE devices that are advertising.

## Installation

Clone the repo

`git clone https://github.com/axiomware/advertisement-scanner-file-async.git`

or download as zip file to a local directory and unzip.

Install all module dependencies by running the following command inside the directory

  `npm install`

## Optional customization before running the program
- If you are not able to locate your device, you can try to scan using the active mode. The Bluetooth®️LE name of some devices is located in advertisement_scan_response. An advertisement_scan_response is obtained only during an active scan.
- Change the content of information printed on the screen by modifying `axAdvExtractData()` function.
```javascript
function axAdvExtractData(advItem) {
    advObj = {
        ts: dateTime(advItem.tss + 1e-6 * advItem.tsus),    //Time stamp
        did: addrDisplaySwapEndianness(advItem.did),        //BLE address
        dt: advItem.dtype,                                  // Adress type
        ev: advItem.ev,                                     //adv packet type
        rssi: advItem.rssi,                                 //adv packet RSSI in dBm
        name: axParseAdvGetName(advItem.adv, advItem.rsp),  //BLE device name
        //adv1: advItem.adv,       //payload of adv packet - uncomment to print on screen
        //rsp1: advItem.rsp,       //payload of rsp packet - uncomment to print on screen
    };
    return advObj;
}
```

## Usage

Run the nodejs application:

    node appAdvScannerFileAsync.js

To exit the program, use:

    CTRL-C  

## Error conditions

- If the program is not able to login, check your credentials.
- If the gateway is not listed in your account, it may not have been successfully provisioned. See the Netrunr [quick start guide](http://www.axiomware.com/page-netrunr-b24c-qs-guide.html) for provisioning the gateway.
- Not able to get version information of the gateway. Check if gateway is powered ON and has access to internet. Also, check if firewall is blocking internet access.

## Contributing

In lieu of a formal style guide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code.
