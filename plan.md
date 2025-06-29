### Plan

1.  **`src/code-index/interfaces/vector-store.ts`**
    *   Add a new method `getAllFilePaths(): Promise<string[]>` to the `IVectorStore` interface. This will be used to fetch all unique file paths currently stored in the vector database.

2.  **`src/code-index/vector-store/qdrant-client.ts`**
    *   Implement the `getAllFilePaths` method in the `QdrantVectorStore` class.
    *   This implementation will use the Qdrant `scroll` API to efficiently retrieve all points from the collection.
    *   It will extract the `filePath` from the payload of each point and return a unique list of these paths.

3.  **`src/code-index/cache-manager.ts`**
    *   Add a new method `deleteHashes(filePaths: string[]): void` to the `CacheManager` class. This will allow for the bulk deletion of cache entries for stale files.

4.  **`src/code-index/manager.ts`**
    *   Create a new private method `reconcileIndex()` within the `CodeIndexManager` class.
    *   This method will be responsible for the core reconciliation logic:
        1.  Call the new `vectorStore.getAllFilePaths()` to get all indexed file paths.
        2.  Use the existing `DirectoryScanner` to get a list of all current files in the workspace.
        3.  Compare the two lists to identify stale file paths (present in Qdrant but not on disk).
        4.  If stale paths are found, call `vectorStore.deletePointsByMultipleFilePaths()` to remove them from Qdrant.
        5.  Simultaneously, call the new `cacheManager.deleteHashes()` to remove the stale entries from the local cache.
    *   Integrate the `reconcileIndex()` call into the `initialize` method of the `CodeIndexManager`. It should be called after the `CacheManager` and `ServiceFactory` are initialized but before the `Orchestrator` starts indexing. This ensures the index is clean before any new work begins.