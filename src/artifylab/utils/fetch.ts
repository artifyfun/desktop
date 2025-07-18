import { CONFIG } from '../config/constants';
import { logger } from './logger';
import { isConnectionTimeoutError } from './errorHandler';

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export interface FetchResponse<T = any> {
  ok: boolean;
  fromCache?: boolean;
  data?: T;
  status?: number;
  headers?: Record<string, string>;
}

// 创建带超时的fetch函数
export async function fetchWithTimeout(
  url: string, 
  options: FetchOptions, 
  timeout: number = CONFIG.FETCH_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// 带重试机制的fetch函数
export async function fetchWithRetry(
  url: string, 
  options: FetchOptions, 
  maxRetries: number = CONFIG.MAX_RETRIES
): Promise<Response> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`Fetch attempt ${attempt}/${maxRetries} to ${url}`);
      return await fetchWithTimeout(url, options);
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Fetch attempt ${attempt} failed`, { 
        url, 
        error: (error as Error).message,
        attempt 
      });
      
      // 如果是最后一次尝试，直接抛出错误
      if (attempt === maxRetries) {
        throw error;
      }
      
      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY * attempt));
    }
  }
  
  throw lastError!;
}

// 处理 OpenAI API 响应的通用函数
export async function handleOpenAIResponse(response: Response): Promise<any> {
  if (!response.ok) {
    logger.error(`OpenAI API error`, { 
      status: response.status, 
      statusText: response.statusText 
    });

    try {
      const contentType = response.headers.get("Content-Type");
      logger.debug(`Response Content-Type: ${contentType}`);

      if (contentType && contentType.includes("application/json")) {
        const error = await response.json();
        logger.error("OpenAI API error details", error);
        throw new Error(error?.message || "Error calling OpenAI API");
      } else {
        const errorText = await response.text();
        logger.error("OpenAI API error text", errorText);
        throw new Error(errorText || `OpenAI API error: ${response.status} ${response.statusText}`);
      }
    } catch (parseError) {
      logger.error("Error parsing API response", parseError);
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }
  }

  return response.json();
}

// 创建 OpenAI 请求选项
export function createOpenAIRequestOptions(
  apiKey: string,
  model: string,
  messages: any[],
  options: {
    stream?: boolean;
    max_tokens?: number;
    temperature?: number;
  } = {}
): FetchOptions {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      stream: options.stream || false,
      max_tokens: options.max_tokens || CONFIG.DEFAULT_MAX_TOKENS,
      temperature: options.temperature !== undefined ? options.temperature : CONFIG.DEFAULT_TEMPERATURE
    })
  };
}

// 处理流式响应的通用函数
export async function handleStreamResponse(
  response: Response,
  onChunk: (content: string) => void,
  endFlag?: string
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body reader available");
  }

  const decoder = new TextDecoder("utf8");
  let completeResponse = "";

  logger.debug("Starting to process stream response");

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        logger.debug("Stream completed");
        break;
      }

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");
      let processedAnyLine = false;

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          processedAnyLine = true;
          if (line.includes("[DONE]")) {
            logger.debug("Received [DONE] signal");
            continue;
          }

          try {
            const data = JSON.parse(line.replace("data: ", ""));
            const content = data.choices?.[0]?.delta?.content || "";

            if (content) {
              onChunk(content);
              completeResponse += content;

              if (endFlag && completeResponse.includes(endFlag)) {
                logger.debug(`Found ${endFlag}, ending stream`);
                return;
              }
            }
          } catch (error) {
            logger.error("Error parsing JSON from SSE line", { error, line });
          }
        }
      }

      if (!processedAnyLine && chunk.trim()) {
        try {
          const jsonData = JSON.parse(chunk);
          if (jsonData.choices && jsonData.choices[0]) {
            const content = jsonData.choices[0].message?.content || jsonData.choices[0].delta?.content || "";
            if (content) {
              onChunk(content);
              completeResponse += content;
            }
          }
        } catch (error) {
          onChunk(chunk);
          completeResponse += chunk;
        }
      }

      if (endFlag && completeResponse.includes(endFlag)) {
        logger.debug(`Found ${endFlag} in complete response, ending stream`);
        break;
      }
    }

    logger.debug("Stream processing completed");
  } catch (streamError) {
    logger.error("Error processing stream", streamError);
    throw streamError;
  }
} 