---
name: Bug report
about: Report a notifier misbehavior — wrong sound, no sound, duplicate notifications, hooks not firing, etc.
title: ""
labels: bug
---

**Description**
<one or two sentences>

**Steps to reproduce**
1.
2.
3.

**Expected** / **Actual**

**Environment**
- OS: <macOS X.Y / Linux distro / WSL / Windows>
- VS Code: <`code --version` first line>
- Extension version: <Extensions panel or `package.json`>
- Install method: <Marketplace / sideloaded `.vsix` / `install.sh`>

**Configuration**
- `claudeNotifier.taskCompleted.level`:
- `claudeNotifier.taskCompleted.sound`:
- (or paste the relevant `claudeNotifier.*` block)

**Claude Notifier output channel log**
Open `View → Output → Claude Notifier`, paste the relevant lines:

```
[HH:MM:SS] ...
```

**Already tried**
- [ ] Reloaded the VS Code window
- [ ] Reset the sound preset to a default
- [ ] Walked the `/test-notifier` Diagnostics fault tree
