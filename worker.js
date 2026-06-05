const TOKEN = ENV_BOT_TOKEN // Get it from @BotFather
const WEBHOOK = '/endpoint'
const SECRET = ENV_BOT_SECRET // A-Z, a-z, 0-9, _ and -
const ADMIN_UID = ENV_ADMIN_UID // your user id, get it from https://t.me/username_to_id_bot

const NOTIFY_INTERVAL = 3600 * 1000;
const FRAUD_DB_URL = ENV_FRAUD_DB_URL;
const notificationUrl = ENV_NOTIFICATION_URL || 'https://raw.githubusercontent.com/jy02739245/nfd/main/data/notification.txt'
const startMsgUrl = ENV_START_MSG_URL || 'https://raw.githubusercontent.com/jy02739245/nfd/main/data/startMessage.md';



const BAD_WORDS_URL = ENV_BAD_WORDS_URL; // 脏话关键词URL
const AD_WORDS_URL = ENV_AD_WORDS_URL; // 广告关键词URL

const enable_notification = true

let BAD_WORDS = []; // 脏话关键词列表
let AD_WORDS = []; // 广告关键词列表

/**
 * 初始化加载脏话和广告关键词
 */
async function loadKeywords() {
  try {
    const badWordsResponse = await fetch(BAD_WORDS_URL);
    const adWordsResponse = await fetch(AD_WORDS_URL);

    if (!badWordsResponse.ok || !adWordsResponse.ok) {
      throw new Error(`获取关键词失败: ${badWordsResponse.statusText} / ${adWordsResponse.statusText}`);
    }

    const badWordsData = await badWordsResponse.json();
    const adWordsData = await adWordsResponse.json();

    BAD_WORDS = {
      plain: badWordsData.plain || [],
      regex: (badWordsData.regex || []).map(pattern => new RegExp(pattern, 'i'))
    };

    AD_WORDS = {
      plain: adWordsData.plain || [],
      regex: (adWordsData.regex || []).map(pattern => new RegExp(pattern, 'i'))
    };

    console.log('关键词加载成功');
  } catch (error) {
    console.error('加载关键词时出错:', error);
  }
}

/**
 * 检查消息是否包含脏话或广告
 */
function containsBadWordsOrAds(text) {
  if (!BAD_WORDS.plain || !BAD_WORDS.regex || !AD_WORDS.plain || !AD_WORDS.regex) {
    console.error('关键词尚未加载');
    return null;
  }

  // 检查普通字符串
  for (const word of BAD_WORDS.plain) {
    if (text.includes(word)) {
      return 'badWord';
    }
  }
  for (const word of AD_WORDS.plain) {
    if (text.includes(word)) {
      return 'adWord';
    }
  }

  // 检查正则表达式
  for (const regex of BAD_WORDS.regex) {
    if (regex.test(text)) {
      return 'badWord';
    }
  }
  for (const regex of AD_WORDS.regex) {
    if (regex.test(text)) {
      return 'adWord';
    }
  }

  return null;
}

/**
 * 检查是否为通过内联机器人发送的消息
 */
function isViaBotMessage(message) {
  return Boolean(message.via_bot);
}

/**
 * Return url to telegram api, optionally with parameters added
 */
function apiUrl (methodName, params = null) {
  let query = ''
  if (params) {
    query = '?' + new URLSearchParams(params).toString()
  }
  return `https://api.telegram.org/bot${TOKEN}/${methodName}${query}`
}

async function requestTelegram(methodName, body, params = null){
  try {
    const response = await fetch(apiUrl(methodName, params), body)
    const result = await response.json()
    if(!response.ok){
      console.error(`Telegram API请求失败: ${response.statusText}`, result)
    }
    return result
  } catch (error) {
    console.error('请求Telegram API时出错:', error)
    return null
  }
}

function makeReqBody(body){
  return {
    method:'POST',
    headers:{
      'content-type':'application/json'
    },
    body:JSON.stringify(body)
  }
}

function sendMessage(msg = {}){
  return requestTelegram('sendMessage', makeReqBody(msg))
}

function copyMessage(msg = {}){
  return requestTelegram('copyMessage', makeReqBody(msg))
}

function forwardMessage(msg){
  return requestTelegram('forwardMessage', makeReqBody(msg))
}

function getChat(msg = {}){
  return requestTelegram('getChat', makeReqBody(msg))
}

/**
 * Wait for requests to the worker
 */
addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.pathname === WEBHOOK) {
    event.respondWith(handleWebhook(event))
  } else if (url.pathname === '/registerWebhook') {
    event.respondWith(registerWebhook(event, url, WEBHOOK, SECRET))
  } else if (url.pathname === '/unRegisterWebhook') {
    event.respondWith(unRegisterWebhook(event))
  } else {
    event.respondWith(new Response('No handler for this request'))
  }
})

/**
 * Handle requests to WEBHOOK
 * https://core.telegram.org/bots/api#update
 */
async function handleWebhook (event) {
  // Check secret
  if (event.request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== SECRET) {
    return new Response('Unauthorized', { status: 403 })
  }

  // Read request body synchronously
  const update = await event.request.json()
  // Deal with response asynchronously
  event.waitUntil(onUpdate(update))

  return new Response('Ok')
}

/**
 * Handle incoming Update
 * https://core.telegram.org/bots/api#update
 */
async function onUpdate (update) {
  // 如果关键词尚未加载，加载关键词
  if (BAD_WORDS.length === 0 || AD_WORDS.length === 0) {
    await loadKeywords();
  }

  if ('message' in update) {
    await onMessage(update.message)
  }
}

/**
 * Handle incoming Message
 * https://core.telegram.org/bots/api#message
 */
/**
 * Handle incoming Message
 * https://core.telegram.org/bots/api#message
 */
async function onMessage (message) {
  const isAdmin = message.chat.id.toString() === ADMIN_UID;

  // 1. 处理 /start 命令 (仅针对纯文本)
  if(message.text === '/start'){
    let startMsg = await fetch(startMsgUrl).then(r => r.text())
    return sendMessage({
      chat_id:message.chat.id,
      text:startMsg,
    })
  }

  // 2. 过滤通过内联机器人发送的访客消息，例如 Telegram 客户端显示的 via @PostBot
  if(!isAdmin && isViaBotMessage(message)){
    return sendMessage({
      chat_id: message.chat.id,
      text: '消息包含不允许的广告内容，请勿发送广告。',
    })
  }

  // 3. 修复点：安全获取消息内容
  // 图片/视频的文字在 caption 中，纯文本在 text 中，贴纸/无标题图片则为空字符串
  const contentToCheck = message.text || message.caption || '';

  // 4. 只有当存在文本内容时，才进行关键词检测
  if (contentToCheck) {
      const checkResult = containsBadWordsOrAds(contentToCheck);
      if (checkResult === 'badWord') {
          await sendMessage({
          chat_id: message.chat.id,
          text: '消息包含不允许的脏话，请注意言辞。',
          });
          return;
      } else if (checkResult === 'adWord') {
          await sendMessage({
          chat_id: message.chat.id,
          text: '消息包含不允许的广告内容，请勿发送广告。',
          });
          return;
      }
  }

  // 5. 管理员逻辑
  if(isAdmin){
    if(message.text && /^\/user\s+(-?\d+)$/.exec(message.text)){
      const uid = message.text.match(/^\/user\s+(-?\d+)$/)[1]
      return handleUserInfo(uid)
    }

    if(!message?.reply_to_message?.chat){
      // 如果管理员直接发送图片但没回复人，提示用法
      // 注意：这里为了方便管理员存图，也可以选择不return，而是允许管理员自己发给自己
      return sendMessage({
        chat_id:ADMIN_UID,
        text:'使用方法，回复转发的消息，并发送回复消息，或者`/block`、`/unblock`、`/checkblock`等指令；也可以发送`/user UID`查询用户信息'
      })
    }
    // 指令只在有文本时有效
    if(message.text && /^\/block$/.exec(message.text)){
      return handleBlock(message)
    }
    if(message.text && /^\/unblock$/.exec(message.text)){
      return handleUnBlock(message)
    }
    if(message.text && /^\/checkblock$/.exec(message.text)){
      return checkBlock(message)
    }

    let guestChantId = await nfd.get('msg-map-' + message?.reply_to_message.message_id,
                                      { type: "json" })
    if(!guestChantId){
      return sendMessage({
        chat_id: ADMIN_UID,
        text:'未找到关联的用户消息ID'
      })
    }

    // copyMessage 支持图片、文本等所有类型的复制
    return copyMessage({
      chat_id: guestChantId,
      from_chat_id:message.chat.id,
      message_id:message.message_id,
    })
  }

  // 6. 访客消息逻辑 (图片会在这里被转发)
  return handleGuestMessage(message)
}

async function handleGuestMessage(message){
  let chatId = message.chat.id;
  let isblocked = await nfd.get('isblocked-' + chatId, { type: "json" })

  if(isblocked){
    return sendMessage({
      chat_id: chatId,
      text:'Your are blocked'
    })
  }

  let forwardReq = await forwardMessage({
    chat_id:ADMIN_UID,
    from_chat_id:message.chat.id,
    message_id:message.message_id
  })
  if(!forwardReq || !forwardReq.ok){
    console.error('转发消息时出错:', forwardReq)
    return sendMessage({
      chat_id: chatId,
      text:'消息转发失败，请稍后再试。'
    })
  }
  await nfd.put('msg-map-' + forwardReq.result.message_id, chatId)
  return handleNotify(message)
}

async function handleNotify(message){
  // 先判断是否是诈骗人员，如果是，则直接提醒
  // 如果不是，则根据时间间隔提醒：用户id，交易注意点等
  let chatId = message.chat.id;
  if(await isFraud(chatId)){
    return sendMessage({
      chat_id: ADMIN_UID,
      text:`检测到骗子，UID${chatId}`
    })
  }
  if(enable_notification){
    let lastMsgTime = await nfd.get('lastmsg-' + chatId, { type: "json" })
    if(!lastMsgTime || Date.now() - lastMsgTime > NOTIFY_INTERVAL){
      await nfd.put('lastmsg-' + chatId, Date.now())
      const notificationText = await fetch(notificationUrl).then(r => r.text())
      if(!notificationText.trim()){
        return
      }
      return sendMessage({
        chat_id: ADMIN_UID,
        text:notificationText
      })
    }
  }
}

async function handleUserInfo(uid){
  const response = await getChat({ chat_id: uid })
  if(!response || !response.ok || !response.result){
    return sendMessage({
      chat_id: ADMIN_UID,
      text:`未查询到UID:${uid}的用户信息`
    })
  }

  const chat = response.result
  const isBotText = typeof chat.is_bot === 'boolean' ? (chat.is_bot ? '是' : '否') : '未知'
  const lines = [
    `UID: ${chat.id}`,
    `类型: ${chat.type || '未知'}`,
    `用户名: ${chat.username ? '@' + chat.username : '无'}`,
    `名字: ${[chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || '无'}`,
    `是否机器人: ${isBotText}`
  ]

  if(chat.bio){
    lines.push(`简介: ${chat.bio}`)
  }

  return sendMessage({
    chat_id: ADMIN_UID,
    text: lines.join('\n')
  })
}

async function handleBlock(message){
  let guestChantId = await nfd.get('msg-map-' + message.reply_to_message.message_id,
                                      { type: "json" })
  if(!guestChantId){
    return sendMessage({
      chat_id: ADMIN_UID,
      text:'未找到关联的用户消息ID'
    })
  }
  if(guestChantId === ADMIN_UID){
    return sendMessage({
      chat_id: ADMIN_UID,
      text:'不能屏蔽自己'
    })
  }
  await nfd.put('isblocked-' + guestChantId, true)

  return sendMessage({
    chat_id: ADMIN_UID,
    text: `UID:${guestChantId}屏蔽成功`,
  })
}

async function handleUnBlock(message){
  let guestChantId = await nfd.get('msg-map-' + message.reply_to_message.message_id,
  { type: "json" })
  if(!guestChantId){
    return sendMessage({
      chat_id: ADMIN_UID,
      text:'未找到关联的用户消息ID'
    })
  }

  await nfd.put('isblocked-' + guestChantId, false)

  return sendMessage({
    chat_id: ADMIN_UID,
    text:`UID:${guestChantId}解除屏蔽成功`,
  })
}

async function checkBlock(message){
  let guestChantId = await nfd.get('msg-map-' + message.reply_to_message.message_id,
  { type: "json" })
  if(!guestChantId){
    return sendMessage({
      chat_id: ADMIN_UID,
      text:'未找到关联的用户消息ID'
    })
  }
  let blocked = await nfd.get('isblocked-' + guestChantId, { type: "json" })

  return sendMessage({
    chat_id: ADMIN_UID,
    text: `UID:${guestChantId}` + (blocked ? '被屏蔽' : '没有被屏蔽')
  })
}

/**
 * Send plain text message
 * https://core.telegram.org/bots/api#sendmessage
 */
async function sendPlainText (chatId, text) {
  return sendMessage({
    chat_id: chatId,
    text
  })
}

/**
 * Set webhook to this worker's url
 * https://core.telegram.org/bots/api#setwebhook
 */
async function registerWebhook (event, requestUrl, suffix, secret) {
  // https://core.telegram.org/bots/api#setwebhook
  const webhookUrl = `${requestUrl.protocol}//${requestUrl.hostname}${suffix}`
  const r = await (await fetch(apiUrl('setWebhook', { url: webhookUrl, secret_token: secret }))).json()
  return new Response('ok' in r && r.ok ? 'Ok' : JSON.stringify(r, null, 2))
}

/**
 * Remove webhook
 * https://core.telegram.org/bots/api#setwebhook
 */
async function unRegisterWebhook (event) {
  const r = await (await fetch(apiUrl('setWebhook', { url: '' }))).json()
  return new Response('ok' in r && r.ok ? 'Ok' : JSON.stringify(r, null, 2))
}

/**
 * 检查用户是否为欺诈者
 */
async function isFraud(uid) {
  try {
    const response = await fetch(FRAUD_DB_URL);
    if (!response.ok) {
      throw new Error(`获取欺诈数据库失败: ${response.statusText}`);
    }

    let fraudDb;
    try {
      fraudDb = await response.json();
    } catch (e) {
      throw new Error(`解析欺诈数据库JSON时出错: ${e.message}`);
    }

    return fraudDb.includes(uid);
  } catch (error) {
    console.error('检查用户是否为欺诈者时出错:', error);
    return false;
  }
}
