import assert from "node:assert/strict"
import { test } from "node:test"
import { extractMermaidFences } from "../src/index.ts"

test("ignores an inline code span that mentions a fence", () => {
  const text = [
    "它的工作是把助手回答里的 ` ```mermaid ` 代码块渲染成 ASCII 图形。",
    "",
    "```mermaid",
    "graph LR; A --> B",
    "```",
  ].join("\n")

  assert.deepEqual(extractMermaidFences(text), [
    { fenceLanguage: "mermaid", source: "graph LR; A --> B" },
  ])
})

test("finds no fence when only inline code spans mention one", () => {
  const text = [
    "对话里的 `mermaid` 围栏会原位渲染成图形。",
    "",
    "- 把 ` ```mermaid ` 代码块渲染成图形",
    "- 把 ```mmd 围栏也一起处理",
    "- 渲染交给 `beautiful-mermaid`",
  ].join("\n")

  assert.deepEqual(extractMermaidFences(text), [])
})

test("keeps mmd fences and trims outer blank lines", () => {
  const text = ["```mmd", "", "flowchart TD", "  A --> B", "", "```", ""].join(
    "\n",
  )

  assert.deepEqual(extractMermaidFences(text), [
    { fenceLanguage: "mmd", source: "flowchart TD\n  A --> B" },
  ])
})

test("matches indented and longer fences", () => {
  const text = [
    "1. Steps:",
    "",
    "   ````mermaid",
    "   flowchart LR",
    "     A --> B",
    "   ````",
  ].join("\n")

  assert.deepEqual(extractMermaidFences(text), [
    { fenceLanguage: "mermaid", source: "   flowchart LR\n     A --> B" },
  ])
})

test("collects every fence in message order", () => {
  const text = [
    "```mermaid",
    "flowchart LR",
    "  A --> B",
    "```",
    "",
    "中间说明文字。",
    "",
    "```mermaid",
    "sequenceDiagram",
    "  User->>API: Ping",
    "```",
  ].join("\n")

  assert.equal(extractMermaidFences(text).length, 2)
  assert.equal(
    extractMermaidFences(text)[1]?.source,
    "sequenceDiagram\n  User->>API: Ping",
  )
})
