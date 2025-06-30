import { readFile } from "fs/promises"
import { createHash } from "crypto"
import * as path from "path"
import * as treeSitter from "web-tree-sitter"
import { LanguageParser, loadRequiredLanguageParsers } from "../../tree-sitter/languageParser"
import { ICodeParser, CodeBlock, ParentContainer } from "../interfaces"
import { scannerExtensions } from "../shared/supported-extensions"
import { MAX_BLOCK_CHARS, MIN_BLOCK_CHARS, MIN_CHUNK_REMAINDER_CHARS, MAX_CHARS_TOLERANCE_FACTOR } from "../constants"

/**
 * Implementation of the code parser interface
 */
export class CodeParser implements ICodeParser {
	private loadedParsers: LanguageParser = {}
	private pendingLoads: Map<string, Promise<LanguageParser>> = new Map()
	// Markdown files are excluded because the current parser logic cannot effectively handle
	// potentially large Markdown sections without a tree-sitter-like child node structure for chunking

	/**
	 * Parses a code file into code blocks
	 * @param filePath Path to the file to parse
	 * @param options Optional parsing options
	 * @returns Promise resolving to array of code blocks
	 */
	async parseFile(
		filePath: string,
		options?: {
			content?: string
			fileHash?: string
		},
	): Promise<CodeBlock[]> {
		// Get file extension
		const ext = path.extname(filePath).toLowerCase()

		// Skip if not a supported language
		if (!this.isSupportedLanguage(ext)) {
			return []
		}

		// Get file content
		let content: string
		let fileHash: string

		if (options?.content) {
			content = options.content
			fileHash = options.fileHash || this.createFileHash(content)
		} else {
			try {
				content = await readFile(filePath, "utf8")
				fileHash = this.createFileHash(content)
			} catch (error) {
				console.error(`Error reading file ${filePath}:`, error)
				return []
			}
		}

		// Parse the file
		return this.parseContent(filePath, content, fileHash)
	}

	/**
	 * Checks if a language is supported
	 * @param extension File extension
	 * @returns Boolean indicating if the language is supported
	 */
	private isSupportedLanguage(extension: string): boolean {
		return scannerExtensions.includes(extension)
	}

	/**
	 * Creates a hash for a file
	 * @param content File content
	 * @returns Hash string
	 */
	private createFileHash(content: string): string {
		return createHash("sha256").update(content).digest("hex")
	}

	/**
	 * Parses file content into code blocks
	 * @param filePath Path to the file
	 * @param content File content
	 * @param fileHash File hash
	 * @returns Array of code blocks
	 */
	private async parseContent(filePath: string, content: string, fileHash: string): Promise<CodeBlock[]> {
		const ext = path.extname(filePath).slice(1).toLowerCase()
		const seenSegmentHashes = new Set<string>()

		// Check if we already have the parser loaded
		if (!this.loadedParsers[ext]) {
			const pendingLoad = this.pendingLoads.get(ext)
			if (pendingLoad) {
				try {
					await pendingLoad
				} catch (error) {
					console.error(`Error in pending parser load for ${filePath}:`, error)
					return []
				}
			} else {
				const loadPromise = loadRequiredLanguageParsers([filePath])
				this.pendingLoads.set(ext, loadPromise)
				try {
					const newParsers = await loadPromise
					if (newParsers) {
						this.loadedParsers = { ...this.loadedParsers, ...newParsers }
					}
				} catch (error) {
					console.error(`Error loading language parser for ${filePath}:`, error)
					return []
				} finally {
					this.pendingLoads.delete(ext)
				}
			}
		}

		const language = this.loadedParsers[ext]
		if (!language) {
			console.warn(`No parser available for file extension: ${ext}`)
			return []
		}

		const tree = language.parser.parse(content)
		// We don't need to get the query string from languageQueries since it's already loaded
		// in the language object
		const captures = language.query.captures(tree.rootNode)
		// Check if captures are empty
		if (!captures || captures.length === 0) {
			if (content.length >= MIN_BLOCK_CHARS) {
				// Perform fallback chunking if content is large enough
				const blocks = this._performFallbackChunking(filePath, content, fileHash, seenSegmentHashes)
				return blocks
			} else {
				// Return empty if content is too small for fallback
				return []
			}
		}

		const results: CodeBlock[] = []

		// Process captures if not empty - build a map to track node identifiers
		const nodeIdentifierMap = new Map<treeSitter.SyntaxNode, string>()
		
		// Extract identifiers from captures
		for (const capture of captures) {
			if (capture.name === 'name' || capture.name === 'property.name.definition') {
				// Find the corresponding definition node for this name
				const definitionCapture = captures.find(c => 
					c.name.includes('definition') && 
					c.node.startPosition.row <= capture.node.startPosition.row &&
					c.node.endPosition.row >= capture.node.endPosition.row
				)
				if (definitionCapture) {
					// For JSON properties, remove quotes from the identifier
					let identifier = capture.node.text
					if (capture.name === 'property.name.definition' && identifier.startsWith('"') && identifier.endsWith('"')) {
						identifier = identifier.slice(1, -1)
					}
					nodeIdentifierMap.set(definitionCapture.node, identifier)
				}
			}
		}

		const queue: treeSitter.SyntaxNode[] = captures
			.filter((capture: any) => capture.name.includes('definition'))
			.map((capture: any) => capture.node)

		while (queue.length > 0) {
			const currentNode = queue.shift()!
			// const lineSpan = currentNode.endPosition.row - currentNode.startPosition.row + 1 // Removed as per lint error

			// Check if the node meets the minimum character requirement
			if (currentNode.text && currentNode.text.length >= MIN_BLOCK_CHARS) {
				// If it also exceeds the maximum character limit, try to break it down
				if (currentNode.text.length > MAX_BLOCK_CHARS * MAX_CHARS_TOLERANCE_FACTOR) {
					if (currentNode.children && currentNode.children.length > 0) {
						// If it has children, process them instead
						queue.push(...currentNode.children)
					} else {
						// If it's a leaf node, chunk it (passing MIN_BLOCK_CHARS as per Task 1 Step 5)
						// Note: _chunkLeafNodeByLines logic might need further adjustment later
						const chunkedBlocks = this._chunkLeafNodeByLines(
							currentNode,
							filePath,
							fileHash,
							seenSegmentHashes,
						)
						results.push(...chunkedBlocks)
					}
				} else {
					// Node meets min chars and is within max chars, create a block
					const identifier = nodeIdentifierMap.get(currentNode) ||
						currentNode.childForFieldName("name")?.text ||
						currentNode.children?.find((c) => c.type === "identifier")?.text ||
						null
					const type = currentNode.type
					const start_line = currentNode.startPosition.row + 1
					const end_line = currentNode.endPosition.row + 1
					const content = currentNode.text
					const segmentHash = createHash("sha256")
						.update(`${filePath}-${start_line}-${end_line}-${content}`)
						.digest("hex")

					if (!seenSegmentHashes.has(segmentHash)) {
						seenSegmentHashes.add(segmentHash)
						
						// Build parent chain and hierarchy display
						const parentChain = this.buildParentChain(currentNode, nodeIdentifierMap)
						const hierarchyDisplay = this.buildHierarchyDisplay(parentChain, identifier, type)
						
						results.push({
							file_path: filePath,
							identifier,
							type,
							start_line,
							end_line,
							content,
							segmentHash,
							fileHash,
							chunkSource: 'tree-sitter',
							parentChain,
							hierarchyDisplay,
						})
					}
				}
			}
			// Nodes smaller than MIN_BLOCK_CHARS are ignored
		}

		return this.deduplicateBlocks(results)
	}

	/**
	 * Common helper function to chunk text by lines, avoiding tiny remainders.
	 */
	private _chunkTextByLines(
		lines: string[],
		filePath: string,
		fileHash: string,

		chunkType: string,
		seenSegmentHashes: Set<string>,
		baseStartLine: number = 1, // 1-based start line of the *first* line in the `lines` array
	): CodeBlock[] {
		const chunks: CodeBlock[] = []
		let currentChunkLines: string[] = []
		let currentChunkLength = 0
		let chunkStartLineIndex = 0 // 0-based index within the `lines` array
		const effectiveMaxChars = MAX_BLOCK_CHARS * MAX_CHARS_TOLERANCE_FACTOR

		const finalizeChunk = (endLineIndex: number) => {
			if (currentChunkLength >= MIN_BLOCK_CHARS && currentChunkLines.length > 0) {
				const chunkContent = currentChunkLines.join("\n")
				const startLine = baseStartLine + chunkStartLineIndex
				const endLine = baseStartLine + endLineIndex
				const segmentHash = createHash("sha256")
					.update(`${filePath}-${startLine}-${endLine}-${chunkContent}`)
					.digest("hex")

				if (!seenSegmentHashes.has(segmentHash)) {
					seenSegmentHashes.add(segmentHash)
					chunks.push({
						file_path: filePath,
						identifier: null,
						type: chunkType,
						start_line: startLine,
						end_line: endLine,
						content: chunkContent,
						segmentHash,
						fileHash,
						chunkSource: 'fallback',
						parentChain: [], // No parent chain for fallback chunks
						hierarchyDisplay: null,
					})
				}
			}
			currentChunkLines = []
			currentChunkLength = 0
			chunkStartLineIndex = endLineIndex + 1
		}

		const createSegmentBlock = (segment: string, originalLineNumber: number, startCharIndex: number) => {
			const segmentHash = createHash("sha256")
				.update(`${filePath}-${originalLineNumber}-${originalLineNumber}-${startCharIndex}-${segment}`)
				.digest("hex")

			if (!seenSegmentHashes.has(segmentHash)) {
				seenSegmentHashes.add(segmentHash)
				chunks.push({
					file_path: filePath,
					identifier: null,
					type: `${chunkType}_segment`,
					start_line: originalLineNumber,
					end_line: originalLineNumber,
					content: segment,
					segmentHash,
					fileHash,
					chunkSource: 'line-segment',
					parentChain: [], // No parent chain for line segments
					hierarchyDisplay: null,
				})
			}
		}

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			const lineLength = line.length + (i < lines.length - 1 ? 1 : 0) // +1 for newline, except last line
			const originalLineNumber = baseStartLine + i

			// Handle oversized lines (longer than effectiveMaxChars)
			if (lineLength > effectiveMaxChars) {
				// Finalize any existing normal chunk before processing the oversized line
				if (currentChunkLines.length > 0) {
					finalizeChunk(i - 1)
				}

				// Split the oversized line into segments
				let remainingLineContent = line
				let currentSegmentStartChar = 0
				while (remainingLineContent.length > 0) {
					const segment = remainingLineContent.substring(0, MAX_BLOCK_CHARS)
					remainingLineContent = remainingLineContent.substring(MAX_BLOCK_CHARS)
					createSegmentBlock(segment, originalLineNumber, currentSegmentStartChar)
					currentSegmentStartChar += MAX_BLOCK_CHARS
				}
				continue
			}

			// Handle normally sized lines
			if (currentChunkLength > 0 && currentChunkLength + lineLength > effectiveMaxChars) {
				// Re-balancing Logic
				let splitIndex = i - 1
				let remainderLength = 0
				for (let j = i; j < lines.length; j++) {
					remainderLength += lines[j].length + (j < lines.length - 1 ? 1 : 0)
				}

				if (
					currentChunkLength >= MIN_BLOCK_CHARS &&
					remainderLength < MIN_CHUNK_REMAINDER_CHARS &&
					currentChunkLines.length > 1
				) {
					for (let k = i - 2; k >= chunkStartLineIndex; k--) {
						const potentialChunkLines = lines.slice(chunkStartLineIndex, k + 1)
						const potentialChunkLength = potentialChunkLines.join("\n").length + 1
						const potentialNextChunkLines = lines.slice(k + 1)
						const potentialNextChunkLength = potentialNextChunkLines.join("\n").length + 1

						if (
							potentialChunkLength >= MIN_BLOCK_CHARS &&
							potentialNextChunkLength >= MIN_CHUNK_REMAINDER_CHARS
						) {
							splitIndex = k
							break
						}
					}
				}

				finalizeChunk(splitIndex)

				if (i >= chunkStartLineIndex) {
					currentChunkLines.push(line)
					currentChunkLength += lineLength
				} else {
					i = chunkStartLineIndex - 1
					continue
				}
			} else {
				currentChunkLines.push(line)
				currentChunkLength += lineLength
			}
		}

		// Process the last remaining chunk
		if (currentChunkLines.length > 0) {
			finalizeChunk(lines.length - 1)
		}

		return chunks
	}

	private _performFallbackChunking(
		filePath: string,
		content: string,
		fileHash: string,
		seenSegmentHashes: Set<string>,
	): CodeBlock[] {
		const lines = content.split("\n")
		return this._chunkTextByLines(lines, filePath, fileHash, "fallback_chunk", seenSegmentHashes)
	}

	private _chunkLeafNodeByLines(
		node: treeSitter.SyntaxNode,
		filePath: string,
		fileHash: string,
		seenSegmentHashes: Set<string>,
	): CodeBlock[] {
		if (!node.text) {
			console.warn(`Node text is undefined for ${node.type} in ${filePath}`)
			return []
		}
		const lines = node.text.split("\n")
		const baseStartLine = node.startPosition.row + 1
		return this._chunkTextByLines(
			lines,
			filePath,
			fileHash,
			node.type, // Use the node's type
			seenSegmentHashes,
			baseStartLine,
		)
	}

	/**
	 * Removes blocks that are contained within other blocks to avoid duplication
	 */
	private deduplicateBlocks(blocks: CodeBlock[]): CodeBlock[] {
		const sourceOrder = ['tree-sitter', 'fallback', 'line-segment']
		blocks.sort((a, b) => 
			sourceOrder.indexOf(a.chunkSource) - sourceOrder.indexOf(b.chunkSource)
		)
		
		const result: CodeBlock[] = []
		for (const block of blocks) {
			const isDuplicate = result.some(existing => 
				this.isBlockContained(block, existing)
			)
			if (!isDuplicate) {
				result.push(block)
			}
		}
		return result
	}

	/**
	 * Builds the parent chain for a given tree-sitter node
	 */
	private buildParentChain(node: treeSitter.SyntaxNode, nodeIdentifierMap: Map<treeSitter.SyntaxNode, string>): ParentContainer[] {
		const parentChain: ParentContainer[] = []
		
		// Container node types that we want to track in the hierarchy
		const containerTypes = new Set([
			'class_declaration', 'class_definition',
			'interface_declaration', 'interface_definition',
			'namespace_declaration', 'namespace_definition',
			'module_declaration', 'module_definition',
			'function_declaration', 'function_definition', 'method_definition',
			'object_expression', 'object_pattern',
			'object', 'pair', // JSON objects and properties
			'program', 'source_file'
		])
		
		let currentNode = node.parent
		while (currentNode) {
			// Skip non-container nodes
			if (!containerTypes.has(currentNode.type)) {
				currentNode = currentNode.parent
				continue
			}
			
			// Skip program/source_file as they're too generic
			if (currentNode.type === 'program' || currentNode.type === 'source_file') {
				currentNode = currentNode.parent
				continue
			}
			
			// Try to get identifier from various sources
			let identifier = nodeIdentifierMap.get(currentNode) || null
			
			if (!identifier) {
				// Try to extract identifier from the node structure
				identifier = this.extractNodeIdentifier(currentNode)
			}
			
			// Only add to chain if we found a meaningful identifier
			if (identifier) {
				parentChain.unshift({ // Add to beginning to maintain correct order
					identifier: identifier,
					type: this.normalizeNodeType(currentNode.type)
				})
			}
			
			currentNode = currentNode.parent
		}
		
		return parentChain
	}
	
	/**
	 * Extracts identifier from a tree-sitter node using various strategies
	 */
	private extractNodeIdentifier(node: treeSitter.SyntaxNode): string | null {
		// Try field-based extraction first
		const nameField = node.childForFieldName("name")
		if (nameField) {
			let name = nameField.text
			// Remove quotes from JSON properties
			if (name.startsWith('"') && name.endsWith('"')) {
				name = name.slice(1, -1)
			}
			return name
		}
		
		// Try to find identifier child nodes
		const identifierChild = node.children?.find(child => 
			child.type === "identifier" || 
			child.type === "type_identifier" ||
			child.type === "property_identifier"
		)
		if (identifierChild) {
			let name = identifierChild.text
			// Remove quotes from JSON properties
			if (name.startsWith('"') && name.endsWith('"')) {
				name = name.slice(1, -1)
			}
			return name
		}
		
		// For JSON pairs, try to get the key
		if (node.type === 'pair' && node.children && node.children.length > 0) {
			const key = node.children[0]
			if (key) {
				let name = key.text
				// Remove quotes from JSON keys
				if (name.startsWith('"') && name.endsWith('"')) {
					name = name.slice(1, -1)
				}
				return name
			}
		}
		
		return null
	}
	
	/**
	 * Normalizes node types to more readable format
	 */
	private normalizeNodeType(nodeType: string): string {
		const typeMap: Record<string, string> = {
			'class_declaration': 'class',
			'class_definition': 'class',
			'interface_declaration': 'interface',
			'interface_definition': 'interface',
			'namespace_declaration': 'namespace',
			'namespace_definition': 'namespace',
			'module_declaration': 'module',
			'module_definition': 'module',
			'function_declaration': 'function',
			'function_definition': 'function',
			'method_definition': 'method',
			'object_expression': 'object',
			'object_pattern': 'object',
			'object': 'object',
			'pair': 'property'
		}
		
		return typeMap[nodeType] || nodeType
	}
	
	/**
	 * Builds hierarchy display string from parent chain
	 */
	private buildHierarchyDisplay(parentChain: ParentContainer[], currentIdentifier: string | null, currentType: string): string | null {
		const parts: string[] = []
		
		// Add parent parts
		for (const parent of parentChain) {
			parts.push(`${parent.type} ${parent.identifier}`)
		}
		
		// Add current node if it has an identifier
		if (currentIdentifier) {
			const normalizedCurrentType = this.normalizeNodeType(currentType)
			parts.push(`${normalizedCurrentType} ${currentIdentifier}`)
		}
		
		return parts.length > 0 ? parts.join(' > ') : null
	}

	/**
	 * Checks if block1 is contained within block2
	 */
	private isBlockContained(block1: CodeBlock, block2: CodeBlock): boolean {
		return block1.file_path === block2.file_path &&
			block1.start_line >= block2.start_line && 
			block1.end_line <= block2.end_line &&
			block2.content.includes(block1.content)
	}
}

// Export a singleton instance for convenience
export const codeParser = new CodeParser()
