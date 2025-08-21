# GraphfloorGPT Project Export

## Current Project State (August 21, 2025)

This document contains all the information needed to set up the GraphfloorGPT project in your own Git repository.

## Critical Issues Identified
- **Teig Deduplication Bug**: Two identical "Teig" nodes exist but system fails to detect them as 100% duplicates
- **Analysis Threshold Logic**: Creates too many low-similarity candidates (15-25% matches)
- **Frontend State Management**: UI may not properly reflect backend data changes
- **Performance**: Deduplication analysis creates excessive noise candidates

## Project Architecture

### Technology Stack
- **Frontend**: React + TypeScript, Radix UI, TailwindCSS, TanStack Query
- **Backend**: Node.js + Express, TypeScript, Drizzle ORM
- **Databases**: PostgreSQL (Neon), Neo4j (graph storage)
- **AI**: Claude Sonnet 4 (claude-sonnet-4-20250514)
- **File Storage**: Google Cloud Storage

### Key Features Implemented
1. **PDF Processing**: Upload and extract text from PDFs
2. **AI Entity Extraction**: Claude Sonnet 4 extracts nodes and relationships
3. **Deduplication Engine**: Semantic similarity detection with user verification
4. **Knowledge Graph**: Interactive graph visualization with ReactFlow
5. **User Management**: Custom authentication system
6. **Chat Interface**: Natural language queries against the knowledge graph

## File Structure Overview

```
├── client/src/
│   ├── components/
│   │   ├── Deduplication.tsx      # Main deduplication interface
│   │   ├── NodeManager.tsx        # Node approval/management
│   │   └── [other UI components]
│   ├── pages/                     # React pages
│   └── lib/                       # Frontend utilities
├── server/
│   ├── services/
│   │   └── deduplication.ts       # Core deduplication logic
│   ├── db.ts                      # Database connection
│   ├── routes.ts                  # API endpoints
│   ├── storage.ts                 # Data access layer
│   └── index.ts                   # Server entry point
├── shared/
│   ├── schema.ts                  # Database schemas
│   └── userEquivalences.ts        # User-defined node mappings
└── [config files]
```

## Environment Variables Required

```env
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-...
NEO4J_URI=neo4j+s://...
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=...
```

## Key Database Tables
- `nodes`: AI-extracted entities from documents
- `relations`: Relationships between nodes
- `duplicateCandidates`: Potential duplicate node pairs
- `users`: User authentication
- `documents`: Uploaded PDF metadata

## Current Data State
- **Valid Duplicates Found**: "Ofen/Backofen" (95%), "Ofen/Pizzaofen" (85%)
- **Missing Duplicates**: Two "Teig" nodes should match at 100%
- **Nodes**: ~20 approved nodes in German cooking domain
- **Documents**: flammkuchen.pdf and related cooking documents

## Installation Steps for Your Repository

1. Clone this project structure
2. Install dependencies: `npm install`
3. Set up PostgreSQL database with Neon
4. Set up Neo4j database
5. Configure environment variables
6. Run database migrations: `npm run db:push`
7. Start development: `npm run dev`

## Immediate Fix Needed

The deduplication system has a critical bug where identical nodes ("Teig" vs "Teig") are not being detected. The exact matching logic in `server/services/deduplication.ts` needs debugging.

**Node IDs for debugging:**
- Teig Node 1: `fa3c6fd2-afd0-4056-a7a2-33d94009e72a`
- Teig Node 2: `d9440437-864e-44db-84e2-380d1d6b5a5e`

These should automatically match at 100% similarity but are not being detected by the current algorithm.

## Next Steps
1. Set up Git repository with this codebase
2. Debug exact matching logic for identical node names
3. Improve threshold filtering to reduce noise
4. Fix frontend state management issues
5. Add proper error handling and logging

This export provides everything needed to continue development in your own Git environment.