---
layout: post
title: "使用expect自动化登录服务器后无法使用rz"
author: "kkfnui"
date: 2015-11-27 00:20:57 +0800
tags:
- rz
- expect
---

很早的时候发现在服务器上无法使用`rz`命令接收文件。当时以为是跳板机导致的。

今天又想用 `rz` 命令简化操作，但是一直不行。折腾好久，也不知道什么原因。后面，各种搜索引擎找，才发现真相——在expect下是没办法正常工作的。

大致扫了下[ZMODEM](https://www.wikiwand.com/en/ZMODEM)，没有研究透，估计是expect是没有实现（也不能，毕竟是本地进程）ZMODEM 协议。 这样就算本地发起通信，服务器端是无法接收到信息的。

不知道有没有其他更好的自动登录工具了，`XShell`使用vbscript到时蛮好的实现，但这是基于它自己实现了ssh协议，vbscript倒是成为它的插件了。

不过上次看到有一个工具也是自己实现了 ssh 协议的，不知道是不是可以自己拿来改一改哦。真是想法太多了。

工具：[A Python implementation of SSHv2.](http://docs.paramiko.org/en/1.16/index.html)


