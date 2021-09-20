const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())
const { devices } = require('puppeteer');
const iPhonex = devices['iPhone X'];
const iPadPro = devices['iPad Pro landscape'];
const _ = require('lodash');
const io = require('socket.io-client');
const _fs = require('fs')
const fs = require('fs').promises;
const socket = io('http://192.168.1.1');
const WebSocket = require('ws')

const args = {
  headless: false,
  devtools: false,
  ignoreHTTPSErrors: true,
  args: ['--disable-dev-shm-usage']
}

function existsAsync(path) {
  return new Promise(function(resolve, reject){
    _fs.exists(path, function(exists){
      resolve(exists);
    })
  })
}
function delay(timeout) {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
}


const USERNAME = 'MANA_USERNAME'
const PASSWORD = 'MANA_PASSWORD'
const pup = async (USERNAME, PASSWORD) => {
  if (!(await existsAsync('./cookies.json'))) {
    console.log('cookie does not exists')
    await getCookie(USERNAME, PASSWORD);
  }
  console.log('cookie exists')
  const cookiesString = await fs.readFile('./cookies.json');
  const cookies = JSON.parse(cookiesString);
  const URL = 'https://bet365.gr/#/IP/';
  const betBrowser = await puppeteer.launch(args);
  const pageBet = await betBrowser.newPage();
  await pageBet.emulate(iPadPro);
  await pageBet.setCookie(...cookies);


  try {
    await pageBet.goto(URL);
    await pageBet.waitForNavigation({
      waitUntil: 'networkidle0',
  });
    await pageBet.waitForSelector('.hm-MainHeaderMembersWide')
    await pageBet.goto('https://bet365.gr/#/MB/')

    const eventReg = /EX=(.*?)\~/gm
    const marketReg = /EX=.*?\~(.*?)\;/gm;
    const moneyBetReg = /ST=(.*?)\;/gm;
    const betTypeReg = /VA=.*?;NA=(.*?)\;RE/gm
    const selectReg = /OR=.*?NA=(.*?)\;OD=/gm

    const getOD = /OD=(.*?)\;EX=/gm
    const getFD = /FD=(.*?)\;BC=/gm
    const getI2 = /I2=(.*?)\;PE=/gm
    const getSA = /SA=(.*?)\;SU=/gm
    const getIT = /IT=(.*?)-/gm
    const getTP = /TX=.;TP=(.*?);RS/gm
    const f12 = await pageBet.target().createCDPSession();
    await f12.send('Network.enable');
    await f12.send('Page.enable');
    const getValue = (reg, str, multiple = true) => {
      let m;
      var data = [];
      return new Promise((resolve, reject) => {
        while ((m = reg.exec(str)) !== null) {
          // This is necessary to avoid infinite loops with zero-width matches
          if (m.index === reg.lastIndex) {
            reg.lastIndex++;
          }
          m.forEach((match, groupIndex) => {
            if (groupIndex === 1) {
              if (multiple) {
                data.push(match)
              } else {
                resolve(match)
              }
            }
          });
          if (multiple) {
            resolve(data)
          }
        }
        resolve(multiple ? [] : null)
      })
    }

    const argsAddBet = async (payload, sa) => {
      const OD = await getValue(getOD, payload, false);
      const FD = await getValue(getFD, payload, false);
      const I2 = await getValue(getI2, payload, false);
      return `pt=N#o=${OD}#f=${FD}#fp=${I2}#so=#c=1#${sa ? `sa=${sa}#` : `id=${FD}-${I2}Y#`}mt=1#|TP=BS${FD}-${I2}#||`
    }

    const sendBet = async (KEY) => {
      let ns = '';
      let BSElems = []
      let bsidsObj = {}
      console.log(betlist)
      _.forEach(betlist[KEY], (e, idx) => {
        if (_.isArray(e.BS)) {
          BSElems = [...BSElems, ...e.BS]
          bsidsObj[idx] = e
        }
      });
      const BSIDS = _.uniq(BSElems).map(e => e.replace('BS', '').split('-'));
      BSIDS.forEach(BS => {
        const [FD, I2] = BS
        const findBSObj = _.find(betlist[KEY], (IT) => {
          return IT.types.sa.hasOwnProperty(`BS${BS.join('-')}`);
        })
        const ODD = findBSObj.types.od[`BS${BS.join('-')}`]
        ns +=  `pt=N#o=${ODD}#f=${FD}#fp=${I2}#so=#c=1#mt=1#|TP=BS${FD}-${I2}#||`
      })
      socket.emit('newBet', {
        ns,
        betlist: betlist[KEY],
      })
      
      delete betlist[KEY]
    }

    const getSocketSA = async (payload) => {
      const BS = `BS${await getValue(getFD, payload, false)}-${await getValue(getI2, payload, false)}`;
      const parentKey = _.findKey(betlist, (bets) => _.findKey(bets, bet => 
        _.isArray(bet.BS) ? bet.BS.includes(BS) : false
      ));
      const betKey = _.findKey(betlist[parentKey], (bet) => bet.BS.includes(BS));
      console.log('test', BS, betlist, parentKey, betKey)
      if(parentKey && betKey){
        debouncedSetBet(parentKey)
      }
    }

    const betlist = {};
    const bsids = [];

    const debouncedSetBet = _.debounce(sendBet, 1000);
    const debouncedGetSA = _.debounce(getSocketSA, 1000);
    const handleWebSocketFrameReceived = async (params) => {
      const payload = params.response.payloadData;
      const hasNewBet = payload.includes('OD=') && payload.includes('OPENBETS') && payload.includes('ED=Ανοικτό') && payload.includes('EX=')
      const reg = /;SA=(.*?);SU=/gm
      const isBSDATA = reg.test(payload);
      const OPENBETS = payload.split(
        String.fromCharCode(21)
      ).filter(e => e.split(String.fromCharCode(1))[0].includes('OPENBETS/'))
      if (hasNewBet && OPENBETS.length) {
        console.log('hasNewBet')
        const ids = OPENBETS.map(e => e.split(String.fromCharCode(1))[0].split('/')[1])
        for (openBETpayload of OPENBETS){
          console.log('openBETpayload', openBETpayload)
          const isSequence = openBETpayload.includes('SE') 
          const openbetStr = openBETpayload.split(String.fromCharCode(1))[0].split('/')
          const sequence = (openbetStr[openbetStr.length - 1])
          
          const ID = sequence.replace('SE','BE').replace(/-\d/gm, '')

          const hasKey = _.findKey(betlist, (e => ids.some(i => e.hasOwnProperty(i))));
          const FD = await getValue(getFD, openBETpayload, false);
          const I2 = await getValue(getI2, openBETpayload, false);
          const TP = await getValue(getTP, openBETpayload, false);
          const KEY = hasKey || TP;
          
          if(TP) {
            if(!hasKey) {
              console.log('hasTP and key', TP)
              ids.forEach(id => {
                betlist[KEY] = {
                  [id]: {}
                }
              })
            } else if(!betlist[KEY][ID]) {
              console.log('has TP no key')
              betlist[KEY][ID] = {}
            }
          }
          
          const event = await getValue(eventReg, openBETpayload, false);
          const market = await getValue(marketReg, openBETpayload, false);
          const moneyBet = await getValue(moneyBetReg, openBETpayload, false);
          const select = await getValue(selectReg, openBETpayload, false);
          const betType = await getValue(betTypeReg, openBETpayload, false);
          console.log(isSequence, FD && I2 && KEY)
          if(!isSequence) {
            console.log('not sequence')
            if(!betlist[KEY]) {
              console.log('not exists key')
              betlist[KEY] = {}
            }
            betlist[KEY][ID] = {
              BS: [],
              types: {
                moneyBet,
                betType,
              }
            }
          }
          console.log(betlist[KEY][ID])
          if(isSequence && FD && I2 && KEY){
            console.log('is sequence')
            const OD = await getValue(getOD, openBETpayload, false);
            betlist[KEY][ID] = {
              BS: [...(_.get(betlist[KEY][ID], 'BS') || []), `BS${FD}-${I2}`],
              payloads: [...(_.get(betlist[KEY][ID], 'payloads') || []), openBETpayload],
              types: {
                ...(_.get(betlist[KEY][ID], 'types')),
                sa: {...(_.get(_.get(betlist[KEY][ID], 'types'), 'sa') || {}), [`BS${FD}-${I2}`]: null},
                od: {
                  ...(_.get(_.get(betlist[KEY][ID], 'types'), 'od') || {}),
                  [`BS${FD}-${I2}`]: OD,
                }
              }
            }
            bsids.push(`BS${FD}-${I2}`);
            debouncedGetSA(openBETpayload);

          }

        }
      } else if (isBSDATA) {
        
      }
    }


    f12.on('Network.webSocketFrameReceived', handleWebSocketFrameReceived);

  } catch (e) {

  }

  await delay(4000);

  // console.log('i am fine')
  pageBet.on('response', async response => {
    if (response.status() > 399) {
      await page.close();
      await browser.close();
      process.exit(0)
    }
  });

  pageBet.waitForSelector('.alm-ActivityLimitAlert .alm-ActivityLimitAlert_Button', {
    visible: true,
    timeout: 0
  }).then(async () => {
    await pageBet.click('.alm-ActivityLimitAlert .alm-ActivityLimitAlert_Button')
  })

}

const getCookie = (USERNAME, PASSWORD) => {
  return new Promise(async (resolve) => {

  const URL = 'https://bet365.gr/#/IP/';
  const betBrowser = await puppeteer.launch(args);
  const pageBet = await betBrowser.newPage();
  await pageBet.emulate(iPhonex);

  try {
    await pageBet.goto(URL);
    await pageBet.waitForNavigation({
      waitUntil: 'networkidle0',
  });
    await pageBet.waitForSelector('.hm-MainHeaderRHSLoggedOutNarrow', { visible: true })
      .then(async () => {
        await pageBet.click('.hm-MainHeaderRHSLoggedOutNarrow_Login')
      })

    await pageBet.waitForSelector('.lms-StandardLogin_Content')
    await pageBet.type('.lms-StandardLogin_Content input[type="text"]', USERNAME)
    await pageBet.type('.lms-StandardLogin_Content [type="password"]', PASSWORD)

    await pageBet.waitForSelector('.lms-StandardLogin_LoginButton')
    await pageBet.waitFor(2000)
    await pageBet.click('.lms-StandardLogin_LoginButton');
    await pageBet.waitForSelector('.hm-MainHeaderMembersNarrow_Balance.hm-Balance')
    const cookies = await pageBet.cookies();
    await fs.writeFile('./cookies.json', JSON.stringify(cookies, null, 2));
    await pageBet.close();
    await betBrowser.close();
    resolve();
  } catch (e) {
    console.log(e)
    resolve(e);
  }
  })  
}

pup(USERNAME, PASSWORD);


const SECOND = 1000
const MINUTE = SECOND * 60
const HOUR = MINUTE * 60
setInterval(()=> {
  getCookie(USERNAME, PASSWORD)
}, HOUR)
setTimeout(() => {
  process.exit()
}, HOUR + (MINUTE * 20) )