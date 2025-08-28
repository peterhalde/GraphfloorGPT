# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development
npm run dev          # Start development server (frontend + backend)
npm run build        # Build for production (client + server)
npm run start        # Start production server
npm run check        # TypeScript type checking

# Database
npm run db:push      # Push schema changes to database
```

## Project Architecture

This is a full-stack TypeScript application that transforms PDF documents into interactive knowledge graphs using AI.

### Stack Overview
- **Frontend**: React + TypeScript with Wouter routing, Radix UI components, TailwindCSS
- **Backend**: Express.js server with TypeScript
- **Databases**: PostgreSQL (via Neon) for relational data, Neo4j for graph storage
- **AI**: Claude Sonnet 4 (claude-sonnet-4-20250514) for entity extraction and semantic analysis
- **File Storage**: Google Cloud Storage for uploaded PDFs
- **ORM**: Drizzle ORM with schema in `shared/schema.ts`

### Key Architecture Patterns

**Monorepo Structure**:
- `client/src/` - React frontend with component-based architecture
- `server/` - Express backend with service layer pattern
- `shared/` - Common schemas and types shared between frontend/backend
- Path aliases: `@/*` maps to `client/src/*`, `@shared/*` maps to `shared/*`

**Data Flow**:
1. PDFs uploaded via frontend → stored in Google Cloud Storage
2. Backend extracts text and sends to Claude API for entity/relationship extraction
3. Extracted entities stored in PostgreSQL, approved entities synced to Neo4j
4. Frontend visualizes graph using ReactFlow and provides deduplication interface

**Database Schema**:
- `documents` - PDF metadata and processing status
- `graphNodes` - AI-extracted entities with approval workflow
- `graphRelations` - Relationships between nodes
- `duplicateCandidates` - Potential duplicate node pairs for user review
- `userEquivalences` - User-defined node mappings

### Critical Services

**Deduplication Engine** (`server/services/deduplication.ts`):
- Semantic similarity detection using Claude Sonnet 4
- Exact matching for identical node names
- User-defined equivalences system
- **Known Issue**: Identical nodes sometimes not detected (threshold logic bug)

**PDF Processing** (`server/services/pdf.ts`):
- Text extraction from uploaded PDFs
- Integration with Claude API for entity extraction
- Batch processing with status tracking

**Neo4j Integration** (`server/services/neo4j.ts`):
- Graph database operations for approved nodes/relations
- Cypher query generation for chat interface

## Environment Requirements

```env
DATABASE_URL=postgresql://...        # Neon PostgreSQL connection
ANTHROPIC_API_KEY=sk-...            # Claude API key
NEO4J_URI=neo4j+s://...             # Neo4j database URI
NEO4J_USERNAME=neo4j                # Neo4j username
NEO4J_PASSWORD=...                  # Neo4j password
GOOGLE_CLOUD_STORAGE_BUCKET=...     # GCS bucket name
```

## Development Notes

- Server runs on development mode with `tsx` for hot reloading
- Client uses Vite with React plugin for fast development builds
- Database schema changes require `npm run db:push` to sync with Neon
- All API routes prefixed with `/api` and logged with request/response times
- TypeScript strict mode enabled across entire codebase
- No testing framework currently configured

## Known Issues

- **Critical Bug**: Identical node names ("Teig" vs "Teig") not being detected as 100% duplicates in deduplication service
- **Performance**: Deduplication analysis creates excessive low-similarity candidates (15-25% threshold noise)
- **State Management**: Frontend may not reflect backend changes immediately after operations
- **Exact Matching Logic**: Algorithm in `deduplication.ts` needs debugging for identical strings