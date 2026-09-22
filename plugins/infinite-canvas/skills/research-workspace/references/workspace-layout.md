<!-- CoResearch managed skill resource -->
# Workspace layout

运行时由 Canvas Agent 管理：

```text
data/
  users/<user-id>/
    projects/<project-key>/
      project.json          # 身份：id、ownerUserId、title、canvasWorkspaceId、revision
      canvas.json           # 画布权威：viewport、nodes、connections
      documents/
      artifacts/<artifact-id>/
        metadata.json
        content.md
      assets/
      skills/
      conversations/
```

`project-key` 是 `projectId` 的哈希，只是路径，不是权限。读写必须先解析 `userId` 再确认其拥有该 `projectId`。每次 Artifact 写入创建新的 `<artifact-id>` 目录。
