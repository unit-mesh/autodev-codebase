import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { exec } from 'child_process';
import type { CodeIndexManager } from '../../code-index/manager';
import type { VectorStoreSearchResult } from '../../code-index/interfaces';

interface SearchFilter {
  fileTypes: string[];
  minSimilarity: number;
  pathPattern: string;
}

interface SavedSearch {
  id: string;
  query: string;
  timestamp: Date;
  resultCount: number;
}

interface SearchInterfaceProps {
  codeIndexManager: CodeIndexManager;
  onLog: (message: string) => void;
}

export const SearchInterface: React.FC<SearchInterfaceProps> = ({
  codeIndexManager,
  onLog
}) => {
  console.log('SearchInterface received codeIndexManager:', {
    exists: !!codeIndexManager,
    type: typeof codeIndexManager,
    isInitialized: codeIndexManager?.isInitialized,
    isFeatureEnabled: codeIndexManager?.isFeatureEnabled,
    state: codeIndexManager?.state
  });
  
  if (!codeIndexManager) {
    return (
      <Box flexDirection="column">
        <Text color="red">SearchInterface: codeIndexManager 未初始化</Text>
        <Text color="gray">接收到的 codeIndexManager: {String(codeIndexManager)}</Text>
      </Box>
    );
  }
  
  if (!codeIndexManager.isInitialized) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">SearchInterface: CodeIndexManager 存在但未初始化</Text>
        <Text color="gray">isInitialized: {String(codeIndexManager.isInitialized)}</Text>
        <Text color="gray">isFeatureEnabled: {String(codeIndexManager.isFeatureEnabled)}</Text>
        <Text color="gray">state: {codeIndexManager.state}</Text>
      </Box>
    );
  }
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VectorStoreSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // New state for enhanced features
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [filters, setFilters] = useState<SearchFilter>({
    fileTypes: [],
    minSimilarity: 0.1,
    pathPattern: ''
  });

  const searchStatsRef = useRef({
    totalSearches: 0,
    avgResponseTime: 0,
    indexSize: 0
  });

  useInput(async (input, key) => {
    // console.log('input:', typeof input,input, 'key:', key);
    // Handle special modes first
    if (showHistory) {
      if (key.escape) {
        setShowHistory(false);
      } else if (key.return && searchHistory.length > 0) {
        const selectedHistory = searchHistory[selectedIndex] || searchHistory[0];
        setQuery(selectedHistory);
        setShowHistory(false);
      } else if (key.upArrow && searchHistory.length > 0) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow && searchHistory.length > 0) {
        setSelectedIndex(prev => Math.min(searchHistory.length - 1, prev + 1));
      }
      return;
    }

    if (showFilters) {
      if (key.escape) {
        setShowFilters(false);
      }
      return;
    }

    // Handle backspace first to fix deletion issue
    if (key.backspace || key.delete) {
      setQuery(prev => {
        const newQuery = prev.slice(0, -1);
        if (newQuery.length > 0) {
          generateSuggestions(newQuery);
        } else {
          setShowSuggestions(false);
        }
        return newQuery;
      });
      setSelectedIndex(0);
      return;
    }

    // Main search interface controls
    if (key.return && query.trim()) {
      await performSearch();
    } else if (key.upArrow && results.length > 0 && !showSuggestions) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow && results.length > 0 && !showSuggestions) {
      setSelectedIndex(prev => Math.min(results.length - 1, prev + 1));
    } else if (input === ' ' && results.length > 0) {
      // Space to expand/collapse result details
      const newExpanded = new Set(expandedResults);
      if (newExpanded.has(selectedIndex)) {
        newExpanded.delete(selectedIndex);
      } else {
        newExpanded.add(selectedIndex);
      }
      setExpandedResults(newExpanded);
    } else if (input === 's' && key.ctrl) {
      // Ctrl+S to save current search
      await saveCurrentSearch();
    } else if (input === 'h' && key.ctrl) {
      // Ctrl+H to show search history
      setShowHistory(true);
      setSelectedIndex(0);
    } else if (input === 'f' && key.ctrl) {
      // Ctrl+F to show filters
      setShowFilters(true);
    } else if (input === 'o' && key.ctrl && results.length > 0) {
      // Ctrl+O to open in external editor
      await openInExternalEditor();
    } else if (input && input.length === 1 && !key.ctrl && !key.meta && !key.escape) {
      // Only handle single character input to avoid issues with special keys
      const newQuery = query + input;
      setQuery(newQuery);
      setSelectedIndex(0);

      // Generate suggestions as user types
      if (newQuery.length > 2) {
        generateSuggestions(newQuery);
      } else {
        setShowSuggestions(false);
      }
    }
  });

  const performSearch = async () => {
    if (!codeIndexManager || !query.trim()) return;

    const startTime = Date.now();
    setShowSuggestions(false);
    try {
      const searchResults = await codeIndexManager.searchIndex(query.trim(), 20);

      // Apply filters
      let filteredResults = searchResults;
      if (filters.minSimilarity > 0.1) {
        filteredResults = filteredResults.filter(r => r.score >= filters.minSimilarity);
      }
      if (filters.fileTypes.length > 0) {
        filteredResults = filteredResults.filter(r => {
          const filePath = r.payload?.filePath || '';
          return filters.fileTypes.some(type => filePath.endsWith(type));
        });
      }
      if (filters.pathPattern) {
        const pattern = new RegExp(filters.pathPattern, 'i');
        filteredResults = filteredResults.filter(r =>
          pattern.test(r.payload?.filePath || '')
        );
      }

      setResults(filteredResults);
      setSelectedIndex(0);
      setExpandedResults(new Set());

      // Update search history
      if (!searchHistory.includes(query.trim())) {
        setSearchHistory(prev => [query.trim(), ...prev.slice(0, 19)]);
      }

      // Update search stats
      const responseTime = Date.now() - startTime;
      searchStatsRef.current.totalSearches++;
      searchStatsRef.current.avgResponseTime =
        (searchStatsRef.current.avgResponseTime + responseTime) / 2;

      onLog(`✅ Found ${filteredResults.length} results in ${responseTime}ms`);
    } catch (error) {
      onLog(`❌ Search error: ${error}`);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const generateSuggestions = (currentQuery: string) => {
    if (!searchHistory.length) return;

    const suggestions = searchHistory
      .filter(hist => hist.toLowerCase().includes(currentQuery.toLowerCase()))
      .slice(0, 5);

    setSuggestions(suggestions);
    setShowSuggestions(suggestions.length > 0);
  };

  const saveCurrentSearch = async () => {
    if (!query.trim() || results.length === 0) return;

    const savedSearch: SavedSearch = {
      id: Date.now().toString(),
      query: query.trim(),
      timestamp: new Date(),
      resultCount: results.length
    };

    setSavedSearches(prev => [savedSearch, ...prev.slice(0, 9)]);
    onLog(`💾 Saved search: "${query}" (${results.length} results)`);
  };

  const openInExternalEditor = async () => {
    if (results.length === 0 || selectedIndex >= results.length) return;

    const selectedResult = results[selectedIndex];
    const filePath = selectedResult.payload?.filePath;
    const lineNumber = selectedResult.payload?.startLine;

    if (!filePath) {
      onLog(`❌ No file path available for selected result`);
      return;
    }

    try {
      // Try to open with VS Code first, then fallback to system default
      const commands = [
        `code -g "${filePath}:${lineNumber || 1}"`,
        `open "${filePath}"`,
        `xdg-open "${filePath}"`
      ];

      for (const cmd of commands) {
        try {
          exec(cmd, (error) => {
            if (!error) {
              onLog(`📝 Opened ${filePath}:${lineNumber || 1} in external editor`);
            }
          });
          break;
        } catch (e) {
          continue;
        }
      }
    } catch (error) {
      onLog(`❌ Failed to open external editor: ${error}`);
    }
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // Search History Modal
  if (showHistory) {
    return (
      <Box flexDirection="column">
        <Text bold color="green">📜 Search History</Text>
        <Box>
          <Text color="gray">Press Enter to select • Escape to cancel</Text>
        </Box>

        {searchHistory.length === 0 ? (
          <Box >
            <Text color="yellow">No search history yet</Text>
          </Box>
        ) : (
          <Box  flexDirection="column">
            {searchHistory.slice(0, 10).map((hist, index) => (
              <Text
                key={index}
                color={index === selectedIndex ? 'white' : 'gray'}
                backgroundColor={index === selectedIndex ? 'blue' : undefined}
              >
                {index + 1}. {hist}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  // Filters Panel
  if (showFilters) {
    return (
      <Box flexDirection="column">
        <Text bold color="green">🔧 Search Filters</Text>
        <Box >
          <Text color="gray">Press Escape to close</Text>
        </Box>

        <Box  flexDirection="column">
          <Text>Min Similarity: {filters.minSimilarity.toFixed(2)}</Text>
          <Text>File Types: {filters.fileTypes.join(', ') || 'All'}</Text>
          <Text>Path Pattern: {filters.pathPattern || 'None'}</Text>
        </Box>

        <Box >
          <Text color="yellow">Filter editing coming soon...</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color="green">🔍 Search Playground</Text>
        <Text color="gray">
          Searches: {searchStatsRef.current.totalSearches} |
          Avg: {searchStatsRef.current.avgResponseTime.toFixed(0)}ms
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">Query: </Text>
        <Text color="white" backgroundColor={query ? 'blue' : undefined}>
          {query || 'Type to search...'}
        </Text>
        {isSearching && <Text color="yellow"> [Searching...]</Text>}
      </Box>

      {/* Search suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <Box  flexDirection="column">
          <Text color="gray">Suggestions:</Text>
          {suggestions.map((suggestion, index) => (
            <Text key={index} color="cyan">• {suggestion}</Text>
          ))}
        </Box>
      )}

      <Box >
        <Text color="gray">
          Enter: search • ↑↓: navigate • Space: expand • Ctrl+H: history • Ctrl+F: filters • Ctrl+S: save • Ctrl+O: open
        </Text>
      </Box>

      {/* Active filters indicator */}
      {(filters.fileTypes.length > 0 || filters.minSimilarity > 0.1 || filters.pathPattern) && (
        <Box >
          <Text color="yellow">
            🔧 Filters: {filters.fileTypes.join(',')}
            {filters.minSimilarity > 0.1 && ` sim>${filters.minSimilarity}`}
            {filters.pathPattern && ` path:${filters.pathPattern}`}
          </Text>
        </Box>
      )}

      {/* Saved searches */}
      {savedSearches.length > 0 && (
        <Box >
          <Text color="gray">
            💾 Saved: {savedSearches.slice(0, 3).map(s => s.query).join(', ')}
            {savedSearches.length > 3 && '...'}
          </Text>
        </Box>
      )}

      {results.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Results ({results.length}):</Text>

          {results.slice(0, 10).map((result, index) => (
            <Box
              key={index}

              paddingX={1}
              borderStyle={index === selectedIndex ? 'single' : undefined}
              borderColor={index === selectedIndex ? 'blue' : undefined}
            >
              <Box flexDirection="column">
                <Text
                  color={index === selectedIndex ? 'white' : 'cyan'}
                  backgroundColor={index === selectedIndex ? 'blue' : undefined}
                >
                  {index + 1}. {truncateText(result.payload?.filePath || 'Unknown file', 50)}
                  {expandedResults.has(index) ? ' 📖' : ' 📄'}
                </Text>
                <Text color={index === selectedIndex ? 'white' : 'gray'}>
                  Score: {result.score.toFixed(3)} | Lines: {result.payload?.startLine}-{result.payload?.endLine}
                </Text>

                {expandedResults.has(index) ? (
                  <Box flexDirection="column"  paddingLeft={2}>
                    <Text color="yellow">Full Content:</Text>
                    <Text color={index === selectedIndex ? 'white' : 'gray'}>
                      {result.payload?.codeChunk || 'No content available'}
                    </Text>
                  </Box>
                ) : (
                  <Text color={index === selectedIndex ? 'white' : 'gray'}>
                    {truncateText(result.payload?.codeChunk || '', 80)}
                  </Text>
                )}
              </Box>
            </Box>
          ))}

          {results.length > 10 && (
            <Box >
              <Text color="gray">
                ... and {results.length - 10} more results
              </Text>
            </Box>
          )}
        </Box>
      )}

      {results.length === 0 && query && !isSearching && (
        <Box marginTop={1}>
          <Text color="yellow">No results found for "{query}"</Text>
        </Box>
      )}
    </Box>
  );
};
