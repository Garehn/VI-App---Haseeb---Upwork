# Reference Architecture Documentation

## Google AI Edge - Saved Documentation

This folder contains reference documentation from Google AI Edge for implementing on-device AI and RAG on Android.

---

## 📚 Documents Saved

### 1. **google-ai-edge-rag-android.html**
**Source:** https://ai.google.dev/edge/mediapipe/solutions/genai/rag/android  
**Downloaded:** November 13, 2024  
**License:** Creative Commons Attribution 4.0 License  
**Size:** 192 KB

**Content:**
- RAG pipeline implementation for Android
- Gecko embedder setup (on-device, 110M parameters)
- Gemini embedder setup (cloud-based)
- SQLite vector store usage
- Chunking strategies
- Retrieval and inference chains
- Sample application walkthrough

**Key Takeaways:**
- Uses `SqliteVectorStore(768)` for 768-dimensional embeddings
- Recommends Gemma-3 1B for LLM
- Gecko 110M for embeddings (float or quantized)
- Chunking is critical (not too large, not too small)
- RetrievalConfig with top K and relevance threshold

### 2. **google-ai-edge-llm-inference-android.html**
**Source:** https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference/android  
**Downloaded:** November 13, 2024  
**License:** Creative Commons Attribution 4.0 License

**Content:**
- LLM Inference API for Android
- Model loading and configuration
- Streaming responses
- GPU/CPU acceleration options
- Performance optimization

---

## 🔍 Relevance to Current Implementation

### What You're Already Doing Right:

✅ **SQLite for vector storage** - Google uses same approach  
✅ **Hybrid retrieval** - Your BM25 + semantic is even better than their semantic-only  
✅ **On-device LLM** - You use llama.rn, they use MediaPipe  
✅ **Chunking strategy** - You use 500 tokens, they use similar  
✅ **Streaming responses** - Both implementations stream tokens

### Potential Improvements from Google's Approach:

1. **Gecko Embedder** (110M)
   - More efficient than MiniLM-L6-v2 (384-dim)
   - On-device GPU acceleration
   - Multiple sequence lengths (256, 1024 tokens)

2. **RetrievalConfig**
   - Task type specification (Q&A vs summarization)
   - Adjustable relevance threshold
   - Top K results configuration

3. **Chain Pattern**
   - `RetrievalAndInferenceChain` combines components
   - Clean API for RAG pipeline orchestration

---

## 🎯 Differences: Your Implementation vs Google's

| Feature | Your Implementation | Google AI Edge |
|---------|---------------------|----------------|
| **LLM Engine** | llama.rn (llama.cpp) | MediaPipe GenAI |
| **Models** | Qwen, Phi-3 (GGUF) | Gemma-3 (TFLite) |
| **Embeddings** | MiniLM-L6-v2 (384-dim) | Gecko (768-dim) |
| **Retrieval** | Hybrid (BM25 + semantic) | Semantic only |
| **Vector DB** | SQLite (custom) | SqliteVectorStore (provided) |
| **Framework** | React Native | Native Android |
| **Streaming** | Custom implementation | Built-in API |

### Your Advantages:

✅ **Hybrid search** - More accurate than semantic-only  
✅ **GGUF models** - Wider model selection (Qwen, Phi, etc.)  
✅ **Cross-platform** - React Native works on iOS too  
✅ **Smaller embeddings** - 384-dim vs 768-dim (faster)

### Google's Advantages:

✅ **Native performance** - No React Native bridge  
✅ **GPU acceleration** - For embeddings  
✅ **Integrated SDK** - All components provided  
✅ **Official Google models** - Gemma optimized for mobile

---

## 📖 How to Use These References

### For Improving RAG Implementation:

1. **Check their chunking strategy** - Optimize your chunk sizes
2. **Review RetrievalConfig** - Add similar configuration options
3. **Study Gecko embedder** - Consider for future versions
4. **Analyze chain pattern** - Clean up your RAG pipeline code

### For Debugging:

1. **Compare vector store implementation** - Ensure SQL queries are optimal
2. **Review retrieval logic** - Verify similarity calculations
3. **Check embedding dimensions** - Ensure consistency

### For Future Enhancements:

1. **GPU acceleration** - Add option for embedding generation
2. **Task-specific retrieval** - Different configs for Q&A vs chat
3. **Multiple embedding models** - Let users choose
4. **Advanced chunking** - Smart splitting with overlap

---

## 🔗 Additional Resources

**Related Google AI Edge Documentation:**
- LLM Inference: Saved as `google-ai-edge-llm-inference-android.html`
- MediaPipe GenAI: https://ai.google.dev/edge/mediapipe/solutions/genai
- Gemma Models: https://ai.google.dev/gemma
- Gecko Embedder: https://github.com/google/geckoembedding

**Your Current Implementation:**
- RAGMobileApp: `/Users/jordanrogan/OfflineMobile/RAGMobileApp/`
- SurvivalRAG: `/Users/jordanrogan/OfflineMobile/SurvivalRAG/`

---

## 📝 Notes

**License Compliance:**
- Content licensed under CC BY 4.0
- Code samples licensed under Apache 2.0
- Saved for educational and reference purposes
- Source URL cited in this document

**Last Updated:** November 13, 2024

---

**These references can help optimize your RAG implementation and provide best practices from Google's official on-device AI team.**

