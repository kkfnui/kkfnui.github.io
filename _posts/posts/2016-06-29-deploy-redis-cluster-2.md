---
title: Redis 集群部署(二)
tags: Redis 部署 NOSQL 集群
category: 工作
---
接[上一篇](http://blog.makerome.com/2016/06/28/deploy-redis-cluster-1.html),继续了解 Redis 集群的部署。

<!--more-->


## 创建和使用 Redis 集群

创建集群，首先要拥有一些空的处于集群模式的 Redis 实例。最简化的配置：


```
port 7000
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
appendonly yes
```

如上配置，只需要设置好 `cluster-enabled yes` 就可以让 Redis 运行在集群模式了。每个格式拥有一个集群的配置文件，默认是 `nodes.conf`。这个文件不应该由人操作。在需要的时候，它是由集群更新的。

集群最少应该有三个主节点。第一次使用，建议包含6个实例——三个主节点、三个副节点。

下面创建一个先的文件夹，并且创建更多的子目录，使用端口号命名。命令如下：

```
mkdir cluster-test
cd cluster-test
mkdir 7000 7001 7002 7003 7004 7005
```

每一个目录下面都创建一个 `redis.conf` 文件。 使用上面的例子作为模板，同时确保端口号和目录名称一样。

然后将可执行文件拷贝到 `cluster-test` 目录下面。然后打开6个终端的tab页。之下如下命令：

```
cd 7000
../redis-server ./redis.conf
```

执行后会打印如下的日志。因为没有 `nodes.conf`，所以每个节点都会自己分配一个新的 ID。

```
[82462] 26 Nov 11:56:55.329 * No cluster configuration found, I'm 97a3a64667477371c4479320d683e4c8db5858b1
```

这个ID将会被一直使用，以确保实例在集群中是唯一的。每个节点都会记录其他节点的 ID，而不是通过 ip 和端口。所以节点的ip和端口是可变的，但是ID是不能改变的。

## 创建集群

现在我们已经有了一些实例，我们需要修改节点的配置已创建集群。

使用命令行工具`redis-trib`可以帮助我们轻松的完成这个工作。它是一个 Ruby 程序：

- 创建新的集群
- 检查和重新计算现有集群的hash

```
gem install redis
```
service redis_30000 restart
service redis_30001 restart

创建集群：

```
./redis-trib.rb create --replicas 1 127.0.0.1:7000 127.0.0.1:7001 \
127.0.0.1:7002 127.0.0.1:7003 127.0.0.1:7004 127.0.0.1:7005
```

这里我们需要创建新的集群，所以使用了 `create` 命令。参数 `replicas 1` 每个master都需要一个slave节点。其他的参数表明新集群中对应项实节点。

`Redis-trib`将会提示配置信息是否正确。输入 **yes** 接受。集群就开始创建了，相互之间开始通信。最后，如果一起顺利会显示如下结果:

```
[OK] All 16384 slots covered
```

### 使用create-cluster脚本创建集群

如果不想一个个的配置集群节点，这里有一个更简单的方法。

进入 `utils/create-cluster`目录，会发现有个脚本`create-cluster`。创建一个6个节点、3主3从的集群，仅需要执行如下命令：

```
create-cluster start
create-cluster create
```

第二步需要确认集群的结构。然后你就可以操作集群了。默认集群的端口是从30001开始的。

如果需要停止集群，可以执行 `create-cluster stop`.

如果需要了解更多关于 create-cluster 的信息，阅读 README 文档。

> 原文：	http://redis.io/topics/cluster-tutorial




**环境安装**

> yum install ruby
> yum install ruby-rdoc
> 下载gem代码
> ruby setup.rb #安装gem
> 设置镜像 https://ruby.taobao.org/



