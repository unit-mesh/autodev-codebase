import http from 'http';

// 配置
const config = {
    host: 'localhost',
    port: 6333,
    collection: 'ws-d7947ff78f9f219d',
    endpoint: '/collections/ws-d7947ff78f9f219d/points/scroll'
};

/**
 * 按照 format-request-results.js 的规则格式化Qdrant结果
 */
function formatQdrantResults(points, query = '') {
    console.log('📊 原始请求配置:');
    console.log(JSON.stringify({
        host: config.host,
        port: config.port,
        collection: config.collection,
        endpoint: config.endpoint
    }, null, 2));
    console.log('\n' + '='.repeat(60));

    if (!points || points.length === 0) {
        const result = {
            content: [
                {
                    type: 'text',
                    text: `No results found in Qdrant collection: "${config.collection}"`,
                }
            ]
        };
        console.log('📝 格式化结果:');
        console.log(JSON.stringify(result, null, 2));
        return result;
    }

    // 将Qdrant points转换为搜索结果格式
    const searchResults = points.map(point => ({
        score: point.score || 1.0, // Qdrant可能没有score，使用默认值
        payload: point.payload
    }));

    // 按文件路径分组搜索结果
    const resultsByFile = new Map();
    searchResults.forEach((result) => {
        const filePath = result.payload?.filePath || 'Unknown file';
        if (!resultsByFile.has(filePath)) {
            resultsByFile.set(filePath, []);
        }
        resultsByFile.get(filePath).push(result);
    });

    const formattedResults = Array.from(resultsByFile.entries()).map(([filePath, results]) => {
        // 对同一文件的结果按行号排序
        results.sort((a, b) => {
            const lineA = a.payload?.startLine || 0;
            const lineB = b.payload?.startLine || 0;
            return lineA - lineB;
        });

        // 去重：移除被其他片段包含的重复片段
        const deduplicatedResults = [];
        for (let i = 0; i < results.length; i++) {
            const current = results[i];
            const currentStart = current.payload?.startLine || 0;
            const currentEnd = current.payload?.endLine || 0;

            // 检查当前片段是否被其他片段包含
            let isContained = false;
            for (let j = 0; j < results.length; j++) {
                if (i === j) continue; // 跳过自己

                const other = results[j];
                const otherStart = other.payload?.startLine || 0;
                const otherEnd = other.payload?.endLine || 0;

                // 如果当前片段被其他片段完全包含，则标记为重复
                if (otherStart <= currentStart && otherEnd >= currentEnd &&
                    !(otherStart === currentStart && otherEnd === currentEnd)) {
                    isContained = true;
                    break;
                }
            }

            // 如果没有被包含，则保留这个片段
            if (!isContained) {
                deduplicatedResults.push(current);
            }
        }

        // 使用去重后的结果计算平均分数
        const avgScore = deduplicatedResults.length > 0
            ? deduplicatedResults.reduce((sum, r) => sum + (r.score || 0), 0) / deduplicatedResults.length
            : 0;
        console.log(`平均分数: ${avgScore.toFixed(3)}`, deduplicatedResults.map(r => (r.score)));

        // 合并代码片段，优化显示格式（使用去重后的结果）
        const codeChunks = deduplicatedResults.map((result, index) => {
            const codeChunk = result.payload?.codeChunk || 'No content available';
            const startLine = result.payload?.startLine;
            const endLine = result.payload?.endLine;
            const lineInfo = (startLine !== undefined && endLine !== undefined)
                ? ` (L${startLine}-${endLine})`
                : '';
            const score = result.score?.toFixed(3) || '1.000';

            return `${lineInfo}
${codeChunk}`;
        }).join('\n' + '─'.repeat(5) + '\n');

        const snippetInfo = deduplicatedResults.length > 1 ? ` | ${deduplicatedResults.length} snippets` : '';
        const duplicateInfo = results.length !== deduplicatedResults.length
            ? ` (${results.length - deduplicatedResults.length} duplicates removed)`
            : '';
        return `File: \`${filePath}\` | Avg Score: ${avgScore.toFixed(3)}${snippetInfo}${duplicateInfo}
\`\`\`
${codeChunks}
\`\`\`
`;
    });

    const fileCount = resultsByFile.size;
    const summary = `Found ${searchResults.length} result${searchResults.length > 1 ? 's' : ''} in ${fileCount} file${fileCount > 1 ? 's' : ''} from Qdrant collection: "${config.collection}"\n\n${formattedResults.join('\n')}`;

    const result = {
        content: [
            {
                type: 'text',
                text: summary,
            }
        ]
    };

    // console.log('📝 格式化后的 qdrant 响应:');
    // console.log(JSON.stringify(result, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('📋 纯文本输出预览:');
    console.log('='.repeat(60));
    console.log(summary);

    console.log('\n' + '='.repeat(60));
    console.log(`🔍[Qdrant] ${searchResults.length} results in ${fileCount} files from collection "${config.collection}"`);

    return result;
}

// 发送HTTP请求到Qdrant
function makeQdrantRequest() {
    console.log(`正在发送请求到: http://${config.host}:${config.port}${config.endpoint}`);

    const options = {
        hostname: config.host,
        port: config.port,
        path: config.endpoint,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    };

    // 请求体 - 滚动查询所有点
    const requestBody = JSON.stringify({
        limit: 1000,  // 限制返回10个点
        // with_payload: true,  // 包含payload
        // with_vector: false,   // 不包含向量数据（通常很大）
        // "query": "",
        // "filter": {
        //     "should": [
        //         {
        //             "key": "filePath",
        //             "match": {
        //                 "text": "package"
        //             }
        //         }
        //     ]
        // }
    });
    console.log('请求体:', requestBody);

    const req = http.request(options, (res) => {
        console.log(`状态码: ${res.statusCode}`);
        console.log(`响应头:`, res.headers);

        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            try {
                const response = JSON.parse(data);
                // console.log('\n=== Qdrant 原始响应数据 ===');
                // console.log(data);

                if (response.result && response.result.points) {
                    console.log(`\n找到 ${response.result.points.length} 个点`);

                    // 使用格式化函数输出结果
                    formatQdrantResults(response.result.points);

                } else {
                    formatQdrantResults([]);
                }
            } catch (error) {
                console.error('解析响应JSON时出错:', error);
                console.log('原始响应:', data);
            }
        });
    });

    req.on('error', (error) => {
        console.error('请求出错:', error);

        // 提供一些故障排除提示
        console.log('\n故障排除提示:');
        console.log('1. 确保Qdrant服务正在运行');
        console.log('2. 检查端口6333是否可访问');
        console.log('3. 验证集合名称是否正确');
        console.log(`4. 尝试访问: http://${config.host}:${config.port}/collections`);
    });

    // 发送请求体
    req.write(requestBody);
    req.end();
}

// 首先检查Qdrant服务是否可用
function checkQdrantHealth() {
    console.log('检查Qdrant服务状态...');

    const options = {
        hostname: config.host,
        port: config.port,
        path: '/health',
        method: 'GET'
    };

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            if (res.statusCode === 200) {
                console.log('✅ Qdrant服务正常运行');
                makeQdrantRequest();
            } else {
                console.log(`❌ Qdrant健康检查失败: ${res.statusCode}`);
                console.log('响应内容:', data);
                console.log('\n尝试直接发送请求...');
                makeQdrantRequest();
            }
        });
    });

    req.on('error', (error) => {
        console.error('❌ 无法连接到Qdrant服务:', error.message);
        console.log('\n请确保:');
        console.log('1. Qdrant正在运行');
        console.log('2. 端口6333未被占用');
        console.log('3. 防火墙允许访问');
    });

    req.end();
}

// 运行脚本
console.log('🔍 Qdrant 数据格式化器');
console.log('基于 format-request-results.js 的输出格式');
console.log('='.repeat(60));
console.log(`目标服务器: ${config.host}:${config.port}`);
console.log(`集合: ${config.collection}`);
console.log('========================\n');

checkQdrantHealth();
