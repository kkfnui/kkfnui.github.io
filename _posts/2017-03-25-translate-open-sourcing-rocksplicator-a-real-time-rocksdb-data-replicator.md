---
title: 【翻译】 Open-sourcing Rocksplicator, RocksDB 实时复制架构
tags: RocksDB 翻译 Pinterest
category: rocksdb
---

> 原文: [Open-sourcing Rocksplicator, a real-time RocksDB data replicator](https://medium.com/@Pinterest_Engineering/open-sourcing-rocksplicator-a-real-time-rocksdb-data-replicator-558cd3847a9d#.1lvyfwoy6)


Pinterest 的在线系统每天处理数十 PB 数据。
当我们的产品将数十亿 Pins 推送给 1亿5千万用户时,
我们需要一套新的框架——计算和数据在相同的机器的处理框架。为此我们使用了 RocksDB。
适应性强，支持高性能的基础和高级数据库操作，
满足建立大规模、增长行的分布式有状态服务的大部分要求。
但是对于我们还缺少两个主要的模块:
实时的数据复制同步, 基于 RocksDB 服务的集群管理工具。
为了填补这些空白,我们开发了 RocksDB replicator–Rocksplicator 一个集群管理库。
今天我们在 GitHub 开源了。
<!--more-->

在我们深入 Rocksplicator 之前, 让我们先了解3个使用场景吧。

**1. 基于机器学习的排序系统**

个性化机器学习模型对候选的 Pins 排序，帮助Pinners发现符合他们的兴趣和品味的 Pin。
我们从几KB数据中提取特征，以计算人与Pin之间的相关性。
对于每个Pin的推荐，我们的评分系统计算候选Pins列表和Pinner之间的成千上万的相关性分数。
以前，我们使用无状态排名系统，通过网络提取所需的数据。
但是随着我们的发展，网络带宽消耗量急剧增加，延迟成为Pinterest系统的核心难点。
为了解决这些问题，我们构建了一个有状态的排名系统，用于将计算与数据共存，
大大降低了网络带宽消耗和服务延迟。

**2. Online event tracking system**

So Pinners don’t see duplicate Pins,
we take into consideration each Pin someone sees and how many times they see it (in case we want to do soft deduplication).
 To maintain impression events in real-time and support online queries for months of data,
 it’d be inefficient to use a traditional standalone database with a Read-Modify-Write model.
 Instead, we co-locate computation with data so the Read-Modify-Write kind of application logic happens as the data node end merges.

**3. Analytics system**

Our analytics system has a broad range of use cases,
such as ads reporting and A/B test result reporting,
and supports time series counters and time series application-specific data structures like HyperLogLog.
Each data point stored in the system has multiple client optionally specified tags used for arbitrary aggregations and breakdowns.
To answer a single client request, an analytics system usually scans hundreds of MB of data,
and the eventual response returned to client is often very small.
This makes it challenging (if not impossible) to build a large-scale,
efficient analytics system without co-locating computation with data.


### Adopting RocksDB

在将 RocksDB 引入我们的技术栈之前, 我们使用了 MySQL, HBase 和 Redis 作为存储系统。
对于新开发的应用程序,我们决定不再使用这些存储系统。
有下列原因:

1. 对于 MySQL, 它很难实现计算和数据共同部署
2. 对于 HBase, 基于它的并且框架开发面会是的逻辑变得复杂,并且会存在部分操作延迟过高
3. 对于 Redis, 在大规模的系统中,其复制功能的可高性不是最高的


RocksDB 是一个可嵌入式的高性能的 KV 存储引擎。
如前所述，RocksDB具有适应性，支持高性能的基础和高级数据库操作。
 虽然我们发现我们的大部分生产需求都得到了满足，
 但我们为RocksDB提供了基于状态的服务，构建了一个RocksDB复制器，集群管理库和工具。

## Rocksplicator

### Design decisions

Rocksplicator使用现代C ++中实现，我们设计的时候进行了以下技术决策。


### Async Master-Slave replication only


除了主从复制之外，数据复制的另一种方法是采用一致的算法。
基于一致性的算法的解决方案实现更好的写入可靠性和更强的数据一致性保证，
但通常具有较低的写入吞吐量。
使用异步主从复制,我们程序的一致性模型就非常好。
我们意识到在有限的时间和资源下实现100%正确的一致性算法是有挑战的，
因此我们的RocksDB复制器仅支持异步主从复制。


### Replicating multiple RocksDB instances in one process

典型的状态服务进程会用到多个分片，这样使得更容易扩展集群容量或重新分配不均衡的工作负载。
 RocksDB允许将多个RocksDB实例嵌入到一个进程中，并且存储在其中的数据在实例之间是隔离的。
  我们可以方便地使用一个物理RocksDB实例来建立多个逻辑DB分片，
  因此库应该可以并行复制多个RocksDB实例。



### Master/slave role at RocksDB instance level

我们将主/从角色分配给RocksDB实例,而不是服务进程。
 这允许我们在主机的每个主机上混合主从分片，从而充分利用整个集群的硬件资源。

### Work reactively

Rocksplicator库需要健壮稳定，所以我们简化了其责任限制其工作范围。
 它提供了两个API，一个用于添加一个DB进行复制，另一个用于从库中删除数据库以停止复制。
 该库仅进行数据复制，不负责其他工作，例如确定每个分片的角色,以及复制时的拓扑结构。
 这些任务由集群管理库和其他工具单独处理，稍后将介绍。

### Optimize for low replication latency

我们将主从之前数据同步的延迟降到最低。这样就缩短了程序崩溃造成数据丢失的时间窗口长度。



## Implementation

当 RocksDB 有更新时, 复制实例需要从网络中同步这些信息。
我们使用了异步fbthrift的服务和客户端来实现这些通信。

通常, 需要持久化在 master 节点上的更新操作日志,并且将这些日志同步到所有的复制节点上。
日志中的每个更新操作需要使用一个递增的唯一 id 标识, 这样 主从 节点就直到下一步需要请求或者
更新那些数据。这是个非常重要的工作, 特别是当 master 迁移的时候。
在验证了RocksDB WAL序列号的一组属性后，
我们决定使用RocksDB WAL作为永久日志并且使用RocksDB序列号作为全局复制序列号。
我们确定了如下内容：

- RocksDB WAL sequence number always starts with 0 for a newly created DB
- It increases by one for every update applied
- It’s preserved during DB close/open or DB backup/restore

RocksDB提供了两个方便的API GetLatestSequenceNumber（）和GetUpdatesSince（）。
这些API允许我们使用其WAL序列号进行数据复制。
 通过重用RocksDB WAL，我们最大限度地减少了额外的持久层可能引入的性能损失。
 基本上，写入吞吐量受RocksDB写入吞吐量的限制。


### Hybrid pull- and push-based replication

概括来说，有两种数据复制模型，基于拉式和推模型。
 对于基于拉的模型，每个从站都会定期检查其最新的本地序列号，并请求其主机进行新的更新。
对于基于推送的型号，主机会跟踪所有从站的最新序列号，并在主动更新时主动向其发送数据。
基于拉的模型更简单实现，而基于推送的模式具有较低的复制延迟。
我们采用混合方式实现简单性和较低延迟。
在我们的实现中，主节点不跟踪从站的最新序列号。
相反，它为来至从节点的复制请求提供服务。
如果在从站请求中指定的序列号之后没有新的更新，则主节点在发送一个空的响应给从站之前,
可以先阻塞一段时间,时间长度可以配置。
一旦主节点收到新的写入时，它会立即处理当前阻塞的请求。
请注意，从节点的网络超时时间必须大于主节点等待超时时间长度。
这两个超时值都在复制器库中定义，因此它很容易调整。


## Data replicating workflow

图1,2和3说明了不同场景下的复制器内部工作流程。
Rocksplicator 运行内部fbthrift服务器来处理来自远程slave的复制请求。
它还有一个小工作线程池来执行CPU密集工作，并阻止对RocksDB的调用。
这些阻塞调用包括从本地从站获取最新的序列号，对其进行新的更新，并从本地主服务器获取特定序列号后的更新。

![](/assets/img/blog/rocksplicator/1.png)

图1显示了将数据复制到slave的工作流程。
 对于每个本地slave 节点，
 工作线程池重复执行步骤1到4.步骤2和步骤3之间的延迟可能很大（远程master 节点此时可能没有更新数据），
 因此使用异步fbthrift客户端。

![](/assets/img/blog/rocksplicator/2.png)

图2说明了 master 节点有数据更新时的整个处理流程。

![](/assets/img/blog/rocksplicator/3.png)


图3显示了处理当前不可用数据的复制请求的工作流程。
 当工作线程知道所请求的数据在步骤4中不可用时，
 它将注册当相应的数据库的新的更新可用时的通知。
  一旦对DB1应用新的写入，工作线程（可以是工作线程池中的任何线程）
  将立即激活以从DB1获取新的更新，并将其传递到fbthrift服务器以发送回slave 节点。


## Common system architecture

我们在几个生产系统中使用Rocksplicator。
他们共享相同的架构，如图4所示。灰色框是多个嵌入式RocksDB实例,
RocksDB复制器，管理逻辑和应用程序逻辑的服务进程。
所有绿色组件都是 Pinterest 内部建立的库或工具。
黑色组件是第三方开源库或系统。
红色框是特定于应用程序的逻辑。
如果我们需要构建一个新的基于RocksDB的有状态服务，我们只要实现红色应用程序部分，不需要处理构建分布式状态服务（如数据复制和集群管理）的最复杂的工作（如扩展/收缩集群，移动碎片，故障切换主控等）。

管理库管理所有本地RocksDB实例的生命周期。
当进程首次启动时，将从ZooKeeper加载集群配置，
存储集群分片映射。
它还从Admin Tool接收管理命令以打开/关闭/备份/恢复本地RocksDB实例，
或者更改本地RocksDB实例的角色或 upstream network addresses for local RocksDB instances。
每当应用程序逻辑需要访问RocksDB时，它将首先从管理库获取一个DB 的 Handler，
然后使用该处理程序来读/写相应的数据库。

![](/assets/img/blog/rocksplicator/architechure.png)


## Open-sourcing Rocksplicator

We’re open-sourcing Rocksplicator on GitHub and including all the green components in Figure 4. It has a set of tools and libraries, including:

- RocksDB replicator (a library for RocksDB real-time data replication)
- Cluster management library and tools for RocksDB replicator-based stateful services
- An example counter service that demonstrates how to use RocksDB replicator and cluster management library
- A set of other libraries such as async fbthrift client pool, fbthrift request router, concurrent ratelimiter, a stat library for maintaining and reporting server stats and more.

We hope you find Rocksplicator as useful as we do. We can’t wait to see new ideas from the community. Together we can make RocksDB data replication better for everyone.


## 其他资源

1. github: https://github.com/pinterest/rocksplicator
2. [presentation at 2016 Annual RocksDB meetup at FB HQ](https://www.facebook.com/TeCNoYoTTa/videos/oa.1126302657468247/10155683728004408)
