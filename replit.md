# GraphfloorGPT Knowledge Graph AI

## Overview

GraphfloorGPT is a modern web application that transforms PDF documents into intelligent knowledge graphs. The system uses AI to extract entities and relationships from uploaded documents, creating an interactive graph database that users can query through natural language. The application features a comprehensive management interface for reviewing AI-extracted nodes and relationships, enhanced deduplication capabilities with exact matching and user-guided learning, and an intelligent chat interface for querying the knowledge graph.

## Recent Changes (August 2025)
- **Fixed Deduplication System**: Implemented fast exact name matching to detect identical nodes (e.g., "Teig" vs "Teig") before expensive AI analysis
- **Enhanced Statistics**: Replaced hardcoded deduplication stats with real-time data from database (potential duplicates, merged count, merge rate)
- **User Equivalence System**: Added comprehensive user-guided learning for custom node/relation mappings with German cooking terms pre-configured
- **Robust JSON Parsing**: Fixed Claude Sonnet 4 response parsing to handle markdown formatting and extraction errors
- **Merge Functionality**: Fixed database operations for properly merging duplicate nodes and updating related connections

## User Preferences

Preferred communication style: Simple, everyday language.
AI Model: Claude Sonnet 4 (claude-sonnet-4-20250514) for all AI operations.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript for type safety and modern component development
- **UI Framework**: Radix UI primitives with shadcn/ui components for consistent, accessible design
- **Styling**: Tailwind CSS with CSS variables for theming and responsive design
- **State Management**: TanStack Query for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **File Uploads**: React Dropzone with Uppy for enhanced file upload experiences
- **Graph Visualization**: ReactFlow for interactive knowledge graph visualization

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript for full-stack type safety
- **Database ORM**: Drizzle ORM with PostgreSQL as the primary database
- **Development**: Vite for fast development with HMR and ESM support
- **File Processing**: Multer for handling PDF uploads with validation

### Data Storage Solutions
- **Primary Database**: PostgreSQL via Neon Database for structured data storage
- **Schema Management**: Drizzle migrations for version-controlled database changes
- **File Storage**: Google Cloud Storage for PDF document persistence
- **Graph Database**: Neo4j for storing and querying knowledge graph relationships

### Authentication and Authorization
- **User Management**: Custom user system with username/password authentication
- **Session Handling**: Cookie-based sessions managed through Express middleware
- **Access Control**: Role-based permissions for document upload and graph management

## External Dependencies

### Cloud Services
- **Neon Database**: Serverless PostgreSQL database hosting
- **Google Cloud Storage**: Scalable file storage for uploaded PDF documents
- **Neo4j**: Graph database for storing extracted knowledge relationships

### AI and Processing Services
- **Claude Sonnet 4**: Latest Anthropic AI model (claude-sonnet-4-20250514) for intelligent entity and relationship extraction from document text
- **Langfuse**: AI service integration layer for processing workflows
- **PDF Processing**: pdf-parse library for extracting text content from uploaded PDFs

### Development and Build Tools
- **Vite**: Modern build tool with fast HMR for development
- **ESBuild**: Fast bundling for production builds
- **Replit Integration**: Development environment optimizations for Replit deployment

### Key Libraries
- **Drizzle ORM**: Type-safe database queries and migrations
- **ReactFlow**: Interactive graph visualization components
- **TanStack Query**: Powerful data fetching and caching
- **Radix UI**: Accessible component primitives
- **Zod**: Runtime type validation for API schemas