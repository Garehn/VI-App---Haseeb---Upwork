/**
 * Critical Priority Knowledge Base Preprocessing Script
 * 
 * This script:
 * 1. Parses 5 survival manual text files from Critical Priority folder
 * 2. Cleans OCR artifacts and normalizes text
 * 3. Chunks documents into semantic segments (~500 tokens, 50 token overlap)
 * 4. Generates embeddings using @xenova/transformers (MiniLM-L6-v2)
 * 5. Builds BM25 index for keyword search
 * 6. Creates SQLite database for bundling with the app
 * 
 * Requirements:
 * - Node.js 18+
 * - npm install @xenova/transformers better-sqlite3
 * 
 * Usage:
 * node scripts/prepare-critical-priority-db.js
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Configuration
const CONFIG = {
  sourceDir: path.join(__dirname, '../Critical Priority'),
  outputDir: path.join(__dirname, '../SurvivalRAG/android/app/src/main/assets'),
  dbFileName: 'knowledge.db',
  embeddingModel: 'Xenova/all-MiniLM-L6-v2',
  chunkSize: 500, // tokens
  chunkOverlap: 50, // tokens
  minChunkLength: 100, // minimum characters
};

// Document metadata
const DOCUMENTS = [
  {
    id: 'canning-guide',
    title: 'Complete Guide to Home Canning',
    file: 'Canning-Guide/completeguidetoh00unit_djvu.txt',
    category: 'Food Preservation'
  },
  {
    id: 'survival-manual',
    title: 'US Army Survival Manual (FM 21-76)',
    file: 'FM21-76SurvivalManual/FM21-76_SurvivalManual_djvu.txt',
    category: 'Survival Skills'
  },
  {
    id: 'first-aid',
    title: 'First Aid Manual (FM 4-25.11)',
    file: 'FM4-25.11/FM4-25.11_djvu.txt',
    category: 'Medical'
  },
  {
    id: 'ranger-handbook',
    title: 'Ranger Handbook (SH 21-76)',
    file: 'Ranger-Guide/sh_21-76_ranger_handbook_2000_djvu.txt',
    category: 'Tactical Skills'
  },
  {
    id: 'victory-garden',
    title: 'Victory Garden Manual',
    file: 'VictoryGarden/CAT10947094_djvu.txt',
    category: 'Food Production'
  }
];

console.log(`
========================================
Critical Priority Knowledge Base Builder
========================================
Documents: ${DOCUMENTS.length}
Embedding model: ${CONFIG.embeddingModel}
Chunk size: ${CONFIG.chunkSize} tokens
Output: ${path.join(CONFIG.outputDir, CONFIG.dbFileName)}
========================================
`);

/**
 * Clean OCR artifacts and normalize text
 */
function cleanText(text) {
  return text
    // Remove page headers/footers with document titles
    .replace(/FM \d+-\d+(\.\d+)? US ARMY.*?$/gim, '')
    .replace(/SH \d+-\d+ UNITED STATES ARMY.*?$/gim, '')
    .replace(/Page \d+ of \d+/gi, '')
    
    // Remove excessive whitespace and formatting artifacts
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    
    // Fix common OCR errors
    .replace(/\b([a-z])- ([a-z])/g, '$1$2') // Remove hyphenation
    .replace(/\s+\./g, '.') // Fix spaced periods
    .replace(/\.\s+([a-z])/g, '. $1') // Ensure space after period
    
    // Remove special characters that are OCR artifacts
    .replace(/[^\w\s\.\,\;\:\!\?\-\(\)\[\]\{\}\/\'\"\n]/g, '')
    
    .trim();
}

/**
 * Simple tokenizer for chunk size estimation
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 0);
}

/**
 * Split text into semantic chunks with overlap
 */
function chunkText(text, docTitle) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let currentChunk = [];
  let currentTokenCount = 0;
  
  for (const sentence of sentences) {
    const tokens = tokenize(sentence);
    const sentenceTokenCount = tokens.length;
    
    if (currentTokenCount + sentenceTokenCount > CONFIG.chunkSize && currentChunk.length > 0) {
      // Save current chunk
      const chunkText = currentChunk.join(' ');
      if (chunkText.length >= CONFIG.minChunkLength) {
        chunks.push(chunkText);
      }
      
      // Start new chunk with overlap
      const overlapSentences = [];
      let overlapTokens = 0;
      
      for (let i = currentChunk.length - 1; i >= 0; i--) {
        const sent = currentChunk[i];
        const sentTokens = tokenize(sent).length;
        
        if (overlapTokens + sentTokens <= CONFIG.chunkOverlap) {
          overlapSentences.unshift(sent);
          overlapTokens += sentTokens;
        } else {
          break;
        }
      }
      
      currentChunk = overlapSentences;
      currentTokenCount = overlapTokens;
    }
    
    currentChunk.push(sentence);
    currentTokenCount += sentenceTokenCount;
  }
  
  // Add remaining chunk
  if (currentChunk.length > 0) {
    const chunkText = currentChunk.join(' ');
    if (chunkText.length >= CONFIG.minChunkLength) {
      chunks.push(chunkText);
    }
  }
  
  return chunks;
}

/**
 * Extract sections from document (for better chunking context)
 */
function extractSections(text, docTitle) {
  // Look for chapter/section markers
  const sections = [];
  const lines = text.split('\n');
  
  let currentSection = { title: docTitle, content: [] };
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Detect section headers (all caps, short lines, or "CHAPTER X")
    if (
      (trimmed.length > 0 && trimmed.length < 60 && trimmed === trimmed.toUpperCase() && /^[A-Z\s\-0-9]+$/.test(trimmed)) ||
      /^CHAPTER \d+/i.test(trimmed) ||
      /^SECTION \d+/i.test(trimmed)
    ) {
      // Save previous section if it has content
      if (currentSection.content.length > 0) {
        sections.push({
          title: currentSection.title,
          content: currentSection.content.join('\n')
        });
      }
      
      // Start new section
      currentSection = { title: trimmed || docTitle, content: [] };
    } else if (trimmed.length > 0) {
      currentSection.content.push(line);
    }
  }
  
  // Add final section
  if (currentSection.content.length > 0) {
    sections.push({
      title: currentSection.title,
      content: currentSection.content.join('\n')
    });
  }
  
  return sections;
}

/**
 * Calculate BM25 term frequencies
 */
function calculateBM25Index(documents) {
  const termDocFreq = new Map();
  const docTermFreq = new Map();
  
  documents.forEach((doc, docIdx) => {
    const terms = tokenize(doc.content);
    const uniqueTerms = new Set(terms);
    
    // Document frequency (how many documents contain this term)
    uniqueTerms.forEach(term => {
      termDocFreq.set(term, (termDocFreq.get(term) || 0) + 1);
    });
    
    // Term frequency in document
    const termFreq = new Map();
    terms.forEach(term => {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
    });
    
    docTermFreq.set(doc.id, termFreq);
  });
  
  return { termDocFreq, docTermFreq };
}

/**
 * Initialize database with schema
 */
function initializeDatabase(dbPath) {
  console.log('\n[1/6] Initializing database...');
  
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  
  const db = new Database(dbPath);
  
  db.exec(`
    CREATE TABLE knowledge_bases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      doc_count INTEGER DEFAULT 0
    );
    
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      kb_id TEXT NOT NULL,
      title TEXT NOT NULL,
      source_file TEXT NOT NULL,
      category TEXT,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      word_count INTEGER NOT NULL,
      FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id)
    );
    
    CREATE TABLE embeddings (
      doc_id TEXT PRIMARY KEY,
      embedding BLOB NOT NULL,
      FOREIGN KEY (doc_id) REFERENCES documents(id)
    );
    
    CREATE TABLE bm25_index (
      kb_id TEXT NOT NULL,
      term TEXT NOT NULL,
      doc_frequencies TEXT NOT NULL,
      PRIMARY KEY (kb_id, term)
    );
    
    CREATE TABLE metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    
    CREATE INDEX idx_documents_kb ON documents(kb_id);
    CREATE INDEX idx_documents_title ON documents(title);
    CREATE INDEX idx_bm25_kb ON bm25_index(kb_id);
  `);
  
  // Insert knowledge base
  db.prepare(`
    INSERT INTO knowledge_bases (id, name, description, doc_count)
    VALUES (?, ?, ?, ?)
  `).run(
    'critical-priority',
    'Critical Priority Survival Skills',
    'Essential survival manuals: food preservation, wilderness survival, first aid, tactical skills, and food production',
    DOCUMENTS.length
  );
  
  // Insert metadata
  const metadataStmt = db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)');
  metadataStmt.run('embedding_model', CONFIG.embeddingModel);
  metadataStmt.run('chunk_size', CONFIG.chunkSize.toString());
  metadataStmt.run('chunk_overlap', CONFIG.chunkOverlap.toString());
  metadataStmt.run('created_at', new Date().toISOString());
  
  console.log('✓ Database initialized');
  return db;
}

/**
 * Load and process documents
 */
function loadAndProcessDocuments() {
  console.log('\n[2/6] Loading and processing documents...');
  
  const processedDocs = [];
  let totalChunks = 0;
  
  for (const doc of DOCUMENTS) {
    const filePath = path.join(CONFIG.sourceDir, doc.file);
    console.log(`  Processing: ${doc.title}...`);
    
    const rawText = fs.readFileSync(filePath, 'utf-8');
    const cleanedText = cleanText(rawText);
    const sections = extractSections(cleanedText, doc.title);
    
    let chunkIndex = 0;
    
    for (const section of sections) {
      const chunks = chunkText(section.content, section.title);
      
      for (const chunk of chunks) {
        const docChunk = {
          id: `${doc.id}-chunk-${chunkIndex}`,
          kb_id: 'critical-priority',
          title: doc.title,
          section: section.title,
          source_file: doc.file,
          category: doc.category,
          chunk_index: chunkIndex,
          content: chunk,
          word_count: tokenize(chunk).length
        };
        
        processedDocs.push(docChunk);
        chunkIndex++;
      }
    }
    
    console.log(`    ✓ Created ${chunkIndex} chunks`);
    totalChunks += chunkIndex;
  }
  
  console.log(`✓ Processed ${DOCUMENTS.length} documents into ${totalChunks} chunks`);
  return processedDocs;
}

/**
 * Generate embeddings using Transformers.js
 */
async function generateEmbeddings(documents) {
  console.log('\n[3/6] Generating embeddings...');
  console.log('  Loading embedding model (this may take a moment)...');
  
  const { pipeline } = await import('@xenova/transformers');
  const embedder = await pipeline('feature-extraction', CONFIG.embeddingModel);
  
  console.log('  ✓ Model loaded');
  console.log('  Generating embeddings for chunks...');
  
  const embeddings = [];
  const batchSize = 32;
  
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, Math.min(i + batchSize, documents.length));
    const texts = batch.map(doc => doc.content);
    
    const output = await embedder(texts, { pooling: 'mean', normalize: true });
    
    for (let j = 0; j < batch.length; j++) {
      const embedding = Array.from(output[j].data);
      embeddings.push({
        doc_id: batch[j].id,
        embedding: embedding
      });
    }
    
    const progress = Math.min(i + batchSize, documents.length);
    const percent = ((progress / documents.length) * 100).toFixed(1);
    process.stdout.write(`\r  Progress: ${progress}/${documents.length} (${percent}%)`);
  }
  
  console.log('\n✓ Generated embeddings');
  return embeddings;
}

/**
 * Build BM25 index
 */
function buildBM25Index(documents) {
  console.log('\n[4/6] Building BM25 index...');
  
  const { termDocFreq, docTermFreq } = calculateBM25Index(documents);
  
  const indexData = [];
  termDocFreq.forEach((docFreq, term) => {
    const docList = [];
    
    documents.forEach(doc => {
      const termFreq = docTermFreq.get(doc.id)?.get(term) || 0;
      if (termFreq > 0) {
        docList.push({ doc_id: doc.id, freq: termFreq });
      }
    });
    
    indexData.push({
      kb_id: 'critical-priority',
      term: term,
      doc_frequencies: JSON.stringify(docList)
    });
  });
  
  console.log(`✓ Built index with ${indexData.length} terms`);
  return indexData;
}

/**
 * Save to database
 */
function saveToDatabase(db, documents, embeddings, bm25Index) {
  console.log('\n[5/6] Saving to database...');
  
  const docStmt = db.prepare(`
    INSERT INTO documents (id, kb_id, title, source_file, category, chunk_index, content, word_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const embStmt = db.prepare(`
    INSERT INTO embeddings (doc_id, embedding)
    VALUES (?, ?)
  `);
  
  const bm25Stmt = db.prepare(`
    INSERT INTO bm25_index (kb_id, term, doc_frequencies)
    VALUES (?, ?, ?)
  `);
  
  db.transaction(() => {
    // Save documents
    for (const doc of documents) {
      docStmt.run(
        doc.id,
        doc.kb_id,
        doc.title,
        doc.source_file,
        doc.category,
        doc.chunk_index,
        doc.content,
        doc.word_count
      );
    }
    
    // Save embeddings
    for (const emb of embeddings) {
      const buffer = Buffer.from(new Float32Array(emb.embedding).buffer);
      embStmt.run(emb.doc_id, buffer);
    }
    
    // Save BM25 index
    for (const item of bm25Index) {
      bm25Stmt.run(item.kb_id, item.term, item.doc_frequencies);
    }
  })();
  
  console.log(`✓ Saved ${documents.length} documents, ${embeddings.length} embeddings, ${bm25Index.length} index terms`);
}

/**
 * Display statistics
 */
function displayStatistics(db) {
  console.log('\n[6/6] Database statistics:');
  
  const stats = {
    documents: db.prepare('SELECT COUNT(*) as count FROM documents').get().count,
    embeddings: db.prepare('SELECT COUNT(*) as count FROM embeddings').get().count,
    indexTerms: db.prepare('SELECT COUNT(*) as count FROM bm25_index').get().count,
    avgChunkSize: db.prepare('SELECT AVG(word_count) as avg FROM documents').get().avg,
  };
  
  const dbSize = fs.statSync(db.name).size;
  const dbSizeMB = (dbSize / 1024 / 1024).toFixed(2);
  
  console.log(`  Documents: ${stats.documents}`);
  console.log(`  Embeddings: ${stats.embeddings}`);
  console.log(`  Index terms: ${stats.indexTerms}`);
  console.log(`  Avg chunk size: ${Math.round(stats.avgChunkSize)} tokens`);
  console.log(`  Database size: ${dbSizeMB} MB`);
  console.log(`  Location: ${db.name}`);
}

/**
 * Main execution
 */
async function main() {
  try {
    const dbPath = path.join(CONFIG.outputDir, CONFIG.dbFileName);
    
    // Initialize database
    const db = initializeDatabase(dbPath);
    
    // Load and process documents
    const documents = loadAndProcessDocuments();
    
    // Generate embeddings
    const embeddings = await generateEmbeddings(documents);
    
    // Build BM25 index
    const bm25Index = buildBM25Index(documents);
    
    // Save to database
    saveToDatabase(db, documents, embeddings, bm25Index);
    
    // Display statistics
    displayStatistics(db);
    
    db.close();
    
    console.log('\n========================================');
    console.log('✓ Knowledge base created successfully!');
    console.log('========================================\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { cleanText, tokenize, chunkText };


