---
layout: post
title: "在Mac OSX 上抓android手机数据包"
author: "kkfnui"
date: 2014-11-21 11:30:04 +0800
tags: Tool, Wireshark
---


在android直接使用tcpdump抓包对于开发调试的时候有些不方便。每次抓android的包的时候都会怀念以前做windows开发的简单快捷的抓包方法。碰巧最近发现android的抓包也可以如此的顺畅。

先介绍下mac os下抓android手机数据包的流程吧：

1. 确保手机上已经安装了tcpdump，支持busybox
2. 确保mac上安装了[wireshark](https://www.wireshark.org/download.html)
3. 运行`./adb_wireshark.sh`即可完成整个功能了

在mac上抓android数据包的基本原理是转发，即数据包还是在android上抓取，只是在mac上展示而已。转发的关键是`adb forward`。

adb_tcpdump.sh

```
/data/local/tcpdump -s 0 -w - | busybox nc -l -p 11233
```
该命令会将抓取到的数据发送到 11233 端口。

adb_wireshark.sh

```

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



