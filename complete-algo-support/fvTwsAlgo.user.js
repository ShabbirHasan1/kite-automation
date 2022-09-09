// ==UserScript==
// @name         finvasiaTwsAlgo
// @namespace    https://paisashare.in
// @version      1.0
// @description  Algo Trading Finvaisa
// @author       Souvik Das
// @match        https://shoonya.finvasia.com/*
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
const BASE_URL = "https://shoonya.finvasia.com/";
const STRATEGIES=[{strategyId:"NIFTY_2259621564362513"},
                  {strategyId:"NIFTY_8915142776897629"},
                  {strategyId:"NIFTY_2662529212584048"},
                  {strategyId:"NIFTY_7576513120993982"},
                  {strategyId:"NIFTY_nd_bot_1"},
                  {strategyId:"BANKNIFTY_nd_bot_2"},
                  {strategyId:"NIFTY_DZPOS",directional:true},
                  {strategyId:"NIFTY_TFPOS",directional:true},
                  {strategyId:"NIFTY_TFINTRA",directional:true},
                  {strategyId:"BANKNIFTY_TFPOS",directional:true},
                  {strategyId:"BANKNIFTY_SWPOS",directional:true},
                  {strategyId:"BANKNIFTY_OBPOS",directional:true}
                 ]
const STRATEGY_IDS=STRATEGIES.map(_=>_.strategyId)
const BOT_URL = "wss://paisashare.in"
const BOT_PATH = "/user-auth/socket.io/"
const STALE_SECS = 60
const FIX_LIMIT=3
let positions = {}
let socket
let g_config
let lastUpdatedAt
let fixTrails=0





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


async function makeOrder(order,script){
        try{
            const fl = g_config.get(`${script}_FREEZE_LIMIT`)
            const qty = order.quantity
            const responses =[]
            if(qty>fl){
                let remainingOrders=qty%fl;
                let times =Math.floor(qty/fl)
                for(let i=0;i<times;i++){
                    order.qty=fl.toString()
                    const data =`jData=${JSON.stringify(order)}&jKey=${sessionStorage.getItem('susertoken')}`
                    responses.push((await jQ.post(BASE_URL + "NorenWClientWeb/PlaceOrder", data).promise()))
                }
                if(remainingOrders>0){
                    order.qty=remainingOrders.toString()
                    const data =`jData=${JSON.stringify(order)}&jKey=${sessionStorage.getItem('susertoken')}`
                    responses.push((await jQ.post(BASE_URL + "NorenWClientWeb/PlaceOrder", data).promise()))
                }
            }
            else{
                 const data =`jData=${JSON.stringify(order)}&jKey=${sessionStorage.getItem('susertoken')}`
                 responses.push((await jQ.post(BASE_URL + "NorenWClientWeb/PlaceOrder", data).promise()))

            }
            return responses.map(respData=>{
                        try{
                            return {
                                orderSuccess:respData["stat"]&&respData["stat"].toLowerCase()=="ok",
                                orderNumber:respData["norenordno"]
                            }
                        }
                        catch(e){
                            return respData
                        }
                    })

        }
        catch(e){
            console.log(e)
        }

}




async function getInstrumentToken(name){
    return (await jQ.get(BASE_URL + `/api/v1/search?key=${name}`)).result[0].token
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
        if(sessionStorage.getItem('susertoken')){
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
                if(g_config.get(`last_sync_info`)){
                    console.log("Bot Syncing...")
                }
                resolve()
            })

            socket.on("sendId",async()=>{
                console.log("Requested id")
                socket.emit("init",{userId:g_config.get("id"),url:BASE_URL})

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
        if(g_config.get(`last_sync_info`)){
            console.log(`Last Bot Sync at : ${formatDateTime(new Date(lastUpdatedAt))} `)
        }
        const {data}=request
        const {position,strategyId,expiry}=data
        positions[strategyId]=data
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
            },
            last_sync_info: {
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
let isTrading = false
async function tradeStrategy(strategyId,requestOrders,expiry){
    isTrading=true
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
    let _trades=[]
    for (const basket of baskets){
        for(const order of basket.orders){
            const limitQty=g_config.get(`${order.script.toUpperCase()}_FREEZE_LIMIT`)
            const qty = g_config.get(`${strategyId}__QTY`)*(order.exitPrevious?2:1)
            _trades.push(makeOrder({
                uid:sessionStorage.getItem('uid'),
                actid:sessionStorage.getItem('actid'),
                exch:"NFO",
                tsym:`${order.script}${expiry.match("(..)-(...)-..(..)").slice(1,4).join("").toUpperCase()}${order.optionType[0]}${order.strike}`,
                qty:qty.toString(),
                prc:"0",
                prd:strategyId.endsWith("POS")?"M":(g_config.get("MIS_Order")?"I":"M"),
                trantype:order.type[0],
                prctyp:"MKT",
                ret:"DAY",
                ordersource:"WEB"
            } ,order.script.toUpperCase()))
        }
        await waitForAWhile(200)
    }
    const failedResponses =  (await Promise.all(_trades)).reduce((acc, val) => acc.concat(val), []).filter(_=>!_.orderSuccess)
    if(failedResponses.length>0){
        failedResponses.forEach(_=>{
            console.log("Failed Order",_)
            getToast(`Failed Order ${JSON.stringify(_)}`,true).showToast();
        })
    }
    else{
        getToast(`All orders successfully placed`).showToast();
        console.log("All orders successfully placed")
    }
    isTrading=false

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
            }]
            if(position.hedges&&position.hedges.call&&position.hedges.put){
                requestOrders.push({
                    type:"BUY",
                    optionType:"CE",
                    time,
                    ltp:position.hedges.call.ltp,
                    strike:position.hedges.call.strike,
                    isHedge:true,
                    script:position.script,
                    kiteExpiryPrefix:position.kiteExpiryPrefix
                })
                requestOrders.push({
                    type:"BUY",
                    optionType:"PE",
                    time,
                    ltp:position.hedges.put.ltp,
                    strike:position.hedges.put.strike,
                    isHedge:true,
                    script:position.script,
                    kiteExpiryPrefix:position.kiteExpiryPrefix
                })
            }
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
            }]
            if(position.hedges&&position.hedges.call&&position.hedges.put){
                requestOrders.push({
                    type:"SELL",
                    optionType:"CE",
                    time,
                    ltp:position.hedges.call.ltp,
                    strike:position.hedges.call.strike,
                    isHedge:true,
                    script:position.script,
                    kiteExpiryPrefix:position.kiteExpiryPrefix
                })
                requestOrders.push({
                    type:"SELL",
                    optionType:"PE",
                    time,
                    ltp:position.hedges.put.ltp,
                    strike:position.hedges.put.strike,
                    isHedge:true,
                    script:position.script,
                    kiteExpiryPrefix:position.kiteExpiryPrefix
                })
            }
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

let initiated = false
async function init(){
    try{
        initiated = true
        initMonkeyConfig();
        GM_registerMenuCommand("Reload", reloadPage, "r");
        for(let id of STRATEGY_IDS){
            GM_registerMenuCommand(`${id} Enter`, ()=>{ enterTrade(id)});
            GM_registerMenuCommand(`${id} Exit`, ()=>{ exitTrade(id)});
        }
        await socketInitialization();
       while(true){
           await checkPositions()
           await waitForAWhile(5000*Math.pow(2,fixTrails))
       }
    }
    catch(e){
        console.log(e)
    }
}

function getPosition(){
    return new Promise((resolve,reject)=>{
        const body = {uid:sessionStorage.getItem('uid'),actid:sessionStorage.getItem('actid')}
        const data =`jData=${JSON.stringify(body)}&jKey=${sessionStorage.getItem('susertoken')}`
        jQ.post(BASE_URL + "NorenWClientWeb/PositionBook", data,(data, status) =>resolve({data,status}))
            .fail((xhr, status, error) => reject({data:JSON.parse(xhr.responseText),error,status}));
    });
}

async function getAllPositions(){
    try{
        let existingPositions={}
        let existingKiteSymbolsMap={}

        let data=(await getPosition()).data;
        if(data&&Array.isArray(data)){
            data.filter(_=>parseInt(_.netqty)!=0&&(_.dname.trim().toUpperCase().endsWith("CE")||_.dname.trim().toUpperCase().endsWith("PE")))
                .forEach(el=>{
                let scriptElements = el.dname.trim().toUpperCase().split(" ")
                let quantity=parseInt(el.netqty),
                    optionType=scriptElements.pop(),
                    strike=scriptElements.pop(),
                    script=scriptElements.shift()
                let key = `${script}-${strike}-${optionType}`
                if(existingPositions[key]){
                    existingPositions[key]+=quantity
                }
                else{
                    existingPositions[key]=quantity
                }
            })
        }
        return {existingPositions,existingKiteSymbolsMap}
    }
    catch(e){
        console.log(e)
        console.log("Error in getting all positions")
    }
}

async function checkPositions(){
        let today = new Date()
        if(!isTrading&&(today.getHours()<15||(today.getHours()==15&&today.getMinutes()<25))&&(today.getHours()>9||(today.getHours()==9&&today.getMinutes()>16))){

            isTrading=true
            try{
                let time=`${today.getHours()}:${today.getMinutes()<10?"0"+today.getMinutes():today.getMinutes()}`

                const strategyIds=STRATEGIES.map(_=>_.strategyId)
                const botPositions={}
                let expirySaved
                let botKiteSymbolsMap={}
                strategyIds.forEach((strategyId)=>{
                    if(checkIfStrategyRunning(strategyId)){
                        try{
                            if(positions[strategyId]&&positions[strategyId].position){
                                const {position,expiry}=positions[strategyId]
                                if(expiry){
                                    expirySaved=expiry
                                }
                                let requestOrders=[]
                                if(position.directional&&position.requestOrders){
                                    requestOrders=position.requestOrders
                                }
                                else if(position.legs.call){
                                    if(!position.slHit){
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
                                        }]
                                        if(g_config.get(`${strategyId}__HEDGE`)){

                                            if(position.hedges&&position.hedges.call&&position.hedges.put){
                                                requestOrders.push({
                                                    type:"BUY",
                                                    optionType:"CE",
                                                    time,
                                                    ltp:position.hedges.call.ltp,
                                                    strike:position.hedges.call.strike,
                                                    isHedge:true,
                                                    script:position.script,
                                                    kiteExpiryPrefix:position.kiteExpiryPrefix
                                                })
                                                requestOrders.push({
                                                    type:"BUY",
                                                    optionType:"PE",
                                                    time,
                                                    ltp:position.hedges.put.ltp,
                                                    strike:position.hedges.put.strike,
                                                    isHedge:true,
                                                    script:position.script,
                                                    kiteExpiryPrefix:position.kiteExpiryPrefix
                                                })
                                            }
                                        }
                                    }
                                }
                                else if(position.context.strikes){
                                    requestOrders=[]
                                    //if(position.context.status!="EXITED"){
                                    if(position.context.strikes.buy){
                                        if(g_config.get(`${strategyId}__HEDGE`)){
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
                                    //}
                                }
                                else if(position.context.strikeAtm){
                                    if(position.context.status!="EXITED"){
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
                                }

                                for(let order of requestOrders){
                                let quantity=parseInt(g_config.get(`${strategyId}__QTY`))
                                quantity=order.type=="SELL"?-quantity:quantity
                                let {script,optionType,strike} = order
                                let key = `${script}-${strike}-${optionType}`
                                if(botPositions[key]){
                                    botPositions[key]+=quantity
                                }
                                else{
                                    botPositions[key]=quantity
                                }
                                botKiteSymbolsMap[key]=order.kiteExpiryPrefix
                            }
                            }
                        }
                        catch(e){
                            console.log(e)
                            console.log("Error in looping strategies",strategyId)
                        }
                    }
                })
                const {existingPositions,existingKiteSymbolsMap} = await getAllPositions()
                const botPositionIds = Object.keys(botPositions)
                const existingPositionIds = Object.keys(existingPositions)
                const toAddPositions = botPositionIds.filter(x => !existingPositionIds.includes(x));
                const toRemovePositions = existingPositionIds.filter(x => !botPositionIds.includes(x));
                const toUpdatePositions = existingPositionIds.filter(x => botPositionIds.includes(x));
                const buildOrders={}
                for(const pos of toAddPositions){
                    buildOrders[pos]=botPositions[pos]
                }
                for(const pos of toRemovePositions){
                    buildOrders[pos]=-existingPositions[pos]
                }
                for(const pos of toUpdatePositions){
                    buildOrders[pos]=botPositions[pos]-existingPositions[pos]
                }
                let globalRequestOrders=[]
                for(const key of Object.keys(buildOrders)){
                    let quantity = Math.abs(buildOrders[key])
                    if(quantity!=0){
                        let [script,strike,optionType]=key.split("-")
                        let type = buildOrders[key]>0?"BUY":"SELL"
                        quantity=quantity.toString()
                        globalRequestOrders.push({
                            type,
                            optionType,
                            time,
                            ltp:0,
                            strike,
                            script,
                            quantity,
                            kiteExpiryPrefix:existingKiteSymbolsMap[key]||botKiteSymbolsMap[key]
                        })
                    }
                }
                if(expirySaved){
                    if(globalRequestOrders.length>0){
                        if(fixTrails<FIX_LIMIT){
                            fixTrails++
                            await fixStrategy(globalRequestOrders,expirySaved)
                        }
                        else{
                            console.log("FIX LIMIT EXCEEDED. PLEASE FIX MANUALLY")
                            getToast(`FIX LIMIT EXCEEDED. PLEASE FIX MANUALLY`,true).showToast();
                        }
                    }
                    else{
                        fixTrails=0
                    }
                }
            }
            catch(e){
                console.log(e)
                console.log("Error in checking positions")
            }
            isTrading=false
        }

}

async function fixStrategy(requestOrders,expiry){


    console.log("Fixing orders",expiry,requestOrders.map(_=>`${_.type} ${_.quantity} ${_.script} ${_.strike}`).join("\n"),"at",formatDateTime(new Date()))
    let requestOrdersBuy=requestOrders.filter(leg=>leg.type==="BUY")
    let requestOrdersSell=requestOrders.filter(leg=>leg.type==="SELL")
    const requestDataBuy={
        orders:requestOrdersBuy,expiry
    }
    const requestDataSell={
        orders:requestOrdersSell,expiry
    }


    const baskets = [requestDataBuy,requestDataSell]
    let _trades=[]
    for (const basket of baskets){
        for(const order of basket.orders){
            //await refreshTokens()
            _trades.push(makeOrder({
                uid:sessionStorage.getItem('uid'),
                actid:sessionStorage.getItem('actid'),
                exch:"NFO",
                tsym:`${order.script}${expiry.match("(..)-(...)-..(..)").slice(1,4).join("").toUpperCase()}${order.optionType[0]}${order.strike}`,
                qty:order.quantity.toString(),
                prc:"0",
                prd:"I",
                trantype:order.type[0],
                prctyp:"MKT",
                ret:"DAY",
                ordersource:"WEB"
            } ,order.script.toUpperCase()))
        }
        await waitForAWhile(100)
    }
    const failedResponses =  (await Promise.all(_trades)).reduce((acc, val) => acc.concat(val), []).filter(_=>!_.orderSuccess)
    if(failedResponses.length>0){
        failedResponses.forEach(_=>{
            console.log("Failed Order Fixes",_)
            getToast(`Failed Order Fixes ${JSON.stringify(_)}`,true).showToast();
        })
    }
    else{
        getToast(`All order fixes successfully placed`).showToast();
        console.log("All order fixes successfully placed")
    }
}

;(function() {
    'use strict';
    jQ(window).bind("load", init);
    setTimeout(()=>{
      if(!initiated){
        init();
      }
    },5000)
})();