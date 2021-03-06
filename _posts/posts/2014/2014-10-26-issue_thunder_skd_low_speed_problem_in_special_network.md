---
title: 定位下载引擎速度慢的问题
tags: 下载库 问题定位 小米 MIUI IDM range HTTP
category: 工作
---

近到小米公司出差，目的是保证迅雷加速引擎嵌入 MIUI v6 的稳定版中。

加速引擎的亮点是高速下载，结果在小米的网络中下载速度反而没有最简单的单连接下载快。具体现象：

- 加速引擎：任务开始一段时间后速度可以达到 2M/s，过了一段时间速度突然下降。在白天速度只有 100～200KB/s。
晚上网络空闲的时候会高些,下载速度可以达到1MB/s
- 浏览器： 下载速度很稳定,一直保持在 2.5M/s。白天晚上的下载速度都一样。

<!--more-->

分析现象猜测有几个原因：

- 原始资源非常强，使用多连接反而会降低下载速度

  会影响下载速度，但是对下载速度的影响不会那么大
- wifi热点的性能有问题，连接多的时候为各个连接提供的速度总和反而没有单连接给力

## 实验定位


在验证第二个点的时候，使用了IDM，这个工具对定位问题的帮助很大。IDM 也是一个下载软件，支持多连接下载，还可以方便的设置下载任务使用的连接数。在夜晚做了几组试验对比：

- 1连接, 下载速度平稳一直是 2.3～2.5M/s
- 2连接, 开始下载速度是在2M/s以上，但是很快就往下降最终稳定在1M/s左右
- 4连接, 现象和连接数为 2 的一样
- 8连接, 现象和连接数为 2 的一样

以上测试结果不能验证可能的原因2。

仔细观察发现 IDM 在使用多连接下载的时候会在第一条连接获取到文件大小后断开，后面的请求都是分块请求。
猜测是小米公司网络对于带有 range 的 HTTP 请求有限制。


### 验证测试

- 单连接下载，一个带 range ，一个不带range请求

    带 range 下了速度是 1M/s，不带range的是2.5M/s
- 多连接下载，包涵一个不带 range 请求和三个带 range 请求的连接

    下载速度也能一直保持2.5M/s

## 总结反思

1. 缺少从现分析能力。分析现象时,就可以从中推翻某些可能原因,降低验证原因的优先级
2. 容易陷入先入为主,一旦想到一个可能原因就会停止分析
