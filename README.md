# EpiAgentSim Node.js

这是一个基于 Agent 的传染病模拟项目，参考了 `reference_project` 里“persona 按时间步行动、接触传播、患病后选择治疗”的思路，但改成了更轻量的 Node.js 实现。

## 功能

- Agent 每个时间步会移动到家庭、工作地、学校、医院或公共场所。
- 疾病状态按 `susceptible -> exposed -> infected -> recovered/deceased` 推进。
- 空间距离小于疾病配置里的 `infectedRadiusMeters` 时触发接触传播。
- 可选使用 OpenAI 为 Agent 生成计划、行动地点和治疗决策。
- 支持 CLI 一次性模拟，也支持 Express HTTP 服务逐步推进。

## 安装

```bash
npm install
```

你的 `.env` 已经可以继续使用。建议至少包含：

```bash
OPENAI_API_KEY=你的 key
OPENAI_MODEL=gpt-4o-mini
PORT=3000
SIM_SEED=epi-agent-sim
```

## CLI 运行

不调用 OpenAI，使用内置规则快速模拟：

```bash
npm run simulate -- --steps 72
```

启用 OpenAI 决策：

```bash
npm run simulate -- --steps 24 --llm
```

保存结果：

```bash
npm run simulate -- --steps 72 --out output/result.json
```

## HTTP 服务

```bash
npm start
```

常用接口：

- `GET /health`：服务状态
- `GET /state`：当前世界状态
- `POST /simulate/step`：推进一个或多个时间步，body 示例：`{"steps": 6, "useLLM": false}`
- `POST /simulate/run`：重置并运行，body 示例：`{"steps": 48, "useLLM": true}`
- `POST /agents`：替换 agent 列表
- `POST /reset`：重置模拟

## 数据文件

- `data/agents.json`：初始人群
- `data/places.json`：地点
- `data/disease.json`：疾病参数

## 测试

```bash
npm test
```

