'use strict';

const usb = require('usb');

const ProgressBar = require('progress');

const mv = require('./ftdi-jtag-state-change');
const initMPSSE = require('./ftdi-mpsse-init');
const fdiv = require('./ftdi-mpsse-divider');
const ftd = require('./ftdi-flags');
const genCfgOut = require('./gen-cfg-out');
const genDatOut = require('./gen-dat-out');
const getStringDescriptor = require('./get-string-descriptor');
const str2buf = require('./str2buf');

module.exports = (options) => {
    let config = {};

    const cfgOut = genCfgOut(config);
    const datOut = genDatOut(config);

    const datInp = len => new Promise(resolve => {
        config.epIn.transfer(len, err => {
            if (err) { throw err; }
            resolve();
        });
    });

    const close = async () => {
        config.dev.close();
    };

    const init = async () => {
        await cfgOut(ftd.FTDI_CTL_RESET, 0);
        await cfgOut(ftd.FTDI_CTL_SET_BITMODE, 0x0000);
        await cfgOut(ftd.FTDI_CTL_SET_BITMODE, 0x0200);
        await cfgOut(ftd.FTDI_CTL_SET_EVENT_CH, 0);
        await cfgOut(ftd.FTDI_CTL_SET_ERROR_CH, 0);
        await datOut(fdiv(options.freq).concat(initMPSSE));
    };

    const open = async () => {

        const dlist = usb.getDeviceList();
        for (let i = 0; i < dlist.length; i++) {
            const curdev = dlist[i];
            const descr = curdev.deviceDescriptor;
            const iSerialNumber = descr.iSerialNumber;
            if (descr.idVendor === 0x09fb) {
                const optSerialDiv = parseInt(options['serial-div']);
                // generally used for hexnumber representation
                const optSerialNumber = parseInt(options['serial-number'], 16);
                curdev.open();
                const serialNumberString = await getStringDescriptor(curdev, iSerialNumber);
                let serialNumber = parseInt(serialNumberString, 16);
                if (!isNaN(optSerialDiv)) {
                    serialNumber = serialNumber % optSerialDiv;
                }
                if (!isNaN(optSerialNumber)) {
                    if (serialNumber === optSerialNumber) {
                        config.dev = curdev;
                    }
                } else {
                    config.dev = curdev;
                }
            }
        }

        const interf = config.dev.interfaces[options.channel];
        config.epIn = interf.endpoints[0]; // (0x81);
        config.epOut = interf.endpoints[1]; //(0x02);

        if (interf.isKernelDriverActive()) {
            interf.detachKernelDriver();
        }
        config.channel = options.channel;

        interf.claim();

        await init();
    };

    const TMS = async (from, to) => {
        if (from !== to) {
            await datOut(mv[from][to]);
        }
    };

    const TCK = async bitLen => {
        const byteLen = bitLen >> 3;
        const bitHead = bitLen & 0x7;
        if (bitHead > 0) {
            let buf = Buffer.from('130000', 'hex');
            buf[1] = bitHead - 1;
            await datOut(buf);
        }

        if (byteLen > 0) {
            let buf = Buffer.alloc(byteLen + 3);
            buf[0] = 0x11;
            buf[1] = (byteLen - 1) & 0xff;
            buf[2] = ((byteLen - 1) >> 8) & 0xff;
            await datOut(buf);
        }
    };

    const TDI = async (data, bitLen, io, ext) => {
        if (bitLen > 0) {
            const maxBufLen = 0x1000;
            const cmd1 = io ? 0x39 : 0x19;
            const cmd2 = io ? 0x6b : 0x6a;

            const bar = (options.progress && (bitLen > 1000))
                ? new ProgressBar('[:bar] :rate bps :percent :elapsed sec', { total: bitLen })
                : { tick: () => {}};

            while(bitLen > (7 + ext)) {
                let buf, delta = 0;
                if (bitLen > (0xffff << 3)) {
                    delta = maxBufLen << 3;
                    const part = data.slice(-(maxBufLen << 1));
                    data = data.slice(0, -(maxBufLen << 1));
                    buf = str2buf('000000', part);
                    buf[0] = cmd1;
                    buf[1] = 0xff;
                    buf[2] = 0x0f;
                } else {
                    const byteLen = (bitLen - ext) >> 3;
                    delta = byteLen << 3;
                    const part = data; // .slice(2); // FIXME ???
                    buf = str2buf('000000', part);
                    buf[0] = cmd1;
                    buf[1] = (byteLen - 1) & 0xff;
                    buf[2] = ((byteLen - 1) >> 8) & 0xff;
                }
                bitLen -= delta;
                bar.tick(delta);
                await datOut(buf);
            }
            const lastChars = data.slice(0, 2);
            const lastByte = parseInt(lastChars, 16);
            const bitSeq = (bitLen > 1) ? ('1B0' + (bitLen - 2).toString(16) + lastChars) : '';
            const lastBit = lastByte >> ((bitLen - 1) & 0x7);
            const extSeq = ext ? (cmd2.toString(16) + '01' + (lastBit ? '81' : '01')) : '';
            const seq = bitSeq + extSeq;
            if (seq.length > 0) {
                const buf = Buffer.from(bitSeq + extSeq, 'hex');
                bar.tick(bitLen);
                await datOut(buf);
            }
            if (io) {
                await datInp(0x1000);
            }
        }
    };

    return {
        open: open,
        close: close,
        TMS: TMS,
        TCK: TCK,
        TDI: TDI
    };
};
