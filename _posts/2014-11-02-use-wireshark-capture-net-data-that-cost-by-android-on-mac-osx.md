---
title: 在 Mac OSX 上抓 Android 手机数据包
tags: Mac Android tcpdump Wireshark busybox
category: 工作
---

网络开发的时候,在 Android 直接使用 tcpdump 抓包有些不方便。
每次调试都会怀念以前做 Windows 开发的体验,简单快捷。

最近从 @彭彭 那里学习了在 Mac 使用 Wireshark 直接抓 Android 的数据包的方法。

<!--more-->

在 Mac 下抓 Android 手机数据包的流程：

1. 确保手机上已经安装了 tcpdump，支持 busybox
2. 确保mac上安装了 [Wireshark](https://www.wireshark.org/download.html)
3. 运行`./adb_wireshark.sh`即可完成整个功能了

在 Mac上抓 Android 数据包的基本原理是转发.
即数据包是在android上抓取，最后在 Mac 上通过 Wireshark 展示。
转发的关键是`adb forward`。

下面是在 Android 手机上使用 tcpdump 抓取数据包, 发送到 11233 端口的代码:


```sh
# adb_tcpdump.sh
/data/local/tcpdump -s 0 -w - | busybox nc -l -p 11233
```
从 Mac 上使用 adb 将 11233 端口的数据转发到 Mac, 且重定向到 `/tmp/sharkfin` 管道上:

```sh
# adb_wireshark.sh

adb root	#获取root权限
adb shell < adb_tcpdump.sh & #在手机上执行
Apid=$!

sleep 1
adb forward tcp:11233 tcp:11233	#将手机11233端口的数据转发到mac的11233端口上
sleep 1

mkfifo /tmp/sharkfin	#创建一个命名管道
wireshark -k -i /tmp/sharkfin & #运行本地的wireshark，并指定数据来源是在/tmp/sharkfin上

nc 127.0.0.1 11233 > /tmp/sharkfin #将本地11233端口的数据重定向到命名管道上
kill -9 $Apid
```