---
title: 晨起
tags: 
category: log
---


## 问题

1. RocksDB Iterator 遍历可能数据跨越多个文件、多个 level，那性能就可能会受影响。
    1. 考虑怎样的情况会导致，key 是顺序的，但是存在了不同的文件,不同 level
1. 整理 RocksDB Iterator 遍历的工作流程 


## 工作

1. 上午看了 linux 内核
1. 看了 rocksdb 的 snapshot
1. 开始写放量管理服务的接口
    1. 是否需要使用数据池
    1. 接口参数如何定义
    1. 需要定义任务数据库（或者使用 redis 来保存任务数据）
    1. 