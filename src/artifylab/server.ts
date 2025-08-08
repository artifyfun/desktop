import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import ngrok from '@ngrok/ngrok';
import { createServer } from 'node:net';
import type { Server as HttpServer } from 'node:http';
import history from 'connect-history-api-fallback';
import { exec } from 'node:child_process';
import { platform } from 'node:os';


// 导入优化后的模块
import { CONFIG, HTTP_STATUS } from './config/constants';
import { logger } from './utils/logger';
import { handleApiError, createErrorResponse, createSuccessResponse } from './utils/errorHandler';
// import { rateLimitMiddleware } from './middleware/rateLimit';
import { memoryCache, cachedFetchGet } from './services/cache';
import { fetchWithRetry, createOpenAIRequestOptions, handleStreamResponse } from './utils/fetch';
import appStoreManager from "./appStore";
import type { App } from "./appStore";
import artifyUtils from '.';

// Load environment variables from .env file
dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server: HttpServer | null = null;

// 定义请求体类型
interface TestConnectionRequest {
  api_key?: string;
  base_url?: string;
  model?: string;
}

interface OptimizePromptRequest {
  prompt: string;
  language?: string;
  api_key?: string;
  base_url?: string;
  model?: string;
}

interface GenerateAppRequest {
  max_tokens?: number;
  temperature?: number;
  api_key?: string;
  base_url?: string;
  model?: string;
  prompt?: {
    systemPrompt: string;
    assistantPrompt: string;
    userPrompt: string;
  };
}

interface ModifyCodeRequest {
  prompt: string;
  language?: string;
  api_key?: string;
  base_url?: string;
  model?: string;
}

interface AppDetailRequest {
  id: string;
}

interface CreateAppRequest {
  name: string;
  [key: string]: unknown;
}

interface UpdateAppRequest {
  id: string;
  [key: string]: unknown;
}

interface RemoveAppRequest {
  id: string;
}

interface ImportAppsRequest {
  apps: App[];
}

interface NgrokRequest {
  ngrokAuthtoken: string;
}

interface NgrokConfig {
  comfy_origin: string;
  server_origin: string;
}

interface ShutdownRequest {
  delay?: number; // 延迟关机时间（秒），默认为0
  force?: boolean; // 是否强制关机，默认为false
}

// 中间件配置
app.use(history());
app.use(bodyParser.json({ limit: CONFIG.BODY_LIMIT }));
app.use(bodyParser.urlencoded({ limit: CONFIG.BODY_LIMIT, extended: true }));
app.use(bodyParser.raw({ limit: CONFIG.BODY_LIMIT }));
app.use(bodyParser.text({ limit: CONFIG.BODY_LIMIT }));
app.use(cookieParser());

// CORS 中间件 - 使用配置的域名
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // 检查是否允许该域名
  if (CONFIG.CORS_ALLOWED_ORIGINS.includes('*') || (origin && CONFIG.CORS_ALLOWED_ORIGINS.includes(origin))) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  
  // 如果允许携带凭证，设置相应的头部
  if (CONFIG.CORS_ALLOW_CREDENTIALS) {
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  
  res.header('Access-Control-Allow-Headers', 'Authorization,X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Request-Method');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PATCH, PUT, DELETE');
  res.header('Allow', 'GET, POST, PATCH, OPTIONS, PUT, DELETE');
  next();
});

// 静态文件中间件
const setupStaticFiles = () => {
  const staticPath = path.join(__dirname, "public", "frontend");

  logger.info('Setting up static file paths', {
    staticPath,
  });

  // 静态文件头部设置函数
  const setStaticHeaders = (res: express.Response, filePath: string) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    }
    res.setHeader('Cache-Control', CONFIG.STATIC_CACHE_CONTROL);
  };

  app.use('/', express.static(staticPath, { setHeaders: setStaticHeaders }));
};

// 限流中间件
// app.use(rateLimitMiddleware);

// 设置静态文件
setupStaticFiles();

// API 路由
// 测试API连接
app.post("/api/test-connection", async (req: express.Request<object, object, TestConnectionRequest>, res: express.Response) => {
  try {
    const { api_key, base_url, model } = req.body;
    const apiKey = api_key || process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse("API key is required for testing")
      );
    }

    const baseUrl = base_url || CONFIG.OPENAI_BASE_URL;
    const modelId = model || CONFIG.MODEL_ID;

    logger.info("Testing OpenAI API connection", { baseUrl, modelId });

    const requestOptions = createOpenAIRequestOptions(apiKey, modelId, [
      { role: "user", content: "hi" }
    ], {
      max_tokens: 50,
      temperature: 0
    });

    const response = await fetchWithRetry(`${baseUrl}/chat/completions`, requestOptions);
    const data = await response.json() as { error?: { message?: string }, choices?: Array<{ message?: { content?: string } }> };

    if (!response.ok) {
      throw new Error(data.error?.message || "Connection test failed");
    }

    if (data?.choices?.[0]?.message) {
      return res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(
          { response: data.choices[0].message.content },
          "Connection test successful"
        )
      );
    } else {
      throw new Error("Received invalid response format");
    }
  } catch (error) {
    handleApiError(error, res);
  }
});

// 优化提示词接口
app.post("/api/optimize-prompt", async (req: express.Request<{}, {}, OptimizePromptRequest>, res: express.Response) => {
  try {
    const { prompt, language, api_key, base_url, model } = req.body;
    
    if (!prompt) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse("Missing prompt field")
      );
    }

    const apiKey = api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse("OpenAI API key is not configured.")
      );
    }

    const baseUrl = base_url || CONFIG.OPENAI_BASE_URL;
    const modelId = model || CONFIG.MODEL_ID;

    const systemPrompt = language === 'zh'
      ? "你是一个专业的提示词优化助手。你的任务是改进用户的提示词，使其更加清晰、具体和有效。保持用户的原始意图，但使提示词更加结构化，更容易被AI理解。只输出优化后的提示词文本，不要使用Markdown语法，不要添加任何解释、评论或额外标记。必要时可以使用换行符或空格来格式化文本，使其更易读。"
      : "You are a professional prompt optimization assistant. Your task is to improve the user's prompt to make it clearer, more specific, and more effective. Maintain the user's original intent but make the prompt more structured and easier for AI to understand. Output only the plain text of the optimized prompt without any Markdown syntax, explanations, comments, or additional markers. You may use <br> and spaces to format the text when necessary to improve readability.";

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ];

    const requestOptions = createOpenAIRequestOptions(apiKey, modelId, messages, {
      temperature: 0.7,
      max_tokens: 10000
    });

    logger.info("Sending prompt optimization request", { baseUrl, modelId });

    const response = await fetchWithRetry(`${baseUrl}/chat/completions`, requestOptions);
    const data = await response.json() as any;

    if (!response.ok) {
      throw new Error(data?.message || "Error calling OpenAI API");
    }

    const optimizedPrompt = data.choices?.[0]?.message?.content?.trim();

    return res.status(HTTP_STATUS.OK).json(
      createSuccessResponse({ optimizedPrompt })
    );
  } catch (error) {
    handleApiError(error, res);
  }
});

// 生成应用接口
app.post("/api/generate-app", async (req: express.Request<{}, {}, GenerateAppRequest>, res: express.Response) => {
  try {
    const { max_tokens, temperature, api_key, base_url, model, prompt } = req.body;
    
    if (!prompt) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse("Missing required fields prompt")
      );
    }

    // 记录请求信息
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
    logger.info("API request received", {
      clientIp,
      rateLimit: (req as any).rateLimit,
      path: req.path
    });

    // 设置流式响应头
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Keep-Alive", "timeout=120");
    res.flushHeaders();

    const apiKey = api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      if (!res.headersSent) {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
          createErrorResponse("OpenAI API key is not configured.")
        );
      }
      return res.end();
    }

    const baseUrl = base_url || CONFIG.OPENAI_BASE_URL;
    const modelId = model || CONFIG.MODEL_ID;

    logger.info("Generating app", { baseUrl, modelId, max_tokens, temperature });

    const messages = prompt ? [
      { role: "system", content: prompt.systemPrompt },
      { role: "assistant", content: prompt.assistantPrompt },
      { role: "user", content: prompt.userPrompt }
    ] : [];

    const requestOptions = createOpenAIRequestOptions(apiKey, modelId, messages, {
      stream: true,
      max_tokens: max_tokens || CONFIG.DEFAULT_MAX_TOKENS,
      temperature: temperature !== undefined ? temperature : CONFIG.DEFAULT_TEMPERATURE
    });

    const response = await fetchWithRetry(`${baseUrl}/chat/completions`, requestOptions);

    if (!response.ok) {
      const data = await response.json() as any;
      throw new Error(data?.message || "Error calling OpenAI API");
    }

    // 处理流式响应
    await handleStreamResponse(response, (content) => {
      if (!res.writableEnded) {
        res.write(content);
      }
    }, '</html>');

    if (!res.writableEnded) {
      res.end();
    }
  } catch (error) {
    handleApiError(error, res);
  }
});

// 修改代码接口
app.post("/api/modify-code", async (req: express.Request<{}, {}, ModifyCodeRequest>, res: express.Response) => {
  try {
    const { prompt, language, api_key, base_url, model } = req.body;
    
    if (!prompt) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse("Missing prompt field")
      );
    }

    const apiKey = api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse("OpenAI API key is not configured.")
      );
    }

    const baseUrl = base_url || CONFIG.OPENAI_BASE_URL;
    const modelId = model || CONFIG.MODEL_ID;

    const systemPrompt = language === 'zh'
      ? "你是一个专业的代码修改助手。你的任务是根据用户要求，修改用户提供的代码。只输出修改后的代码文本，不要使用Markdown语法，不要添加任何解释、评论或额外标记。"
      : "You are a professional code modification assistant. Your task is to modify the user's code according to the user's requirements. Output only the modified code text without any Markdown syntax, explanations, comments, or additional markers.";

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ];

    const requestOptions = createOpenAIRequestOptions(apiKey, modelId, messages, {
      temperature: 0.7,
      max_tokens: 10000
    });

    logger.info("Sending code modification request", { baseUrl, modelId });

    const response = await fetchWithRetry(`${baseUrl}/chat/completions`, requestOptions);
    const data = await response.json() as any;

    if (!response.ok) {
      throw new Error(data?.message || "Error calling OpenAI API");
    }

    const code = data.choices?.[0]?.message?.content?.trim();

    return res.status(HTTP_STATUS.OK).json(
      createSuccessResponse({ code })
    );
  } catch (error) {
    handleApiError(error, res);
  }
});

// App 相关接口
app.post("/api/apps", (req, res) => {
  try {
    const apps = appStoreManager.getAllApps();
    res.status(HTTP_STATUS.OK).json(createSuccessResponse(apps));
  } catch (error) {
    logger.error("Failed to get apps", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse("Failed to get apps")
    );
  }
});

app.post("/api/market/apps", async (req, res) => {
  try {
    // const { data: apps } = await cachedFetchGet(CONFIG.APP_MARKET_URL) as { data: any };
    // res.status(HTTP_STATUS.OK).json(createSuccessResponse(apps));
    throw new Error('ASSETS NOT FOUND')
  } catch (error) {
    logger.error("Failed to get market apps", error);
    handleApiError(error, res);
  }
});

// 根据ID获取app
app.post("/api/apps/detail", (req: express.Request<{}, {}, AppDetailRequest>, res: express.Response) => {
  try {
    const { id } = req.body;
    const app = appStoreManager.getAppById(id);
    
    if (!app) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        createErrorResponse("App not found")
      );
    }

    res.status(HTTP_STATUS.OK).json(createSuccessResponse(app));
  } catch (error) {
    logger.error("Failed to get app", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse("Failed to get app")
    );
  }
});

// 创建app
app.post("/api/apps/create", (req: express.Request<{}, {}, CreateAppRequest>, res: express.Response) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse("name field is required")
      );
    }

    const newApp = appStoreManager.createApp(req.body);

    res.status(HTTP_STATUS.CREATED).json(createSuccessResponse(newApp));
  } catch (error) {
    logger.error("Failed to create app", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse("Failed to create app")
    );
  }
});

// 更新app
app.post("/api/apps/update", (req: express.Request<{}, {}, UpdateAppRequest>, res: express.Response) => {
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse("id field is required")
      );
    }
    
    const { id: _, ...updateData } = req.body;
    const updatedApp = appStoreManager.updateApp(id, updateData);

    if (!updatedApp) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        createErrorResponse("App not found")
      );
    }

    res.status(HTTP_STATUS.OK).json(createSuccessResponse(updatedApp));
  } catch (error) {
    logger.error("Failed to update app", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse("Failed to update app")
    );
  }
});

// 删除app
app.post("/api/apps/remove", (req: express.Request<{}, {}, RemoveAppRequest>, res: express.Response) => {
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse("id field is required")
      );
    }
    
    const success = appStoreManager.removeApp(id);
    
    if (!success) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(
        createErrorResponse("App not found")
      );
    }

    res.status(HTTP_STATUS.OK).json(
      createSuccessResponse(null, "App deleted successfully")
    );
  } catch (error) {
    logger.error("Failed to delete app", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse("Failed to delete app")
    );
  }
});

// 导入apps
app.post("/api/apps/import", (req: express.Request<{}, {}, ImportAppsRequest>, res: express.Response) => {
  try {
    const { apps } = req.body;
    
    if (!Array.isArray(apps)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse("apps field must be an array")
      );
    }

    // 验证每个app是否有必需的字段
    for (const app of apps) {
      if (!app.id || !app.name) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          createErrorResponse("Each app must contain id and name fields")
        );
      }
    }

    appStoreManager.importApps(apps);
    
    res.status(HTTP_STATUS.OK).json(
      createSuccessResponse({ importedCount: apps.length }, "Apps imported successfully")
    );
  } catch (error) {
    logger.error("Failed to import apps", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse("Failed to import apps")
    );
  }
});

// 获取config
app.post("/api/config", (req, res) => {
  try {
    const config = appStoreManager.getConfig();
    res.status(HTTP_STATUS.OK).json(createSuccessResponse(config));
  } catch (error) {
    logger.error("Failed to get config", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse("Failed to get config")
    );
  }
});

// 保存config
app.post("/api/config/update", (req, res) => {
  try {
    const config = req.body;
    appStoreManager.saveConfig(config);
    
    res.status(HTTP_STATUS.OK).json(
      createSuccessResponse(null, "Config saved successfully")
    );
  } catch (error) {
    logger.error("Failed to save config", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse("Failed to save config")
    );
  }
});

// 获取应用风格
app.post("/api/build/styles", async (req, res) => {
  try {
    // const { data: styles } = await cachedFetchGet(CONFIG.APP_STYLES_URL) as { data: any };
    // res.status(HTTP_STATUS.OK).json(createSuccessResponse(styles));
    throw new Error('ASSETS NOT FOUND')
  } catch (error) {
    logger.error("Failed to get build styles", error);
    handleApiError(error, res);
  }
});

// 缓存管理接口
app.get("/api/cache/stats", (req, res) => {
  try {
    const stats = memoryCache.getStats();
    res.status(HTTP_STATUS.OK).json(createSuccessResponse(stats));
  } catch (error) {
    logger.error("Failed to get cache stats", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse("Failed to get cache stats")
    );
  }
});

app.post("/api/cache/clear", (req, res) => {
  try {
    memoryCache.clear();
    res.status(HTTP_STATUS.OK).json(createSuccessResponse(null, "缓存已清空"));
  } catch (error) {
    logger.error("Failed to clear cache", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse("Failed to clear cache")
    );
  }
});

// ngrok 相关
let lastNgrokAuthtoken: string | null = null;
let lastNgrokConfig: NgrokConfig | null = null;
let chatListener: any = null;
let comfyListener: any = null;

async function initNgrok(token: string): Promise<NgrokConfig> {
  if (!token) {
    throw new Error("ngrokAuthtoken is required");
  }

  if (token === lastNgrokAuthtoken && lastNgrokConfig) {
    return lastNgrokConfig;
  }

  try {
    await chatListener?.close();
    await comfyListener?.close();
  } catch (error) {
    logger.warn("Error closing previous ngrok listeners", error);
  }

  const config = artifyUtils.getConfig();
  if (!config.server_origin || !config.comfy_origin) {
    throw new Error("server_origin and comfy_origin must be set in config");
  }

  try {
    chatListener = await ngrok.forward({
      addr: config.server_origin,
      authtoken: token,
    });
    comfyListener = await ngrok.forward({
      addr: config.comfy_origin,
      authtoken: token,
    });
    
    const ngrokConfig: NgrokConfig = {
      comfy_origin: comfyListener.url(),
      server_origin: chatListener.url()
    };
    
    lastNgrokAuthtoken = token;
    lastNgrokConfig = ngrokConfig;
    return ngrokConfig;
  } catch (error) {
    lastNgrokAuthtoken = null;
    lastNgrokConfig = null;
    chatListener = null;
    comfyListener = null;
    throw error;
  }
}

app.post("/api/ngrok/url", async (req: express.Request<{}, {}, NgrokRequest>, res: express.Response) => {
  try {
    const { comfy_origin, server_origin } = await initNgrok(req.body.ngrokAuthtoken);
    res.status(HTTP_STATUS.OK).json(createSuccessResponse({ comfy_origin, server_origin }));
  } catch (error) {
    logger.error("Failed to connect ngrok", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
      createErrorResponse("Failed to connect ngrok")
    );
  }
});

// 图片获取
app.post("/view", async (req, res) => {
  try {
    const config = artifyUtils.getConfig();
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
    const imageResponse = await fetchWithRetry(`${config.comfy_origin}/view?${queryString}&rand=${Math.random()}`, { method: 'GET' });

    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
    }

    res.setHeader("Content-Type", imageResponse.headers.get("Content-Type") || "application/octet-stream");
    if (imageResponse.body) {
      for await (const chunk of imageResponse.body) {
        res.write(chunk);
      }
      res.end();
    } else {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createErrorResponse("No image data received")
      );
    }
  } catch (error) {
    logger.error("Failed to get image", error);
    handleApiError(error, res);
  }
});

// 历史记录获取
app.post("/history/:id", async (req, res) => {
  try {
    const config = artifyUtils.getConfig();
    const response = await fetchWithRetry(`${config.comfy_origin}/history/${req.params.id}`, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`Failed to fetch history: ${response.status} ${response.statusText}`);
    }
    const data = await response.json() as any;
    res.status(HTTP_STATUS.OK).json(data);
  } catch (error) {
    logger.error("Failed to get history", error);
    handleApiError(error, res);
  }
});

// queue获取
app.post("/queue", async (req, res) => {
  try {
    const config = artifyUtils.getConfig();
    const response = await fetchWithRetry(`${config.comfy_origin}/queue`, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`Failed to fetch queue: ${response.status} ${response.statusText}`);
    }
    const data = await response.json() as any;
    res.status(HTTP_STATUS.OK).json(data);
  } catch (error) {
    logger.error("Failed to get queue", error);
    handleApiError(error, res);
  }
});

// 关机接口
app.post("/api/shutdown", async (req: express.Request<{}, {}, ShutdownRequest>, res: express.Response) => {
  try {
    const { delay = 0, force = false } = req.body;
    
    // 验证延迟时间
    if (delay < 0 || delay > 3600) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(
        createErrorResponse("Delay must be between 0 and 3600 seconds")
      );
    }

    const currentPlatform = platform();
    let shutdownCommand: string;

    // 根据操作系统构建关机命令
    switch (currentPlatform) {
      case 'win32':
        // Windows 关机命令
        const forceFlag = force ? '/f' : '';
        const delayFlag = delay > 0 ? `/t ${delay}` : '';
        shutdownCommand = `shutdown /s ${forceFlag} ${delayFlag}`.trim();
        break;
      
      case 'darwin':
        // macOS 关机命令
        if (delay > 0) {
          shutdownCommand = `sudo shutdown -h +${Math.ceil(delay / 60)}`;
        } else {
          shutdownCommand = 'sudo shutdown -h now';
        }
        break;
      
      case 'linux':
        // Linux 关机命令
        if (delay > 0) {
          shutdownCommand = `sudo shutdown -h +${Math.ceil(delay / 60)}`;
        } else {
          shutdownCommand = 'sudo shutdown -h now';
        }
        break;
      
      default:
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
          createErrorResponse(`Unsupported operating system: ${currentPlatform}`)
        );
    }

    logger.info("Executing shutdown command", {
      platform: currentPlatform,
      command: shutdownCommand,
      delay,
      force
    });

    // 执行关机命令
    exec(shutdownCommand, (error, stdout, stderr) => {
      if (error) {
        logger.error("Shutdown command failed", {
          error: error.message,
          stderr,
          platform: currentPlatform
        });
        
        // 如果是权限错误，提供更友好的错误信息
        if (error.message.includes('permission') || error.message.includes('denied')) {
          return res.status(HTTP_STATUS.UNAUTHORIZED).json(
            createErrorResponse("Permission denied. Please run the application with administrator/sudo privileges.")
          );
        }
        
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
          createErrorResponse(`Shutdown failed: ${error.message}`)
        );
      }

      logger.info("Shutdown command executed successfully", {
        stdout,
        platform: currentPlatform
      });

      const message = delay > 0 
        ? `System will shutdown in ${delay} seconds`
        : "System shutdown initiated";

      res.status(HTTP_STATUS.OK).json(
        createSuccessResponse(
          { 
            command: shutdownCommand,
            platform: currentPlatform,
            delay,
            force
          },
          message
        )
      );
    });

  } catch (error) {
    handleApiError(error, res);
  }
});

// 处理所有其他路由
app.get("*", (req, res) => {
  // 检查是否是静态资源请求
  const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.json', '.map'];
  const isStaticResource = staticExtensions.some(ext => req.path.endsWith(ext));
  
  if (isStaticResource) {
    // 静态资源不存在时返回404
    return res.status(404).json({ error: 'Static resource not found' });
  }
  
  // 对于所有其他请求，返回index.html以支持前端路由
  const indexPath = path.join(__dirname, "public/frontend", "index.html");
  res.sendFile(indexPath);
});

// 全局错误处理中间件
app.use((error: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Unhandled error", error);
  handleApiError(error, res);
});

export default app;

export function startServer(): Promise<HttpServer> {
  return new Promise((resolve, reject) => {
    // 检查服务器是否已经在运行
    if (server && server.listening) {
      logger.info(`Server is already running on port ${CONFIG.PORT}`);
      return resolve(server);
    }

    // 在生产环境启动前检查并更新静态资源
    
    // 尝试启动服务器，如果端口被占用则自动选择其他端口
    // 优先尝试常用端口范围
    const preferredPorts = [Number(CONFIG.PORT), 3002, 3003, 9528, 8082, 5002, 5003];
    tryPreferredPorts(preferredPorts, 0);
    
    function tryPreferredPorts(ports: number[], index: number) {
      if (index >= ports.length) {
        // 所有首选端口都不可用，开始顺序尝试
        tryStartServer(Number(CONFIG.PORT));
        return;
      }
      
      const port = ports[index];
      const testServer = createServer();
      testServer.listen(port, () => {
        testServer.close(() => {
          // 端口可用，启动实际服务器
          startActualServer(port);
        });
      });

      testServer.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          logger.warn(`Preferred port ${port} is in use, trying next preferred port...`);
          tryPreferredPorts(ports, index + 1);
        } else {
          logger.error('Port test failed', err);
          reject(err);
        }
      });
    }

    function tryStartServer(port: number, attempts: number = 0) {
      // 检查端口是否可用
      const testServer = createServer();
      testServer.listen(port, () => {
        testServer.close(() => {
          // 端口可用，启动实际服务器
          startActualServer(port);
        });
      });

      testServer.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          logger.warn(`Port ${port} is already in use, trying next port...`);
          // 尝试下一个端口
          const nextPort = port + 1;
          const maxAttempts = CONFIG.PORT_RANGE;
          
          if (attempts < maxAttempts) {
            tryStartServer(nextPort, attempts + 1);
          } else {
            const endPort = Number(CONFIG.PORT) + maxAttempts;
            logger.error(`No available ports found in range ${CONFIG.PORT}-${endPort}`);
            reject(new Error(`No available ports found in range ${CONFIG.PORT}-${endPort}. Please check your system or try a different starting port.`));
          }
        } else {
          logger.error('Port test failed', err);
          reject(err);
        }
      });
    }

    function startActualServer(port: number) {
      server = app.listen(port, () => {
        logger.info(`Server is running on port ${port}`);
        resolve(server!);
      });

      server.on('error', (err: NodeJS.ErrnoException) => {
        logger.error('Server error', err);
        reject(err);
      });
    }
  });
}

export function getServer(): HttpServer | null {
  return server;
}

export function getServerPort(): number | null {
  if (server && server.listening) {
    const address = server.address();
    if (address && typeof address === 'object' && 'port' in address) {
      return address.port;
    }
  }
  return null;
} 