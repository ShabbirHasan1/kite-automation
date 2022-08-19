// ==UserScript==
// @name         kiteTwsAlgo
// @namespace    https://paisashare.in
// @version      1.0
// @description  Algo Trading Kite
// @author       Souvik Das
// @match        https://kite.zerodha.com/*
// @match        https://console.zerodha.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_registerMenuCommand
// @require      https://paisashare.in/user-auth/socket.io/socket.io.js
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.4.1/jquery.min.js
// @require      https://github.com/TradeWithSouvik/kite-automation/raw/master/monkeyconfig.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/axios/0.21.1/axios.min.js
// @require      https://raw.githubusercontent.com/kawanet/qs-lite/master/dist/qs-lite.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.27.0/moment.min.js
// @require      https://cdn.jsdelivr.net/npm/bluebird@3.7.2/js/browser/bluebird.js
// @require      https://unpkg.com/@popperjs/core@2
// @require      https://unpkg.com/tippy.js@6
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// @require      https://cdn.jsdelivr.net/npm/toastify-js
// @require      https://cdnjs.cloudflare.com/ajax/libs/uuid/8.3.2/uuid.min.js
// @resource     TOASTIFY_CSS https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css
// @resource     TOASTIFY_CSS https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css
// ==/UserScript==

/* GLOBAL DECLARATIONS */

window.jQ = jQuery.noConflict(true);
GM_addStyle(GM_getResourceText("TOASTIFY_CSS"));
setAttribute("uuid",uuid.v4());
const BASE_URL = "https://kite.zerodha.com";
const STRATEGIES=[{strategyId:"NIFTY_2259621564362513"},
                  {strategyId:"NIFTY_8915142776897629"},
                  {strategyId:"NIFTY_2662529212584048"},
                  {strategyId:"NIFTY_7576513120993982"},
                  {strategyId:"NIFTY_ic_intraday"},
                  {strategyId:"NIFTY_DZPOS",directional:true},
                  {strategyId:"NIFTY_TFPOS",directional:true},
                  {strategyId:"NIFTY_TFINTRA",directional:true},
                  {strategyId:"BANKNIFTY_MRINTRA",directional:true},
                  {strategyId:"BANKNIFTY_SWPOS",directional:true},
                  {strategyId:"BANKNIFTY_TFPOS",directional:true}
                 ]
const STRATEGY_IDS=STRATEGIES.map(_=>_.strategyId)
const BOT_URL = "wss://paisashare.in"
const BOT_PATH = "/user-auth/socket.io/"
const STALE_SECS = 60
let socket
let g_config
let lastUpdatedAt





function reloadPage  () {
    window.location.reload();
}

function getCookie (name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

function getFunctionName  () {
    return getFunctionName.caller.name;
}

function queryStringToJSON(qs) {
    var pairs = qs.split('&');
    var result = {};
    pairs.forEach(function(p) {
        var pair = p.split('=');
        var key = pair[0];
        var value = decodeURIComponent(pair[1] || '');

        if( result[key] ) {
            if( Object.prototype.toString.call( result[key] ) === '[object Array]' ) {
                result[key].push( value );
            } else {
                result[key] = [ result[key], value ];
            }
        } else {
            result[key] = value;
        }
    });

    return JSON.parse(JSON.stringify(result));
};

function getToast(message,warning=false) {
    if(warning){
        const audio = new Audio("https://github.com/TradeWithSouvik/kite-automation/blob/master/failure.mp3?raw=true");
        audio.play();
    }
    else{
        const audio = new Audio("https://github.com/TradeWithSouvik/kite-automation/blob/master/success.mp3?raw=true");
        audio.play();
    }
    return Toastify({
        text: "<span>twsAlgoBot</br>"+message+"</span>",
        duration: 5000,
        close: true,
        offset: "60px",
        style: {top: "60px",display: "grid", "grid-template-columns": "15fr 1fr", background: warning?"linear-gradient(to right, #aa4a44,#880808)":"linear-gradient(to right, #00b09b, #00b08a)"},
        escapeMarkup: false
    });
}

function setAttribute(key,value){
    const storedData=GM_getValue("__twsAlgo",{})
    storedData[key]=value
    GM_setValue("__twsAlgo",storedData)
}

function getAttribute(key){
    return GM_getValue("__twsAlgo",{})[key]
}

function makeOrder(order,script,iceberg=false){
    return new Promise((resolve,reject)=>{
        try{
            jQ.ajaxSetup({
                headers: {
                    'Authorization': `enctoken ${getCookie('enctoken')}`
                }
            });

            if(iceberg){
                order["variety"]="iceberg"
                order["iceberg_legs"]=Math.ceil(order["quantity"]/g_config.get(`${script}_FREEZE_LIMIT`))
                if(order["iceberg_legs"]<=10){
                    order["iceberg_quantity"]=order["quantity"]%order["iceberg_legs"]+Math.floor(order["quantity"]/order["iceberg_legs"])
                    jQ.post(BASE_URL + "/oms/orders/iceberg",order,(data, status) =>resolve({data,status}))
                        .fail((xhr, status, error) => reject({data:JSON.parse(xhr.responseText),error,status}));
                }
            }
            else{
                jQ.post(BASE_URL + "/oms/orders/regular",order,(data, status) =>resolve({data,status}))
                .fail((xhr, status, error) => reject({data:JSON.parse(xhr.responseText),error,status}));
            }
        }
        catch(e){
            console.log(e)
        }
    });

}

function waitForAWhile(time){
    return new Promise((resolve,reject)=>setTimeout(resolve,time))
}

function getQuote(tradingSymbol){

    return new Promise((resolve,reject)=>{
        jQ.ajaxSetup({
            headers: {
                'Authorization': `enctoken ${getCookie('enctoken')}`
            }
        });
        jQ.ajax({
            url: BASE_URL + `/oms/quote?i=NFO:${tradingSymbol}`,
            type: 'GET',
            async: false,
            cache: false,
            error: (xhr, status, error) =>reject({data:JSON.parse(xhr.responseText),error,status}),
            success: (data, status)=>resolve({data,status})
        });
    });

}

function formatDateTime(date) {
    const dateArray = date.toLocaleString().split(",")
    const [month, day, year]=dateArray[0].trim().split("/")
    const [time, ampm]=dateArray[1].trim().split(" ")
    const [hour, mins,_]=time.split(":")
    return `${year}-${addZero(month)}-${addZero(day)} ${addZero(hour)}:${addZero(mins)}${ampm?ampm:''}`
}

function addZero(val){
    return val<10&&!val.startsWith("0")?"0"+val:val
}

function socketInitialization(){
    return new Promise((resolve,reject)=>{
        if(getCookie('enctoken')){
            socket = io(BOT_URL, {path: BOT_PATH});
            socket.on("connect",()=>{
                console.log("connected, uuid : ",getAttribute("uuid"));
                setAttribute("live",true)
                getToast("Bot Logged in").showToast();
                setTimeout(()=>{
                    for(let sid of STRATEGY_IDS){
                        if( g_config.get(`${sid}__ORDER`)){
                            socket.emit("position",{userId:g_config.get("id"),strategyId:sid});
                        }
                    }
                },1000)
                socket.emit("init",{userId:g_config.get("id"),url:BASE_URL})
                if (document.querySelector("#_lastTime")){
                    document.querySelector("#_lastTime").textContent=`Bot Syncing... `
                }
                else{
                    document.querySelector("#app > div.header > div > div.header-right > div.app-nav").innerHTML="<span id='_lastTime'>Bot Syncing... </span>"+document.querySelector("#app > div.header > div > div.header-right > div.app-nav").innerHTML
                }
                resolve()
            })
            socket.on("disconnect", () => {
                setAttribute("live",false)
                getToast("Disconnected from server. Trying to reconnect",true).showToast();
            });
            socket.on('connect_failed', ()=> {
                setAttribute("live",false)
                getToast("Sorry, there seems to be an issue with the connection!",true).showToast();
            })
            socket.on('error',(error) =>{
                setAttribute("live",false)
                getToast(`error : ${error}`,true).showToast();
            })

            setInterval(function(){
                if(socket.connecting){
                    getToast("Connecting...",true).showToast();
                }

                if (!socket.connected && !socket.connecting) {
                    getToast("Trying to reconnect...",true).showToast();
                    console.log("connected, uuid : ",getAttribute("uuid"));
                    setAttribute("live",true)
                    getToast("Bot Logged in").showToast();
                    setTimeout(()=>{
                        for(let sid of STRATEGY_IDS){
                            if( g_config.get(`${sid}__ORDER`)){
                                socket.emit("position",{userId:ID||g_config.get("id"),strategyId:sid});
                            }
                        }
                    },1000)
                    socket.emit("init",{userId:ID||g_config.get("id"),url:BASE_URL})
                    if (document.querySelector("#_lastTime")){
                        document.querySelector("#_lastTime").textContent=`Bot Syncing... `
                    }
                    else{
                        document.querySelector("#app > div.header > div > div.header-right > div.app-nav").innerHTML="<span id='_lastTime'>Bot Syncing... </span>"+document.querySelector("#app > div.header > div > div.header-right > div.app-nav").innerHTML
                    }
                }
            }, 4000)

            socket.on("position",runOnPositionUpdate)
            socket.on("trade",runOnTradeUpdate)
            socket.on("position-update",runOnPositionUpdate)
        }
        else{
            reject("Not logged in")
        }

    });
}

function checkIfStrategyRunning(id){
    return STRATEGY_IDS.filter(sid=> g_config.get(`${sid}__ORDER`)).includes(id)
}

function runOnPositionUpdate(request){
    try{
        lastUpdatedAt=(new Date()).getTime()
        if (document.querySelector("#_lastTime")){
            document.querySelector("#_lastTime").textContent=`Last Bot Sync at : ${formatDateTime(new Date(lastUpdatedAt))} `
        }
        const {data}=request
        const {position,strategyId,expiry}=data
        if(checkIfStrategyRunning(strategyId)){
            console.log("Position update for ",strategyId,"at",formatDateTime(new Date()))
        }
        setAttribute(`${strategyId}_position`,{position,timestamp:(new Date()).getTime(),expiry})

    }
    catch(e){
        getToast(`error : ${e}`,true).showToast();
    }
}

function initMonkeyConfig(){
    const monkeySettings = {
        title: 'Settings',
        menuCommand: true,
        onSave: reloadPage,
        params: {
            id: {
                type: 'text',
                default: ""
            },
            NIFTY_FREEZE_LIMIT: {
                type: 'number',
                default: 1800
            },
            BANKNIFTY_FREEZE_LIMIT: {
                type: 'number',
                default: 1200
            },
            MIS_Order: {
                type: 'checkbox',
                default: true
            }
        }
    }

    for(const strategy of STRATEGIES){
        monkeySettings.params[`${strategy.strategyId}__QTY`]={
            type: 'number',
            default: 200
        }
        monkeySettings.params[`${strategy.strategyId}__ORDER`]={
            type: 'checkbox',
            default: false
        }
        if(!strategy.directional){
            monkeySettings.params[`${strategy.strategyId}__HEDGE`]={
                type: 'checkbox',
                default: true
            }
        }
    }

    g_config = new MonkeyConfig(monkeySettings);
}

async function tradeStrategy(strategyId,requestOrders,expiry){

    console.log("Trading orders",strategyId,expiry,requestOrders,"at",formatDateTime(new Date()))
    getToast(`Orders for ${strategyId} placed at ${formatDateTime(new Date())}`).showToast();
    let hedgeStatus = g_config.get(`${strategyId}__HEDGE`)
    let requestOrdersBuy=requestOrders.filter(leg=>leg.type==="BUY")
    let requestOrdersSell=requestOrders.filter(leg=>leg.type==="SELL")
    if(!hedgeStatus){
        requestOrdersBuy=requestOrdersBuy.filter(leg=>leg.isHedge!=true)
        requestOrdersSell=requestOrdersSell.filter(leg=>leg.isHedge!=true)
    }
    const requestDataBuy={
        orders:requestOrdersBuy,expiry
    }
    const requestDataSell={
        orders:requestOrdersSell,expiry
    }


    const baskets = [requestDataBuy,requestDataSell]
    for (const basket of baskets){
        let _trades=[]
        for(const order of basket.orders){
            const limitQty=g_config.get(`${order.script.toUpperCase()}_FREEZE_LIMIT`)
            const qty = g_config.get(`${strategyId}__QTY`)*(order.exitPrevious?2:1)
            _trades.push(makeOrder({
                "variety": "regular",
                "exchange": "NFO",
                "tradingsymbol": `${order.script}${order.kiteExpiryPrefix}${order.strike}${order.optionType}`,
                "transaction_type": order.type,
                "order_type": "MARKET",
                "quantity": g_config.get(`${strategyId}__QTY`)*(order.exitPrevious?2:1),
                "price": "0",
                "product":  strategyId.endsWith("POS")?"NRML":(g_config.get("MIS_Order")?"MIS":"NRML"),
                "validity": "DAY",
                "disclosed_quantity": "0",
                "trigger_price": "0",
                "squareoff": "0",
                "stoploss": "0",
                "trailing_stoploss": "0"
            },order.script.toUpperCase(),qty>limitQty))
        }
        const responses =  await Promise.all(_trades)
        await waitForAWhile(100)
    }

}

async function enterTrade(strategyId){
    try{
        const {position,expiry,timestamp}=getAttribute(`${strategyId}_position`);
        const canBeTraded=(new Date()).getTime()<timestamp+STALE_SECS*1000*(position.directional?3600:1)
        let requestOrders=[]
        let today = new Date()
        let time=`${today.getHours()}:${today.getMinutes()<10?"0"+today.getMinutes():today.getMinutes()}`
        if(position.directional&&position.requestOrders){
            requestOrders=position.requestOrders
        }
        else if(position.legs.call){
            requestOrders=[{
                type:"SELL",
                optionType:"CE",
                time,
                ltp:position.legs.call.ltp,
                strike:position.legs.call.strike,
                script:position.script,
                kiteExpiryPrefix:position.kiteExpiryPrefix
            },{
                type:"SELL",
                optionType:"PE",
                time,
                ltp:position.legs.put.ltp,
                strike:position.legs.put.strike,
                script:position.script,
                kiteExpiryPrefix:position.kiteExpiryPrefix
            },{
                type:"BUY",
                optionType:"CE",
                time,
                ltp:position.hedges.call.ltp,
                strike:position.hedges.call.strike,
                isHedge:true,
                script:position.script,
                kiteExpiryPrefix:position.kiteExpiryPrefix
            },{
                type:"BUY",
                optionType:"PE",
                time,
                ltp:position.hedges.put.ltp,
                strike:position.hedges.put.strike,
                isHedge:true,
                script:position.script,
                kiteExpiryPrefix:position.kiteExpiryPrefix
            }]
        }
        else if(position.context.strikes){
            requestOrders=[]
            if(position.context.strikes.buy){
                if(position.context.strikes.buy.call){
                    requestOrders.push({
                        type:"BUY",
                        optionType:"CE",
                        time,
                        ltp:0,
                        strike:position.context.strikes.buy.call,
                        isHedge:true,
                        script:position.script,
                        kiteExpiryPrefix:position.kiteExpiryPrefix
                    })
                }
                if(position.context.strikes.buy.put){
                    requestOrders.push({
                        type:"BUY",
                        optionType:"PE",
                        time,
                        ltp:0,
                        strike:position.context.strikes.buy.put,
                        isHedge:true,
                        script:position.script,
                        kiteExpiryPrefix:position.kiteExpiryPrefix
                    })
                }

            }
            if(position.context.strikes.sell){
                if(position.context.strikes.sell.call){
                    requestOrders.push({
                        type:"SELL",
                        optionType:"CE",
                        time,
                        ltp:0,
                        strike:position.context.strikes.sell.call,
                        script:position.script,
                        kiteExpiryPrefix:position.kiteExpiryPrefix
                    })
                }
                if(position.context.strikes.sell.put){
                    requestOrders.push({
                        type:"SELL",
                        optionType:"PE",
                        time,
                        ltp:0,
                        strike:position.context.strikes.sell.put,
                        script:position.script,
                        kiteExpiryPrefix:position.kiteExpiryPrefix
                    })
                }

            }
        }
        else if(position.context.strikeAtm){
        requestOrders=[{
            type:"SELL",
            optionType:"CE",
            strike:position.context.strikeAtm,
            script:position.script,
            kiteExpiryPrefix:position.kiteExpiryPrefix
        },{
            type:"SELL",
            optionType:"PE",
            strike:position.context.strikeAtm,
            script:position.script,
            kiteExpiryPrefix:position.kiteExpiryPrefix
        }]
    }

        if(checkIfStrategyRunning(strategyId) ){
            if(canBeTraded){
                await tradeStrategy(strategyId,requestOrders,expiry)
            }
            else{
                getToast("Position is stale",true).showToast();
                socket.emit("position",{userId:g_config.get("id"),strategyId});
            }
        }
        else{
            getToast("Strategy Switched off",true).showToast();
        }
    }
    catch(e){
        getToast(`Could not place order, error : ${JSON.stringify(e)}`,true).showToast();
        console.log(e)
    }

}

async function exitTrade(strategyId){
    try{
        const {position,expiry,timestamp}=getAttribute(`${strategyId}_position`);
        const canBeTraded=(new Date()).getTime()<timestamp+STALE_SECS*1000*(position.directional?3600:1)
        let requestOrders=[]
        let today = new Date()
        let time=`${today.getHours()}:${today.getMinutes()<10?"0"+today.getMinutes():today.getMinutes()}`

        if(position.directional&&position.requestOrders){
            requestOrders=position.requestOrders
        }
        else if(position.legs.call){
            requestOrders=[{
                type:"BUY",
                optionType:"CE",
                time,
                ltp:position.legs.call.ltp,
                strike:position.legs.call.strike,
                script:position.script,
                kiteExpiryPrefix:position.kiteExpiryPrefix
            },{
                type:"BUY",
                optionType:"PE",
                time,
                ltp:position.legs.put.ltp,
                strike:position.legs.put.strike,
                script:position.script,
                kiteExpiryPrefix:position.kiteExpiryPrefix
            },{
                type:"SELL",
                optionType:"CE",
                time,
                ltp:position.hedges.call.ltp,
                strike:position.hedges.call.strike,
                isHedge:true,
                script:position.script,
                kiteExpiryPrefix:position.kiteExpiryPrefix
            },{
                type:"SELL",
                optionType:"PE",
                time,
                ltp:position.hedges.put.ltp,
                strike:position.hedges.put.strike,
                isHedge:true,
                script:position.script,
                kiteExpiryPrefix:position.kiteExpiryPrefix
            }]
        }
        else if(position.context.strikes){
            requestOrders=[]
            if(position.context.strikes.sell){
                if(position.context.strikes.sell.call){
                    requestOrders.push({
                        type:"BUY",
                        optionType:"CE",
                        time,
                        ltp:0,
                        strike:position.context.strikes.sell.call,
                        script:position.script,
                        kiteExpiryPrefix:position.kiteExpiryPrefix
                    })
                }
                if(position.context.strikes.sell.put){
                    requestOrders.push({
                        type:"BUY",
                        optionType:"PE",
                        time,
                        ltp:0,
                        strike:position.context.strikes.sell.put,
                        script:position.script,
                        kiteExpiryPrefix:position.kiteExpiryPrefix
                    })
                }

            }
            if(position.context.strikes.buy){
                if(position.context.strikes.buy.call){
                    requestOrders.push({
                        type:"SELL",
                        optionType:"CE",
                        time,
                        ltp:0,
                        strike:position.context.strikes.buy.call,
                        isHedge:true,
                        script:position.script,
                        kiteExpiryPrefix:position.kiteExpiryPrefix
                    })
                }
                if(position.context.strikes.buy.put){
                    requestOrders.push({
                        type:"SELL",
                        optionType:"PE",
                        time,
                        ltp:0,
                        strike:position.context.strikes.buy.put,
                        isHedge:true,
                        script:position.script,
                        kiteExpiryPrefix:position.kiteExpiryPrefix
                    })
                }

            }
        }
        else if(position.context.strikeAtm){
            requestOrders=[{
                type:"BUY",
                optionType:"CE",
                strike:position.context.strikeAtm,
                script:position.script,
                kiteExpiryPrefix:position.kiteExpiryPrefix
            },{
                type:"BUY",
                optionType:"PE",
                strike:position.context.strikeAtm,
                script:position.script,
                kiteExpiryPrefix:position.kiteExpiryPrefix
            }]
        }
        if(checkIfStrategyRunning(strategyId)){
            if(canBeTraded){
                await tradeStrategy(strategyId,requestOrders,expiry)
            }
            else{
                getToast("Position is stale",true).showToast();
            }
        }
        else{
            getToast("Strategy Switched off",true).showToast();
        }
    }
    catch(e){
        getToast(`Could not place order, error : ${JSON.stringify(e)}`,true).showToast();
        console.log(e)
    }


}

async function runOnTradeUpdate(request){

    try{
        const {data}=request
        const {requestOrders,strategyId,expiry}=data
        if(data.directional){
          setAttribute(`${strategyId}_position`,{position:{requestOrders,directional:true},timestamp:(new Date()).getTime(),expiry})
        }
        if(checkIfStrategyRunning(strategyId)){
            await tradeStrategy(strategyId,requestOrders,expiry)
        }
    }
    catch(e){
        console.log(e)
        if(e&&e.data&&e.data.message){
            getToast(`${e.data.message}`,true).showToast();
        }
        else{
            getToast(`${e}`,true).showToast();
        }
    }
}

async function init(){
    try{
        initMonkeyConfig();
        GM_registerMenuCommand("Reload", reloadPage, "r");
        for(let id of STRATEGY_IDS){
            GM_registerMenuCommand(`${id} Enter`, ()=>{ enterTrade(id)});
            GM_registerMenuCommand(`${id} Exit`, ()=>{ exitTrade(id)});
        }
        await socketInitialization();
    }
    catch(e){
        console.log(e)
    }
}

;(function() {
    'use strict';
    jQ(window).bind("load", init);
})();
