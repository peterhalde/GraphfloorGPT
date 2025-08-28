import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export type ModelProvider = 'anthropic' | 'openai' | 'azure-openai';
export type ModelName = 
  | 'claude-sonnet-4-20250514' 
  | 'claude-3-5-sonnet-20241022'
  | 'gpt-4-turbo-preview'
  | 'gpt-4'
  | 'gpt-5'; // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user

export interface ModelConfig {
  provider: ModelProvider;
  model: ModelName;
  temperature?: number;
  maxTokens?: number;
  // Azure OpenAI specific settings
  azureOpenAIApiKey?: string;
  azureOpenAIApiInstanceName?: string;
  azureOpenAIApiDeploymentName?: string;
  azureOpenAIApiVersion?: string;
}

export interface DirectModelResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class ModelProviderService {
  private static instance: ModelProviderService;
  private currentConfig: ModelConfig;
  
  private constructor() {
    // Default to Claude Sonnet 4
    this.currentConfig = {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      temperature: 0.2,
      maxTokens: 2000
    };
  }

  static getInstance(): ModelProviderService {
    if (!ModelProviderService.instance) {
      ModelProviderService.instance = new ModelProviderService();
    }
    return ModelProviderService.instance;
  }

  getCurrentConfig(): ModelConfig {
    return { ...this.currentConfig };
  }

  setModelConfig(config: Partial<ModelConfig>): void {
    this.currentConfig = {
      ...this.currentConfig,
      ...config
    };
    console.log(`[ModelProvider] Updated config:`, this.currentConfig);
  }

  /**
   * Get a LangChain-compatible chat model for use with GraphCypherQAChain
   */
  getLangChainModel(): BaseChatModel {
    const { provider, model, temperature, maxTokens } = this.currentConfig;

    if (provider === 'azure-openai') {
      const apiKey = process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      const instanceName = process.env.AZURE_OPENAI_API_INSTANCE_NAME;
      const deploymentName = process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME;
      const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview';
      
      if (!apiKey || !instanceName || !deploymentName) {
        throw new Error('Azure OpenAI configuration missing. Required: AZURE_OPENAI_API_KEY, AZURE_OPENAI_API_INSTANCE_NAME, AZURE_OPENAI_API_DEPLOYMENT_NAME');
      }

      return new ChatOpenAI({
        azureOpenAIApiKey: apiKey,
        azureOpenAIApiInstanceName: instanceName,
        azureOpenAIApiDeploymentName: deploymentName,
        azureOpenAIApiVersion: apiVersion,
        temperature: temperature || 0.2,
        maxTokens: maxTokens || 2000,
      });
    } else if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not configured');
      }

      return new ChatOpenAI({
        modelName: model as string,
        temperature: temperature || 0.2,
        maxTokens: maxTokens || 2000,
        openAIApiKey: apiKey,
      });
    } else {
      // Default to Anthropic
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
      }

      return new ChatAnthropic({
        model: model as string,
        temperature: temperature || 0.2,
        anthropicApiKey: apiKey,
        maxTokens: maxTokens || 2000,
      });
    }
  }

  /**
   * Direct model call for simple completions (used in deduplication, entity extraction, etc.)
   */
  async getCompletion(prompt: string, config?: Partial<ModelConfig>): Promise<DirectModelResponse> {
    const finalConfig = { ...this.currentConfig, ...config };
    const { provider, model, temperature, maxTokens } = finalConfig;

    if (provider === 'azure-openai') {
      const apiKey = process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      const instanceName = process.env.AZURE_OPENAI_API_INSTANCE_NAME;
      const deploymentName = process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME;
      const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview';
      
      if (!apiKey || !instanceName || !deploymentName) {
        throw new Error('Azure OpenAI configuration missing. Required: AZURE_OPENAI_API_KEY, AZURE_OPENAI_API_INSTANCE_NAME, AZURE_OPENAI_API_DEPLOYMENT_NAME');
      }

      const baseURL = `https://${instanceName}.openai.azure.com/openai/deployments/${deploymentName}`;
      const openai = new OpenAI({ 
        apiKey,
        baseURL,
        defaultQuery: { 'api-version': apiVersion },
        defaultHeaders: { 'api-key': apiKey }
      });
      
      const response = await openai.chat.completions.create({
        model: deploymentName, // Azure uses deployment name as model
        messages: [{ role: 'user', content: prompt }],
        temperature: temperature || 0.2,
        max_tokens: maxTokens || 2000,
        response_format: { type: 'json_object' } // Request JSON format when applicable
      });

      return {
        content: response.choices[0].message.content || '',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens
        } : undefined
      };
    } else if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not configured');
      }

      const openai = new OpenAI({ apiKey });
      
      const response = await openai.chat.completions.create({
        model: model as string,
        messages: [{ role: 'user', content: prompt }],
        temperature: temperature || 0.2,
        max_tokens: maxTokens || 2000,
        response_format: { type: 'json_object' } // Request JSON format when applicable
      });

      return {
        content: response.choices[0].message.content || '',
        usage: response.usage ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens
        } : undefined
      };
    } else {
      // Default to Anthropic
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
      }

      const anthropic = new Anthropic({ apiKey });
      
      const response = await anthropic.messages.create({
        model: model as string,
        max_tokens: maxTokens || 2000,
        temperature: temperature || 0.2,
        messages: [{ role: 'user', content: prompt }]
      });

      const textContent = response.content[0];
      if (textContent.type !== 'text') {
        throw new Error('Unexpected response type from Anthropic');
      }

      return {
        content: textContent.text,
        usage: response.usage ? {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens
        } : undefined
      };
    }
  }

  /**
   * Check which API keys are available
   */
  getAvailableProviders(): { provider: ModelProvider; models: ModelName[]; available: boolean }[] {
    const azureConfigured = !!(process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY) && 
                           !!process.env.AZURE_OPENAI_API_INSTANCE_NAME && 
                           !!process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME;
    
    return [
      {
        provider: 'anthropic',
        models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022'],
        available: !!process.env.ANTHROPIC_API_KEY
      },
      {
        provider: 'openai',
        models: ['gpt-5', 'gpt-4-turbo-preview', 'gpt-4'], // gpt-5 is the newest model
        available: !!process.env.OPENAI_API_KEY && !azureConfigured // Only if not using Azure
      },
      {
        provider: 'azure-openai',
        models: ['gpt-4', 'gpt-4-turbo'], // Azure deployment names
        available: azureConfigured
      }
    ];
  }
}

// Export singleton instance
export const modelProvider = ModelProviderService.getInstance();