export { QueryOrchestrator } from './queryOrchestrator';
export type { QueryResult } from './queryOrchestrator';
export { TemplateQueryEngine } from './templateQueryEngine';
export { NLPProcessor } from './nlpProcessor';
export type { NLPResult } from './nlpProcessor';
export { LangChainGraphRAG } from './langchainGraphRAG';
export type { GraphRAGResult } from './langchainGraphRAG';

// Initialize and export a singleton instance
import { neo4jService } from '../neo4j';
import { QueryOrchestrator } from './queryOrchestrator';

export const graphRAGOrchestrator = new QueryOrchestrator(neo4jService);