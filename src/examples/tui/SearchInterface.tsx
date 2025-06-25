import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useInput} from 'ink';
import { exec } from 'child_process';
import type { CodeIndexManager } from '../../code-index/manager';
import type { VectorStoreSearchResult } from '../../code-index/interfaces';

interface SearchFilter {
  fileTypes: string[];
  minSimilarity: number;
  pathPattern: string;
}

interface SearchInterfaceProps {
  codeIndexManager: CodeIndexManager;
  dependencies?: any;
  onLog: (message: string) => void;
}

const itemsPerPageMap: Record<number, number> = {
  1: 5,   // 1列时每页6条
  2: 6,   // 2列时每页6条
  3: 9,   // 3列时每页9条
  4: 12,  // 4列时每页12条
};

export const SearchInterface: React.FC<SearchInterfaceProps> = ({
  codeIndexManager,
  dependencies,
  onLog
}) => {
  useEffect(() => {
    onLog(`SearchInterface received codeIndexManager: ${JSON.stringify({
      exists: !!codeIndexManager,
      type: typeof codeIndexManager,
      isInitialized: codeIndexManager?.isInitialized,
      isFeatureEnabled: codeIndexManager?.isFeatureEnabled,
      state: codeIndexManager?.state
    }, null, 2)}`);
    onLog(`SearchInterface received dependencies: ${JSON.stringify({
      exists: !!dependencies,
      type: typeof dependencies,
      hasWorkspace: !!dependencies?.workspace,
      workspaceType: typeof dependencies?.workspace,
      workspaceRootPath: dependencies?.workspace?.getRootPath?.()
    }, null, 2)}`);
  }, [codeIndexManager, dependencies]);

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
  const [showFilters, setShowFilters] = useState(false);
  const [filterMode, setFilterMode] = useState<'similarity' | 'fileTypes' | 'pathPattern'>('similarity');
  const [tempFilterValue, setTempFilterValue] = useState('');
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(0);
  const [columnsCount, setColumnsCount] = useState(2);
  const [itemsPerPage, setItemsPerPage] = useState(itemsPerPageMap[columnsCount]);
  const [filters, setFilters] = useState<SearchFilter>({
    fileTypes: [],
    minSimilarity: 0.1,
    pathPattern: ''
  });
  const [forceRefresh, setForceRefresh] = useState(0);

  const searchStatsRef = useRef({
    totalSearches: 0,
    avgResponseTime: 0,
    indexSize: 0
  });


  useInput(async (input, key) => {
    onLog(`Control key combo detected: ${JSON.stringify({
            input,
            inputLength: input?.length,
            inputCharCode: input ? input.charCodeAt(0) : null,
            key
          }, null, 2)}`);
    // Handle special modes first - with priority to prevent conflicts
    if (showFilters) {
      // In filter mode, we handle ALL input to prevent conflicts with parent App
      if (key.escape) {
        setShowFilters(false);
        setTempFilterValue('');
        // Re-apply filters to existing results if we have any
        if (results.length > 0 && query.trim()) {
          await performSearch();
       } 
        return;
      }

      // Handle filter mode navigation with up/down arrows
      if (key.upArrow) {
        const modes: Array<'similarity' | 'fileTypes' | 'pathPattern'> = ['similarity', 'fileTypes', 'pathPattern'];
        const currentIndex = modes.indexOf(filterMode);
        const nextIndex = currentIndex === 0 ? modes.length - 1 : currentIndex - 1;
        setFilterMode(modes[nextIndex]);
        setTempFilterValue('');
        return;
      }

      if (key.downArrow) {
        const modes: Array<'similarity' | 'fileTypes' | 'pathPattern'> = ['similarity', 'fileTypes', 'pathPattern'];
        const currentIndex = modes.indexOf(filterMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        setFilterMode(modes[nextIndex]);
        setTempFilterValue('');
        return;
      }

      // Handle filter input
      if (key.backspace || key.delete) {
        setTempFilterValue(prev => prev.slice(0, -1));
        return;
      }

      if (key.return) {
        // Apply the filter value
        if (filterMode === 'similarity') {
          const value = parseFloat(tempFilterValue);
          if (!isNaN(value) && value >= 0 && value <= 1) {
            setFilters(prev => ({ ...prev, minSimilarity: value }));
          }
        } else if (filterMode === 'fileTypes') {
          if (tempFilterValue.trim()) {
            const types = tempFilterValue.split(',').map(t => t.trim()).filter(t => t);
            setFilters(prev => ({ ...prev, fileTypes: types }));
          }
        } else if (filterMode === 'pathPattern') {
          setFilters(prev => ({ ...prev, pathPattern: tempFilterValue.trim() }));
        }
        setTempFilterValue('');
        return;
      }

      if (input === 'c' && key.ctrl) {
        // Clear current filter
        if (filterMode === 'similarity') {
          setFilters(prev => ({ ...prev, minSimilarity: 0.1 }));
        } else if (filterMode === 'fileTypes') {
          setFilters(prev => ({ ...prev, fileTypes: [] }));
        } else if (filterMode === 'pathPattern') {
          setFilters(prev => ({ ...prev, pathPattern: '' }));
        }
        setTempFilterValue('');
        // Re-apply filters to existing results if we have any
        if (results.length > 0 && query.trim()) {
          await performSearch();
        }
        return;
      }

      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setTempFilterValue(prev => prev + input);
      }
      return;
    }

    // Handle backspace first to fix deletion issue
    if (key.backspace || key.delete) {
      setQuery(prev => prev.slice(0, -1));
      setSelectedIndex(0);
      return;
    }

    // Main search interface controls
    if (key.return && query.trim()) {
      await performSearch();
    } else if (key.upArrow && results.length > 0) {
      setSelectedIndex(prev => {
        // Grid navigation: move up by columnsCount
        const newIndex = Math.max(0, prev - columnsCount);
        const newPage = Math.floor(newIndex / itemsPerPage);
        if (newPage !== currentPage) {
          setCurrentPage(newPage);
        }
        return newIndex;
      });
    } else if (key.downArrow && results.length > 0) {
      setSelectedIndex(prev => {
        // Grid navigation: move down by columnsCount
        const newIndex = Math.min(results.length - 1, prev + columnsCount);
        const newPage = Math.floor(newIndex / itemsPerPage);
        if (newPage !== currentPage) {
          setCurrentPage(newPage);
        }
        return newIndex;
      });
    } else if (key.leftArrow && results.length > 0) {
      // Grid navigation: move left by 1 (with wrapping)
      setSelectedIndex(prev => {
        const currentPageStart = currentPage * itemsPerPage;
        const currentPageEnd = Math.min(results.length - 1, (currentPage + 1) * itemsPerPage - 1);

        if (prev > currentPageStart) {
          // Move left within current page
          return prev - 1;
        } else if (currentPage > 0) {
          // Move to previous page, last item
          setCurrentPage(currentPage - 1);
          return Math.min(results.length - 1, (currentPage - 1 + 1) * itemsPerPage - 1);
        }
        return prev;
      });
    } else if (key.rightArrow && results.length > 0) {
      // Grid navigation: move right by 1 (with wrapping)
      setSelectedIndex(prev => {
        const currentPageEnd = Math.min(results.length - 1, (currentPage + 1) * itemsPerPage - 1);
        const totalPages = Math.ceil(results.length / itemsPerPage);

        if (prev < currentPageEnd) {
          // Move right within current page
          return prev + 1;
        } else if (currentPage < totalPages - 1) {
          // Move to next page, first item
          setCurrentPage(currentPage + 1);
          return (currentPage + 1) * itemsPerPage;
        }
        return prev;
      });
    } else if (key.pageUp && results.length > 0) {
      // Previous page
      if (currentPage > 0) {
        setCurrentPage(prev => prev - 1);
        setSelectedIndex(currentPage * itemsPerPage - itemsPerPage);
      }
    } else if (key.pageDown && results.length > 0) {
      // Next page
      const totalPages = Math.ceil(results.length / itemsPerPage);
      if (currentPage < totalPages - 1) {
        setCurrentPage(prev => prev + 1);
        setSelectedIndex((currentPage + 1) * itemsPerPage);
      }
    } else if (input === 't' && key.ctrl) {
      // Ctrl+T to expand/collapse result details
      const newExpanded = new Set(expandedResults);
      if (newExpanded.has(selectedIndex)) {
        newExpanded.delete(selectedIndex);
      } else {
        newExpanded.add(selectedIndex);
      }
      setExpandedResults(newExpanded);

      // Force re-render to ensure UI updates immediately
      setForceRefresh(prev => prev + 1);

    } else if (input === 'f' && key.ctrl) {
      // Ctrl+F to show filters
      setShowFilters(true);
      setFilterMode('similarity');
      setTempFilterValue('');
    } else if (input === 'o' && key.ctrl && results.length > 0) {
      // Ctrl+O to open in external editor
      await openInExternalEditor();
    } else if (input === 'y' && key.ctrl) {
      // Ctrl+y to increase columns in grid view
      setColumnsCount(prev => {
          const next = Math.min(4, prev + 1);
          setItemsPerPage(itemsPerPageMap[next] || 6);
          return next;
      });
      // clear other status
      setExpandedResults(new Set());
      setCurrentPage(0);
      // setForceRefresh(prev => prev + 1);
    } else if (input === 'u' && key.ctrl) {
      // Ctrl+u to decrease columns in grid view
      setColumnsCount(prev => {
          const next = Math.max(1, prev - 1);
          setItemsPerPage(itemsPerPageMap[next] || 6);
          return next;
      });
      // clear other status
      setExpandedResults(new Set());
      setCurrentPage(0);
      // setForceRefresh(prev => prev + 1);
    } else if (input && input.trim() && !key.ctrl && !key.meta && !key.escape && !key.return) {
      // Handle character input (including multi-byte characters like Chinese)
      // Remove length check to support Unicode characters that may have length > 1
      const newQuery = query + input;
      setQuery(newQuery);
      setSelectedIndex(0);
    }
  });

  const performSearch = async () => {
    if (!codeIndexManager || !query.trim()) return;

    const startTime = Date.now();
    setIsSearching(true);
    onLog(`🔍 Searching for: "${query}"`);

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
      setCurrentPage(0);
      setExpandedResults(new Set());

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

  const openInExternalEditor = async () => {
    if (results.length === 0 || selectedIndex >= results.length) return;

    const selectedResult = results[selectedIndex];
    const relativePath = selectedResult.payload?.filePath;
    const lineNumber = selectedResult.payload?.startLine;

    if (!relativePath) {
      onLog(`❌ No file path available for selected result`);
      return;
    }

    // Get workspace root path and construct full file path
    const workspaceRoot = dependencies?.workspace?.getRootPath();
    if (!workspaceRoot) {
      onLog(`❌ Workspace root path not available`);
      return;
    }

    const fullFilePath = `${workspaceRoot}/${relativePath}`;

    try {
      // Try to open with VS Code first, then fallback to system default
      const commands = [
        `code -g "${fullFilePath}:${lineNumber || 1}"`,
        `open "${fullFilePath}"`,
        `xdg-open "${fullFilePath}"`
      ];
      onLog(commands.join(' | '));
      for (const cmd of commands) {
        try {
          exec(cmd, (error) => {
            if (!error) {
              onLog(`📝 Opened ${fullFilePath}:${lineNumber || 1} in external editor`);
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

  const truncateToSingleLine = (text: string, maxLength: number) => {
    // Remove all line breaks and normalize whitespace
    const singleLine = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (singleLine.length <= maxLength) return singleLine;
    return singleLine.substring(0, maxLength) + '...';
  };

  // Filters Panel
  if (showFilters) {
    const getCurrentValue = () => {
      if (filterMode === 'similarity') {
        return tempFilterValue || filters.minSimilarity.toString();
      } else if (filterMode === 'fileTypes') {
        return tempFilterValue || filters.fileTypes.join(', ');
      } else if (filterMode === 'pathPattern') {
        return tempFilterValue || filters.pathPattern;
      }
      return '';
    };

    const getPlaceholder = () => {
      if (filterMode === 'similarity') {
        return '0.0-1.0 (e.g., 0.7)';
      } else if (filterMode === 'fileTypes') {
        return '.ts,.tsx,.js (comma separated)';
      } else if (filterMode === 'pathPattern') {
        return 'regex pattern (e.g., src/.*\\.ts)';
      }
      return '';
    };

    return (
      <Box flexDirection="column">
        <Text bold color="green">🔧 Search Filters</Text>
        <Box>
          <Text color="gray">↑↓: switch mode • Enter: apply • Ctrl+C: clear • Escape: close</Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text color="cyan">Current Filters:</Text>
          <Text color={filters.minSimilarity > 0.1 ? 'yellow' : 'gray'}>
            • Min Similarity: {filters.minSimilarity.toFixed(2)}
          </Text>
          <Text color={filters.fileTypes.length > 0 ? 'yellow' : 'gray'}>
            • File Types: {filters.fileTypes.join(', ') || 'All'}
          </Text>
          <Text color={filters.pathPattern ? 'yellow' : 'gray'}>
            • Path Pattern: {filters.pathPattern || 'None'}
          </Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text bold color="white">
            Editing: {filterMode === 'similarity' ? 'Min Similarity' :
                     filterMode === 'fileTypes' ? 'File Types' : 'Path Pattern'}
          </Text>

          <Box>
            <Text color="blue">Input: </Text>
            <Text
              color="black"
              backgroundColor="cyan"
            >
              {getCurrentValue() || getPlaceholder()}
            </Text>
          </Box>

          <Box marginTop={1}>
            <Text color="gray" dimColor>
              Examples: {getPlaceholder()}
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" key={`main-${forceRefresh}`}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color="green">🔍 Search Playground</Text>
        <Text color="gray">
          Searches: {searchStatsRef.current.totalSearches} |
          Avg: {searchStatsRef.current.avgResponseTime.toFixed(0)}ms |
          Refresh: {forceRefresh}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">Query: </Text>
        <Text color={query ? 'black' : 'gray'} backgroundColor={query ? 'cyan' : undefined}>
          {query || '[Type to search...]'}
        </Text>
        {isSearching && <Text color="yellow"> [Searching...]</Text>}
      </Box>

      <Box>
        <Text color="gray">
          Enter: search • ↑↓←→: navigate grid • PgUp/PgDn: pages • Ctrl+T: expand • Ctrl+F: filters • Ctrl+O: open • Ctrl+Y/U: columns
        </Text>
      </Box>


      {/* Active filters indicator */}
      {(filters.fileTypes.length > 0 || filters.minSimilarity > 0.1 || filters.pathPattern) && (
        <Box>
          <Text color="yellow">
            🔧 Filters: {filters.fileTypes.join(',')}
            {filters.minSimilarity > 0.1 && ` sim>${filters.minSimilarity}`}
            {filters.pathPattern && ` path:${filters.pathPattern}`}
          </Text>
        </Box>
      )}

      {results.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold>Results ({results.length}):</Text>
            <Box>
              <Text color="gray">
                {columnsCount} cols • Page {currentPage + 1}/{Math.ceil(results.length / itemsPerPage)}
              </Text>
            </Box>
          </Box>

          {/* Grid view */}
          <Box flexDirection="column" key={`grid-${forceRefresh}-${expandedResults.size}`}>
            {expandedResults.size > 0 ? (
              // 只显示展开的那一项
              Array.from(expandedResults).map(globalIndex => {
                const result = results[globalIndex];
                if (!result) return null;
                return (
                  <Box
                    key={`item-${globalIndex}-exp-${forceRefresh}`}
                    flexGrow={1}
                    paddingX={1}
                    borderStyle="single"
                    borderColor="cyan"
                  >
                    <Box flexDirection="column">
                      <Text color="black" backgroundColor="cyan">
                        {globalIndex + 1}. {result.payload?.filePath} {result.score.toFixed(2)} | L{result.payload?.startLine}-{result.payload?.endLine} 📖
                      </Text>
                      <Box flexDirection="column" paddingLeft={1} key={`content-${globalIndex}-${forceRefresh}`}>
                        <Text color="yellow">Full Content:</Text>
                        <Text>
                          {result.payload?.codeChunk || 'No content available'}
                        </Text>
                      </Box>
                    </Box>
                  </Box>
                );
              })
            ) : (
              // 正常网格视图
              Array.from({ length: Math.ceil(results.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage).length / columnsCount) }).map((_, rowIndex) => (
                <Box key={`row-${rowIndex}-${forceRefresh}`} flexDirection="row">
                  {Array.from({ length: columnsCount }).map((_, colIndex) => {
                    const itemIndex = rowIndex * columnsCount + colIndex;
                    const globalIndex = currentPage * itemsPerPage + itemIndex;
                    const result = results[globalIndex];

                    if (!result) return <Box key={`empty-${colIndex}-${forceRefresh}`} flexGrow={1} />;

                    return (
                      <Box
                        key={`item-${globalIndex}-col-${forceRefresh}`}
                        flexGrow={1}
                        paddingX={1}
                        marginRight={colIndex < columnsCount - 1 ? 1 : 0}
                        borderStyle={globalIndex === selectedIndex ? "double" : "single"}
                        borderColor={globalIndex === selectedIndex ? 'cyan' : 'white'}
                      >
                        <Box flexDirection="column">
                          <Text
                            color={globalIndex === selectedIndex ? 'black' : 'cyan'}
                            backgroundColor={globalIndex === selectedIndex ? 'cyan' : undefined}
                            bold={globalIndex === selectedIndex}
                          >
                            {globalIndex + 1}. {truncateText(result.payload?.filePath?.split('/').pop() || 'Unknown', 15)} {result.score.toFixed(2)} | L{result.payload?.startLine}-{result.payload?.endLine} 📄
                          </Text>
                          <Text
                            dimColor
                            key={`preview-${globalIndex}-${forceRefresh}`}
                          >
                            {truncateToSingleLine(result.payload?.codeChunk || '', 60)}
                          </Text>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              ))
            )}
          </Box>


          {results.length > itemsPerPage && (
            <Box marginTop={1}>
              <Text color="cyan">
                📄 Use ←→ or PgUp/PgDn to navigate pages
              </Text>
            </Box>
          )}
        </Box>
      )}

      {query && !isSearching && results.length === 0 && (
        <Box marginTop={1}>
          {searchStatsRef.current.totalSearches === 0 ? (
            <Text color="gray">Press Enter to search</Text>
          ) : (
            <Text color="yellow">No results found for "{query}"</Text>
          )}
        </Box>
      )}
      {!query && !isSearching && results.length === 0 && (
        <Box marginTop={2} flexDirection="column" alignItems="center">
          <Text color="gray">🔎 Please enter keywords and press Enter to search</Text>
        </Box>
      )}
    </Box>
  );
};
