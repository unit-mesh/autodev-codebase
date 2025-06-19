#!/usr/bin/env node

/**
 * 简化版本的Demo - 监听本地demo文件夹并通过Ollama embedding存储到Qdrant
 * 直接使用构建后的JavaScript文件，避免TypeScript编译问题
 */

const path = require('path');
const fs = require('fs');

// 配置
const DEMO_FOLDER = path.join(process.cwd(), 'demo');
const OLLAMA_BASE_URL = 'http://localhost:11434';
const QDRANT_URL = 'http://localhost:6333';
const OLLAMA_MODEL = 'nomic-embed-text';

async function checkServices() {
  console.log('🔍 检查服务状态...');
  
  try {
    // 检查 Ollama
    const ollamaResponse = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (ollamaResponse.ok) {
      const data = await ollamaResponse.json();
      console.log('✅ Ollama 运行正常');
      const models = data.models?.map(m => m.name) || [];
      console.log('📋 可用模型:', models.join(', ') || '无');
      
      if (!models.includes(OLLAMA_MODEL)) {
        console.log(`⚠️  建议安装嵌入模型: ollama pull ${OLLAMA_MODEL}`);
      }
    }
  } catch (error) {
    console.log('❌ Ollama 不可访问');
    console.log('   请启动 Ollama: ollama serve');
    console.log(`   安装嵌入模型: ollama pull ${OLLAMA_MODEL}`);
    return false;
  }

  try {
    // 检查 Qdrant
    const qdrantResponse = await fetch(`${QDRANT_URL}/collections`);
    if (qdrantResponse.ok) {
      console.log('✅ Qdrant 运行正常');
    }
  } catch (error) {
    console.log('❌ Qdrant 不可访问');
    console.log('   请启动 Qdrant: docker run -p 6333:6333 qdrant/qdrant');
    return false;
  }

  return true;
}

async function createDemoFiles() {
  if (!fs.existsSync(DEMO_FOLDER)) {
    console.log('📁 创建demo文件夹...');
    fs.mkdirSync(DEMO_FOLDER, { recursive: true });
  }

  const sampleFiles = [
    {
      name: 'hello.js',
      content: `// JavaScript示例文件
function greetUser(name) {
  console.log(\`你好, \${name}!\`);
  return \`欢迎, \${name}\`;
}

class UserManager {
  constructor() {
    this.users = [];
  }
  
  addUser(user) {
    this.users.push(user);
    console.log('用户已添加:', user.name);
  }
  
  getUsers() {
    return this.users;
  }
}

module.exports = { greetUser, UserManager };`
    },
    {
      name: 'utils.py',
      content: `"""
数据处理工具函数
"""

def process_data(data):
    """处理输入数据并返回清理后的版本"""
    if not data:
        return []
    
    # 清理和过滤数据
    cleaned = [item.strip() for item in data if item.strip()]
    return cleaned

class DataProcessor:
    def __init__(self, config=None):
        self.config = config or {}
        self.processed_count = 0
    
    def process_batch(self, batch):
        """批量处理数据项"""
        results = []
        for item in batch:
            processed = self._process_item(item)
            results.append(processed)
            self.processed_count += 1
        return results
    
    def _process_item(self, item):
        """处理单个项目"""
        return item.upper() if isinstance(item, str) else item`
    },
    {
      name: 'README.md',
      content: `# Demo项目

这是一个演示Autodev Codebase索引系统的示例项目。

## 特性

- JavaScript工具函数
- Python数据处理
- Markdown文档
- 自动代码索引

## 使用方法

系统会自动索引此目录中的所有文件，并提供语义搜索功能。

### JavaScript函数

- \`greetUser(name)\` - 根据名称问候用户
- \`UserManager\` - 用户数据管理类

### Python函数

- \`process_data(data)\` - 清理和处理输入数据
- \`DataProcessor\` - 批量数据处理类

## 搜索示例

尝试搜索:
- "问候用户"
- "处理数据"
- "用户管理"
- "批量处理"`
    }
  ];

  for (const file of sampleFiles) {
    const filePath = path.join(DEMO_FOLDER, file.name);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, file.content, 'utf8');
      console.log(`  ✅ 创建: ${file.name}`);
    }
  }
}

async function testEmbedding() {
  console.log('🧪 测试Ollama嵌入功能...');
  
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: 'Hello world test'
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Ollama嵌入测试成功, 向量维度:', data.embedding?.length || 'unknown');
      return true;
    } else {
      console.log('❌ Ollama嵌入测试失败:', response.status, response.statusText);
      return false;
    }
  } catch (error) {
    console.log('❌ Ollama嵌入测试出错:', error.message);
    return false;
  }
}

async function testQdrant() {
  console.log('🧪 测试Qdrant连接...');
  
  try {
    const testCollection = 'test-collection-' + Date.now();
    
    // 创建测试集合
    const createResponse = await fetch(`${QDRANT_URL}/collections/${testCollection}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vectors: {
          size: 768, // nomic-embed-text 的默认维度
          distance: 'Cosine'
        }
      })
    });

    if (createResponse.ok) {
      console.log('✅ Qdrant集合创建成功');
      
      // 删除测试集合
      await fetch(`${QDRANT_URL}/collections/${testCollection}`, {
        method: 'DELETE'
      });
      console.log('✅ Qdrant测试完成');
      return true;
    } else {
      console.log('❌ Qdrant集合创建失败:', createResponse.status);
      return false;
    }
  } catch (error) {
    console.log('❌ Qdrant测试出错:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 AutoDev Codebase 简化Demo');
  console.log('================================');
  console.log('📁 Demo文件夹:', DEMO_FOLDER);
  console.log('🤖 Ollama URL:', OLLAMA_BASE_URL);
  console.log('🔍 Qdrant URL:', QDRANT_URL);
  console.log('📊 嵌入模型:', OLLAMA_MODEL);
  console.log('');

  // 1. 检查服务状态
  const servicesOk = await checkServices();
  if (!servicesOk) {
    console.log('\n❌ 请确保所有服务都在运行后重试');
    process.exit(1);
  }

  // 2. 创建演示文件
  console.log('\n📝 准备演示文件...');
  await createDemoFiles();

  // 3. 测试Ollama嵌入
  console.log('\n🧪 测试服务集成...');
  const embeddingOk = await testEmbedding();
  const qdrantOk = await testQdrant();

  if (!embeddingOk || !qdrantOk) {
    console.log('\n❌ 服务测试失败，请检查配置');
    process.exit(1);
  }

  console.log('\n✅ 所有服务测试通过！');
  console.log('\n📖 下一步:');
  console.log('1. 运行完整的索引示例:');
  console.log('   node demo-runner.js');
  console.log('');
  console.log('2. 或者手动运行构建后的demo:');
  console.log('   npm run build');
  console.log('   node dist/src/examples/run-demo.js');
  console.log('');
  console.log('3. 查看demo文件夹:');
  console.log(`   ls -la ${DEMO_FOLDER}`);
  console.log('');
  console.log('💡 提示: 你可以在demo文件夹中添加自己的代码文件来测试索引功能');
}

// 错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的Promise拒绝:', reason);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n👋 Demo已停止');
  process.exit(0);
});

// 运行demo
main().catch(error => {
  console.error('❌ Demo失败:', error);
  process.exit(1);
});