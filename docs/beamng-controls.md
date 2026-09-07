# BeamNG 控制映射核对

核对日期：2026-09-07。

- 官方最新发布记录为 **0.39.4**：[官方更新日志](https://www.beamng.com/game/news/patch/beamng-drive-v0-39-3/)。
- 本机运行的 `BeamNG.drive.x64.exe` 产品版本为 **0.39.4.0.20972**。
- 手柄绑定直接读取本机游戏自带 `settings/inputmaps/xidevice.json`；没有修改游戏文件或用户改键。
- [官方输入映射说明](https://documentation.beamng.com/modding/input/bindings/)说明 XInput 设备使用 `xidevice` 映射，用户 `.diff` 改键会覆盖默认值。
- 喇叭、车灯、点火、暂停等补充功能核对了[官方默认键位表](https://documentation.beamng.com/modding/input/default-keyboard-bindings/)。

## 屏幕按钮

| 屏幕操作 | 实际发送 | BeamNG action | 触摸方式 |
|---|---|---|---|
| 重置车辆 | Xbox D-pad 右 | reset_physics | 点按 |
| 修复/回溯 | Xbox D-pad 左 | recover_vehicle | 点按或按住 |
| 切换视角 | Xbox Y | switch_camera_next | 点按 |
| 手刹 | Xbox B | parkingbrake | 按住，松手释放 |
| 升挡 | Xbox A | shiftUp | 点按 |
| 降挡 | Xbox X | shiftDown | 点按 |
| 游戏菜单 | Xbox Start | toggleMenues | 点按 |
| 地图 | Xbox Back | toggleBigMap | 点按 |
| 暂停/继续 | J | pause | 点按 |
| 喇叭 | H | horn | 按住 |
| 车灯 | N | toggle_headlights | 点按 |
| 点火/启动 | V | activateStarterMotor | 点按或按住 |
| 变速模式 | Q | toggleShifterMode | 点按 |

转向继续使用左摇杆 X；油门、刹车使用 RT/LT 模拟轴。命名按钮与这些轴合并发送，按手刹或换挡不会覆盖油门、转向。离开页面、失焦或断线时释放按钮与键盘键。

“重置”在任务模式下可能重启当前任务；“修复/回溯”是不同动作。功能也会受游戏菜单、任务和车辆上下文影响。游戏内自定义改键后，应相应更新网页映射。喇叭、车灯等键盘动作需要 BeamNG 位于主机前台。

## 视频预设

| 预设 | 视频流尺寸 | 帧率 | 推荐码率 |
|---|---|---|---|
| 720P / 30 FPS | 1280×720 | 30 | 6 Mbps |
| 720P / 60 FPS | 1280×720 | 60 | 10 Mbps |
| 720P / 120 FPS | 1280×720 | 120 | 20 Mbps |
| 1080P / 30 FPS | 1920×1080 | 30 | 12 Mbps |
| 1080P / 60 FPS | 1920×1080 | 60 | 20 Mbps |
| 1080P / 120 FPS | 1920×1080 | 120 | 40 Mbps |
| 2756×1268 / 30 FPS | 2756×1268 | 30 | 25 Mbps |
| 2756×1268 / 60 FPS | 2756×1268 | 60 | 45 Mbps |
| 2756×1268 / 120 FPS | 2756×1268 | 120 | 80 Mbps |

这些是串流帧率预设，不修改手机面板刷新率。支持 H.265 Main / AV1 Main 硬编；游戏自身帧率与画质仍由游戏设置决定。码率上限为 300Mbps，网络流量另含协议开销。预设选择会在当前浏览器保存，断开并重新连接后应用。
