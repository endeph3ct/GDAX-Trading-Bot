#!/usr/bin/env node

/*
 ============================================================================
 Name        : GDAX Trading Bot
 Author      : Kenshiro
 Version     : 7.00
 Copyright   : GNU General Public License (GPLv3)
 Description : Trading bot for the Coinbase Pro exchange
 ============================================================================
 */

const APP_VERSION = "v7.00";

const GdaxModule = require('gdax');

const PASSPHRASE = process.env.TRADING_BOT_PASSPHRASE || '';
const KEY = process.env.TRADING_BOT_KEY || '';
const SECRET = process.env.TRADING_BOT_SECRET || '';

const GDAX_URI = 'https://api.pro.coinbase.com';

const LTC_BTC_CURRENCY_PAIR = 'LTC-BTC';
const ETH_BTC_CURRENCY_PAIR = 'ETH-BTC';

const BITCOIN_TICKER = 'BTC';
const LITECOIN_TICKER = 'LTC';
const ETHEREUM_TICKER = 'ETH';

const SLEEP_TIME = 30000;

// The seed is the amount of coins that the program will trade continuously
const SEED_LTC_AMOUNT = 1.0;
const SEED_ETH_AMOUNT = 1.0;

// Profit percentage trading a seed
const PROFIT_PERCENTAGE = 1.0; 

const MINIMUM_BUY_PRICE_MULTIPLIER = 100.3 / 100.0;

const SELL_PRICE_MULTIPLIER = (100.0 + PROFIT_PERCENTAGE) / 100.0;

let askPriceLTC = null;
let averagePriceLTC = null;
let lastBuyOrderPriceLTC = null;

let askPriceETH = null;
let averagePriceETH = null;
let lastBuyOrderPriceETH = null;

let btcAvailable = 0;
let btcBalance = 0;

let ltcAvailable = 0;
let ltcBalance = 0;

let ethAvailable = 0;
let ethBalance = 0;

let numberOfCyclesCompleted = 0;

let estimatedProfit = 0;

let authenticatedClient = null;
let publicClient = null;

// Callbacks

const buyOrderCallbackLTC = (error, response, data) => 
{
    if (error)
	{
		lastBuyOrderPriceLTC = null;
        return console.log(error);
	}

    if ((data==null) || (data.status!=='pending'))
        lastBuyOrderPriceLTC = null;

    return console.log(data);
}

const buyOrderCallbackETH = (error, response, data) => 
{
    if (error)
	{
		lastBuyOrderPriceETH = null;
        return console.log(error);
	}

    if ((data==null) || (data.status!=='pending'))
        lastBuyOrderPriceETH = null;

    return console.log(data);
}


const sellOrderCallbackLTC = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (data.status==='pending'))
    {
        estimatedProfit = estimatedProfit + SEED_LTC_AMOUNT * (parseFloat(data.price) - lastBuyOrderPriceLTC);
        averagePriceLTC = lastBuyOrderPriceLTC;        
        lastBuyOrderPriceLTC = null;
        numberOfCyclesCompleted++;
 	}

    return console.log(data);
}

const sellOrderCallbackETH = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (data.status==='pending'))
    {
        estimatedProfit = estimatedProfit + SEED_ETH_AMOUNT * (parseFloat(data.price) - lastBuyOrderPriceETH);
        averagePriceETH = lastBuyOrderPriceETH;        
        lastBuyOrderPriceETH = null;
        numberOfCyclesCompleted++;
 	}

    return console.log(data);
}

const getProductTickerCallbackLTC = (error, response, data) => 
{
	if (error)
        return console.log(error);

    if ((data!=null) && (data.ask!=null) && (data.time!=null))
    {
	    askPriceLTC = parseFloat(data.ask);
        
        if (averagePriceLTC===null)
            console.log("[LITECOIN TICKER] Now: " + askPriceLTC.toFixed(6) + " BTC, time: " + data.time);
        else
            console.log("[LITECOIN TICKER] Now: " + askPriceLTC.toFixed(6) + " BTC, average: " + averagePriceLTC.toFixed(6) + " BTC, time: " + data.time);

		const buyPrice = askPriceLTC * SEED_LTC_AMOUNT;

        if ((btcAvailable>=buyPrice) && (averagePriceLTC!=null) && (lastBuyOrderPriceLTC===null))
            setTimeout(()=>placeBuyOrderLTC(), 5000);
        else if ((ltcAvailable>=SEED_LTC_AMOUNT) && (lastBuyOrderPriceLTC!=null))
            setTimeout(()=>placeSellOrderLTC(), 5000);
         
        if (averagePriceLTC===null)
            averagePriceLTC = askPriceLTC;
        else
            averagePriceLTC = (averagePriceLTC * 1000 + askPriceLTC) / 1001;
	
		setTimeout(()=>publicClient.getProductTicker(ETH_BTC_CURRENCY_PAIR, getProductTickerCallbackETH), 2000);
    }
}

const getProductTickerCallbackETH= (error, response, data) => 
{
	if (error)
        return console.log(error);

    if ((data!=null) && (data.ask!=null) && (data.time!=null))
    {
	    askPriceETH = parseFloat(data.ask);
       
        if (averagePriceETH==null)
            console.log("[ETHEREUM TICKER] Now: " + askPriceETH.toFixed(6) + " BTC, time: " + data.time);
        else
            console.log("[ETHEREUM TICKER] Now: " + askPriceETH.toFixed(6) + " BTC, average: " + averagePriceETH.toFixed(6) + " BTC, time: " + data.time);
		
		console.log("\n[INFO] Number of cycles completed: " + numberOfCyclesCompleted + ", estimated profit: " + estimatedProfit.toFixed(8) + " BTC");

		const buyPrice = askPriceETH * SEED_ETH_AMOUNT;

        if ((btcAvailable>=buyPrice) && (averagePriceETH!=null) && (lastBuyOrderPriceETH===null))
            setTimeout(()=>placeBuyOrderETH(), 5000);
        else if ((ethAvailable>=SEED_ETH_AMOUNT) && (lastBuyOrderPriceETH!=null))
            setTimeout(()=>placeSellOrderETH(), 5000);
         
        if (averagePriceETH===null)
            averagePriceETH = askPriceETH;
        else
            averagePriceETH = (averagePriceETH * 1000 + askPriceETH) / 1001;
    }
}

const getAccountsCallback = (error, response, data) => 
{
    if (error)
        return console.log(error);

    if ((data!=null) && (Symbol.iterator in Object(data)))
    {
        for(var item of data)
        {   
	        if (item.currency===BITCOIN_TICKER)
            {
		        btcAvailable = parseFloat(item.available);
                btcBalance = parseFloat(item.balance);
            }
            else if (item.currency===LITECOIN_TICKER)
            {
	            ltcAvailable = parseFloat(item.available);
	            ltcBalance = parseFloat(item.balance);
            }
			else if (item.currency===ETHEREUM_TICKER)
            {
	            ethAvailable = parseFloat(item.available);
	            ethBalance = parseFloat(item.balance);
            }
        }
   
        console.log("[BITCOIN  WALLET] Available: " + btcAvailable.toFixed(8) + " BTC, Balance: " + btcBalance.toFixed(8) + " BTC");
        console.log("[LITECOIN WALLET] Available: " + ltcAvailable.toFixed(8) + " LTC, Balance: " + ltcBalance.toFixed(8) + " LTC");
		console.log("[ETHEREUM WALLET] Available: " + ethAvailable.toFixed(8) + " ETH, Balance: " + ethBalance.toFixed(8) + " ETH\n");

        publicClient.getProductTicker(LTC_BTC_CURRENCY_PAIR, getProductTickerCallbackLTC);
    }
}

// Functions

function placeBuyOrderLTC() 
{
    const minimumBuyPrice = averagePriceLTC * MINIMUM_BUY_PRICE_MULTIPLIER;

    if (askPriceLTC>=minimumBuyPrice)
    {
        const buyPrice = askPriceLTC;
        const buySize = SEED_LTC_AMOUNT;

        const buyParams = 
	    {
            'size': buySize.toFixed(8),
            'product_id': LTC_BTC_CURRENCY_PAIR,
            'type': 'market'
		};

		console.log("");
		console.log("\x1b[42m%s\x1b[0m", "[BUY ORDER] Price: " + buyPrice.toFixed(6) + " BTC, size: " + buySize.toFixed(8) + " LTC");

		lastBuyOrderPriceLTC = buyPrice;

        authenticatedClient.buy(buyParams, buyOrderCallbackLTC);
    }
}

function placeBuyOrderETH() 
{
    const minimumBuyPrice = averagePriceETH * MINIMUM_BUY_PRICE_MULTIPLIER;

    if (askPriceETH>=minimumBuyPrice)
    {
        const buyPrice = askPriceETH;
        const buySize = SEED_ETH_AMOUNT;

        const buyParams = 
	    {
            'size': buySize.toFixed(8),
            'product_id': ETH_BTC_CURRENCY_PAIR,
            'type': 'market'
		};

		console.log("");
		console.log("\x1b[42m%s\x1b[0m", "[BUY ORDER] Price: " + buyPrice.toFixed(6) + " BTC, size: " + buySize.toFixed(8) + " ETH");

		lastBuyOrderPriceETH = buyPrice;

        authenticatedClient.buy(buyParams, buyOrderCallbackETH);
    }
}

function placeSellOrderLTC() 
{
    let sellPrice;

    if (askPriceLTC>lastBuyOrderPriceLTC)
        sellPrice = askPriceLTC * SELL_PRICE_MULTIPLIER;
    else
        sellPrice = lastBuyOrderPriceLTC * SELL_PRICE_MULTIPLIER;

    const sellSize = ltcAvailable - 0.000000001;

    const sellParams = 
    {
        'price': sellPrice.toFixed(6),
        'size': sellSize.toFixed(8),
        'product_id': LTC_BTC_CURRENCY_PAIR,
        'post_only': true,
    };

	console.log("");
	console.log("\x1b[41m%s\x1b[0m", "[SELL ORDER] Price: " + sellPrice.toFixed(6) + " BTC, size: " + sellSize.toFixed(8) + " LTC"); 

    authenticatedClient.sell(sellParams, sellOrderCallbackLTC);
}

function placeSellOrderETH() 
{
    let sellPrice;

    if (askPriceETH>lastBuyOrderPriceETH)
        sellPrice = askPriceETH * SELL_PRICE_MULTIPLIER;
    else
        sellPrice = lastBuyOrderPriceETH * SELL_PRICE_MULTIPLIER;

    const sellSize = ethAvailable - 0.000000001;

    const sellParams = 
    {
        'price': sellPrice.toFixed(5),
        'size': sellSize.toFixed(8),
        'product_id': ETH_BTC_CURRENCY_PAIR,
        'post_only': true,
    };

	console.log("");
	console.log("\x1b[41m%s\x1b[0m", "[SELL ORDER] Price: " + sellPrice.toFixed(6) + " BTC, size: " + sellSize.toFixed(8) + " ETH"); 

    authenticatedClient.sell(sellParams, sellOrderCallbackETH);
}

// Main logic

console.log("\n");
console.log("          __________  ___   _  __    ______               ___");
console.log("         / ____/ __ \\/   | | |/ /   /_  __/________ _____/ (_)___  ____ _");
console.log("        / / __/ / / / /| | |   /     / / / ___/ __ `/ __  / / __ \\/ __ `/");
console.log("       / /_/ / /_/ / ___ |/   |     / / / /  / /_/ / /_/ / / / / / /_/ / ");
console.log("       \\____/_____/_/  |_/_/|_|    /_/ /_/   \\__,_/\\__,_/_/_/ /_/\\__, /");
console.log("                                                                /____/");   
console.log("                                  ____        __");
console.log("                                 / __ )____  / /_");
console.log("                                / __  / __ \\/ __/");
console.log("                               / /_/ / /_/ / /_ ");
console.log("                              /_____/\\____/\\__/   " + APP_VERSION);

console.log("\n\n\n\n                    \"The Revolution Will Be Decentralized\"");

console.log("\n\n\n\nConnecting to Coinbase Pro in " + parseInt(SLEEP_TIME/1000) + " seconds ..."); 

setInterval(() => 
{
    console.log('\n\n');

    askPriceLTC = null;
	askPriceETH = null;
    
    btcAvailable = 0;
    btcBalance = 0;

    ltcAvailable = 0;
    ltcBalance = 0;

    ethAvailable = 0;
    ethBalance = 0;

    publicClient = new GdaxModule.PublicClient(GDAX_URI); 
    authenticatedClient = new GdaxModule.AuthenticatedClient(KEY, SECRET, PASSPHRASE, GDAX_URI);

    // Get the balance of the wallets and execute the trading strategy
    authenticatedClient.getAccounts(getAccountsCallback);

}, SLEEP_TIME);


