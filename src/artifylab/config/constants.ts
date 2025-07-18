export const CONFIG = {
  // 服务器配置
  PORT: process.env.APP_PORT || 3008,
  PORT_RANGE: parseInt(process.env.PORT_RANGE || "10"), // 端口自动选择范围
  
  // OpenAI 配置
  MODEL_ID: process.env.OPENAI_MODEL || "gpt-4o",
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  DEFAULT_MAX_TOKENS: parseInt(process.env.DEFAULT_MAX_TOKENS || "64000"),
  DEFAULT_TEMPERATURE: parseFloat(process.env.DEFAULT_TEMPERATURE || "0"),
  
  // CORS 配置
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS 
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : ['*'],
  CORS_ALLOW_CREDENTIALS: process.env.CORS_ALLOW_CREDENTIALS === 'true',
  
  // 缓存配置
  CACHE_MAX_SIZE: 2 * 1024 * 1024 * 1024, // 2GB
  CACHE_MAX_AGE: 60 * 60 * 1000, // 60分钟
  
  // 限流配置
  IP_RATE_LIMIT: parseInt(process.env.IP_RATE_LIMIT || "0"),
  RATE_LIMIT_WINDOW: 60 * 60 * 1000, // 1小时
  
  // 请求配置
  FETCH_TIMEOUT: 30000, // 30秒
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  
  // 请求体大小限制
  BODY_LIMIT: '100mb',
  
  // 静态文件配置
  STATIC_CACHE_CONTROL: 'no-cache', // 不设置缓存

  // 应用市场地址
  APP_MARKET_URL: 'https://artify-lab.s3.ap-southeast-2.amazonaws.com/app-market/apps.json',
  // 应用风格地址
  APP_STYLES_URL: 'https://artify-lab.s3.ap-southeast-2.amazonaws.com/build/styles.json',
} as const;

export const ERROR_MESSAGES = {
  API_KEY_REQUIRED: "API key is required for testing",
  API_KEY_NOT_CONFIGURED: "OpenAI API key is not configured.",
  MISSING_PROMPT: "Missing prompt field",
  MISSING_REQUIRED_FIELDS: "Missing required fields",
  CONNECTION_TIMEOUT: "UND_ERR_CONNECT_TIMEOUT",
  RATE_LIMIT_EXCEEDED: {
    zh: "请求频率超过限制，请在 {minutes} 分钟后再试",
    en: "Too many requests. Please try again in {minutes} minutes."
  }
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  GATEWAY_TIMEOUT: 504
} as const; 