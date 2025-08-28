import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Check if running on Replit
export const isReplit = !!process.env.REPL_ID;

// Load environment variables for local development
if (!isReplit) {
  // Try to load .env.local first, then .env
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  const envPath = path.resolve(process.cwd(), '.env');
  
  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath });
    console.log('Loaded .env.local file');
  } else if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log('Loaded .env file');
  } else {
    console.warn('No .env or .env.local file found. Make sure environment variables are set.');
  }
}

// Configuration object with defaults
export const config = {
  // Server
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',
  
  // Database
  databaseUrl: process.env.DATABASE_URL,
  
  // Session
  sessionSecret: process.env.SESSION_SECRET || 'default-dev-secret-change-this',
  
  // AI Services
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  
  // Azure OpenAI
  azureOpenAI: {
    apiKey: process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    instanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
    deploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview',
  },
  
  // Google Cloud Storage
  googleCloud: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    storageBucket: process.env.GOOGLE_CLOUD_STORAGE_BUCKET,
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  },
  
  // Neo4j
  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USERNAME || 'neo4j',
    password: process.env.NEO4J_PASSWORD || '',
  },
  
  // Replit-specific
  isReplit,
  replId: process.env.REPL_ID,
};

// Validate required configurations
export function validateConfig() {
  const errors: string[] = [];
  
  if (!config.databaseUrl) {
    errors.push('DATABASE_URL is required');
  }
  
  if (config.isProduction && !config.sessionSecret) {
    errors.push('SESSION_SECRET is required in production');
  }
  
  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(error => console.error(`  - ${error}`));
    
    if (config.isProduction) {
      throw new Error('Configuration validation failed');
    } else {
      console.warn('Continuing in development mode despite configuration issues');
    }
  }
}

export default config;