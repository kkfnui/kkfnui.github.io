---
title: SSDB zclear 导致 zrrange 操作时间过长重现测试
tags: SSDB zclear Compactions
category: 工作
---


在了解了 leveldb 原理之后,对之前 zclear 导致 SSDB 变慢的问题又有了新的认知。
所以再次做实验重现之前的问题。

<!--more-->

## 测试方法

**机器配置**

```
处理器： 2.9 GHz Intel Core i5
内存： 8 GB 1867 MHz DDR3
磁盘：Macintosh HD
```

**SSDB**

在本机创建全新的SSDB实例，默认配置：

```
leveldb:
	# in MB
	cache_size: 500
	# in KB
	block_size: 32
	# in MB
	write_buffer_size: 64
	# in MB
	compaction_speed: 1000
	# yes|no
	compression: yes
```

**测试方式**

1. 10线程写ssdb，每个线程主循环写一个新的 `Sorted list`。list中有10w个元素
2. 10线程读ssdb，每个线程主循环随机`zrange`一个`Sorted list`。
	3. zrange 100 次，每次依次往后读10个元素
	4. zrange 1000 次， 每次依次往后读10个元素


**目前测试结果**

时间：2016-07-17
leveldb使用情况：

```
leveldb.stats
	                               Compactions
	Level  Files Size(MB) Time(sec) Read(MB) Write(MB)
	--------------------------------------------------
	  0        0        0        66        0       757
	  1        2       38       115      635      1009
	  2       17      600      2350    19618     19125
```

## 结论：

1. 测试不能得出结论， zclear导致 zrange操作时间过长
2. zrange往后读的元素越多，对性能影响很大:
	3. 连续zrange 100 次的，从慢日志看很少出现操作10毫秒的慢查询
	4. 连续zrange 1000 次的，慢日志很多，而且操作100ms的慢查询，比上线出现10ms的还多


未能重现的**猜测**：

1. 从levedb对key的管理来看，zclear操作是不会对zrange的性能产生影响
2. 当levedb的层级变大后，zclear过多数据的时候，容易导致levedb Compactions
3. 在zclear的时候，内存数据被清除，导致查询时缓存未能命中，导致重新读磁盘操作
	4. zclear 大量数据的时候，可能有两种影响。影响本次相关的list数据，或者影响其他list的数据。主要还是因为内存不够，导致重新加载磁盘数据等等操作影响吧

## 下一步

1. 继续试验，测试当levedb层级变深之后，zclear带来的影响
2. 了解levedb Compactions 的原理和过程，以及其带来的影响




