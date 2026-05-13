# EpiAgentSim TypeScript

这是一个基于 Agent 的传染病模拟项目，参考了 `reference_project` 里“persona 按时间步行动、接触传播、患病后选择治疗”的思路，但改成了更轻量的 TypeScript 实现。

## 功能

- Agent 每个时间步会移动到家庭、工作地、学校、医院或公共场所。
- 疾病状态按 `susceptible -> exposed -> infected -> recovered/deceased` 推进。
- 空间距离小于疾病配置里的 `infectedRadiusMeters` 时触发接触传播。
- 可选使用 OpenAI 为 Agent 生成计划、行动地点和治疗决策。
- 使用 CLI 运行模拟，并直接把结果保存为 JSON 文件。

## 安装

请在项目根目录运行安装命令，也就是包含 `package.json` 的目录：

```bash
cd ~/EpiAgentSim
npm install
```

本项目源码使用 TypeScript，运行脚本依赖 `tsx`。如果出现 `tsx: not found`，通常说明还没有执行过 `npm install`，或者安装没有成功。

你的 `.env` 已经可以继续使用。建议至少包含：

```bash
OPENAI_API_KEY=你的 key
OPENAI_BASE_URL=https://api.siliconflow.cn/v1
OPENAI_MODEL=deepseek-ai/DeepSeek-V3.2
```

如果你使用的是硅基流动国际站，可以把 `OPENAI_BASE_URL` 改成 `https://api.siliconflow.com/v1`。模型名需要和硅基流动模型广场里的 ID 完全一致。

## CLI 运行

先根据 `storage/<demo>/config.json` 生成基础数据：

```bash
cd ~/EpiAgentSim
npm run generate -- example
```

不调用 OpenAI，使用内置规则快速模拟：

```bash
cd ~/EpiAgentSim
npm run simulate -- <demo> <steps>
```

命令后面的第一个参数是需要模拟的基础环境名，对应 `storage/<demo>`；第二个参数是需要模拟的步数。例如：

```bash
npm run simulate -- example 72
```

模拟结果会保存到当前环境的 movement 目录：

```text
storage/example/movement/0.json
storage/example/movement/1.json
storage/example/movement/2.json
...
```

启用 OpenAI 决策：

```bash
npm run simulate -- example 24 --llm
```

## Storage 结构

- `storage/example/config.json`：模拟配置，包括每步时间、疾病转移概率、状态感受词表等
- `storage/example/agents.json`：Agent 静态信息
- `storage/example/buildings.json`：建筑/地点静态信息
- `storage/example/movement/0.json`：初始动态状态
- `storage/example/movement/1.json`、`2.json`、`3.json`：逐步模拟结果

项目不使用 MongoDB，输入数据和模拟输出都通过 JSON 文件管理。
