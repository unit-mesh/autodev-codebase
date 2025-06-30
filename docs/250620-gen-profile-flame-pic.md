现在我总结一下为 Node.js 程序生成火焰图的几种方法：

  为 Node.js 程序生成火焰图的方法：

  1. 使用 Node.js 内置的 --prof 选项：

  # 生成性能数据
  node --prof -enable-source-maps  ./node_modules/.bin/ts-node
  --transpile-only src/examples/run-demo.ts

  # 转换为文本报告
  node --prof-process -enable-source-maps  isolate-*.log > profile.txt

  # 转换为JSON格式（用于可视化工具）
  node --prof-process -enable-source-maps  --preprocess isolate-*.log >
  profile.json

  2. 使用 speedscope 可视化：

  npm install --save-dev speedscope
  npx speedscope profile.json

  3. 使用 clinic.js 套件：

  npm install --save-dev clinic
  npx clinic flame -- node script.js
  npx clinic doctor -- node script.js

  4. 使用 flamebearer：

  npm install --save-dev flamebearer
  npx flamebearer profile.json

  推荐使用 speedscope，它能很好地处理 Node.js
  的性能数据并生成交互式火焰图。
