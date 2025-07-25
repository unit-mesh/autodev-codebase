/**
 * @fileoverview OPTIONAL INTEGRATION - CodebaseSearchTool
 * 
 * This file contains VSCode-specific integration code that relies on external dependencies
 * from the roo-code ecosystem. It is marked as optional for standalone codebase library usage.
 * 
 * Dependencies:
 * - VSCode API (vscode module)
 * - External Task system
 * - Utils from roo-code workspace utilities
 * 
 * For standalone usage, implement similar functionality using the abstract interfaces:
 * - IWorkspace for workspace path resolution
 * - IConfigProvider for configuration access
 * - CodeIndexManager with dependency injection pattern
 */

import * as vscode from "vscode"
import { CodeIndexManager } from "./code-index/manager"
import { VectorStoreSearchResult } from "./code-index/interfaces"

// TODO: Implement getWorkspacePath locally
function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
}

// TODO: Implement missing interfaces locally
interface Task {
  consecutiveMistakeCount: number
  providerRef: { deref: () => { context?: any } | undefined }
  ask: (type: string, message: string, partial?: any) => Promise<void>
  say: (type: string, message: string) => Promise<void>
  sayAndCreateMissingParamError: (toolName: string, paramName: string) => Promise<string>
}

interface AskApproval {
  (type: string, message: string): Promise<boolean>
}

interface HandleError {
  (toolName: string, error: Error): Promise<void>
}

interface PushToolResult {
  (result: string): void
}

interface RemoveClosingTag {
  (tag: string, content?: string): string | undefined
}

interface ToolUse {
  params: {
    query?: string
    path?: string
  }
  partial?: any
}

const formatResponse = {
  toolDenied: () => "Tool execution was denied by user"
}
import path from "path"

export async function codebaseSearchTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const toolName = "codebase_search"
	const workspacePath = getWorkspacePath()

	if (!workspacePath) {
		// This case should ideally not happen if Cline is initialized correctly
		await handleError(toolName, new Error("Could not determine workspace path."))
		return
	}

	// --- Parameter Extraction and Validation ---
	let query: string | undefined = block.params.query
	let directoryPrefix: string | undefined = block.params.path

	query = removeClosingTag("query", query)

	if (directoryPrefix) {
		directoryPrefix = removeClosingTag("path", directoryPrefix)
		if (directoryPrefix) {
			directoryPrefix = path.normalize(directoryPrefix)
		}
	}

	const sharedMessageProps = {
		tool: "codebaseSearch",
		query: query,
		path: directoryPrefix,
		isOutsideWorkspace: false,
	}

	if (block.partial) {
		await cline.ask("tool", JSON.stringify(sharedMessageProps), block.partial).catch(() => {})
		return
	}

	if (!query) {
		cline.consecutiveMistakeCount++
		pushToolResult(await cline.sayAndCreateMissingParamError(toolName, "query"))
		return
	}

	const didApprove = await askApproval("tool", JSON.stringify(sharedMessageProps))
	if (!didApprove) {
		pushToolResult(formatResponse.toolDenied())
		return
	}

	cline.consecutiveMistakeCount = 0

	// --- Core Logic ---
	try {
		const context = cline.providerRef.deref()?.context
		if (!context) {
			throw new Error("Extension context is not available.")
		}

		const manager = CodeIndexManager.getInstance(context)

		if (!manager) {
			throw new Error("CodeIndexManager is not available.")
		}

		if (!manager.isFeatureEnabled) {
			throw new Error("Code Indexing is disabled in the settings.")
		}
		if (!manager.isFeatureConfigured) {
			throw new Error("Code Indexing is not configured (Missing OpenAI Key or Qdrant URL).")
		}

		const searchResults: VectorStoreSearchResult[] = await manager.searchIndex(query, { limit: 10 })

		// 3. Format and push results
		if (!searchResults || searchResults.length === 0) {
			pushToolResult(`No relevant code snippets found for the query: "${query}"`) // Use simple string for no results
			return
		}

		const jsonResult = {
			query,
			results: [],
		} as {
			query: string
			results: Array<{
				filePath: string
				score: number
				startLine: number
				endLine: number
				codeChunk: string
			}>
		}

		searchResults.forEach((result) => {
			if (!result.payload) return
			if (!("filePath" in result.payload)) return

			const relativePath = vscode.workspace.asRelativePath(result.payload.filePath, false)

			jsonResult.results.push({
				filePath: relativePath,
				score: result.score,
				startLine: result.payload.startLine,
				endLine: result.payload.endLine,
				codeChunk: result.payload.codeChunk.trim(),
			})
		})

		// Send results to UI
		const payload = { tool: "codebaseSearch", content: jsonResult }
		await cline.say("codebase_search_result", JSON.stringify(payload))

		// Push results to AI
		const output = `Query: ${query}
Results:

${jsonResult.results
	.map(
		(result) => `File path: ${result.filePath}
Score: ${result.score}
Lines: ${result.startLine}-${result.endLine}
Code Chunk: ${result.codeChunk}
`,
	)
	.join("\n")}`

		pushToolResult(output)
	} catch (error: any) {
		await handleError(toolName, error) // Use the standard error handler
	}
}
