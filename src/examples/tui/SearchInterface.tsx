import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface SearchInterfaceProps {
  codeIndexManager: any;
  onLog: (message: string) => void;
}

export const SearchInterface: React.FC<SearchInterfaceProps> = ({ 
  codeIndexManager, 
  onLog 
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput(async (input, key) => {
    if (key.return && query.trim()) {
      await performSearch();
    } else if (key.upArrow && results.length > 0) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow && results.length > 0) {
      setSelectedIndex(prev => Math.min(results.length - 1, prev + 1));
    } else if (key.backspace) {
      setQuery(prev => prev.slice(0, -1));
      setSelectedIndex(0);
    } else if (input && !key.ctrl && !key.meta) {
      setQuery(prev => prev + input);
      setSelectedIndex(0);
    }
  });

  const performSearch = async () => {
    if (!codeIndexManager || !query.trim()) return;

    setIsSearching(true);
    onLog(`🔍 Searching for: "${query}"`);

    try {
      const searchResults = await codeIndexManager.searchIndex(query.trim(), 10);
      setResults(searchResults);
      setSelectedIndex(0);
      onLog(`✅ Found ${searchResults.length} results for "${query}"`);
    } catch (error) {
      onLog(`❌ Search error: ${error}`);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <Box flexDirection="column">
      <Text bold color="green">🔍 Search Interface</Text>
      
      <Box marginTop={1}>
        <Text color="gray">Query: </Text>
        <Text color="white" backgroundColor={query ? 'blue' : undefined}>
          {query || 'Type to search...'}
        </Text>
        {isSearching && <Text color="yellow"> [Searching...]</Text>}
      </Box>
      
      <Box marginTop={1}>
        <Text color="gray">
          Press Enter to search • ↑↓ to navigate results
        </Text>
      </Box>

      {results.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Results ({results.length}):</Text>
          
          {results.slice(0, 8).map((result, index) => (
            <Box 
              key={index} 
              marginTop={1} 
              paddingX={1}
              backgroundColor={index === selectedIndex ? 'blue' : undefined}
            >
              <Box flexDirection="column">
                <Text color={index === selectedIndex ? 'white' : 'cyan'}>
                  {index + 1}. {truncateText(result.payload?.filePath || 'Unknown file', 40)}
                </Text>
                <Text color={index === selectedIndex ? 'white' : 'gray'}>
                  Score: {result.score.toFixed(3)} | Lines: {result.payload?.startLine}-{result.payload?.endLine}
                </Text>
                <Text color={index === selectedIndex ? 'white' : 'gray'}>
                  {truncateText(result.payload?.codeChunk || '', 60)}
                </Text>
              </Box>
            </Box>
          ))}
          
          {results.length > 8 && (
            <Text color="gray" marginTop={1}>
              ... and {results.length - 8} more results
            </Text>
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