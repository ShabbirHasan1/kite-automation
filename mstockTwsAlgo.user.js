// ==UserScript==
// @name         mstockTwsAlgo
// @namespace    https://paisashare.in
// @version      1.0
// @description  Algo Trading Kite
// @author       Souvik Das
// @match        https://trade.mstock.com/*
// @match        https://rspub.miraeassetcm.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_registerMenuCommand
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/js-sha512/0.8.0/sha512.min.js
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
const BASE_URL = "https://trade.mstock.com/";
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
let socket
let g_config
let lastUpdatedAt



const BROKER_CODE="MIRA152"
let salt = "498960e491150a0fc0f21822a147fd62"
let iv = "320ef7705d1030f0a1a55b3dcf676cb8"
class Encryptor {
    constructor() {
        this.AesUtil = function(t, e) {
            this.keySize = t / 32,
                this.iterationCount = e
        }
            ,
            this.generateKey = function(t, e) {
            return CryptoJS.PBKDF2(e, CryptoJS.enc.Hex.parse(t), {
                keySize: this.keySize,
                iterations: this.iterationCount
            })
        }
            ,
            this.encrypt = function(t, e, n, i) {
            var l = this.generateKey(t, n);
            return CryptoJS.AES.encrypt(i, l, {
                iv: CryptoJS.enc.Hex.parse(e)
            }).ciphertext.toString(CryptoJS.enc.Base64)
        }
            ,
            this.decrypt = function(t, e, n, i) {
            var l = this.generateKey(t, n.toString())
            , r = CryptoJS.lib.CipherParams.create({
                ciphertext: CryptoJS.enc.Base64.parse(i)
            });
            return CryptoJS.AES.decrypt(r, l, {
                iv: CryptoJS.enc.Hex.parse(e)
            }).toString(CryptoJS.enc.Utf8)
        }
    }
}
const enc = new Encryptor()
enc.AesUtil(128, 1e3)
function getInstrumentId(searchterm){

     return new Promise((resolve,reject)=>{
         let n = JSON.parse(sessionStorage.getItem("userdata"))

         const data={
             "UserId": n.userdata.ENTITYID,
             "UserType": "C",
             "Source": "W",
             "Data": JSON.stringify({
                 inst:"",
                 searchterm,
                 exch:"NSE|BSE|IDX",
                 optionflag:true,
                 indexflag:true
             }),
             "broker_code": BROKER_CODE
         }
         var settings = {
             "url": "https://rspub.miraeassetcm.com/SolrSearch/api/Search/Scrip",
             "method": "POST",
             "timeout": 0,
             "headers": {
                 "Authorization": getHashApi("MIRA152",n.userdata.ENTITYID),
                 "Content-Type": "application/json",
                 "bid": BROKER_CODE,
                 "cid": n.userdata.ENTITYID,
                 "src": "W"
             },
             "data": JSON.stringify(data),
         };

         jQ.ajax(settings).done((resp)=>{
             resolve(resp.data[0]["Sid_s"])
         });
     });

}
function dateTojulianHash(t) {
    return new Date(t + "T00:00+0530").getTime() / 1e3 - new Date("1980-01-01T00:00+0530").getTime() / 1e3
}
function getHashApi(t, e) {
    let n = new Date
    , i = n.getUTCFullYear() + "-" + ("0" + (n.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + n.getUTCDate()).slice(-2)
    , l = dateTojulianHash(i)
    , r = btoa(t) + "-" + e + "-W-" + l;
    r = sha512.array(r);
    let o = "";
    for (let a = 0; a < r.length; a++)
        o += String.fromCharCode(r[a]);
    return btoa(o)
}
function getSettlor(t, e) {
        let n = JSON.parse(sessionStorage.getItem("userdata"));
        return "NSE" == t && "E" == e ? n.Settler.EQ_ENTITY_SETTLOR : "BSE" == t && "E" == e ? n.Settler.EQ_ENTITY_BSE_SETTLOR : "NSE" == t && "D" == e ? n.Settler.DRV_ENTITY_SETTLOR : "NSE" == t && "C" == e ? n.Settler.CURR_ENTITY_SETTLOR : ""
}
function placeOrder(order){

    return new Promise(async (resolve,reject)=>{
        try{

            let e = order
            let l = sessionStorage.getItem("ucc_code");
            let r = JSON.parse(sessionStorage.getItem("userdata"));
            e.token_id = r.userdata.TOKENID
            e.keyid = r.key.toString()
            e.userid = r.userdata.ENTITYID.toString()
            e.clienttype = r.userdata.UM_USER_TYPE.toString()
            e.usercode = r.userdata.USERID.toString()
            e.pan_no = r.userdata.PANNO.toString()
            e.client_id = "8" == r.userdata.SUBTYPE && null != l ? l.toString() : r.userdata.ENTITYID.toString();
            console.log(e)
            const orderToSend = JSON.stringify(enc.encrypt(salt,iv,sessionStorage.getItem("JWTtoken"),JSON.stringify(e)))

            jQ.ajaxSetup({
                headers: {
                    "Authorisation": `Token ${sessionStorage.getItem("JWTtoken")}`,
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            });
            const data={}
            data[orderToSend]=""
            jQ.post(BASE_URL + "/trade/placeorder",data,(data, status) =>resolve({data:JSON.parse(enc.decrypt(salt, iv,sessionStorage.getItem("JWTtoken"),data)),status}))
                .fail((xhr, status, error) => reject({data:JSON.parse(xhr.responseText),error,status}));




        }
        catch(e){
            reject(e)
        }
    });

}





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


function makeOrder(order,script){
    return new Promise(async (resolve,reject)=>{
        try{
            const fl = g_config.get(`${script}_FREEZE_LIMIT`)
            const qty = order.quantity
            if(qty>fl){
                let remainingOrders=qty%fl;
                let times =Math.floor(qty/fl)
                for(let i=0;i<times;i++){
                    order.quantity=fl
                    const response = await placeOrder(order)
                    console.log(response)
                    if(response.data&&response.data.status=="error"){
                        getToast(response.data.message,true).showToast();
                    }
                    resolve(response)
                }
                if(remainingOrders>0){
                    order.quantity=remainingOrders
                    const response = await placeOrder(order)
                    console.log(response)
                    if(response.data&&response.data.status=="error"){
                        getToast(response.data.message,true).showToast();
                    }
                    resolve(response)
                }
            }
            else{
                const response = await placeOrder(order)
                console.log(response)
                if(response.data&&response.data.status=="error"){
                    getToast(response.data.message,true).showToast();
                }
                resolve(response)
            }

        }
        catch(e){
            reject(e)
        }
    });

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
        if(sessionStorage.getItem("JWTtoken")){
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
                    if (document.querySelector("#_lastTime")){
                        document.querySelector("#_lastTime").textContent=`Bot Syncing... `
                    }
                    else{
                        const path = "#nav-container > div.nav-bar-right.just-flex-space > div:nth-child(1) > div:nth-child(1)"
                       document.querySelector(path).innerHTML="<span id='_lastTime'>Bot Syncing... </span>"+document.querySelector(path).innerHTML

                    }
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
            if (document.querySelector("#_lastTime")){
                document.querySelector("#_lastTime").textContent=`Last Bot Sync at : ${formatDateTime(new Date(lastUpdatedAt))} `
            }
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
            console.log(order)
            const limitQty=g_config.get(`${order.script.toUpperCase()}_FREEZE_LIMIT`)
            const qty = g_config.get(`${strategyId}__QTY`)*(order.exitPrevious?2:1)
            _trades.push(makeOrder({
                qty: g_config.get(`${strategyId}__QTY`)*(order.exitPrevious?2:1),
                price: "MKT" ,
                odr_type: "MKT" ,
                product_typ: strategyId.endsWith("POS")?"NRML":(g_config.get("MIS_Order")?"I":"M"),
                trg_prc: 0,
                validity: "DAY",
                disc_qty: 0,
                amo: false,
                sec_id: (await getInstrumentId(`${order.script} ${expiry.split("-").join(" ").toUpperCase()} ${order.strike} ${order.optionType}`)),
                inst_type: "OPTIDX",
                exch: "NSE",
                buysell: "S",
                gtdDate:  "0000-00-00",
                mktProtectionFlag: "N",
                mktProtectionVal: 0,
                settler: getSettlor("NSE", "D")
            },order.script.toUpperCase(),qty>limitQty))
        }
        const responses =  await Promise.all(_trades)
        await waitForAWhile(200)
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



let initiated = false
async function init(){
    try{
        initiated = true
        let code = (await jQ.get("https://trade.mstock.com/"))
                   .split("main-es").pop().split(".js").shift()
        let js = (await jQ.get(`https://trade.mstock.com/main-es${code}.js`))
        salt = js.split(`this.salt="`).pop().split(`"`).shift()
        iv = js.split(`this.iv="`).pop().split(`"`).shift()
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
    setTimeout(()=>{
      if(!initiated){
        init();
      }
    },5000)
})();
