# 编码格式与实时延迟

## W7800 AV1 支持

AMD 官方 [W7800 产品规格](https://www.amd.com/en/products/graphics/workstations/radeon-pro/w7800.html) 与 [数据表](https://www.amd.com/content/dam/amd/en/documents/products/graphics/workstation/radeon-pro-w7800-datasheet.pdf) 均列出 AV1 编码、解码能力。

本 Demo 的主机编码由 Sunshine 提供：NVIDIA 使用 NVENC，AMD 使用 AMF。`av1_mode=0` 按实际编码器能力发布 AV1 支持；网页仅请求 AV1 Main 8-bit 或 H.265 Main 8-bit，保持 SDR、4:2:0。依据：[Sunshine 编码配置](https://docs.lizardbyte.dev/projects/sunshine/latest/md_docs_2configuration.html#av1_mode)。

连接前可以选择 H.265 或 AV1。选择会保存在该浏览器。设备没有报告所选格式的 WebRTC 接收能力时显示错误；不静默改用另一种格式。编码格式切换需重新连接。W7800 的硬件支持已由官方资料确认，本机实际验证使用 RTX 5090。

## 延迟口径

右上角“总延迟 ≈ … ms”为每秒更新的视频链路估算，点击可展开组成项。

计算路径为：

```text
主机画面采集 / 编码
 + 主机转发处理
 +（主机到桥接的 RTT + 桥接到浏览器的 RTT）/ 2
 + 浏览器从收到首个视频包到解码完成的处理时间
```

- 主机采集/编码：Sunshine 在视频帧中携带的帧处理时间，不能进一步当作纯编码时间。
- 主机转发：网页桥接提供的帧转发处理统计。
- 传输：使用当前选中 ICE 通道的 RTT 与主机本地链路 RTT，假设往返路径近似对称。
- 接收/解码：使用 WebRTC `totalProcessingDelay` 的相邻采样差值除以同期 `framesDecoded` 差值，秒转换为毫秒。
- 解码明细：`totalDecodeTime` 的同期差值除以解码帧数差值。该部分已经包含在接收处理时间内，不再重复计入总和。
- 接收处理字段缺失时，使用同期平均 jitter buffer 时间 + 解码时间作为替代。

字段定义依据 [W3C WebRTC Stats](https://www.w3.org/TR/webrtc-stats/#dom-rtcinboundrtpstreamstats-totalprocessingdelay)。主机统计保持最近 3.5 秒内有效；没有新帧、计数器重置或关键统计缺失时不继续显示旧总数，也不把缺失数据当成零。

该数字截止到视频解码完成，**不包含游戏逻辑/渲染之前的耗时、触控上行、解码后显示排队和屏幕扫描**，不是通过高速摄像机测得的触摸到画面延迟。单向传输为估算，因此总值显示 `≈`。

详细采样同时保存在 `logs/http-console.log` 的 `latency` 字段中。
