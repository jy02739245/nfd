const TOKEN = ENV_BOT_TOKEN // Get it from @BotFather
const WEBHOOK = '/endpoint'
const SECRET = ENV_BOT_SECRET // A-Z, a-z, 0-9, _ and -
const ADMIN_UID = ENV_ADMIN_UID // your user id, get it from https://t.me/username_to_id_bot

const NOTIFY_INTERVAL = 3600 * 1000;
const FRAUD_DB_URL = ENV_FRAUD_DB_URL;
const notificationUrl = typeof ENV_NOTIFICATION_URL === 'undefined'
  ? 'https://raw.githubusercontent.com/jy02739245/nfd/main/data/notification.txt'
  : ENV_NOTIFICATION_URL || 'https://raw.githubusercontent.com/jy02739245/nfd/main/data/notification.txt'
const startMsgUrl = typeof ENV_START_MSG_URL === 'undefined'
  ? 'https://raw.githubusercontent.com/jy02739245/nfd/main/data/startMessage.md'
  : ENV_START_MSG_URL || 'https://raw.githubusercontent.com/jy02739245/nfd/main/data/startMessage.md';



const BAD_WORDS_URL = ENV_BAD_WORDS_URL; // 脏话关键词URL
const AD_WORDS_URL = ENV_AD_WORDS_URL; // 广告关键词URL
const AI_ENABLED = parseBoolean(typeof ENV_AI_ENABLED === 'undefined' ? undefined : ENV_AI_ENABLED, false);
const AI_CONCURRENT = parseBoolean(typeof ENV_AI_CONCURRENT === 'undefined' ? undefined : ENV_AI_CONCURRENT, false);
const AI_TIMEOUT_MS = parsePositiveInt(typeof ENV_AI_TIMEOUT_MS === 'undefined' ? undefined : ENV_AI_TIMEOUT_MS, 8000);
const DEBUG_LOG_FULL_TEXT = parseBoolean(typeof ENV_DEBUG_LOG_FULL_TEXT === 'undefined' ? undefined : ENV_DEBUG_LOG_FULL_TEXT, false);
const AI_SYSTEM_PROMPT = (typeof ENV_AI_SYSTEM_PROMPT === 'undefined' ? '' : ENV_AI_SYSTEM_PROMPT) || [
  '你是 Telegram 私聊机器人消息审核助手。',
  '你需要判断一条消息是否应该被拦截。',
  '分类标准：',
  '1. allow：普通聊天、正常咨询、无害内容。',
  '2. ad：广告、引流、推广、售卖、联系方式导流、频道群组推广、账号交易、能量/TRX/充值/拉群/监听/获客等营销内容。',
  '3. violation：色情招嫖、赌博博彩、诈骗诱导、违法交易、辱骂骚扰或其他明显违规/高风险内容。',
  '只有在内容较明确时才拦截；拿不准时返回 allow。',
  '你必须只返回 JSON，格式为：{"decision":"allow|ad|violation","reason":"简短中文原因"}。'
].join('\n');

const AI_PRIMARY_CONFIG = createAiProviderConfig({
  name: 'primary',
  baseUrl: typeof ENV_AI_MODEL1_BASE_URL === 'undefined' ? '' : ENV_AI_MODEL1_BASE_URL || '',
  apiKey: typeof ENV_AI_MODEL1_API_KEY === 'undefined' ? '' : ENV_AI_MODEL1_API_KEY || '',
  model: typeof ENV_AI_MODEL1_MODEL === 'undefined' ? '' : ENV_AI_MODEL1_MODEL || '',
  endpointPath: typeof ENV_AI_MODEL1_PATH === 'undefined' ? '/chat/completions' : ENV_AI_MODEL1_PATH || '/chat/completions'
});

const AI_BACKUP_CONFIG = createAiProviderConfig({
  name: 'backup',
  baseUrl: typeof ENV_AI_MODEL2_BASE_URL === 'undefined' ? '' : ENV_AI_MODEL2_BASE_URL || '',
  apiKey: typeof ENV_AI_MODEL2_API_KEY === 'undefined' ? '' : ENV_AI_MODEL2_API_KEY || '',
  model: typeof ENV_AI_MODEL2_MODEL === 'undefined' ? '' : ENV_AI_MODEL2_MODEL || '',
  endpointPath: typeof ENV_AI_MODEL2_PATH === 'undefined' ? '/chat/completions' : ENV_AI_MODEL2_PATH || '/chat/completions'
});

const AI_PROVIDERS = [AI_PRIMARY_CONFIG, AI_BACKUP_CONFIG].filter(Boolean);

const enable_notification = true

let BAD_WORDS = []; // 脏话关键词列表
let AD_WORDS = []; // 广告关键词列表

function truncateForLog(value, maxLength = 80) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function detectMessageKind(message) {
  if (message.text) return 'text';
  if (message.caption) return 'caption';
  if (message.photo) return 'photo';
  if (message.video) return 'video';
  if (message.document) return 'document';
  if (message.sticker) return 'sticker';
  if (message.voice) return 'voice';
  if (message.audio) return 'audio';
  return 'other';
}

function summarizeMessageForLog(message) {
  const rawText = (message.text || message.caption || '').trim();

  return {
    chatId: message.chat?.id,
    userId: message.from?.id || null,
    messageId: message.message_id,
    chatType: message.chat?.type || 'unknown',
    kind: detectMessageKind(message),
    textLength: rawText.length,
    preview: DEBUG_LOG_FULL_TEXT ? rawText : truncateForLog(rawText)
  };
}

function logEvent(title, payload = null) {
  if (payload === null || payload === undefined) {
    console.log(title);
    return;
  }

  console.log(`${title} ${JSON.stringify(payload)}`);
}

function getTextPreviewForLog(text, maxLength = 80) {
  return DEBUG_LOG_FULL_TEXT ? String(text || '').trim() : truncateForLog(text, maxLength);
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function parsePositiveInt(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function createAiProviderConfig({ name, baseUrl, apiKey, model, endpointPath }) {
  if (!baseUrl || !model) {
    return null;
  }

  return {
    name,
    apiKey,
    model,
    endpoint: buildAiEndpoint(baseUrl, endpointPath)
  };
}

function buildAiEndpoint(baseUrl, endpointPath = '/chat/completions') {
  const trimmedBaseUrl = String(baseUrl).trim().replace(/\/+$/, '');
  if (!trimmedBaseUrl) {
    return '';
  }

  if (/\/(chat\/completions|completions)$/.test(trimmedBaseUrl)) {
    return trimmedBaseUrl;
  }

  const normalizedPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  return `${trimmedBaseUrl}${normalizedPath}`;
}

/**
 * 初始化加载脏话和广告关键词
 */
async function loadKeywords() {
  try {
    logEvent('📚 [关键词加载] 开始', {
      badWordsUrl: BAD_WORDS_URL,
      adWordsUrl: AD_WORDS_URL
    });

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

    logEvent('✅ [关键词加载] 成功', {
      badPlainCount: BAD_WORDS.plain.length,
      badRegexCount: BAD_WORDS.regex.length,
      adPlainCount: AD_WORDS.plain.length,
      adRegexCount: AD_WORDS.regex.length
    });
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
      logEvent('🚫 [本地规则命中] badWord/plain', {
        keyword: truncateForLog(word, 30),
        textLength: text.length,
        preview: getTextPreviewForLog(text)
      });
      return 'badWord';
    }
  }
  for (const word of AD_WORDS.plain) {
    if (text.includes(word)) {
      logEvent('🚫 [本地规则命中] adWord/plain', {
        keyword: truncateForLog(word, 30),
        textLength: text.length,
        preview: getTextPreviewForLog(text)
      });
      return 'adWord';
    }
  }

  // 检查正则表达式
  for (const regex of BAD_WORDS.regex) {
    if (regex.test(text)) {
      logEvent('🚫 [本地规则命中] badWord/regex', {
        pattern: truncateForLog(regex.source, 60),
        textLength: text.length,
        preview: getTextPreviewForLog(text)
      });
      return 'badWord';
    }
  }
  for (const regex of AD_WORDS.regex) {
    if (regex.test(text)) {
      logEvent('🚫 [本地规则命中] adWord/regex', {
        pattern: truncateForLog(regex.source, 60),
        textLength: text.length,
        preview: getTextPreviewForLog(text)
      });
      return 'adWord';
    }
  }

  return null;
}

function getBlockReplyText(type) {
  if (type === 'adWord') {
    return '消息包含不允许的广告内容，请勿发送广告。';
  }

  if (type === 'badWord') {
    return '消息包含不允许的违规内容，请注意言辞或内容合规。';
  }

  return '消息内容不符合发送要求。';
}

async function moderateMessageContent(text) {
  if (!text) {
    return null;
  }

  const keywordResult = containsBadWordsOrAds(text);
  if (keywordResult) {
    return {
      source: 'keyword',
      type: keywordResult
    };
  }

  logEvent('🧠 [AI审核] 本地规则未命中，转AI复审', {
    textLength: text.length,
    preview: getTextPreviewForLog(text),
    mode: AI_CONCURRENT ? 'concurrent' : 'sequential',
    providers: AI_PROVIDERS.map(provider => provider.name)
  });

  return classifyMessageWithAI(text);
}

async function classifyMessageWithAI(text) {
  if (!AI_ENABLED || !text.trim() || AI_PROVIDERS.length === 0) {
    logEvent('ℹ️ [AI审核] 跳过', {
      enabled: AI_ENABLED,
      hasText: Boolean(text.trim()),
      providerCount: AI_PROVIDERS.length
    });
    return null;
  }

  try {
    if (AI_CONCURRENT && AI_PROVIDERS.length > 1) {
      logEvent('⚡ [AI审核] 并发抢答启动', {
        providers: AI_PROVIDERS.map(provider => provider.name)
      });
      return await classifyMessageWithAIConcurrent(text);
    }

    logEvent('🔁 [AI审核] 主备轮询启动', {
      providers: AI_PROVIDERS.map(provider => provider.name)
    });
    return await classifyMessageWithAISequential(text);
  } catch (error) {
    console.error('AI审核失败:', error);
    return {
      source: 'ai:error',
      type: 'badWord',
      reason: error.message || 'AI审核异常'
    };
  }
}

async function classifyMessageWithAISequential(text) {
  for (const provider of AI_PROVIDERS) {
    try {
      logEvent('🤖 [AI节点] 开始请求', {
        provider: provider.name,
        model: provider.model,
        endpoint: provider.endpoint
      });
      const result = await requestAiModeration(provider, text);
      logEvent('✅ [AI节点] 请求完成', {
        provider: provider.name,
        result: result?.type || 'allow'
      });
      return result;
    } catch (error) {
      console.error(`AI节点 ${provider.name} 审核失败:`, error);
      logEvent('↪️ [AI审核] 切换下一个节点', {
        failedProvider: provider.name
      });
    }
  }

  logEvent('⚪ [AI审核] 所有节点均未给出拦截结果');
  return null;
}

async function classifyMessageWithAIConcurrent(text) {
  return new Promise((resolve, reject) => {
    let remaining = AI_PROVIDERS.length;
    let allowCount = 0;
    const errors = [];
    let settled = false;

    for (const provider of AI_PROVIDERS) {
      requestAiModeration(provider, text).then(result => {
        if (settled) {
          return;
        }

        logEvent('🏁 [AI抢答] 节点返回', {
          provider: provider.name,
          result: result?.type || 'allow'
        });

        remaining -= 1;

        if (result?.type) {
          settled = true;
          logEvent('🏆 [AI抢答] 节点率先命中违规', {
            provider: provider.name,
            result: result.type
          });
          resolve(result);
          return;
        }

        allowCount += 1;
        if (allowCount === AI_PROVIDERS.length) {
          settled = true;
          logEvent('✅ [AI抢答] 全部节点均判定正常，放行', {
            allowCount
          });
          resolve(null);
          return;
        }

        if (remaining === 0) {
          settled = true;
          const errorMessage = errors.map(item => item.message).join(' | ') || '存在未成功完成的AI节点';
          resolve({
            source: 'ai:concurrent_inconclusive',
            type: 'badWord',
            reason: `并发审核未形成双正常结论: ${errorMessage}`
          });
        }
      }).catch(error => {
        console.error(`AI节点 ${provider.name} 审核失败:`, error);
        if (settled) {
          return;
        }

        logEvent('❌ [AI抢答] 节点失败', {
          provider: provider.name,
          error: error.message
        });

        errors.push(error);
        remaining -= 1;

        if (remaining === 0) {
          settled = true;
          resolve({
            source: 'ai:concurrent_failed',
            type: 'badWord',
            reason: errors.map(item => item.message).join(' | ') || '所有AI节点均失败'
          });
        }
      });
    }
  });
}

async function requestAiModeration(provider, text) {
  const startedAt = Date.now();
  const response = await fetchWithTimeout(provider.endpoint, {
    method: 'POST',
    headers: buildAiHeaders(provider.apiKey),
    body: JSON.stringify({
      model: provider.model,
      temperature: 0,
      max_tokens: 200,
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            '请审核下面这条 Telegram 私聊消息。',
            '只返回 JSON，不要返回代码块。',
            `消息内容：${text}`
          ].join('\n')
        }
      ]
    })
  }, AI_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI响应中缺少choices[0].message.content');
  }

  const parsed = parseAiJson(content);
  const decision = normalizeAiDecision(parsed);
  if (!decision) {
    throw new Error(`无法识别的AI审核结果: ${content}`);
  }

  logEvent('📝 [AI节点返回]', {
    provider: provider.name,
    model: provider.model,
    elapsedMs: Date.now() - startedAt,
    rawDecision: String(parsed.decision || ''),
    normalizedResult: decision.type || 'allow',
    reason: truncateForLog(decision.reason || '', 60)
  });

  if (decision.type) {
    return {
      source: `ai:${provider.name}`,
      type: decision.type,
      reason: decision.reason
    };
  }

  return null;
}

function buildAiHeaders(apiKey) {
  const headers = {
    'content-type': 'application/json'
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseAiJson(content) {
  const trimmed = String(content).trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const rawJson = fencedMatch ? fencedMatch[1] : trimmed;

  try {
    return JSON.parse(rawJson);
  } catch (error) {
    throw new Error(`AI返回内容不是合法JSON: ${error.message}`);
  }
}

function normalizeAiDecision(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const rawDecision = String(parsed.decision || '').trim().toLowerCase();
  const reason = parsed.reason ? String(parsed.reason).trim() : '';

  if (['allow', 'safe', 'normal', 'pass'].includes(rawDecision)) {
    return { type: null, reason };
  }

  if (['ad', 'advertisement', 'adword'].includes(rawDecision)) {
    return { type: 'adWord', reason };
  }

  if (['violation', 'badword', 'illegal', 'unsafe'].includes(rawDecision)) {
    return { type: 'badWord', reason };
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
    logEvent('⛔ [Webhook] Secret校验失败');
    return new Response('Unauthorized', { status: 403 })
  }

  // Read request body synchronously
  const update = await event.request.json()
  logEvent('📩 [Webhook] 收到更新', {
    updateKeys: Object.keys(update)
  });
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
  if (!BAD_WORDS.plain || !AD_WORDS.plain) {
    await loadKeywords();
  }

  if ('message' in update) {
    logEvent('➡️ [消息路由] 进入 message 分支', {
      messageId: update.message?.message_id,
      chatId: update.message?.chat?.id
    });
    await onMessage(update.message)
  } else {
    logEvent('ℹ️ [消息路由] 当前更新未处理', {
      updateKeys: Object.keys(update)
    });
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
  logEvent('📨 [消息接收]', {
    ...summarizeMessageForLog(message),
    isAdmin
  });

  // 1. 处理 /start 命令 (仅针对纯文本)
  if(message.text === '/start'){
    logEvent('👋 [命令] /start', {
      chatId: message.chat.id,
      isAdmin
    });
    let startMsg = await fetch(startMsgUrl).then(r => r.text())
    return sendMessage({
      chat_id:message.chat.id,
      text:startMsg,
    })
  }

  // 2. 过滤通过内联机器人发送的访客消息，例如 Telegram 客户端显示的 via @PostBot
  if(!isAdmin && isViaBotMessage(message)){
    logEvent('🚫 [拦截] via_bot 消息', summarizeMessageForLog(message));
    return sendMessage({
      chat_id: message.chat.id,
      text: getBlockReplyText('adWord'),
    })
  }

  // 3. 安全获取消息内容
  // 图片/视频的文字在 caption 中，纯文本在 text 中，贴纸/无标题图片则为空字符串
  const contentToCheck = message.text || message.caption || '';

  // 4. 管理员逻辑
  if(isAdmin){
    if(message.text && /^\/user\s+(-?\d+)$/.exec(message.text)){
      const uid = message.text.match(/^\/user\s+(-?\d+)$/)[1]
      logEvent('🔎 [管理员命令] /user', {
        adminChatId: message.chat.id,
        targetUid: uid
      });
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
      logEvent('🔒 [管理员命令] /block', {
        adminChatId: message.chat.id,
        replyToMessageId: message.reply_to_message?.message_id
      });
      return handleBlock(message)
    }
    if(message.text && /^\/unblock$/.exec(message.text)){
      logEvent('🔓 [管理员命令] /unblock', {
        adminChatId: message.chat.id,
        replyToMessageId: message.reply_to_message?.message_id
      });
      return handleUnBlock(message)
    }
    if(message.text && /^\/checkblock$/.exec(message.text)){
      logEvent('🧾 [管理员命令] /checkblock', {
        adminChatId: message.chat.id,
        replyToMessageId: message.reply_to_message?.message_id
      });
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
    logEvent('↩️ [管理员回复转发] 回传访客消息', {
      adminChatId: message.chat.id,
      guestChatId: guestChantId,
      sourceMessageId: message.message_id
    });
    return copyMessage({
      chat_id: guestChantId,
      from_chat_id:message.chat.id,
      message_id:message.message_id,
    })
  }

  // 5. 访客消息先走本地规则，再走AI兜底审核
  if (contentToCheck) {
    const moderationResult = await moderateMessageContent(contentToCheck);
    if (moderationResult?.type) {
      logEvent('🚨 [消息拦截] 审核命中', {
        chatId: message.chat.id,
        userId: message.from?.id || null,
        source: moderationResult.source,
        type: moderationResult.type,
        reason: moderationResult.reason || '',
        preview: getTextPreviewForLog(contentToCheck)
      });

      return sendMessage({
        chat_id: message.chat.id,
        text: getBlockReplyText(moderationResult.type),
      });
    }
  }

  // 6. 访客消息逻辑 (图片会在这里被转发)
  return handleGuestMessage(message)
}

async function handleGuestMessage(message){
  let chatId = message.chat.id;
  let isblocked = await nfd.get('isblocked-' + chatId, { type: "json" })

  if(isblocked){
    logEvent('⛔ [访客消息] 用户已被屏蔽', {
      chatId
    });
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
  logEvent('✅ [访客消息] 转发成功', {
    guestChatId: chatId,
    guestMessageId: message.message_id,
    adminMessageId: forwardReq.result.message_id
  });
  await nfd.put('msg-map-' + forwardReq.result.message_id, chatId)
  return handleNotify(message)
}

async function handleNotify(message){
  // 先判断是否是诈骗人员，如果是，则直接提醒
  // 如果不是，则根据时间间隔提醒：用户id，交易注意点等
  let chatId = message.chat.id;
  if(await isFraud(chatId)){
    logEvent('⚠️ [风险提醒] 命中诈骗库', {
      chatId
    });
    return sendMessage({
      chat_id: ADMIN_UID,
      text:`检测到骗子，UID${chatId}`
    })
  }
  if(enable_notification){
    let lastMsgTime = await nfd.get('lastmsg-' + chatId, { type: "json" })
    if(!lastMsgTime || Date.now() - lastMsgTime > NOTIFY_INTERVAL){
      logEvent('🔔 [通知] 发送管理员提醒', {
        chatId,
        reason: lastMsgTime ? 'interval_elapsed' : 'first_message'
      });
      await nfd.put('lastmsg-' + chatId, Date.now())
      const notificationText = await fetch(notificationUrl).then(r => r.text())
      if(!notificationText.trim()){
        logEvent('ℹ️ [通知] 提醒文本为空，跳过发送', {
          chatId
        });
        return
      }
      return sendMessage({
        chat_id: ADMIN_UID,
        text:notificationText
      })
    }

    logEvent('⏱️ [通知] 仍在冷却时间内，跳过提醒', {
      chatId
    });
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
  logEvent('🔒 [屏蔽] 设置成功', {
    guestChatId: guestChantId,
    adminChatId: message.chat.id
  });

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
  logEvent('🔓 [屏蔽] 解除成功', {
    guestChatId: guestChantId,
    adminChatId: message.chat.id
  });

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
  logEvent('🧾 [屏蔽] 状态查询', {
    guestChatId: guestChantId,
    blocked: Boolean(blocked),
    adminChatId: message.chat.id
  });

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
