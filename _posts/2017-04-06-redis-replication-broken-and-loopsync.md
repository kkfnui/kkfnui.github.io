---
title: Redis复制中断和无限同步问题
tags: Redis 运维
---

[在线切换 redis cluster 持久化策略](http://blog.makerome.com/2017/04/05/restart-redis-cluster-without-down-time.html)
说到了使用官方提供的方法, 无法关闭 RDB 。当时我也没能知道原因(自己也太不负责了)。

<!--more-->

### 操作

晚上操作的时候,发现了一个奇怪的现象。当将 slave 节点的数据清空并重启后。
就会触发 master 的 rdb, 通过日志发现这是一次 full rsync。
并且过一段时间, slave 会重新 load 数据。

这个现象比较诡异, 刚好找到小北问了下。给出了建议, 调整 client-output-buffer-limit 参数配置。
我搜索了相关的关键词,找到了一篇文章,对我碰到的问题总结的很好 —— [Redis复制中断和无限同步问题](https://zhuoroger.github.io/2016/07/31/redis-replication-broken-and-loopsync/)


根据文章的指示,对 redis 相应的参数做了调整。调整后, redis 机器的负载降下来了, 依赖的服务的 P99 也降低了很多。


### 启示

1. 之前对于 redis 或者其他的技术
,太急于求成,想一下子变成专家。实在太浮躁了,为何不买本书,看下别人使用 redis 的经验呢?
2. redis 的监控:
    1. total_net_input_bytes 过高报警
    2. client_longest_output_list 太大报警
    3. slave_lag 太大报警
    4. master_last_io_seconds_ago

服务端开发, 监控是重中之重。服务针对不同的流程,不同的数据量,面临的问题难度是不一样的。
监控可以帮助我们发现问题, 提醒我们现在是不是要加机器了,是不是要改架构了。

### 引用

1. [Redis复制中断和无限同步问题](https://zhuoroger.github.io/2016/07/31/redis-replication-broken-and-loopsync/)
