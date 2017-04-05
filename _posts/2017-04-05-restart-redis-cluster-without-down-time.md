---
title: 在线切换 redis cluster 持久化策略
tags: Redis 运维
---



线上一个 redis 集群,使用的是 rdb 方式做持久化。
集群的读写比是 1:1, 通过日志看到 rdb 时, cow 内存比较大。
线上日志:

```
RDB: 9002 MB of memory used by copy-on-write
```

从监控发现, 当其 dump 的时候就会出现慢查询。GET 操作需要消耗 500ms ~ 1.x s 不等。
为此需要将 rdb 策略去除, 改成使用 aof 的方式。


<!--more-->



调整持久化策略时使用了两种方法:

1. 线上直接切换到 AOF 的方式
2. 修改 conf 文件, 重启实例


### How I can switch to AOF, if I'm currently using dump.rdb snapshots ?

There is a different procedure to do this in Redis 2.0 and Redis 2.2, as you can guess it's simpler in Redis 2.2 and does not require a restart at all.

**Redis >= 2.2**

- Make a backup of your latest dump.rdb file.
- Transfer this backup into a safe place.
- Issue the following two commands:
- redis-cli config set appendonly yes
- redis-cli config set save ""
- Make sure that your database contains the same number of keys it contained.
- Make sure that writes are appended to the append only file correctly.

The first CONFIG command enables the Append Only File.
 In order to do so Redis will block to generate the initial dump,
  then will open the file for writing, and will start appending all the next write queries.
The second CONFIG command is used to turn off snapshotting persistence.
This is optional, if you wish you can take both the persistence methods enabled.

> **IMPORTANT**: remember to edit your redis.conf to turn on the AOF, otherwise when you restart the server the configuration changes will be lost and the server will start again with the old configuration.


按上述的命令执行后, 有一个节点的 RDB 没有被成功关闭。
具体原因不详。


### 重启 redis 实例

redis 集群使用的是 master-salve 的模型。
在 master 挂掉的时候, slave 会被推举为 master 以保证可用性。
因此, 正常的时候 slave 是不会承担请求负载的。

**无伤重启步骤**

1. 重启 slave 节点
2. 将 slave 节点切换成 master 节点
3. 重启旧的 master 节点

将 slave 节点切换成 master 节点的关键命令 `CLUSTER FAILOVER`

#### CLUSTER FAILOVER

This command, that can only be sent to a Redis Cluster slave node, forces the slave to start a manual failover of its master instance.

A manual failover is a special kind of failover that is usually executed when there are no actual failures, but we wish to swap the current master with one of its slaves (which is the node we send the command to), in a safe way, without any window for data loss. It works in the following way:

1. The slave tells the master to stop processing queries from clients.
1. The master replies to the slave with the current replication offset.
1. The slave waits for the replication offset to match on its side, to make sure it processed all the data from the master before it continues.
1. The slave starts a failover, obtains a new configuration epoch from the majority of the masters, and broadcasts the new configuration.
1. The old master receives the configuration update: unblocks its clients and starts replying with redirection messages so that they'll continue the chat with the new master.

This way clients are moved away from the old master to the new master atomically and only when the slave that is turning into the new master has processed all of the replication stream from the old master.








