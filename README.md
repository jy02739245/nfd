# NFD修改版
No Fraud / Node Forward Bot

一个基于cloudflare worker的telegram 消息转发bot，集成了反欺诈功能，增加了脏话与广告关键词过滤功能。

现在支持接入自定义 AI 大模型作为二级审核：先使用本地 `json` 关键词与正则拦截，只有在本地规则未命中时，才调用 AI 判断广告或违规内容。

## 特点
- 基于cloudflare worker搭建，能够实现以下效果
    - 搭建成本低，一个js文件即可完成搭建
    - 不需要额外的域名，利用worker自带域名即可
    - 基于worker kv实现永久数据储存
    - 稳定，全球cdn转发
- 接入反欺诈系统，当聊天对象有诈骗历史时，自动发出提醒
- 支持屏蔽用户，避免被骚扰
- 支持 AI 二级审核，兼容自定义 `base_url`
- 支持主备模型节点
- 支持两种 AI 调用模式：
    - 默认轮询：先调用模型1，失败或超时后再调用模型2
    - 并发抢答：同时调用模型1和模型2，任一节点先命中违规就拦截，只有全部节点都返回正常才放行

### 修改内容
- 支持过滤广告和脏话，触发规则的用户消息不会被转发，且会受到机器人的提示
- 提高自定义便捷度
- 待添加：管理员通过直接向机器人发送特定指令和指定脏话/广告关键词或直接用特定指令回复指定关键词，达成机器人自动添加指定关键词进脏话/广告关键词数据库的功能。（本人能力有限，大概是无望了）

## 搭建方法
1. ***Fork***本仓库
2. 从[@BotFather](https://t.me/BotFather)获取token，并且可以发送`/setjoingroups`来禁止此Bot被添加到群组
3. 从[uuidgenerator](https://www.uuidgenerator.net/)获取一个随机uuid作为secret
4. 从[@username_to_id_bot](https://t.me/username_to_id_bot)获取你的用户id
5. 登录[cloudflare](https://workers.cloudflare.com/)，创建一个worker
6. 配置worker的变量
    - 增加一个`ENV_BOT_TOKEN`变量，数值为
        - 从步骤1中获得的token
    - 增加一个`ENV_BOT_SECRET`变量，数值为
        - 从步骤2中获得的secret
    - 增加一个`ENV_ADMIN_UID`变量，数值为
        - 从步骤3中获得的用户id
    - 增加一个`ENV_AD_WORDS_URL`变量，值为
        - https://raw.githubusercontent.com/你的github用户名/nfd/main/data/adwords.json
    - 增加一个`ENV_BAD_WORDS_URL`变量，值为
        - https://raw.githubusercontent.com/你的github用户名/nfd/main/data/badwords.json
    - 增加一个`ENV_FRAUD_DB_URL`变量，值为
        - https://raw.githubusercontent.com/你的github用户名/nfd/main/data/fraud.json
    - 增加一个`ENV_START_MSG_URL`变量，值为
        - https://raw.githubusercontent.com/你的github用户名/nfd/main/data/startMessage.md
7. 绑定kv数据库，创建一个Namespace Name为`nfd`的kv数据库，在setting -> variable中设置`KV Namespace Bindings`：nfd -> nfd
8. 点击`Quick Edit`，复制[这个文件](./worker.js)到编辑器中
9. 通过打开`https://xxx.workers.dev/registerWebhook`来注册websoket

### 可选：启用 AI 审核

如果你希望在关键词/正则未命中时再交给 AI 判断，请额外配置以下变量：

- `ENV_AI_ENABLED`
  - 是否启用 AI 审核，`true` / `false`
- `ENV_AI_CONCURRENT`
  - 是否启用并发抢答模式，默认 `false`
  - `false` 时为轮询模式：先模型1，失败/超时再模型2
  - `true` 时为并发模式：模型1和模型2同时启动，任一节点命中违规即拦截，只有全部节点都返回正常才放行
- `ENV_AI_TIMEOUT_MS`
  - 单个模型请求超时时间，默认 `8000`
- `ENV_AI_SYSTEM_PROMPT`
  - 自定义 AI 审核提示词，不填则使用内置中文审核提示词
- `ENV_DEBUG_LOG_FULL_TEXT`
  - 是否在 Workers 日志中打印完整消息正文，默认 `false`
  - 关闭时仅记录截断摘要，开启时会记录完整 `text/caption`

模型1配置：

- `ENV_AI_MODEL1_BASE_URL`
  - 例如 `https://openrouter.ai/api/v1`
  - 也可以直接写到完整接口，如 `https://openrouter.ai/api/v1/chat/completions`
- `ENV_AI_MODEL1_API_KEY`
  - 模型1 API Key
- `ENV_AI_MODEL1_MODEL`
  - 模型1名称，例如 `openai/gpt-4o-mini`
- `ENV_AI_MODEL1_PATH`
  - 可选，默认 `/chat/completions`
- `ENV_AI_MODEL1_TYPES`
  - 可选，默认 `["text"]`
  - 用于声明模型支持的输入类型，可设置为 `["text"]` 或 `["text","image"]`

模型2配置：

- `ENV_AI_MODEL2_BASE_URL`
- `ENV_AI_MODEL2_API_KEY`
- `ENV_AI_MODEL2_MODEL`
- `ENV_AI_MODEL2_PATH`
- `ENV_AI_MODEL2_TYPES`
  - 可选，默认 `["text"]`

图片消息调度规则：

- 如果消息包含图片，优先使用支持 `image` 的模型
- 如果某个模型不支持图片，但支持 `text`，会自动去掉图片，仅发送文字/caption，避免模型报错
- 如果消息是纯图片，而某个模型只支持 `text`，则该模型会被跳过
- 轮询模式下：
  - 先尝试支持图片的模型
  - 图片模型失败或超时后，再回退到文本模型（如果消息里有 caption/文字）
- 并发模式下：
  - 支持图片的模型会收到图文输入
  - 不支持图片的模型会收到过滤后的纯文字输入

示例：

```text
ENV_AI_ENABLED=true
ENV_AI_CONCURRENT=false
ENV_AI_TIMEOUT_MS=8000
ENV_DEBUG_LOG_FULL_TEXT=false

ENV_AI_MODEL1_BASE_URL=https://openrouter.ai/api/v1
ENV_AI_MODEL1_API_KEY=sk-xxxx
ENV_AI_MODEL1_MODEL=openai/gpt-4o-mini
ENV_AI_MODEL1_TYPES=["text"]

ENV_AI_MODEL2_BASE_URL=https://openrouter.ai/api/v1
ENV_AI_MODEL2_API_KEY=sk-xxxx
ENV_AI_MODEL2_MODEL=anthropic/claude-3.5-haiku
ENV_AI_MODEL2_TYPES=["text","image"]
```

## 使用方法
- 当其他用户给bot发消息，会被转发到bot创建者
- 当用户消息命中本地关键词/正则时，会直接被拦截，不再调用 AI
- 当本地规则未命中且启用了 AI 审核时，机器人会继续调用 AI 判断是否为广告或违规消息
- 用户回复普通文字给转发的消息时，会回复到原消息发送者
- 用户回复`/block`, `/unblock`, `/checkblock`等命令会执行相关指令，**不会**回复到原消息发送者

## 欺诈数据源
- 文件[fraud.db](./fraud.db)为欺诈数据，格式为每行一个uid
- 可以通过pr扩展本数据，也可以通过提issue方式补充
- 提供额外欺诈信息时，需要提供一定的消息出处

# 以上内容绝大部分搬运自[原项目：nfd](https://github.com/LloydAsp/nfd "本项目基于此源码利用GPT-4o修改")

---

# 此版本为GPT-4o修改版 增加了过滤广告和脏话关键词的功能（支持正则表达式）

## 自定义教程
1. ***Fork***本仓库
2. 将***URL***替换为Fork后仓库的URL
3. 在Fork后的仓库中修改数据库中的内容

## 自定义环境变量
- ENV_BOT_TOKEN（机器人token **必填**） ：
    - 你的机器人token
- ENV_BOT_SECRET（机器人secret **必填**） ：
    - 你的机器人secret
- ENV_ADMIN_UID（TG管理员ID **必填**） ：
    - 你的TG ID
- ENV_AD_WORDS_URL（广告关键词数据库URL **必填**） ：
    - https://raw.githubusercontent.com/你的github用户名/nfd/main/data/adwords.json
- ENV_BAD_WORDS_URL（脏话关键词数据库URL **必填**） ：
    - https://raw.githubusercontent.com/你的github用户名/nfd/main/data/badwords.json
- ENV_FRAUD_DB_URL（欺诈者ID数据库URL **必填**） ：
    - https://raw.githubusercontent.com/你的github用户名/nfd/main/data/fraud.json
- ENV_NOTIFICATION_URL（通知消息URL） ：
    - https://raw.githubusercontent.com/你的github用户名/nfd/blob/main/data/notification.txt
- ENV_START_MSG_URL（启动消息URL） ：
    - https://raw.githubusercontent.com/你的github用户名/nfd/main/data/startMessage.md
- ENV_AI_ENABLED（是否启用AI审核）：
    - `true` 或 `false`
- ENV_AI_CONCURRENT（是否并发抢答）：
    - `true` 时模型并发，`false` 时主备轮询
- ENV_AI_TIMEOUT_MS（AI请求超时毫秒数）：
    - 默认 `8000`
- ENV_AI_SYSTEM_PROMPT（自定义AI审核提示词）：
    - 可选
- ENV_DEBUG_LOG_FULL_TEXT（是否打印完整消息日志）：
    - `true` 时打印完整正文，默认 `false`
- ENV_AI_MODEL1_BASE_URL / ENV_AI_MODEL2_BASE_URL：
    - 自定义大模型服务的 `base_url`
- ENV_AI_MODEL1_API_KEY / ENV_AI_MODEL2_API_KEY：
    - 对应节点的 API Key
- ENV_AI_MODEL1_MODEL / ENV_AI_MODEL2_MODEL：
    - 对应节点的模型名
- ENV_AI_MODEL1_PATH / ENV_AI_MODEL2_PATH：
    - 可选，默认 `/chat/completions`
- ENV_AI_MODEL1_TYPES / ENV_AI_MODEL2_TYPES：
    - 可选，默认 `["text"]`
    - 可设置为 `["text"]` 或 `["text","image"]`
- ENV_GITHUB_API_URL（github仓库API 暂无功能 可以不用添加）	
- ENV_GITHUB_TOKEN（github仓库token 暂无功能 可以不用添加）	

## 鸣谢
- [telegram-bot-cloudflare](https://github.com/cvzi/telegram-bot-cloudflare "疑似一代源码")
- [原nfd](https://github.com/LloydAsp/nfd "本项目基于此源码利用GPT-4o修改")
- [ChatGPT-4o](https://chatgpt.com/ "修改源码主力")
- [Kimi](https://kimi.moonshot.cn/ "检索资料助手")
- [视频教程：用Cloud flare 搭建一个TG私信机器人 telegram TG双向限制](https://www.youtube.com/watch?v=DBQqj9UwS1M&t=61s "基于原项目nfd的搭建视频教程")
