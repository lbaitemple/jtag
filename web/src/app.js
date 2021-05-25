'use strict';

const util = require('../../lib/ftdi-webusb');
const svf =  require('../../lib/svf-stream');
const lineReader = require('line-reader');

//const ftdi = require('../../lib/ftdi-libusb');
//const jtag = ftdi(options);

const filters = { filters: [{ vendorId: 0x09fb, productId: 0x6001, interfaceClass: 9 }]};

const btn = document.getElementById('connect');

btn.addEventListener('click', async () => {
    try{
        let dev =  await navigator.usb.requestDevice(filters);
        console.log(dev);

        await dev.open();
        console.log(dev);

        if (dev.configuration === null) {
            console.log("configuration");
            await dev.selectConfiguration(1);
        }

        const if0 = dev.configurations[0].interfaces[0];
        console.log(if0.claimed);
        if (if0.claimed === false) {
            console.log("reclaim");
            await dev.claimInterface(0);
        }
        console.log(if0.alternate.endpoints[0]);

        console.log("----------");
        const epIn = if0.alternate.endpoints[0]; // (0x81);
        const epOut = if0.alternate.endpoints[1]; //(0x02);
        console.log("finish endpoint");

        console.log(epOut);
        console.log("cannnot see init");


    } catch (e) {
        // No device was selected.
        console.log("error");
        console.log(e.message);
    }

    const setPortConfig = {
      requestType: 'vendor',
      recipient: 'device',
      request: 0x05,
      value: 0x00,
      index: 0x03
    }

    const openPort = {
      requestType: 'vendor',
      recipient: 'device',
      request: 0x06,

      value: 0x89,
      index: 0x03
    }

    const startPort = {
      requestType: 'vendor',
      recipient: 'device',
      request: 0x08,
      value: 0x00,
      index: 0x03
    }

    const closePort = {
      requestType: 'vendor',
      recipient: 'device',
      request: 0x07,
      value: 0x00,
      index: 0x03
    }

    async function close () {
      let result = await device.controlTransferOut(closePort)
      console.log('close port:', result)
      await device.releaseInterface(0)
      await device.close()
    }



    //console.log(if0);
 /*    const dev = await navigator.usb.requestDevice(filters);
    await dev.open();
    if (dev.configuration === null) {
        await dev.selectConfiguration(1);
    }
    const if0 = dev.configurations[0].interfaces[0];
    if (!if0.claimed) {
        await dev.claimInterface(0);
    }
    console.log(if0);
    const u = util(dev);
    await u.init();
    const epIn = if0.endpoints[0]; // (0x81);
    epOut = if0.endpoints[1]; //(0x02);
    */

});

/* global navigator document */
const btnflash = document.getElementById('flash');


btnflash.addEventListener('click', async () => {

    var selectedFile = document.getElementById('image_file').files[0];
    console.log(selectedFile);
    const reader = new FileReader();


    reader.onload = function(event) {
        var contents = event.target.result;
        console.log("File contents: " + contents);
    };

    reader.onerror = function(event) {
        console.error("File could not be read! Code ");
    };

    reader.readAsText(selectedFile);


});

