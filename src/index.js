#!/usr/bin/env node
'use strict';

// Layout
const colors = require('colors');
const blessed = require('blessed');
const contrib = require('blessed-contrib');

// Comm
const ccxt = require('ccxt');
const https = require('https');

// Logging
const path = require('path');
const fs = require('fs');
const util = require('util');
var logger = [];
var files = [];
logger.log = function (d) {
    if (!files['log'])
        files['log'] = fs.createWriteStream('log.log', { flags: 'a' });
    files['log'].write(util.format(new Date().toLocaleTimeString(), ':', util.format(d)) + '\n');
}
logger.debug = function (d) {
    if (!files['debug'])
        files['debug'] = fs.createWriteStream('debug.log', { flags: 'a' });
    files['debug'].write(util.format(new Date().toLocaleTimeString(), ':', util.format(d)) + '\n');
}
logger.error = function (d) {
    if (!files['error'])
        files['error'] = fs.createWriteStream('error.log', { flags: 'a' });
    files['error'].write(util.format(new Date().toLocaleTimeString(), ':', util.format(d)) + '\n');
}

// Global variables
var exchanges = [];
var tickers = [];
var tickersUpdated = [];
var balances = [];
var balancesUpdated = [];
var openOrders = [];
var openOrdersUpdated = [];
var closedOrders = [];
var closedOrdersUpdated = [];
var indicators = [];
var indicatorsUpdated = [];

var symbols = [];
var interest = [];
var settings = {};

var minEquity;
var equityDecimals;
var equitySecondaryDecimals;

// Screen components
var screen;
var grid;
var tickersWidget;
var tickersWidget2;
var balancesWidget;
var equitiesPerAssetWidget;
var equitiesPerExchangeWidget;
var totalEquityWidget;
var totalSecondaryEquityWidget;
var openOrdersWidget;
var closedOrdersWidget;
var logWidget;
var fngWidget;
var currentLayout;

// Configuration
var precision = 8;
var orderTickersBy = 'percentage';
var invertedOrder = false;

//const timeout = 30000
const enableRateLimit = true
const fetchOpenOrdersRateLimit = 596000;
const fetchClosedOrdersRateLimit = 596000;
const fetchOpenOrdersDateLimit = 1000 * 60 * 60 * 24 * 365;
const fetchClosedOrdersDateLimit = 1000 * 60 * 60 * 24 * 365;

const fetchBalancesTimeout = 10000;
const fetchWhaleAlertTimeout = 10000;
const fetchTickersTimeout = 33;
const fetchOpenOrdersTimeout = 33;
const fetchClosedOrdersTimeout = 33;
const fetchIndicatorsTimeout = 1000;

const min_value = 10000000;
var whaleAlertLatestTransaction = 0;
var whaleAlertTimeLimit = 360000;

const fngIndicatorOptions = {
    host: `api.alternative.me`,
    path: `/fng/`,
};

function loadInterestsFile() {
    let interestsGlobal = path.resolve('interests.json');
    let interestsLocal = path.resolve('interests.local.json');
    let interestsGlobalExists = fs.existsSync(interestsGlobal);
    let interestsLocalExists = fs.existsSync(interestsLocal);
    if (!(interestsGlobalExists || interestsLocalExists)) {
        let lines = [
            'This script requires a interest.json or a interest.local.json file containing the interest assets interests JSON format',
            '{',
            '    "base": [',
            '        "BTC",',
            '        "XRP",',
            '        "LTC",',
            '        "BCH"',
            '    ],',
            '    "quote": [',
            '        "USDT",',
            '        "BRL",',
            '        "BTC"',
            '    ]',
            '}'
        ];
        let errorMessage = lines.join("\n");
        console.log(errorMessage);
        process.exit();
    }
    let globalInterestsFile = interestsGlobalExists ? interestsGlobal : false;
    let localInterestsFile = interestsLocalExists ? interestsLocal : globalInterestsFile;
    interest = localInterestsFile ? (require(localInterestsFile) || {}) : {};

    minEquity = interest['main'] == 'BTC' ? 0.00001 : 1;
    equityDecimals = interest['main'] == 'BTC' ? 5 : 0;
    equitySecondaryDecimals = interest['secondary'] == 'BTC' ? 8 : 5;
}

function initializeAllExchanges() {
    let keysGlobal = path.resolve('keys.json');
    let keysLocal = path.resolve('keys.local.json');
    let keysGlobalExists = fs.existsSync(keysGlobal);
    let keysLocalExists = fs.existsSync(keysLocal);
    if (!(keysGlobalExists || keysLocalExists)) {
        let lines = [
            'This script requires a keys.json or a keys.local.json file containing the API keys in JSON format',
            '{',
            '    "binance": {',
            '        "apiKey": "YOUR_API_KEY",',
            '        "secret": "YOUR_SECRET"',
            '    }',
            '    "bitfinex": {',
            '        "apiKey": "YOUR_API_KEY",',
            '        "secret": "YOUR_SECRET"',
            '    }',
            '}'
        ];
        let errorMessage = lines.join("\n");
        console.log(errorMessage);
        process.exit();
    }
    let globalKeysFile = keysGlobalExists ? keysGlobal : false;
    let localKeysFile = keysLocalExists ? keysLocal : globalKeysFile;
    settings = localKeysFile ? (require(localKeysFile) || {}) : {};
    let numErrors = 0;
    let ignore = [
        'bcex',
        'bitsane',
        'chbtc',
        'coinbasepro',
        'coinmarketcap',
        'jubi',
        'bitstamp1',
        'bitfinex2',
        'upbit',
    ];
    let result = [];
    ccxt.exchanges.filter(exchangeId => (!ignore.includes(exchangeId))).forEach(exchangeId => {
        try {
            let verbose = false
            let exchange = new ccxt[exchangeId]({
                //timeout,
                verbose,
                enableRateLimit,
                ... (settings[exchangeId] || {})
            });
            exchange.options["warnOnFetchOpenOrdersWithoutSymbol"] = false;
            exchange.checkRequiredCredentials();
            exchange.loadMarkets();
            result[exchangeId] = exchange;
        } catch (e) {
            numErrors++;
            //console.log(exchangeId, 'initialization failed', e.constructor.name, e.message.slice(0, 100));
        }
    });
    console.log('Initialized', ccxt.exchanges.length - numErrors, 'of', ccxt.exchanges.length, 'exchanges,',
        numErrors, 'error' + (((numErrors < 1) || (numErrors > 1)) ? 's' : '') + ',',
        ignore.length, 'skipped');
    exchanges = result;
}

function layoutDashboard() {
    currentLayout = 'dashboard';
    // Widgets
    tickersWidget = grid.set(3, 0, 11, 9, contrib.table, {
        interactive: false,
        fg: 'green',
        label: ' Tickers '.bold.brightCyan,
        columnSpacing: 1,
        columnWidth: [17, 11, 17, 17, 17, 17, 10, 8],
    });
    balancesWidget = grid.set(0, 0, 3, 7, contrib.table, {
        fg: 'green',
        interactive: false,
        label: ' Balances '.bold.brightCyan,
        border: { type: "line", fg: "cyan" },
        columnSpacing: 1,
        columnWidth: [17, 9, 16, 16, 16, 13]
    });
    equitiesPerAssetWidget = grid.set(0, 7, 3, 6, contrib.stackedBar, {
        label: ` Assets Equities (${interest['main']}) `.bold.brightCyan,
        barWidth: 4,
        barSpacing: 6,
        xOffset: 2,
        //maxValue: 15,
        //height: "40%",
        //width: "50%",
        barBgColor: ['blue', 'red'],
    });
    equitiesPerExchangeWidget = grid.set(0, 13, 3, 4, contrib.bar, {
        label: ` Exchanges Equities (${interest['main']}) `.bold.brightCyan,
        barWidth: 7,
        barSpacing: 6,
        xOffset: 2,
        maxHeight: 9,
    });
    totalEquityWidget = grid.set(14, 5, 2, 4, contrib.lcd, {
        label: ` Total (${interest['main']}) `.bold.brightCyan,
        segmentWidth: 0.06,
        segmentInterval: 0.11,
        strokeWidth: 0.1,
        elements: 5,
        display: 0,
        elementSpacing: 4,
        elementPadding: 2,
        color: 'green'
    });
    totalSecondaryEquityWidget = grid.set(14, 0, 2, 5, contrib.lcd, {
        label: ` Total (${interest['secondary']}) `.bold.brightCyan,
        segmentWidth: 0.06,
        segmentInterval: 0.11,
        strokeWidth: 0.1,
        elements: 10,
        display: 0,
        elementSpacing: 4,
        elementPadding: 2,
        color: 'green'
    });
    openOrdersWidget = grid.set(11, 9, 2, 8, contrib.table, {
        interactive: false,
        fg: 'green',
        label: ' Open orders '.bold.brightCyan,
        columnSpacing: 1,
        columnWidth: [17, 12, 8, 17, 15, 10, 13],
    });
    closedOrdersWidget = grid.set(3, 9, 8, 8, contrib.table, {
        interactive: false,
        fg: 'green',
        label: ' Closed orders '.bold.brightCyan,
        columnSpacing: 1,
        columnWidth: [17, 12, 8, 17, 15, 10, 13],
    });
    logWidget = grid.set(13, 9, 3, 6, contrib.log, {
        fg: 'green',
        label: ' Log '.bold.brightCyan,
    });
    fngWidget = grid.set(13, 15, 3, 2, contrib.donut,
        {
            label: ' Fear and Greed Index '.bold.brightCyan,
            radius: 12,
            arcWidth: 4,
            yPadding: 1,
            data: [{ label: ' ', percent: 0 }]
        });
}

function layoutTicker() {
    currentLayout = 'ticker';
    tickersWidget = grid.set(0, 0, 16, 9, contrib.table, {
        interactive: false,
        fg: 'green',
        label: ' Tickers '.bold.brightCyan,
        columnSpacing: 1,
        columnWidth: [17, 11, 17, 17, 17, 17, 10, 8],
    });
    tickersWidget2 = grid.set(0, 9, 16, 8, contrib.table, {
        interactive: false,
        fg: 'green',
        label: ' Tickers '.bold.brightCyan,
        columnSpacing: 1,
        columnWidth: [17, 11, 17, 17, 17, 17, 10, 8],
    });
}

function layoutClosedOrders() {
    currentLayout = 'closedOrders';

    closedOrdersWidget = grid.set(0, 0, 16, 9, contrib.table, {
        interactive: false,
        fg: 'green',
        label: ' Closed orders '.bold.brightCyan,
        columnSpacing: 1,
        columnWidth: [17, 12, 8, 17, 15, 10, 13],
    });
    openOrdersWidget = grid.set(11, 9, 2, 8, contrib.table, {
        interactive: false,
        fg: 'green',
        label: ' Open orders '.bold.brightCyan,
        columnSpacing: 1,
        columnWidth: [17, 12, 8, 17, 15, 10, 13],
    });
    logWidget = grid.set(13, 9, 3, 6, contrib.log, {
        fg: 'green',
        label: ' Log '.bold.brightCyan,
    });
    fngWidget = grid.set(13, 15, 3, 2, contrib.donut,
        {
            label: ' Fear and Greed Index '.bold.brightCyan,
            radius: 12,
            arcWidth: 4,
            yPadding: 1,
            data: [{ label: ' ', percent: 0 }]
        });
    totalEquityWidget = grid.set(9, 13, 2, 4, contrib.lcd, {
        label: ` Total (${interest['main']}) `.bold.brightCyan,
        segmentWidth: 0.06,
        segmentInterval: 0.11,
        strokeWidth: 0.1,
        elements: 5,
        display: 0,
        elementSpacing: 4,
        elementPadding: 2,
        color: 'green'
    });
    totalSecondaryEquityWidget = grid.set(9, 9, 2, 4, contrib.lcd, {
        label: ` Total (${interest['secondary']}) `.bold.brightCyan,
        segmentWidth: 0.06,
        segmentInterval: 0.11,
        strokeWidth: 0.1,
        elements: 10,
        display: 0,
        elementSpacing: 4,
        elementPadding: 2,
        color: 'green'
    });
    equitiesPerAssetWidget = grid.set(0, 9, 4, 5, contrib.stackedBar, {
        label: ` Assets Equities (${interest['main']}) `.bold.brightCyan,
        barWidth: 4,
        barSpacing: 6,
        xOffset: 2,
        //maxValue: 15,
        //height: "40%",
        //width: "50%",
        barBgColor: ['blue', 'red'],
    });
    equitiesPerExchangeWidget = grid.set(0, 14, 4, 3, contrib.bar, {
        label: ` Exchanges Equities (${interest['main']}) `.bold.brightCyan,
        barWidth: 7,
        barSpacing: 6,
        xOffset: 2,
        maxHeight: 9,
    });
    balancesWidget = grid.set(4, 9, 5, 8, contrib.table, {
        fg: 'green',
        interactive: false,
        label: ' Balances '.bold.brightCyan,
        border: { type: "line", fg: "cyan" },
        columnSpacing: 1,
        columnWidth: [17, 9, 16, 16, 16, 13]
    });
}

function configureScreen() {
    screen = blessed.screen();
    grid = new contrib.grid({ rows: 16, cols: 17, screen: screen });

    layoutTicker();
    layoutClosedOrders();
    layoutDashboard();

    screen.on('wheelup', function () {
        logWidget.scroll(1);
    });
    screen.on('wheeldown', function () {
        logWidget.scroll(-1);
    });
    screen.on('resize', function () {
        balancesWidget.emit('attach');
        equitiesPerAssetWidget.emit('attach');
        equitiesPerExchangeWidget.emit('attach');
        tickersWidget.emit('attach');
        openOrdersWidget.emit('attach');
        closedOrdersWidget.emit('attach');
        totalEquityWidget.emit('attach');
        totalSecondaryEquityWidget.emit('attach');
        fngWidget.emit('attach');
        logWidget.emit('attach');
        switch (currentLayout){
            case 'dashboard':
                layoutDashboard();
                printDashboad();
                break;
            case 'ticker':
                layoutTicker();
                printDashboad();
                break;
            case 'closedOrders':
                layoutClosedOrders();
                printDashboad();
                break;
        }
    });

    screen.key(['a'], function (ch, key) {
        if (interest['main'] == 'BRL') interest['main'] = 'USDT'
        else if (interest['main'] == 'USDT') interest['main'] = 'BRL'
        //equitySecondaryDecimals = interest['main'] == 'BTC' ? 8 : 5;
        layoutDashboard();
        printDashboad();
    });
    screen.key(['s'], function (ch, key) {
        if (interest['secondary'] == 'USDT') interest['secondary'] = 'BTC'
        else if (interest['secondary'] == 'BTC') interest['secondary'] = 'USDT'
        equitySecondaryDecimals = interest['secondary'] == 'BTC' ? 8 : 5;
        layoutDashboard();
        printDashboad();
    });
    screen.key(['c'], function (ch, key) {
        layoutClosedOrders();
        printDashboad();
    });
    screen.key(['d'], function (ch, key) {
        layoutDashboard();
        printDashboad();
    });
    screen.key(['i'], function (ch, key) {
        invertedOrder = !invertedOrder;
        printDashboad();
    });
    screen.key(['p'], function (ch, key) {
        orderTickersBy = 'percentage'
    });
    screen.key(['t'], function (ch, key) {
        orderTickersBy = 'percentage'
        layoutTicker();
        printTickers();
    });
    screen.key(['v'], function (ch, key) {
        orderTickersBy = 'volume'
    });
    screen.key(['escape', 'q', 'C-c'], function (ch, key) {
        return process.exit(0);
    });

    screen.render();
}

// Helper functions
const formatNumber = n => {
    if (n < 1e3) return n.toFixed(1);
    if (n >= 1e3 && n < 1e6) return +(n / 1e3).toFixed(1) + 'K';
    if (n >= 1e6 && n < 1e9) return +(n / 1e6).toFixed(1) + 'M';
    if (n >= 1e9 && n < 1e12) return +(n / 1e9).toFixed(1) + 'B';
    if (n >= 1e12) return +(n / 1e12).toFixed(1) + 'T';
}

const getColoredTickerSymbol = (symbol) => {
    const text = `${symbol}`;
    let textColor = text;

    for (let exchange in balances) {
        for (let asset in balances[exchange].total) {
            if ((assetValue(interest['main'], exchange, asset) * balances[exchange].total[asset]) >= minEquity) {
                if (symbol.split('/')[0] == asset || symbol.split('/')[0] == asset.slice(2 - asset.length)) {
                    textColor = textColor.split('/')[0].bgBlue.white + '/' + textColor.split('/')[1]
                }
                //if (symbol.split('/')[1] == asset || symbol.split('/')[1] == asset.slice(2 - asset.length)) {
                //    textColor = textColor.split('/')[0] + '/' + textColor.split('/')[1].bgBlue.white
                //}
            }
        }
    }
    return symbol && textColor || 'NA';
}

const getColoredChangeValueText = (value) => {
    const text = `${value}%`;
    let textColor = text.white;
    if (value > 0) {
        textColor = text.blue;
    } else if (value < 0) {
        textColor = text.red;
    }
    return value && textColor || 'NA';
}

const getColoredCompareValueText = (price, vwap) => {
    const text = `${price}`;
    let textColor = text.white;
    if (price < vwap) {
        textColor = text.blue;
    } else if (price > vwap) {
        textColor = text.red;
    }
    return price && textColor || 'NA';
}

function assetValue(equity, exchange, asset) {
    if (asset.substring(0, 2) == 'LD' && interest['base'].indexOf(asset.slice(2 - asset.length)) >= 0)
        asset = asset.slice(2 - asset.length); // remove LD from LockedDaily binance balancess 

    if (!tickers[exchange])
        return 0.00000000;

    if (equity == asset)
        return 1.00000000;

    if (tickers[exchange][`${asset}/${equity}`])
        return (tickers[exchange][`${asset}/${equity}`].bid) * (1 - exchanges[exchange].markets[`${asset}/${equity}`].taker);

    if (tickers[exchange][`${equity}/${asset}`])
        return (1 / tickers[exchange][`${equity}/${asset}`].ask) * (1 - exchanges[exchange].markets[`${equity}/${asset}`].taker);

    if (equity == 'BTC') {
        if (assetValue('USD', exchange, asset) && tickers[exchange][`BTC/USDT`]) {
            return (assetValue('USD', exchange, asset) / tickers[exchange][`BTC/USDT`].ask);
        }
        if (assetValue('BRL', exchange, asset) && tickers[exchange][`BTC/BRL`]) {
            return (assetValue('BRL', exchange, asset) / tickers[exchange][`BTC/BRL`].ask);
        }
        // If there is no BTC asset we use from other exchange
        for (let ex in exchanges) {
            if (tickers[ex]) {
                if (tickers[ex][`BTC/USDT`] && tickers[exchange][`${asset}/USDT`]) {
                    return (tickers[exchange][`${asset}/USDT`].bid / tickers[ex][`BTC/USDT`].ask);
                }
                else if (tickers[ex][`BTC/USDT`] && asset == `USDT`) {
                    return 1 / tickers[ex][`BTC/USDT`].ask;
                }
            }
        }
    }

    if (equity == 'USD' || equity == 'USDT' || equity == 'USDC' || equity == 'BUSD') {
        if (tickers[exchange][`${asset}/USD`]) {
            return (tickers[exchange][`${asset}/USD`].bid);
        }
        if (tickers[exchange][`USD/${asset}`]) {
            return (1 / tickers[exchange][`USD/${asset}`].ask);
        }
        if (tickers[exchange][`${asset}/USDT`]) {
            return (tickers[exchange][`${asset}/USDT`].bid);
        }
        if (tickers[exchange][`USDT/${asset}`]) {
            return (1 / tickers[exchange][`USDT/${asset}`].ask);
        }
        if (tickers[exchange][`${asset}/USDC`]) {
            return (tickers[exchange][`${asset}/USDC`].bid);
        }
        if (tickers[exchange][`USDC/${asset}`]) {
            return (1 / tickers[exchange][`USDC/${asset}`].ask);
        }
        if (tickers[exchange][`${asset}/BUSD`]) {
            return (tickers[exchange][`${asset}/BUSD`].bid);
        }
        if (tickers[exchange][`BUSD/${asset}`]) {
            return (1 / tickers[exchange][`BUSD/${asset}`].ask);
        }
        if (tickers[exchange][`BTC/USDT`]) {
            if (tickers[exchange][`${asset}/BTC`]) {
                return (tickers[exchange][`${asset}/BTC`].bid * tickers[exchange][`BTC/USDT`].bid);
            }
            if (tickers[exchange][`BTC/${asset}`]) {
                return (tickers[exchange][`BTC/USDT`].bid / tickers[exchange][`BTC/${asset}`].ask);
            }
        }
        if (tickers[exchange][`BTC/USDC`]) {
            if (tickers[exchange][`${asset}/BTC`]) {
                return (tickers[exchange][`${asset}/BTC`].bid * tickers[exchange][`BTC/USDC`].bid);
            }
            if (tickers[exchange][`BTC/${asset}`]) {
                return (tickers[exchange][`BTC/USDC`].bid / tickers[exchange][`BTC/${asset}`].ask);
            }
        }
        // If there is only BRL for base asset (MercadoBitcoin). Using USDC conversion
        if (assetValue('BRL', exchange, asset) && tickers[exchange][`USDC/BRL`]) {
            return (assetValue('BRL', exchange, asset) / tickers[exchange][`USDC/BRL`].ask);
        }
    }

    if (equity == 'BRL') {
        if (tickers[exchange][`BUSD/BRL`]) {
            if (tickers[exchange][`${asset}/BUSD`]) {
                return (tickers[exchange][`${asset}/BUSD`].bid * tickers[exchange][`BUSD/BRL`].bid);
            }
            if (tickers[exchange][`BUSD/${asset}`]) {
                return (tickers[exchange][`BUSD/BRL`].bid / tickers[exchange][`BUSD/${asset}`].ask);
            }
        }
        if (tickers[exchange][`USDT/BRL`]) {
            if (tickers[exchange][`${asset}/USDT`]) {
                return (tickers[exchange][`${asset}/USDT`].bid * tickers[exchange][`USDT/BRL`].bid);
            }
            if (tickers[exchange][`USDT/${asset}`]) {
                return (tickers[exchange][`USDT/BRL`].bid / tickers[exchange][`USDT/${asset}`].ask);
            }
        }
        if (tickers[exchange][`USDC/BRL`]) {
            if (tickers[exchange][`${asset}/USDC`]) {
                return (tickers[exchange][`${asset}/USDC`].bid * tickers[exchange][`USDC/BRL`].bid);
            }
            if (tickers[exchange][`USDC/${asset}`]) {
                return (tickers[exchange][`USDC/BRL`].bid / tickers[exchange][`USDC/${asset}`].ask);
            }
        }
        if (tickers[exchange][`BTC/BRL`]) {
            if (tickers[exchange][`${asset}/BTC`]) {
                return (tickers[exchange][`${asset}/BTC`].bid * tickers[exchange][`BTC/BRL`].bid);
            }
            if (tickers[exchange][`BTC/${asset}`]) {
                return (tickers[exchange][`BTC/BRL`].bid / tickers[exchange][`BTC/${asset}`].ask);
            }
        }
        // If there is no BRL asset we use from other exchange
        for (let ex in exchanges) {
            if (tickers[ex]) {
                if (tickers[ex][`USDT/BRL`] && tickers[exchange][`${asset}/USDT`]) {
                    return (tickers[ex][`USDT/BRL`].bid * tickers[exchange][`${asset}/USDT`].bid);
                }
                else if (tickers[ex][`USDT/BRL`] && (asset == `USDT` || 'USD')) {
                    return tickers[ex][`USDT/BRL`].bid;
                }
            }
        }
    }

    return -1; // Debug (it cannot get here)
}

function handleError(error) {
    logWidget.log(new Date().toLocaleTimeString() + ' : ' + util.format(error).red);
    logger.error(error);
    if (error.message.includes(`call signIn() method`)) {
        logWidget.log(new Date().toLocaleTimeString() + ' : ' + util.format('Trying signIn...').red);
        signIn();
    }
}

// Printing functions
function printBalances() {
    let data = [];
    for (let exchange in balances) {
        for (let asset in balances[exchange].total) {
            if(asset == "SGB" || asset == "LUNC") continue;
            let row = [];
            if (balances[exchange].total[asset]) {
                if (tickers[exchange]) {
                    if ((assetValue(interest['main'], exchange, asset) * balances[exchange].total[asset]) >= minEquity) {
                        row.push(exchanges[exchange].name);
                        row.push(asset);
                        row.push(balances[exchange].free[asset].toFixed(precision));
                        row.push(balances[exchange].used[asset] > 0 ? balances[exchange].used[asset].toFixed(precision).red : balances[exchange].used[asset].toFixed(precision));
                        row.push(balances[exchange].total[asset].toFixed(precision));
                        row.push((assetValue(interest['main'], exchange, asset) * balances[exchange].total[asset]).toFixed(precision));
                        data.push(row);
                    }
                } else {
                    row.push(exchanges[exchange].name);
                    row.push(asset);
                    row.push(balances[exchange].free[asset].toFixed(precision));
                    row.push(balances[exchange].used[asset].toFixed(precision));
                    row.push(balances[exchange].total[asset].toFixed(precision));
                    data.push(row);
                }
            }
        }
    }
    balancesWidget.setData({
        headers: [
            'Exchange'.yellow,
            'Asset'.yellow,
            'Free'.yellow,
            'Used'.yellow,
            'Total'.yellow,
            `Equity (${interest['main']})`.yellow
        ], data: data
    });
    screen.render();
    printEquitiesPerAsset();
    printEquitiesPerExchange();
}

function printEquitiesPerAsset() {
    let assets = [];
    let free = [];
    let used = [];
    let freeSecondary = [];
    let usedSecondary = [];
    for (let exchange in balances) {
        for (let asset in balances[exchange].total) {
            if(asset == "SGB" || asset == "LUNC") continue;
            if ((assetValue(interest['main'], exchange, asset) * balances[exchange].total[asset]) >= minEquity) {
                assets[asset] = asset;
                free[asset] = ((free[asset] ? free[asset] : 0) + assetValue(interest['main'], exchange, asset) * balances[exchange].free[asset]);
                used[asset] = ((used[asset] ? used[asset] : 0) + assetValue(interest['main'], exchange, asset) * balances[exchange].used[asset]);
                freeSecondary[asset] = ((freeSecondary[asset] ? freeSecondary[asset] : 0) + assetValue(interest['secondary'], exchange, asset) * balances[exchange].free[asset]);
                usedSecondary[asset] = ((usedSecondary[asset] ? usedSecondary[asset] : 0) + assetValue(interest['secondary'], exchange, asset) * balances[exchange].used[asset]);
            }
        }
    }
    let total = 0;
    let totalSecondary = 0;
    let values = [];
    // Reorder arrays
    for (let asset in assets) {
        if(asset == "SGB" || asset == "LUNC") continue;
        total += free[asset] + used[asset];
        totalSecondary += freeSecondary[asset] + usedSecondary[asset];
        assets.push(asset);
        values.push([Number(free[asset].toFixed(equityDecimals)), Number(used[asset].toFixed(equityDecimals))]);
    }
    equitiesPerAssetWidget.setData({ barCategory: assets, stackedCategory: ['Free', 'Used'], data: values });
    totalEquityWidget.setDisplay(total.toFixed(equityDecimals)); // We are calculating totals here to aviod sum unworty assests
    totalSecondaryEquityWidget.setDisplay(totalSecondary.toFixed(equitySecondaryDecimals)); // We are calculating totals here to aviod sum unworty assests
    screen.render();
}

function printEquitiesPerExchange() {
    equitiesPerExchangeWidget.options.maxHeight = 0;
    let exs = [];
    let values = [];
    for (let exchange in balances) {
        exs[exchange] = exchanges[exchange].name;
        for (let asset in balances[exchange].total) {
            if(asset == "SGB" || asset == "LUNC") continue;
            if ((assetValue(interest['main'], exchange, asset) * balances[exchange].total[asset]) > minEquity) {
                values[exchange] = (values[exchange] ? values[exchange] : 0) + assetValue(interest['main'], exchange, asset) * balances[exchange].total[asset];
            }
        }
    }
    // Reorder arrays
    for (let exchange in exs) {
        exs.push(exchanges[exchange].name.substring(0, 7));
        values.push((values[exchange] ? values[exchange] : 0).toFixed(equityDecimals));
        if ((values[exchange] ? values[exchange] : 0).toFixed(equityDecimals) > equitiesPerAssetWidget.options.maxHeight) {
            equitiesPerExchangeWidget.options.maxHeight = values[exchange].toFixed(equityDecimals);
        }
    }
    equitiesPerExchangeWidget.setData({ titles: exs, data: values });
    screen.render();
}

function printOpenOrders() {
    let data = []
    for (let exchange in openOrders) {
        for (let order in openOrders[exchange]) {
            if (openOrders[exchange][order].status == 'open') {
                let row = []
                let color = openOrders[exchange][order].side == 'sell' ? 'red' : 'blue';
                row.push(exchanges[exchange].name[color]);
                row.push(openOrders[exchange][order].symbol[color]);
                row.push(openOrders[exchange][order].side[color]);
                //row.push(openOrders[exchange][order].status);
                row.push(openOrders[exchange][order].price.toFixed(precision)[color]);
                row.push(openOrders[exchange][order].amount.toFixed(precision)[color]);
                row.push(((100 * openOrders[exchange][order].filled / openOrders[exchange][order].amount).toFixed(0) + '%')[color]);
                row.push((openOrders[exchange][order].price * assetValue(interest['main'], exchange, openOrders[exchange][order].symbol.split('/')[1])) * openOrders[exchange][order].amount);
                row.push(openOrders[exchange][order].timestamp);
                data.push(row);
            }
        }
    }
    if (data.length > 0)
        data.sort(function (a, b) { return b[b.length - 1] - a[a.length - 1] });    // sort, newer first
    for (let item in data) data[item].splice(data[item].length - 1, 1); // remove timestamp from table
    openOrdersWidget.setData({
        headers: [
            'Exchange'.yellow,
            'Symbol'.yellow,
            'Side'.yellow,
            //'Status'.yellow,
            'Price'.yellow,
            'Amount'.yellow,
            'Filled'.yellow,
            `Equity (${interest['main']})`.yellow
        ], data: data
    });
    screen.render();
}

function printClosedOrders() {
    let data = []
    for (let exchange in closedOrders) {
        for (let order in closedOrders[exchange]) {
            if (closedOrders[exchange][order].status == 'closed') {
                let row = []
                let color = closedOrders[exchange][order].side == 'sell' ? 'red' : 'blue';
                row.push(exchanges[exchange].name[color]);
                row.push(closedOrders[exchange][order].symbol[color]);
                row.push(closedOrders[exchange][order].side[color]);
                row.push(closedOrders[exchange][order].price.toFixed(precision)[color]);
                row.push(closedOrders[exchange][order].amount.toFixed(precision)[color]);
                row.push(tickers[exchange][closedOrders[exchange][order].symbol] ? getColoredChangeValueText(((((tickers[exchange][closedOrders[exchange][order].symbol][closedOrders[exchange][order].side == 'buy' ? 'bid' : 'ask'] / closedOrders[exchange][order].price) - 1) + (closedOrders[exchange][order].side == 'sell' ? exchanges[exchange].markets[closedOrders[exchange][order].symbol].taker : -exchanges[exchange].markets[closedOrders[exchange][order].symbol].taker)) * 100).toFixed(2)) : '-------');
                row.push(((closedOrders[exchange][order].price * assetValue(interest['main'], exchange, closedOrders[exchange][order].symbol.split('/')[1])) * closedOrders[exchange][order].amount));
                row.push(closedOrders[exchange][order].timestamp);
                data.push(row);
            }
        }
    }
    if (data.length > 0) {
        data.sort(function (a, b) { return b[b.length - 1] - a[a.length - 1] });    // sort, newer first
        for (let item in data) data[item].splice(data[item].length - 1, 1); // remove timestamp from table
        closedOrdersWidget.setData({
            headers: [
                'Exchange'.yellow,
                'Symbol'.yellow,
                'Side'.yellow,
                'Price'.yellow,
                'Amount'.yellow,
                'Change %'.yellow,
                `Equity (${interest['main']})`.yellow
            ], data: data
        });
        screen.render();
    }
}

function printTickers() {
    let data = []
    let row = []
    for (let exchange in tickers) {
        for (let asset in tickers[exchange]) {
            row = []
            row.push(exchanges[exchange].name)
            row.push(getColoredTickerSymbol(asset))
            row.push(tickers[exchange][asset].vwap ? getColoredCompareValueText(tickers[exchange][asset].last.toFixed(precision), tickers[exchange][asset].vwap.toFixed(precision)) : tickers[exchange][asset].last.toFixed(precision))
            row.push(tickers[exchange][asset].low.toFixed(precision))
            row.push(tickers[exchange][asset].high.toFixed(precision))
            row.push(tickers[exchange][asset].vwap ? tickers[exchange][asset].vwap.toFixed(precision) : '-------------')
            row.push(tickers[exchange][asset].percentage ? getColoredChangeValueText(tickers[exchange][asset].percentage.toFixed(2)) : '-------')
            row.push(formatNumber(tickers[exchange][asset].baseVolume * assetValue(interest['main'], exchange, asset.split('/')[0])))
            if (orderTickersBy == 'percentage')
                row.push(tickers[exchange][asset].percentage ? tickers[exchange][asset].percentage : -100)
            else if (orderTickersBy == 'volume')
                row.push(tickers[exchange][asset].baseVolume * assetValue(interest['main'], exchange, asset.split('/')[0]))
            data.push(row)
        }
    }

    if (data.length > 0) {
        if  (invertedOrder)
            data.sort(function (b, a) { return b[b.length - 1] - a[a.length - 1] }); 
        else
            data.sort(function (a, b) { return b[b.length - 1] - a[a.length - 1] });  
        for (let item in data) data[item].splice(data[item].length - 1, 1); // remove change from table
        tickersWidget.setData({
            headers: [
                'Exchange'.yellow,
                'Symbol'.yellow,
                'Last'.yellow,
                'Low'.yellow,
                'High'.yellow,
                'VWAP'.yellow,
                'Change %'.yellow,
                `Volume (${interest['main']})`.yellow
            ], data: data
        })
        screen.render();
    }
    printTickers2();
}

function printTickers2() {
    let data = []
    let row = []
    for (let exchange in tickers) {
        for (let asset in tickers[exchange]) {
            row = []
            row.push(exchanges[exchange].name)
            row.push(asset)
            row.push(tickers[exchange][asset].vwap ? getColoredCompareValueText(tickers[exchange][asset].last.toFixed(precision), tickers[exchange][asset].vwap.toFixed(precision)) : tickers[exchange][asset].last.toFixed(precision))
            row.push(tickers[exchange][asset].low.toFixed(precision))
            row.push(tickers[exchange][asset].high.toFixed(precision))
            row.push(tickers[exchange][asset].vwap ? tickers[exchange][asset].vwap.toFixed(precision) : '-------------')
            row.push(tickers[exchange][asset].percentage ? getColoredChangeValueText(tickers[exchange][asset].percentage.toFixed(2)) : '-------')
            row.push(formatNumber(tickers[exchange][asset].baseVolume * assetValue(interest['main'], exchange, asset.split('/')[0])))
            row.push(tickers[exchange][asset].baseVolume * assetValue(interest['main'], exchange, asset.split('/')[0]))
            data.push(row)
        }
    }

    if (data.length > 0) {
        data.sort(function (a, b) { return b[b.length - 1] - a[a.length - 1] });    // sort by change 
        for (let item in data) data[item].splice(data[item].length - 1, 1); // remove change from table
        tickersWidget2.setData({
            headers: [
                'Exchange'.yellow,
                'Symbol'.yellow,
                'Last'.yellow,
                'Low'.yellow,
                'High'.yellow,
                'VWAP'.yellow,
                'Change %'.yellow,
                `Volume (${interest['main']})`.yellow
            ], data: data
        })
        screen.render();
    }
}

function printIndicators() {
    let pct = indicators['fng'].data[0].value;
    if (pct > 0.99) pct = 0.00;
    var color = "green";
    if (pct >= 0.25) color = "red";
    if (pct >= 0.5) color = "yellow";
    if (pct >= 0.75) color = "green";
    fngWidget.setData([
        { percent: indicators['fng'].data[0].value, label: indicators['fng'].data[0].value_classification, 'color': color }
    ]);
    screen.render();
}

function printWhaleAlert() {
    if (indicators['whale'].count > 0) {
        for (let transaction in indicators['whale'].transactions) {
            if (whaleAlertLatestTransaction < indicators['whale'].transactions[transaction].timestamp) {
                whaleAlertLatestTransaction = indicators['whale'].transactions[transaction].timestamp;
                logWidget.log(
                    new Date(indicators['whale'].transactions[transaction].timestamp * 1000).toLocaleTimeString() + ' : '
                    + 'WhaleAlert'.magenta
                    + ' ' + formatNumber(indicators['whale'].transactions[transaction].amount)
                    + ' ' + indicators['whale'].transactions[transaction].symbol.toUpperCase()
                    + ' (' + formatNumber(indicators['whale'].transactions[transaction].amount_usd) + ' USD)'
                    + ' from ' + indicators['whale'].transactions[transaction].from.owner
                    + ' to ' + indicators['whale'].transactions[transaction].to.owner
                );
            }
        }
    }
}

function printDashboad() {
    printBalances()
    printEquitiesPerAsset();
    printEquitiesPerExchange();
    printOpenOrders();
    printClosedOrders();
    printTickers();
    printIndicators();
    printWhaleAlert();
}

// Callbacks
var fetchFngIndicator = function (response) {
    let str = '';
    response.on('data', function (chunk) {
        str += chunk;
    });
    response.on('end', function () {
        try {
            indicators['fng'] = (JSON.parse(str));
            indicatorsUpdated['fng'] = new Date(indicators[`fng`].data[0].timestamp * 1000).toLocaleString('pt-BR', { hour12: true });
            printIndicators();
        } catch (error) {
            handleError(error);
        }
        setTimeout(fetchIndicators, indicators[`fng`].data[0].time_until_update * 1000);
    });
}

var fetchWhaleAlertIndicator = function (response) {
    let str = '';
    response.on('data', function (chunk) {
        str += chunk;
    });
    response.on('end', function () {
        try {
            indicators['whale'] = (JSON.parse(str));
            indicatorsUpdated['whale'] = new Date().getTime();
            printWhaleAlert();
        } catch (error) {
            handleError(error);
        }
        setTimeout(fetchWhaleAlert, fetchWhaleAlertTimeout);
    });
}



function signIn() {
    for (let exchange in exchanges) {
        if (exchanges[exchange].has['signIn']) {
            try {
                logWidget.log(new Date().toLocaleTimeString() + ' : ' + exchanges[exchange].name + ' Signing In...');
                exchanges[exchange].signIn();
                logWidget.log(new Date().toLocaleTimeString() + ' : ' + exchanges[exchange].name + ' SignIn complete!');
            } catch (error) {
                handleError(error);
            }
        }
    }
    setTimeout(signIn, (15 * 60 * 1000) - (2 * 1000));
}

async function findIntrest() {
    let markets = [];
    for (let exchange in exchanges) {
        markets[exchange] = await exchanges[exchange].loadMarkets();
    }
    for (let market in markets) {
        symbols[market] = [];
        for (let symbol in markets[market]) {
            logger.debug(market + ':' + symbol);
            if ((interest['base'].indexOf(symbol.split('/')[0]) >= 0 && interest['quote'].indexOf(symbol.split('/')[1]) >= 0) || interest['symbols'].indexOf(symbol) >= 0) {
                symbols[market][symbol] = symbol;
            }
        }
    }
}

async function fetchBalances() {
    for (let exchange in exchanges) {
        try {
            balances[exchange] = await exchanges[exchange].fetchBalance();
            balancesUpdated[exchange] = new Date().toLocaleString('pt-BR', { hour12: true });
            printBalances();
        } catch (error) {
            handleError(error);
        }
    }
    setTimeout(fetchBalances, fetchBalancesTimeout);
}

async function fetchTickers() {
    for (let exchange in symbols) {
        if (!tickers[exchange])
            tickers[exchange] = [];
        for (let symbol in symbols[exchange]) {
            try {
                tickers[exchange][symbol] = await exchanges[exchange].fetchTicker(symbol);
                tickersUpdated[exchange] = new Date().toLocaleString('pt-BR', { hour12: true });
                printTickers();
                printClosedOrders();
            } catch (error) {
                handleError(error);
            }
        }
    }
    setTimeout(fetchTickers, fetchTickersTimeout);
}

async function fetchOpenOrders() {
    for (let market in symbols) {
        if (new Date().getTime() > openOrdersUpdated[market] + fetchOpenOrdersRateLimit || !openOrdersUpdated[market] || !fetchOpenOrdersRateLimit) {
            if (!exchanges[market].has['fetchOrders'] && exchanges[market].has['fetchOpenOrders']) {
                try {
                    openOrders[market] = await exchanges[market].fetchOpenOrders();
                    openOrdersUpdated[market] = new Date().getTime();
                    printOpenOrders();
                } catch (error) {
                    handleError(error);
                }
            } else if (exchanges[market].has['fetchOrders']) {
                openOrders[market] = [];
                for (let symbol in symbols[market]) {
                    try {
                        openOrders[market] = openOrders[market].concat(await exchanges[market].fetchOrders(symbol, new Date().getTime() - fetchOpenOrdersDateLimit))
                        openOrdersUpdated[market] = new Date().getTime();
                        printOpenOrders();
                    } catch (error) {
                        handleError(error);
                    }
                }
            }
        }
    }
    setTimeout(fetchOpenOrders, fetchOpenOrdersTimeout);
}

async function fetchClosedOrders() {
    for (let market in symbols) {
        if (new Date().getTime() > closedOrdersUpdated[market] + fetchClosedOrdersRateLimit || !closedOrdersUpdated[market] || !fetchClosedOrdersRateLimit) {
            if (!exchanges[market].has['fetchOrders'] && exchanges[market].has['fetchClosedOrders']) {
                try {
                    closedOrders[market] = await exchanges[market].fetchClosedOrders();
                    closedOrdersUpdated[market] = new Date().getTime();
                    printClosedOrders();
                } catch (error) {
                    handleError(error);
                }
            } else if (exchanges[market].has['fetchOrders']) {
                closedOrders[market] = [];
                for (let symbol in symbols[market]) {
                    try {
                        closedOrders[market] = closedOrders[market].concat(await exchanges[market].fetchOrders(symbol, new Date().getTime() - fetchClosedOrdersDateLimit))
                        closedOrdersUpdated[market] = new Date().getTime();
                        printClosedOrders();
                    } catch (error) {
                        handleError(error);
                    }
                }
            }
        }
    }
    setTimeout(fetchClosedOrders, fetchClosedOrdersTimeout);
}

async function fetchIndicators() {
    try {
        https.request(fngIndicatorOptions, fetchFngIndicator).end();
    } catch (error) {
        handleError(error);
        setTimeout(fetchIndicators, fetchIndicatorsTimeout);
    }
}

async function fetchWhaleAlert() {
    try {
        const whaleAlertOptions = {
            host: `api.whale-alert.io`,
            path: `/v1/transactions?api_key=${settings.whalealertio.api_key}&min_value=${min_value}&start=${Math.floor((new Date().getTime() - whaleAlertTimeLimit + fetchWhaleAlertTimeout) / 1000)}`,
        };
        https.request(whaleAlertOptions, fetchWhaleAlertIndicator).end();

    } catch (error) {
        handleError(error);
        setTimeout(fetchWhaleAlert, fetchWhaleAlertTimeout);
    }
}

// Program starts here
loadInterestsFile();
configureScreen();
initializeAllExchanges();
signIn();
findIntrest();
fetchTickers();
fetchBalances();
fetchOpenOrders();
fetchClosedOrders();
fetchIndicators();
fetchWhaleAlert();
