---
title: Redis 集群部署(一)
tags: Redis 部署 NOSQL 集群 一致性哈希
category: 工作
---



Redis 3.0 之后提供集群部署的方式。

<!--more-->

## 集群TCP端口

每个集群的节点都需要可以打开两个TCP端口。

- 服务的端口，一般 6379
- 集群节点间数据交互端口，一般是服务端口 +10000

大的端口是集群通信的通路，二进制的通信协议。一般作用：

1. 失败检查
2. 配置更新
3. 故障转移

客户端不能连接该端口。但是都需要确保防火墙没有关闭这两个端口。

为了集群能够正常工作，每一个节点需要如下条件：

1. 普通端口对所有客户端节点开放
2. 大的端口，对所有其他节点开放

节点之间的通信使用的二进制协议，用来交换数据。二进制协议交换数据的时候占用更小和空间，和更快的执行速度。

## Redis集群数据分片

集群不是使用的一致性hash算法，而是使用另外一种分片机制——hash槽。

总过使用 16384 hash 槽。每个key经过 CRC16 计算后， mod 16384，得到对应的 hash 槽。

集群中的每一个节点都负责部分的 hash 槽，比如3个节点的集群：

- 节点A的hash槽： 0~5500
- 节点B的hash槽： 5501~11000
- 节点C的hash槽： 11001~16383

这样可以方便的添加和移除集群中的节点。比如现在需要增加新的节点D，就需要将A、B、C的的部分hash槽移动到节点D。同理，删除节点时仅需要将hash槽移动到剩余的节点中即可。

因为移动hash槽到其他节点，不会阻塞其他操作。所以：

- 增加节点
- 删除节点
- 调整节点占有hash槽的占比

不会导致服务不能使用。

当多个key属于同一个hash槽，Redis集群支持在同一个命令中操作多个key（可以是事物、lua脚本）。使用者可以通过`hash tags`强制将多个key绑定在相同的一个`hash slot`上。

`Hash tags`会在 Redis Cluster说明中详细介绍，基本依据是key中只有在 `{}`部分的子串才会被用来计算hash值。比如`this{foo}key` 和 `another{foo}key`可以保证在同一个hash槽中，这样就可以被一起使用了。


## Redis集群主从模式

当集群中部分节点失败或者不能与其他的节点通信，为了保证集群的可用性，Redis集群使用 master-salve模式，每个hash slot都可以有 1~N的副本数据（N-1个额外的slave 节点）。

在实例的集群 A 、 B 、C中，如果B节点挂了之后，集群就不能正常工作，因为 5501~11000范围内的 hash slot不存在了。

如果我们增加 slave节点，那么主节点挂了之后， slave节点就可以继续提供服务

但是如果 master和slave同时坏了，那么集群还是不能正常服务

## Redis持久化一致性保证

Redis集群不能保证强一致性。也就是说，在某些情况下集群会丢失部分已经保存在集群中的数据。

第一个原因，异步复制。一般情况，保存数据时会发生如下过程：

- 将数据写到 主B上
- 主B 返回 OK
- 主B 将数据 分发到 slaves B1 B2 B3

如上，主B在返回成功的时候，并没有确保数据已经同步到 B1 B2 B3上。加入数据写到B主之后，B主崩溃了，并且没有将刚才的数据同步到slaves上。那么其中的一个从节点就会被选举成主节点，丢失了刚才写的数据。

这个和大多数据库将数据定时刷到磁盘的情况一样。相同的，为了保证一致性，可以强制数据库将在返回客户端之前将数据写入到磁盘。但是这对性能的影响会很大。所以主从同步也存在这个问题。

在性能和一致性上都会需要做一定的权衡。

如果确实需要，Redis集群支持同步的写操作，通过`WAIT`命令实现。这个可以降低丢失数据的概率。因为Redis集群没有实现强一致性，即使是使用了同步复制，也会有概率丢失数据——更复杂的情形，从节点不能收到master的数据，并且后面被推举成主节点。

----

另外有一个值得注意的情况，也会丢失数据。集群处于不同的网络分区中。其中一个master B 和 Client 在一个网络分区中，其他节点在另外一个网络分区中。客户端向master B中写入一条记录。这个时候不同网络分区存在联通性问题。如果是短暂的，则不会有问题；如果是较长时间的，slave B 会被推选成 master B，从而导致数据丢失。

网络不畅通的时间配置——node timeout。

如果一个master节点，在经过 node timeout时间后，还是不能连接上其他的master接口，那么它会变成一个错误状态。

## Redis集群配置参数

我们将要部署一个实例集群。在这之前先熟悉下`redis.conf`中的相关配置参数。

- **cluster-enbaled <yes/no>**
- **cluster-config-file \<filename\>:**

  尽管有这个配置，但是这个文件不是使用者编辑的。当配置有修改后，文件由集群节点自动保存。
  这样当节点起来的时候就可以重新读取配置。
  文件保存了：其他节点，他们的状态，持久化变量等等。

- **cluster-node-timeout \<milliseconds\>:**

  最大不可用的超时时间。
  如果master节点不可以用超过指定时间，那么对应 slaves 就会认为 master 挂了。
  另外，如果一个节点不能连接到大部分的master节点，那么就会停止接受查询

- **cluster-slave-validity-factor \<factor\>:**

  如果设置成0，slave总是会尝试故障转移，
  不管主从节点之前的连接已经断开了多长时间。
  如果是个正数，那么最大的超时时间应该是 `node timeout * factor`。
  如果节点是 slave，在超时之后它将不再接受故障转移。
  如果factor不设置成0，那么集群都有可能不可能，知道主节点回复服务并加入集群。

- **cluster-migration-barrier \<count\>**

  master节点最少连接的slave数量。？？一个master可以拥有的最小slave数量。
该项的作用是，当一个master没有任何slave的时候，某些有富余slave的master节点，
可以自动的分一个slave给它。

- **cluster-require-full-coverage <yes/no>**

 如果设置成 `yes`,默认值。如果部分key空间未被任何节点拥有，那么写操作就要停止。





