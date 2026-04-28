export default {
  // 指明测试文件位置
  rootDir: 'src',
  // 使用 ts-jest 处理 TypeScript 文件
  transform: { '^.+\\.ts$': 'ts-jest' },
  // 识别 .spec.ts 结尾的文件为测试文件
  testRegex: '.*\\.spec\\.ts$',
  // 支持的模块文件扩展名
  moduleFileExtensions: ['js', 'json', 'ts'],
  // 设置 Node.js 为测试环境
  testEnvironment: 'node',
  // 可选：开启代码覆盖率收集
  collectCoverage: true,
  // 可选：指定覆盖率报告的输出目录
  coverageDirectory: '../coverage',
};