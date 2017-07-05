---
title: 晨起
tags: 
category: log
---


## 问题

1. RocksDB Iterator 遍历可能数据跨越多个文件、多个 level，那性能就可能会受影响。
    1. 考虑怎样的情况会导致，key 是顺序的，但是存在了不同的文件,不同 level
1. 整理 RocksDB Iterator 遍历的工作流程 
1. 需要先把 RocksDB 的一些基础数据结构看清楚，可以从简单的开始
    1. LookUpKey —— dbformat.h
    2. MemoryTable —— memorytable.h、memorytablerep.h


## 开机启动

1. shadowsocks 在 init.d 中为什么没有启动？

    启动失败了
    由于[shadowsocks服务脚本实现的问题](https://unix.stackexchange.com/questions/241970/what-does-status-active-exited-mean-for-a-custom-service)。导致 `service --status-all` 命令看到的状态不对，可以通过 `service shadowsocks status` 命令验证
2. 使用通用的模板，编写 sslocal 的开机启动

    简单且正确的做法是拷贝一个现有的service 脚本，修改 启动进程 及启动参数。可以通过 `service xxx status` 调试，验证脚本是否编写正确。


3. 将 init.d 设置为开机启动

    ```
    update-rc.d xxx defaults
    update-rc.d xxx enable
    ```

## 工作

1. 上午看了 linux 内核
1. 看了 rocksdb 的 snapshot
1. 开始写放量管理服务的接口
    1. 是否需要使用数据池
    1. 接口参数如何定义
    1. 需要定义任务数据库（或者使用 redis 来保存任务数据）
1. 持久化存储 精选数据池，未上线 


## 成瘾问题

1. 内心的痛苦导致的焦虑
2. 习惯问题
