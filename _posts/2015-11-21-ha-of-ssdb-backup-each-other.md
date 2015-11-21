---
layout: post
title: "SSDB双机互备保证可用性"
author: "kkfnui"
date: 2015-10-28 11:14:45 +0800
tags:
- ssdb
---



推荐服务现在有两台SSDB服务器。周末其中一台SSDB服务器硬件故障，导致一整天服务不可用。
现在需要在硬件不足的情况下提高SSDB的服务可靠性。目前的方案，是双机互相备份。

### 解决方案


![](/media/14480757803564.jpg)

如上图，每台机器启动3个实例，其中一个master，两个slave。如SSDB1， slave1 对应的master 是本机的master1， slave2 对应的是 SSDB2 的master 2。

正常情况下， `SSDB1:master1,SSDB2:master2` 是写的实例， `SSDB1:slave1,SSDB2:slave2` 是读的实例。

当SSDB1机器宕机的时候，写服务会失败，读服务在人工配置后可保证数据安全。最终使用`SSDB2:slave1,SSDB2:slave2`实例提供读的服务。


### 同步状态判断


>对于 master, `binlogs.max_seq` 是指当前实例上的最新一次的写(写/更新/删除)操作的序号, `replication.client.last_seq` 是指已发送给 slave 的最新一条 binlog 的序号.

>所以, 如果你想判断主从同步是否已经同步到位(实时更新), 那么就判断 `binlogs.max_seq` 和 `replication.client.last_seq` 是否相等.





